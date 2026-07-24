"""NexRyde event bus — Kafka when configured, else Redis Streams + Mongo outbox.

Topics:
  nexryde.presence  — online / offline / heartbeat
  nexryde.offers    — offer created / delivered / withdrawn
  nexryde.trips     — accept / decline / cancel / complete / transition
  nexryde.saga      — completion / cancel side-effect steps

Env:
  KAFKA_BOOTSTRAP_SERVERS=host:9092   # enables Kafka producer
  KAFKA_CLIENT_ID=nexryde-backend
  NEXRYDE_EVENT_BUS=kafka|redis|off  # default: kafka if bootstrap set else redis
"""
from __future__ import annotations

import json
import logging
import os
import time
import uuid
from typing import Any, Optional

from realtime_platform.observability import incr, observe_ms

logger = logging.getLogger("realtime_platform.event_bus")

TOPICS = (
    "nexryde.presence",
    "nexryde.offers",
    "nexryde.trips",
    "nexryde.saga",
    "nexryde.surge",
)

_producer: Any = None
_producer_failed = False


def _mode() -> str:
    explicit = (os.environ.get("NEXRYDE_EVENT_BUS") or "").strip().lower()
    if explicit in ("kafka", "redis", "off"):
        return explicit
    if (os.environ.get("KAFKA_BOOTSTRAP_SERVERS") or "").strip():
        return "kafka"
    return "redis"


async def _ensure_kafka_producer() -> Any:
    global _producer, _producer_failed
    if _producer is not None:
        return _producer
    if _producer_failed:
        return None
    from realtime_platform.kafka_client import bootstrap_servers, kafka_common_kwargs

    if not bootstrap_servers():
        _producer_failed = True
        return None
    try:
        from aiokafka import AIOKafkaProducer  # type: ignore

        kwargs = kafka_common_kwargs(
            client_id=os.environ.get("KAFKA_CLIENT_ID", "nexryde-backend"),
        )
        prod = AIOKafkaProducer(
            **kwargs,
            value_serializer=lambda v: json.dumps(v, default=str).encode("utf-8"),
            key_serializer=lambda k: (k or "").encode("utf-8"),
            acks="all",
        )
        await prod.start()
        _producer = prod
        incr("event_bus.kafka_connected")
        logger.info("event_bus: Kafka producer connected servers=%s", bootstrap_servers())
        return _producer
    except Exception:
        _producer_failed = True
        logger.exception("event_bus: Kafka producer unavailable — falling back to Redis/Mongo")
        incr("event_bus.kafka_unavailable")
        return None


async def _persist_outbox(topic: str, event: dict[str, Any]) -> None:
    try:
        from database import db

        await db.realtime_event_outbox.insert_one(
            {
                **event,
                "topic": topic,
                "created_at": time.time(),
                "status": "pending",
            }
        )
    except Exception:
        logger.debug("event_bus outbox persist failed", exc_info=True)


async def _publish_redis_stream(topic: str, event: dict[str, Any]) -> bool:
    try:
        from redis_store import store

        # Prefer native stream if available; else list fanout key.
        raw = getattr(store, "xadd", None)
        payload = json.dumps(event, default=str)
        if callable(raw):
            await raw(f"stream:{topic}", {"payload": payload}, maxlen=10_000)  # type: ignore
            return True
        await store.set(f"event:last:{topic}", payload, ttl=3600)
        # Pub/sub style notify for workers
        try:
            client = getattr(store, "_client", None) or getattr(store, "client", None)
            if client is not None and hasattr(client, "publish"):
                await client.publish(f"bus:{topic}", payload)
        except Exception:
            pass
        return True
    except Exception:
        logger.debug("event_bus redis publish failed", exc_info=True)
        return False


async def publish(
    topic: str,
    event_type: str,
    *,
    key: str = "",
    payload: Optional[dict[str, Any]] = None,
    actor_id: str = "",
    trip_id: str = "",
    offer_id: str = "",
    persist_outbox: bool = True,
) -> dict[str, Any]:
    """Publish a domain event. Always durable (outbox); Kafka when enabled."""
    if topic not in TOPICS:
        topic = "nexryde.trips"
    event = {
        "event_id": str(uuid.uuid4()),
        "event_type": event_type,
        "actor_id": actor_id,
        "trip_id": trip_id,
        "offer_id": offer_id,
        "payload": payload or {},
        "ts_ms": int(time.time() * 1000),
    }
    mode = _mode()
    if mode == "off":
        return {**event, "published": False, "mode": "off"}

    t0 = time.perf_counter()
    if persist_outbox:
        await _persist_outbox(topic, event)

    published = False
    transport = "outbox"
    if mode == "kafka":
        prod = await _ensure_kafka_producer()
        if prod is not None:
            try:
                await prod.send_and_wait(topic, event, key=key or trip_id or offer_id or actor_id or event["event_id"])
                published = True
                transport = "kafka"
            except Exception:
                logger.exception("event_bus kafka send failed topic=%s", topic)
                incr("event_bus.kafka_send_fail")

    if not published:
        published = await _publish_redis_stream(topic, event)
        transport = "redis" if published else "outbox_only"

    ms = (time.perf_counter() - t0) * 1000
    observe_ms("event_bus.publish_ms", ms, topic=topic, transport=transport)
    incr("event_bus.published", topic=topic, transport=transport)
    return {**event, "published": published, "mode": mode, "transport": transport}


async def publish_trip(event_type: str, *, trip_id: str, actor_id: str = "", **payload: Any) -> dict[str, Any]:
    return await publish(
        "nexryde.trips",
        event_type,
        key=trip_id,
        trip_id=trip_id,
        actor_id=actor_id,
        payload=payload,
    )


async def publish_offer(event_type: str, *, offer_id: str, trip_id: str = "", actor_id: str = "", **payload: Any) -> dict[str, Any]:
    return await publish(
        "nexryde.offers",
        event_type,
        key=offer_id or trip_id,
        offer_id=offer_id,
        trip_id=trip_id,
        actor_id=actor_id,
        payload=payload,
    )


async def publish_presence(event_type: str, *, driver_id: str, **payload: Any) -> dict[str, Any]:
    return await publish(
        "nexryde.presence",
        event_type,
        key=driver_id,
        actor_id=driver_id,
        payload=payload,
    )


async def publish_saga(event_type: str, *, trip_id: str, **payload: Any) -> dict[str, Any]:
    return await publish(
        "nexryde.saga",
        event_type,
        key=trip_id,
        trip_id=trip_id,
        payload=payload,
    )
