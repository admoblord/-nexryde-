"""Zone traffic multipliers from our own completed trips (zero Google cost)."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

logger = logging.getLogger("traffic_factor")

DEFAULT_FACTOR = 1.0
WINDOW_MIN = 30
MIN_SAMPLES = 5


def _zone_key(lat: float, lng: float) -> str:
    # ~1.1km cells — coarse Lagos work-zone grain
    return f"{round(lat, 2)},{round(lng, 2)}"


async def get_zone_traffic_factor(lat: Optional[float], lng: Optional[float]) -> float:
    if lat is None or lng is None:
        return DEFAULT_FACTOR
    key = f"traffic:factor:{_zone_key(float(lat), float(lng))}"
    try:
        from redis_store import store

        raw = await store.get(key)
        if raw is not None:
            return max(0.7, min(2.5, float(raw)))
    except Exception:
        pass
    return DEFAULT_FACTOR


async def record_trip_duration_sample(
    *,
    pickup_lat: float,
    pickup_lng: float,
    quoted_duration_s: float,
    actual_duration_s: float,
) -> None:
    """Call on trip complete — updates rolling zone multiplier."""
    if quoted_duration_s <= 30 or actual_duration_s <= 30:
        return
    ratio = actual_duration_s / quoted_duration_s
    ratio = max(0.7, min(2.5, ratio))
    zone = _zone_key(pickup_lat, pickup_lng)
    try:
        from redis_store import store
        import json

        list_key = f"traffic:samples:{zone}"
        raw = await store.get(list_key)
        samples = json.loads(raw) if raw else []
        if not isinstance(samples, list):
            samples = []
        now = datetime.now(timezone.utc).isoformat()
        samples.append({"r": round(ratio, 3), "at": now})
        # keep ~ last 40
        samples = samples[-40:]
        await store.set(list_key, json.dumps(samples), ttl=3600)
        # average last 30 minutes
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=WINDOW_MIN)
        recent = []
        for s in samples:
            try:
                ts = datetime.fromisoformat(str(s["at"]).replace("Z", "+00:00"))
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=timezone.utc)
                if ts >= cutoff:
                    recent.append(float(s["r"]))
            except Exception:
                continue
        if len(recent) >= MIN_SAMPLES:
            avg = sum(recent) / len(recent)
            await store.set(f"traffic:factor:{zone}", str(round(avg, 3)), ttl=3600)
    except Exception:
        logger.debug("traffic sample failed", exc_info=True)
