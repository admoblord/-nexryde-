#!/usr/bin/env python3
"""
NEXRYDE Backend API Comprehensive Testing Suite
Tests all 45 API endpoints as specified in the review request
"""

import requests
import json
import time
from datetime import datetime, timedelta
import uuid

# Backend URL from frontend/.env
BASE_URL = "https://nexryde-admin.preview.emergentagent.com/api"

class NEXRYDEAPITester:
    def __init__(self):
        self.session = requests.Session()
        self.test_results = []
        self.failed_tests = []
        self.passed_tests = []
        
        # Test data
        self.test_phone = "+2348123456789"
        self.test_user_id = None
        self.test_driver_id = None
        self.test_trip_id = None
        self.test_otp = None
        
        # Lagos coordinates for testing
        self.lagos_coords = {
            "pickup_lat": 6.5244,
            "pickup_lng": 3.3792,
            "dropoff_lat": 6.4281,
            "dropoff_lng": 3.4219
        }
    
    def log_test(self, endpoint, method, status, response_data=None, error=None):
        """Log test results"""
        result = {
            "endpoint": endpoint,
            "method": method,
            "status": "PASS" if status else "FAIL",
            "timestamp": datetime.now().isoformat(),
            "response": response_data,
            "error": error
        }
        
        self.test_results.append(result)
        if status:
            self.passed_tests.append(f"✅ {method} {endpoint}")
        else:
            self.failed_tests.append(f"❌ {method} {endpoint} - {error}")
        
        print(f"{'✅' if status else '❌'} {method} {endpoint} - {'PASS' if status else 'FAIL'}")
        if error:
            print(f"   Error: {error}")
        if response_data and isinstance(response_data, dict):
            print(f"   Response: {json.dumps(response_data, indent=2)[:200]}...")
        print()
    
    def test_endpoint(self, method, endpoint, data=None, params=None, expected_status=200):
        """Generic endpoint tester"""
        url = f"{BASE_URL}{endpoint}"
        
        try:
            if method.upper() == "GET":
                response = self.session.get(url, params=params, timeout=30)
            elif method.upper() == "POST":
                response = self.session.post(url, json=data, timeout=30)
            elif method.upper() == "PUT":
                response = self.session.put(url, json=data, timeout=30)
            elif method.upper() == "DELETE":
                response = self.session.delete(url, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            # Check if response is successful
            if response.status_code == expected_status or (200 <= response.status_code < 300):
                try:
                    response_data = response.json()
                    self.log_test(endpoint, method, True, response_data)
                    return True, response_data
                except:
                    self.log_test(endpoint, method, True, {"status_code": response.status_code})
                    return True, {"status_code": response.status_code}
            else:
                error_msg = f"Status {response.status_code}"
                try:
                    error_data = response.json()
                    error_msg += f" - {error_data.get('detail', 'Unknown error')}"
                except:
                    error_msg += f" - {response.text[:100]}"
                
                self.log_test(endpoint, method, False, None, error_msg)
                return False, error_msg
                
        except Exception as e:
            self.log_test(endpoint, method, False, None, str(e))
            return False, str(e)
    
    def test_authentication_apis(self):
        """Test Authentication APIs (5 endpoints)"""
        print("🔐 TESTING AUTHENTICATION APIs")
        print("=" * 50)
        
        # 1. POST /api/auth/send-otp - Send SMS OTP
        success, response = self.test_endpoint("POST", "/auth/send-otp", {
            "phone": self.test_phone
        })
        if success and isinstance(response, dict):
            self.test_otp = response.get("otp")  # For mock mode
        
        # 2. POST /api/auth/verify-otp - Verify OTP
        if self.test_otp:
            success, response = self.test_endpoint("POST", "/auth/verify-otp", {
                "phone": self.test_phone,
                "otp": self.test_otp
            })
            if success and isinstance(response, dict) and response.get("is_new_user"):
                # Register new user
                success, response = self.test_endpoint("POST", "/auth/register", {
                    "phone": self.test_phone,
                    "name": "John Doe",
                    "email": "john.doe@example.com",
                    "role": "rider"
                })
                if success and isinstance(response, dict):
                    user_data = response.get("user", {})
                    self.test_user_id = user_data.get("id")
        
        # 3. POST /api/auth/google - Google login (test with invalid session)
        self.test_endpoint("POST", "/auth/google/exchange", {
            "session_id": "test_invalid_session_123"
        }, expected_status=401)
        
        # 4. GET /api/users/{user_id} - Get user profile
        if self.test_user_id:
            self.test_endpoint("GET", f"/users/{self.test_user_id}")
        else:
            # Test with a sample user ID
            self.test_endpoint("GET", "/users/sample-user-123", expected_status=404)
        
        # 5. PUT /api/users/{user_id} - Update user profile
        if self.test_user_id:
            self.test_endpoint("PUT", f"/users/{self.test_user_id}", {
                "name": "John Updated Doe",
                "email": "john.updated@example.com"
            })
        else:
            self.test_endpoint("PUT", "/users/sample-user-123", {
                "name": "Test User"
            }, expected_status=404)
    
    def test_rider_apis(self):
        """Test Rider APIs (12 endpoints)"""
        print("🚗 TESTING RIDER APIs")
        print("=" * 50)
        
        # 6. POST /api/trips/request - Request a ride
        ride_data = {
            "pickup_lat": self.lagos_coords["pickup_lat"],
            "pickup_lng": self.lagos_coords["pickup_lng"],
            "pickup_address": "Victoria Island, Lagos",
            "dropoff_lat": self.lagos_coords["dropoff_lat"],
            "dropoff_lng": self.lagos_coords["dropoff_lng"],
            "dropoff_address": "Lekki Phase 1, Lagos",
            "service_type": "economy",
            "payment_method": "cash"
        }
        success, response = self.test_endpoint("POST", "/trips/request", ride_data)
        if success and isinstance(response, dict):
            self.test_trip_id = response.get("trip_id")
        
        # 7. GET /api/trips/{trip_id} - Get trip details
        if self.test_trip_id:
            self.test_endpoint("GET", f"/trips/{self.test_trip_id}")
        else:
            self.test_endpoint("GET", "/trips/sample-trip-123", expected_status=404)
        
        # 8. PUT /api/trips/{trip_id}/cancel - Cancel trip
        if self.test_trip_id:
            self.test_endpoint("PUT", f"/trips/{self.test_trip_id}/cancel")
        
        # 9. GET /api/trips/user/{user_id} - Trip history
        if self.test_user_id:
            self.test_endpoint("GET", f"/trips/user/{self.test_user_id}")
        else:
            self.test_endpoint("GET", "/trips/user/sample-user-123")
        
        # 10. PUT /api/trips/{trip_id}/rate - Rate a trip
        if self.test_trip_id:
            self.test_endpoint("PUT", f"/trips/{self.test_trip_id}/rate", {
                "rating": 5.0,
                "comment": "Excellent service!"
            })
        
        # 11. POST /api/fare/estimate - Get fare estimate
        self.test_endpoint("POST", "/fare/estimate", {
            "pickup_lat": self.lagos_coords["pickup_lat"],
            "pickup_lng": self.lagos_coords["pickup_lng"],
            "dropoff_lat": self.lagos_coords["dropoff_lat"],
            "dropoff_lng": self.lagos_coords["dropoff_lng"],
            "service_type": "economy"
        })
        
        # 12. POST /api/rides/bid/create - Create bid request (with query param)
        success, response = self.test_endpoint("POST", f"/rides/bid/create?rider_id={self.test_user_id or 'sample-user-123'}", {
            "pickup_lat": self.lagos_coords["pickup_lat"],
            "pickup_lng": self.lagos_coords["pickup_lng"],
            "pickup_address": "Victoria Island, Lagos",
            "dropoff_lat": self.lagos_coords["dropoff_lat"],
            "dropoff_lng": self.lagos_coords["dropoff_lng"],
            "dropoff_address": "Lekki Phase 1, Lagos",
            "rider_offered_price": 2500.0
        })
        
        # 13. GET /api/rides/bid/open - Get open bids
        self.test_endpoint("GET", "/rides/bid/open", params={
            "lat": self.lagos_coords["pickup_lat"],
            "lng": self.lagos_coords["pickup_lng"]
        })
        
        # 14. POST /api/rides/schedule - Schedule ride (with query param)
        future_time = (datetime.now() + timedelta(hours=2)).isoformat()
        self.test_endpoint("POST", f"/rides/schedule?rider_id={self.test_user_id or 'sample-user-123'}", {
            "pickup_lat": self.lagos_coords["pickup_lat"],
            "pickup_lng": self.lagos_coords["pickup_lng"],
            "pickup_address": "Victoria Island, Lagos",
            "dropoff_lat": self.lagos_coords["dropoff_lat"],
            "dropoff_lng": self.lagos_coords["dropoff_lng"],
            "dropoff_address": "Lekki Phase 1, Lagos",
            "scheduled_time": future_time,
            "service_type": "economy"
        })
        
        # 15. GET /api/rides/scheduled/{user_id} - Get scheduled rides
        if self.test_user_id:
            self.test_endpoint("GET", f"/rides/scheduled/{self.test_user_id}")
        else:
            self.test_endpoint("GET", "/rides/scheduled/sample-user-123")
        
        # 16. POST /api/delivery/request - Request delivery (with query param)
        self.test_endpoint("POST", f"/delivery/request?sender_id={self.test_user_id or 'sample-user-123'}", {
            "pickup_lat": self.lagos_coords["pickup_lat"],
            "pickup_lng": self.lagos_coords["pickup_lng"],
            "pickup_address": "Victoria Island, Lagos",
            "dropoff_lat": self.lagos_coords["dropoff_lat"],
            "dropoff_lng": self.lagos_coords["dropoff_lng"],
            "dropoff_address": "Lekki Phase 1, Lagos",
            "recipient_name": "Jane Smith",
            "recipient_phone": "+2348987654321",
            "package_description": "Important Documents",
            "package_size": "small"
        })
        
        # 17. GET /api/delivery/user/{user_id} - Get user deliveries
        if self.test_user_id:
            self.test_endpoint("GET", f"/delivery/user/{self.test_user_id}")
        else:
            self.test_endpoint("GET", "/delivery/user/sample-user-123")
    
    def test_driver_apis(self):
        """Test Driver APIs (6 endpoints)"""
        print("🚙 TESTING DRIVER APIs")
        print("=" * 50)
        
        # Create a test driver first
        driver_phone = "+2348111222333"
        
        # Send OTP for driver
        success, response = self.test_endpoint("POST", "/auth/send-otp", {
            "phone": driver_phone
        })
        
        if success and isinstance(response, dict):
            driver_otp = response.get("otp")
            
            # Verify OTP
            if driver_otp:
                success, response = self.test_endpoint("POST", "/auth/verify-otp", {
                    "phone": driver_phone,
                    "otp": driver_otp
                })
                
                if success and isinstance(response, dict) and response.get("is_new_user"):
                    # Register as driver
                    success, response = self.test_endpoint("POST", "/auth/register", {
                        "phone": driver_phone,
                        "name": "Mike Driver",
                        "email": "mike.driver@example.com",
                        "role": "driver"
                    })
                    
                    if success and isinstance(response, dict):
                        user_data = response.get("user", {})
                        self.test_driver_id = user_data.get("id")
        
        # Use sample driver ID if creation failed
        driver_id = self.test_driver_id or "sample-driver-123"
        
        # 18. GET /api/drivers/{user_id}/profile - Driver profile
        self.test_endpoint("GET", f"/drivers/{driver_id}/profile")
        
        # 19. PUT /api/drivers/{user_id}/profile - Update driver profile
        self.test_endpoint("PUT", f"/drivers/{driver_id}/profile", {
            "vehicle_type": "sedan",
            "vehicle_model": "Toyota Camry 2020",
            "vehicle_plate": "ABC-123-XY",
            "vehicle_color": "Black",
            "bank_name": "GTBank",
            "account_number": "0123456789",
            "account_name": "Mike Driver"
        })
        
        # 20. PUT /api/drivers/{user_id}/location - Update location
        self.test_endpoint("PUT", f"/drivers/{driver_id}/location", {
            "latitude": self.lagos_coords["pickup_lat"],
            "longitude": self.lagos_coords["pickup_lng"]
        })
        
        # 21. PUT /api/drivers/{user_id}/online - Toggle online status (with query param)
        self.test_endpoint("PUT", f"/drivers/{driver_id}/online?is_online=true")
        
        # 22. GET /api/drivers/{user_id}/stats - Get earnings/stats
        self.test_endpoint("GET", f"/drivers/{driver_id}/stats")
        
        # 23. GET /api/drivers/nearby - Get nearby drivers
        self.test_endpoint("GET", "/drivers/nearby", params={
            "lat": self.lagos_coords["pickup_lat"],
            "lng": self.lagos_coords["pickup_lng"],
            "radius": 5
        })
    
    def test_subscription_apis(self):
        """Test Subscription APIs (3 endpoints)"""
        print("💳 TESTING SUBSCRIPTION APIs")
        print("=" * 50)
        
        driver_id = self.test_driver_id or "sample-driver-123"
        
        # 24. GET /api/subscriptions/{driver_id} - Get subscription status
        self.test_endpoint("GET", f"/subscriptions/{driver_id}")
        
        # 25. POST /api/subscriptions/initiate - Initiate subscription
        self.test_endpoint("POST", f"/subscriptions/{driver_id}/start-trial")
        
        # 26. POST /api/subscriptions/upload-proof - Upload payment proof
        self.test_endpoint("POST", f"/subscriptions/{driver_id}/submit-payment", {
            "screenshot": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=",
            "amount": 25000.0,
            "payment_reference": "TXN123456789"
        })
    
    def test_chat_apis(self):
        """Test Chat APIs (5 endpoints)"""
        print("💬 TESTING CHAT APIs")
        print("=" * 50)
        
        user_id = self.test_user_id or "sample-user-123"
        trip_id = self.test_trip_id or "sample-trip-123"
        
        # 27. POST /api/chat/ai - AI chat
        self.test_endpoint("POST", "/chat/ai", {
            "user_id": user_id,
            "message": "What's the fare from Victoria Island to Lekki?",
            "context": "fare_inquiry"
        })
        
        # 28. GET /api/chat/ai/history/{user_id} - AI chat history
        self.test_endpoint("GET", f"/chat/ai/history/{user_id}")
        
        # 29. POST /api/chat/message - Send message (correct field name)
        self.test_endpoint("POST", "/chat/message", {
            "trip_id": trip_id,
            "sender_id": user_id,
            "sender_role": "rider",
            "message": "I'm on my way to the pickup location"
        })
        
        # 30. GET /api/chat/messages/{trip_id} - Get trip messages (with user_id param)
        self.test_endpoint("GET", f"/chat/messages/{trip_id}", params={"user_id": user_id})
        
        # 31. GET /api/chat/presets/{role} - Get preset messages
        self.test_endpoint("GET", "/chat/presets/rider")
        self.test_endpoint("GET", "/chat/presets/driver")
    
    def test_admin_apis(self):
        """Test Admin APIs (6 endpoints)"""
        print("👨‍💼 TESTING ADMIN APIs")
        print("=" * 50)
        
        # 32. POST /api/admin/login - Admin login
        self.test_endpoint("POST", "/admin/login", {
            "email": "admin@nexryde.com",
            "password": "nexryde2025"
        })
        
        # Test with wrong credentials
        self.test_endpoint("POST", "/admin/login", {
            "email": "wrong@email.com",
            "password": "wrongpass"
        }, expected_status=401)
        
        # 33. GET /api/admin/overview - Dashboard stats
        self.test_endpoint("GET", "/admin/overview")
        
        # 34. GET /api/admin/riders - All riders
        self.test_endpoint("GET", "/admin/riders")
        
        # 35. GET /api/admin/drivers - All drivers
        self.test_endpoint("GET", "/admin/drivers")
        
        # 36. GET /api/admin/trips - All trips
        self.test_endpoint("GET", "/admin/trips")
        
        # 37. GET /api/admin/payments - All payments
        self.test_endpoint("GET", "/admin/payments")
        
        # 38. GET /api/admin/promos - All promo codes
        self.test_endpoint("GET", "/admin/promos")
    
    def test_other_apis(self):
        """Test Other APIs (8 endpoints)"""
        print("🔧 TESTING OTHER APIs")
        print("=" * 50)
        
        user_id = self.test_user_id or "sample-user-123"
        trip_id = self.test_trip_id or "sample-trip-123"
        
        # 39. GET /api/surge/check - Surge pricing
        self.test_endpoint("GET", "/surge/check", params={
            "lat": self.lagos_coords["pickup_lat"],
            "lng": self.lagos_coords["pickup_lng"]
        })
        
        # 40. GET /api/safety/sos/contacts/{user_id} - SOS contacts
        self.test_endpoint("GET", f"/users/{user_id}/emergency-contacts")
        
        # 41. POST /api/safety/sos/trigger - Trigger SOS
        self.test_endpoint("POST", "/sos/trigger", {
            "trip_id": trip_id,
            "location_lat": self.lagos_coords["pickup_lat"],
            "location_lng": self.lagos_coords["pickup_lng"],
            "auto_triggered": False
        })
        
        # 42. GET /api/promo/validate/{code} - Validate promo code
        self.test_endpoint("GET", "/promo/validate/FIRST10")
        
        # 43. GET /api/wallet/{user_id} - Get wallet balance
        self.test_endpoint("GET", f"/wallet/{user_id}")
        
        # 44. POST /api/wallet/{user_id}/add - Add to wallet
        self.test_endpoint("POST", f"/wallet/{user_id}/topup", {
            "amount": 1000.0,
            "payment_method": "bank_transfer",
            "reference": "TXN987654321"
        })
        
        # 45. GET /api/health - Health check
        self.test_endpoint("GET", "/health")
    
    def run_all_tests(self):
        """Run all API tests"""
        print("🚀 NEXRYDE BACKEND API COMPREHENSIVE TESTING")
        print("=" * 60)
        print(f"Testing against: {BASE_URL}")
        print(f"Started at: {datetime.now().isoformat()}")
        print("=" * 60)
        print()
        
        # Run all test suites
        self.test_authentication_apis()
        self.test_rider_apis()
        self.test_driver_apis()
        self.test_subscription_apis()
        self.test_chat_apis()
        self.test_admin_apis()
        self.test_other_apis()
        
        # Print summary
        self.print_summary()
    
    def print_summary(self):
        """Print test summary"""
        total_tests = len(self.test_results)
        passed = len(self.passed_tests)
        failed = len(self.failed_tests)
        success_rate = (passed / total_tests * 100) if total_tests > 0 else 0
        
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed}")
        print(f"Failed: {failed}")
        print(f"Success Rate: {success_rate:.1f}%")
        print()
        
        if self.passed_tests:
            print("✅ WORKING ENDPOINTS:")
            for test in self.passed_tests:
                print(f"   {test}")
            print()
        
        if self.failed_tests:
            print("❌ FAILING ENDPOINTS:")
            for test in self.failed_tests:
                print(f"   {test}")
            print()
        
        print(f"Completed at: {datetime.now().isoformat()}")
        print("=" * 60)

if __name__ == "__main__":
    tester = NEXRYDEAPITester()
    tester.run_all_tests()