#!/bin/bash
# ═══════════════════════════════════════════
# FIRSTLIGHT — Daily Sync Script
# Pulls new data from Strava + Instagram
# Run via cron: 0 7 * * * /path/to/sync-all.sh
# ═══════════════════════════════════════════

LOG_FILE="/tmp/firstlight_sync.log"
echo "$(date '+%Y-%m-%d %H:%M:%S') — Sync started" >> "$LOG_FILE"

# ── CONFIG (load from env file) ──
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/.env"
STRAVA_REFRESH_FILE="/Users/Anupamlive/AnupamWork/firstlight/scripts/.strava_refresh_token"
STRAVA_TOKEN_FILE="/Users/Anupamlive/AnupamWork/firstlight/scripts/.strava_access_token"

# IG config loaded from .env
IG_TOKEN_FILE="/Users/Anupamlive/AnupamWork/firstlight/scripts/.ig_access_token"

# ── HELPER: Get config value from Supabase ──
get_config() {
  curl -s "${SUPA_URL}/rest/v1/config?key=eq.${1}&select=value" \
    -H "apikey: ${SUPA_KEY}" -H "Authorization: Bearer ${SUPA_KEY}" | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['value'] if d else '')" 2>/dev/null
}

# ── HELPER: Set config value in Supabase ──
set_config() {
  curl -s -X POST "${SUPA_URL}/rest/v1/config" \
    -H "apikey: ${SUPA_KEY}" -H "Authorization: Bearer ${SUPA_KEY}" \
    -H "Content-Type: application/json" -H "Prefer: resolution=merge-duplicates" \
    -d "{\"key\":\"${1}\",\"value\":\"${2}\"}" > /dev/null
}

# ═══════════════════════════════════════════
# STRAVA SYNC
# ═══════════════════════════════════════════
echo "$(date '+%H:%M:%S') — Strava: refreshing token..." >> "$LOG_FILE"

STRAVA_REFRESH=$(cat "$STRAVA_REFRESH_FILE" 2>/dev/null)

if [ -z "$STRAVA_REFRESH" ]; then
  echo "ERROR: No Strava refresh token found in $STRAVA_REFRESH_FILE" >> "$LOG_FILE"
else
  # Refresh access token
  TOKEN_RESPONSE=$(curl -s -X POST "https://www.strava.com/oauth/token" \
    -d "client_id=${STRAVA_CLIENT_ID}" \
    -d "client_secret=${STRAVA_CLIENT_SECRET}" \
    -d "refresh_token=${STRAVA_REFRESH}" \
    -d "grant_type=refresh_token")

  STRAVA_TOKEN=$(echo "$TOKEN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)
  NEW_REFRESH=$(echo "$TOKEN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('refresh_token',''))" 2>/dev/null)

  if [ -n "$STRAVA_TOKEN" ] && [ -n "$NEW_REFRESH" ]; then
    # Save new tokens to files
    echo "$STRAVA_TOKEN" > "$STRAVA_TOKEN_FILE"
    echo "$NEW_REFRESH" > "$STRAVA_REFRESH_FILE"
    echo "$(date '+%H:%M:%S') — Strava: token refreshed" >> "$LOG_FILE"

    # Pull activities from last 3 days (overlap is safe — upsert handles duplicates)
    THREE_DAYS_AGO=$(date -v-3d +%s 2>/dev/null || date -d "3 days ago" +%s)

    ACTIVITIES=$(curl -s "https://www.strava.com/api/v3/athlete/activities?per_page=30&after=${THREE_DAYS_AGO}" \
      -H "Authorization: Bearer ${STRAVA_TOKEN}")

    COUNT=$(echo "$ACTIVITIES" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null)
    echo "$(date '+%H:%M:%S') — Strava: found ${COUNT} recent activities" >> "$LOG_FILE"

    # Insert each activity into Supabase
    echo "$ACTIVITIES" | python3 -c "
import sys, json, urllib.request

acts = json.load(sys.stdin)
supa = '${SUPA_URL}'
key = '${SUPA_KEY}'
ok = 0

for a in acts:
    row = {
        'id': a['id'],
        'name': a.get('name',''),
        'type': a.get('type',''),
        'sport_type': a.get('sport_type', a.get('type','')),
        'distance': round(a.get('distance',0), 2),
        'moving_time': a.get('moving_time',0),
        'elapsed_time': a.get('elapsed_time',0),
        'total_elevation_gain': round(a.get('total_elevation_gain',0), 2),
        'start_date': a.get('start_date'),
        'start_date_local': a.get('start_date_local'),
        'average_speed': round(a['average_speed'],3) if a.get('average_speed') else None,
        'max_speed': round(a['max_speed'],3) if a.get('max_speed') else None,
        'average_heartrate': a.get('average_heartrate'),
        'max_heartrate': a.get('max_heartrate'),
        'average_cadence': a.get('average_cadence'),
        'calories': a.get('calories'),
        'suffer_score': a.get('suffer_score'),
        'pr_count': a.get('pr_count',0),
        'achievement_count': a.get('achievement_count',0),
        'kudos_count': a.get('kudos_count',0),
        'summary_polyline': a.get('map',{}).get('summary_polyline'),
        'gear_id': a.get('gear_id'),
        'workout_type': a.get('workout_type')
    }
    data = json.dumps(row).encode()
    req = urllib.request.Request(
        supa + '/rest/v1/strava_activities?on_conflict=id',
        data=data,
        headers={
            'apikey': key,
            'Authorization': 'Bearer ' + key,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
        },
        method='POST'
    )
    try:
        urllib.request.urlopen(req)
        ok += 1
    except Exception as e:
        pass

print(f'Strava: {ok}/{len(acts)} synced')
" >> "$LOG_FILE" 2>&1
  else
    echo "ERROR: Strava token refresh failed" >> "$LOG_FILE"
  fi
fi

# ═══════════════════════════════════════════
# INSTAGRAM SYNC
# ═══════════════════════════════════════════
echo "$(date '+%H:%M:%S') — Instagram: checking token..." >> "$LOG_FILE"

IG_TOKEN=$(cat "$IG_TOKEN_FILE" 2>/dev/null)

if [ -z "$IG_TOKEN" ]; then
  echo "ERROR: No Instagram token found" >> "$LOG_FILE"
else
  # Check token validity
  TOKEN_CHECK=$(curl -s "https://graph.facebook.com/v21.0/debug_token?input_token=${IG_TOKEN}&access_token=${IG_TOKEN}" | \
    python3 -c "import sys,json; d=json.load(sys.stdin).get('data',{}); print(d.get('expires_at',0))" 2>/dev/null)

  NOW=$(date +%s)
  DAYS_LEFT=$(( (TOKEN_CHECK - NOW) / 86400 ))
  echo "$(date '+%H:%M:%S') — Instagram: token expires in ${DAYS_LEFT} days" >> "$LOG_FILE"

  # Refresh if < 30 days remaining (aggressive — leaves 30-day buffer)
  if [ "$DAYS_LEFT" -lt 30 ] && [ "$DAYS_LEFT" -gt 0 ]; then
    echo "$(date '+%H:%M:%S') — Instagram: refreshing token..." >> "$LOG_FILE"
    NEW_IG_TOKEN=$(curl -s "https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${IG_APP_ID}&client_secret=${IG_APP_SECRET}&fb_exchange_token=${IG_TOKEN}" | \
      python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)
    if [ -n "$NEW_IG_TOKEN" ]; then
      echo "$NEW_IG_TOKEN" > "$IG_TOKEN_FILE"
      IG_TOKEN="$NEW_IG_TOKEN"
      echo "$(date '+%H:%M:%S') — Instagram: token refreshed (60 days)" >> "$LOG_FILE"
    fi
  fi

  # Pull latest 10 posts
  POSTS=$(curl -s "https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}/media?fields=id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count,permalink&limit=10&access_token=${IG_TOKEN}")

  echo "$POSTS" | python3 -c "
import sys, json, urllib.request, math

data = json.load(sys.stdin)
posts = data.get('data', [])
supa = '${SUPA_URL}'
key = '${SUPA_KEY}'
streak_start = '2026-02-10'
ok = 0

for p in posts:
    from datetime import datetime
    ts = p.get('timestamp','')
    try:
        post_date = datetime.fromisoformat(ts.replace('+0000','+00:00'))
        start = datetime(2026, 2, 10)
        day_num = (post_date.replace(tzinfo=None) - start).days + 1
    except:
        day_num = 0

    row = {
        'id': p['id'],
        'ig_id': p['id'],
        'caption': (p.get('caption') or '')[:10000],
        'media_type': p.get('media_type'),
        'media_url': p.get('media_url'),
        'thumbnail_url': p.get('thumbnail_url'),
        'permalink': p.get('permalink'),
        'timestamp': ts,
        'like_count': p.get('like_count', 0),
        'comments_count': p.get('comments_count', 0),
        'day_number': day_num
    }
    data_bytes = json.dumps(row).encode()
    req = urllib.request.Request(
        supa + '/rest/v1/instagram_posts?on_conflict=id',
        data=data_bytes,
        headers={
            'apikey': key,
            'Authorization': 'Bearer ' + key,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
        },
        method='POST'
    )
    try:
        urllib.request.urlopen(req)
        ok += 1
    except:
        pass

print(f'Instagram: {ok}/{len(posts)} synced')
" >> "$LOG_FILE" 2>&1
fi

# ═══════════════════════════════════════════
# INSTAGRAM → GCS MIGRATION (move CDN images to permanent storage)
# ═══════════════════════════════════════════
echo "$(date '+%H:%M:%S') — Migrating new IG images to GCS..." >> "$LOG_FILE"

python3 -c "
import json, urllib.request, subprocess, os

supa = '${SUPA_URL}'
key = '${SUPA_KEY}'

# Get posts with Instagram CDN URLs (not yet on GCS)
req = urllib.request.Request(
    supa + '/rest/v1/instagram_posts?media_url=not.like.*storage.googleapis.com*&media_url=not.is.null&select=id,media_url,day_number&limit=10',
    headers={'apikey': key, 'Authorization': 'Bearer ' + key}
)
posts = json.loads(urllib.request.urlopen(req).read())

migrated = 0
for p in posts:
    if not p.get('media_url') or 'storage.googleapis.com' in p['media_url']:
        continue
    try:
        tmp = '/tmp/ig_mig_' + str(p['id'][:8]) + '.jpg'
        urllib.request.urlretrieve(p['media_url'], tmp)
        gcs_name = 'media/instagram/day' + str(p.get('day_number', 0)) + '_' + p['id'][:8] + '.jpg'
        subprocess.run(['gsutil', '-q', 'cp', tmp, 'gs://firstlightlive/' + gcs_name], check=True)
        os.remove(tmp)
        gcs_url = 'https://storage.googleapis.com/firstlightlive/' + gcs_name
        # Update Supabase
        data = json.dumps({'media_url': gcs_url}).encode()
        req2 = urllib.request.Request(
            supa + '/rest/v1/instagram_posts?id=eq.' + p['id'],
            data=data,
            headers={'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'},
            method='PATCH'
        )
        urllib.request.urlopen(req2)
        migrated += 1
    except Exception as e:
        pass

print(f'IG→GCS: {migrated}/{len(posts)} migrated')
" >> "$LOG_FILE" 2>&1

# ═══════════════════════════════════════════
# PROOF ARCHIVE SYNC (merge Strava + Instagram for today)
# ═══════════════════════════════════════════
echo "$(date '+%H:%M:%S') — Proof archive: syncing today..." >> "$LOG_FILE"

TODAY=$(date +%Y-%m-%d)
STREAK_START="2026-02-10"
DAY_NUM=$(( ( $(date -j -f "%Y-%m-%d" "$TODAY" +%s 2>/dev/null || date -d "$TODAY" +%s) - $(date -j -f "%Y-%m-%d" "$STREAK_START" +%s 2>/dev/null || date -d "$STREAK_START" +%s) ) / 86400 + 1 ))

# Get today's Strava run (if token is valid)
if [ -n "$STRAVA_TOKEN" ]; then
  STRAVA_TODAY=$(curl -s "https://www.strava.com/api/v3/athlete/activities?per_page=10&after=$(date -v-1d +%s 2>/dev/null || date -d 'yesterday' +%s)" \
    -H "Authorization: Bearer $STRAVA_TOKEN")

  # Get today's IG caption for sleep
  IG_CAPTION=""
  if [ -n "$IG_TOKEN" ]; then
    IG_LATEST=$(curl -s "https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}/media?fields=caption&limit=1&access_token=${IG_TOKEN}")
    IG_CAPTION=$(echo "$IG_LATEST" | python3 -c "import sys,json; d=json.load(sys.stdin).get('data',[]); print(d[0].get('caption','') if d else '')" 2>/dev/null)
  fi

  python3 -c "
import json, urllib.request, re, sys

strava = json.loads('''$STRAVA_TODAY''')
caption = '''$IG_CAPTION'''
today = '$TODAY'
day_num = $DAY_NUM
supa = '${SUPA_URL}'
key = '${SUPA_KEY}'

# Find today's main run
run = None
gym = None
for a in strava:
  date = a.get('start_date_local','')[:10]
  if date != today: continue
  if a['type'] == 'Run' and a['distance']/1000 >= 2:
    if not run or a['distance'] > run['distance']: run = a
  if a['type'] in ('Workout','WeightTraining'):
    gym = a

# Parse sleep from caption
sleep = None
for pat in [r'(\d+\.?\d*)\s*h\s*sleep', r'Fuel:\s*(\d+\.?\d*)\s*h', r'Fuel:\s*(\d+\.?\d*)hrs']:
  m = re.search(pat, caption, re.I)
  if m: sleep = float(m.group(1)); break

if run:
  row = {
    'date': today,
    'day_number': day_num,
    'sleep_hrs': sleep,
    'run_km': round(run['distance']/1000, 2),
    'run_time_sec': run['moving_time'],
    'run_pace': str(int(1000/run['average_speed']/60)) + ':' + str(int((1000/run['average_speed']/60 % 1)*60)).zfill(2) if run.get('average_speed') and run['average_speed'] > 0 else None,
    'avg_hr': run.get('average_heartrate'),
    'max_hr': run.get('max_heartrate'),
    'calories': run.get('calories'),
    'elevation': run.get('total_elevation_gain'),
    'gym': gym is not None,
    'gym_duration_min': round(gym['moving_time']/60) if gym else None,
    'food_clean': True,
    'run_source': 'strava',
    'strava_id': run['id']
  }
  data = json.dumps(row).encode()
  req = urllib.request.Request(
    supa + '/rest/v1/proof_archive?on_conflict=date',
    data=data,
    headers={'apikey':key,'Authorization':'Bearer '+key,'Content-Type':'application/json','Prefer':'resolution=merge-duplicates'},
    method='POST'
  )
  try:
    urllib.request.urlopen(req)
    print(f'Proof: Day {day_num} synced — {row[\"run_km\"]}km, sleep {sleep or \"—\"}h')
  except Exception as e:
    print(f'Proof: sync failed — {e}')
else:
  print('Proof: no run found for today')
" >> "$LOG_FILE" 2>&1
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') — Sync complete" >> "$LOG_FILE"
echo "---" >> "$LOG_FILE"
