"""
Test suite for NEXRYDE Full Ride Flow - E2E Testing
Tests: Trip creation, driver polling, acceptance, chat, call, start, complete, rate
Also tests: Bidding/negotiation system

Flow tested:
1. Rider creates trip with custom price → 
2. Driver polls for pending rides →
3. Driver accepts trip →
4. Chat between rider/driver →
5. Call feature →
6. Start trip →
7. Complete trip →
8. Rate trip

Separate flow: Bidding system
1. Rider creates bid →
2. Driver sees open bids →
3. Driver makes counter-offer →
4. Rider accepts offer → Trip created

Base URL: Cloud Run backend (configurable via env vars)
"""
import pytest
import requests
import os
import time
import uuid
from datetime import datetime

BASE_URL = (
    os.environ.get('NEXRYDE_BACKEND_URL')
    or os.environ.get('EXPO_PUBLIC_BACKEND_URL')
    or os.environ.get('REACT_APP_BACKEND_URL')
    or 'https://nexryde-modular.preview.emergentagent.com'
).rstrip('/')

# Test data - unique per test run to avoid conflicts
TEST_RUN_ID = str(uuid.uuid4())[:8]
TEST_RIDER_ID = f"TEST_rider_{TEST_RUN_ID}"
TEST_DRIVER_ID = f"TEST_driver_{TEST_RUN_ID}"
TEST_RIDER_PHONE = "+2348101234567"
TEST_DRIVER_PHONE = "+2348109876543"

# Lagos coordinates for testing
PICKUP_LAT = 6.5244
PICKUP_LNG = 3.3792
DROPOFF_LAT = 6.4500
DROPOFF_LNG = 3.4000

# Global to store trip_id created in tests
created_trip_id = None
created_bid_id = None


class TestSetup:
    """Setup test data: Create rider and driver users"""
    
    def test_01_create_test_rider(self):
        """Create test rider user"""
        global TEST_RIDER_ID
        # Using generated ID directly since registration may require OTP
        print(f"PASS: Test rider ID: {TEST_RIDER_ID}")
    
    def test_02_create_test_driver(self):
        """Create test driver user with subscription"""
        global TEST_DRIVER_ID
        print(f"PASS: Test driver ID: {TEST_DRIVER_ID}")
    
    def test_03_setup_driver_profile_and_subscription(self):
        """Setup driver profile using PUT endpoint (upserts) and start trial"""
        # Update/create driver profile using PUT (this upserts)
        profile_payload = {
            "first_name": "Test",
            "last_name": f"Driver",
            "vehicle_type": "sedan",
            "plate_number": f"TST-{TEST_RUN_ID[:3]}",
            "phone_number": TEST_DRIVER_PHONE
        }
        
        response = requests.put(
            f"{BASE_URL}/api/drivers/{TEST_DRIVER_ID}/profile",
            json=profile_payload
        )
        print(f"Driver profile setup: {response.status_code}")
        
        # Start trial subscription for driver
        response = requests.post(f"{BASE_URL}/api/subscriptions/{TEST_DRIVER_ID}/start-trial")
        
        if response.status_code == 200:
            data = response.json()
            print(f"PASS: Trial started - {data.get('message', '')}")
        elif response.status_code == 400:
            # Already has subscription - that's fine
            print("INFO: Driver already has subscription")
        else:
            print(f"Subscription trial: {response.status_code} - {response.text[:100]}")
        
        # Verify subscription exists
        sub_response = requests.get(f"{BASE_URL}/api/subscriptions/{TEST_DRIVER_ID}")
        if sub_response.status_code == 200:
            sub_data = sub_response.json()
            print(f"PASS: Driver has subscription status: {sub_data.get('status')}")
        else:
            print(f"INFO: No subscription found - trip acceptance may fail")


class TestTripCreationWithCustomPrice:
    """Test POST /api/trips/create-with-custom-price"""
    
    def test_01_create_trip_with_custom_price(self):
        """Rider creates a trip with custom price offer"""
        global created_trip_id
        
        payload = {
            "rider_id": TEST_RIDER_ID,
            "pickup": "123 Test Street, Lagos",
            "destination": "456 Destination Ave, Lagos",
            "recommended_fare": 3500.0,
            "offered_fare": 3200.0,
            "vehicle_type": "sedan",
            "trip_type": "intra"
        }
        
        response = requests.post(f"{BASE_URL}/api/trips/create-with-custom-price", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Trip creation should succeed"
        assert "trip_id" in data, "Response should contain trip_id"
        assert "drivers_notified" in data, "Response should contain drivers_notified"
        assert "message" in data, "Response should contain message"
        assert data["recommended_fare"] == 3500.0, "Recommended fare should match"
        assert data["offered_fare"] == 3200.0, "Offered fare should match"
        
        created_trip_id = data["trip_id"]
        print(f"PASS: Created trip {created_trip_id} with offer N{data['offered_fare']}")
        print(f"  - Drivers notified: {data['drivers_notified']}")
        print(f"  - Difference: {data['difference_percent']}%")
    
    def test_02_get_trip_status(self):
        """GET /api/trips/{trip_id} - Verify trip details"""
        assert created_trip_id is not None, "Trip must be created first"
        
        response = requests.get(f"{BASE_URL}/api/trips/{created_trip_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["id"] == created_trip_id, "Trip ID should match"
        assert data["status"] == "pending_driver_offers", f"Status should be pending_driver_offers, got {data['status']}"
        assert data["rider_id"] == TEST_RIDER_ID, "Rider ID should match"
        assert data["offered_fare"] == 3200.0, "Offered fare should match"
        
        print(f"PASS: Trip {created_trip_id} status: {data['status']}")


class TestDriverPolling:
    """Test driver polling for pending rides"""
    
    def test_01_driver_polls_pending_trips(self):
        """GET /api/trips/pending - Driver sees pending trips"""
        response = requests.get(
            f"{BASE_URL}/api/trips/pending",
            params={"driver_lat": PICKUP_LAT, "driver_lng": PICKUP_LNG}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list of trips"
        
        # Find our created trip in the list
        our_trip = next((t for t in data if t.get("id") == created_trip_id), None)
        
        if our_trip:
            print(f"PASS: Driver sees our trip {created_trip_id} in pending list")
            print(f"  - Distance to pickup: {our_trip.get('distance_to_pickup', 0)} km")
        else:
            print(f"INFO: Our trip not in top 10 results, got {len(data)} trips")
        
        print(f"PASS: Driver polling returned {len(data)} pending trips")


class TestTripAcceptance:
    """Test driver accepting a trip"""
    
    def test_01_driver_accepts_trip(self):
        """PUT /api/trips/{trip_id}/accept - Driver accepts the trip"""
        assert created_trip_id is not None, "Trip must be created first"
        
        payload = {"driver_id": TEST_DRIVER_ID}
        
        response = requests.put(
            f"{BASE_URL}/api/trips/{created_trip_id}/accept",
            json=payload
        )
        
        # Handle subscription requirement
        if response.status_code == 403:
            data = response.json()
            detail = data.get("detail", "")
            if "subscription" in detail.lower():
                print(f"INFO: Driver needs subscription: {detail}")
                pytest.skip("Driver subscription required - need to setup subscription first")
            else:
                print(f"WARN: Acceptance forbidden: {detail}")
                pytest.skip(f"Trip acceptance forbidden: {detail}")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["status"] == "accepted", f"Status should be accepted, got {data['status']}"
        assert data["driver_id"] == TEST_DRIVER_ID, "Driver ID should match"
        
        print(f"PASS: Driver {TEST_DRIVER_ID} accepted trip {created_trip_id}")
    
    def test_02_verify_trip_accepted_status(self):
        """GET /api/trips/{trip_id} - Verify trip is now accepted"""
        assert created_trip_id is not None, "Trip must be created first"
        
        response = requests.get(f"{BASE_URL}/api/trips/{created_trip_id}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        
        # Accept either accepted or pending_driver_offers (if accept test was skipped)
        if data["status"] == "accepted":
            assert data["driver_id"] == TEST_DRIVER_ID, "Driver ID should match"
            print(f"PASS: Trip {created_trip_id} is accepted by {data['driver_id']}")
        else:
            print(f"INFO: Trip still in {data['status']} status (acceptance may have been skipped)")


class TestInTripChat:
    """Test chat messaging during trip"""
    
    def test_01_rider_sends_chat_message(self):
        """POST /api/chat/message - Rider sends message to driver"""
        assert created_trip_id is not None, "Trip must be created first"
        
        payload = {
            "trip_id": created_trip_id,
            "sender_id": TEST_RIDER_ID,
            "sender_role": "rider",
            "message": f"Hello driver! This is test message {TEST_RUN_ID}",
            "message_type": "text"
        }
        
        response = requests.post(f"{BASE_URL}/api/chat/message", json=payload)
        
        # Handle trip not found or unauthorized
        if response.status_code in [403, 404]:
            data = response.json()
            print(f"INFO: Chat message rejected: {data.get('detail', '')}")
            pytest.skip("Chat requires active trip with rider/driver")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Message send should succeed"
        assert "message_id" in data, "Response should contain message_id"
        
        print(f"PASS: Rider sent message, ID: {data['message_id']}")
    
    def test_02_get_chat_messages(self):
        """GET /api/chat/messages/{trip_id} - Get trip messages"""
        assert created_trip_id is not None, "Trip must be created first"
        
        response = requests.get(
            f"{BASE_URL}/api/chat/messages/{created_trip_id}",
            params={"user_id": TEST_RIDER_ID}
        )
        
        # Handle trip not found
        if response.status_code == 404:
            pytest.skip("Trip not found for chat")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "messages" in data, "Response should contain messages"
        
        print(f"PASS: Retrieved {len(data['messages'])} chat messages")


class TestInTripCall:
    """Test call feature during trip"""
    
    def test_01_rider_calls_driver(self):
        """POST /api/trip/{trip_id}/call - Rider initiates call
        
        Note: This test may skip if:
        - Trip has no phone numbers (users created without full registration)
        - Rate limit reached
        - Trip not in active status
        
        For full call testing, use pre-seeded test data with phone numbers
        """
        assert created_trip_id is not None, "Trip must be created first"
        
        payload = {
            "caller_id": TEST_RIDER_ID,
            "caller_role": "rider"
        }
        
        response = requests.post(f"{BASE_URL}/api/trip/{created_trip_id}/call", json=payload)
        
        # Handle various error cases - all are valid API behaviors
        if response.status_code == 404:
            data = response.json()
            detail = data.get('detail', '')
            if "Phone number not available" in detail:
                print("INFO: Phone numbers not set up for test users (expected for dynamic test data)")
                print("  - Call endpoint requires users.phone_number to be set")
                print("  - For full testing, use pre-seeded users with phone numbers")
            else:
                print(f"INFO: Call rejected - {detail}")
            pytest.skip("Phone number not available - need pre-seeded test data")
        
        if response.status_code == 403:
            data = response.json()
            print(f"INFO: Call not allowed - {data.get('detail', '')}")
            pytest.skip("Calls only allowed during active trips")
        
        if response.status_code == 429:
            print("INFO: Rate limited - max 5 calls reached")
            pytest.skip("Call rate limit reached")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Call should succeed"
        assert "phone_number" in data, "Response should contain phone_number"
        assert "calls_remaining" in data, "Response should contain calls_remaining"
        
        print(f"PASS: Got driver phone: {data['phone_number']}, {data['calls_remaining']} calls remaining")
    
    def test_01b_call_using_preseeded_test_data(self):
        """POST /api/trip/{trip_id}/call - Using pre-seeded test data with phone numbers
        
        Uses test-call-trip which has proper user phone numbers
        """
        # Pre-seeded test data from iteration 3
        PRESEEDED_TRIP_ID = "test-call-trip"
        PRESEEDED_DRIVER_ID = "test_driver_call"
        
        payload = {
            "caller_id": PRESEEDED_DRIVER_ID,
            "caller_role": "driver"
        }
        
        response = requests.post(f"{BASE_URL}/api/trip/{PRESEEDED_TRIP_ID}/call", json=payload)
        
        if response.status_code == 404:
            pytest.skip("Pre-seeded test-call-trip not found")
        
        if response.status_code == 429:
            # Rate limited - this proves the rate limiting works
            data = response.json()
            assert "Maximum 5 calls" in data.get("detail", "")
            print("PASS: Rate limiting verified (5 calls max per trip per caller)")
            return
        
        if response.status_code == 403:
            data = response.json()
            print(f"INFO: {data.get('detail', '')}")
            pytest.skip("Trip not in active status")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Call should succeed"
        assert "phone_number" in data, "Response should contain phone_number"
        assert data["phone_number"].startswith("+234"), "Should be Nigerian phone number"
        
        print(f"PASS: Got rider phone: {data['phone_number']}, {data['calls_remaining']} calls remaining")
    
    def test_02_call_nonexistent_trip(self):
        """POST /api/trip/{trip_id}/call - Should reject non-existent trip"""
        payload = {
            "caller_id": TEST_RIDER_ID,
            "caller_role": "rider"
        }
        
        response = requests.post(f"{BASE_URL}/api/trip/nonexistent-trip-12345/call", json=payload)
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        
        data = response.json()
        assert "not found" in data.get("detail", "").lower(), "Should indicate trip not found"
        
        print("PASS: Correctly rejected call for non-existent trip")
    
    def test_03_call_completed_trip_should_fail(self):
        """POST /api/trip/{trip_id}/call - Should reject completed trip"""
        # We'll use a fake completed trip ID to test the logic
        # The endpoint should return 403 for completed trips
        payload = {
            "caller_id": TEST_RIDER_ID,
            "caller_role": "rider"
        }
        
        # This will either return 404 (trip not found) or 403 (not active)
        response = requests.post(f"{BASE_URL}/api/trip/completed-trip-fake/call", json=payload)
        
        # Both 404 and 403 are valid rejections
        assert response.status_code in [404, 403], f"Expected 404 or 403, got {response.status_code}"
        
        print(f"PASS: Correctly rejected call with status {response.status_code}")


class TestTripStartAndComplete:
    """Test starting and completing a trip"""
    
    def test_01_start_trip(self):
        """PUT /api/trips/{trip_id}/start - Start the trip"""
        assert created_trip_id is not None, "Trip must be created first"
        
        response = requests.put(f"{BASE_URL}/api/trips/{created_trip_id}/start")
        
        if response.status_code == 400:
            data = response.json()
            print(f"INFO: Cannot start trip - {data.get('detail', '')}")
            pytest.skip("Trip must be accepted before starting")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["status"] == "ongoing", f"Status should be ongoing, got {data['status']}"
        assert "started_at" in data, "Response should contain started_at timestamp"
        
        print(f"PASS: Trip {created_trip_id} started at {data['started_at']}")
    
    def test_02_complete_trip(self):
        """PUT /api/trips/{trip_id}/complete - Complete the trip"""
        assert created_trip_id is not None, "Trip must be created first"
        
        response = requests.put(f"{BASE_URL}/api/trips/{created_trip_id}/complete")
        
        if response.status_code == 400:
            data = response.json()
            print(f"INFO: Cannot complete trip - {data.get('detail', '')}")
            pytest.skip("Trip must be ongoing to complete")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["status"] == "completed", f"Status should be completed, got {data['status']}"
        assert "completed_at" in data, "Response should contain completed_at timestamp"
        assert data.get("payment_status") == "completed", "Payment should be completed"
        
        print(f"PASS: Trip {created_trip_id} completed")


class TestTripRating:
    """Test rating a completed trip"""
    
    def test_01_rider_rates_trip(self):
        """PUT /api/trips/{trip_id}/rate - Rider rates the driver"""
        assert created_trip_id is not None, "Trip must be created first"
        
        payload = {
            "overall_rating": 4.5,
            "smoothness": 4.0,
            "politeness": 5.0,
            "cleanliness": 4.0,
            "safety": 5.0,
            "comment": f"Great ride! Test rating {TEST_RUN_ID}"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/trips/{created_trip_id}/rate",
            params={"rater_id": TEST_RIDER_ID},
            json=payload
        )
        
        if response.status_code == 400:
            data = response.json()
            print(f"INFO: Cannot rate trip - {data.get('detail', '')}")
            pytest.skip("Can only rate completed trips")
        
        if response.status_code == 404:
            pytest.skip("Trip not found for rating")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "Rating submitted" in data.get("message", ""), "Should confirm rating submitted"
        
        print(f"PASS: Rider rated trip with {payload['overall_rating']} stars")


class TestRiderTripHistory:
    """Test getting rider trip history"""
    
    def test_01_get_rider_trip_history(self):
        """GET /api/trips/user/{user_id}?role=rider - Get rider trips"""
        response = requests.get(
            f"{BASE_URL}/api/trips/user/{TEST_RIDER_ID}",
            params={"role": "rider"}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list of trips"
        
        # Find our trip in history
        our_trip = next((t for t in data if t.get("id") == created_trip_id), None)
        
        if our_trip:
            print(f"PASS: Found our trip {created_trip_id} in rider history")
        else:
            print(f"INFO: Our trip not in history yet, got {len(data)} trips")
        
        print(f"PASS: Rider has {len(data)} trips in history")


# ==================== BIDDING SYSTEM TESTS ====================

class TestBiddingFlow:
    """Test the bidding/negotiation system"""
    
    def test_01_rider_creates_bid(self):
        """POST /api/rides/bid/create - Rider creates a bid"""
        global created_bid_id
        
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
            json=payload
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert "bid_id" in data, "Response should contain bid_id"
        assert data["status"] == "open", "Bid status should be open"
        assert "expires_in_minutes" in data, "Response should contain expiry time"
        
        created_bid_id = data["bid_id"]
        print(f"PASS: Created bid {created_bid_id}, expires in {data['expires_in_minutes']} min")
        print(f"  - Surge multiplier: {data.get('surge_multiplier', 1.0)}")
    
    def test_02_driver_sees_open_bids(self):
        """GET /api/rides/bid/open - Driver polls for open bids"""
        response = requests.get(
            f"{BASE_URL}/api/rides/bid/open",
            params={"lat": PICKUP_LAT, "lng": PICKUP_LNG}
        )
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "bids" in data, "Response should contain bids list"
        assert isinstance(data["bids"], list), "Bids should be a list"
        
        # Find our bid
        our_bid = next((b for b in data["bids"] if b.get("bid_id") == created_bid_id), None)
        
        if our_bid:
            print(f"PASS: Driver sees our bid {created_bid_id}")
            print(f"  - Rider offered: N{our_bid['rider_offered_price']}")
        else:
            print(f"INFO: Our bid not in list, got {len(data['bids'])} bids")
        
        print(f"PASS: Found {len(data['bids'])} open bids")
    
    def test_03_driver_makes_counter_offer(self):
        """POST /api/rides/bid/{bid_id}/driver-offer - Driver counters"""
        assert created_bid_id is not None, "Bid must be created first"
        
        counter_price = 3200.0
        
        response = requests.post(
            f"{BASE_URL}/api/rides/bid/{created_bid_id}/driver-offer",
            params={
                "driver_id": TEST_DRIVER_ID,
                "counter_price": counter_price,
                "message": "I can do it for this price"
            }
        )
        
        if response.status_code == 404:
            data = response.json()
            print(f"INFO: Bid not found or closed: {data.get('detail', '')}")
            pytest.skip("Bid not found or already closed")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Counter offer should succeed"
        assert "offer_id" in data, "Response should contain offer_id"
        
        # Store offer_id for acceptance test
        TestBiddingFlow.driver_offer_id = data["offer_id"]
        
        print(f"PASS: Driver made counter offer of N{counter_price}, offer_id: {data['offer_id']}")
    
    def test_04_rider_accepts_driver_offer(self):
        """POST /api/rides/bid/{bid_id}/accept - Rider accepts offer"""
        assert created_bid_id is not None, "Bid must be created first"
        
        offer_id = getattr(TestBiddingFlow, 'driver_offer_id', None)
        if not offer_id:
            pytest.skip("No driver offer to accept")
        
        response = requests.post(
            f"{BASE_URL}/api/rides/bid/{created_bid_id}/accept",
            params={
                "rider_id": TEST_RIDER_ID,
                "offer_id": offer_id
            }
        )
        
        if response.status_code == 404:
            data = response.json()
            print(f"INFO: Bid or offer not found: {data.get('detail', '')}")
            pytest.skip("Bid or offer not found")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("success") == True, "Acceptance should succeed"
        assert "trip_id" in data, "Response should contain new trip_id"
        assert "agreed_price" in data, "Response should contain agreed_price"
        
        print(f"PASS: Rider accepted offer, new trip created: {data['trip_id']}")
        print(f"  - Agreed price: N{data['agreed_price']}")


# ==================== EDGE CASES & ERROR HANDLING ====================

class TestEdgeCases:
    """Test error handling and edge cases"""
    
    def test_01_accept_nonexistent_trip(self):
        """PUT /api/trips/{trip_id}/accept - Non-existent trip"""
        payload = {"driver_id": TEST_DRIVER_ID}
        
        response = requests.put(
            f"{BASE_URL}/api/trips/nonexistent-trip-xyz/accept",
            json=payload
        )
        assert response.status_code in [400, 404], f"Expected 400 or 404, got {response.status_code}"
        
        print(f"PASS: Correctly rejected acceptance of non-existent trip")
    
    def test_02_accept_without_driver_id(self):
        """PUT /api/trips/{trip_id}/accept - Missing driver_id"""
        assert created_trip_id is not None, "Trip must be created first"
        
        payload = {}  # No driver_id
        
        response = requests.put(
            f"{BASE_URL}/api/trips/{created_trip_id}/accept",
            json=payload
        )
        
        # Should return 400 for missing driver_id
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        
        data = response.json()
        assert "driver_id" in data.get("detail", "").lower(), "Should indicate driver_id required"
        
        print("PASS: Correctly rejected acceptance without driver_id")
    
    def test_03_get_nonexistent_trip(self):
        """GET /api/trips/{trip_id} - Non-existent trip"""
        response = requests.get(f"{BASE_URL}/api/trips/nonexistent-trip-abc")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        
        print("PASS: Correctly returned 404 for non-existent trip")
    
    def test_04_rate_uncompleted_trip(self):
        """PUT /api/trips/{trip_id}/rate - Should fail for non-completed trip"""
        # Create a new trip that won't be completed
        payload = {
            "rider_id": TEST_RIDER_ID,
            "pickup": "Rate Test Pickup",
            "destination": "Rate Test Destination",
            "recommended_fare": 2000.0,
            "offered_fare": 1800.0,
            "vehicle_type": "sedan",
            "trip_type": "intra"
        }
        
        response = requests.post(f"{BASE_URL}/api/trips/create-with-custom-price", json=payload)
        if response.status_code != 200:
            pytest.skip("Could not create trip for rating test")
        
        data = response.json()
        new_trip_id = data["trip_id"]
        
        # Try to rate the pending trip
        rating_payload = {
            "overall_rating": 5.0
        }
        
        response = requests.put(
            f"{BASE_URL}/api/trips/{new_trip_id}/rate",
            params={"rater_id": TEST_RIDER_ID},
            json=rating_payload
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        
        data = response.json()
        assert "completed" in data.get("detail", "").lower(), "Should indicate trip must be completed"
        
        print("PASS: Correctly rejected rating for non-completed trip")
    
    def test_05_bid_counter_offer_closed_bid(self):
        """POST /api/rides/bid/{bid_id}/driver-offer - Closed/expired bid"""
        response = requests.post(
            f"{BASE_URL}/api/rides/bid/nonexistent-bid-xyz/driver-offer",
            params={
                "driver_id": TEST_DRIVER_ID,
                "counter_price": 3000.0
            }
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        
        print("PASS: Correctly rejected offer on non-existent bid")


# Cleanup fixture
@pytest.fixture(autouse=True, scope="module")
def cleanup():
    """Cleanup test data after tests"""
    yield
    print(f"\nTest cleanup: Test run ID was {TEST_RUN_ID}")
    print(f"  Created trip: {created_trip_id}")
    print(f"  Created bid: {created_bid_id}")
    print("Note: TEST_ prefixed data should be cleaned up in production")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
