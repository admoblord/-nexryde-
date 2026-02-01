#!/usr/bin/env python3
"""
NEXRYDE Priority Flow Testing - Complete End-to-End Testing
Testing the specific priority flows mentioned in the review request
"""

import requests
import json
import time
from datetime import datetime, timedelta

BASE_URL = "https://nexryde-staging.preview.emergentagent.com/api"

class PriorityFlowTester:
    def __init__(self):
        self.session = requests.Session()
        self.results = []
        
        # Test data
        self.driver_phone = "+2348087654321"
        self.rider_phone = "+2348012345678"
        self.driver_id = None
        self.rider_id = None
        self.trip_id = None
        
        # Lagos coordinates
        self.lagos_pickup = {"lat": 6.5244, "lng": 3.3792}  # Victoria Island
        self.lagos_dropoff = {"lat": 6.4474, "lng": 3.4539}  # Lekki Phase 1

    def log_test(self, test_name, success, details=None, error=None):
        """Log test result"""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "error": error,
            "timestamp": datetime.now().isoformat()
        }
        self.results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name}")
        if details:
            print(f"   Details: {details}")
        if error:
            print(f"   Error: {error}")
        print()

    def api_call(self, method, endpoint, data=None, params=None):
        """Make API call"""
        url = f"{BASE_URL}{endpoint}"
        try:
            if method == "GET":
                response = self.session.get(url, params=params, timeout=30)
            elif method == "POST":
                response = self.session.post(url, json=data, timeout=30)
            elif method == "PUT":
                response = self.session.put(url, json=data, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            if 200 <= response.status_code < 300:
                try:
                    return True, response.json()
                except:
                    return True, {"status_code": response.status_code}
            else:
                try:
                    error_data = response.json()
                    return False, error_data.get("detail", f"Status {response.status_code}")
                except:
                    return False, f"Status {response.status_code}: {response.text[:100]}"
        except Exception as e:
            return False, str(e)

    def test_complete_driver_flow(self):
        """PRIORITY 1: Complete Driver Flow End-to-End"""
        print("🚗 PRIORITY 1: COMPLETE DRIVER FLOW TESTING")
        print("=" * 60)
        
        # Step 1: Driver Registration - Send OTP
        success, response = self.api_call("POST", "/auth/send-otp", {"phone": self.driver_phone})
        if success:
            otp = response.get("otp", "123456")  # Use mock OTP
            self.log_test("Driver Registration - Send OTP", True, f"OTP: {otp}, Provider: {response.get('provider')}")
            
            # Step 2: Verify OTP
            success, response = self.api_call("POST", "/auth/verify-otp", {"phone": self.driver_phone, "otp": otp})
            if success:
                self.log_test("Driver Registration - Verify OTP", True, f"New user: {response.get('is_new_user')}")
                
                # Step 3: Register as Driver
                success, response = self.api_call("POST", "/auth/register", {
                    "phone": self.driver_phone,
                    "name": "Test Driver",
                    "email": "testdriver@nexryde.com",
                    "role": "driver"
                })
                
                if success and response.get("user"):
                    self.driver_id = response["user"]["id"]
                    self.log_test("Driver Registration - Register User", True, f"Driver ID: {self.driver_id}")
                    
                    # Step 4: Driver Profile Setup
                    success, response = self.api_call("PUT", f"/drivers/{self.driver_id}/profile", {
                        "vehicle_type": "sedan",
                        "vehicle_model": "Toyota Camry 2020",
                        "vehicle_plate": "ABC123DE",
                        "vehicle_color": "Black",
                        "bank_name": "GTBank",
                        "account_number": "0123456789",
                        "account_name": "Test Driver"
                    })
                    self.log_test("Driver Profile Setup", success, "Vehicle and bank details updated" if success else None, response if not success else None)
                    
                    # Step 5: Document Verification
                    verification_data = {
                        "user_id": self.driver_id,
                        "personal_info": {
                            "fullName": "Test Driver",
                            "phone": self.driver_phone,
                            "email": "testdriver@nexryde.com",
                            "address": "123 Lagos Street, Victoria Island",
                            "dateOfBirth": "1990-01-01"
                        },
                        "vehicle_info": {
                            "vehicleMake": "Toyota",
                            "vehicleModel": "Camry",
                            "vehicleYear": "2020",
                            "vehicleColor": "Black",
                            "plateNumber": "ABC123DE"
                        },
                        "documents": {
                            "nin": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=",
                            "drivers_license": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=",
                            "passport_photo": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=",
                            "vehicle_registration": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=",
                            "insurance": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="
                        }
                    }
                    
                    success, response = self.api_call("POST", "/drivers/verification/submit", verification_data)
                    self.log_test("Driver Document Verification", success, "AI verification triggered" if success else None, response if not success else None)
                    
                    # Step 6: Subscription Flow
                    # Get subscription config
                    success, response = self.api_call("GET", "/subscriptions/config")
                    if success:
                        bank_details = response.get("bank_details", {})
                        self.log_test("Get Subscription Config", True, f"Bank: {bank_details.get('bank_name')}, Account: {bank_details.get('account_number')}, Fee: ₦{response.get('monthly_fee')}")
                    else:
                        self.log_test("Get Subscription Config", False, None, response)
                    
                    # Start trial
                    success, response = self.api_call("POST", f"/subscriptions/{self.driver_id}/start-trial", {"payment_method": "bank_transfer"})
                    self.log_test("Start Subscription Trial", success, f"Trial started: {response.get('trial_end_date')}" if success else None, response if not success else None)
                    
                    # Submit payment proof
                    payment_screenshot = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="
                    
                    success, response = self.api_call("POST", f"/subscriptions/{self.driver_id}/submit-payment", {
                        "driver_id": self.driver_id,
                        "screenshot": payment_screenshot,
                        "amount": 25000,
                        "payment_reference": "TEST123456"
                    })
                    self.log_test("Submit Payment Proof", success, f"Status: {response.get('status')}" if success else None, response if not success else None)
                    
                    # Check subscription status
                    success, response = self.api_call("GET", f"/subscriptions/{self.driver_id}")
                    if success and response.get("subscription"):
                        sub = response["subscription"]
                        self.log_test("Check Subscription Status", True, f"Status: {sub.get('status')}, Days remaining: {sub.get('days_remaining')}")
                    else:
                        self.log_test("Check Subscription Status", False, None, response)
                    
                    # Step 7: Go Online
                    success, response = self.api_call("PUT", f"/drivers/{self.driver_id}/online?is_online=true")
                    self.log_test("Driver Go Online", success, response.get("message") if success else None, response if not success else None)
                    
                    # Step 8: Get Driver Stats
                    success, response = self.api_call("GET", f"/drivers/{self.driver_id}/stats")
                    if success:
                        self.log_test("Get Driver Stats", True, f"Earnings: ₦{response.get('total_earnings', 0)}, Trips: {response.get('total_trips', 0)}, Rating: {response.get('rating', 0)}")
                    else:
                        self.log_test("Get Driver Stats", False, None, response)

    def test_complete_rider_flow(self):
        """PRIORITY 2: Complete Rider Flow End-to-End"""
        print("🚗 PRIORITY 2: COMPLETE RIDER FLOW TESTING")
        print("=" * 60)
        
        # Step 1: Rider Registration - Send OTP
        success, response = self.api_call("POST", "/auth/send-otp", {"phone": self.rider_phone})
        if success:
            otp = response.get("otp", "123456")  # Use mock OTP
            self.log_test("Rider Registration - Send OTP", True, f"OTP: {otp}, Provider: {response.get('provider')}")
            
            # Step 2: Verify OTP
            success, response = self.api_call("POST", "/auth/verify-otp", {"phone": self.rider_phone, "otp": otp})
            if success:
                self.log_test("Rider Registration - Verify OTP", True, f"New user: {response.get('is_new_user')}")
                
                # Step 3: Register as Rider
                success, response = self.api_call("POST", "/auth/register", {
                    "phone": self.rider_phone,
                    "name": "Test Rider",
                    "email": "testrider@nexryde.com",
                    "role": "rider"
                })
                
                if success and response.get("user"):
                    self.rider_id = response["user"]["id"]
                    self.log_test("Rider Registration - Register User", True, f"Rider ID: {self.rider_id}")
                    
                    # Step 4: Fare Estimation
                    success, response = self.api_call("POST", "/fare/estimate", {
                        "pickup_lat": self.lagos_pickup["lat"],
                        "pickup_lng": self.lagos_pickup["lng"],
                        "dropoff_lat": self.lagos_dropoff["lat"],
                        "dropoff_lng": self.lagos_dropoff["lng"],
                        "service_type": "economy",
                        "city": "lagos"
                    })
                    
                    if success:
                        self.log_test("Fare Estimation", True, f"Distance: {response.get('distance_km')}km, Duration: {response.get('duration_min')}min, Fare: ₦{response.get('total_fare')}")
                    else:
                        self.log_test("Fare Estimation", False, None, response)
                    
                    # Step 5: Trip Request
                    success, response = self.api_call("POST", f"/trips/request?rider_id={self.rider_id}", {
                        "pickup_lat": self.lagos_pickup["lat"],
                        "pickup_lng": self.lagos_pickup["lng"],
                        "pickup_address": "Victoria Island, Lagos",
                        "dropoff_lat": self.lagos_dropoff["lat"],
                        "dropoff_lng": self.lagos_dropoff["lng"],
                        "dropoff_address": "Lekki Phase 1, Lagos",
                        "service_type": "economy",
                        "payment_method": "cash"
                    })
                    
                    if success and response.get("trip"):
                        self.trip_id = response["trip"]["id"]
                        self.log_test("Trip Request", True, f"Trip ID: {self.trip_id}")
                    else:
                        self.log_test("Trip Request", False, None, response)
                    
                    # Step 6: Ride Bidding
                    success, response = self.api_call("POST", f"/bids/create?rider_id={self.rider_id}", {
                        "pickup_lat": self.lagos_pickup["lat"],
                        "pickup_lng": self.lagos_pickup["lng"],
                        "dropoff_lat": self.lagos_dropoff["lat"],
                        "dropoff_lng": self.lagos_dropoff["lng"],
                        "max_bid": 2500,
                        "pickup_address": "Victoria Island, Lagos",
                        "dropoff_address": "Lekki Phase 1, Lagos"
                    })
                    self.log_test("Create Ride Bid", success, f"Bid ID: {response.get('bid_id')}" if success else None, response if not success else None)
                    
                    # Get open bids
                    success, response = self.api_call("GET", "/bids/open", {"lat": self.lagos_pickup["lat"], "lng": self.lagos_pickup["lng"], "radius": 10})
                    if success:
                        bids_count = len(response.get("bids", []))
                        self.log_test("Get Open Bids", True, f"Found {bids_count} open bids")
                    else:
                        self.log_test("Get Open Bids", False, None, response)
                    
                    # Step 7: Schedule Ride
                    future_time = (datetime.now() + timedelta(hours=2)).isoformat()
                    success, response = self.api_call("POST", f"/scheduled-rides?rider_id={self.rider_id}", {
                        "pickup_lat": self.lagos_pickup["lat"],
                        "pickup_lng": self.lagos_pickup["lng"],
                        "dropoff_lat": self.lagos_dropoff["lat"],
                        "dropoff_lng": self.lagos_dropoff["lng"],
                        "pickup_address": "Victoria Island, Lagos",
                        "dropoff_address": "Lekki Phase 1, Lagos",
                        "scheduled_time": future_time,
                        "service_type": "economy"
                    })
                    self.log_test("Schedule Future Ride", success, f"Scheduled ID: {response.get('scheduled_ride_id')}" if success else None, response if not success else None)
                    
                    # Step 8: Package Delivery
                    success, response = self.api_call("POST", f"/delivery/request?sender_id={self.rider_id}", {
                        "pickup_lat": self.lagos_pickup["lat"],
                        "pickup_lng": self.lagos_pickup["lng"],
                        "dropoff_lat": self.lagos_dropoff["lat"],
                        "dropoff_lng": self.lagos_dropoff["lng"],
                        "pickup_address": "Victoria Island, Lagos",
                        "dropoff_address": "Lekki Phase 1, Lagos",
                        "recipient_name": "John Doe",
                        "recipient_phone": "+2348012345679",
                        "package_description": "Documents",
                        "package_size": "small"
                    })
                    self.log_test("Package Delivery Request", success, f"Delivery ID: {response.get('delivery_id')}, Fare: ₦{response.get('fare')}" if success else None, response if not success else None)
                    
                    # Step 9: AI Chat
                    success, response = self.api_call("POST", "/chat/ai", {
                        "user_id": self.rider_id,
                        "message": "What's the fare from Lekki to Victoria Island?",
                        "role": "rider"
                    })
                    self.log_test("AI Chat - Fare Inquiry", success, "AI responded with fare information" if success else None, response if not success else None)
                    
                    # Get chat presets
                    success, response = self.api_call("GET", "/chat/presets/rider")
                    if success:
                        presets_count = len(response.get("presets", []))
                        self.log_test("Get Rider Chat Presets", True, f"Found {presets_count} preset messages")
                    else:
                        self.log_test("Get Rider Chat Presets", False, None, response)
                    
                    # Step 10: Safety Features
                    # Add emergency contact
                    success, response = self.api_call("POST", f"/users/{self.rider_id}/emergency-contacts", {
                        "name": "Emergency Contact",
                        "phone": "+2348012345680",
                        "relationship": "family"
                    })
                    self.log_test("Add Emergency Contact", success, "Emergency contact added" if success else None, response if not success else None)
                    
                    # Trigger SOS (expected to fail without active trip)
                    if self.trip_id:
                        success, response = self.api_call("POST", "/sos/trigger", {
                            "trip_id": self.trip_id,
                            "location_lat": self.lagos_pickup["lat"],
                            "location_lng": self.lagos_pickup["lng"]
                        })
                        self.log_test("SOS Trigger", success, "SOS triggered successfully" if success else None, response if not success else None)

    def test_admin_panel_flow(self):
        """PRIORITY 4: Admin Panel Testing"""
        print("👨‍💼 PRIORITY 4: ADMIN PANEL TESTING")
        print("=" * 60)
        
        # Admin Login
        success, response = self.api_call("POST", "/admin/login", {
            "email": "admin@nexryde.com",
            "password": "nexryde2025"
        })
        
        if success:
            self.log_test("Admin Login", True, f"Token: {response.get('token', '')[:20]}...")
            
            # Dashboard Overview
            success, response = self.api_call("GET", "/admin/overview")
            if success:
                self.log_test("Admin Dashboard", True, f"Riders: {response.get('total_riders')}, Drivers: {response.get('total_drivers')}, Revenue: ₦{response.get('total_revenue')}")
            else:
                self.log_test("Admin Dashboard", False, None, response)
            
            # Payments Management
            success, response = self.api_call("GET", "/admin/payments")
            if success:
                payments_count = len(response.get("payments", []))
                self.log_test("Admin Payments", True, f"Found {payments_count} payment records")
            else:
                self.log_test("Admin Payments", False, None, response)
            
            # Verifications Management
            success, response = self.api_call("GET", "/admin/verifications")
            if success:
                verifications_count = len(response.get("verifications", []))
                self.log_test("Admin Verifications", True, f"Found {verifications_count} verification records")
            else:
                self.log_test("Admin Verifications", False, None, response)
        else:
            self.log_test("Admin Login", False, None, response)

    def test_wallet_and_payments(self):
        """PRIORITY 5: Wallet & Payments Testing"""
        print("💰 PRIORITY 5: WALLET & PAYMENTS TESTING")
        print("=" * 60)
        
        if self.rider_id:
            # Wallet Balance
            success, response = self.api_call("GET", f"/wallet/{self.rider_id}")
            if success:
                self.log_test("Get Wallet Balance", True, f"Balance: ₦{response.get('balance')}")
            else:
                self.log_test("Get Wallet Balance", False, None, response)
            
            # Top Up Wallet
            success, response = self.api_call("POST", f"/wallet/{self.rider_id}/topup?amount=5000", {
                "payment_method": "bank_transfer",
                "reference": "TEST_TOPUP_123"
            })
            if success:
                self.log_test("Wallet Top-up", True, f"New Balance: ₦{response.get('new_balance')}")
            else:
                self.log_test("Wallet Top-up", False, None, response)
            
            # Referral Code
            success, response = self.api_call("GET", f"/referrals/{self.rider_id}/code")
            if success:
                self.log_test("Get Referral Code", True, f"Code: {response.get('referral_code')}")
            else:
                self.log_test("Get Referral Code", False, None, response)

    def run_priority_tests(self):
        """Run all priority flow tests"""
        print("🚀 NEXRYDE PRIORITY FLOW TESTING")
        print("=" * 80)
        print(f"Testing Base URL: {BASE_URL}")
        print(f"Started: {datetime.now().isoformat()}")
        print("=" * 80)
        
        self.test_complete_driver_flow()
        self.test_complete_rider_flow()
        self.test_admin_panel_flow()
        self.test_wallet_and_payments()
        
        self.generate_summary()

    def generate_summary(self):
        """Generate test summary"""
        print("\n" + "=" * 80)
        print("📊 PRIORITY FLOW TEST SUMMARY")
        print("=" * 80)
        
        total_tests = len(self.results)
        passed_tests = sum(1 for result in self.results if result["success"])
        failed_tests = total_tests - passed_tests
        success_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests} ✅")
        print(f"Failed: {failed_tests} ❌")
        print(f"Success Rate: {success_rate:.1f}%")
        print()
        
        if failed_tests > 0:
            print("❌ FAILED TESTS:")
            for result in self.results:
                if not result["success"]:
                    print(f"   • {result['test']}")
                    if result["error"]:
                        print(f"     Error: {result['error']}")
            print()
        
        print("✅ PASSED TESTS:")
        for result in self.results:
            if result["success"]:
                print(f"   • {result['test']}")
        
        print(f"\nCompleted: {datetime.now().isoformat()}")
        print("=" * 80)

if __name__ == "__main__":
    tester = PriorityFlowTester()
    tester.run_priority_tests()