#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# PUBLISH ONE IMAGE TO INSTAGRAM (manual / test posts)
#
#   bash scripts/publish-single.sh --dry-run      # show what would post
#   bash scripts/publish-single.sh                # publish it
#
# NOTE: there is no --delete. The Instagram Graph API does NOT support deleting
# media — no endpoint exists for it, for any media type. A published post can
# only be removed by hand in the Instagram app. Treat every publish from here
# as permanent.
#
# The daily WIN/MISS posts are published by the engine, not this. Use this for
# a one-off: a pipeline test, a re-post, a manual announcement.
#
# ADMIN_KEY + IG_ACCOUNT_ID come from scripts/.env (gitignored). The Instagram
# token never leaves the server — everything goes through the edge function's
# ig-proxy action.
#
# ⚠️ This posts publicly, as you, immediately, AND IT CANNOT BE UNDONE from
# code — see the note above. A caption claiming training that did not happen
# becomes a permanent part of the public record this project is built on.
# For a pipeline check use --dry-run, or post real numbers from a real session.
# Nothing here writes to proof_archive, so the ledger stays clean either way.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
cd "$(dirname "$0")/.."

[[ -f scripts/.env ]] && { set -a; . scripts/.env; set +a; }

SUPA_HOST='edgnudrbysybefbqyijq.supabase.co'
FN="https://$SUPA_HOST/functions/v1/firstlight-sync"

# ISP hijacks plaintext DNS for this host; resolve over DoH and pin the address.
SUPA_IP="$(curl -sS -m 10 "https://dns.google/resolve?name=$SUPA_HOST&type=A" \
  | sed -n 's/.*"data":"\([0-9.]*\)".*/\1/p' | head -1)"
[[ -z "$SUPA_IP" ]] && { echo "✘ cannot resolve $SUPA_HOST" >&2; exit 1; }
supa() { curl -sS -m 120 --resolve "$SUPA_HOST:443:$SUPA_IP" "$@"; }

ig() {  # $1 endpoint, $2 params-json, $3 optional method
  supa -X POST "$FN?action=ig-proxy" -H "X-Admin-Key: ${ADMIN_KEY:-}" \
    -H 'Content-Type: application/json' \
    -d "{\"endpoint\":\"$1\",\"params\":$2${3:+,\"method\":\"$3\"}}"
}

# ── Deletion is not possible via the API ─────────────────────────────────
if [[ "${1:-}" == "--delete" ]]; then
  cat >&2 <<'MSG'
✘ Instagram provides no API for deleting media. This was tried against
  media 18105479593901769 on 2026-09-12 and fails: the request falls through
  to the "update media" endpoint, which answers
      (#100) Requires one of the params: comment_enabled,status

  Remove the post by hand: Instagram app -> the post -> ... -> Delete.
MSG
  exit 1
fi

# ── What to post ─────────────────────────────────────────────────────────
IMAGE_URL="${IMAGE_URL:-https://firstlight.live/api/proofs/day-1/2026-09-13/win_post.png?v=c9fc6016}"
read -r -d '' CAPTION <<'CAP' || true
The road was empty. The sky was orange.

Day 1 · 13 Sep 2026.
5.0 km · Run.

#ironmantraining #marathontraining #runnersofindia #indianrunners #strava
CAP

echo "image  : $IMAGE_URL"
echo "caption:"; echo "$CAPTION" | sed 's/^/  /'
echo

if [[ "${1:-}" == "--dry-run" ]]; then echo "(dry run — nothing published)"; exit 0; fi
[[ -z "${ADMIN_KEY:-}" ]] && { echo "✘ ADMIN_KEY not set — add it to scripts/.env" >&2; exit 1; }
[[ -z "${IG_ACCOUNT_ID:-}" ]] && { echo "✘ IG_ACCOUNT_ID not set" >&2; exit 1; }

CAP_JSON="$(printf '%s' "$CAPTION" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')"

echo "── creating container ──"
R="$(ig "$IG_ACCOUNT_ID/media" "{\"image_url\":\"$IMAGE_URL\",\"caption\":$CAP_JSON}")"
ID="$(echo "$R" | sed -n 's/.*"id":"\([0-9]*\)".*/\1/p')"
[[ -z "$ID" ]] && { echo "✘ $R" >&2; exit 1; }
echo "  ✓ $ID"

echo "── waiting for Instagram to process ──"
for _ in $(seq 1 10); do
  sleep 3
  ST="$(ig "$ID" '{"fields":"status_code"}' GET)"
  case "$ST" in
    *FINISHED*) echo "  ✓ ready"; break ;;
    *ERROR*)    echo "✘ rejected: $ST" >&2; exit 1 ;;
  esac
done

echo "── publishing ──"
P="$(ig "$IG_ACCOUNT_ID/media_publish" "{\"creation_id\":\"$ID\"}")"
MID="$(echo "$P" | sed -n 's/.*"id":"\([0-9]*\)".*/\1/p')"
[[ -z "$MID" ]] && { echo "✘ $P" >&2; exit 1; }

LINK="$(ig "$MID" '{"fields":"permalink"}' GET | sed -n 's/.*"permalink":"\([^"]*\)".*/\1/p')"
echo
echo "✓ PUBLISHED"
echo "  media_id  : $MID"
echo "  permalink : ${LINK:-https://www.instagram.com/firstlightlive/}"
echo
echo "  This is now permanent. Instagram has no delete API — if it needs to go,"
echo "  remove it by hand in the Instagram app."
