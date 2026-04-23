"""Unit tests for wallet_ops (in-memory fake Mongo)."""

from __future__ import annotations

import pytest
import asyncio

from wallet_ops import (
    assert_rider_wallet_covers_fare,
    apply_driver_wallet_ride_credit,
    apply_rider_wallet_ride_debit,
)


class UpdateResult:
    def __init__(self, modified_count: int) -> None:
        self.modified_count = modified_count


class FakeUsers:
    def __init__(self, docs: list[dict]) -> None:
        self._by_id = {d["id"]: dict(d) for d in docs}

    async def find_one(self, query: dict, projection=None):
        uid = query.get("id")
        if uid not in self._by_id:
            return None
        u = self._by_id[uid]
        if projection and projection.get("wallet_balance") == 1:
            return {"wallet_balance": u.get("wallet_balance", 0)}
        return dict(u)

    async def update_one(self, query: dict, update: dict):
        uid = query.get("id")
        if uid not in self._by_id:
            return UpdateResult(0)
        u = self._by_id[uid]
        ge = query.get("wallet_balance")
        if isinstance(ge, dict) and "$gte" in ge:
            need = float(ge["$gte"])
            bal = float(u.get("wallet_balance") or 0)
            if bal + 1e-9 < need:
                return UpdateResult(0)
        inc = (update or {}).get("$inc") or {}
        if "wallet_balance" in inc:
            u["wallet_balance"] = float(u.get("wallet_balance") or 0) + float(inc["wallet_balance"])
        return UpdateResult(1)


class FakeTransactions:
    def __init__(self) -> None:
        self.rows: list[dict] = []

    async def find_one(self, query: dict):
        for row in self.rows:
            if self._match(row, query):
                return dict(row)
        return None

    def _match_sub(self, row: dict, sub: dict) -> bool:
        for sk, sv in sub.items():
            if not self._field_matches(row, sk, sv):
                return False
        return True

    def _field_matches(self, row: dict, k: str, v) -> bool:
        if isinstance(v, dict) and "$in" in v:
            return row.get(k) in v["$in"]
        return row.get(k) == v

    def _match(self, row: dict, query: dict) -> bool:
        for k, v in query.items():
            if k == "$or":
                if not any(self._match_sub(row, sub) for sub in v):
                    return False
            elif not self._field_matches(row, k, v):
                return False
        return True

    async def insert_one(self, doc: dict):
        self.rows.append(dict(doc))


class FakeDB:
    def __init__(self, users: FakeUsers, transactions: FakeTransactions) -> None:
        self.users = users
        self.transactions = transactions


def test_assert_wallet_skips_non_wallet():
    db = FakeDB(FakeUsers([{"id": "r1", "wallet_balance": 0}]), FakeTransactions())
    asyncio.run(assert_rider_wallet_covers_fare(db, "r1", "cash", 500.0))


def test_assert_wallet_insufficient():
    db = FakeDB(FakeUsers([{"id": "r1", "wallet_balance": 50.0}]), FakeTransactions())
    with pytest.raises(Exception) as ei:
        asyncio.run(assert_rider_wallet_covers_fare(db, "r1", "wallet", 100.0))
    assert getattr(ei.value, "status_code", None) == 400


def test_assert_wallet_sufficient():
    db = FakeDB(FakeUsers([{"id": "r1", "wallet_balance": 150.0}]), FakeTransactions())
    asyncio.run(assert_rider_wallet_covers_fare(db, "r1", "wallet", 100.0))


def test_rider_debit_once_and_idempotent():
    txs = FakeTransactions()
    users = FakeUsers([{"id": "r1", "wallet_balance": 200.0}])
    db = FakeDB(users, txs)
    tid = "trip-abc"
    asyncio.run(apply_rider_wallet_ride_debit(db, "r1", tid, 80.0))
    assert users._by_id["r1"]["wallet_balance"] == 120.0
    assert len(txs.rows) == 1
    assert txs.rows[0]["type"] == "debit"
    assert txs.rows[0]["amount"] == -80.0

    asyncio.run(apply_rider_wallet_ride_debit(db, "r1", tid, 80.0))
    assert users._by_id["r1"]["wallet_balance"] == 120.0
    assert len(txs.rows) == 1


def test_rider_debit_insufficient():
    txs = FakeTransactions()
    users = FakeUsers([{"id": "r1", "wallet_balance": 10.0}])
    db = FakeDB(users, txs)
    with pytest.raises(Exception) as ei:
        asyncio.run(apply_rider_wallet_ride_debit(db, "r1", "trip-x", 50.0))
    assert getattr(ei.value, "status_code", None) == 400
    assert users._by_id["r1"]["wallet_balance"] == 10.0
    assert len(txs.rows) == 0


def test_driver_credit_idempotent():
    txs = FakeTransactions()
    users = FakeUsers([{"id": "d1", "wallet_balance": 0.0}])
    db = FakeDB(users, txs)
    tid = "trip-xyz"
    asyncio.run(apply_driver_wallet_ride_credit(db, "d1", tid, 40.0))
    assert users._by_id["d1"]["wallet_balance"] == 40.0
    assert len(txs.rows) == 1

    asyncio.run(apply_driver_wallet_ride_credit(db, "d1", tid, 40.0))
    assert users._by_id["d1"]["wallet_balance"] == 40.0
    assert len(txs.rows) == 1
