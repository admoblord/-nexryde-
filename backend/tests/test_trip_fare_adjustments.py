"""Targeted time billing — pickup wait, traffic excess, route change."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fare_config import PICKUP_FREE_WAIT_SECONDS, ROUTE_CHANGE_FEE_NGN
from trip_fare_adjustments import (
    compute_completion_fare_adjustments,
    compute_mid_trip_route_fare,
    compute_pickup_wait_fee,
    compute_traffic_excess_fee,
)


def test_pickup_wait_free_within_three_minutes():
    now = datetime.now(timezone.utc)
    trip = {
        "status": "ongoing",
        "city": "abuja",
        "service_type": "economy",
        "arrived_at": (now - timedelta(minutes=2)).isoformat(),
        "started_at": now.isoformat(),
        "pickup_free_wait_seconds": PICKUP_FREE_WAIT_SECONDS,
    }
    fee = compute_pickup_wait_fee(trip)
    assert fee["pickup_wait_applied"] is False
    assert fee["pickup_wait_fee"] == 0.0


def test_pickup_wait_billable_after_free_window():
    now = datetime.now(timezone.utc)
    trip = {
        "status": "ongoing",
        "city": "abuja",
        "service_type": "economy",
        "arrived_at": (now - timedelta(minutes=6)).isoformat(),
        "started_at": now.isoformat(),
    }
    fee = compute_pickup_wait_fee(trip)
    assert fee["pickup_wait_applied"] is True
    assert fee["pickup_wait_min"] == 3  # 6 - 3 free = 3 billable minutes
    assert fee["pickup_wait_fee"] == 3 * 60.0


def test_traffic_excess_when_slow_and_late():
    started = datetime.now(timezone.utc) - timedelta(minutes=65)
    completed = datetime.now(timezone.utc)
    trip = {
        "city": "abuja",
        "started_at": started.isoformat(),
        "duration_mins": 20,
        "distance_km": 12.0,
    }
    out = compute_traffic_excess_fee(trip, completed)
    assert out["traffic_excess_applied"] is True
    assert out["traffic_excess_min"] == 30  # 65 - 20 - 15 buffer
    assert out["traffic_excess_fee"] == 30 * 45.0


def test_traffic_excess_skipped_on_short_trip():
    started = datetime.now(timezone.utc) - timedelta(minutes=40)
    trip = {
        "city": "abuja",
        "started_at": started.isoformat(),
        "duration_mins": 10,
        "distance_km": 3.0,
    }
    out = compute_traffic_excess_fee(trip, datetime.now(timezone.utc))
    assert out["traffic_excess_applied"] is False


def test_completion_adds_wait_and_traffic():
    now = datetime.now(timezone.utc)
    trip = {
        "status": "ongoing",
        "fare": 7600.0,
        "booking_fare": 7600.0,
        "city": "abuja",
        "service_type": "economy",
        "arrived_at": (now - timedelta(minutes=8)).isoformat(),
        "started_at": now.isoformat(),
        "duration_mins": 20,
        "distance_km": 10.0,
    }
    adj = compute_completion_fare_adjustments(trip, now)
    assert adj["pickup_wait_fee"] == 5 * 60.0  # 8 - 3 free
    assert adj["traffic_excess_fee"] == 0.0  # trip too short / not enough excess in this window
    assert adj["final_fare"] == 7600 + 300


def test_mid_trip_destination_change_uses_max_plus_fee():
    trip = {"fare": 7600.0, "booking_fare": 7600.0, "city": "abuja"}
    result = compute_mid_trip_route_fare(
        trip,
        update_type="destination",
        target_lat=9.05,
        target_lng=7.49,
        origin_lat=9.04,
        origin_lng=7.48,
        route_distance_km=15.0,
        route_duration_min=25,
        route_traffic_min=25,
        fare_breakdown={"total_fare": 10200.0},
    )
    assert result["route_fare_delta"] == 2600.0
    assert result["route_change_fee"] == float(ROUTE_CHANGE_FEE_NGN)
    assert result["updated_fare"] == 10200.0 + ROUTE_CHANGE_FEE_NGN
