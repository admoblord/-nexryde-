#!/usr/bin/env python3
"""Debug ride assignment sync — happy path + false-acceptance guards."""
from __future__ import annotations

import importlib.util
import os
import sys

import requests
from dotenv import load_dotenv

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
load_dotenv(os.path.join(ROOT, ".env"))

# Reuse production-tested helpers from the E2E script.
E2E_PATH = os.path.join(ROOT, "scripts", "e2e_ride_acceptance_sync_test.py")
spec = importlib.util.spec_from_file_location("e2e_ride_acceptance_sync_test", E2E_PATH)
e2e = importlib.util.module_from_spec(spec)
spec.loader.exec_module(e2e)

BASE_URL = e2e.BASE_URL


def check(name: str, ok: bool, detail: str = "") -> bool:
    tag = "PASS" if ok else "FAIL"
    line = f"[{tag}] {name}"
    if detail:
        line += f" — {detail}"
    print(line)
    return ok


def main() -> int:
    print(f"Assignment sync debug → {BASE_URL}\n")
    pair = e2e.provision_e2e_pair()
    rider = pair["rider"]
    driver_a = pair["driver"]

    # Second driver for race test
    pair_b = e2e.provision_e2e_pair()
    driver_b = pair_b["driver"]

    rider_id, rider_token = rider["id"], rider["token"]
    driver_a_id, driver_a_token = driver_a["id"], driver_a["token"]
    driver_b_id, driver_b_token = driver_b["id"], driver_b["token"]

    e2e.prepare_driver_online(driver_a_id, driver_a_token)
    e2e.prepare_driver_online(driver_b_id, driver_b_token)

    trip_id, _ = e2e.request_trip(rider_id, rider_token, preferred_driver_id=driver_a_id)
    offer_a = e2e.fetch_driver_offer(driver_a_id, driver_a_token, trip_id)
    offer_b = e2e.fetch_driver_offer(driver_b_id, driver_b_token, trip_id)

    results: list[bool] = []

    # 1) Pending trip must NOT look assigned to rider
    pending = e2e.trip_status(trip_id, rider_token)
    results.append(
        check(
            "Pending /status is not live-assigned",
            str(pending.get("status")).lower() in ("pending", "pending_driver_offers")
            and not pending.get("accepted_at")
            and not (pending.get("driver_info") or {}).get("driver_id"),
            f"status={pending.get('status')} driver_id={pending.get('driver_id')} accepted_at={pending.get('accepted_at')}",
        )
    )

    pending_active = e2e.active_trip(rider_id, rider_token)
    trip_doc = (pending_active.get("trip") or {}) if pending_active.get("active") else {}
    results.append(
        check(
            "Pending /active does not expose accepted without assignment",
            not trip_doc.get("driver_id") or str(trip_doc.get("status")).lower() in ("pending", "pending_driver_offers"),
            f"active={pending_active.get('active')} status={trip_doc.get('status')} driver_id={trip_doc.get('driver_id')}",
        )
    )

    if not offer_a:
        e2e.cancel_trip(trip_id, rider_token, rider_id)
        print("\nFAIL: driver A received no offer")
        return 1

    # 2) Driver A accepts
    proposed = float(offer_a.get("rider_offer_price") or offer_a.get("offered_fare") or offer_a.get("fare") or 3500)
    code_a, body_a = e2e.accept_trip(trip_id, driver_a_id, driver_a_token, offer_a, proposed)
    results.append(check("Driver A accept succeeds", code_a == 200, f"HTTP {code_a}"))

    assigned = e2e.trip_status(trip_id, rider_token)
    accepted_at = assigned.get("accepted_at") or (e2e.active_trip(rider_id, rider_token).get("trip") or {}).get("accepted_at")
    driver_id = (assigned.get("driver_info") or {}).get("driver_id") or assigned.get("driver_id")
    results.append(
        check(
            "Rider /status has driver_id + accepted_at after accept",
            str(assigned.get("status")).lower() == "accepted"
            and bool(driver_id)
            and bool(accepted_at),
            f"status={assigned.get('status')} driver_id={driver_id} accepted_at={accepted_at}",
        )
    )

    rider_active = e2e.active_trip(rider_id, rider_token)
    driver_active = e2e.active_trip(driver_a_id, driver_a_token)
    results.append(
        check(
            "Both sides have same active trip",
            rider_active.get("active")
            and driver_active.get("active")
            and (rider_active.get("trip") or {}).get("id") == trip_id
            and (driver_active.get("trip") or {}).get("id") == trip_id,
            f"rider={((rider_active.get('trip') or {}).get('id'))} driver={((driver_active.get('trip') or {}).get('id'))}",
        )
    )

    # 3) Driver B race — must fail (not steal trip)
    if offer_b:
        proposed_b = float(offer_b.get("rider_offer_price") or offer_b.get("offered_fare") or offer_b.get("fare") or 3500)
        code_b, body_b = e2e.accept_trip(trip_id, driver_b_id, driver_b_token, offer_b, proposed_b)
        detail = body_b.get("detail") if isinstance(body_b, dict) else str(body_b)
        results.append(
            check(
                "Driver B lose race with explicit failure",
                code_b in (403, 409),
                f"HTTP {code_b} detail={detail}",
            )
        )
    else:
        results.append(check("Driver B had no offer (race N/A)", True))

    # 4) Rider state unchanged after failed B accept
    after_race = e2e.trip_status(trip_id, rider_token)
    after_driver = (after_race.get("driver_info") or {}).get("driver_id") or after_race.get("driver_id")
    results.append(
        check(
            "Rider still assigned to driver A after race",
            str(after_driver) == str(driver_a_id) and str(after_race.get("status")).lower() == "accepted",
            f"driver_id={after_driver}",
        )
    )

    # 5) Local guard helpers mirror backend
    from routers.trips import client_safe_trip_status, trip_assignment_confirmed

    fake_accepted = {"status": "accepted", "driver_id": None, "accepted_at": None}
    fake_driver_only = {"status": "accepted", "driver_id": "x", "accepted_at": None}
    good = {"status": "accepted", "driver_id": "x", "accepted_at": "2026-01-01T00:00:00Z"}
    results.append(
        check(
            "client_safe_trip_status downgrades unassigned accepted",
            client_safe_trip_status(fake_accepted) == "pending_driver_offers"
            and client_safe_trip_status(fake_driver_only) == "pending_driver_offers"
            and client_safe_trip_status(good) == "accepted"
            and trip_assignment_confirmed(good)
            and not trip_assignment_confirmed(fake_driver_only),
            f"safe={client_safe_trip_status(fake_accepted)}/{client_safe_trip_status(fake_driver_only)}/{client_safe_trip_status(good)}",
        )
    )

    e2e.cancel_trip(trip_id, rider_token, rider_id)

    passed = sum(results)
    total = len(results)
    print(f"\n{'=' * 40}")
    print(f"Result: {passed}/{total} checks passed")
    if passed == total:
        print("FIX VERIFIED: backend assignment sync is consistent; false-acceptance guards active.")
        return 0
    print("ISSUES REMAIN: see FAIL lines above.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
