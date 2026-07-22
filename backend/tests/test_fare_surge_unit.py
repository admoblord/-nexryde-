"""Offline unit tests: smart peak-only surge, demand helper, fare thresholds."""

from datetime import datetime
from unittest.mock import patch

from fare_config import SHORT_TRIP_KM_THRESHOLD
from surge_demand import haversine_km
from surge_pricing import (
    SMART_SURGE_MULTIPLIER,
    SURGE_CONFIG,
    active_smart_surge_window,
    compute_max_style_surge_multiplier,
    compute_surge_multiplier,
)


def test_haversine_same_point():
    assert haversine_km(6.5244, 3.3792, 6.5244, 3.3792) < 0.001


def test_haversine_short_hop():
    d = haversine_km(6.5244, 3.3792, 6.4800, 3.4000)
    assert 4.0 < d < 8.0


def test_short_trip_threshold_constant():
    assert SHORT_TRIP_KM_THRESHOLD == 5.0


def test_smart_surge_off_outside_windows():
    with patch("surge_pricing._wat_now", return_value=datetime(2026, 7, 21, 12, 0, 0)):
        out = compute_surge_multiplier(demand_ratio=0.99, is_raining=True, service_max_multiplier=3.0)
    assert out["multiplier"] is None
    assert out["effective_multiplier"] == 1.0
    assert out["is_surge"] is False
    assert out["factors"] == []
    assert out["reasons"] == []


def test_smart_surge_morning_1_3():
    with patch("surge_pricing._wat_now", return_value=datetime(2026, 7, 21, 8, 0, 0)):
        out = compute_max_style_surge_multiplier(
            demand_ratio=0.0, is_raining=False, service_max_multiplier=3.0
        )
        active, kind, cfg = active_smart_surge_window()
    assert active is True
    assert kind == "morning"
    assert out["multiplier"] == SMART_SURGE_MULTIPLIER
    assert out["effective_multiplier"] == SMART_SURGE_MULTIPLIER
    assert out["is_surge"] is True
    assert out["is_peak"] is True
    assert out["window_ends_label"] == "9:00 AM"
    assert cfg is not None


def test_smart_surge_evening_1_3():
    with patch("surge_pricing._wat_now", return_value=datetime(2026, 7, 21, 18, 30, 0)):
        out = compute_surge_multiplier(demand_ratio=0.0, is_raining=True, service_max_multiplier=3.0)
    assert out["multiplier"] == 1.3
    assert "Evening" in (out.get("active_window") or "")


def test_rain_and_demand_do_not_stack():
    with patch("surge_pricing._wat_now", return_value=datetime(2026, 7, 21, 8, 15, 0)):
        out = compute_max_style_surge_multiplier(
            demand_ratio=0.99, is_raining=True, service_max_multiplier=3.0
        )
    assert out["multiplier"] == 1.3
    labels = [str(f.get("label", "")) for f in (out.get("factors") or [])]
    assert not any("Rain" in L for L in labels)
    assert not any("demand" in L.lower() for L in labels)


def test_service_cap_clamps_surge():
    with patch("surge_pricing._wat_now", return_value=datetime(2026, 7, 21, 18, 0, 0)):
        out = compute_surge_multiplier(demand_ratio=1.0, is_raining=True, service_max_multiplier=1.15)
    assert (out.get("effective_multiplier") or out.get("multiplier") or 0) <= 1.15 + 1e-6


def test_peak_config_windows():
    am = SURGE_CONFIG["peak_hours"]["morning_rush"]
    pm = SURGE_CONFIG["peak_hours"]["evening_peak"]
    assert am["start"] == 7 and am["end"] == 9
    assert pm["start"] == 17 and pm["end"] == 20
    assert am["multiplier"] == 1.3
    assert pm["multiplier"] == 1.3
