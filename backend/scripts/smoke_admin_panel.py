#!/usr/bin/env python3
"""Smoke-test all admin panel API endpoints (requires running backend + admin credentials)."""
from __future__ import annotations

import os
import sys
import json
import urllib.request
import urllib.error

BASE = os.environ.get("ADMIN_SMOKE_BASE", "http://127.0.0.1:8000").rstrip("/")
EMAIL = os.environ.get("ADMIN_EMAIL", os.environ.get("SMOKE_ADMIN_EMAIL", ""))
PASSWORD = os.environ.get("ADMIN_PASSWORD", os.environ.get("SMOKE_ADMIN_PASSWORD", ""))

GET_ENDPOINTS = [
    "/api/admin/ops-center",
    "/api/admin/analytics?period=7d",
    "/api/admin/trips/live",
    "/api/admin/driver-approval-queue",
    "/api/admin/subscription-intelligence",
    "/api/admin/withdrawals",
    "/api/admin/audit-logs",
    "/api/admin/system-health",
    "/api/admin/drivers/live-status",
    "/api/admin/dispatch",
    "/api/admin/announcements",
    "/api/admin/feature-flags",
    "/api/admin/kpi-scoreboard",
    "/api/admin/subscriptions",
    "/api/admin/surge-config",
    "/api/admin/release-config",
    "/api/admin/referral-stats",
    "/api/admin/content-config",
    "/api/admin/system-audit",
    "/api/admin/drivers",
    "/api/admin/riders",
    "/api/admin/trips",
    "/api/admin/payments",
    "/api/admin/promos",
    "/api/admin/pricing/current",
    "/api/admin/sos-alerts",
    "/api/admin/reports/all",
    "/api/admin/abuse-prevention/stats",
    "/api/admin/vehicle-registrations",
    "/api/admin/live-stats",
    "/api/work-zone/areas",
    "/api/admin/search?q=test",
    "/api/admin/dispatch/monitor",
    "/api/admin/maps-usage",
    "/api/admin/fraud/flags",
    "/api/admin/notifications/delivery-stats",
    "/api/admin/live-map-data",
]

STATIC_PATHS = [
    "/admin/",
    "/admin/index.html",
]


def req(method: str, path: str, token: str | None = None, body: dict | None = None) -> tuple[int, str]:
    url = f"{BASE}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, resp.read(500).decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read(500).decode("utf-8", errors="replace")


def main() -> int:
    if not EMAIL or not PASSWORD:
        print("SKIP: set ADMIN_EMAIL and ADMIN_PASSWORD for authenticated smoke test")
        return 0

    print(f"Admin smoke test → {BASE}")
    fails = 0

    # Static admin SPA
    for path in STATIC_PATHS:
        code, _ = req("GET", path)
        ok = code == 200
        print(f"{'✓' if ok else '✗'} GET {path} → {code}")
        fails += 0 if ok else 1

    # Login
    code, raw = req("POST", "/api/admin/login", body={"email": EMAIL, "password": PASSWORD})
    if code != 200:
        print(f"✗ POST /api/admin/login → {code} {raw[:200]}")
        return 1
    token = json.loads(raw).get("token")
    if not token:
        print("✗ Login returned no token")
        return 1
    print("✓ POST /api/admin/login")

    for path in GET_ENDPOINTS:
        code, raw = req("GET", path, token=token)
        ok = code == 200
        print(f"{'✓' if ok else '✗'} GET {path} → {code}" + (f" {raw[:80]}" if not ok else ""))
        if not ok:
            fails += 1

    print(f"\n{'All checks passed' if fails == 0 else f'{fails} check(s) failed'}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
