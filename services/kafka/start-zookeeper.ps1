param(
  [string]$KafkaHome = "C:\\kafka"
)

$zk = Join-Path $KafkaHome "bin\\windows\\zookeeper-server-start.bat"
if (-not (Test-Path $zk)) {
  throw "Could not find Zookeeper script at $zk. Set -KafkaHome to your Kafka folder."
}

& $zk (Join-Path $KafkaHome "config\\zookeeper.properties")
