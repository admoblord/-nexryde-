"""Unit tests for driver smart-surge inbox + push copy."""

from datetime import datetime
from unittest.mock import patch

from services.driver_surge_notifications import (
    _compose_notification,
    enrich_driver_surge_status,
    peak_window_wat,
)
from surge_pricing import SMART_SURGE_MULTIPLIER


def test_enrich_surge_active_message():
    heatmap = {"top_zone": "Lekki", "recommendation": "Head to Lekki"}
    with patch(
        "services.driver_surge_notifications.peak_window_wat",
        return_value=(True, "morning", "Morning surge (7–9 AM)"),
    ):
        out = enrich_driver_surge_status(
            {
                "multiplier": 1.3,
                "pct_extra": 30,
                "reasons": ["Morning surge (7–9 AM)"],
                "is_surge": True,
                "window_ends_label": "9:00 AM",
            },
            heatmap,
        )
    assert "1.3" in out["driver_message"] or "30%" in out["driver_message"]
    assert "Lekki" in out["driver_message"]
    assert out["heatmap"]["action_route"] == "/driver/heatmap"


def test_compose_surge_notification_variants():
    surge = {
        "multiplier": SMART_SURGE_MULTIPLIER,
        "pct_extra": 30,
        "reasons": ["Morning surge (7–9 AM)"],
        "tier": "low",
        "active_window": "Morning surge (7–9 AM)",
        "window_ends_label": "9:00 AM",
    }
    heatmap = {"top_zone": "Victoria Island", "city": "lagos"}
    with patch(
        "services.driver_surge_notifications.peak_window_wat",
        return_value=(True, "morning", "Morning surge (7–9 AM)"),
    ):
        title, message, ntype = _compose_notification(
            kind="surge_active", surge_status=surge, heatmap=heatmap, variant_seed=0
        )
    assert title
    assert "Victoria Island" in message
    assert "Heatmap" in message
    assert ntype in ("surge_active", "surge_elevated", "surge_high")


def test_peak_window_helper_returns_tuple():
    with patch(
        "services.driver_surge_notifications.active_smart_surge_window",
        return_value=(False, "", None),
    ):
        is_peak, kind, label = peak_window_wat()
    assert is_peak is False
    assert kind == ""
    assert label == ""

    with patch(
        "services.driver_surge_notifications.active_smart_surge_window",
        return_value=(
            True,
            "evening",
            {"label": "Evening surge (5–8 PM)", "multiplier": 1.3, "ends_label": "8:00 PM"},
        ),
    ):
        is_peak, kind, label = peak_window_wat()
    assert is_peak is True
    assert kind == "evening"
    assert "Evening" in label
