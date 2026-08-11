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
        self._sets: dict[str, set[str]] = {}

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

    async def mget(self, keys: list[str]) -> list[Optional[str]]:
        out: list[Optional[str]] = []
        for key in keys:
            out.append(await self.get(key))
        return out

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

    async def sadd(self, key: str, *members: str) -> int:
        bucket = self._sets.setdefault(key, set())
        before = len(bucket)
        for m in members:
            bucket.add(str(m))
        return len(bucket) - before

    async def srem(self, key: str, *members: str) -> int:
        bucket = self._sets.get(key)
        if not bucket:
            return 0
        n = 0
        for m in members:
            if str(m) in bucket:
                bucket.discard(str(m))
                n += 1
        if not bucket:
            self._sets.pop(key, None)
        return n

    async def smembers(self, key: str) -> list[str]:
        bucket = self._sets.get(key) or set()
        return list(bucket)

    async def geoadd(self, key: str, lng: float, lat: float, member: str) -> None:
        bucket = self._geo.setdefault(key, {})
        bucket[member] = (float(lng), float(lat))

    async def georemove(self, key: str, member: str) -> None:
        bucket = self._geo.get(key)
        if bucket:
            bucket.pop(member, None)

    async def geosearch(
        self,
        key: str,
        lng: float,
        lat: float,
        *,
        radius_m: float,
        count: int = 30,
    ) -> list[tuple[str, float]]:
        """Return [(member, distance_m), ...] nearest-first within radius_m."""
        import math

        bucket = self._geo.get(key) or {}
        if not bucket:
            return []
        lat1 = math.radians(float(lat))
        lng1 = math.radians(float(lng))
        scored: list[tuple[str, float]] = []
        for member, (mlng, mlat) in bucket.items():
            lat2 = math.radians(float(mlat))
            lng2 = math.radians(float(mlng))
            dlat = lat2 - lat1
            dlng = lng2 - lng1
            a = (
                math.sin(dlat / 2) ** 2
                + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
            )
            dist_m = 2 * 6_371_000 * math.asin(min(1.0, math.sqrt(a)))
            if dist_m <= float(radius_m):
                scored.append((str(member), float(dist_m)))
        scored.sort(key=lambda row: row[1])
        return scored[: max(1, int(count))]


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
            val = await r.get(key)
            if val is None:
                return None
            return val if isinstance(val, str) else val.decode()
        except Exception as exc:
            self._on_op_error("get", exc)
            return await _fallback.get(key)

    async def mget(self, keys: list[str]) -> list[Optional[str]]:
        if not keys:
            return []
        r = await self._connect()
        if r is None:
            return await _fallback.mget(keys)
        try:
            vals = await r.mget(keys)
            out: list[Optional[str]] = []
            for val in vals or []:
                if val is None:
                    out.append(None)
                elif isinstance(val, str):
                    out.append(val)
                else:
                    out.append(val.decode())
            return out
        except Exception as exc:
            self._on_op_error("mget", exc)
            return await _fallback.mget(keys)

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

    async def sadd(self, key: str, *members: str) -> int:
        r = await self._connect()
        if r is None:
            return await _fallback.sadd(key, *members)
        try:
            return int(await r.sadd(key, *[str(m) for m in members]))
        except Exception as exc:
            self._on_op_error("sadd", exc)
            return await _fallback.sadd(key, *members)

    async def srem(self, key: str, *members: str) -> int:
        r = await self._connect()
        if r is None:
            return await _fallback.srem(key, *members)
        try:
            return int(await r.srem(key, *[str(m) for m in members]))
        except Exception as exc:
            self._on_op_error("srem", exc)
            return await _fallback.srem(key, *members)

    async def smembers(self, key: str) -> list[str]:
        r = await self._connect()
        if r is None:
            return await _fallback.smembers(key)
        try:
            raw = await r.smembers(key)
            return [str(x) for x in (raw or [])]
        except Exception as exc:
            self._on_op_error("smembers", exc)
            return await _fallback.smembers(key)

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

    async def geosearch(
        self,
        key: str,
        lng: float,
        lat: float,
        *,
        radius_m: float,
        count: int = 30,
    ) -> list[tuple[str, float]]:
        """Return [(member, distance_m), ...] nearest-first within radius_m."""
        r = await self._connect()
        if r is None:
            return await _fallback.geosearch(
                key, lng, lat, radius_m=radius_m, count=count
            )
        try:
            rows = await r.geosearch(
                key,
                longitude=float(lng),
                latitude=float(lat),
                radius=float(radius_m),
                unit="m",
                withdist=True,
                sort="ASC",
                count=max(1, int(count)),
            )
            out: list[tuple[str, float]] = []
            for row in rows or []:
                if isinstance(row, (list, tuple)) and len(row) >= 2:
                    out.append((str(row[0]), float(row[1])))
                else:
                    out.append((str(row), 0.0))
            return out
        except Exception as exc:
            self._on_op_error("geosearch", exc)
            return await _fallback.geosearch(
                key, lng, lat, radius_m=radius_m, count=count
            )


if REDIS_URL:
    store: _RedisStore | _MemStore = _RedisStore()
    logger.info(
        "redis_store: Redis mode (url=%s)",
        REDIS_URL[:20] + "…" if len(REDIS_URL) > 20 else REDIS_URL,
    )
else:
    store = _fallback
    logger.info("redis_store: in-memory fallback mode (set REDIS_URL for multi-instance)")


def get_redis():
    """Compatibility accessor used by places_service / server cache helpers.

    Returns the shared async ``store`` (Redis or in-memory fallback).
    Historically imported as ``get_redis``; without this alias, places L1
    Redis cache silently never writes and inflates keyspace misses.
    """
    return store
