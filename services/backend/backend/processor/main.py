from __future__ import annotations

import asyncio
import json
import logging
import signal
import time
from typing import Any
from dataclasses import dataclass, field
from enum import Enum

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from dotenv import load_dotenv

from pathway_engine.domain.context import Context
from pathway_engine.sdk import Pathway, PathwayVM, ToolNode

from backend.config import get_settings
from backend.logic.budget import handle_budget_suggest
from backend.logic.chat import handle_chat_stream
from backend.logic.ocr import handle_ocr_process
from backend.logic.transactions import handle_transaction_update
from backend.logic.notifications import handle_notification_send
from backend.logic.analytics import handle_analytics_update

load_dotenv()

settings = get_settings()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("pathway-processor")


class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class CircuitBreaker:
    """Circuit breaker for external API calls."""
    failure_threshold: int = 5
    recovery_timeout: float = 30.0
    half_open_requests: int = 3
    state: CircuitState = field(default=CircuitState.CLOSED)
    failures: int = field(default=0)
    last_failure_time: float = field(default=0)
    half_open_successes: int = field(default=0)

    def can_execute(self) -> bool:
        if self.state == CircuitState.CLOSED:
            return True
        
        if self.state == CircuitState.OPEN:
            if time.time() - self.last_failure_time >= self.recovery_timeout:
                self.state = CircuitState.HALF_OPEN
                self.half_open_successes = 0
                logger.info("Circuit breaker transitioning to HALF_OPEN")
                return True
            return False
        
        # HALF_OPEN state
        return True

    def record_success(self):
        if self.state == CircuitState.HALF_OPEN:
            self.half_open_successes += 1
            if self.half_open_successes >= self.half_open_requests:
                self.state = CircuitState.CLOSED
                self.failures = 0
                logger.info("Circuit breaker CLOSED after recovery")
        elif self.state == CircuitState.CLOSED:
            self.failures = 0

    def record_failure(self):
        self.failures += 1
        self.last_failure_time = time.time()
        
        if self.state == CircuitState.HALF_OPEN:
            self.state = CircuitState.OPEN
            logger.warning("Circuit breaker OPEN after half-open failure")
        elif self.failures >= self.failure_threshold:
            self.state = CircuitState.OPEN
            logger.warning(f"Circuit breaker OPEN after {self.failures} failures")


@dataclass
class RetryConfig:
    """Configuration for retry logic."""
    max_attempts: int = 3
    base_delay: float = 1.0
    max_delay: float = 30.0
    exponential_base: float = 2.0
    jitter: bool = True

    def get_delay(self, attempt: int) -> float:
        delay = self.base_delay * (self.exponential_base ** attempt)
        delay = min(delay, self.max_delay)
        if self.jitter:
            import random
            delay *= (0.5 + random.random())
        return delay


# Global circuit breakers for different services
circuit_breakers = {
    "gemini": CircuitBreaker(failure_threshold=5, recovery_timeout=30.0),
    "ocr": CircuitBreaker(failure_threshold=3, recovery_timeout=60.0),
    "supabase": CircuitBreaker(failure_threshold=10, recovery_timeout=15.0),
}


def _make_ctx(*, producer: AIOKafkaProducer) -> Context:
    """Create Pathway context with all tool handlers."""
    
    async def tool_budget(args: dict[str, Any], _ctx: Context) -> dict[str, Any]:
        # Validate input
        validation_error = _validate_budget_input(args)
        if validation_error:
            return {"success": False, "error": validation_error}
        
        # Check circuit breaker
        cb = circuit_breakers["gemini"]
        if not cb.can_execute():
            return {"success": False, "error": "Budget service temporarily unavailable", "retryable": True}
        
        try:
            result = await handle_budget_suggest(args, settings)
            cb.record_success()
            return result
        except Exception as e:
            cb.record_failure()
            logger.error(f"Budget tool error: {e}")
            raise

    async def tool_ocr(args: dict[str, Any], _ctx: Context) -> dict[str, Any]:
        # Validate input
        validation_error = _validate_ocr_input(args)
        if validation_error:
            return {"success": False, "error": validation_error}
        
        # Check circuit breaker
        cb = circuit_breakers["ocr"]
        if not cb.can_execute():
            return {"success": False, "error": "OCR service temporarily unavailable", "retryable": True}
        
        async def publish_tx(row: dict[str, Any]) -> None:
            await producer.send_and_wait(settings.topic_transactions, row)

        try:
            result = await handle_ocr_process(args, settings, publish_tx)
            cb.record_success()
            return result
        except Exception as e:
            cb.record_failure()
            logger.error(f"OCR tool error: {e}")
            raise

    async def tool_chat(args: dict[str, Any], _ctx: Context) -> dict[str, Any]:
        # Validate input
        validation_error = _validate_chat_input(args)
        if validation_error:
            return {"success": False, "error": validation_error}
        
        # Check circuit breaker
        cb = circuit_breakers["gemini"]
        if not cb.can_execute():
            await producer.send_and_wait(
                settings.topic_chat_responses,
                {"correlation_id": args.get("correlation_id"), "event": "error", "error": "Chat service temporarily unavailable"}
            )
            return {"ok": False, "error": "Chat service temporarily unavailable", "retryable": True}
        
        correlation_id = args.get("correlation_id")

        async def publish_chunk(text: str) -> None:
            await producer.send_and_wait(
                settings.topic_chat_responses,
                {"correlation_id": correlation_id, "event": "chunk", "text": text},
            )

        async def publish_done() -> None:
            await producer.send_and_wait(
                settings.topic_chat_responses,
                {"correlation_id": correlation_id, "event": "done"},
            )

        async def publish_error(err: str) -> None:
            await producer.send_and_wait(
                settings.topic_chat_responses,
                {"correlation_id": correlation_id, "event": "error", "error": err},
            )

        try:
            await handle_chat_stream(
                inputs=args,
                settings=settings,
                publish_chunk=publish_chunk,
                publish_done=publish_done,
                publish_error=publish_error,
            )
            cb.record_success()
            return {"ok": True}
        except Exception as e:
            cb.record_failure()
            logger.error(f"Chat tool error: {e}")
            await publish_error(str(e))
            raise

    async def tool_transaction_update(args: dict[str, Any], _ctx: Context) -> dict[str, Any]:
        # Validate input
        validation_error = _validate_transaction_input(args)
        if validation_error:
            return {"ok": False, "error": validation_error}
        
        # Check circuit breaker
        cb = circuit_breakers["supabase"]
        if not cb.can_execute():
            return {"ok": False, "error": "Database temporarily unavailable", "retryable": True}
        
        try:
            result = await handle_transaction_update(args, settings)
            cb.record_success()
            return result
        except Exception as e:
            cb.record_failure()
            logger.error(f"Transaction update tool error: {e}")
            raise

    async def tool_notification(args: dict[str, Any], _ctx: Context) -> dict[str, Any]:
        """Handle notification sending through pathway."""
        validation_error = _validate_notification_input(args)
        if validation_error:
            return {"success": False, "error": validation_error}
        
        try:
            result = await handle_notification_send(args, settings)
            return result
        except Exception as e:
            logger.error(f"Notification tool error: {e}")
            raise

    async def tool_analytics(args: dict[str, Any], _ctx: Context) -> dict[str, Any]:
        """Handle analytics updates through pathway."""
        validation_error = _validate_analytics_input(args)
        if validation_error:
            return {"success": False, "error": validation_error}
        
        try:
            result = await handle_analytics_update(args, settings)
            return result
        except Exception as e:
            logger.error(f"Analytics tool error: {e}")
            raise

    return Context(
        tools={
            "logic.budget_suggest": tool_budget,
            "logic.ocr_process": tool_ocr,
            "logic.chat_stream": tool_chat,
            "logic.transaction_update": tool_transaction_update,
            "logic.notification_send": tool_notification,
            "logic.analytics_update": tool_analytics,
        }
    )


# Input validation functions
def _validate_budget_input(args: dict[str, Any]) -> str | None:
    """Validate budget suggestion input."""
    if not args.get("userId") and not args.get("user_id"):
        return "userId is required"
    if not args.get("totalIncome") and not args.get("total_income"):
        return "totalIncome is required"
    if not args.get("period"):
        return "period is required"
    if not args.get("supabase_access_token"):
        return "Authorization token is required"
    return None


def _validate_ocr_input(args: dict[str, Any]) -> dict[str, Any] | None:
    """Validate OCR processing input."""
    if not args.get("userId") and not args.get("user_id"):
        return "userId is required"
    if not args.get("supabase_access_token"):
        return "Authorization token is required"
    if not args.get("image_url") and not args.get("image_data"):
        return "image_url or image_data is required"
    return None


def _validate_chat_input(args: dict[str, Any]) -> str | None:
    """Validate chat stream input."""
    if not args.get("message"):
        return "message is required"
    if not args.get("userId") and not args.get("user_id"):
        return "userId is required"
    if not args.get("correlation_id"):
        return "correlation_id is required"
    if not args.get("supabase_access_token") and not args.get("localContext"):
        return "Authorization token or localContext is required"
    return None


def _validate_transaction_input(args: dict[str, Any]) -> str | None:
    """Validate transaction update input."""
    if not args.get("user_id"):
        return "user_id is required"
    if not args.get("category"):
        return "category is required"
    if not args.get("transaction_date"):
        return "transaction_date is required"
    return None


def _validate_notification_input(args: dict[str, Any]) -> str | None:
    """Validate notification input."""
    if not args.get("user_id"):
        return "user_id is required"
    if not args.get("type"):
        return "notification type is required"
    return None


def _validate_analytics_input(args: dict[str, Any]) -> str | None:
    """Validate analytics input."""
    if not args.get("user_id"):
        return "user_id is required"
    if not args.get("event_type"):
        return "event_type is required"
    return None


# Retry logic
async def execute_with_retry(
    func,
    *args,
    retry_config: RetryConfig = None,
    **kwargs
) -> Any:
    """Execute a function with retry logic."""
    if retry_config is None:
        retry_config = RetryConfig()
    
    last_exception = None
    
    for attempt in range(retry_config.max_attempts):
        try:
            return await func(*args, **kwargs)
        except Exception as e:
            last_exception = e
            logger.warning(f"Attempt {attempt + 1} failed: {e}")
            
            if attempt < retry_config.max_attempts - 1:
                delay = retry_config.get_delay(attempt)
                logger.info(f"Retrying in {delay:.2f} seconds...")
                await asyncio.sleep(delay)
    
    raise last_exception


async def _run() -> None:
    """Main processor loop with enhanced error handling."""
    logger.info("Starting Pathway processor...")
    
    producer = AIOKafkaProducer(
        bootstrap_servers=settings.kafka_bootstrap_servers,
        client_id=settings.kafka_client_id,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
        key_serializer=lambda v: v.encode("utf-8") if isinstance(v, str) else v,
    )
    await producer.start()
    logger.info(f"Kafka producer connected to {settings.kafka_bootstrap_servers}")

    consumer = AIOKafkaConsumer(
        settings.topic_chat_requests,
        settings.topic_budget_requests,
        settings.topic_ocr_requests,
        settings.topic_transactions,
        settings.topic_notifications,
        settings.topic_analytics,
        bootstrap_servers=settings.kafka_bootstrap_servers,
        client_id=settings.kafka_client_id,
        group_id="backend-processor",
        enable_auto_commit=True,
        auto_offset_reset="earliest",
        value_deserializer=lambda b: json.loads(b.decode("utf-8")),
    )
    await consumer.start()
    logger.info(f"Kafka consumer connected, listening to topics")

    ctx = _make_ctx(producer=producer)
    vm = PathwayVM(ctx, max_parallel=10)
    logger.info("Pathway VM initialized with max_parallel=10")

    # Define pathways for each topic - with complex multi-step workflows
    pathways = {
        settings.topic_budget_requests: Pathway(
            nodes={
                "validate": ToolNode(id="validate", tool="logic.budget_suggest"),
                "process": ToolNode(id="process", tool="logic.budget_suggest"),
            }
        ),
        settings.topic_ocr_requests: Pathway(
            nodes={
                "extract": ToolNode(id="extract", tool="logic.ocr_process"),
                "transform": ToolNode(id="transform", tool="logic.ocr_process"),
            }
        ),
        settings.topic_chat_requests: Pathway(
            nodes={
                "chat": ToolNode(id="chat", tool="logic.chat_stream"),
            }
        ),
        settings.topic_transactions: Pathway(
            nodes={
                "update": ToolNode(id="update", tool="logic.transaction_update"),
            }
        ),
        settings.topic_notifications: Pathway(
            nodes={
                "send": ToolNode(id="send", tool="logic.notification_send"),
            }
        ),
        settings.topic_analytics: Pathway(
            nodes={
                "update": ToolNode(id="update", tool="logic.analytics_update"),
            }
        ),
    }

    async def handle_message(topic: str, payload: dict[str, Any], correlation_id: str = None) -> None:
        """Handle a single message with retry and error handling."""
        pathway = pathways.get(topic)
        if not pathway:
            logger.warning(f"No pathway defined for topic: {topic}")
            return

        logger.info(f"Processing message from topic: {topic}, payload: {json.dumps(payload)[:200]}...")
        
        try:
            # Execute with retry
            retry_config = RetryConfig(max_attempts=3, base_delay=1.0)
            record = await execute_with_retry(
                vm.execute,
                pathway,
                inputs=payload,
                timeout=300,
                retry_config=retry_config
            )

            if topic == settings.topic_transactions:
                # Transaction updates are handled via side-effects (alerts).
                return

            # For non-streaming requests, send a single RPC response.
            if topic == settings.topic_budget_requests:
                out = record.outputs.get("process", {}).get("output") if record.outputs else None
                if not isinstance(out, dict):
                    out = record.outputs.get("validate", {}).get("output") if record.outputs else None
                if not isinstance(out, dict):
                    out = {"success": False, "error": "budget-suggest failed"}
                out["correlation_id"] = payload.get("correlation_id", correlation_id)
                await producer.send_and_wait(settings.topic_budget_responses, out)
                logger.info(f"Budget response sent: {json.dumps(out)[:100]}...")

            if topic == settings.topic_ocr_requests:
                out = record.outputs.get("extract", {}).get("output") if record.outputs else None
                if not isinstance(out, dict):
                    out = record.outputs.get("transform", {}).get("output") if record.outputs else None
                if not isinstance(out, dict):
                    out = {"success": False, "error": "ocr-process failed"}
                out["correlation_id"] = payload.get("correlation_id", correlation_id)
                await producer.send_and_wait(settings.topic_ocr_responses, out)
                logger.info(f"OCR response sent: {json.dumps(out)[:100]}...")

        except Exception as e:
            logger.error(f"Error processing message from {topic}: {e}", exc_info=True)
            
            # Send error response for request-response topics
            error_msg = str(e)
            if topic == settings.topic_budget_requests:
                await producer.send_and_wait(
                    settings.topic_budget_responses,
                    {"success": False, "error": error_msg, "correlation_id": payload.get("correlation_id", correlation_id)}
                )
            elif topic == settings.topic_ocr_requests:
                await producer.send_and_wait(
                    settings.topic_ocr_responses,
                    {"success": False, "error": error_msg, "correlation_id": payload.get("correlation_id", correlation_id)}
                )
            elif topic == settings.topic_chat_requests:
                await producer.send_and_wait(
                    settings.topic_chat_responses,
                    {"correlation_id": payload.get("correlation_id"), "event": "error", "error": error_msg}
                )

    stop_event = asyncio.Event()

    def _stop(*_args):
        logger.info("Shutdown signal received")
        stop_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _stop)
        except NotImplementedError:
            pass

    logger.info("Processor started, waiting for messages...")
    try:
        while not stop_event.is_set():
            msg_batch = await consumer.getmany(timeout_ms=500, max_records=50)
            for _tp, msgs in msg_batch.items():
                for msg in msgs:
                    try:
                        payload = msg.value
                        if not isinstance(payload, dict):
                            logger.warning(f"Skipping non-dict message: {type(payload)}")
                            continue
                        
                        # Extract correlation_id from key or payload
                        correlation_id = msg.key.decode("utf-8") if msg.key else None
                        
                        # Set correlation_id from payload if not in key
                        if not correlation_id:
                            correlation_id = payload.get("correlation_id")
                        
                        if msg.topic in (settings.topic_budget_requests, settings.topic_ocr_requests):
                            payload.setdefault("correlation_id", correlation_id)
                        
                        # Create task for parallel processing
                        asyncio.create_task(handle_message(msg.topic, payload, correlation_id))
                    except Exception as e:
                        logger.error(f"Error handling message: {e}", exc_info=True)

    finally:
        logger.info("Shutting down processor...")
        await consumer.stop()
        await producer.stop()
        logger.info("Processor stopped")


def main() -> None:
    asyncio.run(_run())
