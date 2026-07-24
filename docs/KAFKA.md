# Kafka (staging + prod)

NexRyde uses **GCP Managed Service for Apache Kafka** with Cloud Run (SASL_SSL + OAUTHBEARER via ADC).

## One-time provision

```bash
# Staging cluster + secret KAFKA_BOOTSTRAP_SERVERS_STAGING + topics + IAM
./backend/scripts/setup_managed_kafka.sh staging

# Prod cluster + secret KAFKA_BOOTSTRAP_SERVERS
./backend/scripts/setup_managed_kafka.sh prod
```

Optional overrides:

```bash
export GCP_REGION=us-central1
export KAFKA_SUBNET=projects/nexryde-app/regions/us-central1/subnetworks/default
export KAFKA_CPU=3 KAFKA_MEMORY=3GiB
```

## Deploy

```bash
# Staging API + worker
gcloud run services replace backend/cloudrun.staging.yaml --region us-central1
gcloud run services replace backend/cloudrun.kafka-worker.staging.yaml --region us-central1

# Prod API + worker
gcloud run services replace backend/cloudrun.service.yaml --region us-central1
gcloud run services replace backend/cloudrun.kafka-worker.yaml --region us-central1
```

Both API YAMLs set:

| Env | Value |
|-----|--------|
| `NEXRYDE_EVENT_BUS` | `kafka` |
| `KAFKA_SECURITY_PROTOCOL` | `SASL_SSL` |
| `KAFKA_SASL_MECHANISM` | `OAUTHBEARER` |
| `KAFKA_BOOTSTRAP_SERVERS` | Secret Manager |

API keeps `NEXRYDE_SAGA_INLINE=true` + in-process outbox until the kafka-worker is healthy; then flip API to `NEXRYDE_SAGA_INLINE=false` / `NEXRYDE_OUTBOX_WORKER=false`.

## Topics

- `nexryde.presence`
- `nexryde.offers`
- `nexryde.trips`
- `nexryde.saga`
- `nexryde.surge`

## Auth

`realtime_platform/kafka_client.py` builds aiokafka clients with a GCP ADC token provider (same JWT shape as Google’s Python quickstart). Cloud Run SA needs:

- `roles/managedkafka.client`
- `roles/iam.serviceAccountTokenCreator`
- `roles/iam.serviceAccountOpenIdTokenCreator`

## Local

```bash
docker compose -f docker-compose.kafka.yml up -d
export KAFKA_BOOTSTRAP_SERVERS=localhost:9092
export NEXRYDE_EVENT_BUS=kafka
export KAFKA_SECURITY_PROTOCOL=PLAINTEXT
```

## Fallback

If Kafka is unreachable, producers fall back to Redis Streams + Mongo outbox automatically (`event_bus.py`).
