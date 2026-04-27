// ═══════════════════════════════════════════
// FIRST LIGHT — SETTINGS
// ═══════════════════════════════════════════

document.getElementById('configForm').addEventListener('submit', function(e) {
  e.preventDefault();
  saveConfig({
    OWNER: document.getElementById('cfgOwner').value || FL_DEFAULTS.OWNER,
    BRAND: document.getElementById('cfgBrand').value || FL_DEFAULTS.BRAND,
    TAGLINE: document.getElementById('cfgTagline').value || FL_DEFAULTS.TAGLINE,
    CITY: document.getElementById('cfgCity').value || FL_DEFAULTS.CITY,
    HANDLE_IG: document.getElementById('cfgHandleIG').value || FL_DEFAULTS.HANDLE_IG,
    HANDLE_X: document.getElementById('cfgHandleX').value || FL_DEFAULTS.HANDLE_X,
    INSTAGRAM_URL: document.getElementById('cfgInstagram').value || FL_DEFAULTS.INSTAGRAM_URL,
    X_URL: document.getElementById('cfgX').value || FL_DEFAULTS.X_URL,
    STRAVA_URL: document.getElementById('cfgStrava').value || FL_DEFAULTS.STRAVA_URL,
    GITHUB_URL: document.getElementById('cfgGithub').value || FL_DEFAULTS.GITHUB_URL,
    STREAK_START: document.getElementById('cfgStreakStart').value || FL_DEFAULTS.STREAK_START,
    STAKE_PER_DAY: parseInt(document.getElementById('cfgStake').value) || FL_DEFAULTS.STAKE_PER_DAY,
    // ADMIN_PIN removed — Supabase Auth handles authentication
    VERIFICATION_SOURCE: document.getElementById('cfgVerifySource').value || FL_DEFAULTS.VERIFICATION_SOURCE,
    MARATHON_TARGET: document.getElementById('cfgMarathon').value || FL_DEFAULTS.MARATHON_TARGET,
    MARATHON_DATE: document.getElementById('cfgMarathonDate').value || FL_DEFAULTS.MARATHON_DATE,
    MARATHON_TIME: document.getElementById('cfgMarathonTime').value || FL_DEFAULTS.MARATHON_TIME,
    MEDIA_BASE_URL: document.getElementById('cfgMediaUrl').value || '',
  });
  // Also save bio to legacy key for backward compat
  localStorage.setItem('fl_settings', JSON.stringify({
    bio: document.getElementById('cfgBio').value,
    marathonDate: document.getElementById('cfgMarathonDate').value,
    marathonTime: document.getElementById('cfgMarathonTime').value
  }));
  applyConfig();
  // Sync config to Supabase
  if (SB.ready) {
    Object.entries(FL).forEach(function(kv) {
      sbFetch('config', 'POST', {key: kv[0], value: String(kv[1])}, '?on_conflict=key');
    });
  }
  flashBtn(this.querySelector('.btn-primary'), 'ALL CONFIG SAVED ✓');
});

// ══════════════════════════════════════
// METRICS SAVE
// ══════════════════════════════════════
document.getElementById('metricsForm').addEventListener('submit', function(e) {
  e.preventDefault();
  var week = getEffectiveToday();
  var metrics = JSON.parse(localStorage.getItem('fl_metrics') || '{}');
  metrics[week] = {
    saves: document.getElementById('metSaves').value,
    shares: document.getElementById('metShares').value,
    visits: document.getElementById('metVisits').value,
    reach: document.getElementById('metReach').value,
    completion: document.getElementById('metCompletion').value,
    growth: document.getElementById('metGrowth').value,
    storyEng: document.getElementById('metStoryEng').value,
    notes: document.getElementById('metNotes').value
  };
  localStorage.setItem('fl_metrics', JSON.stringify(metrics));
  syncWeeklyMetrics(week, metrics[week]);
  markSaved();
  flashBtn(this.querySelector('.btn-primary'), 'SAVED ✓');
});

// ══════════════════════════════════════
(function() {
  // Load central config into form
  var c = FL;
  if (document.getElementById('cfgOwner')) document.getElementById('cfgOwner').value = c.OWNER || '';
  if (document.getElementById('cfgBrand')) document.getElementById('cfgBrand').value = c.BRAND || '';
  if (document.getElementById('cfgTagline')) document.getElementById('cfgTagline').value = c.TAGLINE || '';
  if (document.getElementById('cfgCity')) document.getElementById('cfgCity').value = c.CITY || '';
  if (document.getElementById('cfgHandleIG')) document.getElementById('cfgHandleIG').value = c.HANDLE_IG || '';
  if (document.getElementById('cfgHandleX')) document.getElementById('cfgHandleX').value = c.HANDLE_X || '';
  if (document.getElementById('cfgInstagram')) document.getElementById('cfgInstagram').value = c.INSTAGRAM_URL || '';
  if (document.getElementById('cfgX')) document.getElementById('cfgX').value = c.X_URL || '';
  if (document.getElementById('cfgStrava')) document.getElementById('cfgStrava').value = c.STRAVA_URL || '';
  if (document.getElementById('cfgGithub')) document.getElementById('cfgGithub').value = c.GITHUB_URL || '';
  if (document.getElementById('cfgStreakStart')) document.getElementById('cfgStreakStart').value = c.STREAK_START || '';
  if (document.getElementById('cfgStake')) document.getElementById('cfgStake').value = c.STAKE_PER_DAY || '';
  // cfgPin removed — Supabase Auth handles authentication
  if (document.getElementById('cfgMarathon')) document.getElementById('cfgMarathon').value = c.MARATHON_TARGET || '';
  if (document.getElementById('cfgMarathonDate')) document.getElementById('cfgMarathonDate').value = c.MARATHON_DATE || '';
  if (document.getElementById('cfgMarathonTime')) document.getElementById('cfgMarathonTime').value = c.MARATHON_TIME || '';
  if (document.getElementById('cfgMediaUrl')) document.getElementById('cfgMediaUrl').value = c.MEDIA_BASE_URL || '';
  if (document.getElementById('cfgVerifySource')) document.getElementById('cfgVerifySource').value = c.VERIFICATION_SOURCE || 'Apple Watch + Strava';
  // Legacy bio
  try { var s = JSON.parse(localStorage.getItem('fl_settings') || '{}');
    if (document.getElementById('cfgBio')) document.getElementById('cfgBio').value = s.bio || '';
  } catch(e) {}
  // Today's stats
  var stats = getTodayStats();
  if (stats.sleepHrs) document.getElementById('statSleep').value = stats.sleepHrs;
  if (stats.runKm) document.getElementById('statRunKm').value = stats.runKm;
  if (stats.runTime) document.getElementById('statRunTime').value = stats.runTime;
  if (stats.gym) document.getElementById('statGym').checked = stats.gym;
})();

function loadApiKeys() {
  var keys = JSON.parse(localStorage.getItem('fl_api_keys') || '{}');
  if (keys.openai) { document.getElementById('apiKeyOpenAI').value = keys.openai; document.getElementById('apiStatusOpenAI').className = 'api-key-status valid'; }
  if (keys.gemini) { document.getElementById('apiKeyGemini').value = keys.gemini; document.getElementById('apiStatusGemini').className = 'api-key-status valid'; }
  if (keys.anthropic) { document.getElementById('apiKeyAnthropic').value = keys.anthropic; document.getElementById('apiStatusAnthropic').className = 'api-key-status valid'; }
}

function saveApiKeys() {
  var keys = {
    openai: document.getElementById('apiKeyOpenAI').value,
    gemini: document.getElementById('apiKeyGemini').value,
    anthropic: document.getElementById('apiKeyAnthropic').value
  };
  localStorage.setItem('fl_api_keys', JSON.stringify(keys));
  // Update status dots
  document.getElementById('apiStatusOpenAI').className = 'api-key-status ' + (keys.openai ? 'valid' : 'empty');
  document.getElementById('apiStatusGemini').className = 'api-key-status ' + (keys.gemini ? 'valid' : 'empty');
  document.getElementById('apiStatusAnthropic').className = 'api-key-status ' + (keys.anthropic ? 'valid' : 'empty');
  flashBtn(document.querySelector('#p-apikeys .btn-primary'), 'SAVED ✓');
}

loadApiKeys();

// ══════════════════════════════════════
// SUPABASE CONFIG + SYNC
// ══════════════════════════════════════
function saveAndTestSupabase() {
  var url = document.getElementById('supaUrl').value.trim();
  var key = document.getElementById('supaKey').value.trim();
  localStorage.setItem('fl_supabase_url', url);
  localStorage.setItem('fl_supabase_key', key);
  saveConfig({ SUPABASE_URL: url, SUPABASE_ANON_KEY: key });
  SB.url = url; SB.key = key; SB.ready = !!(url && key);
  testSupabaseConnection();
}

async function testSupabaseConnection() {
  var dot = document.getElementById('supaStatusDot');
  var txt = document.getElementById('supaStatusText');
  txt.textContent = 'Testing connection...';
  dot.className = 'api-key-status empty';
  var result = await checkSupabaseConnection();
  if (result.connected) {
    dot.className = 'api-key-status valid';
    txt.textContent = 'Connected ✓ — Supabase is live';
    txt.style.color = 'var(--green)';
  } else {
    dot.className = 'api-key-status';
    dot.style.background = 'var(--red)';
    txt.textContent = 'Failed — ' + (result.reason || 'status ' + result.status);
    txt.style.color = 'var(--red)';
  }
}

async function pushAll() {
  var btn = document.getElementById('btnPushAll');
  var log = document.getElementById('syncLog');
  btn.textContent = 'PUSHING...'; btn.disabled = true;
  log.textContent = 'Starting full push to Supabase...';
  try {
    var result = await pushAllToSupabase();
    if (result.pushed) {
      log.textContent = '✓ Pushed ' + result.count + ' records to Supabase at ' + new Date().toLocaleTimeString();
      log.style.color = 'var(--green)';
      btn.textContent = 'PUSHED ✓'; btn.style.background = 'var(--green)';
    } else {
      log.textContent = '✗ Push failed: ' + (result.error || 'unknown');
      log.style.color = 'var(--red)';
    }
  } catch(e) {
    log.textContent = '✗ Error: ' + e.message;
    log.style.color = 'var(--red)';
  }
  btn.disabled = false;
  setTimeout(function() { btn.textContent = 'PUSH ALL → SUPABASE'; btn.style.background = ''; }, 3000);
}

async function pullAll() {
  var btn = document.getElementById('btnPullAll');
  var log = document.getElementById('syncLog');
  btn.textContent = 'PULLING...'; btn.disabled = true;
  log.textContent = 'Pulling from Supabase...';
  try {
    var result = await pullFromSupabase();
    if (result.synced) {
      var details = [];
      if (result.rituals) details.push(result.rituals + ' ritual records');
      if (result.journal) details.push(result.journal + ' journal entries');
      if (result.races) details.push(result.races + ' races');
      log.textContent = '✓ Pulled ' + details.join(', ') + ' at ' + new Date().toLocaleTimeString();
      log.style.color = 'var(--green)';
      btn.textContent = 'PULLED ✓'; btn.style.background = 'var(--green)';
    } else {
      log.textContent = '✗ Pull failed: Supabase not configured';
      log.style.color = 'var(--red)';
    }
  } catch(e) {
    log.textContent = '✗ Error: ' + e.message;
    log.style.color = 'var(--red)';
  }
  btn.disabled = false;
  setTimeout(function() { btn.textContent = 'PULL ← SUPABASE'; btn.style.background = ''; }, 3000);
}

// Load existing Supabase config + test connection
(function() {
  var url = FL.SUPABASE_URL || localStorage.getItem('fl_supabase_url') || '';
  var key = FL.SUPABASE_ANON_KEY || localStorage.getItem('fl_supabase_key') || '';
  if (url) document.getElementById('supaUrl').value = url;
  if (key) document.getElementById('supaKey').value = key;
  if (url && key) {
    SB.url = url; SB.key = key; SB.ready = true;
    testSupabaseConnection();
  } else {
    document.getElementById('supaStatusText').textContent = 'Not configured — add URL and key above';
  }
})();

// Init theme schedule checkbox
(function() {
  var cb = document.getElementById('themeSchedule');
  if (cb) cb.checked = localStorage.getItem('fl_theme_schedule') === 'true';
})();

// ══════════════════════════════════════
// QUICK UPLOAD TO GCS
// ══════════════════════════════════════
async function quickUploadToGCS(files) {
  if (!files || !files.length) return;
  var folder = document.getElementById('quickUploadFolder').value;
  var progress = document.getElementById('quickUploadProgress');
  var results = document.getElementById('quickUploadResults');
  var GCS_URL = 'https://edgnudrbysybefbqyijq.supabase.co/functions/v1/firstlight-sync?action=upload';

  results.innerHTML = '';
  progress.textContent = 'Uploading ' + files.length + ' file(s)...';
  progress.style.color = 'var(--gold)';

  for (var i = 0; i < files.length; i++) {
    try {
      progress.textContent = 'Uploading ' + (i + 1) + '/' + files.length + '...';
      var file = files[i];
      var base64 = await readFileAsBase64(file);
      var ext = '.' + (file.name.split('.').pop() || 'jpg');
      var name = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');

      var res = await fetch(GCS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: folder, filename: name, ext: ext, data: base64 })
      });
      var data = await res.json();

      if (data.success) {
        results.innerHTML += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;padding:8px;background:rgba(0,230,118,0.04);border:1px solid rgba(0,230,118,0.12);border-radius:6px">' +
          (file.type.startsWith('image/') ? '<img src="' + data.url + '" style="width:40px;height:40px;object-fit:cover;border-radius:4px">' : '<span style="font-size:20px">📄</span>') +
          '<input type="text" class="form-input" value="' + data.url + '" readonly style="font-size:9px;flex:1;color:var(--green);cursor:text" onclick="this.select();document.execCommand(\'copy\')">' +
          '<span style="font-family:var(--font-mono);font-size:8px;color:var(--green)">✓</span></div>';
      } else {
        results.innerHTML += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--red);margin-bottom:4px">✗ ' + file.name + ': ' + (data.error || 'Failed') + '</div>';
      }
    } catch(e) {
      results.innerHTML += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--red);margin-bottom:4px">✗ ' + files[i].name + ': ' + e.message + '</div>';
    }
  }
  progress.textContent = files.length + ' file(s) uploaded ✓ — click any URL to copy';
  progress.style.color = 'var(--green)';
}

function readFileAsBase64(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function() { resolve(reader.result.split(',')[1]); };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
 
