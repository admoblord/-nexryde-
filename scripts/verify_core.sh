#!/usr/bin/env bash
# One-shot: path-policy unit tests + parsing helpers (no Mongo/FastAPI required).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"
export PYTHONPATH=.
python3 -m pytest tests/test_core_fare_and_realtime.py tests/test_nexryde_api_paths.py -q
echo "verify_core: OK"
if [ -n "${NEXRYDE_BACKEND_URL:-}" ]; then
  curl -sfS "${NEXRYDE_BACKEND_URL%/}/api/health/ready" >/dev/null && echo "verify_core: remote health/ready OK" || echo "verify_core: remote health/ready skipped or failed"
fi
