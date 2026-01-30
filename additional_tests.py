#!/usr/bin/env python3
"""
Additional KODA Backend API Tests
Tests edge cases and AI assistant responses
"""

import requests
import json

BASE_URL = "https://ride-location-fix.preview.emergentagent.com/api"

def test_ai_assistants():
    print("🤖 Testing AI Assistant Responses")
    
    # Test various rider questions
    rider_questions = [
        "How much will my trip cost?",
        "Is my driver safe?", 
        "How long will the trip take?",
        "Can I cancel my ride?",
        "What safety features do you have?"
    ]
    
    for question in rider_questions:
        response = requests.get(f"{BASE_URL}/ai/rider-assistant", params={
            "user_id": "test-user-123",
            "question": question
        })
        
        if response.status_code == 200:
            data = response.json()
            print(f"Q: {question}")
            print(f"A: {data.get('response', 'No response')}")
            print(f"Type: {data.get('type', 'unknown')}")
            print("-" * 50)
    
    # Test various driver questions  
    driver_questions = [
        "How much did I earn today?",
        "When is the best time to drive?",
        "Where should I go for more rides?",
        "How can I improve my rating?"
    ]
    
    for question in driver_questions:
        response = requests.get(f"{BASE_URL}/ai/driver-assistant", params={
            "user_id": "test-driver-123", 
            "question": question
        })
        
        if response.status_code == 200:
            data = response.json()
            print(f"Q: {question}")
            print(f"A: {data.get('response', 'No response')}")
            print(f"Type: {data.get('type', 'unknown')}")
            print("-" * 50)

def test_leaderboard_variations():
    print("🏆 Testing Leaderboard Variations")
    
    # Test different periods
    periods = ["daily", "weekly", "monthly"]
    cities = ["lagos", "abuja", "kano"]
    
    for period in periods:
        for city in cities:
            response = requests.get(f"{BASE_URL}/leaderboard/drivers", params={
                "city": city,
                "period": period
            })
            
            if response.status_code == 200:
                data = response.json()
                print(f"Leaderboard for {city} ({period}): {len(data.get('leaderboard', []))} drivers")

def test_challenges_structure():
    print("🎯 Testing Challenges Structure")
    
    response = requests.get(f"{BASE_URL}/challenges/active")
    if response.status_code == 200:
        data = response.json()
        challenges = data.get("challenges", [])
        
        print(f"Found {len(challenges)} active challenges:")
        for challenge in challenges:
            print(f"- {challenge.get('title')}: {challenge.get('description')}")
            print(f"  Target: {challenge.get('target_value')} {challenge.get('target_type')}")
            print(f"  Reward: {challenge.get('reward_value')}")

if __name__ == "__main__":
    test_ai_assistants()
    print("\n" + "="*80 + "\n")
    test_leaderboard_variations()
    print("\n" + "="*80 + "\n") 
    test_challenges_structure()