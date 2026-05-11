# Kafka (Windows)

This project’s backend expects an Apache Kafka broker reachable at `KAFKA_BOOTSTRAP_SERVERS` (default `localhost:9092`).

## Option A: Use your existing Kafka

If you already have Kafka running, just ensure these topics exist:

- `chat_requests`
- `chat_responses`
- `budget_requests`
- `budget_responses`
- `ocr_requests`
- `ocr_responses`
- `transactions`

Then start the backend services in [services/backend/README.md](../backend/README.md).

## Option B: Run Kafka locally on Windows

Kafka can be run on Windows using the official binary distribution.

1. Install Java 17+ (required by Kafka)
2. Download Apache Kafka (binary) and extract it, e.g. to `C:\kafka`
3. In two terminals, run Zookeeper/KRaft as configured by your Kafka distribution.

This repo includes helper scripts that assume `C:\kafka` by default.

### Scripts

- [services/kafka/start-zookeeper.ps1](start-zookeeper.ps1)
- [services/kafka/start-kafka.ps1](start-kafka.ps1)
- [services/kafka/create-topics.ps1](create-topics.ps1)

If your Kafka folder is different, set `$KafkaHome` when calling them.
