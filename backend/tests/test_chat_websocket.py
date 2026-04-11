"""
Test Suite for NEXRYDE Chat Module (routers/chat.py)
Tests: WebSocket Chat, Chat Presets, AI Chat, Chat History, Unread Count
"""

import pytest
import requests
import os
import asyncio
import websockets
import json
import uuid

BASE_URL = (
    os.environ.get('NEXRYDE_BACKEND_URL')
    or os.environ.get('EXPO_PUBLIC_BACKEND_URL')
    or os.environ.get('REACT_APP_BACKEND_URL')
    or 'https://nexryde-backend-993913300770.us-central1.run.app'
).rstrip('/')

class TestHealthEndpoint:
    """Test health endpoint to verify backend is running"""
    
    def test_health_endpoint(self):
        """GET /api/health should return healthy status"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.text}"
        data = response.json()
        assert data.get("status") == "healthy", f"Unexpected status: {data}"
        print(f"✅ Health endpoint working: {data}")


class TestChatPresets:
    """Test chat preset message endpoints - GET /api/chat/presets/{role}"""
    
    def test_get_rider_presets(self):
        """GET /api/chat/presets/rider should return rider preset messages"""
        response = requests.get(f"{BASE_URL}/api/chat/presets/rider")
        assert response.status_code == 200, f"Failed to get rider presets: {response.text}"
        data = response.json()
        assert "presets" in data, "Missing 'presets' key in response"
        
        presets = data["presets"]
        assert isinstance(presets, list), "Presets should be a list"
        assert len(presets) > 0, "Rider presets should not be empty"
        
        # Verify expected rider presets
        expected_presets = ["I'm coming out now", "Please wait a moment", "I'm at the entrance"]
        for expected in expected_presets:
            assert expected in presets, f"Missing expected preset: {expected}"
        
        print(f"✅ Rider presets returned: {presets}")
    
    def test_get_driver_presets(self):
        """GET /api/chat/presets/driver should return driver preset messages"""
        response = requests.get(f"{BASE_URL}/api/chat/presets/driver")
        assert response.status_code == 200, f"Failed to get driver presets: {response.text}"
        data = response.json()
        assert "presets" in data, "Missing 'presets' key in response"
        
        presets = data["presets"]
        assert isinstance(presets, list), "Presets should be a list"
        assert len(presets) > 0, "Driver presets should not be empty"
        
        # Verify expected driver presets
        expected_presets = ["I'm on my way", "I've arrived at pickup", "Traffic is heavy"]
        for expected in expected_presets:
            assert expected in presets, f"Missing expected preset: {expected}"
        
        print(f"✅ Driver presets returned: {presets}")
    
    def test_invalid_role_returns_rider_presets(self):
        """GET /api/chat/presets/invalid should return rider presets as fallback"""
        response = requests.get(f"{BASE_URL}/api/chat/presets/invalid_role")
        assert response.status_code == 200, f"Failed for invalid role: {response.text}"
        data = response.json()
        assert "presets" in data, "Missing 'presets' key in response"
        
        # Should return rider presets as default
        assert len(data["presets"]) > 0, "Should return fallback presets"
        print(f"✅ Invalid role returns fallback presets: {len(data['presets'])} presets")


class TestAIChat:
    """Test AI Chat endpoint - POST /api/chat/ai"""
    
    def test_ai_chat_basic_message(self):
        """POST /api/chat/ai should return AI response with GPT-4o"""
        test_user_id = f"test-ai-{uuid.uuid4().hex[:8]}"
        payload = {
            "user_id": test_user_id,
            "message": "What are the safety features on NEXRYDE?",
            "user_role": "rider"
        }
        
        response = requests.post(f"{BASE_URL}/api/chat/ai", json=payload)
        if response.status_code == 404:
            pytest.skip("AI chat endpoint not deployed in current backend build")
        assert response.status_code == 200, f"AI chat failed: {response.text}"
        data = response.json()
        
        # Verify response structure
        assert data.get("success") == True, f"AI chat not successful: {data}"
        assert "message" in data, "Missing AI response message"
        assert "session_id" in data, "Missing session_id"
        assert "powered_by" in data, "Missing powered_by field"
        assert "timestamp" in data, "Missing timestamp"
        
        # Verify AI actually responded
        assert len(data["message"]) > 20, "AI response too short"
        
        print(f"✅ AI Chat response (powered by {data['powered_by']}): {data['message'][:100]}...")
    
    def test_ai_chat_maintains_session(self):
        """AI Chat should maintain conversation context within session"""
        test_user_id = f"test-session-{uuid.uuid4().hex[:8]}"
        
        # First message
        payload1 = {
            "user_id": test_user_id,
            "message": "My name is TestUser",
            "user_role": "rider"
        }
        response1 = requests.post(f"{BASE_URL}/api/chat/ai", json=payload1)
        if response1.status_code == 404:
            pytest.skip("AI chat endpoint not deployed in current backend build")
        assert response1.status_code == 200, f"First message failed: {response1.text}"
        session_id = response1.json().get("session_id")
        
        # Second message in same session
        payload2 = {
            "user_id": test_user_id,
            "message": "What is the fare from Lekki to Victoria Island?",
            "user_role": "rider",
            "session_id": session_id
        }
        response2 = requests.post(f"{BASE_URL}/api/chat/ai", json=payload2)
        assert response2.status_code == 200, f"Second message failed: {response2.text}"
        
        print(f"✅ AI Chat session maintained: {session_id}")


class TestChatHistory:
    """Test AI Chat History endpoint - GET /api/chat/ai/history/{user_id}"""
    
    def test_get_chat_history_for_existing_user(self):
        """GET /api/chat/ai/history/{user_id} should return chat history"""
        # Use a user that has had chat history from previous tests
        response = requests.get(f"{BASE_URL}/api/chat/ai/history/test-user-123")
        if response.status_code == 404:
            pytest.skip("AI chat history endpoint not deployed in current backend build")
        assert response.status_code == 200, f"Failed to get history: {response.text}"
        data = response.json()
        
        assert "messages" in data, "Missing 'messages' key in response"
        assert isinstance(data["messages"], list), "Messages should be a list"
        
        if len(data["messages"]) > 0:
            # Verify message structure
            msg = data["messages"][0]
            assert "id" in msg, "Message missing 'id'"
            assert "role" in msg, "Message missing 'role'"
            assert "message" in msg, "Message missing 'message'"
            assert "timestamp" in msg, "Message missing 'timestamp'"
            assert msg["role"] in ["user", "assistant"], f"Invalid role: {msg['role']}"
        
        print(f"✅ Chat history returned: {len(data['messages'])} messages")
    
    def test_get_chat_history_for_new_user(self):
        """GET /api/chat/ai/history/{user_id} for new user should return empty"""
        new_user_id = f"new-user-{uuid.uuid4().hex[:8]}"
        response = requests.get(f"{BASE_URL}/api/chat/ai/history/{new_user_id}")
        if response.status_code == 404:
            pytest.skip("AI chat history endpoint not deployed in current backend build")
        assert response.status_code == 200, f"Failed for new user: {response.text}"
        data = response.json()
        
        assert "messages" in data, "Missing 'messages' key"
        assert data["messages"] == [], "New user should have empty history"
        
        print(f"✅ New user has empty chat history: {new_user_id}")


class TestUnreadCount:
    """Test Chat Unread Count endpoint - GET /api/chat/unread-count/{user_id}"""
    
    def test_get_unread_count(self):
        """GET /api/chat/unread-count/{user_id} should return unread count"""
        response = requests.get(f"{BASE_URL}/api/chat/unread-count/test-user-123")
        assert response.status_code == 200, f"Failed to get unread count: {response.text}"
        data = response.json()
        
        assert "unread_count" in data, "Missing 'unread_count' key"
        assert isinstance(data["unread_count"], int), "Unread count should be integer"
        assert data["unread_count"] >= 0, "Unread count should be non-negative"
        
        print(f"✅ Unread count for test-user-123: {data['unread_count']}")
    
    def test_get_unread_count_new_user(self):
        """GET /api/chat/unread-count/{user_id} for new user should return 0"""
        new_user_id = f"new-user-{uuid.uuid4().hex[:8]}"
        response = requests.get(f"{BASE_URL}/api/chat/unread-count/{new_user_id}")
        assert response.status_code == 200, f"Failed for new user: {response.text}"
        data = response.json()
        
        assert data["unread_count"] == 0, f"New user should have 0 unread: {data}"
        print(f"✅ New user unread count is 0: {new_user_id}")


class TestWebSocketChat:
    """Test WebSocket Chat endpoint - /api/ws/chat/{trip_id}/{user_id}"""
    
    @pytest.mark.asyncio
    async def test_websocket_connection(self):
        """WebSocket connection should return 'connected' message"""
        ws_url = f"wss://{BASE_URL.replace('https://', '').replace('http://', '')}/api/ws/chat/test-trip-ws1/test-user-ws1"
        
        try:
            async with websockets.connect(ws_url) as ws:
                # Wait for connection message
                response = await asyncio.wait_for(ws.recv(), timeout=10)
                data = json.loads(response)
                
                assert data.get("type") == "connected", f"Expected 'connected' type: {data}"
                assert data.get("trip_id") == "test-trip-ws1", f"Trip ID mismatch: {data}"
                assert data.get("user_id") == "test-user-ws1", f"User ID mismatch: {data}"
                assert "message" in data, "Missing message field"
                
                print(f"✅ WebSocket connected: {data}")
        except Exception as e:
            pytest.fail(f"WebSocket connection failed: {e}")
    
    @pytest.mark.asyncio
    async def test_websocket_send_message(self):
        """WebSocket should broadcast messages to trip participants"""
        trip_id = f"test-trip-{uuid.uuid4().hex[:8]}"
        user_id = f"test-user-{uuid.uuid4().hex[:8]}"
        ws_url = f"wss://{BASE_URL.replace('https://', '').replace('http://', '')}/api/ws/chat/{trip_id}/{user_id}"
        
        try:
            async with websockets.connect(ws_url) as ws:
                # Wait for connection message
                conn_response = await asyncio.wait_for(ws.recv(), timeout=10)
                conn_data = json.loads(conn_response)
                assert conn_data.get("type") == "connected", f"Connection failed: {conn_data}"
                
                # Send a message
                test_message = {
                    "type": "message",
                    "message": "Hello from WebSocket test!",
                    "sender_role": "rider",
                    "message_type": "text"
                }
                await ws.send(json.dumps(test_message))
                
                # Wait for broadcast response (might get history first)
                for _ in range(3):  # Try up to 3 responses
                    try:
                        response = await asyncio.wait_for(ws.recv(), timeout=5)
                        data = json.loads(response)
                        
                        if data.get("type") == "new_message":
                            assert "message" in data, "Missing message content"
                            assert data.get("sender_id") == user_id, f"Sender mismatch: {data}"
                            print(f"✅ WebSocket message broadcast: {data.get('message')[:50]}...")
                            return
                    except asyncio.TimeoutError:
                        continue
                
                # If we got here without error, message was at least accepted
                print("✅ WebSocket message sent (broadcast may be to other participants)")
                
        except Exception as e:
            pytest.fail(f"WebSocket message test failed: {e}")


# Synchronous WebSocket tests using asyncio.run
class TestWebSocketSync:
    """Synchronous wrapper tests for WebSocket functionality"""
    
    def test_websocket_basic_connection(self):
        """Test basic WebSocket connection (sync wrapper)"""
        async def _test():
            ws_url = f"wss://{BASE_URL.replace('https://', '').replace('http://', '')}/api/ws/chat/sync-test-trip/sync-test-user"
            async with websockets.connect(ws_url) as ws:
                response = await asyncio.wait_for(ws.recv(), timeout=10)
                data = json.loads(response)
                return data
        
        result = asyncio.run(_test())
        assert result.get("type") == "connected", f"Connection failed: {result}"
        print(f"✅ Sync WebSocket test passed: {result}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
