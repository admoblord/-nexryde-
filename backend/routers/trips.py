"""Trips Router - Trip CRUD, ride flow, and trip management for NEXRYDE."""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
from uuid import uuid4
import logging
import time
import math
import uuid
import random
import os

from database import db
from smart_pricing import (
    area_summary_line,
    build_route_preview_coordinates,
    region_for_preview,
    rider_meets_priority_threshold,
    smart_bounds_from_base_price,
    strip_addresses_for_driver_preview,
)
from push_notifications import send_push_notification
from enforcement_system import record_violation, check_user_status
from driver_compliance import check_driver_document_expiry, check_monthly_uploads
from auth_guard import require_authenticated, verify_trip_participant, verify_owner_strict

logger = logging.getLogger('server')
trips_router = APIRouter(prefix="/api", tags=["Trips"])

# Trip Guardian thresholds (production values, no mock logic).
GUARDIAN_MIN_MOVEMENT_KM = 0.03  # ~30m movement counts as driving
GUARDIAN_STOP_THRESHOLD_SECONDS = 120  # stationary for 2 minutes
GUARDIAN_PROMPT_COOLDOWN_SECONDS = 180  # avoid prompt spam
GUARDIAN_AUTO_ESCALATE_SECONDS = 35  # no rider response window

# Import shared state from server (will be set at inclusion time)
fare_estimate_store = {}
FARE_LOCK_MINUTES = 3

# Import shared functions from server (set at init time)
_get_directions_fn = None
_calculate_fare_fn = None
_calculate_distance_fn = None

def set_fare_estimate_store(store):
    global fare_estimate_store
    fare_estimate_store = store

def set_shared_functions(get_directions, calc_fare, calc_distance):
    global _get_directions_fn, _calculate_fare_fn, _calculate_distance_fn
    _get_directions_fn = get_directions
    _calculate_fare_fn = calc_fare
    _calculate_distance_fn = calc_distance

async def get_directions_from_google(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng):
    if _get_directions_fn:
        return await _get_directions_fn(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng)
    return None

def _normalize_service_type(service_type: Optional[str]) -> str:
    normalized = (service_type or "economy").strip().lower()
    return "economy" if normalized == "standard" else normalized


def calculate_fare(distance_km, duration_min, traffic_duration_min, service_type="economy", city="lagos"):
    normalized_service = _normalize_service_type(service_type)
    if _calculate_fare_fn:
        try:
            return _calculate_fare_fn(distance_km, duration_min, traffic_duration_min, normalized_service, city)
        except TypeError:
            return _calculate_fare_fn(distance_km, duration_min, traffic_duration_min, normalized_service)
    base = max(700, distance_km * 150)
    return {"base_fare": 300, "distance_fee": distance_km * 100, "time_fee": duration_min * 20, "traffic_fee": 0, "total_fare": base, "surge_multiplier": 1.0}

def calculate_distance_haversine(lat1, lon1, lat2, lon2):
    if _calculate_distance_fn:
        return _calculate_distance_fn(lat1, lon1, lat2, lon2)
    from math import radians, sin, cos, sqrt, atan2
    R = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
    return R * 2 * atan2(sqrt(a), sqrt(1-a))


SHIELD_LOW_RIDER_RATING = 3.5
SHIELD_MIN_TRIPS_FOR_FLAG = 3


async def _filter_drivers_who_blocked_rider(eligible: list, rider_id: str) -> list:
    """Remove drivers who put this rider on their personal blocklist (NEXRYDE Shield)."""
    if not eligible or not rider_id:
        return eligible
    driver_ids = [e["driver_id"] for e in eligible]
    users = await db.users.find(
        {"id": {"$in": driver_ids}},
        {"_id": 0, "id": 1, "blocked_riders": 1},
    ).to_list(len(driver_ids))
    blocked_map = {u["id"]: set(u.get("blocked_riders") or []) for u in users}
    return [e for e in eligible if rider_id not in blocked_map.get(e["driver_id"], set())]


def enrich_trip_offer_preview(trip: dict) -> dict:
    """Add simplified route preview, then redact exact addresses (pre-acceptance)."""
    t = dict(trip)
    pl = t.get("pickup_location") or {}
    dl = t.get("dropoff_location") or {}
    if (
        not t.get("route_preview_coordinates")
        and isinstance(pl, dict)
        and isinstance(dl, dict)
        and pl.get("lat") is not None
        and dl.get("lat") is not None
    ):
        t["route_preview_coordinates"] = build_route_preview_coordinates(
            float(pl["lat"]),
            float(pl["lng"]),
            float(dl["lat"]),
            float(dl["lng"]),
            t.get("polyline"),
        )
    if not t.get("map_preview_region") and isinstance(pl, dict) and isinstance(dl, dict):
        if pl.get("lat") is not None and dl.get("lat") is not None:
            t["map_preview_region"] = region_for_preview(
                float(pl["lat"]),
                float(pl["lng"]),
                float(dl["lat"]),
                float(dl["lng"]),
            )
    return strip_addresses_for_driver_preview(t)


async def attach_rider_shield_to_trips(trips: list) -> None:
    """
    Enrich trip payloads for drivers: rider reputation from driver-submitted ratings only.
    `user.rating` for a rider role is maintained in rate_trip when drivers rate riders.
    """
    rider_ids = list({t.get("rider_id") for t in trips if t.get("rider_id")})
    if not rider_ids:
        return
    users = await db.users.find(
        {"id": {"$in": rider_ids}},
        {"_id": 0, "id": 1, "rating": 1, "rider_reputation_trip_count": 1, "shield_rider_flag": 1, "name": 1},
    ).to_list(len(rider_ids))
    by_id = {u["id"]: u for u in users}
    for t in trips:
        rid = t.get("rider_id")
        u = by_id.get(rid) or {}
        cnt = int(u.get("rider_reputation_trip_count") or 0)
        avg = float(u.get("rating") or 0.0)
        insufficient = cnt < SHIELD_MIN_TRIPS_FOR_FLAG
        low = (not insufficient) and (
            bool(u.get("shield_rider_flag")) or avg < SHIELD_LOW_RIDER_RATING
        )
        t["shield"] = {
            "rider_reputation_avg": round(avg, 2) if cnt > 0 else None,
            "rider_reputation_trip_count": cnt,
            "rider_flagged_low_reputation": bool(low),
            "rider_new_account": bool(insufficient),
            "rider_display_name": (u.get("name") or "Rider")[:48],
        }


async def _log_trip_event(trip_id: str, event_type: str, actor_id: Optional[str], data: Optional[dict] = None):
    """Write immutable trust ledger event for a trip."""
    try:
        await db.trip_events.insert_one(
            {
                "id": str(uuid4()),
                "trip_id": trip_id,
                "event_type": event_type,
                "actor_id": actor_id,
                "data": data or {},
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
    except Exception as e:
        logger.warning(f"Trip event logging failed: {e}")


def _compute_visibility_score(stats: dict) -> float:
    """Driver visibility score used for ride ranking/visibility."""
    acceptance = float(stats.get("acceptance_rate", 0.0))
    completion = float(stats.get("completion_rate", 0.0))
    rating = float(stats.get("rating", 0.0))
    cancellations = float(stats.get("cancellations", 0.0))
    completed = float(stats.get("completed_trips", 0.0))

    score = (
        acceptance * 0.35
        + completion * 0.35
        + (min(rating, 5.0) / 5.0) * 100 * 0.20
        + min(completed, 200.0) / 200.0 * 100 * 0.10
    )
    score -= min(cancellations * 1.5, 25.0)
    return max(0.0, min(100.0, round(score, 2)))


async def _refresh_driver_visibility_score(driver_id: str):
    try:
        accepted = await db.trips.count_documents({"driver_id": driver_id, "status": {"$in": ["accepted", "ongoing", "completed"]}})
        completed = await db.trips.count_documents({"driver_id": driver_id, "status": "completed"})
        cancellations = await db.trips.count_documents({"driver_id": driver_id, "status": "cancelled", "cancelled_by": driver_id})
        user = await db.users.find_one({"id": driver_id}, {"_id": 0, "rating": 1}) or {}

        acceptance_rate = 100.0 if accepted == 0 else (completed / accepted) * 100.0
        completion_rate = acceptance_rate
        score = _compute_visibility_score(
            {
                "acceptance_rate": acceptance_rate,
                "completion_rate": completion_rate,
                "rating": float(user.get("rating", 4.5)),
                "cancellations": cancellations,
                "completed_trips": completed,
            }
        )

        await db.driver_profiles.update_one(
            {"user_id": driver_id},
            {
                "$set": {
                    "visibility_score": score,
                    "acceptance_rate": round(acceptance_rate, 2),
                    "completion_rate": round(completion_rate, 2),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            },
            upsert=True,
        )
    except Exception as e:
        logger.warning(f"Visibility score refresh failed for {driver_id}: {e}")


async def _driver_is_busy(driver_id: str) -> bool:
    active = await db.trips.find_one(
        {"driver_id": driver_id, "status": {"$in": ["accepted", "pickup", "ongoing"]}},
        {"_id": 0, "id": 1},
    )
    return active is not None


async def _get_eligible_drivers_for_trip(trip: dict, blocked_drivers: list[str]) -> list[dict]:
    pickup = trip.get("pickup_location") or {}
    if not isinstance(pickup, dict) or pickup.get("lat") is None or pickup.get("lng") is None:
        return []

    pickup_lat = float(pickup["lat"])
    pickup_lng = float(pickup["lng"])
    preferred_driver_id = trip.get("preferred_driver_id")
    service_type = trip.get("service_type")

    profiles = await db.driver_profiles.find(
        {"is_online": True, "verification_status": "approved"},
        {"_id": 0},
    ).to_list(500)

    eligible = []
    for profile in profiles:
        driver_id = profile.get("user_id")
        if not driver_id or driver_id in blocked_drivers:
            continue

        if await _driver_is_busy(driver_id):
            continue

        sub = await db.subscriptions.find_one(
            {"driver_id": driver_id, "status": {"$in": ["active", "trial", "grace_period"]}},
            {"_id": 0, "status": 1},
        )
        if not sub:
            continue

        loc = profile.get("current_location") or {}
        if not isinstance(loc, dict) or loc.get("lat") is None or loc.get("lng") is None:
            continue

        if service_type and profile.get("vehicle_type") and profile.get("vehicle_type") != service_type:
            # Keep preferred driver eligible even if vehicle type metadata is stale.
            if driver_id != preferred_driver_id:
                continue

        distance = calculate_distance_haversine(
            pickup_lat,
            pickup_lng,
            float(loc["lat"]),
            float(loc["lng"]),
        )
        if distance > 15 and driver_id != preferred_driver_id:
            continue

        eligible.append(
            {
                "driver_id": driver_id,
                "distance_to_pickup": round(distance, 2),
                "visibility_score": float(profile.get("visibility_score", 50.0)),
                "vehicle_type": profile.get("vehicle_type"),
            }
        )

    eligible = await _filter_drivers_who_blocked_rider(eligible, trip.get("rider_id") or "")

    eligible.sort(
        key=lambda d: (
            0 if d["driver_id"] == preferred_driver_id else 1,
            d["distance_to_pickup"],
            -d["visibility_score"],
        )
    )
    return eligible[:20]


async def _create_trip_offers(trip: dict, blocked_drivers: list[str]) -> list[dict]:
    eligible = await _get_eligible_drivers_for_trip(trip, blocked_drivers)
    now = datetime.now(timezone.utc)
    expires_at = (now + timedelta(seconds=90)).isoformat()
    offers = []

    if eligible:
        await db.trip_offers.delete_many({"trip_id": trip["id"], "status": {"$in": ["offered", "seen"]}})

    for driver in eligible:
        offer = {
            "id": str(uuid4()),
            "trip_id": trip["id"],
            "driver_id": driver["driver_id"],
            "rider_id": trip["rider_id"],
            "status": "offered",
            "distance_to_pickup": driver["distance_to_pickup"],
            "created_at": now.isoformat(),
            "expires_at": expires_at,
            "preferred": trip.get("preferred_driver_id") == driver["driver_id"],
        }
        offers.append(offer)

    if offers:
        await db.trip_offers.insert_many(offers)

    logger.info(
        "dispatch_trip trip_id=%s eligible_drivers=%s preferred_driver=%s",
        trip["id"],
        len(offers),
        trip.get("preferred_driver_id"),
    )
    await _log_trip_event(
        trip["id"],
        "trip_dispatch_created",
        trip["rider_id"],
        {
            "eligible_driver_ids": [o["driver_id"] for o in offers],
            "offer_count": len(offers),
        },
    )

    rider_name = "Rider"
    rider = await db.users.find_one({"id": trip["rider_id"]}, {"_id": 0, "name": 1})
    if rider and rider.get("name"):
        rider_name = rider["name"]

    for offer in offers:
        pickup_addr = (trip.get("pickup_location") or {}).get("address", "Pickup")
        dropoff_addr = (trip.get("dropoff_location") or {}).get("address", "Destination")
        route_hint = trip.get("area_summary_line") or area_summary_line(
            str(pickup_addr or ""),
            str(dropoff_addr or ""),
        )
        await send_push_notification(
            offer["driver_id"],
            "New Ride Request",
            f"{rider_name}: {route_hint}",
            {"type": "ride_request", "trip_id": trip["id"], "offer_id": offer["id"]},
        )
        logger.info(
            "dispatch_offer_sent trip_id=%s driver_id=%s preferred=%s",
            trip["id"],
            offer["driver_id"],
            offer["preferred"],
        )

    return offers


# ==================== CUSTOM PRICE TRIP ====================

class CustomPriceRequest(BaseModel):
    rider_id: str
    pickup: str
    destination: str
    pickup_lat: Optional[float] = None
    pickup_lng: Optional[float] = None
    dropoff_lat: Optional[float] = None
    dropoff_lng: Optional[float] = None
    recommended_fare: float
    offered_fare: float
    vehicle_type: str
    trip_type: str = "intra"


@trips_router.post("/trips/offer-custom-fare")
@trips_router.post("/trips/custom-price")
@trips_router.post("/trips/create-with-custom-price")
async def create_trip_with_custom_price(request: CustomPriceRequest, http_request: Request):
    """Create trip with user's custom price offer"""
    try:
        verify_owner_strict(http_request, request.rider_id)
        rider = await db.users.find_one({"id": request.rider_id})
        if not rider:
            raise HTTPException(status_code=404, detail="User not found")
        trip_id = f"trip-{int(time.time() * 1000)}"

        base_price = None
        min_price = None
        max_price = None
        smart_priority = False
        preview_coords = None
        map_region = None
        area_line = area_summary_line(request.pickup, request.destination)
        recommended_server = float(request.recommended_fare or 0)
        distance_km_out = None
        duration_min_out = None

        if (
            request.pickup_lat is not None
            and request.pickup_lng is not None
            and request.dropoff_lat is not None
            and request.dropoff_lng is not None
        ):
            route_data = await get_directions_from_google(
                request.pickup_lat,
                request.pickup_lng,
                request.dropoff_lat,
                request.dropoff_lng,
            )
            if route_data:
                distance_km = route_data["distance_meters"] / 1000
                duration_min = math.ceil(route_data["duration_seconds"] / 60)
                traffic_duration_min = math.ceil(route_data["duration_in_traffic_seconds"] / 60)
                poly = route_data.get("polyline")
            else:
                distance_km = calculate_distance_haversine(
                    request.pickup_lat,
                    request.pickup_lng,
                    request.dropoff_lat,
                    request.dropoff_lng,
                )
                duration_min = max(5, math.ceil((distance_km / 25) * 60))
                traffic_duration_min = duration_min
                poly = None
            normalized_vehicle = _normalize_service_type(request.vehicle_type)
            fare = calculate_fare(distance_km, duration_min, traffic_duration_min, normalized_vehicle, "lagos")
            base_price, min_price, max_price = smart_bounds_from_base_price(float(fare["total_fare"]))
            recommended_server = float(fare["total_fare"])
            if request.offered_fare < min_price - 0.5:
                raise HTTPException(
                    status_code=400,
                    detail=f"Minimum fare for this trip is ₦{min_price:,.0f}",
                )
            smart_priority = rider_meets_priority_threshold(request.offered_fare, base_price)
            preview_coords = build_route_preview_coordinates(
                request.pickup_lat,
                request.pickup_lng,
                request.dropoff_lat,
                request.dropoff_lng,
                poly,
            )
            map_region = region_for_preview(
                request.pickup_lat,
                request.pickup_lng,
                request.dropoff_lat,
                request.dropoff_lng,
            )
            distance_km_out = round(distance_km, 2)
            duration_min_out = duration_min

        difference_percent = (
            ((request.offered_fare - recommended_server) / recommended_server) * 100
            if recommended_server > 0
            else 0.0
        )
        trip = {
            "id": trip_id,
            "rider_id": request.rider_id,
            "pickup_location": {
                "lat": request.pickup_lat,
                "lng": request.pickup_lng,
                "address": request.pickup,
            } if request.pickup_lat is not None and request.pickup_lng is not None else request.pickup,
            "dropoff_location": {
                "lat": request.dropoff_lat,
                "lng": request.dropoff_lng,
                "address": request.destination,
            } if request.dropoff_lat is not None and request.dropoff_lng is not None else {
                "address": request.destination,
            },
            "destination": request.destination,
            "recommended_fare": recommended_server,
            "offered_fare": request.offered_fare,
            "final_fare": None,
            "vehicle_type": request.vehicle_type,
            "trip_type": request.trip_type,
            "status": "pending_driver_offers",
            "broadcast_radius_km": 10,
            "difference_percent": round(difference_percent, 1),
            "offers": [],
            "created_at": datetime.now(),
            "expires_at": datetime.now() + timedelta(minutes=10),
            "base_price": base_price,
            "min_price": min_price,
            "max_price": max_price,
            "distance_km": distance_km_out,
            "duration_mins": duration_min_out,
            "area_summary_line": area_line,
            "route_preview_coordinates": preview_coords,
            "map_preview_region": map_region,
            "smart_match_priority": smart_priority,
        }
        await db.trips.insert_one(trip)
        logger.info(f"Custom price trip created: {trip_id} with offer N{request.offered_fare}")
        drivers_notified = 0
        if (
            request.pickup_lat is not None
            and request.pickup_lng is not None
            and request.dropoff_lat is not None
            and request.dropoff_lng is not None
        ):
            blocked_drivers = rider.get("blocked_drivers", []) or []
            offers = await _create_trip_offers(trip, blocked_drivers)
            drivers_notified = len(offers)
        return {
            "success": True,
            "trip_id": trip_id,
            "drivers_notified": drivers_notified,
            "message": (
                f"Your offer of N{request.offered_fare:,.0f} has been broadcast to {drivers_notified} nearby drivers"
                if drivers_notified > 0
                else "Trip created. Please include pickup/dropoff coordinates to broadcast instantly."
            ),
            "recommended_fare": recommended_server,
            "offered_fare": request.offered_fare,
            "difference": request.offered_fare - recommended_server,
            "difference_percent": round(difference_percent, 1),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating custom price trip: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create custom price trip: {str(e)}")



class TripRequest(BaseModel):
    pickup_lat: float
    pickup_lng: float
    pickup_address: str
    dropoff_lat: float
    dropoff_lng: float
    dropoff_address: str
    service_type: Optional[str] = "economy"
    city: Optional[str] = "lagos"
    payment_method: str = "cash"
    fare_estimate_id: Optional[str] = None
    enable_recording: bool = False
    offered_fare: Optional[float] = None
    recommended_fare: Optional[float] = None
    trip_type: Optional[str] = None
    preferred_driver_id: Optional[str] = None


class ComfortRatingRequest(BaseModel):
    overall_rating: float
    smoothness: Optional[float] = None
    politeness: Optional[float] = None
    cleanliness: Optional[float] = None
    safety: Optional[float] = None
    comment: Optional[str] = None


class BookForOtherRequest(BaseModel):
    pickup_lat: float
    pickup_lng: float
    pickup_address: str
    dropoff_lat: float
    dropoff_lng: float
    dropoff_address: str
    rider_name: str
    rider_phone: str
    service_type: Optional[str] = "economy"
    city: Optional[str] = "lagos"
    payment_method: str = "cash"


class FaceVerificationRequest(BaseModel):
    face_image: str  # Base64 encoded image


class LocationUpdate(BaseModel):
    latitude: float
    longitude: float


# ==================== TRIP ENDPOINTS ====================

@trips_router.post("/trips/request")
async def request_trip(rider_id: str, request: TripRequest, http_request: Request):
    verify_owner_strict(http_request, rider_id)
    status_check = await check_user_status(rider_id)
    if not status_check.get("allowed", True):
        raise HTTPException(status_code=403, detail=status_check.get("message", "Account restricted"))
    if status_check.get("can_book") is False:
        raise HTTPException(status_code=403, detail=status_check.get("message", "Booking temporarily disabled"))
    
    normalized_service_type = _normalize_service_type(request.service_type)
    city = (request.city or "default").strip().lower()
    rider = await db.users.find_one({"id": rider_id})
    blocked_drivers = rider.get("blocked_drivers", []) if rider else []
    
    fare_data = None
    if request.fare_estimate_id and request.fare_estimate_id in fare_estimate_store:
        estimate = fare_estimate_store[request.fare_estimate_id]
        if datetime.utcnow() < estimate["expires_at"]:
            fare_data = estimate

    def _coord_match(est: dict) -> bool:
        pu = est.get("pickup") or {}
        du = est.get("dropoff") or {}
        try:
            return (
                abs(float(pu.get("lat", 0)) - float(request.pickup_lat)) < 0.004
                and abs(float(pu.get("lng", 0)) - float(request.pickup_lng)) < 0.004
                and abs(float(du.get("lat", 0)) - float(request.dropoff_lat)) < 0.004
                and abs(float(du.get("lng", 0)) - float(request.dropoff_lng)) < 0.004
            )
        except (TypeError, ValueError):
            return False

    if fare_data and not _coord_match(fare_data):
        fare_data = None

    if fare_data:
        distance_km = fare_data["distance_km"]
        duration_min = fare_data["duration_min"]
        fare = fare_data["fare"]
        polyline = fare_data.get("polyline")
    else:
        route_data = await get_directions_from_google(
            request.pickup_lat, request.pickup_lng,
            request.dropoff_lat, request.dropoff_lng
        )
        
        if route_data:
            distance_km = route_data["distance_meters"] / 1000
            duration_min = math.ceil(route_data["duration_seconds"] / 60)
            traffic_duration_min = math.ceil(route_data["duration_in_traffic_seconds"] / 60)
            polyline = route_data.get("polyline")
        else:
            distance_km = calculate_distance_haversine(
                request.pickup_lat, request.pickup_lng,
                request.dropoff_lat, request.dropoff_lng
            )
            duration_min = max(5, math.ceil((distance_km / 25) * 60))
            traffic_duration_min = duration_min
            polyline = None
        
        fare = calculate_fare(distance_km, duration_min, traffic_duration_min, normalized_service_type, city)

    if fare_data and fare_data.get("base_price") is not None:
        base_price = float(fare_data["base_price"])
        min_price = float(fare_data["min_price"])
        max_price = float(fare_data["max_price"])
        preview_coords = fare_data.get("route_preview_coordinates")
        map_region = fare_data.get("map_preview_region")
    else:
        base_price, min_price, max_price = smart_bounds_from_base_price(float(fare["total_fare"]))
        preview_coords = build_route_preview_coordinates(
            request.pickup_lat,
            request.pickup_lng,
            request.dropoff_lat,
            request.dropoff_lng,
            polyline,
        )
        map_region = region_for_preview(
            request.pickup_lat,
            request.pickup_lng,
            request.dropoff_lat,
            request.dropoff_lng,
        )

    area_line = area_summary_line(request.pickup_address, request.dropoff_address)

    if request.offered_fare is not None and request.offered_fare < min_price - 0.5:
        raise HTTPException(
            status_code=400,
            detail=f"Minimum fare for this trip is ₦{min_price:,.0f}",
        )

    final_fare = request.offered_fare if request.offered_fare is not None else fare["total_fare"]
    trip_status = "pending_driver_offers" if request.offered_fare is not None else "pending"
    smart_priority = rider_meets_priority_threshold(final_fare, base_price)

    trip_dict = {
        "id": str(uuid4()),
        "rider_id": rider_id,
        "pickup_location": {"lat": request.pickup_lat, "lng": request.pickup_lng, "address": request.pickup_address},
        "dropoff_location": {"lat": request.dropoff_lat, "lng": request.dropoff_lng, "address": request.dropoff_address},
        "distance_km": round(distance_km, 2),
        "duration_mins": duration_min,
        "base_fare": fare["base_fare"],
        "distance_fee": fare["distance_fee"],
        "time_fee": fare["time_fee"],
        "traffic_fee": fare["traffic_fee"],
        "fare": final_fare,
        "offered_fare": request.offered_fare,
        "recommended_fare": float(base_price),
        "base_price": base_price,
        "min_price": min_price,
        "max_price": max_price,
        "area_summary_line": area_line,
        "route_preview_coordinates": preview_coords,
        "map_preview_region": map_region,
        "smart_match_priority": smart_priority,
        "surge_multiplier": fare.get("surge_multiplier", 1.0),
        "service_type": normalized_service_type,
        "city": city,
        "status": trip_status,
        "payment_method": request.payment_method,
        "polyline": polyline,
        "recording_enabled": request.enable_recording,
        "fare_locked_until": (datetime.now(timezone.utc) + timedelta(minutes=FARE_LOCK_MINUTES)).isoformat(),
        "insurance_id": f"INS_{uuid4().hex[:8].upper()}",
        "security_code": str(random.randint(1000, 9999)),
        "security_code_verified": False,
        "security_code_attempts": 0,
        "is_monitored": True,
        "is_insured": True,
        "preferred_driver_id": request.preferred_driver_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "shield_recording_rider_opt_in": bool(request.enable_recording),
        "shield_recording_driver_opt_in": False,
        "shield_recording_active": False,
        "shield_recording_updated_at": None,
    }
    
    await db.trips.insert_one(trip_dict)
    trip_dict.pop("_id", None)
    offers = await _create_trip_offers(trip_dict, blocked_drivers)
    await _log_trip_event(
        trip_dict["id"],
        "trip_requested",
        rider_id,
        {
            "service_type": normalized_service_type,
            "city": city,
            "fare": final_fare,
            "pickup": request.pickup_address,
            "dropoff": request.dropoff_address,
            "eligible_drivers": len(offers),
        },
    )

    return {"message": "Trip requested", "trip": trip_dict, "eligible_drivers": len(offers)}

@trips_router.post("/trips/book-for-other")
async def book_for_other(booker_id: str, request: BookForOtherRequest, http_request: Request):
    verify_owner_strict(http_request, booker_id)
    normalized_service_type = _normalize_service_type(request.service_type)
    city = (request.city or "default").strip().lower()
    """Book a ride for family member or friend"""
    route_data = await get_directions_from_google(
        request.pickup_lat, request.pickup_lng,
        request.dropoff_lat, request.dropoff_lng
    )
    
    if route_data:
        distance_km = route_data["distance_meters"] / 1000
        duration_min = math.ceil(route_data["duration_seconds"] / 60)
        traffic_duration_min = math.ceil(route_data["duration_in_traffic_seconds"] / 60)
        polyline = route_data.get("polyline")
    else:
        distance_km = calculate_distance_haversine(
            request.pickup_lat, request.pickup_lng,
            request.dropoff_lat, request.dropoff_lng
        )
        duration_min = max(5, math.ceil((distance_km / 25) * 60))
        traffic_duration_min = duration_min
        polyline = None
    
    fare = calculate_fare(distance_km, duration_min, traffic_duration_min, normalized_service_type, city)
    base_price, min_price, max_price = smart_bounds_from_base_price(float(fare["total_fare"]))
    preview_coords = build_route_preview_coordinates(
        request.pickup_lat,
        request.pickup_lng,
        request.dropoff_lat,
        request.dropoff_lng,
        polyline,
    )
    map_region = region_for_preview(
        request.pickup_lat,
        request.pickup_lng,
        request.dropoff_lat,
        request.dropoff_lng,
    )
    area_line = area_summary_line(request.pickup_address, request.dropoff_address)

    trip_dict = {
        "id": str(uuid4()),
        "rider_id": booker_id,
        "pickup_location": {"lat": request.pickup_lat, "lng": request.pickup_lng, "address": request.pickup_address},
        "dropoff_location": {"lat": request.dropoff_lat, "lng": request.dropoff_lng, "address": request.dropoff_address},
        "distance_km": round(distance_km, 2),
        "duration_mins": duration_min,
        "base_fare": fare["base_fare"],
        "distance_fee": fare["distance_fee"],
        "time_fee": fare["time_fee"],
        "traffic_fee": fare["traffic_fee"],
        "fare": fare["total_fare"],
        "base_price": base_price,
        "min_price": min_price,
        "max_price": max_price,
        "area_summary_line": area_line,
        "route_preview_coordinates": preview_coords,
        "map_preview_region": map_region,
        "smart_match_priority": True,
        "surge_multiplier": fare.get("surge_multiplier", fare.get("multiplier", 1.0)),
        "service_type": normalized_service_type,
        "city": city,
        "status": "pending",
        "payment_method": request.payment_method,
        "polyline": polyline,
        "fare_locked_until": (datetime.now(timezone.utc) + timedelta(minutes=FARE_LOCK_MINUTES)).isoformat(),
        "insurance_id": f"INS_{uuid4().hex[:8].upper()}",
        "is_monitored": True,
        "is_insured": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "booked_for": {"name": request.rider_name, "phone": request.rider_phone},
        "shield_recording_rider_opt_in": False,
        "shield_recording_driver_opt_in": False,
        "shield_recording_active": False,
        "shield_recording_updated_at": None,
    }
    
    await db.trips.insert_one(trip_dict)
    trip_dict.pop("_id", None)
    booker = await db.users.find_one({"id": booker_id}, {"_id": 0, "blocked_drivers": 1}) or {}
    offers = await _create_trip_offers(trip_dict, booker.get("blocked_drivers", []))
    await _log_trip_event(
        trip_dict["id"],
        "trip_booked_for_other",
        booker_id,
        {
            "booked_for_phone": request.rider_phone,
            "service_type": normalized_service_type,
            "city": city,
            "eligible_drivers": len(offers),
        },
    )

    return {"message": "Trip booked for other person", "trip": trip_dict, "eligible_drivers": len(offers)}

@trips_router.get("/trips/pending")
async def get_pending_trips(driver_lat: float, driver_lng: float, request: Request, driver_id: Optional[str] = None):
    """Get pending ride requests near the driver"""
    auth_user_id = require_authenticated(request)
    effective_driver_id = driver_id or auth_user_id
    if effective_driver_id != auth_user_id:
        raise HTTPException(status_code=403, detail="You can only fetch pending rides for your own account")

    now_iso = datetime.now(timezone.utc).isoformat()
    offers = await db.trip_offers.find(
        {
            "driver_id": effective_driver_id,
            "status": {"$in": ["offered", "seen"]},
            "expires_at": {"$gte": now_iso},
        },
        {"_id": 0, "trip_id": 1, "id": 1, "expires_at": 1, "distance_to_pickup": 1, "preferred": 1},
    ).sort([("preferred", -1), ("created_at", -1)]).to_list(50)

    if not offers:
        return []

    trip_offer_map = {offer["trip_id"]: offer for offer in offers if offer.get("trip_id")}
    trip_ids = list(trip_offer_map.keys())
    trips = await db.trips.find(
        {
            "id": {"$in": trip_ids},
            "status": {"$in": ["pending", "pending_driver_offers"]},
        }
    ).to_list(50)
    
    nearby_trips = []
    for trip in trips:
        pickup = trip.get("pickup_location", {})
        # Handle both object and string pickup formats
        if isinstance(pickup, dict) and "lat" in pickup:
            lat = pickup["lat"]
            lng = pickup["lng"]
        elif isinstance(pickup, str):
            # Skip string pickups without coordinates
            trip["_id"] = str(trip["_id"])
            matched_offer = trip_offer_map.get(trip.get("id"), {})
            trip["distance_to_pickup"] = 0
            trip["offer_id"] = matched_offer.get("id")
            trip["offer_expires_at"] = matched_offer.get("expires_at")
            trip["preferred"] = matched_offer.get("preferred", False)
            nearby_trips.append(trip)
            continue
        else:
            continue
            
        distance = calculate_distance_haversine(driver_lat, driver_lng, lat, lng)
        if distance <= 15:  # 15km radius
            trip["_id"] = str(trip["_id"])
            matched_offer = trip_offer_map.get(trip.get("id"), {})
            trip["distance_to_pickup"] = round(distance, 2)
            trip["offer_id"] = matched_offer.get("id")
            trip["offer_expires_at"] = matched_offer.get("expires_at")
            trip["preferred"] = matched_offer.get("preferred", False)
            trip = enrich_trip_offer_preview(trip)
            nearby_trips.append(trip)
    
    # Trips that specifically requested this driver always appear first
    if effective_driver_id:
        preferred = [t for t in nearby_trips if t.get("preferred_driver_id") == effective_driver_id]
        others = [t for t in nearby_trips if t.get("preferred_driver_id") != effective_driver_id]
        others.sort(
            key=lambda x: (
                0 if x.get("smart_match_priority") else 1,
                x.get("distance_to_pickup", 0),
            )
        )
        nearby_trips = preferred + others
    else:
        nearby_trips.sort(key=lambda x: x.get("distance_to_pickup", 0))

    trip_limit = 10
    if effective_driver_id:
        profile = await db.driver_profiles.find_one({"user_id": effective_driver_id}, {"_id": 0, "visibility_score": 1})
        score = float((profile or {}).get("visibility_score", 50.0))
        if score >= 80:
            trip_limit = 12
        elif score >= 60:
            trip_limit = 10
        elif score >= 40:
            trip_limit = 7
        else:
            trip_limit = 5
    trimmed = nearby_trips[:trip_limit]
    await attach_rider_shield_to_trips(trimmed)
    return trimmed


@trips_router.get("/trips/offers/{driver_id}")
async def get_driver_trip_offers(driver_id: str, request: Request):
    verify_owner_strict(request, driver_id)
    """Get active trip offers assigned to a specific driver."""
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.trip_offers.update_many(
        {"driver_id": driver_id, "status": {"$in": ["offered", "seen"]}, "expires_at": {"$lt": now_iso}},
        {"$set": {"status": "expired", "expired_at": now_iso}},
    )

    offers = await db.trip_offers.find(
        {"driver_id": driver_id, "status": {"$in": ["offered", "seen"]}, "expires_at": {"$gte": now_iso}},
        {"_id": 0},
    ).sort([("preferred", -1), ("created_at", -1)]).to_list(20)
    if offers:
        await db.trip_offers.update_many(
            {"id": {"$in": [o["id"] for o in offers]}, "status": "offered"},
            {"$set": {"status": "seen", "seen_at": now_iso}},
        )

    hydrated = []
    for offer in offers:
        trip = await db.trips.find_one({"id": offer["trip_id"]}, {"_id": 0})
        if not trip or trip.get("status") not in ["pending", "pending_driver_offers"]:
            continue
        trip = enrich_trip_offer_preview(trip)
        hydrated.append(
            {
                **trip,
                "offer_id": offer["id"],
                "offer_expires_at": offer["expires_at"],
                "distance_to_pickup": offer.get("distance_to_pickup"),
                "preferred": offer.get("preferred", False),
            }
        )

    hydrated.sort(
        key=lambda x: (
            0 if x.get("smart_match_priority") else 1,
            0 if x.get("preferred") else 1,
        )
    )
    await attach_rider_shield_to_trips(hydrated)
    logger.info("dispatch_offer_fetch driver_id=%s active_offers=%s", driver_id, len(hydrated))
    return hydrated


@trips_router.put("/trips/offers/{offer_id}/decline")
async def decline_trip_offer(offer_id: str, request: dict, http_request: Request):
    driver_id = require_authenticated(http_request)

    result = await db.trip_offers.update_one(
        {"id": offer_id, "driver_id": driver_id, "status": {"$in": ["offered", "seen"]}},
        {"$set": {"status": "declined", "declined_at": datetime.now(timezone.utc).isoformat()}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Offer not found or already handled")

    await record_violation(driver_id, "ride_rejection")
    return {"message": "Offer declined"}

@trips_router.put("/trips/{trip_id}/accept")
async def accept_trip(trip_id: str, request: dict, http_request: Request):
    driver_id = require_authenticated(http_request)
    now_iso = datetime.now(timezone.utc).isoformat()
    
    status_check = await check_user_status(driver_id)
    if not status_check.get("allowed", True):
        raise HTTPException(status_code=403, detail=status_check.get("message", "Account restricted"))
    
    doc_status = await check_driver_document_expiry(driver_id)
    if not doc_status.get("compliant", True) and doc_status.get("expired"):
        expired_names = ", ".join(d["document"] for d in doc_status["expired"])
        raise HTTPException(status_code=403, detail=f"Cannot accept rides. Expired documents: {expired_names}. Please renew them.")

    monthly = await check_monthly_uploads(driver_id)
    if not monthly.get("compliant", True):
        missing = []
        if not monthly.get("interior_uploaded"):
            missing.append("vehicle interior photo")
        if not monthly.get("selfie_uploaded"):
            missing.append("driver selfie")
        raise HTTPException(status_code=403, detail=f"Monthly verification required. Please upload: {', '.join(missing)}")

    # Driver must have a valid, unexpired offer for this trip.
    requested_offer_id = (request or {}).get("offer_id")
    offer_query = {
        "trip_id": trip_id,
        "driver_id": driver_id,
        "status": {"$in": ["offered", "seen"]},
        "expires_at": {"$gte": now_iso},
    }
    if requested_offer_id:
        offer_query["id"] = requested_offer_id
    active_offer = await db.trip_offers.find_one(offer_query, {"_id": 0, "id": 1})
    if not active_offer:
        raise HTTPException(status_code=403, detail="Trip offer expired or unavailable for this driver")

    busy_trip = await db.trips.find_one(
        {"driver_id": driver_id, "status": {"$in": ["accepted", "arrived", "ongoing"]}, "id": {"$ne": trip_id}},
        {"_id": 0, "id": 1},
    )
    if busy_trip:
        raise HTTPException(status_code=409, detail="You already have an active trip. Complete it before accepting another.")

    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    rider_offer = float(trip.get("offered_fare") if trip.get("offered_fare") is not None else (trip.get("fare") or 0))
    base_p = float(trip.get("base_price") or trip.get("recommended_fare") or trip.get("fare") or rider_offer or 1.0)
    _, computed_min, computed_max = smart_bounds_from_base_price(base_p)
    max_p = float(trip.get("max_price") if trip.get("max_price") is not None else computed_max)
    min_p = float(trip.get("min_price") if trip.get("min_price") is not None else computed_min)

    proposed_raw = (request or {}).get("proposed_fare")
    if proposed_raw is None:
        proposed_fare = rider_offer if rider_offer > 0 else float(trip.get("fare") or 0)
    else:
        try:
            proposed_fare = float(proposed_raw)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid proposed_fare")
    if rider_offer > 0 and proposed_fare < rider_offer - 0.5:
        raise HTTPException(status_code=400, detail="Cannot propose a fare below the rider's offer")
    if proposed_fare > max_p + 0.5:
        raise HTTPException(status_code=400, detail=f"Maximum allowed price is ₦{max_p:,.0f}")
    if proposed_fare < min_p - 0.5:
        raise HTTPException(status_code=400, detail=f"Proposed fare must be at least ₦{min_p:,.0f}")

    driver_counter_val = None
    if trip.get("offered_fare") is not None and abs(proposed_fare - rider_offer) > 0.5:
        driver_counter_val = round(proposed_fare, 2)

    # Check if trip is inter-city
    is_intercity = trip.get("trip_type") == "inter"
    
    # Check subscription
    subscription = await db.subscriptions.find_one({
        "driver_id": driver_id,
        "status": {"$in": ["active", "trial", "grace_period"]}
    })
    
    if not subscription:
        raise HTTPException(status_code=403, detail="Active subscription required")

    # Driver has subscription - enforce trial/tier inter-city restrictions
    subscription_tier = subscription.get("tier", "city_rider")
    subscription_status = subscription.get("status")

    if subscription_status == "trial" and is_intercity:
        raise HTTPException(
            status_code=403,
            detail="Trial supports only city rides. Complete payment to unlock inter-city trips.",
        )

    if is_intercity and subscription_tier == "city_rider":
        raise HTTPException(
            status_code=403,
            detail="🚫 Inter-City trips locked! Upgrade to Road Warrior (₦30,000) to unlock all routes nationwide."
        )
    
    # Check if rider blocked this driver
    if trip:
        rider = await db.users.find_one({"id": trip["rider_id"]})
        if rider and driver_id in rider.get("blocked_drivers", []):
            raise HTTPException(status_code=403, detail="You cannot accept this ride")
    
    result = await db.trips.update_one(
        {"id": trip_id, "status": {"$in": ["pending", "pending_driver_offers"]}},
        {
            "$set": {
                "driver_id": driver_id,
                "status": "accepted",
                "accepted_at": datetime.utcnow(),
                "accepted_offer_id": active_offer["id"],
                "fare": round(proposed_fare, 2),
                "agreed_fare": round(proposed_fare, 2),
                "driver_counter_fare": driver_counter_val,
            }
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Trip not available")
    
    trip = await db.trips.find_one({"id": trip_id})
    if trip:
        r_opt = bool(trip.get("shield_recording_rider_opt_in") or trip.get("recording_enabled"))
        d_opt = bool(trip.get("shield_recording_driver_opt_in"))
        await db.trips.update_one(
            {"id": trip_id},
            {"$set": {"shield_recording_active": r_opt and d_opt}},
        )
        trip = await db.trips.find_one({"id": trip_id})
        trip["_id"] = str(trip["_id"])
        driver_user = await db.users.find_one({"id": driver_id}, {"_id": 0, "name": 1}) or {}
        driver_profile = await db.driver_profiles.find_one({"user_id": driver_id}, {"_id": 0}) or {}
        await db.trips.update_one(
            {"id": trip_id},
            {"$set": {
                "driver_name": driver_user.get("name", "Driver"),
                "vehicle_type": driver_profile.get("vehicle_type"),
                "vehicle_model": driver_profile.get("vehicle_model"),
                "vehicle_plate": driver_profile.get("vehicle_plate") or driver_profile.get("vehicle_plate_number"),
                "vehicle_color": driver_profile.get("vehicle_color"),
                "driver_bank_name": driver_profile.get("bank_name"),
                "driver_account_number": driver_profile.get("account_number"),
                "driver_account_name": driver_profile.get("account_name"),
                "payment_status": "pending",
            }}
        )
        trip.update({
            "driver_name": driver_user.get("name", "Driver"),
            "vehicle_type": driver_profile.get("vehicle_type"),
            "vehicle_model": driver_profile.get("vehicle_model"),
            "vehicle_plate": driver_profile.get("vehicle_plate") or driver_profile.get("vehicle_plate_number"),
            "vehicle_color": driver_profile.get("vehicle_color"),
            "driver_bank_name": driver_profile.get("bank_name"),
            "driver_account_number": driver_profile.get("account_number"),
            "driver_account_name": driver_profile.get("account_name"),
            "payment_status": "pending",
        })
    await db.trip_offers.update_many(
        {"trip_id": trip_id, "status": {"$in": ["offered", "seen", "declined", "expired"]}},
        {
            "$set": {
                "status": "closed",
                "closed_at": datetime.now(timezone.utc).isoformat(),
                "accepted_by": driver_id,
                "accepted_offer_id": active_offer["id"],
            }
        },
    )
    await _log_trip_event(trip_id, "trip_accepted", driver_id, {})
    await _refresh_driver_visibility_score(driver_id)
    if trip and trip.get("rider_id"):
        driver_user = await db.users.find_one({"id": driver_id}, {"name": 1})
        driver_name = (driver_user or {}).get("name", "Your driver")
        await send_push_notification(
            trip["rider_id"],
            "Driver Found!",
            f"{driver_name} has accepted your ride. They're on their way!",
            {"type": "trip_accepted", "trip_id": trip_id},
        )
    return trip


@trips_router.post("/trips/{trip_id}/verify-security-code")
async def verify_security_code(trip_id: str, request: dict, http_request: Request):
    """Driver verifies the security code shown to rider"""
    driver_id = require_authenticated(http_request)
    security_code = request.get("security_code", "")
    
    if not security_code:
        raise HTTPException(status_code=400, detail="security_code is required")
    
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    
    if trip["status"] not in ["accepted", "arrived"]:
        raise HTTPException(status_code=400, detail="Trip must be accepted first")
    
    if trip["driver_id"] != driver_id:
        raise HTTPException(status_code=403, detail="You are not the driver for this trip")
    
    # Check if already verified
    if trip.get("security_code_verified", False):
        trip["_id"] = str(trip["_id"])
        return {
            "verified": True,
            "message": "Security code already verified",
            "trip": trip
        }
    
    # Check attempts
    attempts = trip.get("security_code_attempts", 0)
    if attempts >= 3:
        # Too many failed attempts - cancel trip for safety
        await db.trips.update_one(
            {"id": trip_id},
            {"$set": {"status": "cancelled", "cancel_reason": "Too many wrong security code attempts"}}
        )
        raise HTTPException(
            status_code=403,
            detail="Too many wrong attempts. Trip cancelled for safety."
        )
    
    # Verify code
    if trip.get("security_code") == security_code:
        # Code matches - mark as verified
        await db.trips.update_one(
            {"id": trip_id},
            {"$set": {
                "security_code_verified": True,
                "security_code_verified_at": datetime.utcnow()
            }}
        )
        
        updated_trip = await db.trips.find_one({"id": trip_id})
        if updated_trip:
            updated_trip["_id"] = str(updated_trip["_id"])
        await _log_trip_event(trip_id, "security_code_verified", driver_id, {})
        return {
            "verified": True,
            "message": "Security code verified successfully! Rider identity confirmed.",
            "trip": updated_trip
        }
    else:
        # Code doesn't match - increment attempts
        new_attempts = attempts + 1
        await db.trips.update_one(
            {"id": trip_id},
            {"$set": {"security_code_attempts": new_attempts}}
        )
        
        remaining = 3 - new_attempts
        if remaining == 0:
            await db.trips.update_one(
                {"id": trip_id},
                {"$set": {"status": "cancelled", "cancel_reason": "Too many wrong security code attempts"}}
            )
            await _log_trip_event(trip_id, "security_code_failed_lockout", driver_id, {"attempts": new_attempts})
            raise HTTPException(
                status_code=403,
                detail="Wrong code. Trip cancelled for safety."
            )
        await _log_trip_event(trip_id, "security_code_failed", driver_id, {"attempts": new_attempts})
        
        raise HTTPException(
            status_code=400,
            detail=f"Wrong security code. {remaining} attempt{'s' if remaining > 1 else ''} remaining."
        )

@trips_router.put("/trips/{trip_id}/verify-face-and-start")
async def verify_face_and_start_trip(trip_id: str, request: FaceVerificationRequest, http_request: Request):
    """Verify driver face LIVE and start trip. Face verification is MANDATORY."""
    if os.environ.get("ALLOW_FACE_VERIFICATION_MOCK", "false").lower() != "true":
        raise HTTPException(
            status_code=503,
            detail="Live face verification provider is required. Mock verification is disabled in production.",
        )
    driver_id = require_authenticated(http_request)
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.get("driver_id") != driver_id:
        raise HTTPException(status_code=403, detail="Only the assigned driver can verify face and start trip")
    
    if trip["status"] not in ["accepted", "arrived"]:
        raise HTTPException(status_code=400, detail="Trip must be accepted or driver must be at pickup first")
    
    if not request.face_image or len(request.face_image) < 100:
        raise HTTPException(status_code=400, detail="Live face photo is required before starting any ride")

    await db.face_verifications.insert_one({
        "driver_id": driver_id,
        "trip_id": trip_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "verification_type": "ride_start_live",
        "verified": True,
        "match_confidence": 95.0,
    })
    await db.driver_profiles.update_one(
        {"user_id": driver_id},
        {"$set": {"last_face_verification": datetime.now(timezone.utc).isoformat(), "face_verified_today": True}}
    )
    face_verified = True
    
    await db.trips.update_one(
        {"id": trip_id},
        {"$set": {
            "status": "ongoing",
            "started_at": datetime.utcnow(),
            "face_verified_at_start": face_verified
        }}
    )
    
    trip = await db.trips.find_one({"id": trip_id})
    trip["_id"] = str(trip["_id"])
    await _log_trip_event(trip_id, "face_verified_trip_start", trip.get("driver_id"), {"verified": face_verified})
    return {"trip": trip, "face_verified": face_verified}

@trips_router.put("/trips/{trip_id}/start")
async def start_trip(trip_id: str, request: Request):
    driver_id = require_authenticated(request)
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if trip.get("driver_id") != driver_id:
        raise HTTPException(status_code=403, detail="Only the assigned driver can start this trip")

    if not trip.get("face_verified_at_start"):
        raise HTTPException(
            status_code=403,
            detail="Live face verification is required before starting any ride. Please verify your face first."
        )

    result = await db.trips.update_one(
        {"id": trip_id, "status": {"$in": ["accepted", "arrived"]}},
        {"$set": {"status": "ongoing", "started_at": datetime.utcnow()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Cannot start trip")
    
    trip = await db.trips.find_one({"id": trip_id})
    trip["_id"] = str(trip["_id"])
    await _log_trip_event(trip_id, "trip_started", trip.get("driver_id"), {})
    return trip


@trips_router.put("/trips/{trip_id}/arrive")
async def arrive_at_pickup(trip_id: str, request: dict, http_request: Request):
    driver_id = require_authenticated(http_request)
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(http_request, trip)

    if trip.get("driver_id") != driver_id:
        raise HTTPException(status_code=403, detail="Only the assigned driver can mark arrival")
    if trip.get("status") != "accepted":
        raise HTTPException(status_code=400, detail="Trip must be accepted before arrival")

    await db.trips.update_one(
        {"id": trip_id},
        {"$set": {"status": "arrived", "arrived_at": datetime.utcnow()}}
    )
    updated = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    await _log_trip_event(trip_id, "driver_arrived_pickup", driver_id, {})
    if updated and updated.get("rider_id"):
        await send_push_notification(
            updated["rider_id"],
            "Driver Arrived",
            "Your driver has arrived at the pickup point. Show your security code before starting the ride.",
            {"type": "driver_arrived", "trip_id": trip_id},
        )
    return updated

@trips_router.put("/trips/{trip_id}/update-location")
async def update_trip_location(trip_id: str, request: LocationUpdate, http_request: Request):
    """Update trip route and run Trip Guardian safety monitoring."""
    location_point = {
        "lat": request.latitude,
        "lng": request.longitude,
        "timestamp": datetime.utcnow().isoformat()
    }
    
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(http_request, trip)
    actor_id = require_authenticated(http_request)
    if actor_id != trip.get("driver_id"):
        raise HTTPException(status_code=403, detail="Only the assigned driver can update trip location")
    
    actual_route = trip.get("actual_route", [])
    now = datetime.utcnow()
    route_deviation = False
    moved_km = 0.0

    # Trip Guardian only applies while ride is active.
    status = str(trip.get("status", "")).lower()
    guardian_enabled = status in {"accepted", "ongoing"}

    guardian_state = trip.get("guardian_state") or {}
    stationary_since = guardian_state.get("stationary_since")
    pending_check_id = guardian_state.get("pending_check_id")
    last_prompt_at = guardian_state.get("last_prompt_at")

    if actual_route:
        last_point = actual_route[-1]
        if all(k in last_point for k in ("lat", "lng")):
            moved_km = calculate_distance_haversine(
                float(last_point["lat"]),
                float(last_point["lng"]),
                float(request.latitude),
                float(request.longitude),
            )

    if moved_km >= GUARDIAN_MIN_MOVEMENT_KM:
        stationary_since = None
        pending_check_id = None
    elif guardian_enabled:
        if not stationary_since:
            stationary_since = now.isoformat()

    abnormal_stop = False
    guardian_alert = trip.get("guardian_alert")

    if guardian_enabled and stationary_since:
        try:
            stationary_since_dt = datetime.fromisoformat(stationary_since)
        except Exception:
            stationary_since_dt = now
            stationary_since = now.isoformat()
        stationary_seconds = int((now - stationary_since_dt).total_seconds())
        abnormal_stop = stationary_seconds >= GUARDIAN_STOP_THRESHOLD_SECONDS

        # Auto-escalate pending prompt when rider doesn't respond.
        if pending_check_id:
            check = await db.safety_checks.find_one({"id": pending_check_id})
            if check and check.get("status") == "pending":
                created_at_raw = check.get("created_at")
                try:
                    if isinstance(created_at_raw, str):
                        created_dt = datetime.fromisoformat(created_at_raw)
                    else:
                        created_dt = created_at_raw or now
                    unresolved_for = int((now - created_dt).total_seconds())
                except Exception:
                    unresolved_for = 0

                if unresolved_for >= GUARDIAN_AUTO_ESCALATE_SECONDS and not check.get("auto_escalated"):
                    await db.safety_checks.update_one(
                        {"id": pending_check_id},
                        {
                            "$set": {
                                "status": "auto_escalated",
                                "auto_escalated": True,
                                "escalated_at": now.isoformat(),
                            }
                        },
                    )
                    await db.sos_alerts.insert_one({
                        "id": str(uuid.uuid4()),
                        "trip_id": trip_id,
                        "user_id": trip.get("rider_id", ""),
                        "user_role": "rider",
                        "location": {"lat": request.latitude, "lng": request.longitude},
                        "auto_triggered": True,
                        "status": "active",
                        "source": "trip_guardian_no_response",
                        "created_at": now,
                    })
                    guardian_alert = {
                        "active": True,
                        "check_id": pending_check_id,
                        "type": "abnormal_stop",
                        "message": "We could not confirm rider safety. Emergency escalation started.",
                        "stop_duration_seconds": stationary_seconds,
                        "location": {"lat": request.latitude, "lng": request.longitude},
                        "escalated": True,
                        "triggered_at": now.isoformat(),
                    }

        # Create new rider safety check if abnormal stop persists and no active check.
        if abnormal_stop and not pending_check_id:
            can_prompt = True
            if last_prompt_at:
                try:
                    last_prompt_dt = datetime.fromisoformat(last_prompt_at)
                    can_prompt = (now - last_prompt_dt).total_seconds() >= GUARDIAN_PROMPT_COOLDOWN_SECONDS
                except Exception:
                    can_prompt = True

            if can_prompt:
                check_id = str(uuid.uuid4())
                await db.safety_checks.insert_one({
                    "id": check_id,
                    "trip_id": trip_id,
                    "check_type": "abnormal_stop",
                    "status": "pending",
                    "location": {"lat": request.latitude, "lng": request.longitude},
                    "stop_duration_seconds": stationary_seconds,
                    "created_at": now.isoformat(),
                })
                pending_check_id = check_id
                last_prompt_at = now.isoformat()
                guardian_alert = {
                    "active": True,
                    "check_id": check_id,
                    "type": "abnormal_stop",
                    "message": "We noticed your driver stopped for a while. Are you safe?",
                    "stop_duration_seconds": stationary_seconds,
                    "location": {"lat": request.latitude, "lng": request.longitude},
                    "triggered_at": now.isoformat(),
                }

    # Clear stale guardian alert once movement resumes.
    if moved_km >= GUARDIAN_MIN_MOVEMENT_KM and guardian_alert:
        guardian_alert = None

    await db.trips.update_one(
        {"id": trip_id},
        {
            "$push": {"actual_route": location_point},
            "$set": {
                "route_deviation_detected": route_deviation,
                "abnormal_stop_detected": abnormal_stop,
                "guardian_alert": guardian_alert,
                "guardian_state": {
                    "stationary_since": stationary_since,
                    "pending_check_id": pending_check_id,
                    "last_prompt_at": last_prompt_at,
                    "last_moved_km": round(moved_km, 4),
                    "updated_at": now.isoformat(),
                },
            },
        },
    )
    await _log_trip_event(
        trip_id,
        "location_update",
        trip.get("driver_id"),
        {
            "lat": request.latitude,
            "lng": request.longitude,
            "abnormal_stop": abnormal_stop,
            "guardian_alert_active": bool(guardian_alert),
        },
    )

    return {
        "location_updated": True,
        "route_deviation": route_deviation,
        "abnormal_stop": abnormal_stop,
        "guardian_alert_active": bool(guardian_alert),
    }


@trips_router.get("/trips/{trip_id}/status")
async def get_trip_status(trip_id: str, request: Request):
    """Return trip status with optional driver live-location snapshot."""
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(request, trip)

    driver_info = None
    driver_location = None
    driver_moving = False

    driver_id = trip.get("driver_id")
    if driver_id:
        user = await db.users.find_one({"id": driver_id}) or {}
        profile = await db.driver_profiles.find_one({"user_id": driver_id}) or {}
        loc = (profile.get("current_location") or {})

        if isinstance(loc, dict) and loc.get("lat") is not None and loc.get("lng") is not None:
            driver_location = {
                "lat": float(loc.get("lat")),
                "lng": float(loc.get("lng")),
                "updated_at": loc.get("updated_at"),
            }

        actual_route = trip.get("actual_route") or []
        if len(actual_route) >= 2:
            p1 = actual_route[-2]
            p2 = actual_route[-1]
            if all(k in p1 for k in ("lat", "lng")) and all(k in p2 for k in ("lat", "lng")):
                moved_km = calculate_distance_haversine(
                    float(p1["lat"]),
                    float(p1["lng"]),
                    float(p2["lat"]),
                    float(p2["lng"]),
                )
                driver_moving = moved_km >= 0.03  # ~30 meters+

        driver_info = {
            "driver_id": driver_id,
            "name": user.get("name", "Driver"),
            "rating": user.get("rating", 4.5),
            "vehicle": profile.get("vehicle_model") or "Vehicle",
            "plate": profile.get("vehicle_plate") or "",
            "color": profile.get("vehicle_color") or "",
            "is_online": bool(profile.get("is_online")),
            "is_moving": driver_moving,
            "bank_name": profile.get("bank_name"),
            "account_number": profile.get("account_number"),
            "account_name": profile.get("account_name"),
        }

    return {
        "success": True,
        "trip_id": trip_id,
        "status": trip.get("status"),
        "payment_status": trip.get("payment_status"),
        "payment_method": trip.get("payment_method"),
        "driver_info": driver_info,
        "driver_location": driver_location,
        "guardian_alert": trip.get("guardian_alert"),
    }

@trips_router.put("/trips/{trip_id}/complete")
async def complete_trip(trip_id: str, request: Request):
    trip_before = await db.trips.find_one({"id": trip_id})
    if not trip_before:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(request, trip_before)
    actor_id = require_authenticated(request)
    if actor_id != trip_before.get("driver_id"):
        raise HTTPException(status_code=403, detail="Only the assigned driver can complete this trip")
    direct_payment = str(trip_before.get("payment_method", "cash")).lower() in {"cash", "transfer", "bank_transfer"}
    result = await db.trips.update_one(
        {"id": trip_id, "status": "ongoing"},
        {"$set": {
            "status": "completed",
            "completed_at": datetime.utcnow(),
            "payment_status": "pending" if direct_payment else "completed",
        }}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Cannot complete trip")
    
    trip = await db.trips.find_one({"id": trip_id})
    
    # Update stats
    if trip.get("driver_id"):
        await db.users.update_one({"id": trip["driver_id"]}, {"$inc": {"total_trips": 1}})
        # Update streak
        await db.users.update_one(
            {"id": trip["driver_id"]},
            {"$inc": {"streaks.current": 1}}
        )
        # Trial expiration is strictly time-based (48h), unlimited city rides during trial.
    
    await db.users.update_one({"id": trip["rider_id"]}, {"$inc": {"total_trips": 1}})
    
    trip["_id"] = str(trip["_id"])
    await _log_trip_event(trip_id, "trip_completed", trip.get("driver_id"), {"fare": trip.get("fare")})
    if trip.get("driver_id"):
        await _refresh_driver_visibility_score(trip["driver_id"])
    if trip.get("rider_id"):
        await send_push_notification(
            trip["rider_id"],
            "Trip Completed",
            f"Your trip is complete. Fare: ₦{trip.get('fare', 0):,.0f}",
            {"type": "trip_completed", "trip_id": trip_id},
        )
    if trip.get("driver_id"):
        await send_push_notification(
            trip["driver_id"],
            "Trip Completed",
            f"Trip completed! ₦{trip.get('fare', 0):,.0f} earned.",
            {"type": "trip_completed", "trip_id": trip_id},
        )
    return trip


@trips_router.put("/trips/{trip_id}/confirm-payment")
async def confirm_trip_payment(trip_id: str, request: Request):
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(request, trip)

    actor_id = require_authenticated(request)
    if actor_id != trip.get("rider_id"):
        raise HTTPException(status_code=403, detail="Only the rider can confirm payment")

    if trip.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Payment can only be confirmed after trip completion")
    if trip.get("payment_status") == "completed":
        return {"success": True, "payment_status": "completed", "message": "Payment already confirmed"}

    await db.trips.update_one(
        {"id": trip_id},
        {"$set": {"payment_status": "completed", "paid_at": datetime.utcnow()}},
    )
    await _log_trip_event(trip_id, "payment_confirmed", actor_id, {"payment_status": "completed"})
    return {"success": True, "payment_status": "completed", "message": "Payment confirmed"}

@trips_router.put("/trips/{trip_id}/cancel")
async def cancel_trip(trip_id: str, request: dict, http_request: Request):
    cancelled_by = require_authenticated(http_request)
    
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(http_request, trip)
    
    if trip["status"] in ["completed", "cancelled"]:
        raise HTTPException(status_code=400, detail="Cannot cancel this trip")
    
    await db.trips.update_one(
        {"id": trip_id},
        {"$set": {"status": "cancelled", "cancelled_by": cancelled_by, "cancelled_at": datetime.utcnow()}}
    )
    await _log_trip_event(trip_id, "trip_cancelled", cancelled_by, {})
    
    if cancelled_by == trip.get("driver_id"):
        await db.driver_profiles.update_one(
            {"user_id": cancelled_by},
            {"$inc": {"cancellation_count": 1}}
        )
        await db.users.update_one(
            {"id": cancelled_by},
            {"$set": {"streaks.current": 0}}
        )
        await _refresh_driver_visibility_score(cancelled_by)
        enforcement_result = await record_violation(cancelled_by, "driver_cancellation", trip_id)
    else:
        enforcement_result = await record_violation(cancelled_by, "rider_cancellation", trip_id)
    
    return {"message": "Trip cancelled", "enforcement": enforcement_result}

@trips_router.put("/trips/{trip_id}/rate")
async def rate_trip(trip_id: str, rater_id: str, request: ComfortRatingRequest, http_request: Request):
    """Rate trip with comfort ratings"""
    auth_user_id = require_authenticated(http_request)
    if auth_user_id != rater_id:
        raise HTTPException(status_code=403, detail="You can only rate trips with your own account")
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    if auth_user_id not in {trip.get("rider_id"), trip.get("driver_id")}:
        raise HTTPException(status_code=403, detail="You do not have permission to rate this trip")
    
    if trip["status"] != "completed":
        raise HTTPException(status_code=400, detail="Can only rate completed trips")
    
    is_rider_rating = rater_id == trip["rider_id"]
    update_field = "driver_rating" if is_rider_rating else "rider_rating"
    rated_user_id = trip["driver_id"] if is_rider_rating else trip["rider_id"]
    
    update_data = {update_field: request.overall_rating}
    
    if is_rider_rating and request.smoothness:
        update_data["comfort_ratings"] = {
            "smoothness": request.smoothness,
            "politeness": request.politeness,
            "cleanliness": request.cleanliness,
            "safety": request.safety
        }
        update_data["rating_comment"] = request.comment
        
        # Update driver comfort ratings
        if rated_user_id:
            profile = await db.driver_profiles.find_one({"user_id": rated_user_id})
            if profile:
                # Calculate new averages
                for rating_type in ["smoothness", "politeness", "cleanliness", "safety"]:
                    if getattr(request, rating_type):
                        current = profile.get(f"{rating_type}_rating", 5.0)
                        new_rating = (current + getattr(request, rating_type)) / 2
                        await db.driver_profiles.update_one(
                            {"user_id": rated_user_id},
                            {"$set": {f"{rating_type}_rating": round(new_rating, 1)}}
                        )
    
    await db.trips.update_one({"id": trip_id}, {"$set": update_data})
    await _log_trip_event(
        trip_id,
        "trip_rated",
        rater_id,
        {"overall_rating": request.overall_rating, "is_rider_rating": is_rider_rating},
    )
    
    # Update user rating
    if rated_user_id:
        if is_rider_rating:
            ratings = await db.trips.find(
                {"driver_id": rated_user_id, "driver_rating": {"$exists": True}}
            ).to_list(1000)
            if ratings:
                avg_rating = sum(r["driver_rating"] for r in ratings) / len(ratings)
                await db.users.update_one({"id": rated_user_id}, {"$set": {"rating": round(avg_rating, 1)}})
                await _refresh_driver_visibility_score(rated_user_id)
        else:
            ratings = await db.trips.find(
                {"rider_id": rated_user_id, "rider_rating": {"$exists": True}}
            ).to_list(1000)
            if ratings:
                avg_rating = sum(r["rider_rating"] for r in ratings) / len(ratings)
                cnt = len(ratings)
                await db.users.update_one(
                    {"id": rated_user_id},
                    {
                        "$set": {
                            "rating": round(avg_rating, 1),
                            "rider_reputation_trip_count": cnt,
                            "shield_rider_flag": cnt >= SHIELD_MIN_TRIPS_FOR_FLAG and avg_rating < SHIELD_LOW_RIDER_RATING,
                        }
                    },
                )
    
    return {"message": "Rating submitted"}

@trips_router.get("/trips/user/{user_id}")
async def get_user_trips(user_id: str, request: Request, role: str = "rider"):
    verify_owner_strict(request, user_id)
    if role == "rider":
        trips = await db.trips.find({"rider_id": user_id}).sort("created_at", -1).to_list(50)
    else:
        trips = await db.trips.find({"driver_id": user_id}).sort("created_at", -1).to_list(50)
    
    for trip in trips:
        trip["_id"] = str(trip["_id"])
    return trips

@trips_router.get("/trips/user/{user_id}/with-driver/{driver_id}")
async def get_trips_with_driver(user_id: str, driver_id: str, request: Request):
    """Get ride history between a rider and a specific driver"""
    verify_owner_strict(request, user_id)
    trips = await db.trips.find({
        "rider_id": user_id,
        "driver_id": driver_id,
        "status": "completed",
    }).sort("created_at", -1).to_list(20)
    for trip in trips:
        trip["_id"] = str(trip["_id"])
    return {
        "trips": trips,
        "total_rides": len(trips),
        "total_spent": sum(float(t.get("fare", 0)) for t in trips),
    }

@trips_router.get("/trips/{trip_id}")
async def get_trip(trip_id: str, request: Request):
    trip = await db.trips.find_one({"id": trip_id})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(request, trip)
    trip["_id"] = str(trip["_id"])
    return trip


@trips_router.get("/trips/{trip_id}/ledger")
async def get_trip_trust_ledger(trip_id: str, request: Request):
    """Return immutable trust timeline for support/safety review."""
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0, "id": 1, "status": 1, "driver_id": 1, "rider_id": 1})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    verify_trip_participant(request, trip)
    events = await db.trip_events.find({"trip_id": trip_id}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    return {"success": True, "trip": trip, "events": events}

