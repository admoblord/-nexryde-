"""Unit tests: local polyline ETA + maps billing guardrails."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from maps_billing import can_reroute, REROUTE_MAX_PER_TRIP
from polyline_eta import (
    eta_seconds_from_route,
    nearest_on_polyline,
    path_length_m,
    remaining_distance_m,
)


def test_remaining_distance_mid_route():
    # Simple northbound line ~1km (approx)
    coords = [(6.50, 3.35), (6.51, 3.35), (6.52, 3.35)]
    total = path_length_m(coords)
    assert total > 1500
    # Point near the middle vertex
    rem, off = remaining_distance_m((6.51, 3.3501), coords)
    assert off < 50
    assert rem < total
    assert rem > 500


def test_nearest_on_polyline_projection():
    coords = [(6.50, 3.35), (6.52, 3.35)]
    _i, _t, closest, dist = nearest_on_polyline((6.51, 3.351), coords)
    assert dist < 200
    assert abs(closest[0] - 6.51) < 0.01


def test_eta_uses_route_speed_and_traffic_factor():
    # 10 km in 20 min → 30 km/h; remaining 5 km → 10 min * 1.2 = 12 min
    eta = eta_seconds_from_route(
        5000,
        total_distance_m=10_000,
        total_duration_s=1200,
        traffic_factor=1.2,
    )
    assert 600 <= eta <= 900


def test_reroute_ceiling_and_cooldown():
    trip = {"reroute_count": REROUTE_MAX_PER_TRIP, "last_reroute_at": None}
    ok, reason = can_reroute(trip)
    assert not ok and reason == "trip_reroute_ceiling"

    recent = (datetime.now(timezone.utc) - timedelta(seconds=30)).isoformat()
    trip2 = {"reroute_count": 1, "last_reroute_at": recent}
    ok2, reason2 = can_reroute(trip2)
    assert not ok2 and reason2 == "reroute_cooldown"

    old = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    trip3 = {"reroute_count": 1, "last_reroute_at": old}
    ok3, reason3 = can_reroute(trip3)
    assert ok3 and reason3 == "ok"
