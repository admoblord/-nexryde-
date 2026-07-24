"""Batched matching — Uber-style windowed assignment (Lagos-scale).

Instead of independently blasting offers for each trip the instant it is created,
trips enter a short tumbling window (default 800ms). At flush:

  1. Load candidate drivers for every pending trip (H3 + GEO).
  2. Greedy global assign: each driver at most one *primary* trip (lowest ETA).
  3. Remaining candidates become secondary offers (existing fan-out).

Enable: NEXRYDE_BATCH_MATCHING=true (or feature flag ``batch_matching``).
When disabled, callers fall through to immediate ``_create_trip_offers``.
"""
from __future__ import annotations

import contextvars
import logging
import os
import time
from typing import Any, Optional

from realtime_platform.observability import incr, observe_ms, trace

logger = logging.getLogger("realtime_platform.batched_matching")

_QUEUE_KEY = "match:batch:queue"
_LOCK_KEY = "match:batch:flush_lock"
_last_flush_mono = 0.0
_in_batch_flush: contextvars.ContextVar[bool] = contextvars.ContextVar("match_batch_flush", default=False)


def _window_ms() -> int:
    try:
        return max(50, int(os.environ.get("NEXRYDE_MATCH_BATCH_MS", "800")))
    except (TypeError, ValueError):
        return 800


def _max_batch() -> int:
    try:
        return max(1, int(os.environ.get("NEXRYDE_MATCH_BATCH_SIZE", "40")))
    except (TypeError, ValueError):
        return 40


def batch_matching_enabled() -> bool:
    raw = (os.environ.get("NEXRYDE_BATCH_MATCHING") or "").strip().lower()
    return raw in ("1", "true", "on", "yes")


def in_batch_flush() -> bool:
    return bool(_in_batch_flush.get())


async def enqueue_trip_for_batch(trip_id: str, payload: Optional[dict[str, Any]] = None) -> bool:
    """Queue a trip for the next matching window. Returns False if batching off."""
    if not batch_matching_enabled() or not trip_id or in_batch_flush():
        return False
    try:
        from redis_store import store

        score = time.time()
        member = trip_id
        # ZADD style if available; else list.
        zadd = getattr(store, "zadd", None)
        if callable(zadd):
            await zadd(_QUEUE_KEY, {member: score})  # type: ignore
        else:
            await store.set(f"match:pending:{trip_id}", payload or {}, ttl=120)
            raw = await store.get(_QUEUE_KEY) or []
            if not isinstance(raw, list):
                raw = []
            if trip_id not in raw:
                raw.append(trip_id)
            await store.set(_QUEUE_KEY, raw, ttl=300)
        incr("match.batch_enqueued")
        return True
    except Exception:
        logger.debug("batch enqueue failed", exc_info=True)
        return False


def greedy_assign(
    trip_candidates: dict[str, list[dict[str, Any]]],
) -> dict[str, str]:
    """
    Assign each driver to at most one trip (primary).

    trip_candidates: trip_id → [{driver_id, eta_sec, score}, ...] sorted best-first.
    Returns trip_id → primary_driver_id.
    """
    # Flatten (eta, trip_id, driver_id) and assign greedily by ETA.
    edges: list[tuple[float, str, str]] = []
    for trip_id, cands in trip_candidates.items():
        for c in cands:
            did = str(c.get("driver_id") or "")
            if not did:
                continue
            eta = float(c.get("eta_sec") or 9999)
            edges.append((eta, trip_id, did))
    edges.sort(key=lambda x: x[0])
    used_drivers: set[str] = set()
    assigned: dict[str, str] = {}
    for eta, trip_id, did in edges:
        if trip_id in assigned or did in used_drivers:
            continue
        assigned[trip_id] = did
        used_drivers.add(did)
    return assigned


async def _load_queue() -> list[str]:
    from redis_store import store

    zrange = getattr(store, "zrange", None)
    if callable(zrange):
        try:
            rows = await zrange(_QUEUE_KEY, 0, _max_batch() - 1)  # type: ignore
            return [str(r) for r in (rows or [])]
        except Exception:
            pass
    raw = await store.get(_QUEUE_KEY)
    if isinstance(raw, list):
        return [str(x) for x in raw[: _max_batch()]]
    return []


async def _pop_queue(trip_ids: list[str]) -> None:
    from redis_store import store

    if not trip_ids:
        return
    zrem = getattr(store, "zrem", None)
    if callable(zrem):
        try:
            await zrem(_QUEUE_KEY, *trip_ids)  # type: ignore
            return
        except Exception:
            pass
    raw = await store.get(_QUEUE_KEY)
    if isinstance(raw, list):
        left = [x for x in raw if str(x) not in set(trip_ids)]
        await store.set(_QUEUE_KEY, left, ttl=300)


async def flush_match_batch_if_due(*, force: bool = False) -> int:
    """Flush the matching window when due. Returns number of trips matched."""
    global _last_flush_mono
    if not batch_matching_enabled() and not force:
        return 0
    now = time.monotonic()
    if not force and (now - _last_flush_mono) * 1000 < _window_ms():
        # Still flush if queue is large.
        q = await _load_queue()
        if len(q) < _max_batch():
            return 0
    return await flush_match_batch()


async def flush_match_batch() -> int:
    """Run one batch assignment cycle."""
    global _last_flush_mono
    _last_flush_mono = time.monotonic()
    if not batch_matching_enabled():
        return 0

    with trace("match.batch_flush"):
        t0 = time.perf_counter()
        trip_ids = await _load_queue()
        if not trip_ids:
            return 0

        from database import db
        from realtime_platform.dispatch_engine import find_candidates

        trip_candidates: dict[str, list[dict[str, Any]]] = {}
        trips_by_id: dict[str, dict[str, Any]] = {}
        for tid in trip_ids:
            trip = await db.trips.find_one(
                {"id": tid, "status": {"$in": ["pending", "pending_driver_offers", "searching"]}},
                {"_id": 0},
            )
            if not trip:
                continue
            trips_by_id[tid] = trip
            pl = trip.get("pickup_location") or {}
            try:
                lat = float(pl.get("lat") if pl.get("lat") is not None else pl.get("latitude") or trip.get("pickup_lat"))
                lng = float(pl.get("lng") if pl.get("lng") is not None else pl.get("longitude") or trip.get("pickup_lng"))
            except (TypeError, ValueError):
                continue
            blocked = list(trip.get("blocked_drivers") or [])
            cands = await find_candidates(pickup_lat=lat, pickup_lng=lng, blocked_drivers=blocked, limit=15)
            trip_candidates[tid] = [
                {"driver_id": c.driver_id, "eta_sec": c.eta_sec, "score": c.score, "distance_m": c.distance_m}
                for c in cands
            ]

        primary = greedy_assign(trip_candidates)
        matched = 0
        token = _in_batch_flush.set(True)
        try:
            for tid, trip in trips_by_id.items():
                try:
                    # Prefer primary driver first in eligible order via preferred_driver_id.
                    if tid in primary:
                        await db.trips.update_one(
                            {"id": tid},
                            {"$set": {"preferred_driver_id": primary[tid], "batch_matched_at": time.time()}},
                        )
                        trip["preferred_driver_id"] = primary[tid]
                    from routers.trips import _create_trip_offers

                    offers = await _create_trip_offers(trip, list(trip.get("blocked_drivers") or []))
                    if offers:
                        matched += 1
                        await db.trips.update_one(
                            {"id": tid, "status": {"$in": ["pending", "searching"]}},
                            {"$set": {"status": "pending_driver_offers"}},
                        )
                except Exception:
                    logger.exception("batch match failed trip=%s", tid)
        finally:
            _in_batch_flush.reset(token)

        await _pop_queue(trip_ids)
        ms = (time.perf_counter() - t0) * 1000
        observe_ms("match.batch_flush_ms", ms, n=len(trip_ids), matched=matched)
        incr("match.batch_flushed", n=matched)
        logger.info(
            "batch_match flushed queued=%s matched=%s primaries=%s ms=%.0f",
            len(trip_ids),
            matched,
            len(primary),
            ms,
        )
        return matched
