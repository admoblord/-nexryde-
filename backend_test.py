#!/usr/bin/env python3
"""
Backend Test Script for NEXRYDE Driver Community API
Testing Driver Community backend API endpoints as requested
"""

import asyncio
import httpx
import json
import time
import sys
from typing import Dict, Any

# Backend URL from frontend environment
BACKEND_URL = "https://smart-mode-preview.preview.emergentagent.com/api"

class BackendTester:
    def __init__(self):
        self.results = []
        self.client = httpx.AsyncClient(timeout=60.0)
        self.message_id_from_test2 = None  # Store message ID for later tests
    
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
    
    async def test_1_get_community_groups(self) -> bool:
        """Test 1: GET /api/community/groups - Should return 8 seeded groups"""
        print("🧪 Test 1: GET /api/community/groups")
        
        try:
            response = await self.client.get(f"{BACKEND_URL}/community/groups")
            data = response.json()
            
            # Expected groups from backend seed function
            expected_groups = [
                "general", "lagos-drivers", "abuja-drivers", "port-harcourt", 
                "kano-drivers", "tips-tricks", "safety-zone", "announcements"
            ]
            
            # Validate response structure
            success_checks = [
                response.status_code == 200,
                data.get("success") is True,
                "groups" in data,
                isinstance(data.get("groups"), list),
                len(data.get("groups", [])) == 8  # Should have exactly 8 groups
            ]
            
            # Validate each group has required fields
            groups = data.get("groups", [])
            group_ids = [g.get("group_id") for g in groups]
            
            if groups:
                for group in groups:
                    group_checks = [
                        "group_id" in group,
                        "name" in group,
                        "description" in group,
                        "icon" in group,
                        "color" in group,
                        "members" in group or "member_ids" in group,
                        "created_at" in group,
                        "_id" in group
                    ]
                    success_checks.extend(group_checks)
                
                # Check if all expected groups are present
                for expected_id in expected_groups:
                    if expected_id not in group_ids:
                        success_checks.append(False)
            
            all_success = all(success_checks)
            
            key_findings = []
            if all_success:
                key_findings = [
                    f"Total groups returned: {len(groups)}",
                    f"Success status: {data.get('success')}",
                    f"Groups found: {', '.join(group_ids)}",
                    f"Lagos drivers group present: {'✅' if 'lagos-drivers' in group_ids else '❌'}",
                    f"Announcements group present: {'✅' if 'announcements' in group_ids else '❌'}"
                ]
            
            self.log_result(
                "GET /api/community/groups",
                all_success,
                {
                    "response": data,
                    "status_code": response.status_code,
                    "key_findings": key_findings,
                    "error": None if all_success else f"Expected 8 groups with required fields"
                }
            )
            
            return all_success
            
        except Exception as e:
            self.log_result(
                "GET /api/community/groups",
                False,
                {"error": f"Exception: {str(e)}"}
            )
            return False

    async def test_2_post_message_emeka(self) -> bool:
        """Test 2: POST /api/community/groups/lagos-drivers/messages - Emeka's message"""
        print("🧪 Test 2: POST /api/community/groups/lagos-drivers/messages (Emeka)")
        
        try:
            message_data = {
                "user_id": "driver-emeka",
                "user_name": "Emeka O.",
                "user_role": "driver",
                "text": "Good morning Lagos drivers! Traffic heavy on Third Mainland Bridge this morning. Use Ikorodu Road instead."
            }
            
            response = await self.client.post(
                f"{BACKEND_URL}/community/groups/lagos-drivers/messages",
                json=message_data
            )
            
            data = response.json()
            
            # Validate response
            success_checks = [
                response.status_code == 200,
                data.get("success") is True,
                "message" in data,
                "_id" in data.get("message", {}),
                data.get("message", {}).get("user_id") == "driver-emeka",
                data.get("message", {}).get("user_name") == "Emeka O.",
                data.get("message", {}).get("user_role") == "driver",
                data.get("message", {}).get("group_id") == "lagos-drivers",
                "Third Mainland Bridge" in data.get("message", {}).get("text", ""),
                data.get("message", {}).get("likes") == 0,
                data.get("message", {}).get("replies") == 0
            ]
            
            all_success = all(success_checks)
            
            # Store message ID for later tests
            if all_success and "message" in data and "_id" in data["message"]:
                self.message_id_from_test2 = data["message"]["_id"]
            
            key_findings = []
            if all_success:
                key_findings = [
                    f"Message posted successfully",
                    f"Message ID: {data.get('message', {}).get('_id', 'N/A')}",
                    f"User: {data.get('message', {}).get('user_name', 'N/A')}",
                    f"Group: {data.get('message', {}).get('group_id', 'N/A')}",
                    f"Text length: {len(data.get('message', {}).get('text', ''))} characters"
                ]
            
            self.log_result(
                "POST /api/community/groups/lagos-drivers/messages (Emeka)",
                all_success,
                {
                    "response": data,
                    "status_code": response.status_code,
                    "key_findings": key_findings,
                    "error": None if all_success else f"Message creation validation failed"
                }
            )
            
            return all_success
            
        except Exception as e:
            self.log_result(
                "POST /api/community/groups/lagos-drivers/messages (Emeka)",
                False,
                {"error": f"Exception: {str(e)}"}
            )
            return False

    async def test_3_post_message_tunde(self) -> bool:
        """Test 3: POST /api/community/groups/lagos-drivers/messages - Tunde's message"""
        print("🧪 Test 3: POST /api/community/groups/lagos-drivers/messages (Tunde)")
        
        try:
            message_data = {
                "user_id": "driver-tunde",
                "user_name": "Tunde B.",
                "user_role": "driver",
                "text": "Thanks for the update bro! Any better route from Ikeja to VI?"
            }
            
            response = await self.client.post(
                f"{BACKEND_URL}/community/groups/lagos-drivers/messages",
                json=message_data
            )
            
            data = response.json()
            
            # Validate response
            success_checks = [
                response.status_code == 200,
                data.get("success") is True,
                "message" in data,
                "_id" in data.get("message", {}),
                data.get("message", {}).get("user_id") == "driver-tunde",
                data.get("message", {}).get("user_name") == "Tunde B.",
                data.get("message", {}).get("user_role") == "driver",
                data.get("message", {}).get("group_id") == "lagos-drivers",
                "Ikeja to VI" in data.get("message", {}).get("text", "")
            ]
            
            all_success = all(success_checks)
            
            key_findings = []
            if all_success:
                key_findings = [
                    f"Message posted successfully",
                    f"Message ID: {data.get('message', {}).get('_id', 'N/A')}",
                    f"User: {data.get('message', {}).get('user_name', 'N/A')}",
                    f"Group: {data.get('message', {}).get('group_id', 'N/A')}",
                    f"Text: {data.get('message', {}).get('text', 'N/A')[:50]}..."
                ]
            
            self.log_result(
                "POST /api/community/groups/lagos-drivers/messages (Tunde)",
                all_success,
                {
                    "response": data,
                    "status_code": response.status_code,
                    "key_findings": key_findings,
                    "error": None if all_success else f"Message creation validation failed"
                }
            )
            
            return all_success
            
        except Exception as e:
            self.log_result(
                "POST /api/community/groups/lagos-drivers/messages (Tunde)",
                False,
                {"error": f"Exception: {str(e)}"}
            )
            return False

    async def test_4_get_group_messages(self) -> bool:
        """Test 4: GET /api/community/groups/lagos-drivers/messages?limit=50 - Should return 2 messages"""
        print("🧪 Test 4: GET /api/community/groups/lagos-drivers/messages?limit=50")
        
        try:
            response = await self.client.get(
                f"{BACKEND_URL}/community/groups/lagos-drivers/messages?limit=50"
            )
            
            data = response.json()
            
            # Validate response
            success_checks = [
                response.status_code == 200,
                data.get("success") is True,
                "messages" in data,
                isinstance(data.get("messages"), list),
                len(data.get("messages", [])) >= 2,  # Should have at least 2 messages we posted
                data.get("group_id") == "lagos-drivers"
            ]
            
            # Validate message structure
            messages = data.get("messages", [])
            if messages and len(messages) >= 2:
                # Check for our specific messages
                emeka_found = False
                tunde_found = False
                
                for msg in messages:
                    if msg.get("user_id") == "driver-emeka" and "Third Mainland Bridge" in msg.get("text", ""):
                        emeka_found = True
                    if msg.get("user_id") == "driver-tunde" and "Ikeja to VI" in msg.get("text", ""):
                        tunde_found = True
                    
                    # Validate each message structure
                    msg_checks = [
                        "_id" in msg,
                        "user_id" in msg,
                        "user_name" in msg,
                        "user_role" in msg,
                        "text" in msg,
                        "group_id" in msg,
                        "likes" in msg,
                        "replies" in msg,
                        "created_at" in msg
                    ]
                    success_checks.extend(msg_checks)
                
                success_checks.extend([emeka_found, tunde_found])
            
            all_success = all(success_checks)
            
            key_findings = []
            if all_success:
                key_findings = [
                    f"Total messages returned: {len(messages)}",
                    f"Success status: {data.get('success')}",
                    f"Group ID: {data.get('group_id')}",
                    f"Emeka's message found: {'✅' if len(messages) >= 2 else '❌'}",
                    f"Tunde's message found: {'✅' if len(messages) >= 2 else '❌'}"
                ]
            
            self.log_result(
                "GET /api/community/groups/lagos-drivers/messages",
                all_success,
                {
                    "response": data,
                    "status_code": response.status_code,
                    "key_findings": key_findings,
                    "error": None if all_success else f"Expected 2 messages with proper structure"
                }
            )
            
            return all_success
            
        except Exception as e:
            self.log_result(
                "GET /api/community/groups/lagos-drivers/messages",
                False,
                {"error": f"Exception: {str(e)}"}
            )
            return False

    async def test_5_like_message(self) -> bool:
        """Test 5: POST /api/community/messages/{message_id}/like - Like Emeka's message"""
        print("🧪 Test 5: POST /api/community/messages/{message_id}/like")
        
        if not self.message_id_from_test2:
            self.log_result(
                "POST /api/community/messages/{message_id}/like",
                False,
                {"error": "No message ID from Test 2 - cannot test like functionality"}
            )
            return False
        
        try:
            response = await self.client.post(
                f"{BACKEND_URL}/community/messages/{self.message_id_from_test2}/like"
            )
            
            data = response.json()
            
            # Validate response
            success_checks = [
                response.status_code == 200,
                data.get("success") is True
            ]
            
            all_success = all(success_checks)
            
            key_findings = []
            if all_success:
                key_findings = [
                    f"Like added successfully",
                    f"Message ID: {self.message_id_from_test2}",
                    f"Success status: {data.get('success')}",
                    f"Response: {data}"
                ]
            
            self.log_result(
                "POST /api/community/messages/{message_id}/like",
                all_success,
                {
                    "response": data,
                    "status_code": response.status_code,
                    "key_findings": key_findings,
                    "error": None if all_success else f"Like functionality failed"
                }
            )
            
            return all_success
            
        except Exception as e:
            self.log_result(
                "POST /api/community/messages/{message_id}/like",
                False,
                {"error": f"Exception: {str(e)}"}
            )
            return False

    async def test_6_reply_to_message(self) -> bool:
        """Test 6: POST /api/community/messages/{message_id}/reply - Reply to Emeka's message"""
        print("🧪 Test 6: POST /api/community/messages/{message_id}/reply")
        
        if not self.message_id_from_test2:
            self.log_result(
                "POST /api/community/messages/{message_id}/reply",
                False,
                {"error": "No message ID from Test 2 - cannot test reply functionality"}
            )
            return False
        
        try:
            reply_data = {
                "group_id": "lagos-drivers",
                "user_id": "driver-musa",
                "user_name": "Musa A.",
                "user_role": "driver",
                "text": "Noted! Will avoid Third Mainland this morning."
            }
            
            response = await self.client.post(
                f"{BACKEND_URL}/community/messages/{self.message_id_from_test2}/reply",
                json=reply_data
            )
            
            data = response.json()
            
            # Validate response
            success_checks = [
                response.status_code == 200,
                data.get("success") is True,
                "reply" in data,
                "_id" in data.get("reply", {}),
                data.get("reply", {}).get("parent_id") == self.message_id_from_test2,
                data.get("reply", {}).get("group_id") == "lagos-drivers",
                data.get("reply", {}).get("user_id") == "driver-musa",
                data.get("reply", {}).get("user_name") == "Musa A.",
                data.get("reply", {}).get("user_role") == "driver",
                "avoid Third Mainland" in data.get("reply", {}).get("text", ""),
                data.get("reply", {}).get("is_reply") is True
            ]
            
            all_success = all(success_checks)
            
            key_findings = []
            if all_success:
                key_findings = [
                    f"Reply posted successfully",
                    f"Reply ID: {data.get('reply', {}).get('_id', 'N/A')}",
                    f"Parent ID: {data.get('reply', {}).get('parent_id', 'N/A')}",
                    f"User: {data.get('reply', {}).get('user_name', 'N/A')}",
                    f"Text: {data.get('reply', {}).get('text', 'N/A')[:40]}..."
                ]
            
            self.log_result(
                "POST /api/community/messages/{message_id}/reply",
                all_success,
                {
                    "response": data,
                    "status_code": response.status_code,
                    "key_findings": key_findings,
                    "error": None if all_success else f"Reply functionality validation failed"
                }
            )
            
            return all_success
            
        except Exception as e:
            self.log_result(
                "POST /api/community/messages/{message_id}/reply",
                False,
                {"error": f"Exception: {str(e)}"}
            )
            return False
    
    async def run_all_tests(self):
        """Run all Driver Community API tests"""
        print("🚀 Starting Driver Community Backend API Tests")
        print("=" * 60)
        print(f"Backend URL: {BACKEND_URL}")
        print("Testing 6 Community API endpoints in sequence")
        print()
        
        # Run tests in exact sequence as requested
        tests = [
            self.test_1_get_community_groups,
            self.test_2_post_message_emeka,
            self.test_3_post_message_tunde,
            self.test_4_get_group_messages,
            self.test_5_like_message,
            self.test_6_reply_to_message
        ]
        
        results = []
        for test in tests:
            result = await test()
            results.append(result)
            await asyncio.sleep(1)  # Small delay between tests
        
        # Summary
        print("=" * 60)
        print("🎯 DRIVER COMMUNITY API TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(results)
        total = len(results)
        
        for i, result in enumerate(self.results):
            status = "✅ PASS" if result["success"] else "❌ FAIL"
            print(f"{status}: {result['test']}")
        
        print()
        print(f"Overall Result: {passed}/{total} community tests passed")
        
        if passed == total:
            print("🎉 ALL DRIVER COMMUNITY API TESTS PASSED!")
            print("✅ Community groups seeded correctly (8 groups)")
            print("✅ Message posting working correctly")
            print("✅ Message retrieval functional")
            print("✅ Like functionality operational")
            print("✅ Reply functionality working")
        else:
            print("⚠️  SOME COMMUNITY API TESTS FAILED - Check individual test results above")
        
        return passed == total

async def main():
    """Main test runner for Driver Community API"""
    tester = BackendTester()
    
    try:
        success = await tester.run_all_tests()
        return 0 if success else 1
    finally:
        await tester.cleanup()

if __name__ == "__main__":
    sys.exit(asyncio.run(main()))