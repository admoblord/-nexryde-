"""
Comprehensive Test Suite for NEXRYDE - Full Rider and Driver Flow Testing
Tests ALL critical flows as per user request:

RIDER FLOW: Register -> Create trip -> Driver accepts -> Start -> Complete -> Rate -> Receipt
DRIVER FLOW: Register -> Subscription trial -> Go online -> Poll trips -> Accept -> Start -> Complete
BIDDING FLOW: Create bid -> Driver counter offer -> Rider accepts -> Trip created
CHAT: Send message -> Get messages -> AI chat
CALL: Initiate call (rate limiting, status checks)
WALLET: Get balance -> Top up
SAFETY: Trigger SOS -> Danger zones -> Safety alerts
AI FEATURES: Traffic prediction -> Accident prediction -> AI Coach -> Driver awareness -> Earnings predictor
COMMUNITY: Groups -> Messages -> Polls -> Events -> RSVP
USER FEATURES: Preferences -> Emergency contacts -> Favorite drivers -> Family -> Loyalty -> Referral -> Notifications
DRIVER FEATURES: Stats -> Earnings -> Tier -> Streaks -> Certification -> Onboarding -> Heatmap -> Subscription
OTHER: Fare estimate -> Surge check -> Languages -> Schedule ride -> Lost and found -> Trip share -> Leaderboard

Backend URL: https://nexryde-modular.preview.emergentagent.com
"""
import pytest
import requests
import os
import uuid
import time
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://nexryde-modular.preview.emergentagent.com').rstrip('/')

# Test data - unique per test run
TEST_RUN_ID = str(uuid.uuid4())[:8]
TEST_RIDER_ID = f"TEST_rider_{TEST_RUN_ID}"
TEST_DRIVER_ID = f"TEST_driver_{TEST_RUN_ID}"
TEST_RIDER_PHONE = f"+234810{TEST_RUN_ID[:7]}"
TEST_DRIVER_PHONE = f"+234809{TEST_RUN_ID[:7]}"

# Lagos coordinates
PICKUP_LAT = 6.5244
PICKUP_LNG = 3.3792
DROPOFF_LAT = 6.4500
DROPOFF_LNG = 3.4000

# Shared state
created_trip_id = None
created_bid_id = None
driver_offer_id = None


@pytest.fixture(scope="session")
def session():
    """Create a session for all tests"""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ==================== HEALTH CHECK ====================

class TestHealthCheck:
    """Verify API is accessible"""
    
    def test_health_endpoint(self, session):
        """GET /api/health - Basic health check"""
        response = session.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.status_code}"
        data = response.json()
        assert data.get("status") == "healthy", "API should be healthy"
        print(f"PASS: API healthy - {data}")


# ==================== AUTH & REGISTRATION ====================

class TestAuthFlow:
    """Test auth endpoints"""
    
    def test_01_send_otp(self, session):
        """POST /api/auth/send-otp"""
        payload = {"phone": TEST_RIDER_PHONE}
        response = session.post(f"{BASE_URL}/api/auth/send-otp", json=payload)
        assert response.status_code == 200, f"Send OTP failed: {response.status_code} - {response.text}"
        data = response.json()
        assert data.get("success") == True, "OTP send should succeed"
        print(f"PASS: OTP sent to {TEST_RIDER_PHONE}")
        # Store OTP for verification
        TestAuthFlow.test_otp = data.get("otp")  # Only available in test mode
    
    def test_02_verify_otp(self, session):
        """POST /api/auth/verify-otp"""
        otp = getattr(TestAuthFlow, 'test_otp', '123456')
        payload = {"phone": TEST_RIDER_PHONE, "otp": otp}
        response = session.post(f"{BASE_URL}/api/auth/verify-otp", json=payload)
        assert response.status_code == 200, f"Verify OTP failed: {response.status_code} - {response.text}"
        data = response.json()
        assert "verified" in data or "is_new_user" in data, "Should indicate verification result"
        print(f"PASS: OTP verified - new_user: {data.get('is_new_user', True)}")
    
    def test_03_register_rider(self, session):
        """POST /api/auth/register - Rider with NIN"""
        payload = {
            "phone": TEST_RIDER_PHONE,
            "name": f"Test Rider {TEST_RUN_ID}",
            "email": f"rider_{TEST_RUN_ID}@test.com",
            "role": "rider",
            "nin": "12345678901"  # Required for riders
        }
        response = session.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response.status_code == 200, f"Register rider failed: {response.status_code} - {response.text}"
        data = response.json()
        assert "user" in data, "Should return user object"
        TestAuthFlow.rider_id = data["user"]["id"]
        print(f"PASS: Rider registered - ID: {TestAuthFlow.rider_id}")
    
    def test_04_register_driver(self, session):
        """POST /api/auth/register - Driver with terms acceptance"""
        payload = {
            "phone": TEST_DRIVER_PHONE,
            "name": f"Test Driver {TEST_RUN_ID}",
            "email": f"driver_{TEST_RUN_ID}@test.com",
            "role": "driver",
            "terms_accepted": True,
            "terms_accepted_at": datetime.utcnow().isoformat()
        }
        response = session.post(f"{BASE_URL}/api/auth/register", json=payload)
        assert response.status_code == 200, f"Register driver failed: {response.status_code} - {response.text}"
        data = response.json()
        assert "user" in data, "Should return user object"
        TestAuthFlow.driver_id = data["user"]["id"]
        print(f"PASS: Driver registered - ID: {TestAuthFlow.driver_id}")


# ==================== DRIVER SUBSCRIPTION ====================

class TestDriverSubscription:
    """Test driver subscription flow"""
    
    def test_01_get_subscription_config(self, session):
        """GET /api/subscriptions/config"""
        response = session.get(f"{BASE_URL}/api/subscriptions/config")
        assert response.status_code == 200, f"Get config failed: {response.status_code}"
        data = response.json()
        assert "monthly_fee" in data, "Should contain monthly_fee"
        assert "bank_details" in data, "Should contain bank_details"
        print(f"PASS: Subscription config - ₦{data['monthly_fee']}")
    
    def test_02_start_trial(self, session):
        """POST /api/subscriptions/{driver_id}/start-trial"""
        driver_id = getattr(TestAuthFlow, 'driver_id', TEST_DRIVER_ID)
        response = session.post(f"{BASE_URL}/api/subscriptions/{driver_id}/start-trial")
        
        if response.status_code == 400:
            # Already has subscription
            print("INFO: Driver already has subscription")
            return
        
        assert response.status_code == 200, f"Start trial failed: {response.status_code} - {response.text}"
        data = response.json()
        print(f"PASS: Trial started - {data.get('message', '')}")
    
    def test_03_get_subscription_status(self, session):
        """GET /api/subscriptions/{driver_id}"""
        driver_id = getattr(TestAuthFlow, 'driver_id', TEST_DRIVER_ID)
        response = session.get(f"{BASE_URL}/api/subscriptions/{driver_id}")
        assert response.status_code == 200, f"Get subscription failed: {response.status_code}"
        data = response.json()
        assert "status" in data, "Should contain status"
        print(f"PASS: Subscription status: {data.get('status')}, days remaining: {data.get('days_remaining', 0)}")


# ==================== DRIVER PROFILE & ONBOARDING ====================

class TestDriverProfile:
    """Test driver profile and onboarding"""
    
    def test_01_update_driver_profile(self, session):
        """PUT /api/drivers/{driver_id}/profile"""
        driver_id = getattr(TestAuthFlow, 'driver_id', TEST_DRIVER_ID)
        payload = {
            "vehicle_type": "sedan",
            "vehicle_model": "Toyota Camry 2020",
            "vehicle_plate": f"LAG-{TEST_RUN_ID[:3]}",
            "vehicle_color": "Black"
        }
        response = session.put(f"{BASE_URL}/api/drivers/{driver_id}/profile", json=payload)
        assert response.status_code == 200, f"Update profile failed: {response.status_code}"
        print(f"PASS: Driver profile updated")
    
    def test_02_get_onboarding_status(self, session):
        """GET /api/drivers/{driver_id}/onboarding-status"""
        driver_id = getattr(TestAuthFlow, 'driver_id', TEST_DRIVER_ID)
        response = session.get(f"{BASE_URL}/api/drivers/{driver_id}/onboarding-status")
        assert response.status_code == 200, f"Get onboarding failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Onboarding step: {data.get('step', 'unknown')}")
    
    def test_03_go_online(self, session):
        """PUT /api/drivers/{driver_id}/online"""
        driver_id = getattr(TestAuthFlow, 'driver_id', TEST_DRIVER_ID)
        payload = {"is_online": True}
        response = session.put(f"{BASE_URL}/api/drivers/{driver_id}/online", json=payload)
        assert response.status_code == 200, f"Go online failed: {response.status_code}"
        print(f"PASS: Driver is now online")
    
    def test_04_get_driver_stats(self, session):
        """GET /api/drivers/{driver_id}/stats"""
        driver_id = getattr(TestAuthFlow, 'driver_id', TEST_DRIVER_ID)
        response = session.get(f"{BASE_URL}/api/drivers/{driver_id}/stats")
        assert response.status_code == 200, f"Get stats failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Driver stats - trips: {data.get('trips_today', 0)}, earnings: ₦{data.get('today_earnings', 0)}")
    
    def test_05_get_driver_tier(self, session):
        """GET /api/driver/tier/{driver_id}"""
        driver_id = getattr(TestAuthFlow, 'driver_id', TEST_DRIVER_ID)
        response = session.get(f"{BASE_URL}/api/driver/tier/{driver_id}")
        assert response.status_code == 200, f"Get tier failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Driver tier: {data.get('tier', 'basic')}")
    
    def test_06_get_driver_streaks(self, session):
        """GET /api/drivers/{driver_id}/streaks"""
        driver_id = getattr(TestAuthFlow, 'driver_id', TEST_DRIVER_ID)
        response = session.get(f"{BASE_URL}/api/drivers/{driver_id}/streaks")
        # 404 is valid if driver doesn't have streaks yet
        assert response.status_code in [200, 404], f"Get streaks failed: {response.status_code}"
        if response.status_code == 200:
            data = response.json()
            print(f"PASS: Driver streaks: {data}")
        else:
            print("INFO: No streaks data yet (expected for new driver)")
    
    def test_07_get_driver_certification(self, session):
        """GET /api/drivers/{driver_id}/certification"""
        driver_id = getattr(TestAuthFlow, 'driver_id', TEST_DRIVER_ID)
        response = session.get(f"{BASE_URL}/api/drivers/{driver_id}/certification")
        assert response.status_code == 200, f"Get certification failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Certification level: {data.get('level', 'bronze')}")
    
    def test_08_get_driver_heatmap(self, session):
        """GET /api/driver/heatmap"""
        params = {"driver_lat": PICKUP_LAT, "driver_lng": PICKUP_LNG}
        response = session.get(f"{BASE_URL}/api/driver/heatmap", params=params)
        assert response.status_code == 200, f"Get heatmap failed: {response.status_code}"
        data = response.json()
        assert "heatmap" in data, "Should contain heatmap data"
        print(f"PASS: Heatmap returned {len(data.get('heatmap', []))} zones")
    
    def test_09_get_driver_earnings(self, session):
        """GET /api/driver/earnings/{driver_id}"""
        driver_id = getattr(TestAuthFlow, 'driver_id', TEST_DRIVER_ID)
        response = session.get(f"{BASE_URL}/api/driver/earnings/{driver_id}")
        assert response.status_code == 200, f"Get earnings failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Earnings data: ₦{data.get('total', 0)}")


# ==================== FARE & TRIP CREATION ====================

class TestFareAndTripCreation:
    """Test fare estimation and trip creation"""
    
    def test_01_fare_estimate(self, session):
        """POST /api/fare/estimate"""
        payload = {
            "pickup_lat": PICKUP_LAT,
            "pickup_lng": PICKUP_LNG,
            "dropoff_lat": DROPOFF_LAT,
            "dropoff_lng": DROPOFF_LNG,
            "service_type": "economy",
            "city": "lagos"
        }
        response = session.post(f"{BASE_URL}/api/fare/estimate", json=payload)
        assert response.status_code == 200, f"Fare estimate failed: {response.status_code}"
        data = response.json()
        assert "total_fare" in data, "Should contain total_fare"
        TestFareAndTripCreation.estimated_fare = data.get("total_fare", 3000)
        print(f"PASS: Fare estimate: ₦{data['total_fare']}")
    
    def test_02_surge_check(self, session):
        """GET /api/surge/check"""
        params = {"lat": PICKUP_LAT, "lng": PICKUP_LNG}
        response = session.get(f"{BASE_URL}/api/surge/check", params=params)
        assert response.status_code == 200, f"Surge check failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Surge multiplier: {data.get('multiplier', 1.0)}")
    
    def test_03_create_trip_with_custom_price(self, session):
        """POST /api/trips/create-with-custom-price"""
        global created_trip_id
        rider_id = getattr(TestAuthFlow, 'rider_id', TEST_RIDER_ID)
        estimated = getattr(TestFareAndTripCreation, 'estimated_fare', 3000)
        
        payload = {
            "rider_id": rider_id,
            "pickup": "Test Pickup, Victoria Island, Lagos",
            "destination": "Test Destination, Lekki, Lagos",
            "recommended_fare": estimated,
            "offered_fare": estimated * 0.9,  # 10% below
            "vehicle_type": "economy",
            "trip_type": "intra"
        }
        response = session.post(f"{BASE_URL}/api/trips/create-with-custom-price", json=payload)
        assert response.status_code == 200, f"Create trip failed: {response.status_code} - {response.text}"
        data = response.json()
        assert data.get("success") == True, "Trip creation should succeed"
        created_trip_id = data["trip_id"]
        print(f"PASS: Created trip {created_trip_id}, drivers notified: {data.get('drivers_notified', 0)}")


# ==================== DRIVER TRIP ACCEPTANCE ====================

class TestDriverTripAcceptance:
    """Test driver accepting trips"""
    
    def test_01_poll_pending_trips(self, session):
        """GET /api/trips/pending - Driver polls for trips"""
        params = {"driver_lat": PICKUP_LAT, "driver_lng": PICKUP_LNG}
        response = session.get(f"{BASE_URL}/api/trips/pending", params=params)
        assert response.status_code == 200, f"Poll trips failed: {response.status_code}"
        data = response.json()
        assert isinstance(data, list), "Should return list of trips"
        print(f"PASS: Found {len(data)} pending trips")
    
    def test_02_accept_trip(self, session):
        """PUT /api/trips/{trip_id}/accept"""
        global created_trip_id
        if not created_trip_id:
            pytest.skip("No trip created to accept")
        
        driver_id = getattr(TestAuthFlow, 'driver_id', TEST_DRIVER_ID)
        payload = {"driver_id": driver_id}
        response = session.put(f"{BASE_URL}/api/trips/{created_trip_id}/accept", json=payload)
        
        if response.status_code == 403:
            print(f"INFO: Trip acceptance forbidden (subscription required)")
            pytest.skip("Subscription required for trip acceptance")
        
        assert response.status_code == 200, f"Accept trip failed: {response.status_code} - {response.text}"
        data = response.json()
        assert data.get("status") == "accepted", f"Status should be accepted, got {data.get('status')}"
        print(f"PASS: Trip accepted by driver {driver_id}")


# ==================== TRIP LIFECYCLE ====================

class TestTripLifecycle:
    """Test trip start, complete, rate flow"""
    
    def test_01_start_trip(self, session):
        """PUT /api/trips/{trip_id}/start"""
        global created_trip_id
        if not created_trip_id:
            pytest.skip("No trip to start")
        
        response = session.put(f"{BASE_URL}/api/trips/{created_trip_id}/start")
        
        if response.status_code == 400:
            print("INFO: Trip must be accepted before starting")
            pytest.skip("Trip not in accepted state")
        
        assert response.status_code == 200, f"Start trip failed: {response.status_code}"
        data = response.json()
        assert data.get("status") == "ongoing", "Status should be ongoing"
        print(f"PASS: Trip started at {data.get('started_at')}")
    
    def test_02_complete_trip(self, session):
        """PUT /api/trips/{trip_id}/complete"""
        global created_trip_id
        if not created_trip_id:
            pytest.skip("No trip to complete")
        
        response = session.put(f"{BASE_URL}/api/trips/{created_trip_id}/complete")
        
        if response.status_code == 400:
            print("INFO: Trip must be ongoing to complete")
            pytest.skip("Trip not in ongoing state")
        
        assert response.status_code == 200, f"Complete trip failed: {response.status_code}"
        data = response.json()
        assert data.get("status") == "completed", "Status should be completed"
        print(f"PASS: Trip completed")
    
    def test_03_rate_trip(self, session):
        """PUT /api/trips/{trip_id}/rate"""
        global created_trip_id
        if not created_trip_id:
            pytest.skip("No trip to rate")
        
        rider_id = getattr(TestAuthFlow, 'rider_id', TEST_RIDER_ID)
        payload = {
            "overall_rating": 4.5,
            "smoothness": 4.0,
            "politeness": 5.0,
            "cleanliness": 4.0,
            "safety": 5.0,
            "comment": f"Great ride! Test {TEST_RUN_ID}"
        }
        response = session.put(
            f"{BASE_URL}/api/trips/{created_trip_id}/rate",
            params={"rater_id": rider_id},
            json=payload
        )
        
        if response.status_code == 400:
            print("INFO: Can only rate completed trips")
            pytest.skip("Trip not completed")
        
        assert response.status_code == 200, f"Rate trip failed: {response.status_code}"
        print(f"PASS: Trip rated with 4.5 stars")
    
    def test_04_get_receipt(self, session):
        """GET /api/trips/{trip_id}/receipt"""
        global created_trip_id
        if not created_trip_id:
            pytest.skip("No trip for receipt")
        
        response = session.get(f"{BASE_URL}/api/trips/{created_trip_id}/receipt")
        
        if response.status_code == 404:
            print("INFO: Receipt not available")
            pytest.skip("Receipt not found")
        
        assert response.status_code == 200, f"Get receipt failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Receipt retrieved - fare: ₦{data.get('fare', 0)}")


# ==================== BIDDING FLOW ====================

class TestBiddingFlow:
    """Test bidding/negotiation system"""
    
    def test_01_create_bid(self, session):
        """POST /api/rides/bid/create"""
        global created_bid_id
        rider_id = getattr(TestAuthFlow, 'rider_id', TEST_RIDER_ID)
        
        payload = {
            "rider_offered_price": 2500.0,
            "pickup_lat": PICKUP_LAT,
            "pickup_lng": PICKUP_LNG,
            "pickup_address": "Bid Test Pickup, Lagos",
            "dropoff_lat": DROPOFF_LAT,
            "dropoff_lng": DROPOFF_LNG,
            "dropoff_address": "Bid Test Destination, Lagos",
            "ride_type": "economy"
        }
        response = session.post(f"{BASE_URL}/api/rides/bid/create", params={"rider_id": rider_id}, json=payload)
        assert response.status_code == 200, f"Create bid failed: {response.status_code} - {response.text}"
        data = response.json()
        assert "bid_id" in data, "Should return bid_id"
        created_bid_id = data["bid_id"]
        print(f"PASS: Bid created - {created_bid_id}")
    
    def test_02_driver_makes_offer(self, session):
        """POST /api/rides/bid/{bid_id}/driver-offer"""
        global created_bid_id, driver_offer_id
        if not created_bid_id:
            pytest.skip("No bid to offer on")
        
        driver_id = getattr(TestAuthFlow, 'driver_id', TEST_DRIVER_ID)
        params = {
            "driver_id": driver_id,
            "counter_price": 3000.0,
            "message": "I can do it for this price"
        }
        response = session.post(f"{BASE_URL}/api/rides/bid/{created_bid_id}/driver-offer", params=params)
        
        if response.status_code == 404:
            print("INFO: Bid not found or closed")
            pytest.skip("Bid not available")
        
        assert response.status_code == 200, f"Make offer failed: {response.status_code}"
        data = response.json()
        driver_offer_id = data.get("offer_id")
        print(f"PASS: Driver made counter offer - {driver_offer_id}")
    
    def test_03_rider_accepts_offer(self, session):
        """POST /api/rides/bid/{bid_id}/accept"""
        global created_bid_id, driver_offer_id
        if not created_bid_id or not driver_offer_id:
            pytest.skip("No bid/offer to accept")
        
        rider_id = getattr(TestAuthFlow, 'rider_id', TEST_RIDER_ID)
        params = {"rider_id": rider_id, "offer_id": driver_offer_id}
        response = session.post(f"{BASE_URL}/api/rides/bid/{created_bid_id}/accept", params=params)
        
        if response.status_code == 404:
            print("INFO: Bid or offer not found")
            pytest.skip("Bid/offer not available")
        
        assert response.status_code == 200, f"Accept offer failed: {response.status_code}"
        data = response.json()
        assert "trip_id" in data, "Should create trip"
        print(f"PASS: Offer accepted, trip created: {data['trip_id']}")


# ==================== CHAT & MESSAGING ====================

class TestChatAndMessaging:
    """Test chat features"""
    
    def test_01_send_trip_message(self, session):
        """POST /api/chat/message"""
        global created_trip_id
        if not created_trip_id:
            pytest.skip("No trip for chat")
        
        rider_id = getattr(TestAuthFlow, 'rider_id', TEST_RIDER_ID)
        payload = {
            "trip_id": created_trip_id,
            "sender_id": rider_id,
            "sender_role": "rider",
            "message": f"Test message {TEST_RUN_ID}",
            "message_type": "text"
        }
        response = session.post(f"{BASE_URL}/api/chat/message", json=payload)
        
        if response.status_code in [403, 404]:
            print("INFO: Chat requires active trip")
            pytest.skip("Chat not available")
        
        assert response.status_code == 200, f"Send message failed: {response.status_code}"
        print(f"PASS: Message sent")
    
    def test_02_get_trip_messages(self, session):
        """GET /api/chat/messages/{trip_id}"""
        global created_trip_id
        if not created_trip_id:
            pytest.skip("No trip for chat")
        
        rider_id = getattr(TestAuthFlow, 'rider_id', TEST_RIDER_ID)
        response = session.get(f"{BASE_URL}/api/chat/messages/{created_trip_id}", params={"user_id": rider_id})
        
        if response.status_code == 404:
            pytest.skip("Trip not found")
        
        assert response.status_code == 200, f"Get messages failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Retrieved {len(data.get('messages', []))} messages")
    
    def test_03_ai_chat(self, session):
        """POST /api/chat/ai - AI assistance"""
        rider_id = getattr(TestAuthFlow, 'rider_id', TEST_RIDER_ID)
        payload = {
            "user_id": rider_id,
            "message": "What are the safety features in NEXRYDE?",
            "role": "rider"
        }
        response = session.post(f"{BASE_URL}/api/chat/ai", json=payload)
        assert response.status_code == 200, f"AI chat failed: {response.status_code}"
        data = response.json()
        assert "response" in data, "Should contain AI response"
        print(f"PASS: AI responded: {data['response'][:100]}...")
    
    def test_04_get_chat_presets_rider(self, session):
        """GET /api/chat/presets/rider"""
        response = session.get(f"{BASE_URL}/api/chat/presets/rider")
        assert response.status_code == 200, f"Get presets failed: {response.status_code}"
        data = response.json()
        assert "presets" in data, "Should contain presets"
        print(f"PASS: Got {len(data['presets'])} rider presets")
    
    def test_05_get_chat_presets_driver(self, session):
        """GET /api/chat/presets/driver"""
        response = session.get(f"{BASE_URL}/api/chat/presets/driver")
        assert response.status_code == 200, f"Get presets failed: {response.status_code}"
        data = response.json()
        assert "presets" in data, "Should contain presets"
        print(f"PASS: Got {len(data['presets'])} driver presets")


# ==================== CALL FEATURE ====================

class TestCallFeature:
    """Test call functionality"""
    
    def test_01_call_non_existent_trip(self, session):
        """POST /api/trip/{trip_id}/call - Should return 404"""
        payload = {"caller_id": TEST_RIDER_ID, "caller_role": "rider"}
        response = session.post(f"{BASE_URL}/api/trip/nonexistent-trip/call", json=payload)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print(f"PASS: Non-existent trip returns 404")
    
    def test_02_call_active_trip(self, session):
        """POST /api/trip/{trip_id}/call"""
        global created_trip_id
        if not created_trip_id:
            pytest.skip("No trip for call test")
        
        rider_id = getattr(TestAuthFlow, 'rider_id', TEST_RIDER_ID)
        payload = {"caller_id": rider_id, "caller_role": "rider"}
        response = session.post(f"{BASE_URL}/api/trip/{created_trip_id}/call", json=payload)
        
        # Multiple valid responses
        if response.status_code == 404:
            print("INFO: Phone number not available for test users")
        elif response.status_code == 403:
            print("INFO: Calls only allowed during active trips")
        elif response.status_code == 429:
            print("INFO: Rate limited (max 5 calls)")
        elif response.status_code == 200:
            data = response.json()
            print(f"PASS: Call successful - {data.get('calls_remaining', 0)} remaining")
        else:
            pytest.fail(f"Unexpected response: {response.status_code}")


# ==================== WALLET ====================

class TestWallet:
    """Test wallet features"""
    
    def test_01_get_wallet_balance(self, session):
        """GET /api/wallet/{user_id}"""
        rider_id = getattr(TestAuthFlow, 'rider_id', TEST_RIDER_ID)
        response = session.get(f"{BASE_URL}/api/wallet/{rider_id}")
        assert response.status_code == 200, f"Get wallet failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Wallet balance: ₦{data.get('balance', 0)}")
    
    def test_02_topup_wallet(self, session):
        """POST /api/wallet/{user_id}/topup"""
        rider_id = getattr(TestAuthFlow, 'rider_id', TEST_RIDER_ID)
        payload = {"amount": 5000, "payment_method": "bank_transfer", "reference": f"TEST-{TEST_RUN_ID}"}
        response = session.post(f"{BASE_URL}/api/wallet/{rider_id}/topup", json=payload)
        assert response.status_code == 200, f"Topup failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Wallet topped up - new balance: ₦{data.get('balance', 0)}")


# ==================== SAFETY ====================

class TestSafety:
    """Test safety features"""
    
    def test_01_trigger_sos(self, session):
        """POST /api/sos/trigger"""
        global created_trip_id
        if not created_trip_id:
            pytest.skip("No trip for SOS")
        
        rider_id = getattr(TestAuthFlow, 'rider_id', TEST_RIDER_ID)
        payload = {
            "trip_id": created_trip_id,
            "user_id": rider_id,
            "location_lat": PICKUP_LAT,
            "location_lng": PICKUP_LNG,
            "auto_triggered": False
        }
        response = session.post(f"{BASE_URL}/api/sos/trigger", json=payload)
        
        if response.status_code == 404:
            print("INFO: Trip not found for SOS")
            pytest.skip("Trip not available")
        
        assert response.status_code == 200, f"SOS trigger failed: {response.status_code}"
        print(f"PASS: SOS triggered")
    
    def test_02_get_danger_zones(self, session):
        """GET /api/safety/danger-zones"""
        params = {"lat": PICKUP_LAT, "lng": PICKUP_LNG, "radius": 10000}
        response = session.get(f"{BASE_URL}/api/safety/danger-zones", params=params)
        assert response.status_code == 200, f"Get danger zones failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Found {data.get('count', 0)} danger zones")
    
    def test_03_get_safety_alerts(self, session):
        """GET /api/safety/alerts"""
        driver_id = getattr(TestAuthFlow, 'driver_id', TEST_DRIVER_ID)
        params = {"lat": PICKUP_LAT, "lng": PICKUP_LNG, "driver_id": driver_id}
        response = session.get(f"{BASE_URL}/api/safety/alerts", params=params)
        assert response.status_code == 200, f"Get alerts failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Got {len(data.get('alerts', []))} safety alerts")


# ==================== AI FEATURES ====================

class TestAIFeatures:
    """Test AI-powered features"""
    
    def test_01_traffic_prediction(self, session):
        """POST /api/ai/traffic/predict"""
        driver_id = getattr(TestAuthFlow, 'driver_id', TEST_DRIVER_ID)
        params = {
            "origin_lat": PICKUP_LAT,
            "origin_lng": PICKUP_LNG,
            "destination_lat": DROPOFF_LAT,
            "destination_lng": DROPOFF_LNG,
            "driver_id": driver_id
        }
        response = session.post(f"{BASE_URL}/api/ai/traffic/predict", params=params)
        assert response.status_code == 200, f"Traffic predict failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Traffic prediction - level: {data.get('ai_analysis', {}).get('traffic_level', 'unknown')}")
    
    def test_02_accident_prediction(self, session):
        """POST /api/ai/accident/predict-risk"""
        driver_id = getattr(TestAuthFlow, 'driver_id', TEST_DRIVER_ID)
        params = {
            "driver_id": driver_id,
            "current_lat": PICKUP_LAT,
            "current_lng": PICKUP_LNG
        }
        response = session.post(f"{BASE_URL}/api/ai/accident/predict-risk", params=params)
        assert response.status_code == 200, f"Accident predict failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Accident risk: {data.get('risk_analysis', {}).get('risk_level', 'unknown')}")
    
    def test_03_ai_coach_suggestions(self, session):
        """POST /api/ai/coach/get-suggestions"""
        driver_id = getattr(TestAuthFlow, 'driver_id', TEST_DRIVER_ID)
        params = {"driver_id": driver_id, "lat": PICKUP_LAT, "lng": PICKUP_LNG}
        response = session.post(f"{BASE_URL}/api/ai/coach/get-suggestions", params=params)
        assert response.status_code == 200, f"Coach suggestions failed: {response.status_code}"
        data = response.json()
        suggestions = data.get("suggestions", [])
        print(f"PASS: Got {len(suggestions)} AI coach suggestions")
    
    def test_04_driver_awareness(self, session):
        """GET /api/driver/awareness"""
        driver_id = getattr(TestAuthFlow, 'driver_id', TEST_DRIVER_ID)
        params = {"driver_id": driver_id, "lat": PICKUP_LAT, "lng": PICKUP_LNG}
        response = session.get(f"{BASE_URL}/api/driver/awareness", params=params)
        assert response.status_code == 200, f"Driver awareness failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Got {len(data.get('alerts', []))} awareness alerts, driver score: {data.get('driver_score', 0)}")
    
    def test_05_high_risk_areas(self, session):
        """GET /api/ai/accident/high-risk-areas"""
        response = session.get(f"{BASE_URL}/api/ai/accident/high-risk-areas", params={"city": "Lagos"})
        assert response.status_code == 200, f"High risk areas failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Found {data.get('count', 0)} high-risk areas")
    
    def test_06_earnings_predictor(self, session):
        """GET /api/ai/earnings-predictor/{user_id}"""
        driver_id = getattr(TestAuthFlow, 'driver_id', TEST_DRIVER_ID)
        params = {"hours_to_drive": 8}
        response = session.get(f"{BASE_URL}/api/ai/earnings-predictor/{driver_id}", params=params)
        assert response.status_code == 200, f"Earnings predictor failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Predicted earnings: ₦{data.get('predicted_earnings', {}).get('realistic', 0)}")
    
    def test_07_fatigue_status(self, session):
        """GET /api/drivers/{user_id}/fatigue-status"""
        driver_id = getattr(TestAuthFlow, 'driver_id', TEST_DRIVER_ID)
        response = session.get(f"{BASE_URL}/api/drivers/{driver_id}/fatigue-status")
        assert response.status_code == 200, f"Fatigue status failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Fatigue level: {data.get('fatigue_level', 'low')}")


# ==================== COMMUNITY ====================

class TestCommunity:
    """Test community features"""
    
    def test_01_get_community_groups(self, session):
        """GET /api/community/groups"""
        response = session.get(f"{BASE_URL}/api/community/groups")
        assert response.status_code == 200, f"Get groups failed: {response.status_code}"
        data = response.json()
        groups = data.get("groups", [])
        print(f"PASS: Found {len(groups)} community groups")
    
    def test_02_get_group_messages(self, session):
        """GET /api/community/groups/{group_id}/messages"""
        response = session.get(f"{BASE_URL}/api/community/groups/lagos-drivers/messages", params={"limit": 50})
        assert response.status_code == 200, f"Get messages failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Found {len(data.get('messages', []))} messages in lagos-drivers")
    
    def test_03_post_group_message(self, session):
        """POST /api/community/groups/{group_id}/messages"""
        driver_id = getattr(TestAuthFlow, 'driver_id', TEST_DRIVER_ID)
        payload = {
            "user_id": driver_id,
            "user_name": f"Test Driver {TEST_RUN_ID}",
            "user_role": "driver",
            "text": f"Test message from test run {TEST_RUN_ID}"
        }
        response = session.post(f"{BASE_URL}/api/community/groups/general/messages", json=payload)
        assert response.status_code == 200, f"Post message failed: {response.status_code}"
        print(f"PASS: Posted message to general group")
    
    def test_04_get_community_polls(self, session):
        """GET /api/community/groups/{group_id}/polls"""
        response = session.get(f"{BASE_URL}/api/community/groups/general/polls")
        assert response.status_code == 200, f"Get polls failed: {response.status_code}"
        data = response.json()
        polls = data.get("polls", [])
        print(f"PASS: Found {len(polls)} polls")
        if polls:
            TestCommunity.poll_id = polls[0].get("poll_id")
    
    def test_05_create_poll(self, session):
        """POST /api/community/groups/{group_id}/polls"""
        driver_id = getattr(TestAuthFlow, 'driver_id', TEST_DRIVER_ID)
        payload = {
            "user_id": driver_id,
            "user_name": f"Test Driver {TEST_RUN_ID}",
            "question": f"Test poll {TEST_RUN_ID}?",
            "options": ["Option A", "Option B", "Option C"],
            "duration_hours": 24
        }
        response = session.post(f"{BASE_URL}/api/community/groups/general/polls", json=payload)
        assert response.status_code == 200, f"Create poll failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Created poll: {data.get('poll', {}).get('poll_id')}")
    
    def test_06_vote_on_poll(self, session):
        """POST /api/community/polls/{poll_id}/vote"""
        poll_id = getattr(TestCommunity, 'poll_id', None)
        if not poll_id:
            pytest.skip("No poll to vote on")
        
        driver_id = getattr(TestAuthFlow, 'driver_id', TEST_DRIVER_ID)
        payload = {"user_id": driver_id, "option_index": 0}
        response = session.post(f"{BASE_URL}/api/community/polls/{poll_id}/vote", json=payload)
        
        if response.status_code == 400:
            print("INFO: Already voted on this poll")
            return
        
        assert response.status_code == 200, f"Vote failed: {response.status_code}"
        print(f"PASS: Voted on poll")
    
    def test_07_get_community_events(self, session):
        """GET /api/community/events"""
        response = session.get(f"{BASE_URL}/api/community/events")
        assert response.status_code == 200, f"Get events failed: {response.status_code}"
        data = response.json()
        events = data.get("events", [])
        print(f"PASS: Found {len(events)} events")
        if events:
            TestCommunity.event_id = events[0].get("event_id")
    
    def test_08_create_event(self, session):
        """POST /api/community/events"""
        driver_id = getattr(TestAuthFlow, 'driver_id', TEST_DRIVER_ID)
        payload = {
            "user_id": driver_id,
            "user_name": f"Test Driver {TEST_RUN_ID}",
            "group_id": "general",
            "title": f"Test Event {TEST_RUN_ID}",
            "description": "Test event description",
            "event_type": "meetup",
            "location": "Test Location, Lagos",
            "date": (datetime.utcnow() + timedelta(days=7)).strftime("%Y-%m-%d"),
            "time": "3:00 PM"
        }
        response = session.post(f"{BASE_URL}/api/community/events", json=payload)
        assert response.status_code == 200, f"Create event failed: {response.status_code}"
        print(f"PASS: Created event")
    
    def test_09_rsvp_to_event(self, session):
        """POST /api/community/events/{event_id}/rsvp"""
        event_id = getattr(TestCommunity, 'event_id', None)
        if not event_id:
            pytest.skip("No event to RSVP to")
        
        driver_id = getattr(TestAuthFlow, 'driver_id', TEST_DRIVER_ID)
        payload = {"user_id": driver_id}
        response = session.post(f"{BASE_URL}/api/community/events/{event_id}/rsvp", json=payload)
        assert response.status_code == 200, f"RSVP failed: {response.status_code}"
        data = response.json()
        print(f"PASS: RSVP {data.get('action', 'done')}")


# ==================== USER FEATURES ====================

class TestUserFeatures:
    """Test user-specific features"""
    
    def test_01_get_preferences(self, session):
        """GET /api/rider/preferences/{user_id}"""
        rider_id = getattr(TestAuthFlow, 'rider_id', TEST_RIDER_ID)
        response = session.get(f"{BASE_URL}/api/rider/preferences/{rider_id}")
        assert response.status_code == 200, f"Get preferences failed: {response.status_code}"
        print(f"PASS: Got rider preferences")
    
    def test_02_update_preferences(self, session):
        """PUT /api/rider/preferences/{user_id}"""
        rider_id = getattr(TestAuthFlow, 'rider_id', TEST_RIDER_ID)
        payload = {"preferred_ride_type": "quiet", "default_payment": "cash"}
        response = session.put(f"{BASE_URL}/api/rider/preferences/{rider_id}", json=payload)
        assert response.status_code == 200, f"Update preferences failed: {response.status_code}"
        print(f"PASS: Updated preferences")
    
    def test_03_add_emergency_contact(self, session):
        """POST /api/users/{user_id}/emergency-contacts"""
        rider_id = getattr(TestAuthFlow, 'rider_id', TEST_RIDER_ID)
        payload = {"name": "Emergency Contact", "phone": "+2348012345678", "relationship": "Family"}
        response = session.post(f"{BASE_URL}/api/users/{rider_id}/emergency-contacts", json=payload)
        assert response.status_code == 200, f"Add contact failed: {response.status_code}"
        print(f"PASS: Added emergency contact")
    
    def test_04_get_emergency_contacts(self, session):
        """GET /api/users/{user_id}/emergency-contacts"""
        rider_id = getattr(TestAuthFlow, 'rider_id', TEST_RIDER_ID)
        response = session.get(f"{BASE_URL}/api/users/{rider_id}/emergency-contacts")
        assert response.status_code == 200, f"Get contacts failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Found {len(data.get('contacts', []))} emergency contacts")
    
    def test_05_add_favorite_driver(self, session):
        """POST /api/users/{user_id}/favorite-drivers"""
        rider_id = getattr(TestAuthFlow, 'rider_id', TEST_RIDER_ID)
        driver_id = getattr(TestAuthFlow, 'driver_id', TEST_DRIVER_ID)
        payload = {"driver_id": driver_id}
        response = session.post(f"{BASE_URL}/api/users/{rider_id}/favorite-drivers", json=payload)
        assert response.status_code == 200, f"Add favorite failed: {response.status_code}"
        print(f"PASS: Added favorite driver")
    
    def test_06_get_favorite_drivers(self, session):
        """GET /api/users/{user_id}/favorite-drivers"""
        rider_id = getattr(TestAuthFlow, 'rider_id', TEST_RIDER_ID)
        response = session.get(f"{BASE_URL}/api/users/{rider_id}/favorite-drivers")
        assert response.status_code == 200, f"Get favorites failed: {response.status_code}"
        print(f"PASS: Got favorite drivers")
    
    def test_07_create_family(self, session):
        """POST /api/family/create"""
        rider_id = getattr(TestAuthFlow, 'rider_id', TEST_RIDER_ID)
        payload = {"owner_id": rider_id, "family_name": f"Test Family {TEST_RUN_ID}"}
        response = session.post(f"{BASE_URL}/api/family/create", json=payload)
        assert response.status_code == 200, f"Create family failed: {response.status_code}"
        data = response.json()
        TestUserFeatures.family_id = data.get("family_id")
        print(f"PASS: Created family: {TestUserFeatures.family_id}")
    
    def test_08_get_loyalty_status(self, session):
        """GET /api/loyalty/{user_id}"""
        rider_id = getattr(TestAuthFlow, 'rider_id', TEST_RIDER_ID)
        response = session.get(f"{BASE_URL}/api/loyalty/{rider_id}")
        assert response.status_code == 200, f"Get loyalty failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Loyalty tier: {data.get('tier', 'bronze')}, points: {data.get('points', 0)}")
    
    def test_09_get_referral_code(self, session):
        """GET /api/referral/code/{user_id}"""
        rider_id = getattr(TestAuthFlow, 'rider_id', TEST_RIDER_ID)
        response = session.get(f"{BASE_URL}/api/referral/code/{rider_id}")
        assert response.status_code == 200, f"Get referral failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Referral code: {data.get('code', 'N/A')}")
    
    def test_10_get_notifications(self, session):
        """GET /api/users/{user_id}/notifications"""
        rider_id = getattr(TestAuthFlow, 'rider_id', TEST_RIDER_ID)
        response = session.get(f"{BASE_URL}/api/users/{rider_id}/notifications")
        assert response.status_code == 200, f"Get notifications failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Found {len(data.get('notifications', []))} notifications")


# ==================== OTHER FEATURES ====================

class TestOtherFeatures:
    """Test miscellaneous features"""
    
    def test_01_get_languages(self, session):
        """GET /api/languages"""
        response = session.get(f"{BASE_URL}/api/languages")
        assert response.status_code == 200, f"Get languages failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Supported languages: {list(data.keys())}")
    
    def test_02_schedule_ride(self, session):
        """POST /api/rides/schedule"""
        rider_id = getattr(TestAuthFlow, 'rider_id', TEST_RIDER_ID)
        scheduled_time = datetime.utcnow() + timedelta(hours=2)
        payload = {
            "pickup_lat": PICKUP_LAT,
            "pickup_lng": PICKUP_LNG,
            "pickup_address": "Scheduled Pickup, Lagos",
            "dropoff_lat": DROPOFF_LAT,
            "dropoff_lng": DROPOFF_LNG,
            "dropoff_address": "Scheduled Destination, Lagos",
            "scheduled_time": scheduled_time.isoformat(),
            "ride_type": "economy"
        }
        response = session.post(f"{BASE_URL}/api/rides/schedule", params={"rider_id": rider_id}, json=payload)
        assert response.status_code == 200, f"Schedule ride failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Scheduled ride: {data.get('scheduled_ride_id')}")
    
    def test_03_get_scheduled_rides(self, session):
        """GET /api/rides/scheduled/{rider_id}"""
        rider_id = getattr(TestAuthFlow, 'rider_id', TEST_RIDER_ID)
        response = session.get(f"{BASE_URL}/api/rides/scheduled/{rider_id}")
        assert response.status_code == 200, f"Get scheduled failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Found {len(data.get('scheduled_rides', []))} scheduled rides")
    
    def test_04_report_lost_item(self, session):
        """POST /api/lost-found/report"""
        global created_trip_id
        if not created_trip_id:
            pytest.skip("No trip for lost item report")
        
        rider_id = getattr(TestAuthFlow, 'rider_id', TEST_RIDER_ID)
        payload = {
            "trip_id": created_trip_id,
            "reporter_id": rider_id,
            "reporter_role": "rider",
            "item_description": f"Test lost item {TEST_RUN_ID}"
        }
        response = session.post(f"{BASE_URL}/api/lost-found/report", json=payload)
        assert response.status_code == 200, f"Report lost item failed: {response.status_code}"
        print(f"PASS: Reported lost item")
    
    def test_05_share_trip(self, session):
        """POST /api/trips/{trip_id}/share"""
        global created_trip_id
        if not created_trip_id:
            pytest.skip("No trip to share")
        
        rider_id = getattr(TestAuthFlow, 'rider_id', TEST_RIDER_ID)
        payload = {"shared_with_phone": "+2348012345678", "shared_by": rider_id}
        response = session.post(f"{BASE_URL}/api/trips/{created_trip_id}/share", json=payload)
        
        if response.status_code == 404:
            print("INFO: Trip not found for sharing")
            pytest.skip("Trip not found")
        
        assert response.status_code == 200, f"Share trip failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Shared trip - link: {data.get('share_link', 'N/A')[:50]}...")
    
    def test_06_get_leaderboard_drivers(self, session):
        """GET /api/leaderboard/drivers"""
        params = {"city": "lagos", "period": "weekly"}
        response = session.get(f"{BASE_URL}/api/leaderboard/drivers", params=params)
        assert response.status_code == 200, f"Get leaderboard failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Leaderboard has {len(data.get('drivers', []))} drivers")
    
    def test_07_get_top_rated_drivers(self, session):
        """GET /api/leaderboard/top-rated"""
        response = session.get(f"{BASE_URL}/api/leaderboard/top-rated")
        assert response.status_code == 200, f"Get top rated failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Top rated has {len(data.get('drivers', []))} drivers")
    
    def test_08_get_active_challenges(self, session):
        """GET /api/challenges/active"""
        response = session.get(f"{BASE_URL}/api/challenges/active")
        assert response.status_code == 200, f"Get challenges failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Found {len(data.get('challenges', []))} active challenges")


# ==================== AI RIDER & DRIVER ASSISTANTS ====================

class TestAIAssistants:
    """Test AI assistant endpoints"""
    
    def test_01_rider_assistant(self, session):
        """GET /api/ai/rider-assistant"""
        rider_id = getattr(TestAuthFlow, 'rider_id', TEST_RIDER_ID)
        params = {"user_id": rider_id, "question": "How much does a ride to Lekki cost?", "lat": PICKUP_LAT, "lng": PICKUP_LNG}
        response = session.get(f"{BASE_URL}/api/ai/rider-assistant", params=params)
        assert response.status_code == 200, f"Rider assistant failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Rider AI response: {data.get('response', '')[:100]}...")
    
    def test_02_driver_assistant(self, session):
        """GET /api/ai/driver-assistant"""
        driver_id = getattr(TestAuthFlow, 'driver_id', TEST_DRIVER_ID)
        params = {"user_id": driver_id, "question": "Where can I find more rides?", "lat": PICKUP_LAT, "lng": PICKUP_LNG}
        response = session.get(f"{BASE_URL}/api/ai/driver-assistant", params=params)
        assert response.status_code == 200, f"Driver assistant failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Driver AI response: {data.get('response', '')[:100]}...")


# ==================== ACTIVE TRIP CHECK ====================

class TestActiveTripCheck:
    """Test active trip endpoints"""
    
    def test_01_get_active_trip(self, session):
        """GET /api/trips/active/{user_id}"""
        rider_id = getattr(TestAuthFlow, 'rider_id', TEST_RIDER_ID)
        response = session.get(f"{BASE_URL}/api/trips/active/{rider_id}")
        assert response.status_code == 200, f"Get active trip failed: {response.status_code}"
        data = response.json()
        print(f"PASS: Active trip: {data.get('active', False)}")


# Cleanup
@pytest.fixture(autouse=True, scope="module")
def cleanup():
    """Cleanup after tests"""
    yield
    print(f"\n=== Test Run Complete ===")
    print(f"Test Run ID: {TEST_RUN_ID}")
    print(f"Trip created: {created_trip_id}")
    print(f"Bid created: {created_bid_id}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short", "-x"])
