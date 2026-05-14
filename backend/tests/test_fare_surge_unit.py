"""Offline unit tests: surge math, demand helper, fare thresholds (no Mongo/FastAPI import)."""

import pytest

from fare_config import SHORT_TRIP_KM_THRESHOLD
from surge_demand import haversine_km
from surge_pricing import SURGE_CONFIG, compute_max_style_surge_multiplier, compute_surge_multiplier


def test_haversine_same_point():
    assert haversine_km(6.5244, 3.3792, 6.5244, 3.3792) < 0.001


def test_haversine_short_hop():
    # ~5.5 km across Lagos sample coords
    d = haversine_km(6.5244, 3.3792, 6.4800, 3.4000)
    assert 4.0 < d < 8.0


def test_short_trip_threshold_constant():
    assert SHORT_TRIP_KM_THRESHOLD == 5.0


def test_surge_high_demand_raises_multiplier():
    out = compute_surge_multiplier(demand_ratio=0.96, is_raining=False, service_max_multiplier=3.0)
    assert out["multiplier"] >= 2.0


def test_max_style_surge_peak_and_stack():
    out = compute_max_style_surge_multiplier(
        demand_ratio=0.0, is_raining=False, service_max_multiplier=3.0
    )
    assert out["multiplier"] >= 1.0
    out_rain = compute_max_style_surge_multiplier(
        demand_ratio=0.0, is_raining=True, service_max_multiplier=3.0
    )
    # Peak window can lift max to 1.5 alongside rain 1.4
    assert 1.4 <= out_rain["multiplier"] <= 1.5
    out_hi = compute_max_style_surge_multiplier(
        demand_ratio=0.95, is_raining=False, service_max_multiplier=3.0
    )
    assert out_hi["multiplier"] == 1.3


def test_surge_rain_factor_in_stack():
    out = compute_surge_multiplier(demand_ratio=0.0, is_raining=True, service_max_multiplier=3.0)
    factors = out.get("factors") or []
    assert any("Rain" in str(f.get("label", "")) for f in factors)
    rain_m = float(SURGE_CONFIG.get("rain_multiplier", 1.4))
    assert out["multiplier"] <= min(3.0, float(SURGE_CONFIG.get("absolute_ceiling", 3.0)))
    assert out["pre_cap_combined"] >= rain_m * 0.99


def test_service_cap_clamps_surge():
    out = compute_surge_multiplier(demand_ratio=1.0, is_raining=True, service_max_multiplier=1.15)
    assert out["multiplier"] <= 1.15 + 1e-6
