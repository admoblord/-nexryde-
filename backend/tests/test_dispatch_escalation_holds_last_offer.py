"""Escalation must not strand a trip when no other driver can take it.

`_escalate_expired_offers` expires the open wave and adds those drivers to the
trip's `blocked_drivers` before redispatching. With a small online pool — often a
single driver in a launch city — that left the rider stranded: accept returned
403 "Trip offer expired or unavailable for this driver" while the offer still
looked live on the driver's screen (offers carry a 5 minute `expires_at`, the
guardian escalates after 45s), and the redispatch had nobody left to ask.
"""
from __future__ import annotations

import pytest


class _FakeCursor:
    def __init__(self, rows):
        self._rows = rows

    def limit(self, _n):
        return self

    async def to_list(self, _n):
        return list(self._rows)


class _FakeCollection:
    def __init__(self, rows=None):
        self.rows = rows or []
        self.update_many_calls = []
        self.update_one_calls = []

    def find(self, *_a, **_k):
        return _FakeCursor(self.rows)

    async def find_one(self, *_a, **_k):
        return self.rows[0] if self.rows else None

    async def update_many(self, flt, update):
        self.update_many_calls.append((flt, update))

    async def update_one(self, flt, update):
        self.update_one_calls.append((flt, update))


class _FakeDb:
    def __init__(self, trips, offers):
        self.trips = _FakeCollection(trips)
        self.trip_offers = _FakeCollection(offers)


TRIP = {"id": "trip-1", "rider_id": "rider-1", "blocked_drivers": []}
# created_at far in the past so the offer is past OFFER_ESCALATE_SEC
STALE_OFFER = {"id": "offer-1", "driver_id": "driver-1", "created_at": "2000-01-01T00:00:00+00:00"}


@pytest.mark.asyncio
async def test_escalation_holds_offer_when_no_other_driver(monkeypatch):
    import database
    from realtime_platform import dispatch_guardian as dg
    from routers import trips as trips_router

    db = _FakeDb([dict(TRIP)], [dict(STALE_OFFER)])
    monkeypatch.setattr(database, "db", db)

    async def _no_fresh_drivers(_trip, _blocked):
        return []

    created = []

    async def _create(trip, blocked):
        created.append((trip, blocked))
        return []

    monkeypatch.setattr(trips_router, "_get_eligible_drivers_for_trip", _no_fresh_drivers)
    monkeypatch.setattr(trips_router, "_create_trip_offers", _create)

    escalated = await dg._escalate_expired_offers()

    assert escalated == 0
    # The willing driver keeps an acceptable offer and is not blocked.
    assert db.trip_offers.update_many_calls == []
    assert db.trips.update_one_calls == []
    assert created == []


@pytest.mark.asyncio
async def test_escalation_rotates_when_another_driver_exists(monkeypatch):
    import database
    from realtime_platform import dispatch_guardian as dg
    from routers import trips as trips_router

    db = _FakeDb([dict(TRIP)], [dict(STALE_OFFER)])
    monkeypatch.setattr(database, "db", db)

    async def _fresh_driver(_trip, _blocked):
        return [{"user_id": "driver-2"}]

    created = []

    async def _create(trip, blocked):
        created.append((trip, blocked))
        return [{"id": "offer-2", "driver_id": "driver-2"}]

    monkeypatch.setattr(trips_router, "_get_eligible_drivers_for_trip", _fresh_driver)
    monkeypatch.setattr(trips_router, "_create_trip_offers", _create)

    escalated = await dg._escalate_expired_offers()

    assert escalated == 1
    assert db.trip_offers.update_many_calls, "stale wave should be expired"
    assert created and "driver-1" in created[0][1], "slow driver is blocked for the next wave"


@pytest.mark.asyncio
async def test_sweep_holds_offer_while_driver_window_open(monkeypatch):
    """The 45s ledger sweep must not close an offer the driver can still accept."""
    from datetime import datetime, timedelta, timezone

    from realtime_platform import delivery_guarantee as dgu

    future = (datetime.now(timezone.utc) + timedelta(minutes=4)).isoformat()
    past = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    open_offer = {"id": "offer-open", "trip_id": "trip-1", "driver_id": "driver-1", "expires_at": future}
    lapsed_offer = {"id": "offer-lapsed", "trip_id": "trip-2", "driver_id": "driver-1", "expires_at": past}

    db = _FakeDb([], [open_offer, lapsed_offer])
    import database

    monkeypatch.setattr(database, "db", db)

    async def _no_reassign(*_a, **_k):
        return {"ok": False, "reason": "no_candidate"}

    finalized = []

    async def _finalize(offer_id, **kw):
        finalized.append(offer_id)
        return {"ok": True}

    monkeypatch.setattr(dgu, "reassign_offer", _no_reassign)
    monkeypatch.setattr(dgu, "finalize_outcome", _finalize)

    await dgu.sweep_unknown_offers(older_than_sec=45)

    assert "offer-open" not in finalized, "still-valid offer must stay acceptable"
    assert "offer-lapsed" in finalized, "offer past its own window should close"
