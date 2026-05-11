"""
Analytics handling module for Pathway framework.
Handles real-time analytics updates and data synchronization.
"""

from __future__ import annotations

import datetime as dt
import logging
from typing import Any

from backend.config import Settings
from backend.logic.supabase_rest import SupabaseRest

logger = logging.getLogger("analytics")


async def handle_analytics_update(inputs: dict[str, Any], settings: Settings) -> dict[str, Any]:
    """
    Handle analytics updates for users.
    
    Supported event types:
    - transaction_added: New transaction recorded
    - budget_updated: Budget was modified
    - category_spending: Category spending changed
    - savings_goal: Savings goal progress update
    - monthly_summary: Monthly spending summary
    """
    user_id = inputs.get("user_id")
    event_type = inputs.get("event_type")
    data = inputs.get("data", {})

    if not user_id or not event_type:
        return {"success": False, "error": "user_id and event_type are required"}

    # Use service role key for backend operations
    if not settings.supabase_service_role_key:
        return {"success": False, "error": "SUPABASE_SERVICE_ROLE_KEY not configured"}

    sb = SupabaseRest(
        settings.supabase_url,
        settings.supabase_anon_key,
        service_role_key=settings.supabase_service_role_key,
    )

    try:
        if event_type == "transaction_added":
            result = await _handle_transaction_analytics(sb, user_id, data)
        elif event_type == "budget_updated":
            result = await _handle_budget_analytics(sb, user_id, data)
        elif event_type == "category_spending":
            result = await _handle_category_spending(sb, user_id, data)
        elif event_type == "savings_goal":
            result = await _handle_savings_goal(sb, user_id, data)
        elif event_type == "monthly_summary":
            result = await _handle_monthly_summary(sb, user_id, data)
        else:
            result = {"success": True, "message": f"Unknown event type: {event_type}"}

        return result

    except Exception as e:
        logger.error(f"Error updating analytics: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


async def _handle_transaction_analytics(sb: SupabaseRest, user_id: str, data: dict[str, Any]) -> dict[str, Any]:
    """Update analytics when a transaction is added."""
    category = data.get("category")
    amount = float(data.get("amount", 0))
    date = data.get("transaction_date")

    if not category or not date:
        return {"success": False, "error": "category and transaction_date required"}

    # Get current month
    current_month = dt.date.today().isoformat()[:7]

    # Update category spending
    await _update_category_spending(sb, user_id, category, amount, current_month)

    # Update total spending
    await _update_total_spending(sb, user_id, amount, current_month)

    return {
        "success": True,
        "event": "transaction_added",
        "category": category,
        "amount": amount,
    }


async def _handle_budget_analytics(sb: SupabaseRest, user_id: str, data: dict[str, Any]) -> dict[str, Any]:
    """Update analytics when a budget is updated."""
    budget_id = data.get("budget_id")
    categories = data.get("categories", {})

    if not budget_id:
        return {"success": False, "error": "budget_id required"}

    # Log budget change
    logger.info(f"Budget {budget_id} updated for user {user_id}")

    return {
        "success": True,
        "event": "budget_updated",
        "budget_id": budget_id,
    }


async def _handle_category_spending(sb: SupabaseRest, user_id: str, data: dict[str, Any]) -> dict[str, Any]:
    """Handle category-specific spending analytics."""
    category = data.get("category")
    amount = data.get("amount")
    period = data.get("period", dt.date.today().isoformat()[:7])

    if not category or amount is None:
        return {"success": False, "error": "category and amount required"}

    await _update_category_spending(sb, user_id, category, float(amount), period)

    return {
        "success": True,
        "event": "category_spending",
        "category": category,
    }


async def _handle_savings_goal(sb: SupabaseRest, user_id: str, data: dict[str, Any]) -> dict[str, Any]:
    """Handle savings goal progress updates."""
    goal_id = data.get("goal_id")
    current_amount = data.get("current_amount")
    target_amount = data.get("target_amount")

    if not goal_id or current_amount is None or target_amount is None:
        return {"success": False, "error": "goal_id, current_amount, and target_amount required"}

    progress = (float(current_amount) / float(target_amount)) * 100 if float(target_amount) > 0 else 0

    # Update or create savings goal progress
    existing = await sb.select(
        access_token=None,
        table="savings_goals",
        params={
            "id": f"eq.{goal_id}",
            "user_id": f"eq.{user_id}",
        },
    )

    if existing:
        await sb.update(
            access_token=None,
            table="savings_goals",
            params={"id": f"eq.{goal_id}"},
            data={
                "current_amount": current_amount,
                "progress": progress,
                "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            },
        )

    return {
        "success": True,
        "event": "savings_goal",
        "goal_id": goal_id,
        "progress": progress,
    }


async def _handle_monthly_summary(sb: SupabaseRest, user_id: str, data: dict[str, Any]) -> dict[str, Any]:
    """Generate and store monthly spending summary."""
    month = data.get("month", dt.date.today().isoformat()[:7])

    # Get all transactions for the month
    transactions = await sb.select(
        access_token=None,
        table="transactions",
        params={
            "user_id": f"eq.{user_id}",
            "transaction_date": f"gte.{month}-01",
            "transaction_date": f"lte.{month}-31",
        },
    )

    if not transactions:
        return {"success": True, "message": "No transactions for month"}

    # Calculate summary
    total_spent = 0.0
    by_category = {}

    for tx in transactions:
        try:
            amount = float(tx.get("amount", 0))
            total_spent += amount

            cat = tx.get("category", "other")
            by_category[cat] = by_category.get(cat, 0.0) + amount
        except (ValueError, TypeError):
            continue

    # Store monthly summary
    await sb.insert(
        access_token=None,
        table="monthly_summaries",
        rows={
            "user_id": user_id,
            "month": month,
            "total_spent": total_spent,
            "category_breakdown": by_category,
            "transaction_count": len(transactions),
        },
        returning="minimal",
    )

    return {
        "success": True,
        "event": "monthly_summary",
        "month": month,
        "total_spent": total_spent,
        "transaction_count": len(transactions),
    }


async def _update_category_spending(
    sb: SupabaseRest,
    user_id: str,
    category: str,
    amount: float,
    period: str
) -> None:
    """Update category spending for a period."""
    try:
        # Check if record exists
        existing = await sb.select(
            access_token=None,
            table="category_spending",
            params={
                "user_id": f"eq.{user_id}",
                "category": f"eq.{category}",
                "period": f"eq.{period}",
            },
        )

        if existing:
            current = float(existing[0].get("total_spent", 0))
            await sb.update(
                access_token=None,
                table="category_spending",
                params={
                    "user_id": f"eq.{user_id}",
                    "category": f"eq.{category}",
                    "period": f"eq.{period}",
                },
                data={"total_spent": current + amount},
            )
        else:
            await sb.insert(
                access_token=None,
                table="category_spending",
                rows={
                    "user_id": user_id,
                    "category": category,
                    "period": period,
                    "total_spent": amount,
                },
                returning="minimal",
            )
    except Exception as e:
        logger.warning(f"Failed to update category spending: {e}")


async def _update_total_spending(
    sb: SupabaseRest,
    user_id: str,
    amount: float,
    period: str
) -> None:
    """Update total spending for a period."""
    try:
        existing = await sb.select(
            access_token=None,
            table="total_spending",
            params={
                "user_id": f"eq.{user_id}",
                "period": f"eq.{period}",
            },
        )

        if existing:
            current = float(existing[0].get("total_spent", 0))
            await sb.update(
                access_token=None,
                table="total_spending",
                params={
                    "user_id": f"eq.{user_id}",
                    "period": f"eq.{period}",
                },
                data={"total_spent": current + amount},
            )
        else:
            await sb.insert(
                access_token=None,
                table="total_spending",
                rows={
                    "user_id": user_id,
                    "period": period,
                    "total_spent": amount,
                },
                returning="minimal",
            )
    except Exception as e:
        logger.warning(f"Failed to update total spending: {e}")


async def get_user_analytics(
    user_id: str,
    settings: Settings,
    period: str = None
) -> dict[str, Any]:
    """Get analytics data for a user."""
    if not settings.supabase_service_role_key:
        return {"error": "SUPABASE_SERVICE_ROLE_KEY not configured"}

    if period is None:
        period = dt.date.today().isoformat()[:7]

    sb = SupabaseRest(
        settings.supabase_url,
        settings.supabase_anon_key,
        service_role_key=settings.supabase_service_role_key,
    )

    try:
        # Get category spending
        category_spending = await sb.select(
            access_token=None,
            table="category_spending",
            params={
                "user_id": f"eq.{user_id}",
                "period": f"eq.{period}",
            },
        )

        # Get total spending
        total_spending = await sb.select(
            access_token=None,
            table="total_spending",
            params={
                "user_id": f"eq.{user_id}",
                "period": f"eq.{period}",
            },
        )

        return {
            "success": True,
            "period": period,
            "category_spending": category_spending,
            "total_spent": total_spending[0].get("total_spent") if total_spending else 0,
        }
    except Exception as e:
        logger.error(f"Error fetching analytics: {e}")
        return {"error": str(e)}
