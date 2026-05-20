"""Unit tests for driver surge inbox copy."""

from services.driver_surge_notifications import (
    _compose_notification,
    enrich_driver_surge_status,
    peak_window_wat,
)


def test_enrich_surge_active_message():
    heatmap = {"top_zone": "Lekki", "recommendation": "Head to Lekki"}
    out = enrich_driver_surge_status(
        {"multiplier": 1.3, "pct_extra": 30, "reasons": ["High demand"], "is_surge": True},
        heatmap,
    )
    assert "1.3" in out["driver_message"] or "30%" in out["driver_message"]
    assert "Lekki" in out["driver_message"]
    assert out["heatmap"]["action_route"] == "/driver/heatmap"


def test_compose_surge_notification_variants():
    surge = {
        "multiplier": 1.4,
        "pct_extra": 40,
        "reasons": ["Rain", "High demand"],
        "tier": "moderate",
    }
    heatmap = {"top_zone": "Victoria Island", "city": "lagos"}
    title, message, ntype = _compose_notification(
        kind="surge_active", surge_status=surge, heatmap=heatmap, variant_seed=0
    )
    assert title
    assert "Victoria Island" in message
    assert "Heatmap" in message
    assert ntype in ("surge_active", "surge_elevated", "surge_high")


def test_peak_window_helper_returns_tuple():
    is_peak, kind, label = peak_window_wat()
    assert isinstance(is_peak, bool)
    assert isinstance(kind, str)
    assert isinstance(label, str)
