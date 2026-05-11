from __future__ import annotations

import json
import re
from typing import Any

import httpx

from backend.config import Settings
from backend.logic.http_sse import read_appmedo_sse_text
from backend.logic.supabase_rest import SupabaseRest


async def _classify_document_text(*, extracted_text: str, settings: Settings) -> str:
    prompt = (
        "Classify the following text as one of: receipt, bank_statement, other. "
        "If the text looks like a shopping receipt OR a bank/credit-card statement, classify accordingly. "
        "Return ONLY valid JSON in this exact format: {\"type\": \"receipt\"}.\n\n"
        "TEXT:\n"
        + extracted_text[:12000]
    )

    gemini_request = {"contents": [{"role": "user", "parts": [{"text": prompt}]}]}
    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            settings.gemini_url,
            headers={
                "Content-Type": "application/json",
                "X-Gateway-Authorization": f"Bearer {settings.integrations_api_key}",
            },
            json=gemini_request,
        )
        if resp.status_code >= 400:
            return "other"
        full = await read_appmedo_sse_text(resp)

    try:
        m = re.search(r"\{[\s\S]*\}", full)
        if not m:
            return "other"
        obj = json.loads(m.group(0))
        doc_type = str(obj.get("type") or "other").strip().lower()
        if doc_type in ("receipt", "bank_statement"):
            return doc_type
        return "other"
    except Exception:
        return "other"


async def handle_ocr_process(inputs: dict[str, Any], settings: Settings, publish_transaction) -> dict[str, Any]:
    document_id = inputs.get("documentId") or inputs.get("document_id")
    file_url = inputs.get("fileUrl") or inputs.get("file_url")
    user_id = inputs.get("userId") or inputs.get("user_id")
    token = inputs.get("supabase_access_token")

    if not document_id or not file_url or not user_id or not token:
        return {"success": False, "error": "documentId, fileUrl, userId, and token are required"}

    sb = SupabaseRest(settings.supabase_url, settings.supabase_anon_key)

    # OCR gateway
    form = {
        "url": file_url,
        "language": "eng",
        "isTable": "true",
    }

    async with httpx.AsyncClient(timeout=120) as client:
        ocr_resp = await client.post(
            settings.ocr_url,
            headers={"X-Gateway-Authorization": f"Bearer {settings.integrations_api_key}"},
            data=form,
        )
        if ocr_resp.status_code >= 400:
            return {"success": False, "error": f"OCR API error: {ocr_resp.status_code} {ocr_resp.text}"}
        ocr_result = ocr_resp.json()

    extracted_text = (
        (ocr_result.get("ParsedResults") or [{}])[0].get("ParsedText")
        if isinstance(ocr_result, dict)
        else ""
    )
    extracted_text = extracted_text or ""

    if not extracted_text.strip():
        return {"success": False, "error": "No text extracted from document"}

    await sb.update(
        access_token=token,
        table="documents",
        values={"ocr_text": extracted_text, "processed": True},
        params={"id": f"eq.{document_id}"},
        returning="minimal",
    )

    doc_type = await _classify_document_text(extracted_text=extracted_text, settings=settings)
    if doc_type not in ("receipt", "bank_statement"):
        # Tell the user we can't parse this kind of document.
        await sb.insert(
            access_token=token,
            table="alerts",
            rows={
                "user_id": user_id,
                "alert_type": "info",
                "category": None,
                "message": "This app can only extract transactions from receipts or bank statements. For other documents, it can only help with budgeting.",
                "is_read": False,
            },
            returning="minimal",
        )
        return {
            "success": True,
            "transactionCount": 0,
            "skipped": "unsupported_document",
        }

    parse_prompt = (
        "You are an expert financial document parser. Extract ALL transaction data from this receipt/bank statement text with high accuracy.\n\n"
        "Return ONLY a valid JSON array with this EXACT format:\n"
        "[\n  {\n    \"amount\": 123.45,\n    \"date\": \"2026-02-08\",\n    \"merchant\": \"Store Name\",\n    \"category\": \"groceries\",\n    \"description\": \"Brief description\"\n  }\n]\n\n"
        "If no transactions found, return an empty array: []\n\n"
        "TEXT TO PARSE:\n"
        + extracted_text
    )

    gemini_request = {"contents": [{"role": "user", "parts": [{"text": parse_prompt}]}]}

    async with httpx.AsyncClient(timeout=None) as client:
        gemini_resp = await client.post(
            settings.gemini_url,
            headers={
                "Content-Type": "application/json",
                "X-Gateway-Authorization": f"Bearer {settings.integrations_api_key}",
            },
            json=gemini_request,
        )
        if gemini_resp.status_code >= 400:
            return {"success": False, "error": f"Gemini API error: {gemini_resp.status_code} {gemini_resp.text}"}
        full = await read_appmedo_sse_text(gemini_resp)

    transactions: list[dict[str, Any]] = []
    try:
        m = re.search(r"\[[\s\S]*\]", full)
        if m:
            transactions = json.loads(m.group(0))
    except Exception:
        transactions = []

    inserted_count = 0
    if transactions:
        rows = []
        for t in transactions:
            rows.append(
                {
                    "user_id": user_id,
                    "document_id": document_id,
                    "amount": t.get("amount") or 0,
                    "transaction_date": t.get("date"),
                    "merchant": t.get("merchant") or "Unknown",
                    "category": t.get("category") or "other",
                    "description": t.get("description") or "",
                }
            )

        inserted = await sb.insert(access_token=token, table="transactions", rows=rows, returning="representation")
        inserted_count = len(inserted)
        for row in inserted:
            await publish_transaction(row)

    return {
        "success": True,
        "transactionCount": inserted_count,
    }
