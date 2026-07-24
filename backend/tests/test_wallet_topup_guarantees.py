"""Critical money-safety guarantees for Squad wallet top-up flows."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException

from routers import payments


class _Result:
    def __init__(self, modified_count: int):
        self.modified_count = modified_count


class FakeCollection:
    def __init__(self, rows: list[dict] | None = None, *, unique_fields: list[str] | None = None):
        self.rows = rows or []
        self.unique_fields = unique_fields or []

    async def find_one(self, query: dict, *args, **kwargs):
        for row in reversed(self.rows):
            if _matches(row, query):
                return dict(row)
        return None

    async def insert_one(self, doc: dict):
        for field in self.unique_fields:
            value = doc.get(field)
            if value is None:
                continue
            for row in self.rows:
                if row.get(field) == value:
                    raise payments.DuplicateKeyError("duplicate unique field")
        self.rows.append(dict(doc))
        return SimpleNamespace(inserted_id=doc.get("id"))

    async def update_one(self, query: dict, update: dict, **kwargs):
        for idx, row in enumerate(self.rows):
            if _matches(row, query):
                self.rows[idx] = _apply_update(row, update)
                return _Result(1)
        return _Result(0)

    async def update_many(self, query: dict, update: dict):
        count = 0
        for idx, row in enumerate(self.rows):
            if _matches(row, query):
                self.rows[idx] = _apply_update(row, update)
                count += 1
        return _Result(count)

    def find(self, query: dict, projection: dict | None = None):
        rows = [dict(r) for r in self.rows if _matches(r, query)]
        return FakeCursor(rows, projection)


class FakeCursor:
    def __init__(self, rows: list[dict], projection: dict | None):
        self.rows = rows
        self._limit = None
        self.projection = projection

    def sort(self, key: str, direction: int):
        reverse = direction < 0
        self.rows = sorted(self.rows, key=lambda r: r.get(key) or datetime.min, reverse=reverse)
        return self

    def limit(self, n: int):
        self._limit = n
        return self

    async def to_list(self, n: int):
        limit = self._limit or n
        out = self.rows[:limit]
        if self.projection:
            out2 = []
            for row in out:
                shaped = {}
                for k, v in self.projection.items():
                    if v and k in row:
                        shaped[k] = row[k]
                out2.append(shaped)
            return out2
        return out


def _matches(row: dict, query: dict) -> bool:
    for key, val in query.items():
        if key == "$or":
            if not any(_matches(row, sub) for sub in val):
                return False
            continue
        if isinstance(val, dict):
            if "$in" in val and row.get(key) not in val["$in"]:
                return False
            if "$ne" in val and row.get(key) == val["$ne"]:
                return False
            if "$lt" in val and not (row.get(key) < val["$lt"]):
                return False
            if "$gte" in val and not (row.get(key) >= val["$gte"]):
                return False
            continue
        if row.get(key) != val:
            return False
    return True


def _apply_update(row: dict, update: dict) -> dict:
    next_row = dict(row)
    for k, v in (update.get("$set") or {}).items():
        next_row[k] = v
    for k, v in (update.get("$inc") or {}).items():
        next_row[k] = (next_row.get(k) or 0) + v
    return next_row


@pytest.fixture()
def fake_db(monkeypatch):
    now = datetime.utcnow()
    db = SimpleNamespace(
        wallet_payment_intents=FakeCollection(
            [
                {
                    "id": "intent_1",
                    "user_id": "u1",
                    "transaction_ref": "NR_REF_1",
                    "amount_kobo": 200000,
                    "amount_ngn": 2000.0,
                    "status": "pending",
                    "created_at": now,
                    "updated_at": now,
                    "expires_at": now + timedelta(minutes=30),
                }
            ]
        ),
        users=FakeCollection([{"id": "u1", "wallet_balance": 1000.0}]),
        transactions=FakeCollection([], unique_fields=["payment_intent_id"]),
        wallet_topup_transactions=FakeCollection([], unique_fields=["transactionRef"]),
        squad_webhook_dlq=FakeCollection([]),
    )
    monkeypatch.setattr(payments, "db", db)
    return db


def _success_verify(amount_kobo: int) -> dict[str, Any]:
    return {
        "verified": True,
        "provider_status": "success",
        "paid_amount": amount_kobo / 100.0,
        "raw": {"data": {"transaction_amount": amount_kobo, "transaction_status": "success"}},
    }


def _failed_verify() -> dict[str, Any]:
    return {
        "verified": False,
        "provider_status": "pending",
        "reason": "still_processing",
        "raw": {"data": {"transaction_status": "success"}},
    }


def test_cancelled_intent_is_never_credited(fake_db):
    asyncio.run(fake_db.wallet_payment_intents.update_one({"id": "intent_1"}, {"$set": {"status": "cancelled"}}))
    res = asyncio.run(
        payments._credit_wallet_checkout_intent(
            intent={"id": "intent_1"},
            verify_result=_success_verify(200000),
            source="test",
        )
    )
    assert res["credited"] is False
    assert res["reason"] == "intent_cancelled"
    user = asyncio.run(fake_db.users.find_one({"id": "u1"}))
    assert user["wallet_balance"] == 1000.0
    assert len(fake_db.transactions.rows) == 0


def test_double_webhook_idempotent_credit_once(fake_db):
    first = asyncio.run(payments._credit_wallet_checkout_intent(
        intent={"id": "intent_1"},
        verify_result=_success_verify(200000),
        source="webhook",
    ))
    second = asyncio.run(payments._credit_wallet_checkout_intent(
        intent={"id": "intent_1"},
        verify_result=_success_verify(200000),
        source="webhook",
    ))
    assert first["credited"] is True
    assert second["duplicate"] is True
    user = asyncio.run(fake_db.users.find_one({"id": "u1"}))
    assert user["wallet_balance"] == 3000.0
    assert len(fake_db.transactions.rows) == 1


def test_race_parallel_verify_credits_once(fake_db):
    async def _run():
        verify = _success_verify(200000)
        return await asyncio.gather(
            payments._credit_wallet_checkout_intent(intent={"id": "intent_1"}, verify_result=verify, source="verify"),
            payments._credit_wallet_checkout_intent(intent={"id": "intent_1"}, verify_result=verify, source="verify"),
        )

    a, b = asyncio.run(_run())
    credited_count = int(bool(a.get("credited"))) + int(bool(b.get("credited")))
    assert credited_count == 1
    user = asyncio.run(fake_db.users.find_one({"id": "u1"}))
    assert user["wallet_balance"] == 3000.0
    assert len(fake_db.transactions.rows) == 1


def test_tampered_amount_fails_without_credit(fake_db):
    bad = _success_verify(100000)  # underpayment
    res = asyncio.run(
        payments._credit_wallet_checkout_intent(intent={"id": "intent_1"}, verify_result=bad, source="verify")
    )
    assert res["credited"] is False
    assert res["reason"] == "amount_mismatch"
    intent = asyncio.run(fake_db.wallet_payment_intents.find_one({"id": "intent_1"}))
    assert intent["status"] == "failed"
    user = asyncio.run(fake_db.users.find_one({"id": "u1"}))
    assert user["wallet_balance"] == 1000.0


def test_bad_signature_webhook_rejected_without_writes(fake_db, monkeypatch):
    monkeypatch.setattr(payments, "SQUAD_WEBHOOK_SECRET", "whsec_abc123")
    body = b'{"event":"charge_successful","data":{"transaction_ref":"NR_REF_1"}}'
    bad_sig = "BAD_SIGNATURE"

    class FakeRequest:
        headers = {"x-squad-encrypted-body": bad_sig}

        async def body(self):
            return body

    with pytest.raises(HTTPException) as exc:
        asyncio.run(payments.handle_squad_webhook(FakeRequest()))
    assert exc.value.status_code == 401
    assert len(fake_db.transactions.rows) == 0

    # sanity: verify expected signature is different (case/format mismatch regressions)
    expected = hmac.new(b"whsec_abc123", body, hashlib.sha512).hexdigest().upper()
    assert expected != bad_sig


def test_expired_intent_never_credited(fake_db):
    past = datetime.utcnow() - timedelta(minutes=31)
    asyncio.run(
        fake_db.wallet_payment_intents.update_one(
            {"id": "intent_1"},
            {"$set": {"created_at": past, "expires_at": past, "status": "pending"}},
        )
    )
    res = asyncio.run(
        payments._credit_wallet_checkout_intent(
            intent={"id": "intent_1"},
            verify_result=_success_verify(200000),
            source="verify",
        )
    )
    assert res["credited"] is False
    assert res["reason"] == "intent_expired"
    intent = asyncio.run(fake_db.wallet_payment_intents.find_one({"id": "intent_1"}))
    assert intent["status"] == "expired"
    user = asyncio.run(fake_db.users.find_one({"id": "u1"}))
    assert user["wallet_balance"] == 1000.0


def test_unverified_verify_result_never_credits(fake_db):
    res = asyncio.run(
        payments._credit_wallet_checkout_intent(
            intent={"id": "intent_1"},
            verify_result={"verified": False, "provider_status": "pending"},
            source="test",
        )
    )
    assert res["credited"] is False
    # An unverified Squad result must never credit; the intent is reset to pending
    # for a later retry (reason label reflects "not confirmed yet").
    assert res.get("reason") == "squad_not_confirmed_yet"
    user = asyncio.run(fake_db.users.find_one({"id": "u1"}))
    assert user["wallet_balance"] == 1000.0


def test_prior_success_transaction_reference_skips_second_credit(fake_db):
    asyncio.run(
        fake_db.transactions.insert_one(
            {
                "id": "prior_tx",
                "user_id": "u1",
                "type": "credit",
                "status": "success",
                "reference": "NR_REF_1",
                "timestamp": datetime.utcnow(),
            }
        )
    )
    res = asyncio.run(
        payments._credit_wallet_checkout_intent(
            intent={"id": "intent_1"},
            verify_result=_success_verify(200000),
            source="test",
        )
    )
    assert res["credited"] is False
    assert res.get("duplicate") is True
    user = asyncio.run(fake_db.users.find_one({"id": "u1"}))
    assert user["wallet_balance"] == 1000.0


def test_webhook_success_status_without_provider_verify_never_credits(fake_db, monkeypatch):
    fake_db.subscription_transactions = FakeCollection([])
    fake_db.subscription_payment_intents = FakeCollection([])
    fake_db.wallet_virtual_accounts = FakeCollection([])
    async def _fake_verify(_ref: str):
        return _failed_verify()
    monkeypatch.setattr(payments, "_verify_squad_transaction", _fake_verify)

    payload = {
        "event": "charge_successful",
        "data": {
            "transaction_ref": "NR_REF_1",
            "status": "success",
            "transaction_status": "success",
            "amount": 2000,
        },
    }
    res = asyncio.run(payments._process_squad_webhook_payload(payload))
    assert res["processed"] is False
    user = asyncio.run(fake_db.users.find_one({"id": "u1"}))
    assert user["wallet_balance"] == 1000.0
    assert len(fake_db.transactions.rows) == 0


@pytest.mark.skipif(
    not (
        __import__("os").environ.get("RUN_SQUAD_SANDBOX_E2E") == "1"
        and __import__("os").environ.get("NEXRYDE_BACKEND_URL")
        and __import__("os").environ.get("SQUAD_SANDBOX_REFERENCE")
    ),
    reason="Set RUN_SQUAD_SANDBOX_E2E=1, NEXRYDE_BACKEND_URL and SQUAD_SANDBOX_REFERENCE",
)
def test_squad_sandbox_reference_idempotent_live():
    """Live sandbox guardrail: verify same paid reference cannot credit twice."""
    import os
    import requests
    from tests.integration_utils import get_base_url, register_rider

    base = get_base_url()
    rider_id, token, _ = register_rider(base, name="Sandbox Wallet E2E")
    ref = os.environ["SQUAD_SANDBOX_REFERENCE"]
    headers = {"Authorization": f"Bearer {token}"}

    first = requests.post(
        f"{base}/api/payment/wallet/verify-pending",
        json={"transaction_ref": ref},
        headers=headers,
        timeout=60,
    )
    second = requests.post(
        f"{base}/api/payment/wallet/verify-pending",
        json={"transaction_ref": ref},
        headers=headers,
        timeout=60,
    )

    # We only assert idempotent semantics on repeated verify call.
    assert first.status_code in {200, 404, 400}
    assert second.status_code in {200, 404, 400}
    if first.status_code == 200 and second.status_code == 200:
        d1 = first.json()
        d2 = second.json()
        assert not (d1.get("credited") and d2.get("credited"))

