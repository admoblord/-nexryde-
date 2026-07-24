"""Realtime Health Manager — dead sockets, stale GPS, zombie online, auto-heal.

Continuous probes (also invoked by guardians_worker):
  • Detect drivers marked online whose GPS is stale or heartbeat TTL expired
  • Soft-offline unreachable drivers (Redis presence first)
  • Warm hub channels / report dead local socket counts
  • Composite cluster health for Reliability Dashboard
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any, Optional

from realtime_platform.observability import incr, observe_ms, trace

logger = logging.getLogger("realtime_platform.health_manager")

GPS_STALE_MS = 90_000
HEARTBEAT_STALE_SEC = 180
ZOMBIE_SCAN_LIMIT = 200


async def _hub_stats() -> dict[str, Any]:
    try:
        from routers.realtime_dispatch import driver_offer_hub, rider_trip_hub

        def _count(hub: Any) -> dict[str, int]:
            sockets = getattr(hub, "_sockets", {}) or {}
            streams = getattr(hub, "_streams", {}) or {}
            return {
                "users_with_sockets": len(sockets),
                "socket_connections": sum(len(v) for v in sockets.values()),
                "stream_connections": sum(len(v) for v in streams.values()),
            }

        return {"driver": _count(driver_offer_hub), "rider": _count(rider_trip_hub)}
    except Exception:
        return {"driver": {}, "rider": {}}


async def detect_and_heal_zombies(*, limit: int = ZOMBIE_SCAN_LIMIT) -> dict[str, Any]:
    """Find online drivers with dead GPS/heartbeat and soft-offline them."""
    with trace("health.zombie_scan"):
        from database import db
        from driver_presence import get_driver_presence, set_driver_offline

        now_ms = int(time.time() * 1000)
        healed = 0
        stale_gps = 0
        unreachable = 0
        checked = 0

        profiles = await db.driver_profiles.find(
            {"is_online": True},
            {"_id": 0, "user_id": 1, "current_location": 1},
        ).limit(limit).to_list(limit)

        for p in profiles:
            did = str(p.get("user_id") or "")
            if not did:
                continue
            checked += 1
            pres = await get_driver_presence(did) or {}
            last_seen = int(pres.get("last_seen_ms") or pres.get("gps_updated_ms") or 0)
            gps_updated = int(pres.get("gps_updated_ms") or 0)
            age_ms = max(0, now_ms - last_seen) if last_seen else HEARTBEAT_STALE_SEC * 1000 + 1
            gps_age = max(0, now_ms - gps_updated) if gps_updated else GPS_STALE_MS + 1

            # Redis presence gone / expired while Mongo still says online
            if not pres.get("online"):
                unreachable += 1
                try:
                    await set_driver_offline(did)
                    await db.driver_profiles.update_one(
                        {"user_id": did},
                        {"$set": {"is_online": False, "health_healed_at": datetime.now(timezone.utc).isoformat()}},
                    )
                    healed += 1
                    incr("health.zombie_offline", reason="presence_missing")
                except Exception:
                    logger.debug("zombie offline failed driver=%s", did, exc_info=True)
                continue

            if age_ms > HEARTBEAT_STALE_SEC * 1000:
                unreachable += 1
                try:
                    from realtime_platform.presence_service import set_offline

                    await set_offline(did, client_event_id=f"health:stale_hb:{did}:{now_ms}")
                    healed += 1
                    incr("health.zombie_offline", reason="heartbeat_stale")
                except Exception:
                    logger.debug("stale heartbeat heal failed driver=%s", did, exc_info=True)
                continue

            if gps_age > GPS_STALE_MS:
                stale_gps += 1
                # Soft: mark unavailable for matching but keep online for reconnect window
                try:
                    from redis_store import store
                    import json

                    enriched = {**pres, "available": False, "gps_stale": True, "connection_score": min(float(pres.get("connection_score") or 50), 35)}
                    await store.set(f"driver:presence:{did}", json.dumps(enriched), ttl=HEARTBEAT_STALE_SEC)
                    incr("health.gps_stale_flagged")
                except Exception:
                    pass

        result = {
            "checked": checked,
            "healed": healed,
            "stale_gps": stale_gps,
            "unreachable": unreachable,
        }
        incr("health.zombie_scan", healed=healed)
        return result


async def probe_cluster() -> dict[str, Any]:
    """Full Realtime Health Manager snapshot."""
    t0 = time.perf_counter()
    redis_ok = False
    redis_ms: Optional[float] = None
    try:
        from redis_store import store

        t = time.perf_counter()
        redis_ok = bool(await store.ping())
        redis_ms = round((time.perf_counter() - t) * 1000, 1)
    except Exception:
        redis_ok = False

    kafka_configured = False
    try:
        from realtime_platform.kafka_client import kafka_configured as _kc

        kafka_configured = _kc()
    except Exception:
        pass

    dlq_depth = 0
    outbox_pending = 0
    try:
        from database import db

        dlq_depth = await db.realtime_dlq.count_documents({})
        outbox_pending = await db.realtime_event_outbox.count_documents({"status": "pending"})
    except Exception:
        pass

    hubs = await _hub_stats()
    observe_ms("health.probe_ms", (time.perf_counter() - t0) * 1000)

    clusters = {
        "presence": {"ok": redis_ok, "redis_latency_ms": redis_ms},
        "dispatch": {"ok": redis_ok},
        "delivery": {"ok": redis_ok, "hubs": hubs},
        "trip_consistency": {"ok": True},
        "reliability": {"ok": redis_ok, "dlq_depth": dlq_depth, "outbox_pending": outbox_pending},
        "monitoring": {"ok": True},
    }
    ok = redis_ok
    return {
        "ok": ok,
        "service": "realtime_health_manager",
        "redis_ok": redis_ok,
        "redis_latency_ms": redis_ms,
        "kafka_configured": kafka_configured,
        "dlq_depth": dlq_depth,
        "outbox_pending": outbox_pending,
        "hubs": hubs,
        "clusters": clusters,
        "ts_ms": int(time.time() * 1000),
    }


async def run_health_cycle() -> dict[str, Any]:
    """One manager tick: probe + zombie heal."""
    probe = await probe_cluster()
    zombies = await detect_and_heal_zombies()
    return {**probe, "zombies": zombies}
