"""Unit tests for wallet trip payment helpers."""

import pytest

from wallet_trip_helpers import (
    is_cash_payment_method,
    is_transfer_payment_method,
    is_wallet_payment_method,
    payment_status_after_completion,
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


def test_is_transfer_payment_method():
    assert is_transfer_payment_method("transfer") is True
    assert is_transfer_payment_method("bank_transfer") is True
    assert is_transfer_payment_method("Bank_Transfer") is True
    assert is_transfer_payment_method("cash") is False
    assert is_transfer_payment_method(None) is False


def test_rider_must_confirm_payment():
    # Cash and transfer change hands before the driver ends the trip, so
    # completion settles them — no second confirmation tap.
    assert rider_must_confirm_payment(None) is False
    assert rider_must_confirm_payment("cash") is False
    assert rider_must_confirm_payment("CASH") is False
    assert rider_must_confirm_payment("transfer") is False
    assert rider_must_confirm_payment("bank_transfer") is False
    # Wallet moves money in-app and unknown methods have no processor.
    assert rider_must_confirm_payment("wallet") is True
    assert rider_must_confirm_payment("card") is True


def test_payment_status_after_completion():
    # Ending a cash/transfer trip settles it, so the rider is never held on a
    # finished trip waiting for the driver to tap a second confirmation.
    assert payment_status_after_completion(None) == "completed"
    assert payment_status_after_completion("cash") == "completed"
    assert payment_status_after_completion("transfer") == "completed"
    assert payment_status_after_completion("bank_transfer") == "completed"
    assert payment_status_after_completion("wallet") == "pending"
    assert payment_status_after_completion("card") == "pending"
