"""Native gRPC RidePush server (Uber RAMEN spine).

Enabled when NEXRYDE_GRPC_PORT is set (e.g. 50051). Cloud Run HTTP service uses
Connect-SSE on :8080; run a second Cloud Run service with GRPC protocol pointing
at this module for full gRPC/QUIC edge termination later.

Start helper is invoked from server startup when the env var is present.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any, Optional

logger = logging.getLogger(__name__)

_grpc_server: Any = None
_grpc_task: Optional[asyncio.Task] = None


async def _serve_grpc(port: int) -> None:
    """Minimal JSON-framed gRPC service without codegen (proto is the contract)."""
    try:
        import grpc
        from grpc import aio as grpc_aio
    except Exception as exc:
        logger.warning("grpc_ride_push: grpcio unavailable: %s", exc)
        return

    from routers.realtime_dispatch import (
        _mark_offer_acked,
        driver_offer_hub,
        expand_realtime_payload,
        rider_trip_hub,
    )
    from security_advanced import verify_jwt_token

    SERVICE = "nexryde.realtime.v1.RidePush"

    async def _auth(token: str) -> Optional[str]:
        token = (token or "").strip()
        if not token:
            return None
        try:
            return str(verify_jwt_token(token).get("sub") or "").strip() or None
        except Exception:
            return None

    async def subscribe(request: bytes, context: Any):
        try:
            body = json.loads(request.decode("utf-8") or "{}")
        except Exception:
            await context.abort(grpc.StatusCode.INVALID_ARGUMENT, "bad json")
            return
        user_id = str(body.get("user_id") or "").strip()
        role = str(body.get("role") or "").strip().lower()
        caller = await _auth(str(body.get("access_token") or ""))
        if not caller or caller != user_id:
            await context.abort(grpc.StatusCode.UNAUTHENTICATED, "unauthorized")
            return
        hub = driver_offer_hub if role == "driver" else rider_trip_hub if role == "rider" else None
        if hub is None:
            await context.abort(grpc.StatusCode.INVALID_ARGUMENT, "role")
            return
        queue: asyncio.Queue = asyncio.Queue(maxsize=64)
        await hub.add_stream(user_id, queue)
        try:
            hello = {
                "type": "hello",
                "transport": "grpc",
                "server_ms": int(time.time() * 1000),
            }
            yield json.dumps(hello).encode("utf-8")
            while context.cancelled() is False:
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=25.0)
                except asyncio.TimeoutError:
                    yield json.dumps({"type": "ping", "server_ms": int(time.time() * 1000)}).encode(
                        "utf-8"
                    )
                    continue
                payload = expand_realtime_payload(msg) if isinstance(msg, dict) else msg
                event = {
                    "type": (payload or {}).get("type") if isinstance(payload, dict) else "event",
                    "json_payload": json.dumps(payload, default=str),
                    "server_ms": int(time.time() * 1000),
                }
                yield json.dumps(event, default=str).encode("utf-8")
        finally:
            await hub.remove_stream(user_id, queue)

    async def ack_offer(request: bytes, context: Any) -> bytes:
        try:
            body = json.loads(request.decode("utf-8") or "{}")
        except Exception:
            await context.abort(grpc.StatusCode.INVALID_ARGUMENT, "bad json")
            return b"{}"
        driver_id = str(body.get("driver_id") or "").strip()
        offer_id = str(body.get("offer_id") or "").strip()
        caller = await _auth(str(body.get("access_token") or ""))
        if not caller or caller != driver_id or not offer_id:
            await context.abort(grpc.StatusCode.UNAUTHENTICATED, "unauthorized")
            return b"{}"
        await _mark_offer_acked(driver_id, offer_id)
        return json.dumps({"ok": True, "offer_id": offer_id}).encode("utf-8")

    # Generic handlers — wire format is UTF-8 JSON matching the .proto fields.
    generic = grpc.method_handlers_generic_handler(
        SERVICE,
        {
            "Subscribe": grpc.unary_stream_rpc_method_handler(
                subscribe,
                request_deserializer=lambda b: b,
                response_serializer=lambda b: b,
            ),
            "AckOffer": grpc.unary_unary_rpc_method_handler(
                ack_offer,
                request_deserializer=lambda b: b,
                response_serializer=lambda b: b,
            ),
        },
    )

    server = grpc_aio.server()
    server.add_generic_rpc_handlers((generic,))
    bind = f"[::]:{port}"
    # Cloud Run terminates TLS at the edge and hands the container h2c, so the
    # default (insecure/plaintext) bind is correct there. For non-Cloud-Run
    # deploys, set NEXRYDE_GRPC_TLS_CERT_PATH + NEXRYDE_GRPC_TLS_KEY_PATH to
    # terminate TLS directly on the wire.
    cert_path = (os.environ.get("NEXRYDE_GRPC_TLS_CERT_PATH") or "").strip()
    key_path = (os.environ.get("NEXRYDE_GRPC_TLS_KEY_PATH") or "").strip()
    tls = False
    if cert_path and key_path:
        try:
            with open(cert_path, "rb") as _cf, open(key_path, "rb") as _kf:
                creds = grpc.ssl_server_credentials([(_kf.read(), _cf.read())])
            server.add_secure_port(bind, creds)
            tls = True
        except Exception:
            logger.exception("grpc_ride_push: TLS cert/key load failed — falling back to h2c")
            server.add_insecure_port(bind)
    else:
        server.add_insecure_port(bind)
    await server.start()
    logger.info("grpc_ride_push: listening on %s (RidePush, %s)", bind, "TLS" if tls else "h2c/edge-TLS")
    global _grpc_server
    _grpc_server = server
    await server.wait_for_termination()


async def start_grpc_ride_push_if_configured() -> None:
    raw = (os.environ.get("NEXRYDE_GRPC_PORT") or "").strip()
    if not raw:
        return
    try:
        port = int(raw)
    except ValueError:
        logger.warning("grpc_ride_push: invalid NEXRYDE_GRPC_PORT=%s", raw)
        return
    global _grpc_task
    if _grpc_task and not _grpc_task.done():
        return
    _grpc_task = asyncio.create_task(_serve_grpc(port))


async def stop_grpc_ride_push() -> None:
    global _grpc_server, _grpc_task
    if _grpc_server is not None:
        try:
            await _grpc_server.stop(grace=2)
        except Exception:
            pass
        _grpc_server = None
    if _grpc_task is not None:
        _grpc_task.cancel()
        _grpc_task = None
