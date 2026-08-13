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
    try:
        from trip_fare_adjustments import (
            compute_mid_trip_wait_payload,
            compute_pickup_wait_payload,
        )

        wait_payload = compute_pickup_wait_payload(trip)
        mid_trip_wait_payload = compute_mid_trip_wait_payload(trip)
    except Exception:
        wait_payload = {"free_wait_total_sec": 180, "wait_phase": "idle"}
        mid_trip_wait_payload = {}
    return {
        "id": trip.get("id"),
        "status": trip.get("status"),
        "ride_version": int(trip.get("ride_version") or 0),
        "state_sequence": int(trip.get("state_sequence") or trip.get("ride_version") or 0),
        "state_updated_at": _iso(
            trip.get("state_updated_at") or trip.get("updated_at") or trip.get("created_at")
        ),
        "updated_at": _iso(trip.get("updated_at") or trip.get("state_updated_at") or trip.get("created_at")),
        "driver_id": trip.get("driver_id"),
        "rider_id": trip.get("rider_id"),
        "pickup_location": trip.get("pickup_location"),
        "dropoff_location": trip.get("dropoff_location"),
        "fare": trip.get("fare"),
        "offered_fare": trip.get("offered_fare"),
        "driver_name": trip.get("driver_name"),
        "driver_profile_image": trip.get("driver_profile_image"),
        "driver_face_image": trip.get("driver_face_image"),
        "driver_rating": trip.get("driver_rating"),
        "driver_total_trips": trip.get("driver_total_trips"),
        "driver_verified": trip.get("driver_verified"),
        "vehicle_model": trip.get("vehicle_model"),
        "vehicle_type": trip.get("vehicle_type"),
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
        "mid_trip_wait": mid_trip_wait_payload,
        "pickup_wait": {
            **wait_payload,
            "arrived_at": arrived_at,
            "free_wait_secs": int(
                trip.get("pickup_free_wait_seconds")
                or wait_payload.get("free_wait_total_sec")
                or 180
            ),
        },
        # Optional — only when rider enabled pickup_code_enabled at booking.
        "pickup_code_required": bool(trip.get("pickup_code_required", False)),
        "pickup_code_verified": bool(
            trip.get("pickup_code_verified") or trip.get("security_code_verified")
        ),
        "pickup_code": (
            trip.get("pickup_code") or trip.get("security_code")
            if trip.get("pickup_code_required", False)
            else None
        ),
        "guardian_alert": trip.get("guardian_alert"),
        "driver_stop_reason": trip.get("driver_stop_reason"),
        "safe_arrival_check": trip.get("safe_arrival_check"),
    }
