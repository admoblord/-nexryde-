"""RequestContextMiddleware must keep the behaviour of the three layers it replaced.

Request id, security headers and response timing used to be three separate
BaseHTTPMiddleware classes. Collapsing them into one pure-ASGI middleware is only
safe if every guarantee still holds, including on error responses raised by
middleware that sits inside it (e.g. AuthMiddleware's 401).
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from request_context import RequestContextMiddleware, timing_header_enabled  # noqa: E402

# A representative slice of the real baseline headers. Importing
# security_advanced needs JWT_SECRET, and this middleware is agnostic to the
# actual values — it is injected with whatever the app passes in.
SECURITY_HEADERS = {
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
}


def build_app(**kwargs) -> FastAPI:
    app = FastAPI()

    @app.get("/plain")
    async def plain(request: Request):
        return {"request_id": request.state.request_id}

    @app.get("/own-header")
    async def own_header():
        # A handler that already set a security header must win.
        return JSONResponse({"ok": True}, headers={"X-Frame-Options": "SAMEORIGIN"})

    @app.get("/unauthorized")
    async def unauthorized():
        raise HTTPException(status_code=401, detail="Authentication required")

    app.add_middleware(
        RequestContextMiddleware, security_headers=SECURITY_HEADERS, **kwargs
    )
    return app


@pytest.fixture
def client():
    with TestClient(build_app()) as c:
        yield c


def test_generates_request_id_and_handler_sees_it(client):
    resp = client.get("/plain")
    assert resp.status_code == 200
    request_id = resp.headers["X-Request-Id"]
    assert request_id
    assert resp.json()["request_id"] == request_id


def test_request_ids_are_unique_per_request(client):
    first = client.get("/plain").headers["X-Request-Id"]
    second = client.get("/plain").headers["X-Request-Id"]
    assert first != second


def test_inbound_request_id_is_preserved(client):
    resp = client.get("/plain", headers={"X-Request-Id": "caller-supplied-id"})
    assert resp.headers["X-Request-Id"] == "caller-supplied-id"
    assert resp.json()["request_id"] == "caller-supplied-id"


def test_security_headers_applied(client):
    resp = client.get("/plain")
    for key, value in SECURITY_HEADERS.items():
        assert resp.headers.get(key) == value


def test_security_headers_do_not_override_handler(client):
    resp = client.get("/own-header")
    assert resp.headers["X-Frame-Options"] == "SAMEORIGIN"
    # Other baseline headers are still added.
    assert resp.headers["X-Content-Type-Options"] == "nosniff"


def test_headers_present_on_error_responses(client):
    resp = client.get("/unauthorized")
    assert resp.status_code == 401
    assert resp.headers["X-Request-Id"]
    for key, value in SECURITY_HEADERS.items():
        assert resp.headers.get(key) == value


def test_timing_header_absent_by_default(monkeypatch):
    monkeypatch.delenv("NEXRYDE_RESPONSE_TIME_HEADER", raising=False)
    with TestClient(build_app()) as c:
        assert "X-Response-Time-ms" not in c.get("/plain").headers


def test_timing_header_present_when_enabled(monkeypatch):
    monkeypatch.setenv("NEXRYDE_RESPONSE_TIME_HEADER", "1")
    with TestClient(build_app()) as c:
        resp = c.get("/plain")
    assert int(resp.headers["X-Response-Time-ms"]) >= 0


@pytest.mark.parametrize(
    "value,expected",
    [("1", True), ("true", True), ("YES", True), ("0", False), ("", False), ("off", False)],
)
def test_timing_flag_parsing(value, expected):
    assert timing_header_enabled({"NEXRYDE_RESPONSE_TIME_HEADER": value}) is expected


def test_non_http_scope_passes_through():
    """Lifespan/websocket traffic must not be touched."""
    seen = {}

    async def app(scope, receive, send):
        seen["type"] = scope["type"]

    middleware = RequestContextMiddleware(app, security_headers=SECURITY_HEADERS)

    import asyncio

    async def noop_receive():
        return {"type": "websocket.connect"}

    async def noop_send(message):
        return None

    asyncio.run(middleware({"type": "websocket"}, noop_receive, noop_send))
    assert seen["type"] == "websocket"


def test_server_wires_the_replacement_and_drops_the_old_layers():
    """Guard against the three old layers creeping back into server.py."""
    source = (BACKEND / "server.py").read_text()
    assert "add_middleware(RequestContextMiddleware" in source
    for removed in (
        "class RequestIdMiddleware",
        "class SecurityHeadersMiddleware",
        "class ResponseTimingMiddleware",
    ):
        assert removed not in source, f"{removed} should stay replaced"
