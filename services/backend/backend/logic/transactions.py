from __future__ import annotations

import datetime as dt
from typing import Any

from backend.config import Settings
from backend.logic.supabase_rest import SupabaseRest


def _parse_date(value: Any) -> dt.date | None:
    if not value:
        return None
    if isinstance(value, dt.date):
        return value
    try:
        return dt.date.fromisoformat(str(value))
    except Exception:
        return None


def _period_bounds(period: str, when: dt.date) -> tuple[dt.date, dt.date]:
    if period == "yearly":
        start = dt.date(when.year, 1, 1)
        end = dt.date(when.year, 12, 31)
        return start, end

    # default monthly
    start = dt.date(when.year, when.month, 1)
    if when.month == 12:
        end = dt.date(when.year, 12, 31)
    else:
        end = dt.date(when.year, when.month + 1, 1) - dt.timedelta(days=1)
    return start, end


async def handle_transaction_update(inputs: dict[str, Any], settings: Settings) -> dict[str, Any]:
    """Process a single transaction event and create budget alerts.

    Expected input is a transaction row (as published to Kafka), including:
    - user_id
    - category
    - amount
    - transaction_date

    This uses SUPABASE_SERVICE_ROLE_KEY (if configured) so it can run as a backend
    stream processor without requiring end-user JWTs in Kafka.
    """

    user_id = inputs.get("user_id")
    category = inputs.get("category")
    amount_raw = inputs.get("amount")
    when = _parse_date(inputs.get("transaction_date"))

    if not user_id or not category or when is None:
        return {"ok": False, "error": "transaction event missing user_id/category/transaction_date"}

    try:
        amount = float(amount_raw or 0)
    except Exception:
        amount = 0.0

    if not settings.supabase_service_role_key:
        # Without a service-role key, the processor can't read/write alerts safely
        # without embedding end-user JWTs into Kafka events.
        return {"ok": True, "skipped": "missing_service_role_key"}

    sb = SupabaseRest(
        settings.supabase_url,
        settings.supabase_anon_key,
        service_role_key=settings.supabase_service_role_key,
    )

    # Get active budget
    budgets = await sb.select(
        access_token=None,
        table="budgets",
        params={
            "user_id": f"eq.{user_id}",
            "is_active": "eq.true",
            "order": "created_at.desc",
            "limit": "1",
        },
    )
    budget = budgets[0] if budgets else None
    if not budget:
        return {"ok": True, "skipped": "no_active_budget"}

    period = str(budget.get("period") or "monthly")
    start, end = _period_bounds(period, when)

    budgeted_raw = budget.get(str(category))
    try:
        budgeted = float(budgeted_raw or 0)
    except Exception:
        budgeted = 0.0

    if budgeted <= 0:
        return {"ok": True, "skipped": "no_budget_for_category"}

    # Sum spending for this category within period.
    tx_rows = await sb.select(
        access_token=None,
        table="transactions",
        select="amount",
        params={
            "user_id": f"eq.{user_id}",
            "category": f"eq.{category}",
            "and": f"(transaction_date.gte.{start.isoformat()},transaction_date.lte.{end.isoformat()})",
        },
    )

    spent = 0.0
    for row in tx_rows:
        try:
            spent += float(row.get("amount") or 0)
        except Exception:
            pass

    prev_spent = max(0.0, spent - max(0.0, amount))
    percent = (spent / budgeted) * 100.0 if budgeted > 0 else 0.0
    prev_percent = (prev_spent / budgeted) * 100.0 if budgeted > 0 else 0.0

    # Thresholds
    crossed_80 = prev_percent < 80.0 <= percent
    crossed_100 = prev_percent < 100.0 <= percent

    if not (crossed_80 or crossed_100):
        return {"ok": True, "status": "within_budget", "percent": percent}

    # Avoid duplicate alerts within the same period window.
    alert_type = "budget_exceeded" if crossed_100 else "budget_80"

    existing = await sb.select(
        access_token=None,
        table="alerts",
        select="id,created_at",
        params={
            "user_id": f"eq.{user_id}",
            "category": f"eq.{category}",
            "alert_type": f"eq.{alert_type}",
            # created_at is timestamptz; compare to period start midnight UTC-ish.
            "created_at": f"gte.{start.isoformat()}T00:00:00Z",
            "order": "created_at.desc",
            "limit": "1",
        },
    )
    if existing:
        return {"ok": True, "status": "duplicate_suppressed", "alert_type": alert_type}

    message = (
        f"You've exceeded your {category} budget (₹{spent:.2f} / ₹{budgeted:.2f})."
        if alert_type == "budget_exceeded"
        else f"You've used {percent:.0f}% of your {category} budget (₹{spent:.2f} / ₹{budgeted:.2f})."
    )

    await sb.insert(
        access_token=None,
        table="alerts",
        rows={
            "user_id": user_id,
            "alert_type": alert_type,
            "category": category,
            "message": message,
            "is_read": False,
        },
        returning="minimal",
    )

    return {"ok": True, "status": "alert_created", "alert_type": alert_type, "percent": percent}
