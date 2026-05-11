from __future__ import annotations

from dataclasses import dataclass
import os


def _env(name: str, default: str | None = None) -> str:
    value = os.getenv(name, default)
    if value is None or value.strip() == "":
        raise RuntimeError(f"Missing required env var: {name}")
    return value


@dataclass(frozen=True)
class Settings:
    kafka_bootstrap_servers: str = _env("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
    kafka_client_id: str = os.getenv("KAFKA_CLIENT_ID", "rupeewise-backend")

    supabase_url: str = _env("SUPABASE_URL")
    supabase_anon_key: str = _env("SUPABASE_ANON_KEY")
    supabase_service_role_key: str | None = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    gemini_api_key: str = _env("GEMINI_API_KEY")
    gemini_url: str = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent"

    topic_chat_requests: str = os.getenv("TOPIC_CHAT_REQUESTS", "chat_requests")
    topic_chat_responses: str = os.getenv("TOPIC_CHAT_RESPONSES", "chat_responses")
    topic_budget_requests: str = os.getenv("TOPIC_BUDGET_REQUESTS", "budget_requests")
    topic_budget_responses: str = os.getenv("TOPIC_BUDGET_RESPONSES", "budget_responses")
    topic_ocr_requests: str = os.getenv("TOPIC_OCR_REQUESTS", "ocr_requests")
    topic_ocr_responses: str = os.getenv("TOPIC_OCR_RESPONSES", "ocr_responses")
    topic_transactions: str = os.getenv("TOPIC_TRANSACTIONS", "transactions")
    topic_notifications: str = os.getenv("TOPIC_NOTIFICATIONS", "notifications")
    topic_analytics: str = os.getenv("TOPIC_ANALYTICS", "analytics")


def get_settings() -> Settings:
    return Settings()
