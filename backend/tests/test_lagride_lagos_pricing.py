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
    LAGRIDE_SERVICE_PRO,
    LAGRIDE_SERVICE_STANDARD,
    NORMAL_SURGE_LAGride,
    PEACE_GARDEN_TO_IKORODU_PER_KM,
    LAGOS_IKORODU_IKEJA_CORRIDOR_PER_KM,
    LAGOS_SANGOTEDO_IKORODU_CORRIDOR_PER_KM,
    PEAK_SURGE_LAGride,
    RAIN_SURGE_LAGride,
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
    assert lagride_tier1_rate_per_km(7.0) == 700.0
    assert lagride_tier1_rate_per_km(20.0) == 540.0


def _lagos_expected_total(km: float, rate: float, mins: int, svc_m: float = 1.0, per_min: float = 80.0) -> float:
    """(km×rate + min×per_min) × service × market — matches engine formula."""
    return round((km * rate + mins * per_min) * svc_m * LAGOS_MARKET_WIDE_FARE_MULTIPLIER)


def test_sky_mall_short_trip_2_7km():
    """Sky Mall 2.7 km calibrated line + time × market."""
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
    sky_total = _lagos_expected_total(2.7, 4896 / 2.7, 8)
    assert f["location_zone"] == "lagride_t1_sky_mall"
    assert f["total_fare"] == sky_total
    assert f["fare_bucket"] == "lagride_t1_0_3_km"
    assert f["time_fee"] == 8 * 80
    lp = f["lagride_profile"]
    assert lp["spec_id"] == LAGOS_LAGPRIDE_SPEC_ID
    assert lp["pickup_zone_key"] == "lagride_t1_sky_mall"
    assert lp["distance_band"] == "0_3_km"
    assert lp["rate_source"] == "tier1_sky_mall_short_trip_calibrated"
    assert lp["fare_bucket"] == "lagride_t1_0_3_km"
    assert lp["total_fare_computed"] == sky_total
    assert lp["lagos_market_multiplier"] == LAGOS_MARKET_WIDE_FARE_MULTIPLIER
    assert "Area_Rate" in lp["formula"]
    assert len(lp["implementation_checklist"]) == 10
    assert lp["implementation_checklist"][9]["step"] == 10
    assert lp.get("rider_value_summary") == LAGOS_RIDER_VALUE_SUMMARY


def test_tier1_15_plus_citywide_540():
    assert lagride_tier1_rate_per_km(21.65, "lagride_t1_lekki") == 540.0
    assert lagride_tier1_rate_per_km(30.5, "lagride_t1_vi_ikoyi_banana") == 540.0
    assert lagride_lagos_area_rate_per_km(1, 45.79, "lagride_t1_yaba") == 540.0
    assert lagride_lagos_area_rate_per_km(1, 50.43, "lagride_t1_festac") == 540.0


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
    assert LAGRIDE_SERVICE_PRO == 1.0
    assert LAGRIDE_SERVICE_STANDARD == 1.0
    assert LAGRIDE_SERVICE_EV == 1.0
    # All tiers flat at 1.0 while multipliers are disabled for base-price review
    for km in (3.5, 3.9, 5.0, 8.0, 15.0, 18.0, 22.0):
        assert lagride_lagos_service_multiplier("xl", distance_km=km) == 1.0
        assert lagride_lagos_service_multiplier("comfort", distance_km=km) == 1.0
        assert lagride_lagos_service_multiplier("premium", distance_km=km) == 1.0
        assert lagride_lagos_service_multiplier("pro", distance_km=km) == 1.0
        assert lagride_lagos_service_multiplier("economy", distance_km=km) == 1.0
        assert lagride_lagos_service_multiplier("standard", distance_km=km) == 1.0
    assert lagride_lagos_service_multiplier("ev") == LAGRIDE_SERVICE_EV
    assert lagride_lagos_service_multiplier("omni") == 1.0
    assert lagride_lagos_service_multiplier("budget") == 1.0


def test_short_hops_differ_by_km_and_time():
    """No flat floor — 3.0 / 3.5 / 3.9 km (+ their times) must produce different Standard fares."""
    from lagride_lagos_pricing import TIER1_RATE_3_15_KM

    samples = [
        (3.0, 7),
        (3.49, 8),
        (3.88, 13),
        (5.0, 15),
    ]
    totals = []
    for km, mins in samples:
        f = build_lagos_lagride_fare_breakdown(
            distance_km=km,
            duration_min=mins,
            traffic_duration_min=mins,
            service_key="economy",
            demand_ratio=0.0,
            is_raining=False,
            pickup_lat=6.4281,
            pickup_lng=3.4219,
            dropoff_lat=6.4541,
            dropoff_lng=3.4358,
            max_multiplier=2.5,
            cancellation_fee=300,
            min_fare=0,
            short_trip_threshold_km=5.0,
        )
        rate = 1850.0 if km < 3.0 else TIER1_RATE_3_15_KM
        assert f["total_fare"] == _lagos_expected_total(km, rate, mins)
        assert f["time_fee"] == mins * 80
        totals.append(f["total_fare"])
    assert len(set(totals)) == len(totals), totals
    assert totals[0] < totals[1] < totals[2] or totals[1] != totals[2]

    comfort = build_lagos_lagride_fare_breakdown(
        distance_km=3.49,
        duration_min=8,
        traffic_duration_min=8,
        service_key="comfort",
        demand_ratio=0.0,
        is_raining=False,
        pickup_lat=6.4281,
        pickup_lng=3.4219,
        dropoff_lat=6.4541,
        dropoff_lng=3.4358,
        max_multiplier=2.5,
        cancellation_fee=300,
        min_fare=0,
        short_trip_threshold_km=5.0,
    )
    assert comfort["service_multiplier"] == 1.0
    assert comfort["total_fare"] == _lagos_expected_total(3.49, TIER1_RATE_3_15_KM, 8, svc_m=1.0)


def test_surge_constants_lagride_spec():
    assert NORMAL_SURGE_LAGride == 1.0
    assert HIGH_DEMAND_SURGE == 1.0
    assert RAIN_SURGE_LAGride == 1.0
    assert PEAK_SURGE_LAGride == 1.3


def test_lagos_smart_surge_morning_applies_1_3():
    """WAT morning window → 1.3× on top of distance+time (no service/market multipliers)."""

    class _MorningClock:
        @staticmethod
        def utcnow():
            # UTC 07:00 → WAT 08:00 (inside 7–9)
            return dt_real(2026, 5, 10, 7, 0, 0)

        timedelta = timedelta

    with patch.object(lagride_lagos_pricing_mod, "datetime", _MorningClock):
        f = build_lagos_lagride_fare_breakdown(
            distance_km=21.65,
            duration_min=31,
            traffic_duration_min=31,
            service_key="economy",
            demand_ratio=0.99,
            is_raining=True,
            pickup_lat=6.465,
            pickup_lng=3.5,
            max_multiplier=2.5,
            cancellation_fee=300,
            min_fare=0,
            short_trip_threshold_km=5.0,
        )
    base = _lagos_expected_total(21.65, 540.0, 31)
    assert f["surge_multiplier"] == 1.3
    assert f["is_surge"] is True
    assert f["total_fare"] == round(base * 1.3)
    assert f["peak_type"] == "morning_rush"


def test_lagos_off_peak_has_no_surge_factor():
    """Outside windows: surge_multiplier is null and breakdown has no × surge line."""
    f = build_lagos_lagride_fare_breakdown(
        distance_km=10.0,
        duration_min=20,
        traffic_duration_min=20,
        service_key="economy",
        demand_ratio=0.99,
        is_raining=True,
        pickup_lat=6.465,
        pickup_lng=3.5,
        max_multiplier=2.5,
        cancellation_fee=300,
        min_fare=0,
        short_trip_threshold_km=5.0,
    )
    assert f["is_surge"] is False
    assert f["surge_multiplier"] is None
    assert f["surge_factors"] == []
    assert "surge" not in f["price_breakdown"].lower()
    assert f["total_fare"] == _lagos_expected_total(10.0, 700.0, 20)


def test_verification_totals_lekki_ikoyi_yaba_festac():
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
    assert f["total_fare"] == _lagos_expected_total(21.65, 540.0, 31)

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
    assert f_i["total_fare"] == _lagos_expected_total(30.50, 540.0, 40)

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
    assert f_y["total_fare"] == _lagos_expected_total(45.79, 540.0, 63)

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
    assert f_f["total_fare"] == _lagos_expected_total(50.43, 540.0, 77)


def test_example_5_generic_tier2_premium_18km():
    """Tier 2 @ 18 km uses 15+ band (₦540/km); Premium multiplier disabled (1.0×)."""
    m = lagride_lagos_service_multiplier("premium", distance_km=18.0)
    assert m == 1.0
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
    assert f2["service_multiplier"] == 1.0
    assert f2["total_fare"] == _lagos_expected_total(18.0, 540.0, 30, svc_m=m)


def test_example_5_peace_garden_to_ikorodu_premium_18km():
    """Ex 5 variant: PG → Ikorodu + Premium; service multiplier disabled (1.0×)."""
    m = lagride_lagos_service_multiplier("premium", distance_km=18.0)
    assert m == 1.0
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
    assert f["service_multiplier"] == 1.0
    assert f["total_fare"] == _lagos_expected_total(18.0, PEACE_GARDEN_TO_IKORODU_PER_KM, 30, svc_m=m)


def test_omni_alias_prices_as_standard():
    """Omni is not a NEXRYDE vehicle — same fare as Standard."""
    base_kw = dict(
        distance_km=21.65,
        duration_min=31,
        traffic_duration_min=31,
        demand_ratio=0.0,
        is_raining=False,
        pickup_lat=6.465,
        pickup_lng=3.5,
        max_multiplier=2.5,
        cancellation_fee=300,
        min_fare=0,
        short_trip_threshold_km=5.0,
    )
    omni = build_lagos_lagride_fare_breakdown(**base_kw, service_key="omni")
    economy = build_lagos_lagride_fare_breakdown(**base_kw, service_key="economy")
    assert omni["total_fare"] == economy["total_fare"]
    assert omni["service_multiplier"] == 1.0


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
    # Peace Garden pickup → Ikorodu: ₦3,000/km × 18 × market multiplier
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
    assert f_ik["total_fare"] == _lagos_expected_total(18.0, PEACE_GARDEN_TO_IKORODU_PER_KM, 35)

    # Peace Garden → Ikeja: satellite corridor @ ₦780/km + time
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
    assert f_ikj["total_fare"] == _lagos_expected_total(18.0, LAGOS_IKORODU_IKEJA_CORRIDOR_PER_KM, 30)


def test_ikorodu_to_ikeja_20km():
    """North satellite (Ikorodu / Peace Garden) → Ikeja corridor + time, not ₦54k+."""
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
    assert f["total_fare"] == _lagos_expected_total(20.0, LAGOS_IKORODU_IKEJA_CORRIDOR_PER_KM, 35)


def test_sangotedo_ikorodu_corridor_old_standard():
    """Sangotedo → Ikorodu: restore old Standard ceiling ₦39,547."""
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
    """Old Standard ₦39,547; tier ladder disabled — all tiers cap at Standard."""
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
    assert xl["total_fare"] == 39_547
    assert comfort["total_fare"] == 39_547
    assert premium["total_fare"] == 39_547
    assert xl["service_multiplier"] == 1.0
    assert comfort["service_multiplier"] == 1.0
    assert premium["service_multiplier"] == 1.0

    long_kw = {**base_kw, "distance_km": 76.0}
    long_econ = build_lagos_lagride_fare_breakdown(**long_kw, service_key="economy")
    long_xl = build_lagos_lagride_fare_breakdown(**long_kw, service_key="xl")
    long_comfort = build_lagos_lagride_fare_breakdown(**long_kw, service_key="comfort")
    long_premium = build_lagos_lagride_fare_breakdown(**long_kw, service_key="premium")
    assert long_econ["total_fare"] == 39_547
    assert long_xl["total_fare"] == 39_547
    assert long_comfort["total_fare"] == 39_547
    assert long_premium["total_fare"] == 39_547
