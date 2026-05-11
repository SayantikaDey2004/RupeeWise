param(
  [string]$KafkaHome = "C:\\kafka"
)

$kafka = Join-Path $KafkaHome "bin\\windows\\kafka-server-start.bat"
if (-not (Test-Path $kafka)) {
  throw "Could not find Kafka script at $kafka. Set -KafkaHome to your Kafka folder."
}

& $kafka (Join-Path $KafkaHome "config\\server.properties")
