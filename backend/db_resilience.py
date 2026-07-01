"""MongoDB retry + pool keep-alive for Cloud Run ↔ Atlas stale connections."""
from __future__ import annotations

import asyncio
import logging
from typing import Awaitable, Callable, TypeVar

from pymongo.errors import (
    AutoReconnect,
    ConnectionFailure,
    NetworkTimeout,
    ServerSelectionTimeoutError,
)

from database import client, db

logger = logging.getLogger("server")

T = TypeVar("T")

RETRYABLE = (
    NetworkTimeout,
    ServerSelectionTimeoutError,
    AutoReconnect,
    ConnectionFailure,
    TimeoutError,
    asyncio.TimeoutError,
)


async def ensure_mongo_warm() -> bool:
    """Ping Mongo — opens/refreshes pool connections. Returns True if reachable."""
    try:
        await asyncio.wait_for(db.command("ping"), timeout=5.0)
        return True
    except Exception as exc:
        logger.warning("mongo_warm_ping_failed: %s", exc)
        return False


async def with_mongo_retry(
    operation: Callable[[], Awaitable[T]],
    *,
    attempts: int = 2,
    label: str = "mongo",
) -> T:
    """Retry once on stale-connection timeouts (common after Cloud Run idle)."""
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            return await operation()
        except RETRYABLE as exc:
            last = exc
            logger.warning(
                "mongo_retry label=%s attempt=%s/%s error=%s",
                label,
                attempt + 1,
                attempts,
                exc,
            )
            if attempt + 1 >= attempts:
                break
            try:
                await ensure_mongo_warm()
            except Exception:
                pass
            await asyncio.sleep(0.3 * (attempt + 1))
    assert last is not None
    raise last
