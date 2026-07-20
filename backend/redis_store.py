"""Shared Redis store — Redis-first with in-memory fallback for local/dev.

In production (NEXRYDE_ENV/ENVIRONMENT=production and REDIS_REQUIRED!=false):
  - REDIS_URL is required at import
  - Connect failures raise
  - Mid-op Redis errors re-raise (no silent per-instance memory drift)
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any, Optional

logger = logging.getLogger(__name__)

_redis_raw = os.environ.get("REDIS_URL") or os.environ.get("REDISCLOUD_URL") or ""
REDIS_URL: Optional[str] = _redis_raw if _redis_raw.startswith(("redis://", "rediss://")) else None
REDIS_REQUIRED = (
    os.environ.get("NEXRYDE_ENV", os.environ.get("ENVIRONMENT", "development")).strip().lower()
    == "production"
    and os.environ.get("REDIS_REQUIRED", "true").lower() != "false"
)

if REDIS_REQUIRED and not REDIS_URL:
    raise RuntimeError("REDIS_URL is required in production")


class _MemStore:
    """Process-local fallback for development / tests when Redis is unavailable."""

    def __init__(self) -> None:
        self._kv: dict[str, tuple[str, Optional[float]]] = {}
        self._geo: dict[str, dict[str, tuple[float, float]]] = {}

    def _purge(self, key: str) -> None:
        item = self._kv.get(key)
        if not item:
            return
        _val, exp = item
        if exp is not None and exp <= time.time():
            self._kv.pop(key, None)

    async def get(self, key: str) -> Optional[str]:
        self._purge(key)
        item = self._kv.get(key)
        return item[0] if item else None

    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        exp = (time.time() + ttl) if ttl else None
        self._kv[key] = (str(value), exp)

    async def delete(self, key: str) -> None:
        self._kv.pop(key, None)

    async def incr(self, key: str, ttl: Optional[int] = None) -> int:
        self._purge(key)
        cur = 0
        item = self._kv.get(key)
        if item:
            try:
                cur = int(item[0])
            except (TypeError, ValueError):
                cur = 0
        cur += 1
        exp = item[1] if item and ttl is None else ((time.time() + ttl) if ttl else None)
        self._kv[key] = (str(cur), exp)
        return cur

    async def expire(self, key: str, ttl: int) -> None:
        self._purge(key)
        item = self._kv.get(key)
        if item:
            self._kv[key] = (item[0], time.time() + ttl)

    async def exists(self, key: str) -> bool:
        self._purge(key)
        return key in self._kv

    async def set_nx(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        self._purge(key)
        if key in self._kv:
            return False
        await self.set(key, value, ttl)
        return True

    async def ping(self) -> bool:
        return True

    async def geoadd(self, key: str, lng: float, lat: float, member: str) -> None:
        bucket = self._geo.setdefault(key, {})
        bucket[member] = (float(lng), float(lat))

    async def georemove(self, key: str, member: str) -> None:
        bucket = self._geo.get(key)
        if bucket:
            bucket.pop(member, None)


_fallback = _MemStore()


class _RedisStore:
    def __init__(self) -> None:
        self._client: Any = None
        self._lock: Any = None

    async def _connect(self) -> Any:
        if self._client is not None:
            return self._client
        if not REDIS_URL:
            return None
        if self._lock is None:
            import asyncio

            self._lock = asyncio.Lock()
        async with self._lock:
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
                if REDIS_REQUIRED:
                    raise RuntimeError(
                        "Redis is required in production but connection failed"
                    ) from exc
                logger.warning("Redis connection failed, falling back to in-memory: %s", exc)
                self._client = None
        return self._client

    def _on_op_error(self, op: str, exc: Exception) -> None:
        if REDIS_REQUIRED:
            raise RuntimeError(f"Redis {op} failed in production") from exc
        logger.warning("Redis %s failed, falling back to in-memory: %s", op, exc)

    async def get(self, key: str) -> Optional[str]:
        r = await self._connect()
        if r is None:
            return await _fallback.get(key)
        try:
            return await r.get(key)
        except Exception as exc:
            self._on_op_error("get", exc)
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
        except Exception as exc:
            self._on_op_error("set", exc)
            await _fallback.set(key, value, ttl)

    async def delete(self, key: str) -> None:
        r = await self._connect()
        if r is None:
            return await _fallback.delete(key)
        try:
            await r.delete(key)
        except Exception as exc:
            self._on_op_error("delete", exc)
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
        except Exception as exc:
            self._on_op_error("incr", exc)
            return await _fallback.incr(key, ttl)

    async def expire(self, key: str, ttl: int) -> None:
        r = await self._connect()
        if r is None:
            return await _fallback.expire(key, ttl)
        try:
            await r.expire(key, ttl)
        except Exception as exc:
            self._on_op_error("expire", exc)
            await _fallback.expire(key, ttl)

    async def exists(self, key: str) -> bool:
        r = await self._connect()
        if r is None:
            return await _fallback.exists(key)
        try:
            return bool(await r.exists(key))
        except Exception as exc:
            self._on_op_error("exists", exc)
            return await _fallback.exists(key)

    async def set_nx(self, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set only if absent. Returns True when this caller acquired the key."""
        r = await self._connect()
        if r is None:
            return await _fallback.set_nx(key, value, ttl)
        try:
            if ttl:
                ok = await r.set(key, str(value), nx=True, ex=int(ttl))
            else:
                ok = await r.set(key, str(value), nx=True)
            return bool(ok)
        except Exception as exc:
            self._on_op_error("set_nx", exc)
            return await _fallback.set_nx(key, value, ttl)

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
        except Exception as exc:
            self._on_op_error("geoadd", exc)
            await _fallback.geoadd(key, lng, lat, member)

    async def georemove(self, key: str, member: str) -> None:
        r = await self._connect()
        if r is None:
            return await _fallback.georemove(key, member)
        try:
            await r.zrem(key, member)
        except Exception as exc:
            self._on_op_error("georemove", exc)
            await _fallback.georemove(key, member)


if REDIS_URL:
    store: _RedisStore | _MemStore = _RedisStore()
    logger.info(
        "redis_store: Redis mode (url=%s)",
        REDIS_URL[:20] + "…" if len(REDIS_URL) > 20 else REDIS_URL,
    )
else:
    store = _fallback
    logger.info("redis_store: in-memory fallback mode (set REDIS_URL for multi-instance)")
