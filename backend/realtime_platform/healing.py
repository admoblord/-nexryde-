"""Self-Healing Engine — recover sockets, Redis, presence, and replay queues."""
from __future__ import annotations

import logging
import time
from typing import Any

from realtime_platform.observability import incr, observe_ms, trace
from realtime_platform.retry_engine import replay_pending_for_actor

logger = logging.getLogger("realtime_platform.healing")


async def heal_session(actor_id: str, *, role: str = "driver") -> dict[str, Any]:
    """Called after reconnect / app resume / FGS restart."""
    with trace("healing.session", actor_id=actor_id, role=role):
        t0 = time.perf_counter()
        redis_ok = False
        try:
            from redis_store import store

            redis_ok = bool(await store.ping())
        except Exception:
            redis_ok = False

        replayed = 0
        if redis_ok:

            async def _repush(ev):
                if ev.event_type == "RIDE_OFFER" and ev.payload.get("offer"):
                    from realtime_platform.push_engine import deliver_offer

                    result = await deliver_offer(ev.payload["offer"])
                    return bool(result.get("ok"))
                return True

            try:
                replayed = await replay_pending_for_actor(actor_id, _repush, limit=30)
            except Exception:
                logger.exception("heal replay failed actor=%s", actor_id)

        # Nudge hubs to ensure Redis channel subscription is warm.
        try:
            from routers.realtime_dispatch import driver_offer_hub, rider_trip_hub

            hub = driver_offer_hub if role == "driver" else rider_trip_hub
            await hub._ensure_channel(actor_id)  # noqa: SLF001 — intentional heal hook
        except Exception:
            logger.debug("hub warm failed", exc_info=True)

        ms = (time.perf_counter() - t0) * 1000
        observe_ms("healing.session_ms", ms)
        incr("healing.session")
        return {
            "ok": True,
            "redis_ok": redis_ok,
            "replayed": replayed,
            "latency_ms": round(ms, 1),
        }


async def health_snapshot() -> dict[str, Any]:
    from realtime_platform.observability import snapshot

    redis_ok = False
    redis_ms = None
    try:
        from redis_store import store

        t0 = time.perf_counter()
        redis_ok = bool(await store.ping())
        redis_ms = round((time.perf_counter() - t0) * 1000, 1)
    except Exception:
        redis_ok = False
    return {
        "ok": redis_ok,
        "redis_ok": redis_ok,
        "redis_latency_ms": redis_ms,
        "metrics": snapshot(),
        "ts_ms": int(time.time() * 1000),
    }
