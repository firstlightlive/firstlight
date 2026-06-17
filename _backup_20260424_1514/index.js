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
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (d) => data += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, data: data }); }
      });
    });
    req.on('error', reject);
    if (typeof body === 'string') req.write(body);
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

  // If token is invalid or expired, log error (needs manual regeneration)
  if (!isValid || daysLeft < 0) {
    log.push('⚠ Instagram: TOKEN EXPIRED OR INVALID — needs manual regeneration via Graph API Explorer');
  }

  // Refresh if < 30 days remaining but still valid
  // Also try refresh if daysLeft is 0 (last day) — might still work
  if (isValid && daysLeft < 30 && daysLeft >= 0) {
    try {
      const newToken = await httpGet(
        `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${IG_APP_ID}&client_secret=${IG_APP_SECRET}&fb_exchange_token=${igToken}`
      );
      if (newToken.access_token) {
        igToken = newToken.access_token;
        await saveToken('ig_access', igToken);
        log.push('Instagram: ✅ token refreshed (new 60-day token)');
      } else {
        log.push('Instagram: ⚠ refresh returned no token: ' + JSON.stringify(newToken).substring(0, 100));
      }
    } catch (refreshErr) {
      log.push('Instagram: ⚠ refresh failed: ' + refreshErr.message);
    }
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

  // Build row — NEVER overwrite existing non-null values with null
  const row = {
    date: today,
    day_number: dayNum,
    sleep_hrs: sleep || (prev ? prev.sleep_hrs : null),
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
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

  const log = [];
  const startTime = Date.now();
  const action = req.query.action || req.body?.action || 'sync';

  // ── AUTH CHECK — require API key for all mutating actions ──
  const requestKey = req.headers['x-admin-key'] || '';
  const isAuthed = ADMIN_API_KEY && requestKey === ADMIN_API_KEY;

  // Health check is the only unauthenticated action
  if (action !== 'health' && !isAuthed) {
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
