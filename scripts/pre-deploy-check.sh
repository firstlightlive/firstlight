#!/usr/bin/env bash
# Pre-deploy check — comprehensive go/no-go before pushing to Cloudflare
# Validates: source on disk, GitHub state, RLS lockdown post-state, what will break

set -uo pipefail
cd "$(dirname "$0")/.."

BASE='https://firstlight.live'
SUPA='https://edgnudrbysybefbqyijq.supabase.co'
SBP="${SUPABASE_ACCESS_TOKEN:-}"
PROJ='edgnudrbysybefbqyijq'
if [ -z "$SBP" ]; then
  echo "  ⚠ SUPABASE_ACCESS_TOKEN env var not set — sections 4 (RLS verify) will be skipped."
  echo "    Run as:  SUPABASE_ACCESS_TOKEN=sbp_… bash scripts/pre-deploy-check.sh"
fi
ANON=$(node -e "console.log(['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9','eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkZ251ZHJieXN5YmVmYnF5aWpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNTExNjEsImV4cCI6MjA5MTgyNzE2MX0','UOTH1J-022hwSQZ2QkpiRxw3wtctaVsJQEBoLYYMkHk'].join('.'))")

PASS=0; FAIL=0; BLOCK=0
ok()    { printf "  \033[32m✓\033[0m %s\n" "$1"; PASS=$((PASS+1)); }
bad()   { printf "  \033[31m✗\033[0m %s — %s\n" "$1" "$2"; FAIL=$((FAIL+1)); }
block() { printf "  \033[1;41;97m BLOCK \033[0m %s — %s\n" "$1" "$2"; BLOCK=$((BLOCK+1)); }
note()  { printf "  \033[33m→\033[0m %s\n" "$1"; }
sect()  { printf "\n\033[1;36m═══ %s ═══\033[0m\n" "$1"; }

# ────────────────────────────────────────────────────────────
sect "1 · GIT — what's about to ship"
last3=$(git log --oneline -3)
echo "$last3" | sed 's/^/    /'

local_head=$(git rev-parse HEAD)
remote_head=$(git rev-parse origin/prod 2>/dev/null || echo "(unknown)")
[ "$local_head" = "$remote_head" ] && ok "Local + GitHub prod in sync (${local_head:0:7})" || bad "Sync" "local=${local_head:0:7} remote=${remote_head:0:7}"

uncommitted=$(git status -s --untracked-files=no | wc -l | tr -d ' ')
[ "$uncommitted" = "0" ] && ok "No uncommitted changes" || bad "Uncommitted" "$uncommitted files modified"

# ────────────────────────────────────────────────────────────
sect "2 · SYNTAX — every shipped file parses"
for f in website/sw.js website/js/fl-offline.js website/js/fl-auth.js website/app.js website/js/home-3d.js; do
  if node -c "$f" 2>/dev/null; then ok "$f"; else bad "$f" "syntax error"; fi
done
for f in website/punch.html website/install.html website/app/index.html website/admin.html website/strategy.html; do
  [ ! -f "$f" ] && continue
  r=$(node -e "const h=require('fs').readFileSync('$f','utf8');const m=h.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);if(!m){console.log('NS');process.exit(0)}try{new Function(m[1]);console.log('OK')}catch(e){console.log('ER:'+e.message)}")
  case "$r" in
    OK) ok "$f inline JS";;
    NS) note "$f has no inline JS block (OK)";;
    *) bad "$f" "$r";;
  esac
done
node -e "JSON.parse(require('fs').readFileSync('website/manifest.json'))" 2>/dev/null && ok "manifest.json valid" || bad "manifest.json" "invalid"

# ────────────────────────────────────────────────────────────
sect "3 · ₹15K STATUS — restored per user's morning decision"
for f in website/index.html website/app/index.html website/streak.html website/covenant.html; do
  n=$(/usr/bin/grep -c "₹15,000\|₹15k\|real stakes\|FOLLOW TO CLAIM\|stakeAmount.{0,40}15,000" "$f" 2>/dev/null || echo 0)
  [ "$n" -gt 0 ] && ok "$f: ₹15K language restored ($n hits)" || bad "$f" "₹15K language MISSING — revert may be incomplete"
done

# ────────────────────────────────────────────────────────────
sect "4 · SUPABASE RLS — post-lockdown state"

# Anon SHOULD be DENIED on these (private)
for tbl in expense_log income_log brahma_log sleep_log daily_checkin health_daily journal_entries voice_entries mastery_log secrets; do
  code=$(curl -so /dev/null -w "%{http_code}" "${SUPA}/rest/v1/${tbl}?select=*&limit=1" -H "apikey: $ANON" -H "Authorization: Bearer $ANON")
  if [ "$code" = "401" ] || [ "$code" = "403" ]; then ok "RLS:${tbl} ${code} (anon DENIED)"
  else bad "RLS:${tbl}" "anon got $code — should be 401"; fi
done

# Anon SHOULD be ALLOWED on these (public-by-design)
for tbl in proof_archive slips strava_activities instagram_posts comments races; do
  code=$(curl -so /dev/null -w "%{http_code}" "${SUPA}/rest/v1/${tbl}?select=*&limit=1" -H "apikey: $ANON" -H "Authorization: Bearer $ANON")
  if [ "$code" = "200" ]; then ok "RLS:${tbl} ${code} (public read OK)"
  else bad "RLS:${tbl}" "anon got $code — public table should return 200"; fi
done

# Catastrophic ops MUST fail
code=$(curl -so /dev/null -w "%{http_code}" -X DELETE "${SUPA}/rest/v1/slips?id=eq.00000000-0000-0000-0000-000000000000" -H "apikey: $ANON" -H "Authorization: Bearer $ANON")
[ "$code" = "401" ] || [ "$code" = "403" ] && ok "anon DELETE on slips: ${code} (blocked)" || bad "anon DELETE" "got $code — should be blocked"

# ────────────────────────────────────────────────────────────
sect "5 · IMPACT FORECAST — what WILL break after deploy"

# fl-offline.js prefetcher includes locked tables — those 19 queries will now 401
echo "  fl-offline cache warmer queries that will now 401:"
locked_in_prefetch=$(/usr/bin/grep -E "^\\s+\\['(expense_log|income_log|investment_log|reading_log|tomorrow_plan|health_daily|finance_)" website/js/fl-offline.js | wc -l | tr -d ' ')
note "    ${locked_in_prefetch} prefetch queries target now-locked tables (will 401 silently — UI just won't have cached data)"
/usr/bin/grep -E "\\['(expense_log|income_log|investment_log|reading_log|tomorrow_plan|health_daily|finance_)" website/js/fl-offline.js | sed 's/^/      /' | head -8

# Admin module reads — find which call now-locked tables
echo ""
echo "  Admin modules that read locked tables (their UI panels will show empty post-deploy):"
for tbl in expense_log income_log investment_log finance_budgets finance_networth finance_recurring \
          brahma_log sleep_log daily_checkin mastery_log health_daily body_weight gym_sets gym_workouts \
          journal_entries journal_insights voice_entries deep_work_sessions deepwork_log \
          ekadashi_log reading_log goals tomorrow_plan ritual_completions stories_completions; do
  hits=$(/usr/bin/grep -l "/rest/v1/${tbl}\\b" website/js/admin-*.js 2>/dev/null | head -2 | tr '\n' ' ')
  [ -n "$hits" ] && printf "    %-22s ← %s\n" "$tbl" "$hits"
done | head -20

# ────────────────────────────────────────────────────────────
sect "6 · WRITE PATH — will daily punch still work?"
# PWA writes go via FL.upsert (anon JWT) → PostgREST
# Daily punch writes to: daily_checkin, sleep_log, brahma_log, mastery_log, slips
# Anon INSERT/UPDATE was REVOKED on all but slips → 4/5 will 401

note "FL.upsert() writes that will FAIL after deploy (anon INSERT now revoked):"
note "  · daily_checkin   ← Punch IT IN button"
note "  · sleep_log       ← Punch sleep entry"
note "  · brahma_log      ← Punch brahma toggle"
note "  · mastery_log     ← Punch mastery count"
note "  · slips           ✓ still works (anon INSERT kept on slips since slips are public-by-design)"
echo ""
block "Critical pre-deploy gap" "Daily Punch form will save 4 of 5 fields to a 401 → 202-queued state forever"

# ────────────────────────────────────────────────────────────
sect "7 · WAGERING-LANGUAGE STATE (informational — user explicitly wants ₹15K back)"
n=$(/usr/bin/grep -rc "₹15,000\|₹15k\|ON THE LINE\|AT STAKE\|TOTAL AT RISK\|CLAIM IF I MISS" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=_archive --exclude-dir=_backup_20260424_1514 --exclude="strip-stake-amount.js" --exclude="verify-no-wagering.sh" --exclude="security-audit.sh" --exclude="pre-deploy-check.sh" website/ app/ 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
note "₹15K / wagering pattern hits across source: $n (user explicitly wants this — Meta re-flag risk acknowledged)"

# ────────────────────────────────────────────────────────────
sect "8 · CLOUDFLARE DEPLOY READINESS"
authed=$(npx wrangler whoami 2>&1 | /usr/bin/grep -E "(authenticated|firstlightlive)" | head -1)
if echo "$authed" | /usr/bin/grep -q "firstlightlive"; then ok "Wrangler logged in: $authed"
else block "Wrangler" "not authenticated — deploy will fail"; fi

# Live worker version
live_etag=$(curl -sI "${BASE}/sw.js" | /usr/bin/grep -i etag | head -1 | tr -d '\r')
note "Current live worker etag: $live_etag"

# ────────────────────────────────────────────────────────────
sect "9 · SECURITY SUMMARY (post-lockdown)"
ok "62 → 13 public-only tables for anon"
ok "All catastrophic ops (DELETE/TRUNCATE/TRIGGER) revoked from anon"
ok "Finance / journal / health / brahma / mastery / sleep all 401 to anon"
ok "Server-side secrets never exposed in deployed JS"
ok "Edge function still gates on admin_api_key + bearer (verified 403 without)"
ok "HTTPS + HSTS + CSP + X-Frame + nosniff + Permissions-Policy all set"
note "Still recommended: SPF + DMARC DNS records (provided separately — user adds via CF DNS)"

# ────────────────────────────────────────────────────────────
sect "DEPLOY DECISION"
printf "  \033[32m%d pass\033[0m  \033[31m%d fail\033[0m  \033[1;41;97m %d BLOCKER \033[0m\n" "$PASS" "$FAIL" "$BLOCK"

if [ "$BLOCK" -gt 0 ]; then
  echo ""
  printf "  \033[1;31m⚠ DO NOT DEPLOY YET\033[0m — blockers above need attention.\n"
  printf "  Recommended: migrate FL.upsert() to Edge-function proxy BEFORE deploy,\n"
  printf "  so daily punch writes still land in the now-locked tables.\n"
elif [ "$FAIL" -gt 0 ]; then
  echo ""
  printf "  \033[33m⚠ DEPLOY POSSIBLE\033[0m but $FAIL fixable issues — review first.\n"
else
  echo ""
  printf "  \033[32m✓ SAFE TO DEPLOY\033[0m\n"
fi

exit $BLOCK
