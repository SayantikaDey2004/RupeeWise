from __future__ import annotations

import json
import re
from typing import Any

import httpx

from backend.config import Settings
from backend.logic.http_sse import read_appmedo_sse_text
from backend.logic.supabase_rest import SupabaseRest


async def handle_budget_suggest(inputs: dict[str, Any], settings: Settings) -> dict[str, Any]:
    user_id = inputs.get("userId") or inputs.get("user_id")
    total_income = inputs.get("totalIncome") or inputs.get("total_income")
    period = inputs.get("period")
    token = inputs.get("supabase_access_token")

    if not user_id or not total_income or not period or not token:
        return {"success": False, "error": "userId, totalIncome, period, and Authorization token are required"}

    sb = SupabaseRest(settings.supabase_url, settings.supabase_anon_key)
    transactions = await sb.select(
        access_token=token,
        table="transactions",
        params={
            "user_id": f"eq.{user_id}",
            "order": "transaction_date.desc",
            "limit": "100",
        },
    )

    spending_by_category: dict[str, list[float]] = {}
    for t in transactions:
        cat = t.get("category") or "other"
        try:
            amt = float(t.get("amount") or 0)
        except Exception:
            amt = 0
        spending_by_category.setdefault(str(cat), []).append(amt)

    avg_spending: dict[str, float] = {}
    for cat, amounts in spending_by_category.items():
        if amounts:
            avg_spending[cat] = sum(amounts) / len(amounts)

    prompt = (
        f"You are a financial advisor. Create a {period} budget plan for a user with total income of ₹{total_income}.\n\n"
        + (
            f"The user's past spending patterns:\n{json.dumps(avg_spending, indent=2)}\n\n"
            if transactions
            else "No past spending data available.\n\n"
        )
        + "Create a balanced budget allocation across these categories:\n"
        + "- rent\n- groceries\n- transport\n- entertainment\n- savings\n- emergency_fund\n- utilities\n- healthcare\n- education\n- dining\n- shopping\n- other\n\n"
        + "Return ONLY a valid JSON object with this exact format:\n"
        + "{\n  \"rent\": 1200.00,\n  \"groceries\": 400.00,\n  \"transport\": 200.00,\n  \"entertainment\": 150.00,\n  \"savings\": 500.00,\n  \"emergency_fund\": 300.00,\n  \"utilities\": 150.00,\n  \"healthcare\": 100.00,\n  \"education\": 100.00,\n  \"dining\": 200.00,\n  \"shopping\": 150.00,\n  \"other\": 100.00\n}\n\n"
        + "Ensure:\n1. Total allocations do not exceed the total income\n2. Prioritize savings (at least 20% of income)\n3. Emergency fund should be at least 10% of income\n4. Consider past spending patterns if available\n5. All values must be positive numbers in Indian Rupees (₹)"
    )

    gemini_request = {"contents": [{"role": "user", "parts": [{"text": prompt}]}]}

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{settings.gemini_url}?key={settings.gemini_api_key}",
            headers={
                "Content-Type": "application/json",
            },
            json=gemini_request,
        )
        if resp.status_code >= 400:
            return {"success": False, "error": f"Gemini API error: {resp.status_code} {resp.text}"}

        full = await read_appmedo_sse_text(resp)

    suggestion = None
    try:
        m = re.search(r"\{[\s\S]*\}", full)
        if m:
            suggestion = json.loads(m.group(0))
    except Exception:
        suggestion = None

    if suggestion is None:
        return {"success": False, "error": "Failed to parse budget suggestion"}

    return {
        "success": True,
        "suggestion": suggestion,
        "totalIncome": total_income,
        "period": period,
    }
