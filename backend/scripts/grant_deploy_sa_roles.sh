#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Grant the GitHub Actions deploy SA the roles CI soft-fails without:
#   - roles/monitoring.admin          → sync Cloud Monitoring alerts/uptime
#   - roles/cloudscheduler.admin      → create/update maintenance-tick job
#   - roles/secretmanager.secretAccessor on NEXRYDE_OPS_KEY
#
# Usage (as a project Owner / IAM admin):
#   gcloud auth login
#   gcloud config set project nexryde-app
#   DEPLOY_SA=github-deploy@nexryde-app.iam.gserviceaccount.com \
#     bash backend/scripts/grant_deploy_sa_roles.sh
#
# If DEPLOY_SA is unset, the script lists candidate SAs and asks you to set it.
# After granting, optionally sync monitoring:
#   bash backend/scripts/setup_monitoring.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-nexryde-app}"
OPS_SECRET="${OPS_SECRET:-NEXRYDE_OPS_KEY}"

echo "Project: ${PROJECT_ID}"

if [[ -z "${DEPLOY_SA:-}" ]]; then
  echo ""
  echo "DEPLOY_SA not set. Candidate service accounts in ${PROJECT_ID}:"
  gcloud iam service-accounts list --project="$PROJECT_ID" \
    --format='table(email,displayName)' || true
  echo ""
  echo "Find the email used by GitHub Actions secret GCP_SERVICE_ACCOUNT, then re-run:"
  echo "  DEPLOY_SA=<email> bash backend/scripts/grant_deploy_sa_roles.sh"
  echo ""
  echo "Tip: after the next deploy, the 'Sync Cloud Monitoring alerts' / scheduler"
  echo "steps also print the active account via gcloud auth list."
  exit 2
fi

MEMBER="serviceAccount:${DEPLOY_SA}"
echo "Granting roles to ${MEMBER}"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="$MEMBER" \
  --role="roles/monitoring.admin" \
  --condition=None \
  --quiet

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="$MEMBER" \
  --role="roles/cloudscheduler.admin" \
  --condition=None \
  --quiet

if gcloud secrets describe "$OPS_SECRET" --project="$PROJECT_ID" &>/dev/null; then
  gcloud secrets add-iam-policy-binding "$OPS_SECRET" \
    --project="$PROJECT_ID" \
    --member="$MEMBER" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet
  echo "  ✓ secretAccessor on ${OPS_SECRET}"
else
  echo "  ⚠ secret ${OPS_SECRET} not found — skip secret IAM (create it, then re-run)"
fi

echo ""
echo "✅ Grants applied for ${DEPLOY_SA}"
echo "   Next: bash backend/scripts/setup_monitoring.sh"
echo "   Or merge PR #12 and re-run the production deploy — CI will sync alerts."
