#!/usr/bin/env python3
"""
NEXRYDE E2E — trip completion must not strand the rider on pending payment.

Drives a real rider and a real driver side by side through a full trip against
a running backend, checking BOTH sides after every step:

  accepted → arrived → ongoing → completed

and then asserting the behaviour that used to break:

  * a cash trip settles the moment the driver ends it — no second "Cash
    collected" tap, no completed-but-unpaid limbo
  * neither rider nor driver is still pinned to the finished trip
  * the rider can immediately request another trip
  * a wallet trip still waits for the rider to authorise the debit
  * a trip already stuck on pending payment heals when it is next read

Usage:
    BASE_URL=http://127.0.0.1:8099 \
    MONGODB_URI=mongodb://127.0.0.1:27017 DB_NAME=nexryde_e2e \
    python3 backend/tests/e2e_trip_completion_no_payment_hold.py
"""
from __future__ import annotations

import asyncio
import os
import random
import sys
import uuid
from datetime import datetime, timezone

import httpx
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:8099").rstrip("/")
MONGO_URL = os.environ.get("MONGODB_URI") or os.environ.get("MONGO_URL", "mongodb://127.0.0.1:27017")
DB_NAME = os.environ.get("DB_NAME", "nexryde_e2e")
TIMEOUT = 30

PICKUP = {"lat": 6.4281, "lng": 3.4219}
DROPOFF = {"lat": 6.4550, "lng": 3.3841}

GREEN, RED, YELLOW, DIM, BOLD, RESET = (
    "\033[92m", "\033[91m", "\033[93m", "\033[2m", "\033[1m", "\033[0m",
)

FAILURES: list[str] = []


def ok(msg: str) -> None:
    print(f"  {GREEN}✓{RESET}  {msg}")


def bad(msg: str) -> None:
    FAILURES.append(msg)
    print(f"  {RED}✗{RESET}  {msg}")


def info(msg: str) -> None:
    print(f"  {DIM}·  {msg}{RESET}")


def header(msg: str) -> None:
    print(f"\n{BOLD}{msg}{RESET}")


def check(condition: bool, good_msg: str, bad_msg: str) -> bool:
    if condition:
        ok(good_msg)
        return True
    bad(bad_msg)
    return False


def tag() -> str:
    return uuid.uuid4().hex[:6]


def digits(n: int) -> str:
    return "".join(random.choices("0123456789", k=n))


async def register_and_login(c: httpx.AsyncClient, role: str, suffix: str) -> tuple[str, str]:
    email = f"e2e_{role}_{suffix}@nexryde.test"
    payload: dict = {
        "name": f"E2E {role.title()} {suffix}",
        "email": email,
        "role": role,
        "phone": f"+234{'80' if role == 'rider' else '81'}{digits(8)}",
        "terms_accepted": True,
        "privacy_accepted": True,
    }
    if role == "rider":
        payload["nin"] = digits(11)

    r = await c.post("/api/auth/register", json=payload)
    if r.status_code not in (200, 201, 409):
        raise SystemExit(f"register {role} failed {r.status_code}: {r.text[:300]}")

    if role == "driver":
        await approve_driver(email)

    r = await c.post("/api/auth/email-signin", json={"email": email})
    if r.status_code != 200:
        raise SystemExit(f"login {role} failed {r.status_code}: {r.text[:300]}")
    data = r.json()
    token = data.get("token") or data.get("access_token")
    user_id = (data.get("user") or {}).get("id")
    if not token or not user_id:
        raise SystemExit(f"login {role}: no token/id in {data}")
    return str(user_id), str(token)


async def approve_driver(email: str) -> None:
    """Local-only setup so the account can go online without manual review."""
    mc = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    try:
        mdb = mc[DB_NAME]
        user = await mdb.users.find_one({"email": email}, {"_id": 0, "id": 1})
        if not user:
            return
        now = datetime.now(timezone.utc).isoformat()
        await mdb.users.update_one({"id": user["id"]}, {"$set": {"fortress_exempt": True}})
        await mdb.driver_profiles.update_one(
            {"user_id": user["id"]},
            {
                "$set": {
                    "user_id": user["id"],
                    "verification_status": "approved",
                    "documents_verified": True,
                    "is_online": False,
                    "approved_at": now,
                    "profile_completed_at": now,
                    "subscription_status": "active",
                    "current_location": PICKUP,
                }
            },
            upsert=True,
        )
    finally:
        mc.close()


async def seed_trip(rider_id: str, driver_id: str, payment_method: str, **overrides) -> str:
    """Insert an accepted trip directly — routing APIs need keys we do not have locally."""
    trip_id = f"trip-e2e-{uuid.uuid4().hex[:12]}"
    mc = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    try:
        doc = {
            "id": trip_id,
            "rider_id": rider_id,
            "driver_id": driver_id,
            "status": "accepted",
            "pickup_address": "Ikeja, Lagos",
            "dropoff_address": "Maryland, Lagos",
            "pickup_location": PICKUP,
            "dropoff_location": DROPOFF,
            "fare": 1500.0,
            "payment_method": payment_method,
            "payment_status": "pending",
            "distance_km": 5.2,
            "duration_min": 18,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "accepted_at": datetime.now(timezone.utc).isoformat(),
            "source": "e2e_test",
            # trips carry a unique (rider_id, idempotency_key) index
            "idempotency_key": f"e2e-{uuid.uuid4().hex}",
        }
        doc.update(overrides)
        await mc[DB_NAME].trips.insert_one(doc)
    finally:
        mc.close()
    return trip_id


async def read_trip(trip_id: str) -> dict:
    mc = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    try:
        return await mc[DB_NAME].trips.find_one({"id": trip_id}, {"_id": 0}) or {}
    finally:
        mc.close()


async def active_trip(c: httpx.AsyncClient, user_id: str, headers: dict) -> dict:
    """Trimmed to the fields under test — the raw payload is ~40 fields of noise."""
    r = await c.get(f"/api/trips/active/{user_id}", headers=headers)
    if r.status_code != 200:
        return {"active": None, "http": r.status_code}
    body = r.json()
    trip = body.get("trip") or {}
    return {
        "active": body.get("active"),
        "trip_id": trip.get("id"),
        "status": trip.get("status"),
        "payment_status": trip.get("payment_status"),
    }


async def drive_to_completion(
    c: httpx.AsyncClient, trip_id: str, driver_id: str, driver_h: dict
) -> httpx.Response:
    r = await c.put(
        f"/api/trips/{trip_id}/arrive",
        headers=driver_h,
        json={"driver_id": driver_id, "lat": PICKUP["lat"], "lng": PICKUP["lng"]},
    )
    if r.status_code not in (200, 201):
        raise SystemExit(f"arrive failed {r.status_code}: {r.text[:300]}")

    r = await c.put(f"/api/trips/{trip_id}/start", headers=driver_h, json={"driver_id": driver_id})
    if r.status_code not in (200, 201):
        raise SystemExit(f"start failed {r.status_code}: {r.text[:300]}")

    return await c.put(
        f"/api/trips/{trip_id}/complete",
        headers=driver_h,
        json={"driver_id": driver_id, "end_lat": DROPOFF["lat"], "end_lng": DROPOFF["lng"]},
    )


async def run() -> None:
    suffix = tag()
    print(f"\n{BOLD}{'=' * 66}{RESET}")
    print(f"{BOLD}  NEXRYDE E2E — completion without a pending-payment hold  [{suffix}]{RESET}")
    print(f"  Backend : {BASE_URL}")
    print(f"  Database: {DB_NAME}")
    print(f"{BOLD}{'=' * 66}{RESET}")

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=TIMEOUT) as c:
        r = await c.get("/api/health")
        if r.status_code != 200:
            raise SystemExit(f"backend not healthy: {r.status_code}")

        header("Setup — rider and driver, side by side")
        rider_id, rider_token = await register_and_login(c, "rider", suffix)
        driver_id, driver_token = await register_and_login(c, "driver", suffix)
        rider_h = {"Authorization": f"Bearer {rider_token}"}
        driver_h = {"Authorization": f"Bearer {driver_token}"}
        ok(f"rider  {rider_id[:8]}…  logged in")
        ok(f"driver {driver_id[:8]}…  logged in")

        await c.put(f"/api/drivers/{driver_id}/online", headers=driver_h, params={"is_online": "true"})
        await c.put(
            f"/api/drivers/{driver_id}/location",
            headers=driver_h,
            json={"latitude": PICKUP["lat"], "longitude": PICKUP["lng"]},
        )
        ok("driver online with location set")

        # ── Trip 1: cash, the case that used to strand riders ────────────────
        header("Trip 1 — CASH ride, full lifecycle")
        trip_id = await seed_trip(rider_id, driver_id, "cash")
        info(f"trip {trip_id[-12:]} seeded as accepted (₦1,500 cash)")

        for who, uid, h in (("rider", rider_id, rider_h), ("driver", driver_id, driver_h)):
            res = await active_trip(c, uid, h)
            check(
                res.get("active") is True,
                f"{who} sees the trip as active while it is running",
                f"{who} should see an active trip mid-ride, got {res}",
            )

        resp = await drive_to_completion(c, trip_id, driver_id, driver_h)
        check(
            resp.status_code in (200, 201),
            "driver completed the trip",
            f"complete failed {resp.status_code}: {resp.text[:300]}",
        )

        header("Trip 1 — the fix: settled at completion, nobody held")
        trip = await read_trip(trip_id)
        info(f"status={trip.get('status')}  payment_status={trip.get('payment_status')}  paid_at={trip.get('paid_at')}")

        check(trip.get("status") == "completed", "trip status is completed", f"status={trip.get('status')}")
        check(
            trip.get("payment_status") == "completed",
            "cash settled at completion — no pending-payment hold",
            f"payment_status={trip.get('payment_status')} — driver is still being asked to confirm",
        )
        check(trip.get("paid_at") is not None, "paid_at stamped", "paid_at missing on a settled trip")

        for who, uid, h in (("rider", rider_id, rider_h), ("driver", driver_id, driver_h)):
            res = await active_trip(c, uid, h)
            check(
                res.get("active") is False,
                f"{who} is released — no active trip after completion",
                f"{who} is still pinned to the finished trip: {res}",
            )

        header("Trip 1 — rider can go straight back to booking")
        r = await c.post(
            "/api/trips/request",
            headers=rider_h,
            params={"rider_id": rider_id},
            json={
                "pickup_lat": PICKUP["lat"],
                "pickup_lng": PICKUP["lng"],
                "pickup_address": "Ikeja, Lagos",
                "dropoff_lat": DROPOFF["lat"],
                "dropoff_lng": DROPOFF["lng"],
                "dropoff_address": "Maryland, Lagos",
                "payment_method": "cash",
                "service_type": "economy",
                "city": "lagos",
                "offered_fare": 1500,
            },
        )
        blocked = r.status_code == 409 and "active trip" in r.text.lower()
        check(
            not blocked,
            "rider can request another trip immediately (no 'active trip' block)",
            f"rider blocked from rebooking: {r.status_code} {r.text[:200]}",
        )
        info(f"rebook returned {r.status_code}")
        if r.status_code not in (200, 201):
            info(f"(booking itself needs Google routing keys locally: {r.text[:140]})")

        # ── Trip 2: wallet must still require the rider to authorise ─────────
        header("Trip 2 — WALLET ride still waits for the rider (money moves in-app)")
        mc = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=5000)
        try:
            await mc[DB_NAME].trips.delete_many({"rider_id": rider_id, "status": {"$ne": "completed"}})
        finally:
            mc.close()

        wallet_trip = await seed_trip(rider_id, driver_id, "wallet")
        resp = await drive_to_completion(c, wallet_trip, driver_id, driver_h)
        check(
            resp.status_code in (200, 201),
            "driver completed the wallet trip",
            f"wallet complete failed {resp.status_code}: {resp.text[:300]}",
        )
        wtrip = await read_trip(wallet_trip)
        info(f"status={wtrip.get('status')}  payment_status={wtrip.get('payment_status')}")
        check(
            wtrip.get("payment_status") == "pending",
            "wallet fare still pending — rider must authorise the debit",
            f"wallet auto-settled without the rider: payment_status={wtrip.get('payment_status')}",
        )
        res = await active_trip(c, rider_id, rider_h)
        check(
            res.get("active") is True,
            "rider still sees the wallet trip until they pay",
            f"wallet trip dropped before payment: {res}",
        )

        # ── Trip 3: a trip already stuck in the old state must heal ──────────
        header("Trip 3 — a trip ALREADY stuck on pending payment heals on read")
        mc = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=5000)
        try:
            await mc[DB_NAME].trips.delete_many({"rider_id": rider_id})
        finally:
            mc.close()

        stuck = await seed_trip(
            rider_id,
            driver_id,
            "cash",
            status="completed",
            payment_status="pending",
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
        before = await read_trip(stuck)
        info(f"seeded legacy stuck trip: status={before.get('status')} payment_status={before.get('payment_status')}")

        res = await active_trip(c, rider_id, rider_h)
        check(
            res.get("active") is False,
            "rider is released from the stranded trip on the very next poll",
            f"rider still stuck: {res}",
        )
        healed = await read_trip(stuck)
        check(
            healed.get("payment_status") == "completed",
            "stranded trip was settled in the database",
            f"still unsettled: payment_status={healed.get('payment_status')}",
        )

    print(f"\n{BOLD}{'=' * 66}{RESET}")
    if FAILURES:
        print(f"{RED}{BOLD}  FAILED — {len(FAILURES)} check(s){RESET}")
        for f in FAILURES:
            print(f"    {RED}·{RESET} {f}")
        print(f"{BOLD}{'=' * 66}{RESET}\n")
        sys.exit(1)
    print(f"{GREEN}{BOLD}  ALL CHECKS PASSED — rides complete with no pending-payment hold{RESET}")
    print(f"{BOLD}{'=' * 66}{RESET}\n")


if __name__ == "__main__":
    asyncio.run(run())
