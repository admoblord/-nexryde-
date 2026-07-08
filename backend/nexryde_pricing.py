"""
Nexryde road-based fare model (premium vs Lagride).

Formula (before surge):
  Direct: (Base + Distance×PerKm) × Service × Location
  With intermediate stop: add Time×PerMin (service tier card) before location/service/surge.

Lagos direct trips use Lagride distance×area only; stop trips add per-minute time like other states.
"""

from __future__ import annotations

import math

# Legacy premium card (tests / backward reference only — production uses fare_config tables).
NEXRYDE_BASE_FARE = 6000
NEXRYDE_PER_KM = 2800
NEXRYDE_PER_MIN = 180


def nexryde_route_time_minutes(duration_min: int, traffic_duration_min: int) -> int:
    return max(int(duration_min), int(traffic_duration_min))


def nexryde_service_multiplier(service_key: str) -> float:
    """
    Tier uplift on (base + distance + time) before surge.

    Nationwide (non-Lagos path): Economy 1.0×, Comfort 1.15×, Premium 1.3×, XL / Executive 1.5×.
    Legacy budget/omni kept for compatibility.
    """
    k = (service_key or "economy").strip().lower()
    if k == "standard":
        k = "economy"
    if k == "pro":
        k = "premium"
    return {
        "economy": 1.0,
        "comfort": 1.15,
        "premium": 1.3,
        "xl": 1.5,
        "executive": 1.5,
        "budget": 0.45,
        "omni": 0.45,
    }.get(k, 1.0)


def _far_badagry(lat: float, lng: float) -> bool:
    return lng <= 3.06 and 6.34 <= lat <= 6.58


def _far_epe(lat: float, lng: float) -> bool:
    return lng >= 3.76 and 6.45 <= lat <= 6.78


def _far_ikorodu(lat: float, lng: float) -> bool:
    return 6.54 <= lat <= 6.78 and 3.44 <= lng <= 3.66


def _far_sangotedo(lat: float, lng: float) -> bool:
    # Ajah / Sangotedo axis (check before generic Lekki premium band)
    return 6.42 <= lat <= 6.52 and 3.58 <= lng <= 3.74


def _premium_island(lat: float, lng: float) -> bool:
    # VI, Ikoyi, Banana Island (approx)
    return 6.415 <= lat <= 6.485 and 3.345 <= lng <= 3.458


def _premium_lekki(lat: float, lng: float) -> bool:
    return 6.425 <= lat <= 6.52 and 3.455 <= lng <= 3.575


def nexryde_pickup_location_multiplier(
    city_key: str,
    pickup_lat: float | None,
    pickup_lng: float | None,
) -> tuple[float, str]:
    """
    Returns (multiplier, zone_label).
    Non-Lagos: 1.0 (extend later per city).
    """
    if pickup_lat is None or pickup_lng is None:
        return 1.0, "unknown_pickup"
    ck = (city_key or "lagos").lower()
    if ck != "lagos":
        return 1.0, "default_non_lagos"

    lat, lng = float(pickup_lat), float(pickup_lng)

    # Far zones first (overlap with “Lekki” coastal band)
    if _far_badagry(lat, lng):
        return 1.3, "far_badagry"
    if _far_epe(lat, lng):
        return 1.3, "far_epe"
    if _far_ikorodu(lat, lng):
        return 1.3, "far_ikorodu"
    if _far_sangotedo(lat, lng):
        return 1.3, "far_sangotedo"

    if _premium_island(lat, lng):
        return 1.4, "premium_island"
    if _premium_lekki(lat, lng):
        return 1.4, "premium_lekki"

    # Ikeja / Berger / Surulere / Yaba / rest of mainland → 1.0
    return 1.0, "standard_lagos"


def nexryde_route_location_multiplier(
    city_key: str,
    pickup_lat: float | None,
    pickup_lng: float | None,
    dropoff_lat: float | None,
    dropoff_lng: float | None,
) -> tuple[float, str]:
    """
    Combine pickup and dropoff zone pressure (geometric mean) so A→B ≠ B→A when zones differ,
    and mainland↔island pairs diverge from same-distance intra-zone trips.
    """
    mp, zp = nexryde_pickup_location_multiplier(city_key, pickup_lat, pickup_lng)
    if dropoff_lat is None or dropoff_lng is None:
        return mp, zp
    md, zd = nexryde_pickup_location_multiplier(city_key, dropoff_lat, dropoff_lng)
    combined = math.sqrt(max(1e-6, float(mp) * float(md)))
    return combined, f"{zp}×{zd}"


def core_components_from_rate_card(
    base_fare: float,
    per_km: float,
    per_min: float,
    distance_km: float,
    route_time_min: int,
) -> dict:
    """Raw line items from a city/bucket rate card before service/location/surge."""
    d = max(0.0, float(distance_km))
    t = max(0, int(route_time_min))
    distance_fee = round(d * float(per_km), 2)
    time_fee = round(t * float(per_min), 2)
    core_presurge = float(base_fare) + distance_fee + time_fee
    return {
        "base_fare": float(base_fare),
        "distance_fee": distance_fee,
        "time_fee": time_fee,
        "core_presurge_pres_adjustment": round(core_presurge, 2),
        "route_time_minutes": t,
    }


def intermediate_stop_time_components(
    city_key: str,
    service_key: str,
    route_time_min: int,
    *,
    fare_bucket: str = "standard",
) -> dict[str, float | bool]:
    """
    Time charge for trips with an intermediate stop (all Nigerian cities).

    Direct trips omit this; Lagride Lagos stays distance-only until a stop is added.
    Other states use base+distance normally, then add route minutes × per_min when stopped.
    """
    from fare_config import normalize_fare_city_key, resolve_fare_rate_card

    ck = normalize_fare_city_key(city_key or "lagos")
    sk = (service_key or "economy").strip().lower()
    if sk == "standard":
        sk = "economy"
    if sk == "pro":
        sk = "premium"
    mins = max(0, int(route_time_min))
    if mins <= 0:
        return {"time_fee": 0.0, "stop_time_per_min": 0.0, "stop_time_fee_applied": False}

    if ck == "lagos":
        from lagride_lagos_pricing import lagos_stop_time_fee, lagos_stop_time_per_min

        per_min = lagos_stop_time_per_min(sk)
        fee = lagos_stop_time_fee(sk, mins)
    else:
        card = resolve_fare_rate_card(ck, sk, fare_bucket)
        per_min = float(card.get("per_min", 80))
        fee = round(mins * per_min, 2)

    return {
        "time_fee": float(fee),
        "stop_time_per_min": float(per_min),
        "stop_time_fee_applied": fee > 0,
    }


def append_stop_time_breakdown_suffix(
    price_breakdown: str,
    route_time_min: int,
    time_fee: float,
    per_min: float,
) -> str:
    if time_fee <= 0 or route_time_min <= 0:
        return price_breakdown
    return (
        f"{price_breakdown} + ₦{int(round(time_fee))} stop time "
        f"({route_time_min}min × ₦{int(round(per_min))}/min)"
    )


def nexryde_core_components(distance_km: float, route_time_min: int) -> dict:
    """Legacy ₦6k-base card — kept for unit tests that pin the old premium formula."""
    return core_components_from_rate_card(
        float(NEXRYDE_BASE_FARE),
        float(NEXRYDE_PER_KM),
        float(NEXRYDE_PER_MIN),
        distance_km,
        route_time_min,
    )
