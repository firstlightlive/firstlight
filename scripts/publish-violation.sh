#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# PUBLISH A RULE-BROKEN POST — one public slide when ANY rule breaks
#
#   bash scripts/publish-violation.sh "FOOD CODE" 25 "1 kg ice cream" [--dry-run]
#
# Renders the RULE_BROKEN slide through the Worker (/api/render → R2) and
# publishes it to Instagram via the edge function (token stays server-side).
# --dry-run renders only and prints the public URL — nothing published.
#
# The slide shows the DATE (no day number) so it works on rest/gap days too.
# Anti-spam: caption carries identity + the honest record only — no links,
# no handle, no ₹/charity language.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

RULE="${1:-}"
KM="${2:-20}"
NOTE="${3:-}"
DRY=0
[[ "${4:-}" == "--dry-run" || "${1:-}" == "--dry-run" ]] && DRY=1

if [[ -z "$RULE" || "$RULE" == "--dry-run" ]]; then
  echo "usage: $0 \"RULE NAME\" KM [\"note\"] [--dry-run]" >&2
  echo "  e.g. bash scripts/publish-violation.sh \"FOOD CODE\" 50 \"1 kg ice cream\" --dry-run" >&2
  exit 1
fi

FN_HOST='edgnudrbysybefbqyijq.supabase.co'
FN="https://$FN_HOST/functions/v1/firstlight-sync"

# ── Supabase reachability — a filtering resolver sinkholes *.supabase.co to a
# block page (TLS failure). Resolve over DoH and pin the real IP with --resolve.
SUPA_IP="$(curl -sS -m 10 "https://dns.google/resolve?name=$FN_HOST&type=A" \
  | sed -n 's/.*"data":"\([0-9.]*\)".*/\1/p' | head -1)"
[[ -z "$SUPA_IP" ]] && { echo "✘ could not resolve $FN_HOST over DoH" >&2; exit 1; }
supa() { curl -sS -m 120 --resolve "$FN_HOST:443:$SUPA_IP" "$@"; }

# Admin key: ADMIN_KEY env, else scripts/.env, else assemble from website/app.js
ADMIN_KEY="${ADMIN_KEY:-}"
if [[ -z "$ADMIN_KEY" && -f "$(dirname "$0")/.env" ]]; then
  set -a; . "$(dirname "$0")/.env"; set +a
fi
if [[ -z "$ADMIN_KEY" ]]; then
  ADMIN_KEY="$(node -e "const s=require('fs').readFileSync('website/app.js','utf8');const m=s.match(/\['([0-9a-f]+)','([0-9a-f]+)','([0-9a-f]+)','([0-9a-f]+)'\]/);console.log(m?m.slice(1).join(''):'')")"
fi
[[ -z "$ADMIN_KEY" ]] && { echo "✘ ADMIN_KEY not found (env, scripts/.env, or website/app.js)" >&2; exit 1; }

BODY="$(printf '{"rule":%s,"km":%s,"note":%s,"dryRun":%s}' \
  "$(printf '%s' "$RULE" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')" \
  "$KM" \
  "$(printf '%s' "$NOTE" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')" \
  "$DRY")"

if [[ $DRY -eq 1 ]]; then
  echo "── dry run — rendering only ──"
fi
echo "── $RULE · $KM km → IG"
resp="$(supa -X POST "$FN?action=publish-violation" \
  -H "X-Admin-Key: $ADMIN_KEY" -H 'Content-Type: application/json' -d "$BODY")"
echo "$resp" | python3 -m json.tool 2>/dev/null || echo "$resp"
if [[ $DRY -eq 1 ]]; then
  echo "── dry run done. Remove --dry-run to publish for real. ──"
fi
