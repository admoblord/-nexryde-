"""Flink-style tumbling-window surge — H3 cell demand/supply stream processor.

Mirrors Uber's stream surge path without requiring a Flink cluster:

  • Events (trip request, driver online/offline/heartbeat) update per-cell counters
  • Every WINDOW_SEC a tumbling window closes → demand_ratio + optional multiplier
  • Results land in Redis ``surge:cell:{h3}`` and optionally Kafka ``nexryde.surge``

Peak-only product surge (``surge_pricing.py``) remains the fare source of truth
unless ``NEXRYDE_STREAM_SURGE=true`` is set — then stream ratio feeds demand tiers.
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any, Optional

from realtime_platform.observability import incr, observe_ms

logger = logging.getLogger("realtime_platform.surge_stream")

_WINDOW_OPENED_AT: float = 0.0


def stream_surge_enabled() -> bool:
    raw = (os.environ.get("NEXRYDE_STREAM_SURGE") or "").strip().lower()
    return raw in ("1", "true", "on", "yes")


def _window_sec() -> int:
    try:
        return max(5, int(os.environ.get("NEXRYDE_SURGE_WINDOW_SEC", "60")))
    except (TypeError, ValueError):
        return 60


def _h3_cell(lat: float, lng: float) -> Optional[str]:
    try:
        from h3_dispatch import cell_for

        return cell_for(lat, lng)
    except Exception:
        return None


def _cell_key(cell: str, kind: str) -> str:
    return f"surge:win:{kind}:{cell}"


async def track_cell(cell: str) -> None:
    try:
        from redis_store import store

        raw = await store.get("surge:win:cells") or []
        if not isinstance(raw, list):
            raw = []
        if cell not in raw:
            raw.append(cell)
            await store.set("surge:win:cells", raw[-500:], ttl=_window_sec() * 10)
    except Exception:
        pass


async def _incr_cell(cell: str, kind: str, amount: float = 1.0) -> None:
    try:
        from redis_store import store

        key = _cell_key(cell, kind)
        incr_fn = getattr(store, "incrbyfloat", None) or getattr(store, "incr", None)
        if callable(incr_fn):
            try:
                await incr_fn(key, amount)  # type: ignore
            except TypeError:
                await incr_fn(key)  # type: ignore
        else:
            cur = float((await store.get(key)) or 0)
            await store.set(key, cur + amount, ttl=_window_sec() * 3)
        expire = getattr(store, "expire", None)
        if callable(expire):
            try:
                await expire(key, _window_sec() * 3)  # type: ignore
            except Exception:
                pass
        await track_cell(cell)
    except Exception:
        logger.debug("surge incr failed cell=%s", cell, exc_info=True)


async def record_demand_event(*, lat: Any, lng: Any, trip_id: str = "") -> None:
    if not stream_surge_enabled():
        return
    try:
        cell = _h3_cell(float(lat), float(lng))
    except (TypeError, ValueError):
        return
    if not cell:
        return
    await _incr_cell(cell, "demand")
    incr("surge.stream_demand", cell=cell[:8])
    if trip_id:
        try:
            from realtime_platform.event_bus import publish

            await publish(
                "nexryde.surge",
                "surge.demand",
                key=cell,
                trip_id=trip_id,
                payload={"cell": cell, "lat": lat, "lng": lng},
                persist_outbox=False,
            )
        except Exception:
            pass


async def record_supply_event(
    *,
    driver_id: str,
    event_type: str,
    lat: Any = None,
    lng: Any = None,
) -> None:
    if not stream_surge_enabled() or not driver_id:
        return
    if lat is None or lng is None:
        try:
            from driver_presence import get_driver_presence

            pres = await get_driver_presence(driver_id) or {}
            lat = pres.get("lat")
            lng = pres.get("lng")
        except Exception:
            return
    try:
        cell = _h3_cell(float(lat), float(lng))
    except (TypeError, ValueError):
        return
    if not cell:
        return
    delta = -1.0 if event_type == "driver_offline" else 1.0
    await _incr_cell(cell, "supply", delta)
    incr("surge.stream_supply", event=event_type)


async def apply_surge_event(event_type: str, payload: dict[str, Any]) -> None:
    """Kafka consumer entry for surge topic."""
    if event_type == "surge.demand":
        await record_demand_event(
            lat=payload.get("lat"),
            lng=payload.get("lng"),
            trip_id=str(payload.get("trip_id") or ""),
        )
    elif event_type.startswith("surge.supply"):
        await record_supply_event(
            driver_id=str(payload.get("driver_id") or ""),
            event_type=str(payload.get("presence_event") or "heartbeat"),
            lat=payload.get("lat"),
            lng=payload.get("lng"),
        )


def _ratio_to_multiplier(ratio: float) -> float:
    """Map demand/supply ratio → soft multiplier (capped). Product peak still wins in fare."""
    if ratio < 0.5:
        return 1.0
    if ratio < 0.8:
        return 1.1
    if ratio < 1.2:
        return 1.2
    if ratio < 1.8:
        return 1.3
    return 1.4


async def close_window_and_publish() -> int:
    """Close current tumbling window for all touched cells; write Redis snapshots."""
    if not stream_surge_enabled():
        return 0
    t0 = time.perf_counter()
    n = 0
    try:
        from redis_store import store

        # Scan known cells from a set maintained on incr — fallback: skip if no scan.
        cells_raw = await store.get("surge:win:cells") or []
        if not isinstance(cells_raw, list):
            cells_raw = []
        cells = [str(c) for c in cells_raw]
        for cell in cells:
            demand = float((await store.get(_cell_key(cell, "demand"))) or 0)
            supply = float((await store.get(_cell_key(cell, "supply"))) or 0)
            ratio = demand / max(supply, 1.0)
            mult = _ratio_to_multiplier(ratio)
            snap = {
                "cell": cell,
                "demand": demand,
                "supply": supply,
                "ratio": round(ratio, 3),
                "multiplier": mult,
                "window_sec": _window_sec(),
                "closed_at": time.time(),
            }
            await store.set(f"surge:cell:{cell}", snap, ttl=_window_sec() * 5)
            # Reset counters for next window
            await store.set(_cell_key(cell, "demand"), 0, ttl=_window_sec() * 3)
            await store.set(_cell_key(cell, "supply"), 0, ttl=_window_sec() * 3)
            n += 1
            try:
                from realtime_platform.event_bus import publish

                await publish(
                    "nexryde.surge",
                    "surge.window_closed",
                    key=cell,
                    payload=snap,
                    persist_outbox=False,
                )
            except Exception:
                pass
        observe_ms("surge.window_close_ms", (time.perf_counter() - t0) * 1000, cells=n)
        incr("surge.windows_closed", n=n)
    except Exception:
        logger.debug("surge window close failed", exc_info=True)
    return n


async def tick_windows() -> None:
    """Called by kafka worker loop — close window when due."""
    global _WINDOW_OPENED_AT
    if not stream_surge_enabled():
        return
    now = time.time()
    if _WINDOW_OPENED_AT <= 0:
        _WINDOW_OPENED_AT = now
        return
    if now - _WINDOW_OPENED_AT >= _window_sec():
        await close_window_and_publish()
        _WINDOW_OPENED_AT = now


async def get_stream_demand_ratio(lat: float, lng: float) -> Optional[float]:
    """Fast path for fare / surge checks — Redis cell snapshot."""
    if not stream_surge_enabled():
        return None
    cell = _h3_cell(lat, lng)
    if not cell:
        return None
    try:
        from redis_store import store

        snap = await store.get(f"surge:cell:{cell}")
        if isinstance(snap, dict) and snap.get("ratio") is not None:
            return float(snap["ratio"])
        # Live window (partial)
        demand = float((await store.get(_cell_key(cell, "demand"))) or 0)
        supply = float((await store.get(_cell_key(cell, "supply"))) or 0)
        if demand <= 0 and supply <= 0:
            return None
        return demand / max(supply, 1.0)
    except Exception:
        return None


