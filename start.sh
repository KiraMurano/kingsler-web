#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

cleanup() {
  trap - EXIT INT TERM
  kill 0 2>/dev/null || true
}
trap cleanup EXIT INT TERM

npm run dev --workspace=apps/server &
npm run dev --workspace=apps/web -- --open &
wait
