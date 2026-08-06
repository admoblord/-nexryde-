#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# NexRyde — GCP billing budget alerts (project-level)
#
# Creates / updates a monthly budget on the nexryde-app billing account with
# email threshold rules at 50% / 90% / 100% of the amount.
#
# Usage:
#   BILLING_ACCOUNT=012345-ABCDEF-678901 \
#   BUDGET_AMOUNT_USD=50 \
#   bash backend/scripts/setup_billing_budgets.sh
#
# Prerequisites:
#   gcloud auth login
#   roles/billing.costsManager (or billing.admin) on the billing account
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-nexryde-app}"
BUDGET_AMOUNT_USD="${BUDGET_AMOUNT_USD:-50}"
BUDGET_DISPLAY_NAME="${BUDGET_DISPLAY_NAME:-NEXRYDE monthly cloud spend}"

if [[ -z "${BILLING_ACCOUNT:-}" ]]; then
  BILLING_ACCOUNT=$(gcloud billing projects describe "$PROJECT_ID" \
    --format='value(billingAccountName)' 2>/dev/null | sed 's#billingAccounts/##' || true)
fi

if [[ -z "${BILLING_ACCOUNT:-}" ]]; then
  echo "ERROR: set BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX (or link billing on ${PROJECT_ID})" >&2
  exit 1
fi

echo "Creating/updating budget on billing account ${BILLING_ACCOUNT}"
echo "  project=${PROJECT_ID} amount=\$${BUDGET_AMOUNT_USD}/month"

if ! gcloud billing budgets list --billing-account="$BILLING_ACCOUNT" &>/dev/null; then
  echo "ERROR: cannot list budgets — need roles/billing.costsManager on ${BILLING_ACCOUNT}" >&2
  exit 2
fi

EXISTING=$(gcloud billing budgets list --billing-account="$BILLING_ACCOUNT" \
  --filter="displayName='${BUDGET_DISPLAY_NAME}'" \
  --format='value(name)' | head -1 || true)

ARGS=(
  --billing-account="$BILLING_ACCOUNT"
  --display-name="$BUDGET_DISPLAY_NAME"
  --budget-amount="${BUDGET_AMOUNT_USD}USD"
  --filter-projects="projects/${PROJECT_ID}"
  --threshold-rule=percent=0.5
  --threshold-rule=percent=0.9
  --threshold-rule=percent=1.0
  --calendar-period=MONTH
)

if [[ -n "$EXISTING" ]]; then
  # Resource name already encodes the billing account.
  gcloud billing budgets update "$EXISTING" \
    --display-name="$BUDGET_DISPLAY_NAME" \
    --budget-amount="${BUDGET_AMOUNT_USD}USD" \
    --filter-projects="projects/${PROJECT_ID}" \
    --clear-threshold-rules \
    --threshold-rule=percent=0.5 \
    --threshold-rule=percent=0.9 \
    --threshold-rule=percent=1.0 \
    --calendar-period=MONTH
  echo "Updated budget: $EXISTING"
else
  gcloud billing budgets create "${ARGS[@]}"
  echo "Created budget: $BUDGET_DISPLAY_NAME"
fi

echo ""
echo "View: https://console.cloud.google.com/billing/${BILLING_ACCOUNT}/budgets"
echo "Tip: Billing admins / essential contacts get the threshold emails by default."
