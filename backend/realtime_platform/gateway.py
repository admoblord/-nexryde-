"""Realtime Gateway HTTP API — ACK, presence, heal, metrics, event sync."""
from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

logger = logging.getLogger("realtime_platform.gateway")

realtime_gateway_router = APIRouter(prefix="/api/realtime", tags=["RealtimePlatform"])


def _auth_sub(request: Request) -> Optional[str]:
    token = (
        (request.headers.get("authorization") or "")
        .replace("Bearer ", "")
        .replace("bearer ", "")
        .strip()
    )
    if not token:
        return None
    try:
        from security_advanced import verify_jwt_token

        return str(verify_jwt_token(token).get("sub") or "").strip() or None
    except Exception:
        return None


class AckBody(BaseModel):
    event_id: str
    event_type: str = ""
    offer_id: str = ""


class PresenceBody(BaseModel):
    lat: float = 0
    lng: float = 0
    network_quality: str = "unknown"
    session_id: str = ""
    client_event_id: str = ""


class HeartbeatBody(BaseModel):
    lat: Optional[float] = None
    lng: Optional[float] = None
    network_quality: str = "unknown"
    device_health: Optional[dict[str, Any]] = None


class DeviceHealthBody(BaseModel):
    socket_connected: Optional[bool] = None
    fgs_running: Optional[bool] = None
    fullscreen_notif_enabled: Optional[bool] = None
    battery_optimization_ok: Optional[bool] = None
    network_quality: Optional[str] = None
    app_version: Optional[str] = None
    gps_age_ms: Optional[int] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


class HealBody(BaseModel):
    role: str = "driver"


class RecoverBody(BaseModel):
    lat: float = 0
    lng: float = 0
    network_quality: str = "unknown"
    session_id: str = ""
    resume_online: bool = True
    client_event_id: str = ""


class SyncEventsBody(BaseModel):
    events: list[dict[str, Any]] = Field(default_factory=list)


SUCCESS_CRITERIA = {
    "driver_online_ms": 300,
    "driver_offline_ms": 300,
    "ride_dispatch_ms": 300,
    "ride_delivery_ms": 500,
    "accept_ack_ms": 300,
    "decline_ack_ms": 300,
    "eta_ms": 1000,
    "fare_ms": 1000,
    "ride_delivery_success": 0.9999,
    "trip_completion_success": 0.9999,
    "crash_free_sessions": 0.999,
}


@realtime_gateway_router.get("/health")
async def realtime_health():
    from realtime_platform.healing import health_snapshot
    from realtime_platform.event_bus import _mode

    snap = await health_snapshot()
    code = 200 if snap.get("redis_ok") else 503
    return JSONResponse(
        status_code=code,
        content={
            "service": "realtime_platform",
            "event_bus": _mode(),
            "guarantees": [
                "presence",
                "offer_delivery",
                "delivery_guarantee",
                "device_health",
                "exactly_once_accept",
                "exactly_once_decline",
                "exactly_once_cancel",
                "completion_saga",
                "lifecycle",
                "session_heal",
                "driver_recovery",
                "offer_ledger",
                "kafka_or_redis_bus",
                "health_manager",
                "dispatch_guardian",
                "trip_guardian",
                "reliability_dashboard",
                "chaos_release_gate",
            ],
            "success_criteria": SUCCESS_CRITERIA,
            **snap,
        },
    )


WATCH_METRIC_KEYS = (
    "fare.estimate_io_ms",
    "places.autocomplete_ms",
    "push.missed_offer",
    "push.delivered_acked",
    "push.delivered_unacked",
    "saga.complete_ms",
    "saga.cancel_ms",
    "saga.complete_run",
    "saga.cancel_enqueued",
    "saga.complete_enqueued",
    "trip.cancel_ms",
    "trip.accept_gate_ms",
    "trip.decline_ms",
    "presence.online_ms",
    "presence.offline_ms",
    "push.deliver_ms",
    "event_bus.publish_ms",
    "healing.session_ms",
)


def _pick_watch(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Filter observability snapshot to the ops watch-list."""
    counters = snapshot.get("counters") or {}
    latency = snapshot.get("latency_ms") or {}
    watched_c = {k: v for k, v in counters.items() if any(k.startswith(p) for p in WATCH_METRIC_KEYS)}
    watched_l = {k: v for k, v in latency.items() if any(k.startswith(p) for p in WATCH_METRIC_KEYS)}
    # Also include unprefixed exact keys
    for key in WATCH_METRIC_KEYS:
        if key in counters and key not in watched_c:
            watched_c[key] = counters[key]
        if key in latency and key not in watched_l:
            watched_l[key] = latency[key]
    return {"counters": watched_c, "latency_ms": watched_l}


@realtime_gateway_router.get("/metrics")
async def realtime_metrics(request: Request):
    # Ops-facing; require auth to avoid public scrape of internals.
    if not _auth_sub(request):
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    from realtime_platform.observability import snapshot

    return {**snapshot(), "success_criteria": SUCCESS_CRITERIA}


@realtime_gateway_router.get("/metrics/watch")
async def realtime_metrics_watch(request: Request):
    """
    Compact SLO watch board — the metrics named in launch readiness:
    fare.estimate_io_ms, places.autocomplete_ms, push.missed_offer, saga.*,
    trip.cancel_ms, plus Redis latency from health.
    """
    if not _auth_sub(request):
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    from realtime_platform.healing import health_snapshot
    from realtime_platform.observability import snapshot

    snap = snapshot()
    health = await health_snapshot()
    watch = _pick_watch(snap)
    redis_ms = health.get("redis_latency_ms")
    alerts: list[str] = []
    # Soft alerts vs success criteria
    fare_l = (watch.get("latency_ms") or {}).get("fare.estimate_io_ms") or {}
    if fare_l.get("p95") and fare_l["p95"] > SUCCESS_CRITERIA["fare_ms"]:
        alerts.append(f"fare.estimate_io_ms p95={fare_l['p95']:.0f} > {SUCCESS_CRITERIA['fare_ms']}")
    cancel_l = (watch.get("latency_ms") or {}).get("trip.cancel_ms") or {}
    if cancel_l.get("p95") and cancel_l["p95"] > 500:
        alerts.append(f"trip.cancel_ms p95={cancel_l['p95']:.0f} > 500")
    missed = int((watch.get("counters") or {}).get("push.missed_offer") or 0)
    delivered = int((watch.get("counters") or {}).get("push.delivered_acked") or 0)
    if missed > 0 and delivered > 0 and missed / max(1, missed + delivered) > 0.01:
        alerts.append(f"push.missed_offer rate high missed={missed} acked={delivered}")
    if redis_ms is not None and float(redis_ms) > 50:
        alerts.append(f"redis_latency_ms={redis_ms} > 50")

    return {
        "ok": len(alerts) == 0,
        "redis_ok": health.get("redis_ok"),
        "redis_latency_ms": redis_ms,
        "watch": watch,
        "alerts": alerts,
        "success_criteria": SUCCESS_CRITERIA,
        "keys": list(WATCH_METRIC_KEYS),
    }


@realtime_gateway_router.post("/ack")
async def realtime_ack(body: AckBody, request: Request):
    caller = _auth_sub(request)
    if not caller:
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    from realtime_platform.ack_engine import acknowledge

    # Legacy offer ack bridge
    if body.offer_id:
        try:
            from routers.realtime_dispatch import _mark_offer_acked

            await _mark_offer_acked(caller, body.offer_id)
        except Exception:
            pass
    result = await acknowledge(
        body.event_id, actor_id=caller, event_type=body.event_type
    )
    return result


@realtime_gateway_router.post("/presence/online")
async def presence_online(body: PresenceBody, request: Request):
    caller = _auth_sub(request)
    if not caller:
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    from realtime_platform.presence_service import set_online

    return await set_online(
        caller,
        lat=body.lat,
        lng=body.lng,
        network_quality=body.network_quality,
        session_id=body.session_id,
        client_event_id=body.client_event_id,
    )


@realtime_gateway_router.post("/presence/offline")
async def presence_offline(body: PresenceBody, request: Request):
    caller = _auth_sub(request)
    if not caller:
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    from realtime_platform.presence_service import set_offline

    return await set_offline(caller, client_event_id=body.client_event_id)


@realtime_gateway_router.post("/presence/heartbeat")
async def presence_heartbeat(body: HeartbeatBody, request: Request):
    caller = _auth_sub(request)
    if not caller:
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    from realtime_platform.presence_service import heartbeat

    return await heartbeat(
        caller,
        lat=body.lat,
        lng=body.lng,
        network_quality=body.network_quality,
        device_health=body.device_health,
    )


@realtime_gateway_router.post("/device-health")
async def device_health_report(body: DeviceHealthBody, request: Request):
    """Driver Device Health Engine — client reports readiness for dispatch."""
    caller = _auth_sub(request)
    if not caller:
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    from realtime_platform.device_health import report_device_health

    report = await report_device_health(
        caller,
        socket_connected=body.socket_connected,
        fgs_running=body.fgs_running,
        fullscreen_notif_enabled=body.fullscreen_notif_enabled,
        battery_optimization_ok=body.battery_optimization_ok,
        network_quality=body.network_quality,
        app_version=body.app_version,
        gps_age_ms=body.gps_age_ms,
        lat=body.lat,
        lng=body.lng,
    )
    return {"ok": True, "device_health": report.to_dict(), "dispatch_eligible": report.healthy}


@realtime_gateway_router.get("/device-health/me")
async def device_health_me(request: Request):
    caller = _auth_sub(request)
    if not caller:
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    from realtime_platform.device_health import evaluate_device_health

    report = await evaluate_device_health(caller)
    return {"ok": True, "device_health": report.to_dict(), "dispatch_eligible": report.healthy}


@realtime_gateway_router.get("/offers/{offer_id}/audit")
async def offer_delivery_audit(offer_id: str, request: Request):
    """Delivery Guarantee audit — terminal outcome or in-flight status."""
    if not _auth_sub(request):
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    from realtime_platform.offer_ledger import get_offer_audit

    audit = await get_offer_audit(offer_id)
    if not audit:
        return JSONResponse(status_code=404, content={"detail": "Offer not found"})
    return {"ok": True, "audit": audit}


@realtime_gateway_router.get("/presence/me")
async def presence_me(request: Request):
    caller = _auth_sub(request)
    if not caller:
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    from realtime_platform.presence_service import get_presence

    snap = await get_presence(caller)
    return {"ok": True, "presence": snap.to_dict() if snap else None}


@realtime_gateway_router.post("/session/heal")
async def session_heal(body: HealBody, request: Request):
    caller = _auth_sub(request)
    if not caller:
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    from realtime_platform.healing import heal_session

    return await heal_session(caller, role=body.role)


@realtime_gateway_router.post("/session/recover")
async def session_recover(body: RecoverBody, request: Request):
    """Driver Recovery Manager — crash/FGS/boot → presence + trip + offers."""
    caller = _auth_sub(request)
    if not caller:
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    from realtime_platform.driver_recovery import recover_driver_session

    return await recover_driver_session(
        caller,
        lat=body.lat,
        lng=body.lng,
        network_quality=body.network_quality,
        session_id=body.session_id,
        resume_online=body.resume_online,
        client_event_id=body.client_event_id,
    )


@realtime_gateway_router.get("/dashboard")
async def reliability_dashboard(request: Request):
    """Reliability Dashboard JSON board (auth required)."""
    if not _auth_sub(request):
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    from realtime_platform.reliability_dashboard import build_dashboard

    return await build_dashboard()


@realtime_gateway_router.get("/dashboard/prometheus")
async def reliability_dashboard_prom(request: Request):
    """Prometheus text for Grafana scrape."""
    if not _auth_sub(request):
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    from fastapi.responses import PlainTextResponse
    from realtime_platform.reliability_dashboard import build_dashboard, prometheus_text

    dash = await build_dashboard()
    return PlainTextResponse(prometheus_text(dash), media_type="text/plain; version=0.0.4")


@realtime_gateway_router.post("/guardians/tick")
async def guardians_tick(request: Request):
    """Ops: run one Health + Dispatch + Trip guardian cycle."""
    if not _auth_sub(request):
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    from realtime_platform.guardians_worker import run_all_guardians

    return await run_all_guardians()


@realtime_gateway_router.get("/health/clusters")
async def health_clusters():
    """Realtime Health Manager cluster probe (public-ish for load balancers)."""
    from realtime_platform.health_manager import probe_cluster

    probe = await probe_cluster()
    code = 200 if probe.get("ok") else 503
    return JSONResponse(status_code=code, content=probe)


@realtime_gateway_router.post("/events/sync")
async def sync_client_events(body: SyncEventsBody, request: Request):
    """Mobile local event log → server (offline queue drain)."""
    caller = _auth_sub(request)
    if not caller:
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    from realtime_platform.models import RealtimeEvent
    from realtime_platform.retry_engine import persist_event
    from realtime_platform.ack_engine import acknowledge

    accepted = 0
    for raw in body.events[:100]:
        if not isinstance(raw, dict):
            continue
        if str(raw.get("actor_id") or "") not in ("", caller):
            raw = {**raw, "actor_id": caller}
        ev = RealtimeEvent.from_dict(raw)
        if not ev.event_id:
            continue
        ev.sync_status = "synced"
        await persist_event(ev)
        if ev.ack or str(raw.get("status")) == "acked":
            await acknowledge(ev.event_id, actor_id=caller, event_type=ev.event_type)
        accepted += 1
    return {"ok": True, "accepted": accepted}
