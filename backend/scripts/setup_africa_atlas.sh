#!/usr/bin/env bash
# Create Atlas cluster closer to Lagos (Cape Town AF_SOUTH_1 when available)
# and write MONGODB_URI (prod) or MONGODB_URI_AFRICA.
#
# Requires:
#   export ATLAS_PUBLIC_KEY=...
#   export ATLAS_PRIVATE_KEY=...
#   export ATLAS_ORG_ID=...          # optional
#   export ATLAS_PROJECT_ID=...      # optional — uses existing nexryde project
#
# Usage:
#   ./backend/scripts/setup_africa_atlas.sh              # prod M10 AF_SOUTH_1 (paid)
#   ./backend/scripts/setup_africa_atlas.sh staging-m0  # free M0 closest to Africa
set -euo pipefail

MODE="${1:-prod}"
PROJECT_ID="${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"

if [[ -z "${ATLAS_PUBLIC_KEY:-}" || -z "${ATLAS_PRIVATE_KEY:-}" ]]; then
  echo "ERROR: Set ATLAS_PUBLIC_KEY and ATLAS_PRIVATE_KEY" >&2
  exit 1
fi

if ! command -v atlas >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    brew install mongodb-atlas-cli
  else
    echo "ERROR: install Atlas CLI first" >&2
    exit 1
  fi
fi

atlas config set public_api_key "$ATLAS_PUBLIC_KEY"
atlas config set private_api_key "$ATLAS_PRIVATE_KEY"

ORG_ID="${ATLAS_ORG_ID:-$(atlas orgs list -o json | python3 -c 'import sys,json; d=json.load(sys.stdin); print((d.get("results") or d)[0]["id"])')}"
ATLAS_PROJECT_ID="${ATLAS_PROJECT_ID:-}"
if [[ -z "$ATLAS_PROJECT_ID" ]]; then
  ATLAS_PROJECT_ID=$(atlas projects list -o json | python3 -c 'import sys,json; print((json.load(sys.stdin).get("results") or [{}])[0].get("id",""))')
fi
if [[ -z "$ATLAS_PROJECT_ID" ]]; then
  echo "ERROR: set ATLAS_PROJECT_ID" >&2
  exit 1
fi

if [[ "$MODE" == "staging-m0" ]]; then
  CLUSTER="${ATLAS_CLUSTER_NAME:-nexryde-staging-m0}"
  TIER=M0
  # M0 is not in every region — EU_WEST_1 is a common free fallback nearer than US.
  REGION_NAME="${ATLAS_REGION:-EU_WEST_1}"
  PROVIDER=AWS
  SECRET=MONGODB_URI_STAGING
  DB_HINT=nexryde_staging_db
else
  CLUSTER="${ATLAS_CLUSTER_NAME:-nexryde-africa}"
  TIER="${ATLAS_TIER:-M10}"
  # Cape Town — closest Atlas region to Lagos for paid clusters
  REGION_NAME="${ATLAS_REGION:-AF_SOUTH_1}"
  PROVIDER=AWS
  SECRET="${ATLAS_SECRET_NAME:-MONGODB_URI_AFRICA}"
  DB_HINT=nexryde_db
fi

if atlas clusters describe "$CLUSTER" --projectId "$ATLAS_PROJECT_ID" &>/dev/null; then
  echo "[skip] cluster $CLUSTER"
else
  echo "Creating $TIER cluster $CLUSTER in $PROVIDER/$REGION_NAME ..."
  if [[ "$TIER" == "M0" ]]; then
    atlas clusters create "$CLUSTER" \
      --projectId "$ATLAS_PROJECT_ID" \
      --provider "$PROVIDER" \
      --region "$REGION_NAME" \
      --tier M0 \
      --mdbVersion 7.0
  else
    atlas clusters create "$CLUSTER" \
      --projectId "$ATLAS_PROJECT_ID" \
      --provider "$PROVIDER" \
      --region "$REGION_NAME" \
      --tier "$TIER" \
      --mdbVersion 7.0 \
      --diskSizeGB 10
  fi
  atlas clusters watch "$CLUSTER" --projectId "$ATLAS_PROJECT_ID"
fi

USER="${ATLAS_DB_USER:-nexryde_app}"
PASS="${ATLAS_DB_PASSWORD:-$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 24)}"
if ! atlas dbusers describe "$USER" --projectId "$ATLAS_PROJECT_ID" &>/dev/null; then
  atlas dbusers create --projectId "$ATLAS_PROJECT_ID" --username "$USER" --password "$PASS" \
    --role readWriteAnyDatabase --scope "$CLUSTER"
fi
atlas accessLists create "0.0.0.0/0" --projectId "$ATLAS_PROJECT_ID" --comment "nexryde cloud run" 2>/dev/null || true

SRV=$(atlas clusters connectionStrings describe "$CLUSTER" --projectId "$ATLAS_PROJECT_ID" -o json \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("standardSrv") or d.get("standard"))')
URI=$(python3 - <<PY
from urllib.parse import quote_plus
srv="$SRV"; user=quote_plus("$USER"); pw=quote_plus("$PASS")
scheme, rest = srv.split("://", 1)
uri = f"{scheme}://{user}:{pw}@{rest}"
sep = "&" if "?" in uri else "?"
print(uri + f"{sep}appName=nexryde-{('$MODE')}")
PY
)

if gcloud secrets describe "$SECRET" --project="$PROJECT_ID" &>/dev/null; then
  printf '%s' "$URI" | gcloud secrets versions add "$SECRET" --data-file=- --project="$PROJECT_ID"
else
  printf '%s' "$URI" | gcloud secrets create "$SECRET" --data-file=- --replication-policy=automatic --project="$PROJECT_ID"
fi

echo "OK — $SECRET set for cluster $CLUSTER ($PROVIDER/$REGION_NAME)"
echo "Point Cloud Run MONGODB_URI at $SECRET and use DB_NAME=$DB_HINT"
echo "Then: gcloud run services replace backend/cloudrun.africa-south1.yaml --region africa-south1"
