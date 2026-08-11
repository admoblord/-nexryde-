#!/usr/bin/env python3
"""
Full A-to-Z app debug probe (session 274678).

Areas tested:
  A  Health / infra
  B  Auth – rider register + login
  C  Auth – driver register + approval + login
  D  Driver online / location / profile
  E  Fare estimate
  F  Trip request (rider)
  G  Driver offer delivery
  H  Driver accept
  I  Assignment sync (rider status poll + active trip)
  J  Driver arrive
  K  Trip start
  L  Trip location update + ETA
  M  Trip complete
  N  Rating
  O  Wallet balance
  P  Chat
  Q  Cancellation (separate trip)
  R  WebSocket endpoints reachable

Each step logs to the debug NDJSON file and prints a pass/fail summary.
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

import requests
from dotenv import load_dotenv

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
load_dotenv(os.path.join(ROOT, ".env"))

from debug_session_log import debug_session_log

BASE = (
    os.environ.get("NEXRYDE_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or "https://nexryde-backend-993913300770.us-central1.run.app"
).rstrip("/")

spec = importlib.util.spec_from_file_location("e2e", os.path.join(ROOT, "scripts", "e2e_ride_acceptance_sync_test.py"))
e2e = importlib.util.module_from_spec(spec)
spec.loader.exec_module(e2e)

PICKUP  = {"lat": 6.5244, "lng": 3.3792, "address": "Victoria Island, Lagos"}
DROPOFF = {"lat": 6.45,   "lng": 3.40,   "address": "Lekki Phase 1, Lagos"}

results: List[Dict[str, Any]] = []

def h(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

def log(step: str, label: str, ok: bool, data: Dict[str, Any], hyp: str = "H-Z") -> None:
    status = "PASS" if ok else "FAIL"
    data["status"] = status
    debug_session_log(f"probe:{step}", label, data, hyp, "full-az")
    results.append({"step": step, "label": label, "ok": ok, "data": data})
    icon = "✅" if ok else "❌"
    print(f"  {icon}  [{step}] {label}: {status}  {json.dumps({k:v for k,v in data.items() if k != 'status'})}")

def get(path: str, token: str, *, timeout: int = 20) -> Tuple[int, Any]:
    try:
        r = requests.get(f"{BASE}{path}", headers=h(token), timeout=timeout)
        try:
            return r.status_code, r.json()
        except Exception:
            return r.status_code, r.text
    except Exception as exc:
        return 0, str(exc)

def post(path: str, token: str, body: Any = None, *, timeout: int = 30) -> Tuple[int, Any]:
    try:
        r = requests.post(f"{BASE}{path}", headers=h(token), json=body or {}, timeout=timeout)
        try:
            return r.status_code, r.json()
        except Exception:
            return r.status_code, r.text
    except Exception as exc:
        return 0, str(exc)

def put(path: str, token: str, body: Any = None, *, timeout: int = 30) -> Tuple[int, Any]:
    try:
        r = requests.put(f"{BASE}{path}", headers=h(token), json=body or {}, timeout=timeout)
        try:
            return r.status_code, r.json()
        except Exception:
            return r.status_code, r.text
    except Exception as exc:
        return 0, str(exc)

def rand_phone() -> str:
    import random
    return "+234" + "".join(str(random.randint(0, 9)) for _ in range(10))


def main() -> int:
    t0 = time.time()
    print(f"\n{'='*60}")
    print(f"NEXRYDE Full A-Z App Probe → {BASE}")
    print(f"{'='*60}\n")

    # ── A. Health ──────────────────────────────────────────────
    print("A. Infrastructure / Health")
    code, body = get("/api/health", "")
    log("A1", "health endpoint", code == 200, {"http": code})

    code, body = get("/api/health/ready", "")
    log("A2", "readiness probe", code == 200, {"http": code})

    # ── B. Rider auth ──────────────────────────────────────────
    print("\nB. Rider Auth")
    r_phone = rand_phone()
    r_nin = f"PROBE{uuid.uuid4().hex[:14].upper()}"
    code, body = post("/api/auth/register", "", {
        "phone": r_phone, "name": "ProbeRider AZ", "role": "rider", "nin": r_nin
    })
    rider_ok = code == 200 and isinstance(body, dict) and body.get("token")
    log("B1", "rider register", rider_ok, {"http": code, "has_token": bool(rider_ok)})
    if not rider_ok:
        print("\n[ABORT] Rider registration failed — cannot continue.\n")
        return 1
    rider_id: str = body["user"]["id"]
    rider_token: str = body["token"]

    code, body = get(f"/api/users/{rider_id}", rider_token)
    log("B2", "rider profile fetch", code == 200, {"http": code})

    # ── C. Driver auth + approval ──────────────────────────────
    print("\nC. Driver Auth + Approval")
    pair = e2e.provision_e2e_pair()
    driver_id: str = pair["driver"]["id"]
    driver_token: str = pair["driver"]["token"]
    log("C1", "driver provision + approval", bool(driver_id and driver_token),
        {"driver_id": driver_id[:8] + "…"})

    # ── D. Driver online / location / profile ─────────────────
    print("\nD. Driver Online / Location")
    e2e.prepare_driver_online(driver_id, driver_token)
    log("D1", "driver go-online", True, {"note": "prepare_driver_online completed"})

    code, body = put(f"/api/drivers/{driver_id}/location", driver_token, {
        "latitude": PICKUP["lat"] + 0.002, "longitude": PICKUP["lng"] + 0.002
    })
    log("D2", "driver location update", code in (200, 201, 204), {"http": code})

    code, body = get(f"/api/drivers/{driver_id}/profile", driver_token)
    log("D3", "driver profile fetch", code == 200, {"http": code})

    # ── E. Fare estimate ───────────────────────────────────────
    print("\nE. Fare Estimate")
    code, fare_body = post("/api/fare/estimate", rider_token, {
        "pickup_lat": PICKUP["lat"], "pickup_lng": PICKUP["lng"],
        "dropoff_lat": DROPOFF["lat"], "dropoff_lng": DROPOFF["lng"],
        "service_type": "economy", "city": "lagos",
        "rider_id": rider_id,
    }, timeout=30)
    fare_ok = code == 200 and isinstance(fare_body, dict)
    fare_id: Optional[str] = (fare_body or {}).get("estimate_id") or (fare_body or {}).get("id")
    fare_val: float = float((fare_body or {}).get("fare") or (fare_body or {}).get("total_fare") or 3500)
    log("E1", "fare estimate", fare_ok, {
        "http": code, "fare": fare_val, "estimate_id": str(fare_id or "none")[:20]
    })

    # ── F. Trip request ────────────────────────────────────────
    print("\nF. Trip Request")
    req_t0 = time.time()
    trip_id, eligible = e2e.request_trip(rider_id, rider_token, preferred_driver_id=driver_id)
    req_ms = int((time.time() - req_t0) * 1000)
    log("F1", "trip request", bool(trip_id), {
        "trip_id": trip_id[:8] + "…", "eligible": eligible, "ms": req_ms, "slow": req_ms > 12000
    })

    # ── G. Driver offer delivery ───────────────────────────────
    print("\nG. Driver Offer Delivery")
    g_t0 = time.time()
    offer = e2e.fetch_driver_offer(driver_id, driver_token, trip_id)
    g_ms = int((time.time() - g_t0) * 1000)
    log("G1", "driver receives offer", bool(offer), {"has_offer": bool(offer), "ms": g_ms})
    if not offer:
        e2e.cancel_trip(trip_id, rider_token, rider_id)
        print("\n[ABORT] Driver never received offer.\n")
        return 1

    # ── H. Driver accept ───────────────────────────────────────
    print("\nH. Driver Accept")
    proposed = float(offer.get("rider_offer_price") or offer.get("offered_fare") or offer.get("fare") or 3500)
    h_t0 = time.time()
    code, acc_body = e2e.accept_trip(trip_id, driver_id, driver_token, offer, proposed)
    h_ms = int((time.time() - h_t0) * 1000)
    detail = str((acc_body or {}).get("detail") or "" if isinstance(acc_body, dict) else acc_body or "")[:120]
    log("H1", "driver accept HTTP", code in (200, 201), {"http": code, "ms": h_ms, "detail": str(detail or "")})

    if code not in (200, 201):
        e2e.cancel_trip(trip_id, rider_token, rider_id)
        print("\n[ABORT] Driver accept failed.\n")
        return 1

    # ── I. Assignment sync ─────────────────────────────────────
    print("\nI. Assignment Sync")
    time.sleep(1)
    code, st = get(f"/api/trips/{trip_id}/status", rider_token)
    accepted_at = bool((st or {}).get("accepted_at")) if isinstance(st, dict) else False
    driver_id_in_status = bool(((st or {}).get("driver_info") or {}).get("driver_id")) if isinstance(st, dict) else False
    log("I1", "trip status has accepted_at + driver_id", code == 200 and accepted_at and driver_id_in_status,
        {"http": code, "accepted_at": accepted_at, "driver_id_present": driver_id_in_status, "status": (st or {}).get("status")})

    code, ra = get(f"/api/trips/active/{rider_id}", rider_token)
    rider_active = (ra or {}).get("active") if isinstance(ra, dict) else False
    log("I2", "rider active trip", code == 200 and bool(rider_active), {"http": code, "active": rider_active})

    code, da = get(f"/api/trips/active/{driver_id}", driver_token)
    driver_active = (da or {}).get("active") if isinstance(da, dict) else False
    log("I3", "driver active trip", code == 200 and bool(driver_active), {"http": code, "active": driver_active})

    same_trip = (
        ((ra or {}).get("trip") or {}).get("id") == trip_id and
        ((da or {}).get("trip") or {}).get("id") == trip_id
    )
    log("I4", "rider + driver on same trip", same_trip, {"same_trip": same_trip})

    # ── J. Driver arrives ──────────────────────────────────────
    print("\nJ. Driver Arrive")
    code, _ = put(f"/api/trips/{trip_id}/arrive", driver_token, {"driver_id": driver_id})
    log("J1", "driver arrive", code in (200, 201, 204), {"http": code})

    # ── K. Trip start (handles pickup-code requirement) ────────
    print("\nK. Trip Start")
    # The accept response contains the pickup_code when required
    pickup_code = str((acc_body or {}).get("pickup_code") or "") if isinstance(acc_body, dict) else ""
    pickup_code_required = bool((acc_body or {}).get("pickup_code_required")) if isinstance(acc_body, dict) else False
    if pickup_code and pickup_code_required:
        vc_code, vc_body = post(f"/api/trips/{trip_id}/verify-pickup-code", driver_token, {
            "pickup_code": pickup_code, "driver_id": driver_id
        })
        log("K0", "verify pickup code", vc_code in (200, 201, 204), {"http": vc_code, "code": pickup_code})
    code, start_body = put(f"/api/trips/{trip_id}/start", driver_token, {"driver_id": driver_id})
    log("K1", "trip start", code in (200, 201), {"http": code, "detail": str((start_body or {}).get("detail") or "") if isinstance(start_body, dict) else ""})

    # ── L. Location update + ETA ───────────────────────────────
    print("\nL. Location + ETA")
    code, _ = post(f"/api/trips/{trip_id}/location", driver_token, {
        "latitude": DROPOFF["lat"] - 0.01, "longitude": DROPOFF["lng"] - 0.01,
        "driver_id": driver_id,
    })
    log("L1", "driver location push", code in (200, 201, 204), {"http": code})

    code, eta_body = get(f"/api/trips/{trip_id}/eta", rider_token)
    eta_ok = code == 200 and isinstance(eta_body, dict)
    log("L2", "ETA endpoint", eta_ok, {"http": code, "eta_min": (eta_body or {}).get("eta_minutes")})

    # ── M. Trip complete ───────────────────────────────────────
    print("\nM. Trip Complete")
    code, _ = put(f"/api/trips/{trip_id}/complete", driver_token, {"driver_id": driver_id})
    log("M1", "trip complete", code in (200, 201), {"http": code})

    # ── N. Rating (rater_id = query param, body = ComfortRatingRequest) ──
    print("\nN. Rating")
    try:
        r2 = requests.put(
            f"{BASE}/api/trips/{trip_id}/rate?rater_id={rider_id}",
            headers=h(rider_token),
            json={"overall_rating": 5.0, "comment": "Probe test"},
            timeout=20,
        )
        code = r2.status_code
        detail_n = r2.text[:120]
    except Exception as exc:
        code, detail_n = 0, str(exc)[:80]
    log("N1", "rider rates driver", code in (200, 201, 204), {"http": code, "detail": detail_n})

    # ── O. Wallet balance ──────────────────────────────────────
    print("\nO. Wallet")
    code, wbody = get(f"/api/wallet/{rider_id}", rider_token)
    log("O1", "rider wallet balance", code == 200, {"http": code, "has_balance": "balance" in str(wbody)})

    code, wbody2 = get(f"/api/wallet/{driver_id}", driver_token)
    log("O2", "driver wallet balance", code == 200, {"http": code, "has_balance": "balance" in str(wbody2)})

    # ── P. Chat (/api/chat/message, /api/chat/messages/{trip_id}) ──
    print("\nP. Chat")
    code, _ = post("/api/chat/message", rider_token, {
        "trip_id": trip_id, "sender_id": rider_id, "sender_role": "rider", "message": "Probe chat test"
    })
    log("P1", "send chat message", code in (200, 201), {"http": code})

    code, msgs_body = get(f"/api/chat/messages/{trip_id}?user_id={driver_id}", driver_token)
    msgs = msgs_body if isinstance(msgs_body, list) else (msgs_body or {}).get("messages", []) if isinstance(msgs_body, dict) else []
    has_msgs = isinstance(msgs, list) and len(msgs) > 0
    log("P2", "driver reads chat", code == 200 and has_msgs, {"http": code, "msg_count": len(msgs) if isinstance(msgs, list) else 0})

    # ── Q. Cancellation (fresh trip) ───────────────────────────
    print("\nQ. Cancellation")
    trip_id2, _ = e2e.request_trip(rider_id, rider_token, preferred_driver_id=driver_id)
    offer2 = e2e.fetch_driver_offer(driver_id, driver_token, trip_id2)
    if offer2:
        proposed2 = float(offer2.get("rider_offer_price") or offer2.get("offered_fare") or offer2.get("fare") or 3500)
        e2e.accept_trip(trip_id2, driver_id, driver_token, offer2, proposed2)
        time.sleep(1)
    code, _ = put(f"/api/trips/{trip_id2}/cancel", rider_token, {
        "cancelled_by": rider_id, "cancellation_reason": "Probe test"
    })
    log("Q1", "rider cancels trip", code in (200, 201, 204), {"http": code})

    code, st2 = get(f"/api/trips/{trip_id2}/status", rider_token)
    cancelled_ok = isinstance(st2, dict) and str(st2.get("status", "")).lower() == "cancelled"
    log("Q2", "trip status is cancelled", cancelled_ok, {"http": code, "status": (st2 or {}).get("status")})

    # ── R. WebSocket endpoints reachable ───────────────────────
    # HTTP GET to a WS endpoint returns 400 (bad upgrade) or 426; both mean
    # the endpoint exists and is waiting for a real WS handshake.
    print("\nR. WebSocket URL reachability (HTTP upgrade check)")
    import urllib.request, urllib.error
    ws_checks = [
        (f"/api/ws/rider/trips/{rider_id}", rider_token),
        (f"/api/ws/driver/offers/{driver_id}", driver_token),
        (f"/api/ws/user/{rider_id}/inbox", rider_token),
        (f"/api/ws/user/{driver_id}/inbox", driver_token),
    ]
    for wp, tok in ws_checks:
        try:
            req = urllib.request.Request(
                BASE + wp + f"?token={tok}",
                headers={"Upgrade": "websocket", "Connection": "Upgrade",
                         "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
                         "Sec-WebSocket-Version": "13"},
            )
            urllib.request.urlopen(req, timeout=8)
            log("R1", f"ws {wp}", True, {"note": "unexpected 200"})
        except urllib.error.HTTPError as exc:
            # 400 = bad handshake (endpoint exists), 426 = upgrade required — both OK
            ok = exc.code in (400, 426, 101)
            log("R1", f"ws {wp}", ok, {"http": exc.code, "acceptable": "400/426"})
        except Exception as exc:
            log("R1", f"ws {wp}", False, {"err": str(exc)[:80]})

    # ── Summary ────────────────────────────────────────────────
    elapsed = int((time.time() - t0) * 1000)
    passes = sum(1 for r in results if r["ok"])
    fails  = [r for r in results if not r["ok"]]

    print(f"\n{'='*60}")
    print(f"RESULT: {passes}/{len(results)} PASS  |  {len(fails)} FAIL  |  {elapsed}ms total")
    if fails:
        print("\nFAILED steps:")
        for f in fails:
            print(f"  ❌  [{f['step']}] {f['label']}  →  {f['data']}")
    else:
        print("All steps passed ✅")
    print(f"{'='*60}\n")

    debug_session_log("probe:summary", "full_az_complete", {
        "passes": passes, "total": len(results), "fails": len(fails),
        "elapsed_ms": elapsed, "ok": len(fails) == 0,
    }, "H-Z", "full-az")

    return 0 if not fails else 1


if __name__ == "__main__":
    raise SystemExit(main())
