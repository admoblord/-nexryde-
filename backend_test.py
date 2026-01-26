#!/usr/bin/env python3
"""
KODA Backend API Testing Script
Tests the newly implemented safety, AI assistant, and gamification features
"""

import requests
import json
import uuid
from datetime import datetime

# API Base URL from frontend .env
BASE_URL = "https://koda-ride.preview.emergentagent.com/api"

def test_api_endpoint(method, endpoint, data=None, params=None, expected_status=200):
    """Helper function to test API endpoints"""
    url = f"{BASE_URL}{endpoint}"
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, params=params, timeout=10)
        elif method.upper() == "POST":
            response = requests.post(url, json=data, timeout=10)
        elif method.upper() == "PUT":
            response = requests.put(url, json=data, timeout=10)
        elif method.upper() == "DELETE":
            response = requests.delete(url, timeout=10)
        
        print(f"\n{'='*60}")
        print(f"Testing: {method} {endpoint}")
        print(f"URL: {url}")
        if params:
            print(f"Params: {params}")
        if data:
            print(f"Data: {json.dumps(data, indent=2)}")
        print(f"Status Code: {response.status_code}")
        
        # Try to parse JSON response
        try:
            response_json = response.json()
            print(f"Response: {json.dumps(response_json, indent=2)}")
        except:
            print(f"Response Text: {response.text}")
        
        # Check if status matches expected
        if response.status_code == expected_status:
            print("✅ PASS - Status code matches expected")
            return True, response
        else:
            print(f"❌ FAIL - Expected {expected_status}, got {response.status_code}")
            return False, response
            
    except Exception as e:
        print(f"\n{'='*60}")
        print(f"Testing: {method} {endpoint}")
        print(f"❌ ERROR: {str(e)}")
        return False, None

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