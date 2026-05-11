from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx


@dataclass(frozen=True)
class SupabaseRest:
    supabase_url: str
    anon_key: str

    # Optional: server-side key that bypasses RLS (must never be exposed to the frontend).
    service_role_key: str | None = None

    def _headers(self, access_token: str | None) -> dict[str, str]:
        if access_token and access_token.strip():
            apikey = self.anon_key
            bearer = access_token
        elif self.service_role_key and self.service_role_key.strip():
            apikey = self.service_role_key
            bearer = self.service_role_key
        else:
            raise RuntimeError("Supabase access_token is required (or configure SUPABASE_SERVICE_ROLE_KEY)")

        return {
            "apikey": apikey,
            "Authorization": f"Bearer {bearer}",
            "Content-Type": "application/json",
        }

    async def select(
        self,
        *,
        access_token: str | None,
        table: str,
        select: str = "*",
        params: dict[str, str] | None = None,
    ) -> list[dict[str, Any]]:
        url = f"{self.supabase_url}/rest/v1/{table}"
        qp = {"select": select}
        if params:
            qp.update(params)
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url, headers=self._headers(access_token), params=qp)
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, list):
                return data
            return [data]

    async def insert(
        self,
        *,
        access_token: str | None,
        table: str,
        rows: list[dict[str, Any]] | dict[str, Any],
        returning: str = "representation",
    ) -> list[dict[str, Any]]:
        url = f"{self.supabase_url}/rest/v1/{table}"
        headers = self._headers(access_token)
        headers["Prefer"] = f"return={returning}"
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(url, headers=headers, json=rows)
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, list):
                return data
            return [data]

    async def update(
        self,
        *,
        access_token: str | None,
        table: str,
        values: dict[str, Any],
        params: dict[str, str],
        returning: str = "representation",
    ) -> list[dict[str, Any]]:
        url = f"{self.supabase_url}/rest/v1/{table}"
        headers = self._headers(access_token)
        headers["Prefer"] = f"return={returning}"
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.patch(url, headers=headers, params=params, json=values)
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, list):
                return data
            return [data]
