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
    
    async def test_smart_mode_analyze_ride(self) -> bool:
        """Test 1: POST /api/ai/smart-mode/analyze-ride"""
        print("🧪 Testing Smart Mode Analyze Ride API...")
        
        try:
            # Prepare request data
            params = {"driver_id": "demo"}
            payload = {
                "ride": TEST_DATA["smart_mode"]["ride"],
                "settings": TEST_DATA["smart_mode"]["settings"]
            }
            
            # Make request
            response = await self.client.post(
                f"{BACKEND_URL}/ai/smart-mode/analyze-ride",
                params=params,
                json=payload
            )
            
            data = response.json()
            
            # Validate response
            success_checks = [
                response.status_code == 200,
                data.get("success") is True,
                "ai_analysis" in data,
                "recommendation" in data.get("ai_analysis", {}),
                data.get("ai_analysis", {}).get("recommendation") in ["ACCEPT", "REJECT"],
                "confidence" in data.get("ai_analysis", {}),
                "reasoning" in data.get("ai_analysis", {}),
                "score" in data.get("ai_analysis", {}),
                data.get("fallback") != True  # Must NOT be fallback
            ]
            
            all_success = all(success_checks)
            
            key_findings = []
            if all_success:
                ai_analysis = data["ai_analysis"]
                key_findings = [
                    f"Recommendation: {ai_analysis['recommendation']}",
                    f"Confidence: {ai_analysis['confidence']}%",
                    f"Score: {ai_analysis['score']}/100",
                    f"Reasoning: {ai_analysis['reasoning'][:60]}...",
                    f"Real AI Response: {'✅' if not data.get('fallback') else '❌'}"
                ]
            
            self.log_result(
                "Smart Mode Analyze Ride",
                all_success,
                {
                    "response": data,
                    "status_code": response.status_code,
                    "key_findings": key_findings,
                    "error": None if all_success else f"Validation failed: {[i for i, check in enumerate(success_checks) if not check]}"
                }
            )
            
            return all_success
            
        except Exception as e:
            self.log_result(
                "Smart Mode Analyze Ride",
                False,
                {"error": f"Exception: {str(e)}"}
            )
            return False
    
    async def test_ai_coach_suggestions(self) -> bool:
        """Test 2: POST /api/ai/coach/get-suggestions?driver_id=demo"""
        print("🧪 Testing AI Coach Suggestions API...")
        
        try:
            # Make request
            params = {"driver_id": "demo"}
            response = await self.client.post(
                f"{BACKEND_URL}/ai/coach/get-suggestions",
                params=params
            )
            
            data = response.json()
            
            # Validate response
            success_checks = [
                response.status_code == 200,
                data.get("success") is True,
                "suggestions" in data,
                isinstance(data.get("suggestions"), list),
                len(data.get("suggestions", [])) >= 4,  # Should have 4-5 suggestions
                data.get("fallback") != True  # Must NOT be fallback
            ]
            
            # Validate suggestion structure
            suggestions = data.get("suggestions", [])
            if suggestions and len(suggestions) > 0:
                first_suggestion = suggestions[0]
                suggestion_checks = [
                    "title" in first_suggestion,
                    "description" in first_suggestion,
                    "impact" in first_suggestion,
                    "icon" in first_suggestion,
                    "color" in first_suggestion,
                    "priority" in first_suggestion,
                    "category" in first_suggestion
                ]
                success_checks.extend(suggestion_checks)
            
            all_success = all(success_checks)
            
            key_findings = []
            if all_success:
                key_findings = [
                    f"Suggestions count: {len(suggestions)}",
                    f"Real AI Response: {'✅' if not data.get('fallback') else '❌'}",
                    f"Sample suggestion: {suggestions[0]['title']} - {suggestions[0]['impact']}" if suggestions else "No suggestions"
                ]
            
            self.log_result(
                "AI Coach Suggestions",
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
                "AI Coach Suggestions",
                False,
                {"error": f"Exception: {str(e)}"}
            )
            return False
    
    async def test_traffic_prediction(self) -> bool:
        """Test 3: POST /api/ai/traffic/predict"""
        print("🧪 Testing Traffic Prediction API...")
        
        try:
            # Prepare coordinates
            vic_island = TEST_DATA["coordinates"]["victoria_island"]
            ikeja = TEST_DATA["coordinates"]["ikeja"]
            
            params = {
                "origin_lat": vic_island["lat"],
                "origin_lng": vic_island["lng"], 
                "destination_lat": ikeja["lat"],
                "destination_lng": ikeja["lng"],
                "driver_id": "demo"
            }
            
            # Make request
            response = await self.client.post(
                f"{BACKEND_URL}/ai/traffic/predict",
                params=params
            )
            
            data = response.json()
            
            # Validate response
            success_checks = [
                response.status_code == 200,
                data.get("success") is True,
                "ai_analysis" in data,
                "traffic_level" in data.get("ai_analysis", {}),
                "recommendation" in data.get("ai_analysis", {}),
                "confidence" in data.get("ai_analysis", {})
            ]
            
            all_success = all(success_checks)
            
            # Check if it's real AI (not fallback with "API unavailable")
            ai_analysis = data.get("ai_analysis", {})
            factors = ai_analysis.get("factors", [])
            is_real_ai = not (data.get("fallback") is True or "API unavailable" in str(factors))
            
            key_findings = []
            if all_success:
                key_findings = [
                    f"Traffic Level: {ai_analysis.get('traffic_level', 'N/A')}",
                    f"Confidence: {ai_analysis.get('confidence', 'N/A')}%",
                    f"Recommendation: {ai_analysis.get('recommendation', 'N/A')[:50]}...",
                    f"Real AI Analysis: {'✅' if is_real_ai else '❌'}"
                ]
            
            self.log_result(
                "Traffic Prediction AI",
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
                "Traffic Prediction AI",
                False,
                {"error": f"Exception: {str(e)}"}
            )
            return False
    
    async def test_accident_risk_prediction(self) -> bool:
        """Test 4: POST /api/ai/accident/predict-risk"""
        print("🧪 Testing Accident Risk Prediction API...")
        
        try:
            # Prepare coordinates
            vic_island = TEST_DATA["coordinates"]["victoria_island"]
            
            params = {
                "driver_id": "demo",
                "current_lat": vic_island["lat"],
                "current_lng": vic_island["lng"]
            }
            
            # Make request
            response = await self.client.post(
                f"{BACKEND_URL}/ai/accident/predict-risk",
                params=params
            )
            
            data = response.json()
            
            # Validate response
            success_checks = [
                response.status_code == 200,
                data.get("success") is True,
                "risk_analysis" in data,
                "overall_risk_score" in data.get("risk_analysis", {}),
                "risk_level" in data.get("risk_analysis", {}),
                "safety_recommendations" in data.get("risk_analysis", {})
            ]
            
            all_success = all(success_checks)
            
            key_findings = []
            if all_success:
                risk_analysis = data["risk_analysis"]
                key_findings = [
                    f"Overall Risk Score: {risk_analysis.get('overall_risk_score', 'N/A')}/100",
                    f"Risk Level: {risk_analysis.get('risk_level', 'N/A')}",
                    f"Safety Recommendations: {len(risk_analysis.get('safety_recommendations', []))} items",
                    f"Real AI Response: {'✅' if not data.get('fallback') else '❌'}"
                ]
            
            self.log_result(
                "Accident Risk Prediction",
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
                "Accident Risk Prediction",
                False,
                {"error": f"Exception: {str(e)}"}
            )
            return False
    
    async def run_all_tests(self):
        """Run all AI endpoint tests"""
        print("🚀 Starting Backend AI Endpoint Tests")
        print("=" * 50)
        print(f"Backend URL: {BACKEND_URL}")
        print()
        
        # Run tests
        tests = [
            self.test_smart_mode_analyze_ride,
            self.test_ai_coach_suggestions,
            self.test_traffic_prediction,
            self.test_accident_risk_prediction
        ]
        
        results = []
        for test in tests:
            result = await test()
            results.append(result)
            await asyncio.sleep(1)  # Small delay between tests
        
        # Summary
        print("=" * 50)
        print("🎯 TEST SUMMARY")
        print("=" * 50)
        
        passed = sum(results)
        total = len(results)
        
        for i, result in enumerate(self.results):
            status = "✅ PASS" if result["success"] else "❌ FAIL"
            print(f"{status}: {result['test']}")
        
        print()
        print(f"Overall Result: {passed}/{total} tests passed")
        
        if passed == total:
            print("🎉 ALL TESTS PASSED - Emergent LLM integration working correctly!")
        else:
            print("⚠️  SOME TESTS FAILED - Check individual test results above")
        
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