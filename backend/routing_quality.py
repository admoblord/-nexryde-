"""Helpers to distinguish Google driving routes from straight-line / haversine fallbacks."""

from __future__ import annotations

from typing import Any, Mapping, Optional


def is_directions_road_route(route_data: Optional[Mapping[str, Any]]) -> bool:
    """
    True only when metrics come from Google Directions / Routes, not haversine estimate.

    Haversine responses reuse distance_meters/duration_seconds but set source='haversine'.
    """
    if not route_data or not isinstance(route_data, Mapping):
        return False
    src = str(route_data.get("source") or "").strip().lower()
    if src == "haversine":
        return False
    if route_data.get("distance_meters") is None or route_data.get("duration_seconds") is None:
        return False
    return True
