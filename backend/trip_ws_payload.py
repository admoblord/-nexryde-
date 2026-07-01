"""Trip fields for rider WebSocket payloads (no FastAPI imports)."""
from __future__ import annotations

from typing import Any, Optional


def _iso(val: Any) -> Optional[str]:
    """Normalise datetime or string to ISO-8601 string (None if missing)."""
    if val is None:
        return None
    if hasattr(val, "isoformat"):
        return val.isoformat() + ("Z" if not val.tzinfo else "")
    return str(val)


def rider_trip_payload_from_doc(trip: Optional[dict]) -> dict[str, Any]:
    """JSON-serializable trip subset for rider WebSocket clients (no Mongo _id).

    Includes lifecycle timestamps so the rider app can:
      - anchor the pickup-wait timer on `arrived_at`
      - anchor the trip timer on `started_at`
    """
    if not trip:
        return {}
    arrived_at = _iso(trip.get("arrived_at"))
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
        # Lifecycle timestamps — required by frontend timers
        "accepted_at": _iso(trip.get("accepted_at") or trip.get("assignment_accepted_at")),
        "arrived_at": arrived_at,
        "started_at": _iso(trip.get("started_at")),
        "completed_at": _iso(trip.get("completed_at")),
        # Pickup wait payload for rider timer
        "pickup_wait": {
            "arrived_at": arrived_at,
            "free_wait_secs": int(trip.get("free_wait_seconds", 300)),
        },
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
