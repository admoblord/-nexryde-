"""Unit tests for wallet trip payment helpers."""

import pytest

from wallet_trip_helpers import (
    is_cash_payment_method,
    is_wallet_payment_method,
    rider_must_confirm_payment,
    trip_fare_amount,
)


def test_trip_fare_amount_priority():
    assert trip_fare_amount({"fare": 100, "final_fare": 200}) == 100.0
    assert trip_fare_amount({"final_fare": 250}) == 250.0
    assert trip_fare_amount({"offered_fare": 99.5}) == 99.5
    assert trip_fare_amount({}) == 0.0


def test_is_wallet_payment_method():
    assert is_wallet_payment_method("wallet") is True
    assert is_wallet_payment_method("NEXRYDE_Wallet") is True
    assert is_wallet_payment_method("balance") is True
    assert is_wallet_payment_method("cash") is False
    assert is_wallet_payment_method(None) is False


def test_is_cash_payment_method():
    assert is_cash_payment_method(None) is True
    assert is_cash_payment_method("cash") is True
    assert is_cash_payment_method("CASH") is True
    assert is_cash_payment_method("wallet") is False


def test_rider_must_confirm_payment():
    # All methods leave payment pending after complete (cash = driver confirms).
    assert rider_must_confirm_payment(None) is True
    assert rider_must_confirm_payment("cash") is True
    assert rider_must_confirm_payment("wallet") is True
    assert rider_must_confirm_payment("transfer") is True
    assert rider_must_confirm_payment("card") is True
