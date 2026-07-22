"""
NEXRYDE EXACT LAGRIDE PRICING FOR LAGOS

Rider product goal: **transparent, route-based Lagos fares**—km + time, area rate, vehicle tier, surge.

FORMULA (no separate base fare — road distance + traffic-aware minutes from Directions / Routes):

  Off-peak:  Price = Distance × Area_Rate + Time_Min × Per_Min
  Surge hours: Price = (Distance × Area_Rate + Time_Min × Per_Min) × 1.3

``Per_Min`` = economy card per-minute (``FARE_CONFIG['lagos']['economy']['per_min']``).
Vehicle service multipliers and the city-wide market factor are **removed**.

Surge exists **only** in WAT **07:00–09:00** and **17:00–20:00**. Outside those
windows there is **no surge factor at all** (not 1.0× — omitted from the fare).

``Distance`` = driving route km. ``Time_Min`` = traffic-aware route minutes.
``Area_Rate`` = ₦/km from **symmetric** zone logic:
the engine evaluates the trip A→B and B→A (swap pickup/dropoff roles) and uses
``min(rate_ab, rate_ba)`` so the same corridor costs about the same in both directions
(surge may still differ slightly at booking time). Peace Garden ↔ Ikorodu/Ikeja
corridors apply in **both** directions. Final total is rounded to whole ₦.

AREA RATES (baseline card)
----------------------------
**TIER 1 — BUDGET / SUBURBAN**

• 0–3 km: ₦1,850/km (minimum-fare protection band)

• 3–15 km: ₦700/km (moderate Lagride step-down; Jul 2026)

• 15+ km: ₦540/km (market-aligned long haul; Jul 2026 — was ₦660)

Areas (pickup must fall in approx. polygon — see ``classify_lagos_lagride_pickup``):
Sangotedo, Lekki, Ikoyi, Yaba, Ojuelegba, VI, Surulere, Ajah, Banana Island,
Ibeju-Lekki, Festac, Gbagada, Magodo — plus Sky Mall (Jakande) sub-polygon under Lekki.

**TIER 2 — PREMIUM / FAR**

• 0–3 km: ₦1,850/km (same short band as Tier 1)

• 3–15 km: ₦1,400/km (moderate mainland mid; was ₦2,600)

• 15+ km: ₦540/km (same long-haul band as Tier 1)

Corridor trips (Peace Garden ↔ Ikorodu/Ikeja) use calibrated ₦/km up to 20 km, then taper toward the 15+ band.

Areas: Ikeja, Peace Garden, Ikorodu, Berger, Badagry, Epe, and **Mainland** (metro
fallback). **Eti-Osa** is listed administratively under Tier 2; geographically it
overlaps Tier 1 (VI, Lekki, Ajah, Ibeju-Lekki). This engine resolves **Tier 1 first**,
so those pickups keep Tier 1 banded rates; other Eti-Osa / inner-metro pickups that
miss a Tier-1 box use Tier 2 flat via ``lagride_t2_mainland``.

Verification overlays (optional, on top of baseline)
----------------------------------------------------
• **Sky Mall** 0–3 km: calibrated ₦/km = ₦4,896 ÷ 2.7 km.

• **Peace Garden** pickup: Ikorodu / Ikeja dropoff corridors use calibrated ₦/km
  (see ``PEACE_GARDEN_TO_*`` constants). Special corridors are not overridden by the ₦540 long-haul card.

SERVICE MULTIPLIERS — **removed** (always 1.0× for all tiers)
----------------------------------------------------------------------------------------
Standard / XL / Comfort / Premium use the same distance + time math.

SURGE — morning & evening only (does not exist at other times)
---------------------------------------------------------------------------------
• Outside 07:00–09:00 and 17:00–20:00 WAT: **no surge** (factor omitted from fare)

• Morning surge (WAT 07:00–09:00): **1.3×**

• Evening surge (WAT 17:00–20:00): **1.3×**

• High demand / rain: **off** (do not stack)

Drivers are notified (phone push + in-app Activity) when a surge window opens.

WORKED EXAMPLES (product sheet vs this engine)
----------------------------------------------
Illustrative **Standard / Premium** trips at **1.0× surge**. Rounded to whole ₦.

**Ex 1 — Sky Mall, 2.7 km, Standard** — Sheet: ``2.7 × ₦1,850 × 1.0`` → ₦4,995, observed
≈ **₦4,896**. Engine: **Sky Mall** sub-zone uses calibrated **₦4,896 ÷ 2.7** ₦/km so total
**₦4,896** (not ₦1,850/km on that strip).

**Ex 2 — Lekki, 21.65 km, Standard** — ``21.65 × ₦540`` (+ time) × market → market-aligned long haul.

**Ex 3 — Festac, 50.43 km, Standard** — ``50.43 × ₦540`` (+ time) × market.

**Ex 4 — Peace Garden → Ikorodu, 18 km, Standard** — Tier-2 / PG corridor at **₦1,400/km**.

**Ex 5 — 18 km, Premium (long-trip 1.10×)** — Generic Tier-2 pickup uses 15+ area band
₦540/km. Peace Garden → Ikorodu keeps corridor ₦1,400/km × **1.10×**.

IMPLEMENTATION (10 steps) — for Lagos, ``build_lagos_lagride_fare_breakdown`` attaches
``lagride_profile`` with ``implementation_checklist`` mirroring:

1. Get pickup coordinates
2. Determine area tier
3. Get distance from Google Maps Directions / Routes (driving km — not crow-fly)
4. Determine distance range (0–3, 3–15, or 15+ for Tier 1; Tier 2 all distances)
5. Select appropriate ₦/km area rate (baseline + optional calibrations)
6. Apply service multiplier
7. Apply surge multiplier
8. Calculate: Distance × Rate × Service × Surge (rounded to whole ₦)
9. Display to rider (``total_fare``, ``price_breakdown``, surge fields)
10. Pass ``fare_bucket`` to driver

API note: ``POST /fare/estimate`` merges ``route_metrics_source`` and ``road_route_ok`` into
``lagride_profile`` when present.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from nexryde_pricing import append_stop_time_breakdown_suffix, nexryde_route_time_minutes
from fare_config import FARE_CONFIG

# ── AREA RATES: Tier 1 banded baseline (₦/km) ───────────────────────────────
TIER1_RATE_0_3_KM = 1850.0
TIER1_RATE_3_15_KM = 700.0
# Long haul (15+ km) — cut ₦660 → ₦540 so Sangotedo↔VI-class trips sit near competitor ~₦18k Standard.
TIER1_RATE_15_PLUS_KM = 540.0
# Tier-1 trips under 3 km: zone-specific benchmark ÷ sample km (short budget samples).
TIER1_0_3_CALIBRATED_RATES_BY_ZONE: dict[str, float] = {
    "lagride_t1_sky_mall": 4896 / 2.7,
}
# Optional per-zone 15+ overlays (empty = use TIER1_RATE_15_PLUS_KM citywide).
TIER1_15_PLUS_RATES_BY_ZONE: dict[str, float] = {}
# Tier 2 mid — moderate step-down Jul 2026: ₦3,255 → ₦3,000 → ₦2,600 → ₦1,400/km.
TIER2_FLAT_PER_KM = 1400.0
# Peace Garden ↔ Ikorodu corridor aligned to Tier-2 mid.
PEACE_GARDEN_TO_IKORODU_PER_KM = 1400.0
PEACE_GARDEN_TO_IKEJA_PER_KM = 48236 / 18.0  # legacy reference; live Ikeja corridor uses satellite rate below
# North satellite (Ikorodu / Peace Garden) ↔ Ikeja — moderate soften ₦950 → ₦780.
LAGOS_IKORODU_IKEJA_CORRIDOR_PER_KM = 780.0

# City-wide fare factor — removed (always 1.0).
LAGOS_MARKET_WIDE_FARE_MULTIPLIER = 1.0

# Sangotedo / Ajah axis ↔ Ikorodu — restore old Standard ceiling ₦39,547 @ 63.64 km.
_LAGRIDE_SANGOTEDO_IKORODU_SAMPLE_KM = 63.64
_LAGRIDE_SANGOTEDO_IKORODU_STD_PROMO_NGN = 39_547.0
LAGOS_SANGOTEDO_IKORODU_CORRIDOR_PER_KM = _LAGRIDE_SANGOTEDO_IKORODU_STD_PROMO_NGN / (
    _LAGRIDE_SANGOTEDO_IKORODU_SAMPLE_KM * LAGOS_MARKET_WIDE_FARE_MULTIPLIER
)
# Service multipliers removed — all tiers 1.0×.
_LAGRIDE_SANGOTEDO_XL_M = 1.0
_LAGRIDE_SANGOTEDO_COMFORT_M = 1.0
_LAGRIDE_SANGOTEDO_PREMIUM_M = 1.0
LAGOS_SANGOTEDO_IKORODU_SERVICE_MULTIPLIERS: dict[str, float] = {
    "economy": 1.0,
    "standard": 1.0,
    "ev": 1.0,
    "xl": _LAGRIDE_SANGOTEDO_XL_M,
    "comfort": _LAGRIDE_SANGOTEDO_COMFORT_M,
    "premium": _LAGRIDE_SANGOTEDO_PREMIUM_M,
    "pro": _LAGRIDE_SANGOTEDO_PREMIUM_M,
    "executive": _LAGRIDE_SANGOTEDO_PREMIUM_M,
}
LAGOS_SANGOTEDO_IKORODU_TIER_CEILINGS: dict[str, float] = {
    "economy": _LAGRIDE_SANGOTEDO_IKORODU_STD_PROMO_NGN,
    "standard": _LAGRIDE_SANGOTEDO_IKORODU_STD_PROMO_NGN,
    "ev": _LAGRIDE_SANGOTEDO_IKORODU_STD_PROMO_NGN,
    "xl": round(_LAGRIDE_SANGOTEDO_IKORODU_STD_PROMO_NGN * _LAGRIDE_SANGOTEDO_XL_M),
    "comfort": round(_LAGRIDE_SANGOTEDO_IKORODU_STD_PROMO_NGN * _LAGRIDE_SANGOTEDO_COMFORT_M),
    "premium": round(_LAGRIDE_SANGOTEDO_IKORODU_STD_PROMO_NGN * _LAGRIDE_SANGOTEDO_PREMIUM_M),
    "pro": round(_LAGRIDE_SANGOTEDO_IKORODU_STD_PROMO_NGN * _LAGRIDE_SANGOTEDO_PREMIUM_M),
    "executive": round(_LAGRIDE_SANGOTEDO_IKORODU_STD_PROMO_NGN * _LAGRIDE_SANGOTEDO_PREMIUM_M),
}

# SERVICE MULTIPLIERS — removed (flat 1.0 for every tier / distance band).
LAGRIDE_SERVICE_PRO = 1.0
LAGRIDE_SERVICE_STANDARD = 1.0
LAGRIDE_SERVICE_EV = 1.0
LAGRIDE_VERY_SHORT_MAX_KM = 5.0
LAGRIDE_LONG_TRIP_SERVICE_KM = 15.0
_FLAT_SERVICE = {
    "economy": 1.0,
    "standard": 1.0,
    "ev": 1.0,
    "xl": 1.0,
    "comfort": 1.0,
    "premium": 1.0,
    "pro": 1.0,
    "executive": 1.0,
}
LAGRIDE_VERY_SHORT_SERVICE_MULTIPLIERS: dict[str, float] = dict(_FLAT_SERVICE)
LAGRIDE_SHORT_TRIP_SERVICE_MULTIPLIERS: dict[str, float] = dict(_FLAT_SERVICE)
LAGRIDE_LONG_TRIP_SERVICE_MULTIPLIERS: dict[str, float] = dict(_FLAT_SERVICE)

# SURGE — smart morning/evening only (see surge_pricing.SMART_SURGE_MULTIPLIER).
NORMAL_SURGE_LAGride = 1.0
HIGH_DEMAND_SURGE = 1.0  # disabled
RAIN_SURGE_LAGride = 1.0  # disabled
PEAK_SURGE_LAGride = 1.3  # smart surge hours

# Hard ceiling on Lagos trip total (economy baseline); surge applied before cap in breakdown.
LAGOS_MAX_TRIP_FARE_NGN = 100_000.0

# When rider adds an intermediate stop, bill driving time at the service tier per-minute card
# (distance×area Lagride formula unchanged; time is additive only for stop trips).
def lagos_stop_time_per_min(service_key: str) -> float:
    """Service-tier per-minute card (used for display / stop overlays)."""
    sk = (service_key or "economy").strip().lower()
    if sk == "standard":
        sk = "economy"
    if sk == "pro":
        sk = "premium"
    row = FARE_CONFIG.get("lagos", {}).get(sk) or FARE_CONFIG["lagos"]["economy"]
    return float(row.get("per_min", 80))


def lagos_route_time_per_min_baseline() -> float:
    """Economy per-minute — time line is scaled by service multiplier with distance."""
    return lagos_stop_time_per_min("economy")


def lagos_stop_time_fee(service_key: str, route_time_min: int) -> float:
    mins = max(0, int(route_time_min))
    if mins <= 0:
        return 0.0
    return round(mins * lagos_stop_time_per_min(service_key), 2)


def lagos_route_time_line(route_time_min: int) -> float:
    """₦ time component before service × market (economy per-min × minutes)."""
    mins = max(0, int(route_time_min))
    if mins <= 0:
        return 0.0
    return round(mins * lagos_route_time_per_min_baseline(), 2)

# Above this ₦/km, long trips (>20 km) taper toward Tier-1 15+ band.
LAGOS_LONG_HAUL_TAPER_KM = 20.0

# Response / analytics id for Lagos Lagride payloads
LAGOS_LAGPRIDE_SPEC_ID = "lagride_lagos_exact_v1"

# Shown in rider apps / ``lagride_profile`` (marketing; keep competitor-neutral).
LAGOS_RIDER_VALUE_SUMMARY = (
    "NEXRYDE Lagos fares follow real driving distance × area rate (+ time). "
    "No surprise multipliers — smart surge only applies 7–9 AM and 5–8 PM."
)


def _in_box(lat: float, lng: float, lat0: float, lat1: float, lng0: float, lng1: float) -> bool:
    return lat0 <= lat <= lat1 and lng0 <= lng <= lng1


def _lagos_metro_bounds(lat: float, lng: float) -> bool:
    return _in_box(lat, lng, 6.32, 6.74, 2.95, 3.98)


def _t1_premium_island(lat: float, lng: float) -> bool:
    # VI, Ikoyi, Banana Island (Tier 1)
    return _in_box(lat, lng, 6.415, 6.485, 3.345, 3.458)


def _t1_sky_mall(lat: float, lng: float) -> bool:
    # Sky Mall / Jakande Lekki retail cluster (narrow — before generic Lekki corridor)
    return _in_box(lat, lng, 6.426, 6.456, 3.488, 3.532)


def _t1_lekki_corridor(lat: float, lng: float) -> bool:
    # Lekki (Tier 1) — Phase 1 axis; Sky Mall sub-box handled first
    return _in_box(lat, lng, 6.425, 6.54, 3.455, 3.58)


def _t1_ajah_sangotedo(lat: float, lng: float) -> bool:
    # Ajah / Sangotedo (Tier 1)
    return _in_box(lat, lng, 6.42, 6.52, 3.58, 3.74)


def _t1_yaba(lat: float, lng: float) -> bool:
    return _in_box(lat, lng, 6.495, 6.525, 3.365, 3.408)


def _t1_surulere(lat: float, lng: float) -> bool:
    return _in_box(lat, lng, 6.475, 6.525, 3.328, 3.372)


def _t1_ojuelegba(lat: float, lng: float) -> bool:
    return _in_box(lat, lng, 6.503, 6.518, 3.338, 3.362)


def _t1_festac(lat: float, lng: float) -> bool:
    return _in_box(lat, lng, 6.465, 6.535, 3.195, 3.285)


def _t1_gbagada(lat: float, lng: float) -> bool:
    return _in_box(lat, lng, 6.535, 6.575, 3.375, 3.425)


def _t1_magodo(lat: float, lng: float) -> bool:
    return _in_box(lat, lng, 6.632, 6.695, 3.365, 3.415)


def _t1_ibeju_lekki(lat: float, lng: float) -> bool:
    return _in_box(lat, lng, 6.44, 6.58, 3.74, 4.02)


def _t2_badagry(lat: float, lng: float) -> bool:
    return lng <= 3.06 and 6.34 <= lat <= 6.58


def _t2_epe(lat: float, lng: float) -> bool:
    return lng >= 3.76 and 6.45 <= lat <= 6.78


def _t2_ikorodu(lat: float, lng: float) -> bool:
    return _in_box(lat, lng, 6.54, 6.78, 3.44, 3.66)


def _t2_ikeja(lat: float, lng: float) -> bool:
    return _in_box(lat, lng, 6.575, 6.635, 3.305, 3.375)


def _t2_berger(lat: float, lng: float) -> bool:
    return _in_box(lat, lng, 6.665, 6.735, 3.345, 3.395)


def _t2_peace_garden(lat: float, lng: float) -> bool:
    # Peace Estate / Isheri–Magodo axis (approx)
    return _in_box(lat, lng, 6.595, 6.655, 3.475, 3.545)


def classify_lagos_lagride_pickup(pickup_lat: float | None, pickup_lng: float | None) -> tuple[int, str]:
    """
    Returns (tier, zone_label).

    **Tier 1** — AREA RATES 0–3 / 3–15 / 15+ km (₦1,850 / ₦700 / ₦540 baseline).
    **Tier 2** — mid ₦1,400/km (``TIER2_FLAT_PER_KM``), except Peace Garden + dropoff overlays.

    Tier 1 polygons are evaluated **before** Tier 2 so overlapping areas (e.g. Eti-Osa
    vs Lekki/VI) resolve to Tier 1 when inside a Tier-1 box.
    """
    if pickup_lat is None or pickup_lng is None:
        return 2, "lagride_t2_pickup_unknown"

    lat, lng = float(pickup_lat), float(pickup_lng)

    if not _lagos_metro_bounds(lat, lng):
        return 2, "lagride_t2_outside_metro_bbox"

    # Tier 1 — named suburban / island / corridor pickups (order: specific → broad)
    if _t1_premium_island(lat, lng):
        return 1, "lagride_t1_vi_ikoyi_banana"
    if _t1_sky_mall(lat, lng):
        return 1, "lagride_t1_sky_mall"
    if _t1_lekki_corridor(lat, lng):
        return 1, "lagride_t1_lekki"
    if _t1_ajah_sangotedo(lat, lng):
        return 1, "lagride_t1_ajah_sangotedo"
    if _t1_yaba(lat, lng):
        return 1, "lagride_t1_yaba"
    if _t1_surulere(lat, lng):
        return 1, "lagride_t1_surulere"
    if _t1_ojuelegba(lat, lng):
        return 1, "lagride_t1_ojuelegba"
    if _t1_festac(lat, lng):
        return 1, "lagride_t1_festac"
    if _t1_gbagada(lat, lng):
        return 1, "lagride_t1_gbagada"
    if _t1_magodo(lat, lng):
        return 1, "lagride_t1_magodo"
    if _t1_ibeju_lekki(lat, lng):
        return 1, "lagride_t1_ibeju_lekki"

    # Tier 2 — far / premium pickup bands (only if not Tier 1).
    # Peace Garden / Berger before broad Ikorodu–Ikeja boxes (overlapping geometries).
    if _t2_badagry(lat, lng):
        return 2, "lagride_t2_badagry"
    if _t2_epe(lat, lng):
        return 2, "lagride_t2_epe"
    if _t2_peace_garden(lat, lng):
        return 2, "lagride_t2_peace_garden"
    if _t2_berger(lat, lng):
        return 2, "lagride_t2_berger"
    if _t2_ikeja(lat, lng):
        return 2, "lagride_t2_ikeja"
    if _t2_ikorodu(lat, lng):
        return 2, "lagride_t2_ikorodu"

    return 2, "lagride_t2_mainland"


def _north_satellite_zone(lat: float, lng: float) -> bool:
    """Ikorodu axis + Peace Garden (overlapping north-mainland pickup band)."""
    return _t2_ikorodu(lat, lng) or _t2_peace_garden(lat, lng)


def sangotedo_ikorodu_corridor_rate_per_km(
    pickup_lat: float | None,
    pickup_lng: float | None,
    dropoff_lat: float | None,
    dropoff_lng: float | None,
) -> float | None:
    """Bidirectional Sangotedo / Ajah ↔ Ikorodu at Lagride-aligned long-haul ₦/km."""
    if pickup_lat is None or pickup_lng is None or dropoff_lat is None or dropoff_lng is None:
        return None
    plat, plng = float(pickup_lat), float(pickup_lng)
    dlat, dlng = float(dropoff_lat), float(dropoff_lng)
    if (_t1_ajah_sangotedo(plat, plng) and _t2_ikorodu(dlat, dlng)) or (
        _t2_ikorodu(plat, plng) and _t1_ajah_sangotedo(dlat, dlng)
    ):
        return LAGOS_SANGOTEDO_IKORODU_CORRIDOR_PER_KM
    return None


def ikorodu_ikeja_corridor_rate_per_km(
    pickup_lat: float | None,
    pickup_lng: float | None,
    dropoff_lat: float | None,
    dropoff_lng: float | None,
) -> float | None:
    """Bidirectional Ikorodu / Peace Garden ↔ Ikeja at bookable satellite ₦/km."""
    if pickup_lat is None or pickup_lng is None or dropoff_lat is None or dropoff_lng is None:
        return None
    plat, plng = float(pickup_lat), float(pickup_lng)
    dlat, dlng = float(dropoff_lat), float(dropoff_lng)
    if (_north_satellite_zone(plat, plng) and _t2_ikeja(dlat, dlng)) or (
        _t2_ikeja(plat, plng) and _north_satellite_zone(dlat, dlng)
    ):
        return LAGOS_IKORODU_IKEJA_CORRIDOR_PER_KM
    return None


def peace_garden_destination_rate_per_km(
    dropoff_lat: float | None, dropoff_lng: float | None
) -> float | None:
    """Peace Garden pickup → Ikorodu / Ikeja dropoff corridor; ``None`` if not matched."""
    if dropoff_lat is None or dropoff_lng is None:
        return None
    lat, lng = float(dropoff_lat), float(dropoff_lng)
    if _t2_ikorodu(lat, lng):
        return PEACE_GARDEN_TO_IKORODU_PER_KM
    if _t2_ikeja(lat, lng):
        return LAGOS_IKORODU_IKEJA_CORRIDOR_PER_KM
    return None


def peace_garden_corridor_rate_per_km(
    pickup_lat: float | None,
    pickup_lng: float | None,
    dropoff_lat: float | None,
    dropoff_lng: float | None,
) -> float | None:
    """Bidirectional Peace Garden ↔ Ikorodu / Ikeja calibrated ₦/km when both ends match."""
    if pickup_lat is None or pickup_lng is None or dropoff_lat is None or dropoff_lng is None:
        return None
    plat, plng = float(pickup_lat), float(pickup_lng)
    dlat, dlng = float(dropoff_lat), float(dropoff_lng)
    ikeja_corridor = ikorodu_ikeja_corridor_rate_per_km(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng)
    if ikeja_corridor is not None:
        return ikeja_corridor
    pg_pick = _t2_peace_garden(plat, plng)
    pg_drop = _t2_peace_garden(dlat, dlng)
    if pg_pick and _t2_ikorodu(dlat, dlng):
        return PEACE_GARDEN_TO_IKORODU_PER_KM
    if pg_drop and _t2_ikorodu(plat, plng):
        return PEACE_GARDEN_TO_IKORODU_PER_KM
    return None


def _apply_lagos_long_haul_taper(distance_km: float, rate_per_km: float) -> float:
    """High ₦/km cards taper after 20 km so long routes stay in the formula family."""
    d = max(0.0, float(distance_km))
    rate = float(rate_per_km)
    if rate <= TIER1_RATE_15_PLUS_KM * 1.15:
        return rate
    if d <= LAGOS_LONG_HAUL_TAPER_KM:
        return rate
    tapered = rate * (LAGOS_LONG_HAUL_TAPER_KM / d)
    return max(TIER1_RATE_15_PLUS_KM, tapered)


def lagride_tier2_rate_per_km(distance_km: float) -> float:
    """Tier 2 banded — same distance structure as Tier 1; 3–15 km keeps premium flat card."""
    d = max(0.0, float(distance_km))
    if d < 3.0:
        return TIER1_RATE_0_3_KM
    if d < 15.0:
        return TIER2_FLAT_PER_KM
    return TIER1_RATE_15_PLUS_KM


def _one_way_lagos_area_rate_per_km(
    tier: int,
    distance_km: float,
    zone_label: str,
    other_lat: float | None,
    other_lng: float | None,
    *,
    pickup_lat: float | None = None,
    pickup_lng: float | None = None,
    dropoff_lat: float | None = None,
    dropoff_lng: float | None = None,
) -> float:
    """₦/km for one direction: this end is pickup, other end is dropoff."""
    z = (zone_label or "").strip()
    d = max(0.0, float(distance_km))
    sangotedo_corridor = sangotedo_ikorodu_corridor_rate_per_km(
        pickup_lat, pickup_lng, dropoff_lat, dropoff_lng
    )
    if sangotedo_corridor is not None:
        return sangotedo_corridor
    corridor = peace_garden_corridor_rate_per_km(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng)
    if corridor is not None and (z == "lagride_t2_peace_garden" or z == "lagride_t2_ikorodu" or z == "lagride_t2_ikeja"):
        return _apply_lagos_long_haul_taper(d, corridor)
    if tier == 2 and z == "lagride_t2_peace_garden":
        pg = peace_garden_destination_rate_per_km(other_lat, other_lng)
        if pg is not None:
            return _apply_lagos_long_haul_taper(d, pg)
    if tier == 1:
        return lagride_tier1_rate_per_km(d, zone_label)
    return _apply_lagos_long_haul_taper(d, lagride_tier2_rate_per_km(d))


def lagride_lagos_symmetric_area_rate_per_km(
    distance_km: float,
    pickup_lat: float | None,
    pickup_lng: float | None,
    dropoff_lat: float | None,
    dropoff_lng: float | None,
) -> tuple[float, dict[str, Any]]:
    """
    Same ₦/km for A→B and B→A at equal distance: min(forward one-way, reverse one-way).
    """
    tier_a, zone_a = classify_lagos_lagride_pickup(pickup_lat, pickup_lng)
    tier_b, zone_b = classify_lagos_lagride_pickup(dropoff_lat, dropoff_lng)
    d = max(0.0, float(distance_km))

    rate_ab = _one_way_lagos_area_rate_per_km(
        tier_a,
        d,
        zone_a,
        dropoff_lat,
        dropoff_lng,
        pickup_lat=pickup_lat,
        pickup_lng=pickup_lng,
        dropoff_lat=dropoff_lat,
        dropoff_lng=dropoff_lng,
    )
    rate_ba = _one_way_lagos_area_rate_per_km(
        tier_b,
        d,
        zone_b,
        pickup_lat,
        pickup_lng,
        pickup_lat=dropoff_lat,
        pickup_lng=dropoff_lng,
        dropoff_lat=pickup_lat,
        dropoff_lng=pickup_lng,
    )
    effective = min(rate_ab, rate_ba)
    return effective, {
        "symmetric_fare": rate_ab != rate_ba,
        "rate_forward_km": round(rate_ab, 4),
        "rate_reverse_km": round(rate_ba, 4),
        "pickup_zone": zone_a,
        "dropoff_zone": zone_b,
    }


def lagride_tier1_rate_per_km(distance_km: float, zone_label: str = "") -> float:
    d = max(0.0, float(distance_km))
    z = (zone_label or "").strip()
    if d < 3.0:
        if z in TIER1_0_3_CALIBRATED_RATES_BY_ZONE:
            return TIER1_0_3_CALIBRATED_RATES_BY_ZONE[z]
        return TIER1_RATE_0_3_KM
    if d < 15.0:
        return TIER1_RATE_3_15_KM
    if z in TIER1_15_PLUS_RATES_BY_ZONE:
        return TIER1_15_PLUS_RATES_BY_ZONE[z]
    return TIER1_RATE_15_PLUS_KM


def lagride_lagos_area_rate_per_km(
    tier: int,
    distance_km: float,
    zone_label: str = "",
    dropoff_lat: float | None = None,
    dropoff_lng: float | None = None,
    pickup_lat: float | None = None,
    pickup_lng: float | None = None,
) -> float:
    """₦/km; when pickup+dropoff coords exist, uses symmetric min(A→B, B→A)."""
    if (
        pickup_lat is not None
        and pickup_lng is not None
        and dropoff_lat is not None
        and dropoff_lng is not None
    ):
        rate, _meta = lagride_lagos_symmetric_area_rate_per_km(
            distance_km, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng
        )
        return rate
    return _one_way_lagos_area_rate_per_km(
        tier,
        distance_km,
        zone_label,
        dropoff_lat,
        dropoff_lng,
        pickup_lat=pickup_lat,
        pickup_lng=pickup_lng,
        dropoff_lat=dropoff_lat,
        dropoff_lng=dropoff_lng,
    )


def lagride_distance_band_key(tier: int, distance_km: float) -> str:
    """Tier 1 & 2: 0–3 / 3–15 / 15+ km bands."""
    d = max(0.0, float(distance_km))
    if tier == 2:
        if d < 3.0:
            return "tier2_0_3_km"
        if d < 15.0:
            return "tier2_3_15_km"
        return "tier2_15_plus_km"
    if d < 3.0:
        return "0_3_km"
    if d < 15.0:
        return "3_15_km"
    return "15_plus_km"


def lagride_rate_source_descriptor(
    tier: int,
    zone: str,
    distance_km: float,
    _effective_rate_per_km: float,
    dropoff_lat: float | None,
    dropoff_lng: float | None,
) -> str:
    """Slug for analytics: baseline vs calibration overlays."""
    z = (zone or "").strip()
    d = max(0.0, float(distance_km))
    if tier == 2:
        if z == "lagride_t2_peace_garden":
            pg = peace_garden_destination_rate_per_km(dropoff_lat, dropoff_lng)
            if pg == PEACE_GARDEN_TO_IKORODU_PER_KM:
                return "peace_garden_to_ikorodu_route_rate"
            if pg == PEACE_GARDEN_TO_IKEJA_PER_KM:
                return "peace_garden_to_ikeja_route_rate"
        return "tier2_flat_1400"
    if d < 3.0 and z == "lagride_t1_sky_mall":
        return "tier1_sky_mall_short_trip_calibrated"
    if d < 3.0:
        return "tier1_0_3_baseline_1850"
    if d < 15.0:
        return "tier1_3_15_baseline_700"
    if z in TIER1_15_PLUS_RATES_BY_ZONE:
        return "tier1_15_plus_corridor_calibrated"
    return "tier1_15_plus_baseline_540"


def build_lagride_profile_payload(
    *,
    tier: int,
    zone: str,
    distance_km: float,
    rate: float,
    service_key: str,
    svc_m: float,
    surge_m: float,
    demand_ratio: float,
    fare_bucket: str,
    pickup_lat: float | None,
    pickup_lng: float | None,
    dropoff_lat: float | None,
    dropoff_lng: float | None,
    total_fare: float,
) -> dict[str, Any]:
    """Structured audit trail for rider/driver apps and support (Lagos only)."""
    d = max(0.0, float(distance_km))
    band = lagride_distance_band_key(tier, d)
    src = lagride_rate_source_descriptor(tier, zone, d, rate, dropoff_lat, dropoff_lng)
    has_pu = pickup_lat is not None and pickup_lng is not None
    has_do = dropoff_lat is not None and dropoff_lng is not None
    lm = float(LAGOS_MARKET_WIDE_FARE_MULTIPLIER)
    if float(surge_m) > 1.0001:
        formula = "Price = (Distance × Area_Rate + Time × Per_Min) × Smart_Surge_1.3"
    else:
        formula = "Price = Distance × Area_Rate + Time × Per_Min"
    return {
        "spec_id": LAGOS_LAGPRIDE_SPEC_ID,
        "rider_value_summary": LAGOS_RIDER_VALUE_SUMMARY,
        "formula": formula,
        "lagos_market_multiplier": lm,
        "no_base_fare": True,
        "pure_distance_based": True,
        "pickup_tier": tier,
        "pickup_zone_key": zone,
        "distance_band": band,
        "area_rate_ngn_per_km": round(rate, 6),
        "rate_source": src,
        "service_key": (service_key or "economy").strip().lower(),
        "service_multiplier": svc_m,
        "surge_multiplier": surge_m,
        "demand_ratio": round(max(0.0, min(1.0, float(demand_ratio))), 4),
        "fare_bucket": fare_bucket,
        "total_fare_computed": float(total_fare),
        "pickup_coordinates_resolved": has_pu,
        "dropoff_coordinates_resolved": has_do,
        "implementation_checklist": [
            {"step": 1, "name": "Get pickup coordinates", "status": "ok" if has_pu else "missing"},
            {"step": 2, "name": "Determine area tier", "status": "ok", "tier": tier, "zone": zone},
            {
                "step": 3,
                "name": "Road distance (Google Directions / Routes)",
                "status": "ok" if d > 0 else "missing",
                "distance_km": round(d, 4),
            },
            {"step": 4, "name": "Distance range", "status": "ok", "band": band},
            {"step": 5, "name": "Select area rate ₦/km", "status": "ok", "ngn_per_km": round(rate, 4), "source": src},
            {"step": 6, "name": "Service multiplier", "status": "removed", "value": 1.0},
            {
                "step": 7,
                "name": "Apply smart surge (morning/evening only)",
                "status": "ok" if float(surge_m) > 1.0001 else "skipped_off_peak",
                "value": surge_m if float(surge_m) > 1.0001 else None,
            },
            {
                "step": 8,
                "name": "Calculate total",
                "status": "ok",
                "note": (
                    "round((distance×rate + time) × 1.3) in ₦"
                    if float(surge_m) > 1.0001
                    else "round(distance×rate + time) in ₦ — no surge off-peak"
                ),
            },
            {
                "step": 9,
                "name": "Display to rider",
                "status": "ok",
                "fields": ["total_fare", "price_breakdown", "surge_multiplier", "surge_factors"],
            },
            {"step": 10, "name": "Pass fare_bucket to driver", "status": "ok", "fare_bucket": fare_bucket},
        ],
    }


def _normalize_lagos_service_key(service_key: str) -> str:
    k = (service_key or "economy").strip().lower()
    if k == "standard":
        return "economy"
    if k == "pro":
        return "premium"
    # Omni/budget are not NEXRYDE vehicles — treat as Standard.
    if k in ("omni", "budget"):
        return "economy"
    return k


def sangotedo_ikorodu_corridor_service_multiplier(service_key: str) -> float:
    """Service tier multiplier on Sangotedo ↔ Ikorodu corridor only."""
    k = _normalize_lagos_service_key(service_key)
    return float(LAGOS_SANGOTEDO_IKORODU_SERVICE_MULTIPLIERS.get(k, 1.0))


def sangotedo_ikorodu_corridor_tier_ceiling(service_key: str) -> float | None:
    k = _normalize_lagos_service_key(service_key)
    cap = LAGOS_SANGOTEDO_IKORODU_TIER_CEILINGS.get(k)
    return float(cap) if cap is not None else None


def lagride_lagos_service_multiplier(
    service_key: str,
    *,
    pickup_lat: float | None = None,
    pickup_lng: float | None = None,
    dropoff_lat: float | None = None,
    dropoff_lng: float | None = None,
    distance_km: float | None = None,
) -> float:
    """
    Scale the distance×area line by NEXRYDE Lagos tier.

    Currently all tiers return **1.0×** (multipliers disabled for clear base pricing).
    ``standard`` → economy. ``pro`` → premium. ``omni`` / ``budget`` → economy. ``ev`` → 1.0×.
    """
    if sangotedo_ikorodu_corridor_rate_per_km(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng) is not None:
        return sangotedo_ikorodu_corridor_service_multiplier(service_key)

    k = _normalize_lagos_service_key(service_key)
    if k == "ev":
        return float(LAGRIDE_SERVICE_EV)

    d = max(0.0, float(distance_km)) if distance_km is not None else None
    if d is not None and d >= LAGRIDE_LONG_TRIP_SERVICE_KM:
        return float(LAGRIDE_LONG_TRIP_SERVICE_MULTIPLIERS.get(k, LAGRIDE_SERVICE_STANDARD))
    if d is not None and d <= LAGRIDE_VERY_SHORT_MAX_KM:
        return float(LAGRIDE_VERY_SHORT_SERVICE_MULTIPLIERS.get(k, LAGRIDE_SERVICE_STANDARD))
    if d is not None:
        return float(LAGRIDE_SHORT_TRIP_SERVICE_MULTIPLIERS.get(k, LAGRIDE_SERVICE_STANDARD))

    # No distance context (tests / legacy): use mid short ladder (5–15).
    return float(LAGRIDE_SHORT_TRIP_SERVICE_MULTIPLIERS.get(k, LAGRIDE_SERVICE_STANDARD))


def _lagride_lagos_surge_payload(
    *,
    demand_ratio: float,
    is_raining: bool,
    is_morning_peak: bool,
    is_evening_peak: bool,
    service_max_multiplier: float,
) -> dict[str, Any]:
    """
    Smart surge only during morning/evening WAT windows (1.3×).
    Outside those windows: no surge — omitted from breakdown (engine uses 1.0 internally).
    """
    _ = demand_ratio, is_raining  # intentionally unused — peak-only policy

    applied: list[tuple[str, float]] = []
    candidates: list[float] = [1.0]
    window_ends_label = None
    active_window = None

    if is_morning_peak:
        candidates.append(float(PEAK_SURGE_LAGride))
        applied.append(("Morning surge (7–9 AM)", float(PEAK_SURGE_LAGride)))
        active_window = "Morning surge (7–9 AM)"
        window_ends_label = "9:00 AM"
    elif is_evening_peak:
        candidates.append(float(PEAK_SURGE_LAGride))
        applied.append(("Evening surge (5–8 PM)", float(PEAK_SURGE_LAGride)))
        active_window = "Evening surge (5–8 PM)"
        window_ends_label = "8:00 PM"

    raw_max = max(candidates)
    final = min(raw_max, float(service_max_multiplier))
    is_peak = is_morning_peak or is_evening_peak
    peak_type = "morning_rush" if is_morning_peak else ("evening_peak" if is_evening_peak else None)
    is_surge = final > 1.0001

    factors = [{"label": lbl, "multiplier": round(mult, 3)} for lbl, mult in applied]

    return {
        # Engine always needs a numeric factor; public API omits surge off-peak.
        "multiplier": round(final, 2),
        "uncapped_multiplier": round(raw_max, 2) if is_surge else None,
        "pre_cap_combined": round(raw_max, 4) if is_surge else None,
        "service_cap": float(service_max_multiplier),
        "is_surge": is_surge,
        "tier": "low" if is_surge else "none",
        "tier_label": "Smart surge hours" if is_surge else None,
        "tier_color": "#F59E0B" if is_surge else None,
        "pct_extra": round((final - 1.0) * 100) if is_surge else 0,
        "reasons": [lbl for lbl, m in applied if m > 1.0001] if is_surge else [],
        "factors": factors,
        "active_window": active_window,
        "window_ends_label": window_ends_label,
        "driver_message": "",
        "rider_message": "",
        "expires_in_minutes": 5 if is_surge else 0,
        "is_peak": is_peak,
        "peak_type": peak_type,
    }


def lagride_fare_bucket_label(
    tier: int,
    distance_km: float,
    zone_label: str = "",
    dropoff_lat: float | None = None,
    dropoff_lng: float | None = None,
    pickup_lat: float | None = None,
    pickup_lng: float | None = None,
) -> str:
    d = float(distance_km)
    z = (zone_label or "").strip()
    if sangotedo_ikorodu_corridor_rate_per_km(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng) is not None:
        return "lagride_t1_sangotedo_ikorodu_corridor"
    if ikorodu_ikeja_corridor_rate_per_km(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng) is not None:
        return "lagride_t2_ikorodu_ikeja_corridor"
    if tier == 2 and z == "lagride_t2_peace_garden":
        pg = peace_garden_destination_rate_per_km(dropoff_lat, dropoff_lng)
        if pg == PEACE_GARDEN_TO_IKORODU_PER_KM:
            return "lagride_t2_peace_garden_to_ikorodu"
        if pg == LAGOS_IKORODU_IKEJA_CORRIDOR_PER_KM:
            return "lagride_t2_ikorodu_ikeja_corridor"
    if tier == 1:
        if d < 3.0:
            return "lagride_t1_0_3_km"
        if d < 15.0:
            return "lagride_t1_3_15_km"
        return "lagride_t1_15_plus_km"
    if d < 3.0:
        return "lagride_t2_0_3_km"
    if d < 15.0:
        return "lagride_t2_3_15_km"
    return "lagride_t2_15_plus_km"


def build_lagos_lagride_fare_breakdown(
    *,
    distance_km: float,
    duration_min: int,
    traffic_duration_min: int,
    service_key: str,
    demand_ratio: float,
    is_raining: bool,
    pickup_lat: float | None,
    pickup_lng: float | None,
    max_multiplier: float,
    cancellation_fee: float,
    min_fare: float,
    short_trip_threshold_km: float,
    dropoff_lat: float | None = None,
    dropoff_lng: float | None = None,
    has_intermediate_stop: bool = False,
) -> dict[str, Any]:
    """Full-shaped dict compatible with ``server.calculate_fare`` / fare estimate."""
    route_time_min = nexryde_route_time_minutes(duration_min, traffic_duration_min)
    tier, zone = classify_lagos_lagride_pickup(pickup_lat, pickup_lng)
    if (
        pickup_lat is not None
        and pickup_lng is not None
        and dropoff_lat is not None
        and dropoff_lng is not None
    ):
        rate, sym_meta = lagride_lagos_symmetric_area_rate_per_km(
            distance_km, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng
        )
    else:
        rate = _one_way_lagos_area_rate_per_km(
            tier,
            distance_km,
            zone,
            dropoff_lat,
            dropoff_lng,
            pickup_lat=pickup_lat,
            pickup_lng=pickup_lng,
            dropoff_lat=dropoff_lat,
            dropoff_lng=dropoff_lng,
        )
        sym_meta = {
            "symmetric_fare": False,
            "rate_forward_km": round(rate, 4),
            "rate_reverse_km": round(rate, 4),
            "pickup_zone": zone,
            "dropoff_zone": None,
        }
    _drop_tier, drop_zone = classify_lagos_lagride_pickup(dropoff_lat, dropoff_lng)
    svc_m = lagride_lagos_service_multiplier(
        service_key,
        pickup_lat=pickup_lat,
        pickup_lng=pickup_lng,
        dropoff_lat=dropoff_lat,
        dropoff_lng=dropoff_lng,
        distance_km=distance_km,
    )
    corridor_tier_ceiling = (
        sangotedo_ikorodu_corridor_tier_ceiling(service_key)
        if sangotedo_ikorodu_corridor_rate_per_km(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng)
        is not None
        else None
    )

    wat_now = datetime.utcnow() + timedelta(hours=1)
    current_hour = wat_now.hour
    if current_hour >= 24:
        current_hour -= 24
    is_weekend = wat_now.weekday() >= 5
    is_morning_peak = 7 <= current_hour < 9
    is_evening_peak = 17 <= current_hour < 20

    surge_meta = _lagride_lagos_surge_payload(
        demand_ratio=demand_ratio,
        is_raining=is_raining,
        is_morning_peak=is_morning_peak,
        is_evening_peak=is_evening_peak,
        service_max_multiplier=max_multiplier,
    )
    dynamic_multiplier = float(surge_meta["multiplier"])
    is_peak = bool(surge_meta.get("is_peak"))

    d = max(0.0, float(distance_km))
    distance_line = round(d * rate, 2)
    time_line = lagos_route_time_line(route_time_min)
    # (km×area + min×per_min) × service × market — no flat short-trip floor (fares must differ by km/time).
    combined_line = round(distance_line + time_line, 2)
    subtotal = round(combined_line * svc_m * float(LAGOS_MARKET_WIDE_FARE_MULTIPLIER), 2)
    time_fee = float(time_line)  # exposed as route time component (always on)
    distance_subtotal = round(distance_line * svc_m * float(LAGOS_MARKET_WIDE_FARE_MULTIPLIER), 2)
    total_raw = subtotal * dynamic_multiplier
    total_fare = max(200.0, round(total_raw))
    if corridor_tier_ceiling is not None and total_fare > corridor_tier_ceiling:
        total_fare = round(corridor_tier_ceiling)
    fare_capped = False
    if total_fare > LAGOS_MAX_TRIP_FARE_NGN:
        total_fare = round(LAGOS_MAX_TRIP_FARE_NGN)
        fare_capped = True

    fare_bucket = lagride_fare_bucket_label(
        tier, d, zone, dropoff_lat, dropoff_lng, pickup_lat=pickup_lat, pickup_lng=pickup_lng
    )
    if tier == 1 and d < 3:
        if zone == "lagride_t1_sky_mall":
            band_note = f"0–3 km @ ₦{round(rate)}/km (Sky Mall · ₦4,896 @ 2.7 km)"
        else:
            band_note = "0–3 km @ ₦1,850/km"
    elif tier == 1 and d < 15:
        band_note = f"3–15 km @ ₦{int(TIER1_RATE_3_15_KM)}/km"
    elif tier == 1:
        band_note = (
            f"15+ km @ ₦{round(rate)}/km (calibrated)"
            if zone in TIER1_15_PLUS_RATES_BY_ZONE
            else f"15+ km @ ₦{int(TIER1_RATE_15_PLUS_KM)}/km"
        )
    elif sangotedo_ikorodu_corridor_rate_per_km(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng) is not None:
        band_note = f"Sangotedo / Ajah ↔ Ikorodu @ ₦{round(rate)}/km (satellite corridor)"
        if sym_meta.get("symmetric_fare"):
            band_note += f" (was ₦{round(sym_meta['rate_forward_km'])}/km one-way)"
    elif ikorodu_ikeja_corridor_rate_per_km(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng) is not None:
        band_note = f"Ikorodu / Peace Garden ↔ Ikeja @ ₦{round(rate)}/km (satellite corridor)"
        if sym_meta.get("symmetric_fare"):
            band_note += f" (was ₦{round(sym_meta['rate_forward_km'])}/km one-way)"
    elif peace_garden_corridor_rate_per_km(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng) is not None:
        band_note = f"Peace Garden ↔ Ikorodu @ ₦{round(rate)}/km (symmetric corridor)"
        if sym_meta.get("symmetric_fare"):
            band_note += f" (was ₦{round(sym_meta['rate_forward_km'])}/km one-way)"
    elif tier == 2 and d < 3:
        band_note = "0–3 km @ ₦1,850/km"
    elif tier == 2 and d < 15:
        band_note = f"3–15 km @ ₦{int(TIER2_FLAT_PER_KM)}/km"
    elif tier == 2:
        band_note = f"15+ km @ ₦{round(rate)}/km"
    else:
        band_note = "Tier 2 @ ₦3,255/km"

    lagride_profile = build_lagride_profile_payload(
        tier=tier,
        zone=zone,
        distance_km=d,
        rate=rate,
        service_key=service_key,
        svc_m=svc_m,
        surge_m=dynamic_multiplier,
        demand_ratio=demand_ratio,
        fare_bucket=fare_bucket,
        pickup_lat=pickup_lat,
        pickup_lng=pickup_lng,
        dropoff_lat=dropoff_lat,
        dropoff_lng=dropoff_lng,
        total_fare=float(total_fare),
    )
    lagride_profile["symmetric_fare"] = bool(sym_meta.get("symmetric_fare"))
    lagride_profile["rate_forward_km"] = sym_meta.get("rate_forward_km")
    lagride_profile["rate_reverse_km"] = sym_meta.get("rate_reverse_km")
    lagride_profile["dropoff_zone_key"] = drop_zone
    lagride_profile["fare_capped"] = fare_capped
    lagride_profile["lagos_max_fare_ngn"] = LAGOS_MAX_TRIP_FARE_NGN
    lagride_profile["route_time_minutes"] = route_time_min
    lagride_profile["route_time_per_min"] = lagos_route_time_per_min_baseline()
    lagride_profile["route_time_line"] = time_line
    if has_intermediate_stop:
        lagride_profile["has_intermediate_stop"] = True

    lm_pb = float(LAGOS_MARKET_WIDE_FARE_MULTIPLIER)
    per_min_base = lagos_route_time_per_min_baseline()
    # Off-peak: no surge line at all. Surge hours: show × 1.3 only.
    core = (
        f"({round(d, 2)}km × ₦{round(rate, 2)}/km + {route_time_min}min × ₦{per_min_base:g}/min)"
    )
    if dynamic_multiplier > 1.0001:
        price_breakdown = (
            f"{core} × surge {round(dynamic_multiplier, 2)} [{zone}] · {band_note}"
        )
    else:
        price_breakdown = f"{core} [{zone}] · {band_note}"
    _ = lm_pb  # market factor removed; kept for profile parity
    if has_intermediate_stop and time_line > 0:
        price_breakdown = append_stop_time_breakdown_suffix(
            price_breakdown, route_time_min, time_line, per_min_base
        )

    return {
        "base_fare": 0.0,
        "distance_km": round(d, 2),
        "distance_fee": distance_line,
        "duration_min": duration_min,
        "pricing_route_minutes": route_time_min,
        "time_fee": float(time_fee),
        "has_intermediate_stop": bool(has_intermediate_stop),
        "stop_time_fee_applied": False,
        "stop_time_per_min": 0.0,
        "route_time_per_min": per_min_base,
        "traffic_duration_min": traffic_duration_min,
        "traffic_fee": 0.0,
        "booking_fee": 0.0,
        "subtotal": subtotal,
        "location_multiplier": 1.0,
        "location_zone": zone,
        "service_multiplier": round(svc_m, 4),
        # Null off-peak so clients do not render a fake 1.0× surge badge.
        "surge_multiplier": round(dynamic_multiplier, 2) if dynamic_multiplier > 1.0001 else None,
        "surge_uncapped": surge_meta.get("uncapped_multiplier"),
        "surge_factors": surge_meta.get("factors") or [],
        "total_fare": float(total_fare),
        "min_fare": min_fare,
        "cancellation_fee": cancellation_fee,
        "is_surge": dynamic_multiplier > 1.0,
        "is_peak": is_peak,
        "is_weekend": is_weekend,
        "peak_type": surge_meta.get("peak_type"),
        "service_type": service_key,
        "city": "lagos",
        "currency": "NGN",
        "fare_bucket": fare_bucket,
        "fare_rate_model": "lagride_lagos_exact_v1",
        "short_trip_threshold_km": float(short_trip_threshold_km),
        "lagride_tier": tier,
        "lagride_rate_per_km": rate,
        "lagride_profile": lagride_profile,
        "price_breakdown": price_breakdown,
    }
