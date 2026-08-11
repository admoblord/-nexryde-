#!/usr/bin/env python3
"""End-to-end live trip: request → accept → arrive → start → complete.

Safety: refuses unless BOTH rider and driver have ``is_test_account=true``
(and optionally ``non_production=true``). Prefer staging API + staging Mongo.

Env:
  BASE_URL          default http://localhost:8000
  JWT_SECRET        required to mint tokens (or set RIDER_TOKEN/DRIVER_TOKEN)
  E2E_RIDER_ID      required
  E2E_DRIVER_ID     required
  E2E_ALLOW_PROD    must be "1" if BASE_URL looks like production

Example:
  E2E_RIDER_ID=... E2E_DRIVER_ID=... JWT_SECRET=... \\
    BASE_URL=https://nexryde-backend-staging-....run.app \\
    python scripts/e2e_live_trip_flow.py
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

try:
    import jwt
except ImportError:
    print("PyJWT required: pip install PyJWT", file=sys.stderr)
    sys.exit(2)

BASE = os.environ.get("BASE_URL", "http://localhost:8000").rstrip("/")
RIDER_ID = os.environ.get("E2E_RIDER_ID", "").strip()
DRIVER_ID = os.environ.get("E2E_DRIVER_ID", "").strip()
JWT_SECRET = os.environ.get("JWT_SECRET", "").strip()
VI = (6.4281, 3.4219)
AJA = (6.4698, 3.5852)


def _looks_prod(url: str) -> bool:
    u = url.lower()
    return "africa-south1.run.app" in u and "staging" not in u


def mint(uid: str, role: str) -> str:
    if os.environ.get(f"{role.upper()}_TOKEN"):
        return os.environ[f"{role.upper()}_TOKEN"]
    if not JWT_SECRET:
        raise SystemExit("JWT_SECRET or RIDER_TOKEN/DRIVER_TOKEN required")
    now = int(time.time())
    return jwt.encode(
        {
            "sub": uid,
            "user_id": uid,
            "role": role,
            "exp": now + 3600,
            "iat": now,
            "type": "access",
        },
        JWT_SECRET,
        algorithm="HS256",
    )


def call(method: str, path: str, tok: str, body: dict | None = None) -> dict[str, Any]:
    data = None
    headers = {"Authorization": f"Bearer {tok}", "Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode() or "null"
            return {"ok": True, "status": r.status, "body": json.loads(raw)}
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            j = json.loads(raw or "{}")
        except Exception:
            j = {"raw": raw[:500]}
        return {"ok": False, "status": e.code, "body": j, "detail": j.get("detail")}


def require_test_account(uid: str, tok: str, role: str) -> None:
    # Prefer users/{id}; fall back to driver profile flags
    res = call("GET", f"/api/users/{uid}", tok)
    body = res.get("body") or {}
    if not res.get("ok"):
        raise SystemExit(f"Cannot load {role} user {uid}: {res}")
    if not body.get("is_test_account"):
        raise SystemExit(
            f"Refusing e2e: {role} {uid} is not is_test_account=true. "
            "Seed with scripts/seed_e2e_test_accounts.py --apply on staging."
        )


def main() -> int:
    if not RIDER_ID or not DRIVER_ID:
        print("E2E_RIDER_ID and E2E_DRIVER_ID required", file=sys.stderr)
        return 2
    if _looks_prod(BASE) and os.environ.get("E2E_ALLOW_PROD") != "1":
        print(
            "Refusing production BASE_URL without E2E_ALLOW_PROD=1. "
            "Deploy/use staging (cloudrun.staging.yaml) instead.",
            file=sys.stderr,
        )
        return 2

    rt, dt = mint(RIDER_ID, "rider"), mint(DRIVER_ID, "driver")
    require_test_account(RIDER_ID, rt, "rider")
    require_test_account(DRIVER_ID, dt, "driver")

    steps: list[tuple[str, dict]] = []

    # 1) Driver location + online
    steps.append(
        (
            "location",
            call(
                "PUT",
                f"/api/drivers/{DRIVER_ID}/location",
                dt,
                {"latitude": VI[0], "longitude": VI[1]},
            ),
        )
    )
    steps.append(("online", call("PUT", f"/api/drivers/{DRIVER_ID}/online?is_online=true", dt)))
    if not steps[-1][1].get("ok"):
        print("go-online failed (compliance?):", steps[-1][1])
        return 1

    # 2) Fare estimate
    fare = call(
        "POST",
        "/api/fare/estimate",
        rt,
        {
            "pickup_lat": VI[0],
            "pickup_lng": VI[1],
            "dropoff_lat": AJA[0],
            "dropoff_lng": AJA[1],
            "service_type": "economy",
            "city": "lagos",
        },
    )
    steps.append(("fare", fare))
    if not fare.get("ok"):
        print("fare failed", fare)
        return 1
    estimate_id = (fare.get("body") or {}).get("estimate_id")

    # 3) Request trip
    req_body = {
        "pickup_lat": VI[0],
        "pickup_lng": VI[1],
        "pickup_address": "E2E Pickup VI",
        "dropoff_lat": AJA[0],
        "dropoff_lng": AJA[1],
        "dropoff_address": "E2E Dropoff Ajah",
        "service_type": "economy",
        "payment_method": "cash",
    }
    if estimate_id:
        req_body["fare_estimate_id"] = estimate_id
    trip_res = call("POST", f"/api/trips/request?rider_id={urllib.parse.quote(RIDER_ID)}", rt, req_body)
    steps.append(("request", trip_res))
    if not trip_res.get("ok"):
        print("request failed", trip_res)
        call("PUT", f"/api/drivers/{DRIVER_ID}/online?is_online=false", dt)
        return 1
    trip = trip_res.get("body") or {}
    trip_id = trip.get("id") or trip.get("trip_id")
    if not trip_id:
        print("no trip id", trip)
        return 1

    # 4) Accept (offer id may equal trip id depending on API)
    accept = call(
        "PUT",
        f"/api/trips/{trip_id}/accept",
        dt,
        {"driver_id": DRIVER_ID},
    )
    steps.append(("accept", accept))
    if not accept.get("ok"):
        # try offers list
        offers = call("GET", f"/api/trips/offers/{DRIVER_ID}", dt)
        steps.append(("offers", offers))
        print("accept failed", accept, "offers", offers)
        call("PUT", f"/api/trips/{trip_id}/cancel", rt, {"reason": "e2e_cleanup", "cancelled_by": "rider"})
        call("PUT", f"/api/drivers/{DRIVER_ID}/online?is_online=false", dt)
        return 1

    for name, path, tok, body in [
        ("arrive", f"/api/trips/{trip_id}/arrive", dt, {"driver_id": DRIVER_ID}),
        ("start", f"/api/trips/{trip_id}/start", dt, None),
        ("complete", f"/api/trips/{trip_id}/complete", dt, None),
    ]:
        # some endpoints expect empty body
        if body is None:
            r = call("PUT", path, tok, {})
        else:
            r = call("PUT", path, tok, body)
        steps.append((name, r))
        if not r.get("ok"):
            print(f"{name} failed", r)
            call("PUT", f"/api/drivers/{DRIVER_ID}/online?is_online=false", dt)
            return 1

    call("PUT", f"/api/drivers/{DRIVER_ID}/online?is_online=false", dt)

    summary = {
        "trip_id": trip_id,
        "ok": True,
        "steps": {n: {"status": s.get("status"), "ok": s.get("ok")} for n, s in steps},
    }
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
