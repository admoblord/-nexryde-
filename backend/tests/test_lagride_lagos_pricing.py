"""Lagos distance-only Lagride-style fare (spec from product analysis)."""

from datetime import datetime as dt_real
from datetime import timedelta
from unittest.mock import patch

import pytest
from fare_config import FARE_CONFIG

import lagride_lagos_pricing as lagride_lagos_pricing_mod
from lagride_lagos_pricing import (
    HIGH_DEMAND_SURGE,
    LAGOS_LAGPRIDE_SPEC_ID,
    LAGOS_MARKET_WIDE_FARE_MULTIPLIER,
    LAGOS_RIDER_VALUE_SUMMARY,
    LAGRIDE_SERVICE_EV,
    LAGRIDE_SERVICE_OMNI,
    LAGRIDE_SERVICE_PRO,
    LAGRIDE_SERVICE_STANDARD,
    NORMAL_SURGE_LAGride,
    PEACE_GARDEN_TO_IKORODU_PER_KM,
    LAGOS_IKORODU_IKEJA_CORRIDOR_PER_KM,
    LAGOS_SANGOTEDO_IKORODU_CORRIDOR_PER_KM,
    PEAK_SURGE_LAGride,
    RAIN_SURGE_LAGride,
    TIER1_15_PLUS_RATES_BY_ZONE,
    TIER2_FLAT_PER_KM,
    build_lagos_lagride_fare_breakdown,
    classify_lagos_lagride_pickup,
    lagride_lagos_area_rate_per_km,
    lagride_lagos_service_multiplier,
    lagride_tier1_rate_per_km,
)


class _LagrideFareTestClock:
    """UTC 09:00 + 1h offset → hour 10, outside morning/evening peak windows."""

    @staticmethod
    def utcnow():
        return dt_real(2026, 5, 10, 9, 0, 0)

    timedelta = timedelta


@pytest.fixture(autouse=True)
def _lagride_fare_fixed_clock():
    with patch.object(lagride_lagos_pricing_mod, "datetime", _LagrideFareTestClock):
        yield


def test_tier1_distance_bands():
    assert lagride_tier1_rate_per_km(2.5) == 1850.0
    assert lagride_tier1_rate_per_km(2.5, "lagride_t1_sky_mall") == 4896 / 2.7
    assert lagride_tier1_rate_per_km(7.0) == 875.0
    assert lagride_tier1_rate_per_km(20.0) == 812.0


def test_sky_mall_short_trip_2_7km():
    """Sky Mall 2.7 km calibrated line × Lagos market multiplier (reference ₦4,896 @ 2.7 km @ 1.0×)."""
    f = build_lagos_lagride_fare_breakdown(
        distance_km=2.7,
        duration_min=8,
        traffic_duration_min=8,
        service_key="economy",
        demand_ratio=0.0,
        is_raining=False,
        pickup_lat=6.441,
        pickup_lng=3.508,
        max_multiplier=2.5,
        cancellation_fee=300,
        min_fare=0,
        short_trip_threshold_km=5.0,
    )
    assert f["location_zone"] == "lagride_t1_sky_mall"
    assert f["total_fare"] == 4994.0
    assert f["fare_bucket"] == "lagride_t1_0_3_km"
    lp = f["lagride_profile"]
    assert lp["spec_id"] == LAGOS_LAGPRIDE_SPEC_ID
    assert lp["pickup_zone_key"] == "lagride_t1_sky_mall"
    assert lp["distance_band"] == "0_3_km"
    assert lp["rate_source"] == "tier1_sky_mall_short_trip_calibrated"
    assert lp["fare_bucket"] == "lagride_t1_0_3_km"
    assert lp["total_fare_computed"] == 4994.0
    assert lp["lagos_market_multiplier"] == LAGOS_MARKET_WIDE_FARE_MULTIPLIER
    assert "Lagos" in lp["formula"]
    assert len(lp["implementation_checklist"]) == 10
    assert lp["implementation_checklist"][9]["step"] == 10
    assert lp.get("rider_value_summary") == LAGOS_RIDER_VALUE_SUMMARY


def test_tier1_15_plus_calibrated_zones():
    assert lagride_tier1_rate_per_km(21.65, "lagride_t1_lekki") == TIER1_15_PLUS_RATES_BY_ZONE["lagride_t1_lekki"]
    assert lagride_tier1_rate_per_km(30.5, "lagride_t1_vi_ikoyi_banana") == TIER1_15_PLUS_RATES_BY_ZONE[
        "lagride_t1_vi_ikoyi_banana"
    ]
    assert lagride_lagos_area_rate_per_km(1, 45.79, "lagride_t1_yaba") == TIER1_15_PLUS_RATES_BY_ZONE["lagride_t1_yaba"]
    assert lagride_lagos_area_rate_per_km(1, 50.43, "lagride_t1_festac") == TIER1_15_PLUS_RATES_BY_ZONE[
        "lagride_t1_festac"
    ]


def test_lekki_tier1_long_trip_classified():
    tier, zone = classify_lagos_lagride_pickup(6.465, 3.5)
    assert tier == 1
    assert zone == "lagride_t1_lekki"


def test_ikeja_tier2_flat():
    tier, label = classify_lagos_lagride_pickup(6.601, 3.343)
    assert tier == 2
    assert "ikeja" in label
    assert lagride_lagos_area_rate_per_km(tier, 12.0) == TIER2_FLAT_PER_KM


def test_service_multipliers_lagride_spec():
    assert LAGRIDE_SERVICE_PRO == 1.1  # legacy constant; Lagos tiers use FARE_CONFIG ratios
    assert LAGRIDE_SERVICE_STANDARD == 1.0
    assert LAGRIDE_SERVICE_EV == 1.0
    assert LAGRIDE_SERVICE_OMNI == 0.35
    lag = FARE_CONFIG["lagos"]
    fe = float(lag["economy"]["per_km"])
    assert lagride_lagos_service_multiplier("economy") == 1.0
    assert lagride_lagos_service_multiplier("standard") == 1.0
    assert lagride_lagos_service_multiplier("comfort") == lag["comfort"]["per_km"] / fe
    assert lagride_lagos_service_multiplier("xl") == lag["xl"]["per_km"] / fe
    assert lagride_lagos_service_multiplier("premium") == lag["premium"]["per_km"] / fe
    assert lagride_lagos_service_multiplier("pro") == lagride_lagos_service_multiplier("premium")
    assert lagride_lagos_service_multiplier("ev") == LAGRIDE_SERVICE_EV
    assert lagride_lagos_service_multiplier("omni") == LAGRIDE_SERVICE_OMNI
    assert lagride_lagos_service_multiplier("budget") == LAGRIDE_SERVICE_OMNI


def test_surge_constants_lagride_spec():
    assert NORMAL_SURGE_LAGride == 1.0
    assert HIGH_DEMAND_SURGE == 1.3
    assert RAIN_SURGE_LAGride == 1.4
    assert PEAK_SURGE_LAGride == 1.0


def test_verification_totals_lekki_ikoyi_yaba_festac():
    # Lekki (21.65 km) → ₦17,604
    f = build_lagos_lagride_fare_breakdown(
        distance_km=21.65,
        duration_min=31,
        traffic_duration_min=31,
        service_key="economy",
        demand_ratio=0.0,
        is_raining=False,
        pickup_lat=6.465,
        pickup_lng=3.5,
        max_multiplier=2.5,
        cancellation_fee=300,
        min_fare=0,
        short_trip_threshold_km=5.0,
    )
    assert f["total_fare"] == 17956.0

    # Ikoyi / island (30.50 km) → ₦24,829 @ 1.0× Lagos
    f_i = build_lagos_lagride_fare_breakdown(
        distance_km=30.50,
        duration_min=40,
        traffic_duration_min=40,
        service_key="economy",
        demand_ratio=0.0,
        is_raining=False,
        pickup_lat=6.45,
        pickup_lng=3.42,
        max_multiplier=2.5,
        cancellation_fee=300,
        min_fare=0,
        short_trip_threshold_km=5.0,
    )
    assert f_i["total_fare"] == 25326.0

    # Yaba (45.79 km) → ₦37,175 @ 1.0× Lagos
    f_y = build_lagos_lagride_fare_breakdown(
        distance_km=45.79,
        duration_min=63,
        traffic_duration_min=63,
        service_key="economy",
        demand_ratio=0.0,
        is_raining=False,
        pickup_lat=6.51,
        pickup_lng=3.385,
        max_multiplier=2.5,
        cancellation_fee=300,
        min_fare=0,
        short_trip_threshold_km=5.0,
    )
    assert f_y["total_fare"] == 37918.0

    # Festac (50.43 km) → ₦40,959 @ 1.0× Lagos
    f_f = build_lagos_lagride_fare_breakdown(
        distance_km=50.43,
        duration_min=77,
        traffic_duration_min=77,
        service_key="economy",
        demand_ratio=0.0,
        is_raining=False,
        pickup_lat=6.50,
        pickup_lng=3.24,
        max_multiplier=2.5,
        cancellation_fee=300,
        min_fare=0,
        short_trip_threshold_km=5.0,
    )
    assert f_f["total_fare"] == 41778.0


def test_example_5_generic_tier2_premium_18km():
    """Tier 2 @ 18 km uses 15+ band (₦812/km), not flat ₦3,255 — long-haul alignment."""
    m = lagride_lagos_service_multiplier("premium")
    f2 = build_lagos_lagride_fare_breakdown(
        distance_km=18.0,
        duration_min=30,
        traffic_duration_min=30,
        service_key="premium",
        demand_ratio=0.0,
        is_raining=False,
        pickup_lat=6.601,
        pickup_lng=3.343,
        max_multiplier=3.0,
        cancellation_fee=500,
        min_fare=0,
        short_trip_threshold_km=5.0,
    )
    assert f2["location_zone"] == "lagride_t2_ikeja"
    assert f2["fare_bucket"] == "lagride_t2_15_plus_km"
    assert f2["total_fare"] == round(18.0 * 812.0 * m * LAGOS_MARKET_WIDE_FARE_MULTIPLIER)


def test_example_5_peace_garden_to_ikorodu_premium_18km():
    """Ex 5 variant: PG → Ikorodu + Premium (same multiplier as FARE_CONFIG premium)."""
    m = lagride_lagos_service_multiplier("premium")
    f = build_lagos_lagride_fare_breakdown(
        distance_km=18.0,
        duration_min=30,
        traffic_duration_min=30,
        service_key="premium",
        demand_ratio=0.0,
        is_raining=False,
        pickup_lat=6.62,
        pickup_lng=3.51,
        max_multiplier=3.0,
        cancellation_fee=500,
        min_fare=0,
        short_trip_threshold_km=5.0,
        dropoff_lat=6.65,
        dropoff_lng=3.52,
    )
    line = round(18.0 * PEACE_GARDEN_TO_IKORODU_PER_KM, 2)
    assert f["total_fare"] == round(round(line * m, 2) * LAGOS_MARKET_WIDE_FARE_MULTIPLIER)


def test_example_6_lekki_21_65km_omni():
    """Ex 6: Lekki calibrated line × Omni 0.35 (not sheet ~₦7,038)."""
    f = build_lagos_lagride_fare_breakdown(
        distance_km=21.65,
        duration_min=31,
        traffic_duration_min=31,
        service_key="omni",
        demand_ratio=0.0,
        is_raining=False,
        pickup_lat=6.465,
        pickup_lng=3.5,
        max_multiplier=2.5,
        cancellation_fee=300,
        min_fare=0,
        short_trip_threshold_km=5.0,
    )
    line = round(21.65 * TIER1_15_PLUS_RATES_BY_ZONE["lagride_t1_lekki"], 2)
    assert f["total_fare"] == round(round(line * LAGRIDE_SERVICE_OMNI, 2) * LAGOS_MARKET_WIDE_FARE_MULTIPLIER)


def test_no_lagos_fare_exceeds_100k_across_zones():
    """Every zone pair @ up to 60 km stays at or below LAGOS_MAX_TRIP_FARE_NGN (economy)."""
    from lagride_lagos_pricing import LAGOS_MAX_TRIP_FARE_NGN

    zones = {
        "lekki": (6.48, 3.52),
        "ikeja": (6.605, 3.340),
        "ikorodu": (6.660, 3.550),
        "peace_garden": (6.625, 3.510),
        "vi": (6.45, 3.40),
        "festac": (6.50, 3.24),
    }
    for km in (15, 30, 45, 60):
        for a in zones.values():
            for b in zones.values():
                if a == b:
                    continue
                f = build_lagos_lagride_fare_breakdown(
                    distance_km=float(km),
                    duration_min=60,
                    traffic_duration_min=60,
                    service_key="economy",
                    demand_ratio=0.0,
                    is_raining=False,
                    pickup_lat=a[0],
                    pickup_lng=a[1],
                    dropoff_lat=b[0],
                    dropoff_lng=b[1],
                    max_multiplier=2.5,
                    cancellation_fee=300,
                    min_fare=200,
                    short_trip_threshold_km=5.0,
                )
                assert f["total_fare"] <= LAGOS_MAX_TRIP_FARE_NGN, (
                    f"₦{f['total_fare']} > cap for {km}km"
                )


def test_symmetric_fare_ikorodu_peace_garden_round_trip():
    """A→B and B→A at same km should match (symmetric min rate)."""
    kw = dict(
        distance_km=18.0,
        duration_min=35,
        traffic_duration_min=35,
        service_key="economy",
        demand_ratio=0.0,
        is_raining=False,
        max_multiplier=2.5,
        cancellation_fee=300,
        min_fare=0,
        short_trip_threshold_km=5.0,
    )
    pg_lat, pg_lng = 6.62, 3.51
    iko_lat, iko_lng = 6.65, 3.52
    f_out = build_lagos_lagride_fare_breakdown(
        **kw,
        pickup_lat=pg_lat,
        pickup_lng=pg_lng,
        dropoff_lat=iko_lat,
        dropoff_lng=iko_lng,
    )
    f_back = build_lagos_lagride_fare_breakdown(
        **kw,
        pickup_lat=iko_lat,
        pickup_lng=iko_lng,
        dropoff_lat=pg_lat,
        dropoff_lng=pg_lng,
    )
    assert f_out["total_fare"] == f_back["total_fare"]
    assert f_out["lagride_rate_per_km"] == PEACE_GARDEN_TO_IKORODU_PER_KM
    assert f_back["lagride_rate_per_km"] == PEACE_GARDEN_TO_IKORODU_PER_KM


def test_symmetric_fare_ikorodu_vi_round_trip():
    kw = dict(
        distance_km=30.0,
        duration_min=45,
        traffic_duration_min=45,
        service_key="economy",
        demand_ratio=0.0,
        is_raining=False,
        max_multiplier=2.5,
        cancellation_fee=300,
        min_fare=0,
        short_trip_threshold_km=5.0,
    )
    vi_lat, vi_lng = 6.45, 3.40
    iko_lat, iko_lng = 6.65, 3.52
    f_to = build_lagos_lagride_fare_breakdown(
        **kw,
        pickup_lat=iko_lat,
        pickup_lng=iko_lng,
        dropoff_lat=vi_lat,
        dropoff_lng=vi_lng,
    )
    f_from = build_lagos_lagride_fare_breakdown(
        **kw,
        pickup_lat=vi_lat,
        pickup_lng=vi_lng,
        dropoff_lat=iko_lat,
        dropoff_lng=iko_lng,
    )
    assert f_to["total_fare"] == f_from["total_fare"]
    assert f_to["total_fare"] < 35_000


def test_peace_garden_to_ikorodu_and_ikeja_18km():
    # Peace Garden pickup → Ikorodu: ₦57,424 @ 18 km
    f_ik = build_lagos_lagride_fare_breakdown(
        distance_km=18.0,
        duration_min=35,
        traffic_duration_min=35,
        service_key="economy",
        demand_ratio=0.0,
        is_raining=False,
        pickup_lat=6.62,
        pickup_lng=3.51,
        max_multiplier=2.5,
        cancellation_fee=300,
        min_fare=0,
        short_trip_threshold_km=5.0,
        dropoff_lat=6.65,
        dropoff_lng=3.52,
    )
    assert f_ik["fare_bucket"] == "lagride_t2_peace_garden_to_ikorodu"
    assert f_ik["total_fare"] == 58572.0

    # Peace Garden → Ikeja: satellite corridor @ ₦950/km (was ₦48k+ @ 18 km)
    f_ikj = build_lagos_lagride_fare_breakdown(
        distance_km=18.0,
        duration_min=30,
        traffic_duration_min=30,
        service_key="economy",
        demand_ratio=0.0,
        is_raining=False,
        pickup_lat=6.62,
        pickup_lng=3.51,
        max_multiplier=2.5,
        cancellation_fee=300,
        min_fare=0,
        short_trip_threshold_km=5.0,
        dropoff_lat=6.60,
        dropoff_lng=3.34,
    )
    assert f_ikj["fare_bucket"] == "lagride_t2_ikorodu_ikeja_corridor"
    assert f_ikj["lagride_rate_per_km"] == LAGOS_IKORODU_IKEJA_CORRIDOR_PER_KM
    assert f_ikj["total_fare"] == round(18.0 * LAGOS_IKORODU_IKEJA_CORRIDOR_PER_KM * LAGOS_MARKET_WIDE_FARE_MULTIPLIER)


def test_ikorodu_to_ikeja_20km():
    """North satellite (Ikorodu / Peace Garden) → Ikeja ~₦19k @ 20 km, not ₦54k+."""
    f = build_lagos_lagride_fare_breakdown(
        distance_km=20.0,
        duration_min=35,
        traffic_duration_min=35,
        service_key="economy",
        demand_ratio=0.0,
        is_raining=False,
        pickup_lat=6.619,
        pickup_lng=3.510,
        max_multiplier=2.5,
        cancellation_fee=300,
        min_fare=0,
        short_trip_threshold_km=5.0,
        dropoff_lat=6.60,
        dropoff_lng=3.34,
    )
    assert f["fare_bucket"] == "lagride_t2_ikorodu_ikeja_corridor"
    assert f["lagride_rate_per_km"] == LAGOS_IKORODU_IKEJA_CORRIDOR_PER_KM
    assert f["total_fare"] == round(20.0 * LAGOS_IKORODU_IKEJA_CORRIDOR_PER_KM * LAGOS_MARKET_WIDE_FARE_MULTIPLIER)


def test_sangotedo_ikorodu_corridor_64km():
    """Peace Garden City Estate / Sangotedo → Ikorodu ~₦43.5k @ 64 km (Lagride-aligned)."""
    f = build_lagos_lagride_fare_breakdown(
        distance_km=63.64,
        duration_min=68,
        traffic_duration_min=68,
        service_key="economy",
        demand_ratio=0.0,
        is_raining=False,
        pickup_lat=6.471,
        pickup_lng=3.636,
        max_multiplier=2.5,
        cancellation_fee=300,
        min_fare=0,
        short_trip_threshold_km=5.0,
        dropoff_lat=6.660,
        dropoff_lng=3.550,
    )
    assert f["fare_bucket"] == "lagride_t1_sangotedo_ikorodu_corridor"
    assert f["lagride_rate_per_km"] == LAGOS_SANGOTEDO_IKORODU_CORRIDOR_PER_KM
    assert f["total_fare"] == 39_547


def test_sangotedo_ikorodu_corridor_tier_multipliers():
    """Standard / XL / Comfort / Premium match Lagride promo ladder on this corridor."""
    base_kw = dict(
        distance_km=63.64,
        duration_min=68,
        traffic_duration_min=68,
        demand_ratio=0.0,
        is_raining=False,
        pickup_lat=6.471,
        pickup_lng=3.636,
        max_multiplier=2.5,
        cancellation_fee=300,
        min_fare=0,
        short_trip_threshold_km=5.0,
        dropoff_lat=6.660,
        dropoff_lng=3.550,
    )
    econ = build_lagos_lagride_fare_breakdown(**base_kw, service_key="economy")
    xl = build_lagos_lagride_fare_breakdown(**base_kw, service_key="xl")
    comfort = build_lagos_lagride_fare_breakdown(**base_kw, service_key="comfort")
    premium = build_lagos_lagride_fare_breakdown(**base_kw, service_key="premium")

    assert econ["total_fare"] == 39_547
    assert xl["total_fare"] == round(39_547 * 1.02)
    assert comfort["total_fare"] == round(39_547 * 1.04)
    assert premium["total_fare"] == 43_874
    assert xl["total_fare"] > econ["total_fare"]
    assert comfort["total_fare"] > xl["total_fare"]
    assert premium["total_fare"] > comfort["total_fare"]
    assert premium["service_multiplier"] == 1.11
    assert comfort["service_multiplier"] == 1.04
    assert xl["service_multiplier"] == 1.02

    long_kw = {**base_kw, "distance_km": 76.0}
    long_econ = build_lagos_lagride_fare_breakdown(**long_kw, service_key="economy")
    long_xl = build_lagos_lagride_fare_breakdown(**long_kw, service_key="xl")
    long_comfort = build_lagos_lagride_fare_breakdown(**long_kw, service_key="comfort")
    long_premium = build_lagos_lagride_fare_breakdown(**long_kw, service_key="premium")
    assert long_econ["total_fare"] == 39_547
    assert long_xl["total_fare"] == round(39_547 * 1.02)
    assert long_comfort["total_fare"] == round(39_547 * 1.04)
    assert long_premium["total_fare"] == 43_874
