"""Uber-style H3 cell indexing + compact loc expand."""
from __future__ import annotations

import os

import pytest

os.environ.setdefault("JWT_SECRET", "test-h3-uber-secret")
os.environ.setdefault("ALLOW_INSECURE_JWT_FOR_TESTS", "1")
os.environ.setdefault("REDIS_REQUIRED", "false")

from redis_store import _MemStore


@pytest.mark.asyncio
async def test_h3_index_and_kring_nearby():
    h3 = pytest.importorskip("h3")
    from h3_dispatch import cell_for, cell_disk, index_driver_cell, nearby_h3_driver_ids, h3_available

    assert h3_available()
    # Lagos Island-ish
    lat, lng = 6.4541, 3.3947
    cell = cell_for(lat, lng)
    assert cell
    disk = cell_disk(lat, lng, 2)
    assert cell in disk
    assert len(disk) >= 7

    mem = _MemStore()
    await index_driver_cell(mem, "d_near", lat=lat, lng=lng)
    await index_driver_cell(mem, "d_mid", lat=lat + 0.01, lng=lng + 0.01)

    ids = await nearby_h3_driver_ids(mem, lat=lat, lng=lng, k=2, count=10)
    assert "d_near" in ids


@pytest.mark.asyncio
async def test_expand_compact_loc_payload():
    from routers.realtime_dispatch import expand_realtime_payload

    compact = {
        "t": "loc",
        "i": "trip_1",
        "st": "ongoing",
        "la": 6.5,
        "ln": 3.3,
        "h": 90,
        "s": 40,
        "e": 120,
        "d": 1.5,
        "ts": "2026-07-23T00:00:00Z",
        "rv": 3,
        "sq": 3,
    }
    expanded = expand_realtime_payload(compact)
    assert expanded["type"] == "trip_update"
    assert expanded["trip_id"] == "trip_1"
    assert expanded["driver_location"]["lat"] == 6.5
    assert expanded["eta_seconds"] == 120


@pytest.mark.asyncio
async def test_presence_writes_h3_cell(monkeypatch):
    pytest.importorskip("h3")
    from driver_presence import set_driver_online, get_driver_presence, nearby_h3_drivers

    mem = _MemStore()
    monkeypatch.setattr("driver_presence.store", mem)
    monkeypatch.setattr("h3_dispatch.store", mem, raising=False)

    await set_driver_online("drv1", lat=6.4541, lng=3.3947)
    pres = await get_driver_presence("drv1")
    assert pres and pres.get("h3_cell")

    hits = await nearby_h3_drivers(lng=3.3947, lat=6.4541, k=2, count=10)
    assert any(h["driver_id"] == "drv1" for h in hits)
