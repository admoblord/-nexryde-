"""Authoritative ride state helpers.

The database trip document is the only source of truth. Every authoritative
state change must increment ride_version/state_sequence so clients can ignore
stale socket, HTTP, retry, and queue updates.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

CANONICAL_RIDE_ORDER = [
    "REQUESTED",
    "BROADCASTING",
    "ACCEPTED",
    "DRIVER_ASSIGNED",
    "DRIVER_EN_ROUTE",
    "DRIVER_ARRIVED",
    "WAITING_FOR_PICKUP",
    "TRIP_STARTED",
    "TRIP_COMPLETED",
    "PAID",
    "FINISHED",
]

LEGACY_TO_CANONICAL = {
    "pending": "REQUESTED",
    "pending_driver_offers": "BROADCASTING",
    "accepted": "DRIVER_ASSIGNED",
    "arrived": "WAITING_FOR_PICKUP",
    "ongoing": "TRIP_STARTED",
    "completed": "TRIP_COMPLETED",
    "pending_payment": "TRIP_COMPLETED",
    "cancelled": "FINISHED",
}


def canonical_ride_state(status: Optional[str]) -> str:
    raw = (status or "").strip().lower()
    return LEGACY_TO_CANONICAL.get(raw, raw.upper() if raw else "REQUESTED")


def ride_state_set_fields(
    *,
    old_status: Optional[str],
    new_status: str,
    actor_id: Optional[str],
    reason: str,
    now: Optional[datetime] = None,
) -> dict[str, Any]:
    ts = (now or datetime.now(timezone.utc)).isoformat()
    return {
        "status": new_status,
        "ride_state": canonical_ride_state(new_status),
        "previous_status": old_status,
        "previous_ride_state": canonical_ride_state(old_status),
        "state_updated_at": ts,
        "updated_at": ts,
        "last_state_actor_id": actor_id,
        "last_state_reason": reason,
    }


def ride_state_inc_fields() -> dict[str, int]:
    return {"ride_version": 1, "state_sequence": 1}


def enrich_ride_payload(trip: dict[str, Any]) -> dict[str, Any]:
    """Expose ordering metadata consistently in API/socket payloads."""
    out = dict(trip)
    out.setdefault("ride_state", canonical_ride_state(out.get("status")))
    out.setdefault("ride_version", int(out.get("ride_version") or 0))
    out.setdefault("state_sequence", int(out.get("state_sequence") or out.get("ride_version") or 0))
    out.setdefault("state_updated_at", out.get("updated_at") or out.get("created_at"))
    return out


def ride_event_log_data(
    *,
    trip: Optional[dict[str, Any]],
    old_status: Optional[str],
    new_status: str,
    actor_id: Optional[str],
    reason: str,
    socket_status: Optional[str] = None,
    network_status: Optional[str] = None,
) -> dict[str, Any]:
    return {
        "ride_id": (trip or {}).get("id"),
        "driver_id": (trip or {}).get("driver_id"),
        "rider_id": (trip or {}).get("rider_id"),
        "old_state": canonical_ride_state(old_status),
        "new_state": canonical_ride_state(new_status),
        "old_status": old_status,
        "new_status": new_status,
        "socket_status": socket_status,
        "network_status": network_status,
        "version": (trip or {}).get("ride_version"),
        "sequence": (trip or {}).get("state_sequence"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "reason": reason,
        "actor_id": actor_id,
    }
