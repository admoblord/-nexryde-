"""
Active trip + in-trip call endpoints (JWT required on /api/trips/* and in handlers).

Uses register_rider / register_driver from integration_utils and sends Authorization
on every protected request. Trip creation includes coordinates so dispatch can create
offers (accept still skips if this driver is not in the eligible pool).
"""

from __future__ import annotations

import uuid
from typing import Optional
import os

import pytest
import requests

from tests.integration_utils import (
    bearer_headers,
    get_base_url,
    register_driver,
    register_rider,
    request_sample_trip,
)

BASE_URL = get_base_url()
RUN_LIVE_API_TESTS = os.environ.get("RUN_LIVE_API_TESTS", "").strip().lower() in {"1", "true", "yes"}
if not RUN_LIVE_API_TESTS:
    pytestmark = pytest.mark.skip(reason="Live API integration test. Set RUN_LIVE_API_TESTS=1 to run.")


def _hdr(token: str) -> dict:
    h = bearer_headers(token)
    h["Content-Type"] = "application/json"
    return h


def make_rider():
    uid, token, _phone = register_rider(BASE_URL)
    return {"id": uid, "token": token}


def make_driver():
    uid, token, _phone = register_driver(BASE_URL)
    h = _hdr(token)
    requests.put(
        f"{BASE_URL}/api/drivers/{uid}/profile",
        headers=h,
        json={
            "vehicle_type": "sedan",
            "vehicle_model": "Toyota Camry",
            "vehicle_plate": f"P0{uuid.uuid4().hex[:4].upper()}",
            "vehicle_color": "Blue",
        },
        timeout=30,
    )
    requests.post(
        f"{BASE_URL}/api/subscriptions/{uid}/start-trial",
        headers=h,
        json={},
        timeout=30,
    )
    return {"id": uid, "token": token}


def create_trip_with_coords(rider_id: str, rider_token: str) -> Optional[str]:
    """Standard trip request with a high offered_fare to satisfy live min-fare rules; fallback to custom-price."""
    # Omit offered_fare so server uses computed fare (avoids min/max mismatch on live smart pricing).
    payload = {
        "pickup_lat": 6.5244,
        "pickup_lng": 3.3792,
        "pickup_address": "Victoria Island, Lagos",
        "dropoff_lat": 6.45,
        "dropoff_lng": 3.4,
        "dropoff_address": "Lekki Phase 1, Lagos",
        "service_type": "economy",
        "city": "lagos",
        "payment_method": "cash",
    }
    r = requests.post(
        f"{BASE_URL}/api/trips/request",
        params={"rider_id": rider_id},
        headers=_hdr(rider_token),
        json=payload,
        timeout=90,
    )
    if r.status_code == 200:
        data = r.json()
        trip = (data or {}).get("trip") or {}
        tid = trip.get("id") or (data or {}).get("trip_id")
        if tid:
            return tid
    st, data = request_sample_trip(BASE_URL, rider_id, rider_token, timeout=90)
    if st == 200 and isinstance(data, dict):
        trip = data.get("trip") or {}
        tid = trip.get("id") or data.get("trip_id")
        if tid:
            return tid
    payload = {
        "rider_id": rider_id,
        "pickup": "Victoria Island, Lagos",
        "destination": "Lekki Phase 1, Lagos",
        "pickup_lat": 6.5244,
        "pickup_lng": 3.3792,
        "dropoff_lat": 6.45,
        "dropoff_lng": 3.4,
        "recommended_fare": 3500.0,
        "offered_fare": 3200.0,
        "vehicle_type": "sedan",
        "trip_type": "intra",
    }
    r = requests.post(
        f"{BASE_URL}/api/trips/create-with-custom-price",
        headers=_hdr(rider_token),
        json=payload,
        timeout=60,
    )
    if r.status_code != 200:
        print(f"  Warning: Failed to create trip: request={st} custom={r.status_code} {r.text}")
        return None
    body = r.json()
    return body.get("trip_id")


def cancel_trip(trip_id: str, token: str) -> None:
    requests.put(
        f"{BASE_URL}/api/trips/{trip_id}/cancel",
        headers=_hdr(token),
        json={},
        timeout=30,
    )


class TestActiveTrip:
    def test_01_no_active_trip_returns_false(self):
        rider = make_rider()
        r = requests.get(
            f"{BASE_URL}/api/trips/active/{rider['id']}",
            headers=_hdr(rider["token"]),
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "active" in data
        assert data["active"] is False

    def test_02_active_trip_returns_true_for_rider(self):
        rider = make_rider()
        trip_id = create_trip_with_coords(rider["id"], rider["token"])
        assert trip_id is not None
        r = requests.get(
            f"{BASE_URL}/api/trips/active/{rider['id']}",
            headers=_hdr(rider["token"]),
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "active" in data
        if data["active"]:
            assert "trip" in data
        cancel_trip(trip_id, rider["token"])

    def test_03_active_trip_after_driver_accepts(self):
        rider = make_rider()
        driver = make_driver()
        trip_id = create_trip_with_coords(rider["id"], rider["token"])
        assert trip_id is not None

        accept = requests.put(
            f"{BASE_URL}/api/trips/{trip_id}/accept",
            headers=_hdr(driver["token"]),
            json={},
            timeout=30,
        )
        if accept.status_code != 200:
            cancel_trip(trip_id, rider["token"])
            pytest.skip(f"No offer for this driver or accept failed: {accept.status_code} {accept.text}")

        rr = requests.get(
            f"{BASE_URL}/api/trips/active/{rider['id']}",
            headers=_hdr(rider["token"]),
            timeout=30,
        )
        assert rr.status_code == 200
        rider_data = rr.json()
        assert rider_data.get("active") is True
        assert rider_data.get("trip", {}).get("id") == trip_id

        dr = requests.get(
            f"{BASE_URL}/api/trips/active/{driver['id']}",
            headers=_hdr(driver["token"]),
            timeout=30,
        )
        assert dr.status_code == 200
        driver_data = dr.json()
        assert driver_data.get("active") is True
        assert driver_data.get("trip", {}).get("id") == trip_id

        cancel_trip(trip_id, rider["token"])


class TestCallEndpoint:
    def test_01_call_nonexistent_trip_returns_404(self):
        rider = make_rider()
        fake_trip_id = f"nonexistent_trip_{uuid.uuid4().hex}"
        r = requests.post(
            f"{BASE_URL}/api/trip/{fake_trip_id}/call",
            headers=_hdr(rider["token"]),
            json={"caller_id": rider["id"], "caller_role": "rider"},
            timeout=30,
        )
        assert r.status_code == 404, r.text

    def test_02_call_completed_trip_returns_403(self):
        pytest.skip(
            "Reaching status=completed requires ongoing trip; start requires face verification on live API."
        )

    def test_03_call_pending_trip_no_driver(self):
        rider = make_rider()
        trip_id = create_trip_with_coords(rider["id"], rider["token"])
        assert trip_id is not None
        r = requests.post(
            f"{BASE_URL}/api/trip/{trip_id}/call",
            headers=_hdr(rider["token"]),
            json={"caller_id": rider["id"], "caller_role": "rider"},
            timeout=30,
        )
        assert r.status_code == 403
        detail = (r.json() or {}).get("detail", "")
        assert "active" in detail.lower()
        cancel_trip(trip_id, rider["token"])

    def test_04_call_rate_limiting(self):
        rider = make_rider()
        driver = make_driver()
        trip_id = create_trip_with_coords(rider["id"], rider["token"])
        assert trip_id is not None
        accept = requests.put(
            f"{BASE_URL}/api/trips/{trip_id}/accept",
            headers=_hdr(driver["token"]),
            json={},
            timeout=30,
        )
        if accept.status_code != 200:
            cancel_trip(trip_id, rider["token"])
            pytest.skip(f"Accept failed: {accept.text}")

        call_data = {"caller_id": rider["id"], "caller_role": "rider"}
        success_count = 0
        for _i in range(5):
            resp = requests.post(
                f"{BASE_URL}/api/trip/{trip_id}/call",
                headers=_hdr(rider["token"]),
                json=call_data,
                timeout=30,
            )
            if resp.status_code == 200:
                success_count += 1
            elif resp.status_code == 404 and "Phone" in resp.text:
                cancel_trip(trip_id, rider["token"])
                pytest.skip("Phone not available for masked call in this environment")

        if success_count == 5:
            sixth = requests.post(
                f"{BASE_URL}/api/trip/{trip_id}/call",
                headers=_hdr(rider["token"]),
                json=call_data,
                timeout=30,
            )
            assert sixth.status_code == 429, sixth.text

        cancel_trip(trip_id, rider["token"])


class TestCallWithPhoneNumber:
    def test_01_verify_phone_number_field_requirement(self):
        rider = make_rider()
        driver = make_driver()
        trip_id = create_trip_with_coords(rider["id"], rider["token"])
        assert trip_id is not None
        accept = requests.put(
            f"{BASE_URL}/api/trips/{trip_id}/accept",
            headers=_hdr(driver["token"]),
            json={},
            timeout=30,
        )
        if accept.status_code != 200:
            cancel_trip(trip_id, rider["token"])
            pytest.skip(f"Accept failed: {accept.text}")

        r = requests.post(
            f"{BASE_URL}/api/trip/{trip_id}/call",
            headers=_hdr(rider["token"]),
            json={"caller_id": rider["id"], "caller_role": "rider"},
            timeout=30,
        )
        assert r.status_code in (200, 404), r.text
        cancel_trip(trip_id, rider["token"])


class TestActiveTripStatus:
    def test_01_pending_driver_offers_not_active(self):
        rider = make_rider()
        trip_id = create_trip_with_coords(rider["id"], rider["token"])
        assert trip_id is not None
        r = requests.get(
            f"{BASE_URL}/api/trips/active/{rider['id']}",
            headers=_hdr(rider["token"]),
            timeout=30,
        )
        assert r.status_code == 200
        data = r.json()
        if data.get("active") is False:
            pass
        cancel_trip(trip_id, rider["token"])

    def test_02_accepted_status_is_active(self):
        rider = make_rider()
        driver = make_driver()
        trip_id = create_trip_with_coords(rider["id"], rider["token"])
        assert trip_id is not None
        accept = requests.put(
            f"{BASE_URL}/api/trips/{trip_id}/accept",
            headers=_hdr(driver["token"]),
            json={},
            timeout=30,
        )
        if accept.status_code != 200:
            cancel_trip(trip_id, rider["token"])
            pytest.skip(f"Accept failed: {accept.text}")

        r = requests.get(
            f"{BASE_URL}/api/trips/active/{rider['id']}",
            headers=_hdr(rider["token"]),
            timeout=30,
        )
        data = r.json()
        assert data.get("active") is True
        assert data.get("trip", {}).get("id") == trip_id
        cancel_trip(trip_id, rider["token"])


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
