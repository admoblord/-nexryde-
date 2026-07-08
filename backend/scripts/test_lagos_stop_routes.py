#!/usr/bin/env python3
"""Test Lagos driving routes + fare with/without intermediate stops."""
from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

BACKEND = "https://nexryde-backend-993913300770.us-central1.run.app"

# Major Lagos corridors (lat, lng)
LOCATIONS = {
    "sangotedo": (6.4467, 3.6108),
    "victoria_island": (6.4281, 3.4219),
    "ikeja": (6.6018, 3.3515),
    "lekki_phase1": (6.4474, 3.4700),
    "yaba": (6.5095, 3.3711),
    "ajah": (6.4673, 3.6025),
    "maryland": (6.5784, 3.3676),
    "ikoyi": (6.4541, 3.4346),
    "berger": (6.6412, 3.3518),
    "cms_marina": (6.4540, 3.3947),
    "ikota": (6.4678, 3.5576),
    "blenco_sangotedo": (6.4419, 3.6253),
    "chevron": (6.4470, 3.5090),
    "festac": (6.4698, 3.2822),
    "surulere": (6.4969, 3.3558),
}


@dataclass
class RouteCase:
    name: str
    pickup: str
    destination: str
    stop: str | None = None


CASES = [
    RouteCase("Sangotedo → VI", "sangotedo", "victoria_island", "chevron"),
    RouteCase("Ikeja → Lekki", "ikeja", "lekki_phase1", "yaba"),
    RouteCase("Yaba → Ajah", "yaba", "ajah", "ikota"),
    RouteCase("Maryland → Ikoyi", "maryland", "ikoyi", "surulere"),
    RouteCase("Berger → CMS", "berger", "cms_marina", "ikeja"),
    RouteCase("Festac → VI", "festac", "victoria_island", "surulere"),
    RouteCase("Sangotedo → Ikota (user corridor)", "sangotedo", "ikota", "blenco_sangotedo"),
    RouteCase("Ajah → Maryland", "ajah", "maryland", "lekki_phase1"),
]


def fetch_json(url: str, method: str = "GET", body: dict | None = None) -> dict[str, Any]:
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=45) as resp:
        return json.loads(resp.read().decode())


def driving_route(
    pickup: tuple[float, float],
    dropoff: tuple[float, float],
    stop: tuple[float, float] | None = None,
) -> dict[str, Any]:
    p_lat, p_lng = pickup
    d_lat, d_lng = dropoff
    q: dict[str, str] = {
        "pickup_lat": str(p_lat),
        "pickup_lng": str(p_lng),
        "dropoff_lat": str(d_lat),
        "dropoff_lng": str(d_lng),
    }
    if stop:
        q["stop_lat"] = str(stop[0])
        q["stop_lng"] = str(stop[1])
    url = f"{BACKEND}/api/places/driving-route?{urllib.parse.urlencode(q)}"
    return fetch_json(url)


def fare_estimate(
    pickup: tuple[float, float],
    dropoff: tuple[float, float],
    stop: tuple[float, float] | None,
    distance_m: float,
    duration_s: float,
) -> dict[str, Any]:
    p_lat, p_lng = pickup
    d_lat, d_lng = dropoff
    body: dict[str, Any] = {
        "pickup_lat": p_lat,
        "pickup_lng": p_lng,
        "dropoff_lat": d_lat,
        "dropoff_lng": d_lng,
        "service_type": "economy",
        "city": "lagos",
        "google_route_distance_meters": int(round(distance_m)),
        "google_route_duration_seconds": int(round(duration_s)),
    }
    if stop:
        body["stop_lat"] = stop[0]
        body["stop_lng"] = stop[1]
    url = f"{BACKEND}/api/fare/estimate"
    return fetch_json(url, method="POST", body=body)


def fmt_route(r: dict[str, Any]) -> tuple[float, float]:
    dm = float(r.get("distance_meters") or 0)
    ds = float(r.get("duration_seconds") or 0)
    dit = float(r.get("duration_in_traffic_seconds") or ds)
    dur = max(ds, dit)
    return dm / 1000, dur / 60


def run_case(case: RouteCase) -> dict[str, Any]:
    pickup = LOCATIONS[case.pickup]
    dropoff = LOCATIONS[case.destination]
    stop = LOCATIONS[case.stop] if case.stop else None

    direct = driving_route(pickup, dropoff)
    with_stop = driving_route(pickup, dropoff, stop) if stop else None

    d_km, d_min = fmt_route(direct)
    s_km, s_min = fmt_route(with_stop) if with_stop else (0.0, 0.0)

    direct_fare = fare_estimate(pickup, dropoff, None, d_km * 1000, d_min * 60)
    stop_fare = (
        fare_estimate(pickup, dropoff, stop, s_km * 1000, s_min * 60)
        if stop
        else {}
    )

    d_fare = float(direct_fare.get("total_fare") or direct_fare.get("fare") or 0)
    s_fare = float(stop_fare.get("total_fare") or stop_fare.get("fare") or 0) if stop_fare else 0

    duration_changed = abs(s_min - d_min) >= 1.0 if stop else True
    metrics_differ = abs(s_km - d_km) >= 0.3 or duration_changed if stop else True

    return {
        "case": case.name,
        "stop": case.stop,
        "direct_km": round(d_km, 2),
        "direct_min": round(d_min, 1),
        "direct_fare": round(d_fare),
        "stop_km": round(s_km, 2) if stop else None,
        "stop_min": round(s_min, 1) if stop else None,
        "stop_fare": round(s_fare) if stop else None,
        "duration_changed": duration_changed,
        "metrics_differ": metrics_differ,
        "ok": bool(direct.get("distance_meters")) and (not stop or bool(with_stop and with_stop.get("distance_meters"))),
    }


def main() -> int:
    print(f"Backend: {BACKEND}\n")
    print(f"{'Route':<32} {'Direct':>18} {'With stop':>18} {'Δ min':>8} {'OK':>4}")
    print("-" * 86)

    failures = 0
    for case in CASES:
        try:
            r = run_case(case)
        except Exception as e:
            print(f"{case.name:<32} ERROR: {e}")
            failures += 1
            continue

        direct = f"{r['direct_km']}km {r['direct_min']}m ₦{r['direct_fare']:,}"
        if r["stop_min"] is not None:
            with_s = f"{r['stop_km']}km {r['stop_min']}m ₦{r['stop_fare']:,}"
            delta = f"{r['stop_min'] - r['direct_min']:+.1f}"
        else:
            with_s = "—"
            delta = "—"

        ok = r["ok"] and r["metrics_differ"]
        if not ok:
            failures += 1
        flag = "✓" if ok else "✗"
        print(f"{r['case']:<32} {direct:>18} {with_s:>18} {delta:>8} {flag:>4}")

        if not r["metrics_differ"]:
            print(f"  ⚠ stop did not change route metrics (stop={r['stop']})")

    print("-" * 86)
    if failures:
        print(f"FAILED: {failures}/{len(CASES)} cases")
        return 1
    print(f"PASSED: all {len(CASES)} Lagos stop-route cases")
    return 0


if __name__ == "__main__":
    sys.exit(main())
