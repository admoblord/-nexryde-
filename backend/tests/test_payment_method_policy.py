"""Payment method policy — cash/transfer only (no fare wallet)."""
from __future__ import annotations

import asyncio

import pytest
from fastapi import HTTPException

from payment_method_policy import normalize_payment_method, validate_payment_method_for_booking


class _DB:
    """Unused by the policy after wallet removal; kept for call-site shape."""

    def __init__(self, flags=None):
        self.flags = flags or {}


def test_normalize_cash_and_transfer():
    assert normalize_payment_method(None) == "cash"
    assert normalize_payment_method("") == "cash"
    assert normalize_payment_method("CASH") == "cash"
    assert normalize_payment_method("cash_payment") == "cash"
    assert normalize_payment_method("transfer") == "transfer"
    assert normalize_payment_method("bank_transfer") == "transfer"


def test_normalize_does_not_promote_wallet():
    assert normalize_payment_method("wallet") == "wallet"
    assert normalize_payment_method("nexryde_wallet") == "nexryde_wallet"


def test_validate_allows_cash_and_transfer():
    assert asyncio.run(validate_payment_method_for_booking(_DB(), "cash")) == "cash"
    assert asyncio.run(validate_payment_method_for_booking(_DB(), "transfer")) == "transfer"


def test_validate_rejects_wallet():
    with pytest.raises(HTTPException) as ei:
        asyncio.run(validate_payment_method_for_booking(_DB(), "wallet"))
    assert ei.value.status_code == 400
    assert "Wallet" in str(ei.value.detail)


def test_validate_rejects_unknown():
    with pytest.raises(HTTPException) as ei:
        asyncio.run(validate_payment_method_for_booking(_DB(), "card"))
    assert ei.value.status_code == 400
