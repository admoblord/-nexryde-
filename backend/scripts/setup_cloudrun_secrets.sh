#!/usr/bin/env bash
# setup_cloudrun_secrets.sh
#
# One-time Secret Manager provisioning for NexRyde Cloud Run.
# Run this BEFORE your first `gcloud run services replace cloudrun.service.yaml`.
#
# Usage:
#   chmod +x backend/scripts/setup_cloudrun_secrets.sh
#   ./backend/scripts/setup_cloudrun_secrets.sh
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - Active project set: gcloud config set project YOUR_PROJECT_ID
#   - Secret Manager API enabled: gcloud services enable secretmanager.googleapis.com
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [[ -z "$PROJECT_ID" ]]; then
  echo "ERROR: No active gcloud project. Run: gcloud config set project YOUR_PROJECT_ID" >&2
  exit 1
fi
echo "Project: $PROJECT_ID"

# ── 1. Create secrets (idempotent — skips if already exists) ──────────────────

SECRETS=(
  JWT_SECRET
  MONGODB_URI
  SQUAD_SECRET_KEY
  SQUAD_PUBLIC_KEY
  SQUAD_WEBHOOK_SECRET
  ADMIN_PASSWORD
  REDIS_URL
  BREVO_API_KEY
  GOOGLE_MAPS_API_KEY
  NEXRYDE_OPS_KEY
)

for SECRET in "${SECRETS[@]}"; do
  if gcloud secrets describe "$SECRET" --project="$PROJECT_ID" &>/dev/null; then
    echo "  [skip] $SECRET already exists"
  else
    gcloud secrets create "$SECRET" \
      --replication-policy=automatic \
      --project="$PROJECT_ID"
    echo "  [created] $SECRET"
  fi
done

# ── 2. Auto-generate secrets that have no user-supplied value ─────────────────
# JWT_SECRET and NEXRYDE_OPS_KEY are random — generate them automatically.
# All others require your real values. The script will prompt for each.

_add_version_if_empty() {
  local secret=$1
  local value=$2
  local count
  count=$(gcloud secrets versions list "$secret" --project="$PROJECT_ID" \
            --filter="state=ENABLED" --format="value(name)" 2>/dev/null | wc -l)
  if [[ "$count" -eq 0 ]]; then
    printf '%s' "$value" | gcloud secrets versions add "$secret" \
      --data-file=- --project="$PROJECT_ID"
    echo "  [populated] $secret"
  else
    echo "  [skip] $secret already has a version"
  fi
}

echo ""
echo "── Auto-generated secrets ────────────────────────────────────────────────"
_add_version_if_empty JWT_SECRET       "$(openssl rand -hex 32)"
_add_version_if_empty NEXRYDE_OPS_KEY  "$(openssl rand -hex 32)"

echo ""
echo "── Secrets requiring your values ────────────────────────────────────────"
MANUAL=(
  MONGODB_URI
  SQUAD_SECRET_KEY
  SQUAD_PUBLIC_KEY
  SQUAD_WEBHOOK_SECRET
  ADMIN_PASSWORD
  REDIS_URL
  BREVO_API_KEY
  GOOGLE_MAPS_API_KEY
)

for SECRET in "${MANUAL[@]}"; do
  count=$(gcloud secrets versions list "$SECRET" --project="$PROJECT_ID" \
            --filter="state=ENABLED" --format="value(name)" 2>/dev/null | wc -l)
  if [[ "$count" -eq 0 ]]; then
    read -rsp "  Enter value for $SECRET (input hidden): " VALUE
    echo ""
    printf '%s' "$VALUE" | gcloud secrets versions add "$SECRET" \
      --data-file=- --project="$PROJECT_ID"
    echo "  [populated] $SECRET"
  else
    echo "  [skip] $SECRET already has a version"
  fi
done

# ── 3. Grant Cloud Run service account access ─────────────────────────────────
echo ""
echo "── Granting Cloud Run SA access to secrets ───────────────────────────────"

# Get the service account (falls back to Compute default if service not deployed yet)
SA=$(gcloud run services describe nexryde-backend \
       --region us-central1 --project="$PROJECT_ID" \
       --format='value(spec.template.spec.serviceAccountName)' 2>/dev/null || true)

if [[ -z "$SA" ]]; then
  # Service not yet deployed — use the project's default compute SA
  PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
  SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
  echo "  (service not yet deployed — using default compute SA: $SA)"
fi

for SECRET in "${SECRETS[@]}"; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:${SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --project="$PROJECT_ID" \
    --quiet
done
echo "  [done] IAM bindings applied"

echo ""
echo "All secrets provisioned. You can now deploy:"
echo "  gcloud run services replace backend/cloudrun.service.yaml --region us-central1"
