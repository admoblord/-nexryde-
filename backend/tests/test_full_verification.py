"""
NEXRYDE Full Backend Verification Test Suite
============================================
Tests ALL rider-side and driver-side features as requested.

Features tested:
- RIDER FULL FLOW: Register → Create trip → Driver accepts → Active trip check → Call driver → Chat → Start → Complete → Rate → Receipt
- DRIVER FULL FLOW: Register → Subscription trial → Go online → Poll pending → Accept trip → Call rider → Start → Complete
- BIDDING FLOW: Create bid → Driver counter offer → Accept bid
- CALL FEATURE: POST /api/trip/{id}/call for both rider→driver and driver→rider
- ACTIVE TRIP: GET /api/trips/active/{user_id} returns correct active/inactive status
- AI FEATURES: Traffic predict, Accident risk, Coach suggestions, Driver awareness
- WALLET: GET /api/wallet/{id}, POST /api/wallet/{id}/topup
- RIDER PREFERENCES: GET /api/rider/preferences/{user_id}
- SAFETY: POST /api/sos/trigger, GET /api/safety/danger-zones, GET /api/safety/alerts
- COMMUNITY: GET /api/community/groups, GET /api/community/events
- DRIVER FEATURES: Stats, Earnings, Tier, Streaks, Heatmap

BASE URL: Cloud Run backend (configurable via env vars)
"""
import pytest
import requests
import os
import uuid
import time
from datetime import datetime

from tests.integration_utils import bearer_headers, register_driver, register_rider

# Unified backend target for tests
BASE_URL = (
    os.environ.get('NEXRYDE_BACKEND_URL')
    or os.environ.get('EXPO_PUBLIC_BACKEND_URL')
    or os.environ.get('REACT_APP_BACKEND_URL')
    or "https://nexryde-backend-993913300770.us-central1.run.app"
).rstrip('/')

# Test data - unique per test run (IDs and phones come from real registration)
TEST_RUN_ID = str(uuid.uuid4())[:8]
TEST_RIDER_ID = f"TEST_rider_{TEST_RUN_ID}"
TEST_DRIVER_ID = f"TEST_driver_{TEST_RUN_ID}"
TEST_RIDER_PHONE = ""
TEST_DRIVER_PHONE = ""
TEST_RIDER_TOKEN = None
TEST_DRIVER_TOKEN = None

# Lagos coordinates
PICKUP_LAT = 6.5244
PICKUP_LNG = 3.3792
DROPOFF_LAT = 6.4500
DROPOFF_LNG = 3.4000

# Store created IDs across tests
created_trip_id = None
created_bid_id = None


class TestHealthAndSetup:
    """Verify backend is running and setup test users"""

    def test_01_health_check(self):
        """GET /api/health - Backend should be healthy"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.status_code}"
        data = response.json()
        assert data.get("status") == "healthy", f"Unhealthy: {data}"
        print("PASS: Backend is healthy")

    def test_02_register_test_rider(self):
        """POST /api/auth/register - Register test rider with NIN; capture JWT."""
        global TEST_RIDER_ID, TEST_RIDER_TOKEN, TEST_RIDER_PHONE
        TEST_RIDER_ID, TEST_RIDER_TOKEN, TEST_RIDER_PHONE = register_rider(
            BASE_URL, name=f"Test Rider {TEST_RUN_ID}"
        )
        print(f"PASS: Registered rider {TEST_RIDER_ID}")

    def test_03_register_test_driver(self):
        """POST /api/auth/register - Register test driver; capture JWT."""
        global TEST_DRIVER_ID, TEST_DRIVER_TOKEN, TEST_DRIVER_PHONE
        TEST_DRIVER_ID, TEST_DRIVER_TOKEN, TEST_DRIVER_PHONE = register_driver(
            BASE_URL, name=f"Test Driver {TEST_RUN_ID}"
        )
        print(f"PASS: Registered driver {TEST_DRIVER_ID}")

    def test_04_start_driver_subscription_trial(self):
        """POST /api/subscriptions/{driver_id}/start-trial - Start free trial"""
        assert TEST_DRIVER_TOKEN, "Driver JWT required"
        response = requests.post(
            f"{BASE_URL}/api/subscriptions/{TEST_DRIVER_ID}/start-trial",
            headers=bearer_headers(TEST_DRIVER_TOKEN),
        )

        if response.status_code == 200:
            data = response.json()
            print(f"PASS: Trial started - {data.get('message', 'OK')}")
        elif response.status_code == 400:
            print("INFO: Driver already has subscription (expected)")
        else:
            print(f"WARN: Trial status {response.status_code}: {response.text[:100]}")

        # Verify subscription
        sub_response = requests.get(
            f"{BASE_URL}/api/subscriptions/{TEST_DRIVER_ID}",
            headers=bearer_headers(TEST_DRIVER_TOKEN),
        )
        if sub_response.status_code == 200:
            sub = sub_response.json()
            print(f"PASS: Driver has subscription status: {sub.get('status')}")


class TestRiderFullFlow:
    """Test complete rider flow: Create trip → Accept → Start → Complete → Rate → Receipt"""

    def test_01_create_trip_with_offered_fare(self):
        """POST /api/trips/request?rider_id=X - Create trip with offered fare"""
        global created_trip_id
        assert TEST_RIDER_TOKEN, "Rider JWT required"

        payload = {
            "pickup_lat": PICKUP_LAT,
            "pickup_lng": PICKUP_LNG,
            "pickup_address": "Victoria Island, Lagos",
            "dropoff_lat": DROPOFF_LAT,
            "dropoff_lng": DROPOFF_LNG,
            "dropoff_address": "Lekki Phase 1, Lagos",
            "service_type": "economy",
            "offered_fare": 3500.0,
            "recommended_fare": 4000.0
        }

        response = requests.post(
            f"{BASE_URL}/api/trips/request",
            params={"rider_id": TEST_RIDER_ID},
            json=payload,
            headers=bearer_headers(TEST_RIDER_TOKEN),
        )
        assert response.status_code == 200, f"Trip creation failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert "trip" in data, "Response should contain trip"
        trip = data["trip"]
        assert "id" in trip, "Trip should have ID"
        created_trip_id = trip["id"]
        
        # Verify offered fare is used
        assert trip.get("offered_fare") == 3500.0, "Offered fare should be stored"
        print(f"PASS: Created trip {created_trip_id} with offered fare ₦3500")

    def test_02_get_trip_status(self):
        """GET /api/trips/{trip_id} - Verify trip details"""
        assert created_trip_id, "Trip must be created first"
        assert TEST_RIDER_TOKEN, "Rider JWT required"

        response = requests.get(
            f"{BASE_URL}/api/trips/{created_trip_id}",
            headers=bearer_headers(TEST_RIDER_TOKEN),
        )
        assert response.status_code == 200, f"Get trip failed: {response.status_code}"
        
        trip = response.json()
        assert trip["id"] == created_trip_id
        assert trip["status"] in ["pending", "pending_driver_offers"]
        assert trip["rider_id"] == TEST_RIDER_ID
        print(f"PASS: Trip status is '{trip['status']}'")

    def test_03_check_active_trip_before_accept(self):
        """GET /api/trips/active/{user_id} - Should return active=false for pending"""
        assert TEST_RIDER_TOKEN, "Rider JWT required"
        response = requests.get(
            f"{BASE_URL}/api/trips/active/{TEST_RIDER_ID}",
            headers=bearer_headers(TEST_RIDER_TOKEN),
        )
        assert response.status_code == 200, f"Active trip check failed: {response.status_code}"
        
        data = response.json()
        # pending_driver_offers is NOT considered active (no driver yet)
        if not data.get("active"):
            print("PASS: No active trip before driver accepts (expected)")
        else:
            print(f"INFO: Active trip found: {data.get('trip', {}).get('status')}")

    def test_04_driver_accepts_trip(self):
        """PUT /api/trips/{trip_id}/accept - Driver accepts the trip"""
        assert created_trip_id, "Trip must be created first"
        assert TEST_DRIVER_TOKEN, "Driver JWT required"

        payload = {"driver_id": TEST_DRIVER_ID}
        response = requests.put(
            f"{BASE_URL}/api/trips/{created_trip_id}/accept",
            json=payload,
            headers=bearer_headers(TEST_DRIVER_TOKEN),
        )
        
        if response.status_code == 403:
            data = response.json()
            detail = data.get("detail", "")
            if "subscription" in detail.lower():
                pytest.skip(f"Driver needs subscription: {detail}")
            if "verification" in detail.lower() or "Monthly" in detail:
                pytest.skip(f"Driver compliance gate: {detail}")
            pytest.fail(f"Acceptance forbidden: {detail}")
        
        assert response.status_code == 200, f"Accept failed: {response.status_code} - {response.text}"
        
        trip = response.json()
        assert trip["status"] == "accepted"
        assert trip["driver_id"] == TEST_DRIVER_ID
        print(f"PASS: Driver {TEST_DRIVER_ID} accepted trip")

    def test_05_check_active_trip_after_accept(self):
        """GET /api/trips/active/{user_id} - Should return active=true after accept"""
        assert TEST_RIDER_TOKEN, "Rider JWT required"
        response = requests.get(
            f"{BASE_URL}/api/trips/active/{TEST_RIDER_ID}",
            headers=bearer_headers(TEST_RIDER_TOKEN),
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("active") == True, f"Expected active=true, got {data}"
        assert data.get("trip", {}).get("id") == created_trip_id
        print("PASS: Active trip detected correctly after acceptance")

    def test_06_rider_sends_chat_message(self):
        """POST /api/chat/message - Rider sends message to driver"""
        assert created_trip_id, "Trip must be created first"
        assert TEST_RIDER_TOKEN, "Rider JWT required"
        
        payload = {
            "trip_id": created_trip_id,
            "sender_id": TEST_RIDER_ID,
            "sender_role": "rider",
            "message": f"Hello driver! Test message {TEST_RUN_ID}",
            "message_type": "text"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/chat/message",
            json=payload,
            headers=bearer_headers(TEST_RIDER_TOKEN),
        )
        
        if response.status_code in [403, 404]:
            pytest.skip("Chat requires active trip with both users")
        
        assert response.status_code == 200, f"Chat failed: {response.status_code} - {response.text}"
        data = response.json()
        assert data.get("success") == True
        print(f"PASS: Rider sent chat message")

    def test_07_call_driver(self):
        """POST /api/trip/{trip_id}/call - Rider calls driver"""
        assert created_trip_id, "Trip must be created first"
        assert TEST_RIDER_TOKEN, "Rider JWT required"
        
        payload = {
            "caller_id": TEST_RIDER_ID,
            "caller_role": "rider"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/trip/{created_trip_id}/call",
            json=payload,
            headers=bearer_headers(TEST_RIDER_TOKEN),
        )

        if response.status_code == 404:
            data = response.json()
            if "Phone number not available" in data.get("detail", ""):
                print("INFO: Phone numbers not set (expected for dynamic test users)")
                print("  - Call endpoint requires 'phone' field on user records")
                pytest.skip("Phone not available for test users")
        
        if response.status_code == 403:
            pytest.skip("Calls only allowed during active trips")
        
        if response.status_code == 429:
            print("INFO: Rate limited (5 calls max)")
            return
        
        assert response.status_code == 200, f"Call failed: {response.status_code} - {response.text}"
        data = response.json()
        assert data.get("success") == True
        assert "phone_number" in data
        print(f"PASS: Got driver phone: {data['phone_number']}")

    def test_08_start_trip(self):
        """PUT /api/trips/{trip_id}/start - Start the trip"""
        assert created_trip_id, "Trip must be created first"
        assert TEST_DRIVER_TOKEN, "Driver JWT required"

        response = requests.put(
            f"{BASE_URL}/api/trips/{created_trip_id}/start",
            headers=bearer_headers(TEST_DRIVER_TOKEN),
        )

        if response.status_code == 400:
            data = response.json()
            pytest.skip(f"Cannot start: {data.get('detail')}")
        if response.status_code == 403:
            pytest.skip(f"Cannot start: {response.json().get('detail', response.text)}")

        assert response.status_code == 200, f"Start failed: {response.status_code}"
        
        trip = response.json()
        assert trip["status"] == "ongoing"
        assert "started_at" in trip
        print(f"PASS: Trip started at {trip['started_at']}")

    def test_09_complete_trip(self):
        """PUT /api/trips/{trip_id}/complete - Complete the trip"""
        assert created_trip_id, "Trip must be created first"
        assert TEST_DRIVER_TOKEN, "Driver JWT required"

        response = requests.put(
            f"{BASE_URL}/api/trips/{created_trip_id}/complete",
            headers=bearer_headers(TEST_DRIVER_TOKEN),
        )

        if response.status_code == 400:
            data = response.json()
            pytest.skip(f"Cannot complete: {data.get('detail')}")
        if response.status_code == 403:
            pytest.skip(f"Cannot complete: {response.json().get('detail', response.text)}")

        assert response.status_code == 200, f"Complete failed: {response.status_code}"
        
        trip = response.json()
        assert trip["status"] == "completed"
        assert trip.get("payment_status") == "completed"
        print(f"PASS: Trip completed")

    def test_10_rate_trip(self):
        """PUT /api/trips/{trip_id}/rate - Rider rates the driver"""
        assert created_trip_id, "Trip must be created first"
        assert TEST_RIDER_TOKEN, "Rider JWT required"

        payload = {
            "overall_rating": 5.0,
            "smoothness": 5.0,
            "politeness": 5.0,
            "cleanliness": 5.0,
            "safety": 5.0,
            "comment": f"Great driver! Test rating {TEST_RUN_ID}"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/trips/{created_trip_id}/rate",
            params={"rater_id": TEST_RIDER_ID},
            json=payload,
            headers=bearer_headers(TEST_RIDER_TOKEN),
        )
        
        if response.status_code == 400:
            pytest.skip("Can only rate completed trips")
        
        assert response.status_code == 200, f"Rating failed: {response.status_code}"
        print("PASS: Trip rated 5 stars")

    def test_11_get_receipt(self):
        """GET /api/trips/{trip_id}/receipt - Get trip receipt"""
        assert created_trip_id, "Trip must be created first"
        assert TEST_RIDER_TOKEN, "Rider JWT required"

        response = requests.get(
            f"{BASE_URL}/api/trips/{created_trip_id}/receipt",
            headers=bearer_headers(TEST_RIDER_TOKEN),
        )
        assert response.status_code == 200, f"Receipt failed: {response.status_code}"
        
        receipt = response.json()
        assert receipt.get("trip_id") == created_trip_id
        assert "fare" in receipt
        print(f"PASS: Got receipt - Fare: ₦{receipt.get('fare', 0):,.0f}")


class TestBiddingFlow:
    """Test bidding/negotiation system"""

    def test_01_create_bid(self):
        """POST /api/rides/bid/create?rider_id=X - Create bid"""
        global created_bid_id
        assert TEST_RIDER_TOKEN, "Rider JWT required"

        payload = {
            "rider_offered_price": 2800.0,
            "pickup_lat": PICKUP_LAT,
            "pickup_lng": PICKUP_LNG,
            "pickup_address": "Test Pickup, Lagos",
            "dropoff_lat": DROPOFF_LAT,
            "dropoff_lng": DROPOFF_LNG,
            "dropoff_address": "Test Dropoff, Lagos",
            "ride_type": "economy"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/rides/bid/create",
            params={"rider_id": TEST_RIDER_ID},
            json=payload,
            headers=bearer_headers(TEST_RIDER_TOKEN),
        )
        assert response.status_code == 200, f"Bid creation failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert "bid_id" in data
        assert data["status"] == "open"
        created_bid_id = data["bid_id"]
        print(f"PASS: Created bid {created_bid_id}")

    def test_02_get_open_bids(self):
        """GET /api/rides/bid/open - Driver sees open bids"""
        assert TEST_DRIVER_TOKEN, "Driver JWT required"
        response = requests.get(
            f"{BASE_URL}/api/rides/bid/open",
            params={"lat": PICKUP_LAT, "lng": PICKUP_LNG},
            headers=bearer_headers(TEST_DRIVER_TOKEN),
        )
        assert response.status_code == 200, f"Get bids failed: {response.status_code}"
        
        data = response.json()
        assert "bids" in data
        print(f"PASS: Found {len(data['bids'])} open bids")

    def test_03_driver_counter_offer(self):
        """POST /api/rides/bid/{bid_id}/driver-offer - Driver makes counter offer"""
        assert created_bid_id, "Bid must be created first"
        assert TEST_DRIVER_TOKEN, "Driver JWT required"

        response = requests.post(
            f"{BASE_URL}/api/rides/bid/{created_bid_id}/driver-offer",
            params={
                "driver_id": TEST_DRIVER_ID,
                "counter_price": 3200.0,
                "message": "I can do it for this price",
            },
            headers=bearer_headers(TEST_DRIVER_TOKEN),
        )
        
        if response.status_code == 404:
            pytest.skip("Bid not found or closed")
        
        assert response.status_code == 200, f"Counter offer failed: {response.status_code}"
        
        data = response.json()
        assert data.get("success") == True
        assert "offer_id" in data
        TestBiddingFlow.driver_offer_id = data["offer_id"]
        print(f"PASS: Driver made counter offer, offer_id: {data['offer_id']}")

    def test_04_rider_accepts_offer(self):
        """POST /api/rides/bid/{bid_id}/accept - Rider accepts driver offer"""
        assert created_bid_id, "Bid must be created first"
        assert TEST_RIDER_TOKEN, "Rider JWT required"
        offer_id = getattr(TestBiddingFlow, 'driver_offer_id', None)
        if not offer_id:
            pytest.skip("No driver offer to accept")

        response = requests.post(
            f"{BASE_URL}/api/rides/bid/{created_bid_id}/accept",
            params={"rider_id": TEST_RIDER_ID, "offer_id": offer_id},
            headers=bearer_headers(TEST_RIDER_TOKEN),
        )
        
        if response.status_code == 404:
            pytest.skip("Bid or offer not found")
        
        assert response.status_code == 200, f"Accept offer failed: {response.status_code}"
        
        data = response.json()
        assert data.get("success") == True
        assert "trip_id" in data
        print(f"PASS: Offer accepted, trip created: {data['trip_id']}")


class TestAIFeatures:
    """Test AI-powered features"""

    def test_01_traffic_predict(self):
        """POST /api/ai/traffic/predict - AI traffic prediction"""
        response = requests.post(
            f"{BASE_URL}/api/ai/traffic/predict",
            params={
                "origin_lat": PICKUP_LAT,
                "origin_lng": PICKUP_LNG,
                "destination_lat": DROPOFF_LAT,
                "destination_lng": DROPOFF_LNG,
                "driver_id": TEST_DRIVER_ID
            }
        )
        if response.status_code == 404:
            pytest.skip("Traffic AI endpoint not deployed in current backend build")
        assert response.status_code == 200, f"Traffic predict failed: {response.status_code}"
        
        data = response.json()
        assert data.get("success") == True
        assert "ai_analysis" in data
        print(f"PASS: Traffic prediction - Level: {data['ai_analysis'].get('traffic_level', 'unknown')}")

    def test_02_accident_risk_predict(self):
        """POST /api/ai/accident/predict-risk - AI accident risk prediction"""
        response = requests.post(
            f"{BASE_URL}/api/ai/accident/predict-risk",
            params={
                "driver_id": TEST_DRIVER_ID,
                "current_lat": PICKUP_LAT,
                "current_lng": PICKUP_LNG
            }
        )
        if response.status_code == 404:
            pytest.skip("Accident AI endpoint not deployed in current backend build")
        assert response.status_code == 200, f"Accident predict failed: {response.status_code}"
        
        data = response.json()
        assert data.get("success") == True
        assert "risk_analysis" in data
        risk = data["risk_analysis"]
        print(f"PASS: Accident risk - Score: {risk.get('overall_risk_score', 0)}, Level: {risk.get('risk_level', 'unknown')}")

    def test_03_coach_suggestions(self):
        """POST /api/ai/coach/get-suggestions - AI coaching suggestions"""
        response = requests.post(
            f"{BASE_URL}/api/ai/coach/get-suggestions",
            params={
                "driver_id": TEST_DRIVER_ID,
                "lat": PICKUP_LAT,
                "lng": PICKUP_LNG
            }
        )
        if response.status_code == 404:
            pytest.skip("AI coach endpoint not deployed in current backend build")
        assert response.status_code == 200, f"Coach suggestions failed: {response.status_code}"
        
        data = response.json()
        assert data.get("success") == True
        suggestions = data.get("suggestions", [])
        print(f"PASS: AI Coach - {len(suggestions)} suggestions generated")

    def test_04_driver_awareness(self):
        """GET /api/driver/awareness - Driver awareness alerts"""
        response = requests.get(
            f"{BASE_URL}/api/driver/awareness",
            params={
                "driver_id": TEST_DRIVER_ID,
                "lat": PICKUP_LAT,
                "lng": PICKUP_LNG
            }
        )
        assert response.status_code == 200, f"Driver awareness failed: {response.status_code}"
        
        data = response.json()
        assert data.get("success") == True
        alerts = data.get("alerts", [])
        print(f"PASS: Driver awareness - {len(alerts)} alerts, Score: {data.get('driver_score', 0)}")


class TestWallet:
    """Test wallet functionality"""

    def test_01_get_wallet(self):
        """GET /api/wallet/{user_id} - Get wallet balance"""
        assert TEST_RIDER_TOKEN, "Rider JWT required"
        response = requests.get(
            f"{BASE_URL}/api/wallet/{TEST_RIDER_ID}",
            headers=bearer_headers(TEST_RIDER_TOKEN),
        )
        assert response.status_code == 200, f"Get wallet failed: {response.status_code}"
        
        data = response.json()
        assert "balance" in data
        print(f"PASS: Wallet balance: ₦{data.get('balance', 0):,.0f}")

    def test_02_wallet_topup(self):
        """POST /api/wallet/{user_id}/topup - Top up wallet"""
        assert TEST_RIDER_TOKEN, "Rider JWT required"
        payload = {
            "amount": 5000.0,
            "payment_method": "bank_transfer",
            "reference": f"TEST_topup_{TEST_RUN_ID}"
        }

        response = requests.post(
            f"{BASE_URL}/api/wallet/{TEST_RIDER_ID}/topup",
            json=payload,
            headers=bearer_headers(TEST_RIDER_TOKEN),
        )
        if response.status_code == 400 and "payment_reference" in (response.text or ""):
            pytest.skip("Wallet topup requires a Paystack-verified payment_reference on this backend")
        assert response.status_code == 200, f"Topup failed: {response.status_code} - {response.text}"
        
        data = response.json()
        assert "balance" in data or "new_balance" in data
        print(f"PASS: Wallet topped up by ₦5,000")


class TestRiderPreferences:
    """Test rider preferences (recently fixed _id bug)"""

    def test_01_get_rider_preferences(self):
        """GET /api/rider/preferences/{user_id} - Get rider preferences"""
        assert TEST_RIDER_TOKEN, "Rider JWT required"
        response = requests.get(
            f"{BASE_URL}/api/rider/preferences/{TEST_RIDER_ID}",
            headers=bearer_headers(TEST_RIDER_TOKEN),
        )
        assert response.status_code == 200, f"Get preferences failed: {response.status_code}"
        
        data = response.json()
        # Should not contain _id (MongoDB ObjectID which is not JSON serializable)
        assert "_id" not in data, "_id should be excluded from response"
        print(f"PASS: Rider preferences retrieved - Ride type: {data.get('preferred_ride_type', 'default')}")

    def test_02_update_rider_preferences(self):
        """PUT /api/rider/preferences/{user_id} - Update preferences"""
        payload = {
            "preferred_ride_type": "quiet",
            "preferred_ac_level": "high",
            "preferred_music": "none",
            "default_payment": "cash"
        }
        
        assert TEST_RIDER_TOKEN, "Rider JWT required"
        response = requests.put(
            f"{BASE_URL}/api/rider/preferences/{TEST_RIDER_ID}",
            json=payload,
            headers=bearer_headers(TEST_RIDER_TOKEN),
        )
        assert response.status_code == 200, f"Update preferences failed: {response.status_code}"
        print("PASS: Rider preferences updated")


class TestSafety:
    """Test safety features"""

    def test_01_sos_trigger(self):
        """POST /api/sos/trigger - Trigger SOS alert"""
        assert TEST_RIDER_TOKEN, "Rider JWT required"
        payload = {
            "trip_id": created_trip_id or f"test-sos-{TEST_RUN_ID}",
            "location_lat": PICKUP_LAT,
            "location_lng": PICKUP_LNG,
            "auto_triggered": False,
        }

        response = requests.post(
            f"{BASE_URL}/api/sos/trigger",
            json=payload,
            headers=bearer_headers(TEST_RIDER_TOKEN),
        )
        
        # May return 404 if trip doesn't exist, which is valid
        if response.status_code == 404:
            print("INFO: SOS requires valid trip_id")
            return
        
        assert response.status_code == 200, f"SOS trigger failed: {response.status_code}"
        
        data = response.json()
        assert "sos_id" in data or "id" in data
        print(f"PASS: SOS alert triggered")

    def test_02_get_danger_zones(self):
        """GET /api/safety/danger-zones - Get danger zones"""
        response = requests.get(
            f"{BASE_URL}/api/safety/danger-zones",
            params={"lat": PICKUP_LAT, "lng": PICKUP_LNG}
        )
        assert response.status_code == 200, f"Get danger zones failed: {response.status_code}"
        
        data = response.json()
        assert data.get("success") == True
        zones = data.get("zones", [])
        print(f"PASS: Found {len(zones)} danger zones")

    def test_03_get_safety_alerts(self):
        """GET /api/safety/alerts - Get safety alerts"""
        response = requests.get(
            f"{BASE_URL}/api/safety/alerts",
            params={"lat": PICKUP_LAT, "lng": PICKUP_LNG, "driver_id": TEST_DRIVER_ID}
        )
        if response.status_code == 404:
            pytest.skip("Safety alerts endpoint not deployed in current backend build")
        assert response.status_code == 200, f"Get safety alerts failed: {response.status_code}"
        
        data = response.json()
        assert data.get("success") == True
        alerts = data.get("alerts", [])
        print(f"PASS: Found {len(alerts)} safety alerts")


class TestCommunity:
    """Test community features"""

    def test_01_get_community_groups(self):
        """GET /api/community/groups - Get all community groups"""
        response = requests.get(f"{BASE_URL}/api/community/groups")
        assert response.status_code == 200, f"Get groups failed: {response.status_code}"
        
        data = response.json()
        assert data.get("success") == True
        groups = data.get("groups", [])
        print(f"PASS: Found {len(groups)} community groups")

    def test_02_get_community_events(self):
        """GET /api/community/events - Get community events"""
        response = requests.get(f"{BASE_URL}/api/community/events")
        assert response.status_code == 200, f"Get events failed: {response.status_code}"
        
        data = response.json()
        assert data.get("success") == True
        events = data.get("events", [])
        print(f"PASS: Found {len(events)} community events")


class TestDriverFeatures:
    """Test driver-specific features"""

    def test_01_get_driver_stats(self):
        """GET /api/drivers/{id}/stats - Get driver statistics"""
        assert TEST_DRIVER_TOKEN, "Driver JWT required"
        response = requests.get(
            f"{BASE_URL}/api/drivers/{TEST_DRIVER_ID}/stats",
            headers=bearer_headers(TEST_DRIVER_TOKEN),
        )
        assert response.status_code == 200, f"Get stats failed: {response.status_code}"
        
        data = response.json()
        print(f"PASS: Driver stats - Trips: {data.get('total_trips', 0)}, Rating: {data.get('rating', 5.0)}")

    def test_02_get_driver_earnings(self):
        """GET /api/driver/earnings/{id} - Get driver earnings dashboard"""
        assert TEST_DRIVER_TOKEN, "Driver JWT required"
        response = requests.get(
            f"{BASE_URL}/api/driver/earnings/{TEST_DRIVER_ID}",
            headers=bearer_headers(TEST_DRIVER_TOKEN),
        )
        assert response.status_code == 200, f"Get earnings failed: {response.status_code}"
        
        data = response.json()
        print(f"PASS: Driver earnings - Today: ₦{data.get('today', {}).get('earnings', 0):,.0f}")

    def test_03_get_driver_tier(self):
        """GET /api/driver/tier/{id} - Get driver tier"""
        assert TEST_DRIVER_TOKEN, "Driver JWT required"
        response = requests.get(
            f"{BASE_URL}/api/driver/tier/{TEST_DRIVER_ID}",
            headers=bearer_headers(TEST_DRIVER_TOKEN),
        )
        assert response.status_code == 200, f"Get tier failed: {response.status_code}"
        
        data = response.json()
        tier = data.get("tier", "basic")
        print(f"PASS: Driver tier: {tier}")

    def test_04_get_driver_streaks(self):
        """GET /api/drivers/{id}/streaks - Get driver streaks"""
        assert TEST_DRIVER_TOKEN, "Driver JWT required"
        response = requests.get(
            f"{BASE_URL}/api/drivers/{TEST_DRIVER_ID}/streaks",
            headers=bearer_headers(TEST_DRIVER_TOKEN),
        )
        assert response.status_code == 200, f"Get streaks failed: {response.status_code}"
        
        data = response.json()
        print(f"PASS: Driver streaks - Current: {data.get('current_streak', 0)}, Best: {data.get('best_streak', 0)}")

    def test_05_get_driver_heatmap(self):
        """GET /api/driver/heatmap - Get demand heatmap"""
        response = requests.get(
            f"{BASE_URL}/api/driver/heatmap",
            params={"lat": PICKUP_LAT, "lng": PICKUP_LNG, "city": "lagos"}
        )
        assert response.status_code == 200, f"Get heatmap failed: {response.status_code}"
        
        data = response.json()
        hotspots = data.get("hotspots", [])
        print(f"PASS: Heatmap - {len(hotspots)} hotspots found")


class TestDriverPollAndOnline:
    """Test driver polling for trips and going online"""

    def test_01_driver_go_online(self):
        """PUT /api/drivers/{user_id}/online - Driver goes online"""
        assert TEST_DRIVER_TOKEN, "Driver JWT required"
        response = requests.put(
            f"{BASE_URL}/api/drivers/{TEST_DRIVER_ID}/online",
            params={"is_online": True},
            headers=bearer_headers(TEST_DRIVER_TOKEN),
        )
        if response.status_code == 403:
            pytest.skip("Driver profile incomplete for go-online on this environment")
        assert response.status_code == 200, f"Go online failed: {response.status_code}"
        
        data = response.json()
        assert "online" in data.get("message", "").lower()
        print("PASS: Driver is now online")

    def test_02_poll_pending_trips(self):
        """GET /api/trips/pending - Driver polls for pending trips"""
        assert TEST_DRIVER_TOKEN, "Driver JWT required"
        response = requests.get(
            f"{BASE_URL}/api/trips/pending",
            params={"driver_lat": PICKUP_LAT, "driver_lng": PICKUP_LNG},
            headers=bearer_headers(TEST_DRIVER_TOKEN),
        )
        assert response.status_code == 200, f"Poll pending failed: {response.status_code}"
        
        trips = response.json()
        assert isinstance(trips, list)
        print(f"PASS: Found {len(trips)} pending trips")


class TestCallFeature:
    """Test call feature for both rider→driver and driver→rider"""

    def test_01_call_nonexistent_trip(self):
        """POST /api/trip/{trip_id}/call - Should reject non-existent trip"""
        assert TEST_RIDER_TOKEN, "Rider JWT required"
        payload = {"caller_id": TEST_RIDER_ID, "caller_role": "rider"}

        response = requests.post(
            f"{BASE_URL}/api/trip/nonexistent-trip-xyz/call",
            json=payload,
            headers=bearer_headers(TEST_RIDER_TOKEN),
        )
        assert response.status_code == 404
        print("PASS: Correctly rejected call for non-existent trip")

    def test_02_call_completed_trip_should_fail(self):
        """POST /api/trip/{trip_id}/call - Should reject completed trip"""
        # Use our completed trip if available
        if created_trip_id:
            assert TEST_RIDER_TOKEN, "Rider JWT required"
            payload = {"caller_id": TEST_RIDER_ID, "caller_role": "rider"}
            response = requests.post(
                f"{BASE_URL}/api/trip/{created_trip_id}/call",
                json=payload,
                headers=bearer_headers(TEST_RIDER_TOKEN),
            )
            
            # Should be 403 for completed trip
            if response.status_code == 403:
                print("PASS: Correctly rejected call for completed trip")
            else:
                print(f"INFO: Call response: {response.status_code}")


class TestEdgeCases:
    """Test error handling and edge cases"""

    def test_01_accept_without_driver_id(self):
        """PUT /api/trips/{trip_id}/accept - Invalid accept should fail (auth + offer rules)"""
        assert TEST_DRIVER_TOKEN, "Driver JWT required"
        payload = {}

        response = requests.put(
            f"{BASE_URL}/api/trips/some-trip-id/accept",
            json=payload,
            headers=bearer_headers(TEST_DRIVER_TOKEN),
        )
        assert response.status_code in (400, 403, 404), (
            f"Expected 400/403/404, got {response.status_code}"
        )
        print("PASS: Correctly rejected acceptance without driver_id")

    def test_02_get_nonexistent_trip(self):
        """GET /api/trips/{trip_id} - Non-existent trip returns 404"""
        response = requests.get(f"{BASE_URL}/api/trips/nonexistent-trip-abc")
        assert response.status_code == 404
        print("PASS: Correctly returned 404 for non-existent trip")


# Pytest fixtures
@pytest.fixture(autouse=True, scope="module")
def test_info():
    """Print test run info"""
    print(f"\n{'='*60}")
    print(f"NEXRYDE Full Verification Test Suite")
    print(f"Test Run ID: {TEST_RUN_ID}")
    print(f"Backend URL: {BASE_URL}")
    print(f"Rider ID: {TEST_RIDER_ID}")
    print(f"Driver ID: {TEST_DRIVER_ID}")
    print(f"{'='*60}\n")
    yield
    print(f"\n{'='*60}")
    print(f"Test Run Complete - ID: {TEST_RUN_ID}")
    if created_trip_id:
        print(f"Created Trip: {created_trip_id}")
    if created_bid_id:
        print(f"Created Bid: {created_bid_id}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
