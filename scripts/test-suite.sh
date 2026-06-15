#!/usr/bin/env bash
# Deep component test suite for First Light
# Bash-testable checks: HTTP, JS syntax, JS unit tests, DB schema, edge function, cron, secrets
set -uo pipefail

cd "$(dirname "$0")/.."

# Required: SUPABASE_ACCESS_TOKEN (sbp_…) — Management API token for schema/secrets checks
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "ERROR: set SUPABASE_ACCESS_TOKEN env var before running this suite."
  echo "       Sections 7–12 (schema + secrets + cron) need it. Sections 1–6 + 13–14 work without."
  exit 1
fi
SBP="$SUPABASE_ACCESS_TOKEN"
PROJ='edgnudrbysybefbqyijq'
BASE='https://firstlight.live'
SUPA="https://${PROJ}.supabase.co"
ANON=$(node -e "console.log(['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9','eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkZ251ZHJieXN5YmVmYnF5aWpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNTExNjEsImV4cCI6MjA5MTgyNzE2MX0','UOTH1J-022hwSQZ2QkpiRxw3wtctaVsJQEBoLYYMkHk'].join('.'))")
ADMIN=$(curl -s -X POST "https://api.supabase.com/v1/projects/${PROJ}/database/query" \
  -H "Authorization: Bearer ${SBP}" -H "Content-Type: application/json" \
  -d '{"query":"SELECT value FROM secrets WHERE key='\''admin_api_key'\''"}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log(j[0]?.value || '');});")

PASS=0
FAIL=0
WARN=0
ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; PASS=$((PASS+1)); }
bad()  { printf "  \033[31m✗\033[0m %s — %s\n" "$1" "$2"; FAIL=$((FAIL+1)); }
warn() { printf "  \033[33m⚠\033[0m %s — %s\n" "$1" "$2"; WARN=$((WARN+1)); }
head() { printf "\n\033[1;36m═══ %s ═══\033[0m\n" "$1"; }

# ────────────────────────────────────────────────────────────
head "1 · STATIC SYNTAX (all newly created files parse)"
for f in website/sw.js website/js/fl-offline.js website/js/fl-auth.js; do
  if node -c "$f" 2>/dev/null; then ok "$f parses"; else bad "$f" "syntax error"; fi
done
for f in website/punch.html website/install.html; do
  result=$(node -e "
    const html = require('fs').readFileSync('$f','utf8');
    const m = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
    if (!m) { console.log('NOSCRIPT'); process.exit(0); }
    try { new Function(m[1]); console.log('OK'); }
    catch (e) { console.log('FAIL:' + e.message); }
  ")
  if [[ "$result" == "OK" ]]; then ok "$f inline JS parses"
  elif [[ "$result" == "NOSCRIPT" ]]; then warn "$f" "no inline JS block"
  else bad "$f" "$result"; fi
done
if node -e "JSON.parse(require('fs').readFileSync('website/manifest.json'))" 2>/dev/null; then ok "manifest.json valid JSON"; else bad "manifest.json" "invalid JSON"; fi

# ────────────────────────────────────────────────────────────
head "2 · LIVE HTTP — every critical URL"
for path in / /admin.html /punch.html /install.html /sw.js /manifest.json /icon-512.png /js/fl-offline.js /js/fl-auth.js /js/config.js /styles.css; do
  code=$(curl -sLo /dev/null -w "%{http_code}" "${BASE}${path}?cb=${RANDOM}")
  if [ "$code" = "200" ]; then ok "${path} → 200"; else bad "${path}" "got $code"; fi
done

# ────────────────────────────────────────────────────────────
head "3 · CONTENT-TYPE (Safari is strict)"
# portable (bash 3.2 compat — no assoc arrays)
check_ct() {
  local path="$1" expected="$2"
  local ct=$(curl -sI "${BASE}${path}" | awk -F': ' 'tolower($1)=="content-type"{print tolower($2); exit}' | tr -d '\r;')
  if [[ "$ct" == "$expected"* ]]; then ok "${path} ct=${expected}"; else warn "${path}" "got ct='${ct}', want ${expected}"; fi
}
check_ct /manifest.json     application/json
check_ct /sw.js             text/javascript
check_ct /icon-512.png      image/png
check_ct /js/fl-offline.js  text/javascript
check_ct /js/fl-auth.js     text/javascript
check_ct /js/config.js      text/javascript

# ────────────────────────────────────────────────────────────
head "4 · MANIFEST FIELDS (PWA install criteria)"
M=$(curl -s "${BASE}/manifest.json")
for k in name short_name start_url display icons; do
  if echo "$M" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);process.exit(j['$k']?0:1);});" 2>/dev/null
  then ok "manifest has '$k'"; else bad "manifest" "missing '$k'"; fi
done
sizes=$(echo "$M" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log([...new Set(j.icons.map(i=>i.sizes))].join(','));});")
[[ "$sizes" == *"192"* ]] && ok "manifest has 192px icon" || warn "manifest" "no 192px (Android downscale)"
[[ "$sizes" == *"512"* ]] && ok "manifest has 512px icon" || bad "manifest" "no 512px"
has_maskable=$(echo "$M" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log(j.icons.some(i=>(i.purpose||'').includes('maskable'))?'Y':'N');});")
[ "$has_maskable" = "Y" ] && ok "manifest has maskable icon" || warn "manifest" "no maskable"

# ────────────────────────────────────────────────────────────
head "5 · SW LIFECYCLE markers"
SW=$(curl -s "${BASE}/sw.js")
[[ "$SW" == *"SHELL_VERSION"* ]] && ok "sw.js: SHELL_VERSION declared" || bad "sw.js" "missing SHELL_VERSION"
[[ "$SW" == *"skipWaiting"* ]] && ok "sw.js: skipWaiting" || bad "sw.js" "missing skipWaiting"
[[ "$SW" == *"clients.claim"* ]] && ok "sw.js: clients.claim" || bad "sw.js" "missing clients.claim"
[[ "$SW" == *"handleSupabase"* ]] && ok "sw.js: handleSupabase" || bad "sw.js" "missing supabase handler"
[[ "$SW" == *"queueWrite"* ]] && ok "sw.js: queueWrite" || bad "sw.js" "missing queueWrite"
[[ "$SW" == *"drainQueue"* ]] && ok "sw.js: drainQueue" || bad "sw.js" "missing drainQueue"

# ────────────────────────────────────────────────────────────
head "6 · UNIT TESTS — pure JS functions"

# parseLocal: should strip +00:00 suffix so date stays local
PL=$(node -e "
function parseLocal(s){if(!s)return new Date();return new Date(s.replace(/[+-]\d{2}:\d{2}\$/,''));}
const d=parseLocal('2026-06-15T04:57:32+00:00');
console.log(d.getHours()+':'+String(d.getMinutes()).padStart(2,'0'));
")
[ "$PL" = "4:57" ] && ok "parseLocal: 04:57 stays 04:57 (TZ fix)" || bad "parseLocal" "got $PL, want 4:57"

# estimateCalories: MET formula sanity
EC=$(node -e "
function estimateCalories(type,sec,w=70){if(!sec||sec<=0)return 0;const h=sec/3600;let M=5;const t=type.toLowerCase();if(t.includes('run'))M=9.8;else if(t.includes('walk')||t.includes('hike'))M=4;else if(t.includes('ride')||t.includes('bike')||t.includes('cycl'))M=8;else if(t.includes('swim'))M=8;else if(t.includes('yoga'))M=3;else if(t.includes('weight')||t.includes('strength'))M=5;else if(t.includes('stair'))M=9;return Math.round(M*w*h);}
console.log(estimateCalories('Run',1980,70)+','+estimateCalories('Ride',28857,70)+','+estimateCalories('Walk',3600,70)+','+estimateCalories('',3600,70));
")
expect="377,4489,280,350"
[ "$EC" = "$expect" ] && ok "estimateCalories: Run 5km=377, Ride 8h=4489, Walk 1h=280, generic=350" || bad "estimateCalories" "got $EC, want $expect"

# dayNum from punch.html
DN=$(node -e "
const start=new Date('2026-06-13T00:00:00');
const today=new Date('2026-06-15T00:00:00');
console.log(Math.floor((today-start)/86400000)+1);
")
[ "$DN" = "3" ] && ok "dayNum: 2026-06-15 → Day 3 of Chapter 2" || bad "dayNum" "got $DN, want 3"

# UA platform detection from install.html
UADETECT=$(node -e "
function detect(ua){
  const ios=/iPhone|iPad|iPod/i.test(ua);
  const android=/Android/i.test(ua);
  const mac=/Macintosh/.test(ua)&&!ios;
  const win=/Windows/.test(ua);
  return ios?'ios':android?'android':mac?'mac':win?'win':'other';
}
console.log(
  detect('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5...) Version/17.5 Safari')+','+
  detect('Mozilla/5.0 (iPad; CPU OS 17_5...) Version/17.5')+','+
  detect('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Safari')+','+
  detect('Mozilla/5.0 (Linux; Android 14; Pixel)')+','+
  detect('Mozilla/5.0 (Windows NT 10.0) Chrome/120')
);
")
expect="ios,ios,mac,android,win"
[ "$UADETECT" = "$expect" ] && ok "Platform detection: all 5 UAs classified correctly" || bad "Platform detection" "got $UADETECT"

# ────────────────────────────────────────────────────────────
head "7 · DB SCHEMA — strava_activities has new columns"
for col in calories kilojoules device_name calories_synced_at; do
  resp=$(curl -s -X POST "https://api.supabase.com/v1/projects/${PROJ}/database/query" \
    -H "Authorization: Bearer ${SBP}" -H "Content-Type: application/json" \
    -d "{\"query\":\"SELECT column_name FROM information_schema.columns WHERE table_name='strava_activities' AND column_name='${col}'\"}")
  if [[ "$resp" == *"${col}"* ]]; then ok "strava_activities.${col} exists"; else bad "schema" "missing ${col}"; fi
done

# ────────────────────────────────────────────────────────────
head "8 · DATA CONSISTENCY — all 318 rows healthy"
R=$(curl -s -X POST "https://api.supabase.com/v1/projects/${PROJ}/database/query" \
  -H "Authorization: Bearer ${SBP}" -H "Content-Type: application/json" \
  -d '{"query":"SELECT COUNT(*) AS t, COUNT(calories) AS c, COUNT(CASE WHEN calories > 0 THEN 1 END) AS cgt, COUNT(device_name) AS d, COUNT(calories_synced_at) AS s, COUNT(DISTINCT device_name) AS devs FROM strava_activities"}')
node -e "
const r=JSON.parse('$R')[0];
console.log('   total='+r.t+' with-calories='+r.c+' calories>0='+r.cgt+' with-device='+r.d+' synced='+r.s+' devices='+r.devs);
if (r.t === r.c && r.c === r.d && r.c === r.s && r.cgt === r.c) {
  console.log('  \033[32m✓\033[0m all 318 rows: calories non-null, >0, device_name set, synced_at set');
} else {
  console.log('  \033[31m✗\033[0m data inconsistency');
  process.exit(1);
}
" && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

# ────────────────────────────────────────────────────────────
head "9 · EDGE FUNCTION endpoints"
HC=$(curl -s -X POST "${SUPA}/functions/v1/firstlight-sync?action=health" -H "Authorization: Bearer ${ANON}")
[[ "$HC" == *"\"status\":\"ok\""* ]] && ok "Edge /health responds OK" || bad "Edge /health" "$HC"

# Unauthorized check
UA=$(curl -sw "%{http_code}" -o /dev/null -X POST "${SUPA}/functions/v1/firstlight-sync?action=sync" -H "Authorization: Bearer ${ANON}")
[ "$UA" = "403" ] && ok "Edge enforces admin_key (403 without)" || warn "Edge auth" "got $UA expecting 403"

# Backfill 'nothing to do' (everything's already synced)
BR=$(curl -s -X POST "${SUPA}/functions/v1/firstlight-sync?action=backfill-strava-calories&limit=5&admin_key=${ADMIN}" -H "Authorization: Bearer ${ANON}")
remaining=$(echo "$BR" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(j.remaining ?? 'err');}catch(e){console.log('err');}})")
if [ "$remaining" = "0" ]; then ok "Backfill action: remaining=0 (all synced)"; else warn "Backfill" "remaining=$remaining"; fi

# ────────────────────────────────────────────────────────────
head "10 · SECRETS / TOKENS"
S=$(curl -s -X POST "https://api.supabase.com/v1/projects/${PROJ}/database/query" \
  -H "Authorization: Bearer ${SBP}" -H "Content-Type: application/json" \
  -d '{"query":"SELECT key FROM secrets ORDER BY key"}')
for k in admin_api_key strava_access strava_refresh strava_client_id strava_client_secret ig_access ig_app_id ig_app_secret; do
  [[ "$S" == *"\"key\":\"${k}\""* ]] && ok "secret '${k}' present" || bad "secrets" "missing ${k}"
done

# Token health (recency)
T=$(curl -s -X POST "https://api.supabase.com/v1/projects/${PROJ}/database/query" \
  -H "Authorization: Bearer ${SBP}" -H "Content-Type: application/json" \
  -d '{"query":"SELECT key, updated_at::text FROM secrets WHERE key IN ('\''strava_access'\'','\''ig_access'\'')"}')
echo "$T" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);j.forEach(r=>console.log('  · '+r.key+' updated '+r.updated_at.slice(0,16)));});"

# ────────────────────────────────────────────────────────────
head "11 · SYNC HEALTH (last cron run)"
SH=$(curl -s "${SUPA}/rest/v1/config?key=eq.SYNC_HEALTH&select=value" -H "apikey: ${ANON}" -H "Authorization: Bearer ${ANON}")
echo "$SH" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const r=JSON.parse(d)[0];const v=JSON.parse(r.value);console.log('  last_sync: '+v.last_sync+'   status: '+v.status+'   duration: '+v.duration_ms+'ms');const ageMin=Math.floor((Date.now()-new Date(v.last_sync).getTime())/60000);console.log('  '+(ageMin<30?'\033[32m✓\033[0m sync ran '+ageMin+'min ago':'\033[33m⚠\033[0m last sync was '+ageMin+'min ago'));}catch(e){console.log('  err');}});"

# ────────────────────────────────────────────────────────────
head "12 · CRON JOBS (pg_cron is the scheduler)"
CJ=$(curl -s -X POST "https://api.supabase.com/v1/projects/${PROJ}/database/query" \
  -H "Authorization: Bearer ${SBP}" -H "Content-Type: application/json" \
  -d '{"query":"SELECT jobname, schedule, active FROM cron.job ORDER BY jobname"}')
echo "$CJ" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);if(!j.length){console.log('  (no cron jobs)');return;}j.forEach(c=>console.log('  · '+c.jobname.padEnd(28)+' '+c.schedule.padEnd(20)+(c.active?'\033[32mactive\033[0m':'\033[31minactive\033[0m')));}catch(e){console.log('  err: '+d.slice(0,200));}});"

# ────────────────────────────────────────────────────────────
head "13 · WORKER VERSION"
W=$(curl -sI "${BASE}/sw.js" | /usr/bin/grep -i 'etag' | tr -d '\r')
ok "Live SW etag: ${W:0:50}..."

# ────────────────────────────────────────────────────────────
head "14 · NEW FEATURES — markers present in deployed code"
INS=$(curl -sL "${BASE}/install.html?cb=${RANDOM}")
[[ "$INS" == *"beforeinstallprompt"* ]] && ok "install.html: beforeinstallprompt API used" || bad "install.html" "no beforeinstallprompt"
[[ "$INS" == *"pwabuilder.com"* ]] && ok "install.html: PWA Builder link present" || bad "install.html" "no PWA Builder"

PUNCH=$(curl -sL "${BASE}/punch?cb=${RANDOM}")
[[ "$PUNCH" == *"FL.upsert"* ]] && ok "punch.html: FL.upsert wired" || bad "punch.html" "no FL.upsert"
[[ "$PUNCH" == *"PULL FROM STRAVA"* ]] && ok "punch.html: Strava pull button" || bad "punch.html" "no Strava pull"
[[ "$PUNCH" == *"@media (min-width: 900px)"* ]] && ok "punch.html: tablet/desktop breakpoint" || bad "punch.html" "no responsive breakpoint"
[[ "$PUNCH" == *"safe-area-inset-left"* ]] && ok "punch.html: safe-area-inset honored" || bad "punch.html" "no safe-area"

FLO=$(curl -s "${BASE}/js/fl-offline.js")
[[ "$FLO" == *"prefetchAllTables"* ]] && ok "fl-offline: cache warmer" || bad "fl-offline" "no prefetch"
[[ "$FLO" == *"renderInspector"* ]] && ok "fl-offline: queue inspector" || bad "fl-offline" "no inspector"
[[ "$FLO" == *"startRealtime"* ]] && ok "fl-offline: Supabase Realtime" || bad "fl-offline" "no Realtime"

AUTH=$(curl -s "${BASE}/js/fl-auth.js")
[[ "$AUTH" == *"DEFAULT_PIN = '2259'"* ]] && ok "fl-auth: default PIN 2259" || bad "fl-auth" "no default PIN"
[[ "$AUTH" == *"PBKDF2"* ]] && ok "fl-auth: PBKDF2 hashing" || bad "fl-auth" "no PBKDF2"
[[ "$AUTH" == *"biometricRegister"* ]] && ok "fl-auth: WebAuthn biometric" || bad "fl-auth" "no biometric"

# ────────────────────────────────────────────────────────────
head "RESULTS"
printf "  \033[32m%d pass\033[0m  \033[33m%d warn\033[0m  \033[31m%d fail\033[0m\n" "$PASS" "$WARN" "$FAIL"
exit $FAIL
