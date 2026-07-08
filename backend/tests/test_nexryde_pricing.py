"""Hybrid fare card: short = per-city table; long = Lagride-style anchors + route zones."""

import math

from fare_config import (
    FARE_CONFIG,
    LONG_TRIP_FARE_CONFIG,
    NEXRYDE_NATIONWIDE_POSITIONING_BULLETS,
    headline_distance_only_fare_bolt,
    headline_distance_only_fare_nexryde,
    normalize_fare_city_key,
    resolve_fare_rate_card,
)
from nexryde_pricing import (
    core_components_from_rate_card,
    nexryde_core_components,
    nexryde_pickup_location_multiplier,
    nexryde_route_location_multiplier,
    nexryde_service_multiplier,
)


def test_legacy_premium_card_still_documented():
    line = nexryde_core_components(18.0, 35)
    assert line["base_fare"] == 6000
    assert line["distance_fee"] == 18 * 2800
    assert line["time_fee"] == 35 * 180


def test_long_trip_ikorodu_economy_line_items():
    card = resolve_fare_rate_card("lagos", "economy", "standard")
    line = core_components_from_rate_card(
        card["base_fare"], card["per_km"], card["per_min"], 18.0, 35
    )
    assert line["core_presurge_pres_adjustment"] == 2870.0
    loc, zone = nexryde_route_location_multiplier("lagos", 6.62, 3.51, None, None)
    assert zone.startswith("far_")
    assert loc == 1.3
    assert (
        round(line["core_presurge_pres_adjustment"] * loc * nexryde_service_multiplier("economy"), 2)
        == 3731.0
    )


def test_short_trip_vi_comfort():
    card = resolve_fare_rate_card("lagos", "comfort", "short")
    line = core_components_from_rate_card(
        card["base_fare"], card["per_km"], card["per_min"], 3.8, 12
    )
    assert line["core_presurge_pres_adjustment"] == 3700.0
    loc, zone = nexryde_route_location_multiplier("lagos", 6.435, 3.42, None, None)
    assert loc == 1.4
    assert "premium" in zone
    svc = nexryde_service_multiplier("comfort")
    assert svc == 1.15
    assert round(line["core_presurge_pres_adjustment"] * loc * svc, 2) == 5957.0


def test_long_trip_ikeja_premium():
    card = resolve_fare_rate_card("lagos", "premium", "standard")
    line = core_components_from_rate_card(
        card["base_fare"], card["per_km"], card["per_min"], 8.0, 20
    )
    assert line["core_presurge_pres_adjustment"] == 2504.0
    loc, _ = nexryde_route_location_multiplier("lagos", 6.60, 3.35, None, None)
    assert loc == 1.0
    assert round(line["core_presurge_pres_adjustment"] * loc * nexryde_service_multiplier("premium"), 2) == 3255.2


def test_route_location_combines_pickup_and_dropoff():
    mp, zp = nexryde_pickup_location_multiplier("lagos", 6.60, 3.35)
    md, zd = nexryde_pickup_location_multiplier("lagos", 6.435, 3.42)
    m, label = nexryde_route_location_multiplier("lagos", 6.60, 3.35, 6.435, 3.42)
    assert abs(m - math.sqrt(max(1e-6, mp * md))) < 1e-9
    assert "×" in label
    assert zp in label and zd in label


def test_budget_tier_multiplier():
    assert nexryde_service_multiplier("budget") == 0.45


def test_nationwide_service_tier_multipliers():
    assert nexryde_service_multiplier("economy") == 1.0
    assert nexryde_service_multiplier("comfort") == 1.15
    assert nexryde_service_multiplier("premium") == 1.3
    assert nexryde_service_multiplier("pro") == 1.3
    assert nexryde_service_multiplier("xl") == 1.5
    assert nexryde_service_multiplier("executive") == 1.5


def test_non_lagos_route_location_is_neutral():
    m, z = nexryde_route_location_multiplier("abuja", 9.05, 7.49, 9.02, 7.50)
    assert m == 1.0
    assert z == "default_non_lagos×default_non_lagos"


def test_short_fare_differs_by_city_at_same_distance():
    lag = resolve_fare_rate_card("lagos", "economy", "short")
    abu = resolve_fare_rate_card("abuja", "economy", "short")
    assert lag["per_km"] != abu["per_km"]
    assert abu["base_fare"] == 2400.0 and abu["per_km"] == 520.0


def test_normalize_fare_city_key_aliases():
    assert normalize_fare_city_key("Port Harcourt") == "rivers"
    assert normalize_fare_city_key("  ABUJA ") == "abuja"
    assert normalize_fare_city_key("Ibadan") == "oyo"
    assert normalize_fare_city_key("totally_unknown_metro") == "default"


def test_abuja_headline_base_plus_km_vs_bolt_reference():
    """Bolt table compares base + distance only; NEXRYDE card matches that headline (time on stop only)."""
    card = resolve_fare_rate_card("abuja", "economy", "short")
    assert card["base_fare"] == 2400.0 and card["per_km"] == 520.0 and card["per_min"] == 120.0
    # 20 km — user Bolt ref: ₦300 + 20×₦85 = ₦2,000
    assert 300.0 + 20.0 * 85.0 == 2000.0
    assert card["base_fare"] + 20.0 * card["per_km"] == 12800.0
    # 5 km — Bolt: ₦300 + 5×₦85 = ₦725
    assert 300.0 + 5.0 * 85.0 == 725.0
    assert card["base_fare"] + 5.0 * card["per_km"] == 5000.0


def test_abuja_direct_core_is_distance_only():
    """Direct trips pass per_min=0 — no time line item before surge."""
    card = resolve_fare_rate_card("abuja", "economy", "standard")
    line = core_components_from_rate_card(
        card["base_fare"], card["per_km"], 0, 20.0, 0
    )
    assert line["time_fee"] == 0.0
    assert line["core_presurge_pres_adjustment"] == 12800.0  # 2400 + 20×520


def test_bolt_commission_net_driver_examples():
    """Reference math from rider-facing Bolt comparison (15% platform fee)."""
    trip_20 = 2000.0
    assert round(trip_20 * 0.15, 2) == 300.0
    assert trip_20 - 300.0 == 1700.0
    trip_5 = 725.0
    assert trip_5 * 0.15 == 108.75
    assert trip_5 - 108.75 == 616.25


def test_pricing_comparison_table_10km_all_states():
    """Pinned product table: 10 km headline (base + distance), all states + FCT vs Bolt reference."""
    km = 10.0
    rows: list[tuple[str, float, float]] = [
        ("abuja", 1150.0, 7600.0),
        ("abia", 1060.0, 5700.0),
        ("adamawa", 1090.0, 5700.0),
        ("akwa_ibom", 1095.0, 6970.0),
        ("anambra", 1110.0, 7280.0),
        ("bauchi", 1125.0, 5700.0),
        ("bayelsa", 1080.0, 5700.0),
        ("benue", 1110.0, 5700.0),
        ("borno", 1150.0, 5700.0),
        ("cross_river", 1080.0, 6970.0),
        ("delta", 1095.0, 7600.0),
        ("ebonyi", 1060.0, 5700.0),
        ("edo", 1095.0, 7280.0),
        ("ekiti", 1085.0, 5700.0),
        ("enugu", 1150.0, 6970.0),
        ("gombe", 1110.0, 5700.0),
        ("imo", 1110.0, 6970.0),
        ("jigawa", 1165.0, 5700.0),
        ("kaduna", 1135.0, 7280.0),
        ("kano", 1190.0, 7600.0),
        ("katsina", 1150.0, 5700.0),
        ("kebbi", 1125.0, 5700.0),
        ("kogi", 1085.0, 5700.0),
        ("kwara", 1110.0, 5700.0),
        ("nasarawa", 1110.0, 5700.0),
        ("niger", 1110.0, 5700.0),
        ("ogun", 1110.0, 6650.0),
        ("ondo", 1085.0, 5700.0),
        ("osun", 1085.0, 5700.0),
        ("oyo", 1110.0, 7280.0),
        ("plateau", 1135.0, 6650.0),
        ("rivers", 1080.0, 7600.0),
        ("sokoto", 1150.0, 5700.0),
        ("taraba", 1085.0, 5700.0),
        ("yobe", 1125.0, 5700.0),
        ("zamfara", 1150.0, 5700.0),
    ]
    for city, bolt_want, nx_want in rows:
        assert headline_distance_only_fare_bolt(city, km) == bolt_want, city
        assert headline_distance_only_fare_nexryde(city, km) == nx_want, city


def test_pricing_comparison_table_10km_legacy_city_aliases():
    km = 10.0
    for city, bolt_want, nx_want in [
        ("port_harcourt", 1080.0, 7600.0),
        ("ibadan", 1110.0, 7280.0),
        ("benin_city", 1095.0, 7280.0),
        ("warri", 1095.0, 7600.0),
        ("owerri", 1110.0, 6970.0),
        ("uyo", 1095.0, 6970.0),
        ("calabar", 1080.0, 6970.0),
    ]:
        assert headline_distance_only_fare_bolt(city, km) == bolt_want, city
        assert headline_distance_only_fare_nexryde(city, km) == nx_want, city


def test_headline_bolt_none_for_lagos():
    assert headline_distance_only_fare_bolt("lagos", 10.0) is None


def test_nationwide_positioning_bullets_shape():
    assert len(NEXRYDE_NATIONWIDE_POSITIONING_BULLETS) == 6
    assert "5.5" in NEXRYDE_NATIONWIDE_POSITIONING_BULLETS[0]
    assert "0%" in NEXRYDE_NATIONWIDE_POSITIONING_BULLETS[1]


def test_all_states_plus_fct_in_fare_config_excluding_lagos():
    nationwide = [k for k in FARE_CONFIG if k not in ("lagos", "default")]
    assert len(nationwide) == 36


def test_long_trip_config_exists_all_cities():
    for ck in ("lagos", "abuja", "rivers", "default", "oyo", "kano", "jigawa"):
        assert "economy" in LONG_TRIP_FARE_CONFIG[ck]
        assert "executive" in LONG_TRIP_FARE_CONFIG[ck]
