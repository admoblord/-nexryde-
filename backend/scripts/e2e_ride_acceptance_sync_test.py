#!/usr/bin/env python3
"""
Provision approved E2E test rider + driver and verify ride acceptance sync.

Uses live API (Cloud Run) plus optional MongoDB direct approval when admin login
is unavailable. Loads secrets from backend/.env (MONGODB_URI, ADMIN_PASSWORD).

Run:
  cd backend && python3 scripts/e2e_ride_acceptance_sync_test.py
"""
from __future__ import annotations

import asyncio
import json
import os
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

import requests
from dotenv import load_dotenv

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
load_dotenv(os.path.join(ROOT, ".env"))

BASE_URL = (
    os.environ.get("NEXRYDE_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or "https://nexryde-modular.preview.emergentagent.com"
).rstrip("/")

PICKUP = {"lat": 6.5244, "lng": 3.3792, "address": "Victoria Island, Lagos"}
DROPOFF = {"lat": 6.45, "lng": 3.4, "address": "Lekki Phase 1, Lagos"}
DRIVER_LOC = {"lat": 6.522, "lng": 3.381, "address": "VI Driver Staging"}


def _hdr(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _admin_hdr(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _rand_phone() -> str:
    return f"+234{''.join(random.choice('0123456789') for _ in range(10))}"


def register_rider() -> Tuple[str, str, str]:
    phone = _rand_phone()
    nin = f"E2E{uuid.uuid4().hex[:14].upper()}"
    r = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={"phone": phone, "name": "E2E Sync Rider", "role": "rider", "nin": nin},
        timeout=60,
    )
    r.raise_for_status()
    data = r.json()
    return data["user"]["id"], data["token"], phone


def register_driver() -> Tuple[str, str, str]:
    phone = _rand_phone()
    now = datetime.now(timezone.utc).isoformat()
    r = requests.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "phone": phone,
            "name": "E2E Sync Driver",
            "role": "driver",
            "terms_accepted": True,
            "terms_accepted_at": now,
        },
        timeout=60,
    )
    r.raise_for_status()
    data = r.json()
    return data["user"]["id"], data["token"], phone


def admin_login() -> Optional[str]:
    email = os.environ.get("ADMIN_EMAIL", "admin@nexryde.com")
    password = os.environ.get("ADMIN_PASSWORD", "").strip()
    if not password:
        return None
    r = requests.post(
        f"{BASE_URL}/api/admin/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    if r.status_code != 200:
        return None
    body = r.json()
    if not body.get("success"):
        return None
    return body.get("token")


def admin_force_approve(driver_id: str, admin_token: str) -> bool:
    r = requests.post(
        f"{BASE_URL}/api/admin/drivers/{driver_id}/force-approve",
        headers=_admin_hdr(admin_token),
        timeout=30,
    )
    return r.status_code == 200 and (r.json() or {}).get("success") is not False


async def mongo_force_approve_driver(driver_id: str) -> None:
    from motor.motor_asyncio import AsyncIOMotorClient

    mongo_url = os.environ.get("MONGODB_URI") or os.environ.get("MONGO_URL")
    if not mongo_url:
        raise RuntimeError("MONGODB_URI not set — cannot bypass driver verification")

    db_name = os.environ.get("DB_NAME", "nexryde_db")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    now_iso = datetime.now(timezone.utc).isoformat()

    await db.users.update_one(
        {"id": driver_id},
        {
            "$unset": {"suspended_until": "", "suspension_reason": ""},
            "$set": {
                "verification_status": "approved",
                "documents_verified": True,
                "is_verified": True,
                "fortress_exempt": True,
                "force_approved_at": now_iso,
            },
        },
    )
    await db.driver_profiles.update_one(
        {"user_id": driver_id},
        {
            "$set": {
                "verification_status": "approved",
                "documents_verified": True,
                "profile_completed": True,
                "nin_verified": True,
                "license_uploaded": True,
                "vehicle_docs_uploaded": True,
                "selfie_verified": True,
                "vehicle_type": "sedan",
                "vehicle_make": "Toyota",
                "vehicle_model": "Corolla",
                "vehicle_color": "Black",
                "vehicle_plate_number": f"E2E-{driver_id[:6].upper()}",
                "active_categories": ["economy", "sedan"],
                "approved_at": now_iso,
                "approved_by": "e2e_script",
            },
        },
        upsert=True,
    )
    existing = await db.subscriptions.find_one(
        {"driver_id": driver_id, "status": {"$in": ["active", "trial", "grace_period"]}}
    )
    if not existing:
        trial_end = (datetime.now(timezone.utc) + timedelta(days=3650)).isoformat()
        await db.subscriptions.insert_one(
            {
                "id": str(uuid.uuid4()),
                "driver_id": driver_id,
                "status": "trial",
                "tier": "city_rider",
                "plan": "e2e_trial",
                "trial_trips_completed": 0,
                "trial_trips_target": 20,
                "start_date": now_iso,
                "end_date": trial_end,
                "created_at": now_iso,
                "notes": "E2E acceptance sync test",
            }
        )
    client.close()


def prepare_driver_online(driver_id: str, token: str) -> None:
    h = _hdr(token)
    requests.put(
        f"{BASE_URL}/api/drivers/{driver_id}/profile",
        headers=h,
        json={
            "vehicle_type": "sedan",
            "vehicle_model": "Toyota Corolla",
            "vehicle_plate": f"E2E{driver_id[:4].upper()}",
            "vehicle_color": "Black",
            "active_categories": ["economy"],
        },
        timeout=30,
    )
    requests.put(
        f"{BASE_URL}/api/drivers/{driver_id}/location",
        headers=h,
        json={
            "latitude": DRIVER_LOC["lat"],
            "longitude": DRIVER_LOC["lng"],
            "device_id": "e2e-sync-test",
        },
        timeout=30,
    )
    online = requests.put(
        f"{BASE_URL}/api/drivers/{driver_id}/online",
        params={"is_online": "true"},
        headers=h,
        timeout=30,
    )
    if online.status_code != 200:
        raise RuntimeError(f"Driver could not go online: {online.status_code} {online.text[:300]}")


def request_trip(rider_id: str, token: str, *, preferred_driver_id: Optional[str] = None) -> Tuple[str, int]:
    h = _hdr(token)
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
    er = requests.post(f"{BASE_URL}/api/fare/estimate", headers=h, json=est_payload, timeout=90)
    er.raise_for_status()
    est = er.json()
    eid = est.get("estimate_id")
    if not eid:
        raise RuntimeError("fare estimate missing estimate_id")
    min_p = float(est.get("min_price") or est.get("min_fare") or 3500)
    offer = max(3500.0, min_p)
    payload = {
        **est_payload,
        "fare_estimate_id": eid,
        "offered_fare": offer,
        "recommended_fare": float(est.get("base_price") or est.get("total_fare") or offer),
        "payment_method": "cash",
        "trip_type": "intra",
        "preferred_driver_id": preferred_driver_id,
    }
    tr = requests.post(
        f"{BASE_URL}/api/trips/request",
        params={"rider_id": rider_id},
        headers=h,
        json=payload,
        timeout=90,
    )
    try:
        body = tr.json() if tr.content else {}
    except Exception:
        body = {"raw": tr.text[:500]}
    if tr.status_code != 200:
        raise RuntimeError(f"Trip request failed: {tr.status_code} {body}")
    trip = body.get("trip") or {}
    trip_id = trip.get("id") or body.get("trip_id")
    if not trip_id:
        raise RuntimeError(f"Trip id missing: {body}")
    eligible = int(body.get("eligible_drivers") or 0)
    return str(trip_id), eligible


def fetch_driver_offer(driver_id: str, token: str, trip_id: str) -> Optional[Dict[str, Any]]:
    h = _hdr(token)
    for _ in range(12):
        r = requests.get(f"{BASE_URL}/api/trips/offers/{driver_id}", headers=h, timeout=30)
        if r.status_code == 200:
            data = r.json()
            offers = data if isinstance(data, list) else (data or {}).get("offers") or []
            for offer in offers:
                oid = str(offer.get("id") or offer.get("trip_id") or "")
                if oid == trip_id:
                    return offer
        import time

        time.sleep(2)
    return None


def accept_trip(
    trip_id: str, driver_id: str, token: str, offer: Dict[str, Any], proposed_fare: float
) -> Tuple[int, Any]:
    h = _hdr(token)
    r = requests.put(
        f"{BASE_URL}/api/trips/{trip_id}/accept",
        headers=h,
        json={
            "driver_id": driver_id,
            "offer_id": offer.get("offer_id") or offer.get("id"),
            "proposed_fare": proposed_fare,
        },
        timeout=45,
    )
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, r.text


def trip_status(trip_id: str, token: str) -> Dict[str, Any]:
    r = requests.get(f"{BASE_URL}/api/trips/{trip_id}/status", headers=_hdr(token), timeout=30)
    r.raise_for_status()
    return r.json()


def active_trip(user_id: str, token: str) -> Dict[str, Any]:
    r = requests.get(f"{BASE_URL}/api/trips/active/{user_id}", headers=_hdr(token), timeout=30)
    r.raise_for_status()
    return r.json()


def cancel_trip(trip_id: str, token: str, actor_id: str) -> None:
    requests.put(
        f"{BASE_URL}/api/trips/{trip_id}/cancel",
        headers=_hdr(token),
        json={"cancelled_by": actor_id},
        timeout=30,
    )


def provision_e2e_pair(admin_token: Optional[str] = None) -> Dict[str, Any]:
    headers = {"Content-Type": "application/json"}
    e2e_secret = os.environ.get("E2E_PROVISION_SECRET", "").strip()
    if e2e_secret:
        headers["X-E2E-Provision-Secret"] = e2e_secret
    elif admin_token:
        headers["Authorization"] = f"Bearer {admin_token}"
    else:
        raise RuntimeError("Need ADMIN_PASSWORD or E2E_PROVISION_SECRET to provision test accounts")
    r = requests.post(
        f"{BASE_URL}/api/admin/e2e/provision-ride-sync-pair",
        headers=headers,
        timeout=60,
    )
    r.raise_for_status()
    body = r.json()
    if not body.get("success"):
        raise RuntimeError(f"E2E provision failed: {body}")
    return body


def main() -> int:
    print(f"E2E ride acceptance sync test → {BASE_URL}\n")

    pair = None
    e2e_secret = os.environ.get("E2E_PROVISION_SECRET", "").strip()
    if e2e_secret:
        print("E2E provision secret: using direct provision")
        pair = provision_e2e_pair()
    else:
        admin_token = admin_login()
        if admin_token:
            print("Admin login: OK")
            pair = provision_e2e_pair(admin_token)
        else:
            print("Admin login failed — registering ephemeral accounts (approval may fail).")
            rider_id, rider_token, rider_phone = register_rider()
            driver_id, driver_token, driver_phone = register_driver()
            print(f"Rider  id={rider_id}  phone={rider_phone}")
            print(f"Driver id={driver_id}  phone={driver_phone}")
            try:
                asyncio.run(mongo_force_approve_driver(driver_id))
                print("MongoDB approval: OK")
            except Exception as exc:
                print(f"MongoDB approval failed: {exc}")
                print(
                    "\nTo fix: set E2E_PROVISION_SECRET on Cloud Run and in backend/.env, "
                    "or sync ADMIN_PASSWORD with production."
                )
                return 1
            prepare_driver_online(driver_id, driver_token)
            # fall through to trip flow below with these ids - need to restructure

    if pair:
        rider = pair["rider"]
        driver = pair["driver"]
        rider_id, rider_token, rider_phone = rider["id"], rider["token"], rider["phone"]
        driver_id, driver_token, driver_phone = driver["id"], driver["token"], driver["phone"]
        print(f"Provisioned rider  id={rider_id}  phone={rider_phone}")
        print(f"Provisioned driver id={driver_id}  phone={driver_phone}")
        prepare_driver_online(driver_id, driver_token)
    print("Driver online with GPS near pickup: OK")

    trip_id, eligible = request_trip(rider_id, rider_token, preferred_driver_id=driver_id)
    print(f"Trip created id={trip_id}  eligible_drivers_at_dispatch={eligible}")

    offer = fetch_driver_offer(driver_id, driver_token, trip_id)
    if not offer:
        cancel_trip(trip_id, rider_token, rider_id)
        print("FAIL: Driver received no offer for this trip (dispatch/eligibility)")
        return 1
    print(f"Driver offer id={offer.get('offer_id') or offer.get('id')}")

    proposed = float(offer.get("rider_offer_price") or offer.get("offered_fare") or offer.get("fare") or 3500)
    status_code, accept_body = accept_trip(trip_id, driver_id, driver_token, offer, proposed)
    print(f"Accept response: HTTP {status_code}")
    if status_code != 200:
        print(json.dumps(accept_body, indent=2) if isinstance(accept_body, dict) else accept_body)
        cancel_trip(trip_id, rider_token, rider_id)
        return 1

    rider_status = trip_status(trip_id, rider_token)
    driver_active = active_trip(driver_id, driver_token)
    rider_active = active_trip(rider_id, rider_token)

    rider_driver_id = (
        rider_status.get("driver_info", {}) or {}
    ).get("driver_id") or rider_status.get("driver_id")
    assigned = str(rider_status.get("status") or "").lower() == "accepted" and bool(rider_driver_id)
    driver_has_trip = driver_active.get("active") and (driver_active.get("trip") or {}).get("id") == trip_id
    rider_has_trip = rider_active.get("active") and (rider_active.get("trip") or {}).get("id") == trip_id

    print("\n--- Verification ---")
    print(f"Rider /status: status={rider_status.get('status')} driver_id={rider_driver_id}")
    print(f"Rider active trip: {rider_has_trip}")
    print(f"Driver active trip: {driver_has_trip}")

    ok = assigned and driver_has_trip and rider_has_trip and str(rider_driver_id) == str(driver_id)
    if ok:
        print("\nPASS: Ride acceptance is synchronized (rider + driver both assigned same trip).")
        print("\n--- Test accounts (for manual QA) ---")
        print(f"Rider  phone: {rider_phone}  email: e2e-rider-*@nexryde.app")
        print(f"Driver phone: {driver_phone}  email: e2e-driver-*@nexryde.app")
        print("Use email OTP login in the app, or re-run with --provision-only to create fresh accounts.")
        cancel_trip(trip_id, rider_token, rider_id)
        return 0

    print("\nFAIL: Assignment mismatch — false acceptance state would occur in the app.")
    try:
        cancel_trip(trip_id, rider_token, rider_id)
    except Exception:
        pass
    return 1


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--provision-only":
        e2e_secret = os.environ.get("E2E_PROVISION_SECRET", "").strip()
        admin_token = admin_login() if not e2e_secret else None
        if not e2e_secret and not admin_token:
            print("Set E2E_PROVISION_SECRET in backend/.env or sync ADMIN_PASSWORD with Cloud Run.")
            raise SystemExit(1)
        pair = provision_e2e_pair(admin_token)
        rider, driver = pair["rider"], pair["driver"]
        print(json.dumps({"rider": rider, "driver": driver}, indent=2))
        print("\nAccounts are approved with trial subscription. Driver has GPS seeded near VI, Lagos.")
        print("Log in via email OTP using the emails above, then driver: go online, rider: book a trip.")
        raise SystemExit(0)
    raise SystemExit(main())
