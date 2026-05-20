"""Shared demand heatmap snapshot for driver surge alerts and GET /driver/heatmap."""

from __future__ import annotations

import hashlib
from datetime import datetime
from typing import Any, Optional


def _heatmap_zone_jitter(seed_bytes: bytes, idx: int, slot: str) -> float:
    h = hashlib.sha256(seed_bytes + str(idx).encode() + slot.encode()).digest()
    u = int.from_bytes(h[:4], "big") / 0xFFFFFFFF
    return round((u * 0.10) - 0.05, 6)


def build_driver_heatmap_snapshot(
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    city: Optional[str] = None,
) -> dict[str, Any]:
    from routers.ai_features import detect_city

    loc = detect_city(lat, lng, city)
    city_name = loc["city"]
    base_lat, base_lng = float(loc["lat"]), float(loc["lng"])
    zones_data = list(loc.get("zones") or [])
    if not zones_data:
        zones_data = detect_city(None, None, "lagos").get("zones") or ["Central"]

    hour = int(datetime.utcnow().hour)
    seed_bytes = f"{hour}-{city_name}".encode()
    zones: list[dict[str, Any]] = []
    for i, zone_name in enumerate(zones_data):
        offset_lat = _heatmap_zone_jitter(seed_bytes, i, "lat")
        offset_lng = _heatmap_zone_jitter(seed_bytes, i, "lng")
        ih = _heatmap_zone_jitter(seed_bytes, i, "int")
        intensity = round(0.50 + (ih + 0.05) / 0.10 * 0.45, 2)
        intensity = max(0.50, min(0.95, intensity))
        sh = abs(_heatmap_zone_jitter(seed_bytes, i, "srg"))
        surge = round(1.0 + min(0.50, (sh + 0.05) / 0.10 * 0.50), 1)
        zones.append(
            {
                "lat": round(base_lat + offset_lat, 4),
                "lng": round(base_lng + offset_lng, 4),
                "intensity": intensity,
                "zone_name": zone_name,
                "surge_multiplier": surge,
                "demand_level": "very_high"
                if intensity > 0.8
                else "high"
                if intensity > 0.6
                else "medium",
            }
        )

    zones_sorted = sorted(zones, key=lambda z: (-float(z.get("intensity", 0)), -float(z.get("surge_multiplier", 1))))
    top = zones_sorted[0] if zones_sorted else None
    top_name = (top or {}).get("zone_name") or "your city centre"
    recommendation = f"Head to {top_name} for stronger demand this hour" if top else "Open Heatmap for demand zones"

    return {
        "city": city_name,
        "zones": zones_sorted,
        "top_zone": top_name,
        "top_zone_intensity": float((top or {}).get("intensity", 0)),
        "top_zone_surge": float((top or {}).get("surge_multiplier", 1)),
        "recommendation": recommendation,
        "updated_at": datetime.utcnow().isoformat(),
    }
