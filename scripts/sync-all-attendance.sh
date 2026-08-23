#!/usr/bin/env bash
# Runs all 3 curated attendance syncs (ADR-0021) in one go: Sunday School
# [Arlington], Sunday School [Leesburg], and LITURGY — the same 3 series
# pinned on the Reports page (app/(dashboard)/reports/page.tsx).
#
# Export each occurrence's CSV from the Subsplash dashboard first
# (Events → Check-In → the occurrence → Export), then run:
#
#   nvm use 24
#   ./scripts/sync-all-attendance.sh \
#     ~/Downloads/arlington.csv \
#     ~/Downloads/leesburg.csv \
#     ~/Downloads/liturgy.csv
#
# Required env (same as the underlying script):
#   APP_BASE_URL             e.g. https://directory.example.org
#   ATTENDANCE_IMPORT_TOKEN
#
# Re-running with the same files is safe — the import upserts, so it never
# duplicates rows (see lib/attendanceImport.ts).

set -uo pipefail

if [ "$#" -ne 3 ]; then
  echo "Usage: $0 <arlington.csv> <leesburg.csv> <liturgy.csv>" >&2
  exit 1
fi

ARLINGTON_CSV="$1"
LEESBURG_CSV="$2"
LITURGY_CSV="$3"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FAILED=0

run_sync() {
  local label="$1"
  local file="$2"
  local event_id="$3"
  echo "=== ${label} ==="
  if ! npx tsx "${SCRIPT_DIR}/sync-subsplash-attendance.ts" --file "${file}" --event-id "${event_id}"; then
    FAILED=1
  fi
  echo
}

run_sync "Sunday School [Arlington]" "${ARLINGTON_CSV}" "cf945785-424e-4537-9026-97260f911a6e"
run_sync "Sunday School [Leesburg]"  "${LEESBURG_CSV}"  "8afcd344-51e4-4cf2-8d77-2dbb67dd0ecc"
run_sync "LITURGY"                   "${LITURGY_CSV}"   "b20a0f15-8403-47eb-aee1-dec62bc66fc6"

if [ "$FAILED" -ne 0 ]; then
  echo "One or more syncs completed with errors — see above."
  exit 1
fi
echo "All 3 syncs completed successfully."
