#!/usr/bin/env bash
# Comprehensive verification — confirms NO wagering/money-stake language remains
# on any public surface Meta could crawl.
# Tests: source files + live deployed URLs + Open Graph + manifest + JS-emitted strings.

set -uo pipefail
cd "$(dirname "$0")/.."

BASE='https://firstlight.live'
PASS=0
FAIL=0

ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; PASS=$((PASS+1)); }
bad()  { printf "  \033[31m✗\033[0m %s\n    └─ %s\n" "$1" "$2"; FAIL=$((FAIL+1)); }
sect() { printf "\n\033[1;36m═══ %s ═══\033[0m\n" "$1"; }

# Files we audit. Excludes: admin-fire/finance/health (legit money tracking),
# strip-stake-amount.js (the script that does the removal so it contains literals),
# verify-no-wagering.sh (this file), _archive, _backup, node_modules, .git, docs.
SOURCE_EXCLUDES='--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=_archive --exclude-dir=_backup_20260424_1514 --exclude=strip-stake-amount.js --exclude=verify-no-wagering.sh --exclude=admin-fire.js --exclude=admin-finance.js --exclude=admin-expense*'

check_source() {
  local pat="$1" desc="$2"
  local hits=$(/usr/bin/grep -rlE "$pat" $SOURCE_EXCLUDES website/ app/ supabase/ 2>/dev/null)
  if [ -z "$hits" ]; then ok "SOURCE — $desc"
  else bad "SOURCE — $desc" "$(echo "$hits" | head -3 | tr '\n' ' ')"; fi
}

check_live() {
  local path="$1" pat="$2" desc="$3"
  local body=$(curl -sL "${BASE}${path}?cb=${RANDOM}" 2>/dev/null)
  local n=$(echo "$body" | /usr/bin/grep -cE "$pat")
  if [ "$n" -eq 0 ]; then ok "LIVE ${path} — $desc"
  else bad "LIVE ${path} — $desc" "$n matches"; fi
}

sect "1 · MONEY AMOUNTS — source code"
check_source '₹15,000'         '₹15,000 literal'
check_source '₹20,000'         '₹20,000 literal'
check_source '₹5,000/day'      '₹5,000/day stake phrase'
check_source 'Rs\.? *15,?000'  'Rs 15,000 / Rs.15000'
check_source 'Rs\.? *20,?000'  'Rs 20,000'
check_source '\$200(?![0-9])'  '$200 USD equivalent'
check_source '₹15[Kk]'         '₹15K shorthand'
check_source '₹20[Kk]'         '₹20K shorthand'
check_source '₹5[Kk] /'        '₹5K /day'

sect "2 · WAGERING PHRASES — source code"
check_source 'ON THE LINE'        'ON THE LINE'
check_source 'AT STAKE'           'AT STAKE'
check_source 'Miss = you collect' 'Miss = you collect'
check_source 'you collect '       'generic "you collect" pattern'
check_source 'CLAIM IF I MISS'    'CLAIM IF I MISS CTA'
check_source 'TOTAL AT RISK'      'TOTAL AT RISK label'
check_source 'PAY ₹'              'PAY ₹ prefix'
check_source 'STAKE-DAY'          'STAKE-DAY'
check_source '₹[0-9]+,?[0-9]+ defended' '"₹X defended"'
check_source '₹[0-9]+,?[0-9]+ PENALTY' '"₹X PENALTY"'

sect "3 · CRAWLABLE PAGES — live HTTP"
for p in / /admin.html /punch.html /install.html /accountability.html /covenant.html /system.html /about.html /story.html /proof.html /handout.html /login.html /streak.html /index.html; do
  check_live "$p" "(₹15,000|₹20,000|₹15K|₹20K|\\\$200 USD|ON THE LINE|AT STAKE|Miss = you collect|CLAIM IF I MISS|TOTAL AT RISK|PAY ₹)" "no wagering text"
done

sect "4 · OPEN GRAPH + META — live"
for p in / /admin.html /punch.html /install.html /covenant.html /system.html /about.html /story.html; do
  meta=$(curl -sL "${BASE}${p}?cb=${RANDOM}" 2>/dev/null | /usr/bin/grep -E '<meta (name|property)="(og:|description|twitter:)' | tr -d '\r')
  hit=$(echo "$meta" | /usr/bin/grep -cE "(₹|stake|Stake|STAKE|on the line|wager|claim if|risk|PENALTY)")
  if [ "$hit" -eq 0 ]; then ok "META ${p} clean"
  else bad "META ${p}" "$hit suspicious meta tag(s)"; fi
done

sect "5 · MANIFEST + JSON descriptions — live"
for jsn in /manifest.json /app/manifest.json; do
  body=$(curl -sL "${BASE}${jsn}?cb=${RANDOM}" 2>/dev/null)
  hit=$(echo "$body" | /usr/bin/grep -cE "(₹|stake|on the line|claim|wager|risk|penalty)")
  if [ "$hit" -eq 0 ]; then ok "JSON ${jsn} clean"
  else bad "JSON ${jsn}" "$body"; fi
done

sect "6 · IG-GENERATOR CAPTION TEMPLATES — source"
# Look at the actual caption strings that get pushed to IG
check_source "fillText\\('₹"                    'canvas-painted ₹ amount'
check_source "_dealHook='₹"                      "deal hook with ₹"
check_source "dealHook='₹"                       "deal hook with ₹ (var2)"
check_source "caption.{0,5}\\+= ?'₹"            'caption builder with ₹'
check_source "'₹'.{0,8}\\+.{0,12}stake"          "JS string concat ₹+stake"
check_source 'stake.{0,30}ON THE LINE'           '"stake ON THE LINE" template'

sect "7 · SERVICE WORKER PRECACHE includes new pages"
sw=$(curl -s "${BASE}/sw.js" 2>/dev/null)
for path in '/admin.html' '/punch.html' '/install.html'; do
  if echo "$sw" | /usr/bin/grep -q "'$path'"; then ok "SW precaches $path"
  else bad "SW precache" "missing $path"; fi
done

sect "8 · INTERNAL STAKE LOGIC still works (admin-only, NOT public)"
# Make sure we didn't break the user's private stake_account tracking.
# Use printf instead of echo to avoid backslash interpretation on macOS bash.
curl -s "${BASE}/app.js" 2>/dev/null > /tmp/_fl_appjs
/usr/bin/grep -q 'STAKE_SCHEDULE' /tmp/_fl_appjs && ok "INTERNAL STAKE_SCHEDULE still defined (private)" || bad "INTERNAL" "STAKE_SCHEDULE missing — slip math will break"
/usr/bin/grep -q 'getCurrentStake' /tmp/_fl_appjs && ok "INTERNAL getCurrentStake() helper still present" || bad "INTERNAL" "getCurrentStake() missing"

# Admin module untouched
fire=$(curl -s "${BASE}/js/admin-fire.js" 2>/dev/null)
echo "$fire" | /usr/bin/grep -q 'Invest ₹5,000' && ok "ADMIN-FIRE: investment lever untouched (legit money lever)" || bad "ADMIN-FIRE" "FIRE lever string changed unexpectedly"

sect "9 · LANDING-PAGE HERO — actual rendered text snapshot"
home=$(curl -sL "${BASE}/?cb=${RANDOM}" 2>/dev/null)
hero=$(echo "$home" | sed -n '/holo-card/,/<\/section>/p' | tr -d '\r' | tr '\n' ' ' | head -c 600)
echo "  (excerpt)"
echo "$hero" | fold -w 88 -s | sed 's/^/    /'

sect "10 · ADMIN.HTML CONTROL PANELS — no public stake widget"
adm=$(curl -sL "${BASE}/admin.html?cb=${RANDOM}" 2>/dev/null)
echo "$adm" | /usr/bin/grep -cE "STAKE|stake-amount|stake-day|stakeAmount" | awk '{print "  Admin stake-related identifiers (CSS class / id / variable in HTML):", $1}'
# These can stay since admin.html is auth-gated and Meta won't see it past the PIN gate.

sect "RESULT"
printf "  \033[32m%d pass\033[0m  \033[31m%d fail\033[0m\n" "$PASS" "$FAIL"
exit $FAIL
