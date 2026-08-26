"""Name whatever blocks the event loop, before Cloud Run kills the instance.

On 26 Aug the service answered a driver's home-screen burst in 15-51ms and then
went silent. Cloud Run's liveness probe timed out three times and shut the
instance down; every queued request 503'd after 30-100s, and riders saw an
address search hang with nothing in the application log. There was nothing to
find, because a blocked loop cannot log — it is not running.

This watchdog is one task that expects to be woken every second. If the wake is
late, the loop was busy, and the culprit is whichever coroutine was executing.
Late wakes are reported with the stack of every running task, so the next wedge
arrives with a name attached instead of silence.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
import traceback

logger = logging.getLogger(__name__)

TICK_SECONDS = 1.0

# A healthy loop is late by microseconds. A second of lateness already means a
# request waited behind something synchronous; the probes tolerate 5s, so warn
# well below that.
LAG_WARN_SECONDS = float(os.environ.get("NEXRYDE_LOOP_LAG_WARN_S", "1.0"))

# Dumping every task's stack is not free, so only do it once the loop is late
# enough that we are heading for a probe failure.
LAG_DUMP_SECONDS = float(os.environ.get("NEXRYDE_LOOP_LAG_DUMP_S", "3.0"))

_STACK_FRAMES = 8
_MAX_TASKS_REPORTED = 6

_watchdog_task: "asyncio.Task | None" = None
_worst_lag_ms = 0.0


def worst_loop_lag_ms() -> float:
    """Largest lateness seen since boot, for /api/health/ops."""
    return round(_worst_lag_ms, 1)


def _describe_running_tasks() -> str:
    """Where each task is parked, so a blocking call is identifiable."""
    lines: list[str] = []
    try:
        tasks = [t for t in asyncio.all_tasks() if not t.done()]
    except RuntimeError:
        return "no running loop"

    current = asyncio.current_task()
    for task in tasks[:_MAX_TASKS_REPORTED]:
        if task is current:
            continue
        name = task.get_name()
        coro = task.get_coro()
        where = getattr(coro, "__qualname__", None) or repr(coro)
        frames = ""
        try:
            stack = task.get_stack(limit=_STACK_FRAMES)
            if stack:
                frames = " | ".join(
                    f"{os.path.basename(f.f_code.co_filename)}:{f.f_lineno}:{f.f_code.co_name}"
                    for f in stack
                )
        except Exception:
            frames = "stack unavailable"
        lines.append(f"task={name} coro={where} at[{frames}]")
    return " ;; ".join(lines) or "no other tasks"


async def _watch() -> None:
    global _worst_lag_ms
    loop = asyncio.get_running_loop()
    while True:
        before = loop.time()
        await asyncio.sleep(TICK_SECONDS)
        lag = loop.time() - before - TICK_SECONDS
        if lag <= 0:
            continue
        lag_ms = lag * 1000.0
        if lag_ms > _worst_lag_ms:
            _worst_lag_ms = lag_ms
        if lag < LAG_WARN_SECONDS:
            continue
        # print() as well as logger: a wedge often ends with the instance being
        # shut down, and stdout is flushed straight to Cloud Logging.
        message = (
            f"loop_lag_ms={int(lag_ms)} revision={os.environ.get('K_REVISION', 'unknown')} "
            f"threshold_ms={int(LAG_WARN_SECONDS * 1000)}"
        )
        if lag >= LAG_DUMP_SECONDS:
            message = f"{message} running={_describe_running_tasks()}"
        print(f"LOOP_BLOCKED {message}", flush=True)
        logger.error("LOOP_BLOCKED %s", message)


def start_loop_watchdog() -> None:
    """Idempotent; safe to call from startup."""
    global _watchdog_task
    if os.environ.get("NEXRYDE_LOOP_WATCHDOG", "1") not in ("1", "true", "True"):
        return
    if _watchdog_task is not None and not _watchdog_task.done():
        return
    try:
        _watchdog_task = asyncio.get_running_loop().create_task(
            _watch(), name="nexryde-loop-watchdog"
        )
    except RuntimeError:
        logger.warning("loop watchdog not started: no running event loop")


def install_slow_callback_reporting(threshold_seconds: float = 0.5) -> None:
    """Ask asyncio itself to complain about long callbacks.

    asyncio only reports these in debug mode, and debug mode also enables
    expensive bookkeeping, so this stays opt-in via NEXRYDE_LOOP_DEBUG=1 for
    reproducing a wedge rather than for normal production traffic.
    """
    if os.environ.get("NEXRYDE_LOOP_DEBUG", "0") not in ("1", "true", "True"):
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    loop.set_debug(True)
    loop.slow_callback_duration = threshold_seconds
    logger.warning(
        "asyncio debug mode on: callbacks over %.0fms will be reported (has overhead)",
        threshold_seconds * 1000,
    )


def blocking_call_report(exc: BaseException) -> str:
    """Formatted traceback for a blocking call caught elsewhere."""
    return "".join(traceback.format_exception_only(type(exc), exc)).strip() or str(exc)


def now_ms() -> int:
    return int(time.monotonic() * 1000)
