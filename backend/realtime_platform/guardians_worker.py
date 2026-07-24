"""Guardians worker — always-on reliability loop (API or kafka-worker).

Enable: NEXRYDE_GUARDIANS=true (default on when realtime platform enabled).
Ticks every NEXRYDE_GUARDIAN_INTERVAL_SEC (default 20).
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Optional

logger = logging.getLogger("realtime_platform.guardians_worker")

_task: Optional[asyncio.Task] = None


def _enabled() -> bool:
    raw = (os.environ.get("NEXRYDE_GUARDIANS") or "").strip().lower()
    if raw in ("0", "false", "off", "no"):
        return False
    if raw in ("1", "true", "on", "yes"):
        return True
    return (os.environ.get("NEXRYDE_REALTIME_PLATFORM") or "true").lower() != "false"


def _interval() -> float:
    try:
        return max(5.0, float(os.environ.get("NEXRYDE_GUARDIAN_INTERVAL_SEC", "20")))
    except (TypeError, ValueError):
        return 20.0


async def run_all_guardians() -> dict:
    from realtime_platform.dispatch_guardian import run_dispatch_guardian
    from realtime_platform.health_manager import run_health_cycle
    from realtime_platform.trip_guardian import run_trip_guardian

    health = await run_health_cycle()
    dispatch = await run_dispatch_guardian()
    trip = await run_trip_guardian()
    return {"health": health, "dispatch": dispatch, "trip": trip}


async def _loop() -> None:
    await asyncio.sleep(12)
    while True:
        try:
            result = await run_all_guardians()
            logger.info(
                "guardians tick health_healed=%s dispatch_retried=%s trip_locks=%s",
                (result.get("health") or {}).get("zombies", {}).get("healed"),
                (result.get("dispatch") or {}).get("retried"),
                (result.get("trip") or {}).get("orphan_locks_cleared"),
            )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("guardians worker iteration failed")
        await asyncio.sleep(_interval())


def start_guardians_worker() -> None:
    global _task
    if not _enabled():
        logger.info("guardians worker disabled")
        return
    if _task and not _task.done():
        return
    _task = asyncio.create_task(_loop(), name="nexryde-guardians")
    logger.info("guardians worker started interval=%ss", _interval())


async def stop_guardians_worker() -> None:
    global _task
    if _task and not _task.done():
        _task.cancel()
        try:
            await _task
        except asyncio.CancelledError:
            pass
    _task = None
