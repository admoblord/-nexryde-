"""
NEXRYDE smart surge — morning & evening peak windows only (WAT).

Product rule (Jul 2026):
  • No demand / rain / weekend / holiday stacking.
  • Surge is **1.3×** only during fixed windows; otherwise **1.0×**.
  • Windows: Morning 07:00–09:00, Evening 17:00–20:00 (Africa/Lagos = UTC+1).
"""

from __future__ import annotations

from datetime import datetime, timedelta, date
from typing import Any

# Legacy names kept for imports; demand/rain disabled (1.0). Peak is the only live boost.
NATIONWIDE_MAX_SURGE_HIGH_DEMAND = 1.0
NATIONWIDE_MAX_SURGE_RAIN = 1.0
NATIONWIDE_MAX_SURGE_PEAK = 1.3

SMART_SURGE_MULTIPLIER = 1.3

SURGE_CONFIG: dict[str, Any] = {
    "enabled": True,
    "base_multiplier": 1.0,
    "absolute_ceiling": 3.0,
    "mode": "smart_peak_only",
    "peak_hours": {
        "morning_rush": {
            "start": 7,
            "end": 9,
            "multiplier": SMART_SURGE_MULTIPLIER,
            "label": "Morning surge (7–9 AM)",
            "ends_label": "9:00 AM",
        },
        "evening_peak": {
            "start": 17,
            "end": 20,
            "multiplier": SMART_SURGE_MULTIPLIER,
            "label": "Evening surge (5–8 PM)",
            "ends_label": "8:00 PM",
        },
    },
    # Disabled product factors (kept for config compatibility / admin UI).
    "weekend_multiplier": 1.0,
    "rain_multiplier": 1.0,
    "holiday_multiplier": 1.0,
    "high_demand_threshold": 0.70,
    "very_high_demand_threshold": 0.85,
    "critical_demand_threshold": 0.95,
    "surge_levels": {
        "normal": 1.0,
        "high": 1.0,
        "very_high": 1.0,
        "critical": 1.0,
    },
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


def active_smart_surge_window(
    now: datetime | None = None,
) -> tuple[bool, str, dict[str, Any] | None]:
    """
    Returns (is_active, peak_kind, window_cfg).
    peak_kind is ``morning`` | ``evening`` | ``""``.
    """
    wat = now or _wat_now()
    hour = wat.hour
    for kind, key in (("morning", "morning_rush"), ("evening", "evening_peak")):
        cfg = SURGE_CONFIG["peak_hours"][key]
        if cfg["start"] <= hour < cfg["end"]:
            return True, kind, cfg
    return False, "", None


def compute_surge_multiplier(
    *,
    lat: float = 0.0,
    lng: float = 0.0,
    demand_ratio: float = 0.0,
    is_raining: bool = False,
    service_max_multiplier: float = 2.5,
) -> dict[str, Any]:
    """Smart peak-only surge (same as ``compute_max_style_surge_multiplier``)."""
    return compute_max_style_surge_multiplier(
        lat=lat,
        lng=lng,
        demand_ratio=demand_ratio,
        is_raining=is_raining,
        service_max_multiplier=service_max_multiplier,
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
    Smart surge: **1.3× only** in morning/evening WAT windows; else 1.0×.
    Demand / rain / weekend do not affect the multiplier.
    """
    _ = lat, lng, demand_ratio, is_raining

    if not SURGE_CONFIG.get("enabled", True):
        return _finalize_surge_result(
            raw_combined=1.0,
            final_multiplier=1.0,
            applied=[("Surge disabled", 1.0)],
            service_cap=float(service_max_multiplier),
            active_window=None,
            window_ends_label=None,
            peak_type=None,
            is_peak=False,
        )

    is_active, peak_kind, cfg = active_smart_surge_window()
    applied: list[tuple[str, float]] = []
    candidates: list[float] = [1.0]
    active_window = None
    window_ends_label = None
    peak_type = None

    if is_active and cfg is not None:
        mult = float(cfg.get("multiplier") or SMART_SURGE_MULTIPLIER)
        candidates.append(mult)
        label = str(cfg.get("label") or "Peak hours")
        applied.append((label, mult))
        active_window = label
        window_ends_label = str(cfg.get("ends_label") or "")
        peak_type = "morning_rush" if peak_kind == "morning" else "evening_peak"

    raw_max = max(candidates)
    final = round(min(raw_max, float(service_max_multiplier)), 2)

    return _finalize_surge_result(
        raw_combined=raw_max,
        final_multiplier=final,
        applied=applied if applied else [("Normal", 1.0)],
        service_cap=float(service_max_multiplier),
        active_window=active_window,
        window_ends_label=window_ends_label or None,
        peak_type=peak_type,
        is_peak=is_active,
    )


def _finalize_surge_result(
    raw_combined: float,
    final_multiplier: float,
    applied: list[tuple[str, float]],
    service_cap: float,
    active_window: str | None,
    window_ends_label: str | None,
    peak_type: str | None = None,
    is_peak: bool = False,
) -> dict[str, Any]:
    uncapped_display = round(raw_combined, 2)
    reasons = [label for label, mult in applied if mult > 1.0001]
    is_surge = final_multiplier > 1.0
    pct_extra = round((final_multiplier - 1.0) * 100) if is_surge else 0

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
        tier_label = "Smart surge hours"
        tier_color = "#F59E0B"
    else:
        tier = "none"
        tier_label = None
        tier_color = None

    factors = [{"label": lbl, "multiplier": round(mult, 3)} for lbl, mult in applied if mult > 1.0001]

    return {
        # Off-peak: null (no surge). Peak: 1.3. Callers must treat null as 1.0 for math.
        "multiplier": final_multiplier if is_surge else None,
        "effective_multiplier": final_multiplier,  # always numeric for fare engines
        "uncapped_multiplier": uncapped_display if is_surge else None,
        "pre_cap_combined": round(raw_combined, 4) if is_surge else None,
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
        "is_peak": is_peak,
        "peak_type": peak_type,
        "driver_message": (
            f"+{pct_extra}% fares now ({final_multiplier:.1f}×) — {', '.join(reasons[:2])}. "
            "Go online and open Demand Heatmap for the best zones."
            if is_surge
            else "No surge right now. We'll notify you when morning (7–9 AM) or evening (5–8 PM) surge starts."
        ),
        "rider_message": (
            f"About {pct_extra}% higher now ({reasons[0]})."
            if is_surge
            else "Standard fare — no surge."
        ),
        "expires_in_minutes": 5 if is_surge else 0,
    }
