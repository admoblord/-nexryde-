"""Customer fare wallet is removed — no feature flag, ops hard-reject wallet PM."""
from __future__ import annotations

import asyncio

import pytest
from fastapi import HTTPException

from feature_flags import FLAG_DEFAULTS
from wallet_ops import assert_rider_wallet_covers_fare, reserve_rider_wallet_fare


class _DB:
    pass


def test_wallet_flag_removed_from_defaults():
    assert "wallet" not in FLAG_DEFAULTS


def test_wallet_payment_method_rejected_by_ops():
    with pytest.raises(HTTPException) as ei:
        asyncio.run(assert_rider_wallet_covers_fare(_DB(), "r1", "wallet", 500.0))
    assert ei.value.status_code == 400
    assert "Wallet" in str(ei.value.detail)


def test_wallet_reserve_rejected():
    with pytest.raises(HTTPException) as ei:
        asyncio.run(reserve_rider_wallet_fare(_DB(), "r1", "t1", "wallet", 500.0))
    assert ei.value.status_code == 400


def test_cash_and_transfer_reserve_are_noop():
    asyncio.run(reserve_rider_wallet_fare(_DB(), "r1", "t1", "cash", 500.0))
    asyncio.run(reserve_rider_wallet_fare(_DB(), "r1", "t2", "transfer", 500.0))
