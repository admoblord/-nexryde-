#!/usr/bin/env python3
"""
NEXRYDE Backend API Comprehensive Testing
Tests all 27 endpoints as specified in the review request
"""

import requests
import json
import sys
from datetime import datetime, timedelta

# Backend URL from frontend/.env
BACKEND_URL = "https://nexryde-map.preview.emergentagent.com/api"

class NEXRYDEAPITester:
    def __init__(self):
        self.session = requests.Session()
        self.test_results = []
        self.passed = 0
        self.failed = 0
        
    def log_result(self, test_name, success, details="", response_data=None):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        result = {
            "test": test_name,
            "status": status,
            "details": details,
            "response_data": response_data
        }
        self.test_results.append(result)
        
        if success:
            self.passed += 1
        else:
            self.failed += 1
            
        print(f"{status}: {test_name}")
        if details:
            print(f"   Details: {details}")
        if response_data and not success:
            print(f"   Response: {response_data}")
        print()

    def test_endpoint(self, method, endpoint, data=None, params=None, expected_status=200):
        """Generic endpoint tester"""
        url = f"{BACKEND_URL}{endpoint}"
        
        try:
            if method.upper() == "GET":
                response = self.session.get(url, params=params, timeout=30)
            elif method.upper() == "POST":
                response = self.session.post(url, json=data, params=params, timeout=30)
            elif method.upper() == "PUT":
                response = self.session.put(url, json=data, params=params, timeout=30)
            else:
                return False, f"Unsupported method: {method}", None
            
            success = response.status_code == expected_status
            
            try:
                response_data = response.json()
            except:
                response_data = response.text
                
            return success, response_data, response.status_code
            
        except requests.exceptions.RequestException as e:
            return False, f"Request failed: {str(e)}", None

    def run_comprehensive_tests(self):
        """Run all 27 endpoint tests as specified in review request"""
        
        print("🚀 Starting NEXRYDE Backend API Comprehensive Testing")
        print("=" * 60)
        
        # 1. AUTHENTICATION TESTS
        print("\n📱 AUTHENTICATION ENDPOINTS")
        print("-" * 30)
        
        # Test 1: Send OTP
        success, response, status = self.test_endpoint(
            "POST", "/auth/send-otp",
            data={"phone": "+2348108899392"}
        )
        self.log_result(
            "1. POST /api/auth/send-otp",
            success,
            f"Status: {status}, SMS OTP system" if success else f"Failed with status {status}",
            response if not success else None
        )
        
        # Test 2: Verify OTP
        success, response, status = self.test_endpoint(
            "POST", "/auth/verify-otp",
            data={"phone": "+2348108899392", "code": "123456"}
        )
        self.log_result(
            "2. POST /api/auth/verify-otp",
            success,
            f"Status: {status}, OTP verification" if success else f"Failed with status {status}",
            response if not success else None
        )
        
        # 2. USER & PREFERENCES TESTS
        print("\n👤 USER & PREFERENCES ENDPOINTS")
        print("-" * 35)
        
        # Test 3: Get User Preferences
        success, response, status = self.test_endpoint(
            "GET", "/users/test-user-123/preferences"
        )
        self.log_result(
            "3. GET /api/users/test-user-123/preferences",
            success,
            f"Status: {status}, User preferences" if success else f"Failed with status {status}",
            response if not success else None
        )
        
        # Test 4: Update Theme
        success, response, status = self.test_endpoint(
            "PUT", "/users/test-user-123/theme",
            params={"theme": "dark"}
        )
        self.log_result(
            "4. PUT /api/users/test-user-123/theme?theme=dark",
            success,
            f"Status: {status}, Theme update" if success else f"Failed with status {status}",
            response if not success else None
        )
        
        # Test 5: Get Languages
        success, response, status = self.test_endpoint(
            "GET", "/languages"
        )
        self.log_result(
            "5. GET /api/languages",
            success,
            f"Status: {status}, Languages list" if success else f"Failed with status {status}",
            response if not success else None
        )
        
        # Test 6: Get Translations
        success, response, status = self.test_endpoint(
            "GET", "/translations/pcm"
        )
        self.log_result(
            "6. GET /api/translations/pcm",
            success,
            f"Status: {status}, Pidgin translations" if success else f"Failed with status {status}",
            response if not success else None
        )
        
        # 3. WALLET & REFERRALS TESTS
        print("\n💰 WALLET & REFERRALS ENDPOINTS")
        print("-" * 35)
        
        # Test 7: Get Wallet Balance
        success, response, status = self.test_endpoint(
            "GET", "/wallet/test-user-123"
        )
        self.log_result(
            "7. GET /api/wallet/test-user-123",
            success,
            f"Status: {status}, Wallet balance" if success else f"Failed with status {status}",
            response if not success else None
        )
        
        # Test 8: Wallet Top-up
        success, response, status = self.test_endpoint(
            "POST", "/wallet/test-user-123/topup",
            params={"amount": "1000"}
        )
        self.log_result(
            "8. POST /api/wallet/test-user-123/topup?amount=1000",
            success,
            f"Status: {status}, Wallet top-up" if success else f"Failed with status {status}",
            response if not success else None
        )
        
        # Test 9: Get Referral Code
        success, response, status = self.test_endpoint(
            "GET", "/referral/code/test-user-123"
        )
        self.log_result(
            "9. GET /api/referral/code/test-user-123",
            success,
            f"Status: {status}, Referral code" if success else f"Failed with status {status}",
            response if not success else None
        )
        
        # Test 10: Apply Promo Code
        success, response, status = self.test_endpoint(
            "POST", "/promo/apply",
            params={"rider_id": "test-user-123", "code": "FIRST10"}
        )
        self.log_result(
            "10. POST /api/promo/apply?rider_id=test-user-123&code=FIRST10",
            success,
            f"Status: {status}, Promo code application" if success else f"Failed with status {status}",
            response if not success else None
        )
        
        # 4. FARE & TRIPS TESTS
        print("\n🚗 FARE & TRIPS ENDPOINTS")
        print("-" * 30)
        
        # Test 11: Fare Estimation
        success, response, status = self.test_endpoint(
            "POST", "/fare/estimate",
            data={
                "pickup_lat": 6.4281,
                "pickup_lng": 3.4219,
                "dropoff_lat": 6.4355,
                "dropoff_lng": 3.4567,
                "ride_type": "economy"
            }
        )
        self.log_result(
            "11. POST /api/fare/estimate",
            success,
            f"Status: {status}, Fare estimation with Google Maps" if success else f"Failed with status {status}",
            response if not success else None
        )
        
        # Test 12: Surge Check
        success, response, status = self.test_endpoint(
            "GET", "/surge/check",
            params={"lat": "6.4281", "lng": "3.4219"}
        )
        self.log_result(
            "12. GET /api/surge/check?lat=6.4281&lng=3.4219",
            success,
            f"Status: {status}, Surge pricing check" if success else f"Failed with status {status}",
            response if not success else None
        )
        
        # 5. RIDE BIDDING TESTS
        print("\n🎯 RIDE BIDDING ENDPOINTS")
        print("-" * 30)
        
        # Test 13: Create Ride Bid
        success, response, status = self.test_endpoint(
            "POST", "/rides/bid/create",
            params={"rider_id": "test-rider-123"},
            data={
                "rider_offered_price": 1500,
                "pickup_lat": 6.4281,
                "pickup_lng": 3.4219,
                "dropoff_lat": 6.4355,
                "dropoff_lng": 3.4567,
                "pickup_address": "VI",
                "dropoff_address": "Lekki",
                "ride_type": "economy"
            }
        )
        self.log_result(
            "13. POST /api/rides/bid/create?rider_id=test-rider-123",
            success,
            f"Status: {status}, InDrive-style ride bidding" if success else f"Failed with status {status}",
            response if not success else None
        )
        
        # Test 14: Get Open Bids
        success, response, status = self.test_endpoint(
            "GET", "/rides/bid/open",
            params={"lat": "6.4281", "lng": "3.4219"}
        )
        self.log_result(
            "14. GET /api/rides/bid/open?lat=6.4281&lng=3.4219",
            success,
            f"Status: {status}, Open ride bids" if success else f"Failed with status {status}",
            response if not success else None
        )
        
        # 6. SCHEDULED RIDES TESTS
        print("\n⏰ SCHEDULED RIDES ENDPOINTS")
        print("-" * 35)
        
        # Test 15: Schedule Ride
        future_time = (datetime.now() + timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%S")
        success, response, status = self.test_endpoint(
            "POST", "/rides/schedule",
            params={"rider_id": "test-rider-123"},
            data={
                "pickup_lat": 6.4281,
                "pickup_lng": 3.4219,
                "pickup_address": "VI",
                "dropoff_lat": 6.4355,
                "dropoff_lng": 3.4567,
                "dropoff_address": "Lekki",
                "scheduled_time": future_time,
                "ride_type": "economy"
            }
        )
        self.log_result(
            "15. POST /api/rides/schedule?rider_id=test-rider-123",
            success,
            f"Status: {status}, Scheduled ride creation" if success else f"Failed with status {status}",
            response if not success else None
        )
        
        # Test 16: Get Scheduled Rides
        success, response, status = self.test_endpoint(
            "GET", "/rides/scheduled/test-rider-123"
        )
        self.log_result(
            "16. GET /api/rides/scheduled/test-rider-123",
            success,
            f"Status: {status}, Scheduled rides list" if success else f"Failed with status {status}",
            response if not success else None
        )
        
        # 7. PACKAGE DELIVERY TESTS
        print("\n📦 PACKAGE DELIVERY ENDPOINTS")
        print("-" * 35)
        
        # Test 17: Package Delivery Request
        success, response, status = self.test_endpoint(
            "POST", "/delivery/request",
            params={"sender_id": "test-user-123"},
            data={
                "pickup_lat": 6.4281,
                "pickup_lng": 3.4219,
                "pickup_address": "VI",
                "dropoff_lat": 6.4355,
                "dropoff_lng": 3.4567,
                "dropoff_address": "Lekki",
                "recipient_name": "John",
                "recipient_phone": "+2348012345678",
                "package_description": "Documents",
                "package_size": "small"
            }
        )
        self.log_result(
            "17. POST /api/delivery/request?sender_id=test-user-123",
            success,
            f"Status: {status}, Package delivery request" if success else f"Failed with status {status}",
            response if not success else None
        )
        
        # 8. DRIVER FEATURES TESTS
        print("\n🚛 DRIVER FEATURES ENDPOINTS")
        print("-" * 35)
        
        # Test 18: Driver Heatmap
        success, response, status = self.test_endpoint(
            "GET", "/driver/heatmap"
        )
        self.log_result(
            "18. GET /api/driver/heatmap",
            success,
            f"Status: {status}, Driver demand heatmap" if success else f"Failed with status {status}",
            response if not success else None
        )
        
        # Test 19: Get Driver Subscriptions
        success, response, status = self.test_endpoint(
            "GET", "/subscriptions/test-driver-123"
        )
        self.log_result(
            "19. GET /api/subscriptions/test-driver-123",
            success,
            f"Status: {status}, Driver subscription status" if success else f"Failed with status {status}",
            response if not success else None
        )
        
        # Test 20: Start Trial Subscription
        success, response, status = self.test_endpoint(
            "POST", "/subscriptions/test-driver-123/start-trial"
        )
        self.log_result(
            "20. POST /api/subscriptions/test-driver-123/start-trial",
            success,
            f"Status: {status}, Start 7-day trial" if success else f"Failed with status {status}",
            response if not success else None
        )
        
        # 9. AI CHAT TESTS
        print("\n🤖 AI CHAT ENDPOINTS")
        print("-" * 25)
        
        # Test 21: AI Chat
        success, response, status = self.test_endpoint(
            "POST", "/chat/ai",
            data={
                "user_id": "test-user-123",
                "message": "What is the fare from Lekki to Victoria Island?",
                "user_role": "rider"
            }
        )
        self.log_result(
            "21. POST /api/chat/ai",
            success,
            f"Status: {status}, GPT-4o AI chat" if success else f"Failed with status {status}",
            response if not success else None
        )
        
        # Test 22: AI Chat History
        success, response, status = self.test_endpoint(
            "GET", "/chat/ai/history/test-user-123"
        )
        self.log_result(
            "22. GET /api/chat/ai/history/test-user-123",
            success,
            f"Status: {status}, AI chat history" if success else f"Failed with status {status}",
            response if not success else None
        )
        
        # Test 23: Rider Chat Presets
        success, response, status = self.test_endpoint(
            "GET", "/chat/presets/rider"
        )
        self.log_result(
            "23. GET /api/chat/presets/rider",
            success,
            f"Status: {status}, Rider chat presets" if success else f"Failed with status {status}",
            response if not success else None
        )
        
        # Test 24: Driver Chat Presets
        success, response, status = self.test_endpoint(
            "GET", "/chat/presets/driver"
        )
        self.log_result(
            "24. GET /api/chat/presets/driver",
            success,
            f"Status: {status}, Driver chat presets" if success else f"Failed with status {status}",
            response if not success else None
        )
        
        # 10. DRIVER-RIDER MESSAGING TESTS
        print("\n💬 DRIVER-RIDER MESSAGING ENDPOINTS")
        print("-" * 40)
        
        # Test 25: Send Message
        success, response, status = self.test_endpoint(
            "POST", "/chat/message",
            data={
                "trip_id": "test-trip-123",
                "sender_id": "test-user-123",
                "sender_role": "rider",
                "message": "I am waiting at the gate"
            }
        )
        self.log_result(
            "25. POST /api/chat/message",
            success,
            f"Status: {status}, Driver-rider messaging" if success else f"Failed with status {status}",
            response if not success else None
        )
        
        # 11. SAFETY TESTS
        print("\n🚨 SAFETY ENDPOINTS")
        print("-" * 20)
        
        # Test 26: SOS Trigger
        success, response, status = self.test_endpoint(
            "POST", "/sos/trigger",
            data={
                "user_id": "test-user-123",
                "location": {"lat": 6.4281, "lng": 3.4219}
            }
        )
        self.log_result(
            "26. POST /api/sos/trigger",
            success,
            f"Status: {status}, Emergency SOS system" if success else f"Failed with status {status}",
            response if not success else None
        )
        
        # 12. TRIP RECEIPTS TESTS
        print("\n🧾 TRIP RECEIPTS ENDPOINTS")
        print("-" * 30)
        
        # Test 27: Trip Receipt (need to create a trip first)
        # First create a trip
        trip_success, trip_response, trip_status = self.test_endpoint(
            "POST", "/trips/request",
            data={
                "rider_id": "test-user-123",
                "pickup_lat": 6.4281,
                "pickup_lng": 3.4219,
                "pickup_address": "Victoria Island",
                "dropoff_lat": 6.4355,
                "dropoff_lng": 3.4567,
                "dropoff_address": "Lekki",
                "service_type": "economy",
                "payment_method": "cash"
            }
        )
        
        if trip_success and isinstance(trip_response, dict) and "trip_id" in trip_response:
            trip_id = trip_response["trip_id"]
            success, response, status = self.test_endpoint(
                "GET", f"/trips/{trip_id}/receipt"
            )
            self.log_result(
                f"27. GET /api/trips/{trip_id}/receipt",
                success,
                f"Status: {status}, Trip receipt generation" if success else f"Failed with status {status}",
                response if not success else None
            )
        else:
            # Use a test trip ID
            success, response, status = self.test_endpoint(
                "GET", "/trips/test-trip-123/receipt"
            )
            self.log_result(
                "27. GET /api/trips/test-trip-123/receipt",
                success,
                f"Status: {status}, Trip receipt generation" if success else f"Failed with status {status}",
                response if not success else None
            )

    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 60)
        print("🏁 NEXRYDE BACKEND API TEST SUMMARY")
        print("=" * 60)
        
        total_tests = self.passed + self.failed
        success_rate = (self.passed / total_tests * 100) if total_tests > 0 else 0
        
        print(f"Total Tests: {total_tests}")
        print(f"✅ Passed: {self.passed}")
        print(f"❌ Failed: {self.failed}")
        print(f"📊 Success Rate: {success_rate:.1f}%")
        
        if self.failed > 0:
            print(f"\n❌ FAILED TESTS ({self.failed}):")
            print("-" * 30)
            for result in self.test_results:
                if "❌ FAIL" in result["status"]:
                    print(f"• {result['test']}")
                    if result["details"]:
                        print(f"  └─ {result['details']}")
        
        print(f"\n✅ WORKING TESTS ({self.passed}):")
        print("-" * 30)
        for result in self.test_results:
            if "✅ PASS" in result["status"]:
                print(f"• {result['test']}")
        
        return success_rate, self.passed, self.failed

def main():
    """Main test execution"""
    print("🚀 NEXRYDE Backend API Comprehensive Testing")
    print(f"🌐 Backend URL: {BACKEND_URL}")
    print(f"📅 Test Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    tester = NEXRYDEAPITester()
    tester.run_comprehensive_tests()
    success_rate, passed, failed = tester.print_summary()
    
    # Exit with appropriate code
    if failed == 0:
        print("\n🎉 All tests passed!")
        sys.exit(0)
    else:
        print(f"\n⚠️  {failed} test(s) failed. Check details above.")
        sys.exit(1)

if __name__ == "__main__":
    main()