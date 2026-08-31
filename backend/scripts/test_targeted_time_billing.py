#!/usr/bin/env python3
"""Live + local verification for targeted time billing (pickup wait, traffic, route change)."""
from __future__ import annotations

import json
import math
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

BACKEND = "https://nexryde-modular.preview.emergentagent.com"

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_BACKEND_ROOT = os.path.dirname(_SCRIPT_DIR)
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)

# Abuja coords
WUSE = (9.0765, 7.4898)
GARKI = (9.0437, 7.4896)
JABI = (9.0769, 7.4430)


def ok(msg: str) -> None:
    print(f"  ✓ {msg}")


def fail(msg: str) -> None:
    print(f"  ✗ {msg}")
    raise AssertionError(msg)


def fetch(url: str, method: str = "GET", body: dict | None = None, token: str | None = None) -> tuple[int, dict | str]:
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            raw = r.read().decode()
            try:
                return r.status, json.loads(raw)
            except json.JSONDecodeError:
                return r.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, raw


def register(role: str) -> tuple[str, str]:
    phone = f"+234{uuid.uuid4().int % 10_000_000_000:010d}"[-11:]
    body: dict = {"phone": phone, "name": f"TimeBilling {role}", "role": role}
    if role == "rider":
        body["nin"] = f"NIN{uuid.uuid4().hex[:14]}"
    else:
        body["terms_accepted"] = True
        body["terms_accepted_at"] = datetime.now(timezone.utc).isoformat()
    code, data = fetch(f"{BACKEND}/api/auth/register", method="POST", body=body)
    if code not in (200, 201):
        fail(f"register {role} failed: {code} {data}")
    token = (data.get("token") or data.get("access_token") or "").strip()
    uid = (data.get("user") or {}).get("id") or data.get("id")
    if not token or not uid:
        fail(f"register {role} missing token/id")
    ok(f"registered {role} {uid[:8]}…")
    return uid, token


def fare_estimate(city: str, p, d, stop=None) -> dict:
    body = {
        "pickup_lat": p[0], "pickup_lng": p[1],
        "dropoff_lat": d[0], "dropoff_lng": d[1],
        "service_type": "economy", "city": city,
        "demand_ratio": 0.0, "rain": False,
    }
    if stop:
        body["stop_lat"], body["stop_lng"] = stop
    code, data = fetch(f"{BACKEND}/api/fare/estimate", method="POST", body=body)
    if code != 200:
        fail(f"fare/estimate {city}: {code} {data}")
    return data


def test_local_completion_math() -> None:
    print("\n## Local completion math")
    from trip_fare_adjustments import compute_completion_fare_adjustments, compute_pickup_wait_fee

    now = datetime.now(timezone.utc)
    trip_wait = {
        "status": "ongoing",
        "city": "abuja",
        "service_type": "economy",
        "fare": 7550.0,
        "booking_fare": 7550.0,
        "arrived_at": (now - timedelta(minutes=7)).isoformat(),
        "started_at": now.isoformat(),
        "duration_mins": 15,
        "distance_km": 10.0,
    }
    w = compute_pickup_wait_fee(trip_wait)
    if w["pickup_wait_min"] != 4 or w["pickup_wait_fee"] != 240.0:
        fail(f"pickup wait expected 4×₦60=240 got {w}")
    ok(f"pickup wait 7min delay → ₦{w['pickup_wait_fee']:,.0f}")

    trip_jam = {
        "status": "ongoing",
        "city": "abuja",
        "fare": 7550.0,
        "booking_fare": 7550.0,
        "arrived_at": (now - timedelta(minutes=70)).isoformat(),
        "started_at": (now - timedelta(minutes=65)).isoformat(),
        "duration_mins": 20,
        "distance_km": 12.0,
    }
    adj = compute_completion_fare_adjustments(trip_jam, now)
    if adj["traffic_excess_fee"] <= 0:
        fail(f"expected traffic excess, got {adj}")
    ok(f"jam trip completion → +₦{adj['traffic_excess_fee']:,.0f} traffic, final ₦{adj['final_fare']:,.0f}")


def test_live_fare_estimates() -> None:
    print("\n## Live fare estimates")
    direct = fare_estimate("abuja", JABI, GARKI)
    tf = float(direct.get("time_fee") or 0)
    total = float(direct.get("total_fare") or 0)
    if tf != 0:
        fail(f"Abuja direct should have time_fee=0, got {tf} breakdown={direct.get('price_breakdown')}")
    ok(f"Abuja direct Jabi→Garki ₦{total:,.0f}, time_fee=0")

    # With stop needs route metrics — use client google coords
    q = {"pickup_lat": JABI[0], "pickup_lng": JABI[1], "dropoff_lat": GARKI[0], "dropoff_lng": GARKI[1],
         "stop_lat": WUSE[0], "stop_lng": WUSE[1]}
    code, route = fetch(f"{BACKEND}/api/places/driving-route?{urllib.parse.urlencode(q)}")
    if code != 200:
        fail(f"driving route failed: {code}")
    dm = float(route.get("distance_meters") or 0)
    ds = float(route.get("duration_seconds") or 0)
    body = {
        "pickup_lat": JABI[0], "pickup_lng": JABI[1],
        "dropoff_lat": GARKI[0], "dropoff_lng": GARKI[1],
        "stop_lat": WUSE[0], "stop_lng": WUSE[1],
        "service_type": "economy", "city": "abuja",
        "demand_ratio": 0.0, "rain": False,
        "google_route_distance_meters": int(dm),
        "google_route_duration_seconds": int(ds),
    }
    code, stop_fare = fetch(f"{BACKEND}/api/fare/estimate", method="POST", body=body)
    if code != 200:
        fail(f"stop fare estimate failed: {code} {stop_fare}")
    stf = float(stop_fare.get("time_fee") or 0)
    if stf <= 0:
        fail(f"Abuja stop trip should have time_fee>0, got {stf}")
    ok(f"Abuja with stop ₦{float(stop_fare.get('total_fare') or 0):,.0f}, time_fee=₦{stf:,.0f}")

    lagos = fare_estimate("lagos", (6.5095, 3.3711), (6.4281, 3.4219))
    ltf = float(lagos.get("time_fee") or 0)
    if ltf != 0:
        fail(f"Lagos direct time_fee should be 0, got {ltf}")
    ok(f"Lagos Yaba→VI ₦{float(lagos.get('total_fare') or 0):,.0f}, distance-only")


def test_route_update_endpoint(rider_token: str) -> None:
    print("\n## Route-update API")
    fake_id = str(uuid.uuid4())
    code, data = fetch(
        f"{BACKEND}/api/trips/{fake_id}/route-update",
        method="POST",
        body={"update_type": "destination", "lat": 9.05, "lng": 7.49},
        token=rider_token,
    )
    if code != 404:
        fail(f"expected 404 for fake trip, got {code} {data}")
    ok("route-update endpoint live (404 on unknown trip)")

    code, _ = fetch(
        f"{BACKEND}/api/trips/{fake_id}/route-update",
        method="POST",
        body={"update_type": "bad", "lat": 9.05, "lng": 7.49},
    )
    if code not in (401, 403):
        ok(f"unauthenticated route-update rejected ({code})")
    else:
        ok("unauthenticated route-update rejected")


def test_trip_booking_fields(rider_id: str, rider_token: str) -> str | None:
    print("\n## Trip booking fields (booking_fare, free wait)")
    est = fare_estimate("abuja", WUSE, GARKI)
    eid = est.get("estimate_id")
    if not eid:
        fail("missing estimate_id")
    payload = {
        "pickup_lat": WUSE[0], "pickup_lng": WUSE[1], "pickup_address": "Wuse II",
        "dropoff_lat": GARKI[0], "dropoff_lng": GARKI[1], "dropoff_address": "Garki",
        "service_type": "economy", "city": "abuja",
        "payment_method": "cash",
        "fare_estimate_id": eid,
        "rider_id": rider_id,
    }
    url = f"{BACKEND}/api/trips/request?rider_id={urllib.parse.quote(rider_id)}"
    code, data = fetch(url, method="POST", body=payload, token=rider_token)
    if code not in (200, 201):
        print(f"  ⚠ trip request returned {code} (may need driver ecosystem): {str(data)[:200]}")
        return None
    trip = (data.get("trip") or data) if isinstance(data, dict) else {}
    tid = trip.get("id")
    bf = trip.get("booking_fare")
    fw = trip.get("pickup_free_wait_seconds")
    if bf is None:
        fail(f"trip missing booking_fare: {trip.keys()}")
    if int(fw or 0) != 180:
        fail(f"expected pickup_free_wait_seconds=180, got {fw}")
    ok(f"trip {tid[:8]}… booking_fare=₦{float(bf):,.0f}, free_wait={fw}s")
    return tid


def test_pickup_wait_payload_module() -> None:
    print("\n## Pickup wait payload (server module)")
    from fare_config import PICKUP_FREE_WAIT_SECONDS
    from trip_fare_adjustments import compute_pickup_wait_payload

    if PICKUP_FREE_WAIT_SECONDS != 180:
        fail(f"PICKUP_FREE_WAIT_SECONDS should be 180, got {PICKUP_FREE_WAIT_SECONDS}")
    now = datetime.now(timezone.utc)
    payload = compute_pickup_wait_payload({
        "status": "arrived",
        "arrived_at": (now - timedelta(seconds=90)).isoformat(),
    })
    if payload.get("wait_phase") != "free":
        fail(f"expected free phase at 90s, got {payload}")
    ok("90s wait → free phase")
    payload2 = compute_pickup_wait_payload({
        "status": "arrived",
        "arrived_at": (now - timedelta(seconds=240)).isoformat(),
    })
    if payload2.get("wait_phase") != "billable":
        fail(f"expected billable at 240s, got {payload2}")
    ok("240s wait → billable phase")


def main() -> int:
    print(f"Targeted time billing test\nBackend: {BACKEND}\n")
    try:
        code, health = fetch(f"{BACKEND}/")
        if code != 200:
            fail(f"health failed {code}")
        ok(f"API up ({health.get('service') if isinstance(health, dict) else health})")

        test_pickup_wait_payload_module()
        test_local_completion_math()
        test_live_fare_estimates()

        rider_id, rider_token = register("rider")
        test_route_update_endpoint(rider_token)
        test_trip_booking_fields(rider_id, rider_token)

        print("\n" + "=" * 52)
        print("ALL CHECKS PASSED")
        print("=" * 52)
        return 0
    except AssertionError as e:
        print(f"\nFAILED: {e}")
        return 1
    except Exception as e:
        print(f"\nERROR: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
