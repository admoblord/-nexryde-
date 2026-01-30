#!/usr/bin/env python3
"""
NEXRYDE Driver Verification API Testing
Focus on testing the NEW driver verification endpoints mentioned in review request
"""

import requests
import json
import base64
from datetime import datetime
import uuid

# Backend URL
BASE_URL = "https://rideapp-admin-1.preview.emergentagent.com/api"

# Test user IDs from review request
EXISTING_DRIVER_ID = "c22684e5-b52a-46a8-9420-a6ee07679859"
EXISTING_USER_ID = "1955b969-e7eb-493c-b181-0920c673b8e6"

class DriverVerificationTester:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'Content-Type': 'application/json',
            'User-Agent': 'NEXRYDE-Driver-Verification-Test/1.0'
        })
        
    def log_result(self, test_name, success, response_data=None, error=None):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        
        if success and response_data:
            print(f"   Response: {json.dumps(response_data, indent=2)[:300]}...")
        elif error:
            print(f"   Error: {error}")
        print()
    
    def test_driver_verification_submit(self):
        """Test POST /api/drivers/verification/submit - Submit driver documents for AI verification"""
        print("🔍 Testing Driver Document Verification Submission")
        
        # Create sample base64 image (1x1 pixel PNG)
        sample_image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
        
        verification_data = {
            "user_id": EXISTING_DRIVER_ID,
            "personal_info": {
                "fullName": "John Doe Driver",
                "phone": "+2348012345678",
                "email": "driver@nexryde.com",
                "address": "123 Lagos Street, Victoria Island, Lagos",
                "dateOfBirth": "1990-01-01"
            },
            "vehicle_info": {
                "vehicleMake": "Toyota",
                "vehicleModel": "Camry",
                "vehicleYear": "2020",
                "vehicleColor": "Black",
                "plateNumber": "ABC-123-XY"
            },
            "documents": {
                "nin": sample_image,
                "drivers_license": sample_image,
                "passport_photo": sample_image,
                "vehicle_registration": sample_image,
                "insurance": sample_image
            }
        }
        
        try:
            response = self.session.post(
                f"{BASE_URL}/drivers/verification/submit",
                json=verification_data,
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                self.log_result("Driver Verification Submit", True, data)
                return data.get('verification_id')
            else:
                error_msg = f"Status {response.status_code}"
                try:
                    error_data = response.json()
                    error_msg += f" - {error_data.get('detail', 'Unknown error')}"
                except:
                    error_msg += f" - {response.text}"
                
                self.log_result("Driver Verification Submit", False, error=error_msg)
                return None
                
        except Exception as e:
            self.log_result("Driver Verification Submit", False, error=str(e))
            return None
    
    def test_driver_verification_status(self, user_id):
        """Test GET /api/drivers/verification/{user_id} - Get verification status"""
        print(f"📋 Testing Get Verification Status for {user_id}")
        
        try:
            response = self.session.get(
                f"{BASE_URL}/drivers/verification/{user_id}",
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                self.log_result("Get Verification Status", True, data)
                return data
            else:
                error_msg = f"Status {response.status_code}"
                try:
                    error_data = response.json()
                    error_msg += f" - {error_data.get('detail', 'Unknown error')}"
                except:
                    error_msg += f" - {response.text}"
                
                self.log_result("Get Verification Status", False, error=error_msg)
                return None
                
        except Exception as e:
            self.log_result("Get Verification Status", False, error=str(e))
            return None
    
    def test_admin_verifications_list(self):
        """Test GET /api/admin/verifications - Admin list all verifications"""
        print("👨‍💼 Testing Admin List All Verifications")
        
        try:
            response = self.session.get(
                f"{BASE_URL}/admin/verifications",
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                self.log_result("Admin List Verifications", True, data)
                return data
            else:
                error_msg = f"Status {response.status_code}"
                try:
                    error_data = response.json()
                    error_msg += f" - {error_data.get('detail', 'Unknown error')}"
                except:
                    error_msg += f" - {response.text}"
                
                self.log_result("Admin List Verifications", False, error=error_msg)
                return None
                
        except Exception as e:
            self.log_result("Admin List Verifications", False, error=str(e))
            return None
    
    def test_admin_approve_verification(self, verification_id):
        """Test POST /api/admin/verifications/{id}/approve - Admin approve"""
        print(f"✅ Testing Admin Approve Verification {verification_id}")
        
        approval_data = {
            "notes": "All documents verified successfully. Driver approved for NEXRYDE platform."
        }
        
        try:
            response = self.session.post(
                f"{BASE_URL}/admin/verifications/{verification_id}/approve",
                json=approval_data,
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                self.log_result("Admin Approve Verification", True, data)
                return data
            else:
                error_msg = f"Status {response.status_code}"
                try:
                    error_data = response.json()
                    error_msg += f" - {error_data.get('detail', 'Unknown error')}"
                except:
                    error_msg += f" - {response.text}"
                
                self.log_result("Admin Approve Verification", False, error=error_msg)
                return None
                
        except Exception as e:
            self.log_result("Admin Approve Verification", False, error=str(e))
            return None
    
    def test_admin_reject_verification(self, verification_id):
        """Test POST /api/admin/verifications/{id}/reject - Admin reject"""
        print(f"❌ Testing Admin Reject Verification {verification_id}")
        
        rejection_data = {
            "reason": "Documents are not clear enough for verification",
            "notes": "Please resubmit with clearer images of NIN and driver's license."
        }
        
        try:
            response = self.session.post(
                f"{BASE_URL}/admin/verifications/{verification_id}/reject",
                json=rejection_data,
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                self.log_result("Admin Reject Verification", True, data)
                return data
            else:
                error_msg = f"Status {response.status_code}"
                try:
                    error_data = response.json()
                    error_msg += f" - {error_data.get('detail', 'Unknown error')}"
                except:
                    error_msg += f" - {response.text}"
                
                self.log_result("Admin Reject Verification", False, error=error_msg)
                return None
                
        except Exception as e:
            self.log_result("Admin Reject Verification", False, error=str(e))
            return None
    
    def test_user_notifications(self, user_id):
        """Test GET /api/users/{user_id}/notifications - Get notifications"""
        print(f"🔔 Testing Get User Notifications for {user_id}")
        
        try:
            response = self.session.get(
                f"{BASE_URL}/users/{user_id}/notifications",
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                self.log_result("Get User Notifications", True, data)
                return data
            else:
                error_msg = f"Status {response.status_code}"
                try:
                    error_data = response.json()
                    error_msg += f" - {error_data.get('detail', 'Unknown error')}"
                except:
                    error_msg += f" - {response.text}"
                
                self.log_result("Get User Notifications", False, error=error_msg)
                return None
                
        except Exception as e:
            self.log_result("Get User Notifications", False, error=str(e))
            return None
    
    def test_subscription_config(self):
        """Test GET /api/subscriptions/config - Get subscription config"""
        print("💳 Testing Get Subscription Config")
        
        try:
            response = self.session.get(
                f"{BASE_URL}/subscriptions/config",
                timeout=30
            )
            
            if response.status_code == 200:
                data = response.json()
                self.log_result("Get Subscription Config", True, data)
                return data
            else:
                error_msg = f"Status {response.status_code}"
                try:
                    error_data = response.json()
                    error_msg += f" - {error_data.get('detail', 'Unknown error')}"
                except:
                    error_msg += f" - {response.text}"
                
                self.log_result("Get Subscription Config", False, error=error_msg)
                return None
                
        except Exception as e:
            self.log_result("Get Subscription Config", False, error=str(e))
            return None
    
    def run_driver_verification_tests(self):
        """Run all driver verification tests"""
        print("🚀 NEXRYDE DRIVER VERIFICATION API TESTING")
        print("=" * 60)
        print(f"Backend URL: {BASE_URL}")
        print(f"Test Driver ID: {EXISTING_DRIVER_ID}")
        print(f"Test User ID: {EXISTING_USER_ID}")
        print("=" * 60)
        print()
        
        # Test subscription config first
        config_data = self.test_subscription_config()
        
        # Test driver verification submission
        verification_id = self.test_driver_verification_submit()
        
        # Test get verification status
        status_data = self.test_driver_verification_status(EXISTING_DRIVER_ID)
        
        # Test admin list verifications
        verifications_list = self.test_admin_verifications_list()
        
        # Get a verification ID from the list if we don't have one
        if not verification_id and verifications_list and 'verifications' in verifications_list:
            verifications = verifications_list['verifications']
            if verifications:
                verification_id = verifications[0].get('id')
                print(f"📝 Using existing verification ID: {verification_id}")
        
        # Test admin approve/reject with dummy ID if no real ID available
        test_verification_id = verification_id or str(uuid.uuid4())
        
        # Test admin approve
        self.test_admin_approve_verification(test_verification_id)
        
        # Test admin reject (with different dummy ID)
        self.test_admin_reject_verification(str(uuid.uuid4()))
        
        # Test user notifications
        self.test_user_notifications(EXISTING_DRIVER_ID)
        self.test_user_notifications(EXISTING_USER_ID)
        
        print("=" * 60)
        print("🎯 DRIVER VERIFICATION TESTING COMPLETE")
        print("=" * 60)

if __name__ == "__main__":
    tester = DriverVerificationTester()
    tester.run_driver_verification_tests()