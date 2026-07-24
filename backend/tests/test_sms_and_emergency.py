"""SMS normalize + emergency message builder."""
from __future__ import annotations

import asyncio

from emergency_notify import build_emergency_sms, notify_emergency_contacts
from sms_service import normalize_ng_phone


def test_normalize_ng_phone():
    assert normalize_ng_phone("08012345678") == "2348012345678"
    assert normalize_ng_phone("+2348012345678") == "2348012345678"
    assert normalize_ng_phone("8012345678") == "2348012345678"


def test_build_emergency_sms():
    msg = build_emergency_sms(
        user_name="Ada",
        role="rider",
        trip_id="t1",
        lat=6.5,
        lng=3.3,
        reason="SOS",
    )
    assert "Ada" in msg
    assert "t1" in msg
    assert "6.5" in msg


def test_notify_contacts_mock(monkeypatch):
    monkeypatch.setenv("SMS_PROVIDER", "mock")
    sent = asyncio.run(
        notify_emergency_contacts(
            [{"phone": "08012345678", "name": "Mum"}],
            user_name="Ada",
            role="rider",
            trip_id="t9",
            lat=6.4,
            lng=3.4,
            reason="SOS",
        )
    )
    assert sent == 1
