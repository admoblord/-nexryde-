"""Idempotency keys — Redis SET NX with Mongo fallback log."""
from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger("realtime_platform.idempotency")


async def claim(key: str, *, ttl_sec: int = 120, token: str = "1") -> bool:
    """Return True if this caller uniquely claimed the key (first write wins).

    Redis errors fail-open (return True) so Mongo CAS / business locks remain the
    backstop — never treat infra failure as a duplicate reject.
    """
    if not key:
        return True
    try:
        from redis_store import store

        return bool(await store.set_nx(f"rt:idem:{key}", token, ttl=max(1, int(ttl_sec))))
    except Exception:
        logger.exception("idempotency claim degraded key=%s", key)
        try:
            from realtime_platform.observability import incr

            incr("idempotency.claim_degraded")
        except Exception:
            pass
        return True


async def seen(key: str) -> bool:
    if not key:
        return False
    try:
        from redis_store import store

        return bool(await store.exists(f"rt:idem:{key}"))
    except Exception:
        return False


async def release(key: str) -> None:
    if not key:
        return
    try:
        from redis_store import store

        await store.delete(f"rt:idem:{key}")
    except Exception:
        logger.debug("idempotency release failed key=%s", key, exc_info=True)
