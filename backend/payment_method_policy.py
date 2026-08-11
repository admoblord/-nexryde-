"""Strict payment-method whitelist for Uber-grade money safety.

Cash + bank transfer only. NexRyde does not hold customer funds — riders pay
drivers directly. Unknown methods (e.g. "card", "wallet") are rejected.
"""
from __future__ import annotations

from typing import Any, Optional

from fastapi import HTTPException

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
    return pm


async def validate_payment_method_for_booking(db: Any, raw: Optional[str]) -> str:
    """Return canonical method or raise 400. `db` kept for call-site compatibility."""
    del db  # unused — wallet flag no longer gates payment methods
    pm = normalize_payment_method(raw)
    if pm == "cash" or pm == "transfer":
        return pm
    if pm in {"wallet", "nexryde_wallet", "in_app", "in_app_wallet", "balance", "app_wallet"}:
        raise HTTPException(
            status_code=400,
            detail=(
                "Wallet payments are unavailable. "
                "Pay your driver with cash or bank transfer."
            ),
        )
    raise HTTPException(
        status_code=400,
        detail="Unsupported payment method. Use cash or bank transfer.",
    )
