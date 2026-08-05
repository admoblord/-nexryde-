"""One maintenance tick — everything that must happen on a timer, not a request.

This is the work the always-on worker loop performs: drain the realtime outbox,
retry sagas whose side effects failed, flush the matching batch, roll surge
windows, and run the guardians (including the safe-arrival escalation).

It lives here, separate from the worker, so the exact same tick can be driven
two ways:

  * the worker's own loop, when a warm instance is running
  * POST /api/ops/maintenance-tick, so Cloud Scheduler can drive it when
    services scale to zero

Without that second path, scaling to zero to save money silently stops the
post-trip safety check-in and saga retries — the timer work simply never runs
because nothing is alive to run it.

Every step is independently guarded: one failing subsystem must not stop the
rest of the tick.
"""
from __future__ import annotations

import logging
import time
from typing import Any

from realtime_platform.observability import incr, observe_ms

logger = logging.getLogger("realtime_platform.maintenance")


async def run_maintenance_tick(*, outbox_limit: int = 80, saga_limit: int = 40) -> dict[str, Any]:
    t0 = time.perf_counter()
    result: dict[str, Any] = {}

    async def _step(name: str, coro_fn) -> None:
        try:
            result[name] = await coro_fn()
        except Exception:
            result[name] = {"error": True}
            incr("maintenance.step_failed", step=name)
            logger.exception("maintenance step failed step=%s", name)

    from realtime_platform.outbox_worker import _drain_outbox, _retry_partial_sagas

    await _step("outbox_drained", lambda: _drain_outbox(limit=outbox_limit))
    await _step("sagas_retried", lambda: _retry_partial_sagas(limit=saga_limit))

    async def _match_batch():
        from realtime_platform.batched_matching import flush_match_batch_if_due

        return await flush_match_batch_if_due()

    async def _surge():
        from realtime_platform.surge_stream import tick_windows

        return await tick_windows()

    async def _guardians():
        from realtime_platform.guardians_worker import run_all_guardians

        return await run_all_guardians()

    await _step("match_batch", _match_batch)
    await _step("surge", _surge)
    await _step("guardians", _guardians)

    observe_ms("maintenance.tick_ms", (time.perf_counter() - t0) * 1000)
    incr("maintenance.tick")
    return result
