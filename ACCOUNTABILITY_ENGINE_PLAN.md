# FirstLight Accountability Engine — Build Plan

**Version:** 2026-06-20 — locked after design conversation
**Owner:** Anupam Kumar (firstlightlive@gmail.com)
**Status:** Spec locked. Awaiting Chapter 02 ENDURANCE deploy before Phase 1 build.

---

## 1. What it does (one sentence)

Every day at 23:30 IST, hands-off: it checks Strava for a qualifying workout under the Chapter 02 ENDURANCE ruleset, and either auto-posts a WIN to Instagram, or auto-posts a MISS post declaring a ₹1,500 donation to Akshaya Patra, logs the forfeit on the public accountability ledger, and emails the operator a UPI deeplink — while the actual money transfer stays manual.

## 2. The qualifying rule

A day = **WIN** if any Strava activity today (IST window) matches:

| Menu item | Strava `type` (any of) | Threshold |
|---|---|---|
| Walk | `Walk`, `Hike` | distance ≥ 5 km |
| Run | `Run`, `TrailRun`, `VirtualRun` | distance ≥ 5 km |
| Cycle | `Ride`, `MountainBikeRide`, `GravelRide`, `EBikeRide`, `VirtualRide`, `EMountainBikeRide` | distance ≥ 10 km |
| Swim | `Swim` | distance ≥ 1 km |
| HR session | `Workout`, `WeightTraining`, `Yoga`, `Pilates`, `Crossfit`, `HighIntensityIntervalTraining`, `Rowing`, `RockClimbing`, `Elliptical`, `StairStepper`, `Tennis`, `Squash`, `Pickleball` | moving_time ≥ 30 min |

Otherwise → **MISS**.

Thresholds live in config and can be tuned. Activity-type lists same.

## 3. Daily timeline (Asia/Kolkata)

| Time | Action |
|---|---|
| **21:00** | Soft check. If not yet qualified → email nudge to operator: "No qualifying activity yet — 2.5h left." No public post, no forfeit. |
| **23:30** | Final check. Re-pull Strava. **WIN** → generate + publish WIN post & story to IG, update proof_archive, email confirmation. **MISS** → generate + publish MISS post to IG, append ₹1,500 row to slips/donation ledger, email operator with UPI deeplink. |
| **00:15** | Grace re-check (safety). Garmin→Strava sync can lag. If a late activity flipped MISS → WIN, retract the pending forfeit row, post a correction story ("Late sync — verdict revised to WIN"), email operator. |

## 4. Architecture

```
                  ┌─────────────────────────────────┐
  Supabase    ──▶  firstlight-sync (Edge Function)  │
  pg_cron       │                                   │
  (21:00,       │  1. Strava pull + rule eval       │◀── Strava API (OAuth, refresh token)
   23:30,       │  2. WIN / MISS decision           │
   00:15)       │  3. Render image+caption via      │◀── proof_archive (today's row)
                │     admin-dailyproof.js canvas    │
                │     spec running inside Edge Fn   │
                │  4. Upload PNG → GCS              │──▶ GCS bucket (already configured)
                │  5. IG publish via Graph API      │──▶ Instagram (Creator account)
                │  6. Update proof_archive + slips  │──▶ Supabase tables
                │  7. Email operator                │──▶ Resend (already wired)
                └─────────────────────────────────┘
                                │
                accountability.html donation ledger
                (reads slips → renders public ledger)
```

**No new infra.** Everything lives in the existing Supabase + Cloudflare + GCS stack. GCP Cloud Functions / Cloud Scheduler / Firestore NOT used (the `cloud-function/` directory is deprecated since Apr 2026).

## 5. Components in detail

### A. Strava integration
- One-time OAuth2 authorize → store refresh token in Supabase `secrets` table.
- Edge function auto-refreshes the short-lived access token each run (already implemented in firstlight-sync).
- `GET /athlete/activities` bounded to today's IST window (00:30 UTC to next 00:30 UTC).
- For WIN posts: pull stats — distance, moving_time, elevation, avg pace, average_heartrate, route polyline if GPS sport.

### B. Decision engine
- Pure TypeScript function `judgeToday(activities, ruleConfig): 'WIN' | 'MISS' | 'PENDING'`.
- Fully unit-testable.
- Idempotency: per-day record in `proof_archive` keyed by date — never double-posts or double-forfeits.
- Returns `PENDING` if Strava API unreachable after retries — never declares MISS on infra failure.

### C. Image + caption generation
- Reuse `website/js/admin-dailyproof.js` canvas spec — port to Deno-compatible image lib (sharp or skia-canvas) inside Edge Function.
- **WIN templates:** stats + route + optional Strava photo (existing 5 themes — NOIR, HEAT MAP, TERMINAL, GRADIENT, STRAVA).
- **MISS template:** "Today I missed. Akshaya Patra received the consequence. Receipt below. Back tomorrow." — lead with charity, NOT amount in headline. ₹1,500 only in body/caption.
- **Caption generator:** minimal — Day N, miss/win statement, charity, firstlight.live. No stats spam.

### D. Hosting (image storage)
- Upload generated 1080×1080 PNG to GCS bucket → public URL.
- Instagram fetches images by URL (can't accept raw bytes).
- Bucket: reuse existing GCS service account (`gcs-service-account-key.json` already in repo, gitignored).

### E. Instagram publishing
- Instagram Graph API with Creator-account permissions (`instagram_business_content_publish` scope).
- Flow: create media container (POST `/{ig-user-id}/media`) → publish (POST `/{ig-user-id}/media_publish`). Same for feed post + story.
- Long-lived token (60-day) auto-refresh + health-check alert on failure (already implemented in firstlight-sync).

### F. Donation ledger
- Reuse existing `slips` table — extended schema (`penalty_amount`, `penalty_charity`, `penalty_status`) already added in 2026-06-20 sweep.
- Schema per miss row: `{date, rule: 'Auto-Forfeit (No Qualifying Activity)', penalty_amount: 1000, penalty_charity: 'Akshaya Patra', penalty_status: 'pending', proof_url: null}`.
- On manual receipt upload: `penalty_status: 'pending' → 'paid'`, `proof_url` populated.
- Public ledger renders at accountability.html (already wired, just shows new row format).
- **One charity only — Akshaya Patra. No rotation. Pre-committed in chapters.js.**

### G. Scheduler
- Supabase pg_cron jobs (already running 4 daily + 1 weekly emails):
  - `nudge_check`: every day at 21:00 IST → POST `/functions/v1/firstlight-sync?action=nudge`
  - `final_verdict`: every day at 23:30 IST → POST `/functions/v1/firstlight-sync?action=verdict`
  - `grace_recheck`: every day at 00:15 IST → POST `/functions/v1/firstlight-sync?action=grace`

### H. Notifications — email via Resend (already wired)
- **`[FIRSTLIGHT] Day N — WIN posted ✓`** — fires at 23:30 after successful WIN publish. Body: post URL, image, stats summary.
- **`[FIRSTLIGHT] Day N — MISS posted · ₹1,500 to Akshaya Patra`** — fires at 23:30 after successful MISS publish. Body: post URL, UPI deeplink, receipt-upload URL (admin panel link).
- **`[FIRSTLIGHT] 2.5h left · no qualifying activity yet`** — fires at 21:00 only if not yet qualified.
- **`[FIRSTLIGHT ⚠] IG publish failed — manual action needed`** — fires anytime IG API rejects (token expired, account flagged, rate-limited). Body: failure reason, raw API response, manual-publish instructions. Observability only — system retries next day, no auto-pause.
- **`[FIRSTLIGHT] Day N — verdict revised: MISS → WIN`** — fires only if 00:15 grace re-check flips a verdict.

## 6. Reliability & fail-safes

| Concern | Mitigation |
|---|---|
| Strava API down at 23:30 | Retry 3× with exponential backoff. After final retry, return `PENDING` and email alert — never declare MISS on network failure. |
| Garmin→Strava sync lag | 00:15 grace re-check. If a late activity flips MISS → WIN, retract pending forfeit + post correction. |
| Timezone drift | All clocks pinned to `Asia/Kolkata` in pg_cron + Edge Function. Day boundary = IST midnight. |
| Duplicate posts | proof_archive row keyed by date with `ig_post_id` field. Edge Function checks before publishing — skip if already posted. |
| Money never auto-moved | Code only writes ledger rows + sends email. Operator donates manually via UPI. Receipt upload manual via admin panel. |
| Dry-run mode | Edge Function accepts `?dryRun=true` — runs full pipeline, returns generated image + caption + verdict, skips IG publish + email + DB writes. |
| Force flags | `?force=WIN` / `?force=MISS` for end-to-end testing on demand. |

**No kill-switch on miss count.** System runs unconditionally. If the operator misses 7 days in a row, system publishes 7 MISS posts. That's the truth — accountability requires reflecting it.

**IG publish failure does NOT pause the system.** System retries next day. Operator is alerted via email so they can manually intervene if needed.

## 7. Tech stack (uses what exists, adds nothing new)

| Layer | Tool |
|---|---|
| Runtime | Deno (Supabase Edge Functions) |
| Language | TypeScript |
| Scheduler | Supabase pg_cron |
| Activity source | Strava API v3 |
| Image gen | Deno canvas lib (sharp / skia-canvas) — port `admin-dailyproof.js` spec |
| Image hosting | GCS (existing bucket + service account) |
| IG publishing | Instagram Graph API (existing app + 60-day token) |
| Ledger | Supabase tables (`slips`, `proof_archive`) — existing schema |
| Public ledger UI | `accountability.html` (existing) |
| Notifications | Resend email (existing — `mail@firstlight.live`) |
| Secrets | Supabase `secrets` table (existing pattern) |

## 8. Build phases (each independently testable)

| Phase | Deliverable | Verifies |
|---|---|---|
| **1 ⭐** | Add `judgeToday()` to firstlight-sync. Endpoint returns verdict JSON. Strava pull + rule eval only. | Hit endpoint → returns `{verdict: 'WIN', matchedActivity: {...}}` for today. Zero risk — no publishing. |
| **2** | Port admin-dailyproof.js canvas to Edge Function. Returns base64 PNG. WIN + MISS templates. | Hit endpoint with `?dryRun=true` → returns image preview. Visually verify both variants. |
| **3** | GCS upload pipeline. Edge Function uploads PNG → returns public URL. | Verify image opens at returned URL. |
| **4** | IG publish wrapper. Container create → publish. Feed post + story. | Force-WIN dry-run → posts to staging account first → graduate to live. |
| **5** | Ledger write on MISS. Insert row into `slips` with new schema. Receipt upload UI in admin panel. | Force-MISS → row appears in accountability.html. Upload receipt → status flips to `paid`. |
| **6** | pg_cron jobs (21:00 nudge, 23:30 verdict, 00:15 grace). Email triggers via Resend. | Wait 24h or use pg_cron's manual trigger → emails arrive on time. |
| **7** | End-to-end dry run (24h) → flip to live. | Full chain runs unattended for a day. |

**Phase 1 is the first slice we build and test — proves the core with zero risk and nothing to publish.**

## 9. What's needed from operator

| Phase | Need |
|---|---|
| 1 | Confirm Strava OAuth tokens already in `secrets` table (they are — firstlight-sync already uses them) |
| 2 | None — code only |
| 3 | None — GCS already configured |
| 4 | Confirm IG long-lived token still valid (last refreshed Jun 18 per memory). Confirm Creator account ID `17841466893616231`. |
| 5 | **UPI link / QR for Akshaya Patra** — needs to be hardcoded into MISS-email template. Operator to provide. |
| 6 | None — pg_cron pattern already established |
| 7 | None — operator just monitors emails for 1 day |

## 10. Locked decisions

| Decision | Locked value |
|---|---|
| Host | Supabase Edge Function + pg_cron (no GCP) |
| Source of truth | Strava only (now and post-Garmin — Garmin syncs *into* Strava) |
| Manual check-in | ❌ None |
| Decision rule | ENDURANCE menu — see §2 |
| Public witness | Daily IG post (WIN + MISS) + accountability.html ledger |
| Receipt flow | UPI → screenshot → upload to admin panel → ledger row flips to `paid` AND screenshot posted as IG comment under MISS post |
| Notifications | Email per post + 21:00 nudge if not qualified + IG-failure alert |
| Money transfer | Manual (operator UPI to Akshaya Patra) |
| Charity | Akshaya Patra only (no rotation) |
| Stake amount | Flat ₹1,500 per miss (no escalation, no compounding) |
| Kill-switch on miss count | ❌ Removed — system runs unconditionally |
| IG publish-failure alert | ✅ Email-only, system retries next day |
| Grace re-check window | 00:15 IST — flips MISS → WIN if late Strava sync caught up |
| Dry-run + force flags | ✅ — for testing |

## 11. Dependencies (must be true before Phase 1 starts)

- [ ] Chapter 02 ENDURANCE deployed (31 files changed today, undeployed) — the rule the engine enforces must be live first
- [ ] Verify Strava refresh token in Supabase `secrets` table is valid (firstlight-sync already uses it, so should be fine)
- [ ] Verify IG long-lived token still has ≥30 days remaining
- [ ] Operator provides Akshaya Patra UPI link / QR for MISS-email template (can be added in Phase 5, not blocking Phase 1)
