#!/usr/bin/env python3
"""
Additional Edge Case Testing for NEXRYDE Registration NIN Validation
Testing edge cases for NIN validation and other registration scenarios.
"""

import requests
import json
import os
import sys
from datetime import datetime

# Get backend URL from frontend .env file
def get_backend_url():
    env_path = "/app/frontend/.env"
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                if line.startswith('EXPO_PUBLIC_BACKEND_URL='):
                    return line.split('=')[1].strip()
    return "http://localhost:8001"

BACKEND_URL = get_backend_url()
BASE_URL = f"{BACKEND_URL}/api"

print(f"🚀 Testing NEXRYDE Registration Edge Cases and NIN Validation")
print(f"📡 Backend URL: {BASE_URL}")
print(f"{'='*80}")

def test_request(method, endpoint, data=None, expected_status=200, description=""):
    """Helper function to make API requests and validate responses"""
    url = f"{BASE_URL}{endpoint}"
    print(f"\n🔍 {description}")
    print(f"📤 {method.upper()} {url}")
    
    try:
        if method.upper() == "POST":
            if data:
                print(f"📝 Payload: {json.dumps(data, indent=2)}")
            response = requests.post(url, json=data, timeout=30)
        elif method.upper() == "GET":
            response = requests.get(url, timeout=30)
        else:
            print(f"❌ Unsupported method: {method}")
            return False
        
        print(f"📨 Response Status: {response.status_code}")
        
        if response.status_code != expected_status:
            print(f"❌ FAILED: Expected status {expected_status}, got {response.status_code}")
            print(f"📄 Response: {response.text}")
            return False
            
        try:
            response_data = response.json()
            print(f"✅ SUCCESS: {response.status_code}")
            print(f"📄 Response: {json.dumps(response_data, indent=2)}")
            return True, response_data
        except:
            print(f"✅ SUCCESS: {response.status_code}")
            print(f"📄 Response: {response.text}")
            return True, response.text
            
    except requests.exceptions.RequestException as e:
        print(f"❌ NETWORK ERROR: {e}")
        return False

def main():
    print(f"\n🎯 TESTING EDGE CASES AND NIN VALIDATION")
    print(f"{'='*80}")
    
    tests_passed = 0
    total_tests = 6
    
    # Edge Case 1: Rider with Invalid NIN (too short)
    print(f"\n1️⃣  EDGE CASE 1: Rider with Invalid NIN (Too Short)")
    rider_short_nin = {
        "phone": "+2348087654330",
        "name": "Test Rider Short NIN",
        "email": "shortNin@test.com",
        "role": "rider",
        "nin": "123456789"  # Only 9 digits instead of 11
    }
    
    # Note: The backend doesn't seem to validate NIN length based on the current code
    # Let's see what happens
    success = test_request(
        "POST",
        "/auth/register",
        rider_short_nin,
        200,  # Expecting success since backend doesn't validate NIN format
        "Rider registration with short NIN (current backend accepts any NIN)"
    )
    if success:
        tests_passed += 1
        print(f"✅ Edge Case 1 PASSED: Short NIN accepted (no format validation in backend)")
    else:
        print(f"❌ Edge Case 1 FAILED: Unexpected behavior with short NIN")
    
    # Edge Case 2: Rider with Invalid NIN (too long)
    print(f"\n2️⃣  EDGE CASE 2: Rider with Invalid NIN (Too Long)")
    rider_long_nin = {
        "phone": "+2348087654331",
        "name": "Test Rider Long NIN", 
        "email": "longNin@test.com",
        "role": "rider",
        "nin": "123456789012345"  # 15 digits instead of 11
    }
    
    success = test_request(
        "POST",
        "/auth/register", 
        rider_long_nin,
        200,  # Expecting success since backend doesn't validate NIN format
        "Rider registration with long NIN (current backend accepts any NIN)"
    )
    if success:
        tests_passed += 1
        print(f"✅ Edge Case 2 PASSED: Long NIN accepted (no format validation in backend)")
    else:
        print(f"❌ Edge Case 2 FAILED: Unexpected behavior with long NIN")
    
    # Edge Case 3: Driver with terms_accepted = false (should fail)
    print(f"\n3️⃣  EDGE CASE 3: Driver with terms_accepted = false")
    driver_false_terms = {
        "phone": "+2348087654332",
        "name": "Test Driver False Terms",
        "email": "falseterms@test.com", 
        "role": "driver",
        "terms_accepted": False  # Explicitly false
    }
    
    success = test_request(
        "POST",
        "/auth/register",
        driver_false_terms,
        400,
        "Driver registration with terms_accepted=false should fail"
    )
    if success:
        tests_passed += 1
        print(f"✅ Edge Case 3 PASSED: Driver registration correctly rejected with false terms")
    else:
        print(f"❌ Edge Case 3 FAILED: Driver with false terms should be rejected")
    
    # Edge Case 4: Rider with empty string NIN (should fail)
    print(f"\n4️⃣  EDGE CASE 4: Rider with Empty NIN")
    rider_empty_nin = {
        "phone": "+2348087654333", 
        "name": "Test Rider Empty NIN",
        "email": "emptyNin@test.com",
        "role": "rider",
        "nin": ""  # Empty string
    }
    
    success = test_request(
        "POST",
        "/auth/register",
        rider_empty_nin, 
        400,
        "Rider registration with empty NIN should fail"
    )
    if success:
        tests_passed += 1
        print(f"✅ Edge Case 4 PASSED: Empty NIN correctly rejected")
    else:
        print(f"❌ Edge Case 4 FAILED: Empty NIN should be rejected")
    
    # Edge Case 5: Driver with empty terms_accepted_at (should still work)
    print(f"\n5️⃣  EDGE CASE 5: Driver with terms_accepted=true but no timestamp")
    driver_no_timestamp = {
        "phone": "+2348087654334",
        "name": "Test Driver No Timestamp", 
        "email": "notimestamp@test.com",
        "role": "driver", 
        "terms_accepted": True
        # Missing terms_accepted_at
    }
    
    success = test_request(
        "POST",
        "/auth/register",
        driver_no_timestamp,
        200,
        "Driver registration with terms accepted but no timestamp should succeed"
    )
    if success:
        tests_passed += 1
        print(f"✅ Edge Case 5 PASSED: Driver registration succeeded without timestamp")
    else:
        print(f"❌ Edge Case 5 FAILED: Driver registration without timestamp failed")
    
    # Edge Case 6: Mixed Role Fields (rider with terms, driver with NIN)
    print(f"\n6️⃣  EDGE CASE 6: Rider with Driver Fields (Cross-contamination)")
    mixed_fields = {
        "phone": "+2348087654335",
        "name": "Test Mixed Fields", 
        "email": "mixed@test.com",
        "role": "rider",
        "nin": "12345678901",  # Rider field (required)
        "terms_accepted": True,  # Driver field (not required for rider)
        "terms_accepted_at": "2025-06-03T14:30:00Z"
    }
    
    success = test_request(
        "POST",
        "/auth/register",
        mixed_fields,
        200,
        "Rider with both NIN and terms fields should succeed (extra fields ignored)"
    )
    if success:
        tests_passed += 1
        print(f"✅ Edge Case 6 PASSED: Mixed fields handled correctly")
    else:
        print(f"❌ Edge Case 6 FAILED: Mixed fields caused unexpected failure")
    
    # SUMMARY
    print(f"\n{'='*80}")
    print(f"🎯 EDGE CASE TESTING COMPLETE")
    print(f"{'='*80}")
    print(f"✅ Tests Passed: {tests_passed}/{total_tests}")
    print(f"❌ Tests Failed: {total_tests - tests_passed}/{total_tests}")
    
    if tests_passed == total_tests:
        print(f"🎉 ALL EDGE CASE TESTS PASSED!")
        return True
    else:
        print(f"⚠️  Some edge case tests failed.")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)