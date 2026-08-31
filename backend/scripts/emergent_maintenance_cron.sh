#!/usr/bin/env bash
# Replace Cloud Scheduler's maintenance-tick on a non-Cloud-Run host.
# Install (every 2 minutes):
#   */2 * * * * /path/to/backend/scripts/emergent_maintenance_cron.sh >>/var/log/nexryde-tick.log 2>&1
set -euo pipefail

: "${NEXRYDE_PUBLIC_BACKEND_URL:?set NEXRYDE_PUBLIC_BACKEND_URL}"
: "${NEXRYDE_OPS_KEY:?set NEXRYDE_OPS_KEY}"

BASE="${NEXRYDE_PUBLIC_BACKEND_URL%/}"
curl -fsS -X POST \
  -H "X-NEXRYDE-OPS-KEY: ${NEXRYDE_OPS_KEY}" \
  -H "Content-Type: application/json" \
  --max-time 15 \
  "${BASE}/api/ops/maintenance-tick" \
  -o /dev/null
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) maintenance-tick ok"
