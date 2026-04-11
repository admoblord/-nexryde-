"""NEXRYDE Shield — driver-to-driver SOS broadcast (nearby online drivers)."""
from __future__ import annotations

import logging
import math
from typing import Optional

from database import db
from push_notifications import send_push_notification

logger = logging.getLogger(__name__)

# 2 km radius per product spec (Shield safety net).
SOS_DRIVER_RADIUS_KM = 2.0


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


async def broadcast_sos_to_nearby_nexryde_drivers(
    lat: float,
    lng: float,
    exclude_user_id: str,
    trip_id: str,
    sos_id: str,
    reporter_name: str,
) -> int:
    """
    Push high-priority alerts to other online NEXRYDE drivers within SOS_DRIVER_RADIUS_KM.
    Returns count of successful push deliveries (tokens present).
    """
    try:
        profiles = await db.driver_profiles.find(
            {"is_online": True, "verification_status": "approved"},
            {"_id": 0, "user_id": 1, "current_location": 1},
        ).to_list(600)
    except Exception as e:
        logger.warning("shield_sos_network query failed: %s", e)
        return 0

    notified = 0
    for p in profiles:
        uid: Optional[str] = p.get("user_id")
        if not uid or uid == exclude_user_id:
            continue
        loc = p.get("current_location") or {}
        try:
            plat = float(loc.get("lat"))
            plng = float(loc.get("lng"))
        except (TypeError, ValueError):
            continue
        dist = _haversine_km(lat, lng, plat, plng)
        if dist > SOS_DRIVER_RADIUS_KM:
            continue
        title = "NEXRYDE Shield — SOS nearby"
        body = f"{reporter_name or 'A driver'} needs help (~{dist:.1f} km). Open the app."
        ok = await send_push_notification(
            uid,
            title,
            body,
            {
                "type": "shield_driver_sos",
                "trip_id": trip_id,
                "sos_id": sos_id,
                "lat": lat,
                "lng": lng,
            },
        )
        if ok:
            notified += 1
    logger.info("shield_sos_network trip_id=%s sos_id=%s pushes_ok=%s", trip_id, sos_id, notified)
    return notified
