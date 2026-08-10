"""The maintenance tick is what keeps timer work alive on a scale-to-zero deploy.

With minScale 0 there is no idle process, so guardians, saga retries, the outbox
drain and the post-trip safe-arrival escalation only happen because Cloud
Scheduler calls POST /api/ops/maintenance-tick. If the tick silently skipped a
step, or one failing subsystem aborted the rest, safety work would stop running
and nothing would say so.
"""
from __future__ import annotations

import pytest

from realtime_platform import maintenance


@pytest.fixture
def stub_steps(monkeypatch):
    """Replace every subsystem the tick calls, recording the order."""
    called: list[str] = []

    async def ok(name, value):
        called.append(name)
        return value

    import realtime_platform.outbox_worker as ow
    import realtime_platform.batched_matching as bm
    import realtime_platform.surge_stream as ss
    import realtime_platform.guardians_worker as gw

    monkeypatch.setattr(ow, "_drain_outbox", lambda limit=0: ok("outbox", 3), raising=False)
    monkeypatch.setattr(ow, "_retry_partial_sagas", lambda limit=0: ok("sagas", 2), raising=False)
    monkeypatch.setattr(bm, "flush_match_batch_if_due", lambda: ok("match", 1), raising=False)
    monkeypatch.setattr(ss, "tick_windows", lambda: ok("surge", None), raising=False)
    monkeypatch.setattr(gw, "run_all_guardians", lambda: ok("guardians", {"safe_arrival": {"escalated": 1}}), raising=False)
    return called


@pytest.mark.asyncio
async def test_tick_runs_every_subsystem(stub_steps):
    result = await maintenance.run_maintenance_tick()

    assert stub_steps == ["outbox", "sagas", "match", "surge", "guardians"]
    assert result["outbox_drained"] == 3
    assert result["sagas_retried"] == 2
    # Safe-arrival escalation must be reachable from the tick — it is the only
    # thing that chases a rider who never confirmed.
    assert result["guardians"]["safe_arrival"]["escalated"] == 1


@pytest.mark.asyncio
async def test_one_failing_subsystem_does_not_abort_the_tick(monkeypatch, stub_steps):
    """A broken outbox must not stop the guardians from running."""
    import realtime_platform.outbox_worker as ow

    async def boom(limit=0):
        raise RuntimeError("mongo blip")

    monkeypatch.setattr(ow, "_drain_outbox", boom, raising=False)

    result = await maintenance.run_maintenance_tick()

    assert result["outbox_drained"] == {"error": True}
    # Everything after the failure still ran.
    assert "guardians" in result and result["guardians"] != {"error": True}
    assert result["sagas_retried"] == 2


@pytest.mark.asyncio
async def test_worker_loop_and_scheduler_share_one_tick():
    """Both paths must do identical work, or scale-to-zero drifts from warm."""
    import inspect

    from workers import kafka_consumer_worker

    assert "run_maintenance_tick" in inspect.getsource(kafka_consumer_worker._redis_stream_loop)


def test_ops_endpoint_requires_the_ops_key():
    """Unauthenticated callers must get 404, not a free maintenance run."""
    import pathlib

    src = pathlib.Path(__file__).resolve().parent.parent / "server.py"
    text = src.read_text()
    start = text.index("/ops/maintenance-tick")
    body = text[start:start + 1800]
    assert "NEXRYDE_OPS_KEY" in body
    assert "x-nexryde-ops-key" in body
    assert "status_code=404" in body


def test_ops_endpoint_accepts_tick_in_background():
    """Scheduler must get a fast 200; the tick must not block the HTTP response.

    Inline ticks took 7–16s and kept the API p95 latency alert permanently open.
    """
    import pathlib

    src = pathlib.Path(__file__).resolve().parent.parent / "server.py"
    text = src.read_text()
    start = text.index("/ops/maintenance-tick")
    body = text[start:start + 1800]
    assert "asyncio.create_task" in body
    assert '"accepted": True' in body or "'accepted': True" in body
    # Tick may be awaited only inside the background task, never as the
    # endpoint's return path (`return {..., "tick": result}`).
    assert '"tick": result' not in body and "'tick': result" not in body
    assert "create_task(_run_tick())" in body
