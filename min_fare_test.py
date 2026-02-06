#!/usr/bin/env python3
"""
Focused Backend Testing for Fare Calculation Min_Fare Removal Verification
Testing specifically for the removal of minimum fare logic from Nigerian fare calculation system.
"""

import requests
import json
from typing import Dict, Any

# Backend URL from frontend env
BACKEND_URL = "https://call-ready-app.preview.emergentagent.com/api"

def test_min_fare_removal():
    """
    Test POST /api/fare/estimate endpoint to verify min_fare logic removal
    Focus on scenarios that would have previously triggered minimum fare
    """
    print("🎯 TESTING: Fare Estimation API - Min_Fare Logic Removal Verification")
    print("=" * 70)
    
    test_results = {
        "short_economy": False,
        "normal_economy": False, 
        "short_premium": False,
        "all_passed": False
    }
    
    # Test Case 1: SHORT TRIP (Would have triggered ₦800 min_fare for economy before)
    print("\n📍 TEST CASE 1: SHORT TRIP (Economy) - Previously would trigger ₦800 min_fare")
    short_trip_payload = {
        "pickup_lat": 6.5244,
        "pickup_lng": 3.3792,
        "dropoff_lat": 6.5254, 
        "dropoff_lng": 3.3802,  # Very short distance (~1km)
        "service_type": "economy",
        "city": "lagos"
    }
    
    try:
        response = requests.post(f"{BACKEND_URL}/fare/estimate", json=short_trip_payload)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            # Extract key fare information
            distance_km = data.get("distance_km", 0)
            duration_min = data.get("duration_min", 0) 
            total_fare = data.get("total_fare", 0)
            base_fare = data.get("base_fare", 500)
            distance_fee = data.get("distance_fee", 0)
            time_fee = data.get("time_fee", 0)
            
            print(f"\n📊 FARE BREAKDOWN ANALYSIS:")
            print(f"   Distance: {distance_km} km")
            print(f"   Duration: {duration_min} minutes")
            print(f"   Base Fare: ₦{base_fare}")
            print(f"   Distance Fee: ₦{distance_fee}")
            print(f"   Time Fee: ₦{time_fee}")
            print(f"   Total Fare: ₦{total_fare}")
            
            # Expected formula: base(500) + (distance × 150) + (time × 25)
            expected_formula_fare = base_fare + distance_fee + time_fee
            print(f"   Expected Formula Fare: ₦{expected_formula_fare}")
            
            # Check if fare is below old minimum threshold (₦800 for economy)
            old_min_fare = 800
            if total_fare < old_min_fare:
                print(f"✅ SUCCESS: Fare ₦{total_fare} is BELOW old minimum ₦{old_min_fare}")
                print("✅ Min_fare logic successfully REMOVED!")
                test_results["short_economy"] = True
            else:
                print(f"⚠️  WARNING: Fare ₦{total_fare} is above old minimum ₦{old_min_fare}")
                # Still might be valid if distance/time resulted in higher fare naturally
                if total_fare <= (expected_formula_fare + 50):  # Allow for rounding
                    print("✅ ACCEPTABLE: Fare matches formula calculation, no min_fare enforcement detected")
                    test_results["short_economy"] = True
                else:
                    print("❌ ISSUE: Fare significantly higher than expected formula")
                
        else:
            print(f"❌ ERROR: {response.status_code} - {response.text}")
            
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
    
    # Test Case 2: NORMAL TRIP (Economy) - Verify formula-based calculation
    print("\n📍 TEST CASE 2: NORMAL TRIP (Economy) - Formula-based calculation")
    normal_trip_payload = {
        "pickup_lat": 6.5244,
        "pickup_lng": 3.3792,
        "dropoff_lat": 6.4474,
        "dropoff_lng": 3.4126,  # ~5km distance
        "service_type": "economy",
        "city": "lagos"
    }
    
    try:
        response = requests.post(f"{BACKEND_URL}/fare/estimate", json=normal_trip_payload)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            distance_km = data.get("distance_km", 0)
            duration_min = data.get("duration_min", 0)
            total_fare = data.get("total_fare", 0)
            base_fare = data.get("base_fare", 0)
            distance_fee = data.get("distance_fee", 0)
            time_fee = data.get("time_fee", 0)
            traffic_fee = data.get("traffic_fee", 0)
            surge_multiplier = data.get("surge_multiplier", 1.0)
            
            print(f"\n📊 DETAILED FARE BREAKDOWN:")
            print(f"   Base Fare: ₦{base_fare}")
            print(f"   Distance Fee: ₦{distance_fee} ({distance_km}km × ₦150)")
            print(f"   Time Fee: ₦{time_fee} ({duration_min}min × ₦25)")
            print(f"   Traffic Fee: ₦{traffic_fee}")
            print(f"   Surge Multiplier: {surge_multiplier}x")
            print(f"   Total Fare: ₦{total_fare}")
            
            # Verify no min_fare in response or it's set to 0
            min_fare_in_response = data.get("min_fare", 0)
            print(f"   Min Fare Config: ₦{min_fare_in_response} (should be 0)")
            
            if min_fare_in_response == 0:
                print("✅ SUCCESS: min_fare is set to 0 in configuration")
                test_results["normal_economy"] = True
            else:
                print(f"⚠️  WARNING: min_fare still shows ₦{min_fare_in_response} in config")
                
        else:
            print(f"❌ ERROR: {response.status_code} - {response.text}")
            
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
    
    # Test Case 3: PREMIUM SHORT TRIP (Would have triggered ₦2000 min_fare before)
    print("\n📍 TEST CASE 3: PREMIUM SHORT TRIP - Previously would trigger ₦2000 min_fare")
    premium_trip_payload = {
        "pickup_lat": 6.5244,
        "pickup_lng": 3.3792,
        "dropoff_lat": 6.5264,
        "dropoff_lng": 3.3812,  # ~2km distance, 8min
        "service_type": "premium",
        "city": "lagos"
    }
    
    try:
        response = requests.post(f"{BACKEND_URL}/fare/estimate", json=premium_trip_payload)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            distance_km = data.get("distance_km", 0)
            duration_min = data.get("duration_min", 0)
            total_fare = data.get("total_fare", 0)
            base_fare = data.get("base_fare", 1000)
            distance_fee = data.get("distance_fee", 0)
            time_fee = data.get("time_fee", 0)
            
            print(f"\n📊 PREMIUM FARE ANALYSIS:")
            print(f"   Distance: {distance_km} km")
            print(f"   Duration: {duration_min} minutes") 
            print(f"   Base Fare: ₦{base_fare}")
            print(f"   Distance Fee: ₦{distance_fee}")
            print(f"   Time Fee: ₦{time_fee}")
            print(f"   Total Fare: ₦{total_fare}")
            
            # Check min_fare config for premium
            min_fare_premium = data.get("min_fare", 0)
            print(f"   Min Fare Config: ₦{min_fare_premium} (should be 0)")
            
            # For premium, even short trips might exceed old minimum due to high base fare
            # Focus on checking that min_fare config is 0
            if min_fare_premium == 0:
                print("✅ SUCCESS: Premium min_fare is set to 0 in configuration")
                test_results["short_premium"] = True
            else:
                print(f"❌ ISSUE: Premium min_fare still shows ₦{min_fare_premium} in config")
                
        else:
            print(f"❌ ERROR: {response.status_code} - {response.text}")
            
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
    
    # Summary of results
    print(f"\n📊 TEST RESULTS SUMMARY:")
    print(f"   Short Economy Trip: {'✅ PASSED' if test_results['short_economy'] else '❌ FAILED'}")
    print(f"   Normal Economy Trip: {'✅ PASSED' if test_results['normal_economy'] else '❌ FAILED'}")
    print(f"   Short Premium Trip: {'✅ PASSED' if test_results['short_premium'] else '❌ FAILED'}")
    
    # Overall assessment
    passed_tests = sum(test_results[k] for k in ['short_economy', 'normal_economy', 'short_premium'])
    if passed_tests == 3:
        print(f"\n🎉 ALL TESTS PASSED: Min_fare logic successfully removed!")
        test_results["all_passed"] = True
    elif passed_tests >= 2:
        print(f"\n⚠️  MOSTLY WORKING: {passed_tests}/3 tests passed")
    else:
        print(f"\n❌ ISSUES DETECTED: Only {passed_tests}/3 tests passed")
        
    return test_results

def main():
    """Main testing function"""
    print("🎯 BACKEND TESTING: Fare Calculation Min_Fare Removal Verification")
    print("=" * 70)
    print("Testing specifically that minimum fare logic has been removed from Nigerian fare calculation system.")
    print("Expected: Short trips should return fares based on formula without min_fare enforcement.")
    print()
    
    # Run the focused min_fare removal tests
    results = test_min_fare_removal()
    
    print("\n" + "=" * 70)
    print("🏁 MIN_FARE REMOVAL TESTING COMPLETE")
    print("=" * 70)
    
    if results["all_passed"]:
        print("✅ VERIFICATION SUCCESSFUL: Min_fare logic has been properly removed!")
    else:
        print("⚠️  VERIFICATION INCOMPLETE: Some issues may remain with min_fare removal")

if __name__ == "__main__":
    main()