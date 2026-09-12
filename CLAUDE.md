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
- All data in Supabase (34 tables) + GCS for media
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
- Run node -c on all JS files before deploying
- Check nav consistency across all 11 HTML pages
- Verify no secrets in deployable code
- Test hamburger menu on mobile
- Deploy: firebase deploy --only hosting --project firstlightlive-5012b

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
- **Day 1 = 2026-09-13** (reset after a 9-day fever break, Sep 4–12; the old run reached Day 47 on Sep 3). One epoch, THREE files that must agree: `FL_DEFAULTS.STREAK_START` (website/app.js), `DAY_EPOCH` (supabase/functions/firstlight-sync/index.ts), `FL_CURRENT_CHAPTER.dayEpoch` (website/js/chapters.js). Disagreement = the site and the IG captions print different day numbers for the same day.
- A NEW CHAPTER DOES NOT RESET THE NUMBER — only a real break does. The converse also holds: **a real break ENDS the chapter.** Chapter 04 closed at the fever (Sep 3, Day 47) and Chapter 05 · RETURN opened on the far side of it (Sep 13, Day 1), so Sep 4–12 belong to no chapter at all.
- **ONE chapter, ONE epoch.** Never let a chapter hold two day-counter runs — that is what sent every archived row negative after the Sep 13 reset. A closed chapter keeps its own `dayEpoch` (Chapter 04's is `2026-07-19`, not its `start`, because its numbers continued from Chapter 03: it opened at Day 9 and closed at Day 47). Anything rendering an archived day number reads `dayEpoch`, never `start`.
- Adding a chapter means editing FOUR places: `FL_CHAPTERS` + `FL_CURRENT_CHAPTER` (website/js/chapters.js), `CHAPTER_n_START` + `chapterOf()` + `CHAPTER_BRAND` (the edge function), the chapter name on discipline/daily-sheet/index/accountability/covenant/system/about, and `CHAPTER=` in scripts/publish-restart-post.sh.
- Announce a reset with `scripts/publish-restart-post.sh` (RESTART_HERO / RESTART_RECORD / RESTART_RULE slides).
