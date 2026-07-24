"""Contract tests for auth path policy (no FastAPI)."""

from nexryde_api_paths import api_path_is_protected, api_path_is_public


def test_public_health_and_ws():
    assert api_path_is_public("/api/health")
    assert api_path_is_public("/api/health/ready")
    assert api_path_is_public("/api/health/ops")
    assert api_path_is_public("/api/ws/chat/t/u")


def test_fare_and_places_require_auth():
    assert api_path_is_protected("/api/fare/estimate")
    assert api_path_is_protected("/api/places/autocomplete")
    assert not api_path_is_public("/api/fare/estimate")
    assert not api_path_is_public("/api/places/autocomplete")


def test_public_squad_and_subscription_config():
    assert api_path_is_public("/api/squad/webhook")
    assert api_path_is_public("/api/subscriptions/config")


def test_protected_trips_and_subscriptions():
    assert api_path_is_protected("/api/trips/request")
    assert api_path_is_protected("/api/subscriptions/history-extra")


def test_protected_squad_driver_payment_routes():
    assert api_path_is_protected("/api/payment/subscription/initiate-checkout")
    assert api_path_is_protected("/api/payment/create-virtual-account")
    assert api_path_is_protected("/api/driver/subscription-status")
    assert api_path_is_protected("/api/wallet/me")


def test_payment_dlq_public_before_protected_prefix():
    assert api_path_is_public("/api/payment/squad-webhook-dlq")
    assert api_path_is_public("/api/payment/squad-webhook-dlq/some-id/replay")


def test_root_public():
    assert api_path_is_public("/")
    assert api_path_is_public("/api/")


def test_public_chat_presets_and_subscription_pricing():
    assert api_path_is_public("/api/chat/presets/rider")
    assert api_path_is_public("/api/subscription/pricing")


def test_public_safety_crime_endpoints():
    assert api_path_is_public("/api/safety/real-crime-data")
    assert api_path_is_public("/api/safety/route-safety")
    assert api_path_is_public("/api/safety/live-health")
    assert api_path_is_protected("/api/safety/danger-zones")


def test_protected_driver_earnings_vault_routes():
    assert api_path_is_protected("/api/drivers/d1/earnings-vault")
    assert api_path_is_protected("/api/drivers/d1/earnings-vault/lock")
    assert api_path_is_protected("/api/drivers/d1/earnings-vault/request-unlock")
    assert api_path_is_protected("/api/drivers/d1/earnings-vault/confirm-release")


def test_protected_sensitive_optional_and_gamification_routes():
    assert api_path_is_protected("/api/voice/learning-event")
    assert api_path_is_protected("/api/loyalty/user1")
    assert api_path_is_protected("/api/matching/find-driver")
    assert api_path_is_protected("/api/driver-of-the-month/vote")


def test_formerly_optional_bearer_surfaces_now_protected():
    assert api_path_is_protected("/api/enforcement/status")
    assert api_path_is_protected("/api/work-zone/status")
    assert api_path_is_protected("/api/notifications/inbox")
    assert api_path_is_protected("/api/challenges/active")
    assert api_path_is_protected("/api/support/tickets")
