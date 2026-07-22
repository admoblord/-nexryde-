"""Launch-mode wallet flag: wallet OFF by default → no holds, no wallet trips.

Riders pay drivers directly (cash/transfer); only the driver subscription is
collected in-app. These tests pin that behaviour and the re-enable path.
"""
from __future__ import annotations

import asyncio

import pytest
from fastapi import HTTPException

from feature_flags import (
    FLAG_DEFAULTS,
    flag_value_enabled,
    invalidate_feature_flags_cache,
    is_wallet_enabled,
)
from wallet_ops import assert_rider_wallet_covers_fare, reserve_rider_wallet_fare


class FakeSystemConfig:
    def __init__(self, flags: dict | None):
        self._flags = flags

    async def find_one(self, query, projection=None):
        if self._flags is None:
            return None
        return {"value": self._flags}


class FakeUsers:
    def __init__(self, balance: float):
        self.balance = balance

    async def find_one(self, query, projection=None):
        return {"wallet_balance": self.balance}

    async def update_one(self, query, update):
        class R:
            modified_count = 1

        gte = (query.get("wallet_balance") or {}).get("$gte") if isinstance(query.get("wallet_balance"), dict) else None
        if gte is not None and self.balance < float(gte):
            R.modified_count = 0
            return R()
        inc = (update.get("$inc") or {}).get("wallet_balance", 0)
        self.balance += float(inc)
        return R()


class FakeHolds:
    def __init__(self):
        self.rows = []

    async def find_one(self, query):
        return None

    async def insert_one(self, doc):
        self.rows.append(doc)


class FakeDB:
    def __init__(self, flags: dict | None, balance: float = 10_000.0):
        self.system_config = FakeSystemConfig(flags)
        self.users = FakeUsers(balance)
        self.wallet_holds = FakeHolds()


def setup_function(_fn):
    invalidate_feature_flags_cache()


def test_wallet_flag_default_is_off():
    assert FLAG_DEFAULTS["wallet"] == "off"
    assert not flag_value_enabled("off")
    assert flag_value_enabled("all")


def test_wallet_disabled_by_default_no_flags_doc():
    db = FakeDB(flags=None)
    assert asyncio.run(is_wallet_enabled(db)) is False


def test_wallet_reserve_blocked_when_disabled():
    db = FakeDB(flags=None)
    with pytest.raises(HTTPException) as ei:
        asyncio.run(reserve_rider_wallet_fare(db, "r1", "t1", "wallet", 500.0))
    assert ei.value.status_code == 400
    assert db.wallet_holds.rows == []  # no hold ever created
    assert db.users.balance == 10_000.0  # no funds moved


def test_wallet_assert_blocked_when_disabled():
    db = FakeDB(flags=None)
    with pytest.raises(HTTPException) as ei:
        asyncio.run(assert_rider_wallet_covers_fare(db, "r1", "wallet", 500.0))
    assert ei.value.status_code == 400


def test_cash_and_transfer_unaffected_when_disabled():
    db = FakeDB(flags=None)
    # Non-wallet methods never touch the wallet — must not raise.
    asyncio.run(reserve_rider_wallet_fare(db, "r1", "t1", "cash", 500.0))
    asyncio.run(reserve_rider_wallet_fare(db, "r1", "t2", "transfer", 500.0))
    assert db.wallet_holds.rows == []
    assert db.users.balance == 10_000.0


def test_wallet_reserve_works_when_flag_enabled():
    db = FakeDB(flags={"wallet": "all"})
    asyncio.run(reserve_rider_wallet_fare(db, "r1", "t1", "wallet", 500.0))
    assert len(db.wallet_holds.rows) == 1
    assert db.users.balance == 9_500.0


def test_wallet_fails_closed_when_flags_unreadable():
    class BrokenDB(FakeDB):
        def __init__(self):
            super().__init__(flags=None)

            class Boom:
                async def find_one(self, *a, **k):
                    raise RuntimeError("db down")

            self.system_config = Boom()

    assert asyncio.run(is_wallet_enabled(BrokenDB())) is False
