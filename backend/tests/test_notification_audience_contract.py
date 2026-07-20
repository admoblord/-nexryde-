"""Contract tests for role-aware push notification delivery."""

import pytest

import notification_service
from notification_catalog import NOTIFICATION_KIND_META, NotificationAudience, get_kind_meta, list_kind_audiences, normalize_audience


def test_every_registered_notification_has_explicit_audience():
    assert NOTIFICATION_KIND_META
    for kind, meta in NOTIFICATION_KIND_META.items():
        assert normalize_audience(meta.get("audience")) in {
            NotificationAudience.DRIVER,
            NotificationAudience.RIDER,
            NotificationAudience.BOTH,
        }, kind


def test_driver_operational_templates_are_driver_only():
    driver_only = {
        "monthly_verification_reminder",
        "document_expiring",
        "document_expired",
        "earnings_update",
        "work_zone_expiring",
        "work_zone_reminder",
        "vehicle_inspection_reminder",
        "driver_selfie_reminder",
        "vehicle_document_renewal",
        "peak_demand_reminder",
        "driver_offline_reminder",
        "driver_nearby_ride_opportunity",
        "driver_online_high_demand",
        "trial_idle_guardrail",
    }
    for kind in driver_only:
        assert normalize_audience(get_kind_meta(kind).get("audience")) == NotificationAudience.DRIVER


def test_rider_engagement_templates_are_rider_only():
    rider_only = {
        "rider_morning_commute",
        "rider_afternoon_ride",
        "rider_evening_ride",
        "rider_weekend_travel",
        "rider_promo",
        "favorite_driver_nudge",
        "daily_slot_morning",
        "daily_slot_evening",
        "complete_first_ride",
        "saved_places_reminder",
        "book_next_ride",
        "ride_discount",
        "promo_offer",
    }
    for kind in rider_only:
        assert normalize_audience(get_kind_meta(kind).get("audience")) == NotificationAudience.RIDER


@pytest.mark.asyncio
async def test_driver_notification_skips_rider_user():
    user = {"id": "u1", "role": "rider", "notifications_enabled": True, "notification_channels": {"push": True}}
    ok, guard = await notification_service._validate_push_delivery(
        "u1",
        user,
        "monthly_verification_reminder",
        "compliance",
    )
    assert ok is False
    assert guard["skip_reason"] == "audience_role_mismatch"


@pytest.mark.asyncio
async def test_rider_notification_skips_driver_user():
    user = {"id": "d1", "role": "driver", "notifications_enabled": True, "notification_channels": {"push": True}}
    ok, guard = await notification_service._validate_push_delivery(
        "d1",
        user,
        "rider_morning_commute",
        "engagement",
    )
    assert ok is False
    assert guard["skip_reason"] == "audience_role_mismatch"


@pytest.mark.asyncio
async def test_preferences_disable_rider_promotions():
    user = {
        "id": "u1",
        "role": "rider",
        "notifications_enabled": True,
        "notification_channels": {"push": True},
        "notification_types": {"promotions": False},
    }
    ok, guard = await notification_service._validate_push_delivery("u1", user, "rider_promo", "engagement")
    assert ok is False
    assert guard["skip_reason"] == "promotions_disabled"


def test_audience_report_contains_template_rows():
    rows = list_kind_audiences()
    by_type = {row["type"]: row for row in rows}
    assert by_type["monthly_verification_reminder"]["audience"] == "driver"
    assert by_type["rider_morning_commute"]["audience"] == "rider"
    assert by_type["password_changed"]["audience"] == "both"
