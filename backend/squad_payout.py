"""
Squad Payout (Fund Transfer) client for NEXRYDE driver withdrawals.

Moves money from the NEXRYDE Squad wallet/ledger out to a driver's Nigerian bank
account. Inbound collections (top-ups, subscriptions) live in routers/payments.py;
this module owns the OUTBOUND disbursement side only.

Squad Transfer API (https://docs.squadco.com/Transfer-API/transfer-apis/):
  - POST /payout/account/lookup   {bank_code, account_number} -> data.account_name
  - POST /payout/transfer         {transaction_reference (MERCHANTID_xxx), amount(kobo str),
                                    bank_code, account_number, account_name, currency_id, remark}
  - POST /payout/requery          {transaction_reference} -> transaction_status

Required env:
  SQUAD_SECRET_KEY     Bearer secret (shared with collections)
  SQUAD_BASE_URL       e.g. https://api-d.squadco.com (live) / https://sandbox-api-d.squadco.com
  SQUAD_MERCHANT_ID    Squad merchant id — MUST prefix every transfer reference
"""
from __future__ import annotations

import os
from typing import Any, Optional

import httpx

SQUAD_SECRET_KEY = os.environ.get("SQUAD_SECRET_KEY", "")
SQUAD_BASE_URL = os.environ.get("SQUAD_BASE_URL", "https://api-d.squadco.com").rstrip("/")
SQUAD_MERCHANT_ID = (os.environ.get("SQUAD_MERCHANT_ID") or "").strip()

# Squad transfer success statuses (string form). 424 = timeout/failed -> requery.
_SUCCESS_STATUSES = {"success", "successful", "completed", "complete", "approved", "paid"}
_FAILED_STATUSES = {"failed", "reversed", "declined"}


def squad_payout_configured() -> bool:
    """True only when we can actually call Squad's transfer API."""
    return bool(SQUAD_SECRET_KEY and SQUAD_MERCHANT_ID)


def squad_payout_config_error() -> Optional[str]:
    if not SQUAD_SECRET_KEY:
        return "SQUAD_SECRET_KEY not configured"
    if not SQUAD_MERCHANT_ID:
        return "SQUAD_MERCHANT_ID not configured"
    return None


def build_transfer_reference(local_reference: str) -> str:
    """Squad requires merchant id appended to the transfer reference."""
    safe = "".join(ch for ch in str(local_reference) if ch.isalnum() or ch in ("_", "-"))
    return f"{SQUAD_MERCHANT_ID}_{safe}"


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {SQUAD_SECRET_KEY}",
        "Content-Type": "application/json",
    }


def _normalize_status(value: Any) -> str:
    s = str(value or "").strip().lower()
    return "" if s.isdigit() else s


async def squad_account_lookup(bank_code: str, account_number: str) -> dict:
    """Resolve the account name for a bank_code + NUBAN. Must run before transfer."""
    cfg_err = squad_payout_config_error()
    if cfg_err:
        return {"success": False, "reason": cfg_err}
    if not bank_code or not account_number:
        return {"success": False, "reason": "Missing bank_code or account_number"}

    url = f"{SQUAD_BASE_URL}/payout/account/lookup"
    body = {"bank_code": str(bank_code), "account_number": str(account_number)}
    http_status = None
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.post(url, headers=_headers(), json=body)
            http_status = resp.status_code
            try:
                payload = resp.json()
            except Exception:
                payload = {}
    except Exception as exc:
        return {"success": False, "reason": f"Account lookup request failed: {exc}"}

    data = payload.get("data") if isinstance(payload, dict) else {}
    data = data if isinstance(data, dict) else {}
    account_name = data.get("account_name")
    ok = bool(payload.get("success")) and bool(account_name)
    return {
        "success": ok,
        "account_name": account_name,
        "account_number": data.get("account_number") or account_number,
        "http_status": http_status,
        "reason": None if ok else (payload.get("message") or "Account lookup failed"),
        "raw": payload,
    }


async def squad_fund_transfer(
    *,
    transfer_reference: str,
    amount_naira: float,
    bank_code: str,
    account_number: str,
    account_name: str,
    remark: str,
) -> dict:
    """
    Disburse `amount_naira` to the resolved bank account.

    Returns a normalized result:
      {ok, status: 'success'|'pending'|'failed', should_requery, message, raw}
    """
    cfg_err = squad_payout_config_error()
    if cfg_err:
        return {"ok": False, "status": "failed", "should_requery": False, "message": cfg_err, "raw": {}}

    amount_kobo = int(round(float(amount_naira) * 100))
    if amount_kobo <= 0:
        return {"ok": False, "status": "failed", "should_requery": False, "message": "Invalid amount", "raw": {}}

    url = f"{SQUAD_BASE_URL}/payout/transfer"
    body = {
        "transaction_reference": transfer_reference,
        "amount": str(amount_kobo),
        "bank_code": str(bank_code),
        "account_number": str(account_number),
        "account_name": str(account_name),
        "currency_id": "NGN",
        "remark": (remark or "NEXRYDE payout")[:100],
    }
    try:
        async with httpx.AsyncClient(timeout=40.0) as client:
            resp = await client.post(url, headers=_headers(), json=body)
            http_status = resp.status_code
            try:
                payload = resp.json()
            except Exception:
                payload = {}
    except Exception as exc:
        # Network blip — unknown outcome, must requery rather than refund blindly.
        return {
            "ok": False,
            "status": "pending",
            "should_requery": True,
            "message": f"Transfer request failed: {exc}",
            "raw": {},
        }

    data = payload.get("data") if isinstance(payload, dict) else {}
    data = data if isinstance(data, dict) else {}
    nip_ref = data.get("nip_transaction_reference")
    desc = _normalize_status(data.get("response_description"))

    # 200 + success + nip session id => approved. 424 => timeout/failed, must requery.
    if http_status == 200 and bool(payload.get("success")):
        approved = bool(nip_ref) or "approved" in desc or "completed" in desc or "success" in desc
        return {
            "ok": approved,
            "status": "success" if approved else "pending",
            "should_requery": not approved,
            "provider_reference": nip_ref,
            "message": data.get("response_description") or payload.get("message") or "Transfer submitted",
            "raw": payload,
        }
    if http_status == 424:
        return {
            "ok": False,
            "status": "pending",
            "should_requery": True,
            "message": payload.get("message") or "Transfer timed out — pending confirmation",
            "raw": payload,
        }
    return {
        "ok": False,
        "status": "failed",
        "should_requery": False,
        "message": payload.get("message") or f"Transfer rejected (HTTP {http_status})",
        "raw": payload,
    }


async def squad_requery_transfer(transfer_reference: str) -> dict:
    """Re-query a transfer's final status (success/failed/reversed/pending)."""
    cfg_err = squad_payout_config_error()
    if cfg_err:
        return {"status": "unknown", "reason": cfg_err}

    url = f"{SQUAD_BASE_URL}/payout/requery"
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.post(url, headers=_headers(), json={"transaction_reference": transfer_reference})
            try:
                payload = resp.json()
            except Exception:
                payload = {}
    except Exception as exc:
        return {"status": "unknown", "reason": f"Requery failed: {exc}"}

    data = payload.get("data") if isinstance(payload, dict) else {}
    data = data if isinstance(data, dict) else {}
    raw_status = _normalize_status(
        data.get("transaction_status") or data.get("status") or payload.get("transaction_status")
    )
    if raw_status in _SUCCESS_STATUSES:
        status = "success"
    elif raw_status in _FAILED_STATUSES:
        status = "failed"
    else:
        status = "pending"
    return {"status": status, "provider_status": raw_status, "raw": payload}
