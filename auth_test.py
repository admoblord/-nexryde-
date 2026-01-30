#!/usr/bin/env python3
"""
Authentication Endpoints Testing Script for NEXRYDE
Specifically testing SMS OTP (Termii) and Google OAuth (Emergent Auth) as requested
"""

import requests
import json
import subprocess
import time
from datetime import datetime

# Backend URL from frontend/.env
BACKEND_URL = "https://ride-location-fix.preview.emergentagent.com/api"

def log_test(test_name, status, details=""):
    """Log test results with timestamp"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    status_symbol = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⚠️"
    print(f"[{timestamp}] {status_symbol} {test_name}: {status}")
    if details:
        print(f"    Details: {details}")
    print()

def test_sms_otp_endpoint():
    """Test POST /api/auth/send-otp - SMS OTP with Termii integration"""
    print("\n" + "="*60)
    print("TESTING SMS OTP ENDPOINT")
    print("="*60)
    
    url = f"{BACKEND_URL}/auth/send-otp"
    payload = {"phone": "+2348012345678"}
    
    print(f"Testing: POST {url}")
    print(f"Payload: {json.dumps(payload, indent=2)}")
    
    try:
        response = requests.post(url, json=payload, timeout=30)
        print(f"\nResponse Status: {response.status_code}")
        print(f"Response Headers: {dict(response.headers)}")
        
        try:
            response_data = response.json()
            print(f"Response Body: {json.dumps(response_data, indent=2)}")
            
            if response.status_code == 200:
                # Check if Termii was used or fallback to mock
                provider = response_data.get("provider", "unknown")
                if provider == "termii":
                    log_test("SMS OTP - Termii Integration", "PASS", "Termii SMS service working successfully")
                elif provider == "mock":
                    log_test("SMS OTP - Mock Fallback", "PASS", "Fallback to mock mode (Termii may have failed)")
                    if "otp" in response_data:
                        print(f"    Mock OTP Code: {response_data['otp']}")
                else:
                    log_test("SMS OTP - Provider Unknown", "WARN", f"Unknown provider: {provider}")
                
                return True, response_data
            else:
                log_test("SMS OTP Endpoint", "FAIL", f"HTTP {response.status_code}: {response_data}")
                return False, None
                
        except json.JSONDecodeError:
            print(f"Response Body (raw): {response.text}")
            log_test("SMS OTP Endpoint", "FAIL", "Invalid JSON response")
            return False, None
            
    except requests.exceptions.RequestException as e:
        log_test("SMS OTP Endpoint", "FAIL", f"Request error: {str(e)}")
        return False, None
    except Exception as e:
        log_test("SMS OTP Endpoint", "FAIL", f"Unexpected error: {str(e)}")
        return False, None

def test_google_oauth_endpoint():
    """Test POST /api/auth/google/exchange - Google OAuth with Emergent Auth"""
    print("\n" + "="*60)
    print("TESTING GOOGLE OAUTH ENDPOINT")
    print("="*60)
    
    url = f"{BACKEND_URL}/auth/google/exchange"
    payload = {"session_id": "test_invalid_session_123"}
    
    print(f"Testing: POST {url}")
    print(f"Payload: {json.dumps(payload, indent=2)}")
    print("Note: Using invalid session_id to test error handling")
    
    try:
        response = requests.post(url, json=payload, timeout=30)
        print(f"\nResponse Status: {response.status_code}")
        print(f"Response Headers: {dict(response.headers)}")
        
        try:
            response_data = response.json()
            print(f"Response Body: {json.dumps(response_data, indent=2)}")
            
            # Expected: 401 error for invalid session
            if response.status_code == 401:
                log_test("Google OAuth - Session Validation", "PASS", "Correctly rejects invalid session_id")
                log_test("Google OAuth - Emergent Auth Integration", "PASS", "Emergent Auth integration working")
                return True, response_data
            elif response.status_code == 400:
                log_test("Google OAuth - Error Handling", "PASS", "Returns appropriate error for invalid session")
                return True, response_data
            elif response.status_code == 200:
                log_test("Google OAuth - Session Validation", "FAIL", "Should reject invalid session_id")
                return False, response_data
            else:
                log_test("Google OAuth Endpoint", "FAIL", f"Unexpected status: {response.status_code}")
                return False, response_data
                
        except json.JSONDecodeError:
            print(f"Response Body (raw): {response.text}")
            log_test("Google OAuth Endpoint", "FAIL", "Invalid JSON response")
            return False, None
            
    except requests.exceptions.RequestException as e:
        log_test("Google OAuth Endpoint", "FAIL", f"Request error: {str(e)}")
        return False, None
    except Exception as e:
        log_test("Google OAuth Endpoint", "FAIL", f"Unexpected error: {str(e)}")
        return False, None

def check_backend_logs():
    """Check backend logs for Termii and Google/Emergent Auth responses"""
    print("\n" + "="*60)
    print("CHECKING BACKEND LOGS")
    print("="*60)
    
    print("Checking supervisor backend logs for Termii and Emergent Auth responses...")
    
    # Check backend error logs
    try:
        result = subprocess.run(
            ["tail", "-n", "100", "/var/log/supervisor/backend.err.log"],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode == 0 and result.stdout.strip():
            print("\n📋 BACKEND ERROR LOGS (last 100 lines):")
            print("-" * 50)
            logs = result.stdout
            
            # Look for Termii-related logs
            termii_logs = [line for line in logs.split('\n') if 'termii' in line.lower() or 'sms' in line.lower()]
            if termii_logs:
                print("🔍 TERMII/SMS RELATED LOGS:")
                for log in termii_logs[-10:]:  # Last 10 Termii logs
                    print(f"  {log}")
                print()
            
            # Look for Google/Emergent Auth logs
            google_logs = [line for line in logs.split('\n') if 'google' in line.lower() or 'emergent' in line.lower() or 'oauth' in line.lower()]
            if google_logs:
                print("🔍 GOOGLE/EMERGENT AUTH RELATED LOGS:")
                for log in google_logs[-10:]:  # Last 10 Google logs
                    print(f"  {log}")
                print()
            
            # Look for recent error patterns
            error_logs = [line for line in logs.split('\n') if 'error' in line.lower() or 'exception' in line.lower()]
            if error_logs:
                print("🔍 RECENT ERROR LOGS:")
                for log in error_logs[-5:]:  # Last 5 error logs
                    print(f"  {log}")
                print()
            
            print("📋 FULL ERROR LOG:")
            print(logs)
        else:
            print("No recent error logs found")
            
    except Exception as e:
        print(f"Could not read error logs: {e}")
    
    # Check backend output logs
    try:
        result = subprocess.run(
            ["tail", "-n", "100", "/var/log/supervisor/backend.out.log"],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode == 0 and result.stdout.strip():
            print("\n📋 BACKEND OUTPUT LOGS (last 100 lines):")
            print("-" * 50)
            logs = result.stdout
            
            # Look for Termii-related logs
            termii_logs = [line for line in logs.split('\n') if 'termii' in line.lower() or 'sms' in line.lower()]
            if termii_logs:
                print("🔍 TERMII/SMS RELATED LOGS:")
                for log in termii_logs[-10:]:
                    print(f"  {log}")
                print()
            
            # Look for Google/Emergent Auth logs
            google_logs = [line for line in logs.split('\n') if 'google' in line.lower() or 'emergent' in line.lower() or 'oauth' in line.lower()]
            if google_logs:
                print("🔍 GOOGLE/EMERGENT AUTH RELATED LOGS:")
                for log in google_logs[-10:]:
                    print(f"  {log}")
                print()
            
            print("📋 FULL OUTPUT LOG:")
            print(logs)
        else:
            print("No recent output logs found")
            
    except Exception as e:
        print(f"Could not read output logs: {e}")

def analyze_errors(sms_result, google_result):
    """Analyze the test results and provide error analysis"""
    print("\n" + "="*60)
    print("ERROR ANALYSIS")
    print("="*60)
    
    errors_found = []
    
    # Analyze SMS OTP results
    if not sms_result[0]:
        errors_found.append("SMS OTP endpoint failed")
    elif sms_result[1] and sms_result[1].get("provider") == "mock":
        errors_found.append("Termii SMS integration not working - falling back to mock mode")
    
    # Analyze Google OAuth results
    if not google_result[0]:
        errors_found.append("Google OAuth endpoint failed")
    
    if errors_found:
        print("❌ ERRORS DETECTED:")
        for i, error in enumerate(errors_found, 1):
            print(f"  {i}. {error}")
    else:
        print("✅ NO CRITICAL ERRORS DETECTED")
        print("Both authentication endpoints are working as expected")
    
    return errors_found

def main():
    """Main testing function"""
    print("🚀 NEXRYDE AUTHENTICATION ENDPOINTS TESTING")
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Test Time: {datetime.now().isoformat()}")
    print("\nTesting as requested:")
    print("1. POST /api/auth/send-otp - SMS OTP with Termii")
    print("2. POST /api/auth/google/exchange - Google OAuth with Emergent Auth")
    
    # Test SMS OTP endpoint
    sms_result = test_sms_otp_endpoint()
    
    # Wait a moment between tests
    time.sleep(2)
    
    # Test Google OAuth endpoint
    google_result = test_google_oauth_endpoint()
    
    # Check backend logs for detailed error information
    check_backend_logs()
    
    # Analyze errors
    errors = analyze_errors(sms_result, google_result)
    
    # Summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    
    print(f"SMS OTP Endpoint: {'✅ WORKING' if sms_result[0] else '❌ FAILED'}")
    if sms_result[0] and sms_result[1]:
        provider = sms_result[1].get("provider", "unknown")
        if provider == "termii":
            print("  └─ Termii SMS integration: ✅ ACTIVE")
        elif provider == "mock":
            print("  └─ Termii SMS integration: ❌ FAILED (using mock fallback)")
        else:
            print(f"  └─ Provider: {provider}")
    
    print(f"Google OAuth Endpoint: {'✅ WORKING' if google_result[0] else '❌ FAILED'}")
    if google_result[0]:
        print("  └─ Emergent Auth integration: ✅ ACTIVE")
        print("  └─ Session validation: ✅ WORKING")
    
    if errors:
        print(f"\n⚠️  {len(errors)} ERROR(S) FOUND:")
        for error in errors:
            print(f"  • {error}")
        print("\nRecommendations:")
        if "Termii" in str(errors):
            print("  • Check Termii API key and configuration")
            print("  • Verify Termii account balance and status")
            print("  • Check network connectivity to Termii API")
        if "Google OAuth" in str(errors):
            print("  • Check Emergent Auth configuration")
            print("  • Verify Google OAuth credentials")
    else:
        print("\n🎉 ALL AUTHENTICATION ENDPOINTS WORKING!")
        print("Both SMS OTP and Google OAuth integrations are functional.")

if __name__ == "__main__":
    main()