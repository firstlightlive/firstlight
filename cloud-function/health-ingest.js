/**
 * FIRST LIGHT — Health Auto Export Webhook Ingest
 * Receives JSON from Health Auto Export app (by HealthyApps) → writes to Supabase
 *
 * Payload format: { "data": { "metrics": [...], "workouts": [...] } }
 * Date format from app: "yyyy-MM-dd HH:mm:ss Z" (e.g., "2026-04-27 06:30:00 +0530")
 *
 * Deploy as separate Cloud Function:
 *   gcloud functions deploy firstlight-health-ingest \
 *     --runtime=nodejs20 --trigger-http --allow-unauthenticated \
 *     --region=asia-south1 --entry-point=healthIngest \
 *     --set-env-vars SUPABASE_URL=https://edgnudrbysybefbqyijq.supabase.co,SUPABASE_SERVICE_KEY=<key>,HEALTH_WEBHOOK_SECRET=<secret>
 */

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const WEBHOOK_SECRET = process.env.HEALTH_WEBHOOK_SECRET || '';

async function supabaseUpsert(table, data, onConflict) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${table} upsert failed: ${res.status} ${err}`);
  }
  return res.status;
}

/**
 * Extract YYYY-MM-DD from Health Auto Export date string
 * Input: "2026-04-27 06:30:00 +0530"
 * Output: "2026-04-27"
 */
function extractDate(dateStr) {
  if (!dateStr) return null;
  return dateStr.substring(0, 10);
}

/**
 * Extract HH:MM time from Health Auto Export date string
 * Input: "2026-04-27 06:30:00 +0530"
 * Output: "06:30"
 */
function extractTime(dateStr) {
  if (!dateStr) return null;
  return dateStr.substring(11, 16);
}

/**
 * Parse the Health Auto Export JSON payload
 *
 * Actual payload structure from the app:
 * {
 *   "data": {
 *     "metrics": [
 *       { "name": "step_count", "units": "steps", "data": [{ "date": "...", "qty": 8432 }] },
 *       { "name": "heart_rate", "units": "bpm", "data": [{ "date": "...", "Min": 58, "Avg": 72, "Max": 145 }] },
 *       { "name": "sleep_analysis", "units": "hr", "data": [{ "date": "...", "totalSleep": 7.5, "deep": 1.1, "rem": 2.5, "core": 3.2, "inBed": 8, "inBedStart": "...", "inBedEnd": "..." }] }
 *     ],
 *     "workouts": [
 *       { "name": "Running", "start": "...", "end": "...", "duration": 2700, "distance": { "qty": 7.2, "units": "km" }, ... }
 *     ]
 *   }
 * }
 */
function parseHealthPayload(body) {
  const container = body.data || body;
  const metrics = container.metrics || [];
  const workouts = container.workouts || [];
  const dailyMap = {}; // date → { col: value, raw: {} }

  function ensureDate(date) {
    if (!dailyMap[date]) dailyMap[date] = { raw: {} };
    return dailyMap[date];
  }

  // Process each metric
  for (const m of metrics) {
    const name = (m.name || '').toLowerCase().replace(/\s+/g, '_');
    const unit = m.units || m.unit || '';
    const dataPoints = m.data || [];

    for (const dp of dataPoints) {
      const date = extractDate(dp.date || dp.dateString || dp.start || '');
      if (!date) continue;

      const day = ensureDate(date);
      day.raw[name] = { ...dp, unit };

      // ── SLEEP (aggregated format from Health Auto Export) ──
      if (name === 'sleep_analysis' || name === 'apple_sleep_in_bed') {
        if (dp.totalSleep != null) day.sleep_hours = parseFloat(dp.totalSleep);
        else if (dp.asleep != null) day.sleep_hours = parseFloat(dp.asleep);
        else if (dp.qty != null) day.sleep_hours = parseFloat(dp.qty);

        if (dp.deep != null) day.sleep_deep_min = Math.round(parseFloat(dp.deep) * 60);
        if (dp.rem != null) day.sleep_rem_min = Math.round(parseFloat(dp.rem) * 60);
        if (dp.core != null) day.sleep_core_min = Math.round(parseFloat(dp.core) * 60);

        // Awake time = inBed - totalSleep (in minutes)
        if (dp.inBed != null && dp.totalSleep != null) {
          day.sleep_awake_min = Math.round((parseFloat(dp.inBed) - parseFloat(dp.totalSleep)) * 60);
        }

        if (dp.inBedStart) day.bedtime = extractTime(dp.inBedStart);
        if (dp.inBedEnd) day.wake_time = extractTime(dp.inBedEnd);
      }

      // ── HEART RATE (Min/Avg/Max format) ──
      else if (name === 'heart_rate') {
        if (dp.Avg != null) day.avg_hr = Math.round(parseFloat(dp.Avg));
        if (dp.Max != null) day.max_hr = Math.round(parseFloat(dp.Max));
        if (dp.Min != null) day.min_hr = Math.round(parseFloat(dp.Min));
      }

      // ── RESTING HEART RATE ──
      else if (name === 'resting_heart_rate') {
        if (dp.qty != null) day.resting_hr = Math.round(parseFloat(dp.qty));
      }

      // ── HRV ──
      else if (name === 'heart_rate_variability' || name === 'heart_rate_variability_sdnn') {
        const val = parseFloat(dp.qty || dp.Avg || 0);
        if (name.includes('sdnn')) day.hrv_sdnn = val;
        else day.hrv_avg = val;
      }

      // ── VO2 MAX ──
      else if (name === 'vo2_max' || name === 'vo2max') {
        if (dp.qty != null) day.vo2_max = parseFloat(dp.qty);
      }

      // ── CALORIES ──
      else if (name === 'active_energy_burned') {
        if (dp.qty != null) day.active_calories = Math.round(parseFloat(dp.qty));
      }
      else if (name === 'basal_energy_burned') {
        if (dp.qty != null) day.basal_calories = Math.round(parseFloat(dp.qty));
      }

      // ── ACTIVITY RINGS ──
      else if (name === 'apple_exercise_time') {
        if (dp.qty != null) day.exercise_minutes = Math.round(parseFloat(dp.qty));
      }
      else if (name === 'apple_stand_hour' || name === 'apple_stand_time') {
        if (dp.qty != null) day.stand_hours = Math.round(parseFloat(dp.qty));
      }

      // ── STEPS & DISTANCE ──
      else if (name === 'step_count') {
        if (dp.qty != null) day.steps = Math.round(parseFloat(dp.qty));
      }
      else if (name === 'distance_walking_running') {
        if (dp.qty != null) day.distance_km = parseFloat(dp.qty);
      }
      else if (name === 'flights_climbed') {
        if (dp.qty != null) day.flights_climbed = Math.round(parseFloat(dp.qty));
      }

      // ── MOBILITY ──
      else if (name === 'walking_speed') {
        if (dp.qty != null) day.walking_speed = parseFloat(dp.qty);
      }
      else if (name === 'walking_step_length') {
        if (dp.qty != null) day.walking_step_length = parseFloat(dp.qty);
      }
      else if (name === 'walking_asymmetry_percentage') {
        if (dp.qty != null) day.walking_asymmetry = parseFloat(dp.qty);
      }
      else if (name === 'walking_double_support_percentage') {
        if (dp.qty != null) day.walking_double_support = parseFloat(dp.qty);
      }

      // ── BODY ──
      else if (name === 'body_mass') {
        if (dp.qty != null) day.weight_kg = parseFloat(dp.qty);
      }
      else if (name === 'body_mass_index') {
        if (dp.qty != null) day.bmi = parseFloat(dp.qty);
      }
      else if (name === 'body_fat_percentage') {
        if (dp.qty != null) day.body_fat_pct = parseFloat(dp.qty);
      }
      else if (name === 'lean_body_mass') {
        if (dp.qty != null) day.lean_body_mass = parseFloat(dp.qty);
      }

      // ── BLOOD & RESPIRATORY ──
      else if (name === 'blood_oxygen' || name === 'oxygen_saturation') {
        if (dp.qty != null) day.blood_oxygen_pct = parseFloat(dp.qty);
      }
      else if (name === 'respiratory_rate') {
        if (dp.qty != null) day.respiratory_rate = parseFloat(dp.qty);
      }

      // ── NOISE ──
      else if (name === 'environmental_audio_exposure' || name === 'headphone_audio_exposure') {
        if (dp.qty != null) day.noise_exposure_db = parseFloat(dp.qty);
      }
    }
  }

  // Process workouts — aggregate per day
  for (const w of workouts) {
    const date = extractDate(w.start || '');
    if (!date) continue;

    const day = ensureDate(date);
    if (!day._workouts) day._workouts = [];

    day._workouts.push({
      type: (w.name || 'unknown').toLowerCase().replace(/\s+/g, '_'),
      duration_min: w.duration ? Math.round(w.duration / 60) : 0,
      calories: w.activeEnergyBurned ? Math.round(w.activeEnergyBurned.qty || 0) : 0,
      distance_km: w.distance ? parseFloat(w.distance.qty || 0) : 0,
      avg_hr: w.avgHeartRate || null,
      max_hr: w.maxHeartRate || null,
    });
  }

  return dailyMap;
}

/**
 * Compute sleep score (0-100)
 * Weighted: duration(40) + deep(25) + REM(25) + low awakenings(10)
 */
function computeSleepScore(row) {
  let score = 0;
  const hrs = row.sleep_hours || 0;
  if (hrs >= 7 && hrs <= 9) score += 40;
  else if (hrs >= 6) score += 30;
  else if (hrs >= 5) score += 20;
  else if (hrs > 0) score += 10;

  const deep = row.sleep_deep_min || 0;
  if (deep >= 60 && deep <= 120) score += 25;
  else if (deep >= 30) score += 15;
  else if (deep > 0) score += 5;

  const rem = row.sleep_rem_min || 0;
  if (rem >= 90) score += 25;
  else if (rem >= 60) score += 15;
  else if (rem > 0) score += 5;

  const awake = row.sleep_awake_min || 0;
  if (awake <= 20) score += 10;
  else if (awake <= 40) score += 5;

  return Math.min(100, score);
}

/**
 * Main Cloud Function handler
 */
async function healthIngest(req, res) {
  // CORS
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Webhook-Secret');
    return res.status(204).send('');
  }
  res.set('Access-Control-Allow-Origin', '*');

  // Auth check
  if (WEBHOOK_SECRET) {
    const provided = req.headers['x-webhook-secret']
      || req.headers['authorization']?.replace('Bearer ', '')
      || req.query.secret || '';
    if (provided !== WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Invalid webhook secret' });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  try {
    const body = req.body;
    if (!body) {
      return res.status(400).json({ error: 'Empty payload' });
    }

    const dailyMap = parseHealthPayload(body);
    const dates = Object.keys(dailyMap).sort();

    if (dates.length === 0) {
      return res.status(200).json({ message: 'No parseable data points', ingested: 0 });
    }

    let ingested = 0;
    const errors = [];

    for (const date of dates) {
      try {
        const data = dailyMap[date];

        // Build health_daily row
        const dailyRow = { date };
        const cols = [
          'sleep_hours','sleep_deep_min','sleep_rem_min','sleep_core_min','sleep_awake_min',
          'bedtime','wake_time',
          'resting_hr','avg_hr','max_hr','min_hr','hrv_avg','hrv_sdnn',
          'vo2_max','active_calories','basal_calories','exercise_minutes','stand_hours',
          'steps','distance_km','flights_climbed','walking_speed',
          'walking_step_length','walking_asymmetry','walking_double_support',
          'weight_kg','bmi','body_fat_pct','lean_body_mass',
          'blood_oxygen_pct','respiratory_rate','noise_exposure_db'
        ];

        for (const col of cols) {
          if (data[col] !== undefined && data[col] !== null) {
            dailyRow[col] = data[col];
          }
        }

        // Computed fields
        if (dailyRow.active_calories && dailyRow.basal_calories) {
          dailyRow.total_calories = Math.round(dailyRow.active_calories + dailyRow.basal_calories);
        }
        if (dailyRow.sleep_hours) {
          dailyRow.sleep_score = computeSleepScore(dailyRow);
        }

        // Workouts
        if (data._workouts && data._workouts.length > 0) {
          dailyRow.workout_count = data._workouts.length;
          dailyRow.workout_types = data._workouts.map(w => w.type);
          dailyRow.workout_total_min = data._workouts.reduce((s, w) => s + (w.duration_min || 0), 0);
          dailyRow.workout_total_cal = data._workouts.reduce((s, w) => s + (w.calories || 0), 0);
        }

        // Raw payload for future analysis
        dailyRow.raw_payload = data.raw;

        // 1. Upsert health_daily
        await supabaseUpsert('health_daily', dailyRow, 'date');

        // 2. Update sleep_log for backward compat with homepage
        if (dailyRow.sleep_hours) {
          await supabaseUpsert('sleep_log', {
            date,
            sleep_hours: dailyRow.sleep_hours,
            bedtime: dailyRow.bedtime || null,
            wake_time: dailyRow.wake_time || null,
            source: 'health_auto_export'
          }, 'date');
        }

        // 3. Store individual metrics in health_metrics
        for (const [metricName, info] of Object.entries(data.raw)) {
          const val = info.qty || info.Avg || info.totalSleep || null;
          if (val != null) {
            await supabaseUpsert('health_metrics', {
              date,
              metric: metricName,
              value: parseFloat(val),
              unit: info.unit || '',
              source: 'health_auto_export',
              raw_json: info
            }, 'date,metric');
          }
        }

        ingested++;
      } catch (dateErr) {
        errors.push({ date, error: dateErr.message });
      }
    }

    return res.status(200).json({
      message: 'Health data ingested',
      dates_processed: dates,
      ingested,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (err) {
    console.error('Health ingest error:', err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { healthIngest };
