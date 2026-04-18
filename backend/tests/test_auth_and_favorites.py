"""
Tests for JWT authentication flow and favorite drivers system.
Covers: token issuance, auth middleware rejection, favorite CRUD, preferred driver trips.
"""
import pytest
import requests
import os
import uuid

BASE_URL = (
    os.environ.get('NEXRYDE_BACKEND_URL')
    or os.environ.get('EXPO_PUBLIC_BACKEND_URL')
    or 'https://nexryde-backend-993913300770.us-central1.run.app'
).rstrip('/')

RUN_ID = str(uuid.uuid4())[:8]
RIDER_PHONE = f"+234812{RUN_ID[:7]}"
DRIVER_PHONE = f"+234813{RUN_ID[:7]}"


class TestAuthFlow:
    """JWT token issuance and middleware enforcement."""

    def test_public_endpoint_no_auth(self):
        r = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert r.status_code == 200

    def test_protected_endpoint_without_token_rejected(self):
        fake_id = f"fake_{RUN_ID}"
        r = requests.get(f"{BASE_URL}/api/users/{fake_id}", timeout=10)
        assert r.status_code == 401

    def test_protected_endpoint_rejected_with_bad_token(self):
        fake_id = f"fake_{RUN_ID}"
        r = requests.get(
            f"{BASE_URL}/api/users/{fake_id}",
            headers={"Authorization": "Bearer invalid_token_here"},
            timeout=10,
        )
        assert r.status_code == 401

    def test_register_returns_token(self):
        r = requests.post(f"{BASE_URL}/api/auth/register", json={
            "phone": RIDER_PHONE,
            "name": f"TestRider_{RUN_ID}",
            "role": "rider",
            "nin": "12345678901",
        }, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "token" in data, f"Register response missing token: {data.keys()}"
        assert data["token"] is not None
        self.__class__.rider_token = data["token"]
        self.__class__.rider_id = data["user"]["id"]

    def test_authenticated_request_succeeds(self):
        token = getattr(self.__class__, "rider_token", None)
        rider_id = getattr(self.__class__, "rider_id", None)
        if not token or not rider_id:
            pytest.skip("No token from registration")
        r = requests.get(
            f"{BASE_URL}/api/users/{rider_id}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        assert r.status_code == 200
        data = r.json()
        assert data.get("id") == rider_id


class TestFavoriteDrivers:
    """Favorite driver CRUD and preferred driver trip flow."""

    @classmethod
    def setup_class(cls):
        # Register a rider
        r = requests.post(f"{BASE_URL}/api/auth/register", json={
            "phone": f"+234814{RUN_ID[:7]}",
            "name": f"FavRider_{RUN_ID}",
            "role": "rider",
            "nin": "99988877766",
        }, timeout=15)
        data = r.json()
        cls.rider_id = data.get("user", {}).get("id", f"fav_rider_{RUN_ID}")
        cls.token = data.get("token", "")
        cls.headers = {"Authorization": f"Bearer {cls.token}"}

        # Register a driver
        r2 = requests.post(f"{BASE_URL}/api/auth/register", json={
            "phone": f"+234815{RUN_ID[:7]}",
            "name": f"FavDriver_{RUN_ID}",
            "role": "driver",
        }, timeout=15)
        data2 = r2.json()
        cls.driver_id = data2.get("user", {}).get("id", f"fav_driver_{RUN_ID}")
        cls.driver_token = data2.get("token", "")

    def test_add_favorite_driver(self):
        r = requests.post(
            f"{BASE_URL}/api/users/{self.rider_id}/favorite-drivers",
            json={"driver_id": self.driver_id},
            headers=self.headers,
            timeout=10,
        )
        assert r.status_code == 200
        assert "added" in r.json().get("message", "").lower()

    def test_check_favorite_driver(self):
        r = requests.get(
            f"{BASE_URL}/api/users/{self.rider_id}/favorite-drivers/{self.driver_id}/check",
            headers=self.headers,
            timeout=10,
        )
        assert r.status_code == 200
        assert r.json().get("is_favorite") is True

    def test_get_favorite_drivers_list(self):
        r = requests.get(
            f"{BASE_URL}/api/users/{self.rider_id}/favorite-drivers",
            headers=self.headers,
            timeout=10,
        )
        assert r.status_code == 200
        data = r.json()
        assert "favorite_drivers" in data

    def test_favorite_driver_has_online_status(self):
        r = requests.get(
            f"{BASE_URL}/api/users/{self.rider_id}/favorite-drivers",
            headers=self.headers,
            timeout=10,
        )
        drivers = r.json().get("favorite_drivers", [])
        if drivers:
            d = drivers[0]
            assert "is_online" in d, f"Missing is_online field: {d.keys()}"
            assert "total_trips" in d, f"Missing total_trips field: {d.keys()}"

    def test_trip_request_with_preferred_driver(self):
        r = requests.post(
            f"{BASE_URL}/api/trips/request?rider_id={self.rider_id}",
            json={
                "pickup_lat": 6.5244,
                "pickup_lng": 3.3792,
                "pickup_address": "Lagos Test Pickup",
                "dropoff_lat": 6.4541,
                "dropoff_lng": 3.3947,
                "dropoff_address": "Lagos Test Dropoff",
                "service_type": "economy",
                "preferred_driver_id": self.driver_id,
            },
            headers=self.headers,
            timeout=15,
        )
        assert r.status_code == 200
        trip = r.json().get("trip", {})
        assert trip.get("preferred_driver_id") == self.driver_id

    def test_remove_favorite_driver(self):
        r = requests.delete(
            f"{BASE_URL}/api/users/{self.rider_id}/favorite-drivers/{self.driver_id}",
            headers=self.headers,
            timeout=10,
        )
        assert r.status_code == 200

        r2 = requests.get(
            f"{BASE_URL}/api/users/{self.rider_id}/favorite-drivers/{self.driver_id}/check",
            headers=self.headers,
            timeout=10,
        )
        assert r2.json().get("is_favorite") is False


class TestAIEndpoints:
    """Verify all AI endpoints respond without crashing."""

    def test_rider_assistant(self):
        r = requests.get(f"{BASE_URL}/api/ai/rider-assistant?user_id=test&question=hello", timeout=10)
        assert r.status_code in (200, 401)

    def test_driver_assistant(self):
        r = requests.get(f"{BASE_URL}/api/ai/driver-assistant?user_id=test&question=hello", timeout=10)
        assert r.status_code in (200, 401)

    def test_earnings_predictor(self):
        r = requests.get(f"{BASE_URL}/api/ai/earnings-predictor/test?hours_to_drive=4", timeout=10)
        assert r.status_code in (200, 401)

    def test_fatigue_status(self):
        r = requests.get(f"{BASE_URL}/api/drivers/test/fatigue-status", timeout=10)
        assert r.status_code in (200, 401)
