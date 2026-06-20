// ═══════════════════════════════════════════════════════
// FIRST LIGHT — Supabase Edge Function (replaces GCP Cloud Function)
// Handles: Strava sync, Instagram sync, health ingest, IG proxy
// Deploy: supabase functions deploy firstlight-sync
// ═══════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPA_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPA_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const SUPA_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
const IG_ACCOUNT_ID = '17841466893616231'

// ── Chapter-aware day numbering ──
// Chapter 1 FOUNDATION: 2026-02-10 → 2026-06-08 (Day 1..110, CLOSED).
// Gap days Jun 9-18 → 0 (no chapter active; Chapter 02 REBUILD ran briefly Jun 13-18 then retired).
// Chapter 2 ENDURANCE: 2026-06-20 onward (Day 1..). New rule: 5km any motion daily, miss = ₹1500 → Akshaya Patra (1 child / 1 academic year).
const CHAPTER_1_START = new Date('2026-02-10T00:00:00+05:30')
const CHAPTER_1_END = new Date('2026-06-09T00:00:00+05:30') // exclusive — Day 110 = Jun 8
const CHAPTER_2_START = new Date('2026-06-20T00:00:00+05:30')
function chapterDay(date: Date | string): number {
  const d = (date instanceof Date) ? date : new Date(date)
  if (d.getTime() >= CHAPTER_2_START.getTime()) return Math.floor((d.getTime() - CHAPTER_2_START.getTime()) / 86400000) + 1
  if (d.getTime() >= CHAPTER_1_START.getTime() && d.getTime() < CHAPTER_1_END.getTime()) return Math.floor((d.getTime() - CHAPTER_1_START.getTime()) / 86400000) + 1
  return 0
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

// Top-level: judge a given IST date (defaults to today). Returns VerdictResult.
// Used by ?action=judge route and (later) by 23:30 / 00:15 pg_cron jobs.
async function judgeToday(opts?: { date?: string; force?: 'WIN' | 'MISS' }): Promise<VerdictResult> {
  const date = opts?.date || todayIST()
  const day = chapterDay(new Date(`${date}T12:00:00+05:30`))

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

  const token = await _stravaAccessToken()
  if (!token) {
    return { verdict: 'PENDING', date, chapterDay: day, candidates: [], pendingReason: 'Strava token refresh failed — auth issue, manual check required' }
  }

  const activities = await _pullStravaForDate(date, token)
  if (activities === null) {
    return { verdict: 'PENDING', date, chapterDay: day, candidates: [], pendingReason: 'Strava API unreachable after 3 retries — NOT declaring MISS on infra failure' }
  }

  const allMatches = evaluateAllActivities(activities)
  if (allMatches.length > 0) {
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
    const allMatched = allMatches.map(toMatched)
    return {
      verdict: 'WIN',
      date,
      chapterDay: day,
      candidates: activities,
      matched: allMatched[0],
      allMatched
    }
  }

  const reason = activities.length === 0
    ? 'No Strava activities recorded for today (IST window)'
    : `Found ${activities.length} activities, none met the menu thresholds (walk/run ≥5km, cycle ≥10km, swim ≥1km, HR-session ≥30min)`

  return { verdict: 'MISS', date, chapterDay: day, candidates: activities, reason }
}

// ═══════════════════════════════════════════════════════════════════════════
// ACCOUNTABILITY ENGINE — Phase 2-7
// Orchestrates: render → R2 → IG publish → ledger write → email.
// Idempotent per (date, variant). Three entry points called by pg_cron:
//   - nudge   (21:00 IST)  — alert operator if not yet qualified
//   - verdict (23:30 IST)  — final judgement + publish
//   - grace   (00:15 IST)  — re-check yesterday's MISS in case of late sync
// ═══════════════════════════════════════════════════════════════════════════

const AKSHAYA_PATRA = 'Akshaya Patra'
const STAKE_AMOUNT = 1500
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
    payload.payload = { charity: AKSHAYA_PATRA, reason: verdict.reason }
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
    const det = await _fullActivity(m.activityId)
    return {
      bucket: m.bucket,
      type: m.type,
      name: m.name,
      distanceKm: m.distanceKm,
      durationMin: m.durationMin,
      polyline: det?.summary_polyline || undefined,
      averageHr: det?.average_heartrate ? Math.round(det.average_heartrate) : undefined,
      caloriesKcal: det?.calories ? Math.round(det.calories) : undefined,
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
async function _renderRouteSlide(verdict: VerdictResult, orientation: 'post' | 'story' = 'post'): Promise<string> {
  if (!verdict.matched) throw new Error('Cannot render route slide: no matched activity')
  const base = await _renderWorkerBase()
  const key = await _renderKey()

  // Pull full activity from DB (already synced via syncStrava — has polyline + cal + elev)
  const { data } = await supaAdmin
    .from('strava_activities')
    .select('summary_polyline,total_elevation_gain,calories,start_date_local,average_heartrate')
    .eq('id', verdict.matched.activityId)
    .maybeSingle()

  const theme = _themeFor(verdict)
  const payload = {
    date: verdict.date,
    chapterDay: verdict.chapterDay,
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

// MISS-only hashtag set. #akshayapatra ONLY appears on miss days, so the
// charity gets visibility on the donation post but the WIN posts stay clean.
const MISS_HASHTAGS = ['#akshayapatra', '#feedingindia', '#middaymeal', '#accountability', '#runnersofindia']

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

function _generateCaption(verdict: VerdictResult): string {
  const day = verdict.chapterDay

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
      return `${opener}\n\nDay ${day}.\n${bullets}\n\nThe body stacked.\n\nfirstlight.live\n.\n.\n${tags.join(' ')}`
    }

    // Single activity (original)
    const m = verdict.matched
    const distStr = m.distanceKm ? m.distanceKm.toFixed(1) : '5'
    const opener = _pickFromPool(WIN_OPENERS, day)
      .replace('{DAY}', String(day))
      .replace('{DIST}', distStr)
    const statLine = m.distanceKm
      ? `${m.distanceKm.toFixed(1)} km · ${m.type}`
      : `${Math.round(m.durationMin)} min · ${m.type}`
    const tags = (HASHTAGS_BY_SPORT[m.bucket] || HASHTAGS_BY_SPORT.run).join(' ')
    // Strava link — only for GPS sports with a real activity ID
    const isGps = m.bucket !== 'hrSession'
    const stravaLine = (isGps && m.activityId > 0)
      ? `\n\nView on Strava: strava.com/activities/${m.activityId}`
      : ''
    return `${opener}\n\nDay ${day}.\n${statLine}.${stravaLine}\n\nfirstlight.live\n.\n.\n${tags}`
  }

  if (verdict.verdict === 'MISS') {
    // ₹1,500 is Akshaya Patra's exact sponsorship price: 1 child for 1 academic year (~200 school days).
    const opener = _pickFromPool(MISS_OPENERS, day).replace('{DAY}', String(day))
    const tags = MISS_HASHTAGS.join(' ')
    return `${opener}\n\nDay ${day}.\n${AKSHAYA_PATRA} · 1 child · 1 school year · 200 mid-day meals.\nReceipt in comments. Back tomorrow.\n\nfirstlight.live\n.\n.\n${tags}`
  }

  return `Day ${day}\n\nfirstlight.live`
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

  // Frame 2: route slide — only for GPS sports on WIN with a real activityId
  // Render at STORY orientation (1080x1920) so the second Story frame
  // doesn't show up as a letterboxed square (the historical bug).
  if (verdict.verdict === 'WIN' && verdict.matched && verdict.matched.activityId > 0) {
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
  if (verdict.verdict === 'WIN' && verdict.matched) {
    proofRow.activity_type = verdict.matched.type
    proofRow.activity_name = verdict.matched.name
    if (verdict.matched.distanceKm) proofRow.run_km = verdict.matched.distanceKm  // legacy field reused
  }
  if (post?.media_id) proofRow.ig_post_id = post.media_id
  try { await supaUpsert('proof_archive', proofRow, 'date') } catch (_e) { /* tolerate missing columns */ }

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
      insight: `Day ${verdict.chapterDay} · auto-forfeit. ₹${STAKE_AMOUNT} → ${AKSHAYA_PATRA}.`,
      penalty: 'charity_donation',
      penalty_amount: STAKE_AMOUNT,
      penalty_charity: AKSHAYA_PATRA,
      penalty_km: 0,
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

// Email helpers — reuse existing _sendEmail + _emailShell
async function _emailVerdictWin(verdict: VerdictResult, post: PublishedPost) {
  const day = verdict.chapterDay
  const m = verdict.matched
  const stat = m ? (m.distanceKm ? `${m.distanceKm.toFixed(1)} km ${m.type}` : `${Math.round(m.durationMin)} min ${m.type}`) : 'logged'
  const link = post.media_id ? `https://www.instagram.com/p/${post.media_id}/` : ''
  const html = _emailShell(`Day ${day} — WIN posted ✓`, `
    <p style="font-size:18px;color:#fff">${stat}.</p>
    <p style="color:#888">Verdict written to ledger. IG post: <a href="${link}" style="color:#00D4FF">${post.media_id || 'unknown'}</a></p>
    <p style="color:#888">Streak: Day ${day}.</p>
  `)
  await _sendEmail(`[FIRSTLIGHT] Day ${day} — WIN posted ✓`, html, `Day ${day} WIN posted. ${stat}. Link: ${link}`)
}

async function _emailVerdictMiss(verdict: VerdictResult, post: PublishedPost) {
  const day = verdict.chapterDay
  const upi = await _publishUpiLink() || 'upi://pay?pa=donate@akshayapatra&pn=Akshaya%20Patra&am=' + STAKE_AMOUNT
  const link = post.media_id ? `https://www.instagram.com/p/${post.media_id}/` : ''
  const ledger = 'https://firstlight.live/accountability.html'
  const html = _emailShell(`Day ${day} — MISS · ₹${STAKE_AMOUNT} → ${AKSHAYA_PATRA}`, `
    <p style="font-size:18px;color:#fff">No qualifying activity today.</p>
    <p style="color:#888">${verdict.reason || ''}</p>
    <p style="margin:24px 0 8px;color:#D4A843;font-weight:700">₹${STAKE_AMOUNT.toLocaleString('en-IN')} = 1 child sponsored at Akshaya Patra for 1 full academic year</p>
    <p style="color:#888;font-size:12px;margin-bottom:24px">(≈ 200 mid-day meals over the school year. This is Akshaya Patra's official sponsorship unit.)</p>
    <p style="margin-top:24px"><a href="${upi}" style="background:#F5A623;color:#000;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700">DONATE ₹${STAKE_AMOUNT.toLocaleString('en-IN')} VIA UPI</a></p>
    <p style="color:#888;margin-top:24px">After donating, paste the screenshot as a comment under: <a href="${link}" style="color:#00D4FF">${link}</a></p>
    <p style="color:#888">Ledger: <a href="${ledger}" style="color:#00D4FF">${ledger}</a></p>
  `)
  await _sendEmail(`[FIRSTLIGHT] Day ${day} — MISS · ₹${STAKE_AMOUNT} → ${AKSHAYA_PATRA}`, html,
    `Day ${day} MISS. Donate ₹${STAKE_AMOUNT} via UPI: ${upi}. Then comment receipt on: ${link}`)
}

async function _emailNudge(verdict: VerdictResult) {
  const day = verdict.chapterDay
  const html = _emailShell(`Day ${day} — 2.5h left`, `
    <p style="font-size:18px;color:#fff">No qualifying activity yet.</p>
    <p style="color:#888">Window closes at 23:30 IST. Menu: 5km walk · 5km run · 10km cycle · 1km swim · 30min HR session.</p>
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
async function runVerdict(opts?: { force?: 'WIN' | 'MISS' }): Promise<EngineRunResult> {
  const result: EngineRunResult = { phase: 'verdict', date: todayIST(), emailsSent: [], errors: [] }
  const verdict = await judgeToday({ force: opts?.force })
  result.verdict = verdict

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

  // Idempotency — block double-runs from the start
  if (await _verdictAlreadyPosted(result.date)) {
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
          // Single activity — original 2-slide carousel (hero + route)
          const slide1 = await _renderVerdictImage(verdict, 'post')
          let slide2: string | null = null
          try {
            slide2 = await _renderRouteSlide(verdict)
          } catch (routeErr) {
            result.errors.push(`Route slide failed (falling back to single image): ${(routeErr as Error).message}`)
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
  lines.push(`Full month at firstlight.live`)
  lines.push('')
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

  // Flipped! Retract the forfeit and post a correction story
  result.errors.push('VERDICT_REVISED_MISS_TO_WIN')

  // Mark slip as retracted (don't delete — log immutable)
  try {
    await supaAdmin
      .from('slips')
      .update({ penalty_status: 'cleared', penalty_amount: 0, insight: `Retracted by 00:15 grace re-check — late Strava sync flipped verdict to WIN.` })
      .eq('client_id', `engine_miss_${yesterday}`)
  } catch (_e) { /* tolerate */ }

  // Update proof_archive
  try {
    await supaUpsert('proof_archive', { date: yesterday, verdict: 'WIN' }, 'date')
  } catch (_e) { /* tolerate */ }

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
  const activities = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?per_page=30&after=${threeDaysAgo}`,
    { headers: { 'Authorization': `Bearer ${tokenResp.access_token}` } }
  ).then(r => r.json())

  if (!Array.isArray(activities)) { log.push('Strava: no activities'); return }
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
    try { await supaUpsert('strava_activities', row, 'id'); synced++ } catch (_e) { /* skip */ }
  }
  log.push(`Strava: ${synced}/${activities.length} synced (detail: ${detailHits} hits, ${detailMisses} misses)`)
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
// INSTAGRAM SYNC
// ═══════════════════════════════════════════
async function syncInstagram(log: string[]) {
  log.push('Instagram: starting...')

  let igToken = await getSecret('ig_access')
  if (!igToken) { log.push('Instagram: no token'); return }

  // Check token expiry
  const debug = await fetch(
    `https://graph.facebook.com/v21.0/debug_token?input_token=${igToken}&access_token=${igToken}`
  ).then(r => r.json())
  const isValid = debug?.data?.is_valid
  const expiresAt = debug?.data?.expires_at || 0
  const daysLeft = expiresAt > 0 ? Math.floor((expiresAt - Date.now() / 1000) / 86400) : -1
  log.push(`Instagram: token valid=${isValid}, expires in ${daysLeft} days`)

  // Save token health
  try {
    await supaUpsert('config', {
      key: 'IG_TOKEN_HEALTH',
      value: JSON.stringify({ valid: isValid, days_left: daysLeft, checked_at: new Date().toISOString(), expires_at: expiresAt })
    }, 'key')
  } catch (_e) { /* ignore */ }

  if (!isValid || daysLeft < 0) {
    log.push('⚠ Instagram: TOKEN EXPIRED')
  }

  // Refresh if < 45 days
  let daysLeftAfter = daysLeft
  if (isValid && daysLeft < 45 && daysLeft >= 0) {
    const igAppId = await getSecret('ig_app_id')
    const igAppSecret = await getSecret('ig_app_secret')
    if (igAppId && igAppSecret) {
      try {
        const newToken = await fetch(
          `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${igAppId}&client_secret=${igAppSecret}&fb_exchange_token=${igToken}`
        ).then(r => r.json())
        if (newToken.access_token) {
          igToken = newToken.access_token
          await setSecret('ig_access', igToken)
          log.push('Instagram: ✅ token refreshed')
          // Re-check days_left on the new token
          const recheck = await fetch(
            `https://graph.facebook.com/v21.0/debug_token?input_token=${igToken}&access_token=${igToken}`
          ).then(r => r.json())
          if (recheck?.data?.expires_at) {
            daysLeftAfter = Math.floor((recheck.data.expires_at - Date.now() / 1000) / 86400)
          }
        }
      } catch (e) {
        log.push(`Instagram: ⚠ refresh failed: ${(e as Error).message}`)
        await sendAlert('IG token refresh FAILED', `Instagram long-lived token has ${daysLeft} days remaining and refresh threw: ${(e as Error).message}. If days_left reaches 0, IG sync + daily proof publish dies. Regenerate manually at https://developers.facebook.com/tools/explorer/ and update ig_access in the secrets table.`)
      }
    }
  }
  // Early-warning alert when token isn't being extended properly (FB restriction symptom)
  // — fires when post-refresh life is still under 7 days. Standard long-lived tokens get 60d back.
  if (isValid && daysLeftAfter < 7 && daysLeftAfter >= 0) {
    await sendAlert(
      `IG token under-extending (${daysLeftAfter}d left)`,
      `Facebook only granted ${daysLeftAfter}d on the latest IG token refresh — expected 60d. This is usually a symptom of account restriction (App Review pending, content flagged, or rate-limited). Daily proof publish will die in ${daysLeftAfter}d unless cleared. Action: check https://business.facebook.com/business_locked / IG account status, resolve any flags, then trigger ?action=refresh-token again. (Was: ${daysLeft}d before refresh, ${daysLeftAfter}d after.)`
    )
    log.push(`Instagram: ⚠ token still only ${daysLeftAfter}d after refresh — FB likely restricting`)
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
    const dayNum = chapterDay(postDate)

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
    food_clean: existing?.food_clean ?? true,
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
      else if (name === 'distance_walking_running') { if (qty != null) day.distance_km = qty }
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
    wArr.push({
      type: String(w.name || 'unknown').toLowerCase().replace(/\s+/g, '_'),
      duration_min: w.duration ? Math.round(Number(w.duration) / 60) : 0,
      calories: ae ? Math.round(Number(ae.qty || 0)) : 0,
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
      }

      // ── FAULT-TOLERANT MERGE: fetch existing row, never let a re-export degrade stored data ──
      const { data: existingRow } = await supaAdmin
        .from('health_daily')
        .select('sleep_hours,vo2_max,workout_count,workout_types,workout_total_min,workout_total_cal,raw_payload')
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

        await supaUpsert('daily_logs', { date, sleep_hrs: finalSleepHours, wake_time: row.wake_time || null }, 'date')
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
    .select('id,client_id,date,penalty_amount,penalty_charity,ig_post_id,penalty_status')
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
        const amount = slip.penalty_amount || 1500
        const charity = slip.penalty_charity || AKSHAYA_PATRA
        const message = `₹${amount.toLocaleString('en-IN')} paid → ${charity} · 1 child sponsored for 1 academic year · receipt: firstlight.live/accountability`
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
const STREAK_START_ISO = '2026-06-20' // Chapter 02 ENDURANCE Day 1
function _daysSinceStart(): number {
  const ms = Date.now() - new Date(STREAK_START_ISO + 'T00:00:00+05:30').getTime()
  return Math.max(1, Math.floor(ms / 86400000) + 1)
}
function _todayLocalISO(): string {
  // IST date string YYYY-MM-DD
  const now = new Date()
  const ist = new Date(now.getTime() + (5.5 * 3600 * 1000))
  return ist.toISOString().slice(0, 10)
}
async function _todayRunStats(): Promise<{ km: number; min: number; pace: string; start: string; name: string } | null> {
  const today = _todayLocalISO()
  const { data } = await supaAnon.from('strava_activities').select('name,type,start_date_local,distance,moving_time')
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
<div style="font-family:'Courier New',monospace;font-size:11px;color:rgba(212,168,67,0.55);letter-spacing:1px">₹1,500 / MISS → AKSHAYA PATRA · LOGGED PUBLIC · EVERY DAY</div>
<div style="font-family:Georgia,serif;font-size:24px;color:#D4A843;margin-top:8px"><a href="https://firstlight.live" style="color:#D4A843;text-decoration:none">firstlight.live</a></div>
<div style="font-family:'Courier New',monospace;font-size:10px;color:rgba(212,168,67,0.4);margin-top:4px">@firstlightlive · CHAPTER 02 · ${footer}</div>
</td></tr>
</table></td></tr></table></body></html>`
}

async function emailMorningReminder() {
  const dn = _daysSinceStart()
  const html = _emailShell(`Day ${String(dn).padStart(3, '0')}.`,
    `<p style="font-size:18px;font-style:italic;color:rgba(240,234,216,0.85);margin:0 0 18px">A new day. Pick one.</p>
<p>The menu — <b style="color:#D4A843">5 km walk · 5 km run · 10 km cycle · 1 km swim · 30 min HR session</b>. One activity today, or ₹1,500 to Akshaya Patra at midnight IST.</p>
<p>The window is wide. The body chooses. The streak continues.</p>
<p style="font-size:12px;color:rgba(240,234,216,0.5);margin-top:28px">— Sent at 04:30 IST by the system you built.</p>`,
    'MORNING REMINDER')
  await _sendEmail(`[FL] Day ${String(dn).padStart(3, '0')}. A new day. Pick one.`, html, `Day ${dn}. Pick one from the menu. Or ₹1,500 to Akshaya Patra. — firstlight.live`)
  return { sent: 'morning', day: dn }
}

async function emailStreakUpdate() {
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
  const dn = _daysSinceStart()
  const stats = await _todayRunStats()
  const html = _emailShell(`Day ${String(dn).padStart(3, '0')} · 90 min to verdict.`,
    `<p style="font-size:18px;font-style:italic;color:rgba(240,234,216,0.85);margin:0 0 24px">Window closes at 23:30 IST.</p>
${stats ? `<table cellpadding="12" cellspacing="0" style="width:100%;border-collapse:collapse;font-family:'Courier New',monospace">
<tr><td style="border-bottom:1px dashed rgba(212,168,67,0.2);color:rgba(212,168,67,0.6);font-size:12px">TODAY</td><td style="border-bottom:1px dashed rgba(212,168,67,0.2);text-align:right;font-size:18px;color:#F0EAD8">${stats.km} KM · ${stats.min} MIN</td></tr>
<tr><td style="color:rgba(212,168,67,0.6);font-size:12px">STREAK</td><td style="text-align:right;font-size:18px;color:#F0EAD8">DAY ${dn}</td></tr>
</table>` : `<p>No qualifying activity logged yet. Menu: 5 km walk / 5 km run / 10 km cycle / 1 km swim / 30 min HR session. Window closes in 90 minutes.</p>`}
<p style="margin-top:28px;font-family:Georgia,serif;font-size:22px;font-style:italic;color:#D4A843">${stats ? 'Verdict at 23:30 IST — system will publish + log.' : 'Last call. Move now, or ₹1,500 → Akshaya Patra at midnight.'}</p>
<p style="font-size:12px;color:rgba(240,234,216,0.5);margin-top:28px">— Sent at 22:00 IST. Engine verdict fires at 23:30.</p>`,
    'END-OF-DAY')
  await _sendEmail(`[FL] Day ${String(dn).padStart(3, '0')} · 90 min to verdict`, html, `Day ${dn} · 90 min till verdict — firstlight.live`)
  return { sent: 'eod', day: dn }
}

async function emailWeeklyRecap() {
  const dn = _daysSinceStart()
  const today = new Date()
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000).toISOString().slice(0, 10)

  // Pull ALL Strava activities for the week (multi-sport, not just runs)
  const { data: actsData } = await supaAnon.from('strava_activities').select('distance,moving_time,start_date_local,type')
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

  const { error } = await supaAdmin.from(table).upsert(data, { onConflict })
  if (error) throw error
  return { success: true, message: `Upserted into ${table}` }
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
        'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key, X-Webhook-Secret, Authorization',
      }
    })
  }

  const url = new URL(req.url)
  const action = url.searchParams.get('action') || 'sync'
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }

  // Auth check — supports header OR URL param (pg_cron can't send custom headers reliably)
  const requestKey = req.headers.get('x-admin-key') || url.searchParams.get('admin_key') || ''
  const adminKey = await getSecret('admin_api_key')
  const isAuthed = adminKey && requestKey === adminKey

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

  // Health ingest — uses its own secret
  if (action === 'health-ingest') {
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

    if (action === 'sync' || action === 'all') {
      await syncStrava(log)
      await syncInstagram(log)
      await syncProofArchive(log)
    }

    if (action === 'refresh-token') {
      await syncInstagram(log)
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
