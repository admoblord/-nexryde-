#!/usr/bin/env python3
"""
NEXRYDE Backend API Testing Script
Focus: Intra-City vs Inter-City Trip Type Pricing Feature

This script tests the POST /api/fares/estimate-google endpoint to verify:
1. Different pricing for intra-city vs inter-city trips
2. All 4 vehicle types (economy, comfort, xl, premium)
3. Google Maps integration and real distance/time calculation
4. Pricing formula accuracy
"""

import requests
import json
import time
from typing import Dict, Any

# Backend URL from environment
BACKEND_URL = "https://ride-hub-ng.preview.emergentagent.com"
API_BASE = f"{BACKEND_URL}/api"

# Test scenarios as specified in the review request
TEST_SCENARIOS = {
    "intra_city_economy": {
        "pickup": "Victoria Island, Lagos, Nigeria",
        "destination": "Lekki Phase 1, Lagos, Nigeria", 
        "vehicle_type": "economy",
        "trip_type": "intra",
        "expected_description": "Intra-city Lagos trip ~10-15km"
    },
    "inter_city_economy": {
        "pickup": "Victoria Island, Lagos, Nigeria",
        "destination": "Ibadan, Oyo State, Nigeria",
        "vehicle_type": "economy", 
        "trip_type": "inter",
        "expected_description": "Inter-city Lagos to Ibadan ~125-135km"
    }
}

# Vehicle types to test for both intra and inter city
VEHICLE_TYPES = ["economy", "comfort", "xl", "premium"]

# Expected pricing configuration (from backend code analysis)
INTRA_CITY_PRICING = {
    "economy": {"base": 400, "distance_rate": 400, "time_rate": 80},
    "comfort": {"base": 600, "distance_rate": 500, "time_rate": 100},
    "xl": {"base": 500, "distance_rate": 450, "time_rate": 90},
    "premium": {"base": 800, "distance_rate": 600, "time_rate": 120}
}

INTER_CITY_PRICING = {
    "economy": {"base": 1000, "distance_rate": 400, "time_rate": 5000},
    "comfort": {"base": 1200, "distance_rate": 500, "time_rate": 6000},
    "xl": {"base": 1100, "distance_rate": 450, "time_rate": 5500},
    "premium": {"base": 1500, "distance_rate": 600, "time_rate": 7000}
}

def log_test_result(test_name: str, success: bool, details: str):
    """Log test results in a structured format"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status} {test_name}")
    print(f"   Details: {details}")
    print("-" * 80)

def test_fare_estimation_endpoint(pickup: str, destination: str, vehicle_type: str, trip_type: str) -> Dict[str, Any]:
    """
    Test the /api/fares/estimate-google endpoint
    
    Returns: API response dict or None if failed
    """
    url = f"{API_BASE}/fares/estimate-google"
    payload = {
        "pickup": pickup,
        "destination": destination,
        "vehicle_type": vehicle_type,
        "trip_type": trip_type
    }
    
    try:
        print(f"Testing: {trip_type.upper()} trip - {vehicle_type.upper()}")
        print(f"Route: {pickup} → {destination}")
        print(f"Payload: {json.dumps(payload, indent=2)}")
        
        response = requests.post(url, json=payload, timeout=30)
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Response: {json.dumps(data, indent=2)}")
            return data
        else:
            print(f"Error Response: {response.text}")
            return None
            
    except requests.exceptions.RequestException as e:
        print(f"Request failed: {e}")
        return None

def validate_fare_calculation(response_data: Dict[str, Any]) -> bool:
    """
    Validate that the fare calculation matches expected pricing formula
    
    Returns: True if calculation is correct, False otherwise
    """
    try:
        trip_type = response_data.get("trip_type")
        vehicle_type = response_data.get("vehicle_type") 
        distance_km = response_data.get("distance_km", 0)
        duration_minutes = response_data.get("duration_minutes", 0)
        
        base_fare = response_data.get("base_fare", 0)
        distance_fee = response_data.get("distance_fee", 0)
        time_fee = response_data.get("time_fee", 0)
        total_fare = response_data.get("total_fare", 0)
        
        # Get expected pricing configuration
        if trip_type == "intra":
            config = INTRA_CITY_PRICING.get(vehicle_type, {})
            expected_time_fee = duration_minutes * config.get("time_rate", 0)
        else:  # inter
            config = INTER_CITY_PRICING.get(vehicle_type, {})
            expected_time_fee = (duration_minutes / 60) * config.get("time_rate", 0)
        
        expected_base = config.get("base", 0)
        expected_distance_fee = distance_km * config.get("distance_rate", 0)
        expected_total = expected_base + expected_distance_fee + expected_time_fee
        
        print(f"Validation:")
        print(f"  Expected Base: ₦{expected_base}, Actual: ₦{base_fare}")
        print(f"  Expected Distance Fee: ₦{expected_distance_fee:.2f}, Actual: ₦{distance_fee}")
        print(f"  Expected Time Fee: ₦{expected_time_fee:.2f}, Actual: ₦{time_fee}")
        print(f"  Expected Total: ₦{expected_total:.2f}, Actual: ₦{total_fare}")
        
        # Allow for small rounding differences (within ₦5)
        base_match = abs(base_fare - expected_base) < 5
        distance_match = abs(distance_fee - expected_distance_fee) < 5
        time_match = abs(time_fee - expected_time_fee) < 5
        total_match = abs(total_fare - expected_total) < 5
        
        return all([base_match, distance_match, time_match, total_match])
        
    except Exception as e:
        print(f"Validation error: {e}")
        return False

def test_main_scenarios():
    """Test the main intra-city vs inter-city scenarios"""
    
    print("=" * 80)
    print("NEXRYDE INTRA-CITY vs INTER-CITY TRIP PRICING TEST")
    print("=" * 80)
    
    results = {}
    
    # Test main scenarios from review request
    for scenario_name, scenario_data in TEST_SCENARIOS.items():
        print(f"\n🎯 TESTING: {scenario_name.upper()}")
        print(f"Description: {scenario_data['expected_description']}")
        
        response = test_fare_estimation_endpoint(
            pickup=scenario_data["pickup"],
            destination=scenario_data["destination"],
            vehicle_type=scenario_data["vehicle_type"],
            trip_type=scenario_data["trip_type"]
        )
        
        if response:
            # Validate response structure
            required_fields = ["total_fare", "base_fare", "distance_fee", "time_fee", 
                             "distance_km", "duration_minutes", "trip_type", "vehicle_type"]
            
            missing_fields = [field for field in required_fields if field not in response]
            
            if missing_fields:
                log_test_result(
                    f"{scenario_name} - Response Structure",
                    False,
                    f"Missing fields: {missing_fields}"
                )
                results[scenario_name] = {"success": False, "error": "Missing response fields"}
            else:
                # Validate fare calculation
                calculation_valid = validate_fare_calculation(response)
                
                log_test_result(
                    f"{scenario_name} - Fare Calculation",
                    calculation_valid,
                    f"Distance: {response['distance_km']}km, Duration: {response['duration_minutes']}min, Total: ₦{response['total_fare']}"
                )
                
                results[scenario_name] = {
                    "success": True,
                    "response": response,
                    "calculation_valid": calculation_valid
                }
        else:
            log_test_result(
                f"{scenario_name} - API Call",
                False,
                "API call failed or returned error"
            )
            results[scenario_name] = {"success": False, "error": "API call failed"}
    
    return results

def test_all_vehicle_types():
    """Test all vehicle types for both intra-city and inter-city"""
    
    print("\n" + "=" * 80)
    print("TESTING ALL VEHICLE TYPES")
    print("=" * 80)
    
    # Short intra-city route for testing all vehicle types
    intra_pickup = "Victoria Island, Lagos, Nigeria"
    intra_destination = "Lekki Phase 1, Lagos, Nigeria"
    
    # Long inter-city route for testing all vehicle types  
    inter_pickup = "Victoria Island, Lagos, Nigeria"
    inter_destination = "Ibadan, Oyo State, Nigeria"
    
    vehicle_results = {}
    
    for trip_type in ["intra", "inter"]:
        pickup = intra_pickup if trip_type == "intra" else inter_pickup
        destination = intra_destination if trip_type == "intra" else inter_destination
        
        print(f"\n🚗 TESTING {trip_type.upper()}-CITY - ALL VEHICLE TYPES")
        
        trip_results = {}
        
        for vehicle_type in VEHICLE_TYPES:
            response = test_fare_estimation_endpoint(pickup, destination, vehicle_type, trip_type)
            
            if response:
                calculation_valid = validate_fare_calculation(response)
                trip_results[vehicle_type] = {
                    "success": True,
                    "total_fare": response["total_fare"],
                    "calculation_valid": calculation_valid
                }
                
                log_test_result(
                    f"{trip_type}-city {vehicle_type}",
                    True,
                    f"Total: ₦{response['total_fare']}, Calculation Valid: {calculation_valid}"
                )
            else:
                trip_results[vehicle_type] = {"success": False}
                log_test_result(
                    f"{trip_type}-city {vehicle_type}",
                    False,
                    "API call failed"
                )
            
            # Small delay between requests
            time.sleep(1)
        
        vehicle_results[trip_type] = trip_results
    
    return vehicle_results

def validate_pricing_differences(main_results: Dict, vehicle_results: Dict):
    """Validate that inter-city pricing is appropriately higher than intra-city"""
    
    print("\n" + "=" * 80)
    print("PRICING VALIDATION")
    print("=" * 80)
    
    validation_results = []
    
    # Compare main scenarios (economy only)
    if ("intra_city_economy" in main_results and 
        "inter_city_economy" in main_results and
        main_results["intra_city_economy"].get("success") and
        main_results["inter_city_economy"].get("success")):
        
        intra_fare = main_results["intra_city_economy"]["response"]["total_fare"]
        inter_fare = main_results["inter_city_economy"]["response"]["total_fare"]
        
        fare_difference = inter_fare - intra_fare
        percentage_increase = (fare_difference / intra_fare) * 100
        
        # Inter-city should be significantly higher due to longer distance and hourly vs per-minute charging
        is_valid = inter_fare > intra_fare and percentage_increase > 100  # At least 100% increase expected
        
        log_test_result(
            "Economy Vehicle - Intra vs Inter Pricing",
            is_valid,
            f"Intra: ₦{intra_fare}, Inter: ₦{inter_fare}, Difference: +₦{fare_difference:.2f} ({percentage_increase:.1f}%)"
        )
        
        validation_results.append({
            "test": "intra_vs_inter_economy",
            "valid": is_valid,
            "intra_fare": intra_fare,
            "inter_fare": inter_fare,
            "percentage_increase": percentage_increase
        })
    
    # Validate that different vehicle types have different prices
    for trip_type in ["intra", "inter"]:
        if trip_type in vehicle_results:
            fares = []
            for vehicle_type in VEHICLE_TYPES:
                if (vehicle_type in vehicle_results[trip_type] and 
                    vehicle_results[trip_type][vehicle_type].get("success")):
                    fare = vehicle_results[trip_type][vehicle_type]["total_fare"]
                    fares.append((vehicle_type, fare))
            
            if len(fares) >= 2:
                # Check that fares are different (not all the same)
                unique_fares = len(set(fare for _, fare in fares))
                is_valid = unique_fares > 1
                
                fare_summary = ", ".join([f"{vtype}: ₦{fare}" for vtype, fare in fares])
                
                log_test_result(
                    f"{trip_type.title()}-city Vehicle Type Pricing Diversity",
                    is_valid,
                    f"Unique prices: {unique_fares}/{len(fares)} ({fare_summary})"
                )
                
                validation_results.append({
                    "test": f"{trip_type}_vehicle_diversity",
                    "valid": is_valid,
                    "fares": dict(fares),
                    "unique_count": unique_fares
                })
    
    return validation_results

def generate_summary(main_results: Dict, vehicle_results: Dict, validation_results: list):
    """Generate a comprehensive test summary"""
    
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    # Count successful tests
    main_success = sum(1 for result in main_results.values() if result.get("success"))
    main_total = len(main_results)
    
    vehicle_success = 0
    vehicle_total = 0
    for trip_results in vehicle_results.values():
        for result in trip_results.values():
            vehicle_total += 1
            if result.get("success"):
                vehicle_success += 1
    
    validation_success = sum(1 for result in validation_results if result.get("valid"))
    validation_total = len(validation_results)
    
    total_success = main_success + vehicle_success + validation_success
    total_tests = main_total + vehicle_total + validation_total
    
    print(f"🎯 MAIN SCENARIOS: {main_success}/{main_total} passed")
    print(f"🚗 VEHICLE TYPE TESTS: {vehicle_success}/{vehicle_total} passed") 
    print(f"✅ VALIDATION TESTS: {validation_success}/{validation_total} passed")
    print(f"📊 OVERALL SUCCESS RATE: {total_success}/{total_tests} ({(total_success/total_tests*100):.1f}%)")
    
    # Identify any critical issues
    critical_issues = []
    
    if main_success < main_total:
        critical_issues.append("Main scenario tests failing")
    
    if vehicle_success < vehicle_total * 0.5:  # Less than 50% success
        critical_issues.append("Multiple vehicle type tests failing")
    
    if validation_success == 0:
        critical_issues.append("Pricing validation completely failed")
    
    if critical_issues:
        print(f"\n❌ CRITICAL ISSUES DETECTED:")
        for issue in critical_issues:
            print(f"   • {issue}")
    else:
        print(f"\n✅ ALL CRITICAL FUNCTIONALITY WORKING")
    
    # API Integration Status
    google_maps_working = any(
        result.get("response", {}).get("source") == "Google Maps API" 
        for result in main_results.values() 
        if result.get("success")
    )
    
    print(f"\n🗺️ GOOGLE MAPS INTEGRATION: {'✅ Working' if google_maps_working else '❌ Failed'}")
    
    return {
        "total_success": total_success,
        "total_tests": total_tests,
        "success_rate": total_success/total_tests*100,
        "critical_issues": critical_issues,
        "google_maps_working": google_maps_working
    }

def main():
    """Main test execution function"""
    
    print("Starting NEXRYDE Intra-City vs Inter-City Trip Pricing Tests...")
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Target Endpoint: {API_BASE}/fares/estimate-google")
    
    # Test main scenarios
    main_results = test_main_scenarios()
    
    # Test all vehicle types
    vehicle_results = test_all_vehicle_types()
    
    # Validate pricing logic
    validation_results = validate_pricing_differences(main_results, vehicle_results)
    
    # Generate comprehensive summary
    summary = generate_summary(main_results, vehicle_results, validation_results)
    
    # Return results for external analysis
    return {
        "main_results": main_results,
        "vehicle_results": vehicle_results, 
        "validation_results": validation_results,
        "summary": summary
    }

if __name__ == "__main__":
    try:
        results = main()
        
        # Print final status for easy parsing
        if results["summary"]["success_rate"] >= 80:
            print(f"\n🎉 TESTING COMPLETE - SUCCESS RATE: {results['summary']['success_rate']:.1f}%")
            exit(0)
        else:
            print(f"\n⚠️ TESTING COMPLETE - SUCCESS RATE: {results['summary']['success_rate']:.1f}% (BELOW THRESHOLD)")
            exit(1)
            
    except Exception as e:
        print(f"\n💥 TESTING FAILED WITH EXCEPTION: {e}")
        exit(2)