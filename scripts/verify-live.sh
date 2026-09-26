#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# POST-DEPLOY SMOKE TEST — run this after ANY deploy, from ANY session.
#
# WHY THIS EXISTS: two sessions deploying the same Worker can silently undo each
# other. `wrangler deploy` has no merge step — the last deploy wins wholesale.
# Two specific ways that hurts:
#
#   1. A session deploying OLDER code reverts the day-counter epoch. The site
#      then prints the wrong Day number and nothing errors.
#   2. A session running it from `cd website` uses the assets-only config, which
#      shares the `firstlight` worker name and so OVERWRITES the real Worker,
#      stripping every /api/* route (see CLAUDE.md "Deployment").
#
# Neither failure throws. Both are invisible until something downstream breaks.
# This checks the LIVE site, not the repo, so it catches both.
#
#   bash scripts/verify-live.sh
#
# Exit 0 = live matches expectations. Exit 1 = something regressed.
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${FL_BASE:-https://firstlight.live}"
FN="https://edgnudrbysybefbqyijq.supabase.co/functions/v1/firstlight-sync"

# Expected values come from the REPO, so this never needs hand-editing.
EPOCH=$(sed -n "s/.*STREAK_START: '\([0-9-]*\)'.*/\1/p" "$ROOT/website/app.js" | head -1)
SHELL_V=$(sed -n "s/.*SHELL_VERSION = '\([a-z0-9-]*\)'.*/\1/p" "$ROOT/website/sw.js" | head -1)

fail=0
ok()   { printf "  \033[32m✓\033[0m %-34s %s\n" "$1" "$2"; }
bad()  { printf "  \033[31m✘\033[0m %-34s %s\n" "$1" "$2"; fail=$((fail+1)); }
get()  { curl -sL --max-time 25 "$1?cb=$RANDOM" 2>/dev/null; }
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 25 "$1" 2>/dev/null; }

echo
echo "POST-DEPLOY VERIFY · $BASE · expecting epoch $EPOCH / $SHELL_V"
echo "────────────────────────────────────────────────────────────────"

# 1 ── THE FOOTGUN. An assets-only deploy strips these; nothing else would.
h=$(code "$BASE/api/health")
[ "$h" = "200" ] && ok "/api/health (Worker routes)" "HTTP $h" \
                 || bad "/api/health (Worker routes)" "HTTP $h — an assets-only deploy may have stripped /api/*"

# 2 ── every epoch surface must agree with the repo
# pick=head|tail — chapters.js lists ARCHIVED chapters first, each with its own
# frozen dayEpoch (Chapter 04's is 2026-07-19). The live chapter is defined LAST,
# so that file must be read with tail. Same reason deploy-all.sh uses tail -1.
check_epoch() { # url, pattern, label, pick(head|tail)
  v=$(get "$BASE/$1" | grep -oE "$2" | "${4:-head}" -1)
  if [ -z "$v" ];            then bad "$3" "pattern not found"
  elif echo "$v" | grep -q "$EPOCH"; then ok "$3" "$v"
  else                            bad "$3" "$v — expected $EPOCH"; fi
}
check_epoch "app.js"        "STREAK_START: '[0-9-]*'"  "app.js epoch"
check_epoch "js/chapters.js" "dayEpoch: '[0-9-]*'"     "chapters.js epoch" tail
check_epoch "punch.html"    "STREAK_START = '[0-9-]*'" "punch.html epoch"
check_epoch "discipline"    "var START='[0-9-]*'"      "discipline epoch"
check_epoch "app/app.html"  "STREAK_START='[0-9-]*'"   "generator epoch"

# 3 ── service worker shell (a stale shell pins installed PWAs to old files)
v=$(get "$BASE/sw.js" | grep -oE "fl-shell-v[0-9]+" | head -1)
[ "$v" = "$SHELL_V" ] && ok "sw.js shell version" "$v" \
                      || bad "sw.js shell version" "$v — expected $SHELL_V"

# 4 ── the pages and modules that must exist
for p in / /rules /food /discipline /daily-sheet /accountability; do
  c=$(code "$BASE$p"); [ "$c" = "200" ] && ok "page $p" "HTTP $c" || bad "page $p" "HTTP $c"
done
c=$(code "$BASE/js/fl-discipline-sync.js")
[ "$c" = "200" ] && ok "js/fl-discipline-sync.js" "HTTP $c" || bad "js/fl-discipline-sync.js" "HTTP $c"
# NOTE: never pipe get() straight into `grep -q`. grep exits on first match,
# curl takes SIGPIPE, and with `pipefail` a SUCCESSFUL match reports as failure —
# timing-dependent, so it looks flaky rather than broken. Capture to a var first.
body=$(get "$BASE/discipline")
case "$body" in *fl-discipline-sync.js*) ok "discipline loads its sync" "present";;
                *) bad "discipline loads its sync" "MISSING";; esac
body=$(get "$BASE/food")
case "$body" in *"WHICH DAYS I TRACKED"*) ok "food calendar renders" "present";;
                *) bad "food calendar renders" "MISSING";; esac

# 5 ── edge function: the `reason` field only exists in the current build
r=$(curl -s --max-time 25 -X POST "$FN?action=ritual-sync" -H 'Content-Type: application/json' -d '{}' 2>/dev/null)
echo "$r" | grep -q '"reason"' \
  && ok "edge fn is the current build" "reports a reason field" \
  || bad "edge fn is the current build" "no reason field — an OLD build is live"

echo "────────────────────────────────────────────────────────────────"
if [ "$fail" -eq 0 ]; then
  echo -e "  \033[32mLIVE MATCHES THE REPO.\033[0m"
else
  echo -e "  \033[31m$fail CHECK(S) FAILED — the live site does not match this repo.\033[0m"
  echo "  If another session deployed after you, re-run: bash scripts/deploy-all.sh --worker"
fi
exit $((fail > 0 ? 1 : 0))
