"""Lagos stop trips add a per-minute time charge on top of distance×area fare."""
from __future__ import annotations

from lagride_lagos_pricing import build_lagos_lagride_fare_breakdown


def _fare(*, has_stop: bool, distance_km: float, duration_min: int):
    return build_lagos_lagride_fare_breakdown(
        distance_km=distance_km,
        duration_min=duration_min,
        traffic_duration_min=duration_min,
        service_key="economy",
        demand_ratio=0.0,
        is_raining=False,
        pickup_lat=6.6018,
        pickup_lng=3.3515,
        dropoff_lat=6.4474,
        dropoff_lng=3.4700,
        max_multiplier=2.5,
        cancellation_fee=300,
        min_fare=0,
        short_trip_threshold_km=5,
        has_intermediate_stop=has_stop,
    )


def test_lagos_direct_route_has_no_time_fee():
    direct = _fare(has_stop=False, distance_km=31.73, duration_min=41)
    assert direct["time_fee"] == 0.0
    assert not direct.get("stop_time_fee_applied")


def test_lagos_stop_route_adds_time_fee_and_increases_total():
    direct = _fare(has_stop=False, distance_km=31.73, duration_min=41)
    with_stop = _fare(has_stop=True, distance_km=31.16, duration_min=49)
    assert with_stop["time_fee"] > 0
    assert with_stop["stop_time_fee_applied"] is True
    assert with_stop["total_fare"] > direct["total_fare"]
    assert with_stop["time_fee"] == 49 * 80
