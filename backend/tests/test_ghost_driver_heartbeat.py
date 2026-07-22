"""Ghost-driver heartbeat freshness (audit 5.6)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

from routers.driver_control import (
    IDLE_TIMEOUT_MINUTES,
    driver_heartbeat_is_fresh,
    heartbeat_fresh_cutoff,
    heartbeat_freshness_mongo_clause,
)


ROOT = Path(__file__).resolve().parents[1]


def test_idle_timeout_aligned_with_redis_presence_ttl():
    # Redis PRESENCE_TTL_SEC = 180; Mongo must not keep ghosts longer.
    assert IDLE_TIMEOUT_MINUTES == 3


def test_driver_heartbeat_is_fresh_accepts_recent_datetime_and_iso():
    now = datetime(2026, 7, 22, 12, 0, 0, tzinfo=timezone.utc)
    fresh_dt = now - timedelta(minutes=1)
    assert driver_heartbeat_is_fresh({"last_heartbeat": fresh_dt}, now=now)
    assert driver_heartbeat_is_fresh({"last_heartbeat": fresh_dt.isoformat()}, now=now)


def test_driver_heartbeat_is_fresh_rejects_stale_and_missing():
    now = datetime(2026, 7, 22, 12, 0, 0, tzinfo=timezone.utc)
    stale = now - timedelta(minutes=IDLE_TIMEOUT_MINUTES + 1)
    assert not driver_heartbeat_is_fresh({"last_heartbeat": stale}, now=now)
    assert not driver_heartbeat_is_fresh({"last_heartbeat": stale.isoformat()}, now=now)
    assert not driver_heartbeat_is_fresh({}, now=now)
    assert not driver_heartbeat_is_fresh({"last_heartbeat": "not-a-date"}, now=now)


def test_heartbeat_freshness_mongo_clause_uses_cutoff():
    now = datetime(2026, 7, 22, 12, 0, 0, tzinfo=timezone.utc)
    clause = heartbeat_freshness_mongo_clause(now)
    cutoff = heartbeat_fresh_cutoff(now)
    assert clause == {
        "$or": [
            {"last_heartbeat": {"$gte": cutoff}},
            {"last_heartbeat": {"$gte": cutoff.isoformat()}},
        ]
    }


def test_watchdog_uses_shared_idle_timeout_and_one_minute_tick():
    src = (ROOT / "server.py").read_text(encoding="utf-8")
    start = src.index("async def _driver_heartbeat_watchdog_loop")
    end = src.index("async def _stranded_trip_cleanup_loop", start)
    body = src[start:end]
    assert "IDLE_TIMEOUT_MINUTES" in body
    assert "timedelta(minutes=15)" not in body
    assert "await asyncio.sleep(60)" in body
    assert "await asyncio.sleep(180)" not in body


def test_dispatch_requires_fresh_heartbeat():
    src = (ROOT / "routers" / "trips.py").read_text(encoding="utf-8")
    assert "heartbeat_freshness_mongo_clause" in src
    assert "driver_heartbeat_is_fresh" in src
