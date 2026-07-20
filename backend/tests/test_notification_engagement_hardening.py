"""Production validation for engagement notification dedupe + role audience."""

from __future__ import annotations

from datetime import datetime, time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import engagement_push_service as eng
import notification_service
from notification_catalog import (
    NOTIFICATION_KIND_META,
    NotificationAudience,
    get_kind_meta,
    normalize_audience,
)
from notification_delivery_ledger import (
    MAX_ENGAGEMENT_PER_DAY,
    build_delivery_key,
    claim_notification_delivery,
    infer_delivery_window,
    should_dedupe_notification,
)
from notification_catalog import NotificationCategory


def test_delivery_key_unique_shape():
    key = build_delivery_key(
        "u1",
        "monthly_verification_reminder",
        local_date="2026-07-14",
        delivery_slot="compliance_daily",
    )
    assert key == "u1|monthly_verification_reminder|2026-07-14|compliance_daily"
    trip_key = build_delivery_key(
        "d1",
        "ride_request",
        trip_id="t9",
        delivery_slot="offer_1",
    )
    assert trip_key == "d1|ride_request|t9|offer_1"


def test_infer_windows_independent():
    assert infer_delivery_window(8) == "morning"
    assert infer_delivery_window(13) == "afternoon"
    assert infer_delivery_window(18) == "evening"
    assert infer_delivery_window(11) == "offpeak"
    assert infer_delivery_window(12, weekend=True) == "weekend"


def test_max_engagement_per_day_is_two():
    assert MAX_ENGAGEMENT_PER_DAY == 2


def test_should_dedupe_engagement_and_compliance():
    assert should_dedupe_notification(
        category=NotificationCategory.COMPLIANCE,
        source="compliance",
        notification_type="monthly_verification_reminder",
    )
    assert should_dedupe_notification(
        category=NotificationCategory.DRIVER_ENGAGEMENT,
        source="engagement",
        notification_type="driver_morning_rush",
    )
    assert should_dedupe_notification(
        category=NotificationCategory.RIDER_ENGAGEMENT,
        source="engagement",
        notification_type="rider_morning_commute",
    )
    assert not should_dedupe_notification(
        category=NotificationCategory.RIDES,
        source="trip",
        notification_type="ride_request",
    )


def test_driver_and_rider_schedule_windows_independent():
    morning = next(r for r in eng.DEFAULT_RULES if r["id"] == "driver_morning_rush")
    afternoon = next(r for r in eng.DEFAULT_RULES if r["id"] == "driver_midday_reminder")
    evening = next(r for r in eng.DEFAULT_RULES if r["id"] == "driver_evening_rush")
    assert morning["start"] == "07:00" and morning["end"] == "10:00"
    assert afternoon["start"] == "12:00" and afternoon["end"] == "15:00"
    assert evening["start"] == "17:00" and evening["end"] == "20:00"

    local = datetime(2026, 7, 14, 8, 15)  # Tuesday morning
    assert eng._in_slot_window(morning, local)
    assert not eng._in_slot_window(afternoon, local)
    assert not eng._in_slot_window(evening, local)

    local_pm = datetime(2026, 7, 14, 13, 20)
    assert eng._in_slot_window(afternoon, local_pm)
    assert not eng._in_slot_window(morning, local_pm)

    rider_afternoon = next(r for r in eng.DEFAULT_RULES if r["id"] == "rider_afternoon_ride")
    assert rider_afternoon["role"] == "rider"
    assert eng._in_slot_window(rider_afternoon, local_pm)


def test_default_rules_role_matches_catalog_audience():
    for rule in eng.DEFAULT_RULES:
        kind = rule["kind"]
        audience = normalize_audience(get_kind_meta(kind).get("audience"))
        if rule["role"] == "driver":
            assert audience == NotificationAudience.DRIVER, kind
        elif rule["role"] == "rider":
            assert audience == NotificationAudience.RIDER, kind


@pytest.mark.asyncio
async def test_claim_blocks_duplicate_delivery_key():
    ledger = MagicMock()
    ledger.find_one = AsyncMock(return_value=None)
    ledger.count_documents = AsyncMock(return_value=0)
    ledger.insert_one = AsyncMock(side_effect=[None, Exception("dup")])

    from pymongo.errors import DuplicateKeyError

    async def second_insert(doc):
        raise DuplicateKeyError("dup")

    ledger.insert_one = AsyncMock(side_effect=[None, second_insert])

    with patch("notification_delivery_ledger.db") as db:
        db.notification_delivery_ledger = ledger
        # First claim: find_one None, count 0, insert ok
        ledger.insert_one = AsyncMock(return_value=None)
        ok1, meta1 = await claim_notification_delivery(
            user_id="d1",
            role="driver",
            notification_type="monthly_verification_reminder",
            audience="driver",
            template="monthly_verification_reminder",
            local_date="2026-07-14",
            time_slot="compliance_daily",
            delivery_window="compliance",
            source="compliance",
            title="Monthly Verification Reminder",
            body="Please upload",
        )
        assert ok1 is True
        assert "d1|monthly_verification_reminder|2026-07-14|compliance_daily" == meta1["delivery_key"]

        ledger.insert_one = AsyncMock(side_effect=DuplicateKeyError("E11000"))
        ok2, meta2 = await claim_notification_delivery(
            user_id="d1",
            role="driver",
            notification_type="monthly_verification_reminder",
            audience="driver",
            template="monthly_verification_reminder",
            local_date="2026-07-14",
            time_slot="compliance_daily",
            delivery_window="compliance",
            source="compliance",
        )
        assert ok2 is False
        assert meta2["skip_reason"] == "duplicate_delivery_key"


@pytest.mark.asyncio
async def test_claim_blocks_identical_within_24h():
    ledger = MagicMock()
    ledger.find_one = AsyncMock(return_value={"delivery_key": "existing"})
    ledger.count_documents = AsyncMock(return_value=0)
    ledger.insert_one = AsyncMock()

    with patch("notification_delivery_ledger.db") as db:
        db.notification_delivery_ledger = ledger
        ok, meta = await claim_notification_delivery(
            user_id="d1",
            role="driver",
            notification_type="monthly_verification_reminder",
            audience="driver",
            template="monthly_verification_reminder",
            local_date="2026-07-14",
            time_slot="compliance_daily",
            delivery_window="compliance",
            source="compliance",
        )
        assert ok is False
        assert meta["skip_reason"] == "duplicate_within_24h"
        ledger.insert_one.assert_not_called()


@pytest.mark.asyncio
async def test_driver_template_never_reaches_rider():
    user = {"id": "r1", "role": "rider", "notifications_enabled": True, "notification_channels": {"push": True}}
    ok, guard = await notification_service._validate_push_delivery(
        "r1", user, "monthly_verification_reminder", "compliance"
    )
    assert ok is False
    assert guard["skip_reason"] == "audience_role_mismatch"


@pytest.mark.asyncio
async def test_rider_template_never_reaches_driver():
    user = {"id": "d1", "role": "driver", "notifications_enabled": True, "notification_channels": {"push": True}}
    ok, guard = await notification_service._validate_push_delivery(
        "d1", user, "rider_afternoon_ride", "engagement"
    )
    assert ok is False
    assert guard["skip_reason"] in {"audience_role_mismatch", "rider_engagement_role_blocked"}


def test_every_catalog_kind_has_audience():
    for kind, meta in NOTIFICATION_KIND_META.items():
        assert normalize_audience(meta.get("audience")) in {
            NotificationAudience.DRIVER,
            NotificationAudience.RIDER,
            NotificationAudience.BOTH,
        }, kind


@pytest.mark.asyncio
async def test_trip_push_skips_non_participant(monkeypatch):
    async def fake_trip_find_one(query, projection=None):
        return {"rider_id": "rider-1", "driver_id": "driver-1"}

    class _Trips:
        find_one = staticmethod(fake_trip_find_one)

    monkeypatch.setattr(notification_service.db, "trips", _Trips())
    ok, reason = await notification_service._trip_participant_allows("stranger", "trip-1", "trip_completed")
    assert ok is False
    assert reason == "not_trip_participant"
    ok2, _ = await notification_service._trip_participant_allows("rider-1", "trip-1", "trip_completed")
    assert ok2 is True


def test_required_ride_aliases_registered():
    for kind in (
        "ride_request",
        "rider_cancelled",
        "driver_cancelled",
        "payment_successful",
        "payment_received",
        "searching_for_driver",
        "driver_found",
        "fare_updated",
    ):
        assert normalize_audience(get_kind_meta(kind).get("audience")) in {
            NotificationAudience.DRIVER,
            NotificationAudience.RIDER,
            NotificationAudience.BOTH,
        }


@pytest.mark.asyncio
async def test_ride_types_do_not_consume_engagement_daily_cap():
    """Regression: rider_cancelled / driver_arrived must not hit engagement daily_cap."""
    ledger = MagicMock()
    ledger.find_one = AsyncMock(return_value=None)
    # Pretend 2 engagement sends already used the day.
    ledger.count_documents = AsyncMock(return_value=2)
    ledger.insert_one = AsyncMock(return_value=None)

    with patch("notification_delivery_ledger.db") as db:
        db.notification_delivery_ledger = ledger
        ok, meta = await claim_notification_delivery(
            user_id="d1",
            role="driver",
            notification_type="rider_cancelled",
            audience="driver",
            template="rider_cancelled",
            local_date="2026-07-14",
            time_slot="cancel",
            delivery_window="trip:t1",
            source="trip",
            trip_id="t1",
        )
        assert ok is True, meta
        ledger.count_documents.assert_not_called()


def test_scheduler_windows_use_preferred_minute():
    rule = {
        "days": "weekday",
        "start": "07:00",
        "end": "10:00",
        "preferred_minute": 15,
    }
    assert eng._in_slot_window(rule, datetime(2026, 7, 14, 8, 15))
    assert eng._in_slot_window(rule, datetime(2026, 7, 14, 8, 18))
    assert not eng._in_slot_window(rule, datetime(2026, 7, 14, 8, 40))
