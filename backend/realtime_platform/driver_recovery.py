"""Driver Recovery Manager — crash / FGS kill → online + trip + sockets + GPS.

Called from:
  • POST /api/realtime/session/recover (and heal endpoint enhancement)
  • Android boot / foreground bootstrap
  • Guardians worker soft-check for drivers with was_online flag
"""
from __future__ import annotations

import logging
import time
from typing import Any, Optional

from realtime_platform.healing import heal_session
from realtime_platform.observability import incr, observe_ms, trace

logger = logging.getLogger("realtime_platform.driver_recovery")


async def recover_driver_session(
    driver_id: str,
    *,
    lat: float = 0.0,
    lng: float = 0.0,
    network_quality: str = "unknown",
    session_id: str = "",
    resume_online: bool = True,
    client_event_id: str = "",
) -> dict[str, Any]:
    """
    Full recovery path after crash / process death:
      1. Heal sockets + replay pending offers
      2. Optionally restore Redis+Mongo online presence
      3. Resume active trip payload for client
      4. Return recovery plan for mobile (GPS interval, heartbeat)
    """
    with trace("recovery.driver", driver_id=driver_id):
        t0 = time.perf_counter()
        from database import db

        heal = await heal_session(driver_id, role="driver")

        presence_restored = False
        if resume_online:
            # Prefer explicit client flag; else restore if Mongo still says online / was_online
            profile = await db.driver_profiles.find_one(
                {"user_id": driver_id},
                {"_id": 0, "is_online": 1, "was_online": 1, "active_trip_id": 1},
            ) or {}
            should = bool(profile.get("is_online") or profile.get("was_online"))
            if should and (lat or lng or profile.get("is_online")):
                try:
                    from realtime_platform.presence_service import set_online, heartbeat

                    if lat or lng:
                        await set_online(
                            driver_id,
                            lat=lat,
                            lng=lng,
                            network_quality=network_quality,
                            session_id=session_id or f"recover:{int(time.time())}",
                            client_event_id=client_event_id or f"recover:{driver_id}:{int(time.time())}",
                        )
                    else:
                        await heartbeat(driver_id, network_quality=network_quality)
                    presence_restored = True
                    incr("recovery.presence_restored")
                except Exception:
                    logger.exception("presence restore failed driver=%s", driver_id)

        active_trip: Optional[dict[str, Any]] = None
        trip_id = ""
        try:
            profile = await db.driver_profiles.find_one(
                {"user_id": driver_id},
                {"_id": 0, "active_trip_id": 1},
            ) or {}
            trip_id = str(profile.get("active_trip_id") or "")
            if trip_id:
                active_trip = await db.trips.find_one(
                    {"id": trip_id, "status": {"$in": ["accepted", "arrived", "ongoing", "pending_payment"]}},
                    {"_id": 0},
                )
                if active_trip:
                    # Push trip_update so client UI resumes without user action
                    try:
                        from routers.realtime_dispatch import push_rider_trip_update

                        await push_rider_trip_update(
                            str(active_trip.get("rider_id") or ""),
                            {"type": "trip_update", "trip": active_trip, "recovery": True},
                        )
                    except Exception:
                        pass
                    try:
                        from routers.realtime_dispatch import driver_offer_hub

                        await driver_offer_hub.send_json(
                            driver_id,
                            {"type": "trip_resume", "trip": active_trip, "recovery": True},
                        )
                    except Exception:
                        pass
                    incr("recovery.trip_resumed")
        except Exception:
            logger.debug("active trip resume failed", exc_info=True)

        # Open offers still waiting
        open_offers = []
        try:
            open_offers = await db.trip_offers.find(
                {"driver_id": driver_id, "status": {"$in": ["offered", "seen"]}},
                {"_id": 0},
            ).limit(20).to_list(20)
        except Exception:
            pass

        ms = (time.perf_counter() - t0) * 1000
        observe_ms("recovery.driver_ms", ms)
        incr("recovery.driver")
        return {
            "ok": True,
            "driver_id": driver_id,
            "heal": heal,
            "presence_restored": presence_restored,
            "active_trip_id": trip_id if active_trip else "",
            "active_trip": active_trip,
            "open_offers": open_offers,
            "client_plan": {
                "heartbeat_interval_sec": 20,
                "gps_interval_sec": 5 if active_trip else 12,
                "reconnect": True,
                "resume_trip": bool(active_trip),
            },
            "latency_ms": round(ms, 1),
        }
