# Tomorrow — resume from here

> Updated 2026-06-16 evening (after RLS lockdown + revert of stake-strip).

## Current state in one paragraph

GitHub `prod` + `main` are at `9f260e1` (₹15K language fully restored — yesterday's strip was reverted this morning). Supabase RLS has been hard-locked: 62-table god-mode-for-anon has dropped to 13 public-by-design tables only, with finance/journal/health/brahma/mastery/sleep all returning 401 to anon. **Cloudflare worker is still 4 commits behind** because wrangler is logged out and there's a known blocker we shouldn't deploy through.

## 🛑 The deploy blocker

After yesterday's RLS lockdown, the PWA's `FL.upsert()` writes now hit 401 on `daily_checkin`, `sleep_log`, `brahma_log`, `mastery_log` because anon INSERT/UPDATE was revoked on those tables. Deploying right now would silently break daily-punch — writes get queued in the offline write store and retry forever with 401s.

**Three viable resolutions, pick one before deploy:**

| Option | What | Time | Security |
|---|---|---|---|
| **A** | Re-grant anon INSERT/UPDATE on the 4 punch tables only — reads stay locked | 30 sec (one SQL call) | Strong-but-not-max: attacker can WRITE fake rows but can't READ data. For a personal 1-user app, acceptable. |
| **B** | Build Edge-function write proxy + migrate FL.upsert() → POST through firstlight-sync with admin_api_key | 30–60 min | Maximum |
| **C** | Hold deploy entirely — leave site on yesterday's "no-₹15K" version | 0 min | Same as A in effect; site temporarily shows the cleaner anti-IG-flag version |

**Recommendation: A now (so daily punch works tonight) + B in next session.**

The SQL for A:
```sql
GRANT INSERT, UPDATE ON public.daily_checkin, public.sleep_log,
                          public.brahma_log, public.mastery_log TO anon;
```
Then deploy.

## Resume sequence (after picking A or B)

```bash
# 1. Either run option A (above SQL via Management API)
#    OR finish option B (write Edge function proxy code)
# 2. Re-auth wrangler — interactive
!npx wrangler login           # sign in as firstlightlive@gmail.com (account 1a48cc…)
# 3. Deploy
cd website && npx wrangler deploy --name firstlight
# 4. Verify
bash scripts/pre-deploy-check.sh
```

## Pending non-deploy work

1. **SPF + DMARC DNS records** — add via Cloudflare DNS dashboard:
   - `TXT @ → v=spf1 include:_spf.resend.com -all`
   - `TXT _dmarc → v=DMARC1; p=quarantine; rua=mailto:tradeforgein@gmail.com; aspf=s; adkim=s; pct=100; fo=1`
2. **Device Fortress Log breach removal** — original ask from yesterday, not started yet.
3. **Token rotations**: `ghp_7aJU…1yqJ` (GitHub PAT) + `sbp_d3d1…7352` (Supabase Mgmt) — both in transcripts.
4. **Migrate admin private-table reads through Edge function** — finance / journal / brahma / sleep / mastery panels will be empty after deploy until reads flow through the Edge function. Same path as option B above.

## Audit scripts (committed under `scripts/`)

| Script | Purpose | Run |
|---|---|---|
| `test-suite.sh` | 70-check regression suite (PWA + Edge + DB + cron) | `SUPABASE_ACCESS_TOKEN=sbp_… bash scripts/test-suite.sh` |
| `verify-no-wagering.sh` | 55-check wagering-language scan (informational — user wants ₹15K back so this will report hits) | `bash scripts/verify-no-wagering.sh` |
| `security-audit.sh` | Full security audit (HTTP headers, secrets, auth, CSP, RLS, email, DNS) | `bash scripts/security-audit.sh` |
| `pre-deploy-check.sh` | Comprehensive go/no-go before any deploy | `bash scripts/pre-deploy-check.sh` |
| `strip-stake-amount.js` | Idempotent ₹-stripper (used yesterday, then reverted) — keep around | `node scripts/strip-stake-amount.js` |
| `backfill-strava-calories.sh` | Strava calorie historical backfill (already complete; safe to re-run) | `SUPABASE_ACCESS_TOKEN=sbp_… bash scripts/backfill-strava-calories.sh` |

## RLS lockdown reference (what's now locked vs open)

**LOCKED to anon** (49 tables · 401 permission denied):
- Finance: `expense_log` · `income_log` · `investment_log` · `finance_{annual_budgets,budgets,fire_config,networth,recurring}`
- Journal: `journal_{entries,insights,notes}`
- Voice/work: `voice_entries` · `deep_work_sessions` · `deepwork_log`
- Audit: `auth_audit_log` · `architecture_log` · `archive_log` · `ig_api_queue`
- Daily PII: `brahma_{log,daily,weekly,monthly}` · `sleep_log` · `daily_{checkin,logs,rituals}` · `ritual_{completions,definitions}` · `rituals_log`
- Mastery: `mastery_{log,daily,weekly,monthly_scores,ideas}`
- Health/body: `health_{daily,metrics,weekly}` · `body_weight` · `weekly_metrics`
- Other: `tomorrow_plan` · `gym_{sets,workouts}` · `goals` · `goal_comments` · `ekadashi_log` · `stories_completions` · `reading_log` · `weekly_schedule` · `monthly_grids`
- **CRITICAL**: `secrets` (locked from everyone except service_role)
- **Catastrophic ops** (TRUNCATE / DELETE / TRIGGER / REFERENCES) revoked from anon on ALL tables

**STILL public to anon** (13 tables · public-by-design):
- Read-only display: `proof_archive` · `slips` · `strava_activities` · `instagram_posts` · `races` · `config` · `site_config` · `site_stats`
- Public engagement: `comments` · `comment_reactions` · `engagement_counters` · `site_visits` · `visitor_identities`

## Cloudflare deploy account

- Cloudflare: `firstlightlive@gmail.com` · acct `1a48cc0186adbd36df5c84fb7088146c` · worker `firstlight`
- GitHub: `firstlightlive` (use `gh auth switch -u firstlightlive`)
- ❌ Avoid: `nexusnseos@gmail.com` (CF auth error 10000) · `tradeforgein` (different project)

## What's safe to leave running unattended

| Surface | Status | Note |
|---|---|---|
| pg_cron sync jobs (15 active) | running ✓ | Strava + email + sync continue on schedule |
| Strava → Supabase pipeline | healthy ✓ | Detail-fetch + MET calorie fallback in place |
| 318/318 calorie data | populated ✓ | Total 123,370 kcal across AW7 + Strava App |
| Public site at firstlight.live | live, ₹-stripped version ✓ | Will flip to ₹15K version on next deploy |
| Supabase RLS | locked ✓ | Anon can't read private data |
| IG sync (token at 4 days) | running on FB-rate-limited tokens ✓ | Alert fires every sync since FB account is restricted |

Resume tomorrow from this doc.
