"""Per-request plumbing: request id, security headers, optional timing.

Kept as one pure-ASGI middleware instead of three BaseHTTPMiddleware layers.
BaseHTTPMiddleware wraps every request in an anyio task group plus a message
queue, so each layer costs real work on every request — including health probes
and requests that are about to be rejected. Pure ASGI keeps the same behaviour
without that machinery.

Lives outside server.py so it can be unit tested without booting the whole app.
"""
from __future__ import annotations

import os
import time
import uuid
from typing import Any, Awaitable, Callable, Iterable, Mapping

from starlette.datastructures import Headers, MutableHeaders

Scope = dict[str, Any]
Receive = Callable[[], Awaitable[Mapping[str, Any]]]
Send = Callable[[Mapping[str, Any]], Awaitable[None]]


def timing_header_enabled(env: Mapping[str, str] | None = None) -> bool:
    """True when NEXRYDE_RESPONSE_TIME_HEADER opts into X-Response-Time-ms."""
    source = os.environ if env is None else env
    return source.get("NEXRYDE_RESPONSE_TIME_HEADER", "").strip().lower() in (
        "1",
        "true",
        "yes",
    )


class RequestContextMiddleware:
    """Attach a request id and baseline security headers to every response.

    Header semantics match the middleware this replaced: security headers never
    overwrite a value a handler already set, and an inbound ``X-Request-Id`` is
    echoed back so a client can correlate its own logs.
    """

    def __init__(self, app, security_headers: Iterable[tuple[str, str]] | Mapping[str, str]):
        self.app = app
        items = (
            security_headers.items()
            if isinstance(security_headers, Mapping)
            else security_headers
        )
        self._security_headers = tuple(items)
        self._emit_timing = timing_header_enabled()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        request_id = Headers(scope=scope).get("x-request-id") or str(uuid.uuid4())
        scope.setdefault("state", {})
        scope["state"]["request_id"] = request_id
        started = time.perf_counter() if self._emit_timing else 0.0

        async def send_wrapper(message: Mapping[str, Any]) -> None:
            if message.get("type") == "http.response.start":
                headers = MutableHeaders(scope=message)
                for key, value in self._security_headers:
                    if key not in headers:
                        headers[key] = value
                headers["X-Request-Id"] = request_id
                if self._emit_timing:
                    elapsed_ms = int((time.perf_counter() - started) * 1000)
                    headers["X-Response-Time-ms"] = str(elapsed_ms)
            await send(message)

        await self.app(scope, receive, send_wrapper)
