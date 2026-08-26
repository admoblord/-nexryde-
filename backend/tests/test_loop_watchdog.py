"""The watchdog has to name a blocked loop, because a blocked loop cannot log.

On 26 Aug the process answered a driver's home-screen burst in tens of
milliseconds and then stopped answering entirely. Cloud Run killed the instance
on liveness and every queued request 503'd after 30-100s, which riders saw as an
address search that hung with nothing in the application log.
"""
import asyncio
import time

import loop_watchdog


def test_a_blocked_loop_is_reported_with_the_running_task(monkeypatch, capsys):
    monkeypatch.setattr(loop_watchdog, "TICK_SECONDS", 0.05)
    monkeypatch.setattr(loop_watchdog, "LAG_WARN_SECONDS", 0.1)
    monkeypatch.setattr(loop_watchdog, "LAG_DUMP_SECONDS", 0.1)

    async def scenario():
        loop_watchdog.start_loop_watchdog()
        await asyncio.sleep(0.06)
        # Exactly the fault being hunted: synchronous work inside the loop.
        time.sleep(0.4)
        await asyncio.sleep(0.12)

    asyncio.run(scenario())

    out = capsys.readouterr().out
    assert "LOOP_BLOCKED" in out, "a blocked loop must announce itself on stdout"
    lag_line = next(line for line in out.splitlines() if "LOOP_BLOCKED" in line)
    reported_ms = int(lag_line.split("loop_lag_ms=")[1].split()[0])
    assert reported_ms >= 300, f"expected the ~400ms block to be reported, got {reported_ms}"
    assert "running=" in lag_line, "over the dump threshold the running tasks must be listed"


def test_a_healthy_loop_stays_quiet(monkeypatch, capsys):
    monkeypatch.setattr(loop_watchdog, "TICK_SECONDS", 0.05)
    monkeypatch.setattr(loop_watchdog, "LAG_WARN_SECONDS", 0.5)

    async def scenario():
        loop_watchdog.start_loop_watchdog()
        for _ in range(6):
            await asyncio.sleep(0.02)

    asyncio.run(scenario())

    assert "LOOP_BLOCKED" not in capsys.readouterr().out


def test_worst_lag_is_exposed_for_ops(monkeypatch):
    monkeypatch.setattr(loop_watchdog, "TICK_SECONDS", 0.05)
    monkeypatch.setattr(loop_watchdog, "LAG_WARN_SECONDS", 0.1)
    monkeypatch.setattr(loop_watchdog, "_worst_lag_ms", 0.0)

    async def scenario():
        loop_watchdog.start_loop_watchdog()
        await asyncio.sleep(0.06)
        time.sleep(0.3)
        await asyncio.sleep(0.12)

    asyncio.run(scenario())

    assert loop_watchdog.worst_loop_lag_ms() >= 200


def test_watchdog_is_started_before_any_other_startup_task():
    import pathlib

    src = (pathlib.Path(__file__).resolve().parent.parent / "server.py").read_text()
    start = src.index("async def seed_promo_codes")
    body = src[start : start + 1600]
    assert "start_loop_watchdog()" in body
    assert body.index("start_loop_watchdog()") < body.index("_deferred_startup()"), (
        "the watchdog must be running before startup work that could block the loop"
    )


def test_ops_health_exposes_loop_lag():
    import pathlib

    src = (pathlib.Path(__file__).resolve().parent.parent / "server.py").read_text()
    start = src.index('@api_router.get("/health/ops")')
    body = src[start : start + 1600]
    assert "worst_loop_lag_ms" in body
