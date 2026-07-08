"""Unit tests for legal compliance guards."""
import pytest
from fastapi import HTTPException

from legal_constants import CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION, user_legal_current
from legal_guards import COMPLIANCE_MESSAGE, assert_user_legal_compliance


class TestAssertUserLegalCompliance:
    def test_raises_404_when_user_missing(self):
        with pytest.raises(HTTPException) as exc:
            assert_user_legal_compliance(None)
        assert exc.value.status_code == 404

    def test_raises_403_when_terms_missing(self):
        with pytest.raises(HTTPException) as exc:
            assert_user_legal_compliance({"role": "rider", "terms_accepted": False})
        assert exc.value.status_code == 403
        assert exc.value.detail == COMPLIANCE_MESSAGE

    def test_raises_403_for_wrong_role(self):
        user = {
            "role": "driver",
            "terms_accepted": True,
            "terms_version": CURRENT_TERMS_VERSION,
            "privacy_accepted": True,
            "privacy_version": CURRENT_PRIVACY_VERSION,
        }
        with pytest.raises(HTTPException) as exc:
            assert_user_legal_compliance(user, role="rider")
        assert exc.value.status_code == 403

    def test_passes_when_fully_compliant(self):
        user = {
            "role": "rider",
            "terms_accepted": True,
            "terms_version": CURRENT_TERMS_VERSION,
            "privacy_accepted": True,
            "privacy_version": CURRENT_PRIVACY_VERSION,
        }
        assert user_legal_current(user) is True
        assert_user_legal_compliance(user, role="rider") is None

    def test_passes_legacy_terms_only_rider(self):
        user = {
            "role": "rider",
            "terms_accepted": True,
            "terms_version": CURRENT_TERMS_VERSION,
        }
        assert_user_legal_compliance(user, role="rider") is None

    def test_driver_go_online_source_enforces_legal_guard(self):
        from pathlib import Path

        src = Path(__file__).resolve().parents[1].joinpath("routers", "drivers.py").read_text()
        assert "assert_user_legal_compliance" in src
        assert 'role="driver"' in src
        assert "toggle_driver_online" in src
