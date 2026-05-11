param(
  [string]$KafkaHome = "C:\\kafka",
  [string]$Bootstrap = "localhost:9092"
)

$topics = @(
  "chat_requests",
  "chat_responses",
  "budget_requests",
  "budget_responses",
  "ocr_requests",
  "ocr_responses",
  "transactions"
)

$create = Join-Path $KafkaHome "bin\\windows\\kafka-topics.bat"
if (-not (Test-Path $create)) {
  throw "Could not find kafka-topics script at $create. Set -KafkaHome to your Kafka folder."
}

foreach ($t in $topics) {
  & $create --bootstrap-server $Bootstrap --create --if-not-exists --topic $t --replication-factor 1 --partitions 1
}
