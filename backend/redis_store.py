"""
Redis-backed key/value store with an in-memory fallback.

Usage
-----
All callers use the `store` singleton:

    from redis_store import store

    await store.set("key", "value", ttl=300)
    v = await store.get("key")
    await store.delete("key")
    await store.incr("key")             # atomic counter
    await store.expire("key", 60)       # reset TTL

When REDIS_URL is set the real Redis client is used (works across Cloud Run
instances). When it is absent (dev, CI) a simple asyncio-safe dict is used.

Security note
-------------
Do NOT store raw JWTs or plaintext passwords in Redis.
Store only ephemeral codes (OTP, 2FA, rate-limit counters).
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

_redis_raw = os.environ.get("REDIS_URL") or os.environ.get("REDISCLOUD_URL") or ""
REDIS_URL: Optional[str] = _redis_raw if _redis_raw.startswith(("redis://", "rediss://")) else None


# ── In-memory fallback ────────────────────────────────────────────────────────

class _MemStore:
    """Thread-safe (asyncio) in-memory store used when Redis is unavailable."""

    def __init__(self) -> None:
        self._data: Dict[str, Any] = {}
        self._exp:  Dict[str, float] = {}
        self._lock = asyncio.Lock()

    def _now(self) -> float:
        return time.monotonic()

    def _is_expired(self, key: str) -> bool:
        exp = self._exp.get(key)
        return exp is not None and self._now() > exp

    async def get(self, key: str) -> Optional[str]:
        async with self._lock:
            if self._is_expired(key):
                self._data.pop(key, None)
                self._exp.pop(key, None)
                return None
            v = self._data.get(key)
            return str(v) if v is not None else None

    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        async with self._lock:
            self._data[key] = value
            if ttl:
                self._exp[key] = self._now() + ttl
            else:
                self._exp.pop(key, None)

    async def delete(self, key: str) -> None:
        async with self._lock:
            self._data.pop(key, None)
            self._exp.pop(key, None)

    async def incr(self, key: str, ttl: Optional[int] = None) -> int:
        async with self._lock:
            if self._is_expired(key):
                self._data[key] = 0
                self._exp.pop(key, None)
            cur = int(self._data.get(key) or 0)
            new = cur + 1
            self._data[key] = new
            if ttl and key not in self._exp:
                self._exp[key] = self._now() + ttl
            return new

    async def expire(self, key: str, ttl: int) -> None:
        async with self._lock:
            if key in self._data:
                self._exp[key] = self._now() + ttl

    async def exists(self, key: str) -> bool:
        return await self.get(key) is not None

    async def geoadd(self, key: str, lng: float, lat: float, member: str) -> None:
        """No-op in memory mode — geo index requires Redis."""
        return None

    async def georemove(self, key: str, member: str) -> None:
        return None


# ── Redis wrapper ─────────────────────────────────────────────────────────────

class _RedisStore:
    """Thin async wrapper around redis.asyncio.Redis."""

    def __init__(self) -> None:
        self._client: Any = None

    async def _connect(self) -> Any:
        if self._client is not None:
            return self._client
        try:
            import redis.asyncio as aioredis  # type: ignore[import]
            self._client = aioredis.from_url(
                REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                socket_timeout=2,
                socket_connect_timeout=2,
            )
            await self._client.ping()
            logger.info("Redis connected: %s", REDIS_URL)
        except Exception as exc:
            logger.warning("Redis connection failed, falling back to in-memory: %s", exc)
            self._client = None
        return self._client

    async def get(self, key: str) -> Optional[str]:
        r = await self._connect()
        if r is None:
            return await _fallback.get(key)
        try:
            return await r.get(key)
        except Exception:
            return await _fallback.get(key)

    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        r = await self._connect()
        if r is None:
            return await _fallback.set(key, value, ttl)
        try:
            if ttl:
                await r.setex(key, ttl, str(value))
            else:
                await r.set(key, str(value))
        except Exception:
            await _fallback.set(key, value, ttl)

    async def delete(self, key: str) -> None:
        r = await self._connect()
        if r is None:
            return await _fallback.delete(key)
        try:
            await r.delete(key)
        except Exception:
            await _fallback.delete(key)

    async def incr(self, key: str, ttl: Optional[int] = None) -> int:
        r = await self._connect()
        if r is None:
            return await _fallback.incr(key, ttl)
        try:
            pipe = r.pipeline()
            pipe.incr(key)
            if ttl:
                pipe.expire(key, ttl, nx=True)
            results = await pipe.execute()
            return int(results[0])
        except Exception:
            return await _fallback.incr(key, ttl)

    async def expire(self, key: str, ttl: int) -> None:
        r = await self._connect()
        if r is None:
            return await _fallback.expire(key, ttl)
        try:
            await r.expire(key, ttl)
        except Exception:
            await _fallback.expire(key, ttl)

    async def exists(self, key: str) -> bool:
        r = await self._connect()
        if r is None:
            return await _fallback.exists(key)
        try:
            return bool(await r.exists(key))
        except Exception:
            return await _fallback.exists(key)

    async def ping(self) -> bool:
        """Health check — returns True if Redis is reachable."""
        r = await self._connect()
        if r is None:
            return False
        try:
            await r.ping()
            return True
        except Exception:
            return False

    async def geoadd(self, key: str, lng: float, lat: float, member: str) -> None:
        r = await self._connect()
        if r is None:
            return await _fallback.geoadd(key, lng, lat, member)
        try:
            await r.geoadd(key, (lng, lat, member))
        except Exception:
            await _fallback.geoadd(key, lng, lat, member)

    async def georemove(self, key: str, member: str) -> None:
        r = await self._connect()
        if r is None:
            return await _fallback.georemove(key, member)
        try:
            await r.zrem(key, member)
        except Exception:
            await _fallback.georemove(key, member)


# ── Public singleton ──────────────────────────────────────────────────────────

_fallback = _MemStore()

if REDIS_URL:
    store: _RedisStore | _MemStore = _RedisStore()
    logger.info("redis_store: Redis mode (url=%s)", REDIS_URL[:20] + "…" if len(REDIS_URL) > 20 else REDIS_URL)
else:
    store = _fallback
    logger.info("redis_store: in-memory fallback mode (set REDIS_URL for multi-instance)")
