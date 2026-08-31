#!/usr/bin/env python3
"""
Optional smoke checks for Squad rider wallet endpoints (against a running API).

Requires:
  NEXRYDE_API_BASE   e.g. https://nexryde-modular.preview.emergentagent.com  (no trailing slash)
  NEXRYDE_BEARER     JWT for a rider user (Authorization: Bearer ...)

Uses minimum top-up amount (₦100). Does not complete card payment — only verifies
checkout/VA initiation when Squad keys are configured on the server.

Usage:
  export NEXRYDE_API_BASE=https://...
  export NEXRYDE_BEARER=eyJ...
  python3 scripts/squad_wallet_smoke.py
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


def main() -> int:
    base = os.environ.get("NEXRYDE_API_BASE", "").rstrip("/")
    token = os.environ.get("NEXRYDE_BEARER", "").strip()
    if not base or not token:
        print(
            "Skip: set NEXRYDE_API_BASE and NEXRYDE_BEARER to run live Squad smoke.",
            file=sys.stderr,
        )
        return 0

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    def post(path: str, body: dict) -> tuple[int, dict]:
        url = f"{base}{path}"
        req = urllib.request.Request(
            url,
            data=json.dumps(body).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=45) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
                return resp.status, json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", errors="replace")
            try:
                return e.code, json.loads(raw) if raw else {"detail": raw}
            except json.JSONDecodeError:
                return e.code, {"detail": raw or str(e)}

    print("POST /api/payment/wallet/initiate-checkout …")
    code, data = post("/api/payment/wallet/initiate-checkout", {"amount": 100})
    print(f"  status={code} keys={list(data.keys())}")
    if code == 200 and data.get("checkout_url"):
        print("  checkout_url: OK")
    elif code == 200:
        print("  warning: 200 but no checkout_url in body")
    else:
        print(f"  detail: {data.get('detail', data)}")

    print("POST /api/payment/wallet/create-virtual-account (expect 410 — VA disabled) …")
    code2, data2 = post("/api/payment/wallet/create-virtual-account", {"amount": 100})
    print(f"  status={code2} detail={data2.get('detail', data2)}")

    print(
        "\nWebhook: configure Squad to POST to your public "
        f"{base}/api/squad/webhook (header x-squad-encrypted-body = HMAC-SHA512 hex of raw body) "
        "and complete a test payment to verify balance updates."
    )
    return 0 if code in (200, 502) and code2 == 410 else 1


if __name__ == "__main__":
    raise SystemExit(main())
