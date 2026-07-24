"""
Lightweight Prometheus-compatible /metrics endpoint + custom event tracking.

Tracks:
  - ride_requests_total
  - ride_completions_total
  - ride_failures_total
  - wallet_debits_total / wallet_credits_total
  - ws_connections_active
  - api_request_duration_seconds (histogram via structlog)
  - circuit_breaker state per service
"""
from __future__ import annotations

import time
from collections import defaultdict
from typing import Dict

from fastapi import APIRouter, Request

metrics_router = APIRouter(prefix="/api", tags=["Metrics"])

# ── In-process counters (reset on restart; Prometheus scrapes cumulatives) ────

_counters: Dict[str, float] = defaultdict(float)
_gauges: Dict[str, float] = defaultdict(float)
_histograms: Dict[str, list] = defaultdict(list)


def inc(name: str, value: float = 1.0, labels: dict | None = None) -> None:
    """Increment a counter. Thread-safe enough for single-process Cloud Run."""
    key = name if not labels else f"{name}{{{','.join(f'{k}={v}' for k, v in sorted(labels.items()))}}}"
    _counters[key] += value


def gauge(name: str, value: float, labels: dict | None = None) -> None:
    key = name if not labels else f"{name}{{{','.join(f'{k}={v}' for k, v in sorted(labels.items()))}}}"
    _gauges[key] = value


def observe(name: str, value: float) -> None:
    """Record a histogram observation (last 1000 kept)."""
    buf = _histograms[name]
    buf.append(value)
    if len(buf) > 1000:
        _histograms[name] = buf[-1000:]


# ── Named event helpers (called from trip/payment handlers) ───────────────────

def track_ride_request(city: str = "unknown") -> None:
    inc("nexryde_ride_requests_total", labels={"city": city})


def track_ride_accepted() -> None:
    inc("nexryde_ride_accepted_total")


def track_ride_completed(fare_ngn: float = 0) -> None:
    inc("nexryde_ride_completions_total")
    inc("nexryde_revenue_ngn_total", fare_ngn)


def track_payment_confirmed() -> None:
    inc("nexryde_payment_completions_total")


def track_ride_failed(reason: str = "unknown") -> None:
    inc("nexryde_ride_failures_total", labels={"reason": reason})


def track_wallet_debit(amount: float) -> None:
    inc("nexryde_wallet_debits_total")
    inc("nexryde_wallet_debited_ngn_total", amount)


def track_wallet_credit(amount: float) -> None:
    inc("nexryde_wallet_credits_total")
    inc("nexryde_wallet_credited_ngn_total", amount)


def track_ws_connect(role: str) -> None:
    gauge(f"nexryde_ws_connections_active_{role}", _gauges.get(f"nexryde_ws_connections_active_{role}", 0) + 1)


def track_ws_disconnect(role: str) -> None:
    current = _gauges.get(f"nexryde_ws_connections_active_{role}", 0)
    gauge(f"nexryde_ws_connections_active_{role}", max(0, current - 1))


def track_push_sent(channel: str = "fcm") -> None:
    inc("nexryde_push_notifications_sent_total", labels={"channel": channel})


# ── Prometheus-format text renderer ──────────────────────────────────────────

def _prometheus_text() -> str:
    lines = []

    lines.append("# HELP nexryde_counters NEXRYDE accumulated counters")
    lines.append("# TYPE nexryde_counters counter")
    for k, v in sorted(_counters.items()):
        # Reconstruct metric name and labels
        if "{" in k:
            name, rest = k.split("{", 1)
            label_str = rest.rstrip("}")
            lines.append(f"{name}{{{label_str}}} {v}")
        else:
            lines.append(f"{k} {v}")

    lines.append("# HELP nexryde_gauges NEXRYDE gauges")
    lines.append("# TYPE nexryde_gauges gauge")
    for k, v in sorted(_gauges.items()):
        lines.append(f"{k} {v}")

    for name, values in sorted(_histograms.items()):
        if not values:
            continue
        count = len(values)
        total = sum(values)
        p50 = sorted(values)[int(count * 0.5)]
        p95 = sorted(values)[int(count * 0.95)]
        p99 = sorted(values)[min(int(count * 0.99), count - 1)]
        lines.append(f"# HELP {name} histogram")
        lines.append(f"# TYPE {name} summary")
        lines.append(f'{name}{{quantile="0.5"}} {p50:.4f}')
        lines.append(f'{name}{{quantile="0.95"}} {p95:.4f}')
        lines.append(f'{name}{{quantile="0.99"}} {p99:.4f}')
        lines.append(f"{name}_count {count}")
        lines.append(f"{name}_sum {total:.4f}")

    # Circuit breaker states
    try:
        from circuit_breaker import google_maps_cb, squad_payments_cb, redis_cb
        for cb in (google_maps_cb, squad_payments_cb, redis_cb):
            s = cb.status()
            open_val = 1 if s["state"] == "open" else 0
            lines.append(f'nexryde_circuit_breaker_open{{service="{s["name"]}"}} {open_val}')
            lines.append(f'nexryde_circuit_breaker_failures{{service="{s["name"]}"}} {s["failures"]}')
    except ImportError:
        pass

    # Realtime platform in-process counters / latencies
    try:
        from realtime_platform.observability import snapshot

        snap = snapshot()
        for k, v in sorted((snap.get("counters") or {}).items()):
            safe = "".join(c if c.isalnum() or c in "_:" else "_" for c in str(k))
            lines.append(f"nexryde_rt_counter{{name=\"{safe}\"}} {float(v)}")
        for k, lat in sorted((snap.get("latency_ms") or {}).items()):
            if not isinstance(lat, dict):
                continue
            safe = "".join(c if c.isalnum() or c in "_:" else "_" for c in str(k))
            if lat.get("p95") is not None:
                lines.append(f"nexryde_rt_latency_p95_ms{{name=\"{safe}\"}} {float(lat['p95'])}")
    except Exception:
        pass

    return "\n".join(lines) + "\n"


# ── FastAPI endpoint ───────────────────────────────────────────────────────────

@metrics_router.get("/metrics", include_in_schema=False)
async def get_metrics(request: Request):
    """
    Prometheus-compatible metrics scrape endpoint.
    Restricted to internal Cloud Run traffic or bearer token.
    """
    import os
    from fastapi.responses import PlainTextResponse

    ops_key = os.environ.get("NEXRYDE_OPS_KEY", "")
    if ops_key:
        auth = request.headers.get("authorization", "")
        token = auth.removeprefix("Bearer ").strip()
        client_ip = request.client.host if request.client else ""
        # Allow internal Cloud Run IPs without token
        internal = client_ip.startswith("10.") or client_ip.startswith("169.254.")
        if not internal and token != ops_key:
            from fastapi import HTTPException
            raise HTTPException(status_code=401, detail="Unauthorized")

    return PlainTextResponse(_prometheus_text(), media_type="text/plain; version=0.0.4")
