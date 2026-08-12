"""Real-time push for ride offers (drivers) and trip status (riders).

Transport: WebSocket (JWT in query param) + Redis pub/sub for cross-instance delivery.
Fallback: /api/trips/{id}/poll — lightweight HTTP polling endpoint for riders when WS
          is unavailable (Redis down, reconnecting, or cross-instance gap).

Architecture
------------
Each Cloud Run instance maintains an in-process socket registry for clients currently
connected to that instance. When a message needs to be sent:

  1. Publish to Redis channel  ws:{hub}:{user_id}
  2. A background listener on *every* instance receives the Redis message and
     delivers it to any local sockets for that user_id.
  3. The sender also caches the latest payload per user_id in Redis (key: poll:{user_id})
     so the /poll endpoint can serve it to clients that missed the WS push.

When Redis is unavailable, delivery falls back to in-process only and the poll
cache is not populated (caller must fall back to /trips/{id}).
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from collections import defaultdict
from typing import Any, DefaultDict, Dict, Optional, Set

import hashlib
from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

from security_advanced import verify_jwt_token

logger = logging.getLogger("server")

realtime_dispatch_router = APIRouter(prefix="/api", tags=["Realtime"])


def _is_ws_ping(data: str) -> bool:
    """Accept plain ping or legacy JSON {\"type\":\"ping\"} keepalive frames."""
    if data in ("ping", "PING"):
        return True
    try:
        payload = json.loads(data)
        return isinstance(payload, dict) and str(payload.get("type", "")).lower() == "ping"
    except (TypeError, ValueError, json.JSONDecodeError):
        return False


_redis_raw = os.environ.get("REDIS_URL") or os.environ.get("REDISCLOUD_URL") or ""
REDIS_URL: Optional[str] = _redis_raw if _redis_raw.startswith(("redis://", "rediss://")) else None
REDIS_REQUIRED = (
    os.environ.get("NEXRYDE_ENV", os.environ.get("ENVIRONMENT", "development")).strip().lower()
    == "production"
    and os.environ.get("REDIS_REQUIRED", "true").lower() != "false"
)

if REDIS_REQUIRED and not REDIS_URL:
    raise RuntimeError("REDIS_URL is required in production for realtime cross-instance dispatch")


# ── Redis publish helper ──────────────────────────────────────────────────────

_publish_client: Any = None
_publish_lock = asyncio.Lock()


async def _get_publish_client() -> Any:
    global _publish_client
    if _publish_client is not None:
        return _publish_client
    if not REDIS_URL:
        return None
    async with _publish_lock:
        if _publish_client is not None:
            return _publish_client
        try:
            import redis.asyncio as aioredis  # type: ignore[import]
            c = aioredis.from_url(REDIS_URL, decode_responses=True, socket_timeout=2)
            await c.ping()
            _publish_client = c
            logger.info("realtime_dispatch: Redis publish client connected")
        except Exception as exc:
            if REDIS_REQUIRED:
                raise RuntimeError("Realtime Redis publish client is required in production") from exc
            logger.warning("realtime_dispatch: Redis unavailable, using in-memory fallback: %s", exc)
            _publish_client = None
    return _publish_client


async def _redis_publish(channel: str, payload: dict) -> bool:
    client = await _get_publish_client()
    if client is None:
        return False
    try:
        await client.publish(channel, json.dumps(payload))
        return True
    except Exception as exc:
        logger.warning("realtime_dispatch: Redis publish error channel=%s: %s", channel, exc)
        global _publish_client
        _publish_client = None
        return False


# ── Hub ───────────────────────────────────────────────────────────────────────

class _UserSocketHub:
    """
    Per-hub in-process socket registry + Redis pub/sub subscriber.

    Local sockets are tracked for this instance. A background listener coroutine
    subscribes to Redis channels and delivers cross-instance messages locally.
    """

    def __init__(self, name: str) -> None:
        self._name = name
        self._lock = asyncio.Lock()
        self._sockets: DefaultDict[str, Set[WebSocket]] = defaultdict(set)
        # Connect/SSE/gRPC stream subscribers (Uber RAMEN multi-transport).
        self._streams: DefaultDict[str, Set[asyncio.Queue]] = defaultdict(set)
        self._pubsub: Any = None
        self._listener_task: Optional[asyncio.Task] = None
        self._subscribed: Set[str] = set()

    def _ch(self, user_id: str) -> str:
        return f"ws:{self._name}:{user_id}"

    async def _ensure_listener(self) -> bool:
        """Lazily create the pubsub connection and start the listener task."""
        if self._pubsub is not None:
            return True
        if not REDIS_URL:
            return False
        try:
            import redis.asyncio as aioredis  # type: ignore[import]
            r = aioredis.from_url(REDIS_URL, decode_responses=True, socket_timeout=5)
            self._pubsub = r.pubsub(ignore_subscribe_messages=True)
            self._listener_task = asyncio.create_task(self._listen_loop())
            logger.info("realtime_dispatch: hub=%s pubsub listener started", self._name)
            return True
        except Exception as exc:
            if REDIS_REQUIRED:
                raise RuntimeError(f"Realtime Redis pubsub is required in production for hub={self._name}") from exc
            logger.warning("realtime_dispatch: hub=%s pubsub init failed: %s", self._name, exc)
            return False

    async def _listen_loop(self) -> None:
        """Background task: forward Redis messages to local WebSocket clients."""
        prefix = f"ws:{self._name}:"
        while True:
            try:
                if self._pubsub is None:
                    await asyncio.sleep(3)
                    continue
                async for msg in self._pubsub.listen():
                    if not isinstance(msg, dict) or msg.get("type") != "message":
                        continue
                    ch = str(msg.get("channel") or "")
                    if not ch.startswith(prefix):
                        continue
                    user_id = ch[len(prefix):]
                    try:
                        data = json.loads(msg["data"])
                        await self._deliver_locally(user_id, data)
                    except Exception:
                        pass
            except Exception as exc:
                logger.warning("realtime_dispatch: hub=%s listener error: %s — reconnecting", self._name, exc)
                self._pubsub = None
                await asyncio.sleep(3)
                await self._ensure_listener()

    async def _ensure_channel(self, user_id: str) -> None:
        if await self._ensure_listener() and self._pubsub:
            ch = self._ch(user_id)
            if ch not in self._subscribed:
                try:
                    await self._pubsub.subscribe(ch)
                    self._subscribed.add(ch)
                except Exception as exc:
                    logger.warning("realtime_dispatch: subscribe ch=%s: %s", ch, exc)

    async def _maybe_unsubscribe(self, user_id: str) -> None:
        async with self._lock:
            still = bool(self._sockets.get(user_id)) or bool(self._streams.get(user_id))
        if still or not self._pubsub:
            return
        ch = self._ch(user_id)
        if ch in self._subscribed:
            try:
                await self._pubsub.unsubscribe(ch)
                self._subscribed.discard(ch)
            except Exception:
                pass

    async def connect(self, websocket: WebSocket, user_id: str) -> None:
        await websocket.accept()
        async with self._lock:
            self._sockets[user_id].add(websocket)
        await self._ensure_channel(user_id)
        logger.info("realtime_ws_connect hub=%s user=%s", self._name, user_id)

    async def disconnect(self, websocket: WebSocket, user_id: str) -> None:
        async with self._lock:
            self._sockets[user_id].discard(websocket)
            if not self._sockets.get(user_id):
                self._sockets.pop(user_id, None)
        await self._maybe_unsubscribe(user_id)

    async def add_stream(self, user_id: str, queue: asyncio.Queue) -> None:
        async with self._lock:
            self._streams[user_id].add(queue)
        await self._ensure_channel(user_id)
        logger.info("realtime_stream_connect hub=%s user=%s", self._name, user_id)

    async def remove_stream(self, user_id: str, queue: asyncio.Queue) -> None:
        async with self._lock:
            self._streams[user_id].discard(queue)
            if not self._streams.get(user_id):
                self._streams.pop(user_id, None)
        await self._maybe_unsubscribe(user_id)

    async def _deliver_locally(self, user_id: str, message: dict) -> int:
        async with self._lock:
            targets = list(self._sockets.get(user_id, ()))
            streams = list(self._streams.get(user_id, ()))
        sent = 0
        dead: list[WebSocket] = []
        for ws in targets:
            try:
                await ws.send_json(message)
                sent += 1
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    self._sockets[user_id].discard(ws)
        for q in streams:
            try:
                q.put_nowait(message)
                sent += 1
            except asyncio.QueueFull:
                try:
                    _ = q.get_nowait()
                    q.put_nowait(message)
                    sent += 1
                except Exception:
                    pass
            except Exception:
                pass
        return sent

    async def send_json(
        self, user_id: str, message: dict[str, Any], *, cache_for_poll: bool = True
    ) -> int:
        """
        Publish to Redis (reaches ALL instances) + optionally cache for poll fallback.
        Falls back to in-process delivery when Redis is unavailable.
        """
        published = await _redis_publish(self._ch(user_id), message)
        # Poll clients expect expanded trip_update (compact `loc` is WS-only wire).
        # Inbox badge pushes must not overwrite the rider trip poll cache.
        if cache_for_poll:
            await _cache_poll_message(user_id, expand_realtime_payload(message))
        if not published:
            # Redis unavailable — deliver directly to local sockets only.
            return await self._deliver_locally(user_id, message)
        return 1


# ── Singletons ────────────────────────────────────────────────────────────────

driver_offer_hub = _UserSocketHub("driver")
rider_trip_hub   = _UserSocketHub("rider")
user_inbox_hub   = _UserSocketHub("inbox")


# ── Auth helper ───────────────────────────────────────────────────────────────

def _auth_user_id_from_ws(websocket: WebSocket) -> Optional[str]:
    token = (websocket.query_params.get("token") or "").strip()
    if not token:
        return None
    try:
        payload = verify_jwt_token(token)
        uid = str(payload.get("sub") or "").strip()
        return uid or None
    except Exception:
        return None


# ── WebSocket endpoints ───────────────────────────────────────────────────────

@realtime_dispatch_router.websocket("/ws/driver/offers/{driver_id}")
async def websocket_driver_offers(websocket: WebSocket, driver_id: str):
    auth_id = _auth_user_id_from_ws(websocket)
    if not auth_id or auth_id != driver_id:
        await websocket.close(code=1008, reason="Unauthorized")
        return
    await driver_offer_hub.connect(websocket, driver_id)
    try:
        while True:
            # Keep connection alive; client should send periodic pings / offer ACKs.
            data = await asyncio.wait_for(websocket.receive_text(), timeout=90)
            if _is_ws_ping(data):
                await websocket.send_text("pong")
                continue
            try:
                body = json.loads(data)
            except (TypeError, ValueError, json.JSONDecodeError):
                continue
            if isinstance(body, dict) and str(body.get("type", "")).lower() == "ack":
                offer_id = str(body.get("offer_id") or body.get("id") or "").strip()
                if offer_id:
                    await _mark_offer_acked(driver_id, offer_id)
                    try:
                        await websocket.send_json({"type": "ack_ok", "offer_id": offer_id})
                    except Exception:
                        pass
    except (WebSocketDisconnect, asyncio.TimeoutError):
        pass
    except Exception:
        pass
    finally:
        await driver_offer_hub.disconnect(websocket, driver_id)


@realtime_dispatch_router.websocket("/ws/rider/trips/{rider_id}")
async def websocket_rider_trips(websocket: WebSocket, rider_id: str):
    auth_id = _auth_user_id_from_ws(websocket)
    if not auth_id or auth_id != rider_id:
        await websocket.close(code=1008, reason="Unauthorized")
        return
    await rider_trip_hub.connect(websocket, rider_id)
    try:
        while True:
            data = await asyncio.wait_for(websocket.receive_text(), timeout=90)
            if _is_ws_ping(data):
                await websocket.send_text("pong")
    except (WebSocketDisconnect, asyncio.TimeoutError):
        pass
    except Exception:
        pass
    finally:
        await rider_trip_hub.disconnect(websocket, rider_id)


@realtime_dispatch_router.websocket("/ws/user/{user_id}/inbox")
async def websocket_user_inbox(websocket: WebSocket, user_id: str):
    auth_id = _auth_user_id_from_ws(websocket)
    if not auth_id or auth_id != user_id:
        await websocket.close(code=1008, reason="Unauthorized")
        return
    await user_inbox_hub.connect(websocket, user_id)
    # Non-blocking — never stall the WS handshake/receive loop on Mongo.
    asyncio.create_task(publish_notification_badge(user_id))
    try:
        while True:
            data = await asyncio.wait_for(websocket.receive_text(), timeout=90)
            if _is_ws_ping(data):
                # Prefer JSON so RN clients that only parse objects don't drop it.
                try:
                    await websocket.send_text('{"type":"pong"}')
                except Exception:
                    await websocket.send_text("pong")
    except (WebSocketDisconnect, asyncio.TimeoutError):
        pass
    except Exception:
        pass
    finally:
        await user_inbox_hub.disconnect(websocket, user_id)


# ── Payload expand (compact loc → trip_update for poll / legacy) ──────────────

def expand_realtime_payload(message: dict) -> dict:
    """Expand Uber-style compact `loc` frames into full trip_update dicts."""
    if not isinstance(message, dict):
        return message
    kind = message.get("t") or message.get("type")
    if kind != "loc":
        return message
    return {
        "type": "trip_update",
        "trip_id": message.get("i") or message.get("trip_id"),
        "status": message.get("st") or message.get("status"),
        "ride_version": message.get("rv") or message.get("ride_version") or 0,
        "state_sequence": message.get("sq") or message.get("state_sequence") or 0,
        "driver_location": {
            "lat": message.get("la"),
            "lng": message.get("ln"),
            "heading": message.get("h"),
            "speed_kmh": message.get("s"),
            "updated_at": message.get("ts"),
            "eta_seconds": message.get("e"),
            "distance_km": message.get("d"),
        },
        "eta_seconds": message.get("e"),
        "distance_remaining_km": message.get("d"),
        "distance_remaining": message.get("d"),
        "speed_kmh": message.get("s"),
        "timestamp": message.get("ts"),
    }


# ── Public push helpers (called by trips router) ──────────────────────────────

async def _mark_offer_acked(driver_id: str, offer_id: str) -> None:
    if not driver_id or not offer_id:
        return
    try:
        from redis_store import store

        await store.set(f"offer:ack:{driver_id}:{offer_id}", "1", ttl=120)
    except Exception:
        logger.debug("offer ack mark failed", exc_info=True)


async def _offer_was_acked(driver_id: str, offer_id: str) -> bool:
    try:
        from redis_store import store

        return bool(await store.get(f"offer:ack:{driver_id}:{offer_id}"))
    except Exception:
        return False


async def _retry_offer_if_unacked(driver_id: str, offer_id: str, message: dict) -> None:
    """Uber RAMEN-style: one re-push if device never ACKed (tunnels / brief disconnect)."""
    try:
        await asyncio.sleep(2.5)
        if await _offer_was_acked(driver_id, offer_id):
            return
        logger.info(
            "realtime_dispatch: offer ack miss — retry push driver=%s offer=%s",
            driver_id,
            offer_id,
        )
        await driver_offer_hub.send_json(driver_id, message)
    except Exception:
        logger.debug("offer ack retry failed", exc_info=True)


async def push_driver_new_offer(driver_id: str, offer: dict) -> int:
    offer_id = str((offer or {}).get("id") or "").strip()
    message = {"type": "new_offer", "offer": offer, "ack_required": True}
    sent = await driver_offer_hub.send_json(driver_id, message)
    if offer_id:
        asyncio.create_task(_retry_offer_if_unacked(driver_id, offer_id, message))
    return sent


async def push_driver_offers_withdrawn(driver_id: str, *, reason: str = "driver_offline", count: int = 0) -> int:
    """Notify driver hub that outstanding offers were cancelled (go-offline / cooldown)."""
    return await driver_offer_hub.send_json(
        driver_id,
        {
            "type": "offers_withdrawn",
            "reason": reason,
            "count": int(count or 0),
            "ack_required": False,
        },
    )


async def push_rider_trip_update(rider_id: str, payload: dict) -> int:
    return await rider_trip_hub.send_json(rider_id, payload)


_ENGAGEMENT_CATEGORY_NIN = ("driver_engagement", "rider_engagement", "engagement", "daily_slot", "marketing")
_ENGAGEMENT_SOURCE_NIN = ("engagement", "daily_slot", "reconnect", "smart_surge")


async def publish_notification_badge(user_id: str, unread_count: int | None = None) -> int:
    """Push unread inbox badge count to `/api/ws/user/{user_id}/inbox` clients."""
    uid = str(user_id or "").strip()
    if not uid:
        return 0
    try:
        from database import db
        from notification_catalog import unread_badge_query

        if unread_count is None:
            unread_count = int(
                await db.notifications.count_documents({"user_id": uid, "read": False})
            )
        else:
            unread_count = int(unread_count)
        if unread_count <= 0:
            excl = 0
        else:
            excl = int(
                await db.notifications.count_documents(
                    unread_badge_query(uid, exclude_engagement=True)
                )
            )
        return await user_inbox_hub.send_json(
            uid,
            {
                "type": "notification_badge",
                "unread_count": unread_count,
                "unread_count_excl_engagement": excl,
            },
            cache_for_poll=False,
        )
    except Exception as exc:
        logger.warning("publish_notification_badge failed user=%s: %s", uid, exc)
        return 0


# ── Poll cache (Redis-backed, in-process fallback) ─────────────────────────────

_poll_cache_local: dict[str, dict] = {}
_POLL_CACHE_TTL_SEC = 120


async def _cache_poll_message(user_id: str, message: dict) -> None:
    """Cache latest push for this user — Redis so any Cloud Run instance can /poll."""
    if not user_id or not isinstance(message, dict):
        return
    try:
        _poll_cache_local[user_id] = message
    except Exception:
        pass
    try:
        from redis_store import store

        await store.set(
            f"poll:{user_id}",
            json.dumps(message, default=str),
            ttl=_POLL_CACHE_TTL_SEC,
        )
    except Exception as exc:
        logger.warning("realtime_dispatch: poll cache write failed user=%s: %s", user_id, exc)


async def _get_poll_message(user_id: str) -> Optional[dict]:
    if not user_id:
        return None
    try:
        from redis_store import store

        raw = await store.get(f"poll:{user_id}")
        if raw:
            data = json.loads(raw)
            if isinstance(data, dict):
                return data
    except Exception as exc:
        logger.warning("realtime_dispatch: poll cache read failed user=%s: %s", user_id, exc)
    return _poll_cache_local.get(user_id)


# ── HTTP polling endpoint — WS reconnect fallback ─────────────────────────────

@realtime_dispatch_router.get("/trips/poll/{rider_id}")
async def poll_rider_trip_update(rider_id: str, request: Request):
    """
    Lightweight polling fallback for riders whose WS is disconnected or on a
    different Cloud Run instance than the one that received the driver accept.

    Returns the last cached push payload for this rider.  Client should compare
    the ETag to its last-seen value; a changed ETag means new data is available.

    Usage: poll every 3-5 s while WS is not connected.
    """
    from security_advanced import verify_jwt_token
    token = (request.headers.get("authorization") or "").replace("Bearer ", "").replace("bearer ", "").strip()
    if token:
        try:
            payload = verify_jwt_token(token)
            caller_id = str(payload.get("sub") or "")
            if caller_id != rider_id:
                return JSONResponse(status_code=403, content={"detail": "Forbidden"})
        except Exception:
            return JSONResponse(status_code=401, content={"detail": "Invalid token"})
    else:
        return JSONResponse(status_code=401, content={"detail": "Authorization required"})

    msg = await _get_poll_message(rider_id)
    if msg is None:
        return JSONResponse(status_code=204, content=None)

    body_str = json.dumps(msg, sort_keys=True, default=str)
    etag = hashlib.sha256(body_str.encode()).hexdigest()[:16]
    if_none_match = request.headers.get("if-none-match", "")
    if if_none_match == etag:
        return JSONResponse(status_code=304, content=None)

    return JSONResponse(
        content={"payload": msg, "etag": etag},
        headers={"ETag": etag, "Cache-Control": "no-store"},
    )
