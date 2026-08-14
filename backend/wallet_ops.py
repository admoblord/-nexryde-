"""Rider wallet: atomic fare reservation, ride debit/credit, and ledger operations (MongoDB)."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

# Retain terminal (released/finalized) holds for audit, then let the sparse
# `purge_at` TTL reap them. Active holds never get purge_at, so never expire.
_HOLD_RETENTION = timedelta(days=7)

from fastapi import HTTPException

from wallet_trip_helpers import is_wallet_payment_method

WALLET_DISABLED_DETAIL = (
    "Wallet payments are currently unavailable. Pay your driver directly with cash "
    "or a bank transfer to their account."
)


async def _reject_if_wallet_disabled(db: Any) -> None:
    """Launch mode: fare wallet is off — no holds, no wallet-paid trips."""
    from feature_flags import is_wallet_enabled

    if not await is_wallet_enabled(db):
        raise HTTPException(status_code=400, detail=WALLET_DISABLED_DETAIL)


# ─── Fare hold / reserve ─────────────────────────────────────────────────────

async def reserve_rider_wallet_fare(
    db: Any, rider_id: str, trip_id: str, payment_method: str, fare: float
) -> None:
    """
    Reserve fare from wallet at booking time (intent → debit → held).

    Order prevents orphan debits: hold row exists before balance moves.
    Idempotent: if a hold for this trip_id already exists, silently returns.
    """
    if not is_wallet_payment_method(payment_method):
        return
    await _reject_if_wallet_disabled(db)

    fare = round(float(fare), 2)
    if fare < 1:
        raise HTTPException(status_code=400, detail="Invalid fare for wallet payment")

    existing_hold = await db.wallet_holds.find_one({"trip_id": trip_id, "rider_id": rider_id})
    if existing_hold:
        if existing_hold.get("status") in {"held", "captured", "released"}:
            return
        # Resume a pending intent from a prior crash window.
    else:
        try:
            await db.wallet_holds.insert_one(
                {
                    "id": str(uuid.uuid4()),
                    "rider_id": rider_id,
                    "trip_id": trip_id,
                    "amount": fare,
                    "status": "pending",
                    "held_at": datetime.now(timezone.utc),
                }
            )
        except Exception as exc:
            # Unique trip_id race — treat as idempotent if hold now exists.
            raced = await db.wallet_holds.find_one({"trip_id": trip_id, "rider_id": rider_id})
            if raced:
                return
            raise HTTPException(status_code=500, detail="Could not reserve wallet hold") from exc

    res = await db.users.update_one(
        {"id": rider_id, "wallet_balance": {"$gte": fare}},
        {"$inc": {"wallet_balance": -fare}},
    )
    if res.modified_count == 0:
        await db.wallet_holds.delete_one(
            {"trip_id": trip_id, "rider_id": rider_id, "status": "pending"}
        )
        user = await db.users.find_one({"id": rider_id}, {"wallet_balance": 1})
        bal = float((user or {}).get("wallet_balance") or 0)
        raise HTTPException(
            status_code=400,
            detail=(
                f"Insufficient wallet balance. Need ₦{fare:,.0f}, have ₦{bal:,.0f}. "
                "Choose cash or top up your wallet."
            ),
        )

    await db.wallet_holds.update_one(
        {"trip_id": trip_id, "rider_id": rider_id, "status": "pending"},
        {
            "$set": {
                "status": "held",
                "debited": True,
                "held_at": datetime.now(timezone.utc),
            }
        },
    )


async def release_rider_wallet_hold(db: Any, rider_id: str, trip_id: str) -> None:
    """
    Restore a held fare back to the wallet when a trip is cancelled.
    Idempotent: if hold was already released or does not exist, silently returns.
    """
    from pymongo import ReturnDocument

    _now = datetime.now(timezone.utc)
    hold = await db.wallet_holds.find_one_and_update(
        {
            "trip_id": trip_id,
            "rider_id": rider_id,
            "status": {"$in": ["held", "pending"]},
        },
        {
            "$set": {
                "status": "released",
                "released_at": _now,
                "purge_at": _now + _HOLD_RETENTION,
            }
        },
        return_document=ReturnDocument.BEFORE,
    )
    if not hold:
        return  # already released or no hold (cash trip)

    # Pending without debit must not credit (money never left the wallet).
    if hold.get("status") == "pending" and not hold.get("debited"):
        return

    amount = float(hold.get("amount", 0))
    if amount > 0:
        await db.users.update_one(
            {"id": rider_id},
            {"$inc": {"wallet_balance": amount}},
        )
        await db.transactions.insert_one(
            {
                "id": str(uuid.uuid4()),
                "user_id": rider_id,
                "trip_id": trip_id,
                "type": "credit",
                "source": "ride_cancellation_refund",
                "amount": amount,
                "status": "success",
                "timestamp": datetime.now(timezone.utc),
                "payment_method": "wallet",
                "reference": f"trip_{trip_id}_refund",
            }
        )


# ─── Legacy balance check (used before hold system, kept for cash trips) ─────

async def assert_rider_wallet_covers_fare(
    db: Any, rider_id: str, payment_method: str, fare: float
) -> None:
    """Read-only balance check for non-wallet paths or pre-validation UX only.
    For wallet trips, prefer reserve_rider_wallet_fare which is atomic."""
    if not is_wallet_payment_method(payment_method):
        return
    await _reject_if_wallet_disabled(db)
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


# ─── Ride debit (finalize hold) ───────────────────────────────────────────────

async def apply_rider_wallet_ride_debit(db: Any, rider_id: str, trip_id: str, amount: float) -> None:
    """
    Finalize the wallet payment at trip completion.

    If a hold exists for this trip (the normal path when reserve_rider_wallet_fare
    was called at booking), the balance is already deducted — we just write the
    ledger row and mark the hold as finalized.

    If no hold exists (legacy path or cash-fallback), fall back to the original
    atomic debit behaviour to remain safe.

    The ledger row is written FIRST (upsert on trip_id + user_id) so that a
    crash after the insert but before anything else leaves no double-debit.
    """
    amount = round(float(amount), 2)
    if amount < 1:
        raise HTTPException(status_code=400, detail="Trip fare is missing or too small for wallet payment")

    reference = f"trip_{trip_id}"

    # ── Step 1: Idempotency check via unique reference ────────────────────────
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

    # ── Step 2: Check if a hold exists (normal booking flow) ─────────────────
    hold = await db.wallet_holds.find_one(
        {"trip_id": trip_id, "rider_id": rider_id, "status": {"$in": ["held", "finalized"]}}
    )

    if hold and hold.get("status") == "finalized":
        # Already finalized by a previous call — just ensure ledger row exists
        return

    # ── Step 3: Write ledger row FIRST (insert-then-update pattern) ──────────
    ledger_doc = {
        "id": str(uuid.uuid4()),
        "user_id": rider_id,
        "trip_id": trip_id,
        "type": "debit",
        "source": "ride_payment",
        "amount": -amount,
        "status": "success",
        "timestamp": datetime.now(timezone.utc),
        "payment_method": "wallet",
        "reference": reference,
    }
    try:
        await db.transactions.insert_one(ledger_doc)
    except Exception:
        # DuplicateKeyError or other — already written
        return

    # ── Step 4: If a hold existed, mark it finalized (balance already deducted)
    if hold:
        _fin_now = datetime.now(timezone.utc)
        await db.wallet_holds.update_one(
            {"_id": hold["_id"]},
            {
                "$set": {
                    "status": "finalized",
                    "finalized_at": _fin_now,
                    "purge_at": _fin_now + _HOLD_RETENTION,
                }
            },
        )
        # Reconcile: if the final fare differs from the hold amount, adjust balance
        hold_amount = round(float(hold.get("amount", 0)), 2)
        delta = hold_amount - amount
        if abs(delta) > 0.01:
            await db.users.update_one({"id": rider_id}, {"$inc": {"wallet_balance": delta}})
        return

    # ── Step 5: No hold exists — fall back to atomic debit ───────────────────
    res = await db.users.update_one(
        {"id": rider_id, "wallet_balance": {"$gte": amount}},
        {"$inc": {"wallet_balance": -amount}},
    )
    if res.modified_count == 0:
        # Roll back the ledger row we just inserted
        await db.transactions.delete_one({"reference": reference, "user_id": rider_id})
        user = await db.users.find_one({"id": rider_id})
        bal = float((user or {}).get("wallet_balance") or 0)
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient wallet balance. Need ₦{amount:,.0f}, have ₦{bal:,.0f}. Top up in Wallet.",
        )


# ─── Driver credit ────────────────────────────────────────────────────────────

async def apply_driver_wallet_ride_credit(db: Any, driver_id: str, trip_id: str, amount: float) -> None:
    """Credit driver wallet for a wallet-paid ride (idempotent by reference)."""
    amount = round(float(amount), 2)
    if amount < 1 or not driver_id:
        return

    ref = f"trip_{trip_id}_driver"
    # Insert ledger entry FIRST — unique `reference` index prevents double-credit
    # even under concurrent confirm-payment requests.
    try:
        await db.transactions.insert_one(
            {
                "id": str(uuid.uuid4()),
                "user_id": driver_id,
                "trip_id": trip_id,
                "type": "credit",
                "source": "ride_payment",
                "amount": amount,
                "status": "success",
                "timestamp": datetime.now(timezone.utc),
                "payment_method": "wallet",
                "reference": ref,
            }
        )
    except Exception as exc:
        # DuplicateKeyError → a ledger row already exists. That does NOT prove the
        # balance was incremented: the process can die between the insert and the
        # $inc, and the retry used to return here, losing the driver's money for
        # good. Only skip when the ledger row is marked as settled.
        try:
            from pymongo.errors import DuplicateKeyError
        except Exception:
            DuplicateKeyError = ()  # type: ignore[assignment]
        if (
            isinstance(exc, DuplicateKeyError)
            or "duplicate" in str(exc).lower()
            or "E11000" in str(exc)
        ):
            claimed = await db.transactions.find_one_and_update(
                {"reference": ref, "balance_applied": {"$ne": True}},
                {"$set": {"balance_applied": True, "balance_applied_at": datetime.now(timezone.utc)}},
            )
            if not claimed:
                return  # already credited
            await db.users.update_one({"id": driver_id}, {"$inc": {"wallet_balance": amount}})
            return
        raise
    # Ledger row is committed and owned by this call — apply the balance, then mark
    # it settled so a retry can tell "already credited" from "credit still owed".
    await db.users.update_one({"id": driver_id}, {"$inc": {"wallet_balance": amount}})
    await db.transactions.update_one(
        {"reference": ref},
        {"$set": {"balance_applied": True, "balance_applied_at": datetime.now(timezone.utc)}},
    )
