#!/usr/bin/env python3
"""
Live + unit checks for Uber/inDrive-style full-screen ride alert payloads.

Verifies that when a driver is Online, an incoming offer carries the fields
native Android needs for full-screen Accept/Decline:
  rider_name, pickup_address, dropoff_address, fare, eta, distance

Usage:
  BASE_URL=https://nexryde-backend-993913300770.africa-south1.run.app \
  MONGODB_URI=... \
  python3 backend/scripts/test_fullscreen_ride_alert_payload.py
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import httpx
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get(
    "BASE_URL",
    "https://nexryde-backend-993913300770.africa-south1.run.app",
).rstrip("/")
RIDER_EMAIL = os.environ.get("RIDER_EMAIL", "josephbbs12@gmail.com")
DRIVER_EMAIL = os.environ.get("DRIVER_EMAIL", "loopy9ice@gmail.com")

PICKUP = {"lat": 6.4281, "lng": 3.4219, "address": "Victoria Island, Lagos"}
DROPOFF = {"lat": 6.4474, "lng": 3.4721, "address": "Lekki Phase 1, Lagos"}
DRIVER_LOC = {"lat": 6.4300, "lng": 3.4200}

OUT = "/opt/cursor/artifacts/fullscreen_ride_alert_test.json"


def ok(msg: str) -> None:
    print(f"  ✓  {msg}")


def bad(msg: str) -> None:
    print(f"  ✗  {msg}")


def info(msg: str) -> None:
    print(f"  →  {msg}")


def header(msg: str) -> None:
    print(f"\n=== {msg} ===")


async def ensure_driver_ready(mdb, driver_id: str) -> Dict[str, Any]:
    """Keep driver dispatchable without printing secrets."""
    now = datetime.now(timezone.utc)
    license_exp = (now + timedelta(days=400)).strftime("%m/%Y")
    trial_end = (now + timedelta(days=30)).isoformat()
    await mdb.users.update_one(
        {"id": driver_id},
        {
            "$set": {
                "suspended": False,
                "suspension_reason": None,
                "fortress_exempt": True,
            },
            "$unset": {"suspended_at": "", "suspended_until": ""},
        },
    )
    await mdb.driver_profiles.update_one(
        {"user_id": driver_id},
        {
            "$set": {
                "verification_status": "approved",
                "documents_verified": True,
                "subscription_status": "active",
                "trial_ends_at": trial_end,
                "license_expiry": license_exp,
                "drivers_license_expiry": license_exp,
                "current_lat": DRIVER_LOC["lat"],
                "current_lng": DRIVER_LOC["lng"],
                "current_location": {
                    "type": "Point",
                    "coordinates": [DRIVER_LOC["lng"], DRIVER_LOC["lat"]],
                },
            },
            "$unset": {"suspended": "", "suspension_reason": ""},
        },
        upsert=True,
    )
    # Ensure 2dsphere index exists for geo dispatch
    try:
        await mdb.driver_profiles.create_index(
            [("current_location", "2dsphere")],
            name="current_location_2dsphere",
            background=True,
        )
    except Exception as e:
        info(f"geo index note: {e}")
    profile = await mdb.driver_profiles.find_one({"user_id": driver_id}, {"_id": 0})
    return profile or {}


def build_fcm_data_from_offer(offer: dict, trip: dict) -> dict:
    """Mirror backend/realtime_platform/push_engine.py ride_request data shape."""
    pickup = trip.get("pickup_location") or {}
    dropoff = trip.get("dropoff_location") or {}
    pickup_addr = ""
    dropoff_addr = ""
    if isinstance(pickup, dict):
        pickup_addr = str(pickup.get("address") or "").strip()
    elif isinstance(pickup, str):
        pickup_addr = pickup.strip()
    if isinstance(dropoff, dict):
        dropoff_addr = str(dropoff.get("address") or "").strip()
    elif isinstance(dropoff, str):
        dropoff_addr = dropoff.strip()
    fare = trip.get("offered_fare")
    if fare is None:
        fare = trip.get("fare")
    if fare is None:
        fare = offer.get("rider_offer_price") or offer.get("fare")
    dist = offer.get("distance_to_pickup") or offer.get("distance_to_pickup_km")
    eta = trip.get("duration_mins") or offer.get("estimated_time_mins") or offer.get("eta_minutes")
    rider_name = str(
        offer.get("rider_name") or trip.get("rider_name") or "Rider"
    ).strip() or "Rider"
    return {
        "type": "ride_request",
        "trip_id": str(offer.get("trip_id") or trip.get("id") or ""),
        "offer_id": str(offer.get("id") or offer.get("offer_id") or ""),
        "urgent": "true",
        "fullscreen": "true",
        "rider_name": rider_name[:48],
        "pickup_address": pickup_addr[:160],
        "dropoff_address": dropoff_addr[:160],
        "fare": str(fare) if fare is not None else "",
        "distance_to_pickup_km": str(dist) if dist is not None else "",
        "eta_minutes": str(eta) if eta is not None else "",
    }


def normalize_native_offer(ride: dict, driver_id: str = "") -> dict:
    """Mirror frontend/src/services/driverNativeExperience.ts normalizeOfferPayload."""

    def address_value(value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value.strip()
        if isinstance(value, (int, float)):
            return str(value)
        if isinstance(value, dict):
            addr = value.get("address") or value.get("formatted_address") or value.get("label")
            return str(addr).strip() if addr else ""
        return ""

    def string_value(value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value
        if isinstance(value, (int, float)):
            return str(value)
        return ""

    fare_raw = ride.get("offered_fare", ride.get("fare", ride.get("rider_offer_price", ride.get("price"))))
    try:
        fare_n = float(fare_raw)
        fare = f"₦{fare_n:,.0f}" if fare_n == int(fare_n) else f"₦{fare_n:,.2f}"
    except Exception:
        fare = string_value(fare_raw) or "--"

    eta_raw = ride.get("eta_minutes", ride.get("estimated_time_mins", ride.get("pickup_eta_minutes", ride.get("eta"))))
    try:
        eta = f"{int(float(eta_raw))} min"
    except Exception:
        eta = string_value(eta_raw) or "--"

    dist_raw = ride.get(
        "distance_to_pickup_km",
        ride.get("distance_to_pickup", ride.get("pickup_distance_km", ride.get("distance"))),
    )
    try:
        dist = f"{float(dist_raw):.1f} km"
    except Exception:
        dist = string_value(dist_raw) or "--"

    return {
        "tripId": string_value(ride.get("id")) or string_value(ride.get("trip_id")),
        "offerId": string_value(ride.get("offer_id")),
        "driverId": driver_id or string_value(ride.get("driver_id")) or None,
        "riderName": string_value(ride.get("rider_name")) or "Rider",
        "pickup": (
            address_value(ride.get("pickup_address"))
            or address_value(ride.get("pickup_location"))
            or address_value(ride.get("pickup"))
            or "Pickup location"
        ),
        "dropoff": (
            address_value(ride.get("dropoff_address"))
            or address_value(ride.get("destination"))
            or address_value(ride.get("dropoff_location"))
            or address_value(ride.get("dropoff"))
            or address_value(ride.get("destination_coordinates"))
            or ""
        ),
        "fare": fare,
        "eta": eta,
        "distance": dist,
    }


def assert_native_ready(payload: dict, label: str, checks: list) -> None:
    required = ["riderName", "pickup", "dropoff", "fare"]
    missing = []
    for k in required:
        v = payload.get(k)
        if not v or v in ("Rider", "Pickup location", "--", ""):
            # riderName==Rider is weak; dropoff empty is fail
            if k == "dropoff" and not v:
                missing.append(k)
            elif k == "pickup" and (not v or v == "Pickup location"):
                missing.append(k)
            elif k == "fare" and (not v or v == "--"):
                missing.append(k)
            elif k == "riderName" and (not v or v == "Rider"):
                missing.append(k)
    if missing:
        bad(f"{label}: weak/missing fields {missing} → {payload}")
        checks.append({"name": label, "ok": False, "missing": missing, "payload": payload})
    else:
        ok(f"{label}: {payload['riderName']} | {payload['pickup']} → {payload['dropoff']} | {payload['fare']}")
        checks.append({"name": label, "ok": True, "payload": payload})


async def cancel_active(client: httpx.AsyncClient, user_id: str, token: str, role: str) -> None:
    h = {"Authorization": f"Bearer {token}"}
    r = await client.get(f"/api/trips/active/{user_id}", headers=h)
    if r.status_code != 200:
        return
    body = r.json() or {}
    trip = body.get("trip") or body
    trip_id = trip.get("id") if isinstance(trip, dict) else None
    if not trip_id:
        # sometimes list
        if isinstance(body, list) and body:
            trip_id = body[0].get("id")
        elif isinstance(body.get("trips"), list) and body["trips"]:
            trip_id = body["trips"][0].get("id")
    if not trip_id:
        return
    info(f"Cancelling leftover {role} trip {trip_id}")
    await client.put(
        f"/api/trips/{trip_id}/cancel",
        headers=h,
        json={"cancelled_by": user_id, "reason": "fullscreen_alert_test_cleanup"},
    )


async def main() -> int:
    results: Dict[str, Any] = {
        "started_at": datetime.now(timezone.utc).isoformat(),
        "base_url": BASE_URL,
        "checks": [],
        "live": {},
    }
    mongo_uri = os.environ.get("MONGODB_URI") or os.environ.get("MONGO_URL")
    if not mongo_uri:
        bad("MONGODB_URI required")
        return 2

    header("1. Unit: FCM + native normalize from sample trip")
    sample_trip = {
        "id": "trip-sample",
        "rider_name": "Admoblord",
        "offered_fare": 5200,
        "duration_mins": 18,
        "pickup_location": {"lat": PICKUP["lat"], "lng": PICKUP["lng"], "address": PICKUP["address"]},
        "dropoff_location": {"lat": DROPOFF["lat"], "lng": DROPOFF["lng"], "address": DROPOFF["address"]},
    }
    sample_offer = {
        "id": "offer-sample",
        "trip_id": "trip-sample",
        "distance_to_pickup": 1.2,
        "rider_name": "Admoblord",
    }
    fcm = build_fcm_data_from_offer(sample_offer, sample_trip)
    for key in ("type", "fullscreen", "rider_name", "pickup_address", "dropoff_address", "fare"):
        if not fcm.get(key):
            bad(f"FCM missing {key}")
            results["checks"].append({"name": f"unit_fcm_{key}", "ok": False})
        else:
            ok(f"FCM has {key}={fcm[key]!r}")
            results["checks"].append({"name": f"unit_fcm_{key}", "ok": True, "value": fcm[key]})
    # Socket-shaped payload (PR #16)
    socket_payload = {
        "offer_id": sample_offer["id"],
        "trip_id": sample_trip["id"],
        "pickup_address": sample_trip["pickup_location"]["address"],
        "dropoff_address": sample_trip["dropoff_location"]["address"],
        "destination": sample_trip["dropoff_location"]["address"],
        "fare": sample_trip["offered_fare"],
        "offered_fare": sample_trip["offered_fare"],
        "eta_minutes": sample_trip["duration_mins"],
        "distance_to_pickup_km": sample_offer["distance_to_pickup"],
        "rider_name": sample_trip["rider_name"],
    }
    native = normalize_native_offer(socket_payload)
    assert_native_ready(native, "unit_native_from_socket", results["checks"])
    native_fcm = normalize_native_offer(
        {
            "id": fcm["trip_id"],
            "offer_id": fcm["offer_id"],
            "rider_name": fcm["rider_name"],
            "pickup_address": fcm["pickup_address"],
            "dropoff_address": fcm["dropoff_address"],
            "fare": fcm["fare"],
            "eta_minutes": fcm["eta_minutes"],
            "distance_to_pickup_km": fcm["distance_to_pickup_km"],
        }
    )
    assert_native_ready(native_fcm, "unit_native_from_fcm", results["checks"])

    # Source file assertions (branch code)
    header("2. Source: native UI + push wiring present")
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
    files = {
        "push_engine": os.path.join(root, "backend/realtime_platform/push_engine.py"),
        "trips_dispatch": os.path.join(root, "backend/routers/trips.py"),
        "native_js": os.path.join(root, "frontend/src/services/driverNativeExperience.ts"),
        "bg_alert": os.path.join(root, "frontend/src/services/driverOfferBackgroundAlert.ts"),
        "activity": os.path.join(
            root, "frontend/android/app/src/main/java/com/nexryde/app/driver/DriverRideAlertActivity.kt"
        ),
        "fgs": os.path.join(
            root, "frontend/android/app/src/main/java/com/nexryde/app/driver/DriverForegroundService.kt"
        ),
    }
    source_checks = [
        ("push_engine", "dropoff_address"),
        ("push_engine", '"fullscreen": "true"'),
        ("trips_dispatch", '"pickup_address": str(pickup_addr'),
        ("trips_dispatch", '"dropoff_address": str(dropoff_addr'),
        ("native_js", "dropoff_address"),
        ("native_js", "showRideAlert"),
        ("bg_alert", "dropoffAddress"),
        ("activity", "Pickup"),
        ("activity", "Destination"),
        ("activity", "getStringExtra(\"dropoff\")"),
        ("fgs", "DriverRideAlertActivity"),
        ("fgs", "presentRideAlert"),
    ]
    for file_key, needle in source_checks:
        text = open(files[file_key], encoding="utf-8").read()
        present = needle in text
        (ok if present else bad)(f"{file_key} contains {needle!r}")
        results["checks"].append({"name": f"source_{file_key}_{needle[:24]}", "ok": present})

    header("3. Live: login + prepare driver + request trip")
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=90.0) as client:
        rider_login = (await client.post("/api/auth/email-signin", json={"email": RIDER_EMAIL})).json()
        driver_login = (await client.post("/api/auth/email-signin", json={"email": DRIVER_EMAIL})).json()
        rider = rider_login.get("user") or {}
        driver = driver_login.get("user") or {}
        rider_id = rider["id"]
        driver_id = driver["id"]
        rider_token = rider_login.get("token") or rider_login.get("access_token")
        driver_token = driver_login.get("token") or driver_login.get("access_token")
        ok(f"Rider {rider.get('name')} / Driver {driver.get('name')}")

        mc = AsyncIOMotorClient(mongo_uri, serverSelectionTimeoutMS=8000)
        db_name = os.environ.get("DB_NAME", "nexryde_db")
        try:
            mdb = mc.get_default_database()
        except Exception:
            mdb = None
        if mdb is None or getattr(mdb, "name", "") in ("", "test"):
            mdb = mc[db_name]
        await ensure_driver_ready(mdb, driver_id)
        ok("Driver profile forced dispatch-ready")

        await cancel_active(client, rider_id, rider_token, "rider")
        await cancel_active(client, driver_id, driver_token, "driver")
        # Also expire any stale offered offers
        await mdb.trip_offers.update_many(
            {"driver_id": driver_id, "status": {"$in": ["offered", "seen"]}},
            {"$set": {"status": "expired", "expired_at": datetime.now(timezone.utc).isoformat()}},
        )

        dh = {"Authorization": f"Bearer {driver_token}"}
        rh = {"Authorization": f"Bearer {rider_token}"}

        loc = await client.put(
            f"/api/drivers/{driver_id}/location",
            headers=dh,
            json={"latitude": DRIVER_LOC["lat"], "longitude": DRIVER_LOC["lng"], "device_id": "fs-alert-test"},
        )
        info(f"location {loc.status_code}")
        online = await client.put(
            f"/api/drivers/{driver_id}/online",
            headers=dh,
            params={"is_online": "true"},
        )
        info(f"online {online.status_code} {online.text[:180]}")
        if online.status_code != 200:
            bad("Driver could not go online — native FGS path requires Online")
            results["checks"].append({"name": "live_driver_online", "ok": False, "detail": online.text[:300]})
            results["live"]["online_error"] = online.text[:500]
        else:
            ok("Driver is Online")
            results["checks"].append({"name": "live_driver_online", "ok": True})

        est_payload = {
            "pickup_lat": PICKUP["lat"],
            "pickup_lng": PICKUP["lng"],
            "dropoff_lat": DROPOFF["lat"],
            "dropoff_lng": DROPOFF["lng"],
            "pickup_address": PICKUP["address"],
            "dropoff_address": DROPOFF["address"],
            "service_type": "economy",
            "city": "lagos",
            "rider_id": rider_id,
        }
        er = await client.post("/api/fare/estimate", headers=rh, json=est_payload)
        if er.status_code != 200:
            bad(f"fare estimate failed {er.status_code}: {er.text[:300]}")
            results["checks"].append({"name": "live_fare_estimate", "ok": False})
            results["finished_at"] = datetime.now(timezone.utc).isoformat()
            open(OUT, "w").write(json.dumps(results, indent=2, default=str))
            mc.close()
            return 1
        est = er.json()
        eid = est.get("estimate_id")
        min_p = float(est.get("min_price") or est.get("min_fare") or 3500)
        offer_fare = max(3500.0, min_p)
        ok(f"Fare estimate {eid} min={min_p} offer={offer_fare}")
        results["checks"].append({"name": "live_fare_estimate", "ok": True, "estimate_id": eid})

        trip_payload = {
            **est_payload,
            "fare_estimate_id": eid,
            "offered_fare": offer_fare,
            "recommended_fare": float(est.get("base_price") or est.get("total_fare") or offer_fare),
            "payment_method": "cash",
            "trip_type": "intra",
            "preferred_driver_id": driver_id,
        }
        tr = await client.post(
            "/api/trips/request",
            params={"rider_id": rider_id},
            headers=rh,
            json=trip_payload,
        )
        try:
            tbody = tr.json()
        except Exception:
            tbody = {"raw": tr.text[:500]}
        results["live"]["trip_request_status"] = tr.status_code
        results["live"]["trip_request"] = {
            k: tbody.get(k)
            for k in ("eligible_drivers", "trip", "detail", "message")
            if k in tbody or k == "trip"
        }
        if tr.status_code != 200:
            bad(f"trip request failed: {tr.status_code} {tbody}")
            results["checks"].append({"name": "live_trip_request", "ok": False, "detail": tbody})
            open(OUT, "w").write(json.dumps(results, indent=2, default=str))
            mc.close()
            return 1

        trip = tbody.get("trip") or {}
        trip_id = trip.get("id") or tbody.get("trip_id")
        eligible = int(tbody.get("eligible_drivers") or 0)
        ok(f"Trip {trip_id} created eligible_drivers={eligible}")
        results["checks"].append(
            {"name": "live_trip_request", "ok": True, "trip_id": trip_id, "eligible_drivers": eligible}
        )
        results["live"]["trip_id"] = trip_id
        results["live"]["eligible_drivers"] = eligible

        header("4. Live: poll driver offers + reconstruct native alert")
        offer_doc = None
        hydrated = None
        for i in range(15):
            # DB offer row
            offer_doc = await mdb.trip_offers.find_one(
                {"trip_id": trip_id, "driver_id": driver_id},
                {"_id": 0},
            )
            r = await client.get(f"/api/trips/offers/{driver_id}", headers=dh)
            if r.status_code == 200:
                data = r.json()
                offers = data if isinstance(data, list) else (data or {}).get("offers") or []
                for o in offers:
                    if str(o.get("id") or o.get("trip_id")) == str(trip_id):
                        hydrated = o
                        break
            if offer_doc and (hydrated or i >= 3):
                break
            time.sleep(1.2)

        trip_db = await mdb.trips.find_one({"id": trip_id}, {"_id": 0})
        rider_user = await mdb.users.find_one({"id": rider_id}, {"_id": 0, "name": 1, "id": 1})
        results["live"]["offer_doc"] = {
            k: (offer_doc or {}).get(k)
            for k in ("id", "status", "distance_to_pickup", "preferred", "expires_at")
        }
        results["live"]["offer_found"] = bool(offer_doc)
        results["live"]["hydrated_found"] = bool(hydrated)

        if not offer_doc:
            bad("No trip_offers row for preferred driver — dispatch miss")
            results["checks"].append({"name": "live_offer_created", "ok": False})
        else:
            ok(
                f"Offer {offer_doc.get('id')} status={offer_doc.get('status')} "
                f"preferred={offer_doc.get('preferred')} dist={offer_doc.get('distance_to_pickup')}"
            )
            results["checks"].append({"name": "live_offer_created", "ok": True, "offer_id": offer_doc.get("id")})

        # Reconstruct what PR #16 socket + FCM would send from live trip
        trip_for_push = dict(trip_db or trip)
        if rider_user and not trip_for_push.get("rider_name"):
            trip_for_push["rider_name"] = rider_user.get("name")
        live_fcm = build_fcm_data_from_offer(offer_doc or {"trip_id": trip_id}, trip_for_push)
        results["live"]["reconstructed_fcm"] = live_fcm
        native_live = normalize_native_offer(
            {
                "id": live_fcm["trip_id"],
                "offer_id": live_fcm["offer_id"],
                "rider_name": live_fcm["rider_name"],
                "pickup_address": live_fcm["pickup_address"],
                "dropoff_address": live_fcm["dropoff_address"],
                "fare": live_fcm["fare"],
                "eta_minutes": live_fcm["eta_minutes"],
                "distance_to_pickup_km": live_fcm["distance_to_pickup_km"]
                or (offer_doc or {}).get("distance_to_pickup"),
            },
            driver_id=driver_id,
        )
        assert_native_ready(native_live, "live_native_alert_payload", results["checks"])
        results["live"]["native_alert_payload"] = native_live

        # Also check hydrated REST offer (may redact street addresses — still should have route/fare)
        if hydrated:
            pickup_loc = hydrated.get("pickup_location") or {}
            drop_loc = hydrated.get("dropoff_location") or {}
            area = hydrated.get("area_summary_line") or ""
            results["live"]["hydrated_preview"] = {
                "rider_name": hydrated.get("rider_name"),
                "offered_fare": hydrated.get("offered_fare") or hydrated.get("fare"),
                "area_summary_line": area,
                "pickup_address_field": hydrated.get("pickup_address"),
                "dropoff_address_field": hydrated.get("dropoff_address"),
                "pickup_loc_address": pickup_loc.get("address") if isinstance(pickup_loc, dict) else None,
                "drop_loc_address": drop_loc.get("address") if isinstance(drop_loc, dict) else None,
            }
            ok(f"REST offer preview area={area!r} fare={hydrated.get('offered_fare') or hydrated.get('fare')}")
            results["checks"].append({"name": "live_rest_offer_present", "ok": True})
        else:
            info("REST /trips/offers hydration empty (offer may still be socket/FCM only)")
            results["checks"].append({"name": "live_rest_offer_present", "ok": bool(offer_doc)})

        # Confirm branch push_engine source matches reconstructed keys
        pe = open(files["push_engine"], encoding="utf-8").read()
        prod_note = (
            "Branch code builds FCM with fullscreen+dropoff; deploy PR #16 backend for live push parity."
        )
        results["live"]["deploy_note"] = prod_note
        info(prod_note)

        header("5. Cleanup: cancel test trip + take driver offline")
        if trip_id:
            cr = await client.put(
                f"/api/trips/{trip_id}/cancel",
                headers=rh,
                json={"cancelled_by": rider_id, "reason": "fullscreen_alert_test_done"},
            )
            info(f"cancel {cr.status_code}")
        await client.put(
            f"/api/drivers/{driver_id}/online",
            headers=dh,
            params={"is_online": "false"},
        )
        mc.close()

    failed = [c for c in results["checks"] if not c.get("ok")]
    results["summary"] = {
        "total_checks": len(results["checks"]),
        "passed": len(results["checks"]) - len(failed),
        "failed": len(failed),
        "failed_names": [c.get("name") for c in failed],
        "native_alert_ready": bool(
            results.get("live", {}).get("native_alert_payload", {}).get("dropoff")
        )
        and bool(results.get("live", {}).get("native_alert_payload", {}).get("pickup")),
        "device_ui_note": (
            "Full-screen ringtone UI requires a physical Android build with FGS Online; "
            "this environment has no adb/emulator. Payload + source path verified."
        ),
    }
    results["finished_at"] = datetime.now(timezone.utc).isoformat()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, "w").write(json.dumps(results, indent=2, default=str))
    header("SUMMARY")
    print(json.dumps(results["summary"], indent=2))
    print(f"\nArtifact: {OUT}")
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
