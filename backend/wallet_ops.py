"""Rider wallet: booking checks and atomic ride debit/credit (MongoDB)."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import HTTPException

from wallet_trip_helpers import is_wallet_payment_method


async def assert_rider_wallet_covers_fare(db: Any, rider_id: str, payment_method: str, fare: float) -> None:
    """Reject trip booking when payment is wallet and balance < fare."""
    if not is_wallet_payment_method(payment_method):
        return
    fare = round(float(fare), 2)
    if fare < 1:
        raise HTTPException(status_code=400, detail="Invalid fare for wallet payment")
    user = await db.users.find_one({"id": rider_id}, {"wallet_balance": 1})
    bal = float((user or {}).get("wallet_balance") or 0)
    if bal + 1e-6 < fare:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Insufficient wallet balance. Need ₦{fare:,.0f}, have ₦{bal:,.0f}. "
                "Choose cash or top up your wallet."
            ),
        )


async def apply_rider_wallet_ride_debit(db: Any, rider_id: str, trip_id: str, amount: float) -> None:
    """
    Idempotent debit: one ledger row per (rider, trip). Uses atomic balance update to avoid double spend.
    """
    amount = round(float(amount), 2)
    if amount < 1:
        raise HTTPException(status_code=400, detail="Trip fare is missing or too small for wallet payment")

    existing = await db.transactions.find_one(
        {
            "trip_id": trip_id,
            "user_id": rider_id,
            "$or": [
                {"type": "ride_payment"},
                {"type": "debit", "source": "ride_payment"},
            ],
        }
    )
    if existing:
        return

    res = await db.users.update_one(
        {"id": rider_id, "wallet_balance": {"$gte": amount}},
        {"$inc": {"wallet_balance": -amount}},
    )
    if res.modified_count == 0:
        existing2 = await db.transactions.find_one(
            {
                "trip_id": trip_id,
                "user_id": rider_id,
                "type": {"$in": ["ride_payment", "debit"]},
            }
        )
        if existing2:
            return
        user = await db.users.find_one({"id": rider_id})
        bal = float((user or {}).get("wallet_balance") or 0)
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient wallet balance. Need ₦{amount:,.0f}, have ₦{bal:,.0f}. Top up in Wallet.",
        )

    await db.transactions.insert_one(
        {
            "id": str(uuid.uuid4()),
            "user_id": rider_id,
            "trip_id": trip_id,
            "type": "debit",
            "source": "ride_payment",
            "amount": -amount,
            "status": "success",
            "timestamp": datetime.utcnow(),
            "payment_method": "wallet",
            "reference": f"trip_{trip_id}",
        }
    )


async def apply_driver_wallet_ride_credit(db: Any, driver_id: str, trip_id: str, amount: float) -> None:
    """Credit driver wallet for a wallet-paid ride (idempotent by reference)."""
    amount = round(float(amount), 2)
    if amount < 1 or not driver_id:
        return
    user = await db.users.find_one({"id": driver_id}, {"_id": 0, "earnings_frozen": 1}) or {}
    if bool(user.get("earnings_frozen")):
        await db.transactions.insert_one(
            {
                "id": str(uuid.uuid4()),
                "user_id": driver_id,
                "trip_id": trip_id,
                "type": "credit",
                "source": "ride_payment",
                "amount": amount,
                "status": "held_for_review",
                "timestamp": datetime.utcnow(),
                "payment_method": "wallet",
                "reference": f"trip_{trip_id}_driver_held",
                "hold_reason": "ghost_driver_lock",
            }
        )
        return

    ref = f"trip_{trip_id}_driver"
    existing = await db.transactions.find_one(
        {
            "user_id": driver_id,
            "$or": [
                {"reference": ref},
                {"trip_id": trip_id, "type": "ride_earning"},
            ],
        }
    )
    if existing:
        return

    await db.users.update_one({"id": driver_id}, {"$inc": {"wallet_balance": amount}})
    await db.transactions.insert_one(
        {
            "id": str(uuid.uuid4()),
            "user_id": driver_id,
            "trip_id": trip_id,
            "type": "credit",
            "source": "ride_payment",
            "amount": amount,
            "status": "success",
            "timestamp": datetime.utcnow(),
            "payment_method": "wallet",
            "reference": ref,
        }
    )
