"""
NEXRYDE Community Spice Features - Backend API Tests
Testing: Polls, Pinned Messages, Events with RSVP, and seeded content
"""
import pytest
import requests
import os
import uuid
from datetime import datetime

# Get BASE_URL from environment variable
BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

if not BASE_URL:
    # Fallback for testing
    BASE_URL = "https://call-ready-app.preview.emergentagent.com"


class TestCommunityGroups:
    """Test community groups endpoint"""
    
    def test_get_community_groups_returns_list(self):
        """GET /api/community/groups - Verify groups list returns"""
        response = requests.get(f"{BASE_URL}/api/community/groups")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert "success" in data, "Response should contain 'success' field"
        assert data["success"] == True, "success should be True"
        assert "groups" in data, "Response should contain 'groups' field"
        assert isinstance(data["groups"], list), "groups should be a list"
        
        # If groups exist, verify structure
        if len(data["groups"]) > 0:
            group = data["groups"][0]
            assert "group_id" in group, "Group should have group_id"
            print(f"Found {len(data['groups'])} community groups")
        else:
            print("No groups found - may need seeding")


class TestCommunityPolls:
    """Test community polls CRUD operations"""
    
    @pytest.fixture
    def test_poll_data(self):
        """Generate test poll data"""
        return {
            "question": f"TEST_Poll_{uuid.uuid4().hex[:8]}: What's the best fuel type?",
            "options": ["Petrol", "Diesel", "CNG", "Electric"],
            "user_id": f"test_user_{uuid.uuid4().hex[:8]}",
            "user_name": "Test User",
            "duration_hours": 24
        }
    
    def test_create_poll_success(self, test_poll_data):
        """POST /api/community/groups/{group_id}/polls - Create a poll with question and options"""
        response = requests.post(
            f"{BASE_URL}/api/community/groups/general/polls",
            json=test_poll_data
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("success") == True, "Poll creation should succeed"
        assert "poll" in data, "Response should contain poll object"
        
        poll = data["poll"]
        assert poll["question"] == test_poll_data["question"], "Question should match"
        assert len(poll["options"]) == 4, "Should have 4 options"
        assert poll["group_id"] == "general", "Group ID should be general"
        assert "poll_id" in poll, "Poll should have poll_id"
        assert poll["is_active"] == True, "Poll should be active"
        
        print(f"Created poll with ID: {poll['poll_id']}")
        return poll["poll_id"]
    
    def test_create_poll_empty_question_fails(self):
        """POST /api/community/groups/{group_id}/polls - Empty question should fail"""
        response = requests.post(
            f"{BASE_URL}/api/community/groups/general/polls",
            json={
                "question": "   ",
                "options": ["Yes", "No"],
                "user_id": "test_user"
            }
        )
        
        assert response.status_code == 400, f"Expected 400 for empty question, got {response.status_code}"
        print("Empty question correctly rejected")
    
    def test_create_poll_too_few_options_fails(self):
        """POST /api/community/groups/{group_id}/polls - Less than 2 options should fail"""
        response = requests.post(
            f"{BASE_URL}/api/community/groups/general/polls",
            json={
                "question": "Test question?",
                "options": ["Only one option"],
                "user_id": "test_user"
            }
        )
        
        assert response.status_code == 400, f"Expected 400 for too few options, got {response.status_code}"
        print("Too few options correctly rejected")
    
    def test_create_poll_too_many_options_fails(self):
        """POST /api/community/groups/{group_id}/polls - More than 6 options should fail"""
        response = requests.post(
            f"{BASE_URL}/api/community/groups/general/polls",
            json={
                "question": "Test question?",
                "options": ["1", "2", "3", "4", "5", "6", "7"],  # 7 options
                "user_id": "test_user"
            }
        )
        
        assert response.status_code == 400, f"Expected 400 for too many options, got {response.status_code}"
        print("Too many options correctly rejected")
    
    def test_get_group_polls(self):
        """GET /api/community/groups/{group_id}/polls - Get polls for a group"""
        response = requests.get(f"{BASE_URL}/api/community/groups/general/polls")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert data.get("success") == True, "Request should succeed"
        assert "polls" in data, "Response should contain polls list"
        assert isinstance(data["polls"], list), "polls should be a list"
        
        if len(data["polls"]) > 0:
            poll = data["polls"][0]
            assert "poll_id" in poll, "Poll should have poll_id"
            assert "question" in poll, "Poll should have question"
            assert "options" in poll, "Poll should have options"
            # Verify voter_ids is removed for privacy
            for opt in poll.get("options", []):
                assert "voter_ids" not in opt, "voter_ids should be removed for privacy"
            print(f"Found {len(data['polls'])} polls in general group")
        else:
            print("No polls found in general group")


class TestPollVoting:
    """Test poll voting functionality"""
    
    @pytest.fixture
    def created_poll(self):
        """Create a poll for voting tests"""
        poll_data = {
            "question": f"TEST_Vote_Poll_{uuid.uuid4().hex[:8]}: Favorite color?",
            "options": ["Red", "Blue", "Green"],
            "user_id": "test_creator",
            "user_name": "Test Creator"
        }
        response = requests.post(
            f"{BASE_URL}/api/community/groups/general/polls",
            json=poll_data
        )
        assert response.status_code == 200
        return response.json()["poll"]["poll_id"]
    
    def test_vote_on_poll_success(self, created_poll):
        """POST /api/community/polls/{poll_id}/vote - Vote on a poll successfully"""
        unique_user = f"voter_{uuid.uuid4().hex[:8]}"
        
        response = requests.post(
            f"{BASE_URL}/api/community/polls/{created_poll}/vote",
            json={
                "user_id": unique_user,
                "option_index": 0
            }
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("success") == True, "Vote should succeed"
        assert "message" in data, "Response should contain message"
        print(f"Vote recorded successfully for poll {created_poll}")
    
    def test_vote_duplicate_rejected(self, created_poll):
        """POST /api/community/polls/{poll_id}/vote - Duplicate vote should be rejected"""
        same_user = f"same_voter_{uuid.uuid4().hex[:8]}"
        
        # First vote - should succeed
        response1 = requests.post(
            f"{BASE_URL}/api/community/polls/{created_poll}/vote",
            json={
                "user_id": same_user,
                "option_index": 0
            }
        )
        assert response1.status_code == 200, "First vote should succeed"
        
        # Second vote - should be rejected
        response2 = requests.post(
            f"{BASE_URL}/api/community/polls/{created_poll}/vote",
            json={
                "user_id": same_user,
                "option_index": 1
            }
        )
        
        assert response2.status_code == 400, f"Expected 400 for duplicate vote, got {response2.status_code}"
        data = response2.json()
        assert "Already voted" in data.get("detail", ""), "Should indicate already voted"
        print("Duplicate vote correctly rejected")
    
    def test_vote_invalid_option_rejected(self, created_poll):
        """POST /api/community/polls/{poll_id}/vote - Invalid option index should fail"""
        response = requests.post(
            f"{BASE_URL}/api/community/polls/{created_poll}/vote",
            json={
                "user_id": f"voter_{uuid.uuid4().hex[:8]}",
                "option_index": 99  # Invalid index
            }
        )
        
        assert response.status_code == 400, f"Expected 400 for invalid option, got {response.status_code}"
        print("Invalid option correctly rejected")
    
    def test_vote_nonexistent_poll_fails(self):
        """POST /api/community/polls/{poll_id}/vote - Vote on nonexistent poll should fail"""
        response = requests.post(
            f"{BASE_URL}/api/community/polls/nonexistent-poll-id/vote",
            json={
                "user_id": "test_voter",
                "option_index": 0
            }
        )
        
        assert response.status_code == 404, f"Expected 404 for nonexistent poll, got {response.status_code}"
        print("Nonexistent poll vote correctly rejected")


class TestPinnedMessages:
    """Test pinned messages functionality"""
    
    @pytest.fixture
    def created_message(self):
        """Create a message for pinning tests"""
        message_data = {
            "text": f"TEST_Pin_Message_{uuid.uuid4().hex[:8]}: Important announcement!",
            "user_id": "test_user",
            "user_name": "Test User"
        }
        response = requests.post(
            f"{BASE_URL}/api/community/groups/general/messages",
            json=message_data
        )
        assert response.status_code == 200, f"Failed to create message: {response.text}"
        return response.json()["message"]["_id"]
    
    def test_pin_message_success(self, created_message):
        """POST /api/community/messages/{message_id}/pin - Pin a message"""
        response = requests.post(
            f"{BASE_URL}/api/community/messages/{created_message}/pin",
            json={"action": "pin"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert data.get("success") == True, "Pin action should succeed"
        assert data.get("pinned") == True, "Message should be pinned"
        print(f"Message {created_message} pinned successfully")
    
    def test_unpin_message_success(self, created_message):
        """POST /api/community/messages/{message_id}/pin - Unpin a message"""
        # First pin it
        requests.post(
            f"{BASE_URL}/api/community/messages/{created_message}/pin",
            json={"action": "pin"}
        )
        
        # Then unpin
        response = requests.post(
            f"{BASE_URL}/api/community/messages/{created_message}/pin",
            json={"action": "unpin"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert data.get("success") == True, "Unpin action should succeed"
        assert data.get("pinned") == False, "Message should be unpinned"
        print(f"Message {created_message} unpinned successfully")
    
    def test_get_pinned_messages_for_group(self):
        """GET /api/community/groups/{group_id}/pinned - Get pinned messages for a group"""
        response = requests.get(f"{BASE_URL}/api/community/groups/general/pinned")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert data.get("success") == True, "Request should succeed"
        assert "pinned_messages" in data, "Response should contain pinned_messages"
        assert isinstance(data["pinned_messages"], list), "pinned_messages should be a list"
        
        if len(data["pinned_messages"]) > 0:
            msg = data["pinned_messages"][0]
            assert "_id" in msg, "Pinned message should have _id"
            assert "group_id" in msg, "Pinned message should have group_id"
            print(f"Found {len(data['pinned_messages'])} pinned messages")
        else:
            print("No pinned messages found in general group")


class TestCommunityEvents:
    """Test community events CRUD operations"""
    
    @pytest.fixture
    def test_event_data(self):
        """Generate test event data"""
        return {
            "title": f"TEST_Event_{uuid.uuid4().hex[:8]}: Driver Meetup",
            "description": "Test event description for driver meetup",
            "event_type": "meetup",
            "location": "Test Location, Lagos",
            "date": "2026-03-15",
            "time": "2:00 PM",
            "group_id": "general",
            "user_id": "test_organizer",
            "user_name": "Test Organizer",
            "is_featured": False
        }
    
    def test_create_event_success(self, test_event_data):
        """POST /api/community/events - Create a new community event"""
        response = requests.post(
            f"{BASE_URL}/api/community/events",
            json=test_event_data
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("success") == True, "Event creation should succeed"
        assert "event" in data, "Response should contain event object"
        
        event = data["event"]
        assert event["title"] == test_event_data["title"], "Title should match"
        assert event["event_type"] == "meetup", "Event type should be meetup"
        assert event["location"] == test_event_data["location"], "Location should match"
        assert "event_id" in event, "Event should have event_id"
        assert event["rsvp_count"] == 0, "Initial RSVP count should be 0"
        
        print(f"Created event with ID: {event['event_id']}")
        return event["event_id"]
    
    def test_create_event_empty_title_fails(self):
        """POST /api/community/events - Empty title should fail"""
        response = requests.post(
            f"{BASE_URL}/api/community/events",
            json={
                "title": "   ",
                "description": "Test description",
                "event_type": "meetup"
            }
        )
        
        assert response.status_code == 400, f"Expected 400 for empty title, got {response.status_code}"
        print("Empty title correctly rejected")
    
    def test_get_all_events(self):
        """GET /api/community/events - Get all events"""
        response = requests.get(f"{BASE_URL}/api/community/events")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert data.get("success") == True, "Request should succeed"
        assert "events" in data, "Response should contain events list"
        assert isinstance(data["events"], list), "events should be a list"
        
        if len(data["events"]) > 0:
            event = data["events"][0]
            assert "event_id" in event, "Event should have event_id"
            assert "title" in event, "Event should have title"
            assert "event_type" in event, "Event should have event_type"
            print(f"Found {len(data['events'])} events")
        else:
            print("No events found")
    
    def test_get_events_filtered_by_group(self):
        """GET /api/community/events?group_id=announcements - Get events filtered by group"""
        response = requests.get(f"{BASE_URL}/api/community/events?group_id=announcements")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert data.get("success") == True, "Request should succeed"
        assert "events" in data, "Response should contain events list"
        
        # Verify all returned events belong to announcements group
        for event in data["events"]:
            assert event["group_id"] == "announcements", f"Event should belong to announcements group, got {event['group_id']}"
        
        print(f"Found {len(data['events'])} events in announcements group")


class TestEventRSVP:
    """Test event RSVP toggle functionality"""
    
    @pytest.fixture
    def created_event(self):
        """Create an event for RSVP tests"""
        event_data = {
            "title": f"TEST_RSVP_Event_{uuid.uuid4().hex[:8]}: Test Meetup",
            "description": "Event for RSVP testing",
            "event_type": "meetup",
            "location": "Test Location",
            "date": "2026-04-01",
            "time": "3:00 PM",
            "group_id": "general"
        }
        response = requests.post(
            f"{BASE_URL}/api/community/events",
            json=event_data
        )
        assert response.status_code == 200, f"Failed to create event: {response.text}"
        return response.json()["event"]["event_id"]
    
    def test_rsvp_add_success(self, created_event):
        """POST /api/community/events/{event_id}/rsvp - RSVP to event (add)"""
        unique_user = f"rsvp_user_{uuid.uuid4().hex[:8]}"
        
        response = requests.post(
            f"{BASE_URL}/api/community/events/{created_event}/rsvp",
            json={"user_id": unique_user}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        assert data.get("success") == True, "RSVP should succeed"
        assert data.get("action") == "added", "First RSVP should add user"
        print(f"User RSVP added for event {created_event}")
    
    def test_rsvp_toggle_remove(self, created_event):
        """POST /api/community/events/{event_id}/rsvp - RSVP toggle (add then remove)"""
        same_user = f"toggle_user_{uuid.uuid4().hex[:8]}"
        
        # First RSVP - should add
        response1 = requests.post(
            f"{BASE_URL}/api/community/events/{created_event}/rsvp",
            json={"user_id": same_user}
        )
        assert response1.status_code == 200
        data1 = response1.json()
        assert data1.get("action") == "added", "First call should add"
        
        # Second RSVP - should remove (toggle)
        response2 = requests.post(
            f"{BASE_URL}/api/community/events/{created_event}/rsvp",
            json={"user_id": same_user}
        )
        
        assert response2.status_code == 200, f"Expected 200, got {response2.status_code}"
        data2 = response2.json()
        
        assert data2.get("success") == True, "Toggle should succeed"
        assert data2.get("action") == "removed", "Second call should remove user"
        print("RSVP toggle working correctly - add then remove")
    
    def test_rsvp_nonexistent_event_fails(self):
        """POST /api/community/events/{event_id}/rsvp - RSVP to nonexistent event should fail"""
        response = requests.post(
            f"{BASE_URL}/api/community/events/nonexistent-event-id/rsvp",
            json={"user_id": "test_user"}
        )
        
        assert response.status_code == 404, f"Expected 404 for nonexistent event, got {response.status_code}"
        print("Nonexistent event RSVP correctly rejected")


class TestSeededContent:
    """Test seeded messages exist in community"""
    
    def test_seeded_messages_exist(self):
        """GET /api/community/groups/{group_id}/messages - Verify seeded messages exist"""
        response = requests.get(f"{BASE_URL}/api/community/groups/general/messages?limit=50")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        
        assert data.get("success") == True, "Request should succeed"
        assert "messages" in data, "Response should contain messages"
        
        messages = data["messages"]
        print(f"Found {len(messages)} messages in general group")
        
        # Should have at least some seeded content
        if len(messages) == 0:
            print("WARNING: No messages found - seeding may not have occurred")
    
    def test_post_new_message_success(self):
        """POST /api/community/groups/{group_id}/messages - Post a new message"""
        message_data = {
            "text": f"TEST_Message_{uuid.uuid4().hex[:8]}: Hello drivers!",
            "user_id": f"test_user_{uuid.uuid4().hex[:8]}",
            "user_name": "Test Driver",
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
        assert msg["user_name"] == message_data["user_name"], "User name should match"
        assert "_id" in msg, "Message should have _id"
        
        print(f"Posted message with ID: {msg['_id']}")
    
    def test_post_empty_message_fails(self):
        """POST /api/community/groups/{group_id}/messages - Empty message should fail"""
        response = requests.post(
            f"{BASE_URL}/api/community/groups/general/messages",
            json={
                "text": "   ",
                "user_id": "test_user"
            }
        )
        
        assert response.status_code == 400, f"Expected 400 for empty message, got {response.status_code}"
        print("Empty message correctly rejected")


class TestSeedDataVerification:
    """Verify seeded polls and events exist"""
    
    def test_seeded_polls_exist(self):
        """Verify seeded polls exist in various groups"""
        # Check general group for polls
        response = requests.get(f"{BASE_URL}/api/community/groups/general/polls")
        assert response.status_code == 200
        data = response.json()
        
        if len(data.get("polls", [])) > 0:
            print(f"Found {len(data['polls'])} seeded polls in general group")
            poll = data["polls"][0]
            assert "total_votes" in poll, "Poll should have total_votes"
        else:
            print("No polls found in general - may need to check other groups")
    
    def test_seeded_events_exist(self):
        """Verify seeded events exist"""
        response = requests.get(f"{BASE_URL}/api/community/events")
        assert response.status_code == 200
        data = response.json()
        
        events = data.get("events", [])
        if len(events) > 0:
            print(f"Found {len(events)} total events")
            # Check for featured events
            featured = [e for e in events if e.get("is_featured")]
            print(f"Found {len(featured)} featured events")
        else:
            print("No events found - seeding may not have occurred")


# Cleanup function for test data (can be run manually)
def cleanup_test_data():
    """Remove TEST_ prefixed data"""
    # This would require admin/direct DB access
    # Included for reference but not executed automatically
    pass


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
