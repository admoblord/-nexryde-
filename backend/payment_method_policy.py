"""Strict payment-method whitelist for Uber-grade money safety.

Cash + bank transfer are always allowed. Wallet only when the fare-wallet
flag is on. Unknown methods (e.g. "card") are rejected — they must never
auto-settle as paid without a processor.
"""
from __future__ import annotations

from typing import Any, Optional

from fastapi import HTTPException

from wallet_trip_helpers import is_wallet_payment_method

ALLOWED_CASH = frozenset({"cash", "cash_payment"})
ALLOWED_TRANSFER = frozenset({"transfer", "bank_transfer"})


def normalize_payment_method(raw: Optional[str]) -> str:
    pm = str(raw or "cash").strip().lower()
    if not pm:
        return "cash"
    if pm in ALLOWED_CASH or pm.startswith("cash"):
        return "cash"
    if pm in ALLOWED_TRANSFER:
        return "transfer"
    if is_wallet_payment_method(pm):
        return "wallet"
    return pm


async def validate_payment_method_for_booking(db: Any, raw: Optional[str]) -> str:
    """Return canonical method or raise 400."""
    pm = normalize_payment_method(raw)
    if pm == "cash" or pm == "transfer":
        return pm
    if pm == "wallet":
        from feature_flags import is_wallet_enabled

        if not await is_wallet_enabled(db):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Wallet payments are currently unavailable. "
                    "Pay your driver with cash or bank transfer."
                ),
            )
        return "wallet"
    raise HTTPException(
        status_code=400,
        detail="Unsupported payment method. Use cash or bank transfer.",
    )
