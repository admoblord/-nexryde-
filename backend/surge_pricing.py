"""
Hybrid surge (NEXRYDE product spec):

  combined = demand_tier × rush × weekend × holiday × rain

Then clamp: min(combined, absolute_ceiling), then min(..., service max_multiplier from FARE_CONFIG).

Demand tiers use driver-busy ratio (0–1). Rush windows use Nigeria WAT (UTC+1).
Rain applies only when explicitly flagged (e.g. weather hook or ?rain=1) — no passive wet-season surge.
"""

from __future__ import annotations

from datetime import datetime, timedelta, date
from typing import Any

# Max-of card (nationwide non-Lagos + parity with Lagos Lagride narrative): Normal 1.0, High 1.3, Rain 1.4, Peak 1.5
NATIONWIDE_MAX_SURGE_HIGH_DEMAND = 1.3
NATIONWIDE_MAX_SURGE_RAIN = 1.4
NATIONWIDE_MAX_SURGE_PEAK = 1.5

SURGE_CONFIG: dict[str, Any] = {
    "enabled": True,
    "base_multiplier": 1.0,
    # Before per-service cap from fare tier (Economy 2.5×, Premium 3.0×)
    "absolute_ceiling": 3.0,
    "peak_hours": {
        "morning_rush": {"start": 7, "end": 9, "multiplier": 1.2, "label": "Morning rush"},
        "evening_peak": {"start": 17, "end": 20, "multiplier": 1.3, "label": "Evening rush"},
    },
    "weekend_multiplier": 1.1,
    "rain_multiplier": 1.4,
    "holiday_multiplier": 1.5,
    "high_demand_threshold": 0.70,
    "very_high_demand_threshold": 0.85,
    "critical_demand_threshold": 0.95,
    "surge_levels": {
        "normal": 1.0,
        "high": 1.3,
        "very_high": 1.8,
        "critical": 2.5,
    },
    # Gregorian MM-DD (WAT calendar date). Extend yearly / add movable holidays via admin later.
    "fixed_holiday_mmdd": [
        "01-01",
        "05-01",
        "06-12",
        "10-01",
        "12-25",
        "12-26",
    ],
}


def _wat_now() -> datetime:
    return datetime.utcnow() + timedelta(hours=1)


def _is_fixed_holiday(d: date) -> bool:
    mmdd = f"{d.month:02d}-{d.day:02d}"
    return mmdd in SURGE_CONFIG.get("fixed_holiday_mmdd", [])


def compute_surge_multiplier(
    *,
    lat: float = 0.0,
    lng: float = 0.0,
    demand_ratio: float = 0.0,
    is_raining: bool = False,
    service_max_multiplier: float = 2.5,
) -> dict[str, Any]:
    """
    Returns UI-ready surge payload. ``lat``/``lng`` reserved for future geo buckets.
    """
    _ = lat, lng  # future: regional surge floors

    if not SURGE_CONFIG.get("enabled", True):
        return _finalize_surge_result(
            raw_combined=1.0,
            final_multiplier=1.0,
            applied=[("Surge disabled", 1.0)],
            service_cap=float(service_max_multiplier),
            active_window=None,
            window_ends_label=None,
        )

    now = _wat_now()
    hour = now.hour
    weekday = now.weekday()

    dr = max(0.0, min(1.0, float(demand_ratio)))
    sl = SURGE_CONFIG["surge_levels"]
    hi = SURGE_CONFIG["high_demand_threshold"]
    vh = SURGE_CONFIG["very_high_demand_threshold"]
    cr = SURGE_CONFIG["critical_demand_threshold"]

    if dr >= cr:
        demand_mult = float(sl["critical"])
        demand_label = "Critical demand"
    elif dr >= vh:
        demand_mult = float(sl["very_high"])
        demand_label = "Very high demand"
    elif dr >= hi:
        demand_mult = float(sl["high"])
        demand_label = "High demand"
    else:
        demand_mult = float(sl["normal"])
        demand_label = "Normal demand"

    applied: list[tuple[str, float]] = [(demand_label, demand_mult)]

    rush_mult = 1.0
    rush_active: str | None = None
    window_ends_label: str | None = None
    for cfg in SURGE_CONFIG["peak_hours"].values():
        if cfg["start"] <= hour < cfg["end"]:
            if cfg["multiplier"] > rush_mult:
                rush_mult = float(cfg["multiplier"])
                rush_active = cfg["label"]
                end_h = cfg["end"]
                suffix = "AM" if end_h < 12 else "PM"
                display_h = end_h if end_h <= 12 else end_h - 12
                if display_h == 0:
                    display_h = 12
                window_ends_label = f"{display_h}:00 {suffix}"
    if rush_mult > 1.0:
        applied.append((rush_active or "Peak hours", rush_mult))

    weekend_mult = 1.0
    if weekday >= 5:
        weekend_mult = float(SURGE_CONFIG["weekend_multiplier"])
        applied.append(("Weekend", weekend_mult))

    holiday_mult = 1.0
    if _is_fixed_holiday(now.date()):
        holiday_mult = float(SURGE_CONFIG["holiday_multiplier"])
        applied.append(("Public holiday", holiday_mult))

    rain_mult = 1.0
    if is_raining:
        rain_mult = float(SURGE_CONFIG["rain_multiplier"])
        applied.append(("Rain / severe weather", rain_mult))

    raw = float(SURGE_CONFIG["base_multiplier"])
    for _, m in applied:
        raw *= m

    ceiling = float(SURGE_CONFIG.get("absolute_ceiling", 3.0))
    capped_ceiling = min(raw, ceiling)
    final = round(min(capped_ceiling, float(service_max_multiplier)), 2)

    active_window = rush_active

    return _finalize_surge_result(
        raw_combined=raw,
        final_multiplier=final,
        applied=applied,
        service_cap=float(service_max_multiplier),
        active_window=active_window,
        window_ends_label=window_ends_label,
    )


def compute_max_style_surge_multiplier(
    *,
    lat: float = 0.0,
    lng: float = 0.0,
    demand_ratio: float = 0.0,
    is_raining: bool = False,
    service_max_multiplier: float = 2.5,
) -> dict[str, Any]:
    """
    ``max(Normal 1.0, High demand 1.3, Rain 1.4, Peak 1.5)`` among active conditions (WAT),
    then ``min(..., service_max_multiplier)``. Used for nationwide premium table pricing (non-Lagos).
    """
    _ = lat, lng

    if not SURGE_CONFIG.get("enabled", True):
        return _finalize_surge_result(
            raw_combined=1.0,
            final_multiplier=1.0,
            applied=[("Surge disabled", 1.0)],
            service_cap=float(service_max_multiplier),
            active_window=None,
            window_ends_label=None,
        )

    now = _wat_now()
    hour = now.hour
    is_morning_peak = 7 <= hour < 9
    is_evening_peak = 17 <= hour < 20

    dr = max(0.0, min(1.0, float(demand_ratio)))
    hi = float(SURGE_CONFIG.get("high_demand_threshold", 0.70))

    applied: list[tuple[str, float]] = []
    candidates: list[float] = [1.0]

    if dr >= hi:
        candidates.append(float(NATIONWIDE_MAX_SURGE_HIGH_DEMAND))
        applied.append(("High demand", float(NATIONWIDE_MAX_SURGE_HIGH_DEMAND)))
    if is_raining:
        candidates.append(float(NATIONWIDE_MAX_SURGE_RAIN))
        applied.append(("Rain", float(NATIONWIDE_MAX_SURGE_RAIN)))
    if is_morning_peak or is_evening_peak:
        candidates.append(float(NATIONWIDE_MAX_SURGE_PEAK))
        applied.append(("Peak hours", float(NATIONWIDE_MAX_SURGE_PEAK)))

    raw_max = max(candidates)
    final = round(min(raw_max, float(service_max_multiplier)), 2)

    active_window = None
    window_ends_label = None
    if is_morning_peak:
        active_window = SURGE_CONFIG["peak_hours"]["morning_rush"]["label"]
        window_ends_label = "9:00 AM"
    elif is_evening_peak:
        active_window = SURGE_CONFIG["peak_hours"]["evening_peak"]["label"]
        window_ends_label = "8:00 PM"

    return _finalize_surge_result(
        raw_combined=raw_max,
        final_multiplier=final,
        applied=applied if applied else [("Normal", 1.0)],
        service_cap=float(service_max_multiplier),
        active_window=active_window,
        window_ends_label=window_ends_label,
    )


def _finalize_surge_result(
    raw_combined: float,
    final_multiplier: float,
    applied: list[tuple[str, float]],
    service_cap: float,
    active_window: str | None,
    window_ends_label: str | None,
) -> dict[str, Any]:
    uncapped_display = round(raw_combined, 2)
    is_surge = final_multiplier > 1.0
    pct_extra = round((final_multiplier - 1.0) * 100)

    reasons = [label for label, mult in applied if mult > 1.0001]
    if not reasons:
        reasons = ["Normal pricing"]

    if final_multiplier >= 2.0:
        tier = "high"
        tier_label = "High surge"
        tier_color = "#EF4444"
    elif final_multiplier >= 1.5:
        tier = "moderate"
        tier_label = "Moderate surge"
        tier_color = "#F59E0B"
    elif final_multiplier > 1.0:
        tier = "low"
        tier_label = "Elevated pricing"
        tier_color = "#F59E0B"
    else:
        tier = "normal"
        tier_label = "Normal pricing"
        tier_color = "#16A34A"

    factors = [{"label": lbl, "multiplier": round(mult, 3)} for lbl, mult in applied]

    return {
        "multiplier": final_multiplier,
        "uncapped_multiplier": uncapped_display,
        "pre_cap_combined": round(raw_combined, 4),
        "service_cap": service_cap,
        "is_surge": is_surge,
        "tier": tier,
        "tier_label": tier_label,
        "tier_color": tier_color,
        "pct_extra": pct_extra,
        "reasons": reasons,
        "factors": factors,
        "active_window": active_window,
        "window_ends_label": window_ends_label,
        "driver_message": (
            f"+{pct_extra}% on fares now — {', '.join(reasons[:2])}."
            if is_surge
            else "Normal fares. Stay online — surge can activate anytime."
        ),
        "rider_message": (
            f"About {pct_extra}% higher now ({reasons[0]})." if is_surge else "Standard fare — no surge multiplier."
        ),
        "expires_in_minutes": 5,
    }
