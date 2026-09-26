## UI/UX Design Guidelines for FirstLight

### Design System
- Dark theme primary (#0A0C10 background)
- Font: IBM Plex Mono (headings, data) + Inter (body)
- Colors: Cyan (#00D4FF), Gold (#F5A623), Green (#00E676), Red (#FF5252), Strava Orange (#FC4C02)
- Border radius: 8-12px for cards, 4-6px for buttons
- All text mono-spaced in data displays

### Mobile-First Rules
- Test all changes at 375px (iPhone), 768px (iPad), 1024px+ (desktop)
- Minimum touch target: 44x44px
- No inline onclick handlers — use addEventListener in JS
- Use -webkit-tap-highlight-color: transparent on all interactive elements
- Use touch-action: manipulation to prevent 300ms delay
- All grids must collapse: 3-col → 2-col (tablet) → 1-col (mobile)
- Horizontal scrollable sections need -webkit-overflow-scrolling: touch
- Font sizes: use clamp() for responsive text

### Architecture Rules
- Vanilla JS only — no frameworks, no npm for frontend
- All data in Supabase (**65 tables** as of 2026-09-26 — the old "34" was stale; run `supabase/verify_tables.sql` for the live inventory) + GCS for media
- localStorage as cache, Supabase as source of truth
- History lock: 3:00 AM IST grace window
- New features: new JS module (js/admin-{name}.js) + new panel in admin.html
- Never modify existing table schemas — use JSONB for flexibility
- Script load order matters — check admin.html before adding dependencies

### Files to Know
- app.js — core utils, auth, Supabase sync, streak calculators
- admin-core.js — switchPanel routing, date nav, createDateNav
- admin-init.js — dashboard widgets, mission status, buildDashboardStats()
- styles.css — all styling, 3 themes (dark/light/outdoor)
- Nav tabs (locked): STREAK | RULES | EVIDENCE | ACCOUNTABILITY | INSTAGRAM | RACES | PROGRAMS | ABOUT (STRAVA removed from public nav 2026-07-03 — strava.html is admin-gated via fl-auth; only admins access it)

### Testing Checklist
- **Run `npm test`** before deploying — epoch agreement (fast, static) + the two puppeteer suites (food/reset, offline food + check-in). **347 checks total**: 68 static + 3 rules unit (deno) + 161 reset suite + 16 go-live + 25 food/reset + 35 offline + 39 page/sync. `npm test` runs all of them and exits non-zero on any failure.
- Run node -c on all JS files before deploying
- Check nav consistency across all 11 HTML pages
- Verify no secrets in deployable code
- Test hamburger menu on mobile
- Deploy: see the Deployment section (`npx wrangler deploy` from the repo root — NOT Firebase, which is deprecated)

### Deployment
- Hosting: Cloudflare Workers. Deploy from the REPO ROOT: `npx wrangler deploy` (reads ./wrangler.jsonc → bundles src/worker.ts Worker + serves website/ assets) — auth as firstlightlive@gmail.com. ⚠️ NEVER deploy from `cd website` — that config is assets-only (no `main`) and, because it shares the `firstlight` worker name, it OVERWRITES the real Worker and strips all `/api/*` routes (/api/render, /api/health, /api/upload, /api/proofs), causing IG-publish "Render worker returned 404". The assets-only website/wrangler.jsonc was deleted 2026-07-19 to remove this footgun.
- Custom domain: firstlight.live
- Backend sync: Supabase Edge Function `firstlight-sync` at supabase/functions/firstlight-sync/index.ts. Deploy: `SUPABASE_ACCESS_TOKEN=sbp_... supabase functions deploy firstlight-sync --project-ref edgnudrbysybefbqyijq`. ⚠️ This function MUST run with `verify_jwt=false` (pg_cron/HAE-webhook/admin_key callers send no JWT). That is now pinned in supabase/config.toml so the deploy is safe by default — but if config.toml is ever bypassed, add `--no-verify-jwt` or every cron/webhook/admin call returns `UNAUTHORIZED_NO_AUTH_HEADER`.
- Scheduler: pg_cron jobs inside Supabase (see supabase/fix_cron_jobs.sql) — NOT Google Cloud Scheduler
- Supabase: edgnudrbysybefbqyijq.supabase.co
- DEPRECATED: cloud-function/ (GCP Cloud Function, retired Apr 2026) and Firebase Hosting

### Security Rules
- Never put API secrets in HTML or JS files
- Secrets stored in: scripts/.env (local, gitignored) + Supabase Edge Function secrets (RESEND_API_KEY etc) + Supabase secrets table (strava_*, ig_*, admin_api_key, health_webhook_secret)
- Private tables (brahma, journal, checkin, mastery, rituals) require authenticated role
- Public tables (instagram_posts, strava_activities, proof_archive, slips, comments) allow anon SELECT
- Slips are immutable — no delete, no core field update
- .gitignore must cover: .strava_*, .ig_*, .env, *.secret

### Anti-Spam Rules (Strava + Instagram) — added 2026-07-24
Automated classifiers on Strava AND Instagram pattern-match a promotional footprint. Same footprint got IG restricted (scam-pattern captions) + drew Strava's club-spam warning (Jul 2026). Robust rule: **remove the fuel — no promo where a platform can see it.**
- **Strava (behavioral — the named violation):** NEVER post firstlight.live / @firstlightlive / any CTA into Strava club feeds or discussions. Not reworded, not less — zero. Keep activity titles/descriptions clean (no links, no handle). FirstLight has NO code that posts to Strava (verified) — so any Strava spam is manual; the fix is behavioral + Garmin/Strava activity-name settings.
- **Instagram captions:** NO external links in published captions. `_generateCaption()` + `_generateMonthlyCaption()` carry identity + proof stats + niche rotated hashtags ONLY. firstlight.live is a login wall (private site) → driving traffic there + ₹/charity language = scam-classifier bait. The `strava.com/activities/…` link was also removed (ties IG↔Strava). Do NOT reintroduce `firstlight.live`, `@handle`, or `.\n.\n` hashtag curtains into any IG-published caption.
- **No charity / no ₹ on any public surface — added 2026-09-12.** Chapters 04 and 05 have NO money: a miss is paid in DISTANCE (`MISS_PENANCE_KM`, the Punishment Cycle). The Akshaya Patra + ₹1,500 framing was removed from the MISS caption, the MISS + monthly-recap slides, the MISS hashtags, the cleared-miss IG comment, and the daily emails. "₹ + charity + a link to a login-walled site" is the precise scam pattern that got IG to restrict this account — do NOT reintroduce it. `STAKE_AMOUNT` / `AKSHAYA_PATRA` survive only for Chapters 01–03 historical ledger maths.
- Emails (mail@firstlight.live) may keep links — they go to the operator, not a public feed.

### Day counter
- **Current Day 1 = 2026-09-27** (moved from Sep 25 on 2026-09-26: Chapter 06 was set to open Sep 25 but recorded no kept day, so the opening slid rather than forking a second run inside one chapter — Sep 25–26 joined the transition gap). The verified Sep 13–17 run is archived as Chapter 05; the Sep 22 walk remains in the activity archive. Four live epoch values must agree: `FL_DEFAULTS.STREAK_START` (website/app.js), `DAY_EPOCH` (supabase/functions/firstlight-sync/index.ts), `FL_CURRENT_CHAPTER.dayEpoch` (website/js/chapters.js), and `STREAK_START` (website/app/app.html). Disagreement = the site and the IG captions print different day numbers for the same day. `npm run test:epoch` asserts all four agree (plus CHAPTER_6_START, GAP_START and the newest FL_BREAKS row) — run it after ANY epoch edit. Also update: `GAP_START` must stay at the first orphan day and the newest `FL_BREAKS` entry must run through the day before DAY_EPOCH, or the site renders a day number for a day that belongs to no chapter.
- A NEW CHAPTER DOES NOT RESET THE NUMBER — only a real break does. The converse also holds: **a real break ENDS the chapter.** Chapter 04 closed at the fever (Sep 3, Day 47) and Chapter 05 · RETURN opened on the far side of it (Sep 13, Day 1), so Sep 4–12 belong to no chapter at all.
- **ONE chapter, ONE epoch.** Never let a chapter hold two day-counter runs — that is what sent every archived row negative after the Sep 13 reset. A closed chapter keeps its own `dayEpoch` (Chapter 04's is `2026-07-19`, not its `start`, because its numbers continued from Chapter 03: it opened at Day 9 and closed at Day 47). Anything rendering an archived day number reads `dayEpoch`, never `start`.
- Adding a chapter means editing FOUR places: `FL_CHAPTERS` + `FL_CURRENT_CHAPTER` (website/js/chapters.js), `CHAPTER_n_START` + `chapterOf()` + `CHAPTER_BRAND` (the edge function), the chapter name on discipline/daily-sheet/index/accountability/covenant/system/about, and `CHAPTER=` in scripts/publish-restart-post.sh.
- Announce a reset with `scripts/publish-restart-post.sh` (RESTART_HERO / RESTART_RECORD / RESTART_RULE slides) only after reviewing the current record and caption.

### Independent clocks — do NOT sync these to the day counter
- `DAY1` in **website/js/admin-recovery.js** is the screens-free house (enforcement live 06:00 IST **2026-09-23**). It is NOT the workout run and does NOT move when the public epoch resets. A 2026-09-26 edit had "synced" it to DAY_EPOCH, which silently deleted clean days from a streak that never lapsed. `npm run test:epoch` now fails if it drifts.
- The **recovery / electronics system is for LIFE, not 60 days** (renamed 2026-09-26: panel title "THE LIFETIME SYSTEM", admin nav "Lifetime System"). The milestone ladder deliberately runs to Day 1825 with witness-set rewards past 180 so nothing implies a finish line at Day 61. Do not reintroduce "60-DAY SYSTEM" anywhere — 60 was only the first experiment's length.

### Food log — lifetime record (added 2026-09-26)
- **Source of truth: Supabase `food_log`** (supabase/food_log.sql — apply once in the SQL editor). No date window, no row cap, no retention rule: it runs for life. RLS is `authenticated`-only — food photos and calorie history are private, which is why it is NOT in the anon-readable `config` table.
- Before this, **website/js/admin-food.js** wrote to localStorage ONLY, capped at 500 entries, and rendered today alone — clearing the browser or logging meal 501 destroyed the oldest history. localStorage is now just the offline cache: **synced rows may be trimmed (1200), unsynced rows NEVER are** — they are the only copy until the queue drains.
- Two log paths: **SCAN** (Gemini Vision, needs signal) and **MANUAL** (typed, no AI, no photo, works fully offline). A hand-logged meal gets `verdict:'UNREVIEWED'` — never auto-CLEAN; only the owner's BROKEN mark in rules.html can create the 50 km food penalty.
- The client mints the row `id` (uuid), so a queued write replayed twice merges instead of duplicating. `window.FLFood` is the shared API — the Lifetime System panel embeds it via `FLFood.renderInto()` rather than forking a second food store.

### Offline — the home WiFi is a permanent dead zone
- Home internet is OFF by design, so **every daily logging surface must work with no network**. `sw.js` SHELL_ASSETS now precaches `/rules.html`, `/discipline.html`, `/daily-sheet.html`, `/covenant.html` and `/js/fl-authread.js` — they were missing, so offline they did not load at all. **Bump `SHELL_VERSION` on every deploy that changes a precached file** or installed PWAs stay pinned to the old cache.
- **rules.html** is local-first: a tapped mark is written to `fl_rules_local` immediately (the tap is the decision; the network is only delivery), queued in `fl_rules_pending`, and retried on load / `online` / every 60s. The auth gate accepts a cached session offline, but only on a device that has verified as the owner online at least once (`fl_rules_owner`).
- `rules-checkin` in the edge function accepts today **plus yesterday while the documented 3:00 AM IST grace window is open** (reuses `_ritualDayWindow()`), and stamps `graceSubmit:true` on such a mark. It deliberately does NOT allow unbounded back-dating: past the window a mark is reported **LATE** (`fl_rules_late`, red sync line) rather than silently recorded as on time. Widening that window is a covenant change — ask first.
- **Queued writes store their headers verbatim**, so a write parked while the network was off would replay days later with a dead JWT and 401 forever. `fl-offline.js` `restampAuth()` swaps in a live owner token before replay, and `FL.drain()` is the client-side drain (the SW cannot read localStorage, so it can never refresh a token). Anon-key writes are left alone — that key does not expire.
- `FL.upsert(table, row, { owner: true })` uses the session JWT instead of the anon key — required for any `authenticated`-only table.

### Food page + cross-page sync (added 2026-09-26)
- **website/food.html** is the dedicated food page: a month-by-month calendar of which days were tracked, a day-detail view, and THE MISSES broken into three kinds that must never be merged — (1) owner-marked **BROKEN** (the only one costing 50 km), (2) **NOT TRACKED** (no meal logged; a gap in the record, not a penalty in itself), (3) **AI FLAGGED** (advisory, never debt). Reachable from admin nav, rules.html, and the Lifetime System widget — **not** added to the locked public nav.
- The page takes its epoch from `chapters.js` (`FL_CURRENT_CHAPTER.dayEpoch`) and logs through `FLFood.logMeal` — it is deliberately NOT a fifth epoch source or a second food store. Keep it that way.
- **The change bus (`FL.emit` / `FL.onChange` in fl-offline.js)** keeps every open surface in step, in three layers: `local` (this page), `tab` (BroadcastChannel + a `storage`-event fallback, same device), `remote` (Supabase Realtime, another device). Echo suppression keys on a **per-page-load TAB_ID, never DEVICE_ID** — every tab on one device shares a DEVICE_ID, so filtering by it silently kills all cross-tab delivery.
- Realtime now joins with the **owner JWT**, not the anon key: RLS applies to the stream, so an anon join on a private table leaves a socket that looks alive and is permanently silent. `food_log.sql` also adds the table to `supabase_realtime` and sets `REPLICA IDENTITY FULL` — without the publication entry nothing ever emits.
- ⚠️ **A local write must NOT repaint the full food panel.** `#foodAnalysisResult` holds the transient scan verdict/macros/photo; repainting on the save that follows a scan detaches that node before it is ever seen. `notifyLocal()` returns early for `source === 'local'` (both local paths re-render themselves afterwards), and the coalesced external repaint bails out while anything is showing in `#foodAnalysisResult`. There is a regression test for exactly this.

### Mobile overflow — measure scrollability, NOT scrollWidth
- `documentElement.scrollWidth - innerWidth` is a **false positive** on any page with `body{overflow-x:hidden}`: it reports a wide document that is visually clipped and cannot scroll. accountability.html read 258px of "overflow" a user could never feel. The real test is `window.scrollTo(400,0)` then reading `window.scrollX` — does the page actually move. `scripts/test-golive.cjs` does this and reports clipped-vs-real separately.
- Fixed 2026-09-26 (both pre-existing): **daily-sheet.html scrolled 130px sideways** on a 390px phone — it is an A4 print sheet and `.bt` carries ~444px of fixed column widths, plus `.todayrule`/`.rmr` flex rows whose long labels cannot shrink pushed their trailing `.fl` fill-line past the edge. Now the table scrolls inside `.tscroll` and those rows wrap, **screen-only — the print layout and `@page{size:A4}` are untouched**. And **accountability.html** left the document a few px wide via a 900px decorative `.hero::before` glow; now clipped with `.hero{overflow:hidden}`.
- `npm run test:golive` renders 8 public pages at 390px on the gap day AND on Day 1, asserting: correct day number, no negative/NaN day, no JS errors, no real sideways scroll. Run it before any deploy that touches layout or the epoch.

### Table inventory — 65 tables, only 20 with a CREATE in the repo
- The code reads/writes **65** tables (derived from `SB_PUBLIC_TABLES` + `SB_NO_USERID_TABLES` in app.js, `SYNC_TABLES` in admin-sync.js, every `rest/v1/` path under website/, and every `from()`/`supaUpsert()` in the edge function). **Only 20 have a CREATE statement in supabase/*.sql** — the other 45 were made ad-hoc in the dashboard, so the repo alone can NEVER tell you whether they exist.
- **`supabase/verify_tables.sql` (READ ONLY)** checks all 65 live: present/missing, RLS on/off, and whether anon can read a table marked private (a privacy regression). Missing rows sort first; it tags 15 of them **GO-LIVE** (config, secrets, proof_archive, strava_activities, slips, health_daily, food_log, instagram_posts, daily_checkin, rituals_log, weekend_log, sleep_log, daily_logs, daily_rituals, media) — a missing GO-LIVE table blocks the run; a missing 'feature' table only breaks that one admin panel. It also prints row counts + newest dates and every cron job.
- `npm run test:epoch` asserts this file still lists every table the code references, so the inventory cannot silently drift the way the "34 tables" figure did.

### Instagram — what actually decides whether a post goes out
- **`npm run check:ig`** checks the four independent things, because any one of them silently stops publishing: the `ig_publish_enabled` gate, the `PAUSED_BY_OPERATOR_*` monthly-recap stopgap keys, the token's age against the 60-day expiry, and whether the captions are safe. None of this state is in git.
- **State 2026-09-26: `ig_publish_enabled` is `'true'`** — the daily post AND story are armed (`_publishIgStory` / `_publishVerdictStoryFrames` publish 1–2 story frames beside the verdict post). Token present, stored 39d before the 60-day wall. **16 `monthly_recap_*` keys remain `PAUSED_BY_OPERATOR_2026-09-19`, so MONTHLY RECAPS alone stay blocked through Jan 2028** — delete them to resume those. Note the Oct 1 fire needs the `2026-09` key.
- ⚠️ **The published caption is `_generateCaption()` in the EDGE FUNCTION, not website/app/index.html.** Cleaning the browser generator does nothing to what publishes. On 2026-09-26 `MISS_OPENERS` still held eight charity lines while the caption body immediately below it had been cleaned and even carried the comment "No rupees, no charity, no link" — the body was fixed and the opener pool it prepends was missed. The monthly recap still published "Rs N → Akshaya Patra". Both now distance-only. `_publishUpiLink()` is dead code (defined, never called).
- A comment explaining a removal matches a grep for the thing removed. Both `check-ig` and `test-golive` reported false blockers from their own "no money, no charity" notes — strip comments before scanning source, and remember comments are served to the browser too.

### Applying SQL — order and pre-flight
- **`supabase/verify_state.sql` is READ ONLY — run it first.** It reports which migrations are still needed (food_log table / RLS / realtime, the rules crons, HAE + watch freshness) so nothing is re-run blind.
- Pending as of 2026-09-26: **`supabase/food_log.sql`** (required — the lifetime food table; without it food logging caches locally and queues forever) and **`supabase/rules_verdict_cron.sql`** (verify; it is fully idempotent — unschedules before rescheduling — so re-running is safe, and the 21:30 IST nudge + 23:59 IST verdict crons must exist before the check-in goes live).
- SQL alone does nothing without the code: deploy `npx wrangler deploy` (repo root) **and** `supabase functions deploy firstlight-sync` after.

### Checking the phone / device channels
- **`npm run check:phone`** (optionally `-- 30` for a 30-day window) reports whether each channel is still delivering: Apple Health via HAE → `health_daily`, Strava activities, watch ritual sync, `food_log`, and the rules check-in marks. Read-only. Exits 2 if any channel is STALE or SILENT.
- A silent channel is the dangerous failure: the 23:30 verdict refuses to declare a MISS without a confirmed data channel, so dead HAE looks like "nothing happened" rather than an alarm. Precedent: HAE stopped landing Jul 3 2026 and went unnoticed until Jul 19 (supabase/fix_hae_ingest_2026_07_19.sql).
- It needs `scripts/.env` (SUPA_URL + SUPA_KEY). The local SUPA_KEY is the **anon** key, which cannot read RLS-locked tables, so the script goes through the edge function's `admin-read` proxy using the admin key already present in website/app.js.
- **Column names are NOT guessable — verify against the `healthIngest` upsert.** `health_daily` uses `active_calories` (there is no `active_energy`) and has **no `updated_at`**, so freshness is the newest `date` present. A wrong column makes the whole query 500 and the channel reports as unknown.
- **Do not treat "no recent Strava activity" as a broken channel.** Strava can only show an activity if one happened; flagging a quiet training week as STALE trains you to ignore the report. Likewise never count days before the check-in epoch as "unmarked" — that manufactures misses that were never possible.
### LIVE STATE as verified 2026-09-26 (re-verify with `npm run check:phone`)
- ✅ **`food_log` exists** — the migration applied; it reports "no meals logged yet", not "table not created".
- ✅ **Strava is LIVE** — 7 activities in 14 days, channel reachable. This is the safety net: the judge falls back to Strava, so a workout is still judged WIN with HAE dead.
- ❌ **`watch_api_key` is STILL the `<32-hex>` PLACEHOLDER.** `watch_ritual_sync.sql` was run without substituting it, so every watch call 403s. Fix with **`supabase/fix_watch_key.sql`** — it has a `RAISE EXCEPTION` guard that refuses to store another placeholder, so the silent failure cannot repeat.
- ❌ **HAE (Apple Health) dead since 2026-09-22** — only 6 of the last 14 days have a `health_daily` row, and those rows carry ONLY `workout_count`: no steps, no `active_calories`, no `sleep_hours`. The row dates match the Strava walk dates exactly. So the phone is delivering workouts at best and no daily metrics at all. Sleep-based ritual verification is therefore blind. The streak is NOT at risk (Strava fallback) but `apple_primary_judge` has no primary source.
- ⚠️ **NOT DEPLOYED as of this check:** `https://firstlight.live/app.js` still served `STREAK_START: '2026-09-25'`, `/food.html` returned **404**, and `sw.js` was still `fl-shell-v24` (local is v26). Until `npx wrangler deploy` runs, the live site prints the WRONG day number.

### Watch ritual sync — investigated 2026-09-26
- **`rituals_log` last grew 2026-07-23. The root cause is not the watch.** Daily ritual tracking moved to **discipline.html when Chapter 04 opened on 2026-07-27**, and that page is **localStorage-only (`fl_ch4_log`)** — no Supabase, no backup, no cross-device sync. `rituals_log` has two writers (admin-rituals.js and the watch endpoint) and neither is used for the daily flow any more, so its silence is expected.
- ⚠️ **OPEN EXPOSURE:** the 5 rituals AND the Punishment Cycle penance ledger therefore live on one device's localStorage. Same class of bug the food log had before 2026-09-26. Clear the browser and the record is gone. Fixing it properly = a `rituals_log`-backed (or new) table + wiring discipline.html through `FL.upsert` like the food log. NOT yet done.
- Nothing in the verdict path reads `rituals_log` (grep-verified: it appears only inside `ritualSyncGet/Post`), so the two months of silence has **not** caused wrongly-applied penance.
- **Fixed: `ritual-sync` auth failures were invisible.** A 403 returned with no `_watchSyncHealthBump` and no alert, so a stale key on the watch — or a server key never configured — failed forever unnoticed. Auth failures now bump the counter (3/day ⇒ email alert) and return a `reason` of `WATCH_KEY_NOT_CONFIGURED` or `WATCH_KEY_MISMATCH`.
- **Fixed: the placeholder key is now detected.** `supabase/watch_ritual_sync.sql` ships `'<32-hex>'` literally; if it was ever run unedited the secret IS that string. The handler now treats an absent / `<…>` / under-16-char key as unconfigured and says so explicitly.
- **Fixed: success now leaves a heartbeat** (`WATCH_SYNC_HEALTH.last_ok`), and an error no longer erases it. Without that, "calling and failing" and "not calling at all" were indistinguishable.
- `npm run check:phone` and `supabase/verify_state.sql` both report the key state and the telemetry.
