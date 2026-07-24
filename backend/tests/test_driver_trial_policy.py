"""Unit tests for driver trial policy."""
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.mark.asyncio
async def test_resolve_trial_config_from_profile():
    from driver_trial_policy import resolve_trial_config

    cfg = resolve_trial_config({"trial_config": {"trip_limit": 20, "day_limit": None}})
    assert cfg == {"trip_limit": 20, "day_limit": None}

    default = resolve_trial_config({})
    assert default == {"trip_limit": 20, "day_limit": None}


@pytest.mark.asyncio
async def test_trial_expires_by_trips_not_cancelled():
    from driver_trial_policy import compute_trial_snapshot

    driver_id = "drv_test_1"
    profile = {
        "trial_config": {"trip_limit": 15, "day_limit": 14},
        "trial_first_online_at": datetime.now(timezone.utc).isoformat(),
    }
    sub = {"status": "trial", "id": "sub1"}

    with patch("driver_trial_policy.db") as mock_db:
        mock_db.driver_profiles.find_one = AsyncMock(return_value=profile)
        mock_db.system_config.find_one = AsyncMock(return_value=None)
        mock_db.trips.count_documents = AsyncMock(return_value=15)

        snap = await compute_trial_snapshot(driver_id, sub)

    assert snap["trial_expired"] is True
    assert snap["trial_expired_by_trips"] is True
    assert snap["trial_expired_by_days"] is False


@pytest.mark.asyncio
async def test_grandfather_no_day_cap():
    from driver_trial_policy import compute_trial_snapshot

    driver_id = "drv_loopy"
    profile = {
        "trial_config": {"trip_limit": 20, "day_limit": None},
        "trial_first_online_at": (datetime.now(timezone.utc) - timedelta(days=30)).isoformat(),
    }

    with patch("driver_trial_policy.db") as mock_db:
        mock_db.driver_profiles.find_one = AsyncMock(return_value=profile)
        mock_db.system_config.find_one = AsyncMock(return_value=None)
        mock_db.trips.count_documents = AsyncMock(return_value=5)

        snap = await compute_trial_snapshot(driver_id, {})

    assert snap["trial_expired"] is False
    assert snap["trial_day_limit"] is None
    assert snap["trial_days_remaining"] is None
    # Windowed count query must include a since filter (not lifetime).
    query = mock_db.trips.count_documents.await_args.args[0]
    assert query["driver_id"] == driver_id
    assert "$or" in query


@pytest.mark.asyncio
async def test_trial_trips_use_subscription_start_not_later_first_online():
    """Trips before first-online still count when trial_start_date is earlier."""
    from driver_trial_policy import compute_trial_snapshot

    driver_id = "drv_window"
    profile = {
        "trial_config": {"trip_limit": 20, "day_limit": None},
        "trial_first_online_at": (datetime.now(timezone.utc) - timedelta(days=5)).isoformat(),
    }
    sub = {
        "status": "trial",
        "id": "sub_w",
        "trial_start_date": datetime.now(timezone.utc) - timedelta(days=60),
    }

    with patch("driver_trial_policy.db") as mock_db:
        mock_db.driver_profiles.find_one = AsyncMock(return_value=profile)
        mock_db.system_config.find_one = AsyncMock(return_value=None)
        mock_db.trips.count_documents = AsyncMock(return_value=6)

        snap = await compute_trial_snapshot(driver_id, sub)

    assert snap["trial_trips_completed"] == 6
    assert snap["trial_trips_target"] == 20
    query = mock_db.trips.count_documents.await_args.args[0]
    # Cutoff must be trial_start (~60d ago), not first_online (~5d ago).
    cutoff = query["$or"][0]["completed_at"]["$gte"]
    assert isinstance(cutoff, datetime)
    assert (datetime.now(timezone.utc).replace(tzinfo=None) - cutoff).days >= 50


@pytest.mark.asyncio
async def test_trial_trips_zero_before_window_starts():
    from driver_trial_policy import compute_trial_snapshot

    driver_id = "drv_new"
    profile = {"trial_config": {"trip_limit": 15, "day_limit": 14}}

    with patch("driver_trial_policy.db") as mock_db:
        mock_db.driver_profiles.find_one = AsyncMock(return_value=profile)
        mock_db.system_config.find_one = AsyncMock(return_value=None)
        mock_db.trips.count_documents = AsyncMock(return_value=99)

        snap = await compute_trial_snapshot(driver_id, {})

    assert snap["trial_trips_completed"] == 0
    mock_db.trips.count_documents.assert_not_awaited()


@pytest.mark.asyncio
async def test_early_subscribe_discount_during_trial():
    from driver_trial_policy import resolve_subscription_checkout_amount

    sub = {"status": "trial", "id": "sub1"}
    with patch("driver_trial_policy.db") as mock_db:
        mock_db.subscriptions.find_one = AsyncMock(return_value=sub)
        mock_db.system_config.find_one = AsyncMock(return_value=None)
        with patch("driver_trial_policy.evaluate_driver_trial", new_callable=AsyncMock) as ev:
            ev.return_value = {"status": "trial", "trial_active": True}
            amount, meta = await resolve_subscription_checkout_amount("drv1", "city_rider", 18000.0)

    assert amount == 15000.0
    assert meta.get("early_subscribe_discount_applied") is True


@pytest.mark.asyncio
async def test_trial_expires_by_days_after_first_online():
    from driver_trial_policy import compute_trial_snapshot

    driver_id = "drv_test_days"
    first_online = (datetime.now(timezone.utc) - timedelta(days=15)).isoformat()
    profile = {
        "trial_config": {"trip_limit": 15, "day_limit": 14},
        "trial_first_online_at": first_online,
    }

    with patch("driver_trial_policy.db") as mock_db:
        mock_db.driver_profiles.find_one = AsyncMock(return_value=profile)
        mock_db.system_config.find_one = AsyncMock(return_value=None)
        mock_db.trips.count_documents = AsyncMock(return_value=3)

        snap = await compute_trial_snapshot(driver_id, {})

    assert snap["trial_expired"] is True
    assert snap["trial_expired_by_days"] is True
    assert snap["trial_expired_by_trips"] is False


@pytest.mark.asyncio
async def test_no_discount_after_trial_expired():
    from driver_trial_policy import resolve_subscription_checkout_amount

    sub = {"status": "trial", "id": "sub1"}
    with patch("driver_trial_policy.db") as mock_db:
        mock_db.subscriptions.find_one = AsyncMock(return_value=sub)
        with patch("driver_trial_policy.evaluate_driver_trial", new_callable=AsyncMock) as ev:
            ev.return_value = {"status": "pending_payment", "trial_active": False}
            amount, meta = await resolve_subscription_checkout_amount("drv1", "city_rider", 18000.0)

    assert amount == 18000.0
    assert not meta.get("early_subscribe_discount_applied")
