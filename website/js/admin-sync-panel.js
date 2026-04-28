// ═══════════════════════════════════════════
// FIRST LIGHT — SYNC CENTER PANEL
// ═══════════════════════════════════════════

var _syncInProgress = false;
var _CF_SYNC_URL = 'https://edgnudrbysybefbqyijq.supabase.co/functions/v1/firstlight-sync';
var _SYNC_ADMIN_KEY = localStorage.getItem('fl_admin_key') || '';
var _SUPA_AUTH = 'Bearer ' + (FL.SUPABASE_ANON_KEY || '');

function renderSyncCenter() {
  _loadSyncHealth();
  _loadSyncStats();
  _bindSyncButtons();
}

function _bindSyncButtons() {
  var btnStrava = document.getElementById('btnSyncStrava');
  var btnIg = document.getElementById('btnSyncInstagram');
  var btnAll = document.getElementById('btnSyncAll');

  if (btnStrava && !btnStrava._bound) {
    btnStrava._bound = true;
    btnStrava.addEventListener('click', function() { _triggerSync('sync', 'strava'); });
  }
  if (btnIg && !btnIg._bound) {
    btnIg._bound = true;
    btnIg.addEventListener('click', function() { _triggerSync('sync', 'instagram'); });
  }
  if (btnAll && !btnAll._bound) {
    btnAll._bound = true;
    btnAll.addEventListener('click', function() { _triggerSync('all', 'all'); });
  }
}

async function _triggerSync(action, source) {
  // Prevent duplicate syncs
  if (_syncInProgress) {
    _showSyncLog(source, '⚠ Sync already in progress. Please wait.');
    return;
  }

  _syncInProgress = true;
  var btn = source === 'strava' ? document.getElementById('btnSyncStrava') :
            source === 'instagram' ? document.getElementById('btnSyncInstagram') :
            document.getElementById('btnSyncAll');
  var originalText = btn ? btn.textContent : '';
  var statusEl = source === 'strava' ? document.getElementById('syncStravaStatus') :
                 source === 'instagram' ? document.getElementById('syncIgStatus') : null;

  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ SYNCING...';
    btn.style.opacity = '0.6';
  }
  if (statusEl) {
    statusEl.textContent = 'SYNCING...';
    statusEl.style.color = 'var(--gold)';
  }

  _showSyncLog(source, '⏳ Starting ' + source + ' sync...');

  try {
    var resp = await fetch(_CF_SYNC_URL + '?action=' + action, {
      method: 'GET',
      headers: { 'X-Admin-Key': _SYNC_ADMIN_KEY, 'Authorization': _SUPA_AUTH }
    });
    var data = await resp.json();

    if (data.success) {
      var dur = (data.duration / 1000).toFixed(1);
      _showSyncLog(source, '✅ Sync completed in ' + dur + 's');

      if (statusEl) {
        statusEl.textContent = data.health && data.health.warnings ? '⚠ WARNING' : '✅ HEALTHY';
        statusEl.style.color = data.health && data.health.warnings ? 'var(--gold)' : 'var(--green)';
      }

      if (data.health && data.health.warnings) {
        _appendSyncLog(source, '⚠ ' + data.health.warnings);
      }

      // Refresh stats
      _loadSyncStats();
      _loadSyncHealth();

      // Refresh dashboard if visible
      if (typeof buildDashboardStats === 'function') {
        try { buildDashboardStats(); } catch(e) {}
      }
    } else {
      _showSyncLog(source, '❌ Sync failed: ' + (data.error || 'Unknown error'));
      if (statusEl) {
        statusEl.textContent = '❌ ERROR';
        statusEl.style.color = 'var(--red)';
      }
    }
  } catch (e) {
    _showSyncLog(source, '❌ Network error: ' + e.message);
    if (statusEl) {
      statusEl.textContent = '❌ OFFLINE';
      statusEl.style.color = 'var(--red)';
    }
  }

  _syncInProgress = false;
  if (btn) {
    btn.disabled = false;
    btn.textContent = originalText;
    btn.style.opacity = '1';
  }
}

function _showSyncLog(source, msg) {
  var logEl = source === 'strava' ? document.getElementById('syncStravaLog') :
              source === 'instagram' ? document.getElementById('syncIgLog') :
              document.getElementById('syncStravaLog'); // all → show in strava log
  if (!logEl) return;
  logEl.style.display = 'block';
  var time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  logEl.innerHTML = '<div>[' + time + '] ' + msg + '</div>';
}

function _appendSyncLog(source, msg) {
  var logEl = source === 'strava' ? document.getElementById('syncStravaLog') :
              source === 'instagram' ? document.getElementById('syncIgLog') :
              document.getElementById('syncStravaLog');
  if (!logEl) return;
  var time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  logEl.innerHTML += '<div>[' + time + '] ' + msg + '</div>';
}

async function _loadSyncHealth() {
  var el = document.getElementById('syncHealthInfo');
  if (!el) return;

  try {
    var resp = await fetch(_CF_SYNC_URL + '?action=health', { headers: { 'Authorization': _SUPA_AUTH } });
    var data = await resp.json();

    if (data.health) {
      var h = data.health;
      var lastSync = h.last_sync ? new Date(h.last_sync).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Never';
      var status = h.status === 'healthy' ? '<span style="color:var(--green)">✅ HEALTHY</span>' :
                   h.status === 'warning' ? '<span style="color:var(--gold)">⚠ WARNING</span>' :
                   '<span style="color:var(--red)">❌ ERROR</span>';

      el.innerHTML = '<div>Status: ' + status + '</div>' +
        '<div>Last sync: ' + lastSync + '</div>' +
        '<div>Duration: ' + (h.duration_ms || 0) + 'ms</div>' +
        (h.warnings ? '<div style="color:var(--gold);margin-top:8px">⚠ ' + h.warnings + '</div>' : '');
    } else {
      el.textContent = 'Could not load health status';
    }
  } catch (e) {
    el.textContent = 'Error loading health: ' + e.message;
  }
}

async function _loadSyncStats() {
  // Load latest proof_archive entry
  try {
    var sbUrl = FL.SUPABASE_URL;
    var sbKey = FL.SUPABASE_ANON_KEY;

    // Strava — last proof entry
    var proofResp = await fetch(sbUrl + '/rest/v1/proof_archive?select=date,run_km,synced_at&order=date.desc&limit=1', {
      headers: { 'apikey': sbKey }
    });
    var proof = await proofResp.json();
    if (proof && proof[0]) {
      var lastEl = document.getElementById('syncStravaLast');
      var statusEl = document.getElementById('syncStravaStatus');
      if (lastEl) lastEl.textContent = proof[0].date;
      if (statusEl) {
        var today = (typeof getEffectiveToday === 'function') ? getEffectiveToday() : new Date().toISOString().slice(0, 10);
        if (proof[0].date === today) {
          statusEl.textContent = '✅ TODAY';
          statusEl.style.color = 'var(--green)';
        } else {
          statusEl.textContent = '⚠ STALE';
          statusEl.style.color = 'var(--gold)';
        }
      }
    }

    // Instagram — post count
    var igResp = await fetch(sbUrl + '/rest/v1/instagram_posts?select=id&limit=100', {
      headers: { 'apikey': sbKey }
    });
    var igPosts = await igResp.json();
    var countEl = document.getElementById('syncIgCount');
    var igStatusEl = document.getElementById('syncIgStatus');
    if (countEl && Array.isArray(igPosts)) countEl.textContent = igPosts.length;
    if (igStatusEl) {
      igStatusEl.textContent = '✅ OK';
      igStatusEl.style.color = 'var(--green)';
    }
    // Sleep — load from health_daily
    var today = (typeof getEffectiveToday === 'function') ? getEffectiveToday() : new Date().toISOString().slice(0, 10);
    var sleepResp = await fetch(sbUrl + '/rest/v1/health_daily?date=eq.' + today + '&select=sleep_hours,bedtime,wake_time', {
      headers: { 'apikey': sbKey }
    });
    var sleepData = await sleepResp.json();
    var sleepHrsEl = document.getElementById('syncSleepHrs');
    var bedtimeEl = document.getElementById('syncBedtime');
    var sleepStatusEl = document.getElementById('syncSleepStatus');
    if (sleepData && sleepData[0] && sleepData[0].sleep_hours) {
      if (sleepHrsEl) sleepHrsEl.textContent = parseFloat(sleepData[0].sleep_hours).toFixed(1) + 'h';
      if (bedtimeEl) bedtimeEl.textContent = sleepData[0].bedtime || '—';
      if (sleepStatusEl) { sleepStatusEl.textContent = '✅ SYNCED'; sleepStatusEl.style.color = 'var(--green)'; }
    } else {
      if (sleepHrsEl) sleepHrsEl.textContent = '—';
      if (sleepStatusEl) { sleepStatusEl.textContent = '⚠ NO DATA'; sleepStatusEl.style.color = 'var(--gold)'; }
    }
  } catch (e) {
    console.error('Sync stats error:', e);
  }
}

// ── SLEEP FORCE SYNC — reads health_daily, writes to proof_archive + sleep_log + daily_logs ──
async function _forceSleepSync() {
  var btn = document.getElementById('btnSyncSleep');
  var logEl = document.getElementById('syncSleepLog');
  var statusEl = document.getElementById('syncSleepStatus');
  if (!btn) return;

  btn.disabled = true;
  btn.textContent = '⏳ SYNCING...';
  btn.style.opacity = '0.6';
  if (logEl) { logEl.style.display = 'block'; logEl.innerHTML = ''; }

  function log(msg) { if (logEl) logEl.innerHTML += '<div>[' + new Date().toLocaleTimeString('en-IN') + '] ' + msg + '</div>'; }

  var sbUrl = FL.SUPABASE_URL;
  var sbKey = FL.SUPABASE_ANON_KEY;
  var today = (typeof getEffectiveToday === 'function') ? getEffectiveToday() : new Date().toISOString().slice(0, 10);

  try {
    log('Reading health_daily for ' + today + '...');

    // Read from health_daily
    var resp = await fetch(sbUrl + '/rest/v1/health_daily?date=eq.' + today + '&select=sleep_hours,bedtime,wake_time,sleep_score', { headers: { 'apikey': sbKey } });
    var data = await resp.json();

    var sleepHrs = null, bedtime = null, wakeTime = null;

    if (data && data[0] && data[0].sleep_hours) {
      sleepHrs = data[0].sleep_hours;
      bedtime = data[0].bedtime;
      wakeTime = data[0].wake_time;
      log('✅ Found in health_daily: ' + sleepHrs + 'h | bed:' + (bedtime || '—') + ' | wake:' + (wakeTime || '—'));
    } else {
      log('⚠ No data in health_daily for today');

      // Try yesterday (sleep data often tagged to previous day)
      var yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      var yesterdayStr = yesterday.toISOString().slice(0, 10);
      log('Checking yesterday (' + yesterdayStr + ')...');

      var resp2 = await fetch(sbUrl + '/rest/v1/health_daily?date=eq.' + yesterdayStr + '&select=sleep_hours,bedtime,wake_time', { headers: { 'apikey': sbKey } });
      var data2 = await resp2.json();
      if (data2 && data2[0] && data2[0].sleep_hours) {
        sleepHrs = data2[0].sleep_hours;
        bedtime = data2[0].bedtime;
        wakeTime = data2[0].wake_time;
        log('✅ Found yesterday: ' + sleepHrs + 'h');
      }
    }

    if (!sleepHrs) {
      // Manual input fallback
      var manual = prompt('No sleep data from Apple Watch.\nEnter sleep hours manually (e.g. 5.5):');
      if (manual && parseFloat(manual) > 0) {
        sleepHrs = parseFloat(manual);
        log('Manual input: ' + sleepHrs + 'h');
      } else {
        log('❌ No sleep data available. Run Health Auto Export first.');
        throw new Error('No sleep data');
      }
    }

    // Write to sleep_log
    log('Writing to sleep_log...');
    await fetch(sbUrl + '/rest/v1/sleep_log?on_conflict=date', {
      method: 'POST',
      headers: { 'apikey': sbKey, 'Authorization': 'Bearer ' + sbKey, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ date: today, sleep_hours: sleepHrs, bedtime: bedtime, wake_time: wakeTime, source: 'manual_sync' })
    });
    log('✅ sleep_log updated');

    // Write to proof_archive (only sleep_hrs — don't touch other columns)
    log('Writing to proof_archive...');
    var streakStart = new Date('2026-02-10');
    var dayNum = Math.floor((new Date(today) - streakStart) / 86400000) + 1;
    await fetch(sbUrl + '/rest/v1/proof_archive?on_conflict=date', {
      method: 'POST',
      headers: { 'apikey': sbKey, 'Authorization': 'Bearer ' + sbKey, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ date: today, sleep_hrs: sleepHrs, day_number: dayNum })
    });
    log('✅ proof_archive updated');

    // Write to daily_logs
    log('Writing to daily_logs...');
    await fetch(sbUrl + '/rest/v1/daily_logs?on_conflict=date', {
      method: 'POST',
      headers: { 'apikey': sbKey, 'Authorization': 'Bearer ' + sbKey, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ date: today, sleep_hrs: sleepHrs, wake_time: wakeTime })
    });
    log('✅ daily_logs updated');

    log('');
    log('🎉 Sleep synced to all tables: ' + sleepHrs + 'h');

    // Update UI
    var hrsEl = document.getElementById('syncSleepHrs');
    var bedEl = document.getElementById('syncBedtime');
    if (hrsEl) hrsEl.textContent = parseFloat(sleepHrs).toFixed(1) + 'h';
    if (bedEl) bedEl.textContent = bedtime || '—';
    if (statusEl) { statusEl.textContent = '✅ SYNCED'; statusEl.style.color = 'var(--green)'; }

  } catch (e) {
    log('❌ Error: ' + e.message);
    if (statusEl) { statusEl.textContent = '❌ FAILED'; statusEl.style.color = 'var(--red)'; }
  } finally {
    btn.disabled = false;
    btn.textContent = '😴 FORCE SLEEP SYNC';
    btn.style.opacity = '1';
  }
}

// Bind sleep sync button
(function() {
  setTimeout(function() {
    var btn = document.getElementById('btnSyncSleep');
    if (btn && !btn._bound) {
      btn._bound = true;
      btn.addEventListener('click', _forceSleepSync);
    }
  }, 1000);
})();

