"""The hub listener must never busy-spin.

`pubsub.listen()` returns immediately while no channel is subscribed. Iterating
it in a `while True` therefore produced a tight loop with no await point, which
starved the event loop: requests stopped being scheduled, Cloud Run's liveness
probe missed three times, and the instance was killed mid-request. Riders saw
that as slow tabs, "Near your location" pickups and "Search unavailable".
"""
from __future__ import annotations

import asyncio

import pytest


class _FakePubSub:
    """Mimics redis.asyncio PubSub: no subscriptions -> nothing to read."""

    def __init__(self) -> None:
        self.channels: set[str] = set()
        self.get_message_calls = 0

    @property
    def subscribed(self) -> bool:
        return bool(self.channels)

    async def subscribe(self, channel: str) -> None:
        self.channels.add(channel)

    async def unsubscribe(self, channel: str) -> None:
        self.channels.discard(channel)

    async def get_message(self, ignore_subscribe_messages: bool = False, timeout: float = 0.0):
        self.get_message_calls += 1
        await asyncio.sleep(min(timeout or 0.01, 0.05))
        return None


@pytest.mark.asyncio
async def test_listener_idles_instead_of_spinning_when_unsubscribed(monkeypatch):
    from routers import realtime_dispatch as rd

    hub = rd._UserSocketHub("spin_test")  # noqa: SLF001 — exercising internals on purpose
    fake = _FakePubSub()
    hub._pubsub = fake  # noqa: SLF001

    iterations = 0
    original_sleep = asyncio.sleep

    async def counting_sleep(delay, *a, **kw):
        nonlocal iterations
        iterations += 1
        return await original_sleep(min(delay, 0.01), *a, **kw)

    monkeypatch.setattr(rd.asyncio, "sleep", counting_sleep)

    task = asyncio.create_task(hub._listen_loop())  # noqa: SLF001
    await original_sleep(0.3)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

    # The old code hit millions of iterations here because nothing awaited.
    assert iterations < 200, f"listener is busy-spinning while idle ({iterations} iterations)"


@pytest.mark.asyncio
async def test_ensure_channel_completes_while_listener_runs(monkeypatch):
    """A socket connect / session heal must not block behind the listener."""
    from routers import realtime_dispatch as rd

    monkeypatch.setattr(rd, "REDIS_URL", "redis://fake:6379", raising=False)
    hub = rd._UserSocketHub("subscribe_test")  # noqa: SLF001
    fake = _FakePubSub()
    hub._pubsub = fake  # noqa: SLF001

    task = asyncio.create_task(hub._listen_loop())  # noqa: SLF001
    try:
        await asyncio.wait_for(hub._ensure_channel("user-1"), timeout=5)  # noqa: SLF001
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    assert "ws:subscribe_test:user-1" in fake.channels
