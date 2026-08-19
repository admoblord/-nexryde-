"""
A driver waiting on their bank OTP must be told the payment is pending.

_verify_squad_transaction reports Squad's state as `provider_status`, but the
subscription verify endpoint read `transaction_status`, which it never sets.
Every unpaid transaction came back as "gateway_failed", so the app fell through
to "Payment not confirmed yet" and the driver could pay a second time.

The payload below is the real response Squad returned in production for an
initiated-but-unpaid NexRyde subscription.
"""
from routers.payments import _classify_squad_verify_failure

LIVE_PENDING = {
    "verified": False,
    "provider": "squad",
    "provider_status": "pending",
    "paid_amount": 1500000.0,
    "currency": "NGN",
    "http_status": 200,
    "raw": {
        "status": 200,
        "success": True,
        "message": "Success",
        "data": {
            "transaction_amount": 1500000,
            "transaction_ref": "NEXRYDE_1787096077345_rS10bF",
            "transaction_status": "pending",
            "merchant_business_name": "Admoblordgroup limited",
            "meta": {"tier": "city_rider", "purpose": "driver_subscription"},
        },
    },
}


def test_live_unpaid_transaction_is_pending_not_a_gateway_failure():
    reason, tx_status = _classify_squad_verify_failure(LIVE_PENDING)
    assert reason == "payment_pending"
    assert tx_status == "pending"


def test_transaction_status_reaches_the_app():
    """subscription.tsx also branches on transaction_status, so it must not be null."""
    _, tx_status = _classify_squad_verify_failure(LIVE_PENDING)
    assert tx_status, "the app cannot show 'complete your bank OTP' without a status"


def test_declined_card_is_reported_as_a_failed_payment():
    reason, _ = _classify_squad_verify_failure(
        {"verified": False, "provider_status": "failed", "http_status": 200}
    )
    assert reason == "payment_failed"


def test_reversal_is_a_failed_payment():
    reason, _ = _classify_squad_verify_failure({"verified": False, "provider_status": "reversed"})
    assert reason == "payment_failed"


def test_unreachable_gateway_is_a_network_timeout():
    reason, _ = _classify_squad_verify_failure(
        {"verified": False, "reason": "Squad verify request failed: ConnectTimeout"}
    )
    assert reason == "network_timeout"


def test_genuinely_unknown_state_still_falls_back():
    reason, _ = _classify_squad_verify_failure({"verified": False, "provider_status": "wat"})
    assert reason == "gateway_failed"


def test_legacy_transaction_status_key_still_understood():
    reason, tx_status = _classify_squad_verify_failure(
        {"verified": False, "transaction_status": "processing"}
    )
    assert reason == "payment_pending"
    assert tx_status == "processing"


def test_endpoint_uses_the_classifier_rather_than_the_missing_field():
    import inspect

    from routers.payments import verify_pending_subscription_checkout

    src = inspect.getsource(verify_pending_subscription_checkout)
    assert "_classify_squad_verify_failure" in src
    assert 'verify_result.get("transaction_status")' not in src
