"""Pickup complimentary wait window (Bolt-style)."""
from datetime import datetime, timedelta

from services.trip_tracking_service import compute_pickup_wait_payload, PICKUP_FREE_WAIT_SECONDS


def test_pickup_wait_free_phase():
    trip = {
        "status": "arrived",
        "arrived_at": (datetime.utcnow() - timedelta(seconds=60)).isoformat(),
        "pickup_free_wait_seconds": PICKUP_FREE_WAIT_SECONDS,
    }
    payload = compute_pickup_wait_payload(trip)
    assert payload["wait_phase"] == "free"
    assert payload["free_wait_remaining_sec"] == PICKUP_FREE_WAIT_SECONDS - 60
    assert payload["billable_wait_sec"] == 0


def test_pickup_wait_billable_phase():
    trip = {
        "status": "arrived",
        "arrived_at": (datetime.utcnow() - timedelta(seconds=PICKUP_FREE_WAIT_SECONDS + 30)).isoformat(),
    }
    payload = compute_pickup_wait_payload(trip)
    assert payload["wait_phase"] == "billable"
    assert payload["free_wait_remaining_sec"] == 0
    assert payload["billable_wait_sec"] >= 30
