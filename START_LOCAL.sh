#!/bin/bash

echo "🚀 NEXRYDE - Starting Local Development"
echo "========================================"
echo ""

# Navigate to project
echo "📁 Navigating to project directory..."
cd /Users/admoblord/nexryde

# Pull latest changes
echo "⬇️  Pulling latest changes from main..."
git pull origin main

# Navigate to frontend
echo "📱 Navigating to frontend..."
cd frontend

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Clear all caches
echo "🧹 Clearing caches..."
rm -rf .expo
rm -rf .metro-cache
rm -rf node_modules/.cache

# Start Expo with clear cache
echo "✨ Starting Expo with clear cache..."
echo ""
echo "🎯 NEW FEATURES INCLUDED:"
echo "   ✅ Enter City first booking flow"
echo "   ✅ Automatic GPS detection (high accuracy)"
echo "   ✅ Use GPS button for instant location"
echo "   ✅ Auto intra-city vs inter-city detection"
echo "   ✅ Your Bolt/InDrive/Lag Ride pricing"
echo ""
echo "📱 Scan QR code with Expo Go to test on your phone"
echo ""

npx expo start --clear
