"""Redis GEO-first dispatch helpers — unit tests (no live Redis required)."""
from __future__ import annotations

import pytest

from redis_store import _MemStore
from driver_presence import GEO_AVAILABLE_KEY, nearby_available_drivers, set_driver_online


@pytest.mark.asyncio
async def test_memstore_geosearch_nearest_first():
    store = _MemStore()
    await store.geoadd(GEO_AVAILABLE_KEY, 3.3792, 6.5244, "driver_near")
    await store.geoadd(GEO_AVAILABLE_KEY, 3.35, 6.45, "driver_mid")
    await store.geoadd(GEO_AVAILABLE_KEY, 3.0, 7.0, "driver_far")

    rows = await store.geosearch(
        GEO_AVAILABLE_KEY,
        3.3792,
        6.5244,
        radius_m=20_000,
        count=10,
    )
    assert rows
    assert rows[0][0] == "driver_near"
    assert all(rows[i][1] <= rows[i + 1][1] for i in range(len(rows) - 1))


@pytest.mark.asyncio
async def test_memstore_geosearch_respects_radius():
    store = _MemStore()
    await store.geoadd(GEO_AVAILABLE_KEY, 3.3792, 6.5244, "driver_near")
    await store.geoadd(GEO_AVAILABLE_KEY, 3.0, 7.0, "driver_far")

    rows = await store.geosearch(
        GEO_AVAILABLE_KEY,
        3.3792,
        6.5244,
        radius_m=5_000,
        count=10,
    )
    ids = {r[0] for r in rows}
    assert "driver_near" in ids
    assert "driver_far" not in ids


@pytest.mark.asyncio
async def test_nearby_available_drivers_uses_geo(monkeypatch):
    mem = _MemStore()

    monkeypatch.setattr("driver_presence.store.geoadd", mem.geoadd)
    monkeypatch.setattr("driver_presence.store.geosearch", mem.geosearch)
    monkeypatch.setattr("driver_presence.store.set", mem.set)
    monkeypatch.setattr("driver_presence.store.get", mem.get)
    monkeypatch.setattr("driver_presence.store.delete", mem.delete)

    await set_driver_online("d1", lat=6.5244, lng=3.3792)
    await set_driver_online("d2", lat=6.60, lng=3.40)

    hits = await nearby_available_drivers(
        lng=3.3792,
        lat=6.5244,
        radius_m=15_000,
        count=10,
    )
    ids = [h["driver_id"] for h in hits]
    assert "d1" in ids
    assert hits[0]["driver_id"] == "d1"
