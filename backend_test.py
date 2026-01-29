#!/usr/bin/env python3
"""
NEXRYDE Admin API Testing Suite
Tests all NEW admin API endpoints that were just added to the backend.
"""

import requests
import json
import sys
from datetime import datetime
from typing import Dict, Any, Optional

# Configuration
BASE_URL = "https://nexryde-admin.preview.emergentagent.com/api"
ADMIN_CREDENTIALS = {
    "email": "admin@nexryde.com",
    "password": "nexryde2025"
}

class AdminAPITester:
    def __init__(self):
        self.base_url = BASE_URL
        self.session = requests.Session()
        self.admin_token = None
        self.test_results = []
        
    def log_test(self, endpoint: str, method: str, success: bool, details: str, response_data: Any = None):
        """Log test result"""
        result = {
            "endpoint": endpoint,
            "method": method,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat(),
            "response_data": response_data
        }
        self.test_results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {method} {endpoint} - {details}")
        
        if response_data and isinstance(response_data, dict):
            if success:
                # Show key response fields for successful tests
                if "total_riders" in response_data:
                    print(f"    📊 Stats: {response_data.get('total_riders', 0)} riders, {response_data.get('total_drivers', 0)} drivers")
                elif "riders" in response_data:
                    print(f"    👥 Found {len(response_data['riders'])} riders")
                elif "drivers" in response_data:
                    print(f"    🚗 Found {len(response_data['drivers'])} drivers")
                elif "trips" in response_data:
                    print(f"    🚕 Found {len(response_data['trips'])} trips")
                elif "payments" in response_data:
                    print(f"    💳 Found {len(response_data['payments'])} payments")
                elif "promos" in response_data:
                    print(f"    🎫 Found {len(response_data['promos'])} promo codes")
                elif "alerts" in response_data:
                    print(f"    🚨 Found {len(response_data['alerts'])} SOS alerts")
                elif "activities" in response_data:
                    print(f"    📋 Found {len(response_data['activities'])} activities")
            else:
                # Show error details for failed tests
                error_msg = response_data.get('detail', response_data.get('message', 'Unknown error'))
                print(f"    ❌ Error: {error_msg}")
    
    def make_request(self, method: str, endpoint: str, **kwargs) -> tuple[bool, Any]:
        """Make HTTP request and return (success, response_data)"""
        url = f"{self.base_url}{endpoint}"
        
        try:
            response = self.session.request(method, url, timeout=30, **kwargs)
            
            # Try to parse JSON response
            try:
                data = response.json()
            except:
                data = {"raw_response": response.text}
            
            success = response.status_code in [200, 201]
            return success, data
            
        except requests.exceptions.RequestException as e:
            return False, {"error": str(e)}
    
    def test_admin_login(self) -> bool:
        """Test admin authentication"""
        print("\n🔐 Testing Admin Authentication...")
        
        # Test with correct credentials
        success, data = self.make_request(
            "POST", 
            "/admin/login",
            json=ADMIN_CREDENTIALS
        )
        
        if success and data.get("success"):
            self.admin_token = data.get("token")
            self.log_test("/admin/login", "POST", True, "Admin login successful", data)
            
            # Test with invalid credentials
            invalid_creds = {"email": "wrong@email.com", "password": "wrongpass"}
            success2, data2 = self.make_request("POST", "/admin/login", json=invalid_creds)
            
            if not success2 or not data2.get("success"):
                self.log_test("/admin/login", "POST", True, "Invalid credentials correctly rejected", data2)
                return True
            else:
                self.log_test("/admin/login", "POST", False, "Invalid credentials were accepted (security issue)", data2)
                return False
        else:
            self.log_test("/admin/login", "POST", False, "Admin login failed with correct credentials", data)
            return False
    
    def test_admin_overview(self) -> bool:
        """Test dashboard overview stats"""
        print("\n📊 Testing Admin Dashboard Overview...")
        
        success, data = self.make_request("GET", "/admin/overview")
        
        if success:
            required_fields = [
                "total_riders", "total_drivers", "total_trips", "completed_trips",
                "total_revenue", "subscription_revenue", "active_subscriptions",
                "today_trips", "today_signups"
            ]
            
            missing_fields = [field for field in required_fields if field not in data]
            
            if not missing_fields:
                self.log_test("/admin/overview", "GET", True, "All required dashboard stats returned", data)
                return True
            else:
                self.log_test("/admin/overview", "GET", False, f"Missing fields: {missing_fields}", data)
                return False
        else:
            self.log_test("/admin/overview", "GET", False, "Failed to get dashboard overview", data)
            return False
    
    def test_admin_riders(self) -> bool:
        """Test riders list endpoint"""
        print("\n👥 Testing Admin Riders List...")
        
        success, data = self.make_request("GET", "/admin/riders")
        
        if success and "riders" in data:
            riders = data["riders"]
            
            # Check if riders have required fields
            if riders:
                sample_rider = riders[0]
                required_fields = ["id", "name", "phone", "total_trips", "blocked"]
                missing_fields = [field for field in required_fields if field not in sample_rider]
                
                if not missing_fields:
                    self.log_test("/admin/riders", "GET", True, f"Riders list returned with proper structure", data)
                    return True
                else:
                    self.log_test("/admin/riders", "GET", False, f"Rider missing fields: {missing_fields}", data)
                    return False
            else:
                self.log_test("/admin/riders", "GET", True, "Riders list returned (empty)", data)
                return True
        else:
            self.log_test("/admin/riders", "GET", False, "Failed to get riders list", data)
            return False
    
    def test_admin_drivers(self) -> bool:
        """Test drivers list endpoint"""
        print("\n🚗 Testing Admin Drivers List...")
        
        success, data = self.make_request("GET", "/admin/drivers")
        
        if success and "drivers" in data:
            drivers = data["drivers"]
            
            # Check if drivers have required fields
            if drivers:
                sample_driver = drivers[0]
                required_fields = ["id", "name", "vehicle", "subscription_status", "is_online", "total_trips"]
                missing_fields = [field for field in required_fields if field not in sample_driver]
                
                if not missing_fields:
                    self.log_test("/admin/drivers", "GET", True, f"Drivers list returned with proper structure", data)
                    return True
                else:
                    self.log_test("/admin/drivers", "GET", False, f"Driver missing fields: {missing_fields}", data)
                    return False
            else:
                self.log_test("/admin/drivers", "GET", True, "Drivers list returned (empty)", data)
                return True
        else:
            self.log_test("/admin/drivers", "GET", False, "Failed to get drivers list", data)
            return False
    
    def test_admin_trips(self) -> bool:
        """Test trips list endpoint"""
        print("\n🚕 Testing Admin Trips List...")
        
        success, data = self.make_request("GET", "/admin/trips")
        
        if success and "trips" in data:
            trips = data["trips"]
            
            # Check if trips have required fields
            if trips:
                sample_trip = trips[0]
                required_fields = ["id", "rider_name", "driver_name", "pickup", "dropoff", "fare", "status"]
                missing_fields = [field for field in required_fields if field not in sample_trip]
                
                if not missing_fields:
                    self.log_test("/admin/trips", "GET", True, f"Trips list returned with proper structure", data)
                    return True
                else:
                    self.log_test("/admin/trips", "GET", False, f"Trip missing fields: {missing_fields}", data)
                    return False
            else:
                self.log_test("/admin/trips", "GET", True, "Trips list returned (empty)", data)
                return True
        else:
            self.log_test("/admin/trips", "GET", False, "Failed to get trips list", data)
            return False
    
    def test_admin_payments(self) -> bool:
        """Test subscription payments endpoint"""
        print("\n💳 Testing Admin Payments List...")
        
        success, data = self.make_request("GET", "/admin/payments")
        
        if success:
            required_fields = ["payments", "approved_count", "pending_count", "total_revenue"]
            missing_fields = [field for field in required_fields if field not in data]
            
            if not missing_fields:
                payments = data["payments"]
                
                # Check payment structure if any exist
                if payments:
                    sample_payment = payments[0]
                    payment_fields = ["driver_name", "amount", "screenshot", "status", "auto_approved"]
                    missing_payment_fields = [field for field in payment_fields if field not in sample_payment]
                    
                    if not missing_payment_fields:
                        self.log_test("/admin/payments", "GET", True, f"Payments returned with proper structure", data)
                        return True
                    else:
                        self.log_test("/admin/payments", "GET", False, f"Payment missing fields: {missing_payment_fields}", data)
                        return False
                else:
                    self.log_test("/admin/payments", "GET", True, "Payments list returned (empty)", data)
                    return True
            else:
                self.log_test("/admin/payments", "GET", False, f"Missing fields: {missing_fields}", data)
                return False
        else:
            self.log_test("/admin/payments", "GET", False, "Failed to get payments list", data)
            return False
    
    def test_subscription_actions(self) -> bool:
        """Test subscription approve/reject actions"""
        print("\n⚡ Testing Subscription Actions...")
        
        # Test with a dummy subscription ID (should return not found)
        test_sub_id = "test-subscription-123"
        
        # Test approve
        success1, data1 = self.make_request("POST", f"/admin/subscriptions/{test_sub_id}/approve")
        
        if not success1 or not data1.get("success"):
            self.log_test(f"/admin/subscriptions/{test_sub_id}/approve", "POST", True, "Correctly returned 'not found' for non-existent subscription", data1)
        else:
            self.log_test(f"/admin/subscriptions/{test_sub_id}/approve", "POST", False, "Approved non-existent subscription", data1)
            return False
        
        # Test reject
        success2, data2 = self.make_request("POST", f"/admin/subscriptions/{test_sub_id}/reject")
        
        if not success2 or not data2.get("success"):
            self.log_test(f"/admin/subscriptions/{test_sub_id}/reject", "POST", True, "Correctly returned 'not found' for non-existent subscription", data2)
            return True
        else:
            self.log_test(f"/admin/subscriptions/{test_sub_id}/reject", "POST", False, "Rejected non-existent subscription", data2)
            return False
    
    def test_user_blocking(self) -> bool:
        """Test user block/unblock functionality"""
        print("\n🚫 Testing User Block/Unblock...")
        
        # Test with a dummy user ID (should return not found)
        test_user_id = "test-user-123"
        
        # Test block user
        success1, data1 = self.make_request("POST", f"/admin/users/{test_user_id}/block?block=true")
        
        if not success1 or not data1.get("success"):
            self.log_test(f"/admin/users/{test_user_id}/block", "POST", True, "Correctly returned 'not found' for non-existent user (block)", data1)
        else:
            self.log_test(f"/admin/users/{test_user_id}/block", "POST", False, "Blocked non-existent user", data1)
            return False
        
        # Test unblock user
        success2, data2 = self.make_request("POST", f"/admin/users/{test_user_id}/block?block=false")
        
        if not success2 or not data2.get("success"):
            self.log_test(f"/admin/users/{test_user_id}/block", "POST", True, "Correctly returned 'not found' for non-existent user (unblock)", data2)
            return True
        else:
            self.log_test(f"/admin/users/{test_user_id}/block", "POST", False, "Unblocked non-existent user", data2)
            return False
    
    def test_promo_codes(self) -> bool:
        """Test promo code management"""
        print("\n🎫 Testing Promo Code Management...")
        
        # Test get promos
        success1, data1 = self.make_request("GET", "/admin/promos")
        
        if success1 and "promos" in data1:
            self.log_test("/admin/promos", "GET", True, "Promo codes list retrieved", data1)
        else:
            self.log_test("/admin/promos", "GET", False, "Failed to get promo codes", data1)
            return False
        
        # Test create promo
        success2, data2 = self.make_request("POST", "/admin/promo/create?code=TEST20&discount_percent=20&max_uses=100")
        
        if success2 and data2.get("success"):
            self.log_test("/admin/promo/create", "POST", True, "Promo code created successfully", data2)
            
            # Test toggle promo
            success3, data3 = self.make_request("POST", "/admin/promo/TEST20/toggle")
            
            if success3 and data3.get("success"):
                self.log_test("/admin/promo/TEST20/toggle", "POST", True, "Promo code toggled successfully", data3)
                return True
            else:
                self.log_test("/admin/promo/TEST20/toggle", "POST", False, "Failed to toggle promo code", data3)
                return False
        else:
            self.log_test("/admin/promo/create", "POST", False, "Failed to create promo code", data2)
            return False
    
    def test_sos_alerts(self) -> bool:
        """Test SOS alerts endpoint"""
        print("\n🚨 Testing SOS Alerts...")
        
        success, data = self.make_request("GET", "/admin/sos-alerts")
        
        if success and "alerts" in data:
            self.log_test("/admin/sos-alerts", "GET", True, "SOS alerts retrieved", data)
            return True
        else:
            self.log_test("/admin/sos-alerts", "GET", False, "Failed to get SOS alerts", data)
            return False
    
    def test_activity_log(self) -> bool:
        """Test activity log endpoint"""
        print("\n📋 Testing Activity Log...")
        
        success, data = self.make_request("GET", "/admin/activity-log")
        
        if success and "activities" in data:
            self.log_test("/admin/activity-log", "GET", True, "Activity log retrieved", data)
            return True
        else:
            self.log_test("/admin/activity-log", "GET", False, "Failed to get activity log", data)
            return False
    
    def run_all_tests(self) -> Dict[str, Any]:
        """Run all admin API tests"""
        print("🚀 Starting NEXRYDE Admin API Testing Suite...")
        print(f"🌐 Testing against: {self.base_url}")
        print(f"👤 Admin credentials: {ADMIN_CREDENTIALS['email']}")
        
        test_functions = [
            ("Admin Login", self.test_admin_login),
            ("Dashboard Overview", self.test_admin_overview),
            ("Riders List", self.test_admin_riders),
            ("Drivers List", self.test_admin_drivers),
            ("Trips List", self.test_admin_trips),
            ("Payments List", self.test_admin_payments),
            ("Subscription Actions", self.test_subscription_actions),
            ("User Blocking", self.test_user_blocking),
            ("Promo Codes", self.test_promo_codes),
            ("SOS Alerts", self.test_sos_alerts),
            ("Activity Log", self.test_activity_log),
        ]
        
        passed = 0
        failed = 0
        
        for test_name, test_func in test_functions:
            try:
                if test_func():
                    passed += 1
                else:
                    failed += 1
            except Exception as e:
                print(f"❌ FAIL {test_name} - Exception: {str(e)}")
                self.log_test(test_name, "TEST", False, f"Exception: {str(e)}")
                failed += 1
        
        # Summary
        total = passed + failed
        success_rate = (passed / total * 100) if total > 0 else 0
        
        print(f"\n{'='*60}")
        print(f"🏁 NEXRYDE ADMIN API TESTING COMPLETE")
        print(f"{'='*60}")
        print(f"✅ Passed: {passed}/{total}")
        print(f"❌ Failed: {failed}/{total}")
        print(f"📊 Success Rate: {success_rate:.1f}%")
        
        if failed > 0:
            print(f"\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"   • {result['method']} {result['endpoint']} - {result['details']}")
        
        return {
            "total_tests": total,
            "passed": passed,
            "failed": failed,
            "success_rate": success_rate,
            "test_results": self.test_results
        }

def main():
    """Main function to run the tests"""
    tester = AdminAPITester()
    results = tester.run_all_tests()
    
    # Exit with error code if tests failed
    if results["failed"] > 0:
        sys.exit(1)
    else:
        print(f"\n🎉 All admin API tests passed successfully!")
        sys.exit(0)

if __name__ == "__main__":
    main()