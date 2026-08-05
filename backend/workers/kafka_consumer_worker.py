"""Dedicated Kafka consumer + outbox/saga replayer for Cloud Run.

Unlike the in-process outbox loop on the API service, this process is always-on
(min instances ≥ 1) and is the system of record for:

  • Consuming ``nexryde.saga`` / ``nexryde.trips`` / ``nexryde.offers``
  • Replaying completion / cancel sagas
  • Draining Mongo ``realtime_event_outbox``

Health: HTTP GET /healthz on PORT (Cloud Run probe).

Run:
  NEXRYDE_SERVICE_ROLE=kafka-worker python -m workers.kafka_consumer_worker
  # or Cloud Run: CMD uses NEXRYDE_SERVICE_ROLE
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import time
from typing import Any, Optional

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("workers.kafka_consumer")

TOPICS = ("nexryde.saga", "nexryde.trips", "nexryde.offers", "nexryde.presence", "nexryde.surge")
GROUP_ID = os.environ.get("KAFKA_CONSUMER_GROUP", "nexryde-replayer")


async def _handle_event(topic: str, event: dict[str, Any]) -> None:
    """Route Kafka (or Redis) events to saga / matching / surge handlers."""
    event_type = str(event.get("event_type") or "")
    trip_id = str(event.get("trip_id") or (event.get("payload") or {}).get("trip_id") or "")
    payload = dict(event.get("payload") or {})

    if topic == "nexryde.saga" or event_type in (
        "completion_enqueued",
        "cancel_enqueued",
        "saga_retry",
    ):
        from realtime_platform.saga import run_cancel_saga, run_completion_saga

        kind = str(payload.get("kind") or "")
        if "cancel" in event_type or kind == "cancel":
            await run_cancel_saga(
                trip_id,
                cancelled_by=str(payload.get("cancelled_by") or ""),
            )
        elif trip_id:
            await run_completion_saga(trip_id)
        return

    if topic == "nexryde.surge" or event_type.startswith("surge."):
        from realtime_platform.surge_stream import apply_surge_event

        await apply_surge_event(event_type, payload)
        return

    if topic == "nexryde.trips" and event_type in ("match_requested", "trip_created", "trip_pending"):
        from realtime_platform.batched_matching import enqueue_trip_for_batch

        await enqueue_trip_for_batch(trip_id, payload)
        return

    if topic == "nexryde.presence" and event_type in ("driver_online", "driver_offline", "heartbeat"):
        from realtime_platform.surge_stream import record_supply_event

        await record_supply_event(
            driver_id=str(event.get("actor_id") or payload.get("driver_id") or ""),
            event_type=event_type,
            lat=payload.get("lat"),
            lng=payload.get("lng"),
        )


async def _kafka_consume_loop(stop: asyncio.Event) -> None:
    from realtime_platform.kafka_client import TOPICS as KTOPICS
    from realtime_platform.kafka_client import bootstrap_servers, kafka_common_kwargs

    if not bootstrap_servers():
        logger.warning("kafka worker: KAFKA_BOOTSTRAP_SERVERS unset — Redis stream fallback only")
        return

    try:
        from aiokafka import AIOKafkaConsumer  # type: ignore
    except Exception as exc:
        logger.error("aiokafka missing: %s", exc)
        return

    topics = tuple(t.strip() for t in os.environ.get("KAFKA_TOPICS", ",".join(KTOPICS)).split(",") if t.strip())
    kwargs = kafka_common_kwargs(
        client_id=os.environ.get("KAFKA_CLIENT_ID", "nexryde-kafka-worker"),
    )
    consumer = AIOKafkaConsumer(
        *topics,
        **kwargs,
        group_id=GROUP_ID,
        enable_auto_commit=True,
        auto_offset_reset="latest",
        value_deserializer=lambda b: json.loads(b.decode("utf-8")),
    )
    await consumer.start()
    logger.info("kafka worker: consuming topics=%s group=%s", topics, GROUP_ID)
    try:
        while not stop.is_set():
            batch = await consumer.getmany(timeout_ms=1000, max_records=100)
            for _tp, messages in batch.items():
                for msg in messages:
                    try:
                        event = msg.value if isinstance(msg.value, dict) else {}
                        await _handle_event(msg.topic, event)
                    except Exception:
                        logger.exception(
                            "kafka handler failed topic=%s offset=%s",
                            msg.topic,
                            msg.offset,
                        )
    finally:
        await consumer.stop()


async def _redis_stream_loop(stop: asyncio.Event) -> None:
    """Drain the outbox and run timer work while this worker is alive.

    Shares run_maintenance_tick with POST /api/ops/maintenance-tick so a
    scale-to-zero deployment driven by Cloud Scheduler does exactly the same
    work as a warm worker.
    """
    from realtime_platform.maintenance import run_maintenance_tick

    while not stop.is_set():
        try:
            await run_maintenance_tick()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("redis/outbox worker iteration failed")
        try:
            await asyncio.wait_for(stop.wait(), timeout=5.0)
        except asyncio.TimeoutError:
            pass


async def _health_fallback(stop: asyncio.Event) -> None:
    from http.server import BaseHTTPRequestHandler, HTTPServer
    from threading import Thread

    port = int(os.environ.get("PORT") or "8080")
    started = time.time()

    class H(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            body = json.dumps(
                {
                    "ok": True,
                    "service": "kafka-worker",
                    "uptime_sec": int(time.time() - started),
                }
            ).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args: Any) -> None:
            return

    server = HTTPServer(("0.0.0.0", port), H)
    Thread(target=server.serve_forever, daemon=True).start()
    logger.info("kafka worker health (stdlib) on :%s", port)
    await stop.wait()
    server.shutdown()


async def main() -> None:
    stop = asyncio.Event()

    def _sig(*_a: Any) -> None:
        stop.set()

    try:
        loop = asyncio.get_running_loop()
        for s in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(s, _sig)
    except NotImplementedError:
        pass

    tasks = [
        asyncio.create_task(_health_fallback(stop), name="health"),
        asyncio.create_task(_redis_stream_loop(stop), name="outbox"),
    ]
    if (os.environ.get("KAFKA_BOOTSTRAP_SERVERS") or "").strip():
        tasks.append(asyncio.create_task(_kafka_consume_loop(stop), name="kafka"))

    logger.info("kafka consumer worker started role=%s", os.environ.get("NEXRYDE_SERVICE_ROLE"))
    await stop.wait()
    for t in tasks:
        t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)


if __name__ == "__main__":
    asyncio.run(main())
