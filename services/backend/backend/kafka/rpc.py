from __future__ import annotations

import asyncio
import json
import uuid
from dataclasses import dataclass
from typing import Any

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer


@dataclass(frozen=True)
class RpcTopics:
    request_topic: str
    response_topic: str


class KafkaRpc:
    def __init__(
        self,
        *,
        bootstrap_servers: str,
        client_id: str,
        topics: RpcTopics,
        group_id: str,
    ) -> None:
        self._bootstrap_servers = bootstrap_servers
        self._client_id = client_id
        self._topics = topics
        self._group_id = group_id

        self._producer: AIOKafkaProducer | None = None
        self._consumer: AIOKafkaConsumer | None = None
        self._task: asyncio.Task[None] | None = None
        self._pending: dict[str, asyncio.Future[dict[str, Any]]] = {}

    async def start(self) -> None:
        if self._producer or self._consumer:
            return

        self._producer = AIOKafkaProducer(
            bootstrap_servers=self._bootstrap_servers,
            client_id=self._client_id,
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            key_serializer=lambda v: v.encode("utf-8") if isinstance(v, str) else v,
        )
        await self._producer.start()

        self._consumer = AIOKafkaConsumer(
            self._topics.response_topic,
            bootstrap_servers=self._bootstrap_servers,
            client_id=self._client_id,
            group_id=self._group_id,
            enable_auto_commit=True,
            auto_offset_reset="latest",
            value_deserializer=lambda b: json.loads(b.decode("utf-8")),
            key_deserializer=lambda b: b.decode("utf-8") if b else None,
        )
        await self._consumer.start()

        self._task = asyncio.create_task(self._consume_loop())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

        if self._consumer:
            await self._consumer.stop()
            self._consumer = None

        if self._producer:
            await self._producer.stop()
            self._producer = None

    async def call(self, payload: dict[str, Any], *, timeout_s: float = 60.0) -> dict[str, Any]:
        if not self._producer or not self._consumer:
            raise RuntimeError("KafkaRpc not started")

        correlation_id = str(uuid.uuid4())
        message = {
            **payload,
            "correlation_id": correlation_id,
        }

        fut: asyncio.Future[dict[str, Any]] = asyncio.get_running_loop().create_future()
        self._pending[correlation_id] = fut

        await self._producer.send_and_wait(
            self._topics.request_topic,
            message,
            key=correlation_id,
        )

        try:
            return await asyncio.wait_for(fut, timeout=timeout_s)
        finally:
            self._pending.pop(correlation_id, None)

    async def _consume_loop(self) -> None:
        assert self._consumer is not None
        async for msg in self._consumer:
            value = msg.value
            if not isinstance(value, dict):
                continue
            correlation_id = value.get("correlation_id")
            if not correlation_id:
                continue
            fut = self._pending.get(str(correlation_id))
            if fut and not fut.done():
                fut.set_result(value)
