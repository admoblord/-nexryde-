"""
Driver in-app surge alerts → ``db.notifications`` (Activity tab).

Varied copy, heatmap zone hints, peak-hour positioning guidance, throttled to avoid spam.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from driver_heatmap_snapshot import build_driver_heatmap_snapshot
from surge_pricing import _wat_now

logger = logging.getLogger(__name__)

HEATMAP_ROUTE = "/driver/heatmap"
NOTIF_TYPES = frozenset({"surge_active", "surge_peak_guide", "surge_elevated", "surge_high"})

SURGE_TITLE_VARIANTS = [
    "Surge live near you",
    "Elevated fares nearby",
    "Earn more this hour",
    "Demand is up — move smart",
]

PEAK_TITLE_VARIANTS = [
    "Peak hour — best zones",
    "Rush hour positioning",
    "High-traffic window",
    "Peak demand window",
]

SURGE_BODY_VARIANTS = [
    (
        "⚡ {mult}× fares (+{pct}%) — {reasons}. "
        "Start toward **{zone}**, then open **Demand Heatmap** for the freshest hotspots."
    ),
    (
        "Surge is active at **{mult}×** (+{pct}%). Drivers near **{zone}** are seeing stronger request flow. "
        "Open **Heatmap** now to compare zones before you reposition."
    ),
    (
        "**+{pct}%** on trips right now ({reasons}). "
        "We suggest **{zone}** first — tap **Demand Heatmap** for live intensity and surge dots."
    ),
]

PEAK_BODY_VARIANTS = [
    (
        "🕐 **{peak_label}** is on. Even without surge, riders book more in busy corridors. "
        "Try **{zone}** first, then open **Demand Heatmap** to refresh the best pockets."
    ),
    (
        "Peak window: **{peak_label}**. Position early — **{zone}** looks strongest on today's map. "
        "Open **Heatmap** for zone-by-zone demand before you roll."
    ),
    (
        "**{peak_label}** — maximize trips by staging in **{zone}**. "
        "Heatmap shows live demand intensity; check it before each reposition."
    ),
]


def peak_window_wat() -> tuple[bool, str, str]:
    """Returns (is_peak, peak_kind, human label)."""
    hour = _wat_now().hour
    if 7 <= hour < 9:
        return True, "morning", "Morning rush (7–9 AM)"
    if 17 <= hour < 20:
        return True, "evening", "Evening peak (5–8 PM)"
    return False, "", ""


def _strip_markdown_bold(text: str) -> str:
    return text.replace("**", "")


def enrich_driver_surge_status(surge_status: dict[str, Any], heatmap: dict[str, Any]) -> dict[str, Any]:
    """Attach heatmap hints and a polished driver_message for earnings / home UI."""
    out = dict(surge_status)
    mult = float(out.get("multiplier") or 1)
    pct = int(out.get("pct_extra") or 0)
    reasons = ", ".join((out.get("reasons") or [])[:2]) or "elevated demand"
    zone = heatmap.get("top_zone") or "high-demand zones"
    is_peak, peak_kind, peak_label = peak_window_wat()
    out["is_peak_window"] = is_peak
    out["peak_kind"] = peak_kind

    if mult > 1.001:
        out["driver_message"] = (
            f"+{pct}% fares now ({mult}×) — {reasons}. "
            f"Head toward {zone}; open Demand Heatmap for live zone picks."
        )
    elif is_peak:
        out["driver_message"] = (
            f"{peak_label}: position near {zone} for more trips. "
            "Open Demand Heatmap to compare zones before you move."
        )
    else:
        out["driver_message"] = (
            "Standard fares for now. Stay online — open Heatmap anytime to scout demand."
        )

    out["heatmap"] = {
        "top_zone": zone,
        "recommendation": heatmap.get("recommendation"),
        "action_route": HEATMAP_ROUTE,
        "city": heatmap.get("city"),
    }
    return out


def _pick_variant(pool: list[str], seed: int) -> str:
    return pool[seed % len(pool)]


def _compose_notification(
    *,
    kind: str,
    surge_status: dict[str, Any],
    heatmap: dict[str, Any],
    variant_seed: int,
) -> tuple[str, str, str]:
    mult = float(surge_status.get("multiplier") or 1)
    pct = int(surge_status.get("pct_extra") or 0)
    reasons = ", ".join((surge_status.get("reasons") or [])[:2]) or "high demand"
    zone = heatmap.get("top_zone") or "high-demand areas"
    window_end = surge_status.get("window_ends_label")
    is_peak, _peak_kind, peak_label = peak_window_wat()

    if kind == "surge_active":
        tier = surge_status.get("tier") or "low"
        notif_type = "surge_high" if tier in ("high", "moderate") else "surge_active"
        if mult >= 1.3:
            notif_type = "surge_elevated"
        title = _pick_variant(SURGE_TITLE_VARIANTS, variant_seed)
        template = _pick_variant(SURGE_BODY_VARIANTS, variant_seed)
        message = _strip_markdown_bold(
            template.format(mult=f"{mult:.1f}", pct=pct, reasons=reasons, zone=zone)
        )
        if window_end:
            message += f"\n\nWindow hint: pricing boost may ease around {window_end}."
        message += "\n\n→ Open Demand Heatmap for the full live map."
        return title, message, notif_type

    title = _pick_variant(PEAK_TITLE_VARIANTS, variant_seed)
    template = _pick_variant(PEAK_BODY_VARIANTS, variant_seed)
    message = _strip_markdown_bold(template.format(peak_label=peak_label, zone=zone))
    if mult > 1.001:
        message = (
            f"Light surge at {mult:.1f}× (+{pct}%) during {peak_label}. "
            + message
        )
    message += "\n\n→ Tap Demand Heatmap in the menu (☰) or driver map search."
    return title, message, "surge_peak_guide"


async def _recent_surge_notifications(db, driver_id: str, hours: float = 2.0) -> list[dict]:
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    return await db.notifications.find(
        {
            "user_id": driver_id,
            "type": {"$in": list(NOTIF_TYPES)},
            "created_at": {"$gte": since},
        }
    ).sort("created_at", -1).to_list(5)


def _should_send(
    recent: list[dict],
    *,
    mult: float,
    kind: str,
    peak_kind: str,
) -> bool:
    if not recent:
        return True
    last = recent[0]
    last_data = last.get("data") or {}
    last_mult = float(last_data.get("multiplier") or 1)
    last_kind = last.get("type") or ""
    last_peak = last_data.get("peak_kind") or ""

    if kind == "surge_active" and mult >= last_mult + 0.15:
        return True
    if last_kind != kind and kind == "surge_active":
        return True
    if kind == "surge_peak_guide" and peak_kind and peak_kind != last_peak:
        return True
    return False


async def maybe_notify_driver_surge(
    db,
    driver_id: str,
    surge_status: dict[str, Any],
    *,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    city: Optional[str] = None,
    is_online: bool = True,
) -> bool:
    """
    Insert a driver Activity notification when surge is on or during peak windows.
    Returns True if a new notification was created.
    """
    if not is_online or not driver_id:
        return False

    mult = float(surge_status.get("multiplier") or 1)
    is_surge = mult > 1.001
    is_peak, peak_kind, _ = peak_window_wat()

    if not is_surge and not is_peak:
        return False

    kind = "surge_active" if is_surge else "surge_peak_guide"
    recent = await _recent_surge_notifications(db, driver_id, hours=2.0)
    if not _should_send(recent, mult=mult, kind=kind, peak_kind=peak_kind):
        return False

    heatmap = build_driver_heatmap_snapshot(lat, lng, city)
    variant_seed = len(recent) + int(mult * 10) + (hash(peak_kind) % 7 if peak_kind else 0)
    title, message, notif_type = _compose_notification(
        kind=kind,
        surge_status=surge_status,
        heatmap=heatmap,
        variant_seed=variant_seed,
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": driver_id,
        "type": notif_type,
        "title": title,
        "message": message,
        "data": {
            "multiplier": mult,
            "pct_extra": surge_status.get("pct_extra"),
            "reasons": surge_status.get("reasons"),
            "tier": surge_status.get("tier"),
            "top_zone": heatmap.get("top_zone"),
            "city": heatmap.get("city"),
            "peak_kind": peak_kind,
            "is_peak": is_peak,
            "action_route": HEATMAP_ROUTE,
            "action_label": "Open Demand Heatmap",
        },
        "created_at": now_iso,
        "read": False,
    }
    await db.notifications.insert_one(doc)
    logger.info("Driver surge notification %s for %s (%.2fx)", notif_type, driver_id, mult)
    return True


_CATEGORY_ALIASES = {"standard": "economy"}
_VALID_RIDE_CATEGORIES = frozenset({"economy", "comfort", "xl", "premium", "female_only"})


def _normalize_category(cat: str) -> Optional[str]:
    c = str(cat or "").strip().lower()
    c = _CATEGORY_ALIASES.get(c, c)
    return c if c in _VALID_RIDE_CATEGORIES else None


def _fare_city_for_surge(
    lat: Optional[float], lng: Optional[float], fallback_city: Optional[str]
) -> str:
    from routers.ai_features import detect_city

    loc = detect_city(lat, lng, fallback_city)
    raw = (loc.get("city") or "lagos").lower().strip().replace(" ", "_")
    if raw in ("lagos", "abuja", "port_harcourt"):
        return raw
    return "default"


async def sync_driver_surge_alerts(
    db,
    driver_id: str,
    profile: dict[str, Any],
    user_doc: dict[str, Any],
    *,
    notify: bool = True,
) -> dict[str, Any]:
    """
    Compute live surge + heatmap hints; optionally push an Activity notification.
    """
    from surge_demand import estimate_area_demand_ratio_near
    from routers.payments import calculate_surge_multiplier

    cloc = profile.get("current_location") or {}
    lat_f, lng_f = 0.0, 0.0
    has_coords = False
    try:
        if cloc.get("lat") is not None and cloc.get("lng") is not None:
            lat_f = float(cloc["lat"])
            lng_f = float(cloc["lng"])
            has_coords = abs(lat_f) > 1e-5 or abs(lng_f) > 1e-5
    except (TypeError, ValueError):
        has_coords = False

    cats = profile.get("active_categories") or []
    raw_svc = str(cats[0]) if cats else str(profile.get("vehicle_type") or "economy")
    norm_svc = _normalize_category(raw_svc) or "economy"
    service_for_surge = "economy" if norm_svc == "female_only" else norm_svc
    city_for_surge = _fare_city_for_surge(
        lat_f if has_coords else None,
        lng_f if has_coords else None,
        user_doc.get("city"),
    )

    demand_ratio = 0.0
    if has_coords:
        demand_ratio = await estimate_area_demand_ratio_near(db, lat_f, lng_f)

    surge_status = calculate_surge_multiplier(
        lat=lat_f if has_coords else 0.0,
        lng=lng_f if has_coords else 0.0,
        demand_ratio=demand_ratio,
        is_raining=False,
        service_type=service_for_surge,
        city=city_for_surge,
    )
    heatmap = build_driver_heatmap_snapshot(
        lat_f if has_coords else None,
        lng_f if has_coords else None,
        city_for_surge,
    )
    surge_status = enrich_driver_surge_status(surge_status, heatmap)

    if notify and profile.get("is_online"):
        try:
            await maybe_notify_driver_surge(
                db,
                driver_id,
                surge_status,
                lat=lat_f if has_coords else None,
                lng=lng_f if has_coords else None,
                city=city_for_surge,
                is_online=True,
            )
        except Exception as exc:
            logger.warning("Surge notification skipped for %s: %s", driver_id, exc)

    return surge_status
