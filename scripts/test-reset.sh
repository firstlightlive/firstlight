#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# RESET / Clarity Protocol — offline test suite (unit · functional · regression)
#
# Exercises all three moving parts of the porn-recovery tracker with NO network,
# NO Supabase token, and NO deploy. Layers:
#   UNIT        pure helpers in isolation (extracted from source, boundary matrices)
#   FUNCTIONAL  end-to-end flows in real engines (headless Chromium / Postgres / Deno)
#   REGRESSION  locked bugs + cross-implementation consistency (JS sweep == SQL sweep)
#
# Run:  bash scripts/test-reset.sh   (or:  npm run test:reset)
# Deps: node + puppeteer + @electric-sql/pglite (devDeps) + deno (for the edge test)
# ═══════════════════════════════════════════════════════════════════
set -uo pipefail
cd "$(dirname "$0")/.."
DIR="scripts/reset-tests"
IDX="supabase/functions/firstlight-sync/index.ts"
TMP="$(mktemp)"; trap 'rm -f "$TMP"' EXIT

compfail=0; TP=0; TA=0
hr(){ printf '─%.0s' $(seq 1 64); echo; }

# run a test file, stream + capture its output, accumulate its "A/B passed" tally
run(){ # $1 label ; $2.. command
  local label="$1"; shift
  hr; echo "▶ $label"; hr
  "$@" 2>&1 | tee "$TMP"
  local ec=${PIPESTATUS[0]}
  local line; line="$(grep -oE '[0-9]+/[0-9]+ passed, [0-9]+ failed' "$TMP" | tail -1)"
  if [ -n "$line" ]; then
    TP=$((TP + ${line%%/*}))
    local rest="${line#*/}"; TA=$((TA + ${rest%% *}))
  fi
  [ "$ec" -ne 0 ] && compfail=$((compfail+1))
  return 0
}

# ── deps ──
command -v node >/dev/null 2>&1 || { echo "❌ node not found"; exit 2; }
if ! node -e "require.resolve('puppeteer')" 2>/dev/null || ! node -e "require.resolve('@electric-sql/pglite')" 2>/dev/null; then
  echo "• installing test devDependencies (puppeteer / pglite)…"; npm install >/dev/null 2>&1 || { echo "❌ npm install failed"; exit 2; }
fi
HAVE_DENO=0; command -v deno >/dev/null 2>&1 && HAVE_DENO=1

echo; echo "╔══ UNIT — pure functions in isolation ══╗"
run "reset.html helpers (extracted from source)"   node "$DIR/unit.cjs"

echo; echo "╔══ FUNCTIONAL — end-to-end in real engines ══╗"
run "reset.html — headless Chromium"               node "$DIR/page.cjs"
run "reset_module.sql — real Postgres (PGlite)"    node "$DIR/sql.cjs"
if [ "$HAVE_DENO" = 1 ]; then
  run "emailResetReminder — Deno (unit + functional)" deno run --no-check "$DIR/edge.ts"
else
  hr; echo "▶ emailResetReminder — Deno"; hr; echo "⚠ deno not installed — skipped (install: https://deno.com)"
fi

echo; echo "╔══ REGRESSION — locked bugs + cross-impl consistency ══╗"
run "SQL sweep == oracle, locked bugs, idempotency" node "$DIR/regression.cjs"

# anti-drift: the Deno edge test must still mirror index.ts
hr; echo "▶ anti-drift — edge test logic == deployed index.ts"; hr
adfail=0
while IFS= read -r line; do
  [ -z "$line" ] && continue
  grep -qF "$line" "$IDX" || { echo "  ❌ MISSING in index.ts: $line"; adfail=$((adfail+1)); }
done <<'EOF'
if (yesterday < start) return { sent: false, reason: 'before protocol start', today }
if (!cleanSet.has(d) && !relSet.has(d)) atRisk.push(d)
if (atRisk.length === 0) return { sent: false, reason: 'nothing at risk — all days confirmed or logged', today }
const final = _istHour() >= 11
const imminent = atRisk[atRisk.length - 1]   // closest to today — its deadline is noon today
const older = atRisk.length - 1
EOF
if [ "$adfail" -eq 0 ]; then echo "  ✅ 6/6 critical lines match"; TP=$((TP+6)); TA=$((TA+6)); else compfail=$((compfail+1)); TA=$((TA+6)); TP=$((TP+6-adfail)); fi

echo; hr
echo "GRAND TOTAL: ${TP}/${TA} individual checks passed"
if [ "$compfail" -eq 0 ] && [ "$TP" -eq "$TA" ]; then echo "✅ RESET SUITE: all green"; exit 0
else echo "❌ RESET SUITE: ${compfail} component(s) had failures"; exit 1; fi
