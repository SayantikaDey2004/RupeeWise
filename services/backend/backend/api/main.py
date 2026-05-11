from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any, AsyncGenerator

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from backend.config import get_settings
from backend.kafka.rpc import KafkaRpc, RpcTopics
from backend.logic.supabase_rest import SupabaseRest

load_dotenv()

settings = get_settings()

app = FastAPI(title="RupeeWise Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"ok": True}


class _State:
    producer: AIOKafkaProducer | None = None
    budget_rpc: KafkaRpc | None = None
    ocr_rpc: KafkaRpc | None = None


state = _State()


@app.on_event("startup")
async def _startup() -> None:
    try:
        producer = AIOKafkaProducer(
            bootstrap_servers=settings.kafka_bootstrap_servers,
            client_id=settings.kafka_client_id,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            key_serializer=lambda v: v.encode("utf-8") if isinstance(v, str) else v,
        )
        await producer.start()
        state.producer = producer

        state.budget_rpc = KafkaRpc(
            bootstrap_servers=settings.kafka_bootstrap_servers,
            client_id=settings.kafka_client_id,
            topics=RpcTopics(settings.topic_budget_requests, settings.topic_budget_responses),
            group_id="backend-api-budget-rpc",
        )
        await state.budget_rpc.start()

        state.ocr_rpc = KafkaRpc(
            bootstrap_servers=settings.kafka_bootstrap_servers,
            client_id=settings.kafka_client_id,
            topics=RpcTopics(settings.topic_ocr_requests, settings.topic_ocr_responses),
            group_id="backend-api-ocr-rpc",
        )
        await state.ocr_rpc.start()
        print("✓ Kafka connected successfully")
    except Exception as e:
        print(f"⚠ Kafka unavailable ({str(e)[:50]}...) - Running in fallback mode")
        print("✓ Chat/Budget endpoints with Gemini will still work")


@app.on_event("shutdown")
async def _shutdown() -> None:
    if state.producer:
        await state.producer.stop()
    if state.budget_rpc:
        await state.budget_rpc.stop()
    if state.ocr_rpc:
        await state.ocr_rpc.stop()
    if state.producer:
        await state.producer.stop()


def _require_token(req: Request) -> str:
    auth = req.headers.get("authorization") or req.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization Bearer token")
    return auth.split(" ", 1)[1].strip()


def _optional_token(req: Request) -> str | None:
    auth = req.headers.get("authorization") or req.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        return None
    return auth.split(" ", 1)[1].strip()


@app.post("/api/transactions/create")
async def create_transaction(req: Request) -> dict[str, Any]:
    if not state.producer:
        raise HTTPException(status_code=503, detail="Backend not ready")

    token = _require_token(req)
    body = await req.json()
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    sb = SupabaseRest(settings.supabase_url, settings.supabase_anon_key)

    try:
        inserted = await sb.insert(
            access_token=token,
            table="transactions",
            rows=body,
            returning="representation",
        )
        row = inserted[0] if inserted else None
        if not row:
            raise HTTPException(status_code=500, detail="Failed to create transaction")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Publish to Kafka so the Pathway processor can update alerts.
    await state.producer.send_and_wait(settings.topic_transactions, row)

    return row


@app.post("/api/budget/suggest")
async def budget_suggest(req: Request) -> dict[str, Any]:
    if not state.budget_rpc:
        raise HTTPException(status_code=503, detail="Backend not ready")

    token = _require_token(req)
    body = await req.json()

    payload = {
        **body,
        "supabase_access_token": token,
    }

    result = await state.budget_rpc.call(payload, timeout_s=90)
    if not result.get("success", False):
        raise HTTPException(status_code=500, detail=result.get("error") or "budget-suggest failed")
    return result


@app.post("/api/ocr/process")
async def ocr_process(req: Request) -> dict[str, Any]:
    if not state.ocr_rpc:
        raise HTTPException(status_code=503, detail="Backend not ready")

    token = _require_token(req)
    body = await req.json()

    payload = {
        **body,
        "supabase_access_token": token,
    }

    result = await state.ocr_rpc.call(payload, timeout_s=180)
    if not result.get("success", False):
        raise HTTPException(status_code=500, detail=result.get("error") or "ocr-process failed")
    return result


@app.post("/api/chat/stream")
async def chat_stream(req: Request) -> EventSourceResponse:
    if not state.producer:
        raise HTTPException(status_code=503, detail="Backend not ready")

    token = _optional_token(req)
    body = await req.json()
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    correlation_id = str(uuid.uuid4())

    payload = {
        **body,
        "correlation_id": correlation_id,
    }

    if token:
        payload["supabase_access_token"] = token

    await state.producer.send_and_wait(settings.topic_chat_requests, payload, key=correlation_id)

    async def event_gen() -> AsyncGenerator[dict[str, Any], None]:
        consumer = AIOKafkaConsumer(
            settings.topic_chat_responses,
            bootstrap_servers=settings.kafka_bootstrap_servers,
            client_id=settings.kafka_client_id,
            group_id=f"backend-api-chat-sse-{correlation_id}",
            enable_auto_commit=True,
            auto_offset_reset="latest",
            value_deserializer=lambda b: json.loads(b.decode("utf-8")),
        )
        await consumer.start()

        try:
            async for msg in consumer:
                value = msg.value
                if not isinstance(value, dict):
                    continue
                if value.get("correlation_id") != correlation_id:
                    continue

                if value.get("event") == "chunk":
                    yield {"event": "message", "data": json.dumps({"text": value.get("text", "")})}

                if value.get("event") == "done":
                    yield {"event": "message", "data": json.dumps({"done": True})}
                    break

                if value.get("event") == "error":
                    yield {"event": "message", "data": json.dumps({"error": value.get("error", "unknown")})}
                    break

                await asyncio.sleep(0)
        finally:
            await consumer.stop()

    return EventSourceResponse(event_gen())


@app.get("/api/transactions/stream")
async def transactions_stream(user_id: str) -> EventSourceResponse:
    async def event_gen() -> AsyncGenerator[dict[str, Any], None]:
        consumer = AIOKafkaConsumer(
            settings.topic_transactions,
            bootstrap_servers=settings.kafka_bootstrap_servers,
            client_id=settings.kafka_client_id,
            group_id=f"backend-api-transactions-sse-{user_id}",
            enable_auto_commit=True,
            auto_offset_reset="latest",
            value_deserializer=lambda b: json.loads(b.decode("utf-8")),
        )
        await consumer.start()
        try:
            async for msg in consumer:
                value = msg.value
                if not isinstance(value, dict):
                    continue
                if value.get("user_id") != user_id:
                    continue
                yield {"event": "message", "data": json.dumps({"data": value})}
                await asyncio.sleep(0)
        finally:
            await consumer.stop()

    return EventSourceResponse(event_gen())
