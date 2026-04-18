"""Canonical Tier 1 trust / risk score helpers for users and drivers."""
from __future__ import annotations

from typing import Any


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return round(max(low, min(high, float(value))), 1)


def _safe_float(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def calculate_nexryde_score(user: dict | None, driver_profile: dict | None = None) -> float:
    """
    Weighted trust score:
    - ratings / service quality: 40%
    - punctuality / completion: 30%
    - verification: 20%
    - payment / behavior trust: 10%
    """
    user = user or {}
    driver_profile = driver_profile or {}

    rating = _safe_float(driver_profile.get("safety_rating", user.get("rating", 5.0)), 5.0)
    rating_component = _clamp((rating / 5.0) * 100.0)

    completion = _safe_float(driver_profile.get("completion_rate", 100.0), 100.0)
    cancellation_count = _safe_float(driver_profile.get("cancellation_count", 0.0), 0.0)
    punctuality_component = _clamp(completion - min(cancellation_count * 2.0, 20.0))

    verification_flags = [
        bool(user.get("is_verified")),
        bool(user.get("nin_verified") or driver_profile.get("nin_verified")),
        bool(user.get("face_verified") or driver_profile.get("selfie_verified")),
    ]
    verification_component = (sum(1 for x in verification_flags if x) / len(verification_flags)) * 100.0

    behavior = _safe_float(user.get("behavior_score", 100.0), 100.0)
    trust = _safe_float(user.get("trust_score", 100.0), 100.0)
    payment_component = _clamp((behavior * 0.6) + (trust * 0.4))

    score = (
        (rating_component * 0.40)
        + (punctuality_component * 0.30)
        + (verification_component * 0.20)
        + (payment_component * 0.10)
    )
    return _clamp(score)


def calculate_rider_risk_score(user: dict | None) -> float:
    """
    Risk score where higher = riskier.
    Uses current repo fields and stays additive/backward-compatible.
    """
    user = user or {}
    base = 15.0
    behavior_penalty = max(0.0, 100.0 - _safe_float(user.get("behavior_score", 100.0), 100.0)) * 0.35
    trust_penalty = max(0.0, 100.0 - _safe_float(user.get("trust_score", 100.0), 100.0)) * 0.25
    rating_penalty = max(0.0, 5.0 - _safe_float(user.get("rating", 5.0), 5.0)) * 12.0
    shield_flag_penalty = 15.0 if user.get("shield_rider_flag") else 0.0
    blocked_penalty = min(len(user.get("blocked_drivers") or []), 5) * 3.0
    verification_discount = -8.0 if user.get("is_verified") else 6.0

    return _clamp(
        base
        + behavior_penalty
        + trust_penalty
        + rating_penalty
        + shield_flag_penalty
        + blocked_penalty
        + verification_discount
    )


def calculate_driver_safety_score(user: dict | None, driver_profile: dict | None = None) -> float:
    user = user or {}
    driver_profile = driver_profile or {}

    rating = _safe_float(driver_profile.get("safety_rating", 5.0), 5.0)
    rating_component = (rating / 5.0) * 45.0
    completion_component = _clamp(driver_profile.get("completion_rate", 100.0)) * 0.25
    compliance_component = 20.0 if (
        driver_profile.get("nin_verified")
        and driver_profile.get("license_uploaded")
        and driver_profile.get("vehicle_docs_uploaded")
    ) else 8.0
    fatigue_penalty = 8.0 if driver_profile.get("fatigue_warning") else 0.0
    behavior_component = _clamp(_safe_float(user.get("behavior_score", 100.0), 100.0)) * 0.10

    return _clamp(rating_component + completion_component + compliance_component + behavior_component - fatigue_penalty)


def build_trust_summary(user: dict | None, driver_profile: dict | None = None) -> dict:
    user = user or {}
    driver_profile = driver_profile or {}
    role = str(user.get("role") or "rider")
    nexryde_score = calculate_nexryde_score(user, driver_profile)
    rider_risk_score = calculate_rider_risk_score(user)
    driver_safety_score = calculate_driver_safety_score(user, driver_profile) if role == "driver" else None
    rating_component = _clamp((_safe_float(driver_profile.get("safety_rating", user.get("rating", 5.0)), 5.0) / 5.0) * 100.0)
    completion = _safe_float(driver_profile.get("completion_rate", 100.0), 100.0)
    cancellation_count = _safe_float(driver_profile.get("cancellation_count", 0.0), 0.0)
    punctuality_component = _clamp(completion - min(cancellation_count * 2.0, 20.0))
    verification_flags = [
        bool(user.get("is_verified")),
        bool(user.get("nin_verified") or driver_profile.get("nin_verified")),
        bool(user.get("face_verified") or driver_profile.get("selfie_verified")),
    ]
    verification_component = _clamp((sum(1 for x in verification_flags if x) / len(verification_flags)) * 100.0)
    behavior = _safe_float(user.get("behavior_score", 100.0), 100.0)
    trust = _safe_float(user.get("trust_score", 100.0), 100.0)
    payment_component = _clamp((behavior * 0.6) + (trust * 0.4))

    if nexryde_score >= 92:
        tier = "elite"
        tier_label = "Elite"
    elif nexryde_score >= 84:
        tier = "gold"
        tier_label = "Gold"
    elif nexryde_score >= 72:
        tier = "silver"
        tier_label = "Silver"
    else:
        tier = "standard"
        tier_label = "Standard"

    common_perks = ["Priority matching"]
    if tier in {"gold", "elite"}:
        common_perks.append("Lower service fees")
    if role == "rider" and tier in {"gold", "elite"}:
        common_perks.append("Access to premium drivers")
    if role == "driver" and tier in {"gold", "elite"}:
        common_perks.append("Higher-value rider visibility")
    if tier == "elite":
        common_perks.append("Faster support routing")

    return {
        "user_id": user.get("id"),
        "role": role,
        "nexryde_score": nexryde_score,
        "rider_risk_score": rider_risk_score,
        "driver_safety_score": driver_safety_score,
        "score_tier": {
            "key": tier,
            "label": tier_label,
        },
        "score_breakdown": {
            "service_quality": rating_component,
            "punctuality": punctuality_component,
            "verification": verification_component,
            "payment_behavior": payment_component,
        },
        "unlocked_perks": common_perks,
        "priority_matching_enabled": tier in {"silver", "gold", "elite"},
        "lower_fee_eligible": tier in {"gold", "elite"},
        "premium_access_enabled": role == "rider" and tier in {"gold", "elite"},
        "verification_status": {
            "account_verified": bool(user.get("is_verified")),
            "face_verified": bool(user.get("face_verified")),
            "nin_verified": bool(user.get("nin_verified") or driver_profile.get("nin_verified")),
        },
    }
