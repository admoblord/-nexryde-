"""Cross-instance rider poll cache — Redis key poll:{user_id}."""
from __future__ import annotations

import json
import os

import pytest

# Must be set before importing routers.realtime_dispatch → security_advanced.
os.environ.setdefault("JWT_SECRET", "test-poll-cache-secret")
os.environ.setdefault("ALLOW_INSECURE_JWT_FOR_TESTS", "1")
os.environ.setdefault("REDIS_REQUIRED", "false")

from redis_store import _MemStore


@pytest.mark.asyncio
async def test_poll_cache_roundtrip_via_redis(monkeypatch):
    from routers import realtime_dispatch as rd

    mem = _MemStore()
    monkeypatch.setattr("redis_store.store", mem)
    monkeypatch.setattr(rd, "_poll_cache_local", {})

    payload = {"type": "trip_update", "status": "accepted", "trip_id": "t1"}
    await rd._cache_poll_message("rider_a", payload)

    raw = await mem.get("poll:rider_a")
    assert raw
    assert json.loads(raw)["status"] == "accepted"

    got = await rd._get_poll_message("rider_a")
    assert got is not None
    assert got["trip_id"] == "t1"


@pytest.mark.asyncio
async def test_poll_cache_falls_back_to_local(monkeypatch):
    from routers import realtime_dispatch as rd

    class Boom:
        async def set(self, *a, **k):
            raise RuntimeError("redis down")

        async def get(self, *a, **k):
            raise RuntimeError("redis down")

    monkeypatch.setattr("redis_store.store", Boom())
    local = {}
    monkeypatch.setattr(rd, "_poll_cache_local", local)

    await rd._cache_poll_message("rider_b", {"type": "x", "n": 1})
    assert local.get("rider_b", {}).get("n") == 1
    got = await rd._get_poll_message("rider_b")
    assert got and got["n"] == 1


@pytest.mark.asyncio
async def test_gps_throttle_set_nx_semantics():
    """Cluster GPS throttle relies on store.set_nx (not nonexistent _redis_client)."""
    mem = _MemStore()
    key = "gps:lw:trip_1"
    assert await mem.set_nx(key, "1", ttl=3) is True
    assert await mem.set_nx(key, "1", ttl=3) is False
