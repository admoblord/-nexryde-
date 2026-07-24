"""Instant Pickup Detection Engine — reverse-geocode priority + H3/radius cache.

Never returns raw lat/lng as a display address. Labels prefer:
  Exact landmark → Building → Street → Estate → Area → City
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any, Optional

logger = logging.getLogger("instant_pickup")

# Display fallback when Google fails — never coordinates.
SAFE_FALLBACK = "Near your location"
DETECTING_COPY = "Detecting your pickup..."

# H3 res ~66m edge — reuse nearby resolves (Lagos density).
PICKUP_H3_RES = int(os.environ.get("NEXRYDE_PICKUP_H3_RES", "10"))
# Soft radius (m) for "same place" reuse on client/server.
PICKUP_REUSE_RADIUS_M = float(os.environ.get("NEXRYDE_PICKUP_REUSE_RADIUS_M", "35"))

_PRIORITY = (
    ("landmark", 100),
    ("building", 80),
    ("street", 60),
    ("estate", 45),
    ("area", 30),
    ("city", 15),
)


def _comp_map(result: dict[str, Any]) -> dict[str, str]:
    out: dict[str, str] = {}
    for c in result.get("address_components") or []:
        types = c.get("types") or []
        ln = str(c.get("long_name") or "").strip()
        sn = str(c.get("short_name") or "").strip()
        if not ln:
            continue
        for t in types:
            out.setdefault(str(t), ln)
            if sn:
                out.setdefault(f"{t}_short", sn)
    return out


def _looks_like_coords(text: str) -> bool:
    import re

    return bool(
        re.match(
            r"^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$",
            str(text or "").strip(),
        )
    )


def pick_priority_label(results: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Choose the best human label from Google Geocoding results.
    Returns {label, tier, formatted_address, components...}.
    """
    best: Optional[dict[str, Any]] = None
    best_score = -1

    for result in results or []:
        types = set(result.get("types") or [])
        comps = _comp_map(result)
        formatted = str(result.get("formatted_address") or "").strip()
        name = str(result.get("name") or "").strip()  # rarely present on geocode

        landmark = ""
        building = ""
        street = ""
        estate = ""
        area = ""
        city = ""

        # Landmark / POI
        if types & {"point_of_interest", "establishment", "tourist_attraction", "premise"}:
            # Prefer first token of formatted (often the POI name) when types say POI
            if formatted and "," in formatted:
                landmark = formatted.split(",")[0].strip()
            landmark = landmark or name or comps.get("point_of_interest") or comps.get("establishment") or ""

        # Building
        building = (
            comps.get("premise")
            or comps.get("subpremise")
            or comps.get("plus_code")
            or ""
        )
        if not building and "street_address" in types and formatted:
            # House number + route often first segment
            head = formatted.split(",")[0].strip()
            if any(ch.isdigit() for ch in head):
                building = head

        route = comps.get("route") or ""
        street_num = comps.get("street_number") or ""
        if street_num and route:
            street = f"{street_num} {route}"
        else:
            street = route

        estate = (
            comps.get("neighborhood")
            or comps.get("sublocality_level_1")
            or comps.get("sublocality")
            or comps.get("colloquial_area")
            or ""
        )
        area = estate or comps.get("administrative_area_level_2") or ""
        city = (
            comps.get("locality")
            or comps.get("postal_town")
            or comps.get("administrative_area_level_2")
            or ""
        )
        state = comps.get("administrative_area_level_1") or ""
        state_short = state.replace(" State", "").strip()

        # Tier selection
        if landmark and not _looks_like_coords(landmark):
            tier, score = "landmark", 100
            label = landmark
            if city and city.lower() not in label.lower():
                label = f"{label}, {city}"
        elif building and not _looks_like_coords(building):
            tier, score = "building", 80
            label = building
            if route and route.lower() not in label.lower():
                label = f"{label}, {route}"
        elif street and not _looks_like_coords(street):
            tier, score = "street", 60
            label = street
            if estate and estate.lower() not in label.lower():
                label = f"{label}, {estate}"
            elif city and city.lower() not in label.lower():
                label = f"{label}, {city}"
        elif estate and not _looks_like_coords(estate):
            tier, score = "estate", 45
            label = f"{estate}, {state_short}" if state_short and estate != state_short else estate
        elif area and not _looks_like_coords(area):
            tier, score = "area", 30
            label = f"{area}, {state_short}" if state_short and area != state_short else area
        elif city and not _looks_like_coords(city):
            tier, score = "city", 15
            label = f"{city}, {state_short}" if state_short and city != state_short else city
        elif formatted and not _looks_like_coords(formatted):
            tier, score = "area", 25
            # Truncate long formatted addresses for chip UI
            parts = [p.strip() for p in formatted.split(",") if p.strip()]
            label = ", ".join(parts[:3]) if parts else formatted
        else:
            continue

        if score > best_score:
            best_score = score
            best = {
                "label": label,
                "tier": tier,
                "formatted_address": formatted if not _looks_like_coords(formatted) else label,
                "landmark": landmark,
                "building": building,
                "street": street,
                "estate": estate,
                "area": area,
                "city": city,
                "state": state,
                "neighborhood": estate,
                "status": "OK",
            }

    if not best:
        return {
            "label": SAFE_FALLBACK,
            "tier": "fallback",
            "formatted_address": SAFE_FALLBACK,
            "landmark": "",
            "building": "",
            "street": "",
            "estate": "",
            "area": "",
            "city": "",
            "state": "",
            "neighborhood": "",
            "status": "ZERO_RESULTS",
        }
    return best


def h3_cell(lat: float, lng: float, res: int = PICKUP_H3_RES) -> Optional[str]:
    try:
        from h3_dispatch import cell_for

        return cell_for(lat, lng, res=res)
    except Exception:
        return None


def h3_neighbors(lat: float, lng: float, k: int = 1, res: int = PICKUP_H3_RES) -> list[str]:
    try:
        from h3_dispatch import cell_disk

        return cell_disk(lat, lng, k=k, res=res) or []
    except Exception:
        cell = h3_cell(lat, lng, res)
        return [cell] if cell else []


async def cache_get_by_h3(lat: float, lng: float) -> Optional[dict[str, Any]]:
    """Lookup exact cell then k=1 neighbors for nearby reuse."""
    cells = h3_neighbors(lat, lng, k=1)
    if not cells:
        return None
    try:
        from redis_store import store

        for cell in cells:
            if not cell:
                continue
            raw = await store.get(f"pickup:h3:{PICKUP_H3_RES}:{cell}")
            if not raw:
                continue
            import json

            data = json.loads(raw) if isinstance(raw, str) else None
            if isinstance(data, dict) and data.get("label") and not _looks_like_coords(str(data["label"])):
                data["cache"] = "h3_hit"
                data["h3_cell"] = cell
                return data
    except Exception:
        logger.debug("pickup h3 cache get failed", exc_info=True)
    return None


async def cache_set_h3(lat: float, lng: float, payload: dict[str, Any], ttl_sec: int = 3600) -> None:
    cell = h3_cell(lat, lng)
    if not cell:
        return
    try:
        import json
        from redis_store import store

        body = {
            **payload,
            "lat": round(float(lat), 6),
            "lng": round(float(lng), 6),
            "cached_at": int(time.time()),
        }
        await store.set(f"pickup:h3:{PICKUP_H3_RES}:{cell}", json.dumps(body), ttl=ttl_sec)
    except Exception:
        logger.debug("pickup h3 cache set failed", exc_info=True)


def to_api_payload(picked: dict[str, Any], *, cache: str = "miss") -> dict[str, Any]:
    label = str(picked.get("label") or SAFE_FALLBACK).strip()
    if _looks_like_coords(label) or not label:
        label = SAFE_FALLBACK
    formatted = str(picked.get("formatted_address") or label).strip()
    if _looks_like_coords(formatted) or not formatted:
        formatted = label
    return {
        "address": formatted,
        "formatted_address": formatted,
        "short_label": label,
        "pickup_label": label,
        "tier": picked.get("tier") or "fallback",
        "city": picked.get("city") or "",
        "state": picked.get("state") or "",
        "country": "Nigeria",
        "neighborhood": picked.get("neighborhood") or picked.get("estate") or "",
        "landmark": picked.get("landmark") or "",
        "building": picked.get("building") or "",
        "street": picked.get("street") or "",
        "estate": picked.get("estate") or "",
        "area": picked.get("area") or "",
        "status": picked.get("status") or "OK",
        "cache": cache,
    }
