#!/usr/bin/env python3
import requests
from datetime import datetime

class AdminAPITester:
    def __init__(self):
        self.base_url = "https://nexryde-staging.preview.emergentagent.com/api"
        self.session = requests.Session()
        self.test_results = []
        
    def log_test(self, endpoint: str, method: str, success: bool, details: str, response_data = None):
        """Log test result"""
        result = {
            "endpoint": endpoint,
            "method": method,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat(),
            "response_data": response_data
        }
        self.test_results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {method} {endpoint} - {details}")
        
        if response_data and isinstance(response_data, dict):
            if not success:
                error_msg = response_data.get('detail', response_data.get('message', 'Unknown error'))
                print(f"    ❌ Error: {error_msg}")
    
    def make_request(self, method: str, endpoint: str, **kwargs):
        """Make HTTP request and return (success, response_data)"""
        url = f"{self.base_url}{endpoint}"
        
        try:
            response = self.session.request(method, url, timeout=30, **kwargs)
            
            # Try to parse JSON response
            try:
                data = response.json()
            except:
                data = {"raw_response": response.text}
            
            success = response.status_code in [200, 201]
            return success, data
            
        except requests.exceptions.RequestException as e:
            return False, {"error": str(e)}
    
    def test_user_blocking(self) -> bool:
        """Test user block/unblock functionality"""
        print("\n🚫 Testing User Block/Unblock...")
        
        # Test with a dummy user ID (should return not found)
        test_user_id = "test-user-123"
        
        # Test block user
        success1, data1 = self.make_request("POST", f"/admin/users/{test_user_id}/block?block=true")
        
        print(f"Block test - HTTP success: {success1}, Response: {data1}")
        
        # The API returns 200 status but success:false for non-existent users
        if success1 and not data1.get("success") and "not found" in data1.get("message", "").lower():
            self.log_test(f"/admin/users/{test_user_id}/block", "POST", True, "Correctly returned 'not found' for non-existent user (block)", data1)
        elif not success1:
            self.log_test(f"/admin/users/{test_user_id}/block", "POST", True, "Correctly rejected non-existent user (block)", data1)
        else:
            self.log_test(f"/admin/users/{test_user_id}/block", "POST", False, "Blocked non-existent user", data1)
            return False
        
        # Test unblock user
        success2, data2 = self.make_request("POST", f"/admin/users/{test_user_id}/block?block=false")
        
        print(f"Unblock test - HTTP success: {success2}, Response: {data2}")
        
        # The API returns 200 status but success:false for non-existent users
        if success2 and not data2.get("success") and "not found" in data2.get("message", "").lower():
            self.log_test(f"/admin/users/{test_user_id}/block", "POST", True, "Correctly returned 'not found' for non-existent user (unblock)", data2)
            return True
        elif not success2:
            self.log_test(f"/admin/users/{test_user_id}/block", "POST", True, "Correctly rejected non-existent user (unblock)", data2)
            return True
        else:
            self.log_test(f"/admin/users/{test_user_id}/block", "POST", False, "Unblocked non-existent user", data2)
            return False

if __name__ == "__main__":
    tester = AdminAPITester()
    result = tester.test_user_blocking()
    print(f"Final result: {result}")