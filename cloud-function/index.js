const functions = require('@google-cloud/functions-framework');
const { Storage } = require('@google-cloud/storage');
const https = require('https');

// ═══════════════════════════════════════════
// FIRSTLIGHT — Cloud Sync Function
// Runs on Cloud Scheduler: 5:55 AM, 6:15 AM, 9 AM, 7 PM, 2 AM IST
// Zero Mac dependency. Runs forever in Google Cloud.
// ═══════════════════════════════════════════

// Config — loaded from environment variables
const SUPA_URL = process.env.SUPA_URL;
const SUPA_KEY = process.env.SUPA_KEY;
const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const IG_APP_ID = process.env.IG_APP_ID;
const IG_APP_SECRET = process.env.IG_APP_SECRET;
const IG_ACCOUNT_ID = process.env.IG_ACCOUNT_ID || '17841466893616231';
const GCS_BUCKET = 'firstlightlive';

const storage = new Storage();

// ── HTTP helpers ──
function httpGet(url, headers) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : require('http');
    proto.get(url, { headers: headers || {} }, (res) => {
      let data = '';
      res.on('data', (d) => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve(data); }
      });
    }).on('error', reject);
  });
}

function httpPost(url, body, headers) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers }
    };
    if (Buffer.isBuffer(body)) options.headers['Content-Length'] = body.length;
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (d) => data += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, data: data }); }
      });
    });
    req.on('error', reject);
    if (Buffer.isBuffer(body)) req.write(body);
    else if (typeof body === 'string') req.write(body);
    else req.write(JSON.stringify(body));
    req.end();
  });
}

function httpFormPost(url, formData) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const body = Object.entries(formData).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (d) => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve(data); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function supaUpsert(table, data, conflict) {
  return httpPost(`${SUPA_URL}/rest/v1/${table}${conflict || ''}`, data, {
    'apikey': SUPA_KEY,
    'Authorization': `Bearer ${SUPA_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates'
  });
}

function supaGet(table, query) {
  return httpGet(`${SUPA_URL}/rest/v1/${table}${query || ''}`, {
    'apikey': SUPA_KEY,
    'Authorization': `Bearer ${SUPA_KEY}`
  });
}

// ── Token storage via Secret Manager (secure, not public) ──
const SECRET_MAP = {
  'strava_refresh': 'fl-strava-refresh',
  'strava_access': 'fl-strava-access',
  'ig_access': 'fl-ig-access'
};
const PROJECT_ID = 'project-f050b6ba-60db-4eee-98a';

async function getToken(name) {
  try {
    const secretName = SECRET_MAP[name];
    if (!secretName) return null;
    const url = `https://secretmanager.googleapis.com/v1/projects/${PROJECT_ID}/secrets/${secretName}/versions/latest:access`;
    const { GoogleAuth } = require('google-auth-library');
    const auth = new GoogleAuth();
    const client = await auth.getClient();
    const res = await client.request({ url });
    const payload = res.data.payload.data;
    return Buffer.from(payload, 'base64').toString('utf8').trim();
  } catch (e) {
    // Fallback: try GCS (for migration period)
    try {
      const [content] = await storage.bucket(GCS_BUCKET).file(`tokens/${name}`).download();
      return content.toString().trim();
    } catch (e2) { return null; }
  }
}

async function saveToken(name, value) {
  try {
    const secretName = SECRET_MAP[name];
    if (!secretName) return;
    const url = `https://secretmanager.googleapis.com/v1/projects/${PROJECT_ID}/secrets/${secretName}:addVersion`;
    const { GoogleAuth } = require('google-auth-library');
    const auth = new GoogleAuth();
    const client = await auth.getClient();
    await client.request({
      url,
      method: 'POST',
      data: { payload: { data: Buffer.from(value.trim()).toString('base64') } }
    });
  } catch (e) {
    // Fallback: save to GCS
    await storage.bucket(GCS_BUCKET).file(`tokens/${name}`).save(value.trim());
  }
}

// ═══════════════════════════════════════════
// STRAVA SYNC
// ═══════════════════════════════════════════
async function syncStrava(log) {
  log.push('Strava: starting...');

  const refreshToken = await getToken('strava_refresh');
  if (!refreshToken) { log.push('Strava: no refresh token'); return; }

  // Refresh access token
  const tokenResp = await httpFormPost('https://www.strava.com/oauth/token', {
    client_id: STRAVA_CLIENT_ID,
    client_secret: STRAVA_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });

  if (!tokenResp.access_token) { log.push('Strava: token refresh failed'); return; }

  await saveToken('strava_access', tokenResp.access_token);
  await saveToken('strava_refresh', tokenResp.refresh_token);
  log.push('Strava: token refreshed');

  // Pull last 3 days of activities
  const threeDaysAgo = Math.floor(Date.now() / 1000) - (3 * 86400);
  const activities = await httpGet(
    `https://www.strava.com/api/v3/athlete/activities?per_page=30&after=${threeDaysAgo}`,
    { 'Authorization': `Bearer ${tokenResp.access_token}` }
  );

  if (!Array.isArray(activities)) { log.push('Strava: no activities'); return; }
  log.push(`Strava: found ${activities.length} recent activities`);

  let synced = 0;
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
    };
    const r = await supaUpsert('strava_activities', row, '?on_conflict=id');
    if (r.status < 300) synced++;
  }
  log.push(`Strava: ${synced}/${activities.length} synced`);
}

// ═══════════════════════════════════════════
// INSTAGRAM SYNC
// ═══════════════════════════════════════════
async function syncInstagram(log) {
  log.push('Instagram: starting...');

  let igToken = await getToken('ig_access');
  if (!igToken) { log.push('Instagram: no token'); return; }

  // Check token expiry
  const debug = await httpGet(
    `https://graph.facebook.com/v21.0/debug_token?input_token=${igToken}&access_token=${igToken}`
  );
  const isValid = debug?.data?.is_valid;
  const expiresAt = debug?.data?.expires_at || 0;
  const daysLeft = expiresAt > 0 ? Math.floor((expiresAt - Date.now() / 1000) / 86400) : -1;
  log.push(`Instagram: token valid=${isValid}, expires in ${daysLeft} days`);

  // Save token health to Supabase config for dashboard visibility
  try {
    await supaUpsert('config', {
      key: 'IG_TOKEN_HEALTH',
      value: JSON.stringify({ valid: isValid, days_left: daysLeft, checked_at: new Date().toISOString(), expires_at: expiresAt })
    }, '?on_conflict=key');
  } catch(e) {}

  // If token is invalid or expired, log critical error
  if (!isValid || daysLeft < 0) {
    log.push('⚠ Instagram: TOKEN EXPIRED OR INVALID — needs manual regeneration via Graph API Explorer');
  }

  // AGGRESSIVE REFRESH: refresh if < 45 days remaining (gives 15-day safety buffer)
  // Runs on every sync (5x daily) so token is always fresh
  if (isValid && daysLeft < 45 && daysLeft >= 0) {
    let refreshed = false;
    for (let attempt = 0; attempt < 3 && !refreshed; attempt++) {
      try {
        const newToken = await httpGet(
          `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${IG_APP_ID}&client_secret=${IG_APP_SECRET}&fb_exchange_token=${igToken}`
        );
        if (newToken.access_token) {
          igToken = newToken.access_token;
          await saveToken('ig_access', igToken);
          log.push(`Instagram: ✅ token refreshed (new 60-day token, attempt ${attempt + 1})`);
          refreshed = true;
          // Update health after refresh
          try {
            await supaUpsert('config', {
              key: 'IG_TOKEN_HEALTH',
              value: JSON.stringify({ valid: true, days_left: 60, refreshed_at: new Date().toISOString(), expires_at: Math.floor(Date.now()/1000) + 60*86400 })
            }, '?on_conflict=key');
          } catch(e) {}
        } else {
          log.push(`Instagram: ⚠ refresh attempt ${attempt + 1} returned no token`);
          if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
        }
      } catch (refreshErr) {
        log.push(`Instagram: ⚠ refresh attempt ${attempt + 1} failed: ${refreshErr.message}`);
        if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
      }
    }
    if (!refreshed) log.push('⚠ Instagram: ALL 3 REFRESH ATTEMPTS FAILED — token has ' + daysLeft + ' days left');
  }

  // Pull latest 10 posts
  const posts = await httpGet(
    `https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}/media?fields=id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count,permalink&limit=10&access_token=${igToken}`
  );

  if (!posts?.data?.length) { log.push('Instagram: no posts'); return; }

  const streakStart = new Date('2026-02-10');
  let synced = 0;

  for (const p of posts.data) {
    const postDate = new Date(p.timestamp);
    const dayNum = Math.floor((postDate - streakStart) / 86400000) + 1;

    const row = {
      id: p.id, ig_id: p.id,
      caption: (p.caption || '').substring(0, 10000),
      media_type: p.media_type,
      media_url: p.media_url,
      thumbnail_url: p.thumbnail_url,
      permalink: p.permalink,
      timestamp: p.timestamp,
      like_count: p.like_count || 0,
      comments_count: p.comments_count || 0,
      day_number: dayNum
    };
    const r = await supaUpsert('instagram_posts', row, '?on_conflict=id');
    if (r.status < 300) synced++;
  }
  log.push(`Instagram: ${synced}/${posts.data.length} synced`);

  // Migrate new images to GCS
  await migrateImagesToGCS(log);
}

// ── Migrate Instagram CDN images to GCS ──
async function migrateImagesToGCS(log) {
  const posts = await supaGet('instagram_posts',
    '?media_url=not.like.*storage.googleapis.com*&media_url=not.is.null&select=id,media_url,day_number&limit=5'
  );

  if (!Array.isArray(posts) || !posts.length) return;

  let migrated = 0;
  for (const p of posts) {
    if (!p.media_url || p.media_url.includes('storage.googleapis.com')) continue;
    try {
      // Download image
      const imageBuffer = await new Promise((resolve, reject) => {
        https.get(p.media_url, (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', reject);
      });

      // Upload to GCS
      const gcsName = `media/instagram/day${p.day_number || 0}_${p.id.substring(0, 8)}.jpg`;
      await storage.bucket(GCS_BUCKET).file(gcsName).save(imageBuffer, { contentType: 'image/jpeg' });

      // Update Supabase
      const gcsUrl = `https://storage.googleapis.com/${GCS_BUCKET}/${gcsName}`;
      await httpPost(`${SUPA_URL}/rest/v1/instagram_posts?id=eq.${p.id}`, { media_url: gcsUrl }, {
        'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json'
      });
      migrated++;
    } catch (e) { /* skip failed */ }
  }
  if (migrated > 0) log.push(`IG→GCS: ${migrated} images migrated`);
}

// ═══════════════════════════════════════════
// PROOF ARCHIVE SYNC
// ═══════════════════════════════════════════
async function syncProofArchive(log) {
  const stravaToken = await getToken('strava_access');
  if (!stravaToken) return;

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const streakStart = new Date('2026-02-10');
  const dayNum = Math.floor((new Date(today) - streakStart) / 86400000) + 1;

  // Get today's run from Strava
  const yesterday = Math.floor(Date.now() / 1000) - 86400;
  const activities = await httpGet(
    `https://www.strava.com/api/v3/athlete/activities?per_page=10&after=${yesterday}`,
    { 'Authorization': `Bearer ${stravaToken}` }
  );

  if (!Array.isArray(activities)) return;

  // Find today's activities by type
  const todayActivities = activities.filter(a => a.start_date_local?.startsWith(today));
  const run = todayActivities.find(a => a.type === 'Run' && a.distance / 1000 >= 2);
  const ride = todayActivities.find(a => a.type === 'Ride' && a.distance / 1000 >= 1);
  const swim = todayActivities.find(a => a.type === 'Swim');
  const gym = todayActivities.find(a => a.type === 'Workout' || a.type === 'WeightTraining');

  // Need at least one activity to sync
  if (!run && !ride && !swim && !gym) return;

  // Parse sleep from latest IG caption
  let sleep = null;
  const igToken = await getToken('ig_access');
  if (igToken) {
    const latest = await httpGet(
      `https://graph.facebook.com/v21.0/${IG_ACCOUNT_ID}/media?fields=caption&limit=1&access_token=${igToken}`
    );
    const caption = latest?.data?.[0]?.caption || '';
    const sleepMatch = caption.match(/(\d+\.?\d*)\s*h\s*sleep/i) || caption.match(/Fuel:\s*(\d+\.?\d*)\s*h/i);
    if (sleepMatch) sleep = parseFloat(sleepMatch[1]);
  }

  // First: check if a row already exists for today
  const existing = await supaGet('proof_archive', `?date=eq.${today}&select=sleep_hrs,food_clean,gym,run_km,cycle_km,swim_km`);
  const prev = Array.isArray(existing) && existing.length > 0 ? existing[0] : null;

  // Also check health_daily + sleep_log for Apple Watch sleep data
  // This ensures sleep from Health Auto Export is NEVER lost
  let bestSleep = sleep; // from IG caption
  if (!bestSleep && prev && prev.sleep_hrs) bestSleep = prev.sleep_hrs; // existing proof_archive
  if (!bestSleep) {
    // Fallback: check health_daily (from Apple Watch via Health Auto Export)
    try {
      const healthRow = await supaGet('health_daily', `?date=eq.${today}&select=sleep_hours&limit=1`);
      if (Array.isArray(healthRow) && healthRow.length > 0 && healthRow[0].sleep_hours) {
        bestSleep = healthRow[0].sleep_hours;
      }
    } catch(e) {}
  }
  if (!bestSleep) {
    // Fallback: check sleep_log
    try {
      const sleepRow = await supaGet('sleep_log', `?date=eq.${today}&select=sleep_hours&limit=1`);
      if (Array.isArray(sleepRow) && sleepRow.length > 0 && sleepRow[0].sleep_hours) {
        bestSleep = sleepRow[0].sleep_hours;
      }
    } catch(e) {}
  }

  // Build row — NEVER overwrite existing non-null values with null
  const row = {
    date: today,
    day_number: dayNum,
    // Run data
    run_km: run ? (run.distance / 1000).toFixed(2) : (prev ? prev.run_km : null),
    run_time_sec: run ? run.moving_time : null,
    run_pace: run && run.average_speed > 0 ? `${Math.floor(1000 / run.average_speed / 60)}:${String(Math.round(((1000 / run.average_speed / 60) % 1) * 60)).padStart(2, '0')}` : null,
    avg_hr: run ? (run.average_heartrate || null) : null,
    max_hr: run ? (run.max_heartrate || null) : null,
    calories: (run ? run.calories : 0) + (ride ? ride.calories : 0) + (swim ? swim.calories : 0) || null,
    elevation: run ? (run.total_elevation_gain || null) : null,
    // Cycling data
    cycle_km: ride ? (ride.distance / 1000).toFixed(2) : (prev ? prev.cycle_km : null),
    cycle_time_sec: ride ? ride.moving_time : null,
    // Swimming data
    swim_km: swim ? (swim.distance / 1000).toFixed(2) : (prev ? prev.swim_km : null),
    swim_time_sec: swim ? swim.moving_time : null,
    // Gym
    gym: !!gym || (prev ? prev.gym : false),
    gym_duration_min: gym ? Math.round(gym.moving_time / 60) : null,
    food_clean: prev ? prev.food_clean : true,
    run_source: 'strava',
    strava_id: run ? run.id : (ride ? ride.id : null)
  };

  // CRITICAL: Only include sleep_hrs if we have a real value.
  // Never send sleep_hrs:null — it would overwrite Apple Watch data via merge-duplicates.
  if (bestSleep) {
    row.sleep_hrs = bestSleep;
  }

  await supaUpsert('proof_archive', row, '?on_conflict=date');
  const parts = [];
  if (row.run_km) parts.push(row.run_km + 'km run');
  if (row.cycle_km) parts.push(row.cycle_km + 'km ride');
  if (row.swim_km) parts.push(row.swim_km + 'km swim');
  log.push(`Proof: Day ${dayNum} synced — ${parts.join(' + ') || 'gym only'}`);
}

// ═══════════════════════════════════════════
// DAILY BACKUP
// ═══════════════════════════════════════════
async function dailyBackup(log) {
  const tables = ['instagram_posts', 'strava_activities', 'proof_archive', 'slips', 'comments', 'daily_checkin', 'reading_log', 'architecture_log'];
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  let totalRows = 0;

  const backup = {};
  for (const table of tables) {
    const data = await supaGet(table, '?select=*');
    if (Array.isArray(data)) {
      backup[table] = data;
      totalRows += data.length;
    }
  }

  const backupJson = JSON.stringify(backup);
  await storage.bucket(GCS_BUCKET).file(`archive/supabase/cloud_backup_${date}.json`).save(backupJson, {
    contentType: 'application/json',
    gzip: true
  });

  log.push(`Backup: ${tables.length} tables, ${totalRows} rows → GCS`);
}

// ═══════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════
// Admin API key for authenticating requests
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

functions.http('sync', async (req, res) => {
  // CORS — restricted to FirstLight domains only
  const allowedOrigins = ['https://firstlight.live', 'https://www.firstlight.live', 'https://firstlightlive-5012b.web.app', 'http://localhost:5000'];
  const origin = req.headers.origin || '';
  if (allowedOrigins.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
  }
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, X-Webhook-Secret');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

  const log = [];
  const startTime = Date.now();
  const action = req.query.action || req.body?.action || 'sync';

  // ── AUTH CHECK — require API key for all mutating actions ──
  const requestKey = req.headers['x-admin-key'] || '';
  const isAuthed = ADMIN_API_KEY && requestKey === ADMIN_API_KEY;

  // Health check, image proxy, and health-ingest (has its own secret) are unauthenticated
  if (action !== 'health' && action !== 'image' && action !== 'health-ingest' && !isAuthed) {
    res.status(403).json({ error: 'Unauthorized — missing or invalid API key' });
    return;
  }

  try {
    // ── Instagram publish proxy — token stays on server ──
    if (action === 'publish') {
      const igToken = await getToken('ig_access');
      if (!igToken) { res.status(500).json({ error: 'No Instagram token available — token may have expired. Check Secret Manager.' }); return; }

      const body = req.body;
      const publishType = body.type; // 'container', 'carousel', 'publish', 'comment', 'status'
      const igId = IG_ACCOUNT_ID;

      // Helper: extract IG API result, forward errors properly
      function sendIgResult(result, label) {
        const data = result.data || result;
        // IG API returns errors inside the data body even on HTTP 200
        if (data && data.error) {
          const errMsg = data.error.error_user_msg || data.error.message || JSON.stringify(data.error);
          log.push(`IG ${label} error: ${errMsg}`);
          res.status(400).json({ error: errMsg, ig_error: data.error });
        } else if (result.status && result.status >= 400) {
          log.push(`IG ${label} HTTP ${result.status}`);
          res.status(result.status).json({ error: `Instagram API returned HTTP ${result.status}`, data: data });
        } else {
          res.json(data);
        }
      }

      try {
        if (publishType === 'container') {
          const params = new URLSearchParams({ access_token: igToken });
          if (body.image_url) params.append('image_url', body.image_url);
          if (body.video_url) params.append('video_url', body.video_url);
          if (body.is_carousel_item) params.append('is_carousel_item', 'true');
          if (body.media_type) params.append('media_type', body.media_type);
          if (body.caption) params.append('caption', body.caption);
          if (body.children) params.append('children', body.children);

          const result = await httpPost(`https://graph.facebook.com/v21.0/${igId}/media`, params.toString(), {
            'Content-Type': 'application/x-www-form-urlencoded'
          });
          sendIgResult(result, 'container');
        } else if (publishType === 'publish') {
          if (!body.creation_id) { res.status(400).json({ error: 'Missing creation_id' }); return; }
          const result = await httpPost(`https://graph.facebook.com/v21.0/${igId}/media_publish`,
            `creation_id=${body.creation_id}&access_token=${igToken}`, {
            'Content-Type': 'application/x-www-form-urlencoded'
          });
          sendIgResult(result, 'publish');
        } else if (publishType === 'comment') {
          if (!body.media_id || !body.message) { res.status(400).json({ error: 'Missing media_id or message' }); return; }
          const result = await httpPost(`https://graph.facebook.com/v21.0/${body.media_id}/comments`,
            `message=${encodeURIComponent(body.message)}&access_token=${igToken}`, {
            'Content-Type': 'application/x-www-form-urlencoded'
          });
          sendIgResult(result, 'comment');
        } else if (publishType === 'status') {
          if (!body.container_id) { res.status(400).json({ error: 'Missing container_id' }); return; }
          const result = await httpGet(`https://graph.facebook.com/v21.0/${body.container_id}?fields=status_code&access_token=${igToken}`);
          // Status check: forward IG errors too
          if (result && result.error) {
            res.status(400).json({ error: result.error.message || 'Status check failed', ig_error: result.error });
          } else {
            res.json(result);
          }
        } else {
          res.status(400).json({ error: 'Unknown publish type: ' + publishType });
        }
      } catch (publishErr) {
        log.push(`IG publish proxy error: ${publishErr.message}`);
        res.status(500).json({ error: 'Publish proxy error: ' + publishErr.message });
      }
      return;
    }

    if (action === 'upload') {
      // Handle image upload to GCS from browser
      const body = req.body;
      if (body && body.data && body.filename) {
        // Strip data URL prefix if present
        let rawBase64 = body.data;
        if (rawBase64.indexOf('base64,') > -1) {
          rawBase64 = rawBase64.split('base64,')[1];
        }
        const buffer = Buffer.from(rawBase64, 'base64');

        // ── File size limit: 50MB max ──
        if (buffer.length > 50 * 1024 * 1024) {
          res.status(413).json({ error: 'File too large — 50MB max' });
          return;
        }

        // ── Sanitize filename + folder ──
        const safeName = body.filename.replace(/\.\./g, '').replace(/[^a-zA-Z0-9._\/-]/g, '_');
        // Accept folder param (photos/profile, photos/races, etc.) — default to instagram/
        const allowedFolders = ['instagram', 'photos/profile', 'photos/races', 'photos/bibs', 'photos/about', 'photos/progress', 'storage/media', 'storage/voice'];
        let folder = 'instagram';
        if (body.folder && allowedFolders.some(f => body.folder.startsWith(f))) {
          folder = body.folder.replace(/\.\./g, '').replace(/[^a-zA-Z0-9._\/-]/g, '_');
        }
        const filename = folder + '/' + safeName;

        // Detect file type from magic bytes
        const isJPEG = buffer[0] === 0xFF && buffer[1] === 0xD8;
        const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50;
        const isWebM = buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3;
        const isMP4 = buffer.length > 7 && buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70;
        const isVideo = isWebM || isMP4;

        // Determine content type
        var contentType = 'image/jpeg'; // default
        if (isJPEG) contentType = 'image/jpeg';
        else if (isPNG) contentType = 'image/png';
        else if (isWebM) contentType = 'video/webm';
        else if (isMP4) contentType = 'video/mp4';

        // Also detect from data URL mime if magic bytes didn't match
        const mimeFromUrl = body.data.match(/^data:([^;]+);/);
        if (mimeFromUrl && mimeFromUrl[1].indexOf('video') > -1) {
          contentType = mimeFromUrl[1];
        }

        log.push('Upload: ' + filename + ' type=' + contentType + ' size=' + buffer.length);

        const file = storage.bucket(GCS_BUCKET).file(filename);
        await file.save(buffer, {
          contentType: contentType,
          metadata: { cacheControl: 'public, max-age=31536000' }
        });
        const publicUrl = 'https://storage.googleapis.com/' + GCS_BUCKET + '/' + filename;
        log.push('Uploaded: ' + filename + ' (' + buffer.length + ' bytes, ' + (isJPEG ? 'JPEG' : isPNG ? 'PNG' : 'unknown') + ')');
        res.json({ url: publicUrl, publicUrl: publicUrl, format: isJPEG ? 'jpeg' : isPNG ? 'png' : 'unknown', size: buffer.length });
        return;
      }
      res.status(400).json({ error: 'Missing data or filename' });
      return;
    }
    // ── Image proxy: serve GCS files via Cloud Function URL (IG can always fetch this) ──
    if (action === 'image') {
      const path = req.query.path;
      if (!path) { res.status(400).send('Missing path'); return; }
      try {
        const [buffer] = await storage.bucket(GCS_BUCKET).file(path).download();
        const ext = path.split('.').pop().toLowerCase();
        const ct = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        res.set('Content-Type', ct);
        res.set('Cache-Control', 'public, max-age=86400');
        res.send(buffer);
      } catch(e) {
        res.status(404).send('Not found');
      }
      return;
    }

    // ═══════════════════════════════════════════════════════════════
    // SERVER-SIDE PUBLISH — Fault-tolerant pipeline
    // Browser sends images as base64, server handles EVERYTHING:
    // Upload → Verify → Container → Poll → Publish → Comment
    // Uses Cloud Function proxy URL for images (IG can always fetch)
    // ═══════════════════════════════════════════════════════════════
    if (action === 'server-publish') {
      const body = req.body;
      const publishType = body.publish_type; // 'carousel', 'story'
      const igToken = await getToken('ig_access');
      if (!igToken) { res.status(500).json({ error: 'No Instagram token — check Secret Manager' }); return; }
      // Upload to Supabase Storage — IG can fetch from supabase.co (GCS URLs are blocked by IG)
      async function uploadToSupaStorage(buffer, filename) {
        const supaStorageUrl = `${SUPA_URL}/storage/v1/object/media/instagram/${filename}`;
        const resp = await httpPost(supaStorageUrl, buffer, {
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${SUPA_KEY}`,
          'Content-Type': 'image/jpeg',
          'x-upsert': 'true'
        });
        return `${SUPA_URL}/storage/v1/object/public/media/instagram/${filename}`;
      }
      const igId = IG_ACCOUNT_ID;

      try {
        if (publishType === 'carousel') {
          // body.slides = [{data: 'base64...', filename: 'slide1.jpg'}, ...]
          // body.caption = 'caption text'
          // body.first_comment = 'hashtags...'
          const slides = body.slides || [];
          if (slides.length < 2) { res.status(400).json({ error: 'Need at least 2 slides' }); return; }

          log.push(`Carousel: ${slides.length} slides received`);

          // Step 1: Upload all slides to GCS
          const imageUrls = [];
          for (let i = 0; i < slides.length; i++) {
            let rawBase64 = slides[i].data;
            if (rawBase64.indexOf('base64,') > -1) rawBase64 = rawBase64.split('base64,')[1];
            const buffer = Buffer.from(rawBase64, 'base64');
            const fname = `instagram/${slides[i].filename || ('slide_' + Date.now() + '_' + i + '.jpg')}`;
            // Save to GCS as backup
            const gcsFile = storage.bucket(GCS_BUCKET).file(fname);
            await gcsFile.save(buffer, { contentType: 'image/jpeg', metadata: { cacheControl: 'public, max-age=31536000' } });
            // Upload to Supabase Storage — IG can ONLY fetch from supabase.co (GCS blocked)
            const slideName = slides[i].filename || ('slide_' + Date.now() + '_' + i + '.jpg');
            const url = await uploadToSupaStorage(buffer, slideName);
            imageUrls.push(url);
            log.push(`Uploaded slide ${i + 1}: ${slideName} (${buffer.length} bytes)`);
          }

          // Step 2: Wait for GCS propagation
          await new Promise(r => setTimeout(r, 4000));

          // Step 3: Verify ALL images are accessible
          for (const url of imageUrls) {
            for (let v = 0; v < 3; v++) {
              try {
                const checkRes = await httpGet(url);
                if (checkRes || typeof checkRes === 'string') break;
              } catch(e) {}
              await new Promise(r => setTimeout(r, 2000));
            }
          }

          // Step 4: Create carousel item containers
          const children = [];
          for (let j = 0; j < imageUrls.length; j++) {
            const params = new URLSearchParams({ access_token: igToken, image_url: imageUrls[j], is_carousel_item: 'true' });
            let containerResult;
            for (let attempt = 0; attempt < 3; attempt++) {
              containerResult = await httpPost(`https://graph.facebook.com/v21.0/${igId}/media`, params.toString(), { 'Content-Type': 'application/x-www-form-urlencoded' });
              const d = containerResult.data || containerResult;
              if (d && d.id) { children.push(d.id); log.push(`Container ${j+1}: ${d.id}`); break; }
              if (attempt < 2) { log.push(`Container ${j+1} retry ${attempt+1}: ${JSON.stringify(d).substring(0,100)}`); await new Promise(r => setTimeout(r, 3000)); }
              else { res.status(500).json({ error: `Container ${j+1} failed after 3 attempts: ${JSON.stringify(d).substring(0,150)}`, log }); return; }
            }
          }

          // Step 5: Create carousel container
          const carouselParams = new URLSearchParams({ access_token: igToken, media_type: 'CAROUSEL', children: children.join(','), caption: body.caption || '' });
          const carouselResult = await httpPost(`https://graph.facebook.com/v21.0/${igId}/media`, carouselParams.toString(), { 'Content-Type': 'application/x-www-form-urlencoded' });
          const carouselData = carouselResult.data || carouselResult;
          if (!carouselData || !carouselData.id) { res.status(500).json({ error: 'Carousel creation failed: ' + JSON.stringify(carouselData).substring(0,200), log }); return; }
          log.push(`Carousel container: ${carouselData.id}`);

          // Step 6: Poll until ready
          let ready = false;
          for (let p = 0; p < 30; p++) {
            await new Promise(r => setTimeout(r, Math.min(3000 + p * 500, 6000)));
            const status = await httpGet(`https://graph.facebook.com/v21.0/${carouselData.id}?fields=status_code&access_token=${igToken}`);
            if (status && status.status_code === 'FINISHED') { ready = true; break; }
            if (status && status.status_code === 'ERROR') { res.status(500).json({ error: 'IG rejected carousel during processing', log }); return; }
            if (!status || !status.status_code) { ready = true; break; }
          }
          if (!ready) { res.status(500).json({ error: 'Carousel processing timeout', log }); return; }

          // Step 7: Publish
          const pubResult = await httpPost(`https://graph.facebook.com/v21.0/${igId}/media_publish`, `creation_id=${carouselData.id}&access_token=${igToken}`, { 'Content-Type': 'application/x-www-form-urlencoded' });
          const pubData = pubResult.data || pubResult;
          if (!pubData || !pubData.id) { res.status(500).json({ error: 'Publish failed: ' + JSON.stringify(pubData).substring(0,200), log }); return; }
          log.push(`Published: ${pubData.id}`);

          // Step 8: First comment (non-critical)
          if (body.first_comment) {
            try {
              await httpPost(`https://graph.facebook.com/v21.0/${pubData.id}/comments`, `message=${encodeURIComponent(body.first_comment)}&access_token=${igToken}`, { 'Content-Type': 'application/x-www-form-urlencoded' });
              log.push('First comment posted');
            } catch(ce) { log.push('First comment failed (non-critical): ' + ce.message); }
          }

          res.json({ success: true, post_id: pubData.id, slides: imageUrls.length, log });

        } else if (publishType === 'story') {
          // body.image = 'base64...'
          // body.filename = 'day74_story.jpg'
          if (!body.image) { res.status(400).json({ error: 'Missing image data' }); return; }

          log.push('Story: received');

          // Step 1: Upload to Supabase Storage (IG can fetch) + GCS backup
          let rawBase64 = body.image;
          if (rawBase64.indexOf('base64,') > -1) rawBase64 = rawBase64.split('base64,')[1];
          const buffer = Buffer.from(rawBase64, 'base64');
          const storyName = body.filename || ('story_' + Date.now() + '.jpg');
          const fname = `instagram/${storyName}`;
          // GCS backup
          const gcsFile = storage.bucket(GCS_BUCKET).file(fname);
          await gcsFile.save(buffer, { contentType: 'image/jpeg', metadata: { cacheControl: 'public, max-age=31536000' } });
          // Supabase Storage — IG fetches from here
          const url = await uploadToSupaStorage(buffer, storyName);
          log.push(`Uploaded: ${storyName} (${buffer.length} bytes)`);
          log.push(`Supabase URL: ${url}`);

          // Step 2: Brief wait
          await new Promise(r => setTimeout(r, 2000));

          // Step 3: Create story container with retries
          let storyData;
          for (let attempt = 0; attempt < 3; attempt++) {
            const params = new URLSearchParams({ access_token: igToken, media_type: 'STORIES', image_url: url });
            const result = await httpPost(`https://graph.facebook.com/v21.0/${igId}/media`, params.toString(), { 'Content-Type': 'application/x-www-form-urlencoded' });
            const d = result.data || result;
            if (d && d.id) { storyData = d; break; }
            if (attempt < 2) { log.push(`Story container retry ${attempt+1}: ${JSON.stringify(d).substring(0,100)}`); await new Promise(r => setTimeout(r, 3000)); }
            else { res.status(500).json({ error: 'Story container failed: ' + JSON.stringify(d).substring(0,200), log }); return; }
          }

          // Step 4: Poll + publish
          for (let p = 0; p < 15; p++) {
            await new Promise(r => setTimeout(r, 2000));
            const status = await httpGet(`https://graph.facebook.com/v21.0/${storyData.id}?fields=status_code&access_token=${igToken}`);
            if (!status || !status.status_code || status.status_code === 'FINISHED') break;
            if (status.status_code === 'ERROR') { res.status(500).json({ error: 'Story processing failed', log }); return; }
          }

          const pubResult = await httpPost(`https://graph.facebook.com/v21.0/${igId}/media_publish`, `creation_id=${storyData.id}&access_token=${igToken}`, { 'Content-Type': 'application/x-www-form-urlencoded' });
          const pubData = pubResult.data || pubResult;
          if (!pubData || !pubData.id) { res.status(500).json({ error: 'Story publish failed: ' + JSON.stringify(pubData).substring(0,200), log }); return; }

          log.push(`Story published: ${pubData.id}`);
          res.json({ success: true, post_id: pubData.id, log });

        } else {
          res.status(400).json({ error: 'Unknown publish_type: ' + publishType });
        }
      } catch(e) {
        log.push('Server publish error: ' + e.message);
        res.status(500).json({ error: e.message, log });
      }
      return;
    }

    // Dedicated IG token refresh — can be called independently or via Cloud Scheduler
    if (action === 'refresh-token') {
      await syncInstagram(log); // syncInstagram handles token check + refresh internally
      res.json({ success: true, log: log });
      return;
    }

    // ── IG API PROXY — Token injected server-side (never exposed to browser) ──
    // Client sends: { endpoint: "17841.../media", params: { image_url: "...", is_carousel_item: "true" } }
    // Server adds access_token from Secret Manager and forwards to Graph API
    if (action === 'ig-proxy') {
      try {
        const igToken = await getToken('ig_access');
        if (!igToken) { res.status(500).json({ error: 'No IG token — check Secret Manager' }); return; }

        const body = req.body;

        // Support legacy format: { url: "https://graph.facebook.com/..." }
        if (body.url) {
          let targetUrl = body.url;
          // Replace any client-side token with server token
          targetUrl = targetUrl.replace(/access_token=[^&]+/, 'access_token=' + encodeURIComponent(igToken));
          // If no access_token in URL, add it
          if (!targetUrl.includes('access_token=')) {
            targetUrl += (targetUrl.includes('?') ? '&' : '?') + 'access_token=' + encodeURIComponent(igToken);
          }
          const result = await httpPost(targetUrl, '', {});
          res.json(result.data || result);
          return;
        }

        // New secure format: { endpoint, params }
        if (body.endpoint) {
          const params = body.params || {};
          params.access_token = igToken;
          const qs = Object.entries(params).map(([k,v]) => k + '=' + encodeURIComponent(v)).join('&');
          const apiUrl = 'https://graph.facebook.com/v21.0/' + body.endpoint + '?' + qs;
          const result = await httpPost(apiUrl, '', {});
          res.json(result.data || result);
          return;
        }

        res.status(400).json({ error: 'Missing endpoint or url' });
      } catch(e) {
        res.status(500).json({ error: e.message });
      }
      return;
    }

    // ── HEALTH AUTO EXPORT WEBHOOK ──
    // Receives Apple Watch data from Health Auto Export app (POST JSON)
    // URL: ?action=health-ingest  |  Header: X-Webhook-Secret
    if (action === 'health-ingest') {
      const HEALTH_SECRET = process.env.HEALTH_WEBHOOK_SECRET || '';
      if (HEALTH_SECRET) {
        const provided = req.headers['x-webhook-secret']
          || (req.headers['authorization'] || '').replace('Bearer ', '')
          || '';
        if (provided !== HEALTH_SECRET) {
          res.status(401).json({ error: 'Invalid webhook secret' });
          return;
        }
      }

      const body = req.body;
      if (!body) { res.status(400).json({ error: 'Empty payload' }); return; }

      const container = body.data || body;
      const metrics = container.metrics || [];
      const workouts = container.workouts || [];
      const dailyMap = {};

      function ensureDay(d) { if (!dailyMap[d]) dailyMap[d] = { raw: {} }; return dailyMap[d]; }
      function toDate(s) { return s ? s.substring(0, 10) : null; }
      function toTime(s) { return s ? s.substring(11, 16) : null; }

      // Parse metrics
      for (const m of metrics) {
        const name = (m.name || '').toLowerCase().replace(/\s+/g, '_');
        const unit = m.units || '';
        for (const dp of (m.data || [])) {
          const date = toDate(dp.date || dp.dateString || dp.start || '');
          if (!date || date.length !== 10) continue;
          const day = ensureDay(date);
          day.raw[name] = { ...dp, unit };

          // Sleep (aggregated)
          if (name === 'sleep_analysis' || name === 'apple_sleep_in_bed') {
            if (dp.totalSleep != null) day.sleep_hours = parseFloat(dp.totalSleep);
            else if (dp.asleep != null) day.sleep_hours = parseFloat(dp.asleep);
            else if (dp.qty != null) day.sleep_hours = parseFloat(dp.qty);
            if (dp.deep != null) day.sleep_deep_min = Math.round(parseFloat(dp.deep) * 60);
            if (dp.rem != null) day.sleep_rem_min = Math.round(parseFloat(dp.rem) * 60);
            if (dp.core != null) day.sleep_core_min = Math.round(parseFloat(dp.core) * 60);
            if (dp.inBed != null && dp.totalSleep != null)
              day.sleep_awake_min = Math.round((parseFloat(dp.inBed) - parseFloat(dp.totalSleep)) * 60);
            if (dp.inBedStart) day.bedtime = toTime(dp.inBedStart);
            if (dp.inBedEnd) day.wake_time = toTime(dp.inBedEnd);
          }
          // Heart rate (Min/Avg/Max)
          else if (name === 'heart_rate') {
            if (dp.Avg != null) day.avg_hr = Math.round(parseFloat(dp.Avg));
            if (dp.Max != null) day.max_hr = Math.round(parseFloat(dp.Max));
            if (dp.Min != null) day.min_hr = Math.round(parseFloat(dp.Min));
          }
          // Resting HR
          else if (name === 'resting_heart_rate') {
            if (dp.qty != null) day.resting_hr = Math.round(parseFloat(dp.qty));
          }
          // HRV
          else if (name === 'heart_rate_variability') {
            if (dp.qty != null) day.hrv_avg = parseFloat(dp.qty);
          }
          else if (name === 'heart_rate_variability_sdnn') {
            if (dp.qty != null) day.hrv_sdnn = parseFloat(dp.qty);
          }
          // VO2 Max
          else if (name === 'vo2_max' || name === 'vo2max') {
            if (dp.qty != null) day.vo2_max = parseFloat(dp.qty);
          }
          // Calories (app sends 'active_energy' in kJ or 'active_energy_burned' in kcal)
          else if (name === 'active_energy_burned') {
            if (dp.qty != null) day.active_calories = Math.round(parseFloat(dp.qty));
          }
          else if (name === 'active_energy') {
            // Convert kJ to kcal if unit is kJ, otherwise use raw
            const val = parseFloat(dp.qty);
            if (unit.toLowerCase().includes('kj')) day.active_calories = Math.round(val / 4.184);
            else day.active_calories = Math.round(val);
          }
          else if (name === 'basal_energy_burned' || name === 'basal_energy') {
            const val = parseFloat(dp.qty);
            if (unit.toLowerCase().includes('kj')) day.basal_calories = Math.round(val / 4.184);
            else if (dp.qty != null) day.basal_calories = Math.round(val);
          }
          // Activity rings
          else if (name === 'apple_exercise_time') {
            if (dp.qty != null) day.exercise_minutes = Math.round(parseFloat(dp.qty));
          }
          else if (name === 'apple_stand_hour' || name === 'apple_stand_time') {
            if (dp.qty != null) day.stand_hours = Math.round(parseFloat(dp.qty));
          }
          // Steps & distance
          else if (name === 'step_count') {
            if (dp.qty != null) day.steps = Math.round(parseFloat(dp.qty));
          }
          else if (name === 'distance_walking_running') {
            if (dp.qty != null) day.distance_km = parseFloat(dp.qty);
          }
          else if (name === 'flights_climbed') {
            if (dp.qty != null) day.flights_climbed = Math.round(parseFloat(dp.qty));
          }
          // Mobility
          else if (name === 'walking_speed') { if (dp.qty != null) day.walking_speed = parseFloat(dp.qty); }
          else if (name === 'walking_step_length') { if (dp.qty != null) day.walking_step_length = parseFloat(dp.qty); }
          else if (name === 'walking_asymmetry_percentage') { if (dp.qty != null) day.walking_asymmetry = parseFloat(dp.qty); }
          else if (name === 'walking_double_support_percentage') { if (dp.qty != null) day.walking_double_support = parseFloat(dp.qty); }
          // Body
          else if (name === 'body_mass') { if (dp.qty != null) day.weight_kg = parseFloat(dp.qty); }
          else if (name === 'body_mass_index') { if (dp.qty != null) day.bmi = parseFloat(dp.qty); }
          else if (name === 'body_fat_percentage') { if (dp.qty != null) day.body_fat_pct = parseFloat(dp.qty); }
          else if (name === 'lean_body_mass') { if (dp.qty != null) day.lean_body_mass = parseFloat(dp.qty); }
          // Blood & respiratory
          else if (name === 'blood_oxygen' || name === 'oxygen_saturation' || name === 'blood_oxygen_saturation') { if (dp.qty != null) day.blood_oxygen_pct = parseFloat(dp.qty); }
          else if (name === 'respiratory_rate') { if (dp.qty != null) day.respiratory_rate = parseFloat(dp.qty); }
          // Cardio recovery (heart rate recovery after exercise)
          else if (name === 'cardio_recovery') { if (dp.qty != null) day.raw['cardio_recovery_bpm'] = parseFloat(dp.qty); }
          // Noise
          else if (name === 'environmental_audio_exposure' || name === 'headphone_audio_exposure') { if (dp.qty != null) day.noise_exposure_db = parseFloat(dp.qty); }
        }
      }

      // Parse workouts
      for (const w of workouts) {
        const date = toDate(w.start || '');
        if (!date) continue;
        const day = ensureDay(date);
        if (!day._workouts) day._workouts = [];
        day._workouts.push({
          type: (w.name || 'unknown').toLowerCase().replace(/\s+/g, '_'),
          duration_min: w.duration ? Math.round(w.duration / 60) : 0,
          calories: w.activeEnergyBurned ? Math.round(w.activeEnergyBurned.qty || 0) : 0,
        });
      }

      // Sleep score calculator
      function sleepScore(r) {
        let s = 0;
        const h = r.sleep_hours || 0;
        if (h >= 7 && h <= 9) s += 40; else if (h >= 6) s += 30; else if (h >= 5) s += 20; else if (h > 0) s += 10;
        const d = r.sleep_deep_min || 0;
        if (d >= 60 && d <= 120) s += 25; else if (d >= 30) s += 15; else if (d > 0) s += 5;
        const rm = r.sleep_rem_min || 0;
        if (rm >= 90) s += 25; else if (rm >= 60) s += 15; else if (rm > 0) s += 5;
        const aw = r.sleep_awake_min || 0;
        if (aw <= 20) s += 10; else if (aw <= 40) s += 5;
        return Math.min(100, s);
      }

      const dates = Object.keys(dailyMap).sort();
      let ingested = 0;
      const errors = [];

      for (const date of dates) {
        try {
          const data = dailyMap[date];
          const row = { date };
          const cols = [
            'sleep_hours','sleep_deep_min','sleep_rem_min','sleep_core_min','sleep_awake_min','bedtime','wake_time',
            'resting_hr','avg_hr','max_hr','min_hr','hrv_avg','hrv_sdnn','vo2_max',
            'active_calories','basal_calories','exercise_minutes','stand_hours',
            'steps','distance_km','flights_climbed','walking_speed','walking_step_length',
            'walking_asymmetry','walking_double_support',
            'weight_kg','bmi','body_fat_pct','lean_body_mass',
            'blood_oxygen_pct','respiratory_rate','noise_exposure_db'
          ];
          for (const c of cols) { if (data[c] !== undefined && data[c] !== null) row[c] = data[c]; }

          if (row.active_calories && row.basal_calories) row.total_calories = Math.round(row.active_calories + row.basal_calories);
          if (row.sleep_hours) row.sleep_score = sleepScore(row);

          if (data._workouts && data._workouts.length > 0) {
            row.workout_count = data._workouts.length;
            row.workout_types = data._workouts.map(w => w.type);
            row.workout_total_min = data._workouts.reduce((s, w) => s + (w.duration_min || 0), 0);
            row.workout_total_cal = data._workouts.reduce((s, w) => s + (w.calories || 0), 0);
          }

          row.raw_payload = data.raw;

          // Upsert health_daily
          await supaUpsert('health_daily', row, '?on_conflict=date');

          // Sync sleep to ALL tables that read it (idempotent — safe to run 100x)
          if (row.sleep_hours) {
            // 1. sleep_log — homepage fallback reads this
            await supaUpsert('sleep_log', {
              date, sleep_hours: row.sleep_hours,
              bedtime: row.bedtime || null, wake_time: row.wake_time || null,
              source: 'health_auto_export'
            }, '?on_conflict=date');

            // 2. proof_archive — homepage reads this FIRST (sleep_hrs column)
            // Only send sleep_hrs (never null for other cols) — safe with merge-duplicates
            var proofRow = { date, sleep_hrs: row.sleep_hours };
            // Ensure day_number is set if this creates a new row
            var streakStart = new Date('2026-02-10');
            var dn = Math.floor((new Date(date) - streakStart) / 86400000) + 1;
            if (dn > 0) proofRow.day_number = dn;
            await supaUpsert('proof_archive', proofRow, '?on_conflict=date');

            // 3. daily_logs — app.js streak calculator reads this
            await supaUpsert('daily_logs', {
              date, sleep_hrs: row.sleep_hours,
              wake_time: row.wake_time || null,
            }, '?on_conflict=date');
          }

          // Individual metrics
          for (const [mName, info] of Object.entries(data.raw)) {
            const val = info.qty || info.Avg || info.totalSleep || null;
            if (val != null) {
              await supaUpsert('health_metrics', {
                date, metric: mName, value: parseFloat(val),
                unit: info.unit || '', source: 'health_auto_export', raw_json: info
              }, '?on_conflict=date,metric');
            }
          }

          ingested++;
        } catch (dateErr) {
          errors.push({ date, error: dateErr.message });
        }
      }

      log.push(`Health ingest: ${ingested} days processed, ${errors.length} errors`);
      res.json({ success: true, ingested, dates_processed: dates, errors: errors.length ? errors : undefined });
      return;
    }

    if (action === 'sync' || action === 'all') {
      await syncStrava(log);
      await syncInstagram(log);
      await syncProofArchive(log);
    }
    if (action === 'backup' || action === 'all') {
      await dailyBackup(log);
    }

    const duration = Date.now() - startTime;
    log.push(`Done in ${duration}ms`);

    // Check for warnings and save health status to Supabase
    const warnings = log.filter(l => l.includes('⚠') || l.includes('ERROR') || l.includes('failed'));
    const healthStatus = {
      last_sync: new Date().toISOString(),
      status: warnings.length > 0 ? 'warning' : 'healthy',
      warnings: warnings.join(' | ').substring(0, 500),
      duration_ms: duration
    };

    // Save health to Supabase config table
    try {
      await httpPost(`${SUPA_URL}/rest/v1/config?on_conflict=key`,
        { key: 'SYNC_HEALTH', value: JSON.stringify(healthStatus) },
        { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' }
      );
    } catch(he) {}

    // Save log to GCS
    const logDate = new Date().toISOString();
    await storage.bucket(GCS_BUCKET).file(`logs/sync_${logDate.split('T')[0]}.log`).save(
      `${logDate}\n${log.join('\n')}\n---\n`,
      { metadata: { contentType: 'text/plain' } }
    ).catch(() => {});

    res.json({ success: true, duration, health: healthStatus });
  } catch (e) {
    log.push(`ERROR: ${e.message}`);

    // Save error health status
    try {
      await httpPost(`${SUPA_URL}/rest/v1/config?on_conflict=key`,
        { key: 'SYNC_HEALTH', value: JSON.stringify({ last_sync: new Date().toISOString(), status: 'error', warnings: e.message, duration_ms: 0 }) },
        { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' }
      );
    } catch(he2) {}

    res.status(500).json({ success: false, error: 'Internal sync error' });
  }
});
