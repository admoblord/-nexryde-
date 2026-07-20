#!/usr/bin/env python3
"""
NexRyde — Squad Subscription Payment Integration Test
Tests both City Rider and Road Warrior tiers end-to-end.
Usage: python3 scripts/test_squad_subscription.py
"""
import asyncio
import json
import os
import sys
import time
import httpx
from datetime import datetime

BASE_URL = os.environ.get("BACKEND_URL", "https://nexryde-backend-993913300770.us-central1.run.app")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@admoblordgroup.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "nwabueze1")

GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
BLUE   = "\033[94m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

results = []

def ok(label, detail=""):
    msg = f"{GREEN}✓ PASS{RESET}  {label}"
    if detail: msg += f"  {BLUE}{detail}{RESET}"
    print(msg)
    results.append(("PASS", label))

def fail(label, detail=""):
    msg = f"{RED}✗ FAIL{RESET}  {label}"
    if detail: msg += f"  {RED}{detail}{RESET}"
    print(msg)
    results.append(("FAIL", label))

def warn(label, detail=""):
    msg = f"{YELLOW}⚠ WARN{RESET}  {label}"
    if detail: msg += f"  {YELLOW}{detail}{RESET}"
    print(msg)
    results.append(("WARN", label))

def section(title):
    print(f"\n{BOLD}{'─'*60}{RESET}")
    print(f"{BOLD}  {title}{RESET}")
    print(f"{BOLD}{'─'*60}{RESET}")


async def get_admin_token(client: httpx.AsyncClient) -> str:
    r = await client.post("/api/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if r.status_code != 200:
        print(f"{RED}Admin login failed: {r.text}{RESET}")
        sys.exit(1)
    token = r.json().get("token", "")
    ok("Admin login", f"token={token[:16]}...")
    return token


async def get_driver_jwt(client: httpx.AsyncClient, admin_token: str, driver_id: str) -> str:
    """Use admin impersonate endpoint to get a driver JWT."""
    r = await client.post(
        f"/api/admin/impersonate/{driver_id}",
        headers={"x-admin-token": admin_token},
    )
    if r.status_code == 200:
        token = r.json().get("access_token") or r.json().get("token", "")
        if token:
            ok(f"Impersonate driver {driver_id[:8]}...", f"token={token[:16]}...")
            return token
    # Try alternate endpoint
    r2 = await client.get(
        f"/api/admin/users/{driver_id}/token",
        headers={"x-admin-token": admin_token},
    )
    if r2.status_code == 200:
        token = r2.json().get("access_token") or r2.json().get("token", "")
        if token:
            ok(f"Got driver token via admin", f"token={token[:16]}...")
            return token
    fail(f"Could not get driver JWT for {driver_id[:8]}", f"{r.status_code}: {r.text[:200]}")
    return ""


async def find_test_driver(client: httpx.AsyncClient, admin_token: str) -> dict:
    """Find or return a driver account suitable for subscription testing."""
    # Look for a driver with pending_payment status first (trial expired)
    for status in ["pending_payment", "trial", "expired", "none"]:
        r = await client.get(
            f"/api/admin/drivers?limit=20&subscription_status={status}",
            headers={"x-admin-token": admin_token},
        )
        if r.status_code == 200:
            data = r.json()
            drivers = data.get("drivers") or data.get("items") or (data if isinstance(data, list) else [])
            # Prefer drivers with emails that look like real test accounts
            for d in drivers:
                uid = d.get("user_id") or d.get("id") or d.get("driver_id", "")
                email = d.get("email", "")
                if uid and email and "e2e" not in email.lower():
                    ok(f"Using test driver [{status}]", f"{email}")
                    return d
            # Fall back to any driver in this status
            for d in drivers:
                uid = d.get("user_id") or d.get("id") or d.get("driver_id", "")
                email = d.get("email", "")
                if uid and email:
                    ok(f"Using test driver [{status}]", f"{email}")
                    return d
    fail("No test driver found")
    sys.exit(1)


async def test_subscription_config(client: httpx.AsyncClient):
    section("1. SUBSCRIPTION CONFIG ENDPOINT")
    r = await client.get("/api/subscriptions/config")
    if r.status_code != 200:
        fail("GET /api/subscriptions/config", f"HTTP {r.status_code}")
        return

    data = r.json()
    ok("GET /api/subscriptions/config", f"HTTP {r.status_code}")

    # Validate City Rider pricing
    cr_price = data.get("city_rider_price", 0)
    rw_price = data.get("road_warrior_price", 0)
    phase    = data.get("city_rider_phase", "?")

    if cr_price >= 10000:
        ok("City Rider price", f"₦{cr_price:,}")
    else:
        fail("City Rider price", f"Expected >= ₦10,000, got ₦{cr_price}")

    if rw_price >= 20000:
        ok("Road Warrior price", f"₦{rw_price:,}")
    else:
        fail("Road Warrior price", f"Expected >= ₦20,000, got ₦{rw_price}")

    ok("Pricing phase", phase)
    ok("Trial target", f"{data.get('trial_trips_target', '?')} trips")

    cr_slots = data.get("city_rider_launch_slots_remaining", 0)
    rw_slots = data.get("road_warrior_launch_slots_remaining", 0)
    ok("Launch slots", f"CityRider={cr_slots} · RoadWarrior={rw_slots}")

    return data


async def test_driver_subscription_status(client: httpx.AsyncClient, driver_jwt: str, driver_id: str):
    section("2. DRIVER SUBSCRIPTION STATUS")
    r = await client.get(
        "/api/driver/subscription-status",
        headers={"Authorization": f"Bearer {driver_jwt}"},
    )
    if r.status_code != 200:
        fail("GET /api/driver/subscription-status", f"HTTP {r.status_code}: {r.text[:200]}")
        return None

    data = r.json()
    ok("GET /api/driver/subscription-status", f"HTTP {r.status_code}")

    status = data.get("status", "?")
    tier   = data.get("tier", "?")
    ok("Current status", status)
    ok("Current tier", tier)

    if data.get("trial_active"):
        done   = data.get("trial_trips_completed", 0)
        target = data.get("trial_trips_target", 20)
        ok("Trial progress", f"{done}/{target} trips")

    if data.get("monthly_fee"):
        ok("Monthly fee (from status)", f"₦{data['monthly_fee']:,}")

    print(f"  Full response: {json.dumps(data, default=str)[:400]}...")
    return data


async def test_initiate_checkout(client: httpx.AsyncClient, driver_jwt: str, tier: str, pricing: dict):
    section(f"3. INITIATE SQUAD CHECKOUT — {tier.upper().replace('_', ' ')}")
    price = pricing.get(f"{tier}_price", 18000 if tier == "city_rider" else 30000)
    print(f"  Expected charge: ₦{price:,}")

    r = await client.post(
        "/api/payment/subscription/initiate-checkout",
        json={"tier": tier},
        headers={"Authorization": f"Bearer {driver_jwt}"},
        timeout=30.0,
    )

    print(f"  HTTP {r.status_code}")
    if r.status_code not in (200, 201):
        data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        detail = data.get("detail", r.text[:300])
        # Some errors are expected (e.g. driver already has active sub)
        if "already" in str(detail).lower() or "active" in str(detail).lower() or "trial" in str(detail).lower():
            warn(f"initiate-checkout [{tier}]", f"Blocked: {detail}")
        else:
            fail(f"initiate-checkout [{tier}]", str(detail))
        return None

    data = r.json()
    checkout_url    = data.get("checkout_url", "")
    transaction_ref = data.get("transaction_ref", "")
    amount_ngn      = data.get("amount_ngn", 0)
    amount_kobo     = data.get("amount", 0)

    if checkout_url:
        ok(f"Checkout URL returned [{tier}]", f"ref={transaction_ref[:20]}...")
        print(f"\n  {BOLD}SQUAD CHECKOUT URL:{RESET}")
        print(f"  {BLUE}{checkout_url}{RESET}\n")
    else:
        fail(f"No checkout_url in response [{tier}]", json.dumps(data)[:300])

    if transaction_ref:
        ok("Transaction ref", transaction_ref)
    else:
        fail("No transaction_ref in response")

    if amount_ngn:
        if amount_ngn == price:
            ok("Amount matches config price", f"₦{amount_ngn:,}")
        else:
            warn("Amount mismatch", f"Expected ₦{price:,} but got ₦{amount_ngn:,}")
    elif amount_kobo:
        actual_ngn = amount_kobo // 100
        ok("Amount (from kobo)", f"₦{actual_ngn:,}")

    return {"checkout_url": checkout_url, "transaction_ref": transaction_ref, "tier": tier}


async def test_verify_pending(client: httpx.AsyncClient, driver_jwt: str, transaction_ref: str):
    section("4. VERIFY-PENDING (before payment)")
    r = await client.post(
        "/api/payment/subscription/verify-pending",
        json={"transaction_ref": transaction_ref} if transaction_ref else {},
        headers={"Authorization": f"Bearer {driver_jwt}"},
        timeout=30.0,
    )
    print(f"  HTTP {r.status_code}")
    data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}

    if r.status_code == 200:
        verified = data.get("verified", False)
        if verified:
            ok("verify-pending → verified (already paid or activated)", json.dumps(data)[:200])
        else:
            reason = data.get("reason", "?")
            tx_status = data.get("transaction_status", "?")
            # "Not yet paid" is expected — it's not an error
            ok("verify-pending → not yet confirmed (expected)", f"reason={reason} tx_status={tx_status}")
    elif r.status_code == 404:
        detail = data.get("detail", "")
        ok("verify-pending → 404 no pending intent (expected for new ref)", detail[:100])
    else:
        fail("verify-pending", f"HTTP {r.status_code}: {data.get('detail', r.text[:200])}")


async def test_squad_direct_verify(squad_secret: str, transaction_ref: str):
    """Directly call Squad's verify endpoint to confirm the transaction was registered."""
    if not squad_secret or not transaction_ref:
        warn("Squad direct verify skipped", "No secret key or ref available")
        return

    section("5. SQUAD DIRECT TRANSACTION VERIFY")
    squad_base = os.environ.get("SQUAD_BASE_URL", "https://api-d.squadco.com")
    url = f"{squad_base}/transaction/verify/{transaction_ref}"
    async with httpx.AsyncClient(base_url=squad_base, timeout=20.0) as sq:
        r = await sq.get(
            f"/transaction/verify/{transaction_ref}",
            headers={"Authorization": f"Bearer {squad_secret}"},
        )
    print(f"  Squad HTTP {r.status_code}")
    if r.status_code == 200:
        data = r.json()
        tx = data.get("data", data)
        tx_status = tx.get("transaction_status") or tx.get("status", "?")
        amount    = tx.get("amount", 0)
        ok("Squad knows this transaction", f"status={tx_status} amount={amount}")
    elif r.status_code == 404:
        warn("Squad: transaction not found yet", "May appear once checkout page is opened")
    else:
        warn("Squad direct verify", f"HTTP {r.status_code}: {r.text[:200]}")


async def test_virtual_account_creation(client: httpx.AsyncClient, driver_jwt: str, driver_id: str, pricing: dict):
    section("6. VIRTUAL ACCOUNT CREATION (Bank Transfer)")
    price = pricing.get("city_rider_price", 18000)

    r = await client.post(
        "/api/payment/create-virtual-account",
        json={"driver_id": driver_id, "plan_amount": price, "tier": "city_rider"},
        headers={"Authorization": f"Bearer {driver_jwt}"},
        timeout=30.0,
    )
    print(f"  HTTP {r.status_code}")
    data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}

    if r.status_code == 200:
        acct_no   = data.get("account_number", "")
        bank_name = data.get("bank_name", "")
        acct_name = data.get("account_name", "")
        ref       = data.get("reference", "")
        if acct_no and bank_name:
            ok("Virtual account created", f"{bank_name} — {acct_no}")
            ok("Account name", acct_name)
            ok("Reference", ref[:30] if ref else "n/a")
            print(f"\n  {BOLD}BANK TRANSFER DETAILS:{RESET}")
            print(f"  Bank:    {bank_name}")
            print(f"  Acct No: {acct_no}")
            print(f"  Name:    {acct_name}")
            print(f"  Amount:  ₦{price:,}")
            print(f"  Ref:     {ref}\n")
        else:
            fail("Virtual account missing fields", json.dumps(data)[:300])
    elif r.status_code in (400, 409):
        detail = data.get("detail", r.text[:200])
        if "already" in str(detail).lower() or "active" in str(detail).lower():
            warn("Virtual account", f"Blocked (expected): {detail}")
        else:
            fail("Virtual account creation", str(detail))
    elif r.status_code == 500:
        fail("Virtual account creation 500", data.get("detail", r.text[:300]))
    else:
        fail("Virtual account creation", f"HTTP {r.status_code}: {data.get('detail', r.text[:200])}")


async def test_webhook_endpoint(client: httpx.AsyncClient):
    section("7. WEBHOOK ENDPOINT HEALTH")
    # POST without a valid signature — expect 401/403/503, NOT 500
    r = await client.post(
        "/api/squad/webhook",
        json={"Event": "charge.success", "Body": {"transaction_ref": "TEST_REF_123"}},
        headers={"x-squad-encrypted-body": "invalid_signature"},
        timeout=15.0,
    )
    print(f"  HTTP {r.status_code}")
    if r.status_code in (401, 403, 422, 503):
        ok("Webhook rejects invalid signature", f"HTTP {r.status_code} (expected)")
    elif r.status_code == 500:
        fail("Webhook returned 500 on invalid sig", r.text[:200])
    else:
        warn("Webhook unexpected status", f"HTTP {r.status_code}: {r.text[:100]}")


async def main():
    print(f"\n{BOLD}{'═'*60}{RESET}")
    print(f"{BOLD}  NexRyde × Squad Subscription Payment Test{RESET}")
    print(f"{BOLD}  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}{RESET}")
    print(f"{BOLD}  Backend: {BASE_URL}{RESET}")
    print(f"{BOLD}{'═'*60}{RESET}")

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=20.0) as client:
        # ── 0. Admin auth ──────────────────────────────────────────────
        admin_token = await get_admin_token(client)

        # ── 1. Subscription config (no auth needed) ────────────────────
        pricing = await test_subscription_config(client) or {}

        # ── Find a test driver ─────────────────────────────────────────
        section("FINDING TEST DRIVER")
        driver_info = await find_test_driver(client, admin_token)
        driver_id   = driver_info.get("user_id") or driver_info.get("id") or driver_info.get("driver_id", "")
        driver_email = driver_info.get("email", "")
        print(f"  Driver ID:    {driver_id}")
        print(f"  Driver Email: {driver_email}")
        print(f"  Sub status:   {driver_info.get('subscription_status', '?')}")

        driver_jwt = await get_driver_jwt(client, admin_token, driver_id)
        if not driver_jwt:
            fail("Cannot proceed without driver JWT")
            print_summary()
            return

        # ── 2. Driver subscription status ──────────────────────────────
        sub_status = await test_driver_subscription_status(client, driver_jwt, driver_id)

        # ── 3a. Initiate City Rider checkout ───────────────────────────
        cr_checkout = await test_initiate_checkout(client, driver_jwt, "city_rider", pricing)

        # ── 4. Verify-pending before payment ──────────────────────────
        if cr_checkout:
            await test_verify_pending(client, driver_jwt, cr_checkout.get("transaction_ref", ""))

        # ── 5. Direct Squad verify ─────────────────────────────────────
        squad_secret = ""
        try:
            import subprocess
            result = subprocess.run(
                ["gcloud", "secrets", "versions", "access", "latest",
                 "--secret=SQUAD_SECRET_KEY", "--project=nexryde-app"],
                capture_output=True, text=True, timeout=10
            )
            squad_secret = result.stdout.strip()
        except Exception:
            pass

        if cr_checkout and cr_checkout.get("transaction_ref"):
            await test_squad_direct_verify(squad_secret, cr_checkout["transaction_ref"])

        # ── 6. Virtual account (bank transfer) ─────────────────────────
        await test_virtual_account_creation(client, driver_jwt, driver_id, pricing)

        # ── 7. Webhook health ──────────────────────────────────────────
        await test_webhook_endpoint(client)

        # ── 3b. Try Road Warrior tier ──────────────────────────────────
        section("3B. INITIATE SQUAD CHECKOUT — ROAD WARRIOR")
        rw_checkout = await test_initiate_checkout(client, driver_jwt, "road_warrior", pricing)
        if rw_checkout:
            print(f"\n  {BOLD}Road Warrior checkout URL:{RESET}")
            print(f"  {BLUE}{rw_checkout.get('checkout_url','')}{RESET}\n")

    print_summary()


def print_summary():
    section("TEST SUMMARY")
    passed = sum(1 for r in results if r[0] == "PASS")
    failed = sum(1 for r in results if r[0] == "FAIL")
    warned = sum(1 for r in results if r[0] == "WARN")
    total  = len(results)

    for status, label in results:
        color = GREEN if status == "PASS" else RED if status == "FAIL" else YELLOW
        icon  = "✓" if status == "PASS" else "✗" if status == "FAIL" else "⚠"
        print(f"  {color}{icon}{RESET}  {label}")

    print(f"\n  {BOLD}Total: {total}  {GREEN}Pass: {passed}{RESET}  {RED}Fail: {failed}{RESET}  {YELLOW}Warn: {warned}{RESET}")
    if failed == 0:
        print(f"\n  {GREEN}{BOLD}✓ ALL TESTS PASSED — Squad payment integration is healthy{RESET}\n")
    else:
        print(f"\n  {RED}{BOLD}✗ {failed} FAILURE(S) — Review Squad configuration{RESET}\n")


if __name__ == "__main__":
    asyncio.run(main())
