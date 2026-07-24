#!/usr/bin/env bash
# Provision GCP Managed Service for Apache Kafka for NexRyde staging + prod.
#
# Usage:
#   ./backend/scripts/setup_managed_kafka.sh staging
#   ./backend/scripts/setup_managed_kafka.sh prod
#
# Requires: gcloud auth, managedkafka API, VPC subnet in REGION.
# Writes Secret Manager: KAFKA_BOOTSTRAP_SERVERS[_STAGING]
# Grants Cloud Run SAs roles/managedkafka.client (+ token creator roles).
set -euo pipefail

ENV_NAME="${1:-}"
if [[ "$ENV_NAME" != "staging" && "$ENV_NAME" != "prod" ]]; then
  echo "Usage: $0 staging|prod" >&2
  exit 1
fi

PROJECT_ID="${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${GCP_REGION:-us-central1}"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"

if [[ "$ENV_NAME" == "staging" ]]; then
  CLUSTER_ID="${KAFKA_CLUSTER_ID:-nexryde-kafka-staging}"
  SECRET_NAME="KAFKA_BOOTSTRAP_SERVERS_STAGING"
  # Prefer staging Cloud Run SA if present; else default compute SA.
  RUN_SA="${CLOUD_RUN_SA:-$(gcloud run services describe nexryde-backend-staging --region="$REGION" --format='value(spec.template.spec.serviceAccountName)' 2>/dev/null || true)}"
  WORKER_SA="$RUN_SA"
else
  CLUSTER_ID="${KAFKA_CLUSTER_ID:-nexryde-kafka-prod}"
  SECRET_NAME="KAFKA_BOOTSTRAP_SERVERS"
  RUN_SA="${CLOUD_RUN_SA:-$(gcloud run services describe nexryde-backend --region="$REGION" --format='value(spec.template.spec.serviceAccountName)' 2>/dev/null || true)}"
  WORKER_SA="$RUN_SA"
fi

SUBNET="${KAFKA_SUBNET:-projects/${PROJECT_ID}/regions/${REGION}/subnetworks/default}"
CPU="${KAFKA_CPU:-3}"
MEMORY="${KAFKA_MEMORY:-3GiB}"

echo "Project=$PROJECT_ID Region=$REGION Env=$ENV_NAME Cluster=$CLUSTER_ID"
echo "Subnet=$SUBNET"

gcloud services enable managedkafka.googleapis.com secretmanager.googleapis.com --project="$PROJECT_ID"

# ── Create cluster (idempotent) ─────────────────────────────────────────────
if gcloud managed-kafka clusters describe "$CLUSTER_ID" --location="$REGION" --project="$PROJECT_ID" &>/dev/null; then
  echo "[skip] cluster $CLUSTER_ID already exists"
else
  echo "[create] Managed Kafka cluster $CLUSTER_ID ..."
  gcloud managed-kafka clusters create "$CLUSTER_ID" \
    --location="$REGION" \
    --cpu="$CPU" \
    --memory="$MEMORY" \
    --subnets="$SUBNET" \
    --project="$PROJECT_ID" \
    --async
  echo "Waiting for cluster ACTIVE (this can take several minutes)..."
  for _ in $(seq 1 60); do
    STATE="$(gcloud managed-kafka clusters describe "$CLUSTER_ID" --location="$REGION" --project="$PROJECT_ID" --format='value(state)' 2>/dev/null || echo CREATING)"
    echo "  state=$STATE"
    [[ "$STATE" == "ACTIVE" ]] && break
    sleep 30
  done
fi

BOOTSTRAP="$(gcloud managed-kafka clusters describe "$CLUSTER_ID" --location="$REGION" --project="$PROJECT_ID" --format='value(bootstrapAddress)')"
if [[ -z "$BOOTSTRAP" ]]; then
  echo "ERROR: could not resolve bootstrapAddress" >&2
  exit 1
fi
echo "Bootstrap: $BOOTSTRAP"

# ── Topics ──────────────────────────────────────────────────────────────────
TOPICS=(nexryde.presence nexryde.offers nexryde.trips nexryde.saga nexryde.surge)
PARTITIONS="${KAFKA_PARTITIONS:-6}"
REPLICATION="${KAFKA_REPLICATION:-3}"

for TOPIC in "${TOPICS[@]}"; do
  if gcloud managed-kafka topics describe "$TOPIC" --cluster="$CLUSTER_ID" --location="$REGION" --project="$PROJECT_ID" &>/dev/null; then
    echo "[skip] topic $TOPIC"
  else
    echo "[create] topic $TOPIC"
    gcloud managed-kafka topics create "$TOPIC" \
      --cluster="$CLUSTER_ID" \
      --location="$REGION" \
      --partitions="$PARTITIONS" \
      --replication-factor="$REPLICATION" \
      --project="$PROJECT_ID" || echo "  (topic create may need ACTIVE cluster — retry later)"
  fi
done

# ── Secret Manager ──────────────────────────────────────────────────────────
if gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" &>/dev/null; then
  echo -n "$BOOTSTRAP" | gcloud secrets versions add "$SECRET_NAME" --data-file=- --project="$PROJECT_ID"
  echo "[updated] secret $SECRET_NAME"
else
  echo -n "$BOOTSTRAP" | gcloud secrets create "$SECRET_NAME" --data-file=- --replication-policy=automatic --project="$PROJECT_ID"
  echo "[created] secret $SECRET_NAME"
fi

# ── IAM on Cloud Run service accounts ───────────────────────────────────────
grant_roles() {
  local member="$1"
  [[ -z "$member" ]] && return 0
  if [[ "$member" != serviceAccount:* ]]; then
    member="serviceAccount:${member}"
  fi
  for ROLE in roles/managedkafka.client roles/iam.serviceAccountTokenCreator roles/iam.serviceAccountOpenIdTokenCreator; do
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
      --member="$member" \
      --role="$ROLE" \
      --condition=None \
      --quiet >/dev/null || true
  done
  gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
    --member="$member" \
    --role=roles/secretmanager.secretAccessor \
    --project="$PROJECT_ID" --quiet >/dev/null || true
  echo "[iam] granted kafka + secret access to $member"
}

if [[ -z "$RUN_SA" || "$RUN_SA" == "null" ]]; then
  RUN_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
  echo "[warn] using default compute SA: $RUN_SA"
fi
grant_roles "$RUN_SA"

# Worker service (if already deployed)
for SVC in nexryde-kafka-worker nexryde-kafka-worker-staging; do
  WSA="$(gcloud run services describe "$SVC" --region="$REGION" --format='value(spec.template.spec.serviceAccountName)' 2>/dev/null || true)"
  if [[ -n "$WSA" && "$WSA" != "null" ]]; then
    grant_roles "$WSA"
  fi
done

cat <<EOF

OK — Managed Kafka ready for $ENV_NAME

  Cluster:   $CLUSTER_ID ($REGION)
  Bootstrap: $BOOTSTRAP
  Secret:    $SECRET_NAME

Next:
  # Staging
  gcloud run services replace backend/cloudrun.staging.yaml --region $REGION
  gcloud run services replace backend/cloudrun.kafka-worker.staging.yaml --region $REGION

  # Prod
  gcloud run services replace backend/cloudrun.service.yaml --region $REGION
  gcloud run services replace backend/cloudrun.kafka-worker.yaml --region $REGION

EOF
