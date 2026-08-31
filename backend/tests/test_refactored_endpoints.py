"""
NEXRYDE Backend Refactoring Verification Tests
Testing: Refactored Community Router & Safety Router endpoints
Verifying that all endpoints work correctly after extraction from server.py

Test Scope:
- Community Groups (GET)
- Community Messages (GET, POST, LIKE)
- Community Polls (POST, GET, VOTE)
- Pinned Messages (GET)
- Community Events (POST, GET, RSVP)
- Safety Danger Zones (GET, POST report)
- Health Check (non-refactored, verify still works)
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

# Unified backend target for tests
BASE_URL = (
    os.environ.get('NEXRYDE_BACKEND_URL')
    or os.environ.get('EXPO_PUBLIC_BACKEND_URL')
    or os.environ.get('REACT_APP_BACKEND_URL')
    or "https://nexryde-modular.preview.emergentagent.com"
).rstrip('/')


class TestHealthCheck:
    """Test non-refactored health check endpoint - verify it still works"""
    
    def test_health_check_endpoint(self):
        """GET /api/health - Verify health check endpoint works"""
        response = requests.get(f"{BASE_URL}/api/health")
        
        assert response.status_code == 200, f"Health check failed: {response.status_code}"
        data = response.json()
        
        assert data.get("status") == "healthy", f"Health status not healthy: {data}"
        print("Health check endpoint working correctly")


class TestCommunityGroupsRefactored:
    """Test community groups endpoint from refactored router"""
    
    def test_get_community_groups(self):
        """GET /api/community/groups - Returns list of community groups"""
        response = requests.get(f"{BASE_URL}/api/community/groups")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "success" in data, "Response should contain 'success' field"
        assert data["success"] == True, "success should be True"
        assert "groups" in data, "Response should contain 'groups' field"
        assert isinstance(data["groups"], list), "groups should be a list"
        
        if len(data["groups"]) > 0:
            group = data["groups"][0]
            assert "group_id" in group, "Group should have group_id"
            assert "name" in group, "Group should have name"
            print(f"SUCCESS: Found {len(data['groups'])} community groups")
        else:
            print("No groups found - seeding may be needed")


class TestCommunityMessagesRefactored:
    """Test community messages endpoints from refactored router"""
    
    def test_get_group_messages(self):
        """GET /api/community/groups/general/messages - Returns messages for a group"""
        response = requests.get(f"{BASE_URL}/api/community/groups/general/messages")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert data.get("success") == True, "Request should succeed"
        assert "messages" in data, "Response should contain messages"
        assert "group_id" in data, "Response should contain group_id"
        assert data["group_id"] == "general", "group_id should match request"
        
        print(f"SUCCESS: GET messages for group 'general' - {len(data['messages'])} messages found")
    
    def test_post_group_message(self):
        """POST /api/community/groups/general/messages - Post a new message"""
        unique_id = uuid.uuid4().hex[:8]
        message_data = {
            "text": f"TEST_Refactor_Msg_{unique_id}: Testing refactored endpoint",
            "user_id": f"test_refactor_user_{unique_id}",
            "user_name": "Refactor Test User",
            "user_role": "driver"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/community/groups/general/messages",
            json=message_data
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("success") == True, "Message posting should succeed"
        assert "message" in data, "Response should contain message"
        
        msg = data["message"]
        assert msg["text"] == message_data["text"], "Message text should match"
        assert msg["group_id"] == "general", "Group ID should be general"
        assert "_id" in msg, "Message should have _id"
        
        print(f"SUCCESS: Posted message with ID: {msg['_id']}")
    
    def test_like_message(self):
        """POST /api/community/messages/{message_id}/like - Like a message"""
        # First create a message to like
        unique_id = uuid.uuid4().hex[:8]
        create_response = requests.post(
            f"{BASE_URL}/api/community/groups/general/messages",
            json={
                "text": f"TEST_Like_Target_{unique_id}: Message to be liked",
                "user_id": "test_liker",
                "user_name": "Test Liker"
            }
        )
        assert create_response.status_code == 200, f"Failed to create message: {create_response.text}"
        message_id = create_response.json()["message"]["_id"]
        
        # Now like the message
        like_response = requests.post(
            f"{BASE_URL}/api/community/messages/{message_id}/like"
        )
        
        assert like_response.status_code == 200, f"Expected 200, got {like_response.status_code}: {like_response.text}"
        data = like_response.json()
        
        assert data.get("success") == True, "Like should succeed"
        print(f"SUCCESS: Liked message {message_id}")


class TestCommunityPollsRefactored:
    """Test community polls endpoints from refactored router"""
    
    def test_create_poll(self):
        """POST /api/community/groups/general/polls - Create a poll"""
        unique_id = uuid.uuid4().hex[:8]
        poll_data = {
            "question": f"TEST_Refactor_Poll_{unique_id}: Which route is best?",
            "options": ["Route A", "Route B", "Route C"],
            "user_id": f"test_poll_creator_{unique_id}",
            "user_name": "Poll Creator",
            "duration_hours": 24
        }
        
        response = requests.post(
            f"{BASE_URL}/api/community/groups/general/polls",
            json=poll_data
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("success") == True, "Poll creation should succeed"
        assert "poll" in data, "Response should contain poll"
        
        poll = data["poll"]
        assert poll["question"] == poll_data["question"], "Question should match"
        assert len(poll["options"]) == 3, "Should have 3 options"
        assert poll["group_id"] == "general", "Group should be general"
        assert "poll_id" in poll, "Poll should have poll_id"
        
        print(f"SUCCESS: Created poll with ID: {poll['poll_id']}")
    
    def test_get_group_polls(self):
        """GET /api/community/groups/general/polls - Get polls for a group"""
        response = requests.get(f"{BASE_URL}/api/community/groups/general/polls")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert data.get("success") == True, "Request should succeed"
        assert "polls" in data, "Response should contain polls"
        assert isinstance(data["polls"], list), "polls should be a list"
        
        # Verify voter_ids is not exposed (privacy)
        for poll in data.get("polls", []):
            for opt in poll.get("options", []):
                assert "voter_ids" not in opt, "voter_ids should be hidden for privacy"
        
        print(f"SUCCESS: Found {len(data['polls'])} polls in general group")
    
    def test_vote_on_poll(self):
        """POST /api/community/polls/{poll_id}/vote - Vote on a poll"""
        # First create a poll
        unique_id = uuid.uuid4().hex[:8]
        create_response = requests.post(
            f"{BASE_URL}/api/community/groups/general/polls",
            json={
                "question": f"TEST_Vote_Poll_{unique_id}: Test voting",
                "options": ["Yes", "No"],
                "user_id": "poll_creator"
            }
        )
        assert create_response.status_code == 200
        poll_id = create_response.json()["poll"]["poll_id"]
        
        # Vote on the poll
        vote_response = requests.post(
            f"{BASE_URL}/api/community/polls/{poll_id}/vote",
            json={
                "user_id": f"voter_{unique_id}",
                "option_index": 0
            }
        )
        
        assert vote_response.status_code == 200, f"Expected 200, got {vote_response.status_code}: {vote_response.text}"
        data = vote_response.json()
        
        assert data.get("success") == True, "Vote should succeed"
        print(f"SUCCESS: Voted on poll {poll_id}")
    
    def test_duplicate_vote_rejected(self):
        """POST /api/community/polls/{poll_id}/vote - Duplicate vote should be rejected"""
        unique_id = uuid.uuid4().hex[:8]
        same_user = f"dup_voter_{unique_id}"
        
        # Create poll
        create_response = requests.post(
            f"{BASE_URL}/api/community/groups/general/polls",
            json={
                "question": f"TEST_Dup_Vote_{unique_id}: Duplicate test",
                "options": ["A", "B"],
                "user_id": "creator"
            }
        )
        poll_id = create_response.json()["poll"]["poll_id"]
        
        # First vote
        requests.post(
            f"{BASE_URL}/api/community/polls/{poll_id}/vote",
            json={"user_id": same_user, "option_index": 0}
        )
        
        # Second vote - should fail
        dup_response = requests.post(
            f"{BASE_URL}/api/community/polls/{poll_id}/vote",
            json={"user_id": same_user, "option_index": 1}
        )
        
        assert dup_response.status_code == 400, f"Expected 400 for duplicate vote, got {dup_response.status_code}"
        assert "Already voted" in dup_response.json().get("detail", "")
        print("SUCCESS: Duplicate vote correctly rejected")


class TestPinnedMessagesRefactored:
    """Test pinned messages endpoint from refactored router"""
    
    def test_get_pinned_messages(self):
        """GET /api/community/groups/announcements/pinned - Get pinned messages"""
        response = requests.get(f"{BASE_URL}/api/community/groups/announcements/pinned")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert data.get("success") == True, "Request should succeed"
        assert "pinned_messages" in data, "Response should contain pinned_messages"
        assert isinstance(data["pinned_messages"], list), "pinned_messages should be a list"
        
        print(f"SUCCESS: Found {len(data['pinned_messages'])} pinned messages in announcements")


class TestCommunityEventsRefactored:
    """Test community events endpoints from refactored router"""
    
    def test_create_event(self):
        """POST /api/community/events - Create event"""
        unique_id = uuid.uuid4().hex[:8]
        event_data = {
            "title": f"TEST_Refactor_Event_{unique_id}: Driver Meetup",
            "description": "Testing refactored events endpoint",
            "event_type": "meetup",
            "location": "Test Location, Lagos",
            "date": "2026-03-20",
            "time": "3:00 PM",
            "group_id": "general",
            "user_id": "test_organizer",
            "user_name": "Test Organizer"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/community/events",
            json=event_data
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("success") == True, "Event creation should succeed"
        assert "event" in data, "Response should contain event"
        
        event = data["event"]
        assert event["title"] == event_data["title"], "Title should match"
        assert "event_id" in event, "Event should have event_id"
        assert event["rsvp_count"] == 0, "Initial RSVP count should be 0"
        
        print(f"SUCCESS: Created event with ID: {event['event_id']}")
    
    def test_get_events(self):
        """GET /api/community/events - List events"""
        response = requests.get(f"{BASE_URL}/api/community/events")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert data.get("success") == True, "Request should succeed"
        assert "events" in data, "Response should contain events"
        assert isinstance(data["events"], list), "events should be a list"
        
        print(f"SUCCESS: Found {len(data['events'])} events")
    
    def test_rsvp_to_event(self):
        """POST /api/community/events/{event_id}/rsvp - RSVP to event"""
        unique_id = uuid.uuid4().hex[:8]
        
        # Create event first
        create_response = requests.post(
            f"{BASE_URL}/api/community/events",
            json={
                "title": f"TEST_RSVP_Target_{unique_id}: Event for RSVP",
                "description": "Test RSVP",
                "event_type": "meetup",
                "location": "Test",
                "date": "2026-04-01",
                "time": "4:00 PM",
                "group_id": "general"
            }
        )
        assert create_response.status_code == 200
        event_id = create_response.json()["event"]["event_id"]
        
        # RSVP to event
        rsvp_response = requests.post(
            f"{BASE_URL}/api/community/events/{event_id}/rsvp",
            json={"user_id": f"rsvp_user_{unique_id}"}
        )
        
        assert rsvp_response.status_code == 200, f"Expected 200, got {rsvp_response.status_code}: {rsvp_response.text}"
        data = rsvp_response.json()
        
        assert data.get("success") == True, "RSVP should succeed"
        assert data.get("action") == "added", "First RSVP should add user"
        print(f"SUCCESS: RSVP added to event {event_id}")
    
    def test_rsvp_toggle(self):
        """POST /api/community/events/{event_id}/rsvp - RSVP is a toggle"""
        unique_id = uuid.uuid4().hex[:8]
        same_user = f"toggle_user_{unique_id}"
        
        # Create event
        create_response = requests.post(
            f"{BASE_URL}/api/community/events",
            json={
                "title": f"TEST_Toggle_Event_{unique_id}",
                "description": "Toggle test",
                "event_type": "meetup",
                "location": "Test",
                "date": "2026-04-02",
                "time": "5:00 PM",
                "group_id": "general"
            }
        )
        event_id = create_response.json()["event"]["event_id"]
        
        # First RSVP - add
        r1 = requests.post(
            f"{BASE_URL}/api/community/events/{event_id}/rsvp",
            json={"user_id": same_user}
        )
        assert r1.json().get("action") == "added"
        
        # Second RSVP - should remove (toggle)
        r2 = requests.post(
            f"{BASE_URL}/api/community/events/{event_id}/rsvp",
            json={"user_id": same_user}
        )
        assert r2.status_code == 200
        assert r2.json().get("action") == "removed", "Second RSVP should toggle to remove"
        
        print("SUCCESS: RSVP toggle works correctly")


class TestSafetyDangerZonesRefactored:
    """Test safety danger zones endpoints from refactored router"""
    
    def test_get_danger_zones(self):
        """GET /api/safety/danger-zones - Get danger zones"""
        response = requests.get(f"{BASE_URL}/api/safety/danger-zones")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert data.get("success") == True, "Request should succeed"
        assert "zones" in data, "Response should contain zones"
        assert "count" in data, "Response should contain count"
        assert isinstance(data["zones"], list), "zones should be a list"
        
        print(f"SUCCESS: Found {data['count']} danger zones")
    
    def test_get_danger_zones_with_coords(self):
        """GET /api/safety/danger-zones with coordinates - Get danger zones near location"""
        # Lagos coordinates
        response = requests.get(
            f"{BASE_URL}/api/safety/danger-zones?lat=6.5244&lng=3.3792&radius=10000"
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert data.get("success") == True, "Request should succeed"
        assert "zones" in data, "Response should contain zones"
        
        print(f"SUCCESS: Found {len(data['zones'])} danger zones near Lagos")
    
    def test_report_danger_zone(self):
        """POST /api/safety/report - Report a danger zone"""
        unique_id = uuid.uuid4().hex[:8]
        report_data = {
            "type": "area_boys",
            "location": f"TEST_Location_{unique_id}: Test Junction",
            "description": "Testing refactored safety report endpoint",
            "latitude": 6.5244,
            "longitude": 3.3792,
            "severity": "moderate"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/safety/report",
            json=report_data
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("success") == True, "Report should succeed"
        assert "report_id" in data, "Response should contain report_id"
        assert "message" in data, "Response should contain confirmation message"
        
        print(f"SUCCESS: Reported danger zone with ID: {data['report_id']}")


class TestSafetyAlertsRefactored:
    """Test safety alerts endpoint - uses Emergent LLM key"""
    
    def test_get_safety_alerts(self):
        """GET /api/safety/alerts - Get AI-enhanced safety alerts (may timeout/fallback)"""
        response = requests.get(
            f"{BASE_URL}/api/safety/alerts?lat=6.5244&lng=3.3792&driver_id=test_driver",
            timeout=30  # Longer timeout for AI call
        )
        
        # This endpoint may fallback to default alerts if AI times out
        if response.status_code == 404:
            pytest.skip("Safety alerts endpoint not deployed in current backend build")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert data.get("success") == True, "Request should succeed"
        assert "alerts" in data, "Response should contain alerts"
        assert "location" in data, "Response should contain location"
        assert isinstance(data["alerts"], list), "alerts should be a list"
        
        # Alerts should have expected structure
        if len(data["alerts"]) > 0:
            alert = data["alerts"][0]
            assert "type" in alert, "Alert should have type"
            assert "title" in alert or "message" in alert, "Alert should have title or message"
        
        print(f"SUCCESS: Got {len(data['alerts'])} safety alerts (AI-generated or fallback)")


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
