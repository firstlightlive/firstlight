#!/usr/bin/env bash
# Loop backfill: 90 rows per batch, 15.5-min sleep between batches (covers Strava's 100/15min limit)
# Stops when remaining <= 0 OR after 10 batches (safety cap).
#
# Required env:
#   SUPABASE_ACCESS_TOKEN  Supabase Management API token (sbp_…)  — used to read admin_api_key from secrets table
# Optional env:
#   ADMIN_API_KEY          If set, skips the Management lookup.
#
# Run:
#   SUPABASE_ACCESS_TOKEN=sbp_… bash scripts/backfill-strava-calories.sh
set -eo pipefail
cd "$(dirname "$0")/.."

LOG=/tmp/fl_strava_backfill.log
echo "── Backfill started $(date -Iseconds) ──" > "$LOG"

PROJ='edgnudrbysybefbqyijq'

if [ -z "$ADMIN_API_KEY" ]; then
  if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
    echo "ERROR: set SUPABASE_ACCESS_TOKEN (sbp_…) or ADMIN_API_KEY in env" | tee -a "$LOG"
    exit 1
  fi
  ADMIN_API_KEY=$(curl -s -X POST "https://api.supabase.com/v1/projects/${PROJ}/database/query" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" -H "Content-Type: application/json" \
    -d '{"query":"SELECT value FROM secrets WHERE key = '\''admin_api_key'\''"}' \
    | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log(j[0]?.value || '');});")
fi

if [ -z "$ADMIN_API_KEY" ]; then
  echo "ERROR: could not resolve admin_api_key" | tee -a "$LOG"
  exit 1
fi

# Public anon JWT — published already in website/js/config.js; safe to derive locally.
SUPA_KEY=$(node -e "console.log(['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9','eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkZ251ZHJieXN5YmVmYnF5aWpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNTExNjEsImV4cCI6MjA5MTgyNzE2MX0','UOTH1J-022hwSQZ2QkpiRxw3wtctaVsJQEBoLYYMkHk'].join('.'))")

call_batch() {
  curl -s -X POST "https://edgnudrbysybefbqyijq.supabase.co/functions/v1/firstlight-sync?action=backfill-strava-calories&limit=90&admin_key=${ADMIN_API_KEY}" \
    -H "Authorization: Bearer ${SUPA_KEY}"
}

# Sleep 15min30s between batches to respect Strava's 100-reads/15min rolling window
SLEEP_BETWEEN=930

for i in 1 2 3 4 5 6 7 8 9 10; do
  if [ "$i" -gt 1 ]; then
    echo "  sleeping ${SLEEP_BETWEEN}s (Strava 100/15min rate-limit window)..." | tee -a "$LOG"
    sleep "$SLEEP_BETWEEN"
  fi
  echo "── Batch $i @ $(date -Iseconds) ──" | tee -a "$LOG"
  RESP=$(call_batch)
  echo "$RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(JSON.stringify({batch:$i,processed:j.processed,remaining:j.remaining,hits:j.hits,nullCalories:j.nullCalories,rateLimited:j.rateLimited}));}catch(e){console.log('RAW:'+d.slice(0,300));}});" | tee -a "$LOG"

  REMAINING=$(echo "$RESP" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(j.remaining ?? -1);}catch(e){console.log(-1);}})")
  if [ "$REMAINING" -le 0 ] 2>/dev/null; then
    echo "── Done @ $(date -Iseconds) — remaining=${REMAINING} ──" | tee -a "$LOG"
    exit 0
  fi
done

echo "── Reached batch cap @ $(date -Iseconds) — remaining=${REMAINING} ──" | tee -a "$LOG"
