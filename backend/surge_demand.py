"""
Area demand proxy (0–1) for hybrid surge — shared by fare estimates, driver earnings, and tests.

Uses pending trips vs online drivers near pickup; same formula as historical drivers router logic.
"""

from __future__ import annotations

import logging
import math
from datetime import datetime, timedelta
from typing import Any, Optional, Tuple

logger = logging.getLogger(__name__)


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in kilometres."""
    rlat1, rlng1, rlat2, rlng2 = map(math.radians, (lat1, lng1, lat2, lng2))
    dlat = rlat2 - rlat1
    dlng = rlng2 - rlng1
    a = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlng / 2) ** 2
    return 6371.0 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def trip_pickup_coords(trip: dict) -> Tuple[Optional[float], Optional[float]]:
    """Resolve pickup lat/lng from trip document variants."""
    pl = trip.get("pickup_location") or trip.get("pickup") or {}
    plat = plng = None
    if isinstance(pl, dict):
        plat = pl.get("lat") if pl.get("lat") is not None else pl.get("latitude")
        plng = pl.get("lng") if pl.get("lng") is not None else pl.get("longitude")
    if plat is None and trip.get("pickup_lat") is not None:
        plat = trip.get("pickup_lat")
        plng = trip.get("pickup_lng")
    try:
        if plat is not None and plng is not None:
            return float(plat), float(plng)
    except (TypeError, ValueError):
        pass
    return None, None


async def estimate_area_demand_ratio_near(db: Any, lat: float, lng: float, radius_km: float = 14.0) -> float:
    """
    Pending pickups vs online drivers in ~radius_km → 0–1 proxy for hybrid surge demand tiers.
    Never raises — Mongo/network/index issues must not break fare estimates.
    """
    try:
        since = datetime.utcnow() - timedelta(minutes=45)
        trips = await db.trips.find(
            {"status": {"$in": ["pending", "pending_driver_offers"]}, "created_at": {"$gte": since}},
            {"pickup_lat": 1, "pickup_lng": 1, "pickup_location": 1},
        ).limit(400).to_list(length=400)

        pending_near = 0
        for t in trips:
            plat, plng = trip_pickup_coords(t)
            if plat is None or plng is None:
                continue
            if haversine_km(lat, lng, plat, plng) <= radius_km:
                pending_near += 1

        online_profiles = await db.driver_profiles.find(
            {"is_online": True, "verification_status": "approved"},
            {"current_location": 1},
        ).to_list(600)

        drivers_near = 0
        for p in online_profiles:
            loc = p.get("current_location") or {}
            try:
                dlat = loc.get("lat")
                dlng = loc.get("lng")
                if dlat is None or dlng is None:
                    continue
                if haversine_km(lat, lng, float(dlat), float(dlng)) <= radius_km:
                    drivers_near += 1
            except (TypeError, ValueError):
                continue

        supply = max(4.0, float(drivers_near))
        pressure = float(pending_near) / supply
        ratio = min(1.0, math.sqrt(pressure / 2.2))
        return round(ratio, 3)
    except Exception:
        logger.warning("estimate_area_demand_ratio_near failed; using 0.0", exc_info=True)
        return 0.0
