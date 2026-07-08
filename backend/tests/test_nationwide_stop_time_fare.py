"""Stop time charge applies nationwide when rider adds an intermediate stop."""
from __future__ import annotations

from fare_config import resolve_fare_rate_card
from nexryde_pricing import core_components_from_rate_card, intermediate_stop_time_components


def test_abuja_direct_core_has_no_stop_time():
    card = resolve_fare_rate_card("abuja", "economy", "standard")
    line = core_components_from_rate_card(card["base_fare"], card["per_km"], 0, 20.0, 0)
    assert line["time_fee"] == 0.0
    assert line["core_presurge_pres_adjustment"] == 2400 + 20 * 520


def test_abuja_stop_adds_time_fee_from_rate_card():
    stop = intermediate_stop_time_components("abuja", "economy", 55, fare_bucket="standard")
    assert stop["stop_time_fee_applied"] is True
    assert stop["time_fee"] == 55 * 120.0
    assert stop["stop_time_per_min"] == 120.0
