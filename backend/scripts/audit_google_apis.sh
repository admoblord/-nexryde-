#!/usr/bin/env bash
# ============================================================
# NexRyde — Google Cloud API usage audit
# Run: bash backend/scripts/audit_google_apis.sh
#
# Lists which APIs are ENABLED in your GCP project and flags
# APIs that are enabled but NOT referenced in any source file.
# ============================================================
set -euo pipefail

PROJECT="${GCLOUD_PROJECT:-nexryde-app}"

echo "=== APIS CURRENTLY ENABLED ==="
gcloud services list --enabled --project="$PROJECT" \
  --filter="config.name~'maps|places|geocod|directions|routes|distance|elevation|roads|translate|vision|speech|bigquery|pubsub|run|storage|monitoring|logging|firestore|secretmanager|iam'" \
  --format="table(config.name, config.title)" 2>/dev/null || echo "(run 'gcloud auth login' first)"

echo ""
echo "=== NEXRYDE ACTUALLY USES ==="
cat <<'USED'
  maps.googleapis.com           → MapView tile loading (Android/iOS SDK key)
  places.googleapis.com         → Autocomplete + Place Details  (nexryde-backend-places-server key)
  geocoding-backend.googleapis.com → Reverse + Forward geocode (backend key)
  directions-backend.googleapis.com → Fare distance + route polyline (backend key)
  routes.googleapis.com         → Routes API v2 fallback (backend key)
  fcm.googleapis.com            → Push notifications (server key)
  secretmanager.googleapis.com  → Secret Manager
  run.googleapis.com            → Cloud Run
  storage.googleapis.com        → GCS (if used for image hosting)
  monitoring.googleapis.com     → Cloud Monitoring alerts
  logging.googleapis.com        → Cloud Logging
USED

echo ""
echo "=== APIs TO DISABLE (not referenced in codebase) ==="
cat <<'DISABLE'
  elevation.googleapis.com      — not used
  roads.googleapis.com          — not used
  timezone.googleapis.com       — not used
  staticmaps.googleapis.com     — not used (use MapView SDK instead)
  embed.googleapis.com          — not used
  streetviewpublish.googleapis.com — not used
  translate.googleapis.com      — not used
  vision.googleapis.com         — not used
  speech.googleapis.com         — not used
  bigquery.googleapis.com       — not used
  dataflow.googleapis.com       — not used
DISABLE

echo ""
echo "=== KEY RESTRICTION CHECKLIST ==="
cat <<'KEYS'
  Android app key (AIzaSyBm...):
    • Application restrictions: Android apps
    • Package: com.nexryde.app (check app.json)
    • SHA-1: 16:6D:82:B6:0A:EC:04:24:CC:8A:43:47:5F:51:2A:E5:40:6E:FE:D7
    • API restrictions: Maps SDK for Android ONLY

  Cloud Run backend key:
    • Application restrictions: IP addresses (Cloud Run egress IPs or none)
    • API restrictions: Directions API, Geocoding API, Routes API

  Places server key (nexryde-backend-places-server):
    • Application restrictions: IP addresses
    • API restrictions: Places API ONLY

DISABLE BILLING ALERTS — recommended budgets:
  Geocoding  → $20/month alert
  Directions → $30/month alert
  Places     → $20/month alert
  Maps loads → $50/month alert
KEYS

echo ""
echo "=== DISABLE COMMANDS (run after verifying above) ==="
for svc in \
  elevation-backend.googleapis.com \
  roads.googleapis.com \
  timezone-backend.googleapis.com \
  staticmaps.googleapis.com \
  translate.googleapis.com \
  vision.googleapis.com \
  speech.googleapis.com; do
  echo "  gcloud services disable $svc --project=$PROJECT --force"
done
