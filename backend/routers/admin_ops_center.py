"""
Enterprise Operations Center APIs — search, trip/rider ops, dispatch monitor, fraud, maps usage.
Extends existing admin panel without replacing routes.
"""
from __future__ import annotations

import asyncio
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from database import db
from pii_encryption import strip_sensitive_pii
from route_cache import get_api_usage_summary
from routers.admin import require_admin_access
from routers.admin_ops import (
    _coerce_date_expr,
    _safe_aggregate,
    _safe_count,
    _system_health_internal,
)

admin_ops_center_router = APIRouter(
    prefix="/api",
    tags=["Admin Operations Center"],
    dependencies=[Depends(require_admin_access)],
)


@admin_ops_center_router.get("/admin/search")
async def global_search(q: str = Query(..., min_length=2), limit: int = Query(20, le=50)):
    """Search drivers, riders, trips by name, phone, email, plate, ID."""
    term = q.strip()
    if not term:
        return {"results": []}
    rx = re.compile(re.escape(term), re.IGNORECASE)
    results: list[dict[str, Any]] = []

    if len(term) >= 6:
        trip = await db.trips.find_one({"id": term}, {"_id": 0, "id": 1, "status": 1, "rider_id": 1, "driver_id": 1})
        if trip:
            results.append({"type": "trip", "id": trip["id"], "label": f"Trip {trip['id'][:8]}…", "status": trip.get("status"), "path": f"/trips/{trip['id']}"})

    driver_q = {
        "$or": [
            {"role": "driver", "id": term},
            {"role": "driver", "phone": {"$regex": term}},
            {"role": "driver", "email": {"$regex": term, "$options": "i"}},
            {"role": "driver", "name": {"$regex": term, "$options": "i"}},
        ]
    }
    riders_q = {
        "$or": [
            {"role": "rider", "id": term},
            {"role": "rider", "phone": {"$regex": term}},
            {"role": "rider", "email": {"$regex": term, "$options": "i"}},
            {"role": "rider", "name": {"$regex": term, "$options": "i"}},
        ]
    }

    drivers, riders = await asyncio.gather(
        db.users.find(driver_q, {"_id": 0, "id": 1, "name": 1, "phone": 1, "verification_status": 1}).limit(limit).to_list(limit),
        db.users.find(riders_q, {"_id": 0, "id": 1, "name": 1, "phone": 1}).limit(limit).to_list(limit),
    )
    for d in drivers:
        results.append({
            "type": "driver", "id": d["id"], "label": d.get("name") or d.get("phone"),
            "sub": d.get("phone"), "status": d.get("verification_status"), "path": f"/drivers/{d['id']}",
        })
    for r in riders:
        results.append({
            "type": "rider", "id": r["id"], "label": r.get("name") or r.get("phone"),
            "sub": r.get("phone"), "path": f"/riders/{r['id']}",
        })

    if rx and len(term) >= 3:
        plate_profiles = await db.driver_profiles.find(
            {"$or": [
                {"vehicle_plate": {"$regex": term, "$options": "i"}},
                {"vehicle_plate_number": {"$regex": term, "$options": "i"}},
            ]},
            {"_id": 0, "user_id": 1, "vehicle_plate": 1, "vehicle_plate_number": 1},
        ).limit(10).to_list(10)
        for p in plate_profiles:
            uid = p.get("user_id")
            if uid and not any(x["id"] == uid for x in results if x["type"] == "driver"):
                results.append({
                    "type": "driver", "id": uid,
                    "label": f"Plate {p.get('vehicle_plate_number') or p.get('vehicle_plate')}",
                    "sub": "vehicle plate match", "path": f"/drivers/{uid}",
                })

    return {"query": term, "results": results[:limit]}


def _trip_timeline_events(trip: dict) -> list[dict]:
    events = []
    mapping = [
        ("created_at", "ride_requested", "Ride requested"),
        ("accepted_at", "driver_accepted", "Driver accepted"),
        ("arrived_at", "driver_arrived", "Driver arrived at pickup"),
        ("started_at", "trip_started", "Trip started"),
        ("completed_at", "trip_completed", "Trip completed"),
        ("cancelled_at", "trip_cancelled", "Trip cancelled"),
    ]
    for field, etype, label in mapping:
        ts = trip.get(field)
        if ts:
            events.append({"type": etype, "label": label, "timestamp": ts})
    if trip.get("cancel_reason"):
        events.append({"type": "cancel_reason", "label": f"Cancel reason: {trip['cancel_reason']}", "timestamp": trip.get("cancelled_at") or trip.get("updated_at")})
    events.sort(key=lambda e: str(e.get("timestamp") or ""))
    return events


@admin_ops_center_router.get("/admin/trips/{trip_id}/operations-detail")
async def trip_operations_detail(trip_id: str):
    trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    rider = await db.users.find_one({"id": trip.get("rider_id")}, {"_id": 0, "name": 1, "phone": 1, "id": 1})
    driver = None
    if trip.get("driver_id"):
        driver = await db.users.find_one({"id": trip.get("driver_id")}, {"_id": 0, "name": 1, "phone": 1, "id": 1})

    offers = await db.trip_offers.find({"trip_id": trip_id}, {"_id": 0}).sort("created_at", 1).to_list(100)
    dispatch_events = []
    for o in offers:
        dispatch_events.append({
            "type": "offer_sent",
            "label": f"Offer sent to driver {str(o.get('driver_id', ''))[:8]}",
            "timestamp": o.get("created_at"),
            "status": o.get("status"),
            "driver_id": o.get("driver_id"),
            "reason": o.get("decline_reason") or o.get("skip_reason"),
        })
    dispatch_events.extend(_trip_timeline_events(trip))

    tracking = await db.trip_tracking.find_one({"trip_id": trip_id}, {"_id": 0}) or {}
    gps_points = tracking.get("speed_logs") or tracking.get("locations") or []

    transactions = await db.transactions.find({"trip_id": trip_id}, {"_id": 0}).to_list(20)

    return {
        "trip": trip,
        "rider": rider,
        "driver": driver,
        "timeline": sorted(dispatch_events, key=lambda e: str(e.get("timestamp") or "")),
        "dispatch_offers": offers,
        "fare_breakdown": {
            "fare": trip.get("fare"),
            "base_fare": trip.get("base_fare"),
            "surge_multiplier": trip.get("surge_multiplier"),
            "payment_method": trip.get("payment_method"),
            "distance_km": trip.get("distance_km"),
            "duration_min": trip.get("duration_min") or trip.get("duration_minutes"),
        },
        "gps_history": gps_points[-200:] if isinstance(gps_points, list) else [],
        "transactions": transactions,
        "ratings": {
            "driver_rating": trip.get("driver_rating"),
            "rider_rating": trip.get("rider_rating"),
        },
    }


@admin_ops_center_router.get("/admin/dispatch/monitor")
async def dispatch_monitor(limit: int = Query(50, le=200)):
    """Live dispatch control room — pending trips + recent offer activity."""
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)

    pending_trips = await db.trips.find(
        {"status": {"$in": ["pending", "pending_driver_offers"]}},
        {"_id": 0},
    ).sort("created_at", 1).limit(limit).to_list(limit)

    recent_offers = await db.trip_offers.find(
        {},
        {"_id": 0},
    ).sort("created_at", -1).limit(100).to_list(100)

    (
        waiting_requests,
        en_route,
        in_progress,
        completed_today,
        cancelled_today,
        online_drivers,
        offline_drivers,
    ) = await asyncio.gather(
        _safe_count(lambda: db.trips.count_documents({"status": {"$in": ["pending", "pending_driver_offers"]}})),
        _safe_count(lambda: db.trips.count_documents({"status": "accepted"})),
        _safe_count(lambda: db.trips.count_documents({"status": {"$in": ["arrived", "ongoing", "picked_up", "in_progress"]}})),
        _safe_count(lambda: db.trips.count_documents({"status": "completed", "created_at": {"$gte": today}})),
        _safe_count(lambda: db.trips.count_documents({"status": "cancelled", "created_at": {"$gte": today}})),
        _safe_count(lambda: db.driver_profiles.count_documents({"is_online": True})),
        _safe_count(lambda: db.driver_profiles.count_documents({"is_online": {"$ne": True}})),
    )

    return {
        "ts": now.isoformat(),
        "counts": {
            "ride_requests_waiting": waiting_requests,
            "drivers_en_route": en_route,
            "trips_in_progress": in_progress,
            "completed_today": completed_today,
            "cancelled_today": cancelled_today,
            "online_drivers": online_drivers,
            "offline_drivers": offline_drivers,
            "broadcast_queue": waiting_requests,
        },
        "pending_trips": pending_trips,
        "recent_offers": recent_offers,
    }


@admin_ops_center_router.get("/admin/dispatch/events")
async def dispatch_events(trip_id: Optional[str] = None, limit: int = Query(100, le=500)):
    q: dict[str, Any] = {}
    if trip_id:
        q["trip_id"] = trip_id
    offers = await db.trip_offers.find(q, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    if trip_id:
        trip = await db.trips.find_one({"id": trip_id}, {"_id": 0})
        timeline = _trip_timeline_events(trip or {})
    else:
        timeline = []
    return {"offers": offers, "timeline": timeline, "count": len(offers)}


@admin_ops_center_router.get("/admin/maps-usage")
async def maps_usage_dashboard(days: int = Query(7, le=90)):
    """Google Maps API usage dashboard with cost estimates."""
    rows = await get_api_usage_summary(db, days=days)
    total_real = sum(r.get("real_calls", 0) for r in rows)
    total_cached = sum(r.get("cached_hits", 0) for r in rows)
    total_all = total_real + total_cached
    cost_per_call_ngn = 8
    daily_cost = total_real * cost_per_call_ngn / max(days, 1)
    monthly_est = daily_cost * 30
    budget_ngn = 500_000
    by_api: dict[str, int] = {}
    for r in rows:
        api = r.get("api_type") or r.get("endpoint") or "directions"
        by_api[api] = by_api.get(api, 0) + int(r.get("real_calls") or 0)

    return {
        "period_days": days,
        "total_calls": total_all,
        "real_google_calls": total_real,
        "cached_hits": total_cached,
        "cache_hit_rate_pct": round((total_cached / total_all * 100) if total_all else 0, 1),
        "estimated_daily_cost_ngn": round(daily_cost, 2),
        "estimated_monthly_cost_ngn": round(monthly_est, 2),
        "budget_ngn": budget_ngn,
        "remaining_budget_ngn": round(max(0, budget_ngn - monthly_est), 2),
        "budget_alert": monthly_est > budget_ngn * 0.8,
        "by_api": by_api,
        "daily_breakdown": rows,
        "apis": {
            "directions": by_api.get("directions", 0),
            "routes": by_api.get("routes", 0),
            "places": by_api.get("places", 0),
            "geocoding": by_api.get("geocoding", 0),
            "distance_matrix": by_api.get("distance_matrix", 0),
        },
    }


@admin_ops_center_router.get("/admin/fraud/flags")
async def fraud_flags(limit: int = Query(50, le=200)):
    """Suspicious accounts and abuse indicators."""
    flags = []

    dup_phones = await db.users.aggregate([
        {"$match": {"phone": {"$exists": True, "$ne": None}}},
        {"$group": {"_id": "$phone", "count": {"$sum": 1}, "user_ids": {"$push": "$id"}}},
        {"$match": {"count": {"$gt": 1}}},
        {"$limit": 20},
    ]).to_list(20)
    for row in dup_phones:
        flags.append({
            "type": "duplicate_phone",
            "severity": "high",
            "detail": f"Phone {row['_id']} used by {row['count']} accounts",
            "user_ids": row.get("user_ids", []),
        })

    high_cancel = await db.trips.aggregate([
        {"$match": {"status": "cancelled"}},
        {"$group": {"_id": "$driver_id", "count": {"$sum": 1}}},
        {"$match": {"count": {"$gte": 10}, "_id": {"$ne": None}}},
        {"$sort": {"count": -1}},
        {"$limit": 15},
    ]).to_list(15)
    for row in high_cancel:
        flags.append({
            "type": "excessive_cancellations",
            "severity": "medium",
            "driver_id": row["_id"],
            "detail": f"{row['count']} cancelled trips",
        })

    blacklist = await db.trial_blacklist.find({"status": "active"}, {"_id": 0}).limit(limit).to_list(limit)
    for b in blacklist:
        flags.append({
            "type": "blacklisted_phone",
            "severity": "high",
            "phone": b.get("phone"),
            "reason": b.get("reason"),
        })

    return {"flags": flags[:limit], "total": len(flags)}


@admin_ops_center_router.get("/admin/notifications/delivery-stats")
async def notification_delivery_stats(days: int = Query(7, le=90)):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    since_iso = since.isoformat()
    pipeline = [
        {"$match": {"created_at": {"$gte": since_iso}}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    try:
        by_status = await db.notification_events.aggregate(pipeline).to_list(20)
    except Exception:
        by_status = []

    counts = {str(r["_id"]): r["count"] for r in by_status}
    sent = sum(counts.values())
    failed = counts.get("failed", 0) + counts.get("error", 0)

    recent_failures = await db.notification_events.find(
        {"status": {"$in": ["failed", "error"]}},
        {"_id": 0},
    ).sort("created_at", -1).limit(30).to_list(30)

    return {
        "period_days": days,
        "sent": sent,
        "delivered": counts.get("delivered", 0) + counts.get("sent", 0),
        "opened": counts.get("opened", 0),
        "clicked": counts.get("clicked", 0),
        "failed": failed,
        "by_status": counts,
        "recent_failures": recent_failures,
    }


@admin_ops_center_router.get("/admin/live-map-data")
async def live_map_data():
    """Drivers, active trips, and demand zones for live map."""
    drivers = await db.driver_profiles.find(
        {"current_location": {"$exists": True}},
        {"_id": 0, "user_id": 1, "is_online": 1, "current_location": 1, "last_location_at": 1},
    ).limit(500).to_list(500)
    enriched = []
    for p in drivers:
        u = await db.users.find_one({"id": p.get("user_id")}, {"_id": 0, "name": 1, "phone": 1})
        enriched.append({**p, "name": (u or {}).get("name"), "phone": (u or {}).get("phone")})

    active_trips = await db.trips.find(
        {"status": {"$in": ["pending", "pending_driver_offers", "accepted", "arrived", "ongoing"]}},
        {"_id": 0, "id": 1, "status": 1, "pickup_location": 1, "dropoff_location": 1, "driver_id": 1, "rider_id": 1},
    ).limit(200).to_list(200)

    return {"drivers": enriched, "trips": active_trips, "ts": datetime.now(timezone.utc).isoformat()}
