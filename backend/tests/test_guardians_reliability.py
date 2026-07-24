"""Unit tests for guardians / recovery / dashboard (no Redis/Mongo required where mocked)."""
from __future__ import annotations

from realtime_platform.reliability_dashboard import prometheus_text, _rate


def test_rate_helpers():
    assert _rate(9, 1) == 0.9
    assert _rate(0, 0) == 1.0


def test_prometheus_text_shape():
    dash = {
        "ok": True,
        "board": {
            "driver_online_success_rate": 0.99,
            "ride_offer_success_rate": 0.995,
            "missed_ride_offers": 2,
            "redis_latency_ms": 4.2,
            "dlq_depth": 0,
            "outbox_pending": 1,
        },
    }
    text = prometheus_text(dash)
    assert "nexryde_rt_ok 1" in text
    assert "nexryde_rt_driver_online_success" in text
    assert "nexryde_rt_missed_offers 2" in text


def test_guardians_enabled_default(monkeypatch):
    from realtime_platform import guardians_worker as gw

    monkeypatch.delenv("NEXRYDE_GUARDIANS", raising=False)
    monkeypatch.setenv("NEXRYDE_REALTIME_PLATFORM", "true")
    assert gw._enabled() is True
    monkeypatch.setenv("NEXRYDE_GUARDIANS", "false")
    assert gw._enabled() is False


def test_recover_body_model():
    from realtime_platform.gateway import RecoverBody

    b = RecoverBody(lat=6.5, lng=3.3, resume_online=True)
    assert b.lat == 6.5
    assert b.resume_online is True
