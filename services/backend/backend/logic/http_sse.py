from __future__ import annotations

import json
from typing import Any

import httpx


async def read_appmedo_sse_text(response: httpx.Response) -> str:
    """Reads an Appmedo/Gemini style SSE response and concatenates candidate text."""
    full_text = ""
    async for line in response.aiter_lines():
        if not line:
            continue
        if not line.startswith("data: "):
            continue
        data = line[6:].strip()
        if not data:
            continue
        try:
            parsed = json.loads(data)
        except json.JSONDecodeError:
            continue
        text = (
            parsed.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text")
        )
        if text:
            full_text += str(text)
    return full_text


async def iter_google_sse_chunks(response: httpx.Response):
    """Yields candidate text chunks from a Gemini SSE response."""
    async for line in response.aiter_lines():
        if not line:
            continue
        if not line.startswith("data: "):
            continue
        data = line[6:].strip()
        if not data:
            continue
        try:
            parsed = json.loads(data)
        except json.JSONDecodeError:
            continue
        text = (
            parsed.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text")
        )
        if text:
            yield str(text)


# Backward compatibility alias
iter_appmedo_sse_chunks = iter_google_sse_chunks
