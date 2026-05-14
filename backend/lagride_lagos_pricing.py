"""
NEXRYDE EXACT LAGRIDE PRICING FOR LAGOS

Rider product goal: **transparent, route-based Lagos fares**—easy to read (distance × area × tier × surge),
competitive for riders, without the clutter of separate base + per-minute stacks.

FORMULA (no base fare, no time term — road distance from Directions / Routes):

  Price = Distance × Area_Rate × Service_Multiplier × [Lagos_Market_Multiplier] × Surge_Multiplier

Optional ``Lagos_Market_Multiplier`` (currently **1.02**) is a single city-wide factor on all Lagos pickups and vehicle tiers; tune via ``LAGOS_MARKET_WIDE_FARE_MULTIPLIER``.

``Distance`` = driving route km. ``Area_Rate`` = ₦/km from pickup tier/zone (and
Peace Garden → dropoff corridor where applicable). Final total is rounded to whole ₦.

AREA RATES (baseline card)
----------------------------
**TIER 1 — BUDGET / SUBURBAN**

• 0–3 km: ₦1,850/km (minimum-fare protection band)

• 3–15 km: ₦875/km

• 15+ km: ₦812/km

Areas (pickup must fall in approx. polygon — see ``classify_lagos_lagride_pickup``):
Sangotedo, Lekki, Ikoyi, Yaba, Ojuelegba, VI, Surulere, Ajah, Banana Island,
Ibeju-Lekki, Festac, Gbagada, Magodo — plus Sky Mall (Jakande) sub-polygon under Lekki.

**TIER 2 — PREMIUM / FAR**

• All distances: ₦3,255/km (average flat card)

Areas: Ikeja, Peace Garden, Ikorodu, Berger, Badagry, Epe, and **Mainland** (metro
fallback). **Eti-Osa** is listed administratively under Tier 2; geographically it
overlaps Tier 1 (VI, Lekki, Ajah, Ibeju-Lekki). This engine resolves **Tier 1 first**,
so those pickups keep Tier 1 banded rates; other Eti-Osa / inner-metro pickups that
miss a Tier-1 box use Tier 2 flat via ``lagride_t2_mainland``.

Verification overlays (optional, on top of baseline)
----------------------------------------------------
• **Sky Mall** 0–3 km: calibrated ₦/km = ₦4,896 ÷ 2.7 km.

• **Tier 1** 15+ km: Lekki / VI–Ikoyi–Banana / Yaba / Festac use route-calibrated
  ₦/km to match sampled Lagride totals; all other Tier-1 15+ km use ₦812/km.

• **Peace Garden** pickup: Ikorodu / Ikeja dropoff corridors use calibrated ₦/km
  (see ``PEACE_GARDEN_TO_*`` constants).

SERVICE MULTIPLIERS (NEXRYDE Lagos — same tier spread as ``FARE_CONFIG['lagos']`` per-km)
----------------------------------------------------------------------------------------
Distance×area line is scaled by **per_km / economy per_km** (economy baseline = **1.0×**):

• **Standard** — ``economy`` / ``standard`` → **1.0×** (₦400/km card baseline)

• **Comfort** → **1.25×** (₦500/km)

• **XL** → **1.125×** (₦450/km)

• **Premium** → **1.5×** (₦600/km)

• **Pro** — alias for **premium** (driver / legacy)

• **EV** → **1.0×** (economy-class energy tier)

• **Omni / budget** → **0.35×** *(Lagride Omni compatibility; not on the main per-km card)*

Unknown keys fall back to **economy** (1.0×). Surge caps still come from each tier’s
``max_multiplier`` in ``FARE_CONFIG``.

SURGE MULTIPLIERS (Lagos Lagride — **max** of applicable factors, then tier cap)
---------------------------------------------------------------------------------
• Normal: 1.0×

• High demand: 1.3×  *(when ``demand_ratio`` ≥ ``SURGE_CONFIG`` threshold)*

• Rain: 1.4×

• Peak hours: 1.5×  *(WAT 07:00–09:00, 17:00–20:00)*

Result is clamped to the ride tier ``max_multiplier`` from ``FARE_CONFIG``.

WORKED EXAMPLES (product sheet vs this engine)
----------------------------------------------
Illustrative **Standard / Premium / Omni** trips at **1.0× surge**. Rounded to whole ₦.

**Ex 1 — Sky Mall, 2.7 km, Standard** — Sheet: ``2.7 × ₦1,850 × 1.0`` → ₦4,995, observed
≈ **₦4,896**. Engine: **Sky Mall** sub-zone uses calibrated **₦4,896 ÷ 2.7** ₦/km so total
**₦4,896** (not ₦1,850/km on that strip).

**Ex 2 — Lekki, 21.65 km, Standard** — Sheet: ``21.65 × ₦812 × 1.0`` ≈ ₦17,600 → **₦17,604**.
Engine: Lekki 15+ band uses calibrated rate → **₦17,604**.

**Ex 3 — Festac, 50.43 km, Standard** — Same idea → **₦40,959** in engine.

**Ex 4 — Peace Garden → Ikorodu, 18 km, Standard** — Sheet sometimes shows **₦3,255/km**
Tier-2 average; this corridor is calibrated → **₦57,424** (not ``18 × 3,255``).

**Ex 5 — 18 km, Premium (1.5×)** — Generic Tier-2 pickup (no PG→Ikorodu): ``18 × 3,255 × 1.5``
→ **₦87,885**. **Peace Garden → Ikorodu + Premium**: ``round(57,424 × 1.5)`` → **₦86,136**.

**Ex 6 — Lekki, 21.65 km, Omni (0.35×)** — Baseline ``×812`` ≈ ₦6,160; with **Lekki
calibrated** line (₦17,604) → ``round(17,604 × 0.35)`` → **₦6,161**. (Sheet “≈₦7,038”
does not match ``21.65 × 812 × 0.35``; engine follows the distance×rate×service formula.)

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

from nexryde_pricing import nexryde_route_time_minutes
from fare_config import FARE_CONFIG
from surge_pricing import SURGE_CONFIG

# ── AREA RATES: Tier 1 banded baseline (₦/km) ───────────────────────────────
TIER1_RATE_0_3_KM = 1850.0
TIER1_RATE_3_15_KM = 875.0
TIER1_RATE_15_PLUS_KM = 812.0
# Tier-1 trips under 3 km: zone-specific benchmark ÷ sample km (short budget samples).
TIER1_0_3_CALIBRATED_RATES_BY_ZONE: dict[str, float] = {
    "lagride_t1_sky_mall": 4896 / 2.7,
}
# Tier-1 long trips: observed Lagride totals ÷ route km (verification samples).
TIER1_15_PLUS_RATES_BY_ZONE: dict[str, float] = {
    "lagride_t1_lekki": 17604 / 21.65,
    "lagride_t1_vi_ikoyi_banana": 24829 / 30.50,
    "lagride_t1_yaba": 37175 / 45.79,
    "lagride_t1_festac": 40959 / 50.43,
}
# Tier 2 flat (average) — Ikeja, Peace Garden, Ikorodu, Berger, Badagry, Epe, Mainland, etc.
TIER2_FLAT_PER_KM = 3255.0
# Peace Garden pickup × destination (Lagride premium samples @ 18 km)
PEACE_GARDEN_TO_IKORODU_PER_KM = 57424 / 18.0
PEACE_GARDEN_TO_IKEJA_PER_KM = 48236 / 18.0

# SERVICE MULTIPLIERS — legacy Lagride “Pro” card (1.1×); NEXRYDE Lagos uses FARE_CONFIG ratios.
LAGRIDE_SERVICE_PRO = 1.1
LAGRIDE_SERVICE_STANDARD = 1.0
LAGRIDE_SERVICE_EV = 1.0
LAGRIDE_SERVICE_OMNI = 0.35

# SURGE MULTIPLIERS — combined as max(applicable); see _lagride_lagos_surge_payload
NORMAL_SURGE_LAGride = 1.0
HIGH_DEMAND_SURGE = 1.3
RAIN_SURGE_LAGride = 1.4
PEAK_SURGE_LAGride = 1.5

# City-wide fare factor (all zones, all service tiers) — applied after distance×area×service, before surge.
LAGOS_MARKET_WIDE_FARE_MULTIPLIER = 1.02

# Response / analytics id for Lagos Lagride payloads
LAGOS_LAGPRIDE_SPEC_ID = "lagride_lagos_exact_v1"

# Shown in rider apps / ``lagride_profile`` (marketing; keep competitor-neutral).
LAGOS_RIDER_VALUE_SUMMARY = (
    "NEXRYDE Lagos aims for a higher standard: your fare follows real driving distance × area rate × "
    "vehicle tier × surge—clear math, no surprise base fare, tuned to stay competitive and easy to trust."
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

    **Tier 1** — AREA RATES 0–3 / 3–15 / 15+ km (₦1,850 / ₦875 / ₦812 baseline).
    **Tier 2** — flat ₦3,255/km (``TIER2_FLAT_PER_KM``), except Peace Garden + dropoff.

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


def peace_garden_destination_rate_per_km(
    dropoff_lat: float | None, dropoff_lng: float | None
) -> float | None:
    """Peace Garden → Ikorodu / Ikeja corridor rates; ``None`` if dropoff unknown or other area."""
    if dropoff_lat is None or dropoff_lng is None:
        return None
    lat, lng = float(dropoff_lat), float(dropoff_lng)
    if _t2_ikorodu(lat, lng):
        return PEACE_GARDEN_TO_IKORODU_PER_KM
    if _t2_ikeja(lat, lng):
        return PEACE_GARDEN_TO_IKEJA_PER_KM
    return None


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
) -> float:
    z = (zone_label or "").strip()
    if tier == 2 and z == "lagride_t2_peace_garden":
        pg = peace_garden_destination_rate_per_km(dropoff_lat, dropoff_lng)
        if pg is not None:
            return pg
    if tier == 1:
        return lagride_tier1_rate_per_km(distance_km, zone_label)
    return TIER2_FLAT_PER_KM


def lagride_distance_band_key(tier: int, distance_km: float) -> str:
    """Tier 1: 0–3 / 3–15 / 15+ km bands; Tier 2: single flat card for all distances."""
    if tier == 2:
        return "tier2_all_distances"
    d = max(0.0, float(distance_km))
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
        return "tier2_flat_3255"
    if d < 3.0 and z == "lagride_t1_sky_mall":
        return "tier1_sky_mall_short_trip_calibrated"
    if d < 3.0:
        return "tier1_0_3_baseline_1850"
    if d < 15.0:
        return "tier1_3_15_baseline_875"
    if z in TIER1_15_PLUS_RATES_BY_ZONE:
        return "tier1_15_plus_corridor_calibrated"
    return "tier1_15_plus_baseline_812"


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
    formula = (
        "Price = Distance × Area_Rate × Service_Multiplier × Surge_Multiplier"
        if lm == 1.0
        else f"Price = Distance × Area_Rate × Service_Multiplier × Lagos {lm:g} × Surge_Multiplier"
    )
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
            {"step": 6, "name": "Apply service multiplier", "status": "ok", "value": svc_m},
            {"step": 7, "name": "Apply surge multiplier", "status": "ok", "value": surge_m},
            {
                "step": 8,
                "name": "Calculate total",
                "status": "ok",
                "note": (
                    "round(distance_km × area_rate × service × surge) in ₦"
                    if lm == 1.0
                    else f"round(distance_km × area_rate × service × Lagos {lm:g} × surge) in ₦"
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


def lagride_lagos_service_multiplier(service_key: str) -> float:
    """
    Scale the distance×area line by NEXRYDE Lagos tier, using the same **per_km ratios**
    as ``FARE_CONFIG['lagos']`` (economy = 1.0×).

    ``standard`` → economy. ``pro`` → premium. ``budget`` / ``omni`` → 0.35×. ``ev`` → 1.0×.
    """
    k = (service_key or "economy").strip().lower()
    if k == "standard":
        k = "economy"
    if k == "pro":
        k = "premium"
    if k in ("omni", "budget"):
        return float(LAGRIDE_SERVICE_OMNI)
    if k == "ev":
        return float(LAGRIDE_SERVICE_EV)

    fc = FARE_CONFIG.get("lagos") or FARE_CONFIG["default"]
    fe = fc["economy"]
    base_pk = float(fe.get("per_km") or 400)
    row = fc.get(k) or fe
    pk = float(row.get("per_km") or base_pk)
    if base_pk <= 0:
        return float(LAGRIDE_SERVICE_STANDARD)
    return pk / base_pk


def _lagride_lagos_surge_payload(
    *,
    demand_ratio: float,
    is_raining: bool,
    is_morning_peak: bool,
    is_evening_peak: bool,
    service_max_multiplier: float,
) -> dict[str, Any]:
    """
    Surge = max(Normal 1.0, High demand 1.3, Rain 1.4, Peak 1.5) among active flags;
    then min(..., service_max_multiplier).
    """
    dr = max(0.0, min(1.0, float(demand_ratio)))
    hi = float(SURGE_CONFIG.get("high_demand_threshold", 0.70))

    applied: list[tuple[str, float]] = []
    candidates: list[float] = [float(NORMAL_SURGE_LAGride)]

    if dr >= hi:
        candidates.append(HIGH_DEMAND_SURGE)
        applied.append(("High demand", HIGH_DEMAND_SURGE))
    if is_raining:
        candidates.append(RAIN_SURGE_LAGride)
        applied.append(("Rain", RAIN_SURGE_LAGride))
    if is_morning_peak or is_evening_peak:
        candidates.append(PEAK_SURGE_LAGride)
        applied.append(("Peak hours", PEAK_SURGE_LAGride))

    raw_max = max(candidates)
    final = min(raw_max, float(service_max_multiplier))
    is_peak = is_morning_peak or is_evening_peak
    peak_type = "morning_rush" if is_morning_peak else ("evening_peak" if is_evening_peak else None)

    factors = [{"label": lbl, "multiplier": round(mult, 3)} for lbl, mult in applied]
    if not factors:
        factors = [{"label": "Normal", "multiplier": 1.0}]

    return {
        "multiplier": round(final, 2),
        "uncapped_multiplier": round(raw_max, 2),
        "pre_cap_combined": round(raw_max, 4),
        "service_cap": float(service_max_multiplier),
        "is_surge": final > 1.0,
        "tier": "high" if final >= 2.0 else ("moderate" if final >= 1.5 else ("low" if final > 1.0 else "normal")),
        "tier_label": "NEXRYDE surge",
        "tier_color": "#F59E0B",
        "pct_extra": round((final - 1.0) * 100),
        "reasons": [lbl for lbl, m in applied if m > 1.0001] or ["Normal pricing"],
        "factors": factors,
        "active_window": "Peak hours" if is_peak else None,
        "window_ends_label": None,
        "driver_message": "",
        "rider_message": "",
        "expires_in_minutes": 5,
        "is_peak": is_peak,
        "peak_type": peak_type,
    }


def lagride_fare_bucket_label(
    tier: int,
    distance_km: float,
    zone_label: str = "",
    dropoff_lat: float | None = None,
    dropoff_lng: float | None = None,
) -> str:
    d = float(distance_km)
    z = (zone_label or "").strip()
    if tier == 2 and z == "lagride_t2_peace_garden":
        pg = peace_garden_destination_rate_per_km(dropoff_lat, dropoff_lng)
        if pg == PEACE_GARDEN_TO_IKORODU_PER_KM:
            return "lagride_t2_peace_garden_to_ikorodu"
        if pg == PEACE_GARDEN_TO_IKEJA_PER_KM:
            return "lagride_t2_peace_garden_to_ikeja"
    if tier == 1:
        if d < 3.0:
            return "lagride_t1_0_3_km"
        if d < 15.0:
            return "lagride_t1_3_15_km"
        return "lagride_t1_15_plus_km"
    return "lagride_t2_flat"


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
) -> dict[str, Any]:
    """Full-shaped dict compatible with ``server.calculate_fare`` / fare estimate."""
    route_time_min = nexryde_route_time_minutes(duration_min, traffic_duration_min)
    tier, zone = classify_lagos_lagride_pickup(pickup_lat, pickup_lng)
    rate = lagride_lagos_area_rate_per_km(tier, distance_km, zone, dropoff_lat, dropoff_lng)
    svc_m = lagride_lagos_service_multiplier(service_key)

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
    subtotal = round(distance_line * svc_m * float(LAGOS_MARKET_WIDE_FARE_MULTIPLIER), 2)
    total_raw = subtotal * dynamic_multiplier
    total_fare = max(200.0, round(total_raw))

    fare_bucket = lagride_fare_bucket_label(tier, d, zone, dropoff_lat, dropoff_lng)
    if tier == 1 and d < 3:
        if zone == "lagride_t1_sky_mall":
            band_note = f"0–3 km @ ₦{round(rate)}/km (Sky Mall · ₦4,896 @ 2.7 km)"
        else:
            band_note = "0–3 km @ ₦1,850/km"
    elif tier == 1 and d < 15:
        band_note = "3–15 km @ ₦875/km"
    elif tier == 1:
        band_note = (
            f"15+ km @ ₦{round(rate)}/km (calibrated)"
            if zone in TIER1_15_PLUS_RATES_BY_ZONE
            else f"15+ km @ ₦{int(TIER1_RATE_15_PLUS_KM)}/km"
        )
    elif zone == "lagride_t2_peace_garden" and peace_garden_destination_rate_per_km(dropoff_lat, dropoff_lng):
        dest = (
            "Ikorodu"
            if rate == PEACE_GARDEN_TO_IKORODU_PER_KM
            else ("Ikeja" if rate == PEACE_GARDEN_TO_IKEJA_PER_KM else "")
        )
        band_note = f"Peace Garden → {dest} @ ₦{round(rate)}/km (calibrated)" if dest else "Peace Garden (dropoff band)"
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

    lm_pb = float(LAGOS_MARKET_WIDE_FARE_MULTIPLIER)
    price_breakdown = (
        f"{round(d, 2)}km × ₦{round(rate, 2)}/km ({band_note}) × svc {round(svc_m, 2)} × surge {round(dynamic_multiplier, 2)} [{zone}]"
        if lm_pb == 1.0
        else (
            f"{round(d, 2)}km × ₦{round(rate, 2)}/km ({band_note}) × svc {round(svc_m, 2)} × Lagos {lm_pb:g} × "
            f"surge {round(dynamic_multiplier, 2)} [{zone}]"
        )
    )

    return {
        "base_fare": 0.0,
        "distance_km": round(d, 2),
        "distance_fee": distance_line,
        "duration_min": duration_min,
        "pricing_route_minutes": route_time_min,
        "time_fee": 0.0,
        "traffic_duration_min": traffic_duration_min,
        "traffic_fee": 0.0,
        "booking_fee": 0.0,
        "subtotal": subtotal,
        "location_multiplier": 1.0,
        "location_zone": zone,
        "service_multiplier": round(svc_m, 4),
        "surge_multiplier": round(dynamic_multiplier, 2),
        "surge_uncapped": surge_meta.get("uncapped_multiplier"),
        "surge_factors": surge_meta.get("factors"),
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
