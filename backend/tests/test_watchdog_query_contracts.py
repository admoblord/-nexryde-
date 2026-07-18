"""Contracts for production watchdogs / poll path that previously silently failed."""
from __future__ import annotations

import ast
import inspect
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_rider_poll_route_is_not_double_api_prefixed():
    from routers.realtime_dispatch import realtime_dispatch_router

    paths = [getattr(r, "path", "") for r in realtime_dispatch_router.routes]
    assert "/api/trips/poll/{rider_id}" in paths
    assert "/api/api/trips/poll/{rider_id}" not in paths


def test_subscription_watchdog_queries_end_date_not_expires_at():
    src = (ROOT / "server.py").read_text(encoding="utf-8")
    # Locate the watchdog function body via simple markers.
    start = src.index("async def _subscription_expiry_watchdog_loop")
    end = src.index("async def _engagement_push_loop", start)
    body = src[start:end]
    assert '"end_date"' in body
    assert '"expires_at"' not in body
    assert "set_driver_offline" in body


def test_stranded_trip_cleanup_compares_datetime_created_at():
    src = (ROOT / "server.py").read_text(encoding="utf-8")
    start = src.index("async def _stranded_trip_cleanup_loop")
    end = src.index("async def _subscription_expiry_watchdog_loop", start)
    body = src[start:end]
    assert '{"created_at": {"$lt": cutoff}}' in body or '"$lt": cutoff}' in body
    # Must not rely only on ISO string cutoff (Date never matches).
    assert "cutoff.isoformat()" in body  # legacy string branch OK alongside datetime
    assert '"$or"' in body


def test_go_online_seeds_last_heartbeat():
    src = (ROOT / "routers" / "drivers.py").read_text(encoding="utf-8")
    assert 'profile_online_update["$set"]["last_heartbeat"]' in src
