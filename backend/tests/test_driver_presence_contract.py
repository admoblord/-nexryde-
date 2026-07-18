"""Driver presence / ghost-online contracts."""
from __future__ import annotations

import asyncio
import json

from routers.realtime_dispatch import _is_ws_ping


def test_ws_ping_accepts_plain_and_json():
    assert _is_ws_ping("ping")
    assert _is_ws_ping("PING")
    assert _is_ws_ping(json.dumps({"type": "ping"}))
    assert not _is_ws_ping(json.dumps({"type": "offer"}))
    assert not _is_ws_ping("hello")


def test_refresh_presence_does_not_invent_online(monkeypatch):
    import driver_presence as dp

    calls = {"set_online": 0, "get": 0}

    async def fake_get(_did):
        calls["get"] += 1
        return None

    async def fake_set_online(*_a, **_k):
        calls["set_online"] += 1

    monkeypatch.setattr(dp, "get_driver_presence", fake_get)
    monkeypatch.setattr(dp, "set_driver_online", fake_set_online)
    asyncio.run(dp.refresh_driver_presence("driver-1", lat=1.0, lng=2.0))
    assert calls["get"] == 1
    assert calls["set_online"] == 0


def test_refresh_presence_extends_when_already_online(monkeypatch):
    import driver_presence as dp

    calls = {"set_online": 0}

    async def fake_get(_did):
        return {"online": True, "lat": 9.0, "lng": 7.0}

    async def fake_set_online(driver_id, *, lat=0.0, lng=0.0):
        calls["set_online"] += 1
        calls["lat"] = lat
        calls["lng"] = lng

    monkeypatch.setattr(dp, "get_driver_presence", fake_get)
    monkeypatch.setattr(dp, "set_driver_online", fake_set_online)
    asyncio.run(dp.refresh_driver_presence("driver-1", lat=None, lng=None))
    assert calls["set_online"] == 1
    assert calls["lat"] == 9.0
    assert calls["lng"] == 7.0
