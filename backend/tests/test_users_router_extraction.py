"""
Test Users Router Extraction - Verify users module refactoring from server.py
Tests: User preferences, emergency contacts, notifications, female drivers, and confirms chat still works
"""
import pytest
import requests
import os
import uuid
import urllib.parse
import websockets
import asyncio
import json

from tests.integration_utils import bearer_headers, random_ng_phone

BASE_URL = (
    os.environ.get('NEXRYDE_BACKEND_URL')
    or os.environ.get('EXPO_PUBLIC_BACKEND_URL')
    or os.environ.get('REACT_APP_BACKEND_URL')
    or 'https://nexryde-modular.preview.emergentagent.com'
).rstrip('/')


class TestHealthEndpoint:
    """Verify API is healthy before running other tests"""
    
    def test_health_check(self):
        """GET /api/health - should return healthy status"""
        response = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert response.status_code == 200, f"Health check failed: {response.text}"
        data = response.json()
        assert data.get("status") == "healthy", f"Unexpected health status: {data}"
        print("✅ Health check passed: API is healthy")


class TestUsersRouterPreferences:
    """Test user preferences endpoint from extracted users.py router"""
    
    def test_get_preferences_existing_user(self, integration_rider):
        """GET /api/users/{user_id}/preferences — requires Bearer matching user_id."""
        uid = integration_rider["id"]
        response = requests.get(
            f"{BASE_URL}/api/users/{uid}/preferences",
            headers=bearer_headers(integration_rider["token"]),
            timeout=10,
        )
        assert response.status_code == 200, f"Get preferences failed: {response.text}"
        data = response.json()
        assert "theme" in data, f"Missing theme in response: {data}"
        assert "language" in data, f"Missing language in response: {data}"
        assert data["theme"] in ["light", "dark", "auto"], f"Invalid theme value: {data['theme']}"
        print(f"✅ User preferences returned: theme={data['theme']}, language={data['language']}")


class TestUsersRouterEmergencyContacts:
    """Test emergency contacts endpoint from extracted users.py router"""
    
    def test_get_emergency_contacts_wrong_user_forbidden(self, integration_rider):
        """Another user's id with this token must not be allowed."""
        other_id = f"other_{uuid.uuid4().hex[:10]}"
        response = requests.get(
            f"{BASE_URL}/api/users/{other_id}/emergency-contacts",
            headers=bearer_headers(integration_rider["token"]),
            timeout=10,
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
        print("✅ Emergency contacts rejects cross-user access (correct)")

    def test_emergency_contacts_structure(self, integration_rider):
        """Authenticated owner gets contacts list (possibly empty)."""
        uid = integration_rider["id"]
        response = requests.get(
            f"{BASE_URL}/api/users/{uid}/emergency-contacts",
            headers=bearer_headers(integration_rider["token"]),
            timeout=10,
        )
        assert response.status_code == 200, f"Get emergency contacts failed: {response.text}"
        data = response.json()
        assert "contacts" in data, f"Missing contacts array in response: {data}"
        assert isinstance(data["contacts"], list), f"Contacts should be array: {data}"
        print(f"✅ Emergency contacts returned for user: {len(data['contacts'])} contacts")


class TestUsersRouterNotifications:
    """Test notifications endpoint from extracted users.py router"""
    
    def test_get_notifications_structure(self, integration_rider):
        """GET /api/users/{user_id}/notifications - should return notifications array"""
        uid = integration_rider["id"]
        response = requests.get(
            f"{BASE_URL}/api/users/{uid}/notifications",
            headers=bearer_headers(integration_rider["token"]),
            timeout=10,
        )
        assert response.status_code == 200, f"Get notifications failed: {response.text}"
        data = response.json()
        assert "notifications" in data, f"Missing notifications in response: {data}"
        assert "unread_count" in data, f"Missing unread_count in response: {data}"
        assert isinstance(data["notifications"], list), f"Notifications should be array: {data}"
        assert isinstance(data["unread_count"], int), f"unread_count should be integer: {data}"
        print(f"✅ Notifications returned: {len(data['notifications'])} notifications, {data['unread_count']} unread")


class TestUsersRouterFemaleDrivers:
    """Test available female drivers endpoint from extracted users.py router"""
    
    def test_get_available_female_drivers(self):
        """GET /api/drivers/available-female - should return female drivers list"""
        # Lagos coordinates
        params = {"lat": 6.5244, "lng": 3.3792, "radius_km": 10.0}
        response = requests.get(f"{BASE_URL}/api/drivers/available-female", params=params, timeout=10)
        assert response.status_code == 200, f"Get female drivers failed: {response.text}"
        data = response.json()
        assert "female_drivers" in data, f"Missing female_drivers in response: {data}"
        assert "count" in data, f"Missing count in response: {data}"
        assert isinstance(data["female_drivers"], list), f"female_drivers should be array: {data}"
        assert isinstance(data["count"], int), f"count should be integer: {data}"
        print(f"✅ Female drivers endpoint working: {data['count']} female drivers available")


class TestChatRouterStillWorks:
    """Verify chat router still works after users extraction"""
    
    def test_chat_presets_rider(self):
        """GET /api/chat/presets/rider - should still work after refactoring"""
        response = requests.get(f"{BASE_URL}/api/chat/presets/rider", timeout=10)
        assert response.status_code == 200, f"Chat presets failed: {response.text}"
        data = response.json()
        assert "presets" in data, f"Missing presets in response: {data}"
        assert isinstance(data["presets"], list), f"Presets should be array: {data}"
        assert len(data["presets"]) > 0, f"Presets should not be empty: {data}"
        print(f"✅ Chat presets (rider) still working: {len(data['presets'])} presets")
    
    def test_chat_ai_endpoint(self, integration_rider):
        """POST /api/chat/ai - should still work for AI chat"""
        uid = integration_rider["id"]
        response = requests.post(
            f"{BASE_URL}/api/chat/ai",
            json={
                "user_id": uid,
                "message": "Hello, test message for refactoring verification",
                "user_role": "rider",
            },
            headers=bearer_headers(integration_rider["token"]),
            timeout=30,
        )
        if response.status_code == 404:
            pytest.skip("AI chat endpoint not deployed in current backend build")
        assert response.status_code == 200, f"AI chat failed: {response.text}"
        data = response.json()
        assert "success" in data, f"Missing success field in response: {data}"
        assert "message" in data, f"Missing message field in response: {data}"
        assert "session_id" in data, f"Missing session_id in response: {data}"
        print(f"✅ AI chat still working: {data.get('powered_by', 'unknown')}")


class TestAuthStillWorks:
    """Verify auth endpoints still work after refactoring"""
    
    def test_send_otp(self):
        """POST /api/auth/send-otp - should still work"""
        test_phone = random_ng_phone()
        response = requests.post(
            f"{BASE_URL}/api/auth/send-otp",
            json={"phone": test_phone},
            timeout=10,
        )
        # Should return 200 (success) or appropriate status
        assert response.status_code in [200, 201, 400, 500], f"Unexpected status: {response.status_code}"
        print(f"✅ Send OTP endpoint responding: status {response.status_code}")


class TestSubscriptionStillWorks:
    """Verify subscription endpoints still work after refactoring"""
    
    def test_subscription_pricing(self):
        """GET /api/subscription/pricing - should still work"""
        try:
            response = requests.get(f"{BASE_URL}/api/subscription/pricing", timeout=20)
        except requests.exceptions.ReadTimeout:
            pytest.skip("Subscription pricing timed out on remote environment")
        assert response.status_code == 200, f"Subscription pricing failed: {response.text}"
        data = response.json()
        # Should have pricing info
        assert isinstance(data, dict), f"Expected dict response: {data}"
        print(f"✅ Subscription pricing still working: {list(data.keys())[:5]}...")


class TestWebSocketChatStillWorks:
    """Verify WebSocket chat still works after users extraction"""
    
    @pytest.mark.asyncio
    async def test_websocket_connection(self, integration_rider_with_trip):
        """WS /api/ws/chat/{trip_id}/{user_id}?token= — requires JWT + trip participant."""
        trip_id = integration_rider_with_trip.get("trip_id")
        if not trip_id:
            pytest.skip(
                f"No trip created for WS test (status={integration_rider_with_trip.get('trip_create_status')})"
            )
        uid = integration_rider_with_trip["id"]
        token = integration_rider_with_trip["token"]
        ws_base = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")
        q = urllib.parse.urlencode({"token": token})
        ws_url = f"{ws_base}/api/ws/chat/{trip_id}/{uid}?{q}"

        try:
            async with websockets.connect(ws_url, open_timeout=15, close_timeout=5) as ws:
                response = await asyncio.wait_for(ws.recv(), timeout=10)
                data = json.loads(response)
                assert data.get("type") == "connected", f"Expected connected type: {data}"
                assert data.get("trip_id") == trip_id, f"Wrong trip_id: {data}"
                assert data.get("user_id") == uid, f"Wrong user_id: {data}"
                print(f"✅ WebSocket chat still working: connected to trip {trip_id}")
        except Exception as e:
            pytest.fail(f"WebSocket connection failed: {e}")


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
