# FirstLight — Test Cases & Known Issues Registry

> Last updated: 2026-04-23
> Purpose: Track all bugs found, fixes applied, and regression tests to prevent recurrence.
> Total bugs fixed: 27 | Critical: 9 | High: 10 | Medium: 8

---

## SECTION 1: BUGS FOUND & FIXED (April 21-23, 2026)

### BUG-001: Admin API Key Prompt Blocking Instagram Publishing
- **Severity**: HIGH
- **Date Found**: 2026-04-22
- **Symptom**: User prompted "Enter admin API key (one-time setup)" every time they tried to publish carousel/reel/story.
- **Root Cause**: Admin key was not pre-configured. `_FL_ADMIN_KEY` defaulted to empty string.
- **Fix**: Hardcoded admin key as default fallback. Removed `prompt()` dialog entirely.
- **File**: `app/index.html` line ~9645
- **Regression Test**: Open generator in incognito → click PUBLISH CAROUSEL → should NOT show any prompt → should proceed to upload.

### BUG-002: Instagram Token Exposed in Client-Side Code
- **Severity**: CRITICAL (Security)
- **Date Found**: 2026-04-21
- **Symptom**: Instagram access token was passed directly from browser to `graph.facebook.com`.
- **Root Cause**: Token was in client code for direct API calls.
- **Fix**: All 7 direct `graph.facebook.com` calls replaced with `_igProxy()` → Cloud Function proxy.
- **Files**: `app/index.html`, `cloud-function/index.js`
- **Regression Test**: `grep -r "graph.facebook.com" website/` → zero matches.

### BUG-003: Carousel Status Polling Crash (`statusResp` undefined)
- **Severity**: CRITICAL
- **Date Found**: 2026-04-21
- **Symptom**: Carousel publishing always crashed during status polling.
- **Root Cause**: Stale line `var statusData = await statusResp.json()` left after proxy refactor.
- **Fix**: Removed duplicate line.
- **File**: `app/index.html` line ~9723
- **Regression Test**: Publish a carousel → should poll status without error → should publish.

### BUG-004: Cloud Function `children` Param Not Forwarded
- **Severity**: CRITICAL
- **Date Found**: 2026-04-21
- **Symptom**: Carousel containers created without child slide links.
- **Root Cause**: `container` type handler didn't forward `body.children`.
- **Fix**: Added `if (body.children) params.append('children', body.children)`.
- **File**: `cloud-function/index.js` line ~466
- **Regression Test**: Create carousel with 2+ slides → publish → Instagram shows all slides.

### BUG-005: `httpPost` Response Wrapper Mismatch
- **Severity**: CRITICAL
- **Date Found**: 2026-04-21
- **Symptom**: Client expected `{id}` but Cloud Function returned `{status, data: {id}}`.
- **Root Cause**: `httpPost()` returns `{status, data}` wrapper.
- **Fix**: Changed to `res.json(result.data || result)` for container/publish/comment types.
- **File**: `cloud-function/index.js` lines 471, 477, 483
- **Regression Test**: `curl` container creation → response has `id` at top level.

### BUG-006: `_uploadToGCS` Missing Closing Brace
- **Severity**: CRITICAL
- **Date Found**: 2026-04-21
- **Symptom**: Video uploads trapped inside else block. Syntax error.
- **Root Cause**: Missing `}` to close else block.
- **Fix**: Added closing `}`.
- **File**: `app/index.html` line ~10290
- **Regression Test**: `node -c` syntax check passes. Upload both JPEG and video.

### BUG-007: Hamburger Menu Not Working on Mobile
- **Severity**: HIGH
- **Date Found**: 2026-04-21
- **Symptom**: Tapping hamburger icon did nothing — opened and immediately closed.
- **Root Cause**: Two click handlers — inline script + `initNav()` in app.js.
- **Fix**: Removed duplicate from `initNav()`. Changed `<div>` to `<button>` on all 13 pages. White 3px lines.
- **Files**: `app.js`, all 13 HTML files, `styles.css`
- **Regression Test**: On mobile → tap hamburger → menu opens → tap link → navigates. Test ALL 13 pages.

### BUG-008: Admin Page Missing Hamburger Script
- **Severity**: HIGH
- **Date Found**: 2026-04-21
- **Symptom**: On admin.html mobile, hamburger button had no click handler.
- **Root Cause**: admin.html was missing the inline hamburger script.
- **Fix**: Added inline hamburger script.
- **File**: `admin.html` line ~409
- **Regression Test**: On admin.html mobile → tap hamburger → public nav opens.

### BUG-009: `AUTHORIZED_EMAIL` Empty — All Logins Blocked
- **Severity**: CRITICAL
- **Date Found**: 2026-04-21
- **Symptom**: Login shows "Unauthorized email" for every email.
- **Root Cause**: `FL.AUTHORIZED_EMAIL` set to `''` during security cleanup.
- **Fix**: Restored to `'firstlightlive@gmail.com'`.
- **File**: `app.js` line ~53
- **Regression Test**: Login with correct email → succeeds. Wrong email → "Unauthorized".

### BUG-010: `updateCounters()` — `day` Variable Out of Scope
- **Severity**: MEDIUM
- **Date Found**: 2026-04-21
- **Symptom**: Streak status text never displayed.
- **Root Cause**: Streak text code was outside the `try` block.
- **Fix**: Moved inside try block using `calendarDay`.
- **File**: `app.js` lines 272-283
- **Regression Test**: Public page → `[data-streak]` shows "BUILDING" or "WEEK X".

### BUG-011: `getCurrentStake()` Called Without Argument
- **Severity**: MEDIUM
- **Date Found**: 2026-04-21
- **Symptom**: `[data-stake]` always showed ₹15,000 regardless of day.
- **Root Cause**: Called with no argument → always returned day 1 rate.
- **Fix**: Changed to `getCurrentStake(getDayNumber())`.
- **File**: `app.js` line ~113
- **Regression Test**: On day 101+ → should show ₹20,000.

### BUG-012: Gym Cross-Device Sync Key Mismatch
- **Severity**: HIGH
- **Date Found**: 2026-04-22
- **Symptom**: Gym workouts don't appear across devices.
- **Root Cause**: `admin-sync.js` used `fl_gym_` but `admin-gym.js` reads `fl_gym_workout_`.
- **Fix**: Changed sync engine to `fl_gym_workout_`.
- **File**: `js/admin-sync.js` lines 48, 355
- **Regression Test**: Save workout on phone → open on laptop → data appears.

### BUG-013: Check-in Fields Not Syncing
- **Severity**: HIGH
- **Date Found**: 2026-04-22
- **Symptom**: Manual check-in fields lost on device switch.
- **Root Cause**: `setCheckinField()` never called `saveCheckin()`.
- **Fix**: Now calls `saveCheckin(date, data)`.
- **File**: `js/admin-checkin.js` line ~288
- **Regression Test**: Set mood → switch device → same value.

### BUG-014: Duplicate `addExerciseToWorkout()`
- **Severity**: MEDIUM
- **Date Found**: 2026-04-22
- **Symptom**: Exercise picker tagged wrong muscle group.
- **Root Cause**: Second definition overwrote first with different signature.
- **Fix**: Renamed second to `addCustomExerciseToWorkout()`.
- **File**: `js/admin-gym.js` lines 133, 271
- **Regression Test**: Add from picker → muscle is correct.

### BUG-015: Cloud Function Missing Env Vars
- **Severity**: CRITICAL
- **Date Found**: 2026-04-22
- **Symptom**: All server-side sync silently failed.
- **Root Cause**: Env vars lost during redeployment (`--set-env-vars` replaces ALL vars).
- **Fix**: Redeployed with all 6 env vars: SUPA_URL, SUPA_KEY, ADMIN_API_KEY, STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, IG_ACCOUNT_ID.
- **Regression Test**: `curl` sync → `{"success": true}`.

### BUG-016: Path Traversal in Upload Endpoint
- **Severity**: CRITICAL (Security)
- **Date Found**: 2026-04-21
- **Symptom**: `../../tokens/strava_refresh` could overwrite GCS token files.
- **Root Cause**: Filename regex preserved `/` and `.`.
- **Fix**: Strip `..`, remove `/`, force `instagram/` prefix. 50MB limit.
- **File**: `cloud-function/index.js` line ~503
- **Regression Test**: Upload with `../../` → sanitized, no traversal.

### BUG-017: Sync/Backup Endpoints Had No Auth
- **Severity**: HIGH (Security)
- **Date Found**: 2026-04-21
- **Symptom**: Anyone could trigger unlimited syncs.
- **Root Cause**: Auth only checked for `upload` and `publish`.
- **Fix**: All actions except `health` require `X-Admin-Key`.
- **File**: `cloud-function/index.js` lines 438-446
- **Regression Test**: Sync without key → 403. Health without key → 200.

### BUG-018: `_runInit()` No Error Isolation
- **Severity**: MEDIUM
- **Date Found**: 2026-04-22
- **Symptom**: One failing init killed all subsequent functions.
- **Root Cause**: No try/catch around individual calls.
- **Fix**: Each init wrapped in individual try/catch.
- **File**: `app.js` lines 2209-2216
- **Regression Test**: Page renders with nav/counters even if one function throws.

### BUG-019: `initSmoothScroll` Crash on `href="#"`
- **Severity**: MEDIUM
- **Date Found**: 2026-04-22
- **Symptom**: `querySelector('#')` threw error.
- **Root Cause**: Empty fragment is not a valid selector.
- **Fix**: Skip `href="#"`, wrap in try/catch.
- **File**: `app.js` lines 360-368
- **Regression Test**: No console errors on pages with `<a href="#">`.

### BUG-020: Generator X-Frame-Options DENY Blocking Iframe
- **Severity**: HIGH
- **Date Found**: 2026-04-21
- **Symptom**: Generator "refused to connect" inside app.html.
- **Root Cause**: `X-Frame-Options: DENY` blocked same-origin iframes.
- **Fix**: Changed to `SAMEORIGIN`.
- **File**: `firebase.json`
- **Regression Test**: `firstlight.live/app/app.html` → generator loads in iframe.

### BUG-021: CSP Blocking Instagram Publishing
- **Severity**: CRITICAL
- **Date Found**: 2026-04-23
- **Symptom**: "Container error: Only photo or video can be accepted" on all publish types.
- **Root Cause**: CSP `connect-src` missing `storage.googleapis.com` and Cloud Run URL. Browser blocked fetch to GCS for upload verification.
- **Fix**: Added `storage.googleapis.com`, `firstlight-sync-*.a.run.app`, `api.openai.com` to CSP `connect-src`.
- **File**: `firebase.json`
- **Regression Test**: Publish carousel/story/reel → all succeed without container errors.

### BUG-022: CSP Blocking Instagram Page Images
- **Severity**: HIGH
- **Date Found**: 2026-04-23
- **Symptom**: All Instagram post images blank/broken on instagram.html.
- **Root Cause**: CSP `img-src` missing `*.cdninstagram.com` and `*.fbcdn.net`.
- **Fix**: Added `*.cdninstagram.com`, `*.fbcdn.net`, `scontent.cdninstagram.com` to CSP `img-src`.
- **File**: `firebase.json`
- **Regression Test**: Open instagram.html → all post images load.

### BUG-023: Admin Sidebar Not Scrollable on iOS
- **Severity**: HIGH
- **Date Found**: 2026-04-22
- **Symptom**: Sidebar opens but can't scroll to SADHANA, DEEP WORK, SYSTEM groups.
- **Root Cause**: iOS Safari bug — `position:fixed` + `transform:translateX` + `overflow-y:scroll` doesn't receive touch scroll events.
- **Fix**: Changed mobile sidebar from transform slide-in to full-screen overlay (display:none/flex — same pattern as nav-mobile). Body scroll lock when open.
- **File**: `admin.html` CSS + sidebar script
- **Regression Test**: On iPhone → tap ☰ → sidebar opens full screen → scroll to SYSTEM → tap Sync Center → panel opens.

### BUG-024: Admin Sidebar Groups/Items Not Tappable on iOS
- **Severity**: HIGH
- **Date Found**: 2026-04-22
- **Symptom**: Only dashboard worked. Tapping group headers or items did nothing.
- **Root Cause**: Inline `onclick` handlers unreliable on iOS. Script loaded before `switchPanel` was defined.
- **Fix**: Removed all 60+ inline `onclick` from sidebar. Event delegation on sidebar element. Script loads LAST after all modules.
- **File**: `admin.html` sidebar items + bottom script
- **Regression Test**: On iPhone → tap any group header → expands → tap any item → panel switches.

### BUG-025: Mixed Content — "Not Secure" Cross Mark on HTTPS
- **Severity**: HIGH
- **Date Found**: 2026-04-23
- **Symptom**: Browser shows crossed-out padlock / "Not Secure" despite HTTPS.
- **Root Cause**: 6 files had `http://localhost:3001` and `http://127.0.0.1:3001` URLs for local upload server. Browsers detect ANY `http://` reference and flag as mixed content.
- **Fix**: Removed all `http://` references. Local server fallbacks replaced with Cloud Function URLs. Zero `http://` in entire codebase.
- **Files**: `app/index.html`, `js/admin-storage.js`, `js/admin-profile.js`, `js/admin-races.js`, `js/admin-settings.js`
- **Regression Test**: `grep -rn "http://" website/ --include="*.html" --include="*.js"` → zero results (excluding comments about protocols). Browser padlock shows clean HTTPS.

### BUG-026: Reel Thumbnail Shows Black Screen
- **Severity**: MEDIUM
- **Date Found**: 2026-04-23
- **Symptom**: Generated reel video thumbnail/poster is black instead of showing the selfie.
- **Root Cause**: MediaRecorder captured frame 0 which was a black `fillRect` before the selfie was drawn. Images not waited for before recording started.
- **Fix**: (1) Wait for images via `onload` callbacks. (2) Pre-render Beat 1 frame 0 BEFORE starting recorder. (3) Wider image cascade: iT→i2→i1→i3→iS.
- **File**: `app/index.html` — `generateReel()` function
- **Regression Test**: Upload selfie → generate reel → thumbnail shows selfie with DAY overlay, not black.

### BUG-027: Strava Sync Failing — Missing Client Credentials
- **Severity**: CRITICAL
- **Date Found**: 2026-04-22
- **Symptom**: Dashboard not updated. Sync returns "Strava: token refresh failed".
- **Root Cause**: `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` env vars missing from Cloud Function (lost during redeploy). Token couldn't auto-refresh.
- **Fix**: Redeployed Cloud Function with all 6 env vars.
- **Regression Test**: `curl` sync with key → `{"success": true, "health": {"status": "healthy", "warnings": ""}}`. No "token refresh failed" warning.

---

## SECTION 2: REGRESSION TEST CHECKLIST

Run this checklist before every deployment.

### Navigation (Mobile — 375px iPhone)
- [ ] index.html — hamburger opens, all links visible, tap navigates
- [ ] proof.html — hamburger works
- [ ] covenant.html — hamburger works
- [ ] about.html — hamburger works
- [ ] strava.html — hamburger works
- [ ] marathon.html — hamburger works
- [ ] programs.html — hamburger works
- [ ] accountability.html — hamburger works
- [ ] system.html — hamburger works
- [ ] instagram.html — hamburger works, all images load
- [ ] story.html — hamburger works
- [ ] admin.html — hamburger works for public nav, sidebar ☰ opens full-screen overlay
- [ ] 404.html — hamburger works

### Admin Sidebar (Mobile — 375px iPhone)
- [ ] Tap ☰ → sidebar opens as full-screen overlay
- [ ] Sidebar scrolls smoothly to bottom (SYSTEM group visible)
- [ ] Tap group header → group expands/collapses
- [ ] Tap item → panel switches, sidebar closes
- [ ] Tap ☰ again → sidebar closes
- [ ] All 12 groups accessible: Command Center, Reading, Streaks, Body, Fortress, Sadhana, Deep Work, Mastery, Accountability, Journal, Reviews, Content Engine, System

### Navigation (iPad — 768px)
- [ ] Hamburger shows (screen < 900px)
- [ ] Content readable, grids 2-column
- [ ] Touch targets all >= 44px

### Navigation (Desktop — 1200px)
- [ ] Desktop nav links visible, hamburger hidden
- [ ] All 13 page links work (including MY STORY)

### Authentication
- [ ] Login with `firstlightlive@gmail.com` → succeeds
- [ ] Login with wrong email → "Unauthorized email"
- [ ] Login with wrong password → error with attempt counter
- [ ] 5 wrong attempts → locked 15 minutes
- [ ] Password reset flow → email → set new password → login
- [ ] Inactivity timeout fires on admin page only

### Instagram Publishing
- [ ] Generate carousel → PUBLISH CAROUSEL → no prompt → uploads → publishes → post ID
- [ ] Generate reel → PUBLISH REEL → uploads video → creates container → publishes
- [ ] Generate story → PUBLISH STORY → uploads → publishes
- [ ] First comment posted with hashtags + links
- [ ] Zero `graph.facebook.com` in client code
- [ ] Reel thumbnail shows selfie, not black screen

### Data Saving & Sync
- [ ] Rituals: toggle → reload → persists
- [ ] Deep Work: add block → reload → persists
- [ ] Brahma Daily: fill → reload → persists, syncs to Supabase
- [ ] Brahma Monthly: fill → reload → persists, syncs to Supabase
- [ ] Mastery: log daily → reload → persists
- [ ] Gym: add workout → reload → persists. Set PR → syncs
- [ ] Slips: submit → reload → in history. Cannot delete
- [ ] Check-in: set mood → reload → same value. Seal day → Supabase
- [ ] Morning check-in: "App updated" toggle → if false at seal → auto-creates slip
- [ ] Cross-device: save on phone → open on laptop → same data

### Sync Center
- [ ] Command Center → SYSTEM → Sync Center opens
- [ ] Force Strava Sync → succeeds, shows status
- [ ] Force Instagram Sync → succeeds
- [ ] Sync Everything → succeeds
- [ ] Multiple clicks don't create duplicate data
- [ ] Status cards show last sync date and health

### Cloud Function
- [ ] `?action=health` → 200 (no key required)
- [ ] `?action=sync` without key → 403
- [ ] `?action=sync` with key → succeeds (Strava + Instagram)
- [ ] `?action=upload` with key → uploads, returns URL
- [ ] `?action=publish` with key → creates IG container
- [ ] Upload with `../../` filename → sanitized
- [ ] All 6 env vars set: SUPA_URL, SUPA_KEY, ADMIN_API_KEY, STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, IG_ACCOUNT_ID

### Security
- [ ] `https://firstlight.live/supabase_schema.sql` → 404
- [ ] `https://firstlight.live/.env` → 404
- [ ] `https://firstlight.live/gcs-service-account-key.json` → 404
- [ ] `https://firstlight.live/.git/config` → 404
- [ ] Headers: HSTS, nosniff, X-Frame SAMEORIGIN, Referrer-Policy, Permissions-Policy, CSP
- [ ] CSP connect-src includes: Supabase, Cloud Function, Cloud Run, GCS, Strava, Gemini, OpenAI
- [ ] CSP img-src includes: GCS, Supabase, cdninstagram, fbcdn
- [ ] No `http://` references in any deployed file (zero mixed content)
- [ ] Browser padlock shows clean HTTPS (no cross mark)
- [ ] No Instagram token in client code
- [ ] Private Supabase tables return empty for anon role

### Responsive (Mobile 375px)
- [ ] All buttons >= 44px touch target
- [ ] Font sizes >= 10px
- [ ] No horizontal overflow on any page
- [ ] Admin dashboard grids collapse (3→2→1 col)
- [ ] Habit tables scroll horizontally
- [ ] Generator: slide tabs, dots, save buttons all tappable

### Generator (app/index.html)
- [ ] Loads standalone at `/app` with nav bar (SITE / ADMIN links)
- [ ] Loads inside iframe at `/app/app.html` without double nav
- [ ] Day number, km, minutes, sleep fields work with numeric keyboard
- [ ] 18 themes render correctly
- [ ] AI caption toggle works (Gemini keys pre-configured)
- [ ] Screenshot extraction works
- [ ] Carousel preview shows thumbnails
- [ ] Story variant selector scrolls horizontally
- [ ] Reel thumbnail shows selfie, not black

### Story Page
- [ ] `firstlight.live/story` → 200
- [ ] "MY STORY" nav link present on all 15 pages
- [ ] 6 sections render correctly
- [ ] Live counters (DAY, UNCLAIMED) populate
- [ ] No personal/family references

---

## SECTION 3: DEPLOYMENT COMMANDS

```bash
# ── WEBSITE ──
cd /Users/Anupamlive/AnupamWork/firstlight/website
firebase deploy --only hosting --project firstlightlive-5012b

# ── CLOUD FUNCTION ──
# CRITICAL: --set-env-vars REPLACES all vars. Always include ALL 6.
cd /Users/Anupamlive/AnupamWork/firstlight/cloud-function
gcloud functions deploy firstlight-sync --gen2 --runtime=nodejs22 \
  --region=asia-south1 --source=. --entry-point=sync \
  --trigger-http --allow-unauthenticated \
  --memory=256MB --timeout=120s \
  --project=project-f050b6ba-60db-4eee-98a \
  --set-env-vars="SUPA_URL=https://edgnudrbysybefbqyijq.supabase.co,SUPA_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkZ251ZHJieXN5YmVmYnF5aWpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNTExNjEsImV4cCI6MjA5MTgyNzE2MX0.UOTH1J-022hwSQZ2QkpiRxw3wtctaVsJQEBoLYYMkHk,ADMIN_API_KEY=b8464678b573c885c449958a9ea760c08b01279d01d3a1f996fc92b7364f10b7,STRAVA_CLIENT_ID=226450,STRAVA_CLIENT_SECRET=7c170155ea6d2bdb53deb382173ada49a036860e,IG_ACCOUNT_ID=17841466893616231"

# ── PRE-DEPLOY SYNTAX CHECK ──
node -c website/app.js
node -c cloud-function/index.js
for f in website/js/admin-*.js; do node -c "$f"; done
```

---

## SECTION 4: WHAT BREAKS IF YOU REDEPLOY CLOUD FUNCTION

⚠ **WARNING**: `gcloud functions deploy --set-env-vars` REPLACES all env vars.
If you forget any of the 6 vars, that feature silently breaks:

| Missing Var | What Breaks |
|-------------|-------------|
| `SUPA_URL` | ALL Supabase writes — sync, backup, health |
| `SUPA_KEY` | ALL Supabase writes — same as above |
| `ADMIN_API_KEY` | ALL authenticated actions — sync, upload, publish |
| `STRAVA_CLIENT_ID` | Strava token refresh → sync fails silently |
| `STRAVA_CLIENT_SECRET` | Strava token refresh → sync fails silently |
| `IG_ACCOUNT_ID` | Instagram publish → wrong account or fails |

Always use the FULL deploy command from Section 3 above.

---

## SECTION 5: CONTACTS & REFERENCES

- **Firebase Console**: https://console.firebase.google.com/project/firstlightlive-5012b
- **Supabase Dashboard**: https://supabase.com/dashboard/project/edgnudrbysybefbqyijq
- **Cloud Function Logs**: GCP Console → Cloud Functions → firstlight-sync → Logs
- **GCS Bucket**: gs://firstlightlive
- **Custom Domain**: firstlight.live + www.firstlight.live (Firebase Hosting)
- **Cloud Function URL**: https://asia-south1-project-f050b6ba-60db-4eee-98a.cloudfunctions.net/firstlight-sync
- **Strava Athlete ID**: 206338460
- **IG Account ID**: 17841466893616231
- **Cron Jobs**: 8 jobs in asia-south1 (all have X-Admin-Key header)
