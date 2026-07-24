# NexRyde Reliability Platform

Deterministic reliability: every critical action completes or recovers automatically.

**Stack:** Redis (presence/locks/ACK) + Mongo (trips/offers/sagas/outbox) + Kafka *or* Redis Streams event bus + WS/Connect/FCM + Android FGS.

## Flow readiness (target 100)

| Flow | Mechanisms |
|------|------------|
| Online/offline | Redis commit first → Mongo denorm; offer cancel on offline; Kafka `nexryde.presence` |
| Incoming offer | Socket → ACK → FCM once → ledger; sibling withdraw on accept/cancel |
| Accept | Redis NX + trip lock + Mongo CAS; Kafka `trip_accepted`; offline queue |
| Complete | CAS `ongoing→completed` + **completion saga** (stats/incentives/wallet/pushes/metrics) |
| Cancel | Idempotency + trip lock + CAS + **withdraw offers** + **cancel saga** + offline queue |

## Event bus (Kafka)

```bash
# Local
docker compose -f docker-compose.kafka.yml up -d
export KAFKA_BOOTSTRAP_SERVERS=localhost:9092
export NEXRYDE_EVENT_BUS=kafka
```

Without Kafka, default is **Redis + Mongo outbox** (`NEXRYDE_EVENT_BUS=redis`).

Topics: `nexryde.presence` · `nexryde.offers` · `nexryde.trips` · `nexryde.saga` · `nexryde.surge`

## Dedicated Kafka worker (Cloud Run)

Always-on replayer (not in-request):

```bash
gcloud run services replace backend/cloudrun.kafka-worker.yaml --region africa-south1
```

- Role: `NEXRYDE_SERVICE_ROLE=kafka-worker` (same Docker image / `entrypoint.sh`)
- Consumes Kafka (+ Redis outbox/saga drain fallback)
- Flushes **batched matching** + **surge tumbling windows**
- Pair with API: `NEXRYDE_SAGA_INLINE=false` `NEXRYDE_OUTBOX_WORKER=false`

## gRPC RidePush (Lagos-adjacent)

Dedicated HTTP/2 Cloud Run service in **africa-south1** (closest GCP region to Lagos):

```bash
gcloud run services replace backend/cloudrun.grpc-ridepush.yaml --region africa-south1
# Optional API regional move:
gcloud run services replace backend/cloudrun.africa-south1.yaml --region africa-south1
```

Redis pub/sub hubs are shared with the API — offers reach gRPC streams on any instance.

## Batched matching

`NEXRYDE_BATCH_MATCHING=true` — trips enqueue into an ~800ms window; worker runs greedy
global assignment (one primary driver per trip) then existing offer fan-out.

## Flink-style surge stream

`NEXRYDE_STREAM_SURGE=true` — H3 cell demand/supply counters in Redis; tumbling window
closes every `NEXRYDE_SURGE_WINDOW_SEC` (default 60). Fare still uses peak-only product
rules unless stream ratio is consulted via `estimate_area_demand_ratio_near`.

## Reliability Guardians (production)

Always-on loop (`NEXRYDE_GUARDIANS=true`):

| System | Module | Job |
|--------|--------|-----|
| Realtime Health Manager | `health_manager.py` | Dead presence / stale GPS / zombie online → heal |
| Dispatch Guardian | `dispatch_guardian.py` | Retry unacked offers, escalate after timeout, redispatch orphans |
| Trip Guardian | `trip_guardian.py` | Orphan locks, stale sibling offers, stuck sagas, stuck trips |
| Driver Recovery Manager | `driver_recovery.py` | `POST /api/realtime/session/recover` |
| Reliability Dashboard | `reliability_dashboard.py` | `GET /api/realtime/dashboard` (+ `/dashboard/prometheus`) |
| Delivery Guarantee Engine | `delivery_guarantee.py` | Unique offer ID → ACK → timeout → retry → FCM → reassign; outcomes only Delivered/Accepted/Declined/Expired/Reassigned |
| Driver Device Health Engine | `device_health.py` | Pre-dispatch gate: socket, GPS, FGS, full-screen notif, battery, network, app version |

Ops tick: `POST /api/realtime/guardians/tick`

### Delivery Guarantee

Every offer ends as one of: **Delivered | Accepted | Declined | Expired | Reassigned** — never unknown/lost.

- Audit: `GET /api/realtime/offers/{offer_id}/audit`
- Outcome log collection: `offer_delivery_outcomes`

### Device Health

Client reports via heartbeat `device_health` or `POST /api/realtime/device-health`.
Unhealthy drivers are skipped at dispatch until checks pass.
Min app version: `NEXRYDE_MIN_DRIVER_APP_VERSION` (default `1.0.0`).

### Chaos release gate

```bash
cd backend
# CI-scale (default)
./scripts/run_chaos_release_gate.sh ci
# Pre-release full scale (10k offers / 5k online)
./scripts/run_chaos_release_gate.sh full
```

Or directly:

```bash
pytest tests/chaos/ -q
CHAOS_OFFER_N=10000 CHAOS_ONLINE_N=5000 pytest tests/chaos/test_release_gate.py -q
```

Pass: no lost offers, no duplicate accepts, trips recover, services reconnect.

## Fare + places speed

| Path | Speed-up |
|------|----------|
| `POST /fare/estimate` | Demand + Directions **in parallel**; `fare.estimate_io_ms` |
| Fare lock | **Redis first** (`fare_lock:{id}` 10m) then Mongo |
| Places autocomplete | Existing LRU→Redis→Mongo; `places.autocomplete_ms` hit/miss |

## Outbox worker

Started with the API process (`realtime_platform/outbox_worker.py`) when no dedicated worker:

- Republishes pending `realtime_event_outbox` to Kafka/Redis
- Retries partial `trip_sagas` (complete/cancel)

Cloud Run env (default API):

```
NEXRYDE_REALTIME_PLATFORM=true
NEXRYDE_EVENT_BUS=redis
NEXRYDE_OUTBOX_WORKER=true
RT_HEARTBEAT_INTERVAL_SEC=20
```

Kafka: set `KAFKA_BOOTSTRAP_SERVERS` + `NEXRYDE_EVENT_BUS=kafka`.

**Staging/prod Managed Kafka:** see [`docs/KAFKA.md`](KAFKA.md) and
`./backend/scripts/setup_managed_kafka.sh staging|prod`.

## Watch metrics

```bash
# Auth'd compact SLO board
GET /api/realtime/metrics/watch

# Poller
export NEXRYDE_API_BASE=https://<host>
export NEXRYDE_TOKEN='Bearer …'
python3 backend/scripts/watch_realtime_metrics.py
```

Keys: `fare.estimate_io_ms`, `places.autocomplete_ms`, `push.missed_offer`, `saga.*`,
`trip.cancel_ms`, `match.batch_*`, `surge.*`, plus `redis_latency_ms` from health.

## Chaos

```bash
cd backend && pytest tests/chaos/test_realtime_chaos.py -q
pytest tests/test_batched_matching_surge.py -q
```

Device-lab steps: `docs/DEVICE_LAB_CHAOS.md`
