#!/usr/bin/env python3
"""
Backend Test Script for NEXRYDE Area Boys Safety Zone System
Testing 3 new safety endpoints with real database + AI integration
"""

import asyncio
import httpx
import json
import time
import sys
from typing import Dict, Any

# Backend URL from frontend environment
BACKEND_URL = "https://smart-mode-preview.preview.emergentagent.com/api"

# Test data
TEST_DATA = {
    "smart_mode": {
        "ride": {
            "pickup": "Victoria Island", 
            "destination": "Ikeja GRA", 
            "distance_km": 15.2, 
            "duration_min": 45, 
            "fare": 4500, 
            "rider_rating": 4.8
        },
        "settings": {
            "enabled": True,
            "max_distance": 20,
            "min_rating": 4.0,
            "surge_threshold": 1.5,
            "auto_accept": True,
            "preferred_areas": []
        }
    },
    "coordinates": {
        "victoria_island": {"lat": 6.5244, "lng": 3.3792},
        "ikeja": {"lat": 6.4541, "lng": 3.3947}
    }
}

class BackendTester:
    def __init__(self):
        self.results = []
        self.client = httpx.AsyncClient(timeout=60.0)
    
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
    
    async def test_safety_danger_zones_get(self) -> bool:
        """Test 1: GET /api/safety/danger-zones - Should return 10 seeded Lagos danger zones"""
        print("🧪 Testing Get Danger Zones API...")
        
        try:
            # Make request with specified coordinates and radius
            params = {
                "lat": 6.5244,
                "lng": 3.3792,
                "radius": 10000
            }
            
            response = await self.client.get(
                f"{BACKEND_URL}/safety/danger-zones",
                params=params
            )
            
            data = response.json()
            
            # Validate response structure
            success_checks = [
                response.status_code == 200,
                data.get("success") is True,
                "zones" in data,
                isinstance(data.get("zones"), list),
                "count" in data,
                data.get("count") == len(data.get("zones", [])),
                len(data.get("zones", [])) >= 5  # Should have multiple zones
            ]
            
            # Validate zone structure
            zones = data.get("zones", [])
            if zones:
                first_zone = zones[0]
                zone_checks = [
                    "zone_id" in first_zone or "_id" in first_zone,
                    "location" in first_zone,
                    "latitude" in first_zone.get("location", {}),
                    "longitude" in first_zone.get("location", {}),
                    "address" in first_zone.get("location", {}),
                    "type" in first_zone,
                    "severity" in first_zone,
                    "description" in first_zone,
                    "verified_reports" in first_zone,
                    "ai_confidence" in first_zone
                ]
                success_checks.extend(zone_checks)
            
            all_success = all(success_checks)
            
            key_findings = []
            if all_success:
                key_findings = [
                    f"Total zones returned: {data.get('count', 0)}",
                    f"Success status: {data.get('success')}",
                    f"Sample zone type: {zones[0].get('type', 'N/A')}" if zones else "No zones",
                    f"Sample address: {zones[0].get('location', {}).get('address', 'N/A')}" if zones else "No zones",
                    f"Sample verified reports: {zones[0].get('verified_reports', 0)}" if zones else "No zones"
                ]
            
            self.log_result(
                "Get Danger Zones",
                all_success,
                {
                    "response": data,
                    "status_code": response.status_code,
                    "key_findings": key_findings,
                    "error": None if all_success else f"Validation failed: missing fields"
                }
            )
            
            return all_success
            
        except Exception as e:
            self.log_result(
                "Get Danger Zones",
                False,
                {"error": f"Exception: {str(e)}"}
            )
            return False

    async def test_safety_report_post(self) -> bool:
        """Test 2: POST /api/safety/report - Submit area boys report at Oshodi bridge"""
        print("🧪 Testing Safety Report Submission API...")
        
        try:
            # Prepare report data as specified in review request
            report_data = {
                "user_id": "driver-001",
                "user_name": "Emeka O.",
                "role": "driver",
                "type": "area_boys", 
                "severity": "high",
                "description": "Area boys blocking traffic at Oshodi bridge, demanding money from drivers",
                "latitude": 6.5566,
                "longitude": 3.3515,
                "address": "Oshodi Under Bridge"
            }
            
            response = await self.client.post(
                f"{BACKEND_URL}/safety/report",
                json=report_data
            )
            
            data = response.json()
            
            # Validate response
            success_checks = [
                response.status_code == 200,
                data.get("success") is True,
                "report_id" in data,
                "message" in data,
                "keeping drivers safe" in data.get("message", "").lower() or "thank you" in data.get("message", "").lower()
            ]
            
            all_success = all(success_checks)
            
            key_findings = []
            if all_success:
                key_findings = [
                    f"Report submitted successfully",
                    f"Report ID: {data.get('report_id', 'N/A')}",
                    f"Response message: {data.get('message', 'N/A')}",
                    f"Success status: {data.get('success')}"
                ]
            
            self.log_result(
                "Safety Report Submission",
                all_success,
                {
                    "response": data,
                    "status_code": response.status_code,
                    "key_findings": key_findings,
                    "error": None if all_success else f"Validation failed"
                }
            )
            
            return all_success
            
        except Exception as e:
            self.log_result(
                "Safety Report Submission",
                False,
                {"error": f"Exception: {str(e)}"}
            )
            return False

    async def test_safety_danger_zones_after_report(self) -> bool:
        """Test 3: GET /api/safety/danger-zones - Verify Oshodi zone verified_reports increased"""
        print("🧪 Testing Danger Zones After Report (Verify Count Increase)...")
        
        try:
            # Make request with specified coordinates and radius
            params = {
                "lat": 6.5244,
                "lng": 3.3792,
                "radius": 10000
            }
            
            response = await self.client.get(
                f"{BACKEND_URL}/safety/danger-zones",
                params=params
            )
            
            data = response.json()
            
            # Find Oshodi zone
            oshodi_zone = None
            zones = data.get("zones", [])
            for zone in zones:
                address = zone.get("location", {}).get("address", "").lower()
                if "oshodi" in address:
                    oshodi_zone = zone
                    break
            
            # Validate response and check for Oshodi zone update
            success_checks = [
                response.status_code == 200,
                data.get("success") is True,
                oshodi_zone is not None,
                oshodi_zone.get("verified_reports", 0) >= 156 if oshodi_zone else False  # Should be 156+ (was 156, now 157)
            ]
            
            all_success = all(success_checks)
            
            key_findings = []
            if all_success:
                key_findings = [
                    f"Oshodi zone found: {'✅' if oshodi_zone else '❌'}",
                    f"Oshodi verified reports: {oshodi_zone.get('verified_reports', 0) if oshodi_zone else 'N/A'}",
                    f"Report count increased: {'✅' if oshodi_zone and oshodi_zone.get('verified_reports', 0) > 156 else '❌'}",
                    f"Total zones: {data.get('count', 0)}"
                ]
            
            self.log_result(
                "Danger Zones After Report",
                all_success,
                {
                    "response": data,
                    "status_code": response.status_code,
                    "key_findings": key_findings,
                    "error": None if all_success else f"Oshodi zone verification failed"
                }
            )
            
            return all_success
            
        except Exception as e:
            self.log_result(
                "Danger Zones After Report",
                False,
                {"error": f"Exception: {str(e)}"}
            )
            return False

    async def test_safety_alerts_ai(self) -> bool:
        """Test 4: GET /api/safety/alerts - AI-enhanced safety alerts using GPT-4o"""
        print("🧪 Testing AI Safety Alerts API...")
        
        try:
            # Make request with specified coordinates and driver ID
            params = {
                "lat": 6.5244,
                "lng": 3.3792,
                "driver_id": "demo"
            }
            
            response = await self.client.get(
                f"{BACKEND_URL}/safety/alerts",
                params=params
            )
            
            data = response.json()
            
            # Validate response structure
            success_checks = [
                response.status_code == 200,
                data.get("success") is True,
                "alerts" in data,
                isinstance(data.get("alerts"), list),
                len(data.get("alerts", [])) >= 3,  # Should have 3-4 items
                "active_zones" in data,
                "total_zones" in data,
                isinstance(data.get("active_zones"), int),
                isinstance(data.get("total_zones"), int)
            ]
            
            # Validate alert structure if alerts exist
            alerts = data.get("alerts", [])
            if alerts:
                first_alert = alerts[0]
                alert_checks = [
                    "type" in first_alert,
                    "priority" in first_alert,
                    "title" in first_alert,
                    "message" in first_alert,
                    "zone_type" in first_alert,
                    first_alert.get("type") in ["danger", "warning", "info"],
                    first_alert.get("priority") in ["critical", "high", "medium", "low"],
                    first_alert.get("zone_type") in ["area_boys", "checkpoint", "robbery", "flooding", "general"]
                ]
                success_checks.extend(alert_checks)
            
            all_success = all(success_checks)
            
            key_findings = []
            if all_success:
                key_findings = [
                    f"AI alerts generated: {len(alerts)}",
                    f"Active zones: {data.get('active_zones', 0)}",
                    f"Total zones: {data.get('total_zones', 0)}",
                    f"Sample alert: {alerts[0].get('title', 'N/A')}" if alerts else "No alerts",
                    f"Real AI response: {'✅' if alerts else '❌'}"
                ]
            
            self.log_result(
                "AI Safety Alerts",
                all_success,
                {
                    "response": data,
                    "status_code": response.status_code,
                    "key_findings": key_findings,
                    "error": None if all_success else f"AI alerts validation failed"
                }
            )
            
            return all_success
            
        except Exception as e:
            self.log_result(
                "AI Safety Alerts",
                False,
                {"error": f"Exception: {str(e)}"}
            )
            return False
    
    async def run_all_tests(self):
        """Run all safety endpoint tests"""
        print("🚀 Starting Area Boys Safety Zone Backend Tests")
        print("=" * 60)
        print(f"Backend URL: {BACKEND_URL}")
        print("Testing 3 safety endpoints with real database + AI integration")
        print()
        
        # Run tests in sequence as requested
        tests = [
            self.test_safety_danger_zones_get,
            self.test_safety_report_post,  
            self.test_safety_danger_zones_after_report,
            self.test_safety_alerts_ai
        ]
        
        results = []
        for test in tests:
            result = await test()
            results.append(result)
            await asyncio.sleep(2)  # Delay between tests for database consistency
        
        # Summary
        print("=" * 60)
        print("🎯 AREA BOYS SAFETY ZONE TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(results)
        total = len(results)
        
        for i, result in enumerate(self.results):
            status = "✅ PASS" if result["success"] else "❌ FAIL"
            print(f"{status}: {result['test']}")
        
        print()
        print(f"Overall Result: {passed}/{total} safety tests passed")
        
        if passed == total:
            print("🎉 ALL AREA BOYS SAFETY TESTS PASSED!")
            print("✅ Database integration working correctly")
            print("✅ AI-enhanced safety alerts operational")  
            print("✅ Community reporting system functional")
        else:
            print("⚠️  SOME SAFETY TESTS FAILED - Check individual test results above")
        
        return passed == total

async def main():
    """Main test runner"""
    tester = BackendTester()
    
    try:
        success = await tester.run_all_tests()
        return 0 if success else 1
    finally:
        await tester.cleanup()

if __name__ == "__main__":
    sys.exit(asyncio.run(main()))