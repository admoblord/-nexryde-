#!/usr/bin/env bash
# Test GET /api/places/driving-route after Cloud Run deploy.
# Requires GOOGLE_MAPS_API_KEY on the backend (503 if missing).
#
# Usage:
#   export BACKEND_URL=https://nexryde-backend-993913300770.us-central1.run.app
#   ./scripts/test_driving_route.sh

set -euo pipefail
BASE="${BACKEND_URL:-https://nexryde-backend-993913300770.us-central1.run.app}"
BASE="${BASE%/}"

# Sample: Lagos mainland → Lekki-ish (adjust if needed)
PICKUP_LAT="${PICKUP_LAT:-6.5244}"
PICKUP_LNG="${PICKUP_LNG:-3.3792}"
DROPOFF_LAT="${DROPOFF_LAT:-6.4698}"
DROPOFF_LNG="${DROPOFF_LNG:-3.5852}"

URL="${BASE}/api/places/driving-route?pickup_lat=${PICKUP_LAT}&pickup_lng=${PICKUP_LNG}&dropoff_lat=${DROPOFF_LAT}&dropoff_lng=${DROPOFF_LNG}"

echo "GET ${URL}"
curl -sS -w "\nHTTP %{http_code}\n" "${URL}" | head -c 2000
echo ""
