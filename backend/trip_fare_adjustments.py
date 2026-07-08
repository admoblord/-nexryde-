"""
Targeted trip time billing — pickup wait, traffic excess, mid-trip route changes.

Direct booking estimates stay base+distance (nationwide) or distance×zone (Lagos).
These adjustments apply when the driver waits, traffic exceeds estimate, or the rider
changes destination / adds a stop during the trip.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Callable, Optional

from fare_config import (
    PICKUP_FREE_WAIT_SECONDS,
    ROUTE_CHANGE_FEE_NGN,
    TRAFFIC_EXCESS_BUFFER_MIN,
    TRAFFIC_EXCESS_CAP_NGN,
    TRAFFIC_EXCESS_MAX_SPEED_KMH,
    MIN_TRIP_KM_FOR_TRAFFIC_EXCESS,
    normalize_fare_city_key,
    resolve_pickup_wait_per_min,
    resolve_traffic_excess_per_min,
)


def parse_trip_datetime(val: Any) -> Optional[datetime]:
    if val is None:
        return None
    if isinstance(val, datetime):
        dt = val
    else:
        raw = str(val).strip()
        if not raw:
            return None
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(raw)
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def trip_free_wait_seconds(trip: dict) -> int:
    try:
        return max(60, int(trip.get("pickup_free_wait_seconds") or PICKUP_FREE_WAIT_SECONDS))
    except (TypeError, ValueError):
        return PICKUP_FREE_WAIT_SECONDS


def compute_pickup_wait_payload(trip: dict, *, now: Optional[datetime] = None) -> dict[str, Any]:
    """Live pickup wait state for rider/driver UI (Bolt-style free window)."""
    now = now or datetime.now(timezone.utc)
    free_total = trip_free_wait_seconds(trip)
    arrived = parse_trip_datetime(trip.get("arrived_at"))
    started = parse_trip_datetime(trip.get("started_at"))
    status = str(trip.get("status") or "").lower()

    if not arrived or status not in {"arrived", "ongoing", "completed"}:
        return {
            "wait_phase": "idle",
            "free_wait_total_sec": free_total,
            "free_wait_remaining_sec": free_total,
            "billable_wait_sec": 0,
            "billable_wait_min": 0,
            "wait_per_min_ngn": 0.0,
            "estimated_wait_fee_ngn": 0.0,
        }

    end = started or (now if status == "arrived" else now)
    elapsed_sec = max(0, int((end - arrived).total_seconds()))
    free_remaining = max(0, free_total - elapsed_sec)
    billable_sec = max(0, elapsed_sec - free_total)
    city = trip.get("city") or "lagos"
    service = trip.get("service_type") or "economy"
    wait_per_min = resolve_pickup_wait_per_min(city, service)
    billable_min = math.ceil(billable_sec / 60.0) if billable_sec > 0 else 0
    wait_fee = round(billable_min * wait_per_min, 2) if billable_min > 0 else 0.0

    return {
        "wait_phase": "free" if free_remaining > 0 and status == "arrived" else ("billable" if billable_sec > 0 else "idle"),
        "arrived_at": arrived.isoformat(),
        "free_wait_total_sec": free_total,
        "free_wait_remaining_sec": free_remaining if status == "arrived" else 0,
        "billable_wait_sec": billable_sec,
        "billable_wait_min": billable_min,
        "wait_per_min_ngn": wait_per_min,
        "estimated_wait_fee_ngn": wait_fee,
    }


def compute_pickup_wait_fee(trip: dict) -> dict[str, float | int | bool]:
    payload = compute_pickup_wait_payload(trip)
    fee = float(payload.get("estimated_wait_fee_ngn") or 0)
    mins = int(payload.get("billable_wait_min") or 0)
    return {
        "pickup_wait_fee": fee,
        "pickup_wait_min": mins,
        "pickup_wait_per_min": float(payload.get("wait_per_min_ngn") or 0),
        "pickup_wait_applied": fee > 0,
    }


def compute_traffic_excess_fee(trip: dict, completed_at: datetime) -> dict[str, float | int | bool]:
    started = parse_trip_datetime(trip.get("started_at"))
    if not started:
        return {
            "traffic_excess_fee": 0.0,
            "traffic_excess_min": 0,
            "traffic_excess_applied": False,
        }

    distance_km = float(trip.get("distance_km") or 0)
    if distance_km < MIN_TRIP_KM_FOR_TRAFFIC_EXCESS:
        return {
            "traffic_excess_fee": 0.0,
            "traffic_excess_min": 0,
            "traffic_excess_applied": False,
        }

    actual_min = max(1, int((completed_at - started).total_seconds() // 60))
    estimated_min = max(5, int(trip.get("duration_mins") or trip.get("duration_minutes") or 15))
    excess_min = max(0, actual_min - estimated_min - TRAFFIC_EXCESS_BUFFER_MIN)
    if excess_min <= 0:
        return {
            "traffic_excess_fee": 0.0,
            "traffic_excess_min": 0,
            "traffic_excess_applied": False,
        }

    avg_speed = distance_km / max(actual_min / 60.0, 1 / 60.0)
    if avg_speed >= TRAFFIC_EXCESS_MAX_SPEED_KMH:
        return {
            "traffic_excess_fee": 0.0,
            "traffic_excess_min": 0,
            "traffic_excess_applied": False,
        }

    city = trip.get("city") or "lagos"
    per_min = resolve_traffic_excess_per_min(city)
    raw = round(excess_min * per_min, 2)
    fee = min(float(TRAFFIC_EXCESS_CAP_NGN), raw)
    return {
        "traffic_excess_fee": fee,
        "traffic_excess_min": excess_min,
        "traffic_excess_per_min": per_min,
        "traffic_excess_applied": fee > 0,
        "actual_trip_min": actual_min,
        "estimated_trip_min": estimated_min,
    }


def compute_completion_fare_adjustments(trip: dict, completed_at: datetime) -> dict[str, Any]:
    """Pickup wait + traffic excess added at completion on top of current trip fare."""
    base_fare = float(trip.get("fare") or trip.get("booking_fare") or 0)
    booking_fare = float(trip.get("booking_fare") or base_fare)

    wait = compute_pickup_wait_fee(trip)
    traffic = compute_traffic_excess_fee(trip, completed_at)

    additions = float(wait["pickup_wait_fee"]) + float(traffic["traffic_excess_fee"])
    final_fare = round(base_fare + additions, 2)
    final_fare = max(final_fare, booking_fare)

    parts = []
    if wait["pickup_wait_applied"]:
        parts.append(
            f"pickup wait ₦{int(wait['pickup_wait_fee'])} "
            f"({wait['pickup_wait_min']}min)"
        )
    if traffic["traffic_excess_applied"]:
        parts.append(
            f"traffic ₦{int(traffic['traffic_excess_fee'])} "
            f"({traffic['traffic_excess_min']}min excess)"
        )

    return {
        "booking_fare": booking_fare,
        "base_fare_before_completion": base_fare,
        "final_fare": final_fare,
        "fare_additions_ngn": round(additions, 2),
        "pickup_wait_fee": float(wait["pickup_wait_fee"]),
        "pickup_wait_min": int(wait["pickup_wait_min"]),
        "pickup_wait_applied": bool(wait["pickup_wait_applied"]),
        "traffic_excess_fee": float(traffic["traffic_excess_fee"]),
        "traffic_excess_min": int(traffic.get("traffic_excess_min") or 0),
        "traffic_excess_applied": bool(traffic["traffic_excess_applied"]),
        "fare_adjustment_summary": "; ".join(parts) if parts else None,
        **wait,
        **{k: v for k, v in traffic.items() if k not in wait},
    }


def compute_mid_trip_route_fare(
    trip: dict,
    *,
    update_type: str,
    target_lat: float,
    target_lng: float,
    origin_lat: float,
    origin_lng: float,
    route_distance_km: float,
    route_duration_min: int,
    route_traffic_min: int,
    fare_breakdown: dict,
) -> dict[str, Any]:
    """
    Mid-trip destination change or add-stop: charge max(booking, new quote) + change fee.
    """
    booking_fare = float(trip.get("booking_fare") or trip.get("fare") or 0)
    new_total = float(fare_breakdown.get("total_fare") or 0)
    change_fee = float(ROUTE_CHANGE_FEE_NGN) if update_type in {"destination", "stop"} else 0.0
    route_delta = max(0.0, round(new_total - booking_fare, 2))
    updated_fare = round(max(booking_fare, new_total) + change_fee, 2)

    return {
        "update_type": update_type,
        "booking_fare": booking_fare,
        "quoted_route_fare": new_total,
        "route_fare_delta": route_delta,
        "route_change_fee": change_fee,
        "updated_fare": updated_fare,
        "distance_km": round(float(route_distance_km), 2),
        "duration_mins": int(route_duration_min),
        "fare_breakdown": fare_breakdown,
    }
