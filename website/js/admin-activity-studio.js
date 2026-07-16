// ═══════════════════════════════════════════════════════
// FIRST LIGHT — ACTIVITY STUDIO (APPS)
// One app for the daily menu: see it, do it (live tracker),
// upload it, post it to Instagram.
//
// Writes go through firstlight-sync?action=admin-write
// (strava_activities is service-role-only). Manual rows carry
// device_name='FirstLight Studio' — the nightly verdict judge
// unions those in server-side, so uploads here count as WIN.
// ═══════════════════════════════════════════════════════

(function() {
  'use strict';

  var SUPA = (window.FL && FL.SUPABASE_URL) || localStorage.getItem('fl_supabase_url') || '';
  var KEY  = (window.FL && FL.SUPABASE_ANON_KEY) || localStorage.getItem('fl_supabase_key') || '';
  var SYNC_URL = SUPA + '/functions/v1/firstlight-sync';
  var ADMIN_KEY = ['934c03a18ffe22cb', 'ccef763b4bf480d5', '3f0690177904ba2b', '1d9ebacd52b0eb5d'].join('');
  var IG_ACCOUNT = '17841466893616231';
  var DEVICE_NAME = 'FirstLight Studio';
  var STREAK_START = (window.FL && FL.STREAK_START) || '2026-06-20';

  var MONO = '"IBM Plex Mono", monospace';

  // ── Chapter 02 ENDURANCE menu — mirrors ENDURANCE_RULE in firstlight-sync ──
  var MENU = [
    { key: 'run',   label: 'RUN',        icon: '🏃', rule: '5 KM+',   type: 'Run',     gps: true,  minM: 5000,  met: 9.8, color: '#FC4C02' },
    { key: 'walk',  label: 'WALK',       icon: '🚶', rule: '5 KM+',   type: 'Walk',    gps: true,  minM: 5000,  met: 4.3, color: '#C89B7B' },
    { key: 'cycle', label: 'CYCLE',      icon: '🚴', rule: '10 KM+',  type: 'Ride',    gps: true,  minM: 10000, met: 7.5, color: '#93C5FD' },
    { key: 'swim',  label: 'SWIM',       icon: '🏊', rule: '1 KM+',   type: 'Swim',    gps: false, minM: 1000,  met: 8.0, color: '#00D4FF' },
    { key: 'hr',    label: 'HR SESSION', icon: '💓', rule: '30 MIN+', type: 'Workout', gps: false, minSec: 1800, met: 6.0, color: '#FF1744' }
  ];

  var RULE = {
    walk:  { types: ['Walk', 'Hike'], minMeters: 5000 },
    run:   { types: ['Run', 'TrailRun', 'VirtualRun'], minMeters: 5000 },
    cycle: { types: ['Ride', 'MountainBikeRide', 'GravelRide', 'EBikeRide', 'VirtualRide', 'EMountainBikeRide'], minMeters: 10000 },
    swim:  { types: ['Swim'], minMeters: 1000 },
    hrSession: { types: ['Workout', 'WeightTraining', 'Yoga', 'Pilates', 'Crossfit', 'HighIntensityIntervalTraining', 'Rowing', 'RockClimbing', 'Elliptical', 'StairStepper', 'Tennis', 'Squash', 'Pickleball'], minSeconds: 1800 }
  };

  var TYPE_OPTIONS = ['Run', 'Walk', 'Hike', 'Ride', 'Swim', 'Workout', 'WeightTraining', 'Yoga', 'Pilates', 'Crossfit', 'HighIntensityIntervalTraining', 'Rowing', 'Elliptical', 'StairStepper', 'Tennis', 'Squash', 'Pickleball'];

  var TYPE_ICON = { Run: '🏃', TrailRun: '🏃', VirtualRun: '🏃', Walk: '🚶', Hike: '🥾', Ride: '🚴', VirtualRide: '🚴', Swim: '🏊', Workout: '💓', WeightTraining: '🏋', Yoga: '🧘', Pilates: '🧘', Crossfit: '🏋', HighIntensityIntervalTraining: '🔥', Rowing: '🚣', Elliptical: '⚙', StairStepper: '🪜', Tennis: '🎾', Squash: '🎾', Pickleball: '🏓' };

  // Same theme set as the Daily Proof generator
  var THEMES = {
    noir:     { name: 'NOIR',     bg: '#000000', text: '#FFFFFF', dim: '#5A6B80', accent: '#FFFFFF', accent2: '#888888', cardBg: 'rgba(255,255,255,0.04)', cardBorder: 'rgba(255,255,255,0.1)',  grain: true,  scanlines: false },
    heatmap:  { name: 'HEAT MAP', bg: '#0A0C10', text: '#FFFFFF', dim: '#5A6B80', accent: '#FC4C02', accent2: '#F5A623', cardBg: 'rgba(252,76,2,0.05)',    cardBorder: 'rgba(252,76,2,0.15)',   grain: true,  scanlines: false },
    terminal: { name: 'TERMINAL', bg: '#0A0F0A', text: '#00E676', dim: '#1B5E20', accent: '#00E676', accent2: '#4CAF50', cardBg: 'rgba(0,230,118,0.04)',   cardBorder: 'rgba(0,230,118,0.12)',  grain: false, scanlines: true  },
    gradient: { name: 'GRADIENT', bg: '#0A0C1A', text: '#FFFFFF', dim: '#6B7DB8', accent: '#00D4FF', accent2: '#A855F7', cardBg: 'rgba(0,212,255,0.04)',   cardBorder: 'rgba(0,212,255,0.12)',  grain: true,  scanlines: false },
    strava:   { name: 'STRAVA',   bg: '#000000', text: '#FFFFFF', dim: '#5A6B80', accent: '#FC4C02', accent2: '#FC4C02', cardBg: 'rgba(252,76,2,0.06)',    cardBorder: 'rgba(252,76,2,0.2)',    grain: true,  scanlines: false },
    arctic:   { name: 'ARCTIC',   bg: '#0A1628', text: '#E8EDF5', dim: '#3B5998', accent: '#93C5FD', accent2: '#60A5FA', cardBg: 'rgba(147,197,253,0.04)', cardBorder: 'rgba(147,197,253,0.12)', grain: false, scanlines: false },
    infrared: { name: 'INFRARED', bg: '#0A0000', text: '#FFFFFF', dim: '#4A1010', accent: '#FF1744', accent2: '#FF5252', cardBg: 'rgba(255,23,68,0.05)',   cardBorder: 'rgba(255,23,68,0.15)',  grain: true,  scanlines: false },
    gold:     { name: 'GOLD',     bg: '#080808', text: '#FFFFFF', dim: '#6B5B00', accent: '#F5A623', accent2: '#D4A017', cardBg: 'rgba(245,166,35,0.04)',  cardBorder: 'rgba(245,166,35,0.12)', grain: true,  scanlines: false },
    neon:     { name: 'NEON',     bg: '#0A0A14', text: '#FFFFFF', dim: '#4A148C', accent: '#E040FB', accent2: '#00E5FF', cardBg: 'rgba(224,64,251,0.04)',  cardBorder: 'rgba(224,64,251,0.12)', grain: false, scanlines: true  },
    earth:    { name: 'EARTH',    bg: '#1A1410', text: '#E8DCC8', dim: '#4E342E', accent: '#8D6E63', accent2: '#558B2F', cardBg: 'rgba(141,110,99,0.05)',  cardBorder: 'rgba(141,110,99,0.12)', grain: true,  scanlines: false }
  };
  var SPORT_THEME = { run: 'strava', walk: 'earth', cycle: 'arctic', swim: 'gradient', hrSession: 'infrared' };

  var HASHTAGS = {
    run:  '#running #runstreak #5amclub #discipline #firstlight',
    walk: '#walking #endurance #discipline #dailyhabits #firstlight',
    cycle: '#cycling #ride #endurance #discipline #firstlight',
    swim: '#swimming #endurance #discipline #dailyhabits #firstlight',
    hrSession: '#training #workout #discipline #consistency #firstlight'
  };

  // ── state ──
  var state = {
    view: 'today',
    activities: [],       // last 14 days from strava_activities
    apple: [],            // today's apple workouts (health_daily.workouts_detail)
    photo: null,          // { img: Image, name } for post background
    editingId: null,
    postActivity: null,
    track: null,          // live tracker session
    wakeLock: null,
    tick: null
  };

  // ── helpers ──
  function $(id) { return document.getElementById(id); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function parseLocal(dateStr) {
    if (!dateStr) return new Date();
    return new Date(String(dateStr).replace(/[+-]\d{2}:\d{2}$/, '').replace(/Z$/, ''));
  }

  function todayLocal() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function dayNumber(dateStr) {
    var start = new Date(STREAK_START + 'T00:00:00');
    var d = new Date(dateStr + 'T00:00:00');
    return Math.floor((d - start) / 86400000) + 1;
  }

  function fmtDur(sec) {
    sec = Math.round(sec || 0);
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h > 0) return h + ':' + pad(m) + ':' + pad(s);
    return m + ':' + pad(s);
  }

  function fmtClock(d) {
    var h = d.getHours(), m = d.getMinutes();
    var ap = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12 || 12;
    return h12 + ':' + pad(m) + ' ' + ap;
  }

  function fmtDateLong(dateStr) {
    var days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    var months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    var d = new Date(dateStr + 'T00:00:00');
    return days[d.getDay()] + ' · ' + pad(d.getDate()) + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  // Pace string per sport family
  function paceStr(type, meters, sec) {
    if (!meters || !sec) return '';
    var km = meters / 1000;
    if (type === 'Ride' || type === 'VirtualRide') {
      return (km / (sec / 3600)).toFixed(1) + ' KM/H';
    }
    if (type === 'Swim') {
      var per100 = sec / (meters / 100);
      return Math.floor(per100 / 60) + ':' + pad(Math.round(per100 % 60)) + ' /100M';
    }
    var perKm = sec / km;
    return Math.floor(perKm / 60) + ':' + pad(Math.round(perKm % 60)) + ' /KM';
  }

  // Which menu bucket does this activity satisfy? (mirrors edge evaluator)
  function qualifies(type, meters, sec) {
    var buckets = ['walk', 'run', 'cycle', 'swim'];
    for (var i = 0; i < buckets.length; i++) {
      var r = RULE[buckets[i]];
      if (r.types.indexOf(type) !== -1 && meters >= r.minMeters) return buckets[i];
    }
    if (RULE.hrSession.types.indexOf(type) !== -1 && sec >= RULE.hrSession.minSeconds) return 'hrSession';
    return null;
  }

  // ── data ──
  function fetchJSON(url) {
    return fetch(url, { headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY } })
      .then(function(r) { return r.ok ? r.json() : []; })
      .catch(function() { return []; });
  }

  // health_daily is RLS-locked to anon — read it through the admin-read proxy
  function adminRead(body) {
    return fetch(SYNC_URL + '?action=admin-read&admin_key=' + ADMIN_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
      body: JSON.stringify(body)
    }).then(function(r) { return r.json(); })
      .then(function(j) { return (j && Array.isArray(j.data)) ? j.data : []; })
      .catch(function() { return []; });
  }

  function loadData() {
    var since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    var actsQ = SUPA + '/rest/v1/strava_activities?select=id,name,type,sport_type,distance,moving_time,elapsed_time,start_date_local,average_heartrate,calories,device_name,summary_polyline&start_date_local=gte.' + since + '&order=start_date_local.desc&limit=100';
    var healthReq = adminRead({ table: 'health_daily', select: 'date,workouts_detail', order: 'date:desc', limit: 15 });
    return Promise.all([fetchJSON(actsQ), healthReq]).then(function(res) {
      state.activities = Array.isArray(res[0]) ? res[0] : [];
      state.appleByDate = {};
      (res[1] || []).forEach(function(row) {
        if (Array.isArray(row.workouts_detail)) state.appleByDate[row.date] = row.workouts_detail;
      });
    });
  }

  function activitiesForDate(dateStr) {
    return state.activities.filter(function(a) {
      return (a.start_date_local || '').slice(0, 10) === dateStr;
    });
  }

  // Apple workouts mapped the way the judge maps them (floor-aware typing)
  function appleLite(dateStr) {
    var arr = (state.appleByDate && state.appleByDate[dateStr]) || [];
    return arr.map(function(w) {
      var raw = String(w.type || 'workout');
      var mapped = /run/i.test(raw) ? 'Run' : /hik/i.test(raw) ? 'Hike' : /walk/i.test(raw) ? 'Walk' : /cycl|bik/i.test(raw) ? 'Ride' : /swim/i.test(raw) ? 'Swim' : 'Workout';
      var distM = Math.round(Number(w.distance_km || 0) * 1000);
      var floor = { Run: 5000, Walk: 5000, Hike: 5000, Ride: 10000, Swim: 1000 }[mapped] || 0;
      var effType = (mapped !== 'Workout' && distM >= floor) ? mapped : 'Workout';
      return {
        apple: true,
        name: raw.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); }) + ' · Apple Watch',
        type: effType, distance: distM,
        moving_time: Math.round(Number(w.duration_min || 0) * 60),
        calories: Number(w.calories || 0) || null,
        start_date_local: dateStr + 'T' + String(w.start || '12:00') + ':00'
      };
    });
  }

  function dayCandidates(dateStr) {
    // Strava-table rows (incl. Studio manual) + Apple; dedupe rough overlaps
    // (same type within 10 min start) so watch+Strava days don't double-list.
    var acts = activitiesForDate(dateStr).slice();
    appleLite(dateStr).forEach(function(w) {
      var dup = acts.some(function(a) {
        return a.type === w.type && Math.abs(parseLocal(a.start_date_local) - parseLocal(w.start_date_local)) < 600000;
      });
      if (!dup) acts.push(w);
    });
    return acts;
  }

  function dayVerdict(dateStr) {
    var c = dayCandidates(dateStr);
    for (var i = 0; i < c.length; i++) {
      var b = qualifies(c[i].type, c[i].distance || 0, c[i].moving_time || 0);
      if (b) return { win: true, bucket: b, activity: c[i] };
    }
    return { win: false, count: c.length };
  }

  // ── admin-write upsert ──
  function adminWrite(table, data, onConflict) {
    return fetch(SYNC_URL + '?action=admin-write&admin_key=' + ADMIN_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
      body: JSON.stringify({ table: table, data: data, onConflict: onConflict || 'id' })
    }).then(function(r) { return r.json(); }).then(function(j) {
      if (j && j.error) throw new Error(j.error);
      return j;
    });
  }

  // ═══════════════════════════════════════════
  // UI SHELL
  // ═══════════════════════════════════════════
  var CSS = [
    '#p-activity-studio .as-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0 20px}',
    '#p-activity-studio .as-tab{font:600 11px var(--font-mono);letter-spacing:2px;padding:12px 18px;min-height:44px;border-radius:8px;border:1px solid rgba(0,212,255,0.15);background:var(--bg2);color:var(--text-muted);cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}',
    '#p-activity-studio .as-tab.on{background:var(--cyan-dim,rgba(0,212,255,0.08));color:var(--cyan);border-color:rgba(0,212,255,0.4)}',
    '#p-activity-studio .as-card{background:var(--bg2);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px}',
    '#p-activity-studio .as-menu{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}',
    '#p-activity-studio .as-menu-card{position:relative;border-radius:12px;padding:18px 16px;background:var(--bg2);border:1px solid rgba(255,255,255,0.08);overflow:hidden}',
    '#p-activity-studio .as-menu-card .icon{font-size:30px;line-height:1}',
    '#p-activity-studio .as-menu-card .lbl{font:700 clamp(13px,2.5vw,15px) var(--font-mono);letter-spacing:2px;margin-top:10px;color:var(--text)}',
    '#p-activity-studio .as-menu-card .rule{font:600 11px var(--font-mono);letter-spacing:1px;margin-top:4px}',
    '#p-activity-studio .as-btn{font:700 11px var(--font-mono);letter-spacing:2px;min-height:44px;padding:12px 18px;border-radius:8px;border:none;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}',
    '#p-activity-studio .as-btn.pri{background:linear-gradient(135deg,#00D4FF,#0088CC);color:#001018}',
    '#p-activity-studio .as-btn.grn{background:linear-gradient(135deg,#00E676,#00B85C);color:#001008}',
    '#p-activity-studio .as-btn.ghost{background:transparent;border:1px solid rgba(255,255,255,0.18);color:var(--text)}',
    '#p-activity-studio .as-btn.red{background:transparent;border:1px solid rgba(255,68,68,0.4);color:var(--red)}',
    '#p-activity-studio .as-btn:disabled{opacity:0.5;cursor:default}',
    '#p-activity-studio .as-field label{font:600 10px var(--font-mono);color:var(--text-muted);letter-spacing:1px;display:block;margin-bottom:6px}',
    '#p-activity-studio .as-field input,#p-activity-studio .as-field select,#p-activity-studio .as-field textarea{width:100%;padding:12px;min-height:44px;background:var(--bg);border:1px solid rgba(0,212,255,0.15);border-radius:8px;color:var(--text);font:500 13px var(--font-mono);-webkit-tap-highlight-color:transparent}',
    '#p-activity-studio .as-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}',
    '#p-activity-studio .as-grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}',
    '#p-activity-studio .as-grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}',
    '#p-activity-studio .as-postwrap{display:grid;grid-template-columns:minmax(0,430px) minmax(260px,1fr);gap:20px;align-items:start}',
    '#p-activity-studio canvas.as-preview{width:100%;height:auto;border-radius:12px;border:1px solid rgba(255,255,255,0.08);display:block}',
    '#p-activity-studio .as-track-clock{font:700 clamp(52px,14vw,96px) var(--font-mono);letter-spacing:2px;line-height:1;color:var(--text);font-variant-numeric:tabular-nums}',
    '#p-activity-studio .as-track-stat{font:700 clamp(22px,6vw,34px) var(--font-mono);color:var(--text);font-variant-numeric:tabular-nums}',
    '#p-activity-studio .as-dot{width:10px;height:10px;border-radius:50%;display:inline-block}',
    '#p-activity-studio .as-recent-row{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.05);flex-wrap:wrap}',
    '@media(max-width:768px){#p-activity-studio .as-grid4{grid-template-columns:1fr 1fr}#p-activity-studio .as-postwrap{grid-template-columns:1fr}}',
    '@media(max-width:480px){#p-activity-studio .as-grid3{grid-template-columns:1fr 1fr}#p-activity-studio .as-grid2{grid-template-columns:1fr}}'
  ].join('\n');

  function buildShell() {
    var root = $('activityStudioRoot');
    if (!root || root.dataset.built) return !!root;
    root.dataset.built = '1';

    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    root.innerHTML =
      '<div style="display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:10px">' +
        '<div>' +
          '<div class="cc-panel-title">ACTIVITY STUDIO</div>' +
          '<div class="cc-panel-sub">Do it · Upload it · Post it — Chapter 02 ENDURANCE</div>' +
        '</div>' +
        '<div style="text-align:right">' +
          '<div id="asCountdown" style="font:700 20px var(--font-mono);color:var(--gold);font-variant-numeric:tabular-nums"></div>' +
          '<div style="font:600 9px var(--font-mono);letter-spacing:2px;color:var(--text-muted)">LEFT TO SEAL TODAY · 11:59 PM</div>' +
        '</div>' +
      '</div>' +
      '<div class="as-tabs">' +
        '<button class="as-tab on" data-asview="today">◈ TODAY</button>' +
        '<button class="as-tab" data-asview="upload">＋ UPLOAD</button>' +
        '<button class="as-tab" data-asview="post">📸 POST STUDIO</button>' +
      '</div>' +
      '<div id="asViewToday"></div>' +
      '<div id="asViewTrack" style="display:none"></div>' +
      '<div id="asViewUpload" style="display:none"></div>' +
      '<div id="asViewPost" style="display:none"></div>';

    root.querySelectorAll('.as-tab').forEach(function(btn) {
      btn.addEventListener('click', function() { showView(btn.dataset.asview); });
    });

    buildUploadForm();
    buildPostStudio();
    startTicker();
    return true;
  }

  function showView(v) {
    state.view = v;
    var root = $('activityStudioRoot');
    if (!root) return;
    root.querySelectorAll('.as-tab').forEach(function(b) { b.classList.toggle('on', b.dataset.asview === v); });
    ['today', 'track', 'upload', 'post'].forEach(function(k) {
      var el = $('asView' + k.charAt(0).toUpperCase() + k.slice(1));
      if (el) el.style.display = (k === v) ? '' : 'none';
    });
    if (v === 'today') renderToday();
    if (v === 'post') refreshPostPicker();
  }

  // ═══════════════════════════════════════════
  // TODAY VIEW
  // ═══════════════════════════════════════════
  function renderToday() {
    var el = $('asViewToday');
    if (!el) return;
    var today = todayLocal();
    var v = dayVerdict(today);
    var day = dayNumber(today);

    var statusHtml;
    if (v.win) {
      var a = v.activity;
      var stat = a.distance >= 100 ? (a.distance / 1000).toFixed(2) + ' KM' : Math.round((a.moving_time || 0) / 60) + ' MIN';
      statusHtml =
        '<div class="as-card" style="border-color:rgba(0,230,118,0.35);background:rgba(0,230,118,0.05);display:flex;align-items:center;gap:16px;flex-wrap:wrap">' +
          '<div style="font-size:34px">✓</div>' +
          '<div style="flex:1;min-width:200px">' +
            '<div style="font:700 15px var(--font-mono);letter-spacing:2px;color:var(--green)">DAY ' + day + ' SECURED</div>' +
            '<div style="font:500 12px var(--font-mono);color:var(--text-muted);margin-top:4px">' + esc(a.name || a.type) + ' · ' + stat + (a.apple ? ' · Apple' : (a.device_name === DEVICE_NAME ? ' · Studio' : '')) + '</div>' +
          '</div>' +
          '<button class="as-btn grn" id="asGoPost">CREATE POST →</button>' +
        '</div>';
    } else {
      statusHtml =
        '<div class="as-card" style="border-color:rgba(245,166,35,0.35);background:rgba(245,166,35,0.05);display:flex;align-items:center;gap:16px;flex-wrap:wrap">' +
          '<div style="font-size:34px">○</div>' +
          '<div style="flex:1;min-width:200px">' +
            '<div style="font:700 15px var(--font-mono);letter-spacing:2px;color:var(--gold)">DAY ' + day + ' — NOT SEALED YET</div>' +
            '<div style="font:500 12px var(--font-mono);color:var(--text-muted);margin-top:4px">One from the menu before 11:59 PM · miss = ₹1,500 to Akshaya Patra</div>' +
          '</div>' +
        '</div>';
    }

    var menuHtml = '<div class="panel-section-title" style="margin:24px 0 14px">THE MENU — PICK ONE</div><div class="as-menu">' +
      MENU.map(function(m) {
        return '<div class="as-menu-card" style="border-color:' + m.color + '33">' +
          '<div style="position:absolute;top:0;left:0;right:0;height:3px;background:' + m.color + '"></div>' +
          '<div class="icon">' + m.icon + '</div>' +
          '<div class="lbl">' + m.label + '</div>' +
          '<div class="rule" style="color:' + m.color + '">' + m.rule + '</div>' +
          '<div style="display:flex;gap:8px;margin-top:14px">' +
            '<button class="as-btn pri" data-astrack="' + m.key + '" style="flex:1;padding:12px 8px">▶ START</button>' +
            '<button class="as-btn ghost" data-aslog="' + m.key + '" style="padding:12px 14px">＋</button>' +
          '</div>' +
        '</div>';
      }).join('') + '</div>';

    // last 7 days strip
    var strip = '';
    for (var i = 6; i >= 0; i--) {
      var d = new Date(Date.now() - i * 86400000);
      var ds = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      var dv = dayVerdict(ds);
      var col = dv.win ? 'var(--green)' : (ds === today ? 'var(--gold)' : 'var(--red)');
      var glyph = dv.win ? '✓' : (ds === today ? '·' : '✕');
      strip += '<div style="text-align:center;flex:1;min-width:34px">' +
        '<div style="font:700 14px var(--font-mono);color:' + col + '">' + glyph + '</div>' +
        '<div style="font:600 9px var(--font-mono);color:var(--text-muted);margin-top:2px">' + ['SU','MO','TU','WE','TH','FR','SA'][d.getDay()] + '</div>' +
      '</div>';
    }

    // today's raw candidates
    var cands = dayCandidates(today);
    var candHtml = cands.length
      ? cands.map(function(a) {
          var b = qualifies(a.type, a.distance || 0, a.moving_time || 0);
          return '<div class="as-recent-row">' +
            '<div style="font-size:18px">' + (TYPE_ICON[a.type] || '●') + '</div>' +
            '<div style="flex:1;min-width:160px">' +
              '<div style="font:600 12px var(--font-mono);color:var(--text)">' + esc(a.name || a.type) + '</div>' +
              '<div style="font:500 10px var(--font-mono);color:var(--text-muted)">' + (a.distance ? (a.distance / 1000).toFixed(2) + ' km · ' : '') + fmtDur(a.moving_time) + (a.start_date_local ? ' · ' + fmtClock(parseLocal(a.start_date_local)) : '') + '</div>' +
            '</div>' +
            (b ? '<span style="font:700 10px var(--font-mono);letter-spacing:1px;color:var(--green);border:1px solid rgba(0,230,118,0.3);border-radius:6px;padding:4px 8px">QUALIFIES · ' + b.toUpperCase() + '</span>'
               : '<span style="font:700 10px var(--font-mono);letter-spacing:1px;color:var(--text-muted);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:4px 8px">BELOW FLOOR</span>') +
          '</div>';
        }).join('')
      : '<div style="font:500 12px var(--font-mono);color:var(--text-muted);padding:8px 0">Nothing recorded yet today.</div>';

    el.innerHTML = statusHtml + menuHtml +
      '<div class="as-card" style="margin-top:24px"><div class="panel-section-title" style="margin-bottom:10px">LAST 7 DAYS</div><div style="display:flex;gap:6px">' + strip + '</div></div>' +
      '<div style="margin-top:24px"><div class="panel-section-title" style="margin-bottom:4px">TODAY\'S ACTIVITIES</div>' + candHtml + '</div>';

    el.querySelectorAll('[data-astrack]').forEach(function(b) {
      b.addEventListener('click', function() { startTracking(b.dataset.astrack); });
    });
    el.querySelectorAll('[data-aslog]').forEach(function(b) {
      b.addEventListener('click', function() {
        var m = MENU.filter(function(x) { return x.key === b.dataset.aslog; })[0];
        prefillUpload({ type: m.type });
        showView('upload');
      });
    });
    var gp = $('asGoPost');
    if (gp) gp.addEventListener('click', function() { showView('post'); });
  }

  // ═══════════════════════════════════════════
  // LIVE TRACKER
  // ═══════════════════════════════════════════
  function startTracking(menuKey) {
    var m = MENU.filter(function(x) { return x.key === menuKey; })[0];
    if (!m) return;
    state.track = {
      menu: m, startTs: Date.now(), pausedMs: 0, pauseStart: null,
      meters: 0, lastFix: null, watchId: null, accuracy: null, done: false
    };
    if (m.gps && navigator.geolocation) {
      state.track.watchId = navigator.geolocation.watchPosition(onFix, function() {}, {
        enableHighAccuracy: true, maximumAge: 1000, timeout: 15000
      });
    }
    if (navigator.wakeLock && navigator.wakeLock.request) {
      navigator.wakeLock.request('screen').then(function(l) { state.wakeLock = l; }).catch(function() {});
    }
    renderTrack();
    showView('track');
  }

  function onFix(pos) {
    var t = state.track;
    if (!t || t.pauseStart) return;
    var c = pos.coords;
    t.accuracy = c.accuracy;
    if (c.accuracy > 40) return; // poor fix — ignore
    if (t.lastFix) {
      var d = haversine(t.lastFix.latitude, t.lastFix.longitude, c.latitude, c.longitude);
      var dt = (pos.timestamp - t.lastFixTs) / 1000;
      if (d >= 2 && (dt <= 0 || d / dt < 30)) t.meters += d; // jitter floor + 108km/h teleport guard
    }
    t.lastFix = c;
    t.lastFixTs = pos.timestamp;
  }

  function haversine(lat1, lon1, lat2, lon2) {
    var R = 6371000, rad = Math.PI / 180;
    var dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function trackElapsedSec() {
    var t = state.track;
    if (!t) return 0;
    var paused = t.pausedMs + (t.pauseStart ? Date.now() - t.pauseStart : 0);
    return Math.max(0, (Date.now() - t.startTs - paused) / 1000);
  }

  function renderTrack() {
    var el = $('asViewTrack');
    var t = state.track;
    if (!el || !t) return;
    var m = t.menu;
    el.innerHTML =
      '<div class="as-card" style="text-align:center;padding:32px 20px;border-color:' + m.color + '44">' +
        '<div style="font:700 12px var(--font-mono);letter-spacing:3px;color:' + m.color + '">' + m.icon + ' ' + m.label + ' — LIVE</div>' +
        '<div class="as-track-clock" id="asTrkClock" style="margin:22px 0 6px">0:00</div>' +
        '<div style="font:600 10px var(--font-mono);letter-spacing:2px;color:var(--text-muted)">ELAPSED</div>' +
        '<div class="as-grid3" style="max-width:460px;margin:26px auto 0">' +
          '<div><div class="as-track-stat" id="asTrkDist">' + (m.gps ? '0.00' : '—') + '</div><div style="font:600 9px var(--font-mono);letter-spacing:2px;color:var(--text-muted);margin-top:4px">KM' + (m.gps ? ' (GPS)' : '') + '</div></div>' +
          '<div><div class="as-track-stat" id="asTrkPace">—</div><div style="font:600 9px var(--font-mono);letter-spacing:2px;color:var(--text-muted);margin-top:4px">PACE</div></div>' +
          '<div><div class="as-track-stat" id="asTrkPct">0%</div><div style="font:600 9px var(--font-mono);letter-spacing:2px;color:var(--text-muted);margin-top:4px">OF ' + m.rule + '</div></div>' +
        '</div>' +
        '<div style="max-width:460px;margin:18px auto 0;height:8px;border-radius:4px;background:rgba(255,255,255,0.07);overflow:hidden">' +
          '<div id="asTrkBar" style="height:100%;width:0%;border-radius:4px;background:' + m.color + ';transition:width 0.6s"></div>' +
        '</div>' +
        '<div id="asTrkGps" style="font:500 10px var(--font-mono);color:var(--text-muted);margin-top:12px">' + (m.gps ? 'Acquiring GPS…' : 'Timer mode — distance not tracked') + '</div>' +
        '<div style="display:flex;gap:12px;justify-content:center;margin-top:26px;flex-wrap:wrap">' +
          '<button class="as-btn ghost" id="asTrkPause" style="min-width:120px">⏸ PAUSE</button>' +
          '<button class="as-btn grn" id="asTrkFinish" style="min-width:120px">■ FINISH</button>' +
          '<button class="as-btn red" id="asTrkDiscard">DISCARD</button>' +
        '</div>' +
      '</div>';

    $('asTrkPause').addEventListener('click', function() {
      if (t.pauseStart) { t.pausedMs += Date.now() - t.pauseStart; t.pauseStart = null; this.textContent = '⏸ PAUSE'; }
      else { t.pauseStart = Date.now(); this.textContent = '▶ RESUME'; }
    });
    $('asTrkFinish').addEventListener('click', finishTracking);
    $('asTrkDiscard').addEventListener('click', function() {
      if (!confirm('Discard this session? Nothing will be saved.')) return;
      stopTracking();
      showView('today');
    });
  }

  function updateTrackUI() {
    var t = state.track;
    if (!t || state.view !== 'track') return;
    var sec = trackElapsedSec();
    var clock = $('asTrkClock');
    if (clock) clock.textContent = fmtDur(sec);
    var m = t.menu;
    var pct = null;
    if (m.gps) {
      var dEl = $('asTrkDist');
      if (dEl) dEl.textContent = (t.meters / 1000).toFixed(2);
      var pEl = $('asTrkPace');
      if (pEl && t.meters > 50) pEl.textContent = paceStr(m.type, t.meters, sec).split(' ')[0];
      pct = Math.min(100, Math.round((t.meters / m.minM) * 100));
    } else if (m.minSec) {
      pct = Math.min(100, Math.round((sec / m.minSec) * 100));
    }
    // swim: no GPS in water — timer only, distance entered at upload
    var pctEl = $('asTrkPct'), bar = $('asTrkBar');
    if (pctEl) { pctEl.textContent = pct === null ? '—' : pct + '%'; pctEl.style.color = pct >= 100 ? 'var(--green)' : 'var(--text)'; }
    if (bar && pct !== null) { bar.style.width = pct + '%'; if (pct >= 100) bar.style.background = 'var(--green)'; }
    var gpsEl = $('asTrkGps');
    if (gpsEl && m.gps) gpsEl.textContent = t.accuracy ? ('GPS ±' + Math.round(t.accuracy) + 'm' + (pct >= 100 ? ' · MENU THRESHOLD MET ✓' : '')) : 'Acquiring GPS…';
  }

  function stopTracking() {
    var t = state.track;
    if (t && t.watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(t.watchId);
    if (state.wakeLock) { try { state.wakeLock.release(); } catch (e) {} state.wakeLock = null; }
    state.track = null;
  }

  function finishTracking() {
    var t = state.track;
    if (!t) return;
    var sec = Math.round(trackElapsedSec());
    var km = t.meters / 1000;
    var started = new Date(t.startTs);
    var m = t.menu;
    stopTracking();
    prefillUpload({
      type: m.type,
      km: m.gps ? +km.toFixed(2) : '',
      sec: sec,
      date: started.getFullYear() + '-' + pad(started.getMonth() + 1) + '-' + pad(started.getDate()),
      time: pad(started.getHours()) + ':' + pad(started.getMinutes()),
      name: 'Studio ' + (m.key === 'hr' ? 'Session' : m.type)
    });
    showView('upload');
  }

  // ═══════════════════════════════════════════
  // UPLOAD VIEW
  // ═══════════════════════════════════════════
  function buildUploadForm() {
    var el = $('asViewUpload');
    if (!el) return;
    var typeOpts = TYPE_OPTIONS.map(function(t) { return '<option value="' + t + '">' + t + '</option>'; }).join('');
    el.innerHTML =
      '<div class="as-card">' +
        '<div class="panel-section-title" id="asUpTitle">UPLOAD ACTIVITY</div>' +
        '<div class="as-grid2" style="margin-top:16px">' +
          '<div class="as-field"><label>SPORT</label><select id="asUpType">' + typeOpts + '</select></div>' +
          '<div class="as-field"><label>NAME</label><input id="asUpName" type="text" placeholder="Morning Run" maxlength="80"></div>' +
        '</div>' +
        '<div class="as-grid2" style="margin-top:12px">' +
          '<div class="as-field"><label>DATE</label><input id="asUpDate" type="date"></div>' +
          '<div class="as-field"><label>START TIME</label><input id="asUpTime" type="time"></div>' +
        '</div>' +
        '<div class="as-grid4" style="margin-top:12px">' +
          '<div class="as-field"><label>DISTANCE KM</label><input id="asUpKm" type="number" step="0.01" min="0" inputmode="decimal" placeholder="5.00"></div>' +
          '<div class="as-field"><label>HOURS</label><input id="asUpH" type="number" min="0" max="23" inputmode="numeric" placeholder="0"></div>' +
          '<div class="as-field"><label>MINUTES</label><input id="asUpM" type="number" min="0" max="59" inputmode="numeric" placeholder="35"></div>' +
          '<div class="as-field"><label>SECONDS</label><input id="asUpS" type="number" min="0" max="59" inputmode="numeric" placeholder="0"></div>' +
        '</div>' +
        '<div class="as-grid3" style="margin-top:12px">' +
          '<div class="as-field"><label>AVG HEART RATE</label><input id="asUpHr" type="number" min="40" max="230" inputmode="numeric" placeholder="150"></div>' +
          '<div class="as-field"><label>CALORIES</label><div style="display:flex;gap:6px"><input id="asUpCal" type="number" min="0" inputmode="numeric" placeholder="320" style="flex:1"><button class="as-btn ghost" id="asUpCalAuto" title="MET estimate" style="padding:8px 10px">AUTO</button></div></div>' +
          '<div class="as-field"><label>BODYWEIGHT KG <span style="opacity:0.6">(for AUTO)</span></label><input id="asUpWt" type="number" min="30" max="200" inputmode="decimal"></div>' +
        '</div>' +
        '<div class="as-field" style="margin-top:12px"><label>PHOTO — EVIDENCE / POST BACKGROUND (optional, stays on device until you publish)</label>' +
          '<input id="asUpPhoto" type="file" accept="image/*">' +
          '<div id="asUpPhotoPrev" style="margin-top:8px"></div>' +
        '</div>' +
        '<div id="asUpQualify" style="margin-top:16px;font:600 12px var(--font-mono);letter-spacing:1px;color:var(--text-muted)"></div>' +
        '<div style="display:flex;gap:12px;margin-top:18px;flex-wrap:wrap">' +
          '<button class="as-btn grn" id="asUpSave" style="min-width:180px">SAVE ACTIVITY</button>' +
          '<button class="as-btn ghost" id="asUpClear">CLEAR</button>' +
        '</div>' +
        '<div id="asUpStatus" style="margin-top:12px;font:500 12px var(--font-mono);color:var(--text-muted)"></div>' +
      '</div>' +
      '<div style="margin-top:24px"><div class="panel-section-title" style="margin-bottom:4px">RECENT STUDIO UPLOADS</div><div id="asUpRecent"></div></div>';

    $('asUpWt').value = localStorage.getItem('fl_studio_weight_kg') || '70';
    $('asUpDate').value = todayLocal();
    var now = new Date();
    $('asUpTime').value = pad(now.getHours()) + ':' + pad(now.getMinutes());

    ['asUpType', 'asUpKm', 'asUpH', 'asUpM', 'asUpS'].forEach(function(id) {
      $(id).addEventListener('input', updateQualify);
      $(id).addEventListener('change', updateQualify);
    });
    $('asUpCalAuto').addEventListener('click', autoCalories);
    $('asUpWt').addEventListener('change', function() { localStorage.setItem('fl_studio_weight_kg', this.value); });
    $('asUpPhoto').addEventListener('change', onPhotoPick);
    $('asUpSave').addEventListener('click', saveUpload);
    $('asUpClear').addEventListener('click', function() { prefillUpload({}); });
    updateQualify();
  }

  function formSeconds() {
    return (parseInt($('asUpH').value || 0, 10) * 3600) + (parseInt($('asUpM').value || 0, 10) * 60) + parseInt($('asUpS').value || 0, 10);
  }

  function updateQualify() {
    var el = $('asUpQualify');
    if (!el) return;
    var type = $('asUpType').value;
    var meters = (parseFloat($('asUpKm').value) || 0) * 1000;
    var sec = formSeconds();
    var b = qualifies(type, meters, sec);
    if (b) {
      var label = { walk: 'WALK 5KM+', run: 'RUN 5KM+', cycle: 'CYCLE 10KM+', swim: 'SWIM 1KM+', hrSession: 'HR SESSION 30MIN+' }[b];
      el.innerHTML = '<span style="color:var(--green)">✓ QUALIFIES — ' + label + ' · counts toward tonight\'s verdict</span>';
    } else if (meters > 0 || sec > 0) {
      el.innerHTML = '<span style="color:var(--gold)">○ Below every menu floor — will be saved but won\'t seal the day</span>';
    } else {
      el.textContent = '';
    }
  }

  function autoCalories() {
    var type = $('asUpType').value;
    var sec = formSeconds();
    if (!sec) { $('asUpStatus').textContent = 'Enter a duration first — AUTO uses MET × bodyweight × hours.'; return; }
    var m = MENU.filter(function(x) { return x.type === type; })[0];
    var met = m ? m.met : 6.0;
    var kg = parseFloat($('asUpWt').value) || 70;
    $('asUpCal').value = Math.round(met * kg * (sec / 3600));
    $('asUpStatus').textContent = 'Estimated at ' + met + ' MET × ' + kg + ' kg.';
  }

  function onPhotoPick() {
    var f = this.files && this.files[0];
    var prev = $('asUpPhotoPrev');
    if (!f) { state.photo = null; prev.innerHTML = ''; return; }
    var reader = new FileReader();
    reader.onload = function(e) {
      var img = new Image();
      img.onload = function() {
        state.photo = { img: img, name: f.name };
        prev.innerHTML = '<img src="' + e.target.result + '" style="max-width:160px;border-radius:8px;border:1px solid rgba(255,255,255,0.1)" alt="preview">';
        renderPost();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(f);
  }

  function prefillUpload(v) {
    if (!$('asUpType')) return;
    $('asUpType').value = v.type || 'Run';
    $('asUpName').value = v.name || '';
    $('asUpDate').value = v.date || todayLocal();
    var now = new Date();
    $('asUpTime').value = v.time || (pad(now.getHours()) + ':' + pad(now.getMinutes()));
    $('asUpKm').value = (v.km === 0 || v.km) ? v.km : '';
    var sec = v.sec || 0;
    $('asUpH').value = sec ? Math.floor(sec / 3600) : '';
    $('asUpM').value = sec ? Math.floor((sec % 3600) / 60) : '';
    $('asUpS').value = sec ? sec % 60 : '';
    $('asUpHr').value = ''; $('asUpCal').value = '';
    state.editingId = v.id || null;
    $('asUpTitle').textContent = state.editingId ? 'EDIT STUDIO ACTIVITY' : 'UPLOAD ACTIVITY';
    $('asUpStatus').textContent = '';
    updateQualify();
  }

  function saveUpload() {
    var btn = $('asUpSave'), status = $('asUpStatus');
    var type = $('asUpType').value;
    var sec = formSeconds();
    var km = parseFloat($('asUpKm').value) || 0;
    var dateStr = $('asUpDate').value;
    var timeStr = $('asUpTime').value || '12:00';
    if (!dateStr) { status.innerHTML = '<span style="color:var(--red)">Pick a date.</span>'; return; }
    if (!sec) { status.innerHTML = '<span style="color:var(--red)">Duration is required.</span>'; return; }

    var startLocal = new Date(dateStr + 'T' + timeStr + ':00');
    var name = $('asUpName').value.trim() || (type + ' · Manual');
    var id = state.editingId || Date.now(); // ms epoch — far above any real Strava id, collision-safe for one human
    var meters = Math.round(km * 1000);
    var row = {
      id: id,
      name: name,
      type: type,
      sport_type: type,
      distance: meters,
      moving_time: sec,
      elapsed_time: sec,
      start_date: startLocal.toISOString(),
      start_date_local: dateStr + 'T' + timeStr + ':00+00:00', // convention: local wall-clock labeled +00:00 (see parseLocal)
      average_speed: sec ? +(meters / sec).toFixed(3) : null,
      average_heartrate: parseFloat($('asUpHr').value) || null,
      calories: parseFloat($('asUpCal').value) || null,
      device_name: DEVICE_NAME,
      synced_at: new Date().toISOString()
    };

    btn.disabled = true;
    btn.textContent = 'SAVING...';
    status.textContent = '';
    adminWrite('strava_activities', row)
      .then(function() {
        btn.textContent = 'SAVED ✓';
        var b = qualifies(type, meters, sec);
        status.innerHTML = '<span style="color:var(--green)">Saved.' + (b ? ' Qualifies for today\'s menu — the nightly judge will see it.' : '') + '</span> <a id="asUpToPost" style="color:var(--cyan);cursor:pointer;text-decoration:underline">Create post →</a>';
        state.editingId = null;
        $('asUpTitle').textContent = 'UPLOAD ACTIVITY';
        return loadData();
      })
      .then(function() {
        renderRecentUploads();
        var link = $('asUpToPost');
        if (link) link.addEventListener('click', function() { showView('post'); });
        setTimeout(function() { btn.textContent = 'SAVE ACTIVITY'; btn.disabled = false; }, 1500);
      })
      .catch(function(err) {
        status.innerHTML = '<span style="color:var(--red)">Save failed: ' + esc(err.message) + '</span>';
        btn.textContent = 'SAVE ACTIVITY';
        btn.disabled = false;
      });
  }

  function renderRecentUploads() {
    var el = $('asUpRecent');
    if (!el) return;
    var mine = state.activities.filter(function(a) { return a.device_name === DEVICE_NAME; }).slice(0, 10);
    if (!mine.length) { el.innerHTML = '<div style="font:500 12px var(--font-mono);color:var(--text-muted);padding:8px 0">No Studio uploads in the last 14 days.</div>'; return; }
    el.innerHTML = mine.map(function(a) {
      var b = qualifies(a.type, a.distance || 0, a.moving_time || 0);
      return '<div class="as-recent-row">' +
        '<div style="font-size:18px">' + (TYPE_ICON[a.type] || '●') + '</div>' +
        '<div style="flex:1;min-width:160px">' +
          '<div style="font:600 12px var(--font-mono);color:var(--text)">' + esc(a.name) + '</div>' +
          '<div style="font:500 10px var(--font-mono);color:var(--text-muted)">' + (a.start_date_local || '').slice(0, 10) + ' · ' + (a.distance ? (a.distance / 1000).toFixed(2) + ' km · ' : '') + fmtDur(a.moving_time) + '</div>' +
        '</div>' +
        (b ? '<span style="font:700 9px var(--font-mono);color:var(--green)">✓ MENU</span>' : '') +
        '<button class="as-btn ghost" data-asedit="' + a.id + '" style="padding:8px 12px;min-height:36px">EDIT</button>' +
      '</div>';
    }).join('');
    el.querySelectorAll('[data-asedit]').forEach(function(b) {
      b.addEventListener('click', function() {
        var a = state.activities.filter(function(x) { return String(x.id) === b.dataset.asedit; })[0];
        if (!a) return;
        var local = parseLocal(a.start_date_local);
        prefillUpload({
          id: a.id, type: a.type, name: a.name,
          date: (a.start_date_local || '').slice(0, 10),
          time: pad(local.getHours()) + ':' + pad(local.getMinutes()),
          km: a.distance ? +(a.distance / 1000).toFixed(2) : '',
          sec: a.moving_time || 0
        });
        $('asUpHr').value = a.average_heartrate ? Math.round(a.average_heartrate) : '';
        $('asUpCal').value = a.calories ? Math.round(a.calories) : '';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  // ═══════════════════════════════════════════
  // POST STUDIO
  // ═══════════════════════════════════════════
  function buildPostStudio() {
    var el = $('asViewPost');
    if (!el) return;
    var themeOpts = Object.keys(THEMES).map(function(k) { return '<option value="' + k + '">' + THEMES[k].name + '</option>'; }).join('');
    el.innerHTML =
      '<div class="as-grid3" style="margin-bottom:16px">' +
        '<div class="as-field"><label>ACTIVITY</label><select id="asPoAct"></select></div>' +
        '<div class="as-field"><label>THEME</label><select id="asPoTheme">' + themeOpts + '</select></div>' +
        '<div class="as-field"><label>LAYOUT</label><select id="asPoLayout"><option value="card">STAT CARD</option><option value="photo">PHOTO + STATS</option></select></div>' +
      '</div>' +
      '<div class="as-field" id="asPoPhotoField" style="display:none;margin-bottom:16px"><label>PHOTO</label><input id="asPoPhoto" type="file" accept="image/*"></div>' +
      '<div class="as-postwrap">' +
        '<div>' +
          '<canvas id="asPoCanvas" class="as-preview" width="1080" height="1080"></canvas>' +
          '<div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">' +
            '<button class="as-btn ghost" id="asPoDl">⬇ POST JPG</button>' +
            '<button class="as-btn ghost" id="asPoDlStory">⬇ STORY JPG</button>' +
          '</div>' +
        '</div>' +
        '<div>' +
          '<div class="as-field"><label>CAPTION</label><textarea id="asPoCaption" rows="8" style="resize:vertical"></textarea></div>' +
          '<label style="display:flex;align-items:center;gap:8px;margin-top:10px;font:500 11px var(--font-mono);color:var(--text-muted);cursor:pointer"><input type="checkbox" id="asPoTags" checked style="width:16px;height:16px"> Include hashtags</label>' +
          '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">' +
            '<button class="as-btn ghost" id="asPoCopy">COPY CAPTION</button>' +
            '<button class="as-btn pri" id="asPoPub">PUBLISH POST → IG</button>' +
            '<button class="as-btn pri" id="asPoPubStory">PUBLISH STORY → IG</button>' +
          '</div>' +
          '<div id="asPoStatus" style="margin-top:12px;font:500 12px var(--font-mono);color:var(--text-muted);word-break:break-word"></div>' +
        '</div>' +
      '</div>';

    $('asPoAct').addEventListener('change', function() { pickPostActivity(this.value); });
    $('asPoTheme').addEventListener('change', renderPost);
    $('asPoLayout').addEventListener('change', function() {
      $('asPoPhotoField').style.display = this.value === 'photo' ? '' : 'none';
      renderPost();
    });
    $('asPoPhoto').addEventListener('change', onPhotoPick.bind($('asPoPhoto')));
    $('asPoTags').addEventListener('change', buildCaption);
    $('asPoDl').addEventListener('click', function() { downloadCanvas(false); });
    $('asPoDlStory').addEventListener('click', function() { downloadCanvas(true); });
    $('asPoCopy').addEventListener('click', function() {
      var b = this;
      navigator.clipboard.writeText($('asPoCaption').value).then(function() {
        b.textContent = 'COPIED ✓'; setTimeout(function() { b.textContent = 'COPY CAPTION'; }, 1500);
      });
    });
    $('asPoPub').addEventListener('click', function() { publish(false, this); });
    $('asPoPubStory').addEventListener('click', function() { publish(true, this); });
  }

  function refreshPostPicker() {
    var sel = $('asPoAct');
    if (!sel) return;
    var opts = state.activities.slice(0, 30).map(function(a) {
      var d = (a.start_date_local || '').slice(0, 10);
      var stat = a.distance ? (a.distance / 1000).toFixed(1) + 'km' : Math.round((a.moving_time || 0) / 60) + 'min';
      return '<option value="' + a.id + '">' + d + ' · ' + esc(a.type) + ' · ' + stat + ' · ' + esc((a.name || '').slice(0, 28)) + '</option>';
    }).join('');
    sel.innerHTML = opts || '<option value="">No activities in last 14 days</option>';
    if (state.activities.length) pickPostActivity(String(state.activities[0].id));
  }

  function pickPostActivity(id) {
    state.postActivity = state.activities.filter(function(a) { return String(a.id) === String(id); })[0] || null;
    if (state.postActivity) {
      var b = qualifies(state.postActivity.type, state.postActivity.distance || 0, state.postActivity.moving_time || 0);
      var themeSel = $('asPoTheme');
      if (b && themeSel && SPORT_THEME[b]) themeSel.value = SPORT_THEME[b];
    }
    buildCaption();
    renderPost();
  }

  function buildCaption() {
    var a = state.postActivity;
    var cap = $('asPoCaption');
    if (!a || !cap) return;
    var dateStr = (a.start_date_local || '').slice(0, 10) || todayLocal();
    var day = dayNumber(dateStr);
    var stat = a.distance >= 100
      ? (a.distance / 1000).toFixed(1) + ' km · ' + a.type
      : Math.round((a.moving_time || 0) / 60) + ' min · ' + a.type;
    var b = qualifies(a.type, a.distance || 0, a.moving_time || 0);
    var tags = ($('asPoTags') && $('asPoTags').checked) ? '\n.\n.\n' + (HASHTAGS[b] || HASHTAGS.hrSession) : '';
    cap.value = 'Day ' + day + '.\n' + stat + '.\n\nfirstlight.live' + tags;
  }

  // ── canvas rendering ──
  function drawGrain(ctx, W, H) {
    for (var i = 0; i < 1800; i++) {
      ctx.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.05) + ')';
      ctx.fillRect(Math.random() * W, Math.random() * H, 1.2, 1.2);
    }
  }
  function drawScanlines(ctx, W, H) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (var y = 0; y < H; y += 5) ctx.fillRect(0, y, W, 1.5);
  }

  function drawPhotoCover(ctx, img, W, H) {
    var s = Math.max(W / img.width, H / img.height);
    var w = img.width * s, h = img.height * s;
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  }

  function activityStats(a) {
    var out = [];
    if (a.distance >= 100) out.push({ v: (a.distance / 1000).toFixed(2), l: 'KM' });
    out.push({ v: fmtDur(a.moving_time), l: 'TIME' });
    var p = paceStr(a.type, a.distance, a.moving_time);
    if (p && a.distance >= 100) out.push({ v: p.split(' ')[0], l: p.split(' ')[1] || 'PACE' });
    if (a.average_heartrate) out.push({ v: String(Math.round(a.average_heartrate)), l: 'AVG BPM' });
    if (a.calories) out.push({ v: String(Math.round(a.calories)), l: 'KCAL' });
    return out.slice(0, 4);
  }

  function renderPostCanvas(canvas, story) {
    var a = state.postActivity;
    if (!canvas || !a) return;
    var W = 1080, H = story ? 1920 : 1080;
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');
    var theme = THEMES[$('asPoTheme').value] || THEMES.noir;
    var layout = $('asPoLayout').value;
    var dateStr = (a.start_date_local || '').slice(0, 10) || todayLocal();
    var day = dayNumber(dateStr);
    var usePhoto = layout === 'photo' && state.photo && state.photo.img;

    // background
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, H);
    if (usePhoto) {
      drawPhotoCover(ctx, state.photo.img, W, H);
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,0.55)');
      g.addColorStop(0.35, 'rgba(0,0,0,0.12)');
      g.addColorStop(0.62, 'rgba(0,0,0,0.25)');
      g.addColorStop(1, 'rgba(0,0,0,0.85)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    var text = usePhoto ? '#FFFFFF' : theme.text;
    var dim = usePhoto ? 'rgba(255,255,255,0.65)' : theme.dim;
    var accent = usePhoto ? theme.accent : theme.accent;

    // header
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = accent;
    ctx.font = '700 34px ' + MONO;
    ctx.fillText('◆ FIRST LIGHT', 70, story ? 120 : 74);
    ctx.fillStyle = dim;
    ctx.font = '600 24px ' + MONO;
    ctx.textAlign = 'right';
    ctx.fillText('CHAPTER 02 — ENDURANCE', W - 70, story ? 126 : 80);

    var cy = story ? 420 : 220;

    // DAY N
    ctx.textAlign = 'left';
    ctx.fillStyle = dim;
    ctx.font = '600 30px ' + MONO;
    ctx.fillText('DAY', 70, cy);
    ctx.fillStyle = text;
    ctx.font = '700 ' + (story ? 300 : 260) + 'px ' + MONO;
    ctx.fillText(String(day), 70, cy + 34);
    var dayH = story ? 300 : 260;

    // sport line
    var icon = TYPE_ICON[a.type] || '●';
    ctx.fillStyle = accent;
    ctx.font = '700 44px ' + MONO;
    var sportY = cy + 34 + dayH + 40;
    ctx.fillText(icon + '  ' + (a.name || a.type).toUpperCase().slice(0, 30), 70, sportY);

    // accent rule
    ctx.fillStyle = accent;
    ctx.fillRect(70, sportY + 78, 180, 6);

    // stats row
    var stats = activityStats(a);
    var statY = story ? H - 520 : H - 320;
    var cellW = (W - 140) / stats.length;
    stats.forEach(function(s, i) {
      var x = 70 + i * cellW;
      if (!usePhoto) {
        ctx.fillStyle = theme.cardBg;
        ctx.strokeStyle = theme.cardBorder;
        ctx.lineWidth = 2;
        roundRect(ctx, x, statY, cellW - 18, 170, 14);
        ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = text;
      ctx.font = '700 ' + (s.v.length > 6 ? 44 : 56) + 'px ' + MONO;
      ctx.textAlign = 'left';
      ctx.fillText(s.v, x + 24, statY + 34);
      ctx.fillStyle = dim;
      ctx.font = '600 20px ' + MONO;
      ctx.fillText(s.l, x + 24, statY + 112);
    });

    // footer
    ctx.fillStyle = dim;
    ctx.font = '600 24px ' + MONO;
    ctx.textAlign = 'left';
    ctx.fillText(fmtDateLong(dateStr), 70, H - 96);
    ctx.fillStyle = text;
    ctx.textAlign = 'right';
    ctx.font = '700 26px ' + MONO;
    ctx.fillText('firstlight.live', W - 70, H - 98);

    if (!usePhoto && theme.grain) drawGrain(ctx, W, H);
    if (!usePhoto && theme.scanlines) drawScanlines(ctx, W, H);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function renderPost() {
    var canvas = $('asPoCanvas');
    if (canvas && state.postActivity) renderPostCanvas(canvas, false);
  }

  function downloadCanvas(story) {
    var a = state.postActivity;
    if (!a) return;
    var canvas;
    if (story) {
      canvas = document.createElement('canvas');
      renderPostCanvas(canvas, true);
    } else {
      canvas = $('asPoCanvas');
      renderPostCanvas(canvas, false);
    }
    var link = document.createElement('a');
    var dateStr = (a.start_date_local || '').slice(0, 10);
    link.download = 'day' + dayNumber(dateStr) + '-' + (story ? 'story' : 'post') + '.jpg';
    link.href = canvas.toDataURL('image/jpeg', 0.95);
    link.click();
  }

  // ── IG publish (same pipeline as recap) ──
  function uploadCanvasToStorage(canvas, filename) {
    return new Promise(function(resolve, reject) {
      var base64 = canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
      var binary = atob(base64);
      var arr = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
      fetch(SUPA + '/storage/v1/object/media/instagram/' + filename, {
        method: 'POST',
        headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
        body: arr
      }).then(function(r) {
        if (!r.ok) throw new Error('Upload failed: ' + r.status);
        resolve(SUPA + '/storage/v1/object/public/media/instagram/' + filename);
      }).catch(reject);
    });
  }

  function igProxy(endpoint, params) {
    return fetch(SYNC_URL + '?action=ig-proxy&admin_key=' + ADMIN_KEY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
      body: JSON.stringify({ endpoint: endpoint, params: params })
    }).then(function(r) { return r.json(); });
  }

  function publish(story, btn) {
    var a = state.postActivity;
    var status = $('asPoStatus');
    if (!a) return;
    if (!confirm('Publish this ' + (story ? 'STORY' : 'POST') + ' to @firstlightlive?')) return;

    var canvas = document.createElement('canvas');
    renderPostCanvas(canvas, story);
    var caption = $('asPoCaption').value;
    var orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'PUBLISHING...';
    status.textContent = 'Uploading image…';

    uploadCanvasToStorage(canvas, 'studio_' + (story ? 'story' : 'post') + '_' + Date.now() + '.jpg')
      .then(function(publicUrl) {
        status.textContent = 'Creating Instagram container…';
        var params = story
          ? { image_url: publicUrl, media_type: 'STORIES' }
          : { image_url: publicUrl, caption: caption, media_type: 'IMAGE' };
        return igProxy(IG_ACCOUNT + '/media', params);
      })
      .then(function(container) {
        if (!container || !container.id) throw new Error('Container failed: ' + JSON.stringify(container));
        status.textContent = 'Processing…';
        return new Promise(function(res) { setTimeout(function() { res(container.id); }, 4000); });
      })
      .then(function(cid) { return igProxy(IG_ACCOUNT + '/media_publish', { creation_id: cid }); })
      .then(function(pub) {
        if (!pub || !pub.id) throw new Error('Publish failed: ' + JSON.stringify(pub));
        status.innerHTML = '<span style="color:var(--green)">Published ✓ media ' + pub.id + '</span>';
        btn.textContent = 'PUBLISHED ✓';
        setTimeout(function() { btn.textContent = orig; btn.disabled = false; }, 3000);
      })
      .catch(function(err) {
        status.innerHTML = '<span style="color:var(--red)">' + esc(err.message) + '</span>';
        btn.textContent = orig;
        btn.disabled = false;
      });
  }

  // ═══════════════════════════════════════════
  // TICKER — countdown + live tracker refresh
  // ═══════════════════════════════════════════
  function startTicker() {
    if (state.tick) return;
    state.tick = setInterval(function() {
      var cd = $('asCountdown');
      if (cd) {
        var now = new Date();
        var end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        var left = Math.max(0, (end - now) / 1000);
        cd.textContent = Math.floor(left / 3600) + ':' + pad(Math.floor((left % 3600) / 60)) + ':' + pad(Math.floor(left % 60));
        cd.style.color = left < 3 * 3600 ? 'var(--red)' : 'var(--gold)';
      }
      if (state.track) updateTrackUI();
    }, 1000);
  }

  // Re-acquire wake lock when tab becomes visible again mid-session
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible' && state.track && navigator.wakeLock && navigator.wakeLock.request) {
      navigator.wakeLock.request('screen').then(function(l) { state.wakeLock = l; }).catch(function() {});
    }
  });

  // ═══════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════
  function initStudio() {
    if (!buildShell()) return;
    loadData().then(function() {
      if (state.view === 'today') renderToday();
      renderRecentUploads();
      refreshPostPicker();
    });
  }

  if (typeof window.switchPanel === 'function') {
    var _origSwitch = window.switchPanel;
    window.switchPanel = function(name) {
      _origSwitch(name);
      if (name === 'activity-studio') initStudio();
    };
  }
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(initStudio, 600);
  });
})();
