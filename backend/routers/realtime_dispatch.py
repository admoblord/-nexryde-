"""Real-time push for ride offers (drivers) and trip status (riders).

Canonical transport: WebSocket (JWT in query). Firebase Realtime Database is not used;
clients should use the documented /api/ws/... endpoints with reconnect backoff.
"""
from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from typing import Any, DefaultDict, Dict, Optional, Set

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from security_advanced import verify_jwt_token

logger = logging.getLogger("server")

realtime_dispatch_router = APIRouter(prefix="/api", tags=["Realtime"])


class _UserSocketHub:
    """One user may have multiple connections (e.g. reconnect)."""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._sockets: DefaultDict[str, Set[WebSocket]] = defaultdict(set)

    async def connect(self, websocket: WebSocket, user_id: str) -> None:
        await websocket.accept()
        async with self._lock:
            self._sockets[user_id].add(websocket)
        logger.info("realtime_ws_connect user=%s path=%s", user_id, websocket.url.path)

    async def disconnect(self, websocket: WebSocket, user_id: str) -> None:
        async with self._lock:
            self._sockets[user_id].discard(websocket)
            if not self._sockets[user_id]:
                del self._sockets[user_id]

    async def send_json(self, user_id: str, message: dict[str, Any]) -> int:
        """Returns number of sockets that received the message."""
        async with self._lock:
            targets = list(self._sockets.get(user_id, ()))
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
        return sent


driver_offer_hub = _UserSocketHub()
rider_trip_hub = _UserSocketHub()


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


@realtime_dispatch_router.websocket("/ws/driver/offers/{driver_id}")
async def websocket_driver_offers(websocket: WebSocket, driver_id: str):
    auth_id = _auth_user_id_from_ws(websocket)
    if not auth_id or auth_id != driver_id:
        await websocket.close(code=1008, reason="Unauthorized")
        return
    await driver_offer_hub.connect(websocket, driver_id)
    try:
        await websocket.send_json({"type": "connected", "channel": "driver_offers", "user_id": driver_id})
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=90)
            except asyncio.TimeoutError:
                try:
                    await websocket.send_json({"type": "heartbeat", "channel": "driver_offers"})
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug("driver offers ws error: %s", e)
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
        await websocket.send_json({"type": "connected", "channel": "rider_trips", "user_id": rider_id})
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=90)
            except asyncio.TimeoutError:
                try:
                    await websocket.send_json({"type": "heartbeat", "channel": "rider_trips"})
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug("rider trips ws error: %s", e)
    finally:
        await rider_trip_hub.disconnect(websocket, rider_id)


async def push_driver_new_offer(driver_id: str, payload: dict[str, Any]) -> None:
    await driver_offer_hub.send_json(
        driver_id,
        {"type": "ride_offer", **payload},
    )


async def push_rider_trip_update(rider_id: str, payload: dict[str, Any]) -> None:
    await rider_trip_hub.send_json(
        rider_id,
        {"type": "trip_update", **payload},
    )
