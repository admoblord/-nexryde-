#!/usr/bin/env python3
"""Step-by-step driver↔rider flow probe with timing checkpoints (session 274678)."""
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


def poll_rider_assignment(trip_id: str, rider_token: str, *, max_wait_s: float = 15.0) -> dict:
    """Simulate rider book.tsx pollForDriver until accepted_at appears."""
    t0 = time.time()
    attempt = 0
    last: dict = {}
    while time.time() - t0 < max_wait_s:
        attempt += 1
        last = e2e.trip_status(trip_id, rider_token)
        accepted = bool(last.get("accepted_at"))
        driver_id = (last.get("driver_info") or {}).get("driver_id") or last.get("driver_id")
        debug_session_log(
            "probe:rider_poll",
            "rider_status_poll",
            {
                "attempt": attempt,
                "status": last.get("status"),
                "has_driver": bool(driver_id),
                "accepted_at": accepted,
                "ms": int((time.time() - t0) * 1000),
            },
            "H-F2",
            "flow",
        )
        if accepted and driver_id:
            return {"ok": True, "attempts": attempt, "ms": int((time.time() - t0) * 1000), "status": last}
        time.sleep(2)
    return {"ok": False, "attempts": attempt, "ms": int((time.time() - t0) * 1000), "status": last}


def poll_driver_offer(driver_id: str, driver_token: str, trip_id: str, *, max_wait_s: float = 20.0) -> dict:
    """Simulate driver fetchIncomingRide until offer for trip_id appears."""
    t0 = time.time()
    attempt = 0
    while time.time() - t0 < max_wait_s:
        attempt += 1
        offer = e2e.fetch_driver_offer(driver_id, driver_token, trip_id)
        debug_session_log(
            "probe:driver_poll",
            "driver_offer_poll",
            {"attempt": attempt, "has_offer": bool(offer), "ms": int((time.time() - t0) * 1000)},
            "H-F1",
            "flow",
        )
        if offer:
            return {"ok": True, "attempts": attempt, "ms": int((time.time() - t0) * 1000), "offer": offer}
        time.sleep(1.5)
    return {"ok": False, "attempts": attempt, "ms": int((time.time() - t0) * 1000), "offer": None}


def main() -> int:
    t0 = time.time()
    debug_session_log("flow:start", "driver_rider_flow_begin", {"base": e2e.BASE_URL}, "H-F1", "flow")

    pair = e2e.provision_e2e_pair()
    rider, driver = pair["rider"], pair["driver"]
    e2e.prepare_driver_online(driver["id"], driver["token"])

    req_t0 = time.time()
    trip_id, eligible = e2e.request_trip(rider["id"], rider["token"], preferred_driver_id=driver["id"])
    req_ms = int((time.time() - req_t0) * 1000)
    debug_session_log(
        "flow:request",
        "rider_trip_created",
        {"trip_id": trip_id, "eligible": eligible, "ms": req_ms, "slow": req_ms > 12000},
        "H-F1",
        "flow",
    )

    offer_poll = poll_driver_offer(driver["id"], driver["token"], trip_id)
    if not offer_poll["ok"]:
        debug_session_log("flow:abort", "driver_never_got_offer", {"trip_id": trip_id}, "H-F1", "flow")
        e2e.cancel_trip(trip_id, rider["token"], rider["id"])
        return 1

    offer = offer_poll["offer"]
    proposed = float(offer.get("rider_offer_price") or offer.get("offered_fare") or offer.get("fare") or 3500)
    acc_t0 = time.time()
    code, body = e2e.accept_trip(trip_id, driver["id"], driver["token"], offer, proposed)
    acc_ms = int((time.time() - acc_t0) * 1000)
    detail = body.get("detail") if isinstance(body, dict) else str(body)[:120]
    debug_session_log(
        "flow:accept",
        "driver_accept_result",
        {"http": code, "ms": acc_ms, "detail": str(detail or "")[:120]},
        "H-F4",
        "flow",
    )
    if code != 200:
        e2e.cancel_trip(trip_id, rider["token"], rider["id"])
        return 1

    rider_poll = poll_rider_assignment(trip_id, rider["token"])
    rider_active = e2e.active_trip(rider["id"], rider["token"])
    driver_active = e2e.active_trip(driver["id"], driver["token"])
    same_trip = (
        (rider_active.get("trip") or {}).get("id") == trip_id
        and (driver_active.get("trip") or {}).get("id") == trip_id
    )
    debug_session_log(
        "flow:sync",
        "post_accept_sync",
        {
            "rider_poll_ok": rider_poll["ok"],
            "rider_poll_ms": rider_poll["ms"],
            "rider_poll_attempts": rider_poll["attempts"],
            "rider_active": rider_active.get("active"),
            "driver_active": driver_active.get("active"),
            "same_trip": same_trip,
            "rider_status": (rider_poll.get("status") or {}).get("status"),
            "accepted_at": bool((rider_poll.get("status") or {}).get("accepted_at")),
        },
        "H-F5",
        "flow",
    )

    e2e.cancel_trip(trip_id, rider["token"], rider["id"])
    ok = rider_poll["ok"] and same_trip
    debug_session_log(
        "flow:done",
        "driver_rider_flow_end",
        {"total_ms": int((time.time() - t0) * 1000), "ok": ok},
        "H-F5",
        "flow",
    )
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
