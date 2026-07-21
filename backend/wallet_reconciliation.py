"""Wallet reconciliation — flag divergence between the spendable balance,
the transaction ledger, and the parallel ``db.wallets`` store.

NEXRYDE keeps wallet money in three places that *should* agree:

1. ``users.wallet_balance``   — the spendable balance every debit/credit mutates
                                (the source of truth used at booking/payment).
2. ``db.transactions``        — the append-only ledger of credits/debits.
3. ``db.wallets.balance``     — a parallel per-user store created at signup that
                                the live money operations never update, so it is
                                effectively cosmetic / stale.

This module recomputes the expected balance from the ledger (accounting for
outstanding ``wallet_holds``) and flags any user whose stored balance diverges
beyond a tolerance. It is read-only: it never writes corrections, only reports.
"""
from __future__ import annotations

from typing import Any


# Ledger ``type`` values that REDUCE the wallet balance. Everything else that
# is a recognised money-in event (credit/topup) increases it. For unrecognised
# types we fall back to the stored sign of ``amount``.
_DEBIT_TYPES = {"debit", "refund", "withdrawal", "payout", "debit_request", "ride_payment_debit"}
_CREDIT_TYPES = {"credit", "topup", "wallet_topup"}


def _signed_amount(tx: dict) -> float:
    """Effect of a single ledger row on ``wallet_balance`` (signed naira)."""
    try:
        raw = float(tx.get("amount") or 0)
    except (TypeError, ValueError):
        return 0.0
    tx_type = str(tx.get("type") or "").lower()
    if tx_type in _CREDIT_TYPES:
        return abs(raw)
    if tx_type in _DEBIT_TYPES:
        return -abs(raw)
    # Unknown type (e.g. legacy "debit" rows already stored as negative):
    # trust the stored sign.
    return raw


async def reconcile_wallets(
    db: Any,
    *,
    tolerance: float = 1.0,
    limit: int = 1000,
) -> dict:
    """Recompute expected balances from the ledger and flag divergence.

    Args:
        db: Motor database handle.
        tolerance: max absolute naira difference treated as "in sync".
        limit: max number of users to scan (pilot-safe cap).

    Returns a summary dict with per-user divergences (capped) and totals.
    """
    # 1. Ledger sum per user (computed in Python so the sign rules above apply
    #    consistently to legacy rows). Pilot scale keeps this cheap.
    ledger_by_user: dict[str, float] = {}
    cursor = db.transactions.find(
        {"status": {"$in": ["success", "completed"]}},
        {"_id": 0, "user_id": 1, "amount": 1, "type": 1},
    )
    async for tx in cursor:
        uid = tx.get("user_id")
        if not uid:
            continue
        ledger_by_user[uid] = round(ledger_by_user.get(uid, 0.0) + _signed_amount(tx), 2)

    # 2. Outstanding holds per rider (balance already deducted, no ledger row yet).
    held_by_user: dict[str, float] = {}
    hold_cursor = db.wallet_holds.find(
        {"status": "held"},
        {"_id": 0, "rider_id": 1, "amount": 1},
    )
    async for hold in hold_cursor:
        uid = hold.get("rider_id")
        if not uid:
            continue
        try:
            amt = float(hold.get("amount") or 0)
        except (TypeError, ValueError):
            amt = 0.0
        held_by_user[uid] = round(held_by_user.get(uid, 0.0) + amt, 2)

    # 3. Parallel db.wallets store (cosmetic) per user.
    parallel_by_user: dict[str, float] = {}
    wallet_cursor = db.wallets.find({}, {"_id": 0, "user_id": 1, "balance": 1})
    async for w in wallet_cursor:
        uid = w.get("user_id")
        if not uid:
            continue
        try:
            parallel_by_user[uid] = float(w.get("balance") or 0)
        except (TypeError, ValueError):
            parallel_by_user[uid] = 0.0

    # 4. Walk users and compare. Only users with any wallet footprint matter.
    candidate_ids = set(ledger_by_user) | set(held_by_user)
    divergences: list[dict] = []
    checked = 0
    parallel_divergent = 0

    for uid in candidate_ids:
        if checked >= limit:
            break
        checked += 1
        user = await db.users.find_one({"id": uid}, {"_id": 0, "wallet_balance": 1, "email": 1, "role": 1})
        if not user:
            continue
        stored = round(float(user.get("wallet_balance") or 0), 2)
        expected = round(ledger_by_user.get(uid, 0.0) - held_by_user.get(uid, 0.0), 2)
        ledger_delta = round(stored - expected, 2)

        parallel = parallel_by_user.get(uid)
        parallel_delta = None
        if parallel is not None:
            parallel_delta = round(stored - parallel, 2)
            if abs(parallel_delta) > tolerance:
                parallel_divergent += 1

        if abs(ledger_delta) > tolerance:
            divergences.append(
                {
                    "user_id": uid,
                    "email": user.get("email"),
                    "role": user.get("role"),
                    "stored_balance": stored,
                    "ledger_expected": expected,
                    "ledger_delta": ledger_delta,
                    "outstanding_holds": held_by_user.get(uid, 0.0),
                    "parallel_wallets_balance": parallel,
                    "parallel_delta": parallel_delta,
                }
            )

    divergences.sort(key=lambda d: abs(d["ledger_delta"]), reverse=True)

    return {
        "status": "ok" if not divergences else "divergence_found",
        "tolerance_ngn": tolerance,
        "users_checked": checked,
        "ledger_divergent_users": len(divergences),
        "parallel_store_divergent_users": parallel_divergent,
        "parallel_store_note": (
            "db.wallets.balance is a legacy parallel store not updated by live "
            "credit/debit ops; divergence here is expected and cosmetic, not a "
            "money-integrity bug. The integrity check is ledger_delta."
        ),
        "divergences": divergences[:200],
    }
