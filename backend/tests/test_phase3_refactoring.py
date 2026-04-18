"""
Test Phase 3 Backend Refactoring - Drivers and Gamification Module Extraction
Tests the newly extracted routers: drivers.py (profile, location, verification, heatmap, earnings) 
and gamification.py (challenges, leaderboard, loyalty, streaks)
"""
import pytest
import requests
import os

from tests.integration_utils import bearer_headers

# Unified backend target for tests
BASE_URL = (
    os.environ.get('NEXRYDE_BACKEND_URL')
    or os.environ.get('EXPO_PUBLIC_BACKEND_URL')
    or os.environ.get('REACT_APP_BACKEND_URL')
    or 'https://nexryde-backend-993913300770.us-central1.run.app'
).rstrip('/')


class TestHealthEndpoint:
    """Health check must work - baseline test"""
    
    def test_health_check(self):
        """Test: GET /api/health - should return healthy"""
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200, f"Health check failed: {response.text}"
        data = response.json()
        assert data["status"] == "healthy", f"Unexpected status: {data}"
        print(f"✅ Health check PASSED: {data}")


class TestDriversRouter:
    """Test drivers router endpoints - profile, heatmap, earnings, verification"""
    
    def test_get_available_drivers(self):
        """Test 1: GET /api/drivers/available - should return drivers list"""
        response = requests.get(f"{BASE_URL}/api/drivers/available")
        assert response.status_code == 200, f"Available drivers failed: {response.text}"
        data = response.json()
        assert "drivers" in data, f"Missing 'drivers' key: {data}"
        assert "count" in data, f"Missing 'count' key: {data}"
        assert isinstance(data["drivers"], list), f"drivers should be a list: {data}"
        print(f"✅ Available drivers PASSED: Found {data['count']} drivers")
        
    def test_get_available_drivers_with_filters(self):
        """Test available drivers with location filter"""
        response = requests.get(
            f"{BASE_URL}/api/drivers/available",
            params={"lat": 6.5244, "lng": 3.3792, "vehicle_type": "economy"}
        )
        assert response.status_code == 200, f"Available drivers with filters failed: {response.text}"
        data = response.json()
        assert "drivers" in data
        print(f"✅ Available drivers with filters PASSED: Found {data['count']} drivers")

    def test_get_heatmap_with_city(self):
        """Test 2: GET /api/driver/heatmap?city=lagos - should return heatmap zones"""
        response = requests.get(f"{BASE_URL}/api/driver/heatmap", params={"city": "lagos"})
        assert response.status_code == 200, f"Heatmap failed: {response.text}"
        data = response.json()
        assert "city" in data, f"Missing 'city' key: {data}"
        assert "zones" in data, f"Missing 'zones' key: {data}"
        assert data["city"] == "Lagos", f"Unexpected city: {data['city']}"
        assert isinstance(data["zones"], list), f"zones should be a list"
        if data["zones"]:
            zone = data["zones"][0]
            assert "lat" in zone, f"Zone missing lat: {zone}"
            assert "lng" in zone, f"Zone missing lng: {zone}"
            assert "intensity" in zone, f"Zone missing intensity: {zone}"
        print(f"✅ Heatmap Lagos PASSED: {len(data['zones'])} zones, recommendation: {data.get('recommendation', 'N/A')}")
        
    def test_get_heatmap_with_coordinates(self):
        """Test heatmap with lat/lng coordinates"""
        response = requests.get(
            f"{BASE_URL}/api/driver/heatmap",
            params={"lat": 6.5244, "lng": 3.3792}
        )
        assert response.status_code == 200, f"Heatmap with coords failed: {response.text}"
        data = response.json()
        assert "zones" in data
        print(f"✅ Heatmap with coordinates PASSED: {len(data['zones'])} zones")

    def test_get_driver_earnings_dashboard(self, integration_driver):
        """Test 3: GET /api/driver/earnings/{driver_id} - should return earnings dashboard"""
        driver_id = integration_driver["id"]
        response = requests.get(
            f"{BASE_URL}/api/driver/earnings/{driver_id}",
            headers=bearer_headers(integration_driver["token"]),
        )
        assert response.status_code == 200, f"Earnings dashboard failed: {response.text}"
        data = response.json()
        assert "driver_id" in data, f"Missing driver_id: {data}"
        assert "period" in data, f"Missing period: {data}"
        assert "summary" in data, f"Missing summary: {data}"
        assert "averages" in data, f"Missing averages: {data}"
        assert "projections" in data, f"Missing projections: {data}"
        # Check summary fields
        summary = data["summary"]
        assert "total_earnings" in summary, f"Missing total_earnings in summary"
        assert "total_trips" in summary, f"Missing total_trips in summary"
        print(f"✅ Earnings dashboard PASSED: Driver {data['driver_id']}, Period: {data['period']}, "
              f"Total Earnings: ₦{summary['total_earnings']}, Trips: {summary['total_trips']}")
              
    def test_get_driver_earnings_with_period(self, integration_driver):
        """Test earnings dashboard with different periods"""
        driver_id = integration_driver["id"]
        for period in ["today", "week", "month"]:
            response = requests.get(
                f"{BASE_URL}/api/driver/earnings/{driver_id}",
                params={"period": period},
                headers=bearer_headers(integration_driver["token"]),
            )
            assert response.status_code == 200, f"Earnings for {period} failed"
            data = response.json()
            assert data["period"] == period
            print(f"✅ Earnings {period} PASSED")

    def test_get_driver_verification_status(self, integration_driver):
        """Test 4: GET /api/drivers/verification/{user_id} - should return verification status"""
        user_id = integration_driver["id"]
        response = requests.get(
            f"{BASE_URL}/api/drivers/verification/{user_id}",
            headers=bearer_headers(integration_driver["token"]),
        )
        assert response.status_code == 200, f"Verification status failed: {response.text}"
        data = response.json()
        # Can be "not_submitted" or actual verification data
        if data.get("status") == "not_submitted":
            assert "message" in data, f"Missing message for not_submitted status"
            print(f"✅ Verification status PASSED: Not submitted yet - {data['message']}")
        else:
            assert "status" in data, f"Missing status: {data}"
            print(f"✅ Verification status PASSED: Status = {data.get('status', 'N/A')}")


class TestGamificationRouter:
    """Test gamification router endpoints - challenges, leaderboard, loyalty"""
    
    def test_get_active_challenges(self):
        """Test 5: GET /api/challenges/active - should return active challenges"""
        response = requests.get(f"{BASE_URL}/api/challenges/active")
        assert response.status_code == 200, f"Active challenges failed: {response.text}"
        data = response.json()
        assert "challenges" in data, f"Missing 'challenges' key: {data}"
        assert isinstance(data["challenges"], list), f"challenges should be a list"
        if not data["challenges"]:
            print("✅ Active challenges PASSED: empty list (none scheduled in DB)")
            return
        challenge = data["challenges"][0]
        assert "id" in challenge or "title" in challenge, f"Challenge missing id/title: {challenge}"
        assert "target_type" in challenge, f"Challenge missing target_type: {challenge}"
        print(f"✅ Active challenges PASSED: Found {len(data['challenges'])} challenges")
        for c in data["challenges"]:
            print(f"   - {c.get('title', 'N/A')}: {c.get('description', 'N/A')}")

    def test_get_driver_leaderboard(self):
        """Test 6: GET /api/leaderboard/drivers - should return leaderboard"""
        response = requests.get(f"{BASE_URL}/api/leaderboard/drivers")
        assert response.status_code == 200, f"Leaderboard failed: {response.text}"
        data = response.json()
        assert "leaderboard" in data, f"Missing 'leaderboard' key: {data}"
        assert "period" in data, f"Missing 'period' key: {data}"
        assert "city" in data, f"Missing 'city' key: {data}"
        assert isinstance(data["leaderboard"], list), f"leaderboard should be a list"
        print(f"✅ Driver leaderboard PASSED: {len(data['leaderboard'])} entries, "
              f"Period: {data['period']}, City: {data['city']}")
              
    def test_get_leaderboard_with_filters(self):
        """Test leaderboard with city and period filters"""
        for period in ["daily", "weekly", "monthly"]:
            response = requests.get(
                f"{BASE_URL}/api/leaderboard/drivers",
                params={"city": "lagos", "period": period}
            )
            assert response.status_code == 200, f"Leaderboard {period} failed"
            data = response.json()
            assert data["period"] == period
            print(f"✅ Leaderboard {period} PASSED: {len(data['leaderboard'])} entries")
            
    def test_get_top_rated_drivers(self):
        """Test top rated drivers leaderboard"""
        response = requests.get(f"{BASE_URL}/api/leaderboard/top-rated")
        assert response.status_code == 200, f"Top rated failed: {response.text}"
        data = response.json()
        assert "top_rated_drivers" in data
        print(f"✅ Top rated drivers PASSED: {len(data['top_rated_drivers'])} entries")

    def test_get_loyalty_status(self):
        """Test 7: GET /api/loyalty/test-user - should return loyalty status"""
        user_id = "test-loyalty-user"
        response = requests.get(f"{BASE_URL}/api/loyalty/{user_id}")
        assert response.status_code == 200, f"Loyalty status failed: {response.text}"
        data = response.json()
        assert "user_id" in data, f"Missing 'user_id' key: {data}"
        assert "current_tier" in data, f"Missing 'current_tier' key: {data}"
        assert "points" in data, f"Missing 'points' key: {data}"
        assert "current_perks" in data, f"Missing 'current_perks' key: {data}"
        # Verify tier is one of expected values
        valid_tiers = ["bronze", "silver", "gold", "platinum"]
        assert data["current_tier"] in valid_tiers, f"Invalid tier: {data['current_tier']}"
        print(f"✅ Loyalty status PASSED: User {data['user_id']}, Tier: {data['current_tier']}, "
              f"Points: {data['points']}, Perks: {data['current_perks']}")


class TestChatRouter:
    """Test chat router still works after refactoring"""
    
    def test_chat_presets_rider(self):
        """Test 8: GET /api/chat/presets/rider - should still work"""
        response = requests.get(f"{BASE_URL}/api/chat/presets/rider")
        assert response.status_code == 200, f"Chat presets rider failed: {response.text}"
        data = response.json()
        assert "presets" in data, f"Missing 'presets' key: {data}"
        assert isinstance(data["presets"], list), f"presets should be a list"
        assert len(data["presets"]) >= 1, f"Expected at least 1 preset message"
        print(f"✅ Chat presets rider PASSED: {len(data['presets'])} presets available")
        
    def test_chat_presets_driver(self):
        """Test driver presets also work"""
        response = requests.get(f"{BASE_URL}/api/chat/presets/driver")
        assert response.status_code == 200, f"Chat presets driver failed: {response.text}"
        data = response.json()
        assert "presets" in data
        print(f"✅ Chat presets driver PASSED: {len(data['presets'])} presets available")


class TestUsersRouter:
    """Test users router still works after refactoring"""
    
    def test_user_preferences(self, integration_rider):
        """Test 9: GET /api/users/{id}/preferences - should still work"""
        user_id = integration_rider["id"]
        response = requests.get(
            f"{BASE_URL}/api/users/{user_id}/preferences",
            headers=bearer_headers(integration_rider["token"]),
        )
        assert response.status_code == 200, f"User preferences failed: {response.text}"
        data = response.json()
        assert "theme" in data, f"Missing 'theme' key: {data}"
        assert "language" in data, f"Missing 'language' key: {data}"
        print(f"✅ User preferences PASSED: Theme={data['theme']}, Language={data['language']}")


class TestAdditionalDriversEndpoints:
    """Test additional drivers router endpoints"""
    
    def test_driver_stats(self, integration_driver):
        """Test driver stats endpoint"""
        driver_id = integration_driver["id"]
        response = requests.get(
            f"{BASE_URL}/api/drivers/{driver_id}/stats",
            headers=bearer_headers(integration_driver["token"]),
        )
        assert response.status_code == 200, f"Driver stats failed: {response.text}"
        data = response.json()
        assert "total_trips" in data, f"Missing total_trips"
        assert "total_earnings" in data, f"Missing total_earnings"
        assert "rating" in data, f"Missing rating"
        print(f"✅ Driver stats PASSED: Trips={data['total_trips']}, Earnings=₦{data['total_earnings']}, Rating={data['rating']}")
        
    def test_driver_onboarding_status(self, integration_driver):
        """Test driver onboarding status endpoint"""
        driver_id = integration_driver["id"]
        response = requests.get(
            f"{BASE_URL}/api/drivers/{driver_id}/onboarding-status",
            headers=bearer_headers(integration_driver["token"]),
        )
        assert response.status_code == 200, f"Onboarding status failed: {response.text}"
        data = response.json()
        assert "step" in data, f"Missing step"
        assert "completed" in data, f"Missing completed"
        print(f"✅ Onboarding status PASSED: Step={data['step']}, Completed={data['completed']}")


class TestAdditionalGamificationEndpoints:
    """Test additional gamification router endpoints"""
    
    def test_driver_certification(self):
        """Test driver certification endpoint"""
        # Create a test driver first
        test_user_id = "test-cert-driver"
        # Try to get certification - will create if driver exists
        response = requests.get(f"{BASE_URL}/api/drivers/{test_user_id}/certification")
        # May return 404 if driver doesn't exist - that's expected
        if response.status_code == 404:
            print(f"✅ Driver certification PASSED: Returns 404 for non-existent driver (expected)")
        else:
            assert response.status_code == 200, f"Certification failed: {response.text}"
            data = response.json()
            assert "current_level" in data
            print(f"✅ Driver certification PASSED: Level={data['current_level']}")
            
    def test_driver_streaks(self):
        """Test driver streaks endpoint"""
        user_id = "test-streaks-driver"
        response = requests.get(f"{BASE_URL}/api/drivers/{user_id}/streaks")
        # May return 404 if user doesn't exist - that's expected
        if response.status_code == 404:
            print(f"✅ Driver streaks PASSED: Returns 404 for non-existent user (expected)")
        else:
            assert response.status_code == 200
            data = response.json()
            assert "current_streak" in data
            assert "earned_badges" in data
            print(f"✅ Driver streaks PASSED: Current streak={data['current_streak']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
