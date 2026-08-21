#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ig-restore-token.sh — paste a Facebook token, get IG publishing back.
#
# WHY THIS EXISTS
#   A Facebook user token dies 60 days after the login that created it, and NO
#   server-side call can extend it — fb_exchange_token hands back the same expiry
#   when the input is already long-lived. So every 60 days a human has to log in
#   once. This script is that handoff, reduced to one paste.
#
# WHAT IT ACCEPTS
#   · A short-lived token straight out of Graph API Explorer → auto-upgraded to 60d.
#   · A Business Manager System User token → stored as-is, never expires (do this
#     once and you never run this script again).
#
# The edge function validates scope + IG-account reach BEFORE overwriting the
# stored secret, so a bad paste cannot take publishing down.
#
# Usage:  bash scripts/ig-restore-token.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_REF="edgnudrbysybefbqyijq"
FN_URL="https://${PROJECT_REF}.supabase.co/functions/v1/firstlight-sync"

# SUPABASE_ACCESS_TOKEN (sbp_…) is only used to read admin_api_key out of the
# secrets table, so the admin key never has to live in a file.
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  read -rsp "Supabase access token (sbp_…): " SUPABASE_ACCESS_TOKEN; echo
fi

echo "→ fetching admin key…"
ADMIN_KEY=$(curl -sS -X POST "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"query":"select value from secrets where key='"'"'admin_api_key'"'"'"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['value'])")

if [ -z "$ADMIN_KEY" ]; then echo "✗ could not read admin_api_key"; exit 1; fi

read -rsp "Paste the Facebook access token: " IG_TOKEN; echo
if [ -z "$IG_TOKEN" ]; then echo "✗ no token given"; exit 1; fi

echo "→ validating + storing…"
RESP=$(python3 -c "import json,sys;print(json.dumps({'token':sys.argv[1]}))" "$IG_TOKEN" \
  | curl -sS -X POST "${FN_URL}?action=ig-store-token" \
      -H "x-admin-key: ${ADMIN_KEY}" -H "Content-Type: application/json" --data-binary @-)

echo "$RESP" | python3 -c '
import sys, json
d = json.load(sys.stdin)
if not d.get("success"):
    print("✗ REJECTED:", d.get("error"))
    if d.get("scopes"): print("  scopes on token:", ", ".join(d["scopes"]))
    print("  (the previous token was left untouched)")
    sys.exit(1)
life = "NEVER EXPIRES" if d.get("never_expires") else f"{d.get(\"days_left\")} days"
print(f"✓ stored for @{d.get(\"username\")} — good for {life}")
if d.get("upgraded"): print("  · short-lived token auto-upgraded to long-lived")
if d.get("promoted_to_page_token"):
    print("  · promoted to the PAGE token — this was the last login you need to do")
elif not d.get("never_expires"):
    print("  ! still a user token, so it will expire. The nightly sync will keep")
    print("    retrying the page-token promotion on its own; if it never succeeds,")
    print("    check that pages_show_list was granted and the IG account is linked")
    print("    to the Facebook page in Meta Business settings.")
'

echo "→ running a sync to confirm publishing is live…"
curl -sS -X POST "${FN_URL}?action=refresh-token" \
  -H "x-admin-key: ${ADMIN_KEY}" -H "Content-Type: application/json" \
  | python3 -c 'import sys,json;[print("  ",l) for l in json.load(sys.stdin).get("log",[])]'
