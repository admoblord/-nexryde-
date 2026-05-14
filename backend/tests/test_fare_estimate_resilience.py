"""Fare estimate must stay up when Mongo or routing helpers misbehave."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from surge_demand import estimate_area_demand_ratio_near


@pytest.mark.asyncio
async def test_estimate_area_demand_ratio_near_returns_zero_on_db_error():
    db = MagicMock()
    db.trips.find = MagicMock(side_effect=RuntimeError("Mongo unavailable"))

    got = await estimate_area_demand_ratio_near(db, 6.45, 3.42)
    assert got == 0.0


@pytest.mark.asyncio
async def test_estimate_area_demand_ratio_near_ok_when_queries_work():
    db = MagicMock()
    trips_cursor = MagicMock()
    trips_cursor.limit.return_value = trips_cursor
    trips_cursor.to_list = AsyncMock(return_value=[])
    db.trips.find.return_value = trips_cursor

    prof_cursor = MagicMock()
    prof_cursor.to_list = AsyncMock(return_value=[])
    db.driver_profiles.find.return_value = prof_cursor

    got = await estimate_area_demand_ratio_near(db, 6.45, 3.42)
    assert isinstance(got, float)
    assert 0.0 <= got <= 1.0
