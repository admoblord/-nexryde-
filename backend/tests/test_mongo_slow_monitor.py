"""Slow-mongo listener logs only slow/failed user commands."""
from __future__ import annotations

from types import SimpleNamespace

from mongo_slow_monitor import SLOW_METRIC, SlowMongoListener


def _ok(name: str, ms: float, db: str = "nexryde_db"):
    return SimpleNamespace(
        command_name=name,
        database_name=db,
        duration_micros=int(ms * 1000),
    )


def test_started_is_noop():
    listener = SlowMongoListener(slow_ms=200)
    listener.started(SimpleNamespace(command_name="find"))
    assert listener.snapshot()["commands_total"] == 0


def test_event_without_database_name(monkeypatch):
    seen: list[tuple] = []

    def _observe(metric, ms, **tags):
        seen.append((metric, ms, tags))

    import realtime_platform.observability as obs

    monkeypatch.setattr(obs, "observe_ms", _observe)
    listener = SlowMongoListener(slow_ms=200)
    listener.succeeded(SimpleNamespace(command_name="update", duration_micros=250_000))
    assert listener.snapshot()["commands_slow"] == 1
    assert seen[0][2]["ns"] == ""


def test_skips_heartbeats_and_fast_finds():
    listener = SlowMongoListener(slow_ms=200)
    listener.succeeded(_ok("hello", 5))
    listener.succeeded(_ok("ping", 3))
    listener.succeeded(_ok("find", 12))
    snap = listener.snapshot()
    assert snap["commands_total"] == 1
    assert snap["commands_slow"] == 0
    assert snap["latency_ms"]["max"] == 12


def test_records_slow_and_failed(monkeypatch):
    seen: list[tuple] = []

    def _observe(metric, ms, **tags):
        seen.append((metric, ms, tags))

    import realtime_platform.observability as obs

    monkeypatch.setattr(obs, "observe_ms", _observe)

    listener = SlowMongoListener(slow_ms=200)
    listener.succeeded(_ok("update", 250))
    listener.failed(_ok("find", 40))
    listener.failed(_ok("update", 400))
    snap = listener.snapshot()
    assert snap["commands_total"] == 3
    assert snap["commands_slow"] == 2
    assert snap["commands_failed"] == 2
    assert [m for m, _, _ in seen] == [SLOW_METRIC, SLOW_METRIC]
    assert seen[0][2]["command"] == "update"
    assert seen[1][2]["failed"] == "1"
    assert seen[1][1] == 400


def test_skips_index_admin_commands():
    listener = SlowMongoListener(slow_ms=200)
    listener.succeeded(_ok("createIndexes", 12))
    listener.failed(_ok("dropIndexes", 8))
    assert listener.snapshot()["commands_total"] == 0


def test_performance_payload_includes_mongo():
    from realtime_platform.gateway import _mongo_performance_payload
    from realtime_platform.observability import reset_for_tests

    reset_for_tests()
    body = _mongo_performance_payload()
    assert "mongo" in body
    assert "commands_total" in body["mongo"]
    assert "mongo.command_ms" in body
    assert "success_criteria" in body


def test_performance_endpoint_requires_auth():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from realtime_platform.gateway import realtime_gateway_router

    app = FastAPI()
    app.include_router(realtime_gateway_router)
    client = TestClient(app)
    res = client.get("/api/realtime/performance")
    assert res.status_code == 401
