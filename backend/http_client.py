"""Shared async HTTP client — connection reuse across Cloud Run requests."""
from __future__ import annotations

import httpx

_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    """Process-wide AsyncClient (keep-alive to Google Maps / external APIs)."""
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(10.0, connect=5.0),
            limits=httpx.Limits(max_connections=40, max_keepalive_connections=20),
            http2=False,
        )
    return _client


async def aclose_http_client() -> None:
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
    _client = None
