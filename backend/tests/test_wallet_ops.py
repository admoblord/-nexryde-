"""wallet_ops no longer mutates balances — wallet booking is rejected."""
from __future__ import annotations

import asyncio

import pytest
from fastapi import HTTPException

from wallet_ops import (
    apply_driver_wallet_ride_credit,
    apply_rider_wallet_ride_debit,
    assert_rider_wallet_covers_fare,
    release_rider_wallet_hold,
    reserve_rider_wallet_fare,
)


class _DB:
    pass


def test_assert_rejects_wallet_method():
    with pytest.raises(HTTPException) as ei:
        asyncio.run(assert_rider_wallet_covers_fare(_DB(), "r1", "wallet", 100.0))
    assert ei.value.status_code == 400


def test_reserve_rejects_wallet_method():
    with pytest.raises(HTTPException) as ei:
        asyncio.run(reserve_rider_wallet_fare(_DB(), "r1", "t1", "nexryde_wallet", 100.0))
    assert ei.value.status_code == 400


def test_reserve_cash_is_noop():
    asyncio.run(reserve_rider_wallet_fare(_DB(), "r1", "t1", "cash", 100.0))


def test_release_hold_is_noop():
    asyncio.run(release_rider_wallet_hold(_DB(), "r1", "t1"))


def test_ride_debit_rejected():
    with pytest.raises(HTTPException) as ei:
        asyncio.run(apply_rider_wallet_ride_debit(_DB(), "r1", "t1", 50.0))
    assert ei.value.status_code == 400


def test_driver_credit_is_noop():
    asyncio.run(apply_driver_wallet_ride_credit(_DB(), "d1", "t1", 40.0))
