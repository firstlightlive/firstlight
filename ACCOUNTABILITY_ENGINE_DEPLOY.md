# Accountability Engine — Deploy Guide

**Goal:** Take the 7-phase build live. ~30 min hands-on after Chapter 02 ENDURANCE is deployed.

## Pre-flight (must be true)

- [x] Chapter 02 ENDURANCE files in `website/` (31 files, undeployed) ready to ship
- [x] Phase 1-6 code committed:
  - `supabase/functions/firstlight-sync/index.ts` — verdict engine + orchestrator
  - `src/worker.ts` — CF Worker (SVG → PNG → R2)
  - `wrangler.jsonc` — Worker entry + R2 binding
  - `package.json` — `@resvg/resvg-wasm` dependency
  - `supabase/accountability_engine_schema.sql` — slips + proof_archive columns
  - `supabase/accountability_engine_cron.sql` — 3 pg_cron jobs
- [x] R2 paid plan active on firstlightlive@gmail.com Cloudflare account
- [ ] Supabase admin key + anon key in `secrets` table (already there per `email_cron_jobs.sql`)
- [ ] Strava + IG refresh tokens in `secrets` table (already there per `syncStrava` and `syncInstagram`)
- [ ] Akshaya Patra UPI link (you supply during step 5 below)

## Deploy sequence

### 1. Install npm deps for Worker

```bash
cd /Users/Anupamlive/AnupamWork/firstlight
npm install
```

This adds `@resvg/resvg-wasm` (the SVG→PNG rasterizer).

### 2. Create R2 bucket

Via wrangler CLI (logged in as firstlightlive@gmail.com):

```bash
npx wrangler login                                  # if not already
npx wrangler r2 bucket create firstlight-proofs
```

Or via Cloudflare dashboard → R2 → Create bucket → name `firstlight-proofs`.

### 3. Enable public access on the bucket

Dashboard → R2 → `firstlight-proofs` → Settings → **Public access** → enable.

Copy the public URL (looks like `https://pub-<hash>.r2.dev`). Update `wrangler.jsonc` if it differs from `https://pub-firstlight-proofs.r2.dev`:

```jsonc
"vars": { "PROOFS_PUBLIC_BASE": "https://pub-<your-hash>.r2.dev" }
```

(Optional but recommended: add custom domain `proof.firstlight.live` in R2 → Custom Domains. Update `PROOFS_PUBLIC_BASE` accordingly. More reliable for IG fetch than r2.dev.)

### 4. Deploy the Worker

```bash
cd /Users/Anupamlive/AnupamWork/firstlight
npx wrangler deploy --name firstlight
```

This ships:
- The Worker code (`src/worker.ts`)
- R2 binding (`PROOFS`)
- Static assets (the existing `website/` directory)

Smoke-test:
```bash
curl https://firstlight.live/api/health
# Expect: { "status": "ok", "service": "firstlight-worker", ... }
```

### 5. Apply schema migrations to Supabase

In Supabase dashboard → SQL Editor (project `edgnudrbysybefbqyijq`):

1. Paste contents of `supabase/accountability_engine_schema.sql` → Run.
2. In the same session, insert the 3 new secrets:

```sql
INSERT INTO public.secrets (key, value) VALUES
  ('render_worker_base', 'https://firstlight.live'),
  ('render_worker_key',  'PASTE-A-RANDOM-32-CHAR-STRING-HERE'),  -- optional shared secret
  ('akshaya_upi_link',   'upi://pay?pa=donate@akshayapatra&pn=Akshaya%20Patra&am=1500')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

If you set `render_worker_key`, also add it to the Cloudflare Worker:

```bash
echo "PASTE-SAME-32-CHAR-STRING-HERE" | npx wrangler secret put RENDER_KEY
```

### 6. Deploy the Edge Function

```bash
SUPABASE_ACCESS_TOKEN=sbp_... \
  npx supabase functions deploy firstlight-sync --project-ref edgnudrbysybefbqyijq
```

Smoke-test the verdict engine (Phase 1):
```bash
ADMIN_KEY=$(curl -s "https://edgnudrbysybefbqyijq.supabase.co/rest/v1/secrets?key=eq.admin_api_key&select=value" \
  -H "apikey: $SUPABASE_ANON_KEY" | jq -r '.[0].value')

curl "https://edgnudrbysybefbqyijq.supabase.co/functions/v1/firstlight-sync?action=judge" \
  -H "x-admin-key: $ADMIN_KEY" | jq
# Expect: {"verdict": "WIN" | "MISS" | "PENDING", "date": "2026-06-20", "chapterDay": 1, ... }
```

### 7. Dry-run the full pipeline (force WIN)

```bash
curl "https://edgnudrbysybefbqyijq.supabase.co/functions/v1/firstlight-sync?action=engine&phase=verdict&force=WIN" \
  -H "x-admin-key: $ADMIN_KEY" | jq
```

What should happen:
- CF Worker renders WIN SVG → PNG → uploads to R2
- IG container created → published to feed
- `proof_archive` row written with verdict=WIN
- WIN email arrives at firstlightlive@gmail.com

If publish fails, check the email — it'll have the full error + retry instructions.

### 8. Schedule the cron jobs

In Supabase SQL Editor:

```sql
-- Paste contents of supabase/accountability_engine_cron.sql
```

Verify:
```sql
SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'engine-%';
```

Should show 3 rows: engine-nudge, engine-verdict, engine-grace.

### 9. 24-hour monitoring window

Watch the firstlightlive@gmail.com inbox for:
- 21:00 IST — nudge email IF no qualifying activity yet
- 23:30 IST — verdict email (WIN or MISS)
- 00:15 IST — only if grace re-check flipped MISS → WIN

If MISS at 23:30: tap UPI link in email → donate ₹1,500 → screenshot → paste as comment under the IG MISS post.

## Rollback

Disable cron jobs (system stops running, ledger frozen):

```sql
SELECT cron.unschedule('engine-nudge');
SELECT cron.unschedule('engine-verdict');
SELECT cron.unschedule('engine-grace');
```

Re-enable: re-run `supabase/accountability_engine_cron.sql`.

## Operational notes

- **Idempotency:** `runVerdict` checks `proof_archive` for today's row before publishing. Manual re-runs are safe.
- **Force flags:** `?force=WIN` or `?force=MISS` skip Strava and produce a synthetic verdict. Use for testing.
- **No kill-switch on miss count** (per locked decision). System runs unconditionally.
- **IG publish failure → email alert** (`[FIRSTLIGHT ⚠] IG publish FAILED`). System retries next day; ledger row is still written.
- **Grace re-check** flips MISS → WIN if late Strava sync arrives by 00:15 IST. Slip is marked `penalty_status='retracted'`, not deleted.
- **Caption avoids ₹ in headline** — leads with charity name. Reduces gambling-classifier surface.
- **Receipt flow:** operator manually uploads UPI screenshot as IG comment + updates `slips.penalty_status='paid'` + `slips.proof_url` via admin panel.

## Next-steps wishlist (post-go-live)

- Add `engine-retract` action so admin panel has a one-click "I made an error" button
- Better SVG templates — colour themes per day-of-week, photo overlay if Strava activity has photo
- Receipt-upload admin UI panel (`admin-engine.js`)
- Telegram bot mirror of emails (faster than email for time-sensitive nudges)
- Weekly digest email — "this week: 5 WINs, 2 MISSes, ₹1,500 to Akshaya Patra"
