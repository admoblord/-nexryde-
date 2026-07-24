"""Connect-RPC / SSE RidePush — Uber RAMEN over HTTPS (HTTP/2 + HTTP/3/QUIC via Cronet).

Mobile clients prefer this path so Google Front End can terminate QUIC; WebSocket
remains the fallback for older builds.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import AsyncIterator, Optional

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

from routers.realtime_dispatch import (
    _mark_offer_acked,
    driver_offer_hub,
    expand_realtime_payload,
    rider_trip_hub,
)
from security_advanced import verify_jwt_token

logger = logging.getLogger("server")

connect_realtime_router = APIRouter(prefix="/api/connect", tags=["ConnectRealtime"])


def _auth_user(request: Request, body_token: str = "") -> Optional[str]:
    token = (
        (request.headers.get("authorization") or "")
        .replace("Bearer ", "")
        .replace("bearer ", "")
        .strip()
        or (body_token or "").strip()
    )
    if not token:
        return None
    try:
        payload = verify_jwt_token(token)
        uid = str(payload.get("sub") or "").strip()
        return uid or None
    except Exception:
        return None


def _hub_for_role(role: str):
    r = (role or "").strip().lower()
    if r == "driver":
        return driver_offer_hub
    if r == "rider":
        return rider_trip_hub
    return None


@connect_realtime_router.get("/ride-push/health")
async def connect_ride_push_health():
    return {
        "ok": True,
        "transport": "connect-sse",
        "quic_hint": "Use Cronet/HTTP3 client; GFE may negotiate h3 to this host",
        "proto": "nexryde.realtime.v1.RidePush",
    }


@connect_realtime_router.post("/nexryde.realtime.v1.RidePush/AckOffer")
async def connect_ack_offer(request: Request):
    """Connect-RPC unary AckOffer (JSON)."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    if not isinstance(body, dict):
        body = {}
    caller = _auth_user(request, str(body.get("access_token") or body.get("accessToken") or ""))
    driver_id = str(body.get("driver_id") or body.get("driverId") or "").strip()
    offer_id = str(body.get("offer_id") or body.get("offerId") or "").strip()
    if not caller or not driver_id or caller != driver_id:
        return JSONResponse(status_code=401, content={"ok": False, "detail": "Unauthorized"})
    if not offer_id:
        return JSONResponse(status_code=400, content={"ok": False, "detail": "offer_id required"})
    await _mark_offer_acked(driver_id, offer_id)
    return {"ok": True, "offer_id": offer_id}


@connect_realtime_router.get("/nexryde.realtime.v1.RidePush/Subscribe")
@connect_realtime_router.post("/nexryde.realtime.v1.RidePush/Subscribe")
async def connect_subscribe(request: Request):
    """Server-stream RideEvents as SSE (Connect-compatible for mobile + Cronet QUIC)."""
    role = (request.query_params.get("role") or "").strip().lower()
    user_id = (request.query_params.get("user_id") or request.query_params.get("userId") or "").strip()
    if request.method == "POST":
        try:
            body = await request.json()
        except Exception:
            body = {}
        if isinstance(body, dict):
            role = str(body.get("role") or role).strip().lower()
            user_id = str(body.get("user_id") or body.get("userId") or user_id).strip()
            token_hint = str(body.get("access_token") or body.get("accessToken") or "")
        else:
            token_hint = ""
    else:
        token_hint = request.query_params.get("access_token") or ""

    caller = _auth_user(request, token_hint)
    if not caller or not user_id or caller != user_id:
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    hub = _hub_for_role(role)
    if hub is None:
        return JSONResponse(status_code=400, content={"detail": "role must be driver|rider"})

    queue: asyncio.Queue = asyncio.Queue(maxsize=64)
    await hub.add_stream(user_id, queue)

    async def event_stream() -> AsyncIterator[bytes]:
        try:
            # Hello frame — lets clients confirm QUIC/H2 path is alive.
            hello = {
                "type": "hello",
                "transport": "connect-sse",
                "role": role,
                "user_id": user_id,
                "server_ms": int(time.time() * 1000),
            }
            yield f"event: ride\ndata: {json.dumps(hello, default=str)}\n\n".encode("utf-8")
            while True:
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=25.0)
                except asyncio.TimeoutError:
                    ping = {"type": "ping", "server_ms": int(time.time() * 1000)}
                    yield f"event: ride\ndata: {json.dumps(ping)}\n\n".encode("utf-8")
                    continue
                # Prefer expanded form for Connect clients that don't know compact loc yet.
                payload = expand_realtime_payload(msg) if isinstance(msg, dict) else msg
                if not isinstance(payload, dict):
                    continue
                envelope = {
                    "type": payload.get("type") or payload.get("t") or "event",
                    "json_payload": json.dumps(payload, default=str),
                    "server_ms": int(time.time() * 1000),
                    "payload": payload,
                }
                yield f"event: ride\ndata: {json.dumps(envelope, default=str)}\n\n".encode("utf-8")
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("connect subscribe stream error user=%s", user_id)
        finally:
            await hub.remove_stream(user_id, queue)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Nexryde-Transport": "connect-sse",
            "X-Accel-Buffering": "no",
        },
    )
