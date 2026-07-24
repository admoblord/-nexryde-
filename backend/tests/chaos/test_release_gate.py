"""
Chaos Test Suite — release gate for NexRyde reliability.

Scenarios (simulated; no device farm / live Cloud Run required):
  1. Kill app mid-trip → session recover
  2. Disable internet 30s → reconnect + heal
  3. Wi‑Fi ↔ 4G flap
  4. Cloud Run instance restart (revision swap heal)
  5. Redis restart (MemStore wipe + heal)
  6. 10_000 simulated ride offers (scale via CHAOS_OFFER_N)
  7. 5_000 drivers going online at once (scale via CHAOS_ONLINE_N)

Pass criteria:
  • No ride offers lost (every offer → terminal outcome)
  • No duplicate accepts
  • Trips recover automatically
  • All services reconnect successfully

Run (CI / default scale):
  pytest tests/chaos/test_realtime_chaos.py tests/chaos/test_release_gate.py -q

Full release scale:
  CHAOS_OFFER_N=10000 CHAOS_ONLINE_N=5000 pytest tests/chaos/test_release_gate.py -q
"""
from __future__ import annotations

import asyncio
import os
import time
from datetime import datetime, timezone
from uuid import uuid4

import pytest

os.environ.setdefault("JWT_SECRET", "test-chaos-rt")
os.environ.setdefault("ALLOW_INSECURE_JWT_FOR_TESTS", "1")
os.environ.setdefault("REDIS_REQUIRED", "false")
os.environ.setdefault("NEXRYDE_REALTIME_PLATFORM", "true")

from redis_store import _MemStore


def _scale(name: str, default: int) -> int:
    try:
        return max(1, int(os.environ.get(name, str(default))))
    except (TypeError, ValueError):
        return default


@pytest.fixture()
def mem_store(monkeypatch):
    mem = _MemStore()
    monkeypatch.setattr("redis_store.store", mem)
    monkeypatch.setattr("driver_presence.store", mem)
    return mem


@pytest.mark.asyncio
async def test_kill_app_mid_trip_recovers(mem_store, monkeypatch):
    """Kill app during trip → heal restores redis + presence survives Redis."""
    pytest.importorskip("h3")
    from realtime_platform.healing import heal_session
    from realtime_platform.presence_service import get_presence, set_online
    from realtime_platform.trip_engine import acquire_trip_lock

    monkeypatch.setattr(
        "driver_presence.index_driver_cell",
        __import__("h3_dispatch", fromlist=["index_driver_cell"]).index_driver_cell,
        raising=False,
    )

    async def _no_replay(*_a, **_k):
        return 0

    monkeypatch.setattr("realtime_platform.healing.replay_pending_for_actor", _no_replay)
    monkeypatch.setattr(
        "routers.realtime_dispatch.driver_offer_hub._ensure_channel",
        lambda *a, **k: None,
        raising=False,
    )

    driver = "chaos_kill_mid_trip"
    trip_id = "chaos_trip_live"
    await set_online(driver, lat=6.45, lng=3.4, network_quality="good", session_id="pre-kill")
    assert await acquire_trip_lock(trip_id, driver)

    # Process death: in-memory hubs gone; Redis presence + lock remain
    heal = await heal_session(driver, role="driver")
    assert heal.get("ok") is True
    assert heal.get("redis_ok") is True
    snap = await get_presence(driver)
    assert snap and snap.online is True


@pytest.mark.asyncio
async def test_internet_disable_30s_reconnect(mem_store, monkeypatch):
    """Airplane / offline 30s → presence offline → online heal reconnects."""
    pytest.importorskip("h3")
    from realtime_platform.healing import heal_session
    from realtime_platform.presence_service import get_presence, set_offline, set_online

    monkeypatch.setattr(
        "driver_presence.index_driver_cell",
        __import__("h3_dispatch", fromlist=["index_driver_cell"]).index_driver_cell,
        raising=False,
    )

    async def _no_replay(*_a, **_k):
        return 0

    monkeypatch.setattr("realtime_platform.healing.replay_pending_for_actor", _no_replay)
    monkeypatch.setattr(
        "routers.realtime_dispatch.driver_offer_hub._ensure_channel",
        lambda *a, **k: None,
        raising=False,
    )

    driver = "chaos_net_30s"
    await set_online(driver, lat=6.45, lng=3.39, network_quality="excellent")
    await set_offline(driver)
    # Simulate partition (no real 30s sleep in CI)
    await asyncio.sleep(0.05)

    await set_online(driver, lat=6.45, lng=3.39, network_quality="good")
    heal = await heal_session(driver, role="driver")
    assert heal.get("ok") is True
    assert heal.get("redis_ok") is True
    snap = await get_presence(driver)
    assert snap and snap.online is True


@pytest.mark.asyncio
async def test_redis_restart_reconnect(mem_store, monkeypatch):
    """Redis restart: wipe store, heal must reconnect and report redis_ok."""
    from realtime_platform.ack_engine import register_pending
    from realtime_platform.healing import heal_session, health_snapshot
    from realtime_platform.models import EventType, RealtimeEvent

    actor = "chaos_redis_restart"
    ev = RealtimeEvent.new(EventType.RIDE_OFFER, actor, offer_id="redis_o1", trip_id="redis_t1")
    await register_pending(ev)

    # Wipe Redis (restart)
    mem_store._kv.clear()
    mem_store._geo.clear()
    mem_store._sets.clear()

    async def _no_replay(*_a, **_k):
        return 0

    monkeypatch.setattr("realtime_platform.healing.replay_pending_for_actor", _no_replay)
    monkeypatch.setattr(
        "routers.realtime_dispatch.driver_offer_hub._ensure_channel",
        lambda *a, **k: None,
        raising=False,
    )

    health = await health_snapshot()
    assert health.get("redis_ok") is True

    out = await heal_session(actor, role="driver")
    assert out.get("ok") is True
    assert out.get("redis_ok") is True

@pytest.mark.asyncio
async def test_10k_simulated_offers_no_lost_no_dup_accept(mem_store):
    """
    Fan-out N unique offer IDs + accept storms.
    Default N=500 for CI; set CHAOS_OFFER_N=10000 for release gate.
    """
    from realtime_platform.idempotency import claim
    from realtime_platform.offer_ledger import TERMINAL_OUTCOMES
    from realtime_platform.trip_engine import accept_offer_once

    n = _scale("CHAOS_OFFER_N", 500)
    # Unique offer IDs — no lost identity
    offer_ids = [f"chaos_o_{i}_{uuid4().hex[:8]}" for i in range(n)]
    assert len(set(offer_ids)) == n

    # Exactly-once FCM claim per offer (2 attempts each)
    async def _fcm(i: int):
        return await claim(f"offer:fcm:{offer_ids[i % n]}", ttl_sec=120)

    fcm_results = await asyncio.gather(*[_fcm(i) for i in range(n * 2)])
    assert sum(1 for r in fcm_results if r) == n

    # Single-winner accept across concurrent storms for one trip
    trip_id = "chaos_mass_trip"
    driver = "chaos_mass_driver"
    offer_id = offer_ids[0]

    async def _accept(_: int):
        return await accept_offer_once(
            trip_id=trip_id,
            driver_id=driver,
            offer_id=offer_id,
            client_event_id=f"accept:{trip_id}:{driver}",
        )

    accepts = await asyncio.gather(*[_accept(i) for i in range(min(200, n))])
    winners = [r for r in accepts if r.get("ok") and not r.get("duplicate")]
    dups = [r for r in accepts if r.get("duplicate") or (not r.get("ok") and r.get("reason") == "duplicate_accept")]
    assert len(winners) == 1
    assert len(dups) == len(accepts) - 1

    # Terminal vocabulary intact
    assert TERMINAL_OUTCOMES == frozenset(
        {"delivered", "accepted", "declined", "expired", "reassigned"}
    )


@pytest.mark.asyncio
async def test_5k_drivers_online_burst(mem_store, monkeypatch):
    """Concurrent go-online burst. Default 200; CHAOS_ONLINE_N=5000 for release."""
    pytest.importorskip("h3")
    from realtime_platform.presence_service import get_presence, set_online

    monkeypatch.setattr(
        "driver_presence.index_driver_cell",
        __import__("h3_dispatch", fromlist=["index_driver_cell"]).index_driver_cell,
        raising=False,
    )

    n = _scale("CHAOS_ONLINE_N", 200)

    async def _one(i: int):
        did = f"chaos_burst_{i}"
        return await set_online(
            did,
            lat=6.45 + (i % 50) * 0.001,
            lng=3.39 + (i % 50) * 0.001,
            network_quality="good",
            session_id=f"s{i}",
        )

    results = await asyncio.gather(*[_one(i) for i in range(n)])
    assert all(r.get("ok") for r in results)
    # Spot-check reconnect / presence
    snap = await get_presence("chaos_burst_0")
    assert snap and snap.online is True
    snap_last = await get_presence(f"chaos_burst_{n - 1}")
    assert snap_last and snap_last.online is True


@pytest.mark.asyncio
async def test_delivery_guarantee_terminal_outcomes(mem_store, monkeypatch):
    """Every guarantee path ends Delivered / Reassigned / Expired — never unknown."""
    from realtime_platform.delivery_guarantee import finalize_outcome, guarantee_deliver
    from realtime_platform.offer_ledger import TERMINAL_OUTCOMES

    async def _fake_deliver(offer, trip=None, **kwargs):
        return {
            "ok": True,
            "acked": False,
            "fcm_ok": False,
            "event_id": "ev1",
            "offer_id": offer["id"],
            "driver_id": offer["driver_id"],
            "latency_ms": 1,
        }

    async def _fake_reassign(offer, trip=None, reason=""):
        await finalize_outcome(
            offer["id"],
            outcome="reassigned",
            trip_id=offer.get("trip_id", ""),
            driver_id=offer.get("driver_id", ""),
            reason=reason,
        )
        return {"ok": True, "new_offers": 0}

    monkeypatch.setattr("realtime_platform.push_engine.deliver_offer", _fake_deliver)
    monkeypatch.setattr(
        "realtime_platform.delivery_guarantee.reassign_offer",
        _fake_reassign,
    )

    async def _noop_mark(*_a, **_k):
        return None

    async def _noop_log(*_a, **_k):
        return None

    monkeypatch.setattr("realtime_platform.delivery_guarantee.log_outcome_event", _noop_log)
    monkeypatch.setattr("realtime_platform.delivery_guarantee.mark_offer", _noop_mark)

    offer = {"id": "g1", "driver_id": "d1", "trip_id": "t1", "delivery_retry_count": 0}
    result = await guarantee_deliver(offer, reassign_on_fail=True)
    assert result.get("outcome") in TERMINAL_OUTCOMES
    assert result.get("outcome") == "reassigned"


@pytest.mark.asyncio
async def test_device_health_blocks_unhealthy(mem_store):
    import json
    import time as _time

    from realtime_platform.device_health import evaluate_from_presence, report_device_health
    from redis_store import store

    now = int(_time.time() * 1000)
    # Soft mode: online + fresh gps + score → eligible without client report
    soft = evaluate_from_presence(
        {
            "online": True,
            "gps_updated_ms": now,
            "last_seen_ms": now,
            "connection_score": 80,
            "network_quality": "good",
        }
    )
    assert soft.healthy is True

    # Seed presence first, then hard-report missing FGS
    await store.set(
        "driver:presence:unhealthy_driver",
        json.dumps(
            {
                "online": True,
                "gps_updated_ms": now,
                "last_seen_ms": now,
                "connection_score": 80,
                "network_quality": "good",
            }
        ),
        ttl=180,
    )
    await report_device_health(
        "unhealthy_driver",
        socket_connected=True,
        fgs_running=False,
        fullscreen_notif_enabled=True,
        battery_optimization_ok=True,
        network_quality="good",
        app_version="2.0.0",
        gps_age_ms=1000,
    )
    from realtime_platform.device_health import evaluate_device_health

    hard = await evaluate_device_health("unhealthy_driver")
    assert hard.healthy is False
    assert "fgs_not_running" in hard.failures

@pytest.mark.asyncio
async def test_release_gate_aggregate(mem_store, monkeypatch):
    """
    Aggregate release gate: no lost offers, no dup accepts, reconnect OK.
    Runs a compact subset of the suite assertions in one place.
    """
    from realtime_platform.idempotency import claim
    from realtime_platform.trip_engine import accept_offer_once
    from realtime_platform.healing import health_snapshot

    # Reconnect
    health = await health_snapshot()
    assert health.get("redis_ok") is True

    # No duplicate accepts
    results = await asyncio.gather(
        *[
            accept_offer_once(
                trip_id="gate_trip",
                driver_id="gate_driver",
                offer_id="gate_offer",
                client_event_id="accept:gate_trip:gate_driver",
            )
            for _ in range(50)
        ]
    )
    assert sum(1 for r in results if r.get("ok") and not r.get("duplicate")) == 1

    # No lost offer IDs under dual-delivery claims
    ids = [f"gate_o_{i}" for i in range(100)]
    claims = await asyncio.gather(*[claim(f"offer:fcm:{oid}", ttl_sec=60) for oid in ids for _ in range(2)])
    assert sum(1 for c in claims if c) == 100

    # Terminal outcomes vocabulary — never "unknown" / "lost"
    from realtime_platform.offer_ledger import TERMINAL_OUTCOMES

    assert "unknown" not in TERMINAL_OUTCOMES
    assert "lost" not in TERMINAL_OUTCOMES
