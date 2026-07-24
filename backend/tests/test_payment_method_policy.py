"""Payment method whitelist — reject card/unknown auto-settle paths."""
from __future__ import annotations

import asyncio

import pytest
from fastapi import HTTPException

from feature_flags import invalidate_feature_flags_cache
from payment_method_policy import normalize_payment_method, validate_payment_method_for_booking


class _Cfg:
    def __init__(self, flags):
        self._flags = flags

    async def find_one(self, *a, **k):
        if self._flags is None:
            return None
        return {"value": self._flags}


class _DB:
    def __init__(self, flags):
        self.system_config = _Cfg(flags)


def setup_function(_fn):
    invalidate_feature_flags_cache()


def test_normalize_aliases():
    assert normalize_payment_method("CASH") == "cash"
    assert normalize_payment_method("bank_transfer") == "transfer"
    assert normalize_payment_method("nexryde_wallet") == "wallet"
    assert normalize_payment_method("card") == "card"


def test_reject_card():
    with pytest.raises(HTTPException) as ei:
        asyncio.run(validate_payment_method_for_booking(_DB(None), "card"))
    assert ei.value.status_code == 400


def test_cash_and_transfer_ok():
    assert asyncio.run(validate_payment_method_for_booking(_DB(None), "cash")) == "cash"
    assert asyncio.run(validate_payment_method_for_booking(_DB(None), "transfer")) == "transfer"


def test_wallet_blocked_when_flag_off():
    with pytest.raises(HTTPException) as ei:
        asyncio.run(validate_payment_method_for_booking(_DB({"wallet": "off"}), "wallet"))
    assert ei.value.status_code == 400


def test_wallet_ok_when_flag_on():
    assert asyncio.run(validate_payment_method_for_booking(_DB({"wallet": "all"}), "wallet")) == "wallet"
