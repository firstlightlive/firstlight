// ═══════════════════════════════════════════
// FIRST LIGHT — INIT
// ═══════════════════════════════════════════

// NOTE: renderRituals, saveRitualStateById, saveJournal, and loadRitualManager

// Extend RITUAL_DEFAULTS with weekly and monthly if they don't exist
if (typeof RITUAL_DEFAULTS !== 'undefined') {
  if (!RITUAL_DEFAULTS.weekly) RITUAL_DEFAULTS.weekly = [
{id:'w_ekadasi', block:'WEEKLY', sort_order:1, time:'', title:'Ekadashi fasting', desc:'Fruit, milk, water only. No grains.', cat:'AYUR', active:true},
{id:'w_social', block:'WEEKLY', sort_order:2, time:'', title:'Social covenant meetup', desc:'One non-negotiable meetup with core people.', cat:'MIND', active:true},
{id:'w_review', block:'WEEKLY', sort_order:3, time:'', title:'Weekly review (Sunday)', desc:'PERMA audit + ritual analytics review.', cat:'MIND', active:true}
  ];
  if (!RITUAL_DEFAULTS.monthly) RITUAL_DEFAULTS.monthly = [
{id:'m_goals', block:'MONTHLY', sort_order:1, time:'', title:'Monthly goal review', desc:'Review and set goals for the month.', cat:'MIND', active:true},
{id:'m_backup', block:'MONTHLY', sort_order:2, time:'', title:'Data backup', desc:'Export all data as JSON backup.', cat:'BIOHACK', active:true}
  ];
}

async function loadArchiveStatus() {
  var container = document.getElementById('archiveStatusContainer');
  container.innerHTML = '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim)">Loading...</div>';
  var logs = await checkArchiveStatus();
  if (!logs || !logs.length) {
container.innerHTML = '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim)">No archive runs yet. Click ARCHIVE NOW to start.</div>';
return;
  }
  var html = '';
  logs.forEach(function(log) {
var statusColor = log.status === 'success' ? 'var(--green)' : log.status === 'partial' ? 'var(--gold)' : 'var(--red)';
var statusIcon = log.status === 'success' ? '✓' : log.status === 'partial' ? '⚠' : '✗';
html += '<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid rgba(0,212,255,0.04);font-family:var(--font-mono);font-size:11px">';
html += '<span style="color:' + statusColor + ';font-weight:700;min-width:16px">' + statusIcon + '</span>';
html += '<span style="color:var(--text-muted);min-width:90px">' + log.archive_date + '</span>';
html += '<span style="color:var(--text)">' + log.tables_archived + ' tables</span>';
html += '<span style="color:var(--text-dim)">' + log.rows_archived + ' rows</span>';
html += '<span style="color:var(--text-dim)">' + (log.duration_ms || 0) + 'ms</span>';
if (log.error_message) html += '<span style="color:var(--red);font-size:9px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + log.error_message + '">ERR</span>';
html += '</div>';
  });
  container.innerHTML = html;
}

async function runManualArchive() {
  var btn = document.getElementById('archiveNowBtn');
  btn.disabled = true; btn.textContent = 'ARCHIVING...';
  var result = await triggerManualArchive();
  btn.disabled = false; btn.textContent = 'ARCHIVE NOW';
  if (result && result.success) {
flashBtn(btn, 'ARCHIVED ✓ — ' + result.tables_archived + ' tables, ' + result.rows_archived + ' rows');
loadArchiveStatus();
  } else {
alert('Archive failed: ' + (result ? result.error : 'Network error') + '\n\nMake sure the Edge Function is deployed.');
  }
}

renderRituals('morning');
renderRituals('midday');
renderRituals('evening');
renderJournalArchive();

// ═══════════════════════════════════════════
// BOOTSTRAP — ALWAYS SYNC FROM SUPABASE
// Merges remote data into local. Never overwrites newer local data.
// Runs EVERY page load to ensure data is never missing.
// ═══════════════════════════════════════════
(function bootstrapAllData() {
  var SUPA = FL.SUPABASE_URL;
  var KEY = FL.SUPABASE_ANON_KEY;
  var headers = { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY };

  function supaGet(table, query) {
    return fetch(SUPA + '/rest/v1/' + table + (query || ''), { headers: headers })
      .then(function(r) { return r.ok ? r.json() : []; })
      .catch(function() { return []; });
  }

  // 90 days ago string
  var d90 = new Date(Date.now() - 90 * 86400000);
  var ninetyAgo = d90.getFullYear() + '-' + String(d90.getMonth()+1).padStart(2,'0') + '-' + String(d90.getDate()).padStart(2,'0');

  // ── 1. PROOF DATA (streak graphs) — ALWAYS merge ──
  supaGet('proof_archive', '?select=*&order=date.desc').then(function(data) {
    if (!data || !data.length) return;
    var existing = getProofData();
    var existingMap = {};
    existing.forEach(function(p) { existingMap[p.date] = p; });

    data.forEach(function(r) {
      var remote = {
        date: r.date,
        sleepHrs: r.sleep_hrs ? parseFloat(r.sleep_hrs) : null,
        runKm: r.run_km ? parseFloat(r.run_km) : 0,
        gym: r.gym || false,
        foodClean: r.food_clean !== false,
        japa: true,
        mood: 7
      };
      // Merge: remote wins for dates not in local, or if remote has more data
      if (!existingMap[r.date]) {
        existingMap[r.date] = remote;
      } else {
        // Keep whichever has more run data
        var local = existingMap[r.date];
        if (remote.runKm > 0 && (!local.runKm || local.runKm === 0)) existingMap[r.date] = remote;
      }
    });

    var merged = Object.values(existingMap).sort(function(a,b) { return b.date > a.date ? 1 : -1; });
    localStorage.setItem('fl_proof_data', JSON.stringify(merged));
    console.log('[Bootstrap] Proof data: ' + merged.length + ' days synced');
    if (typeof buildDashboardStats === 'function') buildDashboardStats();
    // Re-render streaks panel if it's currently open (check multiple visibility methods)
    if (typeof renderUnifiedStreaks === 'function') {
      var streakPanel = document.getElementById('p-unified-streaks');
      if (streakPanel && (streakPanel.classList.contains('active') || streakPanel.offsetParent !== null || (streakPanel.style.display && streakPanel.style.display !== 'none'))) {
        renderUnifiedStreaks();
      }
    }
  });

  // ── 2. RACES — merge missing ──
  supaGet('races', '?order=date.desc').then(function(data) {
    if (!data || !data.length) return;
    var local = [];
    try { local = JSON.parse(localStorage.getItem('fl_races') || '[]'); } catch(e) {}
    var localIds = {};
    local.forEach(function(r) { localIds[r.id] = true; });
    var added = 0;
    data.forEach(function(r) {
      if (!localIds[r.id]) {
        local.push({
          id: r.id, name: r.name, shortName: r.short_name, date: r.date,
          location: r.location, country: r.country, type: r.type, distance: r.distance,
          status: r.status, bib: r.bib, bibPhoto: r.bib_photo, finishTime: r.finish_time,
          finishTimeSec: r.finish_time_sec, gunTime: r.gun_time, pace: r.pace,
          targetTime: r.target_time, position: r.position, splits: r.splits,
          conditions: r.conditions, heartRate: r.heart_rate, calories: r.calories,
          photos: r.photos, videos: r.videos, stravaUrl: r.strava_url,
          officialResultsUrl: r.official_results_url, notes: r.notes,
          highlight: r.highlight, tags: r.tags
        });
        added++;
      }
    });
    localStorage.setItem('fl_races', JSON.stringify(local));
    if (added > 0) console.log('[Bootstrap] Races: ' + added + ' added from Supabase');
  });

  // ── 3. SLIPS — always pull (immutable) ──
  supaGet('slips', '?order=date.desc').then(function(data) {
    if (data && data.length) {
      localStorage.setItem('fl_slips', JSON.stringify(data));
      console.log('[Bootstrap] Slips: ' + data.length + ' synced');
    }
  });

  // ── 4. RITUALS — merge last 90 days ──
  supaGet('daily_rituals', '?date=gte.' + ninetyAgo + '&order=date.desc').then(function(data) {
    if (!data || !data.length) return;
    var count = 0;
    data.forEach(function(r) {
      var key = 'fl_rituals_' + r.period + '_' + r.date;
      var local = localStorage.getItem(key);
      var remote = r.done_indices || [];
      if (!local || (JSON.parse(local).length || 0) < remote.length) {
        localStorage.setItem(key, JSON.stringify(remote));
        count++;
      }
    });
    if (count > 0) console.log('[Bootstrap] Rituals: ' + count + ' entries restored');
  });

  // ── 5. JOURNAL — merge missing dates ──
  supaGet('journal_entries', '?date=gte.' + ninetyAgo + '&order=date.desc').then(function(data) {
    if (!data || !data.length) return;
    var all = {};
    try { all = JSON.parse(localStorage.getItem('fl_journal') || '{}'); } catch(e) {}
    var count = 0;
    data.forEach(function(j) {
      if (!all[j.date]) {
        // Prefer the entry JSON column (set by saveJournal); fall back to individual columns
        var entryObj = null;
        if (j.entry) { try { entryObj = typeof j.entry === 'string' ? JSON.parse(j.entry) : j.entry; } catch(e) {} }
        if (!entryObj || typeof entryObj !== 'object') {
          entryObj = { aligned: j.aligned, notAligned: j.not_aligned || j.notAligned || '', wins: j.wins, changes: j.changes, improve: j.improve, mood: j.mood, energy: j.energy, thoughts: j.thoughts };
        }
        all[j.date] = entryObj;
        count++;
      }
    });
    localStorage.setItem('fl_journal', JSON.stringify(all));
    if (count > 0) console.log('[Bootstrap] Journal: ' + count + ' entries restored');
  });

  // ── 5b. JOURNAL NOTES — last 90 days ──
  supaGet('journal_notes', '?date=gte.' + ninetyAgo + '&order=ts.desc').then(function(data) {
    if (!data || !data.length) return;
    var notesByDate = {};
    data.forEach(function(n) { if (n.date) { if (!notesByDate[n.date]) notesByDate[n.date] = []; notesByDate[n.date].push(n); } });
    Object.keys(notesByDate).forEach(function(date) {
      if (!localStorage.getItem('fl_journal_notes_' + date)) {
        localStorage.setItem('fl_journal_notes_' + date, JSON.stringify(notesByDate[date]));
      }
    });
    var dates = JSON.parse(localStorage.getItem('fl_journal_note_dates') || '{}');
    Object.keys(notesByDate).forEach(function(d){ dates[d]=true; });
    localStorage.setItem('fl_journal_note_dates', JSON.stringify(dates));
    console.log('[Bootstrap] Journal notes: ' + data.length + ' restored');
  });

  // ── 5c. JOURNAL INSIGHTS — last 90 days ──
  supaGet('journal_insights', '?date=gte.' + ninetyAgo + '&order=date.desc').then(function(data) {
    if (!data || !data.length) return;
    var dates = JSON.parse(localStorage.getItem('fl_journal_insight_dates') || '{}');
    data.forEach(function(ins) {
      if (ins.date && !localStorage.getItem('fl_journal_insight_' + ins.date)) {
        localStorage.setItem('fl_journal_insight_' + ins.date, JSON.stringify(ins));
        dates[ins.date] = true;
      }
    });
    localStorage.setItem('fl_journal_insight_dates', JSON.stringify(dates));
    console.log('[Bootstrap] Journal insights: ' + data.length + ' restored');
  });

  // ── 6. CHECKINS — merge last 90 days ──
  supaGet('daily_checkin', '?date=gte.' + ninetyAgo + '&order=date.desc').then(function(data) {
    if (!data || !data.length) return;
    var count = 0;
    data.forEach(function(c) {
      var key = 'fl_checkin_' + c.date;
      if (!localStorage.getItem(key)) { localStorage.setItem(key, JSON.stringify(c)); count++; }
    });
    if (count > 0) console.log('[Bootstrap] Checkins: ' + count + ' entries restored');
  });

  // ── 7. MASTERY — merge last 90 days ──
  supaGet('mastery_daily', '?date=gte.' + ninetyAgo + '&order=date.desc').then(function(data) {
    if (!data || !data.length) return;
    var count = 0;
    data.forEach(function(m) {
      var key = 'fl_mastery_daily_' + m.date;
      if (!localStorage.getItem(key)) { localStorage.setItem(key, JSON.stringify(m.items || {})); count++; }
    });
    if (count > 0) console.log('[Bootstrap] Mastery daily: ' + count + ' entries restored');
  });

  // ── 8. BRAHMA — merge last 90 days ──
  supaGet('brahma_daily', '?date=gte.' + ninetyAgo + '&order=date.desc').then(function(data) {
    if (!data || !data.length) return;
    var count = 0;
    data.forEach(function(b) {
      var key = 'fl_brahma_daily_' + b.date;
      if (!localStorage.getItem(key)) { localStorage.setItem(key, JSON.stringify(b.items || {})); count++; }
    });
    if (count > 0) console.log('[Bootstrap] Brahma daily: ' + count + ' entries restored');
  });

  // ── 9. READING — merge last 90 days ──
  supaGet('reading_log', '?date=gte.' + ninetyAgo + '&order=date.desc').then(function(data) {
    if (!data || !data.length) return;
    var count = 0;
    data.forEach(function(r) {
      var key = 'fl_reading_' + r.date;
      if (!localStorage.getItem(key)) { localStorage.setItem(key, JSON.stringify(r)); count++; }
      // Also restore daily rule read state
      if (r.type === 'daily_rule' && r.completed) {
        var readKey = 'fl_daily_rule_read_' + r.date;
        if (!localStorage.getItem(readKey)) localStorage.setItem(readKey, '1');
      }
    });
    if (count > 0) console.log('[Bootstrap] Reading: ' + count + ' entries restored');
  });

  // ── 10. GYM — merge last 90 days ──
  supaGet('gym_workouts', '?date=gte.' + ninetyAgo + '&order=date.desc').then(function(data) {
    if (!data || !data.length) return;
    var count = 0;
    data.forEach(function(g) {
      var key = 'fl_gym_workout_' + g.date;
      if (!localStorage.getItem(key)) { localStorage.setItem(key, JSON.stringify(g)); count++; }
    });
    if (count > 0) console.log('[Bootstrap] Gym: ' + count + ' entries restored');
  });

  // ── 11. DEEP WORK — merge last 90 days ──
  supaGet('deepwork_log', '?date=gte.' + ninetyAgo + '&order=date.desc').then(function(data) {
    if (!data || !data.length) return;
    var count = 0;
    data.forEach(function(d) {
      var key = 'fl_deepwork_' + d.date;
      if (!localStorage.getItem(key)) { localStorage.setItem(key, JSON.stringify({ blocks: d.blocks, bigWin: d.big_win })); count++; }
    });
    if (count > 0) console.log('[Bootstrap] Deep work: ' + count + ' entries restored');
  });

  // ── 12. CONFIG — restore profile, settings ──
  supaGet('config', '?select=key,value').then(function(data) {
    if (!data || !data.length) return;
    data.forEach(function(c) {
      var existing = localStorage.getItem(c.key);
      if (!existing && c.value) localStorage.setItem(c.key, c.value);
    });
    console.log('[Bootstrap] Config: ' + data.length + ' keys checked');
  });

  // ── 13. EKADASHI — merge last 90 days ──
  supaGet('ekadashi_log', '?date=gte.' + ninetyAgo + '&order=date.desc').then(function(data) {
    if (!data || !data.length) return;
    var count = 0;
    data.forEach(function(e) {
      var key = 'fl_ekadashi_' + e.date;
      if (!localStorage.getItem(key)) { localStorage.setItem(key, JSON.stringify(e)); count++; }
    });
    if (count > 0) console.log('[Bootstrap] Ekadashi: ' + count + ' entries restored');
  });

  console.log('[Bootstrap] Full data sync started — 13 tables pulling from Supabase');
})();

// ═══════════════════════════════════════════
// RICH EDITOR UPGRADES — Lazy init on panel open
// ═══════════════════════════════════════════
var _editorsInitialized = {};

function initRichEditorsForPanel(panelId) {
  if (_editorsInitialized[panelId]) return;
  _editorsInitialized[panelId] = true;

  var editorConfigs = {
    'reflection': [
      { id: 'jAligned', placeholder: 'What aligned with the covenant today... Use / for headings, lists, quotes', minHeight: 100 },
      { id: 'jNotAligned', placeholder: 'Where did you deviate... Be honest with yourself', minHeight: 100 },
      { id: 'jWins', placeholder: '1. Win one...\n2. Win two...\n3. Win three...', minHeight: 100 },
      { id: 'jChanges', placeholder: 'Specific adjustments for tomorrow...', minHeight: 80 },
      { id: 'jThoughts', placeholder: 'Anything on your mind... Free write. Use / for blocks.', minHeight: 150 }
    ],
    'journal-today': [
      { id: 'jtEntry', placeholder: 'Free write... Use / for headings, lists, checklists, quotes', minHeight: 200 }
    ]
  };

  var configs = editorConfigs[panelId];
  if (!configs) return;

  configs.forEach(function(cfg) {
    upgradeToRichEditor(cfg.id, {
      placeholder: cfg.placeholder,
      minHeight: cfg.minHeight,
      onChange: function(data) {
        // Auto-trigger the existing save debounce if available
        if (typeof markSaved === 'function') markSaved();
      }
    });
  });
}

// Hook into switchPanel to lazy-init editors
var _origSwitchPanel = typeof switchPanel === 'function' ? switchPanel : null;
if (_origSwitchPanel) {
  // We can't override switchPanel directly since it's in admin-core.js
  // Instead, use a MutationObserver on panel visibility
  var _panelObserver = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      if (m.target.classList && m.target.classList.contains('active') && m.target.id && m.target.id.startsWith('p-')) {
        var panelId = m.target.id.replace('p-', '');
        initRichEditorsForPanel(panelId);
      }
    });
  });
  document.querySelectorAll('.cc-panel').forEach(function(panel) {
    _panelObserver.observe(panel, { attributes: true, attributeFilter: ['class'] });
  });
}

// ═══════════════════════════════════════════
// MISSION STATUS — Daily completion tracker
// ═══════════════════════════════════════════
(function buildMissionStatus() {
  var container = document.getElementById('missionItems');
  var pctEl = document.getElementById('missionPct');
  var barEl = document.getElementById('missionBar');
  var footerEl = document.getElementById('missionFooter');
  if (!container) return;

  var today = getEffectiveToday();

  // Define all trackable missions
  var missions = [
    {
      id: 'morning', label: 'Morning Rituals', icon: '☀', panel: 'morning',
      check: function() {
        var defs = (typeof getRitualDefs === 'function') ? getRitualDefs('morning').filter(function(r) { return r.active !== false; }) : [];
        var done = JSON.parse(localStorage.getItem('fl_rituals_morning_' + today) || '[]');
        return { done: done.length, total: defs.length, pct: defs.length ? Math.round(done.length / defs.length * 100) : 0 };
      }
    },
    {
      id: 'daily-rule', label: 'Daily Rule (60-sec)', icon: '📖', panel: 'daily-rule',
      check: function() {
        var read = !!localStorage.getItem('fl_daily_rule_read_' + today);
        return { done: read ? 1 : 0, total: 1, pct: read ? 100 : 0 };
      }
    },
    {
      id: 'rules25', label: '25 Rules Reading', icon: '📚', panel: 'rules25',
      check: function() {
        var state = {};
        try { state = JSON.parse(localStorage.getItem('fl_rules25_' + today) || '{}'); } catch(e) {}
        var count = Object.keys(state).filter(function(k) { return state[k]; }).length;
        return { done: count, total: 25, pct: Math.round(count / 25 * 100) };
      }
    },
    {
      id: 'deepwork', label: 'Deep Work', icon: '⚡', panel: 'deepwork',
      check: function() {
        var dw = null;
        try { dw = JSON.parse(localStorage.getItem('fl_deepwork_' + today) || 'null'); } catch(e) {}
        if (!dw || !dw.blocks) return { done: 0, total: 10, pct: 0 };
        var done = dw.blocks.filter(function(b) { return b.done; }).length;
        return { done: done, total: 10, pct: Math.round(done / 10 * 100) };
      }
    },
    {
      id: 'midday', label: 'Midday Rituals', icon: '🌤', panel: 'midday',
      check: function() {
        var defs = (typeof getRitualDefs === 'function') ? getRitualDefs('midday').filter(function(r) { return r.active !== false; }) : [];
        var done = JSON.parse(localStorage.getItem('fl_rituals_midday_' + today) || '[]');
        return { done: done.length, total: defs.length || 15, pct: defs.length ? Math.round(done.length / defs.length * 100) : 0 };
      }
    },
    {
      id: 'gym', label: 'Gym Workout', icon: '💪', panel: 'gym-log',
      check: function() {
        var gw = (typeof getGymWorkout === 'function') ? getGymWorkout(today) : null;
        var logged = gw && gw.split && gw.split !== 'rest';
        return { done: logged ? 1 : 0, total: 1, pct: logged ? 100 : 0 };
      }
    },
    {
      id: 'evening', label: 'Evening Rituals', icon: '🌙', panel: 'evening',
      check: function() {
        var defs = (typeof getRitualDefs === 'function') ? getRitualDefs('evening').filter(function(r) { return r.active !== false; }) : [];
        var done = JSON.parse(localStorage.getItem('fl_rituals_evening_' + today) || '[]');
        return { done: done.length, total: defs.length, pct: defs.length ? Math.round(done.length / defs.length * 100) : 0 };
      }
    },
    {
      id: 'fortress', label: 'Fortress Daily', icon: '🏰', panel: 'brahma-log',
      check: function() {
        var data = (typeof getBrahmaDaily === 'function') ? getBrahmaDaily(today) : {};
        var fields = ['porn', 'sexual', 'masturbate', 'urge', 'stayed_out', 'device_free', 'phone_out', 'laptop_out'];
        var filled = fields.filter(function(f) { return data[f] !== undefined && data[f] !== null; }).length;
        return { done: filled, total: fields.length, pct: Math.round(filled / fields.length * 100) };
      }
    },
    {
      id: 'mastery', label: 'Mastery (25 items)', icon: '🧠', panel: 'mastery-daily',
      check: function() {
        var data = (typeof getMasteryDaily === 'function') ? getMasteryDaily(today) : {};
        var stats = (typeof computeMasteryStats === 'function') ? computeMasteryStats(data) : { completed: 0 };
        return { done: stats.completed, total: 25, pct: Math.round(stats.completed / 25 * 100) };
      }
    },
    {
      id: 'journal', label: 'Journal / Reflection', icon: '📝', panel: 'reflection',
      check: function() {
        var all = {};
        try { all = JSON.parse(localStorage.getItem('fl_journal') || '{}'); } catch(e) {}
        var entry = all[today];
        var hasContent = entry && (entry.aligned || entry.thoughts || entry.wins);
        return { done: hasContent ? 1 : 0, total: 1, pct: hasContent ? 100 : 0 };
      }
    },
    {
      id: 'checkin', label: 'Seal the Day', icon: '✓', panel: 'checkin',
      check: function() {
        var data = {};
        try { data = JSON.parse(localStorage.getItem('fl_checkin_' + today) || '{}'); } catch(e) {}
        return { done: data.sealed ? 1 : 0, total: 1, pct: data.sealed ? 100 : 0 };
      }
    }
  ];

  // Add weekend tasks to mission on Saturday & Sunday
  var dayOfWeek = new Date().getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    missions.push({
      id: 'weekend', label: dayOfWeek === 6 ? 'Saturday Tasks' : 'Sunday Tasks', icon: '📋', panel: 'checkin',
      check: function() {
        var data = {};
        try { data = JSON.parse(localStorage.getItem('fl_checkin_' + today) || '{}'); } catch(e) {}
        var wt = data._weekendTasks || {};
        var taskCount = dayOfWeek === 6 ? 7 : 10;
        var done = Object.keys(wt).filter(function(k) { return wt[k]; }).length;
        return { done: done, total: taskCount, pct: Math.round(done / taskCount * 100) };
      }
    });
  }

  // Compute all
  var totalPct = 0;
  var completed = 0;
  var html = '';

  missions.forEach(function(m) {
    var status = m.check();
    totalPct += status.pct;
    if (status.pct >= 100) completed++;

    var color = status.pct >= 100 ? 'var(--green)' : status.pct > 0 ? 'var(--gold)' : 'var(--text-dim)';
    var bg = status.pct >= 100 ? 'rgba(0,230,118,0.06)' : status.pct > 0 ? 'rgba(245,166,35,0.04)' : 'transparent';
    var statusText = status.pct >= 100 ? 'DONE' : status.total === 1 ? (status.done ? 'DONE' : 'PENDING') : status.done + '/' + status.total;
    var cursor = status.pct >= 100 ? 'default' : 'pointer';

    html += '<div onclick="switchPanel(\'' + m.panel + '\')" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:' + bg + ';border-radius:6px;cursor:' + cursor + ';transition:background 0.2s" onmouseover="this.style.background=\'rgba(0,212,255,0.06)\'" onmouseout="this.style.background=\'' + bg + '\'">';
    html += '<span style="font-size:16px;min-width:24px;text-align:center">' + m.icon + '</span>';
    html += '<span style="font-family:var(--font-mono);font-size:11px;color:var(--text);flex:1;font-weight:' + (status.pct >= 100 ? '400' : '600') + '">' + m.label + '</span>';
    // Mini progress bar
    html += '<div style="width:80px;height:4px;background:var(--bg3);border-radius:2px;overflow:hidden">';
    html += '<div style="height:100%;width:' + status.pct + '%;background:' + color + ';border-radius:2px;transition:width 0.3s"></div>';
    html += '</div>';
    html += '<span style="font-family:var(--font-mono);font-size:10px;color:' + color + ';min-width:45px;text-align:right;font-weight:700">' + statusText + '</span>';
    if (status.pct < 100) {
      html += '<span style="font-family:var(--font-mono);font-size:9px;color:var(--cyan)">→</span>';
    } else {
      html += '<span style="font-size:12px">✓</span>';
    }
    html += '</div>';
  });

  var overallPct = Math.round(totalPct / missions.length);
  container.innerHTML = html;
  if (pctEl) {
    pctEl.textContent = overallPct + '%';
    pctEl.style.color = overallPct >= 100 ? 'var(--green)' : overallPct >= 50 ? 'var(--gold)' : 'var(--cyan)';
  }
  if (barEl) {
    barEl.style.width = overallPct + '%';
    barEl.style.background = overallPct >= 100 ? 'var(--green)' : overallPct >= 50 ? 'var(--gold)' : 'var(--cyan)';
  }

  // Footer
  var pending = missions.length - completed;
  if (footerEl) {
    if (overallPct >= 100) {
      footerEl.innerHTML = '<span style="color:var(--green);font-weight:700;font-size:12px;letter-spacing:2px">MISSION COMPLETE ✓</span>';
    } else {
      footerEl.textContent = completed + '/' + missions.length + ' complete · ' + pending + ' pending';
    }
  }

  // Auto-refresh every 30 seconds
  setTimeout(buildMissionStatus, 30000);
})();

// Auth email removed from sidebar for security — no email exposure

// ═══════════════════════════════════════════
// DASHBOARD — WEEKLY PULSE + BODY & MIND + STREAKS
// ═══════════════════════════════════════════

function buildDashboardStats() {
  var today = new Date();
  var todayStr = (today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0'));

  // ── WEEKLY PULSE: 7-day summary across all metrics ──
  var pulse = document.getElementById('dashWeeklyPulse');
  if (pulse) {
    var mornTotal = 0, midTotal = 0, eveTotal = 0, masteryTotal = 0, journalDays = 0;
    var sleepTotal = 0, sleepCount = 0, runTotal = 0, gymDays = 0, deepWorkSessions = 0;
    var all = JSON.parse(localStorage.getItem('fl_journal') || '{}');
    var proof = (typeof getProofData === 'function') ? getProofData() : [];

    for (var i = 0; i < 7; i++) {
      var d = new Date(today); d.setDate(d.getDate() - i);
      var ds = (d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));
      // Rituals
      var morn = JSON.parse(localStorage.getItem('fl_rituals_morning_' + ds) || '[]');
      var mid = JSON.parse(localStorage.getItem('fl_rituals_midday_' + ds) || '[]');
      var eve = JSON.parse(localStorage.getItem('fl_rituals_evening_' + ds) || '[]');
      mornTotal += morn.length;
      midTotal += mid.length;
      eveTotal += eve.length;
      // Mastery
      var mastery = (typeof getMasteryDaily === 'function') ? getMasteryDaily(ds) : {};
      var mStats = (typeof computeMasteryStats === 'function') ? computeMasteryStats(mastery) : { completed: 0 };
      masteryTotal += mStats.completed;
      // Journal
      if (all[ds]) journalDays++;
      // Proof data
      var dayProof = proof.find(function(p) { return p.date === ds; });
      if (dayProof) {
        if (dayProof.sleepHrs) { sleepTotal += dayProof.sleepHrs; sleepCount++; }
        if (dayProof.runKm) runTotal += dayProof.runKm;
        if (dayProof.gym) gymDays++;
      }
      // Deep work
      var dw = JSON.parse(localStorage.getItem('fl_deepwork_' + ds) || 'null');
      if (dw && dw.blocks) deepWorkSessions += dw.blocks.filter(function(b) { return b.done; }).length;
    }

    var mornDefs = (typeof getRitualDefs === 'function') ? getRitualDefs('morning').filter(function(r) { return r.active !== false; }).length : 42;
    var midDefs = (typeof getRitualDefs === 'function') ? getRitualDefs('midday').filter(function(r) { return r.active !== false; }).length : 15;
    var eveDefs = (typeof getRitualDefs === 'function') ? getRitualDefs('evening').filter(function(r) { return r.active !== false; }).length : 41;
    var mornPct = mornDefs > 0 ? Math.round(mornTotal / (mornDefs * 7) * 100) : 0;
    var midPct = midDefs > 0 ? Math.round(midTotal / (midDefs * 7) * 100) : 0;
    var evePct = eveDefs > 0 ? Math.round(eveTotal / (eveDefs * 7) * 100) : 0;
    var masteryPct = Math.round(masteryTotal / (25 * 7) * 100);
    var avgSleep = sleepCount > 0 ? (sleepTotal / sleepCount).toFixed(1) : '—';

    function pulseCard(val, label, color) {
      return '<div style="text-align:center;padding:14px 8px;background:var(--surface);border:1px solid var(--surface-border);border-radius:10px">' +
        '<div style="font-family:var(--font-mono);font-size:22px;font-weight:700;color:' + (color || 'var(--text)') + ';font-variant-numeric:tabular-nums">' + val + '</div>' +
        '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:2px;color:var(--text-muted);margin-top:4px">' + label + '</div></div>';
    }

    pulse.innerHTML =
      pulseCard(mornPct + '%', 'MORNING RITUALS', mornPct >= 80 ? 'var(--green)' : 'var(--gold)') +
      pulseCard(midPct + '%', 'MIDDAY RITUALS', midPct >= 80 ? 'var(--green)' : 'var(--gold)') +
      pulseCard(evePct + '%', 'EVENING RITUALS', evePct >= 80 ? 'var(--green)' : 'var(--gold)') +
      pulseCard(masteryPct + '%', 'MASTERY SCORE', masteryPct >= 80 ? 'var(--green)' : 'var(--gold)') +
      pulseCard(journalDays + '/7', 'JOURNAL DAYS', journalDays >= 6 ? 'var(--green)' : 'var(--cyan)') +
      pulseCard(avgSleep + 'h', 'AVG SLEEP', parseFloat(avgSleep) >= 7 ? 'var(--green)' : parseFloat(avgSleep) >= 6 ? 'var(--gold)' : 'var(--red)') +
      pulseCard(runTotal.toFixed(1) + 'km', 'TOTAL RUN', 'var(--cyan)') +
      pulseCard(gymDays + '/7', 'GYM DAYS', gymDays >= 5 ? 'var(--green)' : gymDays >= 3 ? 'var(--gold)' : 'var(--red)') +
      pulseCard(deepWorkSessions, 'DEEP WORK BLOCKS', deepWorkSessions >= 15 ? 'var(--green)' : 'var(--cyan)');
  }

  // ── BODY & MIND: Sleep, Energy, Mood trends ──
  var bodyMind = document.getElementById('dashBodyMind');
  if (bodyMind) {
    var ekadashiDays = 0;
    if (typeof getEkadashiDates === 'function') {
      var ekDates = getEkadashiDates(today.getFullYear(), today.getMonth());
      ekadashiDays = ekDates.length;
    }
    var voiceCount = 0;
    try { voiceCount = JSON.parse(localStorage.getItem('fl_voice_entries') || '[]').length; } catch(e) {}
    var ideasCount = 0;
    try { ideasCount = JSON.parse(localStorage.getItem('fl_mastery_ideas') || '[]').filter(function(i) { return i.status === 'active'; }).length; } catch(e) {}

    bodyMind.innerHTML =
      pulseCard(ekadashiDays, 'EKADASHI THIS MONTH', 'var(--gold)') +
      pulseCard(voiceCount, 'VOICE ENTRIES', 'var(--cyan)') +
      pulseCard(ideasCount, 'ACTIVE IDEAS', 'var(--mastery-purple,#E040FB)');
  }

  // ── BRAHMACHARYA STREAK ──
  if (typeof computeBrahmaStreak === 'function') {
    var bStats = computeBrahmaStreak();
    var bStreak = document.getElementById('dash-brahma-streak');
    var bStatus = document.getElementById('dash-brahma-status');
    if (bStreak) {
      bStreak.textContent = bStats.currentStreak;
      bStreak.style.color = bStats.currentStreak >= 7 ? 'var(--green)' : 'var(--red)';
    }
    if (bStatus) {
      bStatus.textContent = bStats.cleanPct + '% clean · ' + bStats.totalRelapses + ' relapses · longest: ' + bStats.longestStreak + ' days';
    }
  }

  // ── NEXT EKADASHI WIDGET ──
  if (typeof getNextEkadashi === 'function') {
    var nextEk = getNextEkadashi();
    var ekDaysEl = document.getElementById('dash-ekadashi-days');
    var ekNameEl = document.getElementById('dash-ekadashi-name');
    if (nextEk && ekDaysEl && ekNameEl) {
      var ekDiff = Math.floor((new Date(nextEk.date) - new Date()) / 86400000) + 1;
      ekDaysEl.textContent = ekDiff;
      ekDaysEl.style.color = ekDiff <= 2 ? 'var(--brahma)' : 'var(--gold)';
      var ekLog = (typeof getEkadashiLog === 'function') ? getEkadashiLog() : {};
      var ekYear = getEkadashiYear(today.getFullYear());
      var ekObserved = 0;
      ekYear.forEach(function(e) { if (ekLog[e.date] && ekLog[e.date].status === 'observed') ekObserved++; });
      ekNameEl.textContent = nextEk.fullName + ' · ' + nextEk.date + ' · Year: ' + ekObserved + '/' + ekYear.length;
    }
  }

  // ── STREAKS STRIP ──
  var streaksEl = document.getElementById('dashStreaksStrip');
  if (streaksEl) {
    function streakCard(current, longest, label, color) {
      return '<div style="text-align:center;padding:12px 6px;background:var(--surface);border:1px solid var(--surface-border);border-radius:10px">' +
        '<div style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:' + color + '">' + current + '</div>' +
        '<div style="font-family:var(--font-mono);font-size:7px;letter-spacing:2px;color:var(--text-muted);margin-top:3px">' + label + '</div>' +
        '<div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim);margin-top:2px">BEST: ' + longest + '</div></div>';
    }
    var rs = (typeof computeRunStreak === 'function') ? computeRunStreak() : {current:0,longest:0};
    var fs = (typeof computeFoodStreak === 'function') ? computeFoodStreak() : {current:0,longest:0};
    var fos = (typeof computeFortressOutStreak === 'function') ? computeFortressOutStreak() : {current:0,longest:0};
    var bs = (typeof computeBrahmaStreak === 'function') ? computeBrahmaStreak() : {currentStreak:0,longestStreak:0};
    var js = (typeof computeJapaStreak === 'function') ? computeJapaStreak() : {current:0,longest:0};
    var rds = (typeof computeReadingStreak === 'function') ? computeReadingStreak() : {current:0,longest:0};
    streaksEl.innerHTML =
      streakCard(rs.current, rs.longest, 'RUN', 'var(--cyan)') +
      streakCard(fs.current, fs.longest, 'FOOD', 'var(--green)') +
      streakCard(fos.current, fos.longest, 'FORTRESS', 'var(--brahma)') +
      streakCard(bs.currentStreak, bs.longestStreak, 'BRAHMA', 'var(--brahma)') +
      streakCard(js.current, js.longest, 'JAPA', 'var(--gold)') +
      streakCard(rds.current, rds.longest, 'READING', 'var(--cyan)');
  }

  // ── READING WIDGET ──
  var rNameEl = document.getElementById('dash-reading-name');
  var rStreakEl = document.getElementById('dash-reading-streak');
  if (rNameEl && typeof getTodayRuleNumber === 'function') {
    var rn = getTodayRuleNumber();
    rNameEl.textContent = 'Rule ' + rn + ' of 25 · ' + (typeof computeReadingStreak === 'function' ? computeReadingStreak().current + ' day streak' : '');
  }
  if (rStreakEl && typeof computeReadingStreak === 'function') {
    rStreakEl.textContent = computeReadingStreak().current;
  }

  // ── GYM QUICK STATS ──
  if (typeof getGymWorkout === 'function') {
    var gymWeekCount = 0;
    var lastSplit = null;
    for (var g = 0; g < 7; g++) {
      var gd = new Date(today); gd.setDate(gd.getDate() - g);
      var gds = (gd.getFullYear()+'-'+String(gd.getMonth()+1).padStart(2,'0')+'-'+String(gd.getDate()).padStart(2,'0'));
      var gw = getGymWorkout(gds);
      if (gw && gw.split && gw.split !== 'rest') { gymWeekCount++; if (!lastSplit) lastSplit = gw.split; }
    }
    var gymSessions = document.getElementById('dash-gym-sessions');
    var gymStatus = document.getElementById('dash-gym-status');
    if (gymSessions) gymSessions.textContent = gymWeekCount;
    if (gymStatus) {
      var prs = (typeof getGymPRs === 'function') ? Object.keys(getGymPRs()).length : 0;
      gymStatus.textContent = (lastSplit ? 'Last: ' + lastSplit.toUpperCase() + ' · ' : '') + prs + ' PRs total';
    }
  }
}
buildDashboardStats();

// ═══════════════════════════════════════════
// SMART ACTION BANDS — time-aware dashboard nav
// ═══════════════════════════════════════════
function buildActionBands() {
  var container = document.getElementById('dashActionBands');
  if (!container) return;

  var today = (typeof getEffectiveToday === 'function') ? getEffectiveToday() : new Date().toISOString().slice(0,10);
  var now = new Date();
  var istMs = now.getTime() + (330 - now.getTimezoneOffset()) * 60000;
  var istDate = new Date(istMs);
  var istHour = istDate.getUTCHours();
  var istMin  = istDate.getUTCMinutes();
  var istDow  = istDate.getUTCDay();
  var istDay  = istDate.getUTCDate();
  var daysInMonth = new Date(istDate.getUTCFullYear(), istDate.getUTCMonth() + 1, 0).getDate();

  var tmrDate = (function() {
    var d = new Date(istMs); d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0,10);
  })();

  var td = document.getElementById('dacTimeDisplay');
  if (td) {
    td.textContent = String(istHour).padStart(2,'0') + ':' + String(istMin).padStart(2,'0') + ' IST';
  }

  function badge(state) {
    var labels = { done:'DONE', partial:'PARTIAL', pending:'PENDING', na:'\u2014' };
    return '<span class="dac-badge ' + state + '">' + (labels[state] || '\u2014') + '</span>';
  }

  function card(icon, timeHint, title, sub, state, panel, glow) {
    var cls = 'dac-block' + (glow ? ' glow-' + glow : '');
    return '<div class="' + cls + '" onclick="switchPanel(\'' + panel + '\')">' +
      '<div class="dac-block-time">' + timeHint + '</div>' +
      '<div class="dac-block-title">' + icon + '  ' + title + '</div>' +
      '<div class="dac-block-sub">' + sub + '</div>' +
      badge(state) + '</div>';
  }

  function band(title, timeHint, colsCls, cardsHtml, isActive) {
    var headerCls = 'dac-band-header' + (isActive ? ' dac-band-active' : '');
    return '<div class="dac-band">' +
      '<div class="' + headerCls + '">' +
        '<div class="dac-band-title">' + title +
          (timeHint ? '  <span class="dac-time-hint">' + timeHint + '</span>' : '') +
        '</div>' +
        '<div class="dac-band-rule"></div>' +
      '</div>' +
      '<div class="dac-blocks ' + colsCls + '">' + cardsHtml + '</div>' +
    '</div>';
  }

  // ── Morning rituals
  var morningDone = 0, morningTotal = 0;
  if (typeof getRitualDefs === 'function') {
    var mDefs = getRitualDefs('morning');
    morningTotal = mDefs ? mDefs.length : 0;
  }
  try { morningDone = JSON.parse(localStorage.getItem('fl_rituals_morning_' + today) || '[]').length; } catch(e) {}
  var morningState = morningTotal === 0 ? 'na' : (morningDone >= morningTotal ? 'done' : morningDone > 0 ? 'partial' : 'pending');
  var morningGlow = (istHour >= 5 && istHour < 9 && morningState !== 'done') ? 'now' : null;

  // ── Deep work
  var dwDone = 0, dwTotal = 0;
  try { var dw = JSON.parse(localStorage.getItem('fl_deepwork_' + today) || '[]'); dwTotal = dw.length; dwDone = dw.filter(function(b){return b.done;}).length; } catch(e) {}
  var dwState = dwTotal === 0 ? 'na' : (dwDone >= dwTotal ? 'done' : dwDone > 0 ? 'partial' : 'pending');
  var dwGlow = (istHour >= 9 && istHour < 18 && dwState !== 'done') ? 'now' : null;

  // ── Mastery daily
  var mastPct = 0;
  if (typeof computeMasteryStats === 'function') {
    try { var ms = computeMasteryStats(today); mastPct = ms ? (ms.pct || 0) : 0; } catch(e) {}
  }
  var mastState = mastPct >= 100 ? 'done' : mastPct > 0 ? 'partial' : 'na';

  // ── Gym log
  var gymDone = false;
  if (typeof getGymWorkout === 'function') {
    try { var gw = getGymWorkout(today); gymDone = !!(gw && (gw.split || (gw.exercises && gw.exercises.length))); } catch(e) {}
  }
  var gymState = gymDone ? 'done' : 'na';

  // ── Journal notes
  var jnCount = 0;
  try { jnCount = JSON.parse(localStorage.getItem('fl_journal_notes_' + today) || '[]').length; } catch(e) {}
  var jnState = jnCount > 0 ? 'done' : 'na';

  // ── Brahma log
  var brahmaDone = !!localStorage.getItem('fl_brahma_daily_' + today);
  var brahmaState = brahmaDone ? 'done' : 'na';

  // ── Evening rituals
  var eveDone = 0, eveTotal = 0;
  if (typeof getRitualDefs === 'function') {
    var eDefs = getRitualDefs('evening');
    eveTotal = eDefs ? eDefs.length : 0;
  }
  try { eveDone = JSON.parse(localStorage.getItem('fl_rituals_evening_' + today) || '[]').length; } catch(e) {}
  var eveState = eveTotal === 0 ? 'na' : (eveDone >= eveTotal ? 'done' : eveDone > 0 ? 'partial' : 'pending');
  var eveGlow = (istHour >= 19 && istHour < 23 && eveState !== 'done') ? 'now' : null;

  // ── Reflection
  var refDone = false;
  try { var jAll = JSON.parse(localStorage.getItem('fl_journal') || '{}'); refDone = !!(jAll[today] && (jAll[today].aligned || jAll[today].thoughts)); } catch(e) {}
  var refState = refDone ? 'done' : (istHour >= 20 ? 'pending' : 'na');
  var refGlow = (!refDone && istHour >= 20) ? 'due' : null;

  // ── Tomorrow plan
  var tmrDone = false;
  try { var tmr = JSON.parse(localStorage.getItem('fl_tomorrow_' + tmrDate) || '{}'); tmrDone = !!(tmr.tasks && tmr.tasks.filter(function(t){return t.text;}).length > 0); } catch(e) {}
  var tmrState = tmrDone ? 'done' : (istHour >= 21 ? 'pending' : 'na');
  var tmrGlow = (!tmrDone && istHour >= 21) ? 'due' : null;

  // ── Check-in
  var checkinDone = !!localStorage.getItem('fl_checkin_' + today);
  var checkinState = checkinDone ? 'done' : (istHour >= 20 ? 'pending' : 'na');
  var checkinGlow = (!checkinDone && istHour >= 20) ? 'due' : null;

  // ── Weekly review
  var wrDone = false;
  try {
    var wrObj = JSON.parse(localStorage.getItem('fl_weekly_review') || '{}');
    var wk = (function(){var d=new Date(istMs);d.setUTCDate(d.getUTCDate()-d.getUTCDay());return d.toISOString().slice(0,10);})();
    wrDone = !!wrObj[wk];
  } catch(e) {}
  var isSunday = istDow === 0;
  var isWeekend = istDow === 0 || istDow >= 5;
  var isMonthEnd = istDay >= 26;

  // ── BAND: MORNING
  var isMorning = istHour >= 5 && istHour < 9;
  var morningBand = band('MORNING', '5AM \u2013 9AM', 'cols3',
    card('\u2600\ufe0f', 'RITUAL', 'MORNING RITUALS',
      morningTotal > 0 ? morningDone + '/' + morningTotal + ' rituals' : 'Daily rituals',
      morningState, 'morning', morningGlow) +
    card('\u26a1', 'FOCUS', 'DEEP WORK',
      dwTotal > 0 ? dwDone + '/' + dwTotal + ' blocks' : 'Focus blocks',
      dwState, 'deepwork', dwGlow) +
    card('\ud83d\udccb', 'TRACK', 'MASTERY DAILY',
      mastPct > 0 ? mastPct + '% \u00b7 25 items' : '25 items \u00b7 5 domains',
      mastState, 'mastery-daily', null),
    isMorning
  );

  // ── BAND: DAY
  var isDay = istHour >= 9 && istHour < 20;
  var dayBand = band('DAY', '9AM \u2013 8PM', 'cols3',
    card('\ud83d\udcaa', 'WORKOUT', 'GYM LOG',
      gymDone ? 'Logged today' : 'Log your workout',
      gymState, 'gym-log', null) +
    card('\ud83d\udcd3', 'CAPTURE', 'JOURNAL',
      jnCount > 0 ? jnCount + ' note' + (jnCount !== 1 ? 's' : '') + ' today' : 'Capture thoughts',
      jnState, 'journal-today', null) +
    card('\ud83e\uddd8', 'PRACTICE', 'BRAHMA LOG',
      brahmaDone ? 'Logged today' : 'Daily practice',
      brahmaState, 'brahma-log', null),
    isDay
  );

  // ── BAND: EVENING
  var isEvening = istHour >= 20 || istHour < 3;
  var eveningBand = band('EVENING', '8PM \u2013 12AM', 'cols4',
    card('\ud83c\udf19', 'RITUAL', 'EVENING RITUALS',
      eveTotal > 0 ? eveDone + '/' + eveTotal + ' rituals' : 'Wind-down rituals',
      eveState, 'evening', eveGlow) +
    card('\ud83d\udcd6', 'REFLECT', 'REFLECTION',
      refDone ? 'Completed' : 'End-of-day alignment',
      refState, 'reflection', refGlow) +
    card('\ud83d\udcc5', 'PLAN', 'TOMORROW PLAN',
      tmrDone ? 'Plan ready' : 'Prepare next day',
      tmrState, 'tomorrow', tmrGlow) +
    card('\u2713', 'SEAL', 'CHECK-IN',
      checkinDone ? 'Day sealed' : 'Close the day',
      checkinState, 'checkin', checkinGlow),
    isEvening
  );

  // ── BAND: THIS WEEK
  var dowLabels = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  var weeklyBand = band('THIS WEEK',
    isWeekend ? 'REVIEW WINDOW' : dowLabels[istDow], 'cols4',
    card('\ud83d\udd01', 'SUN', 'WEEKLY REVIEW',
      wrDone ? 'Done this week' : 'Reflection + habits',
      wrDone ? 'done' : (isSunday ? 'pending' : 'na'),
      'weekly-review', (isSunday && !wrDone) ? 'due' : null) +
    card('\ud83d\udccb', 'SUN', 'MASTERY WEEKLY',
      '7-item Sunday audit',
      isSunday ? 'pending' : 'na', 'mastery-weekly', isSunday ? 'due' : null) +
    card('\ud83d\uddd3\ufe0f', 'MON', 'WEEKLY SCHEDULE',
      'Plan the week ahead', 'na', 'weekly', null) +
    card('\ud83d\udcca', 'ANY', 'FORTRESS STREAKS',
      'Streak analytics', 'na', 'fortress-streaks', null),
    isWeekend
  );

  // ── BAND: THIS MONTH
  var monthlyBand = band('THIS MONTH',
    'DAY ' + istDay + ' OF ' + daysInMonth, 'cols4',
    card('\ud83c\udfc6', 'EOM', 'MONTHLY SCORECARD',
      'Aggregated performance', 'na', 'mastery-monthly', isMonthEnd ? 'due' : null) +
    card('\ud83d\udd25', 'EOM', 'RITUAL HEATMAP',
      '25 items \u00d7 30 days', 'na', 'mastery-heatmap', isMonthEnd ? 'due' : null) +
    card('\ud83d\udcc8', 'EOM', 'BRAHMA MONTHLY',
      'Monthly matrix', 'na', 'brahma-monthly', isMonthEnd ? 'due' : null) +
    card('\ud83c\udfaf', 'ANY', 'LIFE SCORE',
      'Overall rating', 'na', 'life-score', null),
    isMonthEnd
  );

  // ── BAND: ANYTIME pills
  function pill(icon, label, panel) {
    return '<div class="dac-pill" onclick="switchPanel(\'' + panel + '\')">' + icon + '  ' + label + '</div>';
  }
  var anytimeBand = '<div class="dac-band">' +
    '<div class="dac-band-header"><div class="dac-band-title">ANYTIME</div><div class="dac-band-rule"></div></div>' +
    '<div class="dac-band-pills">' +
      pill('\ud83d\udcaa', 'GYM ANALYTICS', 'gym-analytics') +
      pill('\ud83d\udd25', 'RITUAL ANALYTICS', 'ritual-analytics') +
      pill('\ud83d\udca1', 'IDEAS HUB', 'mastery-ideas') +
      pill('\ud83c\udfc3', 'STRAVA', 'strava') +
      pill('\ud83d\udcf8', 'INSTAGRAM', 'schedule') +
      pill('\ud83d\udc8a', 'HEALTH', 'health-dashboard') +
      pill('\ud83c\udfc5', 'RACES', 'races') +
      pill('\ud83e\udde0', 'BRAHMA ANALYTICS', 'brahma-analytics') +
      pill('\ud83d\udcc5', 'LIFE CALENDAR', 'life-calendar') +
      pill('\ud83d\udd17', 'SYNC CENTER', 'sync-center') +
    '</div></div>';

  container.innerHTML = morningBand + dayBand + eveningBand + weeklyBand + monthlyBand + anytimeBand;
}
buildActionBands();
