"""Trip fields for rider WebSocket payloads (no FastAPI imports)."""
from __future__ import annotations

from typing import Any, Optional


def rider_trip_payload_from_doc(trip: Optional[dict]) -> dict[str, Any]:
    """JSON-serializable trip subset for rider WebSocket clients (no Mongo _id)."""
    if not trip:
        return {}
    return {
        "id": trip.get("id"),
        "status": trip.get("status"),
        "driver_id": trip.get("driver_id"),
        "rider_id": trip.get("rider_id"),
        "pickup_location": trip.get("pickup_location"),
        "dropoff_location": trip.get("dropoff_location"),
        "fare": trip.get("fare"),
        "offered_fare": trip.get("offered_fare"),
        "driver_name": trip.get("driver_name"),
        "vehicle_model": trip.get("vehicle_model"),
        "vehicle_plate": trip.get("vehicle_plate"),
        "vehicle_color": trip.get("vehicle_color"),
        "payment_status": trip.get("payment_status"),
        "payment_method": trip.get("payment_method"),
        "pickup_code_required": bool(trip.get("pickup_code_required", True)),
        "pickup_code_verified": bool(
            trip.get("pickup_code_verified") or trip.get("security_code_verified")
        ),
        "pickup_code": (
            trip.get("pickup_code") or trip.get("security_code")
            if trip.get("pickup_code_required", True)
            else None
        ),
    }
