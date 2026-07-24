"""Pure helpers for wallet trip payment (importable without FastAPI app)."""

from __future__ import annotations

from typing import Any, Optional


def trip_fare_amount(trip: dict[str, Any]) -> float:
    """Best-effort fare from trip document."""
    for key in ("fare", "final_fare", "offered_fare"):
        v = trip.get(key)
        if v is None:
            continue
        try:
            return round(float(v), 2)
        except (TypeError, ValueError):
            continue
    return 0.0


def is_wallet_payment_method(payment_method: Optional[str]) -> bool:
    if not payment_method:
        return False
    return str(payment_method).strip().lower() in {
        "wallet",
        "nexryde_wallet",
        "in_app",
        "in_app_wallet",
        "balance",
        "app_wallet",
    }


def is_cash_payment_method(payment_method: Optional[str]) -> bool:
    """Default booking method is cash — treat empty/unknown as cash."""
    if not payment_method:
        return True
    pm = str(payment_method).strip().lower()
    return pm in {"cash", "cash_payment"} or pm.startswith("cash")


def rider_must_confirm_payment(payment_method: Optional[str]) -> bool:
    """True when trip complete must leave payment_status=pending.

    Cash/transfer: driver confirms receipt. Wallet: rider confirms.
    Unknown methods never auto-settle.
    """
    return True
