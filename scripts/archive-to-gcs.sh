#!/bin/bash
# ═══════════════════════════════════════════════════════
# FIRST LIGHT — Daily Archive to Google Cloud Storage
# Runs locally via cron — no service account key needed
# Uses your authenticated gcloud credentials
#
# Setup: crontab -e → add:
# 0 2 * * * /Users/Anupamlive/AnupamWork/firstlight/scripts/archive-to-gcs.sh
# (runs daily at 2:00 AM)
# ═══════════════════════════════════════════════════════

set -e

SUPABASE_URL="https://edgnudrbysybefbqyijq.supabase.co"
SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkZ251ZHJieXN5YmVmYnF5aWpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNTExNjEsImV4cCI6MjA5MTgyNzE2MX0.UOTH1J-022hwSQZ2QkpiRxw3wtctaVsJQEBoLYYMkHk"
GCS_BUCKET="gs://firstlightlive_archive"
DATE=$(date +%Y-%m-%d)
YEAR=$(date +%Y)
MONTH=$(date +%m)
DAY=$(date +%d)
GCS_PATH="${GCS_BUCKET}/firstlight/${YEAR}/${MONTH}/${DAY}"
TMP_DIR="/tmp/firstlight-archive-${DATE}"
LOG_FILE="/tmp/firstlight-archive.log"

# First, get a valid JWT by signing in
# We need the service role key OR authenticated session for private tables
# Using anon key — only public tables will export
# For private tables, we need to sign in first

echo "[$(date)] Starting archive for ${DATE}" | tee -a "$LOG_FILE"

mkdir -p "$TMP_DIR"

TABLES=(
  "comments"
  "comment_reactions"
  "visitor_identities"
  "auth_audit_log"
)

# Note: Private tables (daily_rituals, journal_entries, etc.) need authenticated JWT
# For full archive, sign in first:
echo "[$(date)] Signing in to get JWT..." | tee -a "$LOG_FILE"
LOGIN_RESP=$(curl -s "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"email":"firstlightlive@gmail.com","password":"'"${FL_PASSWORD}"'"}')

JWT=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)

if [ -z "$JWT" ]; then
  echo "[$(date)] ERROR: Login failed. Set FL_PASSWORD env var." | tee -a "$LOG_FILE"
  echo "  Usage: FL_PASSWORD='yourpass' $0" | tee -a "$LOG_FILE"
  # Fall back to public tables only
  AUTH_HEADER="Bearer ${SUPABASE_KEY}"
  echo "[$(date)] Falling back to public tables only" | tee -a "$LOG_FILE"
else
  AUTH_HEADER="Bearer ${JWT}"
  echo "[$(date)] Authenticated. Archiving ALL tables." | tee -a "$LOG_FILE"
  TABLES+=(
    "daily_rituals" "journal_entries" "daily_logs" "races"
    "weekly_metrics" "monthly_grids" "deep_work_sessions"
    "engagement_counters" "config" "ritual_definitions"
    "ritual_completions" "stories_completions" "weekly_schedule"
    "mastery_daily" "mastery_weekly" "mastery_monthly_scores"
    "mastery_ideas" "brahma_daily" "brahma_weekly"
    "archive_log" "voice_entries" "gym_workouts" "gym_sets"
  )
fi

TABLES_ARCHIVED=0
ROWS_ARCHIVED=0

for TABLE in "${TABLES[@]}"; do
  echo -n "  ${TABLE}..." | tee -a "$LOG_FILE"

  # Fetch all rows
  RESP=$(curl -s "${SUPABASE_URL}/rest/v1/${TABLE}?select=*" \
    -H "apikey: ${SUPABASE_KEY}" \
    -H "Authorization: ${AUTH_HEADER}")

  # Check if we got data
  if [ "$RESP" = "[]" ] || [ -z "$RESP" ]; then
    echo " empty" | tee -a "$LOG_FILE"
    continue
  fi

  # Convert to NDJSON (one JSON object per line — BigQuery native format)
  echo "$RESP" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if isinstance(data, list):
    for row in data:
        print(json.dumps(row))
" > "${TMP_DIR}/${TABLE}.ndjson" 2>/dev/null

  ROWS=$(wc -l < "${TMP_DIR}/${TABLE}.ndjson" | tr -d ' ')
  echo " ${ROWS} rows" | tee -a "$LOG_FILE"

  TABLES_ARCHIVED=$((TABLES_ARCHIVED + 1))
  ROWS_ARCHIVED=$((ROWS_ARCHIVED + ROWS))
done

# Upload to GCS
echo "[$(date)] Uploading to ${GCS_PATH}/" | tee -a "$LOG_FILE"
gcloud storage cp "${TMP_DIR}/"*.ndjson "${GCS_PATH}/" 2>&1 | tee -a "$LOG_FILE"

# Log the archive run to Supabase
DURATION=$SECONDS
curl -s "${SUPABASE_URL}/rest/v1/auth_audit_log" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "{\"event\":\"gcs_archive\",\"email\":\"${DATE}\",\"user_agent\":\"tables:${TABLES_ARCHIVED} rows:${ROWS_ARCHIVED}\",\"success\":true}" > /dev/null 2>&1

# Cleanup
rm -rf "$TMP_DIR"

echo "[$(date)] Archive complete: ${TABLES_ARCHIVED} tables, ${ROWS_ARCHIVED} rows → ${GCS_PATH}/" | tee -a "$LOG_FILE"
echo "═══════════════════════════════════════" | tee -a "$LOG_FILE"
