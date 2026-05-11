# Backend (Kafka + Pathway Engine)

This folder contains the **backend** services split from the Vite frontend.

## What runs where

- API service (FastAPI): exposes HTTP endpoints used by the frontend.
- Processor service (Kafka consumer): consumes requests from Kafka topics, executes workflows using `pathway-engine`, and publishes responses back to Kafka.

## Requirements

- Python 3.11+
- A running **Apache Kafka** cluster reachable from Windows (e.g. `localhost:9092`).
  - This repo does not currently include a Kafka runtime because Docker isn't available in this workspace.

## Configure

Create a file `services/backend/.env`:

```
env
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
KAFKA_CLIENT_ID=rupeewise-backend

# Supabase (used for auth + DB + storage)
SUPABASE_URL=...
SUPABASE_ANON_KEY=...

# Optional but strongly recommended for real-time transaction monitoring:
# lets the processor read/write budgets/transactions/alerts without embedding user JWTs in Kafka.
SUPABASE_SERVICE_ROLE_KEY=...

# Gateway URLs (Gemini + OCR)
INTEGRATIONS_API_KEY=...
GEMINI_URL=https://your-gateway-url.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse
OCR_URL=https://your-gateway-url.com/parse/image

# Topics
TOPIC_CHAT_REQUESTS=chat_requests
TOPIC_CHAT_RESPONSES=chat_responses
TOPIC_BUDGET_REQUESTS=budget_requests
TOPIC_BUDGET_RESPONSES=budget_responses
TOPIC_OCR_REQUESTS=ocr_requests
TOPIC_OCR_RESPONSES=ocr_responses
TOPIC_TRANSACTIONS=transactions
TOPIC_NOTIFICATIONS=notifications
TOPIC_ANALYTICS=analytics
```

## Install

From `services/backend`:

```
powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
py -m pip install -r requirements.txt
```

## Run

In two terminals:

```
powershell
# Terminal 1: processor
.\.venv\Scripts\Activate.ps1
py -m backend.processor

# Terminal 2: API
.\.venv\Scripts\Activate.ps1
py -m backend.api
```

## Kafka Topics

The following topics are used by the Pathway processor:

| Topic | Purpose | Producer | Consumer |
|-------|---------|----------|----------|
| `chat_requests` | AI chat requests | Frontend | Processor |
| `chat_responses` | AI chat responses | Processor | Frontend |
| `budget_requests` | Budget suggestion requests | Frontend | Processor |
| `budget_responses` | Budget suggestion responses | Processor | Frontend |
| `ocr_requests` | OCR processing requests | Frontend | Processor |
| `ocr_responses` | OCR processing responses | Processor | Frontend |
| `transactions` | Transaction events | Frontend/External | Processor |
| `notifications` | Notification requests | Processor | - |
| `analytics` | Analytics update requests | Processor | - |

Create topics using:

```
powershell
# Using kafka-topics.bat (Windows)
.\kafka-topics.bat --create --topic chat_requests --bootstrap-server localhost:9092
.\kafka-topics.bat --create --topic chat_responses --bootstrap-server localhost:9092
.\kafka-topics.bat --create --topic budget_requests --bootstrap-server localhost:9092
.\kafka-topics.bat --create --topic budget_responses --bootstrap-server localhost:9092
.\kafka-topics.bat --create --topic ocr_requests --bootstrap-server localhost:9092
.\kafka-topics.bat --create --topic ocr_responses --bootstrap-server localhost:9092
.\kafka-topics.bat --create --topic transactions --bootstrap-server localhost:9092
.\kafka-topics.bat --create --topic notifications --bootstrap-server localhost:9092
.\kafka-topics.bat --create --topic analytics --bootstrap-server localhost:9092
```

## Pathway Framework Features

### Circuit Breaker

The processor includes circuit breaker patterns for external API calls:
- **Gemini API**: 5 failures threshold, 30s recovery
- **OCR API**: 3 failures threshold, 60s recovery
- **Supabase**: 10 failures threshold, 15s recovery

### Retry Logic

Automatic retry with exponential backoff:
- Max 3 attempts
- Base delay: 1 second
- Max delay: 30 seconds
- Jitter: 50%

### Input Validation

All pathway inputs are validated before processing:
- Required fields check
- Type validation
- Returns specific error messages

### Multi-Step Workflows

Complex pathways with multiple steps:
- **Transaction**: update → notify → analyze
- **OCR**: extract → transform
- **Budget**: validate → process

## Frontend wiring

Set in the frontend `.env` (Vite):

```
env
VITE_API_BASE_URL=http://localhost:8000
VITE_KAFKA_TRANSACTIONS_SSE_URL=http://localhost:8000/api/transactions/stream
```

## API Endpoints

### Budget Suggestion

```
http
POST /api/budget/suggest
Content-Type: application/json

{
  "userId": "user-uuid",
  "totalIncome": 50000,
  "period": "monthly"
}
```

### OCR Processing

```
http
POST /api/ocr/process
Content-Type: application/json

{
  "userId": "user-uuid",
  "imageUrl": "https://..."
}
```

### Chat Stream

```
http
POST /api/chat/stream
Content-Type: application/json

{
  "message": "What is my spending?",
  "userId": "user-uuid"
}
```

### Transaction SSE

```
http
GET /api/transactions/stream?user_id=user-uuid
```

## Monitoring

Logs are output with structured format:
```
2024-01-01 12:00:00 - pathway-processor - INFO - Starting Pathway processor...
2024-01-01 12:00:01 - pathway-processor - INFO - Kafka producer connected to localhost:9092
2024-01-01 12:00:02 - pathway-processor - INFO - Processing message from topic: budget_requests
```

## Troubleshooting

### Processor not consuming messages
1. Check Kafka is running
2. Verify topic names match
3. Check consumer group ID is unique

### Circuit breaker open
- Check external API (Gemini, OCR) availability
- Circuit will auto-recover after timeout

### High latency
- Check Kafka broker performance
- Consider increasing `max_parallel` in PathwayVM
