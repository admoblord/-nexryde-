#!/usr/bin/env python3
"""
Quick fix test for failing endpoints
"""

import requests
import json

BACKEND_URL = "https://nexryde-test.preview.emergentagent.com/api"

def test_otp_verify():
    """Test OTP verify with correct field name"""
    data = {"phone": "+2348108899392", "otp": "123456"}  # Changed from 'code' to 'otp'
    response = requests.post(f"{BACKEND_URL}/auth/verify-otp", json=data)
    print(f"OTP Verify: {response.status_code} - {response.json()}")

def test_sos_trigger():
    """Test SOS trigger with correct format"""
    data = {
        "trip_id": "test-trip-123",
        "location_lat": 6.4281,
        "location_lng": 3.4219,
        "auto_triggered": False
    }
    response = requests.post(f"{BACKEND_URL}/sos/trigger", json=data)
    print(f"SOS Trigger: {response.status_code} - {response.json()}")

def test_promo_apply():
    """Test promo apply with different code"""
    params = {"rider_id": "test-user-123", "code": "WELCOME10"}
    response = requests.post(f"{BACKEND_URL}/promo/apply", params=params)
    print(f"Promo Apply: {response.status_code} - {response.json()}")

if __name__ == "__main__":
    print("Testing failing endpoints with corrected formats...")
    test_otp_verify()
    test_sos_trigger()
    test_promo_apply()