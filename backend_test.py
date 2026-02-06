#!/usr/bin/env python3
"""
Backend API Test Suite for KODA Driver Onboarding Security Flow
Tests the 3 main onboarding endpoints as specified in the review request.
"""

import requests
import json
import time
from datetime import datetime
from typing import Dict, Any

# Backend URL Configuration
BACKEND_URL = "https://smart-mode-preview.preview.emergentagent.com/api"

def print_test_header(test_name: str):
    """Print formatted test header"""
    print(f"\n{'='*60}")
    print(f"🧪 {test_name}")
    print(f"{'='*60}")

def print_test_result(success: bool, message: str):
    """Print formatted test result"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status}: {message}")

def test_driver_registration():
    """Test driver registration with terms acceptance"""
    print_test_header("DRIVER REGISTRATION TEST")
    
    try:
        # Generate unique test data
        timestamp = int(time.time())
        phone = f"+2348099990{timestamp % 1000:03d}"
        name = f"Test Driver {timestamp}"
        
        payload = {
            "phone": phone,
            "name": name,
            "role": "driver",
            "terms_accepted": True,
            "terms_accepted_at": datetime.utcnow().isoformat()
        }
        
        print(f"📞 Registering driver with phone: {phone}")
        response = requests.post(f"{BACKEND_URL}/auth/register", json=payload)
        
        print(f"Response Status: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            if "user" in data and "id" in data["user"]:
                driver_id = data["user"]["id"]
                print_test_result(True, f"Driver registered successfully. ID: {driver_id}")
                return driver_id
            else:
                print_test_result(False, "Missing user ID in registration response")
                return None
        else:
            print_test_result(False, f"Registration failed with status {response.status_code}")
            return None
            
    except Exception as e:
        print_test_result(False, f"Registration error: {str(e)}")
        return None

def test_onboarding_status(driver_id: str, expected_step: str = None):
    """Test GET /api/drivers/{driver_id}/onboarding-status endpoint"""
    print_test_header("ONBOARDING STATUS TEST")
    
    try:
        print(f"🔍 Checking onboarding status for driver: {driver_id}")
        response = requests.get(f"{BACKEND_URL}/drivers/{driver_id}/onboarding-status")
        
        print(f"Response Status: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            step = data.get("step")
            completed = data.get("completed")
            
            print(f"Current Step: {step}")
            print(f"Completed: {completed}")
            
            if expected_step and step == expected_step:
                print_test_result(True, f"Onboarding step matches expected: {step}")
            else:
                print_test_result(True, f"Onboarding status retrieved successfully. Step: {step}")
            
            return data
        else:
            print_test_result(False, f"Failed to get onboarding status: {response.status_code}")
            return None
            
    except Exception as e:
        print_test_result(False, f"Onboarding status error: {str(e)}")
        return None

def test_nonexistent_driver_status():
    """Test onboarding status with non-existent driver"""
    print_test_header("NON-EXISTENT DRIVER STATUS TEST")
    
    try:
        fake_driver_id = "test-driver-999"
        print(f"🔍 Testing with non-existent driver: {fake_driver_id}")
        
        response = requests.get(f"{BACKEND_URL}/drivers/{fake_driver_id}/onboarding-status")
        
        print(f"Response Status: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            step = data.get("step")
            completed = data.get("completed")
            
            if step == "not_found" and completed == False:
                print_test_result(True, "Correctly returned not_found for non-existent driver")
            else:
                print_test_result(False, f"Unexpected response for non-existent driver: {data}")
        else:
            print_test_result(False, f"Unexpected status code: {response.status_code}")
            
    except Exception as e:
        print_test_result(False, f"Non-existent driver test error: {str(e)}")

def test_verify_documents(driver_id: str):
    """Test POST /api/drivers/verify-documents endpoint"""
    print_test_header("DOCUMENT VERIFICATION TEST")
    
    try:
        print(f"📄 Verifying documents for driver: {driver_id}")
        
        # Use form data as the endpoint expects Form(...)
        form_data = {"driver_id": driver_id}
        
        response = requests.post(f"{BACKEND_URL}/drivers/verify-documents", data=form_data)
        
        print(f"Response Status: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            success = data.get("success")
            verification_status = data.get("verification_status")
            
            if success and verification_status == "approved":
                print_test_result(True, "Documents verified successfully (auto-approved for MVP)")
                return True
            else:
                print_test_result(False, f"Unexpected verification response: {data}")
                return False
        else:
            print_test_result(False, f"Document verification failed: {response.status_code}")
            return False
            
    except Exception as e:
        print_test_result(False, f"Document verification error: {str(e)}")
        return False

def test_complete_profile(driver_id: str):
    """Test POST /api/drivers/complete-profile endpoint"""
    print_test_header("PROFILE COMPLETION TEST")
    
    try:
        print(f"👤 Completing profile for driver: {driver_id}")
        
        # Complete profile data as specified in review request
        profile_data = {
            "driver_id": driver_id,
            "full_name": "John Adebayo",
            "phone": "+2348099990001",
            "email": "john.adebayo@example.com", 
            "address": "123 Victoria Island",
            "city": "Lagos",
            "state": "Lagos",
            "date_of_birth": "1990-01-15",
            "emergency_contact": "+2348099990002",
            "bank_name": "UBA",
            "account_number": "1234567890", 
            "account_name": "John Adebayo",
            "vehicle_type": "economy",
            "vehicle_make": "Toyota",
            "vehicle_model": "Corolla",
            "vehicle_year": "2018",
            "vehicle_plate_number": "ABC123DE",
            "vehicle_color": "Silver"
        }
        
        response = requests.post(f"{BACKEND_URL}/drivers/complete-profile", json=profile_data)
        
        print(f"Response Status: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            data = response.json()
            success = data.get("success")
            user = data.get("user") 
            trial_activated = data.get("trial_activated")
            
            if success and user and trial_activated:
                print_test_result(True, "Profile completed successfully with trial activation")
                return True
            else:
                print_test_result(False, f"Unexpected profile completion response: {data}")
                return False
        else:
            print_test_result(False, f"Profile completion failed: {response.status_code}")
            return False
            
    except Exception as e:
        print_test_result(False, f"Profile completion error: {str(e)}")
        return False

def run_full_onboarding_flow():
    """Run the complete driver onboarding flow test as specified"""
    print_test_header("FULL ONBOARDING FLOW TEST")
    
    # Step 1: Register driver
    driver_id = test_driver_registration()
    if not driver_id:
        print_test_result(False, "Full flow test aborted - registration failed")
        return
    
    # Step 2: Check initial onboarding status (should be "documents")
    time.sleep(1)  # Brief delay
    status = test_onboarding_status(driver_id, expected_step="documents")
    if not status or status.get("step") != "documents":
        print_test_result(False, f"Expected 'documents' step, got: {status}")
        return
    
    # Step 3: Verify documents
    time.sleep(1)  # Brief delay
    if not test_verify_documents(driver_id):
        print_test_result(False, "Full flow test aborted - document verification failed")
        return
    
    # Step 4: Check onboarding status after verification (should be "profile")
    time.sleep(1)  # Brief delay
    status = test_onboarding_status(driver_id, expected_step="profile")
    if not status or status.get("step") != "profile":
        print_test_result(False, f"Expected 'profile' step after verification, got: {status}")
        return
    
    # Step 5: Complete profile
    time.sleep(1)  # Brief delay
    if not test_complete_profile(driver_id):
        print_test_result(False, "Full flow test aborted - profile completion failed")
        return
    
    # Step 6: Final check - should be "approved" and completed=true
    time.sleep(1)  # Brief delay
    final_status = test_onboarding_status(driver_id, expected_step="approved")
    if final_status and final_status.get("step") == "approved" and final_status.get("completed") == True:
        print_test_result(True, "🎉 FULL ONBOARDING FLOW COMPLETED SUCCESSFULLY!")
    else:
        print_test_result(False, f"Final status check failed: {final_status}")

def main():
    """Run all driver onboarding security flow tests"""
    print(f"🚀 Starting KODA Driver Onboarding Backend API Tests")
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Test Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Test 1: Non-existent driver status check
    test_nonexistent_driver_status()
    
    # Test 2: Individual endpoint tests
    print_test_header("INDIVIDUAL ENDPOINT TESTS")
    
    # Register a test driver first
    driver_id = test_driver_registration()
    if driver_id:
        # Test each endpoint individually  
        test_onboarding_status(driver_id)
        test_verify_documents(driver_id)
        test_complete_profile(driver_id)
        
        # Check final status
        test_onboarding_status(driver_id)
    
    # Test 3: Full flow test with a new driver
    run_full_onboarding_flow()
    
    print(f"\n🏁 All tests completed at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

if __name__ == "__main__":
    main()