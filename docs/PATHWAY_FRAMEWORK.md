# Pathway Framework Implementation

This document describes the comprehensive Pathway framework implementation for real-time data processing in the Miaoda React Admin application.

## Overview

The Pathway framework provides a unified architecture for processing streaming data through configurable pipelines. It integrates with Apache Kafka for message processing and Supabase for data persistence.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ RealtimeCtx │  │  Pipelines  │  │  Event Listeners        │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                    Kafka / SSE / WebSocket
                              │
┌─────────────────────────────────────────────────────────────────┐
│                     Backend (Python/FastAPI)                    │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                  Pathway Processor                          ││
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐ ││
│  │  │ Circuit  │  │  Retry   │  │  Input   │  │  Pathway   │ ││
│  │  │Breaker   │  │  Logic   │  │Validation│  │    VM      │ ││
│  │  └──────────┘  └──────────┘  └──────────┘  └────────────┘ ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │
│  │  Kafka     │  │  Tools     │  │  Response   │               │
│  │  Consumer  │  │  (Logic)   │  │  Publisher  │               │
│  └─────────────┘  └─────────────┘  └─────────────┘               │
└─────────────────────────────────────────────────────────────────┘
                              │
                         Supabase DB
```

## Backend Components

### Pathway Processor (`backend/processor/main.py`)

The main processor implements:

1. **Circuit Breaker Pattern**
   - Prevents cascading failures
   - Auto-recovery after timeout
   - Different breakers for different services (gemini, ocr, supabase)

2. **Retry Logic**
   - Exponential backoff with jitter
   - Configurable max attempts
   - Per-service configuration

3. **Input Validation**
   - Validates all incoming payloads
   - Returns specific error messages
   - Prevents invalid processing

4. **Complex Multi-Step Workflows**
   - Transaction processing: update → notify → analyze
   - OCR processing: extract → transform
   - Budget processing: validate → process

### Supported Topics

| Topic | Purpose | Response Topic |
|-------|---------|----------------|
| `chat_requests` | AI chat processing | `chat_responses` |
| `budget_requests` | Budget suggestions | `budget_responses` |
| `ocr_requests` | Document OCR | `ocr_responses` |
| `transactions` | Transaction processing | - (side effects) |
| `notifications` | Send notifications | - |
| `analytics` | Update analytics | - |

### Tool Handlers

All tool handlers are defined in `backend/logic/`:

- `budget.py` - Budget suggestion using Gemini AI
- `chat.py` - Chat stream processing with context
- `ocr.py` - Document OCR processing
- `transactions.py` - Transaction updates and alerts
- `notifications.py` - Notification delivery
- `analytics.py` - Real-time analytics updates

## Frontend Components

### Pipelines (`src/lib/realtime-processor.ts`)

1. **TransactionPipeline**
   - Real-time transaction monitoring
   - Anomaly detection (Z-score based)
   - Budget status checking
   - Kafka SSE support

2. **BudgetMonitoringPipeline**
   - Budget change monitoring
   - Real-time updates

3. **DocumentProcessingPipeline**
   - Document upload status
   - Processing completion

4. **ChatPipeline**
   - Real-time AI chat responses
   - SSE-based streaming

5. **NotificationPipeline**
   - Real-time notifications
   - Mark as read functionality

6. **AnalyticsPipeline**
   - Category spending updates
   - Period-based analytics

### Context (`src/contexts/RealtimeContext.tsx`)

Provides unified access to all pipelines with:
- User-based isolation
- Automatic cleanup
- Event callbacks
- Toast notifications for alerts

## Configuration

### Environment Variables

Backend (`services/backend/.env`):
```
env
# Kafka
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
KAFKA_CLIENT_ID=rupeewise-backend

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

Frontend (`.env`):
```
env
VITE_API_BASE_URL=http://localhost:8000
VITE_KAFKA_TRANSACTIONS_SSE_URL=http://localhost:8000/api/transactions/stream
```

## Usage Examples

### Backend Tool Registration

```
python
from pathway_engine.sdk import Pathway, ToolNode
from pathway_engine.domain.context import Context

def _make_ctx(*, producer):
    async def tool_example(args: dict, _ctx: Context) -> dict:
        # Your logic here
        return {"result": "success"}
    
    return Context(tools={"my.tool": tool_example})

# Define pathway
pathway = Pathway(
    nodes={
        "step1": ToolNode(id="step1", tool="my.tool"),
        "step2": ToolNode(id="step2", tool="my.tool"),
    }
)
```

### Frontend Pipeline Usage

```
typescript
import { RealtimeProcessingManager } from '@/lib/realtime-processor';

// Initialize
const manager = new RealtimeProcessingManager(userId);

// Set up callbacks
manager.getTransactionPipeline().onAnomaly = (anomaly) => {
  console.log('Anomaly detected:', anomaly);
};

manager.getTransactionPipeline().onBudgetAlert = (alert) => {
  console.log('Budget alert:', alert);
};

// Start all pipelines
manager.startAll();

// Later, clean up
manager.stopAll();
```

### Sending a Pathway Request

```
python
from aiokafka import AIOKafkaProducer
import json

async def send_budget_request():
    producer = AIOKafkaProducer(
        bootstrap_servers='localhost:9092',
        value_serializer=lambda v: json.dumps(v).encode('utf-8')
    )
    
    await producer.start()
    await producer.send_and_wait(
        'budget_requests',
        {
            'user_id': 'user-123',
            'total_income': 50000,
            'period': 'monthly',
            'supabase_access_token': 'token',
            'correlation_id': 'corr-123'
        }
    )
    await producer.stop()
```

## Error Handling

### Circuit Breaker States

```
CLOSED ─────► OPEN ─────► HALF_OPEN ─────► CLOSED
  │            │              │               │
  │  Normal   │  Failure    │  Testing     │  Recovered
  │  ops      │  threshold  │  requests    │
  └───────────┴─────────────┴──────────────┘
```

### Retry Strategy

- **Max Attempts**: 3 (configurable)
- **Base Delay**: 1 second
- **Max Delay**: 30 seconds
- **Exponential Base**: 2.0
- **Jitter**: 50%

## Monitoring

### Logging

All processor operations are logged with:
- Timestamp
- Log level
- Correlation ID
- Operation details

### Key Metrics

- Message processing time
- Circuit breaker state transitions
- Retry attempts
- Error rates per topic

## Security

### Service Role Keys

Backend operations use Supabase service role key:
- Bypasses RLS policies
- Required for system-wide operations
- Never exposed to clients

### Input Validation

All inputs are validated before processing:
- Required fields check
- Type validation
- Format validation

## Performance

- **Max Parallel**: 10 concurrent executions
- **Batch Size**: 50 messages per poll
- **Timeout**: 300 seconds per execution

## Future Enhancements

1. **Additional Pipelines**
   - Push notification delivery
   - Email notification handler
   - Webhook integrations

2. **Monitoring**
   - Prometheus metrics
   - Grafana dashboards
   - Alerting rules

3. **Advanced Workflows**
   - Conditional branching
   - Parallel execution
   - Timeout handling
