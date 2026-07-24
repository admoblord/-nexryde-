"""Realtime Reliability Platform — unit tests (Redis mem + engines)."""
from __future__ import annotations

import os

import pytest

os.environ.setdefault("JWT_SECRET", "test-realtime-platform")
os.environ.setdefault("ALLOW_INSECURE_JWT_FOR_TESTS", "1")
os.environ.setdefault("REDIS_REQUIRED", "false")
os.environ.setdefault("NEXRYDE_REALTIME_PLATFORM", "true")

from redis_store import _MemStore


@pytest.fixture()
def mem_store(monkeypatch):
    mem = _MemStore()
    monkeypatch.setattr("redis_store.store", mem)
    monkeypatch.setattr("driver_presence.store", mem)
    return mem


@pytest.mark.asyncio
async def test_idempotency_claim_once(mem_store):
    from realtime_platform.idempotency import claim

    assert await claim("k1", ttl_sec=30) is True
    assert await claim("k1", ttl_sec=30) is False


@pytest.mark.asyncio
async def test_ack_roundtrip(mem_store):
    from realtime_platform.ack_engine import acknowledge, is_acked, register_pending
    from realtime_platform.models import EventType, RealtimeEvent

    ev = RealtimeEvent.new(EventType.RIDE_OFFER, "driver_1", offer_id="o1")
    await register_pending(ev)
    assert await is_acked(ev.event_id) is False
    res = await acknowledge(ev.event_id, actor_id="driver_1", event_type="RIDE_OFFER")
    assert res["ok"] is True
    assert await is_acked(ev.event_id) is True


@pytest.mark.asyncio
async def test_presence_online_offline(mem_store, monkeypatch):
    pytest.importorskip("h3")
    from realtime_platform.presence_service import get_presence, set_offline, set_online

    # Avoid Mongo in presence path
    monkeypatch.setattr(
        "driver_presence.index_driver_cell",
        __import__("h3_dispatch", fromlist=["index_driver_cell"]).index_driver_cell,
        raising=False,
    )

    out = await set_online("drv_a", lat=6.4541, lng=3.3947, network_quality="good")
    assert out["ok"] is True
    assert out["online"] is True
    snap = await get_presence("drv_a")
    assert snap and snap.online is True
    off = await set_offline("drv_a")
    assert off["online"] is False


@pytest.mark.asyncio
async def test_accept_once_blocks_duplicate(mem_store):
    from realtime_platform.trip_engine import accept_offer_once

    g1 = await accept_offer_once(trip_id="t1", driver_id="d1", offer_id="o1")
    assert g1["ok"] is True
    g2 = await accept_offer_once(trip_id="t1", driver_id="d1", offer_id="o1")
    assert g2["duplicate"] is True


@pytest.mark.asyncio
async def test_gateway_health():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from realtime_platform.gateway import realtime_gateway_router

    app = FastAPI()
    app.include_router(realtime_gateway_router)
    client = TestClient(app)
    res = client.get("/api/realtime/health")
    assert res.status_code in (200, 503)
    assert res.json().get("service") == "realtime_platform"


def test_retry_backoff_grows():
    from realtime_platform.retry_engine import backoff_ms

    assert backoff_ms(0) <= backoff_ms(3)
    assert backoff_ms(20) <= 15_000


@pytest.mark.asyncio
async def test_decline_once_idempotent(mem_store):
    from realtime_platform.trip_engine import decline_offer_once

    g1 = await decline_offer_once(trip_id="t1", driver_id="d1", offer_id="o1")
    assert g1["ok"] is True and not g1.get("duplicate")
    g2 = await decline_offer_once(trip_id="t1", driver_id="d1", offer_id="o1")
    assert g2["ok"] is True and g2.get("duplicate") is True


@pytest.mark.asyncio
async def test_lifecycle_rejects_invalid_skip(mem_store):
    from realtime_platform.lifecycle import assert_transition
    import pytest as _pytest

    await assert_transition(from_status="pending", to_status="accepted")
    with _pytest.raises(ValueError):
        await assert_transition(from_status="pending", to_status="ongoing")


@pytest.mark.asyncio
async def test_idempotency_fail_open_on_redis_error(monkeypatch):
    from realtime_platform import idempotency

    class Boom:
        async def set_nx(self, *a, **k):
            raise RuntimeError("redis down")

    monkeypatch.setattr("redis_store.store", Boom())
    assert await idempotency.claim("x", ttl_sec=10) is True


@pytest.mark.asyncio
async def test_gateway_exposes_success_criteria():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from realtime_platform.gateway import realtime_gateway_router

    app = FastAPI()
    app.include_router(realtime_gateway_router)
    client = TestClient(app)
    res = client.get("/api/realtime/health")
    body = res.json()
    assert "success_criteria" in body
    assert body["success_criteria"]["ride_delivery_ms"] == 500
    assert "offer_ledger" in body.get("guarantees", [])
    assert "exactly_once_cancel" in body.get("guarantees", [])
    assert body.get("event_bus") in ("redis", "kafka", "off")


@pytest.mark.asyncio
async def test_event_bus_publish_redis(mem_store, monkeypatch):
    monkeypatch.setenv("NEXRYDE_EVENT_BUS", "redis")
    monkeypatch.delenv("KAFKA_BOOTSTRAP_SERVERS", raising=False)
    from realtime_platform import event_bus

    async def _noop_outbox(*a, **k):
        return None

    monkeypatch.setattr(event_bus, "_persist_outbox", _noop_outbox)
    out = await event_bus.publish_trip("trip_accepted", trip_id="t1", actor_id="d1")
    assert out["event_id"]
    assert out["published"] is True
    assert out["transport"] in ("redis", "outbox_only")


@pytest.mark.asyncio
async def test_cancel_transition_allowed():
    from realtime_platform.lifecycle import assert_transition

    await assert_transition(from_status="accepted", to_status="cancelled")
    await assert_transition(from_status="pending_driver_offers", to_status="cancelled")


@pytest.mark.asyncio
async def test_outbox_worker_enabled_by_default(monkeypatch):
    monkeypatch.delenv("NEXRYDE_OUTBOX_WORKER", raising=False)
    monkeypatch.setenv("NEXRYDE_REALTIME_PLATFORM", "true")
    from realtime_platform.outbox_worker import _enabled

    assert _enabled() is True


@pytest.mark.asyncio
async def test_publish_skip_outbox(mem_store, monkeypatch):
    monkeypatch.setenv("NEXRYDE_EVENT_BUS", "redis")
    from realtime_platform import event_bus

    called = {"n": 0}

    async def _boom(*a, **k):
        called["n"] += 1

    monkeypatch.setattr(event_bus, "_persist_outbox", _boom)
    out = await event_bus.publish(
        "nexryde.trips",
        "trip_accepted",
        trip_id="t9",
        persist_outbox=False,
    )
    assert called["n"] == 0
    assert out["event_id"]


@pytest.mark.asyncio
async def test_gateway_metrics_watch_shape():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from realtime_platform.gateway import realtime_gateway_router
    from realtime_platform.observability import incr, observe_ms, reset_for_tests

    reset_for_tests()
    observe_ms("fare.estimate_io_ms", 120)
    observe_ms("trip.cancel_ms", 80)
    incr("push.missed_offer")

    app = FastAPI()
    app.include_router(realtime_gateway_router)

    # Bypass auth for unit shape check
    import realtime_platform.gateway as gw

    def _fake_auth(request):
        return "tester"

    gw._auth_sub = _fake_auth  # type: ignore
    client = TestClient(app)
    res = client.get("/api/realtime/metrics/watch")
    assert res.status_code == 200
    body = res.json()
    assert "watch" in body
    assert "redis_latency_ms" in body or body.get("redis_ok") is not None
    assert "fare.estimate_io_ms" in (body.get("watch") or {}).get("latency_ms", {})
    assert body.get("keys")


