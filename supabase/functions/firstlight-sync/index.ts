// ═══════════════════════════════════════════════════════
// FIRST LIGHT — Supabase Edge Function (replaces GCP Cloud Function)
// Handles: Strava sync, Instagram sync, health ingest, IG proxy
// Deploy: supabase functions deploy firstlight-sync
// ═══════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { evaluateRulesCheckin } from './rules.ts'

const SUPA_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPA_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const SUPA_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
const IG_ACCOUNT_ID = '17841466893616231'
// Sentinel days_left for a token Facebook reports as expires_at=0 (never expires —
// i.e. a Business Manager System User token). Big enough to sail past every
// "is it expiring soon?" threshold without special-casing each comparison.
const NEVER_EXPIRES_DAYS = 36500
// Must match the redirect URI whitelisted in the Facebook app's Login settings.
const IG_REDIRECT_URI = 'https://firstlight.live/ig-connect.html'
// The Facebook Page that owns @firstlightlive. Its PAGE token is the permanent one.
const FB_PAGE_ID = '1135082336346089'

// ── Chapter-aware day numbering ──
// Chapter 1 FOUNDATION: 2026-02-10 → 2026-06-08 (Day 1..110, CLOSED).
// Gap days Jun 9-18 → 0 (no chapter active; Chapter 02 REBUILD ran briefly Jun 13-18 then retired).
// Chapter 2 ENDURANCE: 2026-06-20 onward (Day 1..). New rule: 5km any motion daily, miss = ₹1500 → Akshaya Patra (1 child / 1 academic year).
const CHAPTER_1_START = new Date('2026-02-10T00:00:00+05:30')
const CHAPTER_1_END = new Date('2026-06-09T00:00:00+05:30') // exclusive — Day 110 = Jun 8
const CHAPTER_2_START = new Date('2026-06-20T00:00:00+05:30')
// Chapter 3 FIRST LIGHT: 2026-07-19 onward (Day 1..). New rule: RUN >=5km STARTED
// before 06:00 local. Miss = ₹1500 → Akshaya Patra. Chapter 2 closes as a monument.
const CHAPTER_3_START = new Date('2026-07-19T00:00:00+05:30')
const CHAPTER_3_RUN_MIN_METERS = 5000
const CHAPTER_3_CUTOFF_HOUR = 6           // run must START before 06:00 local
// Chapter 4 DISCIPLINE: 2026-07-27 onward (Day 1..). Rule: ANY workout anchors the
// day (same menu as Chapter 2 — judge's default path; no before-6AM badge). NO money
// this chapter — misses/violations are paid in DISTANCE (the Punishment Cycle, self-
// logged in discipline.html). The 5 rituals (wake<4AM, meditation, workout, journal,
// sleep 6h) + prohibitions live in the tracker. NO Instagram (ig_publish_enabled='false').
const CHAPTER_4_START = new Date('2026-07-27T00:00:00+05:30')
// Chapter 04 ended at the fever, not by choice. Sep 4-12 belong to NO chapter.
const CHAPTER_4_END = new Date('2026-09-04T00:00:00+05:30')   // exclusive — Day 47 = Sep 3
const CHAPTER_5_START = new Date('2026-09-13T00:00:00+05:30')
const CHAPTER_5_END = new Date('2026-09-18T00:00:00+05:30') // exclusive, last verified day Sep 17
const CHAPTER_6_START = new Date('2026-09-27T00:00:00+05:30') // === DAY_EPOCH

// ── THE PUBLIC DAY COUNTER ─────────────────────────────────────────────────
// DAY_EPOCH is the single anchor for every day number the outside world sees:
// IG captions, rendered slides, proof_archive.day_number, instagram_posts
// .day_number and all five emails.
//
// Archived runs keep their own day numbers. The current run begins 27 Sep 2026.
//
// Must stay equal to FL_DEFAULTS.STREAK_START
// (website/app.js) and FL_CURRENT_CHAPTER.dayEpoch (website/js/chapters.js).
const DAY_EPOCH = new Date('2026-09-27T00:00:00+05:30')

// GAP DAYS — the orphan days between the last break and the new Day 1
// (Sep 18-26 2026; prior workout evidence remains in the archive). Every
// day-numbered surface is guarded by _isGapDay(): the 04:30/06:30 emails send
// a rest-day note, the 22:00 EOD + weekly recap are skipped, and the 21:00
// nudge + 23:30 verdict record NOTHING (no ledger row, no slip, no IG post).
// When the next break moves DAY_EPOCH, move GAP_START to the first orphan day.
const GAP_START = new Date('2026-09-18T00:00:00+05:30')

// Pull the day number a published caption actually prints ("...\n\nDay 31.\n...").
// Used by the IG sync so a late post's stored day_number mirrors what the public
// sees, rather than being recomputed from the post's timestamp.
function _captionDay(caption?: string | null): number | null {
  const m = /(?:^|\n)Day (\d+)\b/.exec(caption || '')
  const n = m ? parseInt(m[1], 10) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}
function chapterOf(date: Date | string): number {
  const d = (date instanceof Date) ? date : new Date(date)
  if (d.getTime() >= CHAPTER_6_START.getTime()) return 6
  if (d.getTime() >= CHAPTER_5_START.getTime() && d.getTime() < CHAPTER_5_END.getTime()) return 5
  if (d.getTime() >= CHAPTER_4_END.getTime()) return 0
  if (d.getTime() >= CHAPTER_4_START.getTime() && d.getTime() < CHAPTER_4_END.getTime()) return 4
  if (d.getTime() >= CHAPTER_3_START.getTime()) return 3
  if (d.getTime() >= CHAPTER_2_START.getTime()) return 2
  if (d.getTime() >= CHAPTER_1_START.getTime() && d.getTime() < CHAPTER_1_END.getTime()) return 1
  return 0
}
function chapterDay(date: Date | string): number {
  const d = (date instanceof Date) ? date : new Date(date)
  // Live run. Archived run numbers remain frozen below.
  if (d.getTime() >= DAY_EPOCH.getTime()) return Math.floor((d.getTime() - DAY_EPOCH.getTime()) / 86400000) + 1
  if (d.getTime() >= GAP_START.getTime()) return 0
  if (d.getTime() >= CHAPTER_5_START.getTime()) return Math.floor((d.getTime() - CHAPTER_5_START.getTime()) / 86400000) + 1
  if (d.getTime() >= CHAPTER_4_END.getTime()) return 0
  // RETIRED CONTINUOUS ERA — Jul 19 2026 (Day 1) through Sep 12 2026 (Day 56).
  // Frozen so archived rows and old captions still resolve to their own numbers.
  if (d.getTime() >= CHAPTER_3_START.getTime()) return Math.floor((d.getTime() - CHAPTER_3_START.getTime()) / 86400000) + 1
  // CLOSED chapters keep their frozen historical per-chapter numbering so the
  // archived rows and the monument cards in chapters.js still line up.
  if (d.getTime() >= CHAPTER_2_START.getTime()) return Math.floor((d.getTime() - CHAPTER_2_START.getTime()) / 86400000) + 1
  if (d.getTime() >= CHAPTER_1_START.getTime() && d.getTime() < CHAPTER_1_END.getTime()) return Math.floor((d.getTime() - CHAPTER_1_START.getTime()) / 86400000) + 1
  return 0
}
// Chapter identity for rendered post footers. SINGLE SOURCE OF TRUTH: derived
// from chapterOf() (which owns the boundary dates) and passed to the render
// Worker in every payload. The Worker never hardcodes a chapter number, so a
// footer can't silently go stale at a rollover the way "CHAPTER 02" did when
// Chapter 03 launched. Add a new chapter's label here — one place — on rollover.
const CHAPTER_BRAND: Record<number, string> = {
  1: 'CHAPTER 01 · FOUNDATION',
  2: 'CHAPTER 02 · ENDURANCE',
  3: 'CHAPTER 03 · FIRST LIGHT',
  4: 'CHAPTER 04 · DISCIPLINE',
  5: 'CHAPTER 05 · RETURN',
  6: 'CHAPTER 06 · RETURN',
}
function chapterBrand(date: Date | string): string {
  return CHAPTER_BRAND[chapterOf(date)] || 'FIRST LIGHT'
}

// Chapter 3 evaluator — any RUN >=5km qualifies (WIN, streak alive). A run
// STARTED before 06:00 local additionally earns the "first light" badge
// (firstLight=true); the time is NOT required to keep the streak. Prefers a
// first-light run when one exists, else falls back to any 5km run of the day.
function evaluateChapter3(activities: StravaActivityLite[]): { bucket: keyof typeof ENDURANCE_RULE; activity: StravaActivityLite; firstLight: boolean } | null {
  const RUN_TYPES = ['Run', 'TrailRun', 'VirtualRun']
  let fallback: { bucket: keyof typeof ENDURANCE_RULE; activity: StravaActivityLite; firstLight: boolean } | null = null
  for (const a of activities) {
    if (RUN_TYPES.indexOf(a.type) === -1) continue
    if (a.distance < CHAPTER_3_RUN_MIN_METERS) continue
    // start_date_local: "YYYY-MM-DDTHH:MM:SS..." — read the local hour
    const m = /T(\d{2}):/.exec(a.start_date_local || '')
    const hour = m ? parseInt(m[1], 10) : 99
    if (hour < CHAPTER_3_CUTOFF_HOUR) return { bucket: 'run', activity: a, firstLight: true }
    if (!fallback) fallback = { bucket: 'run', activity: a, firstLight: false }
  }
  return fallback
}

// ═══════════════════════════════════════════════════════════════════════════
// CHAPTER 02 ENDURANCE — Qualifying Rule + Verdict Engine (Phase 1)
// ═══════════════════════════════════════════════════════════════════════════
// Determines if a given day qualifies as WIN under Chapter 02 ENDURANCE.
// One activity from the menu — GPS sport with distance floor, or HR-elevated
// session with duration floor. Returns WIN | MISS | PENDING.
// PENDING fires on Strava API failure — system NEVER declares MISS on infra
// failure (operator-only signal that manual check is needed).

const ENDURANCE_RULE = {
  walk:      { types: ['Walk', 'Hike'], minMeters: 5000 },
  run:       { types: ['Run', 'TrailRun', 'VirtualRun'], minMeters: 5000 },
  cycle:     { types: ['Ride', 'MountainBikeRide', 'GravelRide', 'EBikeRide', 'VirtualRide', 'EMountainBikeRide'], minMeters: 10000 },
  swim:      { types: ['Swim'], minMeters: 1000 },
  hrSession: {
    types: [
      'Workout', 'WeightTraining', 'Yoga', 'Pilates', 'Crossfit',
      'HighIntensityIntervalTraining', 'Rowing', 'RockClimbing',
      'Elliptical', 'StairStepper', 'Tennis', 'Squash', 'Pickleball'
    ],
    minSeconds: 1800  // 30 min
  }
}

interface StravaActivityLite {
  id: number
  type: string
  sport_type?: string
  name: string
  distance: number          // meters
  moving_time: number       // seconds
  start_date_local: string
}

interface MatchedActivity {
  bucket: 'walk' | 'run' | 'cycle' | 'swim' | 'hrSession'
  activityId: number
  type: string
  name: string
  distanceKm?: number
  durationMin: number
}

interface VerdictResult {
  verdict: 'WIN' | 'MISS' | 'PENDING'
  date: string                          // YYYY-MM-DD IST
  chapterDay: number
  matched?: MatchedActivity              // first qualifying (back-compat single-activity)
  allMatched?: MatchedActivity[]         // ALL qualifying activities (multi-activity days)
  candidates: StravaActivityLite[]
  reason?: string                       // MISS only
  pendingReason?: string                // PENDING only
  firstLight?: boolean                  // Chapter 3 WIN: run started before 06:00 local (badge)
}

// Single-match rule evaluator (back-compat) — returns FIRST qualifying activity
function evaluateActivities(activities: StravaActivityLite[]): { bucket: keyof typeof ENDURANCE_RULE; activity: StravaActivityLite } | null {
  const all = evaluateAllActivities(activities)
  return all.length > 0 ? all[0] : null
}

// Multi-match: returns ALL qualifying activities (multi-activity day support)
function evaluateAllActivities(activities: StravaActivityLite[]): Array<{ bucket: keyof typeof ENDURANCE_RULE; activity: StravaActivityLite }> {
  const out: Array<{ bucket: keyof typeof ENDURANCE_RULE; activity: StravaActivityLite }> = []
  for (const a of activities) {
    const t = a.type || ''
    let bucket: keyof typeof ENDURANCE_RULE | null = null
    // GPS sports — distance floor
    for (const b of ['walk', 'run', 'cycle', 'swim'] as const) {
      const r = ENDURANCE_RULE[b]
      if ('minMeters' in r && r.types.includes(t) && a.distance >= r.minMeters) {
        bucket = b
        break
      }
    }
    // HR-elevated sessions — duration floor (only if no GPS bucket matched)
    if (!bucket) {
      const hr = ENDURANCE_RULE.hrSession
      if (hr.types.includes(t) && a.moving_time >= hr.minSeconds) {
        bucket = 'hrSession'
      }
    }
    if (bucket) out.push({ bucket, activity: a })
  }
  return out
}

// Return today's IST date as YYYY-MM-DD
function todayIST(): string {
  const now = new Date()
  // Add IST offset (+5:30) to UTC clock, then read UTC parts
  const ist = new Date(now.getTime() + (5.5 * 3600000))
  return ist.toISOString().slice(0, 10)
}

// True while a date (default: today) falls between the last break and the new
// Day 1 — days that belong to NO run. Nothing day-numbered may fire then.
function _isGapDay(dateStr?: string): boolean {
  const t = new Date(`${dateStr || todayIST()}T12:00:00+05:30`).getTime()
  return t >= GAP_START.getTime() && t < DAY_EPOCH.getTime()
}

// Day 1 as a human label, derived from DAY_EPOCH.
function _day1Label(): string {
  return new Date(DAY_EPOCH.getTime()).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'long' })
    + ' ' + new Date(DAY_EPOCH.getTime()).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

// Returns the current hour in IST (0-23). Used by the too-early-to-judge guard.
function _currentISTHour(): number {
  const ist = new Date(Date.now() + (5.5 * 3600000))
  return ist.getUTCHours()
}

// VERDICT_CUTOFF_HOUR_IST: the engine refuses to declare MISS before this hour
// in IST on the same day. Default 22 (= 10 PM). The scheduled cron at 23:30 IST
// passes; manual/test calls earlier in the day return PENDING instead of MISS.
// Override per-call with ?force=WIN|MISS or an explicit ?date= older than today.
const VERDICT_CUTOFF_HOUR_IST = 22

// Get Strava access token via refresh flow — isolated helper, mirrors syncStrava
async function _stravaAccessToken(): Promise<string | null> {
  const refreshToken = await getSecret('strava_refresh')
  const clientId = await getSecret('strava_client_id')
  const clientSecret = await getSecret('strava_client_secret')
  if (!refreshToken || !clientId || !clientSecret) return null
  try {
    const resp = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `client_id=${clientId}&client_secret=${clientSecret}&refresh_token=${refreshToken}&grant_type=refresh_token`
    }).then(r => r.json())
    if (!resp.access_token) return null
    await setSecret('strava_access', resp.access_token)
    await setSecret('strava_refresh', resp.refresh_token)
    return resp.access_token
  } catch (_e) {
    return null
  }
}

// Pull Strava activities for a given IST date with retry+backoff.
// Returns null on persistent failure (caller declares PENDING, NOT MISS).
async function _pullStravaForDate(dateStr: string, accessToken: string): Promise<StravaActivityLite[] | null> {
  const after  = Math.floor(new Date(`${dateStr}T00:00:00+05:30`).getTime() / 1000)
  const before = Math.floor(new Date(`${dateStr}T23:59:59+05:30`).getTime() / 1000)
  const url = `https://www.strava.com/api/v3/athlete/activities?after=${after}&before=${before}&per_page=50`

  // 3 retries with exponential backoff: 0s, 1s, 3s
  for (const delay of [0, 1000, 3000]) {
    if (delay) await new Promise(r => setTimeout(r, delay))
    try {
      const r = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } })
      if (!r.ok) continue
      const data = await r.json()
      if (Array.isArray(data)) {
        return data.map((a): StravaActivityLite => ({
          id: a.id,
          type: a.type || '',
          sport_type: a.sport_type || a.type || '',
          name: a.name || '',
          distance: a.distance || 0,
          moving_time: a.moving_time || 0,
          start_date_local: a.start_date_local || ''
        }))
      }
    } catch (_e) { /* retry */ }
  }
  return null
}

// ═══════════════════════════════════════════════════════════════════════════
// APPLE HEALTH — PRIMARY activity source (2026-07-03, post-Strava-ban pivot).
// Workouts arrive via Health Auto Export → action=health-ingest → health_daily.
// They are mapped into StravaActivityLite so the SAME ENDURANCE_RULE evaluator
// judges both sources identically. Strava (banned 2026-06-30) is demoted to
// best-effort garnish: if its API ever answers again, its candidates win
// (they carry GPS polylines for route slides); otherwise it is ignored.
// ═══════════════════════════════════════════════════════════════════════════

const APPLE_TYPE_MAP: Array<{ re: RegExp; type: string }> = [
  { re: /run/i,             type: 'Run' },
  { re: /hik/i,             type: 'Hike' },
  { re: /walk/i,            type: 'Walk' },
  { re: /cycl|bik/i,        type: 'Ride' },
  { re: /swim/i,            type: 'Swim' },
]

function _appleWorkoutToLite(w: Record<string, unknown>, date: string): StravaActivityLite {
  const raw = String(w.type || 'workout')
  const pretty = raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const mapped = APPLE_TYPE_MAP.find(m => m.re.test(raw))?.type || 'Workout'
  const distM = Math.round(Number(w.distance_km || 0) * 1000)
  // Floor-aware typing: keep the typed sport ONLY if its distance floor passes;
  // otherwise judge by the 30-min session floor (type 'Workout' → hrSession).
  // This covers distance-unknown workouts AND prevents a verdict downgrade when
  // a later export fills in a sub-floor distance (e.g. a 59-min 3km walk stays
  // a session WIN — matching how it was judged and published).
  const FLOOR: Record<string, number> = {
    Run: ENDURANCE_RULE.run.minMeters, Walk: ENDURANCE_RULE.walk.minMeters,
    Hike: ENDURANCE_RULE.walk.minMeters, Ride: ENDURANCE_RULE.cycle.minMeters,
    Swim: ENDURANCE_RULE.swim.minMeters
  }
  const effType = (mapped !== 'Workout' && distM >= (FLOOR[mapped] ?? 0)) ? mapped : 'Workout'
  return {
    id: 0,                                   // no Strava id — suppresses links & route slides
    type: effType,
    sport_type: effType,
    name: `${pretty} · Apple Watch`,
    distance: distM,
    moving_time: Math.round(Number(w.duration_min || 0) * 60),
    start_date_local: `${date}T${String(w.start || '12:00')}:00`
  }
}

// Read the day's Apple workouts from health_daily.
// Returns null when NO row exists (pipeline silent — infra, not a miss),
// [] when the row exists but holds no workouts (a real rest/miss day).
async function _pullAppleForDate(dateStr: string): Promise<StravaActivityLite[] | null> {
  const { data, error } = await supaAdmin.from('health_daily')
    .select('workout_count,workout_types,workout_total_min,workouts_detail')
    .eq('date', dateStr).maybeSingle()
  if (error || !data) return null

  const detail = data.workouts_detail
  if (Array.isArray(detail) && detail.length > 0) {
    return detail.map((w) => _appleWorkoutToLite(w as Record<string, unknown>, dateStr))
  }
  // Legacy rows (ingested before workouts_detail existed): synthesize one
  // candidate per recorded type, duration split evenly — distance unknown.
  const types: string[] = Array.isArray(data.workout_types) ? data.workout_types : []
  const n = Number(data.workout_count || 0)
  if (n === 0 || types.length === 0) return []
  const perMin = Math.round(Number(data.workout_total_min || 0) / Math.max(n, 1))
  return types.slice(0, n).map((t) =>
    _appleWorkoutToLite({ type: t, duration_min: perMin, distance_km: 0 }, dateStr))
}

// Manual uploads from the Activity Studio app (admin.html → APPS). They live
// ONLY in strava_activities (device_name='FirstLight Studio'), written via
// action=admin-write — invisible to both the Apple pipeline and the Strava
// API, so the judge unions them in explicitly. Mapped with id:0 like Apple
// candidates: no strava.com caption link, no route slide.
const STUDIO_DEVICE = 'FirstLight Studio'
async function _pullManualForDate(dateStr: string): Promise<StravaActivityLite[]> {
  const { data, error } = await supaAdmin.from('strava_activities')
    .select('type,sport_type,name,distance,moving_time,start_date_local')
    .eq('device_name', STUDIO_DEVICE)
    .gte('start_date_local', `${dateStr}T00:00:00`)
    .lte('start_date_local', `${dateStr}T23:59:59`)
  if (error || !data) return []
  return data.map((a): StravaActivityLite => ({
    id: 0,
    type: a.type || '',
    sport_type: a.sport_type || a.type || '',
    name: a.name || 'Manual entry',
    distance: Number(a.distance || 0),
    moving_time: Number(a.moving_time || 0),
    start_date_local: a.start_date_local || ''
  }))
}

// Top-level: judge a given IST date (defaults to today). Returns VerdictResult.
// Apple Health is PRIMARY; Strava is best-effort. PENDING only when NEITHER
// source produced any data (system never declares MISS on infra failure).
async function judgeToday(opts?: { date?: string; force?: 'WIN' | 'MISS'; dayOverride?: number }): Promise<VerdictResult> {
  const date = opts?.date || todayIST()
  // dayOverride exists for back-fill republishes across a chapter boundary. The
  // public feed carries ONE continuous day counter; when a new chapter resets
  // chapterDay() to 1, re-posting an older day would print a number lower than
  // the post before it. Every consumer below reads verdict.chapterDay, so setting
  // it here fixes the caption, the rendered slide, proof_archive.day_number and
  // the emails in one place. Never set by the nightly cron — republish only.
  const day = (typeof opts?.dayOverride === 'number' && opts.dayOverride > 0)
    ? opts.dayOverride
    : chapterDay(new Date(`${date}T12:00:00+05:30`))

  // Force flags for testing (?force=WIN / ?force=MISS)
  if (opts?.force === 'WIN') {
    return {
      verdict: 'WIN', date, chapterDay: day, candidates: [],
      matched: { bucket: 'run', activityId: 0, type: 'Run', name: 'FORCED_WIN_FOR_TESTING', distanceKm: 5, durationMin: 30 }
    }
  }
  if (opts?.force === 'MISS') {
    return { verdict: 'MISS', date, chapterDay: day, candidates: [], reason: 'FORCED_MISS_FOR_TESTING' }
  }

  // 1. Apple Health — PRIMARY
  const apple = await _pullAppleForDate(date)

  // 2. Strava — gated on strava_source_enabled.
  //    HISTORY: a Jul 2026 note here claimed the API app was bound to the WRONG
  //    athlete (secondary 1669656814 rather than the followers account
  //    206338460) and that Strava had been switched off for judging. Re-tested
  //    2026-09-12 via ?action=strava-whoami: the token resolves to athlete
  //    206338460 — the followers account — and strava_source_enabled is already
  //    'true'. Both halves of that note were stale. Verify with strava-whoami
  //    before believing any future claim about which account this token holds.
  let strava: StravaActivityLite[] | null = null
  let stravaStatus: 'disabled' | 'no-token' | 'error' | 'ok' = 'disabled'
  if ((await getSecret('strava_source_enabled')) === 'true') {
    try {
      const token = await _stravaAccessToken()
      if (!token) {
        stravaStatus = 'no-token'
      } else {
        strava = await _pullStravaForDate(date, token)
        stravaStatus = strava === null ? 'error' : 'ok'
      }
    } catch (_e) {
      stravaStatus = 'error'   // banned/unreachable — Apple carries the day
    }
  }

  // 3. Activity Studio manual uploads — always unioned in (they exist in no
  //    other channel). A manual entry can never be double-counted by Apple or
  //    Strava since neither ever sees it.
  const manual = await _pullManualForDate(date)

  // Prefer Strava's candidates when it actually returned activities (richer
  // captions + GPS routes); otherwise judge on Apple. No mixing — avoids
  // double-counting the same workout seen by both sources.
  const activities: StravaActivityLite[] = [
    ...((strava && strava.length > 0) ? strava : (apple ?? [])),
    ...manual
  ]

  // Infra guard: NO source has any data channel for this date.
  //
  // ⚠️ This deliberately treats "Strava returned 0 activities" the same as
  // "Strava could not be reached", so a silent Apple + an empty Strava yields
  // PENDING, never MISS. That is why nine untrained days (Sep 4-12 2026)
  // produced no slips. It is the safe direction to err, but it does mean a
  // genuine rest day is never auto-declared a MISS while health_daily is quiet.
  // Changing it changes when MISSes publish — do it deliberately, not as a
  // side effect.
  if (apple === null && (strava === null || strava.length === 0) && manual.length === 0) {
    // The old copy said "Strava unavailable" whichever of these was true, which
    // reads as a broken integration on a day the athlete simply did not train.
    const stravaMsg =
      stravaStatus === 'ok'       ? 'Strava reachable, reported 0 activities'
    : stravaStatus === 'disabled' ? 'Strava not consulted (strava_source_enabled is not true)'
    : stravaStatus === 'no-token' ? 'Strava token missing from secrets'
    :                               'Strava API call failed'
    return {
      verdict: 'PENDING', date, chapterDay: day, candidates: [],
      pendingReason: `No Apple Health data (no health_daily row — check Health Auto Export); ${stravaMsg}; no manual entry. NOT declaring MISS without a confirmed data channel.`
    }
  }

  const toMatched = (m: { bucket: keyof typeof ENDURANCE_RULE; activity: StravaActivityLite }): MatchedActivity => {
    const isGps = m.bucket !== 'hrSession'
    return {
      bucket: m.bucket,
      activityId: m.activity.id,
      type: m.activity.type,
      name: m.activity.name,
      distanceKm: isGps ? +(m.activity.distance / 1000).toFixed(2) : undefined,
      durationMin: +(m.activity.moving_time / 60).toFixed(1)
    }
  }

  // Chapter 3 FIRST LIGHT — the ENDURANCE menu keeps the streak (5km walk/run, 10km
  // cycle, 1km swim, or 30min session), any time before midnight. A qualifying
  // activity STARTED before 06:00 local earns the "first light" badge (not required).
  if (chapterOf(`${date}T12:00:00+05:30`) === 3) {
    const allMatches = evaluateAllActivities(activities)
    if (allMatches.length > 0) {
      const allMatched = allMatches.map(toMatched)
      const firstLight = allMatches.some(mm => {
        const hm = /T(\d{2}):/.exec(mm.activity.start_date_local || '')
        return hm ? parseInt(hm[1], 10) < CHAPTER_3_CUTOFF_HOUR : false
      })
      return { verdict: 'WIN', date, chapterDay: day, candidates: activities, matched: allMatched[0], allMatched, firstLight }
    }
    const reason3 = activities.length === 0
      ? 'No qualifying activity today (Chapter 3 menu: 5km walk/run, 10km cycle, 1km swim, or 30min session).'
      : `Found ${activities.length} activities, none met the menu floor (walk/run >=5km, cycle >=10km, swim >=1km, session >=30min).`
    return { verdict: 'MISS', date, chapterDay: day, candidates: activities, reason: reason3 }
  }

  // Chapter 2 ENDURANCE — any menu activity, any time.
  const allMatches = evaluateAllActivities(activities)
  if (allMatches.length > 0) {
    const allMatched = allMatches.map(toMatched)
    return { verdict: 'WIN', date, chapterDay: day, candidates: activities, matched: allMatched[0], allMatched }
  }

  const reason = activities.length === 0
    ? 'No workouts recorded today (Apple Health row present but empty; Strava unavailable)'
    : `Found ${activities.length} activities, none met the menu thresholds (walk/run ≥5km, cycle ≥10km, swim ≥1km, HR-session ≥30min)`

  return { verdict: 'MISS', date, chapterDay: day, candidates: activities, reason }
}

// ═══════════════════════════════════════════════════════════════════════════
// ACCOUNTABILITY ENGINE — Phase 2-7
// Orchestrates: render → R2 → IG publish → ledger write → email.
// Idempotent per (date, variant). Three entry points called by pg_cron:
//   - nudge   (21:00 IST)        — alert operator if not yet qualified
//   - verdict (23:30 IST)        — final judgement + publish
//   - grace   (00:15–02:50 IST)  — re-check yesterday's MISS on late sync;
//                                  flips MISS→WIN + clears the phantom slip
//                                  (see supabase/extend_grace_cron.sql)
// ═══════════════════════════════════════════════════════════════════════════

const AKSHAYA_PATRA = 'Akshaya Patra'
const STAKE_AMOUNT = 1500   // Chapters 01-03 only. Retained for the historical
                            // ledger + monthly maths; NOT charged in Chapter 04.

// ── CHAPTER 04 · PENANCE IS DISTANCE ───────────────────────────────────────
// No money this chapter: a missed workout is repaid on the bike (see
// FL_CURRENT_CHAPTER.rituals in website/js/chapters.js and discipline.html).
// The charity/Rs framing is gone from every PUBLIC surface — the site is a
// login wall, so "Rs + charity + private link" is the exact footprint that got
// Instagram to restrict this account (CLAUDE.md "Anti-Spam Rules").
const MISS_PENANCE_KM = 100
const MISS_PENANCE_LABEL = `${MISS_PENANCE_KM} km cycle`
// IG_ACCOUNT_ID already declared at top of file

// CF Worker base URL — overridden via secrets if domain differs
async function _renderWorkerBase(): Promise<string> {
  return (await getSecret('render_worker_base')) || 'https://firstlight.live'
}
async function _renderKey(): Promise<string | null> {
  return await getSecret('render_worker_key')
}
async function _publishUpiLink(): Promise<string | null> {
  return await getSecret('akshaya_upi_link')  // e.g. upi://pay?pa=donate@akshayapatra&pn=Akshaya%20Patra&am=1500
}

interface PublishedPost {
  media_id: string
  permalink?: string
}

// Bucket → theme mapping for daily WIN posts (option B from the user audit).
// Each sport gets its own visual identity; multi-activity days use NEON to
// stand out. MISS posts intentionally do not theme — they keep the fixed
// brand palette so the Akshaya Patra messaging reads consistently.
const BUCKET_THEME: Record<string, string> = {
  run:       'strava',    // Strava orange
  walk:      'earth',     // warm brown
  cycle:     'arctic',    // ice blue
  swim:      'gradient',  // cyan/purple
  hrSession: 'infrared'   // hot red
}
function _themeFor(verdict: VerdictResult): string | undefined {
  if (verdict.verdict !== 'WIN' || !verdict.matched) return undefined
  const all = verdict.allMatched || [verdict.matched]
  if (all.length >= 2) return 'neon'
  return BUCKET_THEME[verdict.matched.bucket] || 'strava'
}

// Render a verdict's image via the Cloudflare Worker, return public R2 URL.
async function _renderVerdictImage(verdict: VerdictResult, orientation: 'post' | 'story'): Promise<string> {
  const base = await _renderWorkerBase()
  const key = await _renderKey()

  const theme = _themeFor(verdict)
  const payload: Record<string, unknown> = {
    date: verdict.date,
    chapterDay: verdict.chapterDay,
    chapter: chapterBrand(verdict.date),
    variant: verdict.verdict,
    orientation
  }
  if (verdict.verdict === 'WIN' && verdict.matched) {
    payload.payload = {
      activityType: verdict.matched.type,
      activityName: verdict.matched.name,
      distanceKm: verdict.matched.distanceKm,
      durationMin: verdict.matched.durationMin,
      ...(theme ? { theme } : {})
    }
  } else if (verdict.verdict === 'MISS') {
    payload.payload = { penance: MISS_PENANCE_LABEL, reason: verdict.reason }
  } else {
    payload.payload = {}
  }

  const r = await fetch(`${base}/api/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { 'x-render-key': key } : {}) },
    body: JSON.stringify(payload)
  })
  if (!r.ok) throw new Error(`Render worker returned ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const j = await r.json() as { success: boolean; publicUrl: string; error?: string }
  if (!j.success || !j.publicUrl) throw new Error(`Render failed: ${j.error || 'no publicUrl'}`)
  return j.publicUrl
}

// Pull the full Strava activity row (polyline + elev + cal + HR) from the
// strava_activities table. Cached briefly; one DB hit per activity.
async function _fullActivity(activityId: number) {
  const { data } = await supaAdmin
    .from('strava_activities')
    .select('id,summary_polyline,total_elevation_gain,calories,start_date_local,average_heartrate')
    .eq('id', activityId)
    .maybeSingle()
  return data
}

// Build the multi-activity payload used by all three WIN_MULTI_* renders.
// Looks up each matched activity's full details in one batch.
async function _buildMultiActivityPayload(verdict: VerdictResult): Promise<Record<string, unknown>> {
  const all = verdict.allMatched || (verdict.matched ? [verdict.matched] : [])
  const items = await Promise.all(all.map(async m => {
    const det = m.activityId > 0 ? await _fullActivity(m.activityId) : null
    const apple = m.activityId === 0 ? await _appleRouteData(verdict.date, m.durationMin) : null
    return {
      bucket: m.bucket,
      type: m.type,
      name: m.name,
      distanceKm: m.distanceKm,
      durationMin: m.durationMin,
      polyline: det?.summary_polyline || apple?.polyline || undefined,
      averageHr: det?.average_heartrate ? Math.round(det.average_heartrate) : undefined,
      caloriesKcal: (det?.calories ? Math.round(det.calories) : undefined) ?? apple?.caloriesKcal,
    }
  }))
  const totalKm = items.reduce((s, a) => s + (a.distanceKm || 0), 0)
  const totalMin = items.reduce((s, a) => s + a.durationMin, 0)
  const totalKcal = items.reduce((s, a) => s + (a.caloriesKcal || 0), 0)
  return { activities: items, totalKm: +totalKm.toFixed(1), totalMin: Math.round(totalMin), totalKcal: Math.round(totalKcal) }
}

// Render one of the WIN_MULTI_* variants via the Worker.
async function _renderMultiSlide(verdict: VerdictResult, variant: 'WIN_MULTI_HERO' | 'WIN_MULTI_MAP' | 'WIN_MULTI_GRID' | 'WIN_MULTI_SUMMARY', orientation: 'post' | 'story' = 'post'): Promise<string> {
  const base = await _renderWorkerBase()
  const key = await _renderKey()
  const payload = await _buildMultiActivityPayload(verdict)
  const body = {
    date: verdict.date,
    chapterDay: verdict.chapterDay,
    chapter: chapterBrand(verdict.date),
    variant,
    orientation,
    payload
  }
  const r = await fetch(`${base}/api/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { 'x-render-key': key } : {}) },
    body: JSON.stringify(body)
  })
  if (!r.ok) throw new Error(`Render worker ${variant} returned ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const j = await r.json() as { success: boolean; publicUrl: string; error?: string }
  if (!j.success || !j.publicUrl) throw new Error(`${variant} render failed: ${j.error || 'no publicUrl'}`)
  return j.publicUrl
}

// Render the GPS-route slide (slide 2 of WIN carousels). Pulls the matched
// activity's polyline + elevation + calories from the strava_activities table.
// `orientation` controls aspect ratio: 'post' = 1080x1080 (feed carousel),
// 'story' = 1080x1920 (vertical Story frame). Story uses a taller map block
// and re-paced bottom stats panel.
// ── Apple GPS routes ────────────────────────────────────────────────────────
// HAE route points are stored (downsampled) in health_daily.workouts_detail;
// encode them into the same Google polyline format the render worker already
// consumes for Strava routes.

function _downsampleRoute(pts: Array<[number, number]>, max = 400): Array<[number, number]> {
  if (pts.length <= max) return pts
  const step = (pts.length - 1) / (max - 1)
  return Array.from({ length: max }, (_, i) => pts[Math.round(i * step)])
}

// Google encoded-polyline algorithm (precision 1e5) — matches Strava's
// summary_polyline format. Verified against Google's reference vector.
function _encodePolyline(points: Array<[number, number]>): string {
  let out = ''
  let prevLat = 0, prevLng = 0
  const encodeValue = (v: number): string => {
    let n = v < 0 ? ~(v << 1) : (v << 1)
    let s = ''
    while (n >= 0x20) {
      s += String.fromCharCode((0x20 | (n & 0x1f)) + 63)
      n >>= 5
    }
    return s + String.fromCharCode(n + 63)
  }
  for (const [lat, lng] of points) {
    const iLat = Math.round(lat * 1e5)
    const iLng = Math.round(lng * 1e5)
    out += encodeValue(iLat - prevLat) + encodeValue(iLng - prevLng)
    prevLat = iLat
    prevLng = iLng
  }
  return out
}

// Look up the Apple route (+calories) for a verdict's matched workout by date.
// Matches on duration when the day has several workouts; falls back to the
// first workout that carries a route.
async function _appleRouteData(date: string, durationMin: number): Promise<{ polyline: string; caloriesKcal?: number } | null> {
  const { data } = await supaAdmin.from('health_daily')
    .select('workouts_detail').eq('date', date).maybeSingle()
  const arr = data?.workouts_detail
  if (!Array.isArray(arr)) return null
  const withRoute = (x: Record<string, unknown>) => Array.isArray(x.route) && (x.route as unknown[]).length > 1
  const w = (arr as Array<Record<string, unknown>>).find(x =>
      withRoute(x) && Math.round(Number(x.duration_min || 0)) === Math.round(durationMin))
    || (arr as Array<Record<string, unknown>>).find(withRoute)
  if (!w) return null
  return {
    polyline: _encodePolyline(w.route as Array<[number, number]>),
    caloriesKcal: w.calories ? Math.round(Number(w.calories)) : undefined
  }
}

async function _renderRouteSlide(verdict: VerdictResult, orientation: 'post' | 'story' = 'post'): Promise<string> {
  if (!verdict.matched) throw new Error('Cannot render route slide: no matched activity')
  const base = await _renderWorkerBase()
  const key = await _renderKey()

  // Pull full activity from DB (normally synced via syncStrava — has polyline + cal + elev)
  let { data } = await supaAdmin
    .from('strava_activities')
    .select('summary_polyline,total_elevation_gain,calories,start_date_local,average_heartrate')
    .eq('id', verdict.matched.activityId)
    .maybeSingle()

  // RACE GUARD ─────────────────────────────────────────────────────────────
  // The verdict pulls activities LIVE from Strava, but this route slide reads
  // the GPS polyline from the strava_activities DB table — which is populated
  // by the syncStrava cron. A late-uploaded activity (e.g. a 22:00 walk that
  // reaches Strava AFTER the 23:15 pre-verdict sync but is still caught by the
  // 23:30 verdict's live pull) won't be in the DB yet, so the polyline is
  // missing and the GPS frame silently drops. To make the route independent of
  // sync timing, fall back to a direct Strava activity-detail fetch — the
  // authoritative real-time source — whenever the DB row lacks a polyline.
  if (!data?.summary_polyline) {
    try {
      const token = await _stravaAccessToken()
      if (token) {
        const det = await fetch(`https://www.strava.com/api/v3/activities/${verdict.matched.activityId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        if (det.ok) {
          const dj = await det.json()
          data = {
            summary_polyline: dj.map?.summary_polyline || dj.map?.polyline || null,
            total_elevation_gain: dj.total_elevation_gain ?? data?.total_elevation_gain ?? null,
            calories: (typeof dj.calories === 'number' ? dj.calories : null) ?? data?.calories ?? null,
            start_date_local: dj.start_date_local || data?.start_date_local || null,
            average_heartrate: dj.average_heartrate ?? data?.average_heartrate ?? null
          }
        }
      }
    } catch (_e) { /* fall through — alert below fires if still empty */ }
  }

  // APPLE ROUTE: for Apple-sourced wins (activityId 0), the GPS trail lives in
  // health_daily.workouts_detail — encode it into the same polyline format.
  if (!data?.summary_polyline && verdict.matched.activityId === 0) {
    const apple = await _appleRouteData(verdict.date, verdict.matched.durationMin)
    if (apple) {
      data = {
        summary_polyline: apple.polyline,
        total_elevation_gain: data?.total_elevation_gain ?? null,
        calories: apple.caloriesKcal ?? data?.calories ?? null,
        start_date_local: data?.start_date_local ?? null,
        average_heartrate: data?.average_heartrate ?? null
      }
    }
  }

  // LOUD GUARD: if a GPS sport (walk/run/cycle/swim) still has no polyline after
  // both the DB read and the live fetch, the post WILL publish without a route.
  // Alert same-day instead of discovering it days later. (HR sessions have no GPS
  // by design — they get the 1-frame hero, so no alert.)
  // (activityId === 0 = Apple Health source — route optional, no alert)
  if (!data?.summary_polyline && verdict.matched.bucket !== 'hrSession' && verdict.matched.activityId > 0) {
    try {
      await sendAlert(
        'GPS route MISSING on a GPS-sport WIN',
        `Activity ${verdict.matched.activityId} (${verdict.matched.type} "${verdict.matched.name}", ${verdict.date}) qualified as a GPS WIN, but no summary_polyline was found in the DB or via a live Strava detail fetch. The post will publish WITHOUT a route frame. Likely causes: the activity was recorded with no GPS (manual entry), or the detail fetch was rate-limited (HTTP 429).`
      )
    } catch (_e) { /* non-fatal */ }
  }

  const theme = _themeFor(verdict)
  const payload = {
    date: verdict.date,
    chapterDay: verdict.chapterDay,
    chapter: chapterBrand(verdict.date),
    variant: 'WIN_ROUTE',
    orientation,
    payload: {
      activityType: verdict.matched.type,
      activityName: verdict.matched.name,
      distanceKm: verdict.matched.distanceKm,
      durationMin: verdict.matched.durationMin,
      averageHr: data?.average_heartrate ? Math.round(data.average_heartrate) : undefined,
      elevationM: data?.total_elevation_gain ? Math.round(data.total_elevation_gain) : undefined,
      caloriesKcal: data?.calories ? Math.round(data.calories) : undefined,
      polyline: data?.summary_polyline || undefined,
      activityDateIso: data?.start_date_local ? data.start_date_local.slice(0, 10) : verdict.date,
      ...(theme ? { theme } : {})
    }
  }

  const r = await fetch(`${base}/api/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { 'x-render-key': key } : {}) },
    body: JSON.stringify(payload)
  })
  if (!r.ok) throw new Error(`Route render returned ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const j = await r.json() as { success: boolean; publicUrl: string; error?: string }
  if (!j.success || !j.publicUrl) throw new Error(`Route render failed: ${j.error || 'no publicUrl'}`)
  return j.publicUrl
}

// Generate caption for WIN or MISS post
// Caption rotation pools — research-backed. First 125 chars is what's visible
// in the collapsed view, so the opener matters most. Day-number hash picks
// deterministically so it varies but doesn't repeat within ~10 days.
const WIN_OPENERS = [
  '5:14 AM. The city was still indigo.',
  'The road was empty. The sky was orange.',
  'Day {DAY}. One step closer to Ironman.',
  'Half the city was asleep. The other half was me.',
  'Cold pavement. Warm legs. Done by sunrise.',
  'Almost stayed in bed. Glad I didn\'t.',
  'The alarm doesn\'t care if you\'re tired.',
  'No one\'s watching at 5 AM. Did it anyway.',
  'One foot. Then the other. {DIST} km later.',
  'The body is willing. The bed was warmer.'
]

const MISS_OPENERS = [
  '1 child got a year of school lunches today. Because I didn\'t train.',
  'Today the streak broke. So a kid in India eats lunch for a year.',
  'I missed. 1 child sponsored for an entire academic year at Akshaya Patra.',
  'No run. No ride. No swim. 1 child fed for 200 school days instead.',
  'The body said no today. 1 child said yes to lunch — every day for a year.',
  'Day {DAY} missed. Akshaya Patra now sponsors 1 child for a full school year.',
  'Lost today. The kid still won. A year of meals.',
  'My miss = their year. 200 school lunches, 1 child.'
]

// Standard hashtags — 5 niche tags max (research: sub-500K post tags outperform megatags).
// Rotates by sport so WIN posts vary by activity.
const HASHTAGS_BY_SPORT: Record<string, string[]> = {
  run:       ['#ironmantraining', '#marathontraining', '#runnersofindia', '#indianrunners', '#strava'],
  walk:      ['#walkingforhealth', '#dailywalk', '#bangaluruwalks', '#indianrunners', '#strava'],
  cycle:     ['#cyclingindia', '#cyclistsofindia', '#bangalorecycling', '#ironmantraining', '#strava'],
  swim:      ['#swimindia', '#poolswimming', '#triathlonindia', '#ironmantraining', '#strava'],
  hrSession: ['#strengthtraining', '#fitnessindia', '#hometraining', '#ironmantraining', '#strava']
}

// MISS-only hashtag set. The charity tags (#akshayapatra / #feedingindia /
// #middaymeal) are gone with the donation flow — Chapter 04 pays in distance.
const MISS_HASHTAGS = ['#accountability', '#discipline', '#runnersofindia', '#indianrunners', '#consistency']

function _pickFromPool<T>(pool: T[], dayN: number): T {
  return pool[Math.abs(dayN) % pool.length]
}

// Multi-activity caption openers — used when the day has 2+ qualifying activities
const MULTI_OPENERS = [
  '{N} activities. {KM} km. Day {DAY}.',
  'Stack day. {N} sports. {KM} km in {TIME}.',
  'The day my body didn\'t ask permission. {N} activities.',
  '{N} workouts. {KM} km. The streak deepens.',
  'One body. {N} disciplines. {KM} km. Day {DAY}.',
  'Today I did {N} things. The streak loved it.',
]

// Pick a small emoji per Strava bucket — for caption bullet lists
const BUCKET_EMOJI: Record<string, string> = {
  run: '🏃', walk: '🚶', cycle: '🚴', swim: '🏊', hrSession: '💪'
}

// Multi-sport hashtag pool — taps the broader endurance/triathlon audience
const MULTI_HASHTAGS = ['#triathlonindia', '#ironmantraining', '#runnersofindia', '#multisport', '#strava']

// Activity date printed in every caption (2026-08-23: date on the post makes
// the archive self-tracking). Manual parse — no Date() timezone traps.
function _fmtCaptionDate(iso: string): string {
  const parts = String(iso || '').split('-')
  if (parts.length !== 3) return ''
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${parseInt(parts[2], 10)} ${M[parseInt(parts[1], 10) - 1]} ${parts[0]}`
}

function _generateCaption(verdict: VerdictResult): string {
  const day = verdict.chapterDay
  const dateStr = _fmtCaptionDate(verdict.date)
  const dayLine = dateStr ? `Day ${day} · ${dateStr}.` : `Day ${day}.`

  if (verdict.verdict === 'WIN' && verdict.matched) {
    const all = verdict.allMatched || [verdict.matched]
    const isMulti = all.length >= 2

    if (isMulti) {
      // Stack-day caption
      const totalKm = all.reduce((s, a) => s + (a.distanceKm || 0), 0)
      const totalMin = Math.round(all.reduce((s, a) => s + a.durationMin, 0))
      const h = Math.floor(totalMin / 60), m = totalMin % 60
      const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`
      const opener = _pickFromPool(MULTI_OPENERS, day)
        .replace('{DAY}', String(day))
        .replace('{N}', String(all.length))
        .replace('{KM}', totalKm.toFixed(1))
        .replace('{TIME}', timeStr)
      const bullets = all.map(a => {
        const emoji = BUCKET_EMOJI[a.bucket] || '·'
        const stat = a.distanceKm ? `${a.distanceKm.toFixed(1)} km` : `${Math.round(a.durationMin)} min`
        return `${emoji} ${a.type} · ${stat} · ${Math.round(a.durationMin)} min`
      }).join('\n')
      // Hashtag mix: 3+ sport types → triathlon; 2 → blend top tags of each
      const sportSet = new Set(all.map(a => a.bucket))
      let tags: string[]
      if (sportSet.size >= 3) {
        tags = MULTI_HASHTAGS
      } else {
        const buckets = Array.from(sportSet)
        tags = (HASHTAGS_BY_SPORT[buckets[0]] || HASHTAGS_BY_SPORT.run).slice(0, 3)
          .concat((HASHTAGS_BY_SPORT[buckets[1]] || HASHTAGS_BY_SPORT.run).slice(0, 2))
      }
      return `${opener}\n\n${dayLine}\n${bullets}\n\nThe body stacked.\n\n${tags.join(' ')}`
    }

    // Single activity (original)
    const m = verdict.matched
    // Never fabricate a distance. GPS wins use the real km; non-GPS wins (HR
    // sessions, which legitimately have no distance) fall back to a duration line
    // instead of the old magic "5 km" default that could mislabel a post.
    let opener = _pickFromPool(WIN_OPENERS, day).replace('{DAY}', String(day))
    if (opener.includes('{DIST}')) {
      opener = m.distanceKm
        ? opener.replace('{DIST}', m.distanceKm.toFixed(1))
        : `Day ${day}. ${Math.round(m.durationMin)} minutes, logged.`
    }
    const badge = verdict.firstLight ? ' · before first light' : ''
    const statLine = (m.distanceKm
      ? `${m.distanceKm.toFixed(1)} km · ${m.type}`
      : `${Math.round(m.durationMin)} min · ${m.type}`) + badge
    const tags = (HASHTAGS_BY_SPORT[m.bucket] || HASHTAGS_BY_SPORT.run).join(' ')
    // ANTI-SPAM (2026-07-24): captions carry NO external links. firstlight.live
    // now resolves to a login wall (private site) and the strava.com activity
    // link ties IG↔Strava — both read as promo / scam-bait to platform
    // classifiers. That footprint is what got IG restricted and drew Strava's
    // club-spam flag. Identity + proof stats only; no link, no ".\n." hashtag
    // curtain. See CLAUDE.md "Anti-Spam Rules".
    return `${opener}\n\n${dayLine}\n${statLine}.\n\n${tags}`
  }

  if (verdict.verdict === 'MISS') {
    // Chapter 04: the debt is distance. No rupees, no charity, no link.
    const opener = _pickFromPool(MISS_OPENERS, day).replace('{DAY}', String(day))
    const tags = MISS_HASHTAGS.join(' ')
    return `${opener}\n\n${dayLine}\nNo qualifying session. ${MISS_PENANCE_LABEL} owed, to be ridden.\nBack tomorrow.\n\n${tags}`
  }

  return dateStr ? `Day ${day} · ${dateStr}` : `Day ${day}`
}

// Publish a single-image IG feed post via Graph API. Returns media_id.
async function _publishIgFeedPost(imageUrl: string, caption: string): Promise<PublishedPost> {
  const igToken = await getSecret('ig_access')
  if (!igToken) throw new Error('No IG token in secrets table')

  // Create container
  const createBody = `image_url=${encodeURIComponent(imageUrl)}&caption=${encodeURIComponent(caption)}&access_token=${encodeURIComponent(igToken)}`
  const createResp = await fetch(`https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: createBody
  })
  const created = await createResp.json()
  if (created.error) throw new Error(`IG container create: ${created.error.error_user_msg || created.error.message}`)

  // Poll status
  for (let t = 0; t < 12; t++) {
    await new Promise(r => setTimeout(r, 2500))
    const stResp = await fetch(`https://graph.facebook.com/v21.0/${created.id}?fields=status_code&access_token=${encodeURIComponent(igToken)}`)
    const st = await stResp.json()
    if (st.status_code === 'FINISHED') break
    if (st.status_code === 'ERROR') throw new Error('IG container processing returned ERROR')
  }

  // Publish
  const pubResp = await fetch(`https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}/media_publish?creation_id=${created.id}&access_token=${encodeURIComponent(igToken)}`, { method: 'POST' })
  const pub = await pubResp.json()
  if (pub.error) throw new Error(`IG publish: ${pub.error.error_user_msg || pub.error.message}`)
  return { media_id: pub.id }
}

// Publish an IG story (same image, story media type)
// Publish an IG carousel (2+ slides). Returns parent media_id.
async function _publishIgCarousel(imageUrls: string[], caption: string): Promise<PublishedPost> {
  const igToken = await getSecret('ig_access')
  if (!igToken) throw new Error('No IG token in secrets table')
  if (imageUrls.length < 2) throw new Error('Carousel needs at least 2 images')

  // 1. Create child containers
  const childIds: string[] = []
  for (const url of imageUrls) {
    const body = `image_url=${encodeURIComponent(url)}&is_carousel_item=true&access_token=${encodeURIComponent(igToken)}`
    const r = await fetch(`https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    })
    const d = await r.json()
    if (d.error) throw new Error(`Carousel child create: ${d.error.error_user_msg || d.error.message}`)
    childIds.push(d.id)
  }

  // 2. Create parent carousel container
  const parentBody = `media_type=CAROUSEL&children=${childIds.join(',')}&caption=${encodeURIComponent(caption)}&access_token=${encodeURIComponent(igToken)}`
  const parentResp = await fetch(`https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: parentBody
  })
  const parent = await parentResp.json()
  if (parent.error) throw new Error(`Carousel parent create: ${parent.error.error_user_msg || parent.error.message}`)

  // 3. Poll parent status
  for (let t = 0; t < 12; t++) {
    await new Promise(r => setTimeout(r, 2500))
    const stResp = await fetch(`https://graph.facebook.com/v21.0/${parent.id}?fields=status_code&access_token=${encodeURIComponent(igToken)}`)
    const st = await stResp.json()
    if (st.status_code === 'FINISHED') break
    if (st.status_code === 'ERROR') throw new Error('Carousel container status ERROR')
  }

  // 4. Publish
  const pubResp = await fetch(`https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}/media_publish?creation_id=${parent.id}&access_token=${encodeURIComponent(igToken)}`, { method: 'POST' })
  const pub = await pubResp.json()
  if (pub.error) throw new Error(`Carousel publish: ${pub.error.error_user_msg || pub.error.message}`)
  return { media_id: pub.id }
}

// Publish 1-2 Story frames for a verdict.
// GPS sports → 2 frames (hero + route). HR sessions / MISS → 1 frame (hero).
// Stores the LAST published frame as result.publishedStory (for ledger linking).
// Tolerates per-frame failures — first-frame failure still tries the second.
async function _publishVerdictStoryFrames(verdict: VerdictResult, result: EngineRunResult): Promise<void> {
  // Frame 1: hero
  const heroUrl = await _renderVerdictImage(verdict, 'story')
  const heroStory = await _publishIgStory(heroUrl)
  result.publishedStory = heroStory

  // Frame 2: route slide — GPS sports on WIN with a route source (Strava id,
  // or an Apple route in workouts_detail). Render at STORY orientation
  // (1080x1920) so the second Story frame doesn't letterbox (historical bug).
  if (verdict.verdict === 'WIN' && verdict.matched &&
      (verdict.matched.activityId > 0 ||
       (await _appleRouteData(verdict.date, verdict.matched.durationMin)) !== null)) {
    const isGps = verdict.matched.bucket !== 'hrSession'
    if (isGps) {
      try {
        const routeUrl = await _renderRouteSlide(verdict, 'story')
        const routeStory = await _publishIgStory(routeUrl)
        // Track latest published frame (so the ledger links to the most recent one)
        result.publishedStory = routeStory
      } catch (routeErr) {
        // Non-fatal — hero story is already published. Log for visibility.
        result.errors.push(`Story route frame failed (non-fatal — hero frame published): ${(routeErr as Error).message}`)
      }
    }
  }
}

async function _publishIgStory(imageUrl: string): Promise<PublishedPost> {
  const igToken = await getSecret('ig_access')
  if (!igToken) throw new Error('No IG token in secrets table')

  const createBody = `image_url=${encodeURIComponent(imageUrl)}&media_type=STORIES&access_token=${encodeURIComponent(igToken)}`
  const createResp = await fetch(`https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: createBody
  })
  const created = await createResp.json()
  if (created.error) throw new Error(`IG story container: ${created.error.error_user_msg || created.error.message}`)

  for (let t = 0; t < 8; t++) {
    await new Promise(r => setTimeout(r, 2000))
    const stResp = await fetch(`https://graph.facebook.com/v21.0/${created.id}?fields=status_code&access_token=${encodeURIComponent(igToken)}`)
    const st = await stResp.json()
    if (st.status_code === 'FINISHED') break
    if (st.status_code === 'ERROR') throw new Error('IG story status ERROR')
  }

  const pubResp = await fetch(`https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}/media_publish?creation_id=${created.id}&access_token=${encodeURIComponent(igToken)}`, { method: 'POST' })
  const pub = await pubResp.json()
  if (pub.error) throw new Error(`IG story publish: ${pub.error.error_user_msg || pub.error.message}`)
  return { media_id: pub.id }
}

// Write verdict to slips table on MISS, proof_archive on WIN. Idempotent.
async function _recordVerdict(verdict: VerdictResult, post?: PublishedPost): Promise<void> {
  const today = verdict.date

  // Always update proof_archive with the verdict outcome
  const proofRow: Record<string, unknown> = {
    date: today,
    day_number: verdict.chapterDay,
    verdict: verdict.verdict
  }
  const { data: existingProof, error: existingProofError } = await supaAdmin
    .from('proof_archive').select('food_clean').eq('date', today).maybeSingle()
  if (existingProofError) throw existingProofError
  proofRow.food_clean = existingProof?.food_clean ?? null
  if (verdict.verdict === 'WIN' && verdict.matched) {
    proofRow.activity_type = verdict.matched.type
    proofRow.activity_name = verdict.matched.name
    if (verdict.matched.distanceKm) proofRow.run_km = verdict.matched.distanceKm  // legacy field reused
  }
  if (post?.media_id) proofRow.ig_post_id = post.media_id
  // This row is the idempotency lock. Publishing without it risks duplicate
  // Instagram posts when the next scheduled run retries.
  await supaUpsert('proof_archive', proofRow, 'date')

  // On MISS, append a slip.
  // Schema notes: slips.id is bigint (auto-increment) — do NOT set it.
  // We use client_id (text) for deterministic dedup.
  // function_met / upstream_gap / insight are text NOT NULL.
  if (verdict.verdict === 'MISS') {
    const clientId = `engine_miss_${today}`
    // Dedup by client_id
    const { data: existing } = await supaAdmin.from('slips').select('id').eq('client_id', clientId).maybeSingle()
    if (existing) return

    // NOTE: slips.rule is constrained to ('body', 'fortress', 'sadhana') from
    // Chapter 01 schema. ENDURANCE training misses go in 'body' bucket.
    const slip = {
      client_id: clientId,
      date: today,
      rule: 'body',
      category: 'auto_forfeit',
      description: `Auto-Forfeit · ${verdict.reason || 'No qualifying activity logged by 23:30 IST'}`,
      function_met: 'no',
      upstream_gap: 'Endurance menu floor not met across any logged Strava activity for the day.',
      insight: `Day ${verdict.chapterDay} · auto-forfeit. ${MISS_PENANCE_LABEL} owed.`,
      penalty: 'punishment_cycle',
      penalty_amount: 0,
      penalty_charity: null,
      penalty_km: MISS_PENANCE_KM,
      penalty_status: 'pending',
      proof_url: null,
      ig_post_id: post?.media_id || null,
      day_number: verdict.chapterDay,
      created_at: new Date().toISOString()
    }
    try {
      await supaAdmin.from('slips').insert(slip)
    } catch (e) {
      console.error('[engine] slip insert failed:', (e as Error).message)
    }
  }
}

// Resolve the REAL clickable post URL. media_id is the numeric Graph id —
// instagram.com/p/<id>/ is a DEAD link (needs the shortcode). Ask Graph for
// the permalink; fall back to the profile so the email link always works.
// This is load-bearing: the operator verifies posts by EMAIL ONLY (no IG app).
async function _fetchIgPermalink(mediaId: string | null | undefined): Promise<string> {
  const profile = 'https://www.instagram.com/firstlightlive/'
  if (!mediaId) return profile
  try {
    const igToken = await getSecret('ig_access')
    if (!igToken) return profile
    const resp = await fetch(`https://graph.facebook.com/v21.0/${mediaId}?fields=permalink&access_token=${encodeURIComponent(igToken)}`)
    const d = await resp.json()
    return (resp.ok && d.permalink) ? d.permalink : profile
  } catch (_e) { return profile }
}

// Email helpers — reuse existing _sendEmail + _emailShell
async function _emailVerdictWin(verdict: VerdictResult, post: PublishedPost) {
  const day = verdict.chapterDay
  const m = verdict.matched
  const stat = m ? (m.distanceKm ? `${m.distanceKm.toFixed(1)} km ${m.type}` : `${Math.round(m.durationMin)} min ${m.type}`) : 'logged'
  const link = await _fetchIgPermalink(post.media_id)
  const html = _emailShell(`Day ${day} — WIN posted ✓`, `
    <p style="font-size:18px;color:#fff">${stat}.</p>
    <p style="margin:20px 0"><a href="${link}" style="background:#00D4FF;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">VIEW THE POST ✓</a></p>
    <p style="color:#888">Verdict written to ledger. Ledger: <a href="https://firstlight.live/accountability.html" style="color:#00D4FF">accountability</a></p>
    <p style="color:#888">Streak: Day ${day}.</p>
  `)
  await _sendEmail(`[FIRSTLIGHT] Day ${day} — WIN posted ✓`, html, `Day ${day} WIN posted. ${stat}. Link: ${link}`)
}

async function _emailVerdictMiss(verdict: VerdictResult, post: PublishedPost) {
  const day = verdict.chapterDay
  const link = await _fetchIgPermalink(post.media_id)
  const ledger = 'https://firstlight.live/accountability.html'
  const cycle = 'https://firstlight.live/discipline.html'
  const html = _emailShell(`Day ${day} — MISS · ${MISS_PENANCE_LABEL} owed`, `
    <p style="font-size:18px;color:#fff">No qualifying activity today.</p>
    <p style="color:#888">${verdict.reason || ''}</p>
    <p style="margin:24px 0 8px;color:#D4A843;font-weight:700">${MISS_PENANCE_LABEL.toUpperCase()} — the Punishment Cycle</p>
    <p style="color:#888;font-size:12px;margin-bottom:24px">No money this chapter. The debt is distance, and it is not cleared until it is ridden.</p>
    <p style="margin-top:24px"><a href="${cycle}" style="background:#F5A623;color:#000;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700">LOG THE CYCLE</a></p>
    <p style="color:#888;margin-top:24px">Posted: <a href="${link}" style="color:#00D4FF">${link}</a></p>
    <p style="color:#888">Ledger: <a href="${ledger}" style="color:#00D4FF">${ledger}</a></p>
  `)
  await _sendEmail(`[FIRSTLIGHT] Day ${day} — MISS · ${MISS_PENANCE_LABEL} owed`, html,
    `Day ${day} MISS. ${MISS_PENANCE_LABEL} owed — log it at ${cycle}. Posted: ${link}`)
}

// Sent when a MISS is HELD pending operator confirmation (miss-confirm gate).
// Nothing has been posted publicly yet — the operator confirms (post) or disputes (do nothing).
async function _emailMissConfirmRequest(verdict: VerdictResult) {
  const day = verdict.chapterDay
  const ledger = 'https://firstlight.live/accountability.html'
  const html = _emailShell(`Day ${day} — MISS held for your confirmation`, `
    <p style="font-size:18px;color:#fff">The engine judged Day ${day} a MISS — but nothing has been posted publicly.</p>
    <p style="color:#888">${verdict.reason || ''}</p>
    <p style="margin:24px 0;color:#D4A843;font-weight:700">It's on the ledger and held private. Open your admin app to decide:</p>
    <p style="color:#888">• <strong style="color:#fff">Confirm</strong> → the miss posts publicly and ${MISS_PENANCE_LABEL} goes on the Punishment Cycle.<br>
       • <strong style="color:#fff">Dispute</strong> (the run happened, the feed missed it) → do nothing. No public post goes out.</p>
    <p style="color:#888;margin-top:24px">Ledger: <a href="${ledger}" style="color:#00D4FF">${ledger}</a></p>
  `)
  await _sendEmail(`[FIRSTLIGHT ⏸] Day ${day} — MISS held, awaiting your confirmation`, html,
    `Day ${day} judged MISS — held private, nothing posted. Open admin to Confirm (post + owe ${MISS_PENANCE_LABEL}) or Dispute (do nothing).`)
}

async function _emailNudge(verdict: VerdictResult) {
  const day = verdict.chapterDay
  const html = _emailShell(`Day ${day} — 2.5h left`, `
    <p style="font-size:18px;color:#fff">No qualifying activity yet.</p>
    <p style="color:#888">Window closes at 23:59 IST. Chapter 03: a 5 km run keeps the streak — before 6 AM earns the first-light mark.</p>
  `)
  await _sendEmail(`[FIRSTLIGHT] Day ${day} — 2.5h left, no qualifying activity yet`, html, `Day ${day} — 2.5h left, no qualifying activity yet.`)
}

async function _emailPublishFailure(verdict: VerdictResult, err: Error) {
  const day = verdict.chapterDay
  const html = _emailShell(`⚠ IG publish FAILED — Day ${day}`, `
    <p style="color:#FF5252;font-size:18px">${err.message}</p>
    <pre style="background:#0A0C10;color:#888;padding:16px;border-radius:8px;overflow:auto;font-size:11px">${escapeHtml(err.stack || '')}</pre>
    <p style="color:#888">System will retry tomorrow. Ledger row was still written. Manual publish may be needed.</p>
  `)
  await _sendEmail(`[FIRSTLIGHT ⚠] IG publish FAILED — Day ${day}`, html, `IG publish failed: ${err.message}`)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Orchestrator entry points ──

interface EngineRunResult {
  phase: 'nudge' | 'verdict' | 'grace'
  date: string
  verdict?: VerdictResult
  alreadyDone?: boolean
  publishedPost?: PublishedPost
  publishedStory?: PublishedPost
  missAwaitingConfirm?: boolean
  emailsSent: string[]
  errors: string[]
}

// Has today's verdict already been recorded? Idempotency check.
// Returns true if any verdict exists for the date — even publish failures count,
// because re-running on a failed publish risks double-posting to IG (IG returns
// success but DB write failed → no ig_post_id → re-run publishes again).
// Operator can manually clear proof_archive row to retry publish on failure.
async function _verdictAlreadyPosted(date: string): Promise<boolean> {
  const { data } = await supaAdmin
    .from('proof_archive')
    .select('verdict')
    .eq('date', date)
    .maybeSingle()
  return !!(data && data.verdict)
}

// PHASE 6 entry — 21:00 nudge
async function runNudge(): Promise<EngineRunResult> {
  const result: EngineRunResult = { phase: 'nudge', date: todayIST(), emailsSent: [], errors: [] }
  const verdict = await judgeToday()
  result.verdict = verdict

  // Gap-day guard — rest/gap days belong to NO run. No nudge, no email.
  if (_isGapDay(result.date)) {
    result.errors.push(`GAP_DAY — ${result.date} is a rest/gap day (Day 1 = ${_day1Label()}). No nudge.`)
    return result
  }

  // Pre-chapter guard — chapter hasn't started yet. System dormant.
  if (verdict.chapterDay < 1) {
    result.errors.push(`PRE_CHAPTER — Chapter 02 hasn't started (day=${verdict.chapterDay}). No-op.`)
    return result
  }

  if (verdict.verdict === 'PENDING') {
    result.errors.push('Strava unreachable — skipping nudge')
    return result
  }
  if (verdict.verdict === 'WIN') {
    // Already qualified — no nudge needed
    return result
  }
  // MISS so far → nudge
  await _emailNudge(verdict)
  result.emailsSent.push('nudge')
  return result
}

// PHASE 6 entry — 23:30 verdict (the main event).
// Flow (two-phase write to eliminate double-post risk):
//   1. Judge
//   2. Check idempotency on proof_archive.verdict (alone — see _verdictAlreadyPosted)
//   3. Write DB FIRST (locks idempotency)
//   4. Render + publish
//   5. Update DB with ig_post_id + write slip on MISS
//   6. Email
// If publish fails after step 3, DB has verdict but no ig_post_id. Next cron run
// is idempotent-skipped; operator gets publish-failure email and can manually clear
// the proof_archive row to retry. Worst case: ledger shows verdict without IG link.
async function runVerdict(opts?: { force?: 'WIN' | 'MISS'; date?: string; republish?: boolean; confirmMiss?: boolean; dayOverride?: number }): Promise<EngineRunResult> {
  const result: EngineRunResult = { phase: 'verdict', date: opts?.date || todayIST(), emailsSent: [], errors: [] }

  // Republish path: re-sync Strava FIRST so the matched activity (and its GPS
  // summary_polyline) is present in strava_activities before the route slide
  // renders. _renderRouteSlide reads the polyline from the DB by activity id; a
  // re-pushed past-date post would otherwise drop the GPS frame all over again.
  if (opts?.republish) {
    try { await syncStrava([]) } catch (e) { result.errors.push(`Republish pre-sync warning: ${(e as Error).message}`) }
  }

  const verdict = await judgeToday({ force: opts?.force, date: opts?.date, dayOverride: opts?.dayOverride })
  result.verdict = verdict

  // ── SAFETY: forced/test verdicts must NEVER publish or write the ledger ──
  // ?force=WIN injects synthetic data (FORCED_WIN_FOR_TESTING → 5 km / 30 min).
  // Publishing that is exactly how the Day 1 post went out showing "5 km" instead
  // of the real 12.53 km run. A forced run now JUDGES ONLY — no Instagram, no DB
  // write. The real nightly verdict cron (which never passes force) publishes the
  // live activity. To publish a real post, run the verdict without force.
  if (opts?.force) {
    result.errors.push(`FORCED ${opts.force} — test verdict. IG publish + ledger write intentionally skipped so synthetic data can't reach the feed. Run without force to publish the real activity.`)
    return result
  }

  // Gap-day guard — rest/gap days between the last break and the new Day 1
  // belong to NO run: no ledger row, no slip, no IG post, no email. Without
  // this, the retired-era fallback numbers the gap 65/66 and a quiet training
  // log gets judged a MISS. Force flags bypass this (for testing).
  if (_isGapDay(result.date) && !opts?.force) {
    result.errors.push(`GAP_DAY — ${result.date} is a rest/gap day (Day 1 = ${_day1Label()}). No verdict recorded.`)
    return result
  }

  // Pre-chapter guard — Chapter 02 hasn't started. No publish, no ledger, no email.
  // Force flags bypass this (for testing).
  if (verdict.chapterDay < 1 && !opts?.force) {
    result.errors.push(`PRE_CHAPTER — Chapter 02 ENDURANCE starts 2026-06-20 IST. Today (${result.date}) is dormant.`)
    return result
  }

  // Too-early-to-judge guard — refuse to declare MISS before VERDICT_CUTOFF_HOUR_IST
  // when judging "today". Prevents premature manual/test calls from locking in a
  // false MISS before the user has had the day to log their activity. The
  // scheduled cron fires at 23:30 IST which passes this guard. Force flags + a
  // date in the past (e.g. grace re-check of yesterday) bypass.
  const judgingToday = verdict.date === todayIST()
  if (judgingToday && verdict.verdict === 'MISS' && _currentISTHour() < VERDICT_CUTOFF_HOUR_IST && !opts?.force) {
    result.errors.push(`TOO_EARLY — current IST hour ${_currentISTHour()} < cutoff ${VERDICT_CUTOFF_HOUR_IST}. Day not over. No publish.`)
    return result
  }

  if (verdict.verdict === 'PENDING') {
    result.errors.push(verdict.pendingReason || 'PENDING')
    try {
      await _sendEmail(`[FIRSTLIGHT ⚠] Day ${verdict.chapterDay} — verdict PENDING (infra)`, _emailShell('Verdict PENDING', `<p>${verdict.pendingReason || 'unknown'}</p>`), verdict.pendingReason || '')
      result.emailsSent.push('pending')
    } catch (_e) { /* tolerate */ }
    return result
  }

  // Idempotency — block double-runs from the start.
  // Republish intentionally bypasses this lock (the proof_archive row already
  // exists for a past date being re-pushed); _recordVerdict upserts on date so
  // no duplicate ledger row is created — only ig_post_id is refreshed.
  if (!opts?.republish && await _verdictAlreadyPosted(result.date)) {
    result.alreadyDone = true
    return result
  }

  // PHASE 1: write verdict row + slip (if MISS) BEFORE publish to lock idempotency.
  // ig_post_id is null until publish completes.
  try {
    await _recordVerdict(verdict)
  } catch (err) {
    result.errors.push(`DB write failed (skipping publish to avoid stuck state): ${(err as Error).message}`)
    try { await _emailPublishFailure(verdict, err as Error); result.emailsSent.push('db-failure') } catch (_e) { /* tolerate */ }
    return result
  }

  // ── MISS-CONFIRM GATE ──
  // The slip is on the ledger now (written above) and the ₹ is owed regardless.
  // But a MISS is NOT auto-posted to public Instagram until the operator confirms
  // it — this stops a flaky data feed (Strava ban / Apple Health gaps) from
  // auto-shaming a day the run actually happened. WINs are never gated.
  //   Confirm a real miss:  ?action=confirm-miss&date=YYYY-MM-DD  (posts it)
  //   Dispute a false miss: do nothing — no public post ever goes out.
  if (verdict.verdict === 'MISS' && !opts?.confirmMiss) {
    result.missAwaitingConfirm = true
    result.errors.push(`MISS_AWAITING_CONFIRM — slip recorded; public post HELD pending confirmation. Confirm: ?action=confirm-miss&date=${result.date}`)
    try {
      await _emailMissConfirmRequest(verdict)
      result.emailsSent.push('miss-confirm-request')
    } catch (_e) { /* tolerate */ }
    return result
  }

  // ── INSTAGRAM OFF (Chapter 04 DISCIPLINE — clean mode) ──
  // Accountability is already fully recorded above (verdict row + slip + ₹ stake
  // + emails). From here the system does NOT post to Instagram: set the secret
  // ig_publish_enabled='false'. The judge, ledger, penalty and email all keep
  // running — only the public post is skipped. Re-enable by setting 'true'/removing.
  if ((await getSecret('ig_publish_enabled')) === 'false') {
    result.errors.push('IG_PUBLISH_DISABLED — verdict + ledger + stake recorded; no Instagram post (clean mode).')
    return result
  }

  // PHASE 2: render + publish.
  // publish_mode controls publish target:
  //   - 'story'    → 1 Story image (algorithm-safe for small accounts)
  //   - 'feed'     → 1 feed image
  //   - 'both'     → feed + story
  //   - 'carousel' → WIN: 2-slide carousel (hero + GPS route); MISS: 1 feed image
  const publishMode = ((await getSecret('publish_mode')) || 'story').toLowerCase()
  const wantCarousel = publishMode === 'carousel'
  const wantFeed     = publishMode === 'feed' || publishMode === 'both'
  const wantStory    = publishMode === 'story' || publishMode === 'both'
  let post: PublishedPost | null = null
  try {
    const caption = _generateCaption(verdict)

    if (wantCarousel) {
      if (verdict.verdict === 'WIN') {
        const allMatches = verdict.allMatched || (verdict.matched ? [verdict.matched] : [])
        const isMultiActivity = allMatches.length >= 2

        if (isMultiActivity) {
          // STACK DAY — 3-slide carousel for 2-4 activities, 4-slide for 5+
          // (the bonus summary slide makes massive days feel like a moment)
          const slides: string[] = []
          try {
            slides.push(await _renderMultiSlide(verdict, 'WIN_MULTI_HERO'))
            slides.push(await _renderMultiSlide(verdict, 'WIN_MULTI_MAP'))
            slides.push(await _renderMultiSlide(verdict, 'WIN_MULTI_GRID'))
            if (allMatches.length >= 5) {
              slides.push(await _renderMultiSlide(verdict, 'WIN_MULTI_SUMMARY'))
            }
          } catch (multiErr) {
            // If multi-slide render fails, fall back to single-activity flow
            result.errors.push(`Multi-activity render failed, falling back: ${(multiErr as Error).message}`)
            slides.length = 0
            slides.push(await _renderVerdictImage(verdict, 'post'))
            try { slides.push(await _renderRouteSlide(verdict)) } catch (_e) { /* tolerate */ }
          }
          if (slides.length >= 2) {
            post = await _publishIgCarousel(slides, caption)
          } else if (slides.length === 1) {
            post = await _publishIgFeedPost(slides[0], caption)
          } else {
            throw new Error('No slides rendered for multi-activity day')
          }
        } else {
          // Single activity — original 2-slide carousel (hero + route).
          // Strava wins carry a polyline; Apple wins may carry one via
          // workouts_detail routes (HAE "Include Route Data").
          const slide1 = await _renderVerdictImage(verdict, 'post')
          let slide2: string | null = null
          const routeWorthTrying = verdict.matched &&
            (verdict.matched.activityId > 0 ||
             (await _appleRouteData(verdict.date, verdict.matched.durationMin)) !== null)
          if (routeWorthTrying) {
            try {
              slide2 = await _renderRouteSlide(verdict)
            } catch (routeErr) {
              result.errors.push(`Route slide failed (falling back to single image): ${(routeErr as Error).message}`)
            }
          }
          if (slide2) {
            post = await _publishIgCarousel([slide1, slide2], caption)
          } else {
            post = await _publishIgFeedPost(slide1, caption)
          }
        }
      } else {
        // MISS — single image to feed
        const imageUrl = await _renderVerdictImage(verdict, 'post')
        post = await _publishIgFeedPost(imageUrl, caption)
      }
      result.publishedPost = post

      // Carousel mode ALSO publishes Story frames (non-fatal if any fail)
      // — feed gives permanence + carousel reach, story drives 24h discovery + polls
      // For GPS sports (walk/run/cycle/swim) we publish a 2-frame Story:
      // frame 1 = hero (same as carousel slide 1), frame 2 = GPS route slide.
      // For HR sessions (no GPS) we publish 1 frame (hero only).
      try {
        await _publishVerdictStoryFrames(verdict, result)
      } catch (storyErr) {
        result.errors.push(`Story publish failed (non-fatal — carousel succeeded): ${(storyErr as Error).message}`)
      }
    }

    if (wantFeed) {
      const imageUrl = await _renderVerdictImage(verdict, 'post')
      post = await _publishIgFeedPost(imageUrl, caption)
      result.publishedPost = post
    }

    if (wantStory) {
      try {
        await _publishVerdictStoryFrames(verdict, result)
        // Story-only mode: synthesize a post id from the story for ledger linking
        if (!post && result.publishedStory) post = { media_id: result.publishedStory.media_id }
      } catch (storyErr) {
        // If feed also failed (or wasn't requested) and story fails, this is fatal.
        if (!result.publishedPost) throw storyErr
        result.errors.push(`Story publish failed (non-fatal — feed succeeded): ${(storyErr as Error).message}`)
      }
    }

    if (!post) {
      throw new Error(`Nothing published — publish_mode='${publishMode}' produced no output`)
    }
  } catch (err) {
    await _emailPublishFailure(verdict, err as Error)
    result.errors.push((err as Error).message)
    result.emailsSent.push('publish-failure')
    return result   // DB row already written in PHASE 1
  }

  // PHASE 3: update DB row with ig_post_id (best-effort)
  try {
    await supaUpsert('proof_archive', { date: result.date, ig_post_id: post.media_id }, 'date')
    if (verdict.verdict === 'MISS') {
      await supaAdmin.from('slips').update({ ig_post_id: post.media_id }).eq('client_id', `engine_miss_${result.date}`)
    }
  } catch (updateErr) {
    result.errors.push(`ig_post_id update failed (non-fatal — IG post exists): ${(updateErr as Error).message}`)
  }

  // PHASE 4: email confirmation
  try {
    if (verdict.verdict === 'WIN') {
      await _emailVerdictWin(verdict, post)
      result.emailsSent.push('verdict-win')
    } else {
      await _emailVerdictMiss(verdict, post)
      result.emailsSent.push('verdict-miss')
    }
  } catch (mailErr) {
    result.errors.push(`Email failed: ${(mailErr as Error).message}`)
  }

  return result
}

// ═══════════════════════════════════════════════════════════════════════════
// MONTHLY RECAP (Phase 7) — 7-slide carousel posted on 1st of next month.
// Aggregates strava_activities + slips + proof_archive for the month window.
// Publishes a 7-slide IG carousel + optional Story stitched together.
// Idempotent on (year, month) via secrets table key `monthly_recap_<YYYY-MM>`.
// ═══════════════════════════════════════════════════════════════════════════

interface MonthlyRecapAggregate {
  monthLabel: string
  monthShort: string
  year: number
  monthNum: number          // 1-12
  monthIndex: number        // sequence within Chapter 02 (1 = first month, 2 = second...)
  daysInWindow: number      // active chapter days in this month (excludes pre-chapter / future)
  daysInMonth: number       // total calendar days
  hitDays: number
  missDays: number
  pendingDays: number
  dayResults: Array<{ day: number; status: 'WIN' | 'MISS_PENDING' | 'MISS_PAID' | 'PRE_CHAPTER' | 'FUTURE' }>
  totalKm: number
  totalMin: number
  totalKcal: number
  donatedTotal: number
  childrenFedYears: number
  sportBreakdown: Array<{ bucket: string; label: string; color: string; km: number; minutes: number; count: number }>
  uniqueSports: number
  longestActivity?: { name: string; km: number; minutes: number; type: string }
  avgPerDay: { km: number; min: number }
}

const BUCKET_LABEL_MAP: Record<string, string> = {
  walk:  'WALK',
  run:   'RUN',
  cycle: 'CYCLE',
  swim:  'SWIM',
  hrSession: 'STRENGTH'
}
const BUCKET_COLOR_MAP: Record<string, string> = {
  walk:  '#F5A623',
  run:   '#FC4C02',
  cycle: '#00D4FF',
  swim:  '#93C5FD',
  hrSession: '#00E676'
}

function _classifyActivityBucket(t: string): keyof typeof ENDURANCE_RULE | null {
  for (const b of ['walk','run','cycle','swim'] as const) {
    const r = ENDURANCE_RULE[b]
    if ('minMeters' in r && r.types.includes(t)) return b
  }
  if (ENDURANCE_RULE.hrSession.types.includes(t)) return 'hrSession'
  return null
}

// Resolve target month — if YYYY-MM passed, use that; otherwise the month that just ended.
function _resolveRecapMonth(opts?: { month?: string }): { year: number; monthNum: number } {
  if (opts?.month) {
    const [y, m] = opts.month.split('-').map(s => parseInt(s, 10))
    return { year: y, monthNum: m }
  }
  // "Previous month" = month before today's IST month
  const now = new Date()
  const ist = new Date(now.getTime() + (5.5 * 3600000))
  const y = ist.getUTCFullYear()
  const m = ist.getUTCMonth() + 1
  if (m === 1) return { year: y - 1, monthNum: 12 }
  return { year: y, monthNum: m - 1 }
}

function _monthIndexInChapter(year: number, monthNum: number): number {
  // Chapter 02 starts 2026-06-20. Month 1 = Jun 2026, Month 2 = Jul 2026, ...
  const cy = CHAPTER_2_START.getUTCFullYear()      // 2026
  const cm = CHAPTER_2_START.getUTCMonth() + 1     // 6
  return (year - cy) * 12 + (monthNum - cm) + 1
}

// Build the monthly recap aggregate for a given (year, monthNum).
async function aggregateMonth(year: number, monthNum: number): Promise<MonthlyRecapAggregate> {
  const monthStr = `${year}-${String(monthNum).padStart(2,'0')}`
  const monthStart = `${monthStr}-01`
  const daysInMonth = new Date(Date.UTC(year, monthNum, 0)).getUTCDate()
  const monthEnd = `${monthStr}-${String(daysInMonth).padStart(2,'0')}`
  const MONTH_NAMES = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER']
  const MONTH_SHORTS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']

  // Pull activities in window
  const { data: actsRaw } = await supaAdmin
    .from('strava_activities')
    .select('id,type,name,distance,moving_time,calories,start_date_local')
    .gte('start_date_local', `${monthStart}T00:00:00`)
    .lte('start_date_local', `${monthEnd}T23:59:59`)
  const acts = (actsRaw || []) as Array<{
    id: number; type: string; name: string; distance: number; moving_time: number;
    calories: number | null; start_date_local: string
  }>

  // Pull slips for window (rule='body' to match Chapter 02 engine)
  const { data: slipsRaw } = await supaAdmin
    .from('slips')
    .select('date,penalty_amount,penalty_status,category')
    .gte('date', monthStart)
    .lte('date', monthEnd)
  const slips = (slipsRaw || []) as Array<{ date: string; penalty_amount: number | null; penalty_status: string; category: string | null }>

  // Pull proof_archive verdicts
  const { data: proofRaw } = await supaAdmin
    .from('proof_archive')
    .select('date,verdict')
    .gte('date', monthStart)
    .lte('date', monthEnd)
  const proofs = (proofRaw || []) as Array<{ date: string; verdict: string }>

  // Build dayResults
  const todayIso = todayIST()
  const dayResults: MonthlyRecapAggregate['dayResults'] = []
  let daysInWindow = 0
  let hitDays = 0, missDays = 0, pendingDays = 0, donatedTotal = 0
  const slipsByDate: Record<string, typeof slips[number]> = {}
  for (const s of slips) slipsByDate[s.date] = s
  const proofByDate: Record<string, string> = {}
  for (const p of proofs) proofByDate[p.date] = p.verdict

  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${monthStr}-${String(d).padStart(2,'0')}`
    const dayTs = new Date(`${iso}T12:00:00+05:30`).getTime()
    const inChapter2 = dayTs >= CHAPTER_2_START.getTime()
    const day = chapterDay(new Date(dayTs))
    let status: MonthlyRecapAggregate['dayResults'][number]['status']
    if (!inChapter2 || day < 1) {
      // Pre-Chapter-2 days (including all Chapter 1 days) → PRE_CHAPTER for this recap framework
      status = 'PRE_CHAPTER'
    } else if (iso > todayIso) {
      status = 'FUTURE'
    } else {
      daysInWindow++
      const v = proofByDate[iso]
      const slip = slipsByDate[iso]
      if (v === 'WIN') {
        status = 'WIN'; hitDays++
      } else if (v === 'MISS' || slip) {
        missDays++
        if (slip?.penalty_status === 'cleared') {
          status = 'MISS_PAID'
          donatedTotal += (slip.penalty_amount || STAKE_AMOUNT)
        } else {
          status = 'MISS_PENDING'
          if (slip?.penalty_amount) donatedTotal += 0  // pending — don't count yet
        }
      } else {
        // No proof + no slip. Treat as pending judgment (rare — orphaned day)
        status = 'MISS_PENDING'
        pendingDays++
      }
    }
    dayResults.push({ day: d, status })
  }

  // Aggregate sport breakdown — Chapter 02 ONLY.
  // Activities from pre-Chapter-2 days are excluded so totals match the heatmap.
  const bucketStats: Record<string, { km: number; min: number; count: number }> = {}
  let totalKm = 0, totalMin = 0, totalKcal = 0
  let longest: MonthlyRecapAggregate['longestActivity'] | undefined
  const ch2Start = CHAPTER_2_START.getTime()
  for (const a of acts) {
    const b = _classifyActivityBucket(a.type)
    if (!b) continue
    // Only count activities from Chapter 02 days.
    // start_date_local is "2026-06-20T05:14:00" (no zone) — read as IST wall clock.
    const actTs = new Date(`${a.start_date_local.slice(0,19)}+05:30`).getTime()
    if (actTs < ch2Start) continue
    const km = a.distance / 1000
    const min = a.moving_time / 60
    const kcal = a.calories || 0
    totalKm += km; totalMin += min; totalKcal += kcal
    if (!bucketStats[b]) bucketStats[b] = { km: 0, min: 0, count: 0 }
    bucketStats[b].km += km
    bucketStats[b].min += min
    bucketStats[b].count += 1
    // Longest = max km for GPS sports, max minutes for HR sessions
    const isGps = b !== 'hrSession'
    const score = isGps ? km : min / 60
    const prevScore = longest ? (longest.km > 0 ? longest.km : longest.minutes / 60) : 0
    if (score > prevScore) {
      longest = { name: a.name || a.type, km: +km.toFixed(2), minutes: +min.toFixed(1), type: a.type }
    }
  }
  const sportBreakdown = Object.entries(bucketStats).map(([bucket, s]) => ({
    bucket,
    label: BUCKET_LABEL_MAP[bucket] || bucket.toUpperCase(),
    color: BUCKET_COLOR_MAP[bucket] || '#FFFFFF',
    km: +s.km.toFixed(1),
    minutes: +s.min.toFixed(0),
    count: s.count
  })).sort((a, b) => (b.km + b.minutes/10) - (a.km + a.minutes/10))

  const uniqueSports = sportBreakdown.length
  const childrenFedYears = Math.floor(donatedTotal / STAKE_AMOUNT)
  const denom = Math.max(daysInWindow, 1)

  return {
    monthLabel: `${MONTH_NAMES[monthNum-1]} ${year}`,
    monthShort: MONTH_SHORTS[monthNum-1],
    year,
    monthNum,
    monthIndex: _monthIndexInChapter(year, monthNum),
    daysInWindow,
    daysInMonth,
    hitDays,
    missDays,
    pendingDays,
    dayResults,
    totalKm: +totalKm.toFixed(1),
    totalMin: Math.round(totalMin),
    totalKcal: Math.round(totalKcal),
    donatedTotal,
    childrenFedYears,
    sportBreakdown,
    uniqueSports,
    longestActivity: longest,
    avgPerDay: { km: +(totalKm/denom).toFixed(1), min: Math.round(totalMin/denom) }
  }
}

// Render slide N (1..7) of the monthly recap via the Cloudflare worker.
async function _renderMonthlySlide(agg: MonthlyRecapAggregate, slideNum: number): Promise<string> {
  const base = await _renderWorkerBase()
  const key = await _renderKey()
  const body = {
    date: `${agg.year}-${String(agg.monthNum).padStart(2,'0')}-01`,
    chapterDay: 0,
    chapter: chapterBrand(`${agg.year}-${String(agg.monthNum).padStart(2,'0')}-01`),
    variant: 'MONTHLY_RECAP',
    orientation: 'post',
    payload: {
      monthly: agg,
      monthlySlide: slideNum
    }
  }
  const r = await fetch(`${base}/api/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { 'x-render-key': key } : {}) },
    body: JSON.stringify(body)
  })
  if (!r.ok) throw new Error(`Monthly slide ${slideNum} render returned ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const j = await r.json() as { success: boolean; publicUrl: string; error?: string }
  if (!j.success || !j.publicUrl) throw new Error(`Monthly slide ${slideNum} render failed: ${j.error || 'no publicUrl'}`)
  return j.publicUrl
}

function _generateMonthlyCaption(agg: MonthlyRecapAggregate): string {
  const heroPct = agg.daysInWindow > 0 ? Math.round((agg.hitDays / agg.daysInWindow) * 100) : 0
  const lines: string[] = []
  lines.push(`${agg.monthLabel} · Month ${agg.monthIndex} of Chapter 02`)
  lines.push('')
  lines.push(`${agg.hitDays}/${agg.daysInWindow} days held · ${heroPct}%`)
  lines.push(`${agg.totalKm.toFixed(1)} km across ${agg.uniqueSports} disciplines`)
  if (agg.donatedTotal > 0) {
    lines.push(`Rs ${agg.donatedTotal.toLocaleString('en-IN')} → Akshaya Patra · ${agg.childrenFedYears} child${agg.childrenFedYears===1?'':'ren'} sponsored`)
  } else {
    lines.push('Zero misses. Streak held all month.')
  }
  lines.push('')
  // ANTI-SPAM (2026-07-24): no firstlight.live CTA — private site = login wall.
  lines.push('#firstlight #ironmanintraining #chapter02 #accountability #endurance')
  return lines.join('\n')
}

interface MonthlyRecapResult {
  phase: 'monthly-recap'
  year: number
  monthNum: number
  monthLabel: string
  aggregate?: MonthlyRecapAggregate
  alreadyDone?: boolean
  publishedPost?: PublishedPost
  publishedStory?: PublishedPost
  slidesRendered: number
  emailsSent: string[]
  errors: string[]
}

// PHASE 7 entry — monthly recap publisher
// Options:
//   month  : 'YYYY-MM' to force a specific month (default = previous month)
//   dryRun : true → render only, do not publish to IG
async function runMonthlyRecap(opts?: { month?: string; dryRun?: boolean }): Promise<MonthlyRecapResult> {
  const { year, monthNum } = _resolveRecapMonth({ month: opts?.month })
  const monthKey = `${year}-${String(monthNum).padStart(2,'0')}`
  const result: MonthlyRecapResult = {
    phase: 'monthly-recap', year, monthNum,
    monthLabel: monthKey,
    slidesRendered: 0, emailsSent: [], errors: []
  }

  // Idempotency — use secrets table key
  const idemKey = `monthly_recap_${monthKey}`
  const already = await getSecret(idemKey)
  if (already && !opts?.dryRun) {
    result.alreadyDone = true
    return result
  }

  // ── INSTAGRAM OFF (clean mode) ──
  // Honours the same switch the daily verdict does: secret ig_publish_enabled='false'.
  // A recap exists only to be posted, so with publishing off there is nothing to do.
  // Bail BEFORE aggregating + rendering (7 slides of wasted render otherwise), and
  // deliberately do NOT burn the month's idempotency key — so re-enabling later can
  // still run this month's recap. dryRun still previews.
  if (!opts?.dryRun && (await getSecret('ig_publish_enabled')) === 'false') {
    result.errors.push('IG_PUBLISH_DISABLED — monthly recap skipped (clean mode).')
    return result
  }

  // Aggregate
  const agg = await aggregateMonth(year, monthNum)
  result.aggregate = agg
  result.monthLabel = agg.monthLabel

  // Skip if month had zero active days (e.g. running for a pre-chapter month)
  if (agg.daysInWindow === 0) {
    result.errors.push(`No active chapter days in ${agg.monthLabel} — skipping recap`)
    return result
  }

  // Render 7 slides
  const slides: string[] = []
  try {
    for (let i = 1; i <= 7; i++) {
      slides.push(await _renderMonthlySlide(agg, i))
      result.slidesRendered = i
    }
  } catch (renderErr) {
    result.errors.push(`Monthly slide render failed: ${(renderErr as Error).message}`)
    // Try to email failure
    try { await sendAlert(`Monthly recap render failed (${monthKey})`, (renderErr as Error).message) } catch (_e) { /* tolerate */ }
    return result
  }

  if (opts?.dryRun) {
    // For preview — return rendered URLs in errors[] for inspection
    result.errors.push('DRY_RUN — not published. Rendered slides: ' + slides.join(' | '))
    return result
  }

  // Publish carousel
  const caption = _generateMonthlyCaption(agg)
  try {
    const post = await _publishIgCarousel(slides, caption)
    result.publishedPost = post
  } catch (pubErr) {
    result.errors.push(`Carousel publish failed: ${(pubErr as Error).message}`)
    try { await sendAlert(`Monthly recap publish failed (${monthKey})`, (pubErr as Error).message) } catch (_e) { /* tolerate */ }
    return result
  }

  // Stamp idempotency key (use post id)
  try { await setSecret(idemKey, result.publishedPost?.media_id || 'published') } catch (_e) { /* tolerate */ }

  // Story: post slide 1 only (cover) — drives 24h discovery
  try {
    const story = await _publishIgStory(slides[0])
    result.publishedStory = story
  } catch (storyErr) {
    result.errors.push(`Story publish failed (non-fatal): ${(storyErr as Error).message}`)
  }

  // Email confirmation
  try {
    const html = _emailShell(`Monthly recap posted — ${agg.monthLabel}`, `
      <p style="font-size:18px;color:#fff">${agg.hitDays}/${agg.daysInWindow} days held · ${agg.totalKm.toFixed(1)} km · Rs ${agg.donatedTotal.toLocaleString('en-IN')} donated</p>
      <p style="color:#888">7-slide carousel + Story published. IG post: <a href="https://www.instagram.com/p/${result.publishedPost?.media_id}/" style="color:#00D4FF">${result.publishedPost?.media_id}</a></p>
    `)
    await _sendEmail(`[FIRSTLIGHT] Monthly recap posted — ${agg.monthLabel}`, html, `Monthly recap ${agg.monthLabel} published`)
    result.emailsSent.push('monthly-recap-posted')
  } catch (mailErr) {
    result.errors.push(`Email failed: ${(mailErr as Error).message}`)
  }

  return result
}

// PHASE 6 entry — 00:15 grace re-check (yesterday's MISS may have late-synced)
async function runGrace(): Promise<EngineRunResult> {
  // Use yesterday's IST date
  const now = new Date()
  const ist = new Date(now.getTime() + (5.5 * 3600000))
  const yesterday = new Date(ist.getTime() - 86400000).toISOString().slice(0, 10)

  const result: EngineRunResult = { phase: 'grace', date: yesterday, emailsSent: [], errors: [] }

  // Check yesterday's recorded verdict
  const { data: existing } = await supaAdmin
    .from('proof_archive')
    .select('verdict, ig_post_id')
    .eq('date', yesterday)
    .maybeSingle()

  // Only grace-re-check if yesterday was recorded as MISS
  if (!existing || existing.verdict !== 'MISS') {
    return result
  }

  const reJudged = await judgeToday({ date: yesterday })
  result.verdict = reJudged
  if (reJudged.verdict !== 'WIN') return result

  // Flipped! A late sync (Apple Health / manual / Strava) turned yesterday's
  // MISS into a WIN. Retract the phantom forfeit — but NEVER silently.
  result.errors.push('VERDICT_REVISED_MISS_TO_WIN')

  // 1. Flip proof_archive to WIN FIRST. The slip-immutability trigger's
  //    verdict-revision clearance (PATH 4, supabase/fix_grace_slip_retraction.sql)
  //    reads proof_archive.verdict, so it must already say WIN before we clear.
  try {
    await supaUpsert('proof_archive', { date: yesterday, verdict: 'WIN' }, 'date')
  } catch (e) {
    await sendAlert('[FIRSTLIGHT] grace: proof_archive WIN update failed',
      `Day ${reJudged.chapterDay} (${yesterday}) revised MISS→WIN but proof_archive update failed: ${(e as Error).message}. Slip retraction is now blocked — resolve manually.`)
  }

  // 2. Retract the slip: zero the penalty + mark cleared. Do NOT touch `insight`
  //    (the immutability trigger freezes it). PATH 4 permits this receiptless
  //    clear ONLY because penalty_amount=0 AND proof_archive says WIN. If the
  //    clear is blocked or matches no row, ALERT — do not swallow it: a silent
  //    failure here is exactly what left slip id=32 stuck 'pending' on
  //    2026-07-21 and forced a manual SQL void.
  try {
    const { data: cleared, error: clrErr } = await supaAdmin
      .from('slips')
      .update({ penalty_status: 'cleared', penalty_amount: 0 })
      .eq('client_id', `engine_miss_${yesterday}`)
      .eq('penalty_status', 'pending')
      .select('id')
    if (clrErr) throw clrErr
    if (!cleared || cleared.length === 0) {
      // No row updated: either already cleared (fine) or a stuck one remains.
      const { data: stuck } = await supaAdmin
        .from('slips')
        .select('id, penalty_status')
        .eq('client_id', `engine_miss_${yesterday}`)
        .maybeSingle()
      if (stuck && stuck.penalty_status === 'pending') {
        await sendAlert('[FIRSTLIGHT] grace: false-miss slip STUCK pending',
          `Day ${reJudged.chapterDay} (${yesterday}) revised MISS→WIN but slip id=${stuck.id} is still 'pending' — the immutability trigger blocked the clear. Apply supabase/fix_grace_slip_retraction.sql (PATH 4), then re-run engine-grace or void manually.`)
      }
    }
  } catch (e) {
    await sendAlert('[FIRSTLIGHT] grace: false-miss slip retraction FAILED',
      `Day ${reJudged.chapterDay} (${yesterday}) revised MISS→WIN but clearing engine_miss_${yesterday} threw: ${(e as Error).message}. It will nag as a phantom ₹${STAKE_AMOUNT}. Apply supabase/fix_grace_slip_retraction.sql or void manually.`)
  }

  // Email
  try {
    const html = _emailShell(`Verdict revised: MISS → WIN`, `
      <p style="font-size:18px;color:#fff">Late Strava sync flipped yesterday's verdict to WIN.</p>
      <p style="color:#888">Forfeit retracted. Donation not required.</p>
    `)
    await _sendEmail(`[FIRSTLIGHT] Day ${reJudged.chapterDay} — verdict revised: MISS → WIN`, html, 'Verdict revised')
    result.emailsSent.push('verdict-revised')
  } catch (_e) { /* tolerate */ }

  return result
}

// Revisit a pending day after the normal nightly verdict. The regular sync
// schedule runs again after midnight, so late Strava/Apple uploads can be
// published without a second cron installation. Never retry a day that already
// has a recorded verdict: the IG call may have succeeded before its DB update.
async function reconcileYesterday(log: string[]): Promise<void> {
  const ist = new Date(Date.now() + 5.5 * 3600000)
  const yesterday = new Date(ist.getTime() - 86400000).toISOString().slice(0, 10)
  if (_isGapDay(yesterday) || yesterday < '2026-09-27') return

  const { data: proof, error: proofError } = await supaAdmin.from('proof_archive')
    .select('verdict,ig_post_id').eq('date', yesterday).maybeSingle()
  if (proofError) throw proofError
  if (proof?.verdict) {
    if (proof.verdict === 'WIN' && !proof.ig_post_id &&
        (await getSecret('ig_publish_enabled')) !== 'false') {
      await alertOnce('missing_ig_' + yesterday, 24,
        'Workout verdict has no confirmed Instagram post',
        'The ' + yesterday + ' WIN is in proof_archive without an ig_post_id. Check Instagram before any manual retry to avoid a duplicate.')
      log.push('Reconcile: ' + yesterday + ' already judged; IG post needs verification')
    }
    return
  }

  const { data: health } = await supaAdmin.from('health_daily')
    .select('workout_count').eq('date', yesterday).maybeSingle()
  // Query by Strava's UTC timestamp with exact IST day bounds. Comparing a
  // timezone-less local clock to a TIMESTAMPTZ can miss early-morning workouts.
  const dayStartUtc = new Date(yesterday + 'T00:00:00+05:30').toISOString()
  const nextDayUtc = new Date(new Date(dayStartUtc).getTime() + 86400000).toISOString()
  const { data: strava, error: stravaError } = await supaAdmin.from('strava_activities')
    .select('id').gte('start_date', dayStartUtc)
    .lt('start_date', nextDayUtc).limit(1)
  if (stravaError) throw stravaError
  if (!Number(health?.workout_count || 0) && !(strava && strava.length)) {
    log.push('Reconcile: no workout evidence for ' + yesterday)
    return
  }

  const verdict = await judgeToday({ date: yesterday })
  if (verdict.verdict !== 'WIN') {
    log.push('Reconcile: evidence exists for ' + yesterday + ' but live judge is ' + verdict.verdict)
    await alertOnce('reconcile_pending_' + yesterday, 24,
      'Workout evidence needs review', yesterday + ' has an uploaded workout but the verdict is ' + verdict.verdict + '. Check Strava scope, Health Auto Export, and the source activity.')
    return
  }
  const result = await runVerdict({ date: yesterday })
  log.push('Reconcile: ' + yesterday + ' ' + (result.publishedPost || result.publishedStory ? 'published' : result.alreadyDone ? 'already done' : 'not published'))
  if (result.errors.length) log.push('Reconcile warnings: ' + result.errors.join('; '))
}

// ── Alerting via Resend (set RESEND_API_KEY in Edge Function secrets) ──
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
const ALERT_TO = Deno.env.get('ALERT_TO') || 'firstlightlive@gmail.com'
// firstlight.live is a Resend-verified custom domain — sender lands in inbox, not spam.
const ALERT_FROM = Deno.env.get('ALERT_FROM') || 'mail@firstlight.live'
async function sendAlert(subject: string, body: string) {
  if (!RESEND_API_KEY) return
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: ALERT_FROM, to: [ALERT_TO], subject: '[FIRSTLIGHT] ' + subject, text: body })
    })
  } catch (_e) { /* silent — alerting must never break sync */ }
}

// Rate-limited alert. `sync` runs 6× a day, so a persistent fault (e.g. a dead IG
// token) would otherwise mail 6 identical copies daily until it's fixed — which
// trains you to ignore the alert. Fires at most once per `ttlHours` per key.
async function alertOnce(key: string, ttlHours: number, subject: string, body: string) {
  const cfgKey = 'ALERT_LAST_' + key
  try {
    const { data } = await supaAdmin.from('config').select('value').eq('key', cfgKey).single()
    const last = data?.value ? Date.parse(data.value) : 0
    if (last && (Date.now() - last) < ttlHours * 3600_000) return   // still inside the quiet window
  } catch (_e) { /* no row yet → fall through and alert */ }
  await sendAlert(subject, body)
  try {
    await supaUpsert('config', { key: cfgKey, value: new Date().toISOString() }, 'key')
  } catch (_e) { /* ignore */ }
}

// Supabase client with service_role (for secrets table)
const supaAdmin = createClient(SUPA_URL, SUPA_SERVICE_KEY)
// Supabase client with anon key (for public tables)
const supaAnon = createClient(SUPA_URL, SUPA_ANON_KEY)

// ── Token storage via secrets table ──
async function getSecret(key: string): Promise<string | null> {
  const { data, error } = await supaAdmin.from('secrets').select('value').eq('key', key).single()
  if (error || !data) return null
  return data.value
}

async function setSecret(key: string, value: string) {
  await supaAdmin.from('secrets').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
}

// ── Supabase upsert helper ──
async function supaUpsert(table: string, data: Record<string, unknown>, onConflict = 'date') {
  const { error } = await supaAdmin.from(table).upsert(data, { onConflict })
  if (error) throw new Error(`Upsert ${table}: ${error.message}`)
}

async function supaGet(table: string, query: Record<string, string>) {
  let q = supaAdmin.from(table).select(query.select || '*')
  if (query.eq) { const [col, val] = query.eq.split(':'); q = q.eq(col, val) }
  if (query.limit) q = q.limit(parseInt(query.limit))
  if (query.order) q = q.order(query.order, { ascending: false })
  const { data } = await q
  return data || []
}

// ═══════════════════════════════════════════
// MET-based calorie estimator — Strava's detail endpoint sometimes returns
// null for phone-only ("Strava App" device) activities because there's no
// HR sensor to read. Estimate from moving_time × MET × weight as a fallback
// so the column is never null for completed activities.
// ═══════════════════════════════════════════
function estimateCalories(activityType: string, sec: number, weightKg = 70): number {
  if (!sec || sec <= 0) return 0
  const hours = sec / 3600
  let MET = 5 // generic "workout" fallback
  const t = (activityType || '').toLowerCase()
  if (t.includes('run')) MET = 9.8         // moderate run ~8 min/km
  else if (t.includes('walk') || t.includes('hike')) MET = 4
  else if (t.includes('ride') || t.includes('bike') || t.includes('cycl')) MET = 8
  else if (t.includes('swim')) MET = 8
  else if (t.includes('yoga')) MET = 3
  else if (t.includes('weight') || t.includes('strength')) MET = 5
  else if (t.includes('stair')) MET = 9
  return Math.round(MET * weightKg * hours)
}

// ═══════════════════════════════════════════
// STRAVA SYNC
// ═══════════════════════════════════════════
async function syncStrava(log: string[]) {
  log.push('Strava: starting...')

  const refreshToken = await getSecret('strava_refresh')
  const clientId = await getSecret('strava_client_id')
  const clientSecret = await getSecret('strava_client_secret')
  if (!refreshToken || !clientId || !clientSecret) { log.push('Strava: missing credentials'); return }

  // Refresh access token
  const tokenResp = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `client_id=${clientId}&client_secret=${clientSecret}&refresh_token=${refreshToken}&grant_type=refresh_token`
  }).then(r => r.json())

  if (!tokenResp.access_token) {
    log.push('Strava: token refresh failed')
    await sendAlert('Strava token refresh FAILED', 'Strava OAuth refresh returned no access_token. Today\'s run will NOT sync to proof_archive. Re-authorize at https://www.strava.com/settings/apps and update strava_refresh in the secrets table. Response: ' + JSON.stringify(tokenResp).slice(0, 500))
    return
  }

  await setSecret('strava_access', tokenResp.access_token)
  await setSecret('strava_refresh', tokenResp.refresh_token)
  log.push('Strava: token refreshed')

  // Pull last 3 days of activities
  const threeDaysAgo = Math.floor(Date.now() / 1000) - (3 * 86400)
  const activitiesResp = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?per_page=30&after=${threeDaysAgo}`,
    { headers: { 'Authorization': `Bearer ${tokenResp.access_token}` } }
  )
  const activities = await activitiesResp.json()

  if (!activitiesResp.ok || !Array.isArray(activities)) {
    log.push('Strava: activities API failed (HTTP ' + activitiesResp.status + '): ' +
      JSON.stringify(activities).slice(0, 250))
    return
  }
  log.push(`Strava: found ${activities.length} recent activities`)

  let synced = 0
  let detailHits = 0, detailMisses = 0
  for (const a of activities) {
    // ─── DETAIL FETCH ─────────────────────────────────────────────
    // Strava's list endpoint returns SummaryActivity which omits calories,
    // kilojoules, device_name, splits, etc. Detail endpoint /activities/{id}
    // returns DetailedActivity with those fields. One extra call per activity.
    // Strava limit: 100 calls / 15 min, 1000 / day. Sync runs 5 new acts/day
    // worst case → 5 extra calls. Well under cap.
    let calories: number | null = null
    let kilojoules: number | null = null
    let deviceName: string | null = null
    try {
      const det = await fetch(`https://www.strava.com/api/v3/activities/${a.id}`, {
        headers: { 'Authorization': `Bearer ${tokenResp.access_token}` }
      })
      if (det.ok) {
        const dj = await det.json()
        calories   = (typeof dj.calories === 'number') ? dj.calories : null
        kilojoules = (typeof dj.kilojoules === 'number') ? dj.kilojoules : null
        deviceName = dj.device_name || null
        detailHits++
      } else if (det.status === 429) {
        log.push('Strava: rate-limited on detail fetch, skipping rest')
        // fall through and continue with summary-only row
        detailMisses++
      } else {
        detailMisses++
      }
    } catch (_e) {
      detailMisses++
    }
    // MET fallback for phone-only activities where Strava can't compute kcal.
    // Strava returns null OR 0 for these (the API is inconsistent — both occur).
    // Treat anything <= 0 as missing and fill from MET formula.
    if ((calories === null || calories === 0) && a.moving_time > 0) {
      calories = estimateCalories(a.type || '', a.moving_time, 70)
    }

    const row: Record<string, unknown> = {
      id: a.id, name: a.name || '', type: a.type || '',
      sport_type: a.sport_type || a.type || '',
      distance: (a.distance || 0).toFixed(2),
      moving_time: a.moving_time || 0,
      elapsed_time: a.elapsed_time || 0,
      total_elevation_gain: (a.total_elevation_gain || 0).toFixed(2),
      start_date: a.start_date,
      start_date_local: a.start_date_local,
      average_speed: a.average_speed ? a.average_speed.toFixed(3) : null,
      max_speed: a.max_speed ? a.max_speed.toFixed(3) : null,
      average_heartrate: a.average_heartrate || null,
      max_heartrate: a.max_heartrate || null,
      calories,            // ← now from detail endpoint
      kilojoules,          // ← new: ride power, null for non-rides
      device_name: deviceName, // ← new: e.g. "Apple Watch Series 7", "Garmin Fenix 8"
      calories_synced_at: calories !== null ? new Date().toISOString() : null,
      suffer_score: a.suffer_score || null,
      pr_count: a.pr_count || 0,
      summary_polyline: a.map ? a.map.summary_polyline : null
    }
    try { await supaUpsert('strava_activities', row, 'id'); synced++ }
    catch (e) { log.push(`Strava: upsert FAILED for activity ${a.id}: ${(e as Error).message}`) }
  }
  log.push(`Strava: ${synced}/${activities.length} synced (detail: ${detailHits} hits, ${detailMisses} misses)`)
  // Surface partial-write failures into SYNC_HEALTH (the handler scans `log` for
  // 'failed'/'FAILED'), so a silently-broken sync becomes visible instead of
  // looking 'healthy' while rows quietly fail to land.
  if (synced < activities.length) {
    log.push(`Strava: ⚠ ${activities.length - synced} of ${activities.length} activities did NOT persist`)
  }
}

// ═══════════════════════════════════════════
// STRAVA CALORIES BACKFILL — one batch per invocation
// ═══════════════════════════════════════════
// Operates on rows where calories_synced_at IS NULL, ordered by recency.
// Caller (a local loop script) keeps calling until { remaining: 0 } returns.
// Rate-limit aware: stops early on 429 so the caller can sleep 15 min and retry.
async function backfillStravaCalories(log: string[], limit: number) {
  log.push(`Backfill: starting (limit ${limit})...`)

  const refreshToken = await getSecret('strava_refresh')
  const clientId = await getSecret('strava_client_id')
  const clientSecret = await getSecret('strava_client_secret')
  if (!refreshToken || !clientId || !clientSecret) { log.push('Backfill: missing Strava credentials'); return { processed: 0, remaining: -1, rateLimited: false } }

  // Refresh token (same pattern as sync)
  const tokenResp = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `client_id=${clientId}&client_secret=${clientSecret}&refresh_token=${refreshToken}&grant_type=refresh_token`
  }).then(r => r.json())
  if (!tokenResp.access_token) { log.push('Backfill: token refresh failed'); return { processed: 0, remaining: -1, rateLimited: false } }
  await setSecret('strava_access', tokenResp.access_token)
  await setSecret('strava_refresh', tokenResp.refresh_token)

  // Count remaining first (so caller knows when to stop)
  const { count: totalRemaining } = await supaAdmin
    .from('strava_activities')
    .select('id', { count: 'exact', head: true })
    .is('calories_synced_at', null)

  // Get next batch — newest first so today's runs get fixed first if missed
  // Also need type + moving_time for MET fallback estimation
  const { data: rows, error } = await supaAdmin
    .from('strava_activities')
    .select('id, name, start_date_local, type, moving_time')
    .is('calories_synced_at', null)
    .order('start_date_local', { ascending: false })
    .limit(limit)
  if (error) { log.push(`Backfill: query error ${error.message}`); return { processed: 0, remaining: totalRemaining ?? -1, rateLimited: false } }
  if (!rows || rows.length === 0) { log.push('Backfill: nothing to do'); return { processed: 0, remaining: 0, rateLimited: false } }

  let processed = 0
  let rateLimited = false
  let detailHits = 0
  let nullCalories = 0
  for (const r of rows) {
    const resp = await fetch(`https://www.strava.com/api/v3/activities/${r.id}`, {
      headers: { 'Authorization': `Bearer ${tokenResp.access_token}` }
    })
    if (resp.status === 429) {
      rateLimited = true
      log.push(`Backfill: 429 after ${processed} rows; caller must wait 15min`)
      break
    }
    if (!resp.ok) {
      // Mark synced_at anyway so we don't keep retrying a broken id (e.g. deleted on Strava)
      await supaAdmin.from('strava_activities').update({ calories_synced_at: new Date().toISOString() }).eq('id', r.id)
      processed++
      continue
    }
    const dj = await resp.json()
    let calories = (typeof dj.calories === 'number') ? dj.calories : null
    const kilojoules = (typeof dj.kilojoules === 'number') ? dj.kilojoules : null
    const deviceName = dj.device_name || null

    // MET fallback for phone-only activities — null OR 0 means missing
    const movingTime = (r as { moving_time?: number }).moving_time
    if ((calories === null || calories === 0) && movingTime && movingTime > 0) {
      calories = estimateCalories((r as { type?: string }).type || '', movingTime, 70)
      nullCalories++ // count as null-from-Strava (we still backfilled it via estimate)
    } else if (calories === null) {
      nullCalories++
    } else {
      detailHits++
    }

    await supaAdmin.from('strava_activities').update({
      calories,
      kilojoules,
      device_name: deviceName,
      calories_synced_at: new Date().toISOString(),
    }).eq('id', r.id)

    processed++
  }

  const newRemaining = (totalRemaining ?? 0) - processed
  log.push(`Backfill: processed=${processed} hits=${detailHits} nullCals=${nullCalories} remaining≈${newRemaining}${rateLimited ? ' (rate-limited)' : ''}`)
  return { processed, remaining: newRemaining, rateLimited, hits: detailHits, nullCalories }
}

// ═══════════════════════════════════════════
// PERMANENT TOKEN CONVERSION — the cure for the 60-day cycle
// ═══════════════════════════════════════════
// A Facebook USER token always dies (60 days max, and no server call can extend it —
// fb_exchange_token returns the same expiry when the input is already long-lived).
// A PAGE token derived from a LONG-LIVED user token does NOT expire: Graph reports
// expires_at = 0 for it, and it keeps working indefinitely. Instagram's content
// publishing endpoints accept it for the linked IG business account.
//
// So the whole outage class is fixed by never storing a user token in the first place.
// This converts one into the permanent page token. It is deliberately conservative:
// every failure path returns null and the caller keeps whatever it already had.
async function derivePermanentPageToken(
  userToken: string,
  appId: string,
  appSecret: string,
  log: string[]
): Promise<{ token: string; pageName: string; expiresAt: number } | null> {
  try {
    // The page token inherits its lifetime from the user token it came from, so a
    // SHORT-lived parent yields a short-lived page token. Upgrade the parent first.
    let parent = userToken
    const parentDbg = await fetch(
      `https://graph.facebook.com/v21.0/debug_token?input_token=${parent}&access_token=${appId}|${appSecret}`
    ).then(r => r.json())
    const parentExpiry = parentDbg?.data?.expires_at || 0
    const parentDays = parentExpiry === 0 ? NEVER_EXPIRES_DAYS : Math.floor((parentExpiry - Date.now() / 1000) / 86400)
    if (parentDays < 50) {
      const long = await fetch(
        `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token` +
        `&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${parent}`
      ).then(r => r.json())
      if (long.access_token) parent = long.access_token
    }

    // Ask for the pages this user administers, along with each page's own token.
    const accounts = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account{id}` +
      `&access_token=${encodeURIComponent(parent)}`
    ).then(r => r.json())
    if (accounts.error) { log.push(`Instagram: page-token lookup failed — ${accounts.error.message}`); return null }

    const pages: any[] = accounts.data || []
    // Prefer the page actually linked to our IG account; fall back to the known page id.
    const page = pages.find(p => p.instagram_business_account?.id === IG_ACCOUNT_ID)
      || pages.find(p => String(p.id) === FB_PAGE_ID)
    if (!page?.access_token) {
      log.push(`Instagram: no page token available (${pages.length} page(s) visible) — needs pages_show_list + the IG account linked to the page`)
      return null
    }

    // Confirm it really is permanent before trusting it.
    const dbg = await fetch(
      `https://graph.facebook.com/v21.0/debug_token?input_token=${page.access_token}&access_token=${appId}|${appSecret}`
    ).then(r => r.json())
    if (!dbg?.data?.is_valid) { log.push('Instagram: derived page token failed validation'); return null }
    const expiresAt = dbg.data.expires_at || 0
    if (expiresAt !== 0) {
      log.push(`Instagram: page token still carries an expiry (${expiresAt}) — parent user token was not long-lived; not adopting`)
      return null
    }
    if (!(dbg.data.scopes || []).includes('instagram_content_publish')) {
      log.push('Instagram: page token lacks instagram_content_publish — not adopting')
      return null
    }

    // Final proof: it must actually reach the IG account we publish to.
    const acct = await fetch(
      `https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}?fields=id,username&access_token=${encodeURIComponent(page.access_token)}`
    ).then(r => r.json())
    if (acct.error) { log.push(`Instagram: page token cannot reach IG account — ${acct.error.message}`); return null }

    return { token: page.access_token, pageName: page.name || FB_PAGE_ID, expiresAt }
  } catch (e) {
    log.push(`Instagram: page-token conversion threw — ${(e as Error).message}`)
    return null
  }
}

// ═══════════════════════════════════════════
// INSTAGRAM SYNC
// ═══════════════════════════════════════════
async function syncInstagram(log: string[]) {
  log.push('Instagram: starting...')

  // Typed `string` (not `string | null`) so that reassigning it after a refresh
  // doesn't reset narrowing and re-introduce null into every downstream call.
  const storedToken = await getSecret('ig_access')
  if (!storedToken) { log.push('Instagram: no token'); return }
  let igToken: string = storedToken

  // ── Check token expiry ───────────────────────────────────────────────────
  // debug_token returns expires_at === 0 for tokens that NEVER expire (Business
  // Manager System User tokens). That is the healthiest possible state, so it must
  // not be read as "expired" — the old `expiresAt > 0 ? … : -1` did exactly that.
  const debug = await fetch(
    `https://graph.facebook.com/v21.0/debug_token?input_token=${igToken}&access_token=${igToken}`
  ).then(r => r.json())
  const isValid = debug?.data?.is_valid === true
  const expiresAt = debug?.data?.expires_at || 0
  // `let` — the self-heal below can flip this to true mid-run by swapping in the
  // permanent page token, which must then suppress the refresh + expiry-alert blocks.
  let neverExpires = isValid && expiresAt === 0
  const daysLeft = neverExpires
    ? NEVER_EXPIRES_DAYS
    : (expiresAt > 0 ? Math.floor((expiresAt - Date.now() / 1000) / 86400) : -1)
  const tokenKind = debug?.data?.type || 'UNKNOWN'
  log.push(`Instagram: token valid=${isValid}, kind=${tokenKind}, ${neverExpires ? 'never expires ✅' : `expires in ${daysLeft} days`}`)

  // Save token health
  try {
    await supaUpsert('config', {
      key: 'IG_TOKEN_HEALTH',
      value: JSON.stringify({ valid: isValid, days_left: daysLeft, never_expires: neverExpires, token_kind: tokenKind, checked_at: new Date().toISOString(), expires_at: expiresAt })
    }, 'key')
  } catch (_e) { /* ignore */ }

  // Hard failure — the token is dead, so every publish/sync below will 190 out.
  // This previously only wrote a log line nobody reads: the token silently expired
  // on 2026-08-17 and nothing was emailed. Now it alerts (once a day, not 6×).
  if (!isValid) {
    const reason = debug?.data?.error?.message || 'token is not valid'
    log.push('⚠ Instagram: TOKEN EXPIRED')
    await alertOnce('ig_token_dead', 20,
      'IG TOKEN DEAD — publishing is down',
      `The Instagram token is no longer valid, so IG sync and daily proof publish are DOWN right now.\n\n` +
      `Facebook says: ${reason}\n\n` +
      `A Facebook user token cannot be revived from the server — it needs one browser login. Two options:\n\n` +
      `  1. FASTEST (60 days): open https://firstlight.live/ig-connect.html and click through the Facebook login.\n` +
      `  2. PERMANENT (never expires): create a Business Manager System User token and store it as \`ig_access\`.\n` +
      `     https://business.facebook.com/settings/system-users\n\n` +
      `Option 2 ends this class of outage for good — system-user tokens have no 60-day clock.`
    )
    return
  }

  // ── SELF-HEAL: promote any expiring user token to a permanent page token ──
  // Runs on every sync. The moment a valid user token exists — whether it was just
  // pasted in, or has been sitting here for weeks — it is swapped for the page token
  // that never expires. After this succeeds once, `neverExpires` is true forever and
  // this block, the refresh below, and every expiry alert go permanently quiet.
  if (!neverExpires && daysLeft >= 0) {
    const igAppId = await getSecret('ig_app_id')
    const igAppSecret = await getSecret('ig_app_secret')
    if (igAppId && igAppSecret) {
      const permanent = await derivePermanentPageToken(igToken, igAppId, igAppSecret, log)
      if (permanent) {
        igToken = permanent.token
        neverExpires = true   // suppresses the refresh + expiry-warning blocks below
        await setSecret('ig_access', igToken)
        await supaUpsert('config', {
          key: 'IG_TOKEN_HEALTH',
          value: JSON.stringify({ valid: true, days_left: NEVER_EXPIRES_DAYS, never_expires: true, token_kind: 'page', checked_at: new Date().toISOString(), expires_at: 0 })
        }, 'key')
        log.push(`Instagram: ✅ SELF-HEALED — swapped ${daysLeft}d user token for the permanent page token (${permanent.pageName})`)
        await alertOnce('ig_token_permanent', 24 * 365,
          'IG token is now PERMANENT — no more 60-day expiries',
          `The Instagram token was a user token with ${daysLeft} days left. It has been automatically replaced with the ` +
          `Facebook Page access token for "${permanent.pageName}", which Facebook reports as never-expiring.\n\n` +
          `You should not have to log in for Instagram again. The nightly sync re-verifies this on every run and will ` +
          `alert you if it ever stops being true.`
        )
        // fall through — the rest of this sync runs on the permanent token
      } else {
        log.push('Instagram: could not derive a permanent page token — staying on the user token')
      }
    }
  }

  // ── Refresh when under 45 days ───────────────────────────────────────────
  // IMPORTANT: fb_exchange_token does NOT reset the 60-day clock on a token that is
  // ALREADY long-lived — Facebook hands back a token with the same expiry it already
  // had. So this call keeps the token fresh only when it descends from a short-lived
  // token; otherwise it is a no-op that used to log "✅ token refreshed" and hide the
  // fact that the clock was still running down to zero. We now measure the actual
  // gain and escalate when there is none.
  let daysLeftAfter = daysLeft
  let extended = false
  if (!neverExpires && daysLeft < 45 && daysLeft >= 0) {
    const igAppId = await getSecret('ig_app_id')
    const igAppSecret = await getSecret('ig_app_secret')
    if (igAppId && igAppSecret) {
      try {
        const newToken = await fetch(
          `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${igAppId}&client_secret=${igAppSecret}&fb_exchange_token=${igToken}`
        ).then(r => r.json())
        if (newToken.access_token) {
          const recheck = await fetch(
            `https://graph.facebook.com/v21.0/debug_token?input_token=${newToken.access_token}&access_token=${newToken.access_token}`
          ).then(r => r.json())
          const newExpiresAt = recheck?.data?.expires_at || 0
          const newValid = recheck?.data?.is_valid === true
          const newDays = newExpiresAt === 0 && newValid
            ? NEVER_EXPIRES_DAYS
            : Math.floor((newExpiresAt - Date.now() / 1000) / 86400)

          // Only adopt the new token if it is at least as good as what we hold.
          // Guards against replacing a 40-day token with the 2-hour stub Facebook
          // returns in the final hours of a long-lived token's life.
          if (newValid && newDays >= daysLeft) {
            igToken = newToken.access_token
            await setSecret('ig_access', igToken)
            daysLeftAfter = newDays
            extended = newDays > daysLeft
            log.push(`Instagram: token exchanged — ${daysLeft}d → ${newDays === NEVER_EXPIRES_DAYS ? 'never expires' : newDays + 'd'}`)
          } else {
            log.push(`Instagram: ⚠ exchange returned a WORSE token (${newDays}d vs ${daysLeft}d) — kept the existing one`)
          }
        }
      } catch (e) {
        log.push(`Instagram: ⚠ refresh failed: ${(e as Error).message}`)
        await alertOnce('ig_refresh_threw', 20, 'IG token refresh FAILED',
          `Instagram long-lived token has ${daysLeft} days remaining and refresh threw: ${(e as Error).message}. If days_left reaches 0, IG sync + daily proof publish dies. Re-auth at https://firstlight.live/ig-connect.html`)
      }
    }
  }

  // ── Early warning: the clock is running down and we cannot stop it ────────
  // Fires at 30 days out, not 7 — because when the exchange is a no-op there is
  // nothing the server can do, and the fix needs Anupam at a browser. 30 days of
  // notice beats 7, and it is the same one-click fix either way.
  if (!neverExpires && daysLeftAfter <= 30 && daysLeftAfter >= 0 && !extended) {
    await alertOnce('ig_token_expiring', 72,
      `IG token expires in ${daysLeftAfter}d — needs one browser login`,
      `The Instagram token has ${daysLeftAfter} days left and the automatic refresh could NOT extend it.\n\n` +
      `This is expected, not a fault: Facebook does not let a server re-extend a token that is already long-lived — ` +
      `fb_exchange_token returns the same expiry it already had. Only a fresh browser login mints a new 60-day token.\n\n` +
      `  1. FASTEST (60 days): open https://firstlight.live/ig-connect.html and click through the Facebook login.\n` +
      `  2. PERMANENT (never expires): Business Manager → System Users → generate a token with instagram_content_publish,\n` +
      `     then store it as \`ig_access\`. https://business.facebook.com/settings/system-users\n\n` +
      `Do option 2 once and this email never comes back.`
    )
    log.push(`Instagram: ⚠ ${daysLeftAfter}d left, exchange cannot extend — browser re-auth required`)
  }

  // Pull latest 10 posts
  const posts = await fetch(
    `https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}/media?fields=id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count,permalink&limit=10&access_token=${igToken}`
  ).then(r => r.json())

  if (!posts?.data?.length) { log.push('Instagram: no posts'); return }

  let synced = 0, skipped = 0

  // Pre-load already-synced dates to prevent duplicate posts per day
  const { data: existingPosts } = await supaAdmin.from('instagram_posts').select('id,timestamp')
  const syncedDates = new Set<string>()
  const syncedIds = new Set<string>()
  for (const ep of (existingPosts || [])) {
    if (ep.timestamp) syncedDates.add(ep.timestamp.split('T')[0])
    if (ep.id) syncedIds.add(String(ep.id))
  }

  for (const p of posts.data) {
    const postDate = new Date(p.timestamp)
    const dateStr = postDate.toISOString().split('T')[0]
    // The caption is the PUBLISHED truth — trust it over the timestamp. A post
    // that goes out late (grace republish at 10:14 IST) carries YESTERDAY's day
    // number, but chapterDay(p.timestamp) would compute today's and overwrite it.
    // That mismatch is exactly how the site's DAY badge drifted off the captions.
    // Fall back to the timestamp only for posts with no "Day N" in the caption.
    const dayNum = _captionDay(p.caption) ?? chapterDay(postDate)

    // Skip gap-day posts (Jun 9-12, between chapters) so we don't pollute existing rows
    if (dayNum < 1) { skipped++; continue }

    // Skip if a different post for this date already exists in DB (dedup by date)
    if (syncedDates.has(dateStr) && !syncedIds.has(String(p.id))) {
      skipped++
      continue
    }

    const row = {
      id: p.id, ig_id: p.id,
      caption: (p.caption || '').substring(0, 10000),
      media_type: p.media_type, media_url: p.media_url,
      thumbnail_url: p.thumbnail_url, permalink: p.permalink,
      timestamp: p.timestamp,
      like_count: p.like_count || 0, comments_count: p.comments_count || 0,
      day_number: dayNum
    }
    try { await supaUpsert('instagram_posts', row, 'id'); synced++; syncedDates.add(dateStr) } catch (_e) { /* skip */ }
  }
  log.push(`Instagram: ${synced}/${posts.data.length} synced, ${skipped} duplicates skipped`)

  // Migrate images to Supabase Storage (instead of GCS)
  await migrateImagesToStorage(log, igToken)
}

async function migrateImagesToStorage(log: string[], igToken: string) {
  // Fetch posts that still need migration: null URL OR non-supabase CDN URL
  // Process 20 per call — ordered newest first so streak days get migrated first
  const { data: cdnPosts } = await supaAdmin.from('instagram_posts')
    .select('id,ig_id,media_url,day_number')
    .not('media_url', 'like', '%supabase%')
    .not('media_url', 'is', null)
    .order('day_number', { ascending: false })
    .limit(15)

  const { data: nullPosts } = await supaAdmin.from('instagram_posts')
    .select('id,ig_id,media_url,day_number')
    .is('media_url', null)
    .order('day_number', { ascending: false })
    .limit(10)

  const posts = [...(cdnPosts || []), ...(nullPosts || [])]
  if (!posts.length) { log.push('IG→Storage: all images already migrated'); return }

  let migrated = 0
  for (const p of posts) {
    if ((p.media_url || '').includes('supabase')) continue
    try {
      let imgUrl = p.media_url as string | null

      // For null or expired CDN URLs: refresh from IG API to get fresh URL
      if (!imgUrl && igToken) {
        const mediaId = p.ig_id || p.id
        const fresh = await fetch(
          `https://graph.facebook.com/v21.0/${mediaId}?fields=id,media_url,thumbnail_url&access_token=${igToken}`
        ).then(r => r.json())
        imgUrl = fresh.media_url || fresh.thumbnail_url || null
      }

      if (!imgUrl) continue

      const imgResp = await fetch(imgUrl)
      if (!imgResp.ok) continue
      const blob = await imgResp.blob()
      const path = `instagram/day${p.day_number || 0}_${p.id.substring(0, 8)}.jpg`
      const { error } = await supaAdmin.storage.from('media').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
      if (!error) {
        const publicUrl = `${SUPA_URL}/storage/v1/object/public/media/${path}`
        await supaAdmin.from('instagram_posts').update({ media_url: publicUrl }).eq('id', p.id)
        migrated++
      }
    } catch (_e) { /* skip individual errors */ }
  }
  log.push(`IG→Storage: ${migrated}/${posts.length} images migrated`)
}

// ═══════════════════════════════════════════
// PROOF ARCHIVE SYNC
// ═══════════════════════════════════════════
async function syncProofArchive(log: string[]) {
  const stravaToken = await getSecret('strava_access')
  if (!stravaToken) return

  // Build list of dates to sync: today + last 2 days (backfill missed days)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const datesToSync: string[] = []
  for (let i = 0; i < 3; i++) {
    const d = new Date(today + 'T12:00:00Z')
    d.setUTCDate(d.getUTCDate() - i)
    const ds = d.toISOString().substring(0, 10)
    // Only include dates on or after Chapter 1 start
    if (ds >= '2026-02-10') datesToSync.push(ds)
  }

  for (const targetDate of datesToSync) {
    try {
      await syncProofForDate(targetDate, log)
    } catch (e) {
      log.push(`Proof: ${targetDate} error — ${(e as Error).message}`)
    }
  }
}

async function syncProofForDate(targetDate: string, log: string[]) {
  const dayNum = chapterDay(targetDate + 'T00:00:00+05:30')
  // Skip gap days (Jun 9-12) — between chapters, nothing to file under
  if (dayNum < 1) return

  // Get activities for this date from Supabase (already synced by syncStrava)
  const { data: dayActivities } = await supaAdmin.from('strava_activities')
    .select('*')
    .gte('start_date_local', targetDate + 'T00:00:00')
    .lt('start_date_local', targetDate + 'T23:59:59')

  // Check existing proof_archive row
  const { data: existing } = await supaAdmin.from('proof_archive')
    .select('sleep_hrs,food_clean,gym,run_km,cycle_km,swim_km')
    .eq('date', targetDate).maybeSingle()

  // Skip if no activities AND row already exists with data
  if ((!dayActivities || !dayActivities.length) && existing) return
  // Skip if no activities at all and no existing row — nothing to write
  if (!dayActivities || !dayActivities.length) return

  const run = dayActivities.find((a: Record<string, unknown>) => a.type === 'Run' || a.type === 'VirtualRun')
  const ride = dayActivities.find((a: Record<string, unknown>) => a.type === 'Ride' || a.type === 'VirtualRide')
  const swim = dayActivities.find((a: Record<string, unknown>) => a.type === 'Swim')
  const gym = dayActivities.find((a: Record<string, unknown>) => a.type === 'Workout' || a.type === 'WeightTraining')

  if (!run && !ride && !swim && !gym) return

  // Get best sleep value from multiple sources
  let bestSleep: number | null = existing?.sleep_hrs || null
  if (!bestSleep) {
    const { data: hd } = await supaAdmin.from('health_daily').select('sleep_hours').eq('date', targetDate).maybeSingle()
    if (hd?.sleep_hours) bestSleep = hd.sleep_hours
  }
  if (!bestSleep) {
    const { data: sl } = await supaAdmin.from('sleep_log').select('sleep_hours').eq('date', targetDate).maybeSingle()
    if (sl?.sleep_hours) bestSleep = sl.sleep_hours
  }

  const runDist = run ? (run.distance / 1000).toFixed(2) : null
  const runSpeed = run?.average_speed || 0
  const row: Record<string, unknown> = {
    date: targetDate, day_number: dayNum,
    run_km: runDist || (existing?.run_km ?? null),
    run_time_sec: run ? run.moving_time : null,
    run_pace: run && runSpeed > 0 ? `${Math.floor(1000 / runSpeed / 60)}:${String(Math.round(((1000 / runSpeed / 60) % 1) * 60)).padStart(2, '0')}` : null,
    avg_hr: run ? (run.average_heartrate || null) : (swim ? (swim.average_heartrate || null) : null),
    max_hr: run ? (run.max_heartrate || null) : (swim ? (swim.max_heartrate || null) : null),
    calories: ((run ? run.calories : 0) + (ride ? ride.calories : 0) + (swim ? swim.calories : 0)) || null,
    elevation: run ? (run.total_elevation_gain || null) : null,
    cycle_km: ride ? (ride.distance / 1000).toFixed(2) : (existing?.cycle_km ?? null),
    cycle_time_sec: ride ? ride.moving_time : null,
    swim_km: swim ? (swim.distance / 1000).toFixed(2) : (existing?.swim_km ?? null),
    swim_time_sec: swim ? swim.moving_time : null,
    gym: !!gym || (existing?.gym ?? false),
    gym_duration_min: gym ? Math.round(gym.moving_time / 60) : null,
    // Unknown food status must stay unknown until the owner records it.
    food_clean: existing?.food_clean ?? null,
    run_source: 'strava',
    strava_id: run ? run.id : (ride ? ride.id : (swim ? swim.id : null))
  }

  // CRITICAL: Only include sleep if we have a value
  if (bestSleep) row.sleep_hrs = bestSleep

  await supaUpsert('proof_archive', row, 'date')
  const parts = []
  if (row.run_km) parts.push(row.run_km + 'km run')
  if (row.cycle_km) parts.push(row.cycle_km + 'km ride')
  if (row.swim_km) parts.push(row.swim_km + 'km swim')
  if (row.gym) parts.push('gym')
  log.push(`Proof: Day ${dayNum} (${targetDate}) synced — ${parts.join(' + ') || 'activity'}`)
}

// ═══════════════════════════════════════════
// HEALTH INGEST (Apple Watch via Health Auto Export)
// ═══════════════════════════════════════════
async function healthIngest(body: Record<string, unknown>): Promise<{ success: boolean; ingested: number; dates_processed: string[]; errors?: Array<{date: string; error: string}> }> {
  const container = (body.data || body) as Record<string, unknown>
  const metrics = (container.metrics || []) as Array<Record<string, unknown>>
  const workouts = (container.workouts || []) as Array<Record<string, unknown>>
  const dailyMap: Record<string, Record<string, unknown>> = {}

  function ensureDay(d: string) { if (!dailyMap[d]) dailyMap[d] = { raw: {} }; return dailyMap[d] }
  function toDate(s: string) { return s ? s.substring(0, 10) : '' }
  function toTime(s: string) { return s ? s.substring(11, 16) : '' }

  // ── Sleep accumulator: robust date attribution + max-wins idempotency ──
  // Two Apple Health export formats:
  //   A) Summary record: dp.totalSleep or dp.asleep present → max-wins per attributed date
  //   B) Individual stage records: only dp.qty → accumulate with dedup fingerprint per attributed date
  // 6 PM cutoff: sleep starting at or after 18:00 is attributed to the NEXT calendar day
  const sleepMap: Record<string, {
    summary_hours: number | null; seg_hours: number; seg_keys: Set<string>;
    deep_min: number | null; rem_min: number | null; core_min: number | null; awake_min: number | null;
    bedtime: string | null; wake_time: string | null;
  }> = {}

  function ensureSleepDay(d: string) {
    if (!sleepMap[d]) sleepMap[d] = {
      summary_hours: null, seg_hours: 0, seg_keys: new Set(),
      deep_min: null, rem_min: null, core_min: null, awake_min: null,
      bedtime: null, wake_time: null
    }
    return sleepMap[d]
  }

  function sleepAttribDate(dp: Record<string, unknown>): string {
    // Use inBedStart or start for timestamp-aware attribution; fall back to date field
    const tsStr = String(dp.inBedStart || dp.start || dp.date || dp.dateString || '')
    const dateOnly = tsStr.substring(0, 10)
    if (!dateOnly || dateOnly.length !== 10) return ''
    const hourStr = tsStr.substring(11, 13)
    const hour = /^\d{2}$/.test(hourStr) ? parseInt(hourStr, 10) : -1
    // 3 PM cutoff: any sleep starting at or after 15:00 counts as next day's sleep
    // Covers early bedtimes (5 PM, 6 PM) that span midnight into the morning
    if (hour >= 15) {
      const d = new Date(dateOnly + 'T12:00:00Z')
      d.setUTCDate(d.getUTCDate() + 1)
      return d.toISOString().substring(0, 10)
    }
    return dateOnly
  }

  for (const m of metrics) {
    const name = (String(m.name || '')).toLowerCase().replace(/\s+/g, '_')
    const unit = String(m.units || '')
    for (const dp of (m.data || []) as Array<Record<string, unknown>>) {
      const date = toDate(String(dp.date || dp.dateString || dp.start || ''))
      if (!date || date.length !== 10) continue
      const day = ensureDay(date)
      const raw = day.raw as Record<string, unknown>
      raw[name] = { ...dp, unit }

      const qty = dp.qty != null ? parseFloat(String(dp.qty)) : null

      if (name === 'sleep_analysis' || name === 'apple_sleep_in_bed') {
        const aDate = sleepAttribDate(dp)
        if (aDate) {
          const sd = ensureSleepDay(aDate)
          if (dp.totalSleep != null) {
            const v = parseFloat(String(dp.totalSleep))
            if (sd.summary_hours === null || v > sd.summary_hours) sd.summary_hours = v
          } else if (dp.asleep != null) {
            const v = parseFloat(String(dp.asleep))
            if (sd.summary_hours === null || v > sd.summary_hours) sd.summary_hours = v
          } else if (qty != null && qty > 0) {
            // Individual sleep stage segment — accumulate with dedup fingerprint
            const key = `${String(dp.start || dp.date || aDate)}-${qty}`
            if (!sd.seg_keys.has(key)) { sd.seg_keys.add(key); sd.seg_hours += qty }
          }
          if (dp.deep != null) { const v=Math.round(parseFloat(String(dp.deep))*60); if(sd.deep_min===null||v>sd.deep_min) sd.deep_min=v }
          if (dp.rem != null) { const v=Math.round(parseFloat(String(dp.rem))*60); if(sd.rem_min===null||v>sd.rem_min) sd.rem_min=v }
          if (dp.core != null) { const v=Math.round(parseFloat(String(dp.core))*60); if(sd.core_min===null||v>sd.core_min) sd.core_min=v }
          if (dp.inBed != null && dp.totalSleep != null) {
            const v=Math.round((parseFloat(String(dp.inBed))-parseFloat(String(dp.totalSleep)))*60)
            if(sd.awake_min===null||v<sd.awake_min) sd.awake_min=v
          }
          if (dp.inBedStart && !sd.bedtime) sd.bedtime = toTime(String(dp.inBedStart))
          if (dp.inBedEnd && !sd.wake_time) sd.wake_time = toTime(String(dp.inBedEnd))
        }
      }
      else if (name === 'heart_rate') {
        if (dp.Avg != null) day.avg_hr = Math.round(parseFloat(String(dp.Avg)))
        if (dp.Max != null) day.max_hr = Math.round(parseFloat(String(dp.Max)))
        if (dp.Min != null) day.min_hr = Math.round(parseFloat(String(dp.Min)))
      }
      else if (name === 'resting_heart_rate') { if (qty != null) day.resting_hr = Math.round(qty) }
      else if (name === 'heart_rate_variability' || name === 'heart_rate_variability_sdnn' ||
               name === 'heartratevariabilitysdnn' || name === 'hrv_sdnn' || name === 'hrv') {
        if (qty != null) { day.hrv_avg = qty; day.hrv_sdnn = qty }
      }
      else if (name === 'vo2_max' || name === 'vo2max') { if (qty != null) day.vo2_max = qty }
      else if (name === 'active_energy_burned') { if (qty != null) day.active_calories = Math.round(qty) }
      else if (name === 'active_energy') {
        if (qty != null) day.active_calories = unit.toLowerCase().includes('kj') ? Math.round(qty / 4.184) : Math.round(qty)
      }
      else if (name === 'basal_energy_burned' || name === 'basal_energy') {
        if (qty != null) day.basal_calories = unit.toLowerCase().includes('kj') ? Math.round(qty / 4.184) : Math.round(qty)
      }
      else if (name === 'apple_exercise_time') { if (qty != null) day.exercise_minutes = Math.round(qty) }
      else if (name === 'apple_stand_hour' || name === 'apple_stand_time') { if (qty != null) day.stand_hours = Math.round(qty) }
      else if (name === 'step_count') { if (qty != null) day.steps = Math.round(qty) }
      else if (name === 'distance_walking_running') { if (qty != null) day.distance_km = /mi/i.test(unit) ? +(qty * 1.60934).toFixed(3) : qty }
      else if (name === 'flights_climbed') { if (qty != null) day.flights_climbed = Math.round(qty) }
      else if (name === 'walking_speed') { if (qty != null) day.walking_speed = qty }
      else if (name === 'walking_step_length') { if (qty != null) day.walking_step_length = qty }
      else if (name === 'walking_asymmetry_percentage') { if (qty != null) day.walking_asymmetry = qty }
      else if (name === 'walking_double_support_percentage') { if (qty != null) day.walking_double_support = qty }
      else if (name === 'body_mass') { if (qty != null) day.weight_kg = qty }
      else if (name === 'body_mass_index') { if (qty != null) day.bmi = qty }
      else if (name === 'body_fat_percentage') { if (qty != null) day.body_fat_pct = qty }
      else if (name === 'lean_body_mass') { if (qty != null) day.lean_body_mass = qty }
      else if (name === 'blood_oxygen' || name === 'oxygen_saturation' || name === 'blood_oxygen_saturation') { if (qty != null) day.blood_oxygen_pct = qty }
      else if (name === 'respiratory_rate') { if (qty != null) day.respiratory_rate = qty }
      else if (name === 'environmental_audio_exposure' || name === 'headphone_audio_exposure') { if (qty != null) day.noise_exposure_db = qty }
    }
  }

  // Parse workouts
  for (const w of workouts) {
    const date = toDate(String(w.start || ''))
    if (!date) continue
    const day = ensureDay(date)
    if (!day._workouts) day._workouts = []
    const wArr = day._workouts as Array<Record<string, unknown>>
    const ae = w.activeEnergyBurned as Record<string, unknown> | null
    const dist = w.distance as Record<string, unknown> | null
    // HAE "Include Route Data": workout.route = [{lat, lon, ...}, ...] —
    // downsampled + stored so the route slide can render an Apple GPS map.
    const routeRaw = Array.isArray(w.route) ? (w.route as Array<Record<string, unknown>>) : []
    const routePts: Array<[number, number]> = []
    for (const p of routeRaw) {
      const lat = Number(p.lat ?? p.latitude)
      const lng = Number(p.lon ?? p.lng ?? p.longitude)
      if (Number.isFinite(lat) && Number.isFinite(lng)) routePts.push([+lat.toFixed(5), +lng.toFixed(5)])
    }
    wArr.push({
      type: String(w.name || 'unknown').toLowerCase().replace(/\s+/g, '_'),
      duration_min: w.duration ? Math.round(Number(w.duration) / 60) : 0,
      calories: ae ? Math.round(Number(ae.qty || 0)) : 0,
      // HAE sends distance as {qty, units} — units follow the app's export
      // preference (km OR mi). Convert mi→km so the judge's typed distance
      // floors (5km run/walk, 10km cycle, 1km swim) are unit-correct regardless.
      distance_km: dist ? +(Number(dist.qty || 0) * (/mi/i.test(String(dist.units || '')) ? 1.60934 : 1)).toFixed(2) : 0,
      start: toTime(String(w.start || '')),
      ...(routePts.length > 1 ? { route: _downsampleRoute(routePts, 400) } : {})
    })
  }

  // Merge sleepMap into dailyMap — final sleep values with correct date attribution
  for (const [sDate, sd] of Object.entries(sleepMap)) {
    // Prefer summary (aggregated) over accumulated segments; both use max-wins if day already has a value
    const finalHours = sd.summary_hours !== null ? sd.summary_hours : (sd.seg_hours > 0 ? Math.round(sd.seg_hours * 100) / 100 : null)
    if (finalHours !== null) {
      const day = ensureDay(sDate)
      if (day.sleep_hours === undefined || finalHours > Number(day.sleep_hours)) day.sleep_hours = finalHours
      if (sd.deep_min !== null) day.sleep_deep_min = sd.deep_min
      if (sd.rem_min !== null) day.sleep_rem_min = sd.rem_min
      if (sd.core_min !== null) day.sleep_core_min = sd.core_min
      if (sd.awake_min !== null) day.sleep_awake_min = sd.awake_min
      if (sd.bedtime) day.bedtime = sd.bedtime
      if (sd.wake_time) day.wake_time = sd.wake_time
    }
  }

  function sleepScore(r: Record<string, unknown>) {
    let s = 0
    const h = Number(r.sleep_hours || 0)
    // 6h = Anupam's optimal target (not 7-8h standard)
    if (h >= 6 && h <= 8) s += 40; else if (h >= 5) s += 30; else if (h >= 4) s += 20; else if (h > 0) s += 10
    const d = Number(r.sleep_deep_min || 0)
    if (d >= 60 && d <= 120) s += 25; else if (d >= 30) s += 15; else if (d > 0) s += 5
    const rm = Number(r.sleep_rem_min || 0)
    if (rm >= 90) s += 25; else if (rm >= 60) s += 15; else if (rm > 0) s += 5
    const aw = Number(r.sleep_awake_min || 0)
    if (aw <= 20) s += 10; else if (aw <= 40) s += 5
    return Math.min(100, s)
  }

  const dates = Object.keys(dailyMap).sort()
  let ingested = 0
  const errors: Array<{date: string; error: string}> = []

  for (const date of dates) {
    try {
      const data = dailyMap[date]
      const row: Record<string, unknown> = { date }
      const cols = [
        'sleep_hours','sleep_deep_min','sleep_rem_min','sleep_core_min','sleep_awake_min','bedtime','wake_time',
        'resting_hr','avg_hr','max_hr','min_hr','hrv_avg','hrv_sdnn','vo2_max',
        'active_calories','basal_calories','exercise_minutes','stand_hours',
        'steps','distance_km','flights_climbed','walking_speed','walking_step_length',
        'walking_asymmetry','walking_double_support',
        'weight_kg','bmi','body_fat_pct','lean_body_mass',
        'blood_oxygen_pct','respiratory_rate','noise_exposure_db'
      ]
      for (const c of cols) { if (data[c] !== undefined && data[c] !== null) row[c] = data[c] }

      if (row.active_calories && row.basal_calories) row.total_calories = Math.round(Number(row.active_calories) + Number(row.basal_calories))
      if (row.sleep_hours) row.sleep_score = sleepScore(row)

      const wArr = data._workouts as Array<Record<string, unknown>> | undefined
      if (wArr && wArr.length > 0) {
        row.workout_count = wArr.length
        row.workout_types = wArr.map(w => w.type)
        row.workout_total_min = wArr.reduce((s: number, w) => s + Number(w.duration_min || 0), 0)
        row.workout_total_cal = wArr.reduce((s: number, w) => s + Number(w.calories || 0), 0)
        row.workouts_detail = wArr   // per-workout {type, duration_min, calories, distance_km, start} — read by the Apple-primary judge
      }

      // ── FAULT-TOLERANT MERGE: fetch existing row, never let a re-export degrade stored data ──
      const { data: existingRow } = await supaAdmin
        .from('health_daily')
        .select('sleep_hours,vo2_max,workout_count,workout_types,workout_total_min,workout_total_cal,workouts_detail,raw_payload')
        .eq('date', date)
        .maybeSingle()

      // 1. raw_payload: MERGE (new keys win, old keys preserved) — never wipe complete data with partial
      const existingRaw = (existingRow?.raw_payload as Record<string, unknown>) || {}
      row.raw_payload = { ...existingRaw, ...(data.raw as Record<string, unknown>) }

      // 2. VO2 Max: max-wins — it's sparse (updates every 2-4 wks), never let re-export lower it
      if (existingRow?.vo2_max != null) {
        const storedVO2 = Number(existingRow.vo2_max)
        if (!row.vo2_max || storedVO2 > Number(row.vo2_max)) {
          row.vo2_max = storedVO2
        }
      }

      // 3. Workout data: preserve existing if this export has none (partial exports won't wipe workouts)
      if ((!wArr || wArr.length === 0) && existingRow?.workout_count) {
        row.workout_count   = existingRow.workout_count
        row.workout_types   = existingRow.workout_types
        row.workout_total_min = existingRow.workout_total_min
        row.workout_total_cal = existingRow.workout_total_cal
        row.workouts_detail = existingRow.workouts_detail
      }

      // 4. Sleep: max-wins — check BOTH health_daily and sleep_log, take the highest stored value
      let finalSleepHours = row.sleep_hours ? Number(row.sleep_hours) : 0
      const storedInDaily  = existingRow?.sleep_hours ? Number(existingRow.sleep_hours) : 0
      if (storedInDaily > finalSleepHours) finalSleepHours = storedInDaily

      if (finalSleepHours > 0) {
        const { data: existingSleep } = await supaAdmin.from('sleep_log').select('sleep_hours').eq('date', date).maybeSingle()
        const storedInSleepLog = existingSleep?.sleep_hours ? Number(existingSleep.sleep_hours) : 0
        if (storedInSleepLog > finalSleepHours) finalSleepHours = storedInSleepLog
      }

      if (finalSleepHours > (row.sleep_hours ? Number(row.sleep_hours) : 0)) {
        row.sleep_hours = finalSleepHours
        row.sleep_score = sleepScore({ ...row, sleep_hours: finalSleepHours })
      }

      await supaUpsert('health_daily', row, 'date')

      if (finalSleepHours > 0) {
        await supaUpsert('sleep_log', { date, sleep_hours: finalSleepHours, bedtime: row.bedtime || null, wake_time: row.wake_time || null, source: 'health_auto_export' }, 'date')

        const dn = chapterDay(date + 'T00:00:00+05:30')
        const proofRow: Record<string, unknown> = { date, sleep_hrs: finalSleepHours }
        if (dn > 0) proofRow.day_number = dn
        await supaUpsert('proof_archive', proofRow, 'date')

        try {
          await supaUpsert('daily_logs', { date, sleep_hrs: finalSleepHours, wake_time: row.wake_time || null }, 'date')
        } catch (dlErr) {
          // daily_logs is the sealed accountability ledger — history-locked past days
          // correctly refuse edits. A backfill must NOT rewrite a sealed verdict, but it
          // MUST still land the raw health_metrics/health_daily below. Swallow the lock,
          // re-throw anything else.
          if (!/HISTORY LOCKED/i.test((dlErr as Error).message)) throw dlErr
        }
      }

      // Individual metrics
      for (const [mName, info] of Object.entries(data.raw as Record<string, Record<string, unknown>>)) {
        const val = info.qty || info.Avg || info.totalSleep || null
        if (val != null) {
          await supaUpsert('health_metrics', { date, metric: mName, value: parseFloat(String(val)), unit: info.unit || '', source: 'health_auto_export', raw_json: info }, 'date,metric')
        }
      }

      ingested++
    } catch (e) { errors.push({ date, error: (e as Error).message }) }
  }

  return { success: true, ingested, dates_processed: dates, errors: errors.length ? errors : undefined }
}

// ═══════════════════════════════════════════
// IG PROXY — Token injected server-side
// ═══════════════════════════════════════════
// ═══════════════════════════════════════════
// RULES DEBT SETTLEMENT — Strava pays the debt
// ═══════════════════════════════════════════
// Violations write RULES_DEBT_<date> = { km, rules, ts } (verdict + manual
// publish-violation). Settlement recomputes from scratch: every OPEN debt is
// paid by activities on strava_activities that STARTED after the oldest open
// debt — ride 1×, walk/run 2×, swim 10×. When paid >= owed, every open debt
// row is marked cleared and the operator gets an email. Runs piggybacked on
// the daily sync crons + ?action=rules-ledger (read state for the page).
async function settleRulesDebt(log: string[] = []): Promise<{ openKm: number; paidKm: number; remaining: number; cleared: boolean }> {
  const { data: debtRows } = await supaAdmin.from('config').select('key,value').like('key', 'RULES_DEBT_%')
  const open: Array<{ key: string; km: number; ts: string }> = []
  for (const r of (debtRows || []) as Array<{ key: string; value: string }>) {
    try {
      const v = JSON.parse(r.value)
      if (!v.cleared && Number(v.km) > 0) open.push({ key: r.key, km: Number(v.km), ts: String(v.ts || '') })
    } catch (_e) { /* skip malformed */ }
  }
  if (open.length === 0) return { openKm: 0, paidKm: 0, remaining: 0, cleared: true }

  const totalOpen = Math.round(open.reduce((s, d) => s + d.km, 0) * 10) / 10
  const oldestTs = open.map(d => d.ts).filter(Boolean).sort()[0] || new Date(0).toISOString()

  const { data: acts } = await supaAdmin.from('strava_activities').select('type,distance,start_date_local')
    .gte('start_date_local', oldestTs.slice(0, 19))
  let paidKm = 0
  for (const a of (acts || []) as Array<{ type?: string; distance?: number }>) {
    const km = (Number(a.distance) || 0) / 1000
    const t = String(a.type || '')
    if (t === 'Run' || t === 'Walk' || t === 'Hike') paidKm += km * 2
    else if (t === 'Ride' || t === 'VirtualRide' || t === 'EBikeRide') paidKm += km * 1
    else if (t === 'Swim') paidKm += km * 10
  }
  paidKm = Math.round(paidKm * 10) / 10

  if (paidKm >= totalOpen) {
    const nowIso = new Date().toISOString()
    for (const d of open) {
      const { data: curRows } = await supaAdmin.from('config').select('value').eq('key', d.key).limit(1)
      let v: Record<string, unknown> = {}
      try { v = curRows && curRows[0] ? JSON.parse((curRows[0] as { value: string }).value) : {} } catch (_e) { v = {} }
      v.cleared = true
      v.clearedAt = nowIso
      v.paidKm = totalOpen
      await supaUpsert('config', { key: d.key, value: JSON.stringify(v) }, 'key')
    }
    log.push(`RULES_DEBT cleared: ${totalOpen} km paid by Strava since ${oldestTs}`)
    try {
      await _sendEmail(`[FL] Debt cleared — ${totalOpen} km paid on Strava`,
        _emailShell('Debt cleared',
          `<p style="font-size:18px;font-style:italic;color:rgba(240,234,216,0.85);margin:0 0 18px">The ledger is clean.</p>
<p>The open rules debt of <b style="color:#D4A843">${totalOpen} km</b> is paid — Strava shows the distance. Ride on.</p>`),
        `Rules debt ${totalOpen} km cleared by Strava activities since ${oldestTs}.`)
    } catch (_e) { /* tolerate */ }
    return { openKm: totalOpen, paidKm, remaining: 0, cleared: true }
  }
  return { openKm: totalOpen, paidKm, remaining: Math.round((totalOpen - paidKm) * 10) / 10, cleared: false }
}

async function igProxy(body: Record<string, unknown>) {
  const igToken = await getSecret('ig_access')
  if (!igToken) throw new Error('No IG token — check secrets table')

  // Legacy format: { url: "https://graph.facebook.com/..." }
  if (body.url) {
    let targetUrl = String(body.url)
    targetUrl = targetUrl.replace(/access_token=[^&]+/, 'access_token=' + encodeURIComponent(igToken))
    if (!targetUrl.includes('access_token=')) {
      targetUrl += (targetUrl.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(igToken)
    }
    const resp = await fetch(targetUrl, { method: 'POST' })
    return await resp.json()
  }

  // New format: { endpoint, params }
  if (body.endpoint) {
    const endpoint = String(body.endpoint)
    const params = (body.params || {}) as Record<string, string>
    params.access_token = igToken

    // GET request (status checks) — short params only, no caption risk
    if (body.method === 'GET') {
      const qs = Object.entries(params).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&')
      const apiUrl = 'https://graph.facebook.com/v21.0/' + endpoint + '?' + qs
      const resp = await fetch(apiUrl, { method: 'GET' })
      return await resp.json()
    }

    // POST request — use form body to avoid URL length limits with long captions
    const formBody = Object.entries(params)
      .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
      .join('&')
    const apiUrl = 'https://graph.facebook.com/v21.0/' + endpoint
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody
    })
    const result = await resp.json()
    if (result.error) {
      console.error('[igProxy] IG API error:', JSON.stringify(result.error))
    }
    return result
  }

  throw new Error('Missing endpoint or url')
}

// ═══════════════════════════════════════════
// SERVER-SIDE PUBLISH
// ═══════════════════════════════════════════
async function serverPublish(body: Record<string, unknown>) {
  const igToken = await getSecret('ig_access')
  if (!igToken) throw new Error('No IG token — check secrets table')

  const publishType = String(body.publish_type || 'carousel')
  const images = (body.images || []) as string[]
  const caption = String(body.caption || '')

  if (!images.length || images.length < 2) throw new Error('Need at least 2 slides')

  // Upload images to Supabase Storage
  const imageUrls: string[] = []
  for (let i = 0; i < images.length; i++) {
    const dataUrl = images[i]
    const base64 = dataUrl.split(',')[1]
    const buffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
    const filename = `carousel_${Date.now()}_${i}.jpg`
    const path = `instagram/${filename}`

    const { error } = await supaAdmin.storage.from('media').upload(path, buffer, { contentType: 'image/jpeg', upsert: true })
    if (error) throw new Error(`Upload failed: ${error.message}`)
    imageUrls.push(`${SUPA_URL}/storage/v1/object/public/media/${path}`)
  }

  // Create containers
  const childIds: string[] = []
  for (const url of imageUrls) {
    const qs = `image_url=${encodeURIComponent(url)}&is_carousel_item=true&access_token=${encodeURIComponent(igToken)}`
    const resp = await fetch(`https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}/media?${qs}`, { method: 'POST' })
    const d = await resp.json()
    if (d.error) throw new Error(d.error.error_user_msg || d.error.message)
    childIds.push(d.id)
  }

  // Create carousel container
  const carouselQs = `media_type=CAROUSEL&children=${childIds.join(',')}&caption=${encodeURIComponent(caption)}&access_token=${encodeURIComponent(igToken)}`
  const carouselResp = await fetch(`https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}/media?${carouselQs}`, { method: 'POST' })
  const carousel = await carouselResp.json()
  if (carousel.error) throw new Error(carousel.error.error_user_msg || carousel.error.message)

  // Wait for container processing — poll status instead of fixed sleep
  for (let t = 0; t < 12; t++) {
    await new Promise(r => setTimeout(r, 2500))
    const stResp = await fetch(`https://graph.facebook.com/v21.0/${carousel.id}?fields=status_code&access_token=${encodeURIComponent(igToken)}`)
    const st = await stResp.json()
    if (st.status_code === 'FINISHED') break
    if (st.status_code === 'ERROR') throw new Error('Instagram rejected the media container (status ERROR)')
  }

  // Publish
  const pubQs = `creation_id=${carousel.id}&access_token=${encodeURIComponent(igToken)}`
  const pubResp = await fetch(`https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}/media_publish?${pubQs}`, { method: 'POST' })
  const pub = await pubResp.json()
  if (pub.error) throw new Error(pub.error.error_user_msg || pub.error.message)

  // Post first comment if provided
  if (body.first_comment) {
    const cmtQs = `message=${encodeURIComponent(String(body.first_comment))}&access_token=${encodeURIComponent(igToken)}`
    await fetch(`https://graph.facebook.com/v21.0/${pub.id}/comments?${cmtQs}`, { method: 'POST' })
  }

  return { success: true, media_id: pub.id, publish_type: publishType }
}

// ═══════════════════════════════════════════
// MEDIA UPLOAD — service role, bypasses RLS.
// Server fallback when browser-direct storage upload fails (also used for HEIC re-encode path).
// ═══════════════════════════════════════════
async function uploadMedia(body: Record<string, unknown>) {
  const dataUrl = String(body.data || '')
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
  if (!base64) throw new Error('No image data provided')
  const buffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  if (buffer.length > 8 * 1024 * 1024) throw new Error('Image too large (max 8MB)')
  const folder = String(body.folder || 'instagram').replace(/[^a-zA-Z0-9_/-]/g, '') || 'instagram'
  const filename = String(body.filename || `upload_${Date.now()}.jpg`).replace(/[^a-zA-Z0-9._-]/g, '')
  const contentType = String(body.content_type || 'image/jpeg')
  const path = `${folder}/${filename}`

  const { error } = await supaAdmin.storage.from('media').upload(path, buffer, { contentType, upsert: true })
  if (error) throw new Error(`Storage upload failed: ${error.message}`)
  const url = `${SUPA_URL}/storage/v1/object/public/media/${path}`
  return { success: true, url, publicUrl: url }
}

// ═══════════════════════════════════════════════════════════════════════════
// UPLOAD RECEIPT — admin uploads UPI screenshot for a MISS slip.
// 1. Stores image in receipts public bucket
// 2. Posts image as IG Story (24h reach)
// 3. Posts text comment under the linked MISS post
// 4. Updates slip: penalty_status='cleared', receipt_url, paid_at
// ═══════════════════════════════════════════════════════════════════════════
async function uploadReceipt(body: Record<string, unknown>) {
  const clientId = String(body.client_id || '')
  if (!clientId) throw new Error('Missing client_id (slip identifier)')
  const dataUrl = String(body.image_data || '')
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl
  if (!base64) throw new Error('No receipt image provided')
  const buffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  if (buffer.length > 8 * 1024 * 1024) throw new Error('Image too large (max 8MB)')

  const result: Record<string, unknown> = { steps: [] as string[] }
  const steps = result.steps as string[]

  // 1. Read slip to get IG post id + amount
  const { data: slip, error: slipErr } = await supaAdmin
    .from('slips')
    .select('id,client_id,date,penalty_amount,penalty_charity,penalty_km,ig_post_id,penalty_status')
    .eq('client_id', clientId)
    .maybeSingle()
  if (slipErr || !slip) throw new Error(`Slip not found: ${slipErr?.message || clientId}`)
  if (slip.penalty_status === 'cleared') {
    return { success: true, alreadyPaid: true, slip, message: 'Slip already paid' }
  }

  // 2. Upload to receipts public bucket
  const ext = (String(body.content_type || 'image/png').split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '')
  const filename = `${slip.date}_${clientId.replace(/[^a-z0-9_]/gi, '')}_${Date.now()}.${ext}`
  const { error: upErr } = await supaAdmin.storage
    .from('receipts')
    .upload(filename, buffer, { contentType: String(body.content_type || 'image/png'), upsert: true })
  if (upErr) throw new Error(`Receipt upload failed: ${upErr.message}`)
  const publicUrl = `${SUPA_URL}/storage/v1/object/public/receipts/${filename}`
  steps.push(`uploaded:${publicUrl}`)

  // 3. Post as IG Story (best-effort)
  const igToken = await getSecret('ig_access')
  let storyId: string | null = null
  let commentId: string | null = null
  if (igToken) {
    try {
      const createBody = `image_url=${encodeURIComponent(publicUrl)}&media_type=STORIES&access_token=${encodeURIComponent(igToken)}`
      const createResp = await fetch(`https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: createBody
      })
      const created = await createResp.json()
      if (created.id) {
        // Poll status
        for (let t = 0; t < 8; t++) {
          await new Promise(r => setTimeout(r, 2000))
          const stResp = await fetch(`https://graph.facebook.com/v21.0/${created.id}?fields=status_code&access_token=${encodeURIComponent(igToken)}`)
          const st = await stResp.json()
          if (st.status_code === 'FINISHED') break
          if (st.status_code === 'ERROR') throw new Error('Story container ERROR')
        }
        const pubResp = await fetch(`https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}/media_publish?creation_id=${created.id}&access_token=${encodeURIComponent(igToken)}`, { method: 'POST' })
        const pub = await pubResp.json()
        if (pub.id) { storyId = pub.id; steps.push(`story:${pub.id}`) }
      }
    } catch (e) { steps.push(`story-failed:${(e as Error).message}`) }

    // 4. Post text comment under the linked MISS post
    if (slip.ig_post_id) {
      try {
        // This is a PUBLIC Instagram comment, so it obeys the anti-spam rules:
        // no firstlight.live link (the site is a login wall), no Rs, no charity.
        // Chapter 04 clears a miss with distance, so state the distance.
        const km = slip.penalty_km || MISS_PENANCE_KM
        const message = `Debt cleared. ${km} km ridden.`
        const commentBody = `message=${encodeURIComponent(message)}&access_token=${encodeURIComponent(igToken)}`
        const cmtResp = await fetch(`https://graph.facebook.com/v21.0/${slip.ig_post_id}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: commentBody
        })
        const cmt = await cmtResp.json()
        if (cmt.id) { commentId = cmt.id; steps.push(`comment:${cmt.id}`) }
        else steps.push(`comment-failed:${JSON.stringify(cmt).slice(0,200)}`)
      } catch (e) { steps.push(`comment-failed:${(e as Error).message}`) }
    }
  }

  // 5. Update slip
  const { error: updErr } = await supaAdmin
    .from('slips')
    .update({
      penalty_status: 'cleared',
      receipt_url: publicUrl,
      proof_url: publicUrl,
      paid_at: new Date().toISOString()
    })
    .eq('client_id', clientId)
  if (updErr) throw new Error(`Slip update failed: ${updErr.message}`)
  steps.push('slip-updated:paid')

  return {
    success: true,
    publicUrl,
    storyId,
    commentId,
    slipId: slip.id,
    clientId,
    date: slip.date,
    steps
  }
}

// ═══════════════════════════════════════════
// SCHEDULED EMAIL SYSTEM — 4 daily + 1 weekly
// Resend HTML emails with FIRST LIGHT brand. All compute day number
// from STREAK_START and pull today's stats from strava_activities.
// ═══════════════════════════════════════════
// Emails share the ONE public counter (DAY_EPOCH via chapterDay) — they used to
// run off their own STREAK_START_ISO='2026-06-20' anchor, so a morning email said
// "Day 61" while that night's post said "Day 31". Same number everywhere now.
function _daysSinceStart(): number {
  return Math.max(1, chapterDay(new Date(`${todayIST()}T12:00:00+05:30`)))
}
function _todayLocalISO(): string {
  // IST date string YYYY-MM-DD
  const now = new Date()
  const ist = new Date(now.getTime() + (5.5 * 3600 * 1000))
  return ist.toISOString().slice(0, 10)
}
async function _todayRunStats(): Promise<{ km: number; min: number; pace: string; start: string; name: string } | null> {
  const today = _todayLocalISO()
  const { data } = await supaAdmin.from('strava_activities').select('name,type,start_date_local,distance,moving_time')
    .eq('type', 'Run').gte('start_date_local', today + 'T00:00:00').lt('start_date_local', today + 'T23:59:59')
    .order('start_date_local', { ascending: false }).limit(1)
  if (!data || !data.length) return null
  const r = data[0]
  const km = Math.round((r.distance / 1000) * 100) / 100
  const min = Math.round((r.moving_time || 0) / 60)
  const paceN = km > 0 ? (min / km) : 0
  const pace = paceN > 0 ? `${Math.floor(paceN)}'${String(Math.round((paceN % 1) * 60)).padStart(2, '0')}"` : '—'
  const start = (r.start_date_local || '').slice(11, 16)
  return { km, min, pace, start, name: r.name || 'Morning Run' }
}
async function _sendEmail(subject: string, html: string, text: string) {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not set')
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: ALERT_FROM, to: [ALERT_TO], subject, html, text })
  })
  const d = await resp.json()
  if (!resp.ok) throw new Error('Resend ' + resp.status + ': ' + JSON.stringify(d))
  return d
}
function _emailShell(title: string, bodyHtml: string, footer = ''): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0E0C09;font-family:Georgia,'Times New Roman',serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0E0C09"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#1A1612;border:1px solid rgba(212,168,67,0.18);margin:32px 0">
<tr><td style="padding:28px 36px;border-bottom:1px solid rgba(212,168,67,0.18)">
<div style="font-family:Georgia,serif;font-size:11px;letter-spacing:6px;color:rgba(212,168,67,0.55);margin-bottom:4px">— F I R S T  L I G H T —</div>
<div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:3px;color:rgba(212,168,67,0.35)">CHAPTER 02 · BANGALORE · GPS-VERIFIED</div>
</td></tr>
<tr><td style="padding:36px;color:#F0EAD8;font-size:14px;line-height:1.7">
<h1 style="margin:0 0 24px;font-family:Georgia,serif;font-weight:400;font-size:34px;color:#D4A843;letter-spacing:1px">${title}</h1>
${bodyHtml}
</td></tr>
<tr><td style="padding:24px 36px;border-top:1px solid rgba(212,168,67,0.18);background:#0E0C09">
<div style="font-family:'Courier New',monospace;font-size:11px;color:rgba(212,168,67,0.55);letter-spacing:1px">MISS → ${MISS_PENANCE_LABEL.toUpperCase()} · LOGGED PUBLIC · EVERY DAY</div>
<div style="font-family:Georgia,serif;font-size:24px;color:#D4A843;margin-top:8px"><a href="https://firstlight.live" style="color:#D4A843;text-decoration:none">firstlight.live</a></div>
<div style="font-family:'Courier New',monospace;font-size:10px;color:rgba(212,168,67,0.4);margin-top:4px">@firstlightlive · CHAPTER 02 · ${footer}</div>
</td></tr>
</table></td></tr></table></body></html>`
}

// One rest-day note shared by the 04:30 morning reminder and the 06:30 streak
// update on gap days — the counter is quiet between the last break and Day 1.
function _gapDayNote(): { subject: string; html: string; text: string } {
  const html = _emailShell('Rest day · counter quiet.',
    `<p style="font-size:18px;font-style:italic;color:rgba(240,234,216,0.85);margin:0 0 18px">Rest day. The counter is quiet.</p>
<p>Run 1 of the RETURN closed; the new run has not begun. Nothing is owed today, nothing is judged.</p>
<p><b style="color:#D4A843">Day 1 begins ${_day1Label()}.</b> The normal flow resumes then — 04:30 morning reminder · 06:30 check-in · 21:00 nudge · 23:30 verdict.</p>
<p style="font-size:12px;color:rgba(240,234,216,0.5);margin-top:28px">— Rest-day note from the system you built.</p>`,
    'REST DAY')
  return {
    subject: `[FL] Rest day — Day 1 begins ${_day1Label()}`,
    html,
    text: `Rest day. The counter is quiet. Day 1 begins ${_day1Label()}. Normal emails resume then.`
  }
}

async function emailMorningReminder() {
  if (_isGapDay()) {
    const note = _gapDayNote()
    await _sendEmail(note.subject, note.html, note.text)
    return { sent: 'rest-note', day: null }
  }
  const dn = _daysSinceStart()
  const html = _emailShell(`Day ${String(dn).padStart(3, '0')}.`,
    `<p style="font-size:18px;font-style:italic;color:rgba(240,234,216,0.85);margin:0 0 18px">A new day. Pick one.</p>
<p>The menu — <b style="color:#D4A843">5 km walk · 5 km run · 10 km cycle · 1 km swim · 30 min HR session</b>. One activity today, or ${MISS_PENANCE_LABEL} on the Punishment Cycle at midnight IST.</p>
<p>The window is wide. The body chooses. The streak continues.</p>
<p style="font-size:12px;color:rgba(240,234,216,0.5);margin-top:28px">— Sent at 04:30 IST by the system you built.</p>`,
    'MORNING REMINDER')
  await _sendEmail(`[FL] Day ${String(dn).padStart(3, '0')}. A new day. Pick one.`, html, `Day ${dn}. Pick one from the menu. Or ${MISS_PENANCE_LABEL}. — firstlight.live`)
  return { sent: 'morning', day: dn }
}

async function emailStreakUpdate() {
  if (_isGapDay()) {
    const note = _gapDayNote()
    await _sendEmail(note.subject, note.html, note.text)
    return { sent: 'rest-note', day: null }
  }
  const dn = _daysSinceStart()
  const stats = await _todayRunStats()
  if (stats) {
    const html = _emailShell(`Day ${String(dn).padStart(3, '0')} · alive.`,
      `<p style="font-size:18px;font-style:italic;color:rgba(240,234,216,0.85);margin:0 0 24px">Still holding the line.</p>
<table cellpadding="12" cellspacing="0" style="width:100%;border-collapse:collapse;font-family:'Courier New',monospace">
<tr><td style="border-bottom:1px dashed rgba(212,168,67,0.2);color:rgba(212,168,67,0.6);font-size:12px">DISTANCE</td><td style="border-bottom:1px dashed rgba(212,168,67,0.2);text-align:right;font-size:20px;color:#F0EAD8">${stats.km} KM</td></tr>
<tr><td style="border-bottom:1px dashed rgba(212,168,67,0.2);color:rgba(212,168,67,0.6);font-size:12px">DURATION</td><td style="border-bottom:1px dashed rgba(212,168,67,0.2);text-align:right;font-size:20px;color:#F0EAD8">${stats.min} MIN</td></tr>
<tr><td style="border-bottom:1px dashed rgba(212,168,67,0.2);color:rgba(212,168,67,0.6);font-size:12px">PACE</td><td style="border-bottom:1px dashed rgba(212,168,67,0.2);text-align:right;font-size:20px;color:#F0EAD8">${stats.pace} /KM</td></tr>
<tr><td style="border-bottom:1px dashed rgba(212,168,67,0.2);color:rgba(212,168,67,0.6);font-size:12px">START</td><td style="border-bottom:1px dashed rgba(212,168,67,0.2);text-align:right;font-size:20px;color:#F0EAD8">${stats.start} IST</td></tr>
<tr><td style="color:rgba(212,168,67,0.6);font-size:12px">STATUS</td><td style="text-align:right;font-size:20px;color:#D4A843;font-weight:700">DEFENDED</td></tr>
</table>
<p style="font-size:12px;color:rgba(240,234,216,0.5);margin-top:28px">— Sent at 06:30 IST after deadline check.</p>`,
      'STREAK UPDATE')
    await _sendEmail(`[FL] Day ${String(dn).padStart(3, '0')} · streak alive · ${stats.km} km`, html, `Day ${dn} · ${stats.km} km · ${stats.min} min · DEFENDED — firstlight.live`)
    return { sent: 'streak-alive', day: dn, ...stats }
  } else {
    const html = _emailShell(`Day ${String(dn).padStart(3, '0')} · early check-in`,
      `<p style="font-size:18px;font-style:italic;color:rgba(240,234,216,0.85);margin:0 0 18px">No qualifying activity yet this morning.</p>
<p>Plenty of time — the menu stays open until <b>23:30 IST</b>. Walk 5km, cycle 10km, swim 1km, or 30 min HR session. Any one qualifies.</p>
<p style="font-size:12px;color:rgba(240,234,216,0.5);margin-top:28px">— Sent at 06:30 IST. The 21:00 nudge fires if still nothing logged. Verdict at 23:30 IST.</p>`,
      'MORNING CHECK-IN')
    await _sendEmail(`[FL] Day ${String(dn).padStart(3, '0')} · pick one from the menu`, html, `Day ${dn} · no activity yet · menu open until 23:30 IST — firstlight.live`)
    return { sent: 'streak-morning-checkin', day: dn }
  }
}

async function emailPublishConfirm() {
  const dn = _daysSinceStart()
  const stats = await _todayRunStats()
  const html = _emailShell(`Day ${String(dn).padStart(3, '0')} · posted.`,
    `<p style="font-size:18px;font-style:italic;color:rgba(240,234,216,0.85);margin:0 0 18px">The grid grows by one.</p>
<p>Today's post is live on <a href="https://www.instagram.com/firstlightlive/" style="color:#D4A843">@firstlightlive</a>.</p>
${stats ? `<p style="font-family:'Courier New',monospace;font-size:14px;color:rgba(212,168,67,0.85);margin-top:24px">${stats.km} KM &nbsp;·&nbsp; ${stats.min} MIN &nbsp;·&nbsp; ${stats.start} IST</p>` : ''}
<p style="margin-top:24px">Streak rolls forward. Day ${dn} · clean.</p>
<p style="font-size:12px;color:rgba(240,234,216,0.5);margin-top:28px">— Triggered when you tap PUBLISH from firstlight.live/app.</p>`,
    'PUBLISH CONFIRMATION')
  await _sendEmail(`[FL] Day ${String(dn).padStart(3, '0')} · posted`, html, `Day ${dn} posted to @firstlightlive — firstlight.live`)
  return { sent: 'publish-confirm', day: dn }
}

async function emailEodReport() {
  if (_isGapDay()) return { sent: false, reason: 'gap rest day — no day-numbered email before Day 1', day: null }
  const dn = _daysSinceStart()
  const stats = await _todayRunStats()
  const html = _emailShell(`Day ${String(dn).padStart(3, '0')} · 90 min to verdict.`,
    `<p style="font-size:18px;font-style:italic;color:rgba(240,234,216,0.85);margin:0 0 24px">Window closes at 23:30 IST.</p>
${stats ? `<table cellpadding="12" cellspacing="0" style="width:100%;border-collapse:collapse;font-family:'Courier New',monospace">
<tr><td style="border-bottom:1px dashed rgba(212,168,67,0.2);color:rgba(212,168,67,0.6);font-size:12px">TODAY</td><td style="border-bottom:1px dashed rgba(212,168,67,0.2);text-align:right;font-size:18px;color:#F0EAD8">${stats.km} KM · ${stats.min} MIN</td></tr>
<tr><td style="color:rgba(212,168,67,0.6);font-size:12px">STREAK</td><td style="text-align:right;font-size:18px;color:#F0EAD8">DAY ${dn}</td></tr>
</table>` : `<p>No qualifying activity logged yet. Menu: 5 km walk / 5 km run / 10 km cycle / 1 km swim / 30 min HR session. Window closes in 90 minutes.</p>`}
<p style="margin-top:28px;font-family:Georgia,serif;font-size:22px;font-style:italic;color:#D4A843">${stats ? 'Verdict at 23:30 IST — system will publish + log.' : `Last call. Move now, or ${MISS_PENANCE_LABEL} at midnight.`}</p>
<p style="font-size:12px;color:rgba(240,234,216,0.5);margin-top:28px">— Sent at 22:00 IST. Engine verdict fires at 23:30.</p>`,
    'END-OF-DAY')
  await _sendEmail(`[FL] Day ${String(dn).padStart(3, '0')} · 90 min to verdict`, html, `Day ${dn} · 90 min till verdict — firstlight.live`)
  return { sent: 'eod', day: dn }
}

// ══════════════════════════════════════════════════════════════════
// RESET / Clarity Protocol — pre-noon reminder (fires BEFORE the noon
// auto-relapse sweep, reset_noon_sweep()). Emails ONLY if a day is
// genuinely at risk: unconfirmed clean AND no relapse logged. Stage
// (early / final) is derived from the IST hour so one action serves both
// cron slots (09:00 early nudge, 11:30 last call). Goes to the operator.
// ══════════════════════════════════════════════════════════════════
function _istDateStr(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}
function _istHour(): number {
  return parseInt(new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false }).slice(0, 2), 10)
}
async function emailResetReminder() {
  const { data: stRows } = await supaAdmin.from('reset_state').select('start_date').eq('id', 'me').limit(1)
  const start = ((stRows && stRows[0] && stRows[0].start_date) as string) || _istDateStr(0)
  const today = _istDateStr(0)
  const yesterday = _istDateStr(-1)
  if (yesterday < start) return { sent: false, reason: 'before protocol start', today }

  const { data: dayRows } = await supaAdmin.from('reset_days').select('d,clean').gte('d', start).lte('d', yesterday)
  const { data: relRows } = await supaAdmin.from('reset_relapses').select('occurred_on').gte('occurred_on', start).lte('occurred_on', yesterday)
  const cleanSet = new Set<string>(((dayRows || []) as Array<{ d: string; clean: boolean }>).filter(r => r.clean).map(r => r.d))
  const relSet = new Set<string>(((relRows || []) as Array<{ occurred_on: string }>).map(r => r.occurred_on))

  const atRisk: string[] = []
  let d = start, guard = 0
  while (d <= yesterday && guard < 800) {
    if (!cleanSet.has(d) && !relSet.has(d)) atRisk.push(d)
    d = new Date(new Date(d + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10)
    guard++
  }
  if (atRisk.length === 0) return { sent: false, reason: 'nothing at risk — all days confirmed or logged', today }

  const final = _istHour() >= 11
  const imminent = atRisk[atRisk.length - 1]   // closest to today — its deadline is noon today
  const older = atRisk.length - 1
  const when = final ? 'in ~30 minutes (12:00 noon IST)' : 'at 12:00 noon IST today'
  const subject = final
    ? `[RESET] ⚠ Noon deadline — confirm ${imminent} clean now`
    : `[RESET] Confirm ${imminent} clean before noon`
  const olderLine = older > 0
    ? `<p style="color:#FF8A8A;font-size:13px;margin:0 0 12px">Plus ${older} earlier day${older > 1 ? 's' : ''} still unconfirmed — already overdue.</p>` : ''

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#0A0C10;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0C10"><tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background:#12151C;border:1px solid rgba(185,140,255,0.25);border-radius:14px;margin:28px 0">
<tr><td style="padding:24px 30px 8px">
  <div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:4px;color:#B98CFF">◆ RESET · CLARITY PROTOCOL</div>
</td></tr>
<tr><td style="padding:8px 30px 26px;color:#E8EDF2">
  <h1 style="margin:0 0 12px;font-size:26px;color:#E8EDF2;font-weight:700">One tap keeps your streak.</h1>
  <p style="font-size:15px;line-height:1.6;color:#B8C2CF;margin:0 0 14px"><b style="color:#fff">${imminent}</b> isn't confirmed clean yet. The system auto-logs it as a relapse ${when} unless you confirm.</p>
  ${olderLine}
  <div style="background:rgba(255,82,82,0.08);border:1px solid rgba(255,82,82,0.28);border-radius:10px;padding:14px 16px;margin:14px 0;font-family:'Courier New',monospace;font-size:13px;color:#FF9A9A;line-height:1.8">If it fires:<br>• streak → <b style="color:#fff">0</b><br>• <b style="color:#fff">50 km walk + 200 km cycle</b> in 7 days<br>• one task starts <b style="color:#fff">tonight</b></div>
  <a href="https://firstlight.live/reset.html" style="display:block;text-align:center;background:#00E676;color:#0A0C10;font-weight:700;font-family:'Courier New',monospace;letter-spacing:1px;text-decoration:none;padding:15px;border-radius:10px;font-size:14px">CONFIRM CLEAN → reset.html</a>
  <p style="font-size:13px;line-height:1.6;color:#8A94A3;margin:18px 0 0">If you did slip — that's data, not failure. Log it honestly on the page; the story is what breaks the pattern.</p>
  <p style="font-size:11px;color:#5A6675;margin:16px 0 0;font-family:'Courier New',monospace">— ${final ? 'Final call' : 'Reminder'} · sent before the noon sweep · private</p>
</td></tr>
</table></td></tr></table></body></html>`
  const text = `RESET — ${imminent} isn't confirmed clean. Auto-logs as a relapse ${when} (streak → 0, 50 km walk + 200 km cycle in 7 days, one starts tonight). Confirm: https://firstlight.live/reset.html`

  await _sendEmail(subject, html, text)
  return { sent: true, stage: final ? 'final' : 'early', imminent, atRisk: atRisk.length }
}

async function emailWeeklyRecap() {
  if (_isGapDay()) return { sent: false, reason: 'gap rest day — no day-numbered email before Day 1', day: null }
  const dn = _daysSinceStart()
  const today = new Date()
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000).toISOString().slice(0, 10)

  // Pull ALL Strava activities for the week (multi-sport, not just runs)
  const { data: actsData } = await supaAdmin.from('strava_activities').select('distance,moving_time,start_date_local,type')
    .gte('start_date_local', sevenDaysAgo + 'T00:00:00')
  const acts = actsData || []
  const totalKm = Math.round(acts.reduce((s: number, r: { distance?: number }) => s + ((r.distance || 0) / 1000), 0) * 10) / 10
  const totalMin = Math.round(acts.reduce((s: number, r: { moving_time?: number }) => s + ((r.moving_time || 0) / 60), 0))

  // Pull verdict counts from proof_archive
  const { data: verdictData } = await supaAdmin.from('proof_archive').select('verdict,date').gte('date', sevenDaysAgo).lte('date', today.toISOString().slice(0, 10))
  const winCount = (verdictData || []).filter(v => v.verdict === 'WIN').length
  const missCount = (verdictData || []).filter(v => v.verdict === 'MISS').length
  const donated = missCount * STAKE_AMOUNT

  const week = Math.ceil(dn / 7)
  const html = _emailShell(`Week ${String(week).padStart(2, '0')} · ${winCount}/7 days held.`,
    `<p style="font-size:18px;font-style:italic;color:rgba(240,234,216,0.85);margin:0 0 24px">Seven days. The data.</p>
<table cellpadding="12" cellspacing="0" style="width:100%;border-collapse:collapse;font-family:'Courier New',monospace">
<tr><td style="border-bottom:1px dashed rgba(212,168,67,0.2);color:rgba(212,168,67,0.6);font-size:12px">DAYS HELD</td><td style="border-bottom:1px dashed rgba(212,168,67,0.2);text-align:right;font-size:22px;color:#F0EAD8">${winCount} / 7</td></tr>
<tr><td style="border-bottom:1px dashed rgba(212,168,67,0.2);color:rgba(212,168,67,0.6);font-size:12px">DAYS MISSED</td><td style="border-bottom:1px dashed rgba(212,168,67,0.2);text-align:right;font-size:22px;color:#FF6B6B">${missCount}</td></tr>
<tr><td style="border-bottom:1px dashed rgba(212,168,67,0.2);color:rgba(212,168,67,0.6);font-size:12px">DISTANCE</td><td style="border-bottom:1px dashed rgba(212,168,67,0.2);text-align:right;font-size:22px;color:#D4A843">${totalKm} KM</td></tr>
<tr><td style="border-bottom:1px dashed rgba(212,168,67,0.2);color:rgba(212,168,67,0.6);font-size:12px">TIME</td><td style="border-bottom:1px dashed rgba(212,168,67,0.2);text-align:right;font-size:22px;color:#F0EAD8">${totalMin} MIN</td></tr>
<tr><td style="border-bottom:1px dashed rgba(212,168,67,0.2);color:rgba(212,168,67,0.6);font-size:12px">DONATED</td><td style="border-bottom:1px dashed rgba(212,168,67,0.2);text-align:right;font-size:22px;color:#D4A843">₹${donated.toLocaleString('en-IN')} → AKSHAYA PATRA</td></tr>
<tr><td style="color:rgba(212,168,67,0.6);font-size:12px">STREAK</td><td style="text-align:right;font-size:22px;color:#F0EAD8">DAY ${dn}</td></tr>
</table>
<p style="margin-top:24px"><a href="https://firstlight.live" style="color:#D4A843">View on firstlight.live →</a></p>
<p style="font-size:12px;color:rgba(240,234,216,0.5);margin-top:28px">— Sent every Sunday at 07:00 IST.</p>`,
    'WEEKLY RECAP')
  await _sendEmail(`[FL] Week ${String(week).padStart(2, '0')} · ${winCount}/7 days held`, html, `Week ${week}: ${winCount}/7 days held, ${missCount} missed, ₹${donated} donated — firstlight.live`)
  return { sent: 'weekly', week, day: dn, totalKm, winCount, missCount, donated, totalMin }
}

// ═══════════════════════════════════════════
// PREFLIGHT — one call answers "is it Instagram or is it us?"
// ═══════════════════════════════════════════
async function preflight() {
  const checks: Record<string, { ok: boolean; detail: string }> = {}

  let igToken = ''
  try {
    igToken = (await getSecret('ig_access')) || ''
    checks.ig_token = igToken ? { ok: true, detail: 'IG token present' } : { ok: false, detail: 'No IG token in secrets table' }
  } catch (e) { checks.ig_token = { ok: false, detail: (e as Error).message } }

  if (igToken) {
    try {
      const r = await fetch(`https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}?fields=id,username&access_token=${encodeURIComponent(igToken)}`)
      const d = await r.json()
      checks.ig_account = d.error
        ? { ok: false, detail: `${d.error.code || ''} ${d.error.error_user_msg || d.error.message}`.trim() }
        : { ok: true, detail: '@' + d.username }
    } catch (e) { checks.ig_account = { ok: false, detail: (e as Error).message } }

    try {
      const r = await fetch(`https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}/content_publishing_limit?fields=quota_usage,config&access_token=${encodeURIComponent(igToken)}`)
      const d = await r.json()
      if (d.error) {
        checks.ig_quota = { ok: false, detail: `${d.error.code || ''} ${d.error.error_user_msg || d.error.message}`.trim() }
      } else {
        const usage = d.data?.[0]?.quota_usage ?? 0
        const total = d.data?.[0]?.config?.quota_total ?? 50
        checks.ig_quota = { ok: usage < total, detail: `${usage}/${total} API posts used in 24h` }
      }
    } catch (e) { checks.ig_quota = { ok: false, detail: (e as Error).message } }
  }

  try {
    const testBytes = new TextEncoder().encode('preflight ' + new Date().toISOString())
    const { error } = await supaAdmin.storage.from('media').upload('instagram/preflight_check.txt', testBytes, { contentType: 'text/plain', upsert: true })
    if (error) throw new Error(error.message)
    const pub = await fetch(`${SUPA_URL}/storage/v1/object/public/media/instagram/preflight_check.txt`)
    checks.storage = pub.ok
      ? { ok: true, detail: 'Storage write + public read OK' }
      : { ok: false, detail: `Public URL returned ${pub.status} — IG cannot fetch media` }
  } catch (e) { checks.storage = { ok: false, detail: 'Storage write failed: ' + (e as Error).message } }

  const ok = Object.values(checks).every(c => c.ok)
  return { success: true, ok, checks, checked_at: new Date().toISOString() }
}

// ═══════════════════════════════════════════
// ADMIN READ/WRITE PROXY — for locked tables
// ═══════════════════════════════════════════
async function adminRead(body: Record<string, unknown>) {
  const { table, select = '*', eq, limit = 100, order } = body as any
  if (!table) throw new Error('Missing table name')

  let q = supaAdmin.from(table).select(select)
  if (eq) {
    const [col, val] = (eq as string).split(':')
    q = q.eq(col, val)
  }
  if (order) q = q.order(order.split(':')[0], { ascending: order.includes('asc') })
  if (limit) q = q.limit(Math.min(limit, 1000))

  const { data, error } = await q
  if (error) throw error
  return { success: true, data }
}

async function adminWrite(body: Record<string, unknown>) {
  const { table, data, onConflict = 'id' } = body as any
  if (!table || !data) throw new Error('Missing table or data')
  // The legacy admin key is present in browser bundles. This generic proxy
  // must not bypass the owner-authenticated rules check-in or forge its debt.
  const rows = Array.isArray(data) ? data : [data]
  if (table === 'config' && rows.some((row: any) =>
    typeof row?.key === 'string' && row.key.startsWith('RULES_'))) {
    throw new Error('Rules records must use the owner-authenticated rules endpoint')
  }

  const { error } = await supaAdmin.from(table).upsert(data, { onConflict })
  if (error) throw error
  return { success: true, message: `Upserted into ${table}` }
}

async function rulesOwnerSession(req: Request): Promise<boolean> {
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') || '')?.[1]
  if (!token || token === SUPA_ANON_KEY) return false
  const { data, error } = await supaAdmin.auth.getUser(token)
  return !error && data.user?.email?.toLowerCase() === 'firstlightlive@gmail.com'
}

// ═══════════════════════════════════════════
// RITUAL SYNC — watchOS app endpoint (action=ritual-sync)
// Narrow, watch-key-gated read/write for rituals_log + daily_rituals +
// daily_checkin pct + weekend_log. See supabase/watch_ritual_sync.sql for the
// secret + weekend_log DDL. Server owns the date guard: rituals_log/weekend_log
// have NO history-lock trigger in prod (only updated_at triggers).
// ═══════════════════════════════════════════

const RITUAL_PERIODS = ['morning', 'midday', 'evening'] as const
type RitualPeriod = typeof RITUAL_PERIODS[number]

// Legacy rows are double-encoded (jsonb STRING containing array JSON) because
// the web client sent JSON.stringify(ids) as the column value. Normalize both
// shapes to a clean string[].
function _normalizeIds(raw: unknown): string[] {
  let v = raw
  for (let i = 0; i < 2 && typeof v === 'string'; i++) {
    try { v = JSON.parse(v) } catch (_e) { return [] }
  }
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string')
}

// IST clock + effective-day math — mirrors enforce_history_lock()
// (website/supabase_schema.sql:555-601): before 3:00 AM IST, yesterday is
// still the editable day.
function _istParts(): { dateStr: string; hour: number; iso: string } {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000)
  return {
    dateStr: ist.toISOString().slice(0, 10),
    hour: ist.getUTCHours(),
    iso: ist.toISOString().slice(0, 19)
  }
}
function _ritualDayWindow(): { calendarToday: string; effectiveToday: string; graceActive: boolean; nowIst: string } {
  const { dateStr, hour, iso } = _istParts()
  const graceActive = hour < 3
  let effectiveToday = dateStr
  if (graceActive) {
    const d = new Date(dateStr + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() - 1)
    effectiveToday = d.toISOString().slice(0, 10)
  }
  return { calendarToday: dateStr, effectiveToday, graceActive, nowIst: iso }
}

const RITUAL_ID_RE = /^[a-z0-9_]{1,64}$/
const WEEKEND_ID_RE = /^(sat|sun)_[a-z_]+$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

async function ritualSyncGet(date: string) {
  if (!DATE_RE.test(date)) return { status: 400, body: { error: 'BAD_DATE', detail: 'date must be YYYY-MM-DD' } }

  const [rl, wk, dc] = await Promise.all([
    supaAdmin.from('rituals_log').select('period,completed_ids,updated_at').eq('date', date),
    supaAdmin.from('weekend_log').select('completed_ids,updated_at').eq('date', date).maybeSingle(),
    supaAdmin.from('daily_checkin').select('morning_pct,midday_pct,evening_pct,sealed,sealed_at').eq('date', date).maybeSingle()
  ])
  if (rl.error) return { status: 500, body: { error: 'READ_FAILED', detail: rl.error.message } }

  const periods: Record<string, { completed_ids: string[]; updated_at: string | null }> = {}
  for (const p of RITUAL_PERIODS) periods[p] = { completed_ids: [], updated_at: null }
  for (const row of rl.data || []) {
    if ((RITUAL_PERIODS as readonly string[]).includes(row.period)) {
      periods[row.period] = { completed_ids: _normalizeIds(row.completed_ids), updated_at: row.updated_at || null }
    }
  }
  // weekend_log read is best-effort: table may not exist until watch_ritual_sync.sql runs
  const weekend = (wk && !wk.error && wk.data)
    ? { completed_ids: _normalizeIds(wk.data.completed_ids), updated_at: wk.data.updated_at || null }
    : { completed_ids: [], updated_at: null }

  const win = _ritualDayWindow()
  return {
    status: 200,
    body: {
      success: true, date, periods,
      weekend_tasks: weekend,
      checkin: (dc && !dc.error && dc.data) ? dc.data : { morning_pct: null, midday_pct: null, evening_pct: null, sealed: false, sealed_at: null },
      server: {
        now_ist: win.nowIst, effective_today: win.effectiveToday, grace_active: win.graceActive,
        writable: date >= win.effectiveToday && date <= win.calendarToday
      }
    }
  }
}

async function ritualSyncPost(body: Record<string, unknown>) {
  const date = String(body.date || '')
  const period = String(body.period || '')
  const completed = Array.isArray(body.completed_ids) ? body.completed_ids : []
  const removed = Array.isArray(body.removed_ids) ? body.removed_ids : []
  const totalActive = Number(body.total_active)

  // ── Validation ──
  if (!DATE_RE.test(date)) return { status: 400, body: { error: 'BAD_DATE', detail: 'date must be YYYY-MM-DD' } }
  const isWeekend = period === 'weekend'
  if (!isWeekend && !(RITUAL_PERIODS as readonly string[]).includes(period)) {
    return { status: 400, body: { error: 'BAD_PERIOD', detail: 'period must be morning|midday|evening|weekend' } }
  }
  if (completed.length > 200 || removed.length > 200) {
    return { status: 400, body: { error: 'TOO_MANY_IDS', detail: 'max 200 ids per array' } }
  }
  const idRe = isWeekend ? WEEKEND_ID_RE : RITUAL_ID_RE
  for (const id of [...completed, ...removed]) {
    if (typeof id !== 'string' || !idRe.test(id)) {
      return { status: 400, body: { error: 'BAD_ID', detail: `invalid id: ${String(id).slice(0, 80)}` } }
    }
  }
  if (!isWeekend && (!Number.isInteger(totalActive) || totalActive < 1 || totalActive > 100)) {
    return { status: 400, body: { error: 'BAD_TOTAL_ACTIVE', detail: 'total_active must be an integer 1-100' } }
  }

  // ── Date guard (server-owned; rituals_log/weekend_log have no trigger) ──
  const win = _ritualDayWindow()
  if (date > win.calendarToday) {
    return { status: 400, body: { error: 'FUTURE_DATE', detail: `date ${date} is after IST today ${win.calendarToday}`, server: { effective_today: win.effectiveToday, grace_active: win.graceActive } } }
  }
  if (date < win.effectiveToday) {
    return { status: 409, body: { error: 'HISTORY_LOCKED', detail: `date ${date} is beyond the 3:00 AM IST grace window`, effective_today: win.effectiveToday, grace_until: '03:00 IST', server: { grace_active: win.graceActive } } }
  }

  const warnings: string[] = []

  // ── Weekend path: merge → weekend_log only ──
  if (isWeekend) {
    const { data: existing, error: rErr } = await supaAdmin.from('weekend_log').select('completed_ids').eq('date', date).maybeSingle()
    if (rErr) {
      await _watchSyncHealthBump(`weekend_log read: ${rErr.message}`)
      return { status: 500, body: { error: 'WRITE_FAILED', detail: rErr.message } }
    }
    const server = _normalizeIds(existing?.completed_ids)
    const removedSet = new Set(removed as string[])
    const merged = [...new Set([...server.filter(id => !removedSet.has(id)), ...(completed as string[])])]
    const { error: wErr } = await supaAdmin.from('weekend_log')
      .upsert({ date, completed_ids: merged, updated_at: new Date().toISOString() }, { onConflict: 'date' })
    if (wErr) {
      await _watchSyncHealthBump(`weekend_log write: ${wErr.message}`)
      const locked = /HISTORY LOCKED/i.test(wErr.message)
      return locked
        ? { status: 409, body: { error: 'HISTORY_LOCKED', detail: wErr.message } }
        : { status: 500, body: { error: 'WRITE_FAILED', detail: wErr.message } }
    }
    return {
      status: 200,
      body: {
        success: true, date, period, merged_ids: merged, merged_count: merged.length,
        completion_pct: null, sealed: false, wrote: { weekend_log: true }, warnings,
        updated_at: new Date().toISOString(),
        server: { effective_today: win.effectiveToday, grace_active: win.graceActive }
      }
    }
  }

  // ── Period path: rituals_log (authoritative) → daily_rituals + daily_checkin (mirrors) ──
  const { data: existing, error: rErr } = await supaAdmin.from('rituals_log')
    .select('completed_ids').eq('date', date).eq('period', period).maybeSingle()
  if (rErr) {
    await _watchSyncHealthBump(`rituals_log read: ${rErr.message}`)
    return { status: 500, body: { error: 'WRITE_FAILED', detail: rErr.message } }
  }
  const server = _normalizeIds(existing?.completed_ids)
  const removedSet = new Set(removed as string[])
  // union merge: adds never lost; removals explicit. Writing a real jsonb
  // array also heals this row's legacy double-encoding.
  const merged = [...new Set([...server.filter(id => !removedSet.has(id)), ...(completed as string[])])]

  const { error: wErr } = await supaAdmin.from('rituals_log')
    .upsert({ date, period, completed_ids: merged, updated_at: new Date().toISOString() }, { onConflict: 'date,period' })
  if (wErr) {
    await _watchSyncHealthBump(`rituals_log write: ${wErr.message}`)
    return { status: 500, body: { error: 'WRITE_FAILED', detail: wErr.message } }
  }

  const pct = Math.min(100, Math.round((merged.length / totalActive) * 100))

  // Heartbeat. Lets a health check tell "the watch is calling and succeeding"
  // apart from "the watch has not called at all" — identical symptoms if the
  // only signal is how fresh rituals_log happens to be.
  await _watchSyncOk()

  // Mirror 1: legacy daily_rituals (best-effort; has history-lock trigger — map to warning)
  const wrote = { rituals_log: true, daily_rituals: false, daily_checkin: false }
  try {
    await supaUpsert('daily_rituals', {
      date, period, done_indices: merged, total_items: totalActive, completion_pct: pct
    }, 'date,period')
    wrote.daily_rituals = true
  } catch (e) {
    warnings.push(`daily_rituals mirror failed: ${(e as Error).message}`)
  }

  // Mirror 2: daily_checkin — COLUMN-SCOPED pct update only. Never whole-row
  // upsert (that pattern is what broke web sync); never touches sealed/journal.
  let sealed = false
  try {
    const pctCol = `${period}_pct`
    const { data: dcRow, error: dcErr } = await supaAdmin.from('daily_checkin')
      .select('id,sealed').eq('date', date).maybeSingle()
    if (dcErr) throw new Error(dcErr.message)
    if (dcRow) {
      sealed = !!dcRow.sealed
      const { error } = await supaAdmin.from('daily_checkin').update({ [pctCol]: pct }).eq('date', date)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supaAdmin.from('daily_checkin').insert({ date, [pctCol]: pct })
      if (error) {
        if (error.code === '23505') { // insert race — row appeared; update instead
          const { error: e2 } = await supaAdmin.from('daily_checkin').update({ [pctCol]: pct }).eq('date', date)
          if (e2) throw new Error(e2.message)
        } else throw new Error(error.message)
      }
    }
    wrote.daily_checkin = true
  } catch (e) {
    warnings.push(`daily_checkin pct update failed: ${(e as Error).message}`)
  }

  return {
    status: 200,
    body: {
      success: true, date, period, merged_ids: merged, merged_count: merged.length,
      completion_pct: pct, sealed, wrote, warnings,
      updated_at: new Date().toISOString(),
      server: { effective_today: win.effectiveToday, grace_active: win.graceActive }
    }
  }
}

// Failure telemetry: config-row counter + max one alert email per IST day at ≥3 errors.
// Last successful watch write, so silence has a recorded cause, not a guess.
async function _watchSyncOk() {
  try {
    await setSecret('WATCH_SYNC_HEALTH', JSON.stringify({
      date: _istParts().dateStr, errors: 0, alerted: false,
      last_ok: new Date().toISOString(),
    }))
  } catch (_e) { /* telemetry must never break sync */ }
}

async function _watchSyncHealthBump(detail: string) {
  try {
    const today = _istParts().dateStr
    const raw = await getSecret('WATCH_SYNC_HEALTH')
    let h: { date: string; errors: number; alerted: boolean; last_ok?: string; last_error?: string } =
      { date: today, errors: 0, alerted: false }
    let lastOk: string | undefined
    if (raw) {
      try {
        const p = JSON.parse(raw)
        lastOk = p.last_ok
        if (p.date === today) h = p
      } catch (_e) { /* reset */ }
    }
    if (lastOk) h.last_ok = lastOk    // a failure must not erase the last success
    h.last_error = detail.slice(0, 300)
    h.errors++
    if (h.errors >= 3 && !h.alerted) {
      h.alerted = true
      await sendAlert('Watch ritual-sync failing', `${h.errors} errors today. Latest: ${detail.slice(0, 300)}`)
    }
    await setSecret('WATCH_SYNC_HEALTH', JSON.stringify(h))
  } catch (_e) { /* telemetry must never break sync */ }
}

// ═══════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════
Deno.serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key, X-Webhook-Secret, X-Watch-Key, Authorization',
      }
    })
  }

  const url = new URL(req.url)
  const action = url.searchParams.get('action') || 'sync'
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }

  // Auth check — supports header OR URL param (pg_cron can't send custom headers reliably)
  const requestKey = req.headers.get('x-admin-key') || url.searchParams.get('admin_key') || ''
  const adminKey = await getSecret('admin_api_key')
  // The rules check-in is owner-only. The legacy admin key is embedded in old
  // clients, so it must not authorize a personal food declaration.
  const ownerRulesAction = action === 'rules-checkin' || action === 'rules-ledger' || action === 'publish-violation'
  const ownerAuthed = ownerRulesAction ? await rulesOwnerSession(req) : false
  const isAuthed = (adminKey && requestKey === adminKey) || ownerAuthed
  if (ownerRulesAction && !ownerAuthed) {
    return new Response(JSON.stringify({ error: 'Sign in as the owner to manage rules and violations.' }), { status: 401, headers })
  }

  // Health check — no auth needed
  if (action === 'health') {
    return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), { headers })
  }

  // Data deletion callback — Meta/Facebook compliance
  if (action === 'delete-user-data') {
    try {
      const body = await req.json()
      console.log('Data deletion request received:', body)
      return new Response(JSON.stringify({
        url: 'https://firstlight.live/privacy.html',
        confirmation_code: body.signed_request ? 'acknowledged' : 'error'
      }), { headers })
    } catch (_e) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400, headers })
    }
  }

  // ── Strava OAuth code exchange (called by /strava-connect.html after authorize) ──
  // GET ?action=strava-connect&code=XXX — swaps the one-time authorize code for
  // access+refresh tokens using the stored client_id/secret, stores them, returns
  // the athlete. No admin key (the code itself is the one-time secret); anon JWT
  // (platform gate) is enough. Overwrites the old banned app's tokens.
  if (action === 'strava-connect') {
    const code = url.searchParams.get('code')
    if (!code) return new Response(JSON.stringify({ success: false, error: 'missing ?code=' }), { status: 400, headers })
    const clientId = await getSecret('strava_client_id')
    const clientSecret = await getSecret('strava_client_secret')
    try {
      const resp = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `client_id=${clientId}&client_secret=${clientSecret}&code=${encodeURIComponent(code)}&grant_type=authorization_code`
      })
      const data = await resp.json()
      if (data.access_token) {
        await setSecret('strava_access', data.access_token)
        await setSecret('strava_refresh', data.refresh_token)
        return new Response(JSON.stringify({ success: true, athlete: data.athlete?.firstname || 'you', athleteId: data.athlete?.id }), { headers })
      }
      return new Response(JSON.stringify({ success: false, error: data.message || 'exchange failed', detail: data }), { status: 400, headers })
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: (e as Error).message }), { status: 500, headers })
    }
  }

  // ── Instagram OAuth code exchange (called by /ig-connect.html after login) ──
  // GET ?action=ig-connect&code=XXX — the ONLY way to mint a fresh 60-day token.
  // Facebook will not let a server extend an already-long-lived token, so when the
  // 60 days run out a human has to log in once; this endpoint turns that into two
  // clicks. Same auth posture as strava-connect: the one-time code IS the secret.
  if (action === 'ig-connect') {
    const code = url.searchParams.get('code')
    if (!code) return new Response(JSON.stringify({ success: false, error: 'missing ?code=' }), { status: 400, headers })
    const appId = await getSecret('ig_app_id')
    const appSecret = await getSecret('ig_app_secret')
    if (!appId || !appSecret) return new Response(JSON.stringify({ success: false, error: 'ig_app_id/ig_app_secret missing from secrets' }), { status: 500, headers })
    try {
      // 1 · authorization code → short-lived user token (~2h)
      const shortResp = await fetch(
        `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}` +
        `&redirect_uri=${encodeURIComponent(IG_REDIRECT_URI)}&code=${encodeURIComponent(code)}`
      ).then(r => r.json())
      if (!shortResp.access_token) {
        return new Response(JSON.stringify({ success: false, error: shortResp.error?.message || 'code exchange failed', detail: shortResp }), { status: 400, headers })
      }

      // 2 · short-lived → long-lived (60d). This step only extends when the input is
      //     short-lived, which is exactly the case here — that's why re-auth works
      //     and the nightly self-refresh doesn't.
      const longResp = await fetch(
        `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token` +
        `&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortResp.access_token}`
      ).then(r => r.json())
      let finalToken = longResp.access_token || shortResp.access_token

      // 2b · promote to the PAGE token, which never expires — so this login is the
      //      last one ever needed. Falls back to the 60-day user token on failure.
      let promotedToPage = false
      const pageConv = await derivePermanentPageToken(finalToken, appId, appSecret, [])
      if (pageConv) { finalToken = pageConv.token; promotedToPage = true }

      // 3 · confirm what we actually got before overwriting a working secret
      const dbg = await fetch(
        `https://graph.facebook.com/v21.0/debug_token?input_token=${finalToken}&access_token=${appId}|${appSecret}`
      ).then(r => r.json())
      const expiresAt = dbg?.data?.expires_at || 0
      const daysLeft = dbg?.data?.is_valid && expiresAt === 0
        ? NEVER_EXPIRES_DAYS
        : Math.floor((expiresAt - Date.now() / 1000) / 86400)
      const scopes: string[] = dbg?.data?.scopes || []
      if (!dbg?.data?.is_valid) {
        return new Response(JSON.stringify({ success: false, error: 'exchanged token is not valid', detail: dbg?.data?.error || dbg }), { status: 400, headers })
      }
      if (!scopes.includes('instagram_content_publish')) {
        return new Response(JSON.stringify({ success: false, error: 'token is missing instagram_content_publish — re-run the login and accept every permission', scopes }), { status: 400, headers })
      }

      // 4 · prove the token can actually see the IG account before we commit it
      const acct = await fetch(
        `https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}?fields=id,username&access_token=${encodeURIComponent(finalToken)}`
      ).then(r => r.json())
      if (acct.error) {
        return new Response(JSON.stringify({ success: false, error: `token cannot reach IG account: ${acct.error.message}`, detail: acct.error }), { status: 400, headers })
      }

      await setSecret('ig_access', finalToken)
      await supaUpsert('config', {
        key: 'IG_TOKEN_HEALTH',
        value: JSON.stringify({ valid: true, days_left: daysLeft, never_expires: daysLeft === NEVER_EXPIRES_DAYS, checked_at: new Date().toISOString(), expires_at: expiresAt })
      }, 'key')
      return new Response(JSON.stringify({ success: true, username: acct.username, days_left: daysLeft, never_expires: daysLeft === NEVER_EXPIRES_DAYS, promoted_to_page_token: promotedToPage }), { headers })
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: (e as Error).message }), { status: 500, headers })
    }
  }

  // ── Store a manually-issued IG token (admin only) ──────────────────────────
  // POST ?action=ig-store-token  { "token": "..." }
  // Two jobs:
  //   · Business Manager System User tokens (never expire, so they never arrive via
  //     an OAuth redirect) — stored as-is.
  //   · A short-lived token pasted straight out of Graph API Explorer — auto-upgraded
  //     to a 60-day long-lived one first. Short→long IS extendable, unlike long→long,
  //     so this is the one exchange that actually buys time.
  // Validates scope + account reach before storing, so a bad paste can't take
  // publishing down — the existing secret survives every rejection path below.
  if (action === 'ig-store-token') {
    if (!isAuthed) return new Response(JSON.stringify({ success: false, error: 'unauthorized' }), { status: 401, headers })
    try {
      const body = await req.json()
      let token = String(body.token || '').trim()
      if (!token) return new Response(JSON.stringify({ success: false, error: 'missing token' }), { status: 400, headers })
      const appId = await getSecret('ig_app_id')
      const appSecret = await getSecret('ig_app_secret')
      const inspect = (t: string) => fetch(
        `https://graph.facebook.com/v21.0/debug_token?input_token=${t}&access_token=${appId}|${appSecret}`
      ).then(r => r.json())

      let dbg = await inspect(token)
      if (!dbg?.data?.is_valid) {
        return new Response(JSON.stringify({ success: false, error: 'token is not valid', detail: dbg?.data?.error || dbg }), { status: 400, headers })
      }

      // Short-lived (< 50d of life)? Upgrade to the full 60 days before storing.
      let upgraded = false
      const initialExpiry = dbg.data.expires_at || 0
      const initialDays = initialExpiry === 0 ? NEVER_EXPIRES_DAYS : Math.floor((initialExpiry - Date.now() / 1000) / 86400)
      if (initialDays < 50) {
        const long = await fetch(
          `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token` +
          `&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${token}`
        ).then(r => r.json())
        if (long.access_token) {
          const longDbg = await inspect(long.access_token)
          const longExpiry = longDbg?.data?.expires_at || 0
          const longDays = longExpiry === 0 ? NEVER_EXPIRES_DAYS : Math.floor((longExpiry - Date.now() / 1000) / 86400)
          if (longDbg?.data?.is_valid && longDays > initialDays) {
            token = long.access_token
            dbg = longDbg
            upgraded = true
          }
        }
      }

      const scopes: string[] = dbg?.data?.scopes || []
      if (!scopes.includes('instagram_content_publish')) {
        return new Response(JSON.stringify({ success: false, error: 'token is missing instagram_content_publish', scopes }), { status: 400, headers })
      }

      // Promote to the never-expiring PAGE token so this is the LAST time a token is
      // ever pasted in. Best-effort: if it can't be derived, the validated user token
      // still gets stored and the nightly sync retries the promotion.
      let permanent = false
      const conv = await derivePermanentPageToken(token, appId || '', appSecret || '', [])
      if (conv) { token = conv.token; dbg = await inspect(token); permanent = true }

      const acct = await fetch(
        `https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}?fields=id,username&access_token=${encodeURIComponent(token)}`
      ).then(r => r.json())
      if (acct.error) {
        return new Response(JSON.stringify({ success: false, error: `token cannot reach IG account: ${acct.error.message}` }), { status: 400, headers })
      }
      const expiresAt = dbg.data.expires_at || 0
      const daysLeft = expiresAt === 0 ? NEVER_EXPIRES_DAYS : Math.floor((expiresAt - Date.now() / 1000) / 86400)
      await setSecret('ig_access', token)
      await supaUpsert('config', {
        key: 'IG_TOKEN_HEALTH',
        value: JSON.stringify({ valid: true, days_left: daysLeft, never_expires: expiresAt === 0, checked_at: new Date().toISOString(), expires_at: expiresAt })
      }, 'key')
      return new Response(JSON.stringify({ success: true, username: acct.username, days_left: daysLeft, never_expires: expiresAt === 0, upgraded, promoted_to_page_token: permanent, token_type: dbg.data.type }), { headers })
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: (e as Error).message }), { status: 500, headers })
    }
  }

  // Health ingest — uses its own secret. Routes on EITHER ?action=health-ingest
  // OR the mere presence of the x-webhook-secret header, so clients (e.g. Health
  // Auto Export) that drop/mangle the URL query string still reach this handler
  // by sending the secret header alone against the bare function URL.
  if (action === 'health-ingest' || req.headers.get('x-webhook-secret')) {
    const webhookSecret = await getSecret('health_webhook_secret')
    const provided = req.headers.get('x-webhook-secret') || ''
    if (webhookSecret && provided !== webhookSecret) {
      return new Response(JSON.stringify({ error: 'Invalid webhook secret' }), { status: 401, headers })
    }
    try {
      const body = await req.json()
      const result = await healthIngest(body)
      return new Response(JSON.stringify(result), { headers })
    } catch (e) {
      return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers })
    }
  }

  // Ritual sync — watchOS app endpoint, uses its own narrow secret.
  // Header only (no URL-param fallback — keeps the key out of edge logs).
  // A valid admin key is accepted as a debug superset.
  if (action === 'ritual-sync') {
    const watchKey = await getSecret('watch_api_key')
    const providedWatch = req.headers.get('x-watch-key') || ''
    // supabase/watch_ritual_sync.sql ships '<32-hex>' as a literal placeholder.
    // Run unedited, the secret IS that string and every watch call 403s —
    // indistinguishable from a wrong key unless we name it.
    const keyUnset = !watchKey || watchKey.trim() === '' ||
                     /^<.*>$/.test(watchKey.trim()) || watchKey.trim().length < 16
    const watchAuthed = (!keyUnset && providedWatch === watchKey) || isAuthed
    if (!watchAuthed) {
      // TELEMETRY ON AUTH FAILURE. This used to return 403 with no bump and no
      // alert, so a watch with a stale key — or a server whose key was never
      // configured — failed silently for as long as nobody happened to look.
      // Silence is the dangerous failure: rituals_log just stops growing and
      // nothing says why. Three of these in a day now raise the email alert.
      const why = keyUnset
        ? 'watch_api_key secret is unset or still the <32-hex> placeholder — run supabase/watch_ritual_sync.sql with a real key'
        : (providedWatch ? 'x-watch-key did not match the stored secret (stale key on the watch?)'
                         : 'request carried no x-watch-key header')
      await _watchSyncHealthBump(`auth: ${why}`)
      return new Response(JSON.stringify({
        error: 'Unauthorized — missing or invalid API key',
        reason: keyUnset ? 'WATCH_KEY_NOT_CONFIGURED' : 'WATCH_KEY_MISMATCH',
        detail: why,
      }), { status: 403, headers })
    }
    try {
      if (req.method === 'GET') {
        const date = url.searchParams.get('date') || _ritualDayWindow().effectiveToday
        const result = await ritualSyncGet(date)
        return new Response(JSON.stringify(result.body), { status: result.status, headers })
      }
      const body = await req.json()
      const result = await ritualSyncPost(body)
      return new Response(JSON.stringify(result.body), { status: result.status, headers })
    } catch (e) {
      await _watchSyncHealthBump(`unhandled: ${(e as Error).message}`)
      return new Response(JSON.stringify({ error: 'WRITE_FAILED', detail: (e as Error).message }), { status: 500, headers })
    }
  }

  // All other actions require admin key
  if (!isAuthed) {
    return new Response(JSON.stringify({ error: 'Unauthorized — missing or invalid API key' }), { status: 403, headers })
  }

  // Admin read proxy — for locked tables
  if (action === 'admin-read') {
    try {
      const body = await req.json()
      const result = await adminRead(body)
      return new Response(JSON.stringify(result), { headers })
    } catch (e) {
      return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers })
    }
  }

  // Admin write proxy — for locked tables
  if (action === 'admin-write') {
    try {
      const body = await req.json()
      const result = await adminWrite(body)
      return new Response(JSON.stringify(result), { headers })
    } catch (e) {
      return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers })
    }
  }

  try {
    const log: string[] = []
    const startTime = Date.now()

    if (action === 'ig-proxy') {
      const body = await req.json()
      const result = await igProxy(body)
      return new Response(JSON.stringify(result), { headers })
    }

    if (action === 'server-publish') {
      const body = await req.json()
      const result = await serverPublish(body)
      return new Response(JSON.stringify(result), { headers })
    }

    // ── RULE-BROKEN PIPELINE — render slide + publish helpers ──
    // The slide shows the DATE (no day number), so it works on rest/gap days.
    // Anti-spam: captions carry identity + the honest record only — no links,
    // no handle, no ₹/charity language.
    const _renderRuleSlide = async (rule: string, km: number, note: string, date: string): Promise<string> => {
      const renderBase = (await getSecret('render_worker_base')) || 'https://firstlight.live'
      const resp = await fetch(`${renderBase}/api/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          chapterDay: chapterDay(new Date(`${date}T12:00:00+05:30`)),
          variant: 'RULE_BROKEN',
          orientation: 'post',
          payload: { violation: { rule, km, note } }
        })
      })
      const json = await resp.json().catch(() => ({})) as Record<string, unknown>
      const url = String(json.publicUrl || json.url || '')
      if (!url) throw new Error('render failed: ' + JSON.stringify(json))
      return url
    }
    const _publishRuleSlides = async (urls: string[], caption: string): Promise<{ media_id: string; permalink: string | null }> => {
      const multi = urls.length > 1
      const childIds: string[] = []
      for (const u of urls) {
        const params: Record<string, string> = { image_url: u }
        if (multi) params.is_carousel_item = 'true'
        else params.caption = caption
        const c = await igProxy({ endpoint: `${IG_ACCOUNT_ID}/media`, params }) as { id?: string }
        if (!c || !c.id) throw new Error('IG container failed: ' + JSON.stringify(c))
        childIds.push(c.id)
      }
      let containerId = childIds[0]
      if (multi) {
        const car = await igProxy({ endpoint: `${IG_ACCOUNT_ID}/media`, params: { media_type: 'CAROUSEL', children: childIds.join(','), caption } }) as { id?: string }
        if (!car || !car.id) throw new Error('IG carousel failed: ' + JSON.stringify(car))
        containerId = car.id
      }
      let status = ''
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 3000))
        const st = await igProxy({ endpoint: containerId, method: 'GET', params: { fields: 'status_code' } }) as { status_code?: string }
        status = String(st.status_code || '')
        if (status === 'FINISHED') break
        if (status === 'ERROR') throw new Error('IG rejected the media')
      }
      if (status !== 'FINISHED') throw new Error('IG container never finished: ' + status)
      const pub = await igProxy({ endpoint: `${IG_ACCOUNT_ID}/media_publish`, params: { creation_id: containerId } }) as { id?: string }
      if (!pub || !pub.id) throw new Error('IG publish failed: ' + JSON.stringify(pub))
      const perm = await igProxy({ endpoint: pub.id, method: 'GET', params: { fields: 'permalink' } }) as { permalink?: string }
      return { media_id: pub.id, permalink: perm.permalink || null }
    }

    // ── RULE BROKEN POST — one public slide when ANY rule breaks ──
    // POST ?action=publish-violation   body: { rule, km, note?, dryRun? }
    if (action === 'publish-violation') {
      const body = await req.json().catch(() => ({}))
      const rule = String(body.rule || '').toUpperCase().slice(0, 40)
      const km = Math.max(1, Math.min(999, Math.round(Number(body.km) || 20)))
      const note = String(body.note || '').slice(0, 120)
      const dryRun = body.dryRun === true || body.dryRun === '1' || body.dryRun === 1
      if (!rule) {
        return new Response(JSON.stringify({ error: 'rule is required (e.g. FOOD CODE)' }), { status: 400, headers })
      }
      const date = todayIST()
      try {
        const publicUrl = await _renderRuleSlide(rule, km, note, date)
        if (dryRun) {
          return new Response(JSON.stringify({ ok: true, dryRun: true, publicUrl, rule, km }), { headers })
        }
        const caption = `RULE BROKEN — ${rule}.\n\n${km} km — owed. The debt is distance. Posted. No hiding from it.${note ? '\n\n' + note : ''}\n\n#discipline #notoday #indianrunners #triathlonindia`
        const pub = await _publishRuleSlides([publicUrl], caption)
        // A manual violation post also opens a debt that Strava can clear.
        const debtKey = `RULES_DEBT_${date}`
        const { data: dRows } = await supaAdmin.from('config').select('value').eq('key', debtKey).limit(1)
        const dVal: { km?: number; rules?: string[]; ts?: string } = {}
        try { Object.assign(dVal, dRows && dRows[0] ? JSON.parse((dRows[0] as { value: string }).value) : {}) } catch (_e) { /* fresh */ }
        dVal.km = (Number(dVal.km) || 0) + km
        dVal.rules = [...new Set([...(dVal.rules || []), rule])]
        dVal.ts = dVal.ts || new Date().toISOString()
        await supaUpsert('config', { key: debtKey, value: JSON.stringify(dVal) }, 'key')
        return new Response(JSON.stringify({ ok: true, published: true, media_id: pub.media_id, permalink: pub.permalink, rule, km }), { headers })
      } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers })
      }
    }

    // ── DAILY RULES CHECK-IN — RULE 01 SCREENS · RULE 02 FOOD CODE · RULE 03 NIGHT FOOD ──
    // POST ?action=rules-checkin   body: { screens: 'clean'|'broken', food: 'clean'|'broken', night: 'clean'|'broken', note?, date? }
    // Stored in config as RULES_CHECKIN_<date> (JSONB — no schema change).
    // Deadline: every day by 11:59 PM IST. Missing marks remain unconfirmed.
    // The new check-in starts with the 2026-09-27 reset.
    if (action === 'rules-checkin') {
      const body = await req.json().catch(() => ({}))
      const date = String(body.date || todayIST())
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return new Response(JSON.stringify({ error: 'bad date' }), { status: 400, headers })
      }
      // Accept the CURRENT day, plus yesterday while the documented 3:00 AM IST
      // grace window is open — the same window rituals already use
      // (_ritualDayWindow). This is what lets a check-in made with the home
      // network off still land: the page keeps the marks locally and replays
      // them when there is signal, and a replay just after midnight is still
      // the day it was marked for. It deliberately does NOT open an unbounded
      // back-dating path: past the window, a late mark is reported as late
      // rather than silently recorded as on time.
      const chkWin = _ritualDayWindow()
      const chkAllowed = chkWin.graceActive
        ? [chkWin.calendarToday, chkWin.effectiveToday]
        : [chkWin.calendarToday]
      if (chkAllowed.indexOf(date) === -1 || date < '2026-09-27') {
        return new Response(JSON.stringify({
          error: 'Only the current day from 2026-09-27 can be checked in.',
          detail: `date ${date} is outside the check-in window`,
          allowed: chkAllowed,
          grace_active: chkWin.graceActive,
        }), { status: 400, headers })
      }
      if (body.reset === true || body.reset === '1') {
        await supaAdmin.from('config').delete().eq('key', `RULES_CHECKIN_${date}`)
        return new Response(JSON.stringify({ ok: true, reset: true, date }), { headers })
      }
      const screens = body.screens === 'broken' ? 'broken' : body.screens === 'clean' ? 'clean' : ''
      const food = body.food === 'broken' ? 'broken' : body.food === 'clean' ? 'clean' : ''
      const night = body.night === 'broken' ? 'broken' : body.night === 'clean' ? 'clean' : ''
      if (!screens && !food && !night && !body.note) {
        return new Response(JSON.stringify({ error: 'mark screens and/or food and/or night as clean|broken' }), { status: 400, headers })
      }
      const key = `RULES_CHECKIN_${date}`
      const { data: rows } = await supaAdmin.from('config').select('value').eq('key', key).limit(1)
      let prev: Record<string, unknown> = {}
      try { prev = rows && rows[0] ? JSON.parse((rows[0] as { value: string }).value) : {} } catch (_e) { prev = {} }
      if (screens) prev.screens = screens
      if (food) prev.food = food
      if (night) prev.night = night
      if (body.screensKm) prev.screensKm = Math.max(1, Math.min(999, Math.round(Number(body.screensKm) || 50)))
      if (body.note) prev.note = String(body.note).slice(0, 120)
      prev.ts = new Date().toISOString()
      // Flag a mark that landed after midnight for the previous day, so the
      // record shows it arrived in the grace window rather than on the day.
      if (date !== chkWin.calendarToday) prev.graceSubmit = true
      await supaUpsert('config', { key, value: JSON.stringify(prev) }, 'key')
      return new Response(JSON.stringify({ ok: true, date, checkin: prev }), { headers })
    }

    // ── RULES LEDGER — read settlement state (page + verification) ──
    // GET ?action=rules-ledger → { openKm, paidKm, remaining, cleared }
    // Recomputes settlement live (also clears debts that are now paid).
    if (action === 'rules-ledger') {
      const s = await settleRulesDebt()
      return new Response(JSON.stringify({ ok: true, ...s }), { headers })
    }

    // ── RULES REMINDER — 21:30 IST email nudge if the day is not fully marked ──
    // GET ?action=rules-reminder&date=YYYY-MM-DD  (cron: 16:00 UTC)
    // Idempotent via RULES_REMIND_<date>. Deadline stays 11:59 PM — this only
    // nudges the operator ~2.5h before it.
    if (action === 'rules-reminder') {
      const date = url.searchParams.get('date') || todayIST()
      if (date < '2026-09-27') {
        return new Response(JSON.stringify({ ok: true, skipped: true, date, reason: 'rules check-in starts 2026-09-27' }), { headers })
      }
      const { data: remRows } = await supaAdmin.from('config').select('value').eq('key', `RULES_REMIND_${date}`).limit(1)
      if (remRows && remRows.length > 0) {
        return new Response(JSON.stringify({ ok: true, alreadyReminded: true, date }), { headers })
      }
      const { data: chkRows } = await supaAdmin.from('config').select('value').eq('key', `RULES_CHECKIN_${date}`).limit(1)
      let chk: { screens?: string; food?: string; night?: string } = {}
      try { chk = chkRows && chkRows[0] ? JSON.parse((chkRows[0] as { value: string }).value) : {} } catch (_e) { chk = {} }
      const unmarked = (['screens', 'food', 'night'] as const).filter(k => chk[k] !== 'clean' && chk[k] !== 'broken')
      if (unmarked.length === 0) {
        return new Response(JSON.stringify({ ok: true, done: true, date, reason: 'all rules marked' }), { headers })
      }
      const names: Record<string, string> = { screens: 'SCREENS — RULE 01', food: 'FOOD CODE — RULE 02', night: 'NIGHT FOOD — RULE 03' }
      const list = unmarked.map(k => names[k]).join(' · ')
      try {
        await _sendEmail(`[FL] Rules not yet marked — ${date}`,
          _emailShell('Rules check-in pending',
            `<p style="font-size:16px;font-style:italic;color:rgba(240,234,216,0.85);margin:0 0 18px">2.5 hours to the 11:59 PM deadline.</p>
<p>Not yet marked: <b style="color:#D4A843">${list}</b></p>
<p>Mark them CLEAN or BROKEN now — firstlight.live/rules.html. Missing marks remain unconfirmed and will not be posted as violations.</p>`),
          `Rules not yet marked for ${date}: ${list}. Deadline 11:59 PM IST.`)
        await supaUpsert('config', { key: `RULES_REMIND_${date}`, value: JSON.stringify({ ts: new Date().toISOString(), unmarked }) }, 'key')
        return new Response(JSON.stringify({ ok: true, reminded: true, date, unmarked }), { headers })
      } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers })
      }
    }

    // ── DAILY RULES VERDICT — 23:59 IST cron ──
    // GET ?action=rules-verdict&date=YYYY-MM-DD&dryRun=1
    // Reads RULES_CHECKIN_<date>; only explicitly broken rules are violations.
    // Missing marks remain unconfirmed and never create a public accusation.
    // RULE_BROKEN slides are posted for confirmed breaks. Idempotent
    // via RULES_POST_<date>. Emails the operator. dryRun renders without posting.
    if (action === 'rules-verdict') {
      const dryRun = url.searchParams.get('dryRun') === '1' || url.searchParams.get('dry') === '1'
      const date = url.searchParams.get('date') || todayIST()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return new Response(JSON.stringify({ error: 'bad date' }), { status: 400, headers })
      }
      // The daily check-in starts with the September 25 reset.
      // Any earlier date is skipped — no verdict, no post.
      if (date < '2026-09-27') {
        return new Response(JSON.stringify({ ok: true, skipped: true, date, reason: 'rules check-in starts 2026-09-27' }), { headers })
      }
      const postedKey = `RULES_POST_${date}`
      if (!dryRun) {
        const { data: postedRows } = await supaAdmin.from('config').select('value').eq('key', postedKey).limit(1)
        if (postedRows && postedRows.length > 0) {
          let marker: { status?: string } = {}
          try { marker = JSON.parse((postedRows[0] as { value: string }).value) } catch (_e) { /* old marker */ }
          // A pre-deploy safety hold suppresses the old function. This version
          // can process confirmed breaks after the owner login is available.
          if (marker.status !== 'safety_hold_until_auth_fix') {
            return new Response(JSON.stringify({ ok: true, alreadyPosted: true, date }), { headers })
          }
        }
      }
      const { data: chkRows } = await supaAdmin.from('config').select('value').eq('key', `RULES_CHECKIN_${date}`).limit(1)
      let chk: { screens?: string; food?: string; night?: string; screensKm?: number; note?: string } = {}
      try { chk = chkRows && chkRows[0] ? JSON.parse((chkRows[0] as { value: string }).value) : {} } catch (_e) { chk = {} }
      const { violations, unconfirmed } = evaluateRulesCheckin(chk)
      if (violations.length === 0) {
        return new Response(JSON.stringify({ ok: true, verdict: unconfirmed.length ? 'PENDING — unconfirmed rules' : 'CLEAN — all rules held', date, unconfirmed }), { headers })
      }
      const urls: string[] = []
      for (const v of violations) urls.push(await _renderRuleSlide(v.rule, v.km, v.note, date))
      if (dryRun) {
        return new Response(JSON.stringify({ ok: true, dryRun: true, date, violations, urls }), { headers })
      }
      const names = violations.map(v => v.rule.split(' — RULE ')[0])
      const kms = violations.map(v => `${v.km} km`)
      const caption = `RULES BROKEN — ${names.join(' + ')}.\n\n${kms.join(' + ')} — owed. The debt is distance. Posted. No hiding from it.\n\n#discipline #notoday #indianrunners #triathlonindia`
      try {
        const pub = await _publishRuleSlides(urls, caption)
        await supaUpsert('config', { key: postedKey, value: JSON.stringify({ posted: violations.map(v => v.rule), media_id: pub.media_id, ts: new Date().toISOString() }) }, 'key')
        const totalKm = violations.reduce((s, v) => s + v.km, 0)
        await supaUpsert('config', { key: `RULES_DEBT_${date}`, value: JSON.stringify({ km: totalKm, rules: violations.map(v => v.rule), ts: new Date().toISOString() }) }, 'key')
        try {
          await _sendEmail(`[FL] Rules verdict ${date} — ${violations.length} rule${violations.length > 1 ? 's' : ''} broken`,
            _emailShell('Rules verdict', `<p style="font-family:'Courier New',monospace">${violations.map(v => `${v.rule} — ${v.km} KM`).join('<br>')}</p><p>Posted to Instagram. The debt is distance.</p>`),
            `Rules broken on ${date}: ${violations.map(v => v.rule).join(', ')}`)
        } catch (_e) { /* tolerate */ }
        return new Response(JSON.stringify({ ok: true, published: true, date, violations, media_id: pub.media_id, permalink: pub.permalink }), { headers })
      } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message, date, violations }), { status: 500, headers })
      }
    }

    if (action === 'upload') {
      const body = await req.json()
      const result = await uploadMedia(body)
      return new Response(JSON.stringify(result), { headers })
    }

    if (action === 'upload-receipt') {
      const body = await req.json()
      const result = await uploadReceipt(body)
      return new Response(JSON.stringify(result), { headers })
    }

    if (action === 'preflight') {
      const result = await preflight()
      return new Response(JSON.stringify(result), { headers })
    }

    // ── ACCOUNTABILITY ENGINE (Phase 1) — verdict only, no publishing ──
    // GET ?action=judge&date=YYYY-MM-DD&force=WIN|MISS
    // Returns { verdict: 'WIN'|'MISS'|'PENDING', date, chapterDay, matched?, candidates, reason?, pendingReason? }
    if (action === 'judge') {
      const date = url.searchParams.get('date') || undefined
      const forceRaw = url.searchParams.get('force')
      const force = (forceRaw === 'WIN' || forceRaw === 'MISS') ? forceRaw : undefined
      const result = await judgeToday({ date, force })
      return new Response(JSON.stringify(result, null, 2), { headers })
    }

    // ── ACCOUNTABILITY ENGINE (Phase 6) — pg_cron entry points ──
    // GET ?action=engine&phase=nudge|verdict|grace&force=WIN|MISS
    // Also accepts standalone aliases: engine-nudge, engine-verdict, engine-grace
    // (these are what pg_cron schedules below call — no URL param parsing needed)
    if (action === 'engine' || action === 'engine-nudge' || action === 'engine-verdict' || action === 'engine-grace') {
      const phase = url.searchParams.get('phase') || (
        action === 'engine-nudge' ? 'nudge' :
        action === 'engine-grace' ? 'grace' :
        action === 'engine-verdict' ? 'verdict' :
        'verdict'
      )
      const forceRaw = url.searchParams.get('force')
      const force = (forceRaw === 'WIN' || forceRaw === 'MISS') ? forceRaw : undefined

      let result: EngineRunResult
      if (phase === 'nudge') {
        result = await runNudge()
      } else if (phase === 'grace') {
        result = await runGrace()
      } else {
        result = await runVerdict({ force })
      }
      return new Response(JSON.stringify(result, null, 2), { headers })
    }

    // ── REPUBLISH a specific past date (e.g. a post that dropped its GPS frame) ──
    // GET ?action=republish&date=YYYY-MM-DD[&dry=1]
    //   dry=1  → re-sync + re-judge that date and report whether the matched
    //            activity has a GPS polyline. Publishes NOTHING. Run this first.
    //   (live) → re-sync + re-judge + re-render (incl. GPS route) + publish,
    //            bypassing the per-date idempotency lock. Creates a NEW IG post
    //            (delete the old GPS-less one by hand first).
    if (action === 'republish') {
      const date = url.searchParams.get('date')
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return new Response(JSON.stringify({ error: 'republish requires ?date=YYYY-MM-DD' }), { status: 400, headers })
      }
      // ?day=N — force the printed day number (chapter-boundary back-fills; see judgeToday).
      const dayParam = parseInt(url.searchParams.get('day') || '', 10)
      const dayOverride = Number.isFinite(dayParam) && dayParam > 0 ? dayParam : undefined
      const dry = url.searchParams.get('dry') === '1' || url.searchParams.get('dryRun') === '1'
      if (dry) {
        try { await syncStrava([]) } catch (_e) { /* tolerate — judge still reports */ }
        const v = await judgeToday({ date, dayOverride })
        let polyline: string | null = null
        if (v.matched) {
          const { data } = await supaAdmin
            .from('strava_activities')
            .select('summary_polyline')
            .eq('id', v.matched.activityId)
            .maybeSingle()
          polyline = data?.summary_polyline || null
        }
        return new Response(JSON.stringify({
          dryRun: true, date, verdict: v.verdict, chapterDay: v.chapterDay, dayOverride: dayOverride ?? null,
          matched: v.matched, hasGps: !!polyline, polylineLen: polyline ? polyline.length : 0
        }, null, 2), { headers })
      }
      const result = await runVerdict({ date, republish: true, dayOverride })
      return new Response(JSON.stringify(result, null, 2), { headers })
    }

    // ── CONFIRM a held MISS → publish it publicly (operator gate for #2) ──
    // The nightly verdict records a MISS to the ledger but HOLDS the public IG
    // post pending confirmation (guards against false misses). This publishes it.
    // republish:true re-syncs + re-judges + bypasses the idempotency lock, so if
    // the day is now a WIN (late sync) a WIN posts instead — a false miss self-heals.
    if (action === 'confirm-miss') {
      const date = url.searchParams.get('date')
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return new Response(JSON.stringify({ error: 'confirm-miss requires ?date=YYYY-MM-DD' }), { status: 400, headers })
      }
      const result = await runVerdict({ date, confirmMiss: true, republish: true })
      return new Response(JSON.stringify(result, null, 2), { headers })
    }

    // ── MONTHLY RECAP (Phase 7) ──
    // GET ?action=monthly-recap&month=YYYY-MM&dryRun=1
    // Without month → previous month auto-resolved.
    // dryRun=1 → render only, do not publish. URLs returned in result.errors[].
    if (action === 'monthly-recap' || action === 'engine-monthly-recap') {
      const month = url.searchParams.get('month') || undefined
      const dryRun = url.searchParams.get('dryRun') === '1' || url.searchParams.get('dry') === '1'
      const result = await runMonthlyRecap({ month, dryRun })
      return new Response(JSON.stringify(result, null, 2), { headers })
    }

    // ── EMAIL ROUTES ──
    if (action === 'email-morning') {
      const r = await emailMorningReminder()
      return new Response(JSON.stringify(r), { headers })
    }
    if (action === 'email-streak') {
      const r = await emailStreakUpdate()
      return new Response(JSON.stringify(r), { headers })
    }
    if (action === 'email-publish') {
      const r = await emailPublishConfirm()
      return new Response(JSON.stringify(r), { headers })
    }
    if (action === 'email-eod') {
      const r = await emailEodReport()
      return new Response(JSON.stringify(r), { headers })
    }
    if (action === 'email-weekly') {
      const r = await emailWeeklyRecap()
      return new Response(JSON.stringify(r), { headers })
    }
    if (action === 'reset-reminder') {
      const r = await emailResetReminder()
      return new Response(JSON.stringify(r), { headers })
    }

    if (action === 'sync' || action === 'all') {
      await syncStrava(log)
      await syncInstagram(log)
      await syncProofArchive(log)
      try { await reconcileYesterday(log) }
      catch (e) { log.push('Reconcile failed: ' + (e as Error).message) }
      await settleRulesDebt(log)
    }

    if (action === 'refresh-token') {
      await syncInstagram(log)
    }

    // ── STRAVA IDENTITY CHECK ───────────────────────────────────────────────
    // Strava was disabled as a JUDGING source in Jul 2026 on the grounds that
    // the API app was bound to a secondary athlete rather than the followers
    // account, and would therefore judge on the wrong person's data. That claim
    // was never re-tested. This answers it with a fact instead of a comment:
    // it asks Strava who the stored token actually belongs to.
    // Read-only — it publishes nothing and changes no state.
    if (action === 'strava-whoami') {
      const token = await _stravaAccessToken()
      if (!token) {
        return new Response(JSON.stringify({ ok: false, error: 'No Strava token — check secrets' }), { headers })
      }
      const r = await fetch('https://www.strava.com/api/v3/athlete', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const a = await r.json()
      if (!r.ok) {
        return new Response(JSON.stringify({ ok: false, status: r.status, error: a }), { headers })
      }
      const EXPECTED_FOLLOWERS_ATHLETE = 206338460   // the public account
      const KNOWN_SECONDARY_ATHLETE = 1669656814     // the one the Jul note blamed
      return new Response(JSON.stringify({
        ok: true,
        athlete_id: a.id,
        username: a.username,
        name: [a.firstname, a.lastname].filter(Boolean).join(' '),
        follower_count: a.follower_count,
        friend_count: a.friend_count,
        is_followers_account: a.id === EXPECTED_FOLLOWERS_ATHLETE,
        is_known_secondary: a.id === KNOWN_SECONDARY_ATHLETE,
        judging_source_enabled: (await getSecret('strava_source_enabled')) === 'true'
      }), { headers })
    }

    if (action === 'backfill-strava-calories') {
      const limit = parseInt(url.searchParams.get('limit') || '90', 10)
      const result = await backfillStravaCalories(log, Math.min(Math.max(limit, 1), 100))
      const duration = Date.now() - startTime
      return new Response(JSON.stringify({ success: true, duration, log, ...result }), { headers })
    }

    const duration = Date.now() - startTime
    log.push(`Done in ${duration}ms`)

    // Save health status
    const warnings = log.filter(l => l.includes('⚠') || l.includes('ERROR') || l.includes('failed'))
    try {
      await supaUpsert('config', {
        key: 'SYNC_HEALTH',
        value: JSON.stringify({ last_sync: new Date().toISOString(), status: warnings.length > 0 ? 'warning' : 'healthy', warnings: warnings.join(' | ').substring(0, 500), duration_ms: duration })
      }, 'key')
    } catch (_e) { /* ignore */ }

    return new Response(JSON.stringify({ success: true, duration, log }), { headers })
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), { status: 500, headers })
  }
})
