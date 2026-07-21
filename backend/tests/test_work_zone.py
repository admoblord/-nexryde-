"""Work Zone unit tests — no Mongo/Redis required (mocked where async)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from work_zone_areas import (
    WORK_ZONE_AREAS,
    build_zone_label,
    point_in_zone,
    validate_area_selection,
)
from work_zone_config import work_zone_public_config
from work_zone_service import (
    build_zone_label_from_places,
    driver_work_zone_allows_trip,
    normalize_work_zone_places,
    normalize_profile_work_zone,
    point_in_work_zone_places,
)


def _loc(area_id: str) -> dict:
    a = WORK_ZONE_AREAS[area_id]
    return {"lat": a.centroid_lat, "lng": a.centroid_lng}


# ── Area selection ────────────────────────────────────────────────────────────


def test_validate_adjacent_corridor_ok():
    ok, msg = validate_area_selection(["victoria_island", "lekki_phase_1", "lekki_phase_2"])
    assert ok is True
    assert msg == "ok"


def test_validate_non_adjacent_rejected():
    ok, msg = validate_area_selection(["victoria_island", "ikeja"])
    assert ok is False
    assert "adjacent" in msg.lower()


def test_validate_max_four_areas():
    ok, _ = validate_area_selection(
        ["victoria_island", "ikoyi", "lekki_phase_1", "lekki_phase_2", "ajah"]
    )
    assert ok is False


def test_build_zone_label():
    label = build_zone_label(["victoria_island", "lekki_phase_1", "lekki_phase_2"])
    assert "Victoria Island" in label
    assert "Lekki" in label


def test_normalize_google_places_zones():
    zones = normalize_work_zone_places([
        {
            "place_id": "abc123",
            "label": "Sangotedo",
            "address": "Sangotedo, Lagos, Nigeria",
            "lat": 6.4698,
            "lng": 3.6389,
            "radius_m": 7000,
        }
    ])
    assert zones[0]["place_id"] == "abc123"
    assert zones[0]["label"] == "Sangotedo"
    assert zones[0]["radius_m"] == 7000


def test_place_zone_radius_matching():
    zones = normalize_work_zone_places([
        {"label": "Lekki Phase 1", "lat": 6.4474, "lng": 3.4723, "radius_m": 5000}
    ])
    assert point_in_work_zone_places(6.4478, 3.4729, zones) is True
    assert point_in_work_zone_places(6.6018, 3.3515, zones) is False


def test_build_place_zone_label():
    label = build_zone_label_from_places([
        {"label": "Lekki Phase 1"},
        {"label": "Sangotedo"},
        {"label": "Ikeja GRA"},
    ])
    assert label == "Lekki Phase 1 · Sangotedo +1"


# ── Dispatch filter ─────────────────────────────────────────────────────────


@pytest.fixture
def zoned_profile():
    return {
        "work_zone_active": True,
        "work_zone_area_ids": ["victoria_island", "lekki_phase_1", "lekki_phase_2"],
    }


@pytest.fixture
def flexible_zoned_profile():
    return {
        "work_zone_active": True,
        "work_zone_zones": [
            {"label": "Lekki Phase 1", "lat": 6.4474, "lng": 3.4723, "radius_m": 5000}
        ],
    }


def test_both_endpoints_inside_zone_eligible(zoned_profile):
    trip = {"pickup_location": _loc("victoria_island"), "dropoff_location": _loc("lekki_phase_1")}
    allowed, meta = driver_work_zone_allows_trip(zoned_profile, trip)
    assert allowed is True
    assert meta["pickup_in"] is True
    assert meta["dropoff_in"] is True


def test_cross_zone_vi_to_ikeja_skipped(zoned_profile):
    trip = {"pickup_location": _loc("victoria_island"), "dropoff_location": _loc("ikeja")}
    allowed, meta = driver_work_zone_allows_trip(zoned_profile, trip)
    assert allowed is False
    assert meta["pickup_in"] is True
    assert meta["dropoff_in"] is False


def test_non_zoned_driver_passes_through():
    trip = {"pickup_location": _loc("victoria_island"), "dropoff_location": _loc("ikeja")}
    allowed, meta = driver_work_zone_allows_trip({"work_zone_active": False}, trip)
    assert allowed is True
    assert meta.get("work_zone_filter") is False


def test_flexible_zone_pickup_inside_eligible(flexible_zoned_profile):
    trip = {
        "pickup_location": {"lat": 6.448, "lng": 3.473},
        "dropoff_location": {"lat": 6.6018, "lng": 3.3515},
    }
    allowed, meta = driver_work_zone_allows_trip(flexible_zoned_profile, trip)
    assert allowed is True
    assert meta["matching_mode"] == "radius_geofence"
    assert meta["pickup_in"] is True
    assert meta["dropoff_in"] is False


def test_flexible_zone_pickup_outside_skipped(flexible_zoned_profile):
    trip = {
        "pickup_location": {"lat": 6.6018, "lng": 3.3515},
        "dropoff_location": {"lat": 6.448, "lng": 3.473},
    }
    allowed, meta = driver_work_zone_allows_trip(flexible_zoned_profile, trip)
    assert allowed is False
    assert meta["pickup_in"] is False
    assert meta["dropoff_in"] is True


def test_point_in_zone_bbox():
    vi = WORK_ZONE_AREAS["victoria_island"]
    inside = point_in_zone(vi.centroid_lat, vi.centroid_lng, {"victoria_island"})
    outside = point_in_zone(_loc("ikeja")["lat"], _loc("ikeja")["lng"], {"victoria_island"})
    assert inside is True
    assert outside is False


# ── Expiry ───────────────────────────────────────────────────────────────────


def test_expired_zone_cleared_on_read():
    past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    profile = {
        "work_zone_active": True,
        "work_zone_area_ids": ["victoria_island"],
        "work_zone_expires_at": past,
    }
    normalized = normalize_profile_work_zone(profile)
    assert normalized["work_zone_active"] is False


def test_active_zone_not_expired():
    future = (datetime.now(timezone.utc) + timedelta(hours=5)).isoformat()
    profile = {
        "work_zone_active": True,
        "work_zone_area_ids": ["victoria_island"],
        "work_zone_expires_at": future,
    }
    normalized = normalize_profile_work_zone(profile)
    assert normalized["work_zone_active"] is True


# ── Config ───────────────────────────────────────────────────────────────────


def test_public_config_included_with_subscription():
    cfg = work_zone_public_config()
    assert cfg["included_with_subscription"] is True
    assert cfg["no_additional_fee"] is True
    assert "Included with your NEXRYDE driver plan" in cfg["copy"]["subtitle"]
    assert "free" not in cfg
    assert "monthly_price" not in cfg
    assert "daily_price" not in cfg


# ── Guardrails (mocked DB) ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_guardrail_never_blocks_when_too_few_online():
    from work_zone_service import check_activation_guardrails

    with patch("work_zone_service._count_online_in_areas", new=AsyncMock(return_value=2)):
        ok, msg = await check_activation_guardrails("u1", ["victoria_island"])
    assert ok is True
    assert msg == "ok"


@pytest.mark.asyncio
async def test_guardrail_never_blocks_when_share_cap_full():
    from work_zone_service import check_activation_guardrails

    with (
        patch("work_zone_service._count_online_in_areas", new=AsyncMock(return_value=10)),
        patch("work_zone_service._count_zoned_online_in_areas", new=AsyncMock(return_value=4)),
    ):
        ok, msg = await check_activation_guardrails("u1", ["victoria_island"])
    assert ok is True
    assert msg == "ok"


@pytest.mark.asyncio
async def test_guardrail_founding_driver_bypasses_share_cap():
    from work_zone_service import check_activation_guardrails

    with (
        patch("work_zone_service._count_online_in_areas", new=AsyncMock(return_value=10)),
        patch("work_zone_service._count_zoned_online_in_areas", new=AsyncMock(return_value=5)),
    ):
        ok, msg = await check_activation_guardrails(
            "u1", ["victoria_island"], bypass_share_cap=True
        )
    assert ok is True


@pytest.mark.asyncio
async def test_entitlement_includes_active_trial_and_grace():
    from work_zone_service import resolve_work_zone_entitlement

    with patch("driver_trial_policy.resolve_driver_plan_entitlement", new=AsyncMock()) as mock_plan:
        mock_plan.return_value = {"entitled": False, "plan_status": "inactive", "trial_active": False}
        entitled, status = await resolve_work_zone_entitlement("u1")
        assert entitled is False
        assert status == "inactive"

        mock_plan.return_value = {"entitled": True, "plan_status": "active", "trial_active": False}
        entitled, status = await resolve_work_zone_entitlement("u1")
        assert entitled is True
        assert status == "active"

        mock_plan.return_value = {"entitled": True, "plan_status": "grace_period", "trial_active": False}
        entitled, status = await resolve_work_zone_entitlement("u1")
        assert entitled is True
        assert status == "grace_period"

        mock_plan.return_value = {"entitled": True, "plan_status": "trial", "trial_active": True}
        entitled, status = await resolve_work_zone_entitlement("u1")
        assert entitled is True
        assert status == "trial"

        mock_plan.return_value = {"entitled": False, "plan_status": "inactive", "trial_active": False}
        entitled, status = await resolve_work_zone_entitlement("u1")
        assert entitled is False
        assert status == "inactive"


@pytest.mark.asyncio
async def test_resolve_driver_plan_entitlement_auto_trial_and_live_trial():
    from driver_trial_policy import resolve_driver_plan_entitlement

    fake_payments = MagicMock()
    fake_payments._ensure_auto_trial_for_verified_driver = AsyncMock(
        return_value={"status": "trial", "id": "sub-1"}
    )
    fake_payments._evaluate_driver_trial = AsyncMock(
        return_value={"status": "trial", "trial_active": True}
    )
    with patch.dict(sys.modules, {"routers.payments": fake_payments}):
        plan = await resolve_driver_plan_entitlement("founding-driver")
    assert plan["entitled"] is True
    assert plan["plan_status"] == "trial"
    assert plan["trial_active"] is True


@pytest.mark.asyncio
async def test_resolve_driver_plan_entitlement_no_subscription():
    from driver_trial_policy import resolve_driver_plan_entitlement

    fake_payments = MagicMock()
    fake_payments._ensure_auto_trial_for_verified_driver = AsyncMock(return_value=None)
    with patch.dict(sys.modules, {"routers.payments": fake_payments}):
        plan = await resolve_driver_plan_entitlement("unverified")
    assert plan["entitled"] is False
    assert plan["trial_active"] is False


@pytest.mark.asyncio
async def test_clear_work_zone_graceful_until_expires_at():
    from work_zone_service import clear_work_zone_if_not_entitled

    future = (datetime.now(timezone.utc) + timedelta(hours=5)).isoformat()
    profile = {
        "work_zone_active": True,
        "work_zone_area_ids": ["victoria_island"],
        "work_zone_expires_at": future,
    }
    with (
        patch(
            "work_zone_service.resolve_work_zone_entitlement",
            new=AsyncMock(return_value=(False, "inactive")),
        ),
        patch("work_zone_service.db") as mock_db,
    ):
        mock_db.driver_profiles.update_one = AsyncMock()
        out, entitled, status = await clear_work_zone_if_not_entitled("u1", profile)
    assert entitled is False
    assert out.get("work_zone_active") is True
    mock_db.driver_profiles.update_one.assert_not_called()


@pytest.mark.asyncio
async def test_clear_work_zone_deactivates_when_plan_lapsed_and_zone_expired():
    from work_zone_service import clear_work_zone_if_not_entitled

    past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    profile = {
        "work_zone_active": True,
        "work_zone_area_ids": ["victoria_island"],
        "work_zone_expires_at": past,
    }
    with (
        patch(
            "work_zone_service.resolve_work_zone_entitlement",
            new=AsyncMock(return_value=(False, "inactive")),
        ),
        patch("work_zone_service.db") as mock_db,
    ):
        mock_db.driver_profiles.update_one = AsyncMock()
        out, entitled, _ = await clear_work_zone_if_not_entitled("u1", profile)
    assert entitled is False
    assert out.get("work_zone_active") is False
    mock_db.driver_profiles.update_one.assert_called_once()


@pytest.mark.asyncio
async def test_entitlement_messages():
    from work_zone_service import work_zone_entitlement_message

    assert "driver plan" in work_zone_entitlement_message("trial")
    assert "subscription" in work_zone_entitlement_message("active")
    assert "Subscribe" in work_zone_entitlement_message("inactive")


@pytest.mark.asyncio
async def test_early_access_when_flag_off():
    from work_zone_service import feature_available_for_driver

    with (
        patch("work_zone_service.WORK_ZONE_ENABLED", False),
        patch(
            "work_zone_service.driver_has_early_access",
            new=AsyncMock(return_value=True),
        ),
    ):
        ok, reason = await feature_available_for_driver("u1")
    assert ok is True
    assert reason == "early_access"
