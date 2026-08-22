#!/bin/bash
# Runs scripts/scheduled-sync-subsplash.ts on this machine (ADR-0021), on a
# schedule via launchd — not GitHub Actions. Confirmed against production,
# in order:
#   1. A fresh username/password login from a GitHub Actions runner is
#      silently rejected (Subsplash flags the unrecognized IP/device).
#   2. Even a saved, genuinely-authenticated session gets rejected from a
#      different machine/network than it was established on — device trust
#      appears to be checked continuously, not just at login.
# Running on your own machine, on your own network — the same one used to
# capture the session — avoids both.
#
# Set up once:
#   1. cp scripts/.sync-local.env.example scripts/.sync-local.env
#      and fill in APP_BASE_URL / ATTENDANCE_IMPORT_TOKEN.
#   2. nvm use 24 && npm run sync:subsplash:capture-session
#      (sign in yourself; see that script's own comments)
#   3. Install the launchd job — see docs/adr/0021-subsplash-attendance-import.md
#      for the plist and `launchctl` commands.
#
# To re-authorize later (the session eventually expires): just re-run step 2.
# scripts/scheduled-sync-subsplash.ts reads scripts/.subsplash-profile/
# directly by default — nothing to copy into this script or anywhere else.

set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f scripts/.sync-local.env ]; then
  set -a
  # shellcheck disable=SC1091
  source scripts/.sync-local.env
  set +a
fi

# launchd runs jobs with a minimal environment (no shell profile sourced) —
# get onto Node 24 the same way the rest of this repo's tooling requires.
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  source "$NVM_DIR/nvm.sh"
  nvm use 24 >/dev/null
fi

if ! npx tsx scripts/scheduled-sync-subsplash.ts; then
  status=$?
  # No CI dashboard to notice a silent failure here — surface it locally.
  osascript -e 'display notification "Check scripts/.sync-local.log" with title "Subsplash attendance sync failed"' 2>/dev/null || true
  exit "$status"
fi
