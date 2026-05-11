"""
Notification handling module for Pathway framework.
Handles sending notifications to users via various channels.
"""

from __future__ import annotations

import logging
from typing import Any

from backend.config import Settings
from backend.logic.supabase_rest import SupabaseRest

logger = logging.getLogger("notifications")


async def handle_notification_send(inputs: dict[str, Any], settings: Settings) -> dict[str, Any]:
    """
    Handle sending notifications to users.
    
    Supported notification types:
    - budget_warning: Budget threshold warning (80%)
    - budget_exceeded: Budget exceeded (100%)
    - transaction_alert: Unusual transaction detected
    - document_ready: Document processing complete
    - system_alert: System-level notifications
    
    Supported channels:
    - in_app: Stored in database for in-app display
    - email: Email notification (future)
    - push: Push notification (future)
    """
    user_id = inputs.get("user_id")
    notification_type = inputs.get("type")
    title = inputs.get("title")
    message = inputs.get("message")
    channel = inputs.get("channel", "in_app")
    metadata = inputs.get("metadata", {})

    if not user_id or not notification_type:
        return {"success": False, "error": "user_id and type are required"}

    # Use service role key for backend operations
    if not settings.supabase_service_role_key:
        return {"success": False, "error": "SUPABASE_SERVICE_ROLE_KEY not configured"}

    sb = SupabaseRest(
        settings.supabase_url,
        settings.supabase_anon_key,
        service_role_key=settings.supabase_service_role_key,
    )

    try:
        # Create notification record
        notification_data = {
            "user_id": user_id,
            "type": notification_type,
            "title": title or _get_default_title(notification_type),
            "message": message or "",
            "channel": channel,
            "is_read": False,
            "metadata": metadata,
        }

        await sb.insert(
            access_token=None,
            table="notifications",
            rows=notification_data,
            returning="minimal",
        )

        logger.info(f"Notification sent to user {user_id}: {notification_type}")

        # Also create an alert for budget-related notifications
        if notification_type in ("budget_warning", "budget_exceeded"):
            await _create_budget_alert(sb, user_id, notification_type, message, metadata)

        return {
            "success": True,
            "notification_id": f"{user_id}_{notification_type}",
            "type": notification_type,
            "channel": channel,
        }

    except Exception as e:
        logger.error(f"Error sending notification: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


def _get_default_title(notification_type: str) -> str:
    """Get default title for notification type."""
    titles = {
        "budget_warning": "⚠️ Budget Warning",
        "budget_exceeded": "🔴 Budget Exceeded",
        "transaction_alert": "🔔 Transaction Alert",
        "document_ready": "✅ Document Ready",
        "system_alert": "ℹ️ System Alert",
        "reminder": "📅 Reminder",
    }
    return titles.get(notification_type, "📢 Notification")


async def _create_budget_alert(
    sb: SupabaseRest,
    user_id: str,
    alert_type: str,
    message: str,
    metadata: dict[str, Any]
) -> None:
    """Create a budget alert record."""
    try:
        await sb.insert(
            access_token=None,
            table="alerts",
            rows={
                "user_id": user_id,
                "alert_type": alert_type,
                "category": metadata.get("category", "general"),
                "message": message,
                "is_read": False,
            },
            returning="minimal",
        )
    except Exception as e:
        logger.warning(f"Failed to create budget alert: {e}")


async def get_user_notifications(
    user_id: str,
    settings: Settings,
    limit: int = 50,
    unread_only: bool = False
) -> list[dict[str, Any]]:
    """Get notifications for a user."""
    if not settings.supabase_service_role_key:
        return []

    sb = SupabaseRest(
        settings.supabase_url,
        settings.supabase_anon_key,
        service_role_key=settings.supabase_service_role_key,
    )

    params = {
        "user_id": f"eq.{user_id}",
        "order": "created_at.desc",
        "limit": str(limit),
    }

    if unread_only:
        params["is_read"] = "eq.false"

    try:
        return await sb.select(
            access_token=None,
            table="notifications",
            params=params,
        )
    except Exception as e:
        logger.error(f"Error fetching notifications: {e}")
        return []


async def mark_notification_read(
    notification_id: str,
    user_id: str,
    settings: Settings
) -> dict[str, Any]:
    """Mark a notification as read."""
    if not settings.supabase_service_role_key:
        return {"success": False, "error": "SUPABASE_SERVICE_ROLE_KEY not configured"}

    sb = SupabaseRest(
        settings.supabase_url,
        settings.supabase_anon_key,
        service_role_key=settings.supabase_service_role_key,
    )

    try:
        # Update notification
        await sb.update(
            access_token=None,
            table="notifications",
            params={
                "id": f"eq.{notification_id}",
                "user_id": f"eq.{user_id}",
            },
            data={"is_read": True},
        )

        return {"success": True}
    except Exception as e:
        logger.error(f"Error marking notification read: {e}")
        return {"success": False, "error": str(e)}
