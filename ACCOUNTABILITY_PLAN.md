# FirstLight Accountability Engine — Plan

_Created 2026-06-19. Go-live: **2026-06-20** (oath starts tomorrow)._

## One sentence
Every day, hands-off: check Strava for a qualifying workout, then either auto-post a
**win** (with the oath counter) or auto-post a **miss** declaring a ₹1,000 donation,
log the forfeit, and show it on a public evidence page — while the **actual money
transfer stays manual**.

## The oath counter (NEW — core concept)
- A persistent counter, **starts at 0** at go-live (2026-06-20).
- First qualifying completion flips it **0 → 1**; each qualifying day after increments it.
- The **win post displays the counter** ("Day N").
- A **dedicated milestone design** exists for it — special treatment for the 0→1 launch flip.
- Reset-on-miss behavior: **STREAK** — a miss resets the counter to 0. Counter = current consecutive
  qualifying days. The 0→1 milestone ("launch") design therefore reappears on every restart after a miss.

## Qualifying rule (configurable)
A day is a WIN if there is at least one activity today where:
- duration **> 30 min**, AND
- if it's a **Walk**, distance **≥ 5 km** (other activity types just need > 30 min)

Otherwise → MISS.

## Daily timeline (IST / Asia-Kolkata)
- **21:00** soft check → private phone nudge only if not yet qualified.
- **23:30** final check → WIN (post + story + counter++) or MISS (post + story + forfeit logged).
- **00:15** grace re-check → catches late Garmin→Strava sync; retracts a pending forfeit if it flipped to WIN.

## Components
- **A. Strava (read):** OAuth2, auto-refresh token, pull today's activities, stats, route, photo-if-present.
- **B. Decision engine:** pure rule fn, idempotent per-day state.
- **C. Image/caption gen:** reuse `status_post/post_*.py` (PIL). Designs: WIN, WIN-milestone (counter), MISS.
- **D. Hosting:** upload to GCS → public URL (IG fetches by URL).
- **E. Instagram publish:** Instagram API w/ Instagram Login, scope `instagram_business_content_publish`,
  Creator account, no FB Page, no App Review (own account). Post + story. Long-lived token + health alert.
- **F. Ledger + evidence page:** forfeit records {date, amount, charity, status, receipt}; charity alternates
  Akshaya Patra ↔ GiveIndia; manual donation → mark paid; public evidence page from `firstlight/app/`.
- **G. Scheduler:** Google Cloud (Cloud Scheduler → Cloud Function). NOT laptop (asleep at 23:30).
- **H. Notifications:** Telegram bot — nudges, donation reminders, health/error alerts.

## Fail-safes
- Never punish on infra failure: Strava unreachable after retries → defer + alert, no miss declared.
- Garmin sync lag → 23:30 buffer + 00:15 grace.
- IST timezone pinned; idempotent posts; dry-run + force-win/force-miss test flags.
- Money is NEVER auto-moved — code only records + posts.

## Tech stack
Python 3 (existing `.venv`), Pillow, GCP (Cloud Functions, Scheduler, Secret Manager, GCS, Firestore),
Telegram Bot API, Strava API, Instagram Graph API.

## Build phases
0. Foundation: structure, config, secrets, IST, **counter store init at 0**.
1. ⭐ Strava OAuth + pull + rule engine → prints verdict (FIRST TESTABLE SLICE).
2. Image+caption gen: WIN, WIN-milestone (counter), MISS → local PNGs.
3. GCS upload → public URL.
4. Instagram publish (post + story).
5. Ledger + donation evidence page.
6. Cloud Scheduler + Telegram + health checks.
7. End-to-end dry run → go live.

## Needs from user
- Phase 1: authorize Strava (OAuth URL).
- Phase 4: create Meta app → token.
- Phase 5: confirm ₹1,000, charity order, donation links.
- Phase 6: Telegram bot token; GCS bucket; confirm GCP host.

## Open decisions
1. Counter reset on miss: **DECIDED — streak (resets to 0 on miss).**
2. Host: GCP (recommended) vs Mac.
3. Win = post + story (assumed yes).
4. Miss = public feed post (confirmed by user) + story.
5. Grace window 00:15 OK?
