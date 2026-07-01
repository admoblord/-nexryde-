#!/usr/bin/env python3
"""Probe production ride flow and append NDJSON to Cursor debug log (session 274678)."""
from __future__ import annotations

import importlib.util
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from debug_session_log import debug_session_log

spec = importlib.util.spec_from_file_location("e2e", os.path.join(ROOT, "scripts", "e2e_ride_acceptance_sync_test.py"))
e2e = importlib.util.module_from_spec(spec)
spec.loader.exec_module(e2e)


def main() -> int:
    t0 = time.time()
    debug_session_log("probe:start", "ride_flow_probe_begin", {"base": e2e.BASE_URL}, "H-A", "probe")

    pair = e2e.provision_e2e_pair()
    rider, driver = pair["rider"], pair["driver"]
    e2e.prepare_driver_online(driver["id"], driver["token"])

    req_t0 = time.time()
    trip_id, eligible = e2e.request_trip(rider["id"], rider["token"], preferred_driver_id=driver["id"])
    req_ms = int((time.time() - req_t0) * 1000)
    debug_session_log(
        "probe:request",
        "trip_request_done",
        {"trip_id": trip_id, "eligible": eligible, "ms": req_ms},
        "H-A",
        "probe",
    )

    offer = e2e.fetch_driver_offer(driver["id"], driver["token"], trip_id)
    debug_session_log(
        "probe:offer",
        "driver_offer_fetched",
        {"has_offer": bool(offer), "trip_id": trip_id},
        "H-C",
        "probe",
    )
    if not offer:
        debug_session_log("probe:abort", "no_driver_offer", {"trip_id": trip_id}, "H-C", "probe")
        return 1

    proposed = float(offer.get("rider_offer_price") or offer.get("offered_fare") or offer.get("fare") or 3500)
    acc_t0 = time.time()
    code, body = e2e.accept_trip(trip_id, driver["id"], driver["token"], offer, proposed)
    acc_ms = int((time.time() - acc_t0) * 1000)
    detail = body.get("detail") if isinstance(body, dict) else str(body)[:120]
    debug_session_log(
        "probe:accept",
        "driver_accept_done",
        {"http": code, "ms": acc_ms, "detail": str(detail or "")[:120]},
        "H-D",
        "probe",
    )

    st = e2e.trip_status(trip_id, rider["token"])
    rider_active = e2e.active_trip(rider["id"], rider["token"])
    driver_active = e2e.active_trip(driver["id"], driver["token"])
    debug_session_log(
        "probe:sync",
        "assignment_sync_check",
        {
            "rider_status": st.get("status"),
            "rider_driver_id": (st.get("driver_info") or {}).get("driver_id") or st.get("driver_id"),
            "accepted_at": bool(st.get("accepted_at")),
            "rider_active": rider_active.get("active"),
            "driver_active": driver_active.get("active"),
            "same_trip": (rider_active.get("trip") or {}).get("id") == trip_id
            and (driver_active.get("trip") or {}).get("id") == trip_id,
        },
        "H-E",
        "probe",
    )

    e2e.cancel_trip(trip_id, rider["token"], rider["id"])
    debug_session_log(
        "probe:done",
        "ride_flow_probe_end",
        {"total_ms": int((time.time() - t0) * 1000), "ok": code == 200},
        "H-E",
        "probe",
    )
    return 0 if code == 200 else 1


if __name__ == "__main__":
    raise SystemExit(main())
