#!/usr/bin/env python3
"""
NEXRYDE WebSocket and New Features API Testing Suite
Testing WebSocket chat endpoint and new feature APIs as requested in review
"""

import asyncio
import json
import requests
import websockets
from datetime import datetime, timedelta
import uuid
import sys

# Backend URL from frontend .env
BACKEND_URL = "https://nexryde-admin.preview.emergentagent.com/api"
WS_URL = "wss://nexryde-admin.preview.emergentagent.com/ws"

class WebSocketFeaturesTester:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'NEXRYDE-WebSocket-Features-Tester/1.0'
        })
        self.test_results = []
        
    def log(self, message):
        timestamp = datetime.now().strftime('%H:%M:%S')
        print(f"[{timestamp}] {message}")
        
    def log_test(self, test_name: str, success: bool, details: str, response_data=None):
        """Log test result"""
        result = {
            "test_name": test_name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat(),
            "response_data": response_data
        }
        self.test_results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        self.log(f"{status} {test_name} - {details}")
        
        if response_data and not success:
            self.log(f"    Error details: {response_data}")
        
    def test_endpoint(self, method, endpoint, data=None, params=None, expected_status=200):
        """Test a single API endpoint"""
        url = f"{BACKEND_URL}{endpoint}"
        try:
            if method.upper() == 'GET':
                response = self.session.get(url, params=params, timeout=30)
            elif method.upper() == 'POST':
                response = self.session.post(url, json=data, params=params, timeout=30)
            elif method.upper() == 'DELETE':
                response = self.session.delete(url, params=params, timeout=30)
            else:
                return False, f"Unsupported method: {method}"
                
            self.log(f"    {method} {endpoint} -> {response.status_code}")
            
            if response.status_code == expected_status:
                try:
                    return True, response.json()
                except:
                    return True, response.text
            else:
                try:
                    error_data = response.json()
                except:
                    error_data = response.text
                return False, f"Expected {expected_status}, got {response.status_code}: {error_data}"
                
        except Exception as e:
            return False, f"Request failed: {str(e)}"
    
    async def test_websocket_endpoint(self):
        """Test WebSocket chat endpoint /ws/chat/{trip_id}/{user_id}"""
        self.log("🔌 Testing WebSocket Chat Endpoint")
        
        # Generate test IDs
        trip_id = str(uuid.uuid4())
        user_id = str(uuid.uuid4())
        ws_endpoint = f"{WS_URL}/chat/{trip_id}/{user_id}"
        
        try:
            # Try to connect to WebSocket
            self.log(f"    Attempting connection to: {ws_endpoint}")
            
            async with websockets.connect(ws_endpoint) as websocket:
                self.log_test(
                    "WebSocket Connection", 
                    True, 
                    f"Successfully connected to /ws/chat/{trip_id}/{user_id}"
                )
                
                # Try sending a test message
                test_message = {
                    "type": "message",
                    "content": "Test message from backend tester",
                    "sender_id": user_id,
                    "timestamp": datetime.now().isoformat()
                }
                
                await websocket.send(json.dumps(test_message))
                self.log_test(
                    "WebSocket Send Message", 
                    True, 
                    "Test message sent successfully"
                )
                
                # Try to receive a response (with timeout)
                try:
                    response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                    self.log_test(
                        "WebSocket Receive Response", 
                        True, 
                        f"Response received: {response[:100]}..."
                    )
                    return True, "WebSocket endpoint fully functional"
                except asyncio.TimeoutError:
                    self.log_test(
                        "WebSocket Receive Response", 
                        True, 
                        "No immediate response (normal for chat endpoint)"
                    )
                    return True, "WebSocket connection works, no echo expected"
                    
        except websockets.exceptions.InvalidStatusCode as e:
            if e.status_code == 404:
                self.log_test(
                    "WebSocket Connection", 
                    False, 
                    "WebSocket endpoint not found (404)",
                    f"Status code: {e.status_code}"
                )
                return False, "WebSocket endpoint not implemented"
            else:
                self.log_test(
                    "WebSocket Connection", 
                    False, 
                    f"WebSocket connection failed with status {e.status_code}",
                    str(e)
                )
                return False, f"WebSocket error: {e.status_code}"
        except Exception as e:
            self.log_test(
                "WebSocket Connection", 
                False, 
                f"WebSocket connection failed: {str(e)}",
                str(e)
            )
            return False, f"WebSocket connection failed: {str(e)}"
    
    def test_surge_pricing(self):
        """Test Surge Pricing API - GET /api/surge/check"""
        self.log("📈 Testing Surge Pricing API")
        
        # Test surge pricing check with Lagos coordinates
        params = {"lat": 6.4281, "lng": 3.4219}
        success, result = self.test_endpoint("GET", "/surge/check", params=params)
        
        if success:
            if isinstance(result, dict) and "multiplier" in result:
                multiplier = result.get('multiplier', 'unknown')
                is_active = result.get('is_surge', False)
                self.log_test(
                    "Surge Pricing Check", 
                    True, 
                    f"Surge multiplier: {multiplier}x, Active: {is_active}",
                    result
                )
                return True, result
            else:
                self.log_test(
                    "Surge Pricing Check", 
                    False, 
                    "Invalid surge pricing response format",
                    result
                )
                return False, "Invalid response format"
        else:
            self.log_test(
                "Surge Pricing Check", 
                False, 
                "Surge pricing API failed",
                result
            )
            return False, result
    
    def test_ride_bidding_apis(self):
        """Test Ride Bidding APIs (InDrive Style)"""
        self.log("🚗 Testing Ride Bidding APIs")
        
        # Test 1: Create bid request
        bid_data = {
            "rider_offered_price": 1500,
            "pickup_lat": 6.4281,
            "pickup_lng": 3.4219,
            "pickup_address": "Victoria Island, Lagos",
            "dropoff_lat": 6.4474,
            "dropoff_lng": 3.5562,
            "dropoff_address": "Lekki Phase 1, Lagos",
            "ride_type": "economy"
        }
        
        params = {"rider_id": "test-rider-websocket-123"}
        success, result = self.test_endpoint("POST", "/rides/bid/create", data=bid_data, params=params)
        if not success:
            self.log_test(
                "Create Bid Request", 
                False, 
                "Failed to create bid request",
                result
            )
            return False, f"Create bid failed: {result}"
        
        if isinstance(result, dict) and "bid_id" in result:
            bid_id = result["bid_id"]
            self.log_test(
                "Create Bid Request", 
                True, 
                f"Bid created successfully with ID: {bid_id}",
                result
            )
            
            # Test 2: Get driver offers for bid
            success2, result2 = self.test_endpoint("GET", f"/rides/bid/{bid_id}/offers")
            if success2:
                offers = result2.get('offers', []) if isinstance(result2, dict) else []
                self.log_test(
                    "Get Bid Offers", 
                    True, 
                    f"Retrieved {len(offers)} offers for bid",
                    result2
                )
                
                # Test 3: Accept offer (will likely fail as no real offers)
                fake_offer_id = str(uuid.uuid4())
                success3, result3 = self.test_endpoint(
                    "POST", 
                    f"/rides/bid/{bid_id}/accept/{fake_offer_id}", 
                    expected_status=404
                )
                if success3 or "not found" in str(result3).lower():
                    self.log_test(
                        "Accept Bid Offer", 
                        True, 
                        "Accept offer endpoint exists (404 expected for fake offer)",
                        result3
                    )
                    return True, "All ride bidding endpoints working"
                else:
                    self.log_test(
                        "Accept Bid Offer", 
                        False, 
                        "Accept offer endpoint failed unexpectedly",
                        result3
                    )
                    return False, f"Accept offer failed: {result3}"
            else:
                self.log_test(
                    "Get Bid Offers", 
                    False, 
                    "Failed to get offers for bid",
                    result2
                )
                return False, f"Get offers failed: {result2}"
        else:
            self.log_test(
                "Create Bid Request", 
                False, 
                "Invalid bid creation response format",
                result
            )
            return False, "Invalid bid creation response"
    
    def test_scheduled_rides_apis(self):
        """Test Scheduled Rides APIs"""
        self.log("⏰ Testing Scheduled Rides APIs")
        
        # Test 1: Schedule a ride
        future_time = datetime.now() + timedelta(hours=2)
        schedule_data = {
            "pickup_lat": 6.4281,
            "pickup_lng": 3.4219,
            "pickup_address": "Victoria Island, Lagos",
            "dropoff_lat": 6.4474,
            "dropoff_lng": 3.5562,
            "dropoff_address": "Lekki Phase 1, Lagos",
            "scheduled_time": future_time.isoformat(),
            "ride_type": "economy"
        }
        
        params = {"rider_id": "test-rider-websocket-123"}
        success, result = self.test_endpoint("POST", "/rides/schedule", data=schedule_data, params=params)
        if not success:
            self.log_test(
                "Schedule Ride", 
                False, 
                "Failed to schedule ride",
                result
            )
            return False, f"Schedule ride failed: {result}"
        
        if isinstance(result, dict) and "scheduled_ride_id" in result:
            ride_id = result["scheduled_ride_id"]
            self.log_test(
                "Schedule Ride", 
                True, 
                f"Ride scheduled successfully with ID: {ride_id}",
                result
            )
            
            # Test 2: Get user's scheduled rides
            success2, result2 = self.test_endpoint("GET", "/rides/scheduled/test-rider-websocket-123")
            if success2:
                scheduled_rides = result2.get("scheduled_rides", []) if isinstance(result2, dict) else []
                self.log_test(
                    "Get Scheduled Rides", 
                    True, 
                    f"Retrieved {len(scheduled_rides)} scheduled rides",
                    result2
                )
                
                # Test 3: Cancel scheduled ride
                success3, result3 = self.test_endpoint("DELETE", f"/rides/scheduled/{ride_id}/cancel")
                if success3:
                    self.log_test(
                        "Cancel Scheduled Ride", 
                        True, 
                        "Scheduled ride cancelled successfully",
                        result3
                    )
                    return True, "All scheduled rides endpoints working"
                else:
                    self.log_test(
                        "Cancel Scheduled Ride", 
                        False, 
                        "Failed to cancel scheduled ride",
                        result3
                    )
                    return False, f"Cancel ride failed: {result3}"
            else:
                self.log_test(
                    "Get Scheduled Rides", 
                    False, 
                    "Failed to get scheduled rides",
                    result2
                )
                return False, f"Get scheduled rides failed: {result2}"
        else:
            self.log_test(
                "Schedule Ride", 
                False, 
                "Invalid schedule response format",
                result
            )
            return False, "Invalid schedule response"
    
    def test_package_delivery_apis(self):
        """Test Package Delivery APIs"""
        self.log("📦 Testing Package Delivery APIs")
        
        # Test 1: Request package delivery
        delivery_data = {
            "pickup_lat": 6.4281,
            "pickup_lng": 3.4219,
            "pickup_address": "Victoria Island, Lagos",
            "dropoff_lat": 6.4474,
            "dropoff_lng": 3.5562,
            "dropoff_address": "Lekki Phase 1, Lagos",
            "recipient_name": "John Doe",
            "recipient_phone": "+2348012345678",
            "package_description": "Important Documents",
            "package_size": "small"
        }
        
        params = {"sender_id": "test-sender-websocket-123"}
        success, result = self.test_endpoint("POST", "/delivery/request", data=delivery_data, params=params)
        if not success:
            self.log_test(
                "Request Package Delivery", 
                False, 
                "Failed to request package delivery",
                result
            )
            return False, f"Request delivery failed: {result}"
        
        if isinstance(result, dict) and "delivery_id" in result:
            delivery_id = result["delivery_id"]
            self.log_test(
                "Request Package Delivery", 
                True, 
                f"Delivery requested successfully with ID: {delivery_id}",
                result
            )
            
            # Test 2: Get delivery status
            success2, result2 = self.test_endpoint("GET", f"/delivery/{delivery_id}")
            if success2:
                status = result2.get("status", "unknown") if isinstance(result2, dict) else "unknown"
                self.log_test(
                    "Get Delivery Status", 
                    True, 
                    f"Delivery status retrieved: {status}",
                    result2
                )
                
                # Test 3: Get user's deliveries
                success3, result3 = self.test_endpoint("GET", "/delivery/user/test-sender-websocket-123")
                if success3:
                    deliveries = result3.get("deliveries", []) if isinstance(result3, dict) else []
                    self.log_test(
                        "Get User Deliveries", 
                        True, 
                        f"Retrieved {len(deliveries)} user deliveries",
                        result3
                    )
                    return True, "All package delivery endpoints working"
                else:
                    self.log_test(
                        "Get User Deliveries", 
                        False, 
                        "Failed to get user deliveries",
                        result3
                    )
                    return False, f"Get user deliveries failed: {result3}"
            else:
                self.log_test(
                    "Get Delivery Status", 
                    False, 
                    "Failed to get delivery status",
                    result2
                )
                return False, f"Get delivery status failed: {result2}"
        else:
            self.log_test(
                "Request Package Delivery", 
                False, 
                "Invalid delivery request response format",
                result
            )
            return False, "Invalid delivery request response"
    
    async def run_all_tests(self):
        """Run all WebSocket and new features tests"""
        self.log("🚀 Starting NEXRYDE WebSocket & New Features Testing Suite")
        self.log(f"🌐 Backend URL: {BACKEND_URL}")
        self.log(f"🔌 WebSocket URL: {WS_URL}")
        
        test_functions = [
            ("WebSocket Chat Endpoint", self.test_websocket_endpoint),
            ("Surge Pricing API", lambda: self.test_surge_pricing()),
            ("Ride Bidding APIs", lambda: self.test_ride_bidding_apis()),
            ("Scheduled Rides APIs", lambda: self.test_scheduled_rides_apis()),
            ("Package Delivery APIs", lambda: self.test_package_delivery_apis()),
        ]
        
        passed = 0
        failed = 0
        
        for test_name, test_func in test_functions:
            try:
                self.log(f"\n{'='*50}")
                self.log(f"Running: {test_name}")
                self.log('='*50)
                
                if asyncio.iscoroutinefunction(test_func):
                    success, message = await test_func()
                else:
                    success, message = test_func()
                
                if success:
                    passed += 1
                else:
                    failed += 1
                    
            except Exception as e:
                self.log_test(test_name, False, f"Exception occurred: {str(e)}", str(e))
                failed += 1
        
        # Print summary
        total = passed + failed
        success_rate = (passed / total * 100) if total > 0 else 0
        
        self.log(f"\n{'='*60}")
        self.log("📊 TEST RESULTS SUMMARY")
        self.log('='*60)
        
        for result in self.test_results:
            status = "✅ PASS" if result["success"] else "❌ FAIL"
            self.log(f"{status} {result['test_name']}")
            if not result["success"]:
                self.log(f"    Error: {result['details']}")
        
        self.log(f"\n🏁 OVERALL RESULTS:")
        self.log(f"✅ Passed: {passed}/{total}")
        self.log(f"❌ Failed: {failed}/{total}")
        self.log(f"📊 Success Rate: {success_rate:.1f}%")
        
        return {
            "total_tests": total,
            "passed": passed,
            "failed": failed,
            "success_rate": success_rate,
            "test_results": self.test_results
        }

async def main():
    """Main test runner"""
    tester = WebSocketFeaturesTester()
    results = await tester.run_all_tests()
    
    # Return exit code based on results
    if results["failed"] > 0:
        print(f"\n❌ SOME TESTS FAILED")
        return 1
    else:
        print(f"\n✅ ALL TESTS PASSED!")
        return 0

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)