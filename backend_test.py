#!/usr/bin/env python3
"""
Backend API Testing for NEXRYDE Registration with NIN and Terms Features
Testing the updated /api/auth/register endpoint with new validation requirements.
"""

import requests
import json
import os
import sys
from datetime import datetime
import uuid

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

print(f"🚀 Testing NEXRYDE Registration API with NIN and Terms Features")
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
    print(f"\n🎯 TESTING UPDATED REGISTRATION ENDPOINT WITH NIN AND TERMS FEATURES")
    print(f"{'='*80}")
    
    tests_passed = 0
    total_tests = 5
    
    # Test 1: Rider Registration with NIN (Happy Path)
    print(f"\n1️⃣  TEST 1: Rider Registration with NIN (Happy Path)")
    rider_data = {
        "phone": "+2348087654321",
        "name": "Test Rider",
        "email": "rider@test.com", 
        "role": "rider",
        "nin": "12345678901"
    }
    
    success = test_request(
        "POST", 
        "/auth/register", 
        rider_data, 
        200,
        "Rider registration with valid NIN should succeed"
    )
    if success:
        tests_passed += 1
        print(f"✅ Test 1 PASSED: Rider with NIN registered successfully")
    else:
        print(f"❌ Test 1 FAILED: Rider registration with NIN failed")
    
    # Test 2: Rider Registration WITHOUT NIN (Should Fail)  
    print(f"\n2️⃣  TEST 2: Rider Registration WITHOUT NIN (Should Fail)")
    rider_data_no_nin = {
        "phone": "+2348087654322",
        "name": "Test Rider 2",
        "role": "rider"
        # Missing NIN field
    }
    
    success = test_request(
        "POST",
        "/auth/register", 
        rider_data_no_nin,
        400,
        "Rider registration without NIN should fail with 400 error"
    )
    if success:
        tests_passed += 1
        print(f"✅ Test 2 PASSED: Rider registration correctly rejected without NIN")
    else:
        print(f"❌ Test 2 FAILED: Rider registration without NIN should have been rejected")
    
    # Test 3: Driver Registration with Terms Accepted (Happy Path)
    print(f"\n3️⃣  TEST 3: Driver Registration with Terms Accepted (Happy Path)")
    driver_data = {
        "phone": "+2348087654323", 
        "name": "Test Driver",
        "email": "driver@test.com",
        "role": "driver",
        "terms_accepted": True,
        "terms_accepted_at": "2025-06-03T14:30:00Z"
    }
    
    success = test_request(
        "POST",
        "/auth/register",
        driver_data, 
        200,
        "Driver registration with terms accepted should succeed"
    )
    if success:
        tests_passed += 1
        print(f"✅ Test 3 PASSED: Driver with terms accepted registered successfully")
    else:
        print(f"❌ Test 3 FAILED: Driver registration with terms accepted failed")
    
    # Test 4: Driver Registration WITHOUT Terms Acceptance (Should Fail)
    print(f"\n4️⃣  TEST 4: Driver Registration WITHOUT Terms Acceptance (Should Fail)")
    driver_data_no_terms = {
        "phone": "+2348087654324",
        "name": "Test Driver 2", 
        "role": "driver"
        # Missing terms_accepted field
    }
    
    success = test_request(
        "POST",
        "/auth/register",
        driver_data_no_terms,
        400, 
        "Driver registration without terms acceptance should fail with 400 error"
    )
    if success:
        tests_passed += 1
        print(f"✅ Test 4 PASSED: Driver registration correctly rejected without terms acceptance")
    else:
        print(f"❌ Test 4 FAILED: Driver registration without terms acceptance should have been rejected")
    
    # Test 5: Verify User Data Storage
    print(f"\n5️⃣  TEST 5: Verify User Data Storage")
    # This test verifies that the new fields are properly stored, but we need a way to query users
    # Since there's no direct user lookup endpoint, we'll test by trying to register duplicate users
    
    print(f"🔍 Verifying that user data was stored correctly...")
    
    # Try to register the same rider again - should fail with "User already exists"
    duplicate_rider = {
        "phone": "+2348087654321",  # Same phone as Test 1
        "name": "Duplicate Rider",
        "email": "duplicate@test.com",
        "role": "rider", 
        "nin": "99999999999"
    }
    
    success = test_request(
        "POST",
        "/auth/register",
        duplicate_rider,
        400,
        "Duplicate phone registration should fail (confirms data was stored)"
    )
    if success:
        tests_passed += 1
        print(f"✅ Test 5 PASSED: User data storage verified (duplicate prevention working)")
    else:
        print(f"❌ Test 5 FAILED: Could not verify user data storage")
    
    # SUMMARY
    print(f"\n{'='*80}")
    print(f"🎯 REGISTRATION TESTING COMPLETE")
    print(f"{'='*80}")
    print(f"✅ Tests Passed: {tests_passed}/{total_tests}")
    print(f"❌ Tests Failed: {total_tests - tests_passed}/{total_tests}")
    
    if tests_passed == total_tests:
        print(f"🎉 ALL TESTS PASSED! Registration endpoint with NIN and Terms features working correctly")
        return True
    else:
        print(f"⚠️  Some tests failed. Registration endpoint needs attention.")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)