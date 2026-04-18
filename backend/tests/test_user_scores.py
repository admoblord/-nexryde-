"""Unit tests for Tier 1 trust / risk score helpers."""

from user_scores import (
    build_trust_summary,
    calculate_driver_safety_score,
    calculate_nexryde_score,
    calculate_rider_risk_score,
)


def test_nexryde_score_rewards_verified_consistent_user():
    user = {
        "role": "rider",
        "rating": 4.9,
        "behavior_score": 97,
        "trust_score": 95,
        "is_verified": True,
        "nin_verified": True,
        "face_verified": True,
    }
    score = calculate_nexryde_score(user)
    assert 90 <= score <= 100


def test_rider_risk_score_penalizes_flags_and_low_scores():
    user = {
        "rating": 3.2,
        "behavior_score": 55,
        "trust_score": 60,
        "shield_rider_flag": True,
        "blocked_drivers": ["d1", "d2"],
        "is_verified": False,
    }
    risk = calculate_rider_risk_score(user)
    assert risk > 40


def test_driver_safety_score_uses_profile_and_compliance():
    user = {"behavior_score": 92}
    driver_profile = {
        "safety_rating": 4.8,
        "completion_rate": 96,
        "nin_verified": True,
        "license_uploaded": True,
        "vehicle_docs_uploaded": True,
        "fatigue_warning": False,
    }
    score = calculate_driver_safety_score(user, driver_profile)
    assert score >= 85


def test_build_trust_summary_for_driver_includes_driver_score():
    user = {
        "id": "u1",
        "role": "driver",
        "rating": 4.7,
        "behavior_score": 90,
        "trust_score": 88,
        "is_verified": True,
    }
    driver_profile = {
        "safety_rating": 4.6,
        "completion_rate": 94,
        "nin_verified": True,
        "license_uploaded": True,
        "vehicle_docs_uploaded": True,
    }
    summary = build_trust_summary(user, driver_profile)
    assert summary["user_id"] == "u1"
    assert summary["driver_safety_score"] is not None
    assert 0 <= summary["rider_risk_score"] <= 100
