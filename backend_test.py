#!/usr/bin/env python3
"""
NEXRYDE Backend API Testing Suite
Comprehensive testing of all 37 backend API endpoints
"""

import asyncio
import aiohttp
import json
import base64
import os
from datetime import datetime
from typing import Dict, Any, List

# Backend URL from environment
BACKEND_URL = "https://nexryde-restore.preview.emergentagent.com/api"

# Test data
TEST_PHONE = "+2348012345678"
TEST_DRIVER_ID = "user_admoblord_1770020814990"
TEST_USER_ID = "test_user_123"

class NexrydeAPITester:
    def __init__(self):
        self.session = None
        self.results = []
        self.test_otp = None
        self.session_token = None
        
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    def log_result(self, endpoint: str, method: str, status: str, details: str = ""):
        """Log test result"""
        result = {
            "endpoint": endpoint,
            "method": method,
            "status": status,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        self.results.append(result)
        
        # Print result
        status_emoji = "✅" if status == "WORKING" else "⚠️" if status == "PARTIAL" else "❌"
        print(f"{status_emoji} {method} {endpoint} - {status}")
        if details:
            print(f"   Details: {details}")
    
    async def make_request(self, method: str, endpoint: str, data: Dict = None, headers: Dict = None) -> Dict:
        """Make HTTP request and return response"""
        url = f"{BACKEND_URL}{endpoint}"
        
        default_headers = {"Content-Type": "application/json"}
        if headers:
            default_headers.update(headers)
            
        try:
            async with self.session.request(
                method=method,
                url=url,
                json=data if data else None,
                headers=default_headers,
                timeout=30
            ) as response:
                try:
                    response_data = await response.json()
                except:
                    response_data = {"text": await response.text()}
                
                return {
                    "status_code": response.status,
                    "data": response_data,
                    "success": 200 <= response.status < 300
                }
        except Exception as e:
            return {
                "status_code": 0,
                "data": {"error": str(e)},
                "success": False
            }
    
    # ==================== AUTHENTICATION TESTS ====================
    
    async def test_send_otp(self):
        """Test POST /api/auth/send-otp"""
        response = await self.make_request("POST", "/auth/send-otp", {
            "phone": TEST_PHONE
        })
        
        if response["success"]:
            # Extract OTP from response for testing
            if "otp" in response["data"]:
                self.test_otp = response["data"]["otp"]
            self.log_result("/auth/send-otp", "POST", "WORKING", 
                          f"OTP sent successfully. Provider: {response['data'].get('provider', 'unknown')}")
        else:
            self.log_result("/auth/send-otp", "POST", "BROKEN", 
                          f"Failed: {response['data']}")
    
    async def test_verify_otp(self):
        """Test POST /api/auth/verify-otp"""
        if not self.test_otp:
            self.log_result("/auth/verify-otp", "POST", "BROKEN", "No OTP available from send-otp test")
            return
            
        response = await self.make_request("POST", "/auth/verify-otp", {
            "phone": TEST_PHONE,
            "otp": self.test_otp
        })
        
        if response["success"]:
            self.log_result("/auth/verify-otp", "POST", "WORKING", 
                          f"OTP verified. New user: {response['data'].get('is_new_user', False)}")
        else:
            self.log_result("/auth/verify-otp", "POST", "BROKEN", 
                          f"Failed: {response['data']}")
    
    async def test_register(self):
        """Test POST /api/auth/register"""
        response = await self.make_request("POST", "/auth/register", {
            "phone": TEST_PHONE,
            "name": "Test Driver",
            "email": "testdriver@nexryde.com",
            "role": "driver"
        })
        
        if response["success"]:
            self.log_result("/auth/register", "POST", "WORKING", "User registered successfully")
        elif response["status_code"] == 400 and "already exists" in str(response["data"]):
            self.log_result("/auth/register", "POST", "WORKING", "User already exists (expected)")
        else:
            self.log_result("/auth/register", "POST", "BROKEN", f"Failed: {response['data']}")
    
    async def test_google_oauth(self):
        """Test POST /api/auth/google/exchange"""
        response = await self.make_request("POST", "/auth/google/exchange", {
            "session_id": "invalid_session_for_testing"
        })
        
        if response["status_code"] == 401:
            self.log_result("/auth/google/exchange", "POST", "WORKING", "Correctly rejects invalid session")
        elif response["success"]:
            self.log_result("/auth/google/exchange", "POST", "WORKING", "Google OAuth working")
        else:
            self.log_result("/auth/google/exchange", "POST", "PARTIAL", f"Response: {response['data']}")
    
    async def test_logout(self):
        """Test POST /api/auth/logout"""
        response = await self.make_request("POST", "/auth/logout")
        
        if response["success"]:
            self.log_result("/auth/logout", "POST", "WORKING", "Logout successful")
        else:
            self.log_result("/auth/logout", "POST", "BROKEN", f"Failed: {response['data']}")
    
    # ==================== USER TESTS ====================
    
    async def test_get_user_profile(self):
        """Test GET /api/users/{user_id}"""
        response = await self.make_request("GET", f"/users/{TEST_DRIVER_ID}")
        
        if response["success"]:
            user_data = response["data"]
            self.log_result("/users/{user_id}", "GET", "WORKING", 
                          f"User found: {user_data.get('name', 'Unknown')}")
        elif response["status_code"] == 404:
            self.log_result("/users/{user_id}", "GET", "PARTIAL", "User not found (expected for test ID)")
        else:
            self.log_result("/users/{user_id}", "GET", "BROKEN", f"Failed: {response['data']}")
    
    async def test_update_user_profile(self):
        """Test PUT /api/users/{user_id}"""
        response = await self.make_request("PUT", f"/users/{TEST_DRIVER_ID}", {
            "name": "Updated Test Driver",
            "email": "updated@nexryde.com"
        })
        
        if response["success"]:
            self.log_result("/users/{user_id}", "PUT", "WORKING", "Profile updated successfully")
        elif response["status_code"] == 404:
            self.log_result("/users/{user_id}", "PUT", "PARTIAL", "User not found (expected for test ID)")
        else:
            self.log_result("/users/{user_id}", "PUT", "BROKEN", f"Failed: {response['data']}")
    
    async def test_upload_profile_picture(self):
        """Test POST /api/users/{user_id}/profile-picture"""
        # Create a small base64 image for testing
        test_image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
        
        response = await self.make_request("POST", f"/users/{TEST_DRIVER_ID}/profile-picture", {
            "image": test_image
        })
        
        if response["success"]:
            self.log_result("/users/{user_id}/profile-picture", "POST", "WORKING", "Profile picture uploaded")
        elif response["status_code"] == 404:
            self.log_result("/users/{user_id}/profile-picture", "POST", "PARTIAL", "User not found (expected)")
        else:
            self.log_result("/users/{user_id}/profile-picture", "POST", "BROKEN", f"Failed: {response['data']}")
    
    async def test_add_emergency_contact(self):
        """Test POST /api/users/{user_id}/emergency-contacts"""
        response = await self.make_request("POST", f"/users/{TEST_DRIVER_ID}/emergency-contacts", {
            "name": "Emergency Contact",
            "phone": "+2348087654321",
            "relationship": "Family"
        })
        
        if response["success"]:
            self.log_result("/users/{user_id}/emergency-contacts", "POST", "WORKING", "Emergency contact added")
        elif response["status_code"] == 404:
            self.log_result("/users/{user_id}/emergency-contacts", "POST", "PARTIAL", "User not found (expected)")
        else:
            self.log_result("/users/{user_id}/emergency-contacts", "POST", "BROKEN", f"Failed: {response['data']}")
    
    async def test_get_emergency_contacts(self):
        """Test GET /api/users/{user_id}/emergency-contacts"""
        response = await self.make_request("GET", f"/users/{TEST_DRIVER_ID}/emergency-contacts")
        
        if response["success"]:
            contacts = response["data"].get("contacts", [])
            self.log_result("/users/{user_id}/emergency-contacts", "GET", "WORKING", 
                          f"Retrieved {len(contacts)} emergency contacts")
        elif response["status_code"] == 404:
            self.log_result("/users/{user_id}/emergency-contacts", "GET", "PARTIAL", "User not found (expected)")
        else:
            self.log_result("/users/{user_id}/emergency-contacts", "GET", "BROKEN", f"Failed: {response['data']}")
    
    # ==================== FARE & BOOKING TESTS ====================
    
    async def test_fare_estimate(self):
        """Test POST /api/fare/estimate"""
        # Lagos coordinates for testing
        response = await self.make_request("POST", "/fare/estimate", {
            "pickup_lat": 6.5244,
            "pickup_lng": 3.3792,
            "dropoff_lat": 6.4281,
            "dropoff_lng": 3.4219,
            "service_type": "economy"
        })
        
        if response["success"]:
            fare_data = response["data"]
            self.log_result("/fare/estimate", "POST", "WORKING", 
                          f"Fare: ₦{fare_data.get('total_fare', 0)}, Distance: {fare_data.get('distance_km', 0)}km")
        else:
            self.log_result("/fare/estimate", "POST", "BROKEN", f"Failed: {response['data']}")
    
    async def test_surge_status(self):
        """Test GET /api/surge/check"""
        response = await self.make_request("GET", "/surge/check?lat=6.5244&lng=3.3792")
        
        if response["success"]:
            surge_data = response["data"]
            self.log_result("/surge/check", "GET", "WORKING", 
                          f"Surge multiplier: {surge_data.get('multiplier', 1.0)}x")
        else:
            self.log_result("/surge/check", "GET", "BROKEN", f"Failed: {response['data']}")
    
    async def test_request_trip(self):
        """Test POST /api/trips/request"""
        response = await self.make_request("POST", f"/trips/request?rider_id={TEST_USER_ID}", {
            "pickup_lat": 6.5244,
            "pickup_lng": 3.3792,
            "pickup_address": "Victoria Island, Lagos",
            "dropoff_lat": 6.4281,
            "dropoff_lng": 3.4219,
            "dropoff_address": "Lekki Phase 1, Lagos",
            "service_type": "economy",
            "payment_method": "cash"
        })
        
        if response["success"]:
            trip_data = response["data"]
            self.log_result("/trips/request", "POST", "WORKING", 
                          f"Trip requested: {trip_data.get('id', 'unknown')}")
        else:
            self.log_result("/trips/request", "POST", "BROKEN", f"Failed: {response['data']}")
    
    async def test_get_trip_details(self):
        """Test GET /api/trips/{trip_id}"""
        test_trip_id = "test_trip_123"
        response = await self.make_request("GET", f"/trips/{test_trip_id}")
        
        if response["success"]:
            self.log_result("/trips/{trip_id}", "GET", "WORKING", "Trip details retrieved")
        elif response["status_code"] == 404:
            self.log_result("/trips/{trip_id}", "GET", "WORKING", "Trip not found (expected for test ID)")
        else:
            self.log_result("/trips/{trip_id}", "GET", "BROKEN", f"Failed: {response['data']}")
    
    async def test_cancel_trip(self):
        """Test POST /api/trips/{trip_id}/cancel"""
        test_trip_id = "test_trip_123"
        response = await self.make_request("POST", f"/trips/{test_trip_id}/cancel", {
            "reason": "Testing cancellation"
        })
        
        if response["success"]:
            self.log_result("/trips/{trip_id}/cancel", "POST", "WORKING", "Trip cancelled successfully")
        elif response["status_code"] == 404:
            self.log_result("/trips/{trip_id}/cancel", "POST", "WORKING", "Trip not found (expected)")
        else:
            self.log_result("/trips/{trip_id}/cancel", "POST", "BROKEN", f"Failed: {response['data']}")
    
    # ==================== DRIVER TESTS ====================
    
    async def test_driver_stats(self):
        """Test GET /api/drivers/{driver_id}/stats"""
        response = await self.make_request("GET", f"/drivers/{TEST_DRIVER_ID}/stats")
        
        if response["success"]:
            stats = response["data"]
            self.log_result("/drivers/{driver_id}/stats", "GET", "WORKING", 
                          f"Earnings: ₦{stats.get('total_earnings', 0)}, Trips: {stats.get('total_trips', 0)}")
        elif response["status_code"] == 404:
            self.log_result("/drivers/{driver_id}/stats", "GET", "PARTIAL", "Driver not found (expected)")
        else:
            self.log_result("/drivers/{driver_id}/stats", "GET", "BROKEN", f"Failed: {response['data']}")
    
    async def test_driver_online_toggle(self):
        """Test PUT /api/drivers/{driver_id}/online"""
        response = await self.make_request("PUT", f"/drivers/{TEST_DRIVER_ID}/online", {
            "is_online": True
        })
        
        if response["success"]:
            self.log_result("/drivers/{driver_id}/online", "PUT", "WORKING", "Online status updated")
        elif response["status_code"] == 404:
            self.log_result("/drivers/{driver_id}/online", "PUT", "PARTIAL", "Driver not found (expected)")
        else:
            self.log_result("/drivers/{driver_id}/online", "PUT", "BROKEN", f"Failed: {response['data']}")
    
    async def test_update_driver_location(self):
        """Test PUT /api/drivers/{driver_id}/location"""
        response = await self.make_request("PUT", f"/drivers/{TEST_DRIVER_ID}/location", {
            "latitude": 6.5244,
            "longitude": 3.3792
        })
        
        if response["success"]:
            self.log_result("/drivers/{driver_id}/location", "PUT", "WORKING", "Location updated")
        elif response["status_code"] == 404:
            self.log_result("/drivers/{driver_id}/location", "PUT", "PARTIAL", "Driver not found (expected)")
        else:
            self.log_result("/drivers/{driver_id}/location", "PUT", "BROKEN", f"Failed: {response['data']}")
    
    async def test_register_vehicle(self):
        """Test POST /api/drivers/{driver_id}/vehicle"""
        response = await self.make_request("POST", f"/drivers/{TEST_DRIVER_ID}/vehicle", {
            "make": "Toyota",
            "model": "Camry",
            "year": 2020,
            "color": "Black",
            "plate_number": "ABC123DE",
            "category": "economy"
        })
        
        if response["success"]:
            self.log_result("/drivers/{driver_id}/vehicle", "POST", "WORKING", "Vehicle registered")
        elif response["status_code"] == 404:
            self.log_result("/drivers/{driver_id}/vehicle", "POST", "PARTIAL", "Driver not found (expected)")
        else:
            self.log_result("/drivers/{driver_id}/vehicle", "POST", "BROKEN", f"Failed: {response['data']}")
    
    async def test_get_vehicle_info(self):
        """Test GET /api/drivers/{driver_id}/vehicle"""
        response = await self.make_request("GET", f"/drivers/{TEST_DRIVER_ID}/vehicle")
        
        if response["success"]:
            vehicle = response["data"]
            self.log_result("/drivers/{driver_id}/vehicle", "GET", "WORKING", 
                          f"Vehicle: {vehicle.get('make', 'Unknown')} {vehicle.get('model', '')}")
        elif response["status_code"] == 404:
            self.log_result("/drivers/{driver_id}/vehicle", "GET", "PARTIAL", "Vehicle/Driver not found (expected)")
        else:
            self.log_result("/drivers/{driver_id}/vehicle", "GET", "BROKEN", f"Failed: {response['data']}")
    
    async def test_driver_verification_submit(self):
        """Test POST /api/drivers/verification/submit"""
        response = await self.make_request("POST", "/drivers/verification/submit", {
            "user_id": TEST_DRIVER_ID,
            "personal_info": {
                "fullName": "Test Driver",
                "phone": TEST_PHONE,
                "email": "testdriver@nexryde.com",
                "address": "Lagos, Nigeria",
                "dateOfBirth": "1990-01-01"
            },
            "vehicle_info": {
                "vehicleMake": "Toyota",
                "vehicleModel": "Camry",
                "vehicleYear": 2020,
                "vehicleColor": "Black",
                "plateNumber": "ABC123DE"
            },
            "documents": {
                "nin": "data:image/jpeg;base64,test_nin_image",
                "drivers_license": "data:image/jpeg;base64,test_license_image",
                "passport_photo": "data:image/jpeg;base64,test_passport_image",
                "vehicle_registration": "data:image/jpeg;base64,test_vehicle_reg",
                "insurance": "data:image/jpeg;base64,test_insurance"
            }
        })
        
        if response["success"]:
            self.log_result("/drivers/verification/submit", "POST", "WORKING", "Verification submitted successfully")
        else:
            self.log_result("/drivers/verification/submit", "POST", "BROKEN", f"Failed: {response['data']}")
    
    # ==================== SUBSCRIPTION TESTS ====================
    
    async def test_subscription_config(self):
        """Test GET /api/subscriptions/config"""
        response = await self.make_request("GET", "/subscriptions/config")
        
        if response["success"]:
            config = response["data"]
            self.log_result("/subscriptions/config", "GET", "WORKING", 
                          f"Monthly fee: ₦{config.get('monthly_fee', 0)}")
        else:
            self.log_result("/subscriptions/config", "GET", "BROKEN", f"Failed: {response['data']}")
    
    async def test_subscription_status(self):
        """Test GET /api/subscriptions/{driver_id}"""
        response = await self.make_request("GET", f"/subscriptions/{TEST_DRIVER_ID}")
        
        if response["success"]:
            subscription = response["data"]
            self.log_result("/subscriptions/{driver_id}", "GET", "WORKING", 
                          f"Status: {subscription.get('status', 'unknown')}")
        elif response["status_code"] == 404:
            self.log_result("/subscriptions/{driver_id}", "GET", "PARTIAL", "Subscription not found (expected)")
        else:
            self.log_result("/subscriptions/{driver_id}", "GET", "BROKEN", f"Failed: {response['data']}")
    
    async def test_start_trial(self):
        """Test POST /api/subscriptions/{driver_id}/start-trial"""
        response = await self.make_request("POST", f"/subscriptions/{TEST_DRIVER_ID}/start-trial")
        
        if response["success"]:
            self.log_result("/subscriptions/{driver_id}/start-trial", "POST", "WORKING", "Trial started")
        elif response["status_code"] == 400 and "already" in str(response["data"]).lower():
            self.log_result("/subscriptions/{driver_id}/start-trial", "POST", "WORKING", "Trial already exists (expected)")
        else:
            self.log_result("/subscriptions/{driver_id}/start-trial", "POST", "BROKEN", f"Failed: {response['data']}")
    
    async def test_submit_payment(self):
        """Test POST /api/subscriptions/{driver_id}/submit-payment"""
        test_screenshot = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A8A"
        
        response = await self.make_request("POST", f"/subscriptions/{TEST_DRIVER_ID}/submit-payment", {
            "screenshot": test_screenshot,
            "amount": 25000,
            "payment_reference": "TEST123456"
        })
        
        if response["success"]:
            self.log_result("/subscriptions/{driver_id}/submit-payment", "POST", "WORKING", "Payment submitted")
        elif response["status_code"] == 404:
            self.log_result("/subscriptions/{driver_id}/submit-payment", "POST", "PARTIAL", "Driver not found (expected)")
        else:
            self.log_result("/subscriptions/{driver_id}/submit-payment", "POST", "BROKEN", f"Failed: {response['data']}")
    
    # ==================== GAMIFICATION TESTS ====================
    
    async def test_driver_leaderboard(self):
        """Test GET /api/leaderboard/drivers"""
        response = await self.make_request("GET", "/leaderboard/drivers?city=lagos&period=weekly")
        
        if response["success"]:
            leaderboard = response["data"].get("drivers", [])
            self.log_result("/leaderboard/drivers", "GET", "WORKING", 
                          f"Retrieved {len(leaderboard)} drivers")
        else:
            self.log_result("/leaderboard/drivers", "GET", "BROKEN", f"Failed: {response['data']}")
    
    async def test_active_challenges(self):
        """Test GET /api/challenges/active"""
        response = await self.make_request("GET", "/challenges/active")
        
        if response["success"]:
            challenges = response["data"].get("challenges", [])
            self.log_result("/challenges/active", "GET", "WORKING", 
                          f"Retrieved {len(challenges)} active challenges")
        else:
            self.log_result("/challenges/active", "GET", "BROKEN", f"Failed: {response['data']}")
    
    async def test_driver_streaks(self):
        """Test GET /api/drivers/{driver_id}/streaks"""
        response = await self.make_request("GET", f"/drivers/{TEST_DRIVER_ID}/streaks")
        
        if response["success"]:
            streaks = response["data"]
            self.log_result("/drivers/{driver_id}/streaks", "GET", "WORKING", 
                          f"Current streak: {streaks.get('current_streak', 0)}")
        elif response["status_code"] == 404:
            self.log_result("/drivers/{driver_id}/streaks", "GET", "WORKING", "Driver not found (expected)")
        else:
            self.log_result("/drivers/{driver_id}/streaks", "GET", "BROKEN", f"Failed: {response['data']}")
    
    # ==================== AI & CHAT TESTS ====================
    
    async def test_ai_chat(self):
        """Test POST /api/chat/ai"""
        response = await self.make_request("POST", "/chat/ai", {
            "user_id": TEST_USER_ID,
            "message": "What is the fare from Victoria Island to Lekki?",
            "role": "rider"
        })
        
        if response["success"]:
            ai_response = response["data"].get("response", "")
            self.log_result("/chat/ai", "POST", "WORKING", 
                          f"AI responded: {ai_response[:50]}...")
        else:
            self.log_result("/chat/ai", "POST", "BROKEN", f"Failed: {response['data']}")
    
    async def test_rider_assistant(self):
        """Test GET /api/ai/rider-assistant"""
        response = await self.make_request("GET", "/ai/rider-assistant?question=How%20do%20I%20book%20a%20ride?")
        
        if response["success"]:
            assistant_response = response["data"].get("response", "")
            self.log_result("/ai/rider-assistant", "GET", "WORKING", 
                          f"Assistant responded: {assistant_response[:50]}...")
        else:
            self.log_result("/ai/rider-assistant", "GET", "BROKEN", f"Failed: {response['data']}")
    
    async def test_driver_assistant(self):
        """Test GET /api/ai/driver-assistant"""
        response = await self.make_request("GET", f"/ai/driver-assistant?driver_id={TEST_DRIVER_ID}")
        
        if response["success"]:
            assistant_data = response["data"]
            self.log_result("/ai/driver-assistant", "GET", "WORKING", 
                          f"Insights provided for driver")
        else:
            self.log_result("/ai/driver-assistant", "GET", "BROKEN", f"Failed: {response['data']}")
    
    # ==================== SAFETY TESTS ====================
    
    async def test_trigger_sos(self):
        """Test POST /api/sos/trigger"""
        response = await self.make_request("POST", "/sos/trigger", {
            "trip_id": "test_trip_123",
            "location_lat": 6.5244,
            "location_lng": 3.3792,
            "auto_triggered": False
        })
        
        if response["success"]:
            self.log_result("/sos/trigger", "POST", "WORKING", "SOS triggered successfully")
        elif response["status_code"] == 404:
            self.log_result("/sos/trigger", "POST", "WORKING", "Trip not found (expected for test)")
        else:
            self.log_result("/sos/trigger", "POST", "BROKEN", f"Failed: {response['data']}")
    
    async def test_fatigue_status(self):
        """Test GET /api/drivers/{driver_id}/fatigue-status"""
        response = await self.make_request("GET", f"/drivers/{TEST_DRIVER_ID}/fatigue-status")
        
        if response["success"]:
            fatigue = response["data"]
            self.log_result("/drivers/{driver_id}/fatigue-status", "GET", "WORKING", 
                          f"Hours driven: {fatigue.get('hours_driven', 0)}")
        else:
            self.log_result("/drivers/{driver_id}/fatigue-status", "GET", "BROKEN", f"Failed: {response['data']}")
    
    # ==================== WALLET TESTS ====================
    
    async def test_wallet_balance(self):
        """Test GET /api/wallet/{user_id}"""
        response = await self.make_request("GET", f"/wallet/{TEST_USER_ID}")
        
        if response["success"]:
            wallet = response["data"]
            self.log_result("/wallet/{user_id}", "GET", "WORKING", 
                          f"Balance: ₦{wallet.get('balance', 0)}")
        elif response["status_code"] == 404:
            self.log_result("/wallet/{user_id}", "GET", "PARTIAL", "Wallet not found (expected)")
        else:
            self.log_result("/wallet/{user_id}", "GET", "BROKEN", f"Failed: {response['data']}")
    
    async def test_wallet_topup(self):
        """Test POST /api/wallet/{user_id}/topup"""
        response = await self.make_request("POST", f"/wallet/{TEST_USER_ID}/topup", {
            "amount": 5000,
            "payment_method": "bank_transfer",
            "reference": "TEST_TOPUP_123"
        })
        
        if response["success"]:
            self.log_result("/wallet/{user_id}/topup", "POST", "WORKING", "Wallet topped up successfully")
        elif response["status_code"] == 404:
            self.log_result("/wallet/{user_id}/topup", "POST", "PARTIAL", "User not found (expected)")
        else:
            self.log_result("/wallet/{user_id}/topup", "POST", "BROKEN", f"Failed: {response['data']}")
    
    # ==================== ADMIN TESTS ====================
    
    async def test_admin_vehicle_registrations(self):
        """Test GET /api/admin/vehicle-registrations"""
        response = await self.make_request("GET", "/admin/vehicle-registrations")
        
        if response["success"]:
            registrations = response["data"].get("registrations", [])
            self.log_result("/admin/vehicle-registrations", "GET", "WORKING", 
                          f"Retrieved {len(registrations)} vehicle registrations")
        else:
            self.log_result("/admin/vehicle-registrations", "GET", "BROKEN", f"Failed: {response['data']}")
    
    async def test_admin_dashboard(self):
        """Test GET /api/admin/dashboard"""
        response = await self.make_request("GET", "/admin/dashboard")
        
        if response["success"]:
            dashboard = response["data"]
            self.log_result("/admin/dashboard", "GET", "WORKING", 
                          f"Total users: {dashboard.get('total_users', 0)}")
        else:
            self.log_result("/admin/dashboard", "GET", "BROKEN", f"Failed: {response['data']}")
    
    # ==================== MAIN TEST RUNNER ====================
    
    async def run_all_tests(self):
        """Run all API endpoint tests"""
        print("🚀 Starting NEXRYDE Backend API Testing Suite")
        print(f"📡 Testing against: {BACKEND_URL}")
        print("=" * 60)
        
        # Authentication APIs
        print("\n🔐 AUTHENTICATION APIs:")
        await self.test_send_otp()
        await self.test_verify_otp()
        await self.test_register()
        await self.test_google_oauth()
        await self.test_logout()
        
        # User APIs
        print("\n👤 USER APIs:")
        await self.test_get_user_profile()
        await self.test_update_user_profile()
        await self.test_upload_profile_picture()
        await self.test_add_emergency_contact()
        await self.test_get_emergency_contacts()
        
        # Fare & Booking APIs
        print("\n💰 FARE & BOOKING APIs:")
        await self.test_fare_estimate()
        await self.test_surge_status()
        await self.test_request_trip()
        await self.test_get_trip_details()
        await self.test_cancel_trip()
        
        # Driver APIs
        print("\n🚗 DRIVER APIs:")
        await self.test_driver_stats()
        await self.test_driver_online_toggle()
        await self.test_update_driver_location()
        await self.test_register_vehicle()
        await self.test_get_vehicle_info()
        await self.test_driver_verification_submit()
        
        # Subscription APIs
        print("\n💳 SUBSCRIPTION APIs:")
        await self.test_subscription_config()
        await self.test_subscription_status()
        await self.test_start_trial()
        await self.test_submit_payment()
        
        # Gamification APIs
        print("\n🏆 GAMIFICATION APIs:")
        await self.test_driver_leaderboard()
        await self.test_active_challenges()
        await self.test_driver_streaks()
        
        # AI & Chat APIs
        print("\n🤖 AI & CHAT APIs:")
        await self.test_ai_chat()
        await self.test_rider_assistant()
        await self.test_driver_assistant()
        
        # Safety APIs
        print("\n🚨 SAFETY APIs:")
        await self.test_trigger_sos()
        await self.test_fatigue_status()
        
        # Wallet APIs
        print("\n💼 WALLET APIs:")
        await self.test_wallet_balance()
        await self.test_wallet_topup()
        
        # Admin APIs
        print("\n⚙️ ADMIN APIs:")
        await self.test_admin_vehicle_registrations()
        await self.test_admin_dashboard()
        
        # Print summary
        self.print_summary()
    
    def print_summary(self):
        """Print test results summary"""
        print("\n" + "=" * 60)
        print("📊 TEST RESULTS SUMMARY")
        print("=" * 60)
        
        working = len([r for r in self.results if r["status"] == "WORKING"])
        partial = len([r for r in self.results if r["status"] == "PARTIAL"])
        broken = len([r for r in self.results if r["status"] == "BROKEN"])
        total = len(self.results)
        
        print(f"✅ WORKING: {working}/{total} ({working/total*100:.1f}%)")
        print(f"⚠️ PARTIAL:  {partial}/{total} ({partial/total*100:.1f}%)")
        print(f"❌ BROKEN:   {broken}/{total} ({broken/total*100:.1f}%)")
        
        if broken > 0:
            print(f"\n❌ FAILED ENDPOINTS ({broken}):")
            for result in self.results:
                if result["status"] == "BROKEN":
                    print(f"   • {result['method']} {result['endpoint']} - {result['details']}")
        
        if partial > 0:
            print(f"\n⚠️ PARTIAL ENDPOINTS ({partial}):")
            for result in self.results:
                if result["status"] == "PARTIAL":
                    print(f"   • {result['method']} {result['endpoint']} - {result['details']}")
        
        print(f"\n🎯 SUCCESS RATE: {(working + partial)/total*100:.1f}%")
        print("=" * 60)

async def main():
    """Main test runner"""
    async with NexrydeAPITester() as tester:
        await tester.run_all_tests()

if __name__ == "__main__":
    asyncio.run(main())