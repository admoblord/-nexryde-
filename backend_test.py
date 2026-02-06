#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for KODA Driver Features
Tests all new driver-specific API endpoints as requested in the review
"""

import requests
import json
import time
from datetime import datetime

# Backend URL from environment
BACKEND_URL = "https://smart-mode-preview.preview.emergentagent.com/api"

def log_test_result(test_name, success, response_data, status_code):
    """Log test results with timestamp"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"\n[{timestamp}] {status} {test_name}")
    print(f"Status Code: {status_code}")
    print(f"Response: {json.dumps(response_data, indent=2)}")
    print("-" * 80)

def test_driver_stories_api():
    """Test Group 1: Driver Stories API"""
    print("\n" + "="*80)
    print("TEST GROUP 1: Driver Stories API")
    print("="*80)
    
    story_id = None
    
    # Test 1.1: POST /api/driver/stories
    print("\n1.1 Testing POST /api/driver/stories")
    story_data = {
        "driver_id": "test-driver-001",
        "text": "Started at 5am today. Already done 8 trips! Lagos no dey sleep!",
        "mood": "hustle",
        "location": "Victoria Island"
    }
    
    try:
        response = requests.post(
            f"{BACKEND_URL}/driver/stories",
            json=story_data,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        response_data = response.json()
        success = response.status_code == 200 and response_data.get("success") == True
        
        if success and response_data.get("story"):
            story_id = response_data["story"]["_id"]
            
        log_test_result("POST /api/driver/stories", success, response_data, response.status_code)
        
    except Exception as e:
        log_test_result("POST /api/driver/stories", False, {"error": str(e)}, 0)
    
    # Test 1.2: GET /api/driver/stories?limit=20
    print("\n1.2 Testing GET /api/driver/stories?limit=20")
    try:
        response = requests.get(
            f"{BACKEND_URL}/driver/stories?limit=20",
            timeout=10
        )
        response_data = response.json()
        success = (response.status_code == 200 and 
                  response_data.get("success") == True and
                  "stories" in response_data and
                  len(response_data["stories"]) > 0)
        
        log_test_result("GET /api/driver/stories", success, response_data, response.status_code)
        
    except Exception as e:
        log_test_result("GET /api/driver/stories", False, {"error": str(e)}, 0)
    
    # Test 1.3: POST /api/driver/stories/{story_id}/like
    if story_id:
        print(f"\n1.3 Testing POST /api/driver/stories/{story_id}/like")
        try:
            response = requests.post(
                f"{BACKEND_URL}/driver/stories/{story_id}/like",
                timeout=10
            )
            response_data = response.json()
            success = response.status_code == 200 and response_data.get("success") == True
            
            log_test_result("POST /api/driver/stories/{story_id}/like", success, response_data, response.status_code)
            
        except Exception as e:
            log_test_result("POST /api/driver/stories/{story_id}/like", False, {"error": str(e)}, 0)
    else:
        print("\n1.3 SKIPPED: POST /api/driver/stories/{story_id}/like - No story_id from previous test")

def test_fleet_tracker_api():
    """Test Group 2: Fleet Tracker API"""
    print("\n" + "="*80)
    print("TEST GROUP 2: Fleet Tracker API")
    print("="*80)
    
    # Test 2.1: GET /api/driver/fleet/nearby
    print("\n2.1 Testing GET /api/driver/fleet/nearby?lat=6.5244&lng=3.3792&radius_km=5")
    try:
        params = {
            "lat": 6.5244,
            "lng": 3.3792,
            "radius_km": 5
        }
        response = requests.get(
            f"{BACKEND_URL}/driver/fleet/nearby",
            params=params,
            timeout=10
        )
        response_data = response.json()
        success = (response.status_code == 200 and 
                  response_data.get("success") == True and
                  "fleet" in response_data and
                  "count" in response_data)
        
        log_test_result("GET /api/driver/fleet/nearby", success, response_data, response.status_code)
        
    except Exception as e:
        log_test_result("GET /api/driver/fleet/nearby", False, {"error": str(e)}, 0)

def test_driver_awareness_api():
    """Test Group 3: Driver Awareness API"""
    print("\n" + "="*80)
    print("TEST GROUP 3: Driver Awareness API")
    print("="*80)
    
    # Test 3.1: GET /api/driver/awareness
    print("\n3.1 Testing GET /api/driver/awareness?driver_id=demo&lat=6.5244&lng=3.3792")
    try:
        params = {
            "driver_id": "demo",
            "lat": 6.5244,
            "lng": 3.3792
        }
        response = requests.get(
            f"{BACKEND_URL}/driver/awareness",
            params=params,
            timeout=10
        )
        response_data = response.json()
        success = (response.status_code == 200 and 
                  response_data.get("success") == True and
                  "alerts" in response_data and
                  "driver_score" in response_data and
                  "driving_hours_today" in response_data and
                  "break_recommended" in response_data)
        
        log_test_result("GET /api/driver/awareness", success, response_data, response.status_code)
        
    except Exception as e:
        log_test_result("GET /api/driver/awareness", False, {"error": str(e)}, 0)

def test_traffic_ai_apis():
    """Test Group 4: Traffic AI APIs"""
    print("\n" + "="*80)
    print("TEST GROUP 4: Traffic AI APIs")
    print("="*80)
    
    # Test 4.1: GET /api/ai/traffic/alerts
    print("\n4.1 Testing GET /api/ai/traffic/alerts?driver_id=demo&lat=6.5244&lng=3.3792")
    try:
        params = {
            "driver_id": "demo",
            "lat": 6.5244,
            "lng": 3.3792
        }
        response = requests.get(
            f"{BACKEND_URL}/ai/traffic/alerts",
            params=params,
            timeout=10
        )
        response_data = response.json()
        success = (response.status_code == 200 and 
                  response_data.get("success") == True and
                  "alerts" in response_data)
        
        log_test_result("GET /api/ai/traffic/alerts", success, response_data, response.status_code)
        
    except Exception as e:
        log_test_result("GET /api/ai/traffic/alerts", False, {"error": str(e)}, 0)
    
    # Test 4.2: POST /api/ai/traffic/predict
    print("\n4.2 Testing POST /api/ai/traffic/predict")
    try:
        params = {
            "origin_lat": 6.5244,
            "origin_lng": 3.3792,
            "destination_lat": 6.4541,
            "destination_lng": 3.3947,
            "driver_id": "demo"
        }
        response = requests.post(
            f"{BACKEND_URL}/ai/traffic/predict",
            params=params,
            timeout=15  # Longer timeout for AI prediction
        )
        response_data = response.json()
        success = (response.status_code == 200 and 
                  response_data.get("success") == True and
                  "ai_analysis" in response_data)
        
        log_test_result("POST /api/ai/traffic/predict", success, response_data, response.status_code)
        
    except Exception as e:
        log_test_result("POST /api/ai/traffic/predict", False, {"error": str(e)}, 0)

def test_accident_ai_apis():
    """Test Group 5: Accident AI APIs"""
    print("\n" + "="*80)
    print("TEST GROUP 5: Accident AI APIs")
    print("="*80)
    
    # Test 5.1: POST /api/ai/accident/predict-risk
    print("\n5.1 Testing POST /api/ai/accident/predict-risk")
    try:
        params = {
            "driver_id": "demo",
            "current_lat": 6.5244,
            "current_lng": 3.3792
        }
        response = requests.post(
            f"{BACKEND_URL}/ai/accident/predict-risk",
            params=params,
            timeout=15  # Longer timeout for AI prediction
        )
        response_data = response.json()
        success = (response.status_code == 200 and 
                  response_data.get("success") == True and
                  "ai_analysis" in response_data)
        
        log_test_result("POST /api/ai/accident/predict-risk", success, response_data, response.status_code)
        
    except Exception as e:
        log_test_result("POST /api/ai/accident/predict-risk", False, {"error": str(e)}, 0)
    
    # Test 5.2: GET /api/ai/accident/high-risk-areas
    print("\n5.2 Testing GET /api/ai/accident/high-risk-areas?lat=6.5244&lng=3.3792")
    try:
        params = {
            "lat": 6.5244,
            "lng": 3.3792
        }
        response = requests.get(
            f"{BACKEND_URL}/ai/accident/high-risk-areas",
            params=params,
            timeout=10
        )
        response_data = response.json()
        success = (response.status_code == 200 and 
                  response_data.get("success") == True and
                  "high_risk_areas" in response_data)
        
        log_test_result("GET /api/ai/accident/high-risk-areas", success, response_data, response.status_code)
        
    except Exception as e:
        log_test_result("GET /api/ai/accident/high-risk-areas", False, {"error": str(e)}, 0)

def main():
    """Run all backend API tests"""
    print("NEXRYDE BACKEND API TESTING")
    print("Testing Driver Features API Endpoints")
    print("Backend URL:", BACKEND_URL)
    print("Test Started at:", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    
    # Run all test groups
    test_driver_stories_api()
    test_fleet_tracker_api()
    test_driver_awareness_api()
    test_traffic_ai_apis()
    test_accident_ai_apis()
    
    print("\n" + "="*80)
    print("ALL BACKEND API TESTS COMPLETED")
    print("Test Completed at:", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    print("="*80)

if __name__ == "__main__":
    main()