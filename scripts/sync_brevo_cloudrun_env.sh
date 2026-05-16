#!/usr/bin/env bash
# Push Brevo REST credentials from backend/.env to Cloud Run (never prints secrets).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT}/backend/.env"
PROJECT="${GCP_PROJECT:-nexryde-app}"
REGION="${GCP_REGION:-us-central1}"
SERVICE="${CLOUD_RUN_SERVICE:-nexryde-backend}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — set BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME"
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

for var in BREVO_API_KEY BREVO_SENDER_EMAIL; do
  if [[ -z "${!var:-}" ]]; then
    echo "ERROR: $var is empty in $ENV_FILE"
    exit 1
  fi
done

BREVO_SENDER_NAME="${BREVO_SENDER_NAME:-NEXRYDE}"
EMAIL_OTP_FROM="${EMAIL_OTP_FROM:-$BREVO_SENDER_EMAIL}"

echo "Updating Cloud Run env on $SERVICE ($PROJECT / $REGION)…"
gcloud run services update "$SERVICE" \
  --project="$PROJECT" \
  --region="$REGION" \
  --update-env-vars="BREVO_API_KEY=${BREVO_API_KEY},BREVO_SENDER_EMAIL=${BREVO_SENDER_EMAIL},BREVO_SENDER_NAME=${BREVO_SENDER_NAME},EMAIL_OTP_FROM=${EMAIL_OTP_FROM}" \
  --quiet

echo "OK — Brevo REST vars applied. Test: POST /api/auth/email-otp/request"
