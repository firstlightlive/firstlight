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
// Chapter 1: 2026-02-10 → 2026-06-08 (Day 1..110, CLOSED). Gap days Jun 9-12 → 0.
// Chapter 2: 2026-06-13 onward (Day 1..). Shift CHAPTER_2_START here when starting a new chapter.
const CHAPTER_1_START = new Date('2026-02-10T00:00:00+05:30')
const CHAPTER_1_END = new Date('2026-06-09T00:00:00+05:30') // exclusive — Day 110 = Jun 8
const CHAPTER_2_START = new Date('2026-06-13T00:00:00+05:30')
function chapterDay(date: Date | string): number {
  const d = (date instanceof Date) ? date : new Date(date)
  if (d.getTime() >= CHAPTER_2_START.getTime()) return Math.floor((d.getTime() - CHAPTER_2_START.getTime()) / 86400000) + 1
  if (d.getTime() >= CHAPTER_1_START.getTime() && d.getTime() < CHAPTER_1_END.getTime()) return Math.floor((d.getTime() - CHAPTER_1_START.getTime()) / 86400000) + 1
  return 0
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
  for (const a of activities) {
    const row = {
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
      calories: a.calories || null,
      suffer_score: a.suffer_score || null,
      pr_count: a.pr_count || 0,
      summary_polyline: a.map ? a.map.summary_polyline : null
    }
    try { await supaUpsert('strava_activities', row, 'id'); synced++ } catch (_e) { /* skip */ }
  }
  log.push(`Strava: ${synced}/${activities.length} synced`)
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
        }
      } catch (e) {
        log.push(`Instagram: ⚠ refresh failed: ${(e as Error).message}`)
        await sendAlert('IG token refresh FAILED', `Instagram long-lived token has ${daysLeft} days remaining and refresh threw: ${(e as Error).message}. If days_left reaches 0, IG sync + daily proof publish dies. Regenerate manually at https://developers.facebook.com/tools/explorer/ and update ig_access in the secrets table.`)
      }
    }
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

// ═══════════════════════════════════════════
// SCHEDULED EMAIL SYSTEM — 4 daily + 1 weekly
// Resend HTML emails with FIRST LIGHT brand. All compute day number
// from STREAK_START and pull today's stats from strava_activities.
// ═══════════════════════════════════════════
const STREAK_START_ISO = '2026-06-13' // Chapter 02 Day 1
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
<div style="font-family:'Courier New',monospace;font-size:11px;color:rgba(212,168,67,0.55);letter-spacing:1px">₹15,000 STAKE · LOGGED PUBLIC · EVERY MORNING</div>
<div style="font-family:Georgia,serif;font-size:24px;color:#D4A843;margin-top:8px"><a href="https://firstlight.live" style="color:#D4A843;text-decoration:none">firstlight.live</a></div>
<div style="font-family:'Courier New',monospace;font-size:10px;color:rgba(212,168,67,0.4);margin-top:4px">@firstlightlive · CHAPTER 02 · ${footer}</div>
</td></tr>
</table></td></tr></table></body></html>`
}

async function emailMorningReminder() {
  const dn = _daysSinceStart()
  const html = _emailShell(`Day ${String(dn).padStart(3, '0')}.`,
    `<p style="font-size:18px;font-style:italic;color:rgba(240,234,216,0.85);margin:0 0 18px">30 minutes to the line.</p>
<p>Alarm at <b style="color:#D4A843">04:30 AM</b>. Deadline at <b>06:00 AM</b>. The bed is warm. The road is cold. The alarm does not care.</p>
<p>Lace up. Hit the road. The streak is yours to hold or break.</p>
<p style="font-size:12px;color:rgba(240,234,216,0.5);margin-top:28px">— Sent at 04:30 IST by the system you built.</p>`,
    'MORNING REMINDER')
  await _sendEmail(`[FL] Day ${String(dn).padStart(3, '0')}. 30 minutes to the line.`, html, `Day ${dn}. 30 min to the 6 AM line. — firstlight.live`)
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
    const html = _emailShell(`⚠ Day ${String(dn).padStart(3, '0')} · MISSED?`,
      `<p style="font-size:18px;font-style:italic;color:#FF6B6B;margin:0 0 18px">No run logged in Strava for today.</p>
<p>Either the run never happened, or the Strava sync hasn't caught up yet. <b>Check the app at <a href="https://firstlight.live/app" style="color:#D4A843">firstlight.live/app</a></b>.</p>
<p>If the deadline passed without a run, the slip should be logged public and ₹15,000 paid out. The system does not negotiate.</p>
<p style="font-size:12px;color:rgba(240,234,216,0.5);margin-top:28px">— Sent at 06:30 IST after deadline check. False alarm if your run is still syncing.</p>`,
      'DEADLINE CHECK')
    await _sendEmail(`[FL] ⚠ Day ${String(dn).padStart(3, '0')} · no run found at 06:30`, html, `Day ${dn} · no run logged · check the app — firstlight.live`)
    return { sent: 'streak-miss-warning', day: dn }
  }
}

async function emailPublishConfirm() {
  const dn = _daysSinceStart()
  const stats = await _todayRunStats()
  const html = _emailShell(`Day ${String(dn).padStart(3, '0')} · posted.`,
    `<p style="font-size:18px;font-style:italic;color:rgba(240,234,216,0.85);margin:0 0 18px">The grid grows by one.</p>
<p>Today's post is live on <a href="https://www.instagram.com/firstlightlive/" style="color:#D4A843">@firstlightlive</a>.</p>
${stats ? `<p style="font-family:'Courier New',monospace;font-size:14px;color:rgba(212,168,67,0.85);margin-top:24px">${stats.km} KM &nbsp;·&nbsp; ${stats.min} MIN &nbsp;·&nbsp; ${stats.start} IST</p>` : ''}
<p style="margin-top:24px">₹15,000 stays mine. Streak rolls forward.</p>
<p style="font-size:12px;color:rgba(240,234,216,0.5);margin-top:28px">— Triggered when you tap PUBLISH from firstlight.live/app.</p>`,
    'PUBLISH CONFIRMATION')
  await _sendEmail(`[FL] Day ${String(dn).padStart(3, '0')} · posted · ₹15K defended`, html, `Day ${dn} posted to @firstlightlive — firstlight.live`)
  return { sent: 'publish-confirm', day: dn }
}

async function emailEodReport() {
  const dn = _daysSinceStart()
  const stats = await _todayRunStats()
  const html = _emailShell(`Day ${String(dn).padStart(3, '0')} · complete.`,
    `<p style="font-size:18px;font-style:italic;color:rgba(240,234,216,0.85);margin:0 0 24px">One more morning held.</p>
${stats ? `<table cellpadding="12" cellspacing="0" style="width:100%;border-collapse:collapse;font-family:'Courier New',monospace">
<tr><td style="border-bottom:1px dashed rgba(212,168,67,0.2);color:rgba(212,168,67,0.6);font-size:12px">TODAY</td><td style="border-bottom:1px dashed rgba(212,168,67,0.2);text-align:right;font-size:18px;color:#F0EAD8">${stats.km} KM · ${stats.min} MIN</td></tr>
<tr><td style="border-bottom:1px dashed rgba(212,168,67,0.2);color:rgba(212,168,67,0.6);font-size:12px">STAKE</td><td style="border-bottom:1px dashed rgba(212,168,67,0.2);text-align:right;font-size:18px;color:#D4A843">₹15,000 DEFENDED</td></tr>
<tr><td style="color:rgba(212,168,67,0.6);font-size:12px">STREAK</td><td style="text-align:right;font-size:18px;color:#F0EAD8">DAY ${dn} · ZERO MISSES</td></tr>
</table>` : `<p>Run data not yet visible in today's log.</p>`}
<p style="margin-top:28px;font-family:Georgia,serif;font-size:22px;font-style:italic;color:#D4A843">Tomorrow. <b>04:48 AM</b>. Same alarm. Same road. Same answer.</p>
<p style="font-size:12px;color:rgba(240,234,216,0.5);margin-top:28px">— Sent at 22:00 IST. Wake reminder fires at 04:30.</p>`,
    'END-OF-DAY')
  await _sendEmail(`[FL] Day ${String(dn).padStart(3, '0')} · complete · tomorrow 04:48`, html, `Day ${dn} complete. Tomorrow 4:48 AM — firstlight.live`)
  return { sent: 'eod', day: dn }
}

async function emailWeeklyRecap() {
  const dn = _daysSinceStart()
  const today = new Date()
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000).toISOString().slice(0, 10)
  const { data } = await supaAnon.from('strava_activities').select('distance,moving_time,start_date_local,type')
    .gte('start_date_local', sevenDaysAgo + 'T00:00:00').eq('type', 'Run')
  const runs = data || []
  const totalKm = Math.round(runs.reduce((s: number, r: { distance?: number }) => s + ((r.distance || 0) / 1000), 0) * 10) / 10
  const totalMin = Math.round(runs.reduce((s: number, r: { moving_time?: number }) => s + ((r.moving_time || 0) / 60), 0))
  const dayCount = runs.length
  const week = Math.ceil(dn / 7)
  const html = _emailShell(`Week ${String(week).padStart(2, '0')} · ${totalKm} KM.`,
    `<p style="font-size:18px;font-style:italic;color:rgba(240,234,216,0.85);margin:0 0 24px">Seven mornings. Held.</p>
<table cellpadding="12" cellspacing="0" style="width:100%;border-collapse:collapse;font-family:'Courier New',monospace">
<tr><td style="border-bottom:1px dashed rgba(212,168,67,0.2);color:rgba(212,168,67,0.6);font-size:12px">RUN DAYS</td><td style="border-bottom:1px dashed rgba(212,168,67,0.2);text-align:right;font-size:22px;color:#F0EAD8">${dayCount} / 7</td></tr>
<tr><td style="border-bottom:1px dashed rgba(212,168,67,0.2);color:rgba(212,168,67,0.6);font-size:12px">DISTANCE</td><td style="border-bottom:1px dashed rgba(212,168,67,0.2);text-align:right;font-size:22px;color:#D4A843">${totalKm} KM</td></tr>
<tr><td style="border-bottom:1px dashed rgba(212,168,67,0.2);color:rgba(212,168,67,0.6);font-size:12px">TIME</td><td style="border-bottom:1px dashed rgba(212,168,67,0.2);text-align:right;font-size:22px;color:#F0EAD8">${totalMin} MIN</td></tr>
<tr><td style="border-bottom:1px dashed rgba(212,168,67,0.2);color:rgba(212,168,67,0.6);font-size:12px">STAKE DEFENDED</td><td style="border-bottom:1px dashed rgba(212,168,67,0.2);text-align:right;font-size:22px;color:#D4A843">₹${(15000 * dayCount).toLocaleString('en-IN')}</td></tr>
<tr><td style="color:rgba(212,168,67,0.6);font-size:12px">STREAK</td><td style="text-align:right;font-size:22px;color:#F0EAD8">DAY ${dn}</td></tr>
</table>
<p style="margin-top:24px"><a href="https://firstlight.live" style="color:#D4A843">View on firstlight.live →</a></p>
<p style="font-size:12px;color:rgba(240,234,216,0.5);margin-top:28px">— Sent every Sunday at 07:00 IST.</p>`,
    'WEEKLY RECAP')
  await _sendEmail(`[FL] Week ${String(week).padStart(2, '0')} · ${totalKm} km · ${dayCount}/7 mornings held`, html, `Week ${week}: ${totalKm} km, ${dayCount}/7 days — firstlight.live`)
  return { sent: 'weekly', week, day: dn, totalKm, dayCount, totalMin }
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

    if (action === 'preflight') {
      const result = await preflight()
      return new Response(JSON.stringify(result), { headers })
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
