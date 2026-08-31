#!/usr/bin/env bash
# Drop the Cloud Run NAT IP from Atlas Network Access after Emergent cutover.
#
# Cloud Run africa-south1 egressed via Cloud NAT 34.35.108.112 and Atlas was
# allowlisted to that address only. Once the API runs on Emergent, that IP is
# unused — leaving it allows anyone who still hits a lingering Cloud Run
# revision to reach production Mongo.
#
# Requires Atlas CLI + keys. Does NOT open 0.0.0.0/0.
#
#   export ATLAS_PUBLIC_KEY=...
#   export ATLAS_PRIVATE_KEY=...
#   export ATLAS_PROJECT_ID=...   # optional if only one project
#   ./backend/scripts/atlas_drop_cloudrun_nat.sh           # dry-run
#   ./backend/scripts/atlas_drop_cloudrun_nat.sh --apply
set -euo pipefail

NAT_IP="${ATLAS_CLOUDRUN_NAT_IP:-34.35.108.112}"
APPLY=false
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=true ;;
    *) echo "Unknown flag: $arg" >&2; exit 2 ;;
  esac
done

if [[ -z "${ATLAS_PUBLIC_KEY:-}" || -z "${ATLAS_PRIVATE_KEY:-}" ]]; then
  echo "ERROR: Set ATLAS_PUBLIC_KEY and ATLAS_PRIVATE_KEY" >&2
  exit 1
fi
command -v atlas >/dev/null 2>&1 || { echo "ERROR: install MongoDB Atlas CLI" >&2; exit 1; }

atlas config set public_api_key "$ATLAS_PUBLIC_KEY"
atlas config set private_api_key "$ATLAS_PRIVATE_KEY"

ATLAS_PROJECT_ID="${ATLAS_PROJECT_ID:-}"
if [[ -z "$ATLAS_PROJECT_ID" ]]; then
  ATLAS_PROJECT_ID=$(atlas projects list -o json | python3 -c \
    'import sys,json; print((json.load(sys.stdin).get("results") or [{}])[0].get("id",""))')
fi
[[ -n "$ATLAS_PROJECT_ID" ]] || { echo "ERROR: set ATLAS_PROJECT_ID" >&2; exit 1; }

echo "Project: $ATLAS_PROJECT_ID"
echo "Looking for Cloud Run NAT entry: $NAT_IP"

ENTRY_ID=$(atlas accessLists list --projectId "$ATLAS_PROJECT_ID" -o json | python3 -c "
import json,sys
ip='$NAT_IP'
for e in (json.load(sys.stdin).get('results') or []):
    if e.get('ipAddress') == ip or e.get('cidrBlock') == ip + '/32':
        print(e.get('id') or e.get('ipAddress') or '')
        break
")

if [[ -z "$ENTRY_ID" ]]; then
  echo "No Atlas access-list entry for $NAT_IP — nothing to drop."
  exit 0
fi

echo "Found entry id=$ENTRY_ID for $NAT_IP"
if ! $APPLY; then
  echo "DRY RUN — re-run with --apply to delete it."
  echo "Before deleting: add the Emergent egress IP and confirm /api/health/ready."
  exit 0
fi

atlas accessLists delete "$ENTRY_ID" --projectId "$ATLAS_PROJECT_ID" --force
echo "Deleted Atlas allowlist entry for Cloud Run NAT $NAT_IP"
