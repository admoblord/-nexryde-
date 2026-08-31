#!/usr/bin/env bash
# One entrypoint: verify fixes, optional live smoke, EAS APK + AAB.
#
# Usage:
#   ./scripts/one_click_ship.sh check    # safe: unit tests + lint + live smoke (needs network)
#   ./scripts/one_click_ship.sh all      # check + eas build (APK then AAB)
#
# Prerequisites for `all`:
#   - eas-cli: npx eas-cli whoami; for CI set EXPO_TOKEN
#
# Env (optional):
#   SKIP_LIVE_TESTS=1  — skip pytest against NEXRYDE_BACKEND_URL
#   NEXRYDE_BACKEND_URL — override API base for smoke tests (default: Emergent)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-}"

usage() {
  echo "Usage: $0 check | all"
  echo "  check  — backend unit checks, live smoke tests, frontend lint"
  echo "  all    — everything in check + EAS preview APK + EAS production AAB"
  exit 1
}

[[ -n "$MODE" ]] || usage
[[ "$MODE" == "check" || "$MODE" == "all" ]] || usage

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "NexRyde one_click_ship — mode=$MODE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "== 1/5 Backend offline checks (path policy + fare helpers) =="
bash "$ROOT/scripts/verify_core.sh"

echo ""
echo "== 2/5 Backend unit tests (wallet + earnings helpers) =="
(cd "$ROOT/backend" && PYTHONPATH=. python3 -m pytest \
  tests/test_wallet_trip_helpers.py \
  tests/test_earnings_query.py \
  -q)

if [[ "${SKIP_LIVE_TESTS:-}" == "1" ]]; then
  echo ""
  echo "== 3/5 Live API smoke SKIPPED (SKIP_LIVE_TESTS=1) =="
else
  echo ""
  echo "== 3/5 Live API smoke (active trip + chat presets; needs network) =="
  (cd "$ROOT/backend" && PYTHONPATH=. python3 -m pytest \
    tests/test_active_trip_and_call.py \
    tests/test_chat_and_call.py::TestChatPresets \
    -q --tb=no)
fi

echo ""
echo "== 4/5 Frontend typecheck + hub/safety route links =="
(cd "$ROOT/frontend" && npm run verify:app)

echo ""
echo "== 5/5 Frontend lint =="
(cd "$ROOT/frontend" && npm run lint)

if [[ "$MODE" == "check" ]]; then
  echo ""
  echo "✅ check complete. Deploy & Android: ./scripts/one_click_ship.sh all"
  exit 0
fi

echo ""
echo "== 5/6 EAS Android APK (profile: preview) =="
(cd "$ROOT/frontend" && npx eas-cli build --platform android --profile preview --non-interactive)

echo ""
echo "== 6/6 EAS Android AAB (profile: production / app-bundle) =="
(cd "$ROOT/frontend" && npx eas-cli build --platform android --profile production --non-interactive)

echo ""
echo "✅ all complete — EAS builds queued (API hosts on Emergent). Check https://expo.dev for build status."
