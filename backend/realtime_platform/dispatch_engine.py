"""Dispatch Engine — H3 lookup, ETA ranking, scoring, duplicate-safe offer create."""
from __future__ import annotations

import logging
import time
from typing import Any, Optional
from uuid import uuid4

from realtime_platform.config import get_realtime_config
from realtime_platform.idempotency import claim
from realtime_platform.models import DispatchCandidate
from realtime_platform.observability import incr, observe_ms, trace

logger = logging.getLogger("realtime_platform.dispatch")


def _eta_sec(distance_m: float, *, speed_kmh: float = 22.0) -> float:
    # Lagos urban default ~22 km/h door-to-door for ranking (routing can refine later).
    meters_per_sec = max(2.0, (speed_kmh * 1000.0) / 3600.0)
    return max(60.0, float(distance_m) / meters_per_sec)


def _rank_score(distance_m: float, eta_sec: float, visibility: float, connection: float) -> float:
    # Lower distance/ETA wins; visibility + connection as soft boosts.
    return (
        -float(distance_m)
        - (float(eta_sec) * 2.0)
        + (float(visibility) * 8.0)
        + (float(connection) * 3.0)
    )


async def find_candidates(
    *,
    pickup_lat: float,
    pickup_lng: float,
    blocked_drivers: Optional[list[str]] = None,
    limit: int = 20,
) -> list[DispatchCandidate]:
    """H3 → GEO nearby drivers with ETA ranking (does not hydrate Mongo yet)."""
    cfg = get_realtime_config()
    blocked = set(blocked_drivers or [])
    with trace("dispatch.find_candidates"):
        from driver_presence import get_driver_presence, get_driver_presences, nearby_h3_drivers, nearby_available_drivers

        t0 = time.perf_counter()
        hits = await nearby_h3_drivers(
            lng=pickup_lng, lat=pickup_lat, k=cfg.h3_k_near, count=limit * 2
        )
        source = "h3"
        if len(hits) < 5:
            wider = await nearby_h3_drivers(
                lng=pickup_lng, lat=pickup_lat, k=cfg.h3_k_far, count=limit * 2
            )
            if len(wider) > len(hits):
                hits = wider
        if len(hits) < 5:
            geo = await nearby_available_drivers(
                lng=pickup_lng, lat=pickup_lat, radius_m=8_000, count=limit * 2
            )
            if len(geo) > len(hits):
                hits = geo
                source = "redis_geo"
        cands: list[DispatchCandidate] = []
        # Batch presence — avoid N+1 Redis GETs under load
        candidate_ids = [
            str(h.get("driver_id") or "")
            for h in hits
            if h.get("driver_id") and str(h.get("driver_id")) not in blocked
        ]
        try:
            presence_map = await get_driver_presences(candidate_ids)
        except Exception:
            presence_map = {}
            for did in candidate_ids:
                presence_map[did] = await get_driver_presence(did) or {}

        for h in hits:
            did = str(h.get("driver_id") or "")
            if not did or did in blocked:
                continue
            dist = float(h.get("distance_m") or 0)
            pres = presence_map.get(did) or {}
            if not pres.get("online"):
                continue
            conn = float(pres.get("connection_score") or 50)
            if conn < 25:
                continue
            # Device Health Engine — skip unhealthy devices before ranking
            try:
                from realtime_platform.device_health import evaluate_from_presence

                if not evaluate_from_presence(pres).healthy:
                    incr("dispatch.device_health_skip")
                    continue
            except Exception:
                pass
            eta = _eta_sec(dist)
            vis = 50.0
            cands.append(
                DispatchCandidate(
                    driver_id=did,
                    distance_m=dist,
                    eta_sec=eta,
                    score=_rank_score(dist, eta, vis, conn),
                    visibility_score=vis,
                )
            )
        cands.sort(key=lambda c: c.score, reverse=True)
        out = cands[:limit]
        observe_ms("dispatch.find_ms", (time.perf_counter() - t0) * 1000, source=source)
        incr("dispatch.candidates", count=len(out), source=source)
        return out


async def create_offers_for_trip(
    trip: dict[str, Any],
    *,
    blocked_drivers: Optional[list[str]] = None,
    db: Any = None,
) -> list[dict[str, Any]]:
    """
    Platform entry for offer creation — idempotent per trip wave.
    Delegates eligibility hydration to existing trips helper when available,
    otherwise creates offers from H3 candidates.
    """
    cfg = get_realtime_config()
    trip_id = str(trip.get("id") or "")
    if not trip_id:
        return []
    wave_key = f"dispatch:wave:{trip_id}:{int(time.time()) // max(1, cfg.offer_ttl_sec)}"
    if not await claim(wave_key, ttl_sec=cfg.offer_ttl_sec):
        incr("dispatch.duplicate_wave_blocked")
        return []

    with trace("dispatch.create_offers", trip_id=trip_id):
        # Prefer existing eligibility pipeline (subscriptions, work zone, etc.)
        try:
            from routers.trips import _get_eligible_drivers_for_trip

            eligible = await _get_eligible_drivers_for_trip(trip, blocked_drivers or [])
        except Exception:
            logger.exception("eligible drivers fallback to H3-only")
            pickup = trip.get("pickup_location") or {}
            cands = await find_candidates(
                pickup_lat=float(pickup.get("lat") or 0),
                pickup_lng=float(pickup.get("lng") or 0),
                blocked_drivers=blocked_drivers,
                limit=cfg.max_offers_per_trip,
            )
            eligible = [
                {
                    "driver_id": c.driver_id,
                    "distance_to_pickup": round(c.distance_m / 1000.0, 2),
                    "visibility_score": c.visibility_score,
                }
                for c in cands
            ]

        if db is None:
            from database import db as _db

            db = _db

        from datetime import datetime, timedelta, timezone

        now = datetime.now(timezone.utc)
        expires_at = (now + timedelta(seconds=cfg.offer_ttl_sec)).isoformat()
        offers: list[dict[str, Any]] = []
        eligible = list(eligible or [])
        if eligible:
            await db.trip_offers.delete_many(
                {"trip_id": trip_id, "status": {"$in": ["offered", "seen"]}}
            )
        try:
            from realtime_platform.device_health import filter_eligible_driver_dicts

            eligible = await filter_eligible_driver_dicts(eligible)
        except Exception:
            logger.debug("device health filter skipped", exc_info=True)

        for driver in eligible[: cfg.max_offers_per_trip]:
            offer_id = str(uuid4())
            # Duplicate prevention: one active offer per trip+driver
            if not await claim(f"offer:active:{trip_id}:{driver['driver_id']}", ttl_sec=cfg.offer_ttl_sec):
                incr("dispatch.duplicate_offer_blocked")
                continue
            offer = {
                "id": offer_id,
                "trip_id": trip_id,
                "driver_id": driver["driver_id"],
                "rider_id": trip.get("rider_id"),
                "status": "offered",
                "distance_to_pickup": driver.get("distance_to_pickup"),
                "created_at": now.isoformat(),
                "expires_at": expires_at,
                "preferred": trip.get("preferred_driver_id") == driver["driver_id"],
                "platform": "realtime_v1",
                "delivery_status": "pending",
                "finishing_trip": bool(driver.get("finishing_trip")),
                "finishing_eta_sec": driver.get("finishing_eta_sec"),
                "prior_trip_id": driver.get("prior_trip_id"),
            }
            offers.append(offer)
        if offers:
            await db.trip_offers.insert_many(offers)
        incr("dispatch.offers_created", count=len(offers))
        return offers
