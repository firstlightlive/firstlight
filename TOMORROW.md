# Tomorrow — resume from here

> Updated 2026-06-18 (post Google Unwanted Software Policy compliance + admin_api_key rotation + cron secrets refactor + Option A deploy)

## Current state in one paragraph

Cloudflare worker **is fully up to date** as of today. Two deploys this session:
(1) Full Google Unwanted Software Policy compliance — new `/terms` + expanded `/privacy`, JSON-LD declaring this as a personal accountability journal not a financial service, gambling-coded phrases reframed across all indexed pages, ₹15K kept visible per design philosophy, footer disclaimer + noindex on admin/punch/post-*.
(2) `admin_api_key` rotated (old `b8464678…` → new `934c03a1…`), client files updated (`app.js`, `admin-recap.js`, `admin-dailyproof.js`, `app/index.html`), and cron SQL refactored so the 15 cron jobs no longer hardcode keys — they call `firstlight_cron_call(action_name)` which reads from `public.secrets` at execution time. Supabase RLS option A applied — anon INSERT/UPDATE re-granted on `daily_checkin`, `sleep_log`, `brahma_log`, `mastery_log` so the daily-punch writes work; SELECT still locked. Edge Function verified live with new key (preflight 200) and old key (preflight 403).

## ✅ What just shipped (no follow-up needed)

- **Google policy**: `/privacy.html`, `/terms.html`, `/install.html` rewrite, footer disclaimers + Privacy/Terms links across 14 public pages, JSON-LD on top pages, `noindex,nofollow` on admin/punch/app-icon/handout/18 post-* templates, all gambling-coded language reframed while keeping ₹15K visible.
- **Option A**: `GRANT INSERT, UPDATE` on the 4 punch tables to anon. Daily punch writes will succeed. SELECT still 401 on private tables.
- **Admin key rotation**: New `934c03a1…` key in DB secrets, 5 client files updated, old key rejected with 403.
- **Cron refactor**: Helper function `public.firstlight_cron_call(action_name)` reads keys from `secrets` at call time. All 15 cron jobs rewritten to use it — zero hardcoded keys in cron command text. Repo SQL files (`supabase/fix_cron_jobs.sql`, `supabase/email_cron_jobs.sql`) regenerated to match. Rotating the key now requires only `UPDATE public.secrets SET value=…`.

## 🟡 Still pending (you, not the harness)

1. **Rotate the Supabase Mgmt token** (the `sbp_d3d1…7352` one in your transcripts) — flagged in earlier sessions; used several times today (option A SQL, secrets UPDATE, cron rebuild). Revoke + recreate at Supabase Dashboard → Account → Access Tokens.
2. **Rotate the GitHub PAT** `ghp_7aJU…1yqJ` — also flagged earlier. GitHub → Settings → Developer settings → Personal access tokens.
3. **DMARC alignment fix** — current DNS shows `aspf=s` (strict). The Google DMARC report you forwarded showed SPF alignment failing because Resend's bounce path is `send.firstlight.live`, not the apex `firstlight.live`. Flip `aspf=s` → `aspf=r` on the `_dmarc.firstlight.live` TXT record via Cloudflare DNS Dashboard (Domain → DNS → Records → find `_dmarc` → edit → save). 30 seconds. Verify with: `dig +short TXT _dmarc.firstlight.live`.
4. **Search Console + Safe Browsing transparency check** — verify whether firstlight.live was ever actually flagged under the Unwanted Software Policy. If yes, after the new `/terms` + `/privacy` are live (they are), submit a review request at Search Console → Security Issues.
5. **Postmaster Tools registration** at https://postmaster.google.com — live Gmail reputation feedback.
6. **Device Fortress Log breach removal** — original ask from Jun 16, not started.

## 🟢 Bigger work, deferred (Option B / quality improvements)

- **Option B from the prior plan**: route all `FL.upsert()` writes through `firstlight-sync` Edge Function with `admin_api_key`. This would let you fully re-lock anon writes on the 4 punch tables. Option A is the temporary fix; B is the durable one.
- **Code-review bugs found in the deep read** (untouched today):
  - `app.js:181-187` `getDayNumber()` builds today via `new Date(year, month, day)` — uses runtime's local TZ, not IST. Off-by-one possible at midnight boundary.
  - `app.js:682` `LOCK_HOUR = 0` but `CLAUDE.md` says "History lock: 3:00 AM IST grace window". One of them is wrong.
  - `website/js/admin-claims.js` — 5.4 KB orphan, never loaded by `admin.html`. Delete or wire up.
  - `website/sw.js:6` `SHELL_VERSION = 'fl-shell-v5'` hardcoded. If you forget to bump on next deploy, installed PWAs stay pinned to today's shell.

## Audit scripts (committed under `scripts/`)

| Script | Purpose | Run |
|---|---|---|
| `test-suite.sh` | 70-check regression suite (PWA + Edge + DB + cron) | `SUPABASE_ACCESS_TOKEN=sbp_… bash scripts/test-suite.sh` |
| `security-audit.sh` | Full security audit (HTTP headers, secrets, auth, CSP, RLS, email, DNS) | `bash scripts/security-audit.sh` |
| `pre-deploy-check.sh` | Comprehensive go/no-go before any deploy — **note section 6 still hardcodes the Option A blocker; update or ignore** | `bash scripts/pre-deploy-check.sh` |
| `backfill-strava-calories.sh` | Strava calorie historical backfill (already complete; safe to re-run) | `SUPABASE_ACCESS_TOKEN=sbp_… bash scripts/backfill-strava-calories.sh` |
| `strip-stake-amount.js` | (deprecated) reverted Jun 16 — user explicitly wants ₹15K visible | n/a |

## RLS state (post-Option A)

**LOCKED to anon SELECT (49 tables · 401 on read)** — unchanged from Jun 16 lockdown:
- Finance, journal, voice/work, audit, daily PII, mastery, health/body, planning, system meta tables. All same as before.
- **`secrets`** still locked to service_role only.

**Anon INSERT/UPDATE NEWLY re-granted on (Option A)** — but read still locked:
- `daily_checkin`, `sleep_log`, `brahma_log`, `mastery_log`

**STILL public to anon (13 tables)** — unchanged:
- `proof_archive`, `slips`, `strava_activities`, `instagram_posts`, `races`, `config`, `site_config`, `site_stats`, `comments`, `comment_reactions`, `engagement_counters`, `site_visits`, `visitor_identities`

## Cloudflare deploy account

- Cloudflare: `firstlightlive@gmail.com` · acct `1a48cc0186adbd36df5c84fb7088146c` · worker `firstlight`
- GitHub: `firstlightlive` (use `gh auth switch -u firstlightlive`)
- ❌ Avoid: `nexusnseos@gmail.com` (CF auth error 10000) · `tradeforgein` (different project)

## What's safe to leave running unattended

| Surface | Status | Note |
|---|---|---|
| pg_cron sync jobs (15 active) | running ✓ | Now key-leak-free; reads from secrets table at call time |
| Strava → Supabase pipeline | healthy ✓ | Detail-fetch + MET calorie fallback in place |
| Public site at firstlight.live | live ✓ | Google-policy compliant + ₹15K visible |
| Supabase RLS | locked except Option A writes ✓ | Anon can't read private data; can write to the 4 punch tables only |
| IG sync | running ✓ | |

Resume tomorrow from this doc.
