#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# PUBLISH THE RESTART ANNOUNCEMENT — 3-slide IG carousel
#
# Used when the streak breaks for real (illness/injury), the day counter is
# reset, and the break needs to be stated publicly before Day 1 starts again.
#
#   1. Renders 3 slides through the Worker (/api/render → R2, public URLs)
#   2. Publishes them as a carousel via the edge function's ig-proxy action
#      (the IG token stays server-side in the secrets table — never local)
#
# REQUIRES: ADMIN_KEY env var (Supabase secrets table → admin_api_key).
#
#   bash scripts/publish-restart-post.sh --dry-run   # render + show caption
#   bash scripts/publish-restart-post.sh             # render + publish
#
# ADMIN_KEY is read from scripts/.env (gitignored). Get it from the Supabase
# dashboard → Table Editor → secrets → admin_api_key.
#
# Anti-spam (CLAUDE.md): the caption carries NO link, NO @handle, NO Rs/charity
# language and no ".\n." hashtag curtain. Identity + the honest record only.
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── The break being announced — edit these, everything else derives ──
DAY=1                            # the new Day 1
POST_DATE='2026-09-13'           # date the new run starts
CHAPTER='CHAPTER 05 · RETURN'
LAST_DAY=47                      # day number the retired run reached
LAST_DATE='2026-09-03'           # last logged session
BREAK_DAYS=9
BREAK_FROM='2026-09-04'
BREAK_TO='2026-09-12'
CAUSE='Fever'

WORKER='https://firstlight.live'
SUPA_HOST='edgnudrbysybefbqyijq.supabase.co'
FN="https://$SUPA_HOST/functions/v1/firstlight-sync"

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

# ── Supabase reachability ────────────────────────────────────────────────
# A filtering resolver (e.g. CleanBrowsing 185.228.168.10) sinkholes the
# *.supabase.co project host to a block page, which surfaces as a TLS
# SSL_ERROR_SYSCALL rather than a DNS error. Resolve over DoH and pin the real
# address with --resolve so the script works on a filtered network.
SUPA_IP="$(curl -sS -m 10 "https://dns.google/resolve?name=$SUPA_HOST&type=A" \
  | sed -n 's/.*"data":"\([0-9.]*\)".*/\1/p' | head -1)"
if [[ -z "$SUPA_IP" ]]; then
  echo "✘ Could not resolve $SUPA_HOST over DoH — check network." >&2
  exit 1
fi
supa() { curl -sS -m 120 --resolve "$SUPA_HOST:443:$SUPA_IP" "$@"; }

# Config comes from scripts/.env (gitignored) unless already exported, so the
# admin key never has to be pasted on a command line or into a chat window.
# Put `ADMIN_KEY=...` in scripts/.env alongside IG_ACCOUNT_ID and this just works.
if [[ -f "$(dirname "$0")/.env" ]]; then
  # shellcheck disable=SC1091
  set -a; . "$(dirname "$0")/.env"; set +a
fi
[[ -z "${IG_ACCOUNT_ID:-}" ]] && { echo "✘ IG_ACCOUNT_ID missing (scripts/.env)" >&2; exit 1; }

# ── 1 · RENDER THE SLIDES ────────────────────────────────────────────────
render() {  # $1 = variant
  local payload
  payload=$(cat <<JSON
{
  "date": "$POST_DATE",
  "chapterDay": $DAY,
  "chapter": "$CHAPTER",
  "variant": "$1",
  "orientation": "post",
  "payload": {
    "restart": {
      "lastDay": $LAST_DAY,
      "lastDate": "$LAST_DATE",
      "breakDays": $BREAK_DAYS,
      "breakFrom": "$BREAK_FROM",
      "breakTo": "$BREAK_TO",
      "cause": "$CAUSE",
      "startDate": "$POST_DATE",
      "rule": "Any workout anchors the day",
      "rituals": [
        { "label": "Wake before 4:00 AM", "km": 30 },
        { "label": "Meditation at 3:40 AM", "km": 30 },
        { "label": "Workout, daily", "km": 100 },
        { "label": "Journal, daily", "km": 30 },
        { "label": "Sleep 5.5 hours", "km": 30 }
      ]
    }
  }
}
JSON
)
  curl -sS -m 90 -X POST "$WORKER/api/render" \
    -H 'Content-Type: application/json' -d "$payload" \
    | sed -n 's/.*"publicUrl": *"\([^"]*\)".*/\1/p'
}

echo "── rendering slides ──"
SLIDE_URLS=()
for v in RESTART_HERO RESTART_RECORD RESTART_RULE; do
  url="$(render "$v")"
  [[ -z "$url" ]] && { echo "✘ render failed for $v" >&2; exit 1; }
  echo "  ✓ $v  →  $url"
  SLIDE_URLS+=("$url")
done

# ── 2 · THE CAPTION ──────────────────────────────────────────────────────
read -r -d '' CAPTION <<'CAP' || true
47 held. Then a fever took nine.

Day 1 · 13 Sep 2026.

Not a taper, not a deload — I stopped. No training, no logging, nothing to post. Swipe to slide two and count the gap bar by bar. It's all there.

The counter resets. The record doesn't.

Any workout anchors the day. Wake before 4, meditate, train, journal, sleep. Miss the workout and it's 100 km on the bike. Miss all five and it's 220.

No money this chapter — the debt is distance, and distance doesn't take excuses.

Starting at one when you've already reached 47 is the whole skill.

#runnersofindia #indianrunners #triathlonindia #ironmantraining #discipline
CAP

if [[ $DRY_RUN -eq 1 ]]; then
  echo
  echo "── caption (dry run — nothing published) ──"
  echo "$CAPTION"
  exit 0
fi

if [[ -z "${ADMIN_KEY:-}" ]]; then
  echo "✘ ADMIN_KEY not set." >&2
  echo "  Add it to scripts/.env (gitignored):  ADMIN_KEY=..." >&2
  echo "  Find it in Supabase → Table Editor → secrets → admin_api_key" >&2
  exit 1
fi

# ── 3 · PUBLISH VIA ig-proxy (token stays server-side) ───────────────────
ig_post() {  # $1 = endpoint, $2 = params JSON object
  supa -X POST "$FN?action=ig-proxy" \
    -H "X-Admin-Key: $ADMIN_KEY" -H 'Content-Type: application/json' \
    -d "{\"endpoint\":\"$1\",\"params\":$2}"
}

echo
echo "── creating carousel items ──"
CHILD_IDS=()
for url in "${SLIDE_URLS[@]}"; do
  resp="$(ig_post "$IG_ACCOUNT_ID/media" "{\"image_url\":\"$url\",\"is_carousel_item\":\"true\"}")"
  id="$(echo "$resp" | sed -n 's/.*"id":"\([0-9]*\)".*/\1/p')"
  [[ -z "$id" ]] && { echo "✘ container failed: $resp" >&2; exit 1; }
  echo "  ✓ container $id"
  CHILD_IDS+=("$id")
done

CHILDREN="$(IFS=,; echo "${CHILD_IDS[*]}")"
CAPTION_JSON="$(printf '%s' "$CAPTION" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')"

echo "── creating carousel ──"
resp="$(ig_post "$IG_ACCOUNT_ID/media" "{\"media_type\":\"CAROUSEL\",\"children\":\"$CHILDREN\",\"caption\":$CAPTION_JSON}")"
CAROUSEL_ID="$(echo "$resp" | sed -n 's/.*"id":"\([0-9]*\)".*/\1/p')"
[[ -z "$CAROUSEL_ID" ]] && { echo "✘ carousel failed: $resp" >&2; exit 1; }
echo "  ✓ carousel $CAROUSEL_ID"

echo "── waiting for Instagram to finish processing ──"
for _ in $(seq 1 12); do
  sleep 3
  st="$(supa -X POST "$FN?action=ig-proxy" -H "X-Admin-Key: $ADMIN_KEY" \
        -H 'Content-Type: application/json' \
        -d "{\"endpoint\":\"$CAROUSEL_ID\",\"method\":\"GET\",\"params\":{\"fields\":\"status_code\"}}")"
  case "$st" in
    *FINISHED*) echo "  ✓ ready"; break ;;
    *ERROR*)    echo "✘ Instagram rejected the media: $st" >&2; exit 1 ;;
  esac
done

echo "── publishing ──"
resp="$(ig_post "$IG_ACCOUNT_ID/media_publish" "{\"creation_id\":\"$CAROUSEL_ID\"}")"
MEDIA_ID="$(echo "$resp" | sed -n 's/.*"id":"\([0-9]*\)".*/\1/p')"
[[ -z "$MEDIA_ID" ]] && { echo "✘ publish failed: $resp" >&2; exit 1; }

PERMALINK="$(supa -X POST "$FN?action=ig-proxy" -H "X-Admin-Key: $ADMIN_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"endpoint\":\"$MEDIA_ID\",\"method\":\"GET\",\"params\":{\"fields\":\"permalink\"}}" \
  | sed -n 's/.*"permalink":"\([^"]*\)".*/\1/p')"

echo
echo "✓ PUBLISHED — media $MEDIA_ID"
echo "  ${PERMALINK:-https://www.instagram.com/firstlightlive/}"
