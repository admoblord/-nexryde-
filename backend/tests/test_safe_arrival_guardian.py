"""Safe-arrival escalation must run on a timer, not only when a client asks.

The rider is pushed "Confirm Safe Arrival — NEXRYDE will check in automatically
if you do not respond". Escalation used to live only inside GET /trips/{id},
so for a rider who never opens the app — precisely the person at risk — nothing
ever ran. These tests pin the guardian's query so that regression cannot return.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from realtime_platform.safe_arrival_guardian import (
    LOOKBACK_HOURS,
    run_safe_arrival_guardian,
)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


class FakeCursor:
    def __init__(self, rows):
        self._rows = rows

    def limit(self, n):
        self._rows = self._rows[:n]
        return self

    async def to_list(self, n):
        return self._rows[:n]


class FakeTrips:
    """Captures the query so the selection rules can be asserted directly."""

    def __init__(self, rows=None):
        self.rows = rows or []
        self.last_query = None

    def find(self, query, projection=None):
        self.last_query = query
        return FakeCursor(list(self.rows))


class FakeDB:
    def __init__(self, rows=None):
        self.trips = FakeTrips(rows)


@pytest.fixture
def guardian_env(monkeypatch):
    """Stub the DB and the escalation step so only guardian logic is exercised."""
    import database
    import routers.trips as trips_module

    db = FakeDB()
    monkeypatch.setattr(database, "db", db, raising=False)

    processed: list[str] = []
    outcomes: dict[str, str] = {}

    async def fake_process(trip):
        processed.append(trip["id"])
        status = outcomes.get(trip["id"], "call_attempted")
        return {**trip, "safe_arrival_check": {**trip.get("safe_arrival_check", {}), "check_in_status": status}}

    monkeypatch.setattr(trips_module, "_maybe_process_safe_arrival_check", fake_process, raising=False)
    return db, processed, outcomes


@pytest.mark.asyncio
async def test_query_selects_only_overdue_unconfirmed_checks(guardian_env):
    db, _, _ = guardian_env
    await run_safe_arrival_guardian()
    q = db.trips.last_query

    assert q["safe_arrival_check.required"] is True
    # A rider who confirmed, or whose contacts were already texted, is done.
    assert q["safe_arrival_check.confirmed_at"] is None
    assert q["safe_arrival_check.emergency_notified_at"] is None
    # Only trips whose deadline has actually passed.
    assert "$lte" in q["safe_arrival_check.confirm_deadline_at"]
    # Only trips a driver has ended.
    assert set(q["status"]["$in"]) == {"completed", "pending_payment"}


@pytest.mark.asyncio
async def test_query_is_bounded_to_a_recent_window(guardian_env):
    """Runs every ~20s — it must not scan the whole trips collection."""
    db, _, _ = guardian_env
    await run_safe_arrival_guardian()
    q = db.trips.last_query

    cutoff = datetime.fromisoformat(q["safe_arrival_check.trip_completed_at"]["$gte"])
    age_hours = (datetime.now(timezone.utc) - cutoff).total_seconds() / 3600
    assert LOOKBACK_HOURS - 0.1 <= age_hours <= LOOKBACK_HOURS + 0.1


@pytest.mark.asyncio
async def test_escalates_every_overdue_trip_and_counts_outcomes(guardian_env):
    db, processed, outcomes = guardian_env
    now = datetime.now(timezone.utc)
    overdue = {
        "required": True,
        "confirmed_at": None,
        "emergency_notified_at": None,
        "confirm_deadline_at": _iso(now - timedelta(minutes=1)),
        "trip_completed_at": _iso(now - timedelta(minutes=6)),
    }
    db.trips.rows = [
        {"id": "trip-a", "status": "completed", "safe_arrival_check": dict(overdue)},
        {"id": "trip-b", "status": "completed", "safe_arrival_check": dict(overdue)},
    ]
    outcomes["trip-b"] = "emergency_notified"

    result = await run_safe_arrival_guardian()

    assert processed == ["trip-a", "trip-b"]
    assert result == {"checked": 2, "check_ins_sent": 1, "escalated": 1}


@pytest.mark.asyncio
async def test_one_bad_trip_does_not_strand_the_rest(guardian_env, monkeypatch):
    """A single failure must not stop other riders from being checked on."""
    import routers.trips as trips_module

    db, _, _ = guardian_env
    now = datetime.now(timezone.utc)
    check = {
        "required": True,
        "confirmed_at": None,
        "emergency_notified_at": None,
        "confirm_deadline_at": _iso(now - timedelta(minutes=1)),
        "trip_completed_at": _iso(now - timedelta(minutes=6)),
    }
    db.trips.rows = [
        {"id": "boom", "status": "completed", "safe_arrival_check": dict(check)},
        {"id": "ok", "status": "completed", "safe_arrival_check": dict(check)},
    ]

    seen: list[str] = []

    async def flaky(trip):
        seen.append(trip["id"])
        if trip["id"] == "boom":
            raise RuntimeError("sms provider down")
        return {**trip, "safe_arrival_check": {"check_in_status": "emergency_notified"}}

    monkeypatch.setattr(trips_module, "_maybe_process_safe_arrival_check", flaky, raising=False)

    result = await run_safe_arrival_guardian()

    assert seen == ["boom", "ok"]
    assert result["escalated"] == 1


@pytest.mark.asyncio
async def test_guardian_is_wired_into_the_always_on_loop():
    """Escalation is only real if the loop actually calls it."""
    import inspect

    from realtime_platform import guardians_worker

    source = inspect.getsource(guardians_worker.run_all_guardians)
    assert "run_safe_arrival_guardian" in source
