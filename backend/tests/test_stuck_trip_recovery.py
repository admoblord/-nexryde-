"""Unit tests for stuck_trip_recovery (audit 5.3) using in-memory fakes."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from stuck_trip_recovery import (
    admin_force_complete_trip,
    recover_stale_active_trips,
)


class UpdateResult:
    def __init__(self, modified_count: int) -> None:
        self.modified_count = modified_count


def _match(doc: dict, query: dict) -> bool:
    for key, cond in query.items():
        if key == "$or":
            if not any(_match(doc, sub) for sub in cond):
                return False
            continue
        val = doc.get(key)
        if isinstance(cond, dict):
            for op, arg in cond.items():
                if op == "$lt":
                    if val is None or type(val) is not type(arg):
                        return False
                    if not (val < arg):
                        return False
                elif op == "$exists":
                    if bool(key in doc) != bool(arg):
                        return False
                elif op == "$in":
                    if val not in arg:
                        return False
                elif op == "$nin":
                    if val in arg:
                        return False
                else:
                    return False
        else:
            if val != cond:
                return False
    return True


class FakeCollection:
    def __init__(self, rows: list[dict]):
        self.rows = rows

    def find(self, query: dict, projection=None):
        matched = [dict(r) for r in self.rows if _match(r, query)]

        class Cursor:
            async def to_list(self_inner, n):
                return matched[:n]

        return Cursor()

    async def find_one(self, query: dict, projection=None):
        for r in self.rows:
            if _match(r, query):
                return dict(r)
        return None

    async def update_one(self, query: dict, update: dict):
        for r in self.rows:
            if _match(r, query):
                for k, v in (update.get("$set") or {}).items():
                    r[k] = v
                for k, v in (update.get("$inc") or {}).items():
                    r[k] = r.get(k, 0) + v
                for k in (update.get("$unset") or {}):
                    r.pop(k, None)
                return UpdateResult(1)
        return UpdateResult(0)

    async def insert_one(self, doc: dict):
        self.rows.append(dict(doc))


class FakeDB:
    def __init__(self, trips, driver_profiles, holds=None):
        self.trips = FakeCollection(trips)
        self.driver_profiles = FakeCollection(driver_profiles)
        self.trip_events = FakeCollection([])
        self.wallet_holds = FakeCollection(holds or [])
        self.users = FakeCollection([])
        self.transactions = FakeCollection([])


def _old_iso(hours: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()


def test_stale_accepted_trip_is_cancelled_and_driver_unlocked():
    trips = [
        {
            "id": "t1",
            "status": "accepted",
            "accepted_at": _old_iso(2),
            "created_at": _old_iso(2.5),
            "rider_id": "r1",
            "driver_id": "d1",
        }
    ]
    profiles = [{"user_id": "d1", "active_trip_id": "t1"}]
    db = FakeDB(trips, profiles)
    counts = asyncio.run(recover_stale_active_trips(db))
    assert counts["accepted_cancelled"] == 1
    assert db.trips.rows[0]["status"] == "cancelled"
    assert "active_trip_id" not in db.driver_profiles.rows[0]


def test_fresh_accepted_trip_untouched():
    trips = [
        {
            "id": "t1",
            "status": "accepted",
            "accepted_at": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "rider_id": "r1",
            "driver_id": "d1",
        }
    ]
    db = FakeDB(trips, [{"user_id": "d1", "active_trip_id": "t1"}])
    counts = asyncio.run(recover_stale_active_trips(db))
    assert counts["accepted_cancelled"] == 0
    assert db.trips.rows[0]["status"] == "accepted"
    assert db.driver_profiles.rows[0]["active_trip_id"] == "t1"


def test_stale_ongoing_trip_is_force_completed():
    trips = [
        {
            "id": "t2",
            "status": "ongoing",
            "started_at": _old_iso(8),
            "created_at": _old_iso(9),
            "rider_id": "r1",
            "driver_id": "d1",
        }
    ]
    db = FakeDB(trips, [{"user_id": "d1", "active_trip_id": "t2"}])
    counts = asyncio.run(recover_stale_active_trips(db))
    assert counts["ongoing_completed"] == 1
    assert db.trips.rows[0]["status"] == "completed"
    assert db.trips.rows[0]["payment_status"] == "completed"
    assert "active_trip_id" not in db.driver_profiles.rows[0]


def test_dangling_driver_lock_on_terminal_trip_is_cleared():
    trips = [{"id": "t3", "status": "completed", "created_at": _old_iso(1)}]
    profiles = [{"user_id": "d9", "active_trip_id": "t3"}]
    db = FakeDB(trips, profiles)
    counts = asyncio.run(recover_stale_active_trips(db))
    assert counts.get("driver_locks_cleared") == 1
    assert "active_trip_id" not in db.driver_profiles.rows[0]


def test_admin_force_complete_clears_lock():
    trips = [
        {
            "id": "t4",
            "status": "arrived",
            "arrived_at": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "rider_id": "r1",
            "driver_id": "d1",
        }
    ]
    db = FakeDB(trips, [{"user_id": "d1", "active_trip_id": "t4"}])
    result = asyncio.run(admin_force_complete_trip(db, "t4", admin_email="ops@nexryde.com", note="phone died"))
    assert result["success"] is True
    assert db.trips.rows[0]["status"] == "completed"
    assert db.trips.rows[0]["force_completed"] is True
    assert "active_trip_id" not in db.driver_profiles.rows[0]


def test_admin_force_complete_rejects_pending_trip():
    trips = [{"id": "t5", "status": "pending", "created_at": _old_iso(0.1)}]
    db = FakeDB(trips, [])
    result = asyncio.run(admin_force_complete_trip(db, "t5", admin_email="ops@nexryde.com"))
    assert result["success"] is False


def test_admin_force_complete_missing_trip():
    db = FakeDB([], [])
    result = asyncio.run(admin_force_complete_trip(db, "nope", admin_email="ops@nexryde.com"))
    assert result["success"] is False
