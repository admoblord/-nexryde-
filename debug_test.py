#!/usr/bin/env python3
import requests

def test_user_blocking():
    base_url = "https://nexryde-staging.preview.emergentagent.com/api"
    test_user_id = "test-user-123"
    
    # Test unblock user
    response = requests.post(f"{base_url}/admin/users/{test_user_id}/block?block=false")
    success = response.status_code in [200, 201]
    data = response.json()
    
    print(f"Status code: {response.status_code}")
    print(f"Success (HTTP): {success}")
    print(f"Response data: {data}")
    print(f"Success field: {data.get('success')}")
    print(f"Message: {data.get('message')}")
    print(f"Not found check: {'not found' in data.get('message', '').lower()}")
    
    # Check the condition
    condition1 = success and not data.get("success") and "not found" in data.get("message", "").lower()
    condition2 = not success
    
    print(f"Condition 1 (success and not data.success and 'not found' in message): {condition1}")
    print(f"Condition 2 (not success): {condition2}")
    
    if condition1:
        print("✅ Should PASS: Correctly returned 'not found' for non-existent user")
        return True
    elif condition2:
        print("✅ Should PASS: Correctly rejected non-existent user")
        return True
    else:
        print("❌ Should FAIL: Unblocked non-existent user")
        return False

if __name__ == "__main__":
    result = test_user_blocking()
    print(f"Final result: {result}")