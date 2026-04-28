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

  if (!tokenResp.access_token) { log.push('Strava: token refresh failed'); return }

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
      } catch (e) { log.push(`Instagram: ⚠ refresh failed: ${(e as Error).message}`) }
    }
  }

  // Pull latest 10 posts
  const posts = await fetch(
    `https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}/media?fields=id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count,permalink&limit=10&access_token=${igToken}`
  ).then(r => r.json())

  if (!posts?.data?.length) { log.push('Instagram: no posts'); return }

  const streakStart = new Date('2026-02-10')
  let synced = 0
  for (const p of posts.data) {
    const postDate = new Date(p.timestamp)
    const dayNum = Math.floor((postDate.getTime() - streakStart.getTime()) / 86400000) + 1
    const row = {
      id: p.id, ig_id: p.id,
      caption: (p.caption || '').substring(0, 10000),
      media_type: p.media_type, media_url: p.media_url,
      thumbnail_url: p.thumbnail_url, permalink: p.permalink,
      timestamp: p.timestamp,
      like_count: p.like_count || 0, comments_count: p.comments_count || 0,
      day_number: dayNum
    }
    try { await supaUpsert('instagram_posts', row, 'id'); synced++ } catch (_e) { /* skip */ }
  }
  log.push(`Instagram: ${synced}/${posts.data.length} synced`)

  // Migrate images to Supabase Storage (instead of GCS)
  await migrateImagesToStorage(log, igToken)
}

async function migrateImagesToStorage(log: string[], _igToken: string) {
  const { data: posts } = await supaAdmin.from('instagram_posts')
    .select('id,media_url,day_number')
    .not('media_url', 'like', '%supabase%')
    .not('media_url', 'is', null)
    .limit(5)

  if (!posts?.length) return
  let migrated = 0
  for (const p of posts) {
    if (!p.media_url || p.media_url.includes('supabase')) continue
    try {
      const imgResp = await fetch(p.media_url)
      if (!imgResp.ok) continue
      const blob = await imgResp.blob()
      const path = `instagram/day${p.day_number || 0}_${p.id.substring(0, 8)}.jpg`
      const { error } = await supaAdmin.storage.from('media').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
      if (!error) {
        const publicUrl = `${SUPA_URL}/storage/v1/object/public/media/${path}`
        await supaAdmin.from('instagram_posts').update({ media_url: publicUrl }).eq('id', p.id)
        migrated++
      }
    } catch (_e) { /* skip */ }
  }
  if (migrated > 0) log.push(`IG→Storage: ${migrated} images migrated`)
}

// ═══════════════════════════════════════════
// PROOF ARCHIVE SYNC
// ═══════════════════════════════════════════
async function syncProofArchive(log: string[]) {
  const stravaToken = await getSecret('strava_access')
  if (!stravaToken) return

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const streakStart = new Date('2026-02-10')
  const dayNum = Math.floor((new Date(today).getTime() - streakStart.getTime()) / 86400000) + 1

  // Get today's activities from Supabase (already synced by syncStrava)
  const { data: todayActivities } = await supaAdmin.from('strava_activities')
    .select('*')
    .gte('start_date_local', today + 'T00:00:00')
    .lt('start_date_local', today + 'T23:59:59')

  if (!todayActivities?.length) return

  const run = todayActivities.find((a: Record<string, unknown>) => a.type === 'Run')
  const ride = todayActivities.find((a: Record<string, unknown>) => a.type === 'Ride')
  const swim = todayActivities.find((a: Record<string, unknown>) => a.type === 'Swim')
  const gym = todayActivities.find((a: Record<string, unknown>) => a.type === 'Workout' || a.type === 'WeightTraining')

  if (!run && !ride && !swim && !gym) return

  // Parse sleep from latest IG caption
  let sleep: number | null = null
  const igToken = await getSecret('ig_access')
  if (igToken) {
    try {
      const latest = await fetch(
        `https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}/media?fields=caption&limit=1&access_token=${igToken}`
      ).then(r => r.json())
      const caption = latest?.data?.[0]?.caption || ''
      const sleepMatch = caption.match(/(\d+\.?\d*)\s*h\s*sleep/i) || caption.match(/Fuel:\s*(\d+\.?\d*)\s*h/i)
      if (sleepMatch) sleep = parseFloat(sleepMatch[1])
    } catch (_e) { /* ignore */ }
  }

  // Check existing row
  const { data: existing } = await supaAdmin.from('proof_archive')
    .select('sleep_hrs,food_clean,gym,run_km,cycle_km,swim_km')
    .eq('date', today).single()

  let bestSleep = sleep
  if (!bestSleep && existing?.sleep_hrs) bestSleep = existing.sleep_hrs
  // Check health_daily for Apple Watch sleep
  if (!bestSleep) {
    const { data: hd } = await supaAdmin.from('health_daily').select('sleep_hours').eq('date', today).single()
    if (hd?.sleep_hours) bestSleep = hd.sleep_hours
  }
  if (!bestSleep) {
    const { data: sl } = await supaAdmin.from('sleep_log').select('sleep_hours').eq('date', today).single()
    if (sl?.sleep_hours) bestSleep = sl.sleep_hours
  }

  const runDist = run ? (run.distance / 1000).toFixed(2) : null
  const runSpeed = run?.average_speed || 0
  const row: Record<string, unknown> = {
    date: today, day_number: dayNum,
    run_km: runDist || (existing?.run_km ?? null),
    run_time_sec: run ? run.moving_time : null,
    run_pace: run && runSpeed > 0 ? `${Math.floor(1000 / runSpeed / 60)}:${String(Math.round(((1000 / runSpeed / 60) % 1) * 60)).padStart(2, '0')}` : null,
    avg_hr: run ? (run.average_heartrate || null) : null,
    max_hr: run ? (run.max_heartrate || null) : null,
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
    strava_id: run ? run.id : (ride ? ride.id : null)
  }

  // CRITICAL: Only include sleep if we have a value
  if (bestSleep) row.sleep_hrs = bestSleep

  await supaUpsert('proof_archive', row, 'date')
  const parts = []
  if (row.run_km) parts.push(row.run_km + 'km run')
  if (row.cycle_km) parts.push(row.cycle_km + 'km ride')
  log.push(`Proof: Day ${dayNum} synced — ${parts.join(' + ') || 'gym only'}`)
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
        if (dp.totalSleep != null) day.sleep_hours = parseFloat(String(dp.totalSleep))
        else if (dp.asleep != null) day.sleep_hours = parseFloat(String(dp.asleep))
        else if (qty != null) day.sleep_hours = qty
        if (dp.deep != null) day.sleep_deep_min = Math.round(parseFloat(String(dp.deep)) * 60)
        if (dp.rem != null) day.sleep_rem_min = Math.round(parseFloat(String(dp.rem)) * 60)
        if (dp.core != null) day.sleep_core_min = Math.round(parseFloat(String(dp.core)) * 60)
        if (dp.inBed != null && dp.totalSleep != null)
          day.sleep_awake_min = Math.round((parseFloat(String(dp.inBed)) - parseFloat(String(dp.totalSleep))) * 60)
        if (dp.inBedStart) day.bedtime = toTime(String(dp.inBedStart))
        if (dp.inBedEnd) day.wake_time = toTime(String(dp.inBedEnd))
      }
      else if (name === 'heart_rate') {
        if (dp.Avg != null) day.avg_hr = Math.round(parseFloat(String(dp.Avg)))
        if (dp.Max != null) day.max_hr = Math.round(parseFloat(String(dp.Max)))
        if (dp.Min != null) day.min_hr = Math.round(parseFloat(String(dp.Min)))
      }
      else if (name === 'resting_heart_rate') { if (qty != null) day.resting_hr = Math.round(qty) }
      else if (name === 'heart_rate_variability') { if (qty != null) day.hrv_avg = qty }
      else if (name === 'heart_rate_variability_sdnn') { if (qty != null) day.hrv_sdnn = qty }
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

  function sleepScore(r: Record<string, unknown>) {
    let s = 0
    const h = Number(r.sleep_hours || 0)
    if (h >= 7 && h <= 9) s += 40; else if (h >= 6) s += 30; else if (h >= 5) s += 20; else if (h > 0) s += 10
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

      row.raw_payload = data.raw

      await supaUpsert('health_daily', row, 'date')

      if (row.sleep_hours) {
        await supaUpsert('sleep_log', { date, sleep_hours: row.sleep_hours, bedtime: row.bedtime || null, wake_time: row.wake_time || null, source: 'health_auto_export' }, 'date')

        const streakStart = new Date('2026-02-10')
        const dn = Math.floor((new Date(date).getTime() - streakStart.getTime()) / 86400000) + 1
        const proofRow: Record<string, unknown> = { date, sleep_hrs: row.sleep_hours }
        if (dn > 0) proofRow.day_number = dn
        await supaUpsert('proof_archive', proofRow, 'date')

        await supaUpsert('daily_logs', { date, sleep_hrs: row.sleep_hours, wake_time: row.wake_time || null }, 'date')
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
    const params = (body.params || {}) as Record<string, string>
    params.access_token = igToken
    const qs = Object.entries(params).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&')
    const apiUrl = 'https://graph.facebook.com/v21.0/' + body.endpoint + '?' + qs
    const resp = await fetch(apiUrl, { method: 'POST' })
    return await resp.json()
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

  // Wait for processing
  await new Promise(r => setTimeout(r, 3000))

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
