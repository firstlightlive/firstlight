#!/bin/bash
# ═══════════════════════════════════════════
# FIRSTLIGHT — Daily Supabase Backup to GCS
# Exports all tables as JSON → uploads to GCS
# Run via cron: 0 2 * * * /path/to/daily-backup.sh
# ═══════════════════════════════════════════

LOG="/tmp/firstlight_backup.log"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/.env"
SUPA="${SUPA_URL}"
KEY="${SUPA_KEY}"
BUCKET="gs://firstlightlive/archive/supabase"
DATE=$(date +%Y-%m-%d)
BACKUP_DIR="/tmp/fl_backup_${DATE}"

echo "$(date '+%Y-%m-%d %H:%M:%S') — Backup started" >> "$LOG"

mkdir -p "$BACKUP_DIR"

TABLES="daily_rituals journal_entries daily_logs deep_work_sessions gym_workouts mastery_daily mastery_weekly mastery_monthly_scores mastery_ideas brahma_daily brahma_weekly ekadashi_log engagement_counters voice_entries races comments config daily_checkin reading_log slips architecture_log instagram_posts strava_activities proof_archive"

TOTAL=0
for table in $TABLES; do
  DATA=$(curl -s "${SUPA}/rest/v1/${table}?select=*" \
    -H "apikey: ${KEY}" -H "Authorization: Bearer ${KEY}" 2>/dev/null)

  if [ -n "$DATA" ] && [ "$DATA" != "[]" ]; then
    echo "$DATA" > "${BACKUP_DIR}/${table}.json"
    SIZE=$(wc -c < "${BACKUP_DIR}/${table}.json" | tr -d ' ')
    echo "  ${table}: ${SIZE} bytes" >> "$LOG"
    TOTAL=$((TOTAL + 1))
  fi
done

# Compress
cd /tmp
tar czf "fl_backup_${DATE}.tar.gz" "fl_backup_${DATE}/"

# Upload to GCS
gsutil -q cp "/tmp/fl_backup_${DATE}.tar.gz" "${BUCKET}/fl_backup_${DATE}.tar.gz"

# Clean up local
rm -rf "$BACKUP_DIR" "/tmp/fl_backup_${DATE}.tar.gz"

echo "$(date '+%Y-%m-%d %H:%M:%S') — Backup complete: ${TOTAL} tables → ${BUCKET}/fl_backup_${DATE}.tar.gz" >> "$LOG"
echo "---" >> "$LOG"

# Clean up old backups (keep last 30 days in GCS, archive older to yearly)
THIRTY_DAYS_AGO=$(date -v-30d +%Y-%m-%d 2>/dev/null || date -d "30 days ago" +%Y-%m-%d)
gsutil ls "${BUCKET}/" 2>/dev/null | while read file; do
  FILE_DATE=$(echo "$file" | grep -o '[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}')
  if [ -n "$FILE_DATE" ] && [ "$FILE_DATE" \< "$THIRTY_DAYS_AGO" ]; then
    YEAR=$(echo "$FILE_DATE" | cut -d- -f1)
    gsutil -q mv "$file" "gs://firstlightlive/archive/yearly/${YEAR}/"
    echo "  Archived: $file → yearly/${YEAR}/" >> "$LOG"
  fi
done
