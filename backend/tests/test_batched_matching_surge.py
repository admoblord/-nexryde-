"""Unit tests for batched matching + surge stream (no Kafka required)."""
from __future__ import annotations

import os

import pytest

from realtime_platform.batched_matching import greedy_assign


def test_greedy_assign_no_driver_double_booked():
    trips = {
        "t1": [
            {"driver_id": "d1", "eta_sec": 120},
            {"driver_id": "d2", "eta_sec": 200},
        ],
        "t2": [
            {"driver_id": "d1", "eta_sec": 90},
            {"driver_id": "d3", "eta_sec": 300},
        ],
    }
    assigned = greedy_assign(trips)
    # d1 is closer to t2 (90) than t1 (120) → t2 gets d1, t1 gets d2
    assert assigned["t2"] == "d1"
    assert assigned["t1"] == "d2"
    assert len(set(assigned.values())) == len(assigned)


def test_greedy_assign_empty():
    assert greedy_assign({}) == {}
    assert greedy_assign({"t1": []}) == {}


def test_batch_matching_flag(monkeypatch):
    from realtime_platform import batched_matching as bm

    monkeypatch.delenv("NEXRYDE_BATCH_MATCHING", raising=False)
    assert bm.batch_matching_enabled() is False
    monkeypatch.setenv("NEXRYDE_BATCH_MATCHING", "true")
    assert bm.batch_matching_enabled() is True


def test_stream_surge_ratio_mapping():
    from realtime_platform.surge_stream import _ratio_to_multiplier

    assert _ratio_to_multiplier(0.2) == 1.0
    assert _ratio_to_multiplier(0.9) == 1.2
    assert _ratio_to_multiplier(2.0) == 1.4


def test_saga_inline_flag(monkeypatch):
    from realtime_platform import saga

    monkeypatch.setenv("NEXRYDE_SAGA_INLINE", "false")
    assert saga._saga_inline() is False
    monkeypatch.setenv("NEXRYDE_SAGA_INLINE", "true")
    assert saga._saga_inline() is True


@pytest.mark.asyncio
async def test_enqueue_noop_when_disabled(monkeypatch):
    from realtime_platform import batched_matching as bm

    monkeypatch.delenv("NEXRYDE_BATCH_MATCHING", raising=False)
    ok = await bm.enqueue_trip_for_batch("trip-1", {})
    assert ok is False
