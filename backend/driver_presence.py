"""Driver online presence — Redis-first with Mongo is_online as denormalized index.

Primary store:
  driver:presence:{driver_id}  JSON {online, lat, lng, h3_cell, updatedAt}  TTL 180s
  drivers:available            GEO set (lng, lat, member=driver_id)
  h3:8:{cell}:drivers          Uber H3 cell membership sets

Heartbeat (~60s) refreshes TTL so crashed drivers drop out automatically while
short network switches do not randomly remove online drivers.
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any, Optional

from redis_store import store

logger = logging.getLogger(__name__)

PRESENCE_TTL_SEC = 180
PRESENCE_KEY_PREFIX = "driver:presence:"
GEO_AVAILABLE_KEY = "drivers:available"


def _presence_key(driver_id: str) -> str:
    return f"{PRESENCE_KEY_PREFIX}{driver_id}"


async def get_driver_presence(driver_id: str) -> Optional[dict[str, Any]]:
    if not driver_id:
        return None
    raw = await store.get(_presence_key(driver_id))
    if not raw:
        return None
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else None
    except (TypeError, ValueError, json.JSONDecodeError):
        return None


async def get_driver_presences(driver_ids: list[str]) -> dict[str, dict[str, Any]]:
    """Batch presence lookup — one Redis MGET instead of N sequential GETs."""
    ids = [str(d) for d in driver_ids if d]
    if not ids:
        return {}
    keys = [_presence_key(did) for did in ids]
    try:
        raws = await store.mget(keys)
    except Exception:
        # Fallback: sequential (older store stubs)
        out: dict[str, dict[str, Any]] = {}
        for did in ids:
            pres = await get_driver_presence(did)
            if pres:
                out[did] = pres
        return out
    out = {}
    for did, raw in zip(ids, raws or []):
        if not raw:
            continue
        try:
            data = json.loads(raw)
            if isinstance(data, dict):
                out[did] = data
        except (TypeError, ValueError, json.JSONDecodeError):
            continue
    return out


async def is_driver_online(driver_id: str) -> bool:
    pres = await get_driver_presence(driver_id)
    return bool(pres and pres.get("online"))


async def set_driver_online(
    driver_id: str,
    *,
    lat: float = 0.0,
    lng: float = 0.0,
) -> None:
    from h3_dispatch import index_driver_cell

    existing = await get_driver_presence(driver_id) or {}
    prev_cell = str(existing.get("h3_cell") or "") or None
    use_lat = float(lat or 0)
    use_lng = float(lng or 0)
    h3_cell = prev_cell
    if use_lat and use_lng:
        h3_cell = await index_driver_cell(
            store,
            driver_id,
            lat=use_lat,
            lng=use_lng,
            previous_cell=prev_cell,
        )
        await store.geoadd(GEO_AVAILABLE_KEY, use_lng, use_lat, driver_id)
    payload = json.dumps(
        {
            **{k: v for k, v in existing.items() if k not in ("online",)},
            "online": True,
            "lat": use_lat,
            "lng": use_lng,
            "h3_cell": h3_cell,
            "updatedAt": int(time.time() * 1000),
        }
    )
    await store.set(_presence_key(driver_id), payload, ttl=PRESENCE_TTL_SEC)


async def set_driver_offline(driver_id: str) -> None:
    from h3_dispatch import remove_driver_cell

    existing = await get_driver_presence(driver_id) or {}
    await remove_driver_cell(store, driver_id, str(existing.get("h3_cell") or "") or None)
    await store.delete(_presence_key(driver_id))
    await store.georemove(GEO_AVAILABLE_KEY, driver_id)


async def clear_driver_presence_safe(driver_id: str) -> None:
    """Best-effort Redis/GEO clear used after Mongo force-offline (suspend/enforcement)."""
    if not driver_id:
        return
    try:
        await set_driver_offline(driver_id)
    except Exception:
        logger.exception("clear_driver_presence_safe failed driver=%s", driver_id)


async def refresh_driver_presence(
    driver_id: str,
    *,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
) -> None:
    """Extend TTL (~heartbeat) only when Redis already marks the driver online.

    Never invents presence from a stale key — Mongo-offline drivers must not be
    re-inflated into GEO/dispatch via heartbeat.
    """
    existing = await get_driver_presence(driver_id) or {}
    if not existing.get("online"):
        return
    use_lat = float(lat if lat is not None else existing.get("lat") or 0)
    use_lng = float(lng if lng is not None else existing.get("lng") or 0)
    await set_driver_online(driver_id, lat=use_lat, lng=use_lng)


async def nearby_available_drivers(
    *,
    lng: float,
    lat: float,
    radius_m: float,
    count: int = 30,
) -> list[dict[str, Any]]:
    """Redis GEO radius query — sub-ms nearby candidate ids.

    Returns [{driver_id, distance_m}, ...] nearest-first. Callers must still
    hydrate Mongo profiles and apply subscription / busy / category filters.
    """
    if not lat and not lng:
        return []
    try:
        rows = await store.geosearch(
            GEO_AVAILABLE_KEY,
            float(lng),
            float(lat),
            radius_m=float(radius_m),
            count=max(1, int(count)),
        )
    except Exception:
        logger.exception("nearby_available_drivers geosearch failed")
        return []
    out: list[dict[str, Any]] = []
    for member, dist_m in rows:
        driver_id = str(member or "").strip()
        if not driver_id:
            continue
        out.append({"driver_id": driver_id, "distance_m": float(dist_m)})
    return out


async def nearby_h3_drivers(
    *,
    lng: float,
    lat: float,
    k: int = 2,
    count: int = 30,
) -> list[dict[str, Any]]:
    """Uber H3 k-ring lookup — returns [{driver_id, distance_m}, ...] nearest-first."""
    from h3_dispatch import h3_available, nearby_h3_driver_ids

    if not h3_available() or (not lat and not lng):
        return []
    ids = await nearby_h3_driver_ids(
        store, lat=float(lat), lng=float(lng), k=int(k), count=max(1, int(count)) * 2
    )
    if not ids:
        return []

    import math

    lat1 = math.radians(float(lat))
    lng1 = math.radians(float(lng))
    scored: list[tuple[str, float]] = []
    for driver_id in ids:
        pres = await get_driver_presence(driver_id) or {}
        plat = float(pres.get("lat") or 0)
        plng = float(pres.get("lng") or 0)
        if not plat and not plng:
            scored.append((driver_id, 9_999_999.0))
            continue
        lat2 = math.radians(plat)
        lng2 = math.radians(plng)
        dlat = lat2 - lat1
        dlng = lng2 - lng1
        a = (
            math.sin(dlat / 2) ** 2
            + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
        )
        dist_m = 2 * 6_371_000 * math.asin(min(1.0, math.sqrt(a)))
        scored.append((driver_id, float(dist_m)))
    scored.sort(key=lambda row: row[1])
    return [
        {"driver_id": did, "distance_m": dist}
        for did, dist in scored[: max(1, int(count))]
    ]
