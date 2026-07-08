"""Trip tracking route payload — no misleading chord segments."""
from services.trip_tracking_service import build_trip_route_response


def test_segment_to_target_never_returns_two_point_chord():
    trip = {
        "status": "accepted",
        "pickup_location": {"lat": 6.52, "lng": 3.38},
        "dropoff_location": {"lat": 6.55, "lng": 3.41},
        "route_preview_coordinates": [
            {"lat": 6.52, "lng": 3.38},
            {"lat": 6.525, "lng": 3.385},
            {"lat": 6.55, "lng": 3.41},
        ],
    }
    driver_location = {"lat": 6.51, "lng": 3.37}
    out = build_trip_route_response(trip, driver_location)
    assert out["segment_to_target"] == []
    assert len(out["waypoints"]) >= 3
