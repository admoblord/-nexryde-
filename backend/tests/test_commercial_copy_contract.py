"""Audit 7.4 — commercial copy stays aligned with backend enforcement."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FE = ROOT / "frontend"
BE = ROOT / "backend"


def test_promo_config_matches_incentives_referral():
    server = (BE / "server.py").read_text(encoding="utf-8")
    incentives = (BE / "routers" / "incentives.py").read_text(encoding="utf-8")
    assert '"referral_bonus_referee": 500' in server
    assert "REFERRAL_REWARD_INVITEE_NGN = 500" in incentives
    assert "REFERRAL_REWARD_INVITER_NGN = 500" in incentives
    assert "FIRST_RIDE_REWARD_NGN = 500" in incentives


def test_frontend_commercial_offers_mirror_backend():
    src = (FE / "src/constants/commercialOffers.ts").read_text(encoding="utf-8")
    assert "MONTHLY_FEE_NGN = 18_000" in src
    assert "TRIAL_TRIPS_TARGET = 15" in src
    assert "TRIAL_DAY_LIMIT = 14" in src
    assert "FIRST_RIDE_DISCOUNT_PCT = 20" in src
    assert "REFERRAL_REWARD_INVITEE_NGN = 500" in src
    assert "SUPPORT_EMAIL = 'admin@admoblordgroup.com'" in src


def test_driver_terms_and_tiers_use_commercial_offers():
    terms = (FE / "app/(auth)/driver-terms.tsx").read_text(encoding="utf-8")
    tiers = (FE / "app/driver/tiers.tsx").read_text(encoding="utf-8")
    modal = (FE / "src/components/DriverTermsModal.tsx").read_text(encoding="utf-8")
    assert "DRIVER_SUBSCRIPTION_BULLETS" in terms
    assert "commercialOffers" in tiers
    assert "SUPPORT_EMAIL" in modal
    assert "admoblordgroup@gmail.com" not in modal


def test_subscription_screen_defaults_use_commercial_offers():
    src = (FE / "src/services/subscriptionScreenData.ts").read_text(encoding="utf-8")
    assert "CITY_RIDER_STANDARD_FEE_NGN" in src
    assert "TRIAL_TRIPS_TARGET" in src
