"""Rider onboarding — Uber/Bolt style: no face/address gate; terms required at signup."""
import re
import uuid
from datetime import datetime, timezone

import pytest
import requests

from legal_constants import (
    CURRENT_PRIVACY_VERSION,
    CURRENT_TERMS_VERSION,
    user_legal_current,
    user_privacy_current,
    user_terms_current,
)
from routers.users import rider_verification_field_sets
from tests.integration_utils import bearer_headers, get_base_url, random_ng_phone


class TestRiderVerificationFieldSets:
    def test_complete_with_name_phone_nin_only(self):
        user = {"name": "Ada O.", "phone": "+2348012345678", "nin": "12345678901"}
        out = rider_verification_field_sets(user)
        assert out["completed"] is True
        assert out["required_missing"] == []
        assert "face" in out["optional_missing"]
        assert "address" in out["optional_missing"]

    def test_incomplete_without_face_is_ok(self):
        user = {"name": "Ada", "phone": "+2348012345678", "nin": "12345678901", "face_verified": False}
        assert rider_verification_field_sets(user)["completed"] is True

    def test_incomplete_without_phone(self):
        user = {"name": "Ada", "phone": "", "nin": "12345678901"}
        out = rider_verification_field_sets(user)
        assert out["completed"] is False
        assert "phone" in out["required_missing"]

    def test_incomplete_without_valid_nin(self):
        user = {"name": "Ada", "phone": "+2348012345678", "nin": "abc"}
        out = rider_verification_field_sets(user)
        assert out["completed"] is False
        assert "nin" in out["required_missing"]


class TestRiderTermsAcceptance:
    def test_user_terms_current_when_accepted(self):
        user = {
            "terms_accepted": True,
            "terms_version": CURRENT_TERMS_VERSION,
        }
        assert user_terms_current(user) is True

    def test_user_terms_stale_version(self):
        user = {"terms_accepted": True, "terms_version": "2020-01-01"}
        assert user_terms_current(user) is False

    def test_user_terms_not_accepted(self):
        assert user_terms_current({"terms_accepted": False}) is False
        assert user_terms_current({}) is False

    def test_user_privacy_current_with_explicit_acceptance(self):
        user = {
            "privacy_accepted": True,
            "privacy_version": CURRENT_PRIVACY_VERSION,
            "terms_accepted": True,
            "terms_version": CURRENT_TERMS_VERSION,
        }
        assert user_privacy_current(user) is True
        assert user_legal_current(user) is True

    def test_user_privacy_legacy_terms_bundle(self):
        user = {"terms_accepted": True, "terms_version": CURRENT_TERMS_VERSION}
        assert user_privacy_current(user) is True
        assert user_legal_current(user) is True

    def test_user_legal_incomplete_without_terms(self):
        user = {"privacy_accepted": True, "privacy_version": CURRENT_PRIVACY_VERSION}
        assert user_legal_current(user) is False

    def test_rider_nin_must_be_eleven_digits(self):
        assert re.fullmatch(r"\d{11}", "12345678901")
        assert not re.fullmatch(r"\d{11}", "NINbad")
        assert not re.fullmatch(r"\d{11}", "12345")


@pytest.mark.integration
class TestRiderVerificationApi:
    """Live API: register → status complete without face; complete without face."""

    def test_register_then_status_complete_without_face(self):
        base = get_base_url()
        phone = random_ng_phone()
        nin = "".join(str(i % 10) for i in range(11))
        r = requests.post(
            f"{base}/api/auth/register",
            json={
                "phone": phone,
                "name": "Simplified Rider",
                "role": "rider",
                "nin": nin,
                "terms_accepted": True,
                "terms_accepted_at": datetime.now(timezone.utc).isoformat(),
            },
            timeout=60,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        uid = data["user"]["id"]
        token = data["token"]

        st = requests.get(
            f"{base}/api/users/{uid}/rider-verification-status",
            headers=bearer_headers(token),
            timeout=30,
        )
        assert st.status_code == 200, st.text
        status = st.json()
        assert status["completed"] is True, status
        assert "face" not in status["missing"]
        assert status.get("face_verified") is False
        assert data["user"].get("terms_accepted") is True
        assert data["user"].get("terms_version") == CURRENT_TERMS_VERSION
        assert data["user"].get("privacy_accepted") is True
        assert data["user"].get("privacy_version") == CURRENT_PRIVACY_VERSION

    def test_register_rejects_rider_without_terms(self):
        base = get_base_url()
        phone = random_ng_phone()
        nin = "".join(str(i % 10) for i in range(11))
        r = requests.post(
            f"{base}/api/auth/register",
            json={"phone": phone, "name": "No Terms Rider", "role": "rider", "nin": nin},
            timeout=60,
        )
        assert r.status_code == 400, r.text
        assert "terms" in r.json().get("detail", "").lower()

    def test_register_rejects_invalid_nin_format(self):
        base = get_base_url()
        phone = random_ng_phone()
        r = requests.post(
            f"{base}/api/auth/register",
            json={
                "phone": phone,
                "name": "Bad NIN Rider",
                "role": "rider",
                "nin": "not-11-digits",
                "terms_accepted": True,
                "terms_accepted_at": datetime.now(timezone.utc).isoformat(),
            },
            timeout=60,
        )
        assert r.status_code == 400, r.text
        assert "11-digit" in r.json().get("detail", "").lower()

    def test_complete_profile_without_face(self):
        base = get_base_url()
        phone = random_ng_phone()
        nin = "".join(str((i + 3) % 10) for i in range(11))
        email = f"rider_{uuid.uuid4().hex[:12]}@nexryde-test.local"
        r = requests.post(
            f"{base}/api/auth/register",
            json={
                "phone": "",
                "name": "Email Rider",
                "email": email,
                "role": "rider",
                "nin": nin,
                "terms_accepted": True,
                "terms_accepted_at": datetime.now(timezone.utc).isoformat(),
            },
            timeout=60,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        uid = data["user"]["id"]
        token = data["token"]

        before = requests.get(
            f"{base}/api/users/{uid}/rider-verification-status",
            headers=bearer_headers(token),
            timeout=30,
        ).json()
        assert before["completed"] is False
        assert "phone" in before["missing"]

        done = requests.post(
            f"{base}/api/users/{uid}/complete-rider-verification",
            headers={**bearer_headers(token), "Content-Type": "application/json"},
            json={"name": "Email Rider", "phone": phone, "address": ""},
            timeout=30,
        )
        assert done.status_code == 200, done.text

        after = requests.get(
            f"{base}/api/users/{uid}/rider-verification-status",
            headers=bearer_headers(token),
            timeout=30,
        ).json()
        assert after["completed"] is True
        assert after.get("face_verified") is False
