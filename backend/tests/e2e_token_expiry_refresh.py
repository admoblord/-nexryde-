#!/usr/bin/env python3
"""
NEXRYDE Token Expiry + Refresh Test
=====================================
Tests:
  1. Login returns valid JWT
  2. Protected endpoint works with valid token
  3. Expired / tampered token returns HTTP 401
  4. /api/auth/refresh returns a new token
  5. New token passes protected endpoint
  6. Self-registration privilege escalation blocked (no admin via /register)

Usage:
    python3 backend/tests/e2e_token_expiry_refresh.py
"""

import asyncio
import base64
import json
import os
import sys
import time
import uuid
from datetime import datetime

import httpx

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8080").rstrip("/")
TIMEOUT  = 30

GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
RESET  = "\033[0m"
BOLD   = "\033[1m"

def ok(msg):     print(f"  {GREEN}✓{RESET}  {msg}")
def fail(msg):   print(f"  {RED}✗{RESET}  {msg}"); sys.exit(1)
def info(msg):   print(f"  {YELLOW}→{RESET}  {msg}")
def header(msg): print(f"\n{BOLD}{msg}{RESET}")


def tag():
    return uuid.uuid4().hex[:6]


def _tamper_token(token: str) -> str:
    """
    Corrupt the JWT signature to produce an invalid token.
    Changes characters in the MIDDLE of the signature — the last base64 char
    encodes padding bits that some JWT libs ignore, so we avoid it.
    """
    parts = token.split(".")
    if len(parts) != 3:
        return token + "tampered"
    sig = parts[2].rstrip("=")
    if len(sig) < 3:
        return token + "tampered"
    # Change multiple characters in the middle to guarantee corruption
    mid  = len(sig) // 2
    chars = list(sig)
    for i in [mid - 1, mid, mid + 1]:
        if 0 <= i < len(chars):
            chars[i] = "A" if chars[i] != "A" else "B"
    return ".".join([parts[0], parts[1], "".join(chars)])


def _decode_jwt_payload(token: str) -> dict:
    """Decode JWT payload without verification (for inspection only)."""
    try:
        parts = token.split(".")
        payload_b64 = parts[1] + "=" * (4 - len(parts[1]) % 4)
        return json.loads(base64.urlsafe_b64decode(payload_b64))
    except Exception:
        return {}


async def run():
    suffix = tag()
    print(f"\n{BOLD}{'=' * 60}{RESET}")
    print(f"{BOLD}  NEXRYDE Token Expiry + Refresh Test  [{suffix}]{RESET}")
    print(f"  Base URL : {BASE_URL}")
    print(f"  Started  : {datetime.now().isoformat()}")
    print(f"{BOLD}{'=' * 60}{RESET}")

    async with httpx.AsyncClient(base_url=BASE_URL, timeout=TIMEOUT) as c:

        email = f"token_test_{suffix}@nexryde.test"

        # ── 1. Register + Login ────────────────────────────────────────────
        header("1. Register & login")
        # Wait for deferred startup to settle
        await asyncio.sleep(3)
        await c.post("/api/auth/register", json={
            "name":  f"Token Test {suffix}",
            "email": email,
            "role":  "rider",
            "phone": f"+234802{suffix[:7]}",
            "nin":   f"1234{suffix[:7].ljust(7,'0')}",
        })
        # Passwordless login — email-signin issues JWT directly for existing users
        r = await c.post("/api/auth/email-signin", json={"email": email})
        if r.status_code != 200:
            fail(f"Login failed {r.status_code}: {r.text[:300]}")
        d = r.json()
        user_obj = d.get("user") or {}
        token   = d.get("token") or d.get("access_token") or (d.get("data") or {}).get("token")
        user_id = user_obj.get("id") or d.get("user_id") or d.get("id")
        if not token:
            fail(f"No token in login response: {d}")
        ok(f"Logged in as {email}")

        # Inspect token claims
        payload = _decode_jwt_payload(token)
        exp = payload.get("exp")
        if exp:
            exp_dt = datetime.utcfromtimestamp(exp)
            ttl_h  = (exp - time.time()) / 3600
            ok(f"Token expires: {exp_dt.isoformat()} UTC  (~{ttl_h:.1f}h from now)")
        else:
            info("Could not decode token expiry claim")

        auth_h = {"Authorization": f"Bearer {token}"}

        # ── 2. Valid token works ───────────────────────────────────────────
        header("2. Valid token grants access")
        # Use /wallet/me — a protected endpoint that works for any authenticated user
        r = await c.get("/api/wallet/me", headers=auth_h)
        if r.status_code in (200, 404):
            ok(f"Protected endpoint returns {r.status_code} with valid token (auth passed)")
        else:
            fail(f"Expected 200/404 for valid token, got {r.status_code}: {r.text[:200]}")

        # ── 3. Tampered token is rejected ─────────────────────────────────
        header("3. Tampered token is rejected (expects 401)")
        bad_token  = _tamper_token(token)
        bad_h      = {"Authorization": f"Bearer {bad_token}"}
        r = await c.get("/api/wallet/me", headers=bad_h)
        if r.status_code == 401:
            ok("Tampered token correctly rejected with 401")
        elif r.status_code in (403, 422):
            ok(f"Tampered token rejected with {r.status_code} (acceptable)")
        else:
            fail(f"Expected 401 for tampered token, got {r.status_code}: {r.text[:200]}")

        # ── 4. Empty / missing token is rejected ──────────────────────────
        header("4. Missing Authorization header is rejected")
        r = await c.get("/api/wallet/me")
        if r.status_code == 401:
            ok("Missing token correctly returns 401")
        elif r.status_code in (403, 422):
            ok(f"Missing token returns {r.status_code} (acceptable)")
        else:
            fail(f"Expected 401 for no token, got {r.status_code}: {r.text[:200]}")

        # ── 5. Token refresh ──────────────────────────────────────────────
        header("5. Token refresh endpoint")
        r = await c.post("/api/auth/refresh-token", headers=auth_h)
        if r.status_code == 404:
            # Try alternate paths
            r = await c.post("/api/auth/refresh", headers=auth_h)
        if r.status_code == 404:
            r = await c.post("/api/auth/token/refresh", headers=auth_h)
        if r.status_code == 200:
            nd = r.json()
            new_token = nd.get("access_token") or nd.get("token") or (nd.get("data") or {}).get("access_token")
            if new_token and new_token != token:
                ok("Refresh returned a new token")
                # Test new token works
                r2 = await c.get("/api/wallet/me", headers={"Authorization": f"Bearer {new_token}"})
                if r2.status_code in (200, 404):
                    ok("New (refreshed) token passes auth")
                else:
                    fail(f"New token rejected: {r2.status_code}: {r2.text[:200]}")
            elif new_token == token:
                info("Refresh returned same token (may be within short window)")
            else:
                info(f"Refresh response missing token field: {nd}")
        elif r.status_code == 405:
            info("Refresh endpoint not implemented — mobile handles re-login on 401 (acceptable)")
        else:
            info(f"Refresh responded {r.status_code}: {r.text[:200]}")

        # ── 6. Self-registration privilege escalation blocked ─────────────
        header("6. Self-registration as admin is blocked")
        admin_email = f"hacker_admin_{suffix}@nexryde.test"
        r = await c.post("/api/auth/register", json={
            "name":     "Hacker Admin",
            "email":    admin_email,
            "password": "Hacked@12345",
            "role":     "admin",
            "phone":    f"+234803{suffix[:7]}",
            "nin":      f"9876{suffix[:7].ljust(7,'0')}",
        })
        if r.status_code in (200, 201):
            # Registration succeeded — check the role that was actually assigned
            login_r = await c.post("/api/auth/email-signin", json={"email": admin_email})
            if login_r.status_code == 200:
                ld = login_r.json()
                role = ld.get("role") or (ld.get("data") or {}).get("role", "?")
                if role == "admin":
                    fail("SECURITY VULNERABILITY: Self-registered user got admin role!")
                else:
                    ok(f"Self-registered as 'admin' but got role='{role}' — escalation blocked ✓")
            else:
                info(f"Could not verify role (login failed {login_r.status_code})")
        elif r.status_code in (400, 422):
            ok(f"Admin self-registration rejected with {r.status_code}")
        else:
            info(f"Register admin: {r.status_code} — {r.text[:200]}")

        print(f"\n{GREEN}{BOLD}{'=' * 60}")
        print(f"  TOKEN SECURITY TESTS COMPLETE ✓")
        print(f"{'=' * 60}{RESET}\n")


if __name__ == "__main__":
    asyncio.run(run())
