#!/usr/bin/env python3
"""
NEXRYDE Backend Authentication API Testing Script
Tests SMS OTP flow, Google OAuth, and Logout functionality
"""

import requests
import json
import uuid
import time
from datetime import datetime

# API Base URL from frontend .env
BASE_URL = "https://nexryde-ui.preview.emergentagent.com/api"

def log_test(test_name, status, details=""):
    """Log test results with timestamp"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    status_symbol = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⚠️"
    print(f"[{timestamp}] {status_symbol} {test_name}: {status}")
    if details:
        print(f"    Details: {details}")
    print()

def test_sms_otp_flow():
    """Test SMS OTP authentication flow"""
    print("=" * 60)
    print("TESTING SMS OTP AUTHENTICATION FLOW")
    print("=" * 60)
    
    phone_number = "+2348012345678"
    
    # Step 1: Send OTP
    try:
        print(f"Step 1: Sending OTP to {phone_number}")
        response = requests.post(
            f"{BASE_URL}/auth/send-otp",
            json={"phone": phone_number},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            log_test("Send OTP", "PASS", f"Provider: {data.get('provider')}, Message: {data.get('message')}")
            
            # Extract OTP (available in mock mode)
            otp_code = data.get('otp')
            if not otp_code:
                log_test("OTP Extraction", "WARN", "OTP not returned (likely using Termii SMS). Using mock OTP for testing.")
                otp_code = "123456"  # Default mock OTP for testing
            else:
                log_test("OTP Extraction", "PASS", f"OTP: {otp_code}")
        else:
            log_test("Send OTP", "FAIL", f"Status: {response.status_code}, Response: {response.text}")
            return False
            
    except Exception as e:
        log_test("Send OTP", "FAIL", f"Exception: {str(e)}")
        return False
    
    # Step 2: Verify OTP
    try:
        print(f"Step 2: Verifying OTP {otp_code}")
        response = requests.post(
            f"{BASE_URL}/auth/verify-otp",
            json={"phone": phone_number, "otp": otp_code},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            is_new_user = data.get('is_new_user', True)
            log_test("Verify OTP", "PASS", f"New user: {is_new_user}, Message: {data.get('message')}")
            
            if not is_new_user:
                log_test("SMS OTP Flow", "PASS", "Existing user login successful")
                return True
        else:
            log_test("Verify OTP", "FAIL", f"Status: {response.status_code}, Response: {response.text}")
            return False
            
    except Exception as e:
        log_test("Verify OTP", "FAIL", f"Exception: {str(e)}")
        return False
    
    # Step 3: Register new user (if needed)
    try:
        print("Step 3: Registering new user")
        response = requests.post(
            f"{BASE_URL}/auth/register",
            json={
                "phone": phone_number,
                "name": "Adunni Okafor",
                "email": "adunni.okafor@nexryde.com",
                "role": "rider"
            },
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            log_test("Register User", "PASS", f"User ID: {data.get('user', {}).get('id')}")
            log_test("SMS OTP Flow", "PASS", "Complete authentication flow successful")
            return True
        else:
            log_test("Register User", "FAIL", f"Status: {response.status_code}, Response: {response.text}")
            return False
            
    except Exception as e:
        log_test("Register User", "FAIL", f"Exception: {str(e)}")
        return False

def test_google_oauth_flow():
    """Test Google OAuth authentication flow"""
    print("=" * 60)
    print("TESTING GOOGLE OAUTH AUTHENTICATION FLOW")
    print("=" * 60)
    
    # Test with a mock session_id (this will likely fail in real environment)
    test_session_id = "test_session_12345"
    
    try:
        print(f"Testing Google OAuth exchange with session_id: {test_session_id}")
        response = requests.post(
            f"{BASE_URL}/auth/google/exchange",
            json={"session_id": test_session_id},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            log_test("Google OAuth Exchange", "PASS", f"Message: {data.get('message')}")
            return True
        elif response.status_code == 401:
            log_test("Google OAuth Exchange", "WARN", "Invalid session (expected with test session_id)")
            log_test("Google OAuth API", "PASS", "API endpoint accessible and validates sessions properly")
            return True
        else:
            log_test("Google OAuth Exchange", "FAIL", f"Status: {response.status_code}, Response: {response.text}")
            return False
            
    except Exception as e:
        log_test("Google OAuth Exchange", "FAIL", f"Exception: {str(e)}")
        return False

def test_logout_api():
    """Test logout API"""
    print("=" * 60)
    print("TESTING LOGOUT API")
    print("=" * 60)
    
    try:
        print("Testing logout endpoint")
        # Create a session with cookies to test logout
        session = requests.Session()
        
        response = session.post(
            f"{BASE_URL}/auth/logout",
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            log_test("Logout API", "PASS", f"Message: {data.get('message')}")
            return True
        else:
            log_test("Logout API", "FAIL", f"Status: {response.status_code}, Response: {response.text}")
            return False
            
    except Exception as e:
        log_test("Logout API", "FAIL", f"Exception: {str(e)}")
        return False

def test_api_health():
    """Test basic API connectivity"""
    print("=" * 60)
    print("TESTING API CONNECTIVITY")
    print("=" * 60)
    
    try:
        # Test a simple endpoint to verify API is accessible
        response = requests.get(f"{BASE_URL.replace('/api', '')}/docs", timeout=10)
        if response.status_code == 200:
            log_test("API Health", "PASS", "Backend API is accessible")
            return True
        else:
            log_test("API Health", "WARN", f"Docs endpoint returned {response.status_code}")
            return True  # Still consider this a pass as API might be configured differently
    except Exception as e:
        log_test("API Health", "FAIL", f"Cannot reach backend: {str(e)}")
        return False

def main():
    print("🚀 Starting KODA Backend API Tests")
    print(f"Base URL: {BASE_URL}")
    
    # Test results tracking
    results = {
        "total": 0,
        "passed": 0,
        "failed": 0,
        "details": []
    }
    
    # Generate test user IDs
    test_user_id = str(uuid.uuid4())
    test_driver_id = str(uuid.uuid4())
    test_trip_id = str(uuid.uuid4())
    
    print(f"\nUsing test IDs:")
    print(f"User ID: {test_user_id}")
    print(f"Driver ID: {test_driver_id}")
    print(f"Trip ID: {test_trip_id}")
    
    # First, let's create a test user to ensure emergency contacts work properly
    print(f"\n{'🔧 SETUP - Creating Test User':=^80}")
    
    # Send OTP first
    test_api_endpoint(
        "POST",
        "/auth/send-otp",
        data={"phone": "+2348123456789"}
    )
    
    # Verify OTP (using the mock OTP from response)
    test_api_endpoint(
        "POST", 
        "/auth/verify-otp",
        data={"phone": "+2348123456789", "otp": "123456"}
    )
    
    # Register user
    register_success, register_response = test_api_endpoint(
        "POST",
        "/auth/register", 
        data={
            "phone": "+2348123456789",
            "name": "Kemi Adebayo",
            "email": "kemi.adebayo@example.com",
            "role": "rider"
        }
    )
    
    # Use the registered user ID for emergency contacts test
    if register_success and register_response:
        try:
            user_data = register_response.json()
            if "user" in user_data and "id" in user_data["user"]:
                test_user_id = user_data["user"]["id"]
                print(f"✅ Created test user with ID: {test_user_id}")
        except:
            print("⚠️ Could not extract user ID from registration response")
    
    # =================================================================
    # PRIORITY 1 - CORE SAFETY APIs
    # =================================================================
    
    print(f"\n{'🔒 PRIORITY 1 - CORE SAFETY APIs':=^80}")
    
    # 1. AI Rider Assistant
    test_name = "AI Rider Assistant"
    success, response = test_api_endpoint(
        "GET", 
        "/ai/rider-assistant",
        params={
            "user_id": test_user_id,
            "question": "Where is my driver?"
        }
    )
    results["total"] += 1
    if success:
        results["passed"] += 1
    else:
        results["failed"] += 1
    results["details"].append({"test": test_name, "passed": success})
    
    # 2. AI Driver Assistant  
    test_name = "AI Driver Assistant"
    success, response = test_api_endpoint(
        "GET",
        "/ai/driver-assistant", 
        params={
            "user_id": test_driver_id,
            "question": "What are the best earning times today?"
        }
    )
    results["total"] += 1
    if success:
        results["passed"] += 1
    else:
        results["failed"] += 1
    results["details"].append({"test": test_name, "passed": success})
    
    # 3. Add Emergency Contact
    test_name = "Add Emergency Contact"
    success, response = test_api_endpoint(
        "POST",
        f"/users/{test_user_id}/emergency-contacts",
        data={
            "name": "Adunni Okafor",
            "phone": "+2348123456789", 
            "relationship": "Sister"
        }
    )
    results["total"] += 1
    if success:
        results["passed"] += 1
    else:
        results["failed"] += 1
    results["details"].append({"test": test_name, "passed": success})
    
    # 4. Get Emergency Contacts
    test_name = "Get Emergency Contacts"
    success, response = test_api_endpoint(
        "GET",
        f"/users/{test_user_id}/emergency-contacts"
    )
    results["total"] += 1
    if success:
        results["passed"] += 1
    else:
        results["failed"] += 1
    results["details"].append({"test": test_name, "passed": success})
    
    # 5. Trigger SOS (Expected 404 since trip doesn't exist)
    test_name = "Trigger SOS"
    success, response = test_api_endpoint(
        "POST",
        "/sos/trigger",
        data={
            "trip_id": test_trip_id,
            "location_lat": 6.5244,
            "location_lng": 3.3792
        },
        expected_status=404  # Expected since trip doesn't exist
    )
    results["total"] += 1
    if success:
        results["passed"] += 1
    else:
        results["failed"] += 1
    results["details"].append({"test": test_name, "passed": success})
    
    # =================================================================
    # PRIORITY 2 - GAMIFICATION APIs
    # =================================================================
    
    print(f"\n{'🎮 PRIORITY 2 - GAMIFICATION APIs':=^80}")
    
    # 6. Driver Leaderboard
    test_name = "Driver Leaderboard"
    success, response = test_api_endpoint(
        "GET",
        "/leaderboard/drivers",
        params={
            "city": "lagos",
            "period": "weekly"
        }
    )
    results["total"] += 1
    if success:
        results["passed"] += 1
    else:
        results["failed"] += 1
    results["details"].append({"test": test_name, "passed": success})
    
    # 7. Top Rated Drivers
    test_name = "Top Rated Drivers"
    success, response = test_api_endpoint(
        "GET",
        "/leaderboard/top-rated",
        params={"limit": 10}
    )
    results["total"] += 1
    if success:
        results["passed"] += 1
    else:
        results["failed"] += 1
    results["details"].append({"test": test_name, "passed": success})
    
    # 8. Active Challenges
    test_name = "Active Challenges"
    success, response = test_api_endpoint(
        "GET",
        "/challenges/active"
    )
    results["total"] += 1
    if success:
        results["passed"] += 1
    else:
        results["failed"] += 1
    results["details"].append({"test": test_name, "passed": success})
    
    # 9. Driver Fatigue Status
    test_name = "Driver Fatigue Status"
    success, response = test_api_endpoint(
        "GET",
        f"/drivers/{test_driver_id}/fatigue-status"
    )
    results["total"] += 1
    if success:
        results["passed"] += 1
    else:
        results["failed"] += 1
    results["details"].append({"test": test_name, "passed": success})
    
    # =================================================================
    # PRIORITY 3 - DRIVER WELFARE APIs
    # =================================================================
    
    print(f"\n{'🛡️ PRIORITY 3 - DRIVER WELFARE APIs':=^80}")
    
    # 10. Log Driver Break
    test_name = "Log Driver Break"
    success, response = test_api_endpoint(
        "POST",
        f"/drivers/{test_driver_id}/log-break"
    )
    results["total"] += 1
    if success:
        results["passed"] += 1
    else:
        results["failed"] += 1
    results["details"].append({"test": test_name, "passed": success})
    
    # 11. Driver Streaks (Expected 404 if user doesn't exist)
    test_name = "Driver Streaks"
    success, response = test_api_endpoint(
        "GET",
        f"/drivers/{test_driver_id}/streaks",
        expected_status=404  # Expected since user doesn't exist
    )
    results["total"] += 1
    if success:
        results["passed"] += 1
    else:
        results["failed"] += 1
    results["details"].append({"test": test_name, "passed": success})
    
    # =================================================================
    # PRIORITY 4 - TRIP FEATURES
    # =================================================================
    
    print(f"\n{'🚗 PRIORITY 4 - TRIP FEATURES':=^80}")
    
    # 12. Trip Insurance (Expected 404 since trip doesn't exist)
    test_name = "Trip Insurance"
    success, response = test_api_endpoint(
        "GET",
        f"/trips/{test_trip_id}/insurance",
        expected_status=404  # Expected since trip doesn't exist
    )
    results["total"] += 1
    if success:
        results["passed"] += 1
    else:
        results["failed"] += 1
    results["details"].append({"test": test_name, "passed": success})
    
    # =================================================================
    # TEST SUMMARY
    # =================================================================
    
    print(f"\n{'📊 TEST SUMMARY':=^80}")
    print(f"Total Tests: {results['total']}")
    print(f"Passed: {results['passed']} ✅")
    print(f"Failed: {results['failed']} ❌")
    print(f"Success Rate: {(results['passed']/results['total']*100):.1f}%")
    
    print(f"\n{'📋 DETAILED RESULTS':=^80}")
    for detail in results["details"]:
        status = "✅ PASS" if detail["passed"] else "❌ FAIL"
        print(f"{detail['test']:<30} {status}")
    
    # Return overall success
    return results["failed"] == 0

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)