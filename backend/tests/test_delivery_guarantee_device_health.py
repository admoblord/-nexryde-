"""Unit tests — Delivery Guarantee + Device Health engines."""
from __future__ import annotations

import os
import time

import pytest

os.environ.setdefault("JWT_SECRET", "test-dge")
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


def test_version_supported():
    from realtime_platform.device_health import version_supported

    assert version_supported("1.2.3", minimum="1.0.0") is True
    assert version_supported("0.9.0", minimum="1.0.0") is False
    assert version_supported("", minimum="1.0.0") is True  # unknown allowed


def test_outcome_for_status():
    from realtime_platform.offer_ledger import TERMINAL_OUTCOMES, outcome_for_status

    assert outcome_for_status("delivered_acked") == "delivered"
    assert outcome_for_status("accepted") == "accepted"
    assert outcome_for_status("pending") is None
    assert outcome_for_status("socket_sent") is None
    assert TERMINAL_OUTCOMES == frozenset(
        {"delivered", "accepted", "declined", "expired", "reassigned"}
    )


@pytest.mark.asyncio
async def test_finalize_outcome_logs(mem_store, monkeypatch):
    from realtime_platform.delivery_guarantee import finalize_outcome

    writes = []

    class _Coll:
        async def update_one(self, *_a, **_k):
            return None

        async def insert_one(self, doc):
            writes.append(doc)

    class _Db:
        trip_offers = _Coll()
        offer_delivery_outcomes = _Coll()

    monkeypatch.setattr("database.db", _Db(), raising=False)

    out = await finalize_outcome(
        "offer_x",
        outcome="declined",
        trip_id="t1",
        driver_id="d1",
        reason="unit",
    )
    assert out["outcome"] == "declined"
    assert any(w.get("outcome") == "declined" for w in writes)


@pytest.mark.asyncio
async def test_device_health_soft_vs_hard(mem_store):
    import json

    from realtime_platform.device_health import evaluate_from_presence, report_device_health

    now = int(time.time() * 1000)
    soft = evaluate_from_presence(
        {
            "online": True,
            "gps_updated_ms": now,
            "last_seen_ms": now,
            "connection_score": 70,
            "network_quality": "good",
        }
    )
    assert soft.healthy

    await report_device_health(
        "drv_hard",
        socket_connected=True,
        fgs_running=True,
        fullscreen_notif_enabled=True,
        battery_optimization_ok=True,
        network_quality="good",
        app_version="1.5.0",
        gps_age_ms=500,
    )
    from redis_store import store

    raw = await store.get("driver:presence:drv_hard")
    assert raw
    pres = json.loads(raw)
    pres.update(
        {
            "online": True,
            "gps_updated_ms": now,
            "last_seen_ms": now,
            "connection_score": 70,
            "network_quality": "good",
        }
    )
    await store.set("driver:presence:drv_hard", json.dumps(pres), ttl=180)
    hard = evaluate_from_presence(pres)
    assert hard.healthy is True

    # Break battery
    await report_device_health("drv_hard", battery_optimization_ok=False)
    raw2 = await store.get("driver:presence:drv_hard")
    pres2 = json.loads(raw2)
    pres2.update(
        {
            "online": True,
            "gps_updated_ms": now,
            "last_seen_ms": now,
            "connection_score": 70,
        }
    )
    broken = evaluate_from_presence(pres2)
    assert broken.healthy is False
    assert "battery_optimization" in broken.failures
