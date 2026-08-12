"""Event-loop stall watchdog.

Cloud Run kills an instance when the liveness probe misses three times in a row.
When that happens because the loop is blocked, every in-flight request dies with
a 503 and the logs show nothing about the culprit. This watchdog runs on its own
OS thread, so a blocked loop cannot silence it: it dumps every thread stack once
per stall, which points straight at the blocking frame.

Enable with NEXRYDE_LOOP_WATCHDOG=1 (NEXRYDE_LOOP_STALL_MS tunes the threshold).
"""
from __future__ import annotations

import asyncio
import logging
import os
import sys
import threading
import time
import traceback
from typing import Optional

logger = logging.getLogger("nexryde.loop_watchdog")

_thread: Optional[threading.Thread] = None
_stop = threading.Event()


def _enabled() -> bool:
    return (os.environ.get("NEXRYDE_LOOP_WATCHDOG") or "").strip().lower() in ("1", "true", "on", "yes")


def _stall_threshold_sec() -> float:
    try:
        return max(1.0, float(os.environ.get("NEXRYDE_LOOP_STALL_MS", "5000")) / 1000.0)
    except (TypeError, ValueError):
        return 5.0


def _emit(text: str) -> None:
    # Straight to stderr: a stalled loop is exactly when logging handlers are
    # least trustworthy, and Cloud Run captures stderr regardless of log config.
    print(text, file=sys.stderr, flush=True)


def _dump_stacks(stalled_for: float) -> None:
    lines = [f"LOOP STALL: event loop blocked for {stalled_for:.1f}s — thread dump follows"]
    frames = sys._current_frames()
    for thread in threading.enumerate():
        frame = frames.get(thread.ident)
        if frame is None:
            continue
        lines.append(f"--- thread {thread.name} (daemon={thread.daemon}) ---")
        lines.extend(x.rstrip() for x in traceback.format_stack(frame))
    _emit("\n".join(lines))


def _watch(loop: asyncio.AbstractEventLoop) -> None:
    threshold = _stall_threshold_sec()
    # Written by the loop, read by this thread: a plain float is enough because a
    # torn read would only delay a dump by one tick.
    state = {"beat": time.monotonic()}

    def _beat() -> None:
        state["beat"] = time.monotonic()

    def _schedule_beat() -> None:
        try:
            loop.call_soon_threadsafe(_beat)
        except RuntimeError:
            pass

    dumped_for_current_stall = False
    while not _stop.is_set():
        _schedule_beat()
        _stop.wait(1.0)
        stalled_for = time.monotonic() - state["beat"]
        if stalled_for >= threshold:
            if not dumped_for_current_stall:
                _dump_stacks(stalled_for)
                dumped_for_current_stall = True
        elif dumped_for_current_stall:
            _emit(f"LOOP STALL: recovered after {stalled_for:.1f}s")
            dumped_for_current_stall = False


def start_loop_watchdog() -> None:
    global _thread
    if not _enabled():
        return
    if _thread and _thread.is_alive():
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        logger.warning("loop watchdog needs a running loop")
        return
    _stop.clear()
    _thread = threading.Thread(
        target=_watch, args=(loop,), name="nexryde-loop-watchdog", daemon=True
    )
    _thread.start()
    _emit(f"loop watchdog started threshold={_stall_threshold_sec():.1f}s")


def stop_loop_watchdog() -> None:
    global _thread
    _stop.set()
    _thread = None
