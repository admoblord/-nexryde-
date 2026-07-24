#!/usr/bin/env bash
# Create a dedicated Atlas M0 (free) cluster for NexRyde staging and write
# MONGODB_URI_STAGING. Requires Atlas API keys:
#
#   export ATLAS_PUBLIC_KEY=...
#   export ATLAS_PRIVATE_KEY=...
#   export ATLAS_ORG_ID=...          # optional if only one org
#   export ATLAS_PROJECT_ID=...      # or ATLAS_PROJECT_NAME=nexryde-staging
#
# Usage:
#   ./backend/scripts/setup_staging_atlas_m0.sh
set -euo pipefail

PROJECT_ID="${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${GCP_REGION:-us-central1}"

if [[ -z "${ATLAS_PUBLIC_KEY:-}" || -z "${ATLAS_PRIVATE_KEY:-}" ]]; then
  echo "ERROR: Set ATLAS_PUBLIC_KEY and ATLAS_PRIVATE_KEY (Atlas → Access Manager → API Keys)." >&2
  exit 1
fi

if ! command -v atlas >/dev/null 2>&1; then
  echo "Installing Atlas CLI..."
  curl -fsSL https://pgp.mongodb.com/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor 2>/dev/null || true
  if command -v brew >/dev/null 2>&1; then
    brew install mongodb-atlas-cli
  else
    echo "ERROR: install Atlas CLI: https://www.mongodb.com/docs/atlas/cli/current/install-atlas-cli/" >&2
    exit 1
  fi
fi

atlas auth login --apiKey --publicApiKey "$ATLAS_PUBLIC_KEY" --privateApiKey "$ATLAS_PRIVATE_KEY" 2>/dev/null || \
  atlas config set public_api_key "$ATLAS_PUBLIC_KEY" && \
  atlas config set private_api_key "$ATLAS_PRIVATE_KEY"

ORG_ID="${ATLAS_ORG_ID:-$(atlas orgs list -o json | python3 -c 'import sys,json; d=json.load(sys.stdin); print((d.get("results") or d)[0]["id"])')}"
PROJECT_NAME="${ATLAS_PROJECT_NAME:-nexryde-staging}"
ATLAS_PROJECT_ID="${ATLAS_PROJECT_ID:-}"

if [[ -z "$ATLAS_PROJECT_ID" ]]; then
  ATLAS_PROJECT_ID=$(atlas projects list -o json 2>/dev/null | python3 -c "
import sys,json,os
name=os.environ.get('PROJECT_NAME','nexryde-staging')
d=json.load(sys.stdin)
rows=d.get('results') or d
for p in rows:
  if p.get('name')==name:
    print(p['id']); break
" PROJECT_NAME="$PROJECT_NAME" || true)
fi

if [[ -z "$ATLAS_PROJECT_ID" ]]; then
  echo "Creating Atlas project $PROJECT_NAME ..."
  ATLAS_PROJECT_ID=$(atlas projects create "$PROJECT_NAME" --orgId "$ORG_ID" -o json | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
fi

CLUSTER="${ATLAS_CLUSTER_NAME:-nexryde-staging-m0}"
if atlas clusters describe "$CLUSTER" --projectId "$ATLAS_PROJECT_ID" &>/dev/null; then
  echo "[skip] cluster $CLUSTER exists"
else
  echo "Creating M0 cluster $CLUSTER (FREE) in $REGION-equivalent ..."
  # M0 provider region: use CENTRAL_US for us-central affinity
  atlas clusters create "$CLUSTER" \
    --projectId "$ATLAS_PROJECT_ID" \
    --provider AWS \
    --region CENTRAL_US \
    --tier M0 \
    --mdbVersion 7.0 \
    --diskSizeGB 2 \
    --backup false
  atlas clusters watch "$CLUSTER" --projectId "$ATLAS_PROJECT_ID"
fi

# DB user
USER="${ATLAS_DB_USER:-nexryde_staging}"
PASS="${ATLAS_DB_PASSWORD:-$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 24)}"
if atlas dbusers describe "$USER" --projectId "$ATLAS_PROJECT_ID" &>/dev/null; then
  echo "[skip] dbuser $USER"
else
  atlas dbusers create \
    --projectId "$ATLAS_PROJECT_ID" \
    --username "$USER" \
    --password "$PASS" \
    --role readWriteAnyDatabase,dbAdminAnyDatabase \
    --scope "$CLUSTER"
fi

# Allow GCP / 0.0.0.0 for Cloud Run egress (tighten later)
atlas accessLists create "0.0.0.0/0" --projectId "$ATLAS_PROJECT_ID" --comment "nexryde staging Cloud Run" 2>/dev/null || true

SRV=$(atlas clusters connectionStrings describe "$CLUSTER" --projectId "$ATLAS_PROJECT_ID" -o json \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("standardSrv") or d.get("standard"))')
# Inject credentials into SRV
URI=$(python3 - <<PY
from urllib.parse import quote_plus, urlparse, urlunparse
srv="$SRV"
user=quote_plus("$USER")
pw=quote_plus("$PASS")
# mongodb+srv://host/...
if "://" in srv:
  scheme, rest = srv.split("://", 1)
  uri = f"{scheme}://{user}:{pw}@{rest}"
  if "?" in uri:
    uri += "&appName=nexryde-staging"
  else:
    uri += "/?appName=nexryde-staging"
  print(uri)
else:
  print(srv)
PY
)

printf '%s' "$URI" | gcloud secrets versions add MONGODB_URI_STAGING --data-file=- --project="$PROJECT_ID" \
  || (gcloud secrets create MONGODB_URI_STAGING --data-file=- --replication-policy=automatic --project="$PROJECT_ID" <<<"$URI")

echo "OK — MONGODB_URI_STAGING updated for dedicated M0 cluster $CLUSTER"
echo "Redeploy: gcloud run services replace backend/cloudrun.staging.yaml --region $REGION"
