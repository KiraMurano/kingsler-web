#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

cleanup() {
  trap - EXIT INT TERM
  kill 0 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Local dev only: the server falls back to this if JWT_SECRET is unset, but
# setting it here keeps sessions stable across server restarts during dev.
export JWT_SECRET="${JWT_SECRET:-dev-insecure-secret-do-not-use-in-production}"

npm run dev --workspace=apps/server &
npm run dev --workspace=apps/web -- --open &
wait
