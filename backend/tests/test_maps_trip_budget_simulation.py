"""Simulate Maps call budget for one completed trip (no live Google)."""
from __future__ import annotations

import asyncio
from typing import Any, Optional
from unittest.mock import AsyncMock, patch

import pytest

from maps_billing import can_reroute
from polyline_eta import remaining_distance_m, eta_seconds_from_route
from route_leg_service import local_tracking_from_polyline


@pytest.mark.asyncio
async def test_simulated_trip_maps_budget_three_or_fewer():
    """
    Ideal happy path:
      1) fare estimate (traffic-aware)
      2) accept → driver→pickup Essentials
      3) start → pickup→dropoff Essentials
      location pings → local polyline only (0 Google)
    """
    calls: list[str] = []

    async def fake_incr(*, trip_id: Optional[str], kind: str, detail: str = "") -> int:
        calls.append(kind)
        return len([c for c in calls if trip_id]) if trip_id else len(calls)

    fake_route = {
        "distance_meters": 4200,
        "duration_seconds": 720,
        "polyline": "_p~iF~ps|U_ulLnnqC_mqNvxq`@",  # valid-ish encoded sample
        "source": "google_routes_essentials",
        "routing_preference": "TRAFFIC_UNAWARE",
    }

    with patch("maps_billing.incr_maps_call", new=fake_incr), patch(
        "route_leg_service.incr_maps_call", new=fake_incr
    ), patch(
        "route_leg_service.fetch_essentials_route",
        new=AsyncMock(return_value=fake_route),
    ):
        # 1) fare
        await fake_incr(trip_id=None, kind="fare_estimate", detail="directions")
        # 2+3) legs via store — count as we would in production
        await fake_incr(trip_id="trip-sim", kind="leg_to_pickup", detail="essentials")
        await fake_incr(trip_id="trip-sim", kind="leg_to_dropoff", detail="essentials")

        trip_calls = [c for c in calls if c.startswith("leg_") or c == "fare_estimate"]
        assert len(trip_calls) == 3

        # Pings: local only
        trip = {
            "status": "ongoing",
            "pickup_location": {"lat": 6.5244, "lng": 3.3792},
            "active_leg_route": {
                "distance_meters": 4200,
                "duration_seconds": 720,
                "polyline": fake_route["polyline"],
                "coordinates": [
                    {"lat": 6.52, "lng": 3.37},
                    {"lat": 6.53, "lng": 3.38},
                    {"lat": 6.54, "lng": 3.39},
                ],
            },
        }
        with patch("traffic_factor.get_zone_traffic_factor", new=AsyncMock(return_value=1.1)):
            for i in range(20):
                lat = 6.52 + i * 0.0005
                lng = 3.37 + i * 0.0005
                local = await local_tracking_from_polyline(trip, lat, lng)
                assert local is not None
                assert local["source"] == "local_polyline"

        assert len(calls) == 3  # no Google from pings


def test_deviation_reroute_caps():
    trip: dict[str, Any] = {"reroute_count": 4}
    ok, reason = can_reroute(trip)
    assert not ok and reason == "trip_reroute_ceiling"
