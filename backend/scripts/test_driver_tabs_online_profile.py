#!/usr/bin/env python3
"""
Driver login + tab/online/profile latency smoke against production.

Simulates what the app hits when loopy9ice opens each driver tab, toggles
online/offline, and loads profile. Exit 1 on critical endpoint failures.

Usage:
  python3 backend/scripts/test_driver_tabs_online_profile.py
"""
from __future__ import annotations

import concurrent.futures
import json
import os
import time
import uuid
from datetime import datetime, timezone

import httpx

BASE = os.environ.get(
    "BASE_URL",
    "https://nexryde-backend-993913300770.africa-south1.run.app",
).rstrip("/")
EMAIL = os.environ.get("DRIVER_EMAIL", "loopy9ice@gmail.com")
OUT = "/opt/cursor/artifacts/driver_tabs_online_profile_test.json"


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
            login.status_code == 200 and bool(token) and user.get("role") == "driver",
            {"ms": login_ms, "status": login.status_code, "name": user.get("name")},
        )
        if not token or not uid:
            open(OUT, "w").write(json.dumps(results, indent=2))
            return 1

        h = {"Authorization": f"Bearer {token}"}

        tab_calls = [
            ("home_onboarding", "GET", f"/api/drivers/{uid}/onboarding-status"),
            ("home_profile", "GET", f"/api/drivers/{uid}/profile"),
            ("home_subscription", "GET", "/api/driver/subscription-status"),
            ("home_earnings_today", "GET", f"/api/driver/earnings/{uid}?period=today"),
            ("home_categories", "GET", f"/api/drivers/{uid}/categories"),
            ("home_legal", "GET", f"/api/users/{uid}/legal-status"),
            ("home_active_trip", "GET", f"/api/trips/active/{uid}"),
            ("home_offers", "GET", f"/api/trips/offers/{uid}"),
            ("earnings_week", "GET", f"/api/driver/earnings/{uid}?period=week"),
            ("earnings_withdrawals", "GET", f"/api/drivers/{uid}/withdrawals?limit=1"),
            ("earnings_bank", "GET", f"/api/drivers/{uid}/bank-details"),
            ("trips_history", "GET", f"/api/trips/user/{uid}?role=driver&limit=20"),
            ("notifications", "GET", f"/api/users/{uid}/notifications?limit=40"),
            ("unread_badge", "GET", f"/api/users/{uid}/notifications?unread_only=true&limit=1"),
            ("profile_vehicles", "GET", f"/api/drivers/{uid}/vehicles"),
            ("profile_trust", "GET", f"/api/users/{uid}/trust-summary"),
            ("work_zone", "GET", f"/api/drivers/{uid}/work-zone"),
        ]

        for name, method, path in tab_calls:
            t0 = time.perf_counter()
            r = c.request(method, path, headers=h)
            check(name, r.status_code == 200, {"ms": ms_since(t0), "status": r.status_code})

        # Profile bundle parallel (what the fixed profile tab does)
        t0 = time.perf_counter()
        paths = [
            f"/api/drivers/{uid}/profile",
            f"/api/drivers/{uid}/vehicles",
            "/api/driver/subscription-status",
            f"/api/users/{uid}/trust-summary",
        ]
        with concurrent.futures.ThreadPoolExecutor(4) as ex:
            codes = list(ex.map(lambda p: c.get(p, headers=h).status_code, paths))
        check(
            "profile_bundle_parallel",
            all(code == 200 for code in codes),
            {"ms": ms_since(t0), "codes": codes},
        )

        # Places auth (work-zone / destination search)
        t0 = time.perf_counter()
        places = c.get(
            "/api/places/autocomplete",
            params={"input": "Victoria Island Lagos", "sessiontoken": "drv-smoke"},
            headers=h,
        )
        preds = (places.json() or {}).get("predictions") or []
        check(
            "places_autocomplete",
            places.status_code == 200 and len(preds) > 0,
            {"ms": ms_since(t0), "status": places.status_code, "n": len(preds)},
        )
        unauth = c.get("/api/places/autocomplete", params={"input": "Victoria Island Lagos"})
        check("places_requires_auth", unauth.status_code == 401, {"status": unauth.status_code})

        # Online / offline toggle (client is optimistic; API must still succeed)
        t0 = time.perf_counter()
        online = c.put(
            f"/api/drivers/{uid}/online",
            params={
                "is_online": "true",
                "request_id": str(uuid.uuid4()),
                "lat": 6.4281,
                "lng": 3.4219,
            },
            headers=h,
        )
        check(
            "go_online",
            online.status_code == 200,
            {
                "ms": ms_since(t0),
                "status": online.status_code,
                "detail": str((online.json() or {}).get("detail") or "")[:120],
            },
        )
        t0 = time.perf_counter()
        offline = c.put(
            f"/api/drivers/{uid}/online",
            params={
                "is_online": "false",
                "request_id": str(uuid.uuid4()),
                "lat": 6.4281,
                "lng": 3.4219,
            },
            headers=h,
        )
        check(
            "go_offline",
            offline.status_code == 200,
            {"ms": ms_since(t0), "status": offline.status_code},
        )

        # Home boot: parallel should beat sequential cold waterfalls
        boot_paths = [
            f"/api/drivers/{uid}/profile",
            f"/api/driver/earnings/{uid}?period=today",
            f"/api/drivers/{uid}/categories",
            f"/api/users/{uid}/legal-status",
        ]
        t0 = time.perf_counter()
        for p in boot_paths:
            c.get(p, headers=h)
        seq_ms = ms_since(t0)
        t0 = time.perf_counter()
        with concurrent.futures.ThreadPoolExecutor(4) as ex:
            list(ex.map(lambda p: c.get(p, headers=h).status_code, boot_paths))
        par_ms = ms_since(t0)
        check(
            "home_boot_parallel_faster",
            par_ms <= seq_ms + 50,
            {"sequential_ms": seq_ms, "parallel_ms": par_ms},
        )

    results["passed"] = sum(1 for x in results["checks"] if x["ok"])
    results["failed"] = failed
    results["total"] = len(results["checks"])
    results["finished_at"] = datetime.now(timezone.utc).isoformat()
    open(OUT, "w").write(json.dumps(results, indent=2))
    print(json.dumps({"passed": results["passed"], "failed": failed, "total": results["total"]}, indent=2))
    print(f"Artifact: {OUT}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
