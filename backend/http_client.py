"""Shared async HTTP client — connection reuse across Cloud Run requests."""
from __future__ import annotations

from typing import Optional

import httpx

_client: httpx.AsyncClient | None = None

# Bind every outbound socket to an IPv4 source address.
#
# Serverless VPC Access connectors carry no IPv6, so any egress that picks an
# AAAA record leaves the VPC path — and therefore Cloud NAT — behind. That is
# why the Maps key could not be restricted to our NAT address: we could not
# promise every Google call left from 34.35.108.112. Binding to 0.0.0.0 removes
# the choice: getaddrinfo still returns AAAA records, but a v4-bound socket can
# only use the A records, so all egress is NAT'd and attributable.
_IPV4_ANY = "0.0.0.0"


def get_http_client() -> httpx.AsyncClient:
    """Process-wide AsyncClient (keep-alive to Google Maps / external APIs)."""
    global _client
    if _client is None or _client.is_closed:
        limits = httpx.Limits(max_connections=40, max_keepalive_connections=20)
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(10.0, connect=5.0),
            transport=httpx.AsyncHTTPTransport(
                limits=limits,
                local_address=_IPV4_ANY,
                http2=False,
            ),
        )
    return _client


def response_peer(response: object) -> Optional[str]:
    """Address this response actually came from, or None when unavailable.

    Proves which family egress used: an IPv4 peer means the call left through
    the connector and Cloud NAT, so the Maps key can be IP-restricted.
    """
    try:
        stream = response.extensions.get("network_stream")  # type: ignore[attr-defined]
        info = stream.get_extra_info("server_addr") if stream else None
        if not info:
            return None
        return f"{info[0]}:{info[1]}" if len(info) > 1 else str(info[0])
    except Exception:
        return None


async def aclose_http_client() -> None:
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
    _client = None
