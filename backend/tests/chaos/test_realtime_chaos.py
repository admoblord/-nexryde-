"""
Chaos-oriented realtime tests (simulated; no device farm required).

Covers:
  - duplicate accept storm
  - offer ACK fanout
  - idempotency reconnect storm
  - 100 concurrent offer FCM/idem claims
  - cancel idempotency storm
  - presence flap (Wi‑Fi↔LTE / airplane reconnect)
  - Cloud Run revision-swap heal (Redis reconnect + session heal)

Run: pytest tests/chaos/test_realtime_chaos.py -q
"""
from __future__ import annotations

import asyncio
import os

import pytest

os.environ.setdefault("JWT_SECRET", "test-chaos-rt")
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
async def test_duplicate_accept_storm(mem_store):
    from realtime_platform.trip_engine import accept_offer_once

    async def _one(_: int):
        return await accept_offer_once(
            trip_id="chaos_trip",
            driver_id="chaos_driver",
            offer_id="chaos_offer",
            client_event_id="same-client-event",
        )

    results = await asyncio.gather(*[_one(i) for i in range(100)])
    ok = [r for r in results if r.get("ok") and not r.get("duplicate")]
    dup = [r for r in results if r.get("duplicate")]
    assert len(ok) == 1
    assert len(dup) == 99


@pytest.mark.asyncio
async def test_offer_ack_fanout(mem_store):
    from realtime_platform.ack_engine import acknowledge, is_acked, register_pending
    from realtime_platform.models import EventType, RealtimeEvent

    events = [
        RealtimeEvent.new(EventType.RIDE_OFFER, f"d{i}", offer_id=f"o{i}") for i in range(50)
    ]
    for ev in events:
        await register_pending(ev)
    await asyncio.gather(
        *[acknowledge(ev.event_id, actor_id=ev.actor_id, event_type="RIDE_OFFER") for ev in events]
    )
    assert all([await is_acked(ev.event_id) for ev in events])


@pytest.mark.asyncio
async def test_idempotency_reconnect_storm(mem_store):
    from realtime_platform.idempotency import claim

    results = await asyncio.gather(*[claim("storm-key", ttl_sec=60) for _ in range(200)])
    assert sum(1 for r in results if r) == 1
    assert sum(1 for r in results if not r) == 199


@pytest.mark.asyncio
async def test_100_concurrent_offer_fcm_claims(mem_store):
    """Simulates 100 concurrent offer deliveries — FCM claim is exactly-once per offer."""
    from realtime_platform.idempotency import claim

    async def _claim_offer(i: int):
        # Same offer_id from dual WS+FCM paths
        return await claim(f"offer:fcm:chaos_offer_{i % 100}", ttl_sec=120)

    # 100 unique offers × 2 delivery attempts = 200 claims → 100 wins
    results = await asyncio.gather(*[_claim_offer(i) for i in range(200)])
    assert sum(1 for r in results if r) == 100
    assert sum(1 for r in results if not r) == 100


@pytest.mark.asyncio
async def test_cancel_idempotency_storm(mem_store):
    from realtime_platform.idempotency import claim
    from realtime_platform.trip_engine import acquire_trip_lock, release_trip_lock

    trip_id = "chaos_cancel_trip"
    client_event = f"cancel:{trip_id}:driver_a"

    async def _one(_: int):
        if not await claim(client_event, ttl_sec=300):
            return {"duplicate": True}
        locked = await acquire_trip_lock(trip_id, "driver_a")
        if not locked:
            return {"locked": True}
        try:
            return {"ok": True}
        finally:
            await release_trip_lock(trip_id)

    results = await asyncio.gather(*[_one(i) for i in range(50)])
    ok = [r for r in results if r.get("ok")]
    dup = [r for r in results if r.get("duplicate")]
    assert len(ok) == 1
    assert len(dup) == 49


@pytest.mark.asyncio
async def test_presence_flap_wifi_lte_airplane(mem_store, monkeypatch):
    """Network flap: offline → online → heartbeat with changing network_quality."""
    pytest.importorskip("h3")
    from realtime_platform.presence_service import get_presence, heartbeat, set_offline, set_online

    monkeypatch.setattr(
        "driver_presence.index_driver_cell",
        __import__("h3_dispatch", fromlist=["index_driver_cell"]).index_driver_cell,
        raising=False,
    )

    driver = "chaos_flap_driver"
    await set_online(driver, lat=6.45, lng=3.39, network_quality="excellent")
    # Airplane / Doze-style drop
    await set_offline(driver)
    off = await get_presence(driver)
    assert off is None or off.online is False
    # Wi‑Fi restore
    await set_online(driver, lat=6.45, lng=3.39, network_quality="good")
    # LTE handoff heartbeat
    hb = await heartbeat(driver, lat=6.451, lng=3.391, network_quality="fair")
    assert hb.get("ok") is True
    snap = await get_presence(driver)
    assert snap and snap.online is True
    assert snap.network_quality == "fair"


@pytest.mark.asyncio
async def test_cloud_run_revision_swap_heal(mem_store, monkeypatch):
    """
    Simulates Cloud Run revision swap: Redis presence survives, session heal
    replays pending offers on the new instance.
    """
    from realtime_platform.ack_engine import is_acked, register_pending
    from realtime_platform.healing import heal_session
    from realtime_platform.models import EventType, RealtimeEvent

    actor = "chaos_revision_driver"
    ev = RealtimeEvent.new(EventType.RIDE_OFFER, actor, offer_id="rev_offer_1", trip_id="rev_trip")
    await register_pending(ev)

    replayed_calls = {"n": 0}

    async def _fake_replay(actor_id, handler, limit=30):
        replayed_calls["n"] += 1
        # New revision "delivers" and ACKs
        from realtime_platform.ack_engine import acknowledge

        await acknowledge(ev.event_id, actor_id=actor, event_type="RIDE_OFFER")
        return 1

    monkeypatch.setattr("realtime_platform.healing.replay_pending_for_actor", _fake_replay)

    async def _noop_hub(*a, **k):
        return None

    monkeypatch.setattr(
        "routers.realtime_dispatch.driver_offer_hub._ensure_channel",
        _noop_hub,
        raising=False,
    )

    out = await heal_session(actor, role="driver")
    assert out.get("ok") is True
    assert out.get("redis_ok") is True
    assert replayed_calls["n"] == 1
    assert await is_acked(ev.event_id) is True


@pytest.mark.asyncio
async def test_fgs_kill_style_session_resume(mem_store, monkeypatch):
    """FGS kill → process restart → heal + presence re-assert without app restart UX."""
    pytest.importorskip("h3")
    from realtime_platform.healing import heal_session
    from realtime_platform.presence_service import get_presence, set_online

    monkeypatch.setattr(
        "driver_presence.index_driver_cell",
        __import__("h3_dispatch", fromlist=["index_driver_cell"]).index_driver_cell,
        raising=False,
    )

    async def _no_replay(*a, **k):
        return 0

    monkeypatch.setattr("realtime_platform.healing.replay_pending_for_actor", _no_replay)

    driver = "chaos_fgs_kill"
    await set_online(driver, lat=6.45, lng=3.4, network_quality="good", session_id="fgs-1")
    # Process death: in-memory hubs gone; Redis presence remains
    heal = await heal_session(driver, role="driver")
    assert heal.get("ok") is True
    snap = await get_presence(driver)
    assert snap and snap.online is True
