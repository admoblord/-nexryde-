#!/usr/bin/env bash
# Fail production deploys that are not running from origin/main.
#
# Usage (source or exec):
#   source scripts/require_main_for_prod_deploy.sh
#   # or
#   bash scripts/require_main_for_prod_deploy.sh
#
# Escape hatch (emergencies only — do not use for routine ship):
#   ALLOW_NON_MAIN_PROD_DEPLOY=1

set -euo pipefail

if [[ "${ALLOW_NON_MAIN_PROD_DEPLOY:-}" == "1" ]]; then
  echo "WARN: ALLOW_NON_MAIN_PROD_DEPLOY=1 — skipping main-branch guard" >&2
  return 0 2>/dev/null || exit 0
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v git >/dev/null 2>&1; then
  echo "ERROR: git not found — cannot enforce main-only production deploys." >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "ERROR: not inside a git work tree — refusing production deploy." >&2
  exit 1
fi

git fetch origin main --quiet 2>/dev/null || true

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
HEAD_SHA="$(git rev-parse HEAD)"
MAIN_SHA="$(git rev-parse origin/main 2>/dev/null || true)"

if [[ -z "${MAIN_SHA}" ]]; then
  echo "ERROR: origin/main not available — refusing production deploy." >&2
  exit 1
fi

if [[ "$BRANCH" != "main" ]]; then
  echo "ERROR: production deploy refused — current branch is '${BRANCH}', not main." >&2
  echo "       Checkout main (or merge your PR) and redeploy from main only." >&2
  exit 1
fi

if [[ "$HEAD_SHA" != "$MAIN_SHA" ]]; then
  echo "ERROR: production deploy refused — HEAD (${HEAD_SHA:0:8}) != origin/main (${MAIN_SHA:0:8})." >&2
  echo "       git pull origin main and retry so prod matches GitHub main." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: production deploy refused — working tree is dirty." >&2
  echo "       Commit/push on main or stash before deploying." >&2
  exit 1
fi

echo "OK — production deploy guard passed (main @ ${HEAD_SHA:0:8})."
