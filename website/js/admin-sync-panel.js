// ═══════════════════════════════════════════
// FIRST LIGHT — SYNC CENTER PANEL
// ═══════════════════════════════════════════

var _syncInProgress = false;
var _CF_SYNC_URL = 'https://asia-south1-project-f050b6ba-60db-4eee-98a.cloudfunctions.net/firstlight-sync';
var _SYNC_ADMIN_KEY = localStorage.getItem('fl_admin_key') || localStorage.getItem('fl_admin_key');

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
      headers: { 'X-Admin-Key': _SYNC_ADMIN_KEY }
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
    var resp = await fetch(_CF_SYNC_URL + '?action=health');
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
  } catch (e) {
    console.error('Sync stats error:', e);
  }
}
 
