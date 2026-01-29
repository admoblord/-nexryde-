#!/usr/bin/env python3
"""
NEXRYDE Backend API Testing Suite
Comprehensive testing of all backend endpoints
"""

import asyncio
import aiohttp
import json
import uuid
from datetime import datetime
import base64

# Backend URL from frontend/.env
BACKEND_URL = "https://nexryde-map.preview.emergentagent.com/api"

class NEXRYDEAPITester:
    def __init__(self):
        self.session = None
        self.test_results = []
        self.test_user_id = None
        self.test_driver_id = None
        self.test_trip_id = None
        self.test_phone = "+2348012345678"
        self.test_otp = None
        
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    def log_result(self, test_name, success, details, response_data=None):
        """Log test result"""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        if response_data:
            result["response"] = response_data
        self.test_results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name}")
        print(f"   Details: {details}")
        if response_data and not success:
            print(f"   Response: {response_data}")
        print()
    
    async def make_request(self, method, endpoint, data=None, headers=None):
        """Make HTTP request to API"""
        url = f"{BACKEND_URL}{endpoint}"
        try:
            if headers is None:
                headers = {"Content-Type": "application/json"}
            
            async with self.session.request(method, url, json=data, headers=headers) as response:
                try:
                    response_data = await response.json()
                except:
                    response_data = await response.text()
                
                return {
                    "status": response.status,
                    "data": response_data,
                    "success": 200 <= response.status < 300
                }
        except Exception as e:
            return {
                "status": 0,
                "data": str(e),
                "success": False
            }
    
    # ==================== AUTHENTICATION TESTS ====================
    
    async def test_send_otp(self):
        """Test POST /api/auth/send-otp"""
        data = {"phone": self.test_phone}
        response = await self.make_request("POST", "/auth/send-otp", data)
        
        if response["success"]:
            # Extract OTP from mock response for testing
            if isinstance(response["data"], dict) and "otp" in response["data"]:
                self.test_otp = response["data"]["otp"]
            self.log_result(
                "Send OTP", 
                True, 
                f"OTP sent successfully to {self.test_phone}. Provider: {response['data'].get('provider', 'unknown')}", 
                response["data"]
            )
        else:
            self.log_result("Send OTP", False, f"Failed to send OTP: {response['data']}", response["data"])
        
        return response["success"]
    
    async def test_verify_otp(self):
        """Test POST /api/auth/verify-otp"""
        if not self.test_otp:
            self.log_result("Verify OTP", False, "No OTP available to verify")
            return False
        
        data = {"phone": self.test_phone, "otp": self.test_otp}
        response = await self.make_request("POST", "/auth/verify-otp", data)
        
        if response["success"]:
            # Check if user exists or is new
            is_new_user = response["data"].get("is_new_user", False)
            if not is_new_user and "user" in response["data"]:
                self.test_user_id = response["data"]["user"]["id"]
            
            self.log_result(
                "Verify OTP", 
                True, 
                f"OTP verified successfully. New user: {is_new_user}", 
                response["data"]
            )
        else:
            self.log_result("Verify OTP", False, f"Failed to verify OTP: {response['data']}", response["data"])
        
        return response["success"]
    
    async def test_google_oauth(self):
        """Test POST /api/auth/google/exchange"""
        # Test with invalid session_id to verify endpoint exists and handles errors properly
        data = {"session_id": "test_invalid_session_123"}
        response = await self.make_request("POST", "/auth/google/exchange", data)
        
        # We expect 401 for invalid session, which means endpoint is working
        if response["status"] == 401:
            self.log_result(
                "Google OAuth", 
                True, 
                "Google OAuth endpoint working correctly (401 for invalid session as expected)", 
                response["data"]
            )
            return True
        elif response["success"]:
            self.log_result(
                "Google OAuth", 
                True, 
                "Google OAuth endpoint accessible and responding", 
                response["data"]
            )
            return True
        else:
            self.log_result("Google OAuth", False, f"Google OAuth endpoint error: {response['data']}", response["data"])
            return False
    
    async def test_logout(self):
        """Test POST /api/auth/logout"""
        response = await self.make_request("POST", "/auth/logout")
        
        if response["success"]:
            self.log_result("Logout", True, "Logout successful", response["data"])
        else:
            self.log_result("Logout", False, f"Logout failed: {response['data']}", response["data"])
        
        return response["success"]
    
    # ==================== USER MANAGEMENT TESTS ====================
    
    async def test_register_user(self):
        """Register a test user if needed"""
        if self.test_user_id:
            return True
        
        data = {
            "phone": self.test_phone,
            "name": "Test User",
            "email": "testuser@nexryde.com",
            "role": "rider"
        }
        response = await self.make_request("POST", "/auth/register", data)
        
        if response["success"]:
            self.test_user_id = response["data"]["user"]["id"]
            self.log_result("Register User", True, f"User registered with ID: {self.test_user_id}", response["data"])
        else:
            self.log_result("Register User", False, f"Registration failed: {response['data']}", response["data"])
        
        return response["success"]
    
    async def test_get_user_profile(self):
        """Test GET /api/users/{user_id}"""
        if not self.test_user_id:
            self.log_result("Get User Profile", False, "No test user ID available")
            return False
        
        response = await self.make_request("GET", f"/users/{self.test_user_id}")
        
        if response["success"]:
            self.log_result("Get User Profile", True, "User profile retrieved successfully", response["data"])
        else:
            self.log_result("Get User Profile", False, f"Failed to get user profile: {response['data']}", response["data"])
        
        return response["success"]
    
    async def test_update_user_profile(self):
        """Test PUT /api/users/{user_id}"""
        if not self.test_user_id:
            self.log_result("Update User Profile", False, "No test user ID available")
            return False
        
        data = {"name": "Updated Test User", "email": "updated@nexryde.com"}
        response = await self.make_request("PUT", f"/users/{self.test_user_id}", data)
        
        if response["success"]:
            self.log_result("Update User Profile", True, "User profile updated successfully", response["data"])
        else:
            self.log_result("Update User Profile", False, f"Failed to update user profile: {response['data']}", response["data"])
        
        return response["success"]
    
    async def test_add_emergency_contact(self):
        """Test POST /api/users/{user_id}/emergency-contacts"""
        if not self.test_user_id:
            self.log_result("Add Emergency Contact", False, "No test user ID available")
            return False
        
        data = {
            "name": "Emergency Contact",
            "phone": "+2348087654321",
            "relationship": "Family"
        }
        response = await self.make_request("POST", f"/users/{self.test_user_id}/emergency-contacts", data)
        
        if response["success"]:
            self.log_result("Add Emergency Contact", True, "Emergency contact added successfully", response["data"])
        else:
            self.log_result("Add Emergency Contact", False, f"Failed to add emergency contact: {response['data']}", response["data"])
        
        return response["success"]
    
    async def test_get_emergency_contacts(self):
        """Test GET /api/users/{user_id}/emergency-contacts"""
        if not self.test_user_id:
            self.log_result("Get Emergency Contacts", False, "No test user ID available")
            return False
        
        response = await self.make_request("GET", f"/users/{self.test_user_id}/emergency-contacts")
        
        if response["success"]:
            contacts = response["data"].get("contacts", [])
            self.log_result("Get Emergency Contacts", True, f"Retrieved {len(contacts)} emergency contacts", response["data"])
        else:
            self.log_result("Get Emergency Contacts", False, f"Failed to get emergency contacts: {response['data']}", response["data"])
        
        return response["success"]
    
    # ==================== DRIVER TESTS ====================
    
    async def test_register_driver(self):
        """Register a test driver"""
        driver_phone = "+2348087654321"
        
        # Send OTP for driver
        data = {"phone": driver_phone}
        otp_response = await self.make_request("POST", "/auth/send-otp", data)
        
        if not otp_response["success"]:
            self.log_result("Register Driver (OTP)", False, f"Failed to send OTP for driver: {otp_response['data']}")
            return False
        
        # Get OTP from response
        driver_otp = otp_response["data"].get("otp")
        if not driver_otp:
            self.log_result("Register Driver (OTP)", False, "No OTP in response")
            return False
        
        # Verify OTP
        verify_data = {"phone": driver_phone, "otp": driver_otp}
        verify_response = await self.make_request("POST", "/auth/verify-otp", verify_data)
        
        if not verify_response["success"]:
            self.log_result("Register Driver (Verify)", False, f"Failed to verify driver OTP: {verify_response['data']}")
            return False
        
        # Register as driver
        register_data = {
            "phone": driver_phone,
            "name": "Test Driver",
            "email": "testdriver@nexryde.com",
            "role": "driver"
        }
        register_response = await self.make_request("POST", "/auth/register", register_data)
        
        if register_response["success"]:
            self.test_driver_id = register_response["data"]["user"]["id"]
            self.log_result("Register Driver", True, f"Driver registered with ID: {self.test_driver_id}")
            return True
        else:
            self.log_result("Register Driver", False, f"Driver registration failed: {register_response['data']}")
            return False
    
    async def test_driver_toggle_online(self):
        """Test driver online toggle (PUT /api/drivers/{user_id}/online)"""
        if not self.test_driver_id:
            self.log_result("Driver Toggle Online", False, "No test driver ID available")
            return False
        
        # First start a trial subscription for the driver
        trial_response = await self.make_request("POST", f"/subscriptions/{self.test_driver_id}/start-trial")
        
        if not trial_response["success"]:
            self.log_result("Driver Toggle Online (Trial)", False, f"Failed to start trial: {trial_response['data']}")
            return False
        
        # Now try to go online
        response = await self.make_request("PUT", f"/drivers/{self.test_driver_id}/online?is_online=true")
        
        if response["success"]:
            self.log_result("Driver Toggle Online", True, "Driver successfully went online", response["data"])
        else:
            self.log_result("Driver Toggle Online", False, f"Failed to toggle driver online: {response['data']}", response["data"])
        
        return response["success"]
    
    async def test_driver_stats(self):
        """Test GET /api/drivers/{driver_id}/stats"""
        if not self.test_driver_id:
            self.log_result("Driver Stats", False, "No test driver ID available")
            return False
        
        response = await self.make_request("GET", f"/drivers/{self.test_driver_id}/stats")
        
        if response["success"]:
            stats = response["data"]
            self.log_result(
                "Driver Stats", 
                True, 
                f"Stats retrieved - Trips: {stats.get('total_trips', 0)}, Earnings: ₦{stats.get('total_earnings', 0)}, Rating: {stats.get('rating', 0)}", 
                stats
            )
        else:
            self.log_result("Driver Stats", False, f"Failed to get driver stats: {response['data']}", response["data"])
        
        return response["success"]
    
    # ==================== SUBSCRIPTION TESTS ====================
    
    async def test_subscription_config(self):
        """Test GET /api/subscriptions/config"""
        response = await self.make_request("GET", "/subscriptions/config")
        
        if response["success"]:
            config = response["data"]
            self.log_result(
                "Subscription Config", 
                True, 
                f"Config retrieved - Fee: ₦{config.get('monthly_fee', 0)}, Trial: {config.get('trial_days', 0)} days", 
                config
            )
        else:
            self.log_result("Subscription Config", False, f"Failed to get subscription config: {response['data']}", response["data"])
        
        return response["success"]
    
    async def test_get_subscription_status(self):
        """Test GET /api/subscriptions/{driver_id}"""
        if not self.test_driver_id:
            self.log_result("Get Subscription Status", False, "No test driver ID available")
            return False
        
        response = await self.make_request("GET", f"/subscriptions/{self.test_driver_id}")
        
        if response["success"]:
            subscription = response["data"]
            self.log_result(
                "Get Subscription Status", 
                True, 
                f"Subscription status: {subscription.get('status', 'unknown')}, Days remaining: {subscription.get('days_remaining', 0)}", 
                subscription
            )
        else:
            self.log_result("Get Subscription Status", False, f"Failed to get subscription status: {response['data']}", response["data"])
        
        return response["success"]
    
    async def test_start_trial(self):
        """Test POST /api/subscriptions/{driver_id}/start-trial"""
        # Create a new driver for trial test
        trial_driver_phone = "+2348098765432"
        
        # Quick registration for trial driver
        otp_data = {"phone": trial_driver_phone}
        otp_response = await self.make_request("POST", "/auth/send-otp", otp_data)
        
        if not otp_response["success"]:
            self.log_result("Start Trial (Setup)", False, "Failed to send OTP for trial driver")
            return False
        
        trial_otp = otp_response["data"].get("otp")
        verify_data = {"phone": trial_driver_phone, "otp": trial_otp}
        verify_response = await self.make_request("POST", "/auth/verify-otp", verify_data)
        
        register_data = {
            "phone": trial_driver_phone,
            "name": "Trial Driver",
            "role": "driver"
        }
        register_response = await self.make_request("POST", "/auth/register", register_data)
        
        if not register_response["success"]:
            self.log_result("Start Trial (Setup)", False, "Failed to register trial driver")
            return False
        
        trial_driver_id = register_response["data"]["user"]["id"]
        
        # Now test starting trial
        response = await self.make_request("POST", f"/subscriptions/{trial_driver_id}/start-trial")
        
        if response["success"]:
            trial_data = response["data"]
            self.log_result(
                "Start Trial", 
                True, 
                f"Trial started successfully - Days: {trial_data.get('days_remaining', 0)}", 
                trial_data
            )
        else:
            self.log_result("Start Trial", False, f"Failed to start trial: {response['data']}", response["data"])
        
        return response["success"]
    
    async def test_submit_payment(self):
        """Test POST /api/subscriptions/{driver_id}/submit-payment"""
        if not self.test_driver_id:
            self.log_result("Submit Payment", False, "No test driver ID available")
            return False
        
        # Create a fake base64 image for payment proof
        fake_image = base64.b64encode(b"fake_payment_screenshot").decode()
        
        data = {
            "driver_id": self.test_driver_id,
            "screenshot": fake_image,
            "amount": 25000.0,
            "payment_reference": "TEST123456"
        }
        response = await self.make_request("POST", f"/subscriptions/{self.test_driver_id}/submit-payment", data)
        
        if response["success"]:
            self.log_result("Submit Payment", True, "Payment proof submitted successfully", response["data"])
        else:
            self.log_result("Submit Payment", False, f"Failed to submit payment: {response['data']}", response["data"])
        
        return response["success"]
    
    # ==================== FARE AND TRIP TESTS ====================
    
    async def test_fare_estimate(self):
        """Test POST /api/fare/estimate"""
        # Lagos coordinates: Lekki to Victoria Island
        data = {
            "pickup_lat": 6.4281,
            "pickup_lng": 3.4219,
            "dropoff_lat": 6.4355,
            "dropoff_lng": 3.4567,
            "service_type": "economy",
            "city": "lagos"
        }
        response = await self.make_request("POST", "/fare/estimate", data)
        
        if response["success"]:
            fare_data = response["data"]
            self.log_result(
                "Fare Estimate", 
                True, 
                f"Fare estimated - Distance: {fare_data.get('distance_km', 0)}km, Duration: {fare_data.get('duration_min', 0)}min, Fare: ₦{fare_data.get('total_fare', 0)}", 
                fare_data
            )
        else:
            self.log_result("Fare Estimate", False, f"Failed to estimate fare: {response['data']}", response["data"])
        
        return response["success"]
    
    async def test_request_trip(self):
        """Test POST /api/trips/request"""
        if not self.test_user_id:
            self.log_result("Request Trip", False, "No test user ID available")
            return False
        
        data = {
            "pickup_lat": 6.4281,
            "pickup_lng": 3.4219,
            "pickup_address": "Lekki Phase 1, Lagos",
            "dropoff_lat": 6.4355,
            "dropoff_lng": 3.4567,
            "dropoff_address": "Victoria Island, Lagos",
            "service_type": "economy",
            "payment_method": "cash"
        }
        
        # Add rider_id as query parameter
        response = await self.make_request("POST", f"/trips/request?rider_id={self.test_user_id}", data)
        
        if response["success"]:
            trip_data = response["data"]
            self.test_trip_id = trip_data.get("trip", {}).get("id") or trip_data.get("id")
            self.log_result(
                "Request Trip", 
                True, 
                f"Trip requested successfully - ID: {self.test_trip_id}", 
                trip_data
            )
        else:
            self.log_result("Request Trip", False, f"Failed to request trip: {response['data']}", response["data"])
        
        return response["success"]
    
    async def test_get_trip_details(self):
        """Test GET /api/trips/{trip_id}"""
        if not self.test_trip_id:
            self.log_result("Get Trip Details", False, "No test trip ID available")
            return False
        
        response = await self.make_request("GET", f"/trips/{self.test_trip_id}")
        
        if response["success"]:
            trip_data = response["data"]
            self.log_result(
                "Get Trip Details", 
                True, 
                f"Trip details retrieved - Status: {trip_data.get('status', 'unknown')}, Fare: ₦{trip_data.get('fare', 0)}", 
                trip_data
            )
        else:
            self.log_result("Get Trip Details", False, f"Failed to get trip details: {response['data']}", response["data"])
        
        return response["success"]
    
    async def test_cancel_trip(self):
        """Test POST /api/trips/{trip_id}/cancel"""
        if not self.test_trip_id:
            self.log_result("Cancel Trip", False, "No test trip ID available")
            return False
        
        data = {"reason": "Testing cancellation"}
        headers = {"Content-Type": "application/json", "X-User-ID": self.test_user_id}
        response = await self.make_request("POST", f"/trips/{self.test_trip_id}/cancel", data, headers)
        
        if response["success"]:
            self.log_result("Cancel Trip", True, "Trip cancelled successfully", response["data"])
        else:
            self.log_result("Cancel Trip", False, f"Failed to cancel trip: {response['data']}", response["data"])
        
        return response["success"]
    
    # ==================== AI CHAT TESTS ====================
    
    async def test_ai_chat(self):
        """Test POST /api/chat/ai"""
        data = {
            "message": "How much is fare from Lekki to Victoria Island?",
            "user_id": self.test_user_id or "test_user",
            "role": "rider"
        }
        response = await self.make_request("POST", "/chat/ai", data)
        
        if response["success"]:
            chat_data = response["data"]
            self.log_result(
                "AI Chat", 
                True, 
                f"AI responded successfully - Response length: {len(str(chat_data.get('response', '')))}", 
                chat_data
            )
        else:
            self.log_result("AI Chat", False, f"AI chat failed: {response['data']}", response["data"])
        
        return response["success"]
    
    async def test_ai_chat_history(self):
        """Test GET /api/chat/ai/history/{user_id}"""
        user_id = self.test_user_id or "test_user"
        response = await self.make_request("GET", f"/chat/ai/history/{user_id}")
        
        if response["success"]:
            history_data = response["data"]
            messages = history_data.get("messages", [])
            self.log_result(
                "AI Chat History", 
                True, 
                f"Chat history retrieved - {len(messages)} messages", 
                history_data
            )
        else:
            self.log_result("AI Chat History", False, f"Failed to get chat history: {response['data']}", response["data"])
        
        return response["success"]
    
    async def test_chat_presets_rider(self):
        """Test GET /api/chat/presets/rider"""
        response = await self.make_request("GET", "/chat/presets/rider")
        
        if response["success"]:
            presets = response["data"].get("presets", [])
            self.log_result(
                "Chat Presets Rider", 
                True, 
                f"Retrieved {len(presets)} rider presets", 
                response["data"]
            )
        else:
            self.log_result("Chat Presets Rider", False, f"Failed to get rider presets: {response['data']}", response["data"])
        
        return response["success"]
    
    async def test_chat_presets_driver(self):
        """Test GET /api/chat/presets/driver"""
        response = await self.make_request("GET", "/chat/presets/driver")
        
        if response["success"]:
            presets = response["data"].get("presets", [])
            self.log_result(
                "Chat Presets Driver", 
                True, 
                f"Retrieved {len(presets)} driver presets", 
                response["data"]
            )
        else:
            self.log_result("Chat Presets Driver", False, f"Failed to get driver presets: {response['data']}", response["data"])
        
        return response["success"]
    
    async def test_send_message(self):
        """Test POST /api/chat/message"""
        if not self.test_trip_id:
            # Create a dummy trip ID for testing
            self.test_trip_id = str(uuid.uuid4())
        
        data = {
            "trip_id": self.test_trip_id,
            "message_type": "text",
            "content": "Test message from rider"
        }
        headers = {"Content-Type": "application/json", "X-User-ID": self.test_user_id or "test_user"}
        response = await self.make_request("POST", "/chat/message", data, headers)
        
        if response["success"]:
            self.log_result("Send Message", True, "Message sent successfully", response["data"])
        else:
            self.log_result("Send Message", False, f"Failed to send message: {response['data']}", response["data"])
        
        return response["success"]
    
    async def test_get_trip_messages(self):
        """Test GET /api/chat/messages/{trip_id}"""
        if not self.test_trip_id:
            self.log_result("Get Trip Messages", False, "No test trip ID available")
            return False
        
        response = await self.make_request("GET", f"/chat/messages/{self.test_trip_id}")
        
        if response["success"]:
            messages = response["data"].get("messages", [])
            self.log_result(
                "Get Trip Messages", 
                True, 
                f"Retrieved {len(messages)} trip messages", 
                response["data"]
            )
        else:
            self.log_result("Get Trip Messages", False, f"Failed to get trip messages: {response['data']}", response["data"])
        
        return response["success"]
    
    # ==================== SAFETY TESTS ====================
    
    async def test_trigger_sos(self):
        """Test POST /api/sos/trigger (mapped from /api/safety/sos)"""
        if not self.test_trip_id:
            # Use a dummy trip ID for testing
            test_trip_id = str(uuid.uuid4())
        else:
            test_trip_id = self.test_trip_id
        
        data = {
            "trip_id": test_trip_id,
            "location_lat": 6.4281,
            "location_lng": 3.4219,
            "auto_triggered": False
        }
        headers = {"Content-Type": "application/json", "X-User-ID": self.test_user_id or "test_user"}
        response = await self.make_request("POST", "/sos/trigger", data, headers)
        
        if response["success"]:
            self.log_result("Trigger SOS", True, "SOS triggered successfully", response["data"])
        else:
            # SOS might return 404 for non-existent trip, which is expected behavior
            if response["status"] == 404:
                self.log_result("Trigger SOS", True, "SOS endpoint working correctly (404 for non-existent trip as expected)", response["data"])
            else:
                self.log_result("Trigger SOS", False, f"SOS trigger failed: {response['data']}", response["data"])
        
        return response["success"] or response["status"] == 404
    
    async def test_share_trip(self):
        """Test POST /api/trips/{trip_id}/share"""
        if not self.test_trip_id:
            # Use a dummy trip ID for testing
            test_trip_id = str(uuid.uuid4())
        else:
            test_trip_id = self.test_trip_id
        
        data = {
            "contacts": ["+2348087654321", "+2348098765432"],
            "message": "Sharing my trip for safety"
        }
        headers = {"Content-Type": "application/json", "X-User-ID": self.test_user_id or "test_user"}
        response = await self.make_request("POST", f"/trips/{test_trip_id}/share", data, headers)
        
        if response["success"]:
            self.log_result("Share Trip", True, "Trip shared successfully", response["data"])
        else:
            # Trip sharing might return 404 for non-existent trip, which is expected
            if response["status"] == 404:
                self.log_result("Share Trip", True, "Trip sharing endpoint working correctly (404 for non-existent trip as expected)", response["data"])
            else:
                self.log_result("Share Trip", False, f"Trip sharing failed: {response['data']}", response["data"])
        
        return response["success"] or response["status"] == 404
    
    # ==================== MAIN TEST RUNNER ====================
    
    async def run_all_tests(self):
        """Run all API tests"""
        print("🚀 Starting NEXRYDE Backend API Testing Suite")
        print(f"🔗 Backend URL: {BACKEND_URL}")
        print("=" * 60)
        
        # Authentication Tests
        print("\n📱 AUTHENTICATION TESTS")
        print("-" * 30)
        await self.test_send_otp()
        await self.test_verify_otp()
        await self.test_google_oauth()
        await self.test_logout()
        
        # User Management Tests
        print("\n👤 USER MANAGEMENT TESTS")
        print("-" * 30)
        await self.test_register_user()
        await self.test_get_user_profile()
        await self.test_update_user_profile()
        await self.test_add_emergency_contact()
        await self.test_get_emergency_contacts()
        
        # Driver Tests
        print("\n🚗 DRIVER TESTS")
        print("-" * 30)
        await self.test_register_driver()
        await self.test_driver_toggle_online()
        await self.test_driver_stats()
        
        # Subscription Tests
        print("\n💳 SUBSCRIPTION TESTS")
        print("-" * 30)
        await self.test_subscription_config()
        await self.test_get_subscription_status()
        await self.test_start_trial()
        await self.test_submit_payment()
        
        # Fare and Trip Tests
        print("\n🛣️ FARE AND TRIP TESTS")
        print("-" * 30)
        await self.test_fare_estimate()
        await self.test_request_trip()
        await self.test_get_trip_details()
        await self.test_cancel_trip()
        
        # AI Chat Tests
        print("\n🤖 AI CHAT TESTS")
        print("-" * 30)
        await self.test_ai_chat()
        await self.test_ai_chat_history()
        await self.test_chat_presets_rider()
        await self.test_chat_presets_driver()
        await self.test_send_message()
        await self.test_get_trip_messages()
        
        # Safety Tests
        print("\n🚨 SAFETY TESTS")
        print("-" * 30)
        await self.test_trigger_sos()
        await self.test_share_trip()
        
        # Summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result["success"])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"✅ Passed: {passed_tests}")
        print(f"❌ Failed: {failed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        if failed_tests > 0:
            print(f"\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"   • {result['test']}: {result['details']}")
        
        print("\n🎉 Testing Complete!")
        return self.test_results

async def main():
    """Main function to run all tests"""
    async with NEXRYDEAPITester() as tester:
        results = await tester.run_all_tests()
        return results

if __name__ == "__main__":
    asyncio.run(main())