#!/usr/bin/env python3
"""
10-minute internal rider soak against production (josephbbs12).

Mirrors real rider app paths:
  - sign-in
  - home / trips / notifications / wallet / profile
  - instant pickup reverse-geocode (no Plus Codes, no coords)
  - places autocomplete + details (pickup → destination)
  - fare estimate (book sheet)
  - optional soft trip request + immediate cancel (once per soak)

Usage:
  DURATION_SEC=600 python3 backend/scripts/rider_soak_10min.py
"""
from __future__ import annotations

import json
import os
import random
import re
import time
from datetime import datetime, timezone
from typing import Any

import httpx

BASE = os.environ.get(
    "BASE_URL",
    "https://nexryde-backend-993913300770.africa-south1.run.app",
).rstrip("/")
EMAIL = os.environ.get("RIDER_EMAIL", "josephbbs12@gmail.com")
DURATION_SEC = int(os.environ.get("DURATION_SEC", "600"))
DO_TRIP = os.environ.get("DO_TRIP", "1") == "1"
OUT = os.environ.get(
    "OUT",
    "/opt/cursor/artifacts/rider_soak_10min.json",
)

PLUS_RE = re.compile(
    r"^[23456789CFGHJMPQRVWX]{4,11}\+[23456789CFGHJMPQRVWX]{2,6}$",
    re.I,
)
COORD_RE = re.compile(r"^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$")

# Lagos sample GPS fixes a rider might see while booking
GPS_POINTS = [
    (6.4281, 3.4219, "VI / Adeola Odeku area"),
    (6.428055, 3.4216, "Saka Tinubu"),
    (6.4300, 3.4240, "Akin Adesola"),
    (6.4265, 3.4205, "Abimbola Awoniyi"),
    (6.4474, 3.3903, "CMS / Lagos Island"),
    (6.4541, 3.3947, "Marina"),
    (6.4650, 3.4060, "Ikoyi edge"),
    (6.4390, 3.4550, "Lekki Phase 1 edge"),
    (6.5010, 3.3610, "Yaba"),
    (6.5244, 3.3792, "Ikeja / central Lagos"),
]

DEST_QUERIES = [
    "Lekki Phase 1",
    "Ikeja City Mall",
    "Murtala Muhammed Airport",
    "Shoprite Sangotedo",
    "University of Lagos",
    "Victoria Island Lagos",
    "Maryland Mall Lagos",
]


def is_plus(label: str) -> bool:
    head = str(label or "").strip().split(",")[0].strip()
    return bool(head and "+" in head and PLUS_RE.match(head))


def is_coords(label: str) -> bool:
    return bool(COORD_RE.match(str(label or "").strip()))


def ms_since(t0: float) -> int:
    return int((time.perf_counter() - t0) * 1000)


def main() -> int:
    started = time.time()
    ends_at = started + DURATION_SEC
    results: dict[str, Any] = {
        "started_at": datetime.now(timezone.utc).isoformat(),
        "base_url": BASE,
        "email": EMAIL,
        "duration_sec_target": DURATION_SEC,
        "cycles": [],
        "checks": [],
        "latencies_ms": {},
        "failures": [],
    }
    failed = 0
    cycle = 0
    trip_done = False

    def record(name: str, ok: bool, detail: dict | None = None) -> None:
        nonlocal failed
        row = {"name": name, "ok": ok, "t": datetime.now(timezone.utc).isoformat(), **(detail or {})}
        results["checks"].append(row)
        if not ok:
            failed += 1
            results["failures"].append(row)
        mark = "✓" if ok else "✗"
        extra = ""
        if detail:
            keep = {k: detail[k] for k in ("ms", "status", "label", "n", "error") if k in detail}
            if keep:
                extra = f" {keep}"
        print(f"  {mark}  {name}{extra}", flush=True)

    def note_latency(bucket: str, ms: int) -> None:
        arr = results["latencies_ms"].setdefault(bucket, [])
        arr.append(ms)

    with httpx.Client(base_url=BASE, timeout=httpx.Timeout(45.0, connect=15.0)) as c:
        # Health
        t0 = time.perf_counter()
        hr = c.get("/api/health/ready")
        record("health_ready", hr.status_code == 200, {"ms": ms_since(t0), "status": hr.status_code})

        # Sign-in
        t0 = time.perf_counter()
        login = c.post("/api/auth/email-signin", json={"email": EMAIL})
        login_ms = ms_since(t0)
        body = login.json() if login.content else {}
        user = body.get("user") or {}
        token = body.get("token") or body.get("access_token")
        uid = user.get("id")
        record(
            "email_signin",
            login.status_code == 200 and bool(token) and user.get("role") == "rider",
            {
                "ms": login_ms,
                "status": login.status_code,
                "user_name": user.get("name"),
                "role": user.get("role"),
            },
        )
        if not token or not uid:
            _write(results, failed)
            return 1

        h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        while time.time() < ends_at:
            cycle += 1
            remaining = int(ends_at - time.time())
            print(f"\n── cycle {cycle}  ({remaining}s left) ──", flush=True)
            cycle_row: dict[str, Any] = {"cycle": cycle, "ok": True}

            # Tab bundle (home / trips / alerts / wallet / profile)
            tab_calls = [
                ("home_legal", f"/api/users/{uid}/legal-status"),
                ("home_verification", f"/api/users/{uid}/rider-verification-status"),
                ("home_active_trip", f"/api/trips/active/{uid}"),
                ("trips_history", f"/api/trips/user/{uid}?role=rider&limit=30"),
                ("notifications", f"/api/users/{uid}/notifications?limit=40"),
                ("wallet_me", "/api/wallet/me"),
                ("profile_user", f"/api/users/{uid}"),
                ("profile_trust", f"/api/users/{uid}/trust-summary"),
                ("profile_referral", "/api/incentives/referral-code"),
                ("first_ride", "/api/incentives/first-ride-status"),
                ("scheduled", f"/api/rides/scheduled/{uid}"),
                ("enforcement", f"/api/enforcement/book-status/{uid}"),
            ]
            for name, path in tab_calls:
                t0 = time.perf_counter()
                try:
                    r = c.get(path, headers=h)
                    ms = ms_since(t0)
                    note_latency(name, ms)
                    # 404 on empty scheduled/active is acceptable
                    ok = r.status_code < 500 and r.status_code != 401
                    if name == "trips_history" and r.status_code == 200:
                        data = r.json() if r.content else {}
                        trips = data if isinstance(data, list) else (data.get("trips") or data.get("items") or [])
                        upcoming = [
                            t
                            for t in trips
                            if str(t.get("status") or "").lower()
                            in ("requested", "accepted", "arrived", "in_progress", "scheduled", "pending")
                        ]
                        completed = [
                            t
                            for t in trips
                            if str(t.get("status") or "").lower() in ("completed", "complete")
                        ]
                        record(
                            f"c{cycle}_{name}",
                            ok,
                            {
                                "ms": ms,
                                "status": r.status_code,
                                "n": len(trips) if isinstance(trips, list) else -1,
                                "upcoming": len(upcoming),
                                "completed": len(completed),
                            },
                        )
                    else:
                        record(f"c{cycle}_{name}", ok, {"ms": ms, "status": r.status_code})
                    if not ok:
                        cycle_row["ok"] = False
                except Exception as exc:
                    record(f"c{cycle}_{name}", False, {"error": str(exc)[:160]})
                    cycle_row["ok"] = False

            # Instant pickup — several GPS points
            points = random.sample(GPS_POINTS, k=min(4, len(GPS_POINTS)))
            for lat, lng, tag in points:
                t0 = time.perf_counter()
                try:
                    r = c.get(
                        "/api/places/reverse-geocode",
                        params={"lat": lat, "lng": lng},
                        headers=h,
                    )
                    ms = ms_since(t0)
                    note_latency("reverse_geocode", ms)
                    data = r.json() if r.content else {}
                    label = str(
                        data.get("pickup_label")
                        or data.get("short_label")
                        or data.get("address")
                        or ""
                    )
                    bad = is_plus(label) or is_coords(label) or not label
                    ok = r.status_code == 200 and not bad
                    record(
                        f"c{cycle}_pickup_{tag[:24]}",
                        ok,
                        {
                            "ms": ms,
                            "status": r.status_code,
                            "label": label[:80],
                            "tier": data.get("tier"),
                            "cache": data.get("cache"),
                            "plus": is_plus(label),
                            "coords": is_coords(label),
                        },
                    )
                    if not ok:
                        cycle_row["ok"] = False
                except Exception as exc:
                    record(f"c{cycle}_pickup_{tag[:24]}", False, {"error": str(exc)[:160]})
                    cycle_row["ok"] = False

            # Places autocomplete typing (pickup + destination)
            for kind, q in [
                ("pickup", "Victoria Island Lagos"),
                ("dest", random.choice(DEST_QUERIES)),
            ]:
                # simulate progressive typing for dest
                queries = [q[: max(3, len(q) // 2)], q] if kind == "dest" else [q]
                for partial in queries:
                    t0 = time.perf_counter()
                    try:
                        r = c.get(
                            "/api/places/autocomplete",
                            params={
                                "input": partial,
                                "components": "country:ng",
                                "location_bias": "6.43,3.42",
                                "radius": 42000,
                            },
                            headers=h,
                        )
                        ms = ms_since(t0)
                        note_latency("autocomplete", ms)
                        preds = (r.json() or {}).get("predictions") or []
                        ok = r.status_code == 200 and (len(preds) > 0 or len(partial) < 6)
                        record(
                            f"c{cycle}_ac_{kind}_{partial[:18]}",
                            ok,
                            {"ms": ms, "status": r.status_code, "n": len(preds)},
                        )
                        if not ok:
                            cycle_row["ok"] = False
                        if preds and kind == "dest" and partial == q:
                            pid = preds[0].get("place_id")
                            if pid:
                                t1 = time.perf_counter()
                                dr = c.get(f"/api/places/details/{pid}", headers=h)
                                dj = dr.json() if dr.content else {}
                                dok = (
                                    dr.status_code == 200
                                    and dj.get("latitude") is not None
                                    and dj.get("longitude") is not None
                                )
                                note_latency("place_details", ms_since(t1))
                                record(
                                    f"c{cycle}_details_{kind}",
                                    dok,
                                    {
                                        "ms": ms_since(t1),
                                        "status": dr.status_code,
                                        "label": str(dj.get("address") or "")[:70],
                                    },
                                )
                                if not dok:
                                    cycle_row["ok"] = False
                    except Exception as exc:
                        record(
                            f"c{cycle}_ac_{kind}",
                            False,
                            {"error": str(exc)[:160]},
                        )
                        cycle_row["ok"] = False

            # Fare estimate (book sheet)
            drop = random.choice(
                [
                    (6.4474, 3.4721, "Lekki Phase 1"),
                    (6.5244, 3.3792, "Ikeja"),
                    (6.5770, 3.3210, "MM Airport"),
                ]
            )
            t0 = time.perf_counter()
            try:
                est = c.post(
                    "/api/fare/estimate",
                    headers=h,
                    json={
                        "pickup_lat": 6.4281,
                        "pickup_lng": 3.4219,
                        "dropoff_lat": drop[0],
                        "dropoff_lng": drop[1],
                        "pickup_address": "Victoria Island, Lagos",
                        "dropoff_address": drop[2],
                        "service_type": "economy",
                        "city": "lagos",
                        "rider_id": uid,
                    },
                )
                ms = ms_since(t0)
                note_latency("fare_estimate", ms)
                ej = est.json() if est.content else {}
                eid = ej.get("estimate_id")
                ok = est.status_code == 200 and bool(eid)
                record(
                    f"c{cycle}_fare",
                    ok,
                    {
                        "ms": ms,
                        "status": est.status_code,
                        "estimate_id": bool(eid),
                        "min": ej.get("min_price") or ej.get("min_fare"),
                    },
                )
                if not ok:
                    cycle_row["ok"] = False
            except Exception as exc:
                record(f"c{cycle}_fare", False, {"error": str(exc)[:160]})
                cycle_row["ok"] = False
                eid = None
                ej = {}

            # Soft trip once mid-soak: request then cancel immediately
            if DO_TRIP and not trip_done and cycle >= 2 and eid:
                trip_done = True
                print("  → soft trip request + cancel", flush=True)
                try:
                    min_p = float(ej.get("min_price") or ej.get("min_fare") or 3500)
                    offer = max(3500.0, min_p)
                    payload = {
                        "pickup_lat": 6.4281,
                        "pickup_lng": 3.4219,
                        "dropoff_lat": drop[0],
                        "dropoff_lng": drop[1],
                        "pickup_address": "Victoria Island, Lagos",
                        "dropoff_address": drop[2],
                        "service_type": "economy",
                        "city": "lagos",
                        "fare_estimate_id": eid,
                        "offered_fare": offer,
                        "recommended_fare": float(
                            ej.get("base_price") or ej.get("total_fare") or offer
                        ),
                        "payment_method": "cash",
                        "trip_type": "intra",
                    }
                    t0 = time.perf_counter()
                    tr = c.post(
                        "/api/trips/request",
                        params={"rider_id": uid},
                        headers=h,
                        json=payload,
                    )
                    tj = tr.json() if tr.content else {}
                    trip = tj.get("trip") or {}
                    trip_id = trip.get("id") or tj.get("trip_id")
                    ok_req = tr.status_code == 200 and bool(trip_id)
                    record(
                        "soft_trip_request",
                        ok_req,
                        {
                            "ms": ms_since(t0),
                            "status": tr.status_code,
                            "trip_id": trip_id,
                            "eligible": tj.get("eligible_drivers"),
                            "error": str(tj.get("detail") or tj.get("message") or "")[:120]
                            if not ok_req
                            else None,
                        },
                    )
                    if trip_id:
                        t1 = time.perf_counter()
                        # confirm active
                        ar = c.get(f"/api/trips/active/{uid}", headers=h)
                        record(
                            "soft_trip_active",
                            ar.status_code == 200,
                            {"ms": ms_since(t1), "status": ar.status_code},
                        )
                        t2 = time.perf_counter()
                        cr = c.put(
                            f"/api/trips/{trip_id}/cancel",
                            headers=h,
                            json={"cancelled_by": uid},
                        )
                        record(
                            "soft_trip_cancel",
                            cr.status_code < 400,
                            {"ms": ms_since(t2), "status": cr.status_code},
                        )
                        # active should clear
                        time.sleep(1.2)
                        ar2 = c.get(f"/api/trips/active/{uid}", headers=h)
                        aj = ar2.json() if ar2.content else {}
                        still = bool(
                            (aj.get("trip") or aj.get("id") or aj.get("active"))
                            if isinstance(aj, dict)
                            else aj
                        )
                        # tolerate shapes: empty dict / null trip
                        cleared = (
                            ar2.status_code in (200, 404)
                            and not (isinstance(aj, dict) and aj.get("id") and str(aj.get("status", "")).lower() not in ("cancelled", "canceled", "completed"))
                        )
                        # If response wraps trip
                        if isinstance(aj, dict) and aj.get("trip"):
                            st = str((aj.get("trip") or {}).get("status") or "").lower()
                            cleared = st in ("", "cancelled", "canceled") or not aj.get("trip")
                        record(
                            "soft_trip_cleared",
                            cleared,
                            {"status": ar2.status_code, "body_keys": list(aj.keys())[:8] if isinstance(aj, dict) else type(aj).__name__},
                        )
                except Exception as exc:
                    record("soft_trip_request", False, {"error": str(exc)[:160]})

            # Places unauth still 401
            if cycle == 1:
                bare = c.get("/api/places/autocomplete", params={"input": "Lagos"})
                record(
                    "places_requires_auth",
                    bare.status_code in (401, 403),
                    {"status": bare.status_code},
                )

            results["cycles"].append(cycle_row)
            # Pace like a human tapping tabs — keep soak ~10min with several cycles
            sleep_for = 8 if remaining > 30 else 2
            time.sleep(sleep_for)

        # Final re-login (token refresh path)
        t0 = time.perf_counter()
        login2 = c.post("/api/auth/email-signin", json={"email": EMAIL})
        record(
            "re_signin",
            login2.status_code == 200 and bool((login2.json() or {}).get("token") or (login2.json() or {}).get("access_token")),
            {"ms": ms_since(t0), "status": login2.status_code},
        )

    # Latency summary
    summary_lat: dict[str, Any] = {}
    for k, arr in results["latencies_ms"].items():
        if not arr:
            continue
        s = sorted(arr)
        summary_lat[k] = {
            "n": len(s),
            "p50": s[len(s) // 2],
            "p95": s[max(0, int(len(s) * 0.95) - 1)],
            "max": s[-1],
        }
    results["latency_summary"] = summary_lat
    results["duration_sec_actual"] = round(time.time() - started, 1)
    results["cycles_run"] = cycle
    results["summary"] = {
        "passed": len(results["checks"]) - failed,
        "failed": failed,
        "total": len(results["checks"]),
        "plus_code_failures": sum(
            1 for f in results["failures"] if f.get("plus") or "plus" in str(f.get("name", "")).lower() and not f.get("ok")
        ),
    }
    results["finished_at"] = datetime.now(timezone.utc).isoformat()
    _write(results, failed)
    print("\n" + json.dumps(results["summary"], indent=2))
    print("Latency:", json.dumps(summary_lat, indent=2))
    print("Artifact:", OUT)
    return 0 if failed == 0 else 1


def _write(results: dict, failed: int) -> None:
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(results, f, indent=2, default=str)


if __name__ == "__main__":
    raise SystemExit(main())
