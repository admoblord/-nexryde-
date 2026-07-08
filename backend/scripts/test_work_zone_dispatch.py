#!/usr/bin/env python3
"""
Simulate Work Zone dispatch decisions — prints [ZONE] log lines without Mongo/Redis.

Usage:
  cd backend && python3 scripts/test_work_zone_dispatch.py
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from work_zone_areas import WORK_ZONE_AREAS
from work_zone_service import driver_work_zone_allows_trip, log_zone_dispatch_decision

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("server")


def _centroid(area_id: str) -> dict:
    a = WORK_ZONE_AREAS[area_id]
    return {"lat": a.centroid_lat, "lng": a.centroid_lng}


def main() -> None:
    zone_ids = ["victoria_island", "lekki_phase_1", "lekki_phase_2"]
    profile = {
        "user_id": "driver-test-001",
        "work_zone_active": True,
        "work_zone_area_ids": zone_ids,
    }

    scenarios = [
        ("trip-vi-lekki", _centroid("victoria_island"), _centroid("lekki_phase_1"), True),
        ("trip-vi-ikeja", _centroid("victoria_island"), _centroid("ikeja"), False),
        ("trip-lekki1-lekki2", _centroid("lekki_phase_1"), _centroid("lekki_phase_2"), True),
        ("trip-ikeja-yaba", _centroid("ikeja"), _centroid("yaba"), False),
    ]

    print("=== Work Zone dispatch simulation ===\n")
    print(f"Driver zone: {zone_ids}\n")

    for trip_id, pickup, dropoff, expect in scenarios:
        trip = {
            "id": trip_id,
            "pickup_location": pickup,
            "dropoff_location": dropoff,
        }
        allowed, meta = driver_work_zone_allows_trip(profile, trip)
        log_zone_dispatch_decision(
            driver_id=profile["user_id"],
            trip_id=trip_id,
            allowed=allowed,
            meta=meta,
        )
        status = "PASS" if allowed == expect else "FAIL"
        print(f"  {status}: {trip_id} expected={expect} got={allowed}\n")

    # Non-zoned driver — filter skipped (no [ZONE] log)
    open_profile = {"work_zone_active": False}
    cross_trip = {
        "id": "trip-open",
        "pickup_location": _centroid("victoria_island"),
        "dropoff_location": _centroid("ikeja"),
    }
    allowed, meta = driver_work_zone_allows_trip(open_profile, cross_trip)
    assert allowed is True and not meta.get("work_zone_filter")
    print("  PASS: non-zoned driver receives cross-zone trip (no [ZONE] log)\n")
    print("Done.")


if __name__ == "__main__":
    main()
