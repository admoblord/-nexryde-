"""Structured metrics for critical realtime paths (Sentry breadcrumbs + counters)."""
from __future__ import annotations

import logging
import time
from collections import defaultdict
from contextlib import contextmanager
from typing import Any, Dict, Iterator, Optional

logger = logging.getLogger("realtime_platform")

_counters: Dict[str, int] = defaultdict(int)
_latency_ms: Dict[str, list[float]] = defaultdict(list)


def incr(metric: str, n: int = 1, **tags: Any) -> None:
    key = metric if not tags else f"{metric}|{'|'.join(f'{k}={v}' for k, v in sorted(tags.items()))}"
    _counters[key] += n
    logger.info("rt_metric counter=%s value=%s tags=%s", metric, n, tags or {})


def observe_ms(metric: str, ms: float, **tags: Any) -> None:
    key = metric if not tags else f"{metric}|{'|'.join(f'{k}={v}' for k, v in sorted(tags.items()))}"
    bucket = _latency_ms[key]
    bucket.append(float(ms))
    if len(bucket) > 500:
        del bucket[:250]
    logger.info("rt_metric latency=%s ms=%.1f tags=%s", metric, ms, tags or {})
    try:
        import sentry_sdk

        sentry_sdk.add_breadcrumb(
            category="realtime",
            message=metric,
            level="info",
            data={"ms": round(ms, 1), **tags},
        )
    except Exception:
        pass


@contextmanager
def trace(metric: str, **tags: Any) -> Iterator[dict[str, Any]]:
    started = time.perf_counter()
    ctx: dict[str, Any] = {"ok": True}
    try:
        yield ctx
    except Exception:
        ctx["ok"] = False
        incr(f"{metric}.error", **tags)
        raise
    finally:
        observe_ms(metric, (time.perf_counter() - started) * 1000.0, **tags)
        incr(f"{metric}.ok" if ctx.get("ok") else f"{metric}.fail", **tags)


def snapshot() -> dict[str, Any]:
    lat: dict[str, Any] = {}
    for k, vals in _latency_ms.items():
        if not vals:
            continue
        s = sorted(vals)
        lat[k] = {
            "count": len(s),
            "p50": s[len(s) // 2],
            "p95": s[max(0, int(len(s) * 0.95) - 1)],
            "max": s[-1],
        }
    return {"counters": dict(_counters), "latency_ms": lat}


def reset_for_tests() -> None:
    _counters.clear()
    _latency_ms.clear()
