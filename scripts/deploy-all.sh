#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# DEPLOY EVERYTHING — Cloudflare Worker + site, then the Supabase edge function
#
#   bash scripts/deploy-all.sh            # deploy both
#   bash scripts/deploy-all.sh --worker   # Cloudflare only
#   bash scripts/deploy-all.sh --fn       # edge function only
#
# Credentials are read from scripts/.env (gitignored), so nothing is ever typed
# on a command line or pasted into a chat:
#   CLOUDFLARE_API_TOKEN=...   dash.cloudflare.com → My Profile → API Tokens
#   SUPABASE_ACCESS_TOKEN=...  supabase.com/dashboard/account/tokens
#
# ⚠️ ALWAYS deploys from the REPO ROOT. Never `cd website` — that config is
# assets-only and, sharing the `firstlight` worker name, would overwrite the
# real Worker and strip every /api/* route. See CLAUDE.md "Deployment".
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f scripts/.env ]]; then
  # shellcheck disable=SC1091
  set -a; . scripts/.env; set +a
fi

PROJECT_REF='edgnudrbysybefbqyijq'
DO_WORKER=1; DO_FN=1
case "${1:-}" in
  --worker) DO_FN=0 ;;
  --fn)     DO_WORKER=0 ;;
  '')       ;;
  *) echo "usage: $0 [--worker|--fn]" >&2; exit 1 ;;
esac

# ── Pre-flight: the four day-counter constants must agree, or the site and the
# Instagram captions print different day numbers for the same day. ──────────
echo "── checking day-counter agreement ──"
EPOCH_APP=$(sed -n "s/.*STREAK_START: '\([0-9-]*\)'.*/\1/p" website/app.js | head -1)
EPOCH_CH=$(sed -n "s/.*dayEpoch: '\([0-9-]*\)'.*/\1/p" website/js/chapters.js | head -1)
EPOCH_FN=$(sed -n "s/.*const DAY_EPOCH = new Date('\([0-9-]*\)T.*/\1/p" supabase/functions/firstlight-sync/index.ts | head -1)
# The content generator is self-contained (no app.js) and has drifted before.
EPOCH_GEN=$(sed -n "s/.*const STREAK_START='\([0-9-]*\)';.*/\1/p" website/app/app.html | head -1)
echo "  app.js       : ${EPOCH_APP:-<none>}"
echo "  chapters.js  : ${EPOCH_CH:-<none>}"
echo "  edge fn      : ${EPOCH_FN:-<none>}"
echo "  app/app.html : ${EPOCH_GEN:-<none>}"
if [[ -z "$EPOCH_APP" || "$EPOCH_APP" != "$EPOCH_CH" || "$EPOCH_APP" != "$EPOCH_FN" || "$EPOCH_APP" != "$EPOCH_GEN" ]]; then
  echo "✘ Day-counter epochs disagree — fix before deploying." >&2
  exit 1
fi
echo "  ✓ all four agree"

# ── Syntax gates ───────────────────────────────────────────────────────────
echo "── syntax check ──"
for f in website/app.js website/js/chapters.js website/sw.js; do
  node -c "$f" >/dev/null 2>&1 || { echo "✘ syntax error in $f" >&2; exit 1; }
done
echo "  ✓ JS parses"

if [[ $DO_WORKER -eq 1 ]]; then
  echo
  echo "── deploying Cloudflare Worker + site (from repo root) ──"
  [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]] && {
    echo "✘ CLOUDFLARE_API_TOKEN not set — add it to scripts/.env" >&2; exit 1; }
  npx wrangler deploy
fi

if [[ $DO_FN -eq 1 ]]; then
  echo
  echo "── deploying Supabase edge function ──"
  [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]] && {
    echo "✘ SUPABASE_ACCESS_TOKEN not set — add it to scripts/.env" >&2; exit 1; }
  # verify_jwt=false is pinned in supabase/config.toml; without it every
  # pg_cron / webhook / admin call returns UNAUTHORIZED_NO_AUTH_HEADER.
  supabase functions deploy firstlight-sync --project-ref "$PROJECT_REF"
fi

echo
echo "✓ done"
