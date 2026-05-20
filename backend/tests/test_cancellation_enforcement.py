"""Unit tests for progressive cancellation enforcement helpers."""
from enforcement_system import (
    CANCELLATION_PENALTY_THRESHOLD,
    _action_bucket,
    _cancellation_penalty_summary,
    VIOLATION_CONFIG,
)


def test_cancellation_strikes_are_zero():
    assert VIOLATION_CONFIG["rider_cancellation"]["strikes"] == 0
    assert VIOLATION_CONFIG["driver_cancellation"]["strikes"] == 0


def test_threshold_is_seven():
    assert CANCELLATION_PENALTY_THRESHOLD == 7
    assert (
        VIOLATION_CONFIG["rider_cancellation"]["escalation"][7]["action"]
        == "cancellation_progressive"
    )


def test_penalty_summary_tiers():
    assert "1 hour" in _cancellation_penalty_summary("rider_cancellation", 1, 1)
    assert "24 hours" in _cancellation_penalty_summary("driver_cancellation", 2, 24)
    assert "7-day" in _cancellation_penalty_summary("rider_cancellation", 3, 168)


def test_action_bucket_long_suspend():
    bucket = _action_bucket(
        {"action": "suspended", "cancellation_penalty_tier": 3}
    )
    assert bucket == "suspended_long"
