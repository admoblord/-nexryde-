"""Legacy wallet ledger helpers — NexRyde no longer holds customer funds.

Product booking is cash/transfer only (see payment_method_policy). These
functions are kept as no-ops / hard rejects so older saga and recovery call
sites do not credit or debit wallet_balance.
"""
from __future__ import annotations

from typing import Any, Optional

from fastapi import HTTPException

from wallet_trip_helpers import is_wallet_payment_method


async def assert_rider_wallet_covers_fare(
    db: Any,
    rider_id: str,
    payment_method: Optional[str],
    amount: float,
) -> None:
    del db, rider_id, amount
    if is_wallet_payment_method(payment_method):
        raise HTTPException(
            status_code=400,
            detail="Wallet payments are unavailable. Pay your driver with cash or bank transfer.",
        )


async def reserve_rider_wallet_fare(
    db: Any,
    rider_id: str,
    trip_id: str,
    payment_method: Optional[str],
    amount: float,
) -> None:
    """No-op: platform does not hold rider funds."""
    del db, rider_id, trip_id, amount
    if is_wallet_payment_method(payment_method):
        raise HTTPException(
            status_code=400,
            detail="Wallet payments are unavailable. Pay your driver with cash or bank transfer.",
        )


async def release_rider_wallet_hold(db: Any, rider_id: str, trip_id: str) -> None:
    """No-op: no wallet holds are created."""
    del db, rider_id, trip_id


async def apply_rider_wallet_ride_debit(
    db: Any, rider_id: str, trip_id: str, amount: float
) -> None:
    """Rejected: platform does not debit rider wallets for fares."""
    del db, rider_id, trip_id, amount
    raise HTTPException(
        status_code=400,
        detail="Wallet payments are unavailable. Settle with cash or bank transfer.",
    )


async def apply_driver_wallet_ride_credit(
    db: Any, driver_id: str, trip_id: str, amount: float
) -> None:
    """No-op: drivers are paid by riders directly (cash/transfer)."""
    del db, driver_id, trip_id, amount
