#!/usr/bin/env python3
"""
Rider login + tab/places/profile latency smoke against production.

Simulates what the app hits when josephbbs12 opens each rider tab and types
pickup/destination. Exit 1 if places auth fails or critical endpoints error.

Usage:
  python3 backend/scripts/test_rider_tabs_places_profile.py
"""
from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone

import httpx

BASE = os.environ.get(
    "BASE_URL",
    "https://nexryde-backend-993913300770.africa-south1.run.app",
).rstrip("/")
EMAIL = os.environ.get("RIDER_EMAIL", "josephbbs12@gmail.com")
OUT = "/opt/cursor/artifacts/rider_tabs_places_profile_test.json"


def ms_since(t0: float) -> int:
    return int((time.perf_counter() - t0) * 1000)


def main() -> int:
    results: dict = {
        "started_at": datetime.now(timezone.utc).isoformat(),
        "base_url": BASE,
        "email": EMAIL,
        "checks": [],
    }
    failed = 0

    def check(name: str, ok: bool, detail: dict | None = None) -> None:
        nonlocal failed
        row = {"name": name, "ok": ok, **(detail or {})}
        results["checks"].append(row)
        mark = "✓" if ok else "✗"
        print(f"  {mark}  {name} {detail or ''}")
        if not ok:
            failed += 1

    with httpx.Client(base_url=BASE, timeout=45.0) as c:
        t0 = time.perf_counter()
        login = c.post("/api/auth/email-signin", json={"email": EMAIL})
        login_ms = ms_since(t0)
        body = login.json() if login.content else {}
        user = body.get("user") or {}
        token = body.get("token") or body.get("access_token")
        uid = user.get("id")
        check(
            "email_signin",
            login.status_code == 200 and bool(token) and user.get("role") == "rider",
            {"ms": login_ms, "status": login.status_code, "name": user.get("name")},
        )
        if not token or not uid:
            open(OUT, "w").write(json.dumps(results, indent=2))
            return 1

        h = {"Authorization": f"Bearer {token}"}

        # Tab-equivalent endpoints
        tab_calls = [
            ("home_legal_status", "GET", f"/api/users/{uid}/legal-status"),
            ("home_verification", "GET", f"/api/users/{uid}/rider-verification-status"),
            ("home_active_trip", "GET", f"/api/trips/active/{uid}"),
            ("trips_history", "GET", f"/api/trips/user/{uid}?role=rider"),
            ("notifications", "GET", f"/api/users/{uid}/notifications?limit=40"),
            ("wallet_me", "GET", "/api/wallet/me"),
            ("profile_user", "GET", f"/api/users/{uid}"),
            ("profile_trust", "GET", f"/api/users/{uid}/trust-summary"),
            ("profile_referral", "GET", "/api/incentives/referral-code"),
        ]
        for name, method, path in tab_calls:
            t0 = time.perf_counter()
            r = c.request(method, path, headers=h)
            ok = r.status_code < 400
            # trips may 404 empty — still ok if 200/empty list
            check(name, ok, {"ms": ms_since(t0), "status": r.status_code})

        # Profile parallel vs sequential
        t0 = time.perf_counter()
        # sequential mimic (old)
        c.get(f"/api/users/{uid}/trust-summary", headers=h)
        c.get(f"/api/users/{uid}", headers=h)
        c.get("/api/incentives/referral-code", headers=h)
        seq_ms = ms_since(t0)

        t0 = time.perf_counter()
        import concurrent.futures

        def get(path: str):
            return c.get(path, headers=h)

        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
            futs = [
                ex.submit(get, f"/api/users/{uid}/trust-summary"),
                ex.submit(get, f"/api/users/{uid}"),
                ex.submit(get, "/api/incentives/referral-code"),
            ]
            codes = [f.result().status_code for f in futs]
        par_ms = ms_since(t0)
        check(
            "profile_parallel_faster",
            par_ms < seq_ms and all(code < 400 for code in codes),
            {"parallel_ms": par_ms, "sequential_ms": seq_ms, "codes": codes},
        )

        # Places pickup → destination flow
        for label, q in [("pickup", "Victoria Island Lagos"), ("destination", "Lekki Phase 1")]:
            t0 = time.perf_counter()
            ar = c.get(
                "/api/places/autocomplete",
                params={"input": q, "components": "country:ng", "location_bias": "6.43,3.42", "radius": 42000},
                headers=h,
            )
            ams = ms_since(t0)
            preds = (ar.json() or {}).get("predictions") or []
            check(
                f"places_autocomplete_{label}",
                ar.status_code == 200 and len(preds) > 0,
                {"ms": ams, "status": ar.status_code, "n": len(preds)},
            )
            if not preds:
                continue
            pid = preds[0].get("place_id")
            t0 = time.perf_counter()
            dr = c.get(f"/api/places/details/{pid}", headers=h)
            dj = dr.json() if dr.content else {}
            check(
                f"places_details_{label}",
                dr.status_code == 200
                and dj.get("latitude") is not None
                and dj.get("longitude") is not None,
                {
                    "ms": ms_since(t0),
                    "status": dr.status_code,
                    "address": str(dj.get("address") or "")[:80],
                },
            )

        # Unauthed places must 401 (proves auth is required — client must send bearer)
        bare = c.get(
            "/api/places/autocomplete",
            params={"input": "Lagos"},
        )
        check(
            "places_requires_auth",
            bare.status_code in (401, 403),
            {"status": bare.status_code},
        )

        # Fare estimate VI→Lekki (book flow)
        t0 = time.perf_counter()
        est = c.post(
            "/api/fare/estimate",
            headers=h,
            json={
                "pickup_lat": 6.4281,
                "pickup_lng": 3.4219,
                "dropoff_lat": 6.4474,
                "dropoff_lng": 3.4721,
                "pickup_address": "Victoria Island, Lagos",
                "dropoff_address": "Lekki Phase 1, Lagos",
                "service_type": "economy",
                "city": "lagos",
                "rider_id": uid,
            },
        )
        check(
            "fare_estimate",
            est.status_code == 200 and bool((est.json() or {}).get("estimate_id")),
            {"ms": ms_since(t0), "status": est.status_code},
        )

    results["summary"] = {
        "passed": len(results["checks"]) - failed,
        "failed": failed,
        "total": len(results["checks"]),
    }
    results["finished_at"] = datetime.now(timezone.utc).isoformat()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, "w").write(json.dumps(results, indent=2, default=str))
    print(json.dumps(results["summary"], indent=2))
    print("Artifact:", OUT)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
