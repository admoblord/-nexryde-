#!/usr/bin/env python3
"""
Ride Request Flow Backend Test Script for NEXRYDE
Testing the complete ride request flow as specified:
1. POST /api/trips/create-with-custom-price - Rider creates a trip
2. GET /api/trips/pending - Driver checks for pending rides  
3. GET /api/trips/{trip_id}/status - Rider checks trip status (before acceptance)
4. PUT /api/trips/{trip_id}/accept - Driver accepts the ride
5. GET /api/trips/{trip_id}/status - Rider checks trip status (after acceptance)
"""

import asyncio
import httpx
import json
import time
import sys
from typing import Dict, Any

# Backend URL from frontend environment
BACKEND_URL = "https://smart-mode-preview.preview.emergentagent.com/api"

class RideRequestTester:
    def __init__(self):
        self.results = []
        self.client = httpx.AsyncClient(timeout=60.0)
        self.trip_id = None  # Store trip ID for subsequent tests
    
    async def cleanup(self):
        await self.client.aclose()
    
    def log_result(self, test_name: str, success: bool, details: Dict[str, Any]):
        """Log test result"""
        self.results.append({
            "test": test_name,
            "success": success,
            "details": details
        })
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name}")
        if not success and "error" in details:
            print(f"   Error: {details['error']}")
        elif success and "key_findings" in details:
            for finding in details["key_findings"]:
                print(f"   • {finding}")
        print()
    
    async def test_1_rider_creates_trip(self) -> bool:
        """Test 1: POST /api/trips/create-with-custom-price - Rider creates a trip"""
        print("🧪 Test 1: POST /api/trips/create-with-custom-price")
        
        try:
            trip_data = {
                "rider_id": "rider-test-001",
                "pickup": "Victoria Island, Lagos",
                "destination": "Ikeja GRA, Lagos", 
                "offered_fare": 4500,
                "vehicle_type": "economy",
                "trip_type": "intra"
            }
            
            response = await self.client.post(
                f"{BACKEND_URL}/trips/create-with-custom-price",
                json=trip_data
            )
            
            data = response.json()
            
            # Validate response structure
            success_checks = [
                response.status_code == 200,
                data.get("success") is True,
                "trip" in data,
                "id" in data.get("trip", {}),
                data.get("trip", {}).get("status") == "pending_driver_offers",
                data.get("trip", {}).get("rider_id") == "rider-test-001",
                data.get("trip", {}).get("pickup") == "Victoria Island, Lagos",
                data.get("trip", {}).get("destination") == "Ikeja GRA, Lagos",
                data.get("trip", {}).get("offered_fare") == 4500,
                data.get("trip", {}).get("vehicle_type") == "economy",
                data.get("trip", {}).get("trip_type") == "intra"
            ]
            
            all_success = all(success_checks)
            
            # Store trip ID for subsequent tests
            if all_success and "trip" in data and "id" in data["trip"]:
                self.trip_id = data["trip"]["id"]
            
            key_findings = []
            if all_success:
                key_findings = [
                    f"Trip created successfully with ID: {self.trip_id}",
                    f"Status: {data.get('trip', {}).get('status')}",
                    f"Rider ID: {data.get('trip', {}).get('rider_id')}",
                    f"Pickup: {data.get('trip', {}).get('pickup')}",
                    f"Destination: {data.get('trip', {}).get('destination')}",
                    f"Offered fare: ₦{data.get('trip', {}).get('offered_fare')}",
                    f"Vehicle type: {data.get('trip', {}).get('vehicle_type')}",
                    f"Trip type: {data.get('trip', {}).get('trip_type')}"
                ]
            
            self.log_result(
                "POST /api/trips/create-with-custom-price",
                all_success,
                {
                    "response": data,
                    "status_code": response.status_code,
                    "key_findings": key_findings,
                    "error": None if all_success else "Trip creation validation failed"
                }
            )
            
            return all_success
            
        except Exception as e:
            self.log_result(
                "POST /api/trips/create-with-custom-price",
                False,
                {"error": f"Exception: {str(e)}"}
            )
            return False

    async def test_2_driver_checks_pending_rides(self) -> bool:
        """Test 2: GET /api/trips/pending - Driver checks for pending rides"""
        print("🧪 Test 2: GET /api/trips/pending?driver_lat=6.5244&driver_lng=3.3792")
        
        try:
            response = await self.client.get(
                f"{BACKEND_URL}/trips/pending?driver_lat=6.5244&driver_lng=3.3792"
            )
            
            data = response.json()
            
            # Validate response structure  
            success_checks = [
                response.status_code == 200,
                isinstance(data, list),  # Should return an array
                len(data) >= 1  # Should have at least our created trip
            ]
            
            # Look for our specific trip
            trip_found = False
            our_trip = None
            
            if isinstance(data, list):
                for trip in data:
                    if trip.get("id") == self.trip_id:
                        trip_found = True
                        our_trip = trip
                        # Validate our trip structure
                        trip_checks = [
                            "pickup_location" in trip or "pickup" in trip,
                            "destination" in trip,
                            "offered_fare" in trip,
                            trip.get("status") == "pending_driver_offers"
                        ]
                        success_checks.extend(trip_checks)
                        break
            
            success_checks.append(trip_found)
            all_success = all(success_checks)
            
            key_findings = []
            if all_success:
                key_findings = [
                    f"Total pending trips found: {len(data) if isinstance(data, list) else 0}",
                    f"Our trip found in pending list: {'✅' if trip_found else '❌'}",
                    f"Our trip ID: {self.trip_id}",
                    f"Our trip pickup: {our_trip.get('pickup_location') if our_trip else 'Not found'}",
                    f"Our trip destination: {our_trip.get('destination') if our_trip else 'Not found'}",
                    f"Our trip fare: ₦{our_trip.get('offered_fare') if our_trip else 'Not found'}"
                ]
            
            self.log_result(
                "GET /api/trips/pending",
                all_success,
                {
                    "response": data,
                    "status_code": response.status_code,
                    "key_findings": key_findings,
                    "error": None if all_success else f"Pending trips validation failed or our trip not found"
                }
            )
            
            return all_success
            
        except Exception as e:
            self.log_result(
                "GET /api/trips/pending",
                False,
                {"error": f"Exception: {str(e)}"}
            )
            return False

    async def test_3_rider_checks_status_before_acceptance(self) -> bool:
        """Test 3: GET /api/trips/{trip_id}/status - Rider checks trip status before driver accepts"""
        print(f"🧪 Test 3: GET /api/trips/{self.trip_id}/status (before acceptance)")
        
        if not self.trip_id:
            self.log_result(
                "GET /api/trips/{trip_id}/status (before acceptance)",
                False,
                {"error": "No trip ID from Test 1 - cannot test status check"}
            )
            return False
        
        try:
            response = await self.client.get(
                f"{BACKEND_URL}/trips/{self.trip_id}/status"
            )
            
            data = response.json()
            
            # Validate response structure
            success_checks = [
                response.status_code == 200,
                data.get("success") is True,
                data.get("status") == "pending_driver_offers",
                data.get("driver_info") is None  # Should be null before driver accepts
            ]
            
            all_success = all(success_checks)
            
            key_findings = []
            if all_success:
                key_findings = [
                    f"Status check successful",
                    f"Trip status: {data.get('status')}",
                    f"Driver info: {data.get('driver_info')}",
                    f"Success flag: {data.get('success')}"
                ]
            
            self.log_result(
                "GET /api/trips/{trip_id}/status (before acceptance)",
                all_success,
                {
                    "response": data,
                    "status_code": response.status_code,
                    "key_findings": key_findings,
                    "error": None if all_success else "Status check validation failed"
                }
            )
            
            return all_success
            
        except Exception as e:
            self.log_result(
                "GET /api/trips/{trip_id}/status (before acceptance)",
                False,
                {"error": f"Exception: {str(e)}"}
            )
            return False

    async def test_4_driver_accepts_ride(self) -> bool:
        """Test 4: PUT /api/trips/{trip_id}/accept - Driver accepts the ride"""
        print(f"🧪 Test 4: PUT /api/trips/{self.trip_id}/accept")
        
        if not self.trip_id:
            self.log_result(
                "PUT /api/trips/{trip_id}/accept",
                False,
                {"error": "No trip ID from Test 1 - cannot test driver acceptance"}
            )
            return False
        
        try:
            accept_data = {
                "driver_id": "driver-test-001"
            }
            
            response = await self.client.put(
                f"{BACKEND_URL}/trips/{self.trip_id}/accept",
                json=accept_data
            )
            
            # Validate response - should be 200 OK
            success_checks = [
                response.status_code == 200
            ]
            
            # Try to parse JSON response if available
            try:
                data = response.json()
                if isinstance(data, dict):
                    # If JSON response, validate structure
                    if "success" in data:
                        success_checks.append(data.get("success") is True)
                    if "message" in data:
                        success_checks.append("accept" in data.get("message", "").lower())
            except:
                # If no JSON response, that's okay as long as status is 200
                data = {"message": "Driver acceptance successful", "status_code": 200}
            
            all_success = all(success_checks)
            
            key_findings = []
            if all_success:
                key_findings = [
                    f"Driver acceptance successful",
                    f"Driver ID: driver-test-001",
                    f"Trip ID: {self.trip_id}",
                    f"Response status: {response.status_code}",
                    f"Response data: {data}"
                ]
            
            self.log_result(
                "PUT /api/trips/{trip_id}/accept",
                all_success,
                {
                    "response": data,
                    "status_code": response.status_code,
                    "key_findings": key_findings,
                    "error": None if all_success else "Driver acceptance failed"
                }
            )
            
            return all_success
            
        except Exception as e:
            self.log_result(
                "PUT /api/trips/{trip_id}/accept",
                False,
                {"error": f"Exception: {str(e)}"}
            )
            return False

    async def test_5_rider_checks_status_after_acceptance(self) -> bool:
        """Test 5: GET /api/trips/{trip_id}/status - Rider checks trip status after driver accepts"""
        print(f"🧪 Test 5: GET /api/trips/{self.trip_id}/status (after acceptance)")
        
        if not self.trip_id:
            self.log_result(
                "GET /api/trips/{trip_id}/status (after acceptance)",
                False,
                {"error": "No trip ID from Test 1 - cannot test status check"}
            )
            return False
        
        try:
            # Small delay to ensure acceptance is processed
            await asyncio.sleep(2)
            
            response = await self.client.get(
                f"{BACKEND_URL}/trips/{self.trip_id}/status"
            )
            
            data = response.json()
            
            # Validate response structure
            success_checks = [
                response.status_code == 200,
                data.get("success") is True,
                data.get("status") == "accepted",  # Should be "accepted" after driver accepts
                data.get("driver_info") is not None  # Should have driver info now
            ]
            
            # Validate driver_info structure if present
            if data.get("driver_info"):
                driver_info = data.get("driver_info")
                if isinstance(driver_info, dict):
                    driver_checks = [
                        "driver_id" in driver_info or "id" in driver_info
                    ]
                    success_checks.extend(driver_checks)
            
            all_success = all(success_checks)
            
            key_findings = []
            if all_success:
                driver_info = data.get("driver_info", {})
                key_findings = [
                    f"Status check successful after acceptance",
                    f"Trip status: {data.get('status')}",
                    f"Driver info present: {'✅' if data.get('driver_info') else '❌'}",
                    f"Driver ID: {driver_info.get('driver_id') or driver_info.get('id') if driver_info else 'Not found'}",
                    f"Success flag: {data.get('success')}"
                ]
            
            self.log_result(
                "GET /api/trips/{trip_id}/status (after acceptance)",
                all_success,
                {
                    "response": data,
                    "status_code": response.status_code,
                    "key_findings": key_findings,
                    "error": None if all_success else "Status check after acceptance validation failed"
                }
            )
            
            return all_success
            
        except Exception as e:
            self.log_result(
                "GET /api/trips/{trip_id}/status (after acceptance)",
                False,
                {"error": f"Exception: {str(e)}"}
            )
            return False
    
    async def run_full_flow_test(self):
        """Run the complete ride request flow test"""
        print("🚀 Starting RIDE REQUEST FLOW Backend API Tests")
        print("=" * 70)
        print(f"Backend URL: {BACKEND_URL}")
        print("Testing complete rider-to-driver matching flow:")
        print("1. Rider creates a trip with custom price")
        print("2. Driver checks for pending rides")
        print("3. Rider checks trip status (before driver accepts)")
        print("4. Driver accepts the ride")
        print("5. Rider checks trip status (after driver accepts)")
        print()
        
        # Run tests in exact sequence as specified
        tests = [
            self.test_1_rider_creates_trip,
            self.test_2_driver_checks_pending_rides,
            self.test_3_rider_checks_status_before_acceptance,
            self.test_4_driver_accepts_ride,
            self.test_5_rider_checks_status_after_acceptance
        ]
        
        results = []
        for test in tests:
            result = await test()
            results.append(result)
            if not result:
                # If any test fails, the flow is broken
                print("⚠️  Flow test stopped due to failure")
                break
            await asyncio.sleep(1)  # Small delay between tests
        
        # Summary
        print("=" * 70)
        print("🎯 RIDE REQUEST FLOW TEST SUMMARY")
        print("=" * 70)
        
        passed = sum(results)
        total = len(results)
        
        for i, result in enumerate(self.results):
            status = "✅ PASS" if result["success"] else "❌ FAIL"
            print(f"{status}: {result['test']}")
        
        print()
        print(f"Overall Result: {passed}/{total} flow tests passed")
        
        if passed == total:
            print("🎉 COMPLETE RIDE REQUEST FLOW WORKING!")
            print("✅ Step 1: Rider creates trip with custom price - SUCCESS")
            print("✅ Step 2: Driver can see pending rides - SUCCESS") 
            print("✅ Step 3: Rider can check status before acceptance - SUCCESS")
            print("✅ Step 4: Driver can accept the ride - SUCCESS")
            print("✅ Step 5: Rider can see updated status after acceptance - SUCCESS")
            print()
            print("🚗 Complete rider-to-driver matching flow is OPERATIONAL!")
        else:
            print("⚠️  RIDE REQUEST FLOW HAS ISSUES - Check individual test results above")
            print(f"Flow broken at step {passed + 1}")
        
        return passed == total

async def main():
    """Main test runner for Ride Request Flow"""
    tester = RideRequestTester()
    
    try:
        success = await tester.run_full_flow_test()
        return 0 if success else 1
    finally:
        await tester.cleanup()

if __name__ == "__main__":
    sys.exit(asyncio.run(main()))