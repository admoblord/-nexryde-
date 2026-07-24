"""Presence Service — Redis online state, GPS freshness, connection score."""
from __future__ import annotations

import json
import logging
import time
from typing import Any, Optional

from realtime_platform.ack_engine import acknowledge, register_pending
from realtime_platform.config import get_realtime_config
from realtime_platform.models import EventType, PresenceSnapshot, RealtimeEvent
from realtime_platform.observability import incr, observe_ms, trace

logger = logging.getLogger("realtime_platform.presence")


def _score(
    *,
    gps_age_ms: int,
    network_quality: str,
    heartbeat_ok: bool,
) -> float:
    score = 100.0
    if not heartbeat_ok:
        score -= 40
    if gps_age_ms > 45_000:
        score -= 30
    elif gps_age_ms > 20_000:
        score -= 15
    nq = (network_quality or "unknown").lower()
    if nq == "poor":
        score -= 25
    elif nq == "fair":
        score -= 10
    elif nq == "unknown":
        score -= 5
    return max(0.0, min(100.0, score))


async def set_online(
    driver_id: str,
    *,
    lat: float = 0.0,
    lng: float = 0.0,
    network_quality: str = "unknown",
    session_id: str = "",
    client_event_id: str = "",
) -> dict[str, Any]:
    """Go online — updates Redis presence/H3/GEO and returns ACK event."""
    cfg = get_realtime_config()
    with trace("presence.online", driver_id=driver_id) as ctx:
        from driver_presence import set_driver_online

        t0 = time.perf_counter()
        await set_driver_online(driver_id, lat=lat, lng=lng)
        # Enrich presence JSON with platform fields
        try:
            from redis_store import store
            from driver_presence import get_driver_presence

            pres = await get_driver_presence(driver_id) or {}
            now = int(time.time() * 1000)
            gps_age = 0
            enriched = {
                **pres,
                "online": True,
                "network_quality": network_quality,
                "session_id": session_id or pres.get("session_id") or "",
                "last_seen_ms": now,
                "gps_updated_ms": now if lat and lng else int(pres.get("gps_updated_ms") or now),
                "connection_score": _score(
                    gps_age_ms=gps_age,
                    network_quality=network_quality,
                    heartbeat_ok=True,
                ),
                "available": True,
            }
            await store.set(
                f"driver:presence:{driver_id}",
                json.dumps(enriched),
                ttl=cfg.presence_ttl_sec,
            )
        except Exception:
            logger.debug("presence enrich failed", exc_info=True)

        event = RealtimeEvent.new(
            EventType.ONLINE,
            driver_id,
            payload={"lat": lat, "lng": lng, "session_id": session_id},
            ttl_sec=60,
            idempotency_key=client_event_id or f"online:{driver_id}:{session_id}",
        )
        await register_pending(event)
        # Server-side auto-ack for online when Redis write succeeded (client still ACKs).
        await acknowledge(event.event_id, actor_id=driver_id, event_type=EventType.ONLINE.value)
        ms = (time.perf_counter() - t0) * 1000
        observe_ms("presence.online_ms", ms)
        incr("presence.online")
        try:
            from realtime_platform.surge_stream import record_supply_event

            await record_supply_event(
                driver_id=driver_id,
                event_type="driver_online",
                lat=lat,
                lng=lng,
            )
        except Exception:
            pass
        ctx["ok"] = True
        snap = await get_presence(driver_id)
        return {
            "ok": True,
            "online": True,
            "latency_ms": round(ms, 1),
            "event": event.to_dict(),
            "presence": snap.to_dict() if snap else None,
            "target_ms": cfg.online_ack_timeout_ms,
        }


async def set_offline(driver_id: str, *, client_event_id: str = "") -> dict[str, Any]:
    cfg = get_realtime_config()
    with trace("presence.offline", driver_id=driver_id):
        from driver_presence import set_driver_offline

        t0 = time.perf_counter()
        await set_driver_offline(driver_id)
        cancelled = 0
        try:
            from realtime_platform.lifecycle import cancel_driver_open_offers

            cancelled = await cancel_driver_open_offers(driver_id, reason="driver_offline")
        except Exception:
            logger.exception("cancel open offers on offline failed driver=%s", driver_id)
        event = RealtimeEvent.new(
            EventType.OFFLINE,
            driver_id,
            ttl_sec=60,
            payload={"offers_cancelled": cancelled},
            idempotency_key=client_event_id or f"offline:{driver_id}:{int(time.time())}",
        )
        await register_pending(event)
        await acknowledge(event.event_id, actor_id=driver_id, event_type=EventType.OFFLINE.value)
        ms = (time.perf_counter() - t0) * 1000
        observe_ms("presence.offline_ms", ms)
        incr("presence.offline")
        try:
            from realtime_platform.surge_stream import record_supply_event

            await record_supply_event(driver_id=driver_id, event_type="driver_offline")
        except Exception:
            pass
        return {
            "ok": True,
            "online": False,
            "latency_ms": round(ms, 1),
            "event": event.to_dict(),
            "offers_cancelled": cancelled,
            "target_ms": cfg.offline_ack_timeout_ms,
        }


async def heartbeat(
    driver_id: str,
    *,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    network_quality: str = "unknown",
    device_health: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    cfg = get_realtime_config()
    from driver_presence import refresh_driver_presence, get_driver_presence

    await refresh_driver_presence(driver_id, lat=lat, lng=lng)
    now = int(time.time() * 1000)
    health_report = None
    try:
        from redis_store import store

        pres = await get_driver_presence(driver_id) or {}
        gps_updated = int(pres.get("gps_updated_ms") or now)
        if lat is not None and lng is not None and lat and lng:
            gps_updated = now
        gps_age = max(0, now - gps_updated)
        enriched = {
            **pres,
            "online": True,
            "network_quality": network_quality,
            "last_seen_ms": now,
            "gps_updated_ms": gps_updated,
            "connection_score": _score(
                gps_age_ms=gps_age,
                network_quality=network_quality,
                heartbeat_ok=True,
            ),
            "available": gps_age <= cfg.gps_fresh_sec * 1000,
        }
        if lat is not None:
            enriched["lat"] = float(lat)
        if lng is not None:
            enriched["lng"] = float(lng)
        await store.set(
            f"driver:presence:{driver_id}",
            json.dumps(enriched),
            ttl=cfg.presence_ttl_sec,
        )
        if device_health and isinstance(device_health, dict):
            from realtime_platform.device_health import report_device_health

            health_report = await report_device_health(
                driver_id,
                socket_connected=device_health.get("socket_connected"),
                fgs_running=device_health.get("fgs_running"),
                fullscreen_notif_enabled=device_health.get("fullscreen_notif_enabled"),
                battery_optimization_ok=device_health.get("battery_optimization_ok"),
                network_quality=network_quality or device_health.get("network_quality"),
                app_version=device_health.get("app_version"),
                gps_age_ms=device_health.get("gps_age_ms", gps_age),
                lat=lat,
                lng=lng,
            )
    except Exception:
        logger.debug("heartbeat enrich failed", exc_info=True)
    incr("presence.heartbeat")
    snap = await get_presence(driver_id)
    if snap:
        observe_ms("presence.gps_age_ms", float(snap.gps_age_ms))
    out: dict[str, Any] = {
        "ok": True,
        "presence": snap.to_dict() if snap else None,
        "heartbeat_interval_sec": cfg.heartbeat_interval_sec,
    }
    if health_report is not None:
        out["device_health"] = health_report.to_dict()
        out["dispatch_eligible"] = health_report.healthy
    return out


async def get_presence(driver_id: str) -> Optional[PresenceSnapshot]:
    cfg = get_realtime_config()
    try:
        from driver_presence import get_driver_presence

        pres = await get_driver_presence(driver_id)
        if not pres:
            return None
        now = int(time.time() * 1000)
        last_seen = int(pres.get("last_seen_ms") or pres.get("updatedAt") or now)
        gps_updated = int(pres.get("gps_updated_ms") or last_seen)
        gps_age = max(0, now - gps_updated)
        nq = str(pres.get("network_quality") or "unknown")
        online = bool(pres.get("online"))
        score = float(
            pres.get("connection_score")
            or _score(gps_age_ms=gps_age, network_quality=nq, heartbeat_ok=online)
        )
        available = online and gps_age <= cfg.gps_fresh_sec * 1000 and score >= 40
        return PresenceSnapshot(
            driver_id=driver_id,
            online=online,
            lat=float(pres.get("lat") or 0),
            lng=float(pres.get("lng") or 0),
            h3_cell=str(pres.get("h3_cell") or ""),
            last_seen_ms=last_seen,
            gps_age_ms=gps_age,
            network_quality=nq,
            connection_score=score,
            available=available,
            session_id=str(pres.get("session_id") or ""),
        )
    except Exception:
        logger.exception("get_presence failed driver=%s", driver_id)
        return None
