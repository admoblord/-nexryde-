"""Contract — unread badge moves from 30s poll to inbox WebSocket."""
from __future__ import annotations

import os
from pathlib import Path

import pytest

os.environ.setdefault("JWT_SECRET", "test-inbox-badge-secret")
os.environ.setdefault("ALLOW_INSECURE_JWT_FOR_TESTS", "1")
os.environ.setdefault("REDIS_REQUIRED", "false")

ROOT = Path(__file__).resolve().parents[2]
FE = ROOT / "frontend"
BE = ROOT / "backend"


def test_inbox_ws_route_registered():
    from routers.realtime_dispatch import realtime_dispatch_router

    paths = [getattr(r, "path", "") for r in realtime_dispatch_router.routes]
    assert "/api/ws/user/{user_id}/inbox" in paths


def test_publish_notification_badge_exported():
    from routers.realtime_dispatch import publish_notification_badge

    assert callable(publish_notification_badge)


def test_frontend_layouts_use_inbox_socket_not_30s_poll():
    rider = (FE / "app/(rider-tabs)/_layout.tsx").read_text(encoding="utf-8")
    driver = (FE / "app/(driver-tabs)/_layout.tsx").read_text(encoding="utf-8")
    live = (FE / "src/components/DriverLiveMapView.tsx").read_text(encoding="utf-8")
    inbox = (FE / "src/services/inboxSocket.ts").read_text(encoding="utf-8")

    assert "inboxSocket" in rider and "subscribeBadge" in rider
    assert "setForegroundInterval" not in rider
    assert "setInterval(fetchUnread, 30000)" not in driver
    assert "inboxSocket" in driver and "subscribeBadge" in driver
    assert "inboxSocket" in live and "subscribeBadge" in live
    assert "setForegroundInterval" not in live
    assert "/api/ws/user/" in inbox
    assert "notification_badge" in inbox


def test_badge_publish_skips_trip_poll_cache():
    src = (BE / "routers/realtime_dispatch.py").read_text(encoding="utf-8")
    assert "cache_for_poll=False" in src
    assert "async def publish_notification_badge" in src


@pytest.mark.asyncio
async def test_publish_badge_does_not_overwrite_poll_cache(monkeypatch):
    from routers import realtime_dispatch as rd
    import database as database_mod

    monkeypatch.setattr(rd, "_poll_cache_local", {"u1": {"type": "trip_update", "trip_id": "keep"}})

    async def _no_redis(*_a, **_k):
        return False

    delivered = []

    async def _deliver(user_id, message):
        delivered.append((user_id, message))
        return 1

    monkeypatch.setattr(rd, "_redis_publish", _no_redis)
    monkeypatch.setattr(rd.user_inbox_hub, "_deliver_locally", _deliver)

    class _FakeNotif:
        async def count_documents(self, q):
            if q.get("category"):
                return 1
            return 2

    class _FakeDb:
        notifications = _FakeNotif()

    monkeypatch.setattr(database_mod, "db", _FakeDb())

    sent = await rd.publish_notification_badge("u1")
    assert sent == 1
    assert delivered and delivered[0][1]["type"] == "notification_badge"
    assert delivered[0][1]["unread_count"] == 2
    assert delivered[0][1]["unread_count_excl_engagement"] == 1
    assert rd._poll_cache_local["u1"]["trip_id"] == "keep"
