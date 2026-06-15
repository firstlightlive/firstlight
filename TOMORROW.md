# Tomorrow — resume from here

## State as of 2026-06-15 evening

### ✅ Already done
- **GitHub:** `860895c` is the latest commit on both `prod` and `main`. All cleanup committed + pushed.
- **All 17 wagering / money-stake patterns are at zero in source** (₹15,000, ₹20,000, ₹15K, Rs.20,000, $200, ON THE LINE, AT STAKE, Miss = you collect, CLAIM IF I MISS, real stakes, defended, PAY ₹, TOTAL AT RISK, etc.).
- **Tests pass on disk:** 70/70 regression + 55/55 wagering scan = 125/125.

### ⚠ Deploy gap (~1 minute of work to close)
- **Cloudflare is 3 commits behind GitHub.** Worker still serves the previous version.
- **Wrangler is logged out** — that's why the last `wrangler deploy` failed silently last night.
- 2 live wagering leaks remain on the deployed site until the redeploy:
  - `FOLLOW TO CLAIM THE ₹15k IF I QUIT` — canvas-painted onto IG slide (Meta OCRs images) — **highest priority**
  - `Rs.20,000` in admin escalation table — PIN-gated, low risk

## Resume sequence (3 commands)

```bash
# 1. Re-auth wrangler (browser-based, ~30s)
!npx wrangler login        # sign in as firstlightlive@gmail.com (account 1a48cc…)

# 2. Deploy the 3 pending commits
cd website && npx wrangler deploy --name firstlight

# 3. Verify the 2 live leaks are gone
bash scripts/verify-no-wagering.sh
# Expect: 55 pass · 0 fail
# Also expect these two greps to return 0 hits:
curl -sL "https://firstlight.live/app/index.html?cb=$RANDOM" | grep -c "FOLLOW TO CLAIM"
curl -sL "https://firstlight.live/admin.html?cb=$RANDOM" | grep -c "Rs.20,000"
```

## After the deploy is clean — next ask (not yet started)

**User request from 2026-06-15:** "remove the Device Fortress Log breach from the daily checkin, it is creating some kind of issues"

Steps to scope it:
```bash
# Find where 'Device Fortress' / 'Fortress' is rendered/written
grep -rln "Fortress\|fortress\|device.fortress" website/ app/ --include='*.html' --include='*.js' | head -10
# Look at admin-checkin.js for any DEVICE / FORTRESS section
grep -n "Fortress\|device" website/js/admin-checkin.js
# Check fortress-analytics module
ls website/js/admin-fortress*
```

User probably wants the section removed from the admin-checkin panel + any auto-punishment / log it emits.

## Pending token rotations (security)

Both still need rotation when you have 30 seconds free:
1. **GitHub PAT** (fingerprint `ghp_7aJU…1yqJ`, firstlightlive). Rotate: https://github.com/settings/tokens
2. **Supabase Management** (fingerprint `sbp_d3d1…7352`). Rotate: https://supabase.com/dashboard/account/tokens

Both appeared in chat transcripts during 2026-06-15. Neither was pushed to GitHub (push protection caught them).

## Diagnostic — if anything looks off tomorrow

```bash
# Quick health check (no auth needed)
bash scripts/test-suite.sh                                  # 70 checks
bash scripts/verify-no-wagering.sh                          # 55 checks

# Full health with management API
SUPABASE_ACCESS_TOKEN=sbp_… bash scripts/test-suite.sh      # 70 checks + cron + secrets + schema
```

## Cloudflare deploy account

- email: `firstlightlive@gmail.com`
- account ID: `1a48cc0186adbd36df5c84fb7088146c`
- worker name: `firstlight`
- domain: `firstlight.live`
- Previous (wrong) account that throws auth error 10000: `nexusnseos@gmail.com` — do NOT use

## Last working state

| Surface | Status |
|---|---|
| GitHub (prod + main) | `860895c` ✓ |
| Cloudflare worker | version `8669c687` (3 commits behind) ⚠ |
| Supabase Edge function (`firstlight-sync`) | up to date · last deploy 2026-06-15 |
| pg_cron jobs (15 total) | all active ✓ |
| Strava sync | healthy, calories 318/318 ✓ |
| Instagram | account still under review (token only 4d) — separate Facebook issue |

Resume here. Browser → wrangler login → deploy → verify. Then onto Device Fortress.
