#!/usr/bin/env bash
# Chaos release gate — run before every production release.
# Exit 0 only if no lost offers, no duplicate accepts, reconnect/heal OK.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/backend"

export JWT_SECRET="${JWT_SECRET:-test-chaos-rt}"
export ALLOW_INSECURE_JWT_FOR_TESTS=1
export REDIS_REQUIRED=false
export NEXRYDE_REALTIME_PLATFORM=true

SCALE="${1:-ci}"
if [[ "$SCALE" == "full" || "$SCALE" == "release" ]]; then
  export CHAOS_OFFER_N="${CHAOS_OFFER_N:-10000}"
  export CHAOS_ONLINE_N="${CHAOS_ONLINE_N:-5000}"
  echo "Chaos release gate FULL scale offers=$CHAOS_OFFER_N online=$CHAOS_ONLINE_N"
else
  export CHAOS_OFFER_N="${CHAOS_OFFER_N:-500}"
  export CHAOS_ONLINE_N="${CHAOS_ONLINE_N:-200}"
  echo "Chaos release gate CI scale offers=$CHAOS_OFFER_N online=$CHAOS_ONLINE_N"
fi

python3 -m pytest \
  tests/chaos/test_realtime_chaos.py \
  tests/chaos/test_release_gate.py \
  tests/test_delivery_guarantee_device_health.py \
  -q --tb=line

echo "PASS: chaos release gate ($SCALE)"
