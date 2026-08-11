"""Go-online must reject when evaluate_driver_go_online_compliance fails."""
from unittest.mock import AsyncMock, patch

import pytest

from driver_compliance import evaluate_driver_go_online_compliance


@pytest.mark.asyncio
async def test_monthly_incomplete_blocks_go_online():
    with (
        patch(
            "driver_compliance.check_driver_document_expiry",
            new=AsyncMock(return_value={"compliant": True, "expired": [], "critically_expired": False}),
        ),
        patch(
            "driver_compliance.check_monthly_uploads",
            new=AsyncMock(
                return_value={
                    "month": "2026-08",
                    "interior_uploaded": False,
                    "selfie_uploaded": False,
                    "compliant": False,
                    "deadline": "2026-08-07T00:00:00+00:00",
                }
            ),
        ),
    ):
        status = await evaluate_driver_go_online_compliance(
            "driver-1",
            profile={"has_ac": True},
        )
    assert status["can_go_online"] is False
    assert status["block_code"] == "ERR_COMPLIANCE"
    assert "Monthly verification" in status["block_message"]


@pytest.mark.asyncio
async def test_fully_compliant_allows_go_online():
    with (
        patch(
            "driver_compliance.check_driver_document_expiry",
            new=AsyncMock(return_value={"compliant": True, "expired": [], "critically_expired": False}),
        ),
        patch(
            "driver_compliance.check_monthly_uploads",
            new=AsyncMock(
                return_value={
                    "month": "2026-08",
                    "interior_uploaded": True,
                    "selfie_uploaded": True,
                    "compliant": True,
                    "deadline": "2026-08-07T00:00:00+00:00",
                }
            ),
        ),
    ):
        status = await evaluate_driver_go_online_compliance(
            "driver-1",
            profile={"has_ac": True},
        )
    assert status["can_go_online"] is True
    assert status["block_code"] is None
