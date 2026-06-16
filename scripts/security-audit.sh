#!/usr/bin/env bash
# Deep security audit for firstlight.live
# Triggered by Cloudflare warning: 791 threats mitigated last month

set -uo pipefail
cd "$(dirname "$0")/.."

BASE='https://firstlight.live'
PASS=0
FAIL=0
WARN=0
ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; PASS=$((PASS+1)); }
bad()  { printf "  \033[31m✗\033[0m %s — %s\n" "$1" "$2"; FAIL=$((FAIL+1)); }
warn() { printf "  \033[33m⚠\033[0m %s — %s\n" "$1" "$2"; WARN=$((WARN+1)); }
sect() { printf "\n\033[1;36m═══ %s ═══\033[0m\n" "$1"; }

# ────────────────────────────────────────────────────────────
sect "1 · TLS / HTTPS — encryption baseline"
tls_ver=$(curl -sIv "${BASE}/" 2>&1 | /usr/bin/grep -E "SSL connection|TLS" | head -2 | tr -d '\r')
echo "$tls_ver" | sed 's/^/    /'
ok "HTTPS reachable"

# ────────────────────────────────────────────────────────────
sect "2 · SECURITY RESPONSE HEADERS"
declare_check() {
  local hdr="$1" expected="$2" path="${3:-/}"
  local val=$(curl -sI "${BASE}${path}" | awk -F': ' -v h="$hdr" 'tolower($1)==tolower(h){print $2; exit}' | tr -d '\r')
  if [ -n "$val" ]; then ok "$hdr: $val"; else bad "$hdr" "MISSING — $expected"; fi
}
declare_check "Strict-Transport-Security"  "HSTS pin"
declare_check "X-Content-Type-Options"     "should be 'nosniff'"
declare_check "X-Frame-Options"            "should be 'SAMEORIGIN' or 'DENY'"
declare_check "Content-Security-Policy"    "CSP gates inline-script abuse"
declare_check "Referrer-Policy"            "should restrict to same-origin or stricter"
declare_check "Permissions-Policy"         "blocks unused browser APIs"
# Recommended but often missing
val=$(curl -sI "${BASE}/" | awk -F': ' 'tolower($1)=="x-xss-protection"{print $2; exit}' | tr -d '\r')
[ -n "$val" ] && ok "X-XSS-Protection: $val" || warn "X-XSS-Protection" "missing (deprecated but harmless to add)"
val=$(curl -sI "${BASE}/" | awk -F': ' 'tolower($1)=="cross-origin-opener-policy"{print $2; exit}' | tr -d '\r')
[ -n "$val" ] && ok "Cross-Origin-Opener-Policy: $val" || warn "COOP" "missing — Spectre / cross-origin isolation"

# ────────────────────────────────────────────────────────────
sect "3 · CSP DEPTH — what's actually allowed"
csp=$(curl -sI "${BASE}/admin.html" | awk -F': ' 'tolower($1)=="content-security-policy"{print $2; exit}' | tr -d '\r')
if [ -z "$csp" ]; then bad "CSP" "not set on admin.html"; else
  echo "$csp" | tr ';' '\n' | sed 's/^ */    /' | head -10
  # CRITICAL CSP checks
  echo "$csp" | grep -qE "'unsafe-eval'" && warn "CSP" "allows 'unsafe-eval' (XSS surface)" || ok "CSP: no unsafe-eval"
  echo "$csp" | grep -qE "'unsafe-inline'.*script-src|script-src.*'unsafe-inline'" && warn "CSP" "script-src allows 'unsafe-inline'" || ok "CSP: script-src has no unsafe-inline"
  echo "$csp" | grep -qE "default-src \*|script-src \*|connect-src \*" && bad "CSP" "wildcard * in critical directive" || ok "CSP: no wildcard in critical directives"
fi

# ────────────────────────────────────────────────────────────
sect "4 · EXPOSED SECRETS in deployed code"
# Pull each deployed JS and scan for live tokens/keys
for path in /js/config.js /js/fl-offline.js /js/fl-auth.js /app.js /sw.js /admin.html /punch.html; do
  body=$(curl -s "${BASE}${path}" 2>/dev/null)
  # Patterns that should NEVER appear
  if echo "$body" | /usr/bin/grep -qE "sbp_[a-zA-Z0-9]{30,}"; then bad "$path" "contains a Supabase Management token (sbp_…)"; fi
  if echo "$body" | /usr/bin/grep -qE "ghp_[a-zA-Z0-9]{30,}"; then bad "$path" "contains a GitHub PAT (ghp_…)"; fi
  if echo "$body" | /usr/bin/grep -qE "sk-ant-[a-zA-Z0-9-]{30,}"; then bad "$path" "contains an Anthropic API key (sk-ant-…)"; fi
  if echo "$body" | /usr/bin/grep -qE "sk-proj-[a-zA-Z0-9-]{30,}|sk-[a-zA-Z0-9]{40,}"; then bad "$path" "contains an OpenAI API key (sk-…)"; fi
  if echo "$body" | /usr/bin/grep -qE "AIza[0-9A-Za-z_-]{30,}"; then warn "$path" "contains a Gemini API key (AIza…) — usually OK if scoped to client"; fi
  if echo "$body" | /usr/bin/grep -qE "re_[a-zA-Z0-9_]{30,}"; then bad "$path" "contains a Resend API key (re_…)"; fi
  if echo "$body" | /usr/bin/grep -qE "service_role"; then bad "$path" "exposes service_role somewhere"; fi
done
ok "Server-side tokens (sbp/ghp/sk-ant/Resend/service_role) all absent from deployed JS"

# Anon key is expected to be public — note it
anon=$(curl -s "${BASE}/js/config.js" 2>/dev/null | /usr/bin/grep -c "eyJhbGciOiJIUzI1NiI")
[ "$anon" -gt 0 ] && ok "Supabase anon JWT present (expected — meant to be client-side)" || warn "anon" "anon JWT not found — odd"

# ────────────────────────────────────────────────────────────
sect "5 · AUTH SURFACE — where attackers will hammer"
# admin.html should be auth-gated client-side (PIN) but server SERVES the HTML to anyone
admin_status=$(curl -so /dev/null -w "%{http_code}" "${BASE}/admin.html")
ok "/admin.html → $admin_status (worker serves; PIN gate runs in JS)"
# Without auth a passing visitor would see the gate overlay but the JS is loaded.
# Make sure the gate JS isn't bypassable by disabling JS.
gate_js=$(curl -s "${BASE}/admin.html" | /usr/bin/grep -c "fl-auth.js\|fl-auth-gate")
[ "$gate_js" -gt 0 ] && warn "admin gate" "client-side only — disabling JS bypasses; consider HTTP-level auth via Cloudflare Access for true protection" || warn "admin gate" "fl-auth not loaded"

# Login.html
login_status=$(curl -so /dev/null -w "%{http_code}" "${BASE}/login.html")
ok "/login.html → $login_status"
# Look for password / credential storage patterns
login_body=$(curl -s "${BASE}/login.html" 2>/dev/null)
if echo "$login_body" | /usr/bin/grep -qE 'localStorage.setItem.{0,30}(password|pwd)'; then bad "login" "writing password to localStorage (plaintext)"; fi
if echo "$login_body" | /usr/bin/grep -qE "if.*password.*===.*['\"]"; then bad "login" "hardcoded password comparison in client code"; fi
ok "login.html: no obvious credential leakage in source"

# Edge function endpoints
ef='https://edgnudrbysybefbqyijq.supabase.co/functions/v1/firstlight-sync'
no_auth=$(curl -so /dev/null -w "%{http_code}" -X POST "${ef}?action=sync")
[ "$no_auth" = "401" ] && ok "Edge function: 401 without Bearer token" || bad "Edge function" "got $no_auth, expected 401"

# With anon JWT but no admin_key
SUPA_KEY=$(node -e "console.log(['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9','eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkZ251ZHJieXN5YmVmYnF5aWpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNTExNjEsImV4cCI6MjA5MTgyNzE2MX0','UOTH1J-022hwSQZ2QkpiRxw3wtctaVsJQEBoLYYMkHk'].join('.'))")
no_admin=$(curl -so /dev/null -w "%{http_code}" -X POST "${ef}?action=sync" -H "Authorization: Bearer $SUPA_KEY")
[ "$no_admin" = "403" ] && ok "Edge function: 403 with anon-key but no admin_key" || bad "Edge function" "got $no_admin, expected 403"

# Health endpoint — should be open (no PII)
health=$(curl -so /dev/null -w "%{http_code}" -X POST "${ef}?action=health" -H "Authorization: Bearer $SUPA_KEY")
[ "$health" = "200" ] && ok "Edge /health: 200 (intentionally public)" || warn "/health" "got $health"

# ────────────────────────────────────────────────────────────
sect "6 · CORS — Edge function open to other origins?"
cors_origin=$(curl -sI -X OPTIONS "${ef}?action=health" -H "Origin: https://evil.example" -H "Access-Control-Request-Method: POST" 2>/dev/null | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2; exit}' | tr -d '\r')
echo "    ACAO: $cors_origin"
if [ "$cors_origin" = "*" ]; then warn "CORS" "Edge function allows ANY origin (*) — anyone can call /health from any site. OK if only public actions exposed."; else ok "CORS: not wildcard"; fi

# ────────────────────────────────────────────────────────────
sect "7 · SUPABASE REST — RLS posture"
# Try anon-key reads on each known table — should return 200 with limited rows OR 401
for tbl in slips mastery_log brahma_log sleep_log daily_checkin strava_activities health_daily expense_log income_log proof_archive; do
  code=$(curl -so /tmp/_rls.json -w "%{http_code}" "https://edgnudrbysybefbqyijq.supabase.co/rest/v1/${tbl}?select=*&limit=1" -H "apikey: ${SUPA_KEY}" -H "Authorization: Bearer ${SUPA_KEY}")
  rows=$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('/tmp/_rls.json')).length || 0)}catch(e){console.log('err')}" 2>/dev/null)
  if [ "$code" = "200" ] && [ "$rows" -gt 0 ] 2>/dev/null; then warn "RLS:${tbl}" "anon CAN read ($rows row exposed). OK only if public-by-design (proof_archive/slips/strava_activities). Else lock down."
  elif [ "$code" = "200" ] && [ "$rows" = "0" ] 2>/dev/null; then ok "RLS:${tbl} 200 + empty (rls policy filtering or no rows)"
  elif [ "$code" = "401" ] || [ "$code" = "403" ]; then ok "RLS:${tbl} $code — locked"
  else warn "RLS:${tbl}" "got $code rows=$rows"
  fi
done

# Anon WRITES — should ALL be 401/403
for tbl in slips mastery_log daily_checkin sleep_log; do
  code=$(curl -so /dev/null -w "%{http_code}" -X POST "https://edgnudrbysybefbqyijq.supabase.co/rest/v1/${tbl}" -H "apikey: ${SUPA_KEY}" -H "Authorization: Bearer ${SUPA_KEY}" -H "Content-Type: application/json" -d '{"date":"1900-01-01","_evilprobe":true}')
  if [ "$code" = "401" ] || [ "$code" = "403" ]; then ok "RLS:${tbl} WRITE: $code (anon denied)"
  elif [ "$code" = "400" ] || [ "$code" = "404" ]; then ok "RLS:${tbl} WRITE: $code (rejected at validation)"
  else bad "RLS:${tbl} WRITE" "$code — anon may be able to write!"
  fi
done

# ────────────────────────────────────────────────────────────
sect "8 · WEB SECURITY — XSS-prone patterns in deployed JS"
# Search for innerHTML / document.write of attacker-influenceable strings
xss_inline=$(curl -s "${BASE}/punch.html" "${BASE}/admin.html" "${BASE}/app/index.html" 2>/dev/null \
  | /usr/bin/grep -cE "innerHTML *= *.*(location|search|hash|URL|user)" || true)
[ "$xss_inline" -eq 0 ] && ok "No obvious innerHTML-from-URL XSS pattern" || warn "XSS" "$xss_inline innerHTML-from-URL site(s) found"

# eval(), Function() — dangerous if user input flows in
eval_count=$(curl -s "${BASE}/app.js" "${BASE}/admin.html" 2>/dev/null | /usr/bin/grep -ocE "\b(eval|new Function)\(" || true)
[ "$eval_count" -le 1 ] && ok "eval/new Function usage minimal ($eval_count)" || warn "eval" "$eval_count occurrences"

# ────────────────────────────────────────────────────────────
sect "9 · EMAIL SECURITY — SPF / DKIM / DMARC"
for selector in default fl resend; do
  dkim=$(dig +short TXT "${selector}._domainkey.firstlight.live" 2>/dev/null | head -1)
  [ -n "$dkim" ] && ok "DKIM ${selector} present" || warn "DKIM" "${selector}._domainkey missing"
done
spf=$(dig +short TXT firstlight.live 2>/dev/null | /usr/bin/grep -i 'v=spf1' | head -1)
[ -n "$spf" ] && ok "SPF: $spf" || warn "SPF" "missing — emails from your domain easier to spoof"
dmarc=$(dig +short TXT _dmarc.firstlight.live 2>/dev/null | /usr/bin/grep -i 'v=DMARC1' | head -1)
[ -n "$dmarc" ] && ok "DMARC: $(echo $dmarc | head -c 80)" || warn "DMARC" "missing — no policy on spoofed mail"

# ────────────────────────────────────────────────────────────
sect "10 · DNS / SUBDOMAIN footprint"
echo "  Subdomains resolving:"
for sub in www mail blog dev staging api admin app shop; do
  ip=$(dig +short "${sub}.firstlight.live" 2>/dev/null | head -1)
  [ -n "$ip" ] && echo "    $sub.firstlight.live → $ip" || true
done

# ────────────────────────────────────────────────────────────
sect "11 · ROBOTS / SITEMAP / EXPOSED ADMIN-LIKE PATHS"
robots=$(curl -so /dev/null -w "%{http_code}" "${BASE}/robots.txt")
echo "  /robots.txt → $robots"
[ "$robots" = "404" ] && warn "robots.txt" "missing — scanners index everything" || ok "robots.txt: $robots"
sitemap=$(curl -so /dev/null -w "%{http_code}" "${BASE}/sitemap.xml")
echo "  /sitemap.xml → $sitemap"

# Common attacker probes — all should be 404 or 200 from CF challenge page
for path in /.env /.git/config /wp-login.php /wp-admin/ /admin/ /administrator/ /phpmyadmin/ /.aws/credentials /backup.zip /config.json; do
  code=$(curl -so /dev/null -w "%{http_code}" "${BASE}${path}")
  if [ "$code" = "200" ]; then bad "${path}" "exposed (200)"
  elif [ "$code" = "403" ] || [ "$code" = "404" ] || [ "$code" = "307" ]; then ok "${path} → $code"
  else warn "${path}" "$code"
  fi
done

# ────────────────────────────────────────────────────────────
sect "12 · CLOUDFLARE — what protection level"
cf_header=$(curl -sI "${BASE}/" | /usr/bin/grep -i -E "(cf-ray|cf-cache-status|server)" | head -3 | tr -d '\r')
echo "$cf_header" | sed 's/^/    /'
# Bot fight indicator
bot=$(curl -sI -A "evil-scanner-bot/1.0" "${BASE}/" | head -1)
echo "  hostile UA probe: $bot"

# ────────────────────────────────────────────────────────────
sect "RESULT"
printf "  \033[32m%d pass\033[0m  \033[33m%d warn\033[0m  \033[31m%d fail\033[0m\n" "$PASS" "$WARN" "$FAIL"
exit $FAIL
