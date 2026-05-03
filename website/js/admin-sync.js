// ═══════════════════════════════════════════
// FIRST LIGHT — CROSS-DEVICE SYNC ENGINE
// Supabase Realtime + Offline Queue + Pull-on-Focus
// ═══════════════════════════════════════════

// ── Load Supabase JS client from CDN for Realtime ──
(function loadSupabaseClient() {
  if (window.supabase) { initSync(); return; }
  var script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
  script.onload = function() { initSync(); };
  script.onerror = function() { console.warn('[Sync] Failed to load Supabase JS client from CDN'); };
  document.head.appendChild(script);
})();

// ── Supabase Realtime client instance ──
var _syncClient = null;
var _syncChannel = null;
var _lastPull = 0;

// ── Tables to subscribe to ──
var SYNC_TABLES = [
  'proof_archive', 'slips', 'daily_checkin', 'reading_log',
  'races', 'rituals_log', 'deepwork_log', 'mastery_log',
  'gym_workouts', 'brahma_log', 'journal_entries',
  'journal_notes', 'journal_insights',
  'ekadashi_log', 'weekly_schedule', 'tomorrow_plan'
];

// ── Map table → localStorage update logic ──
var SYNC_MAP = {
  'rituals_log': function(r) {
    if (r.period && r.date) {
      localStorage.setItem('fl_rituals_' + r.period + '_' + r.date, JSON.stringify(r.completed_ids));
    }
  },
  'deepwork_log': function(r) {
    if (r.date) {
      var blocks = r.blocks;
      if (typeof blocks === 'string') { try { blocks = JSON.parse(blocks); } catch(e) { blocks = []; } }
      localStorage.setItem('fl_deepwork_' + r.date, JSON.stringify({ blocks: blocks, bigWin: r.big_win }));
      // Re-render if deepwork panel is active
      var ap = document.querySelector('.cc-panel.active');
      if (ap && ap.id === 'p-deepwork' && typeof loadDeepWorkForDate === 'function') {
        loadDeepWorkForDate(r.date);
      }
    }
  },
  'mastery_log': function(r) {
    if (r.date) {
      localStorage.setItem('fl_mastery_daily_' + r.date, JSON.stringify(r.items));
    }
  },
  'gym_workouts': function(r) {
    if (r.date) {
      var exercises = r.exercises;
      if (typeof exercises === 'string') { try { exercises = JSON.parse(exercises); } catch(e) { exercises = []; } }
      localStorage.setItem('fl_gym_workout_' + r.date, JSON.stringify({
        split: r.split,
        duration_minutes: r.duration_minutes || 0,
        energy_level: r.energy_level || 5,
        notes: r.notes || '',
        exercises: exercises || []
      }));
    }
  },
  'brahma_log': function(r) {
    if (r.date) {
      localStorage.setItem('fl_brahma_daily_' + r.date, JSON.stringify(r.data));
    }
  },
  'journal_entries': function(r) {
    if (r.date) {
      try {
        var all = JSON.parse(localStorage.getItem('fl_journal') || '{}');
        var parsed = r.entry;
        if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch(pe) {} }
        all[r.date] = parsed;
        localStorage.setItem('fl_journal', JSON.stringify(all));
      } catch (e) {
        console.warn('[Sync] journal_entries localStorage error:', e.message);
      }
    }
  },
  'journal_notes': function(r) {
    if (r.date && r.id) {
      try {
        var notes = JSON.parse(localStorage.getItem('fl_journal_notes_' + r.date) || '[]');
        var idx = notes.findIndex(function(n) { return n.id === r.id; });
        if (idx >= 0) notes[idx] = r; else notes.unshift(r);
        notes.sort(function(a, b) { return b.ts > a.ts ? 1 : -1; });
        localStorage.setItem('fl_journal_notes_' + r.date, JSON.stringify(notes));
        var dates = JSON.parse(localStorage.getItem('fl_journal_note_dates') || '{}');
        dates[r.date] = true;
        localStorage.setItem('fl_journal_note_dates', JSON.stringify(dates));
      } catch(e) { console.warn('[Sync] journal_notes error:', e.message); }
    }
  },
  'journal_insights': function(r) {
    if (r.date && r.id) {
      try {
        localStorage.setItem('fl_journal_insight_' + r.date, JSON.stringify(r));
        var dates = JSON.parse(localStorage.getItem('fl_journal_insight_dates') || '{}');
        dates[r.date] = true;
        localStorage.setItem('fl_journal_insight_dates', JSON.stringify(dates));
      } catch(e) { console.warn('[Sync] journal_insights error:', e.message); }
    }
  },
  'ekadashi_log': function(r) {
    if (r.date) {
      localStorage.setItem('fl_ekadashi_' + r.date, JSON.stringify({ status: r.status, note: r.note }));
    }
  },
  'weekly_schedule': function(r) {
    if (r.week_key) {
      localStorage.setItem('fl_weekly_' + r.week_key, JSON.stringify(r.data));
    }
  },
  'tomorrow_plan': function(r) {
    if (r.date) {
      var existing = {};
      try { existing = JSON.parse(localStorage.getItem('fl_tomorrow_' + r.date) || '{}'); } catch(e) {}
      var tasks = r.tasks;
      if (typeof tasks === 'string') { try { tasks = JSON.parse(tasks); } catch(e) { tasks = []; } }
      existing.tasks = tasks || existing.tasks || [];
      if (r.executed_pct !== undefined) existing.executed_pct = r.executed_pct;
      if (r.review_notes !== undefined) existing.review_notes = r.review_notes;
      localStorage.setItem('fl_tomorrow_' + r.date, JSON.stringify(existing));
    }
  },
  'proof_archive': function(r) {
    if (r.date) {
      try {
        var proof = JSON.parse(localStorage.getItem('fl_proof_data') || '[]');
        var idx = proof.findIndex(function(p) { return p.date === r.date; });
        if (idx >= 0) proof[idx] = r; else proof.push(r);
        proof.sort(function(a, b) { return b.date > a.date ? 1 : -1; });
        localStorage.setItem('fl_proof_data', JSON.stringify(proof));
      } catch (e) {
        console.warn('[Sync] proof_archive localStorage error:', e.message);
      }
    }
  },
  'daily_checkin': function(r) {
    if (r.date) {
      localStorage.setItem('fl_checkin_' + r.date, JSON.stringify(r));
    }
  },
  'reading_log': function(r) {
    if (r.date) {
      localStorage.setItem('fl_reading_' + r.date, JSON.stringify(r));
    }
  },
  'races': function(r) {
    try {
      var races = JSON.parse(localStorage.getItem('fl_races') || '[]');
      var idx = races.findIndex(function(rc) { return rc.id === r.id; });
      if (idx >= 0) races[idx] = r; else races.push(r);
      localStorage.setItem('fl_races', JSON.stringify(races));
    } catch (e) {
      console.warn('[Sync] races localStorage error:', e.message);
    }
  },
  'slips': function(r) {
    try {
      var slips = JSON.parse(localStorage.getItem('fl_slips') || '[]');
      var idx = slips.findIndex(function(s) { return s.id === r.id; });
      if (idx >= 0) slips[idx] = r; else slips.push(r);
      slips.sort(function(a, b) { return b.created_at > a.created_at ? 1 : -1; });
      localStorage.setItem('fl_slips', JSON.stringify(slips));
    } catch (e) {
      console.warn('[Sync] slips localStorage error:', e.message);
    }
  }
};

// ── Map table → panel IDs that should re-render ──
var TABLE_PANEL_MAP = {
  'rituals_log': ['morning', 'midday', 'evening', 'ritual-analytics'],
  'deepwork_log': ['deepwork', 'deepwork-analytics'],
  'mastery_log': ['mastery-daily', 'mastery-weekly', 'mastery-analytics', 'mastery-monthly'],
  'gym_workouts': ['gym-log', 'gym-analytics'],
  'brahma_log': ['brahma-log', 'brahma-analytics', 'brahma-review', 'brahma-monthly'],
  'journal_entries': ['journal-today', 'reflection', 'journal-archive', 'journal-review'],
  'journal_notes': ['journal-today', 'journal-archive', 'journal-review'],
  'journal_insights': ['journal-today', 'journal-archive', 'journal-review'],
  'ekadashi_log': ['ekadashi'],
  'weekly_schedule': ['weekly'],
  'tomorrow_plan': ['tomorrow'],
  'proof_archive': ['arch-log'],
  'daily_checkin': ['checkin', 'dashboard'],
  'reading_log': ['reading'],
  'races': ['races'],
  'slips': ['slip-log', 'slip-history', 'dashboard']
};

// ══════════════════════════════════════════════════════
// initSync — called when Supabase JS client loads
// ══════════════════════════════════════════════════════
function initSync() {
  try {
    var url = (typeof FL !== 'undefined' && FL.SUPABASE_URL) || localStorage.getItem('fl_supabase_url') || '';
    var key = (typeof FL !== 'undefined' && FL.SUPABASE_ANON_KEY) || localStorage.getItem('fl_supabase_key') || '';

    if (!url || !key || !url.includes('supabase.co')) {
      console.warn('[Sync] Supabase not configured — Realtime disabled');
      return;
    }

    if (!window.supabase || !window.supabase.createClient) {
      console.warn('[Sync] Supabase JS client not available');
      return;
    }

    _syncClient = window.supabase.createClient(url, key);

    // Set auth token from stored session
    var session = null;
    try {
      session = JSON.parse(localStorage.getItem('fl_supabase_session') || 'null');
    } catch (e) {
      console.warn('[Sync] Failed to parse session:', e.message);
    }

    if (session && session.access_token) {
      _syncClient.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token || ''
      }).then(function() {
        subscribeToRealtime();
      }).catch(function(e) {
        console.warn('[Sync] Auth session set failed:', e.message);
        // Subscribe anyway with anon access
        subscribeToRealtime();
      });
    } else {
      subscribeToRealtime();
    }

    console.log('[Sync] Engine initialized');
  } catch (e) {
    console.warn('[Sync] initSync error:', e.message);
  }
}

// ══════════════════════════════════════════════════════
// Realtime Subscriptions
// ══════════════════════════════════════════════════════
function subscribeToRealtime() {
  if (!_syncClient) return;

  // Clean up existing channel
  if (_syncChannel) {
    try { _syncClient.removeChannel(_syncChannel); } catch (e) { /* ignore */ }
  }

  _syncChannel = _syncClient.channel('fl-sync-all');

  SYNC_TABLES.forEach(function(table) {
    _syncChannel = _syncChannel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: table },
      function(payload) { handleSyncEvent(table, 'INSERT', payload.new); }
    ).on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: table },
      function(payload) { handleSyncEvent(table, 'UPDATE', payload.new); }
    );
  });

  _syncChannel.subscribe(function(status) {
    if (status === 'SUBSCRIBED') {
      console.log('[Sync] Realtime connected — listening to ' + SYNC_TABLES.length + ' tables');
    } else if (status === 'CHANNEL_ERROR') {
      console.warn('[Sync] Realtime channel error — will retry');
      setTimeout(subscribeToRealtime, 5000);
    } else if (status === 'TIMED_OUT') {
      console.warn('[Sync] Realtime timed out — reconnecting');
      setTimeout(subscribeToRealtime, 3000);
    }
  });
}

// ══════════════════════════════════════════════════════
// handleSyncEvent — process incoming Realtime changes
// ══════════════════════════════════════════════════════
function handleSyncEvent(table, eventType, record) {
  if (!record) return;

  console.log('[Sync] ' + eventType + ' on ' + table, record.date || record.id || '');

  // Update localStorage via SYNC_MAP
  var handler = SYNC_MAP[table];
  if (handler) {
    try {
      handler(record);
    } catch (e) {
      console.warn('[Sync] localStorage update failed for ' + table + ':', e.message);
    }
  }

  // Re-render active panel if affected
  refreshActivePanel(table);
}

// ══════════════════════════════════════════════════════
// Panel refresh — re-render if the active panel is affected
// ══════════════════════════════════════════════════════
function refreshActivePanel(table) {
  var panels = TABLE_PANEL_MAP[table];
  if (!panels || !panels.length) return;

  // Find the currently active panel
  var activePanel = document.querySelector('.cc-panel.active');
  if (!activePanel) return;

  var activePanelId = activePanel.id.replace(/^p-/, '');

  // Check if the active panel is one that should refresh
  var shouldRefresh = panels.indexOf(activePanelId) >= 0;
  if (!shouldRefresh) return;

  // Trigger re-render by calling switchPanel (which dispatches to the right builder)
  if (typeof switchPanel === 'function') {
    console.log('[Sync] Refreshing panel: ' + activePanelId);
    switchPanel(activePanelId);
  }
}

// ══════════════════════════════════════════════════════
// syncSave — write-through helper for other modules
// ══════════════════════════════════════════════════════
function syncSave(table, data, upsertKey) {
  // Mark this data as locally written (prevents remote overwrite for 5 min)
  if (typeof _markLocalWrite === 'function' && data && data.date) {
    var keyHint = table + '_' + (data.date || '') + '_' + (data.period || '');
    _markLocalWrite(keyHint);
  }

  if (typeof sbFetch !== 'function') {
    addToSyncQueue(table, data, '?on_conflict=' + upsertKey);
    return Promise.resolve();
  }

  if (navigator.onLine) {
    return sbFetch(table, 'POST', data, '?on_conflict=' + upsertKey)
      .then(function(result) {
        // sbFetch returns null on failure (and auto-queues), true on success
        if (result === null) {
          console.warn('[Sync] syncSave failed for ' + table + ', already queued by sbFetch');
        }
        return result;
      })
      .catch(function(e) {
        console.warn('[Sync] syncSave error for ' + table + ':', e.message);
        addToSyncQueue(table, data, '?on_conflict=' + upsertKey);
      });
  } else {
    addToSyncQueue(table, data, '?on_conflict=' + upsertKey);
    return Promise.resolve();
  }
}

// ══════════════════════════════════════════════════════
// Pull on tab focus — refresh data when returning to tab
// ══════════════════════════════════════════════════════
document.addEventListener('visibilitychange', function() {
  if (!document.hidden && Date.now() - _lastPull > 60000) {
    pullAllFromSupabase();
    _lastPull = Date.now();
  }
});

// ══════════════════════════════════════════════════════
// pullAllFromSupabase — fetch today's data + flush queue
// ══════════════════════════════════════════════════════
function pullAllFromSupabase() {
  if (!navigator.onLine) return;
  if (typeof sbFetch !== 'function') return;
  if (typeof SB !== 'undefined' && !SB.init()) return;

  var today = typeof getEffectiveToday === 'function' ? getEffectiveToday() : new Date().toISOString().slice(0, 10);
  var _tmrD = new Date(today + 'T00:00:00'); _tmrD.setDate(_tmrD.getDate() + 1);
  var tomorrow = _tmrD.getFullYear() + '-' + String(_tmrD.getMonth()+1).padStart(2,'0') + '-' + String(_tmrD.getDate()).padStart(2,'0');

  console.log('[Sync] Pulling fresh data for ' + today);

  // Pull today's data for key tables
  var pullTasks = [
    { table: 'rituals_log', query: '?date=eq.' + today, handler: function(rows) {
      rows.forEach(function(r) {
        if (r.period && r.date) {
          localStorage.setItem('fl_rituals_' + r.period + '_' + r.date, JSON.stringify(r.completed_ids));
        }
      });
    }},
    { table: 'deepwork_log', query: '?date=eq.' + today, handler: function(rows) {
      rows.forEach(function(r) {
        if (r.date) {
          var blocks = r.blocks;
          if (typeof blocks === 'string') { try { blocks = JSON.parse(blocks); } catch(e) { blocks = []; } }
          localStorage.setItem('fl_deepwork_' + r.date, JSON.stringify({ blocks: blocks, bigWin: r.big_win }));
        }
      });
      // Re-render deepwork UI immediately if the panel is currently active
      if (rows.length > 0) {
        var ap = document.querySelector('.cc-panel.active');
        if (ap && ap.id === 'p-deepwork' && typeof loadDeepWorkForDate === 'function') {
          loadDeepWorkForDate(rows[0].date);
        }
      }
    }},
    { table: 'mastery_log', query: '?date=eq.' + today, handler: function(rows) {
      rows.forEach(function(r) {
        if (r.date) {
          localStorage.setItem('fl_mastery_daily_' + r.date, JSON.stringify(r.items));
        }
      });
    }},
    { table: 'gym_workouts', query: '?date=eq.' + today + '&select=date,split,duration_minutes,energy_level,notes,exercises', handler: function(rows) {
      rows.forEach(function(r) {
        if (r.date) {
          var exercises = r.exercises;
          if (typeof exercises === 'string') { try { exercises = JSON.parse(exercises); } catch(e) { exercises = []; } }
          localStorage.setItem('fl_gym_workout_' + r.date, JSON.stringify({
            split: r.split,
            duration_minutes: r.duration_minutes || 0,
            energy_level: r.energy_level || 5,
            notes: r.notes || '',
            exercises: exercises || []
          }));
        }
      });
    }},
    { table: 'brahma_log', query: '?date=eq.' + today, handler: function(rows) {
      rows.forEach(function(r) {
        if (r.date) {
          localStorage.setItem('fl_brahma_daily_' + r.date, JSON.stringify(r.data));
        }
      });
    }},
    { table: 'daily_checkin', query: '?date=eq.' + today, handler: function(rows) {
      rows.forEach(function(r) {
        if (r.date) {
          localStorage.setItem('fl_checkin_' + r.date, JSON.stringify(r));
        }
      });
    }},
    { table: 'ekadashi_log', query: '?date=eq.' + today, handler: function(rows) {
      rows.forEach(function(r) {
        if (r.date) {
          localStorage.setItem('fl_ekadashi_' + r.date, JSON.stringify({ status: r.status, note: r.note }));
        }
      });
    }},
    { table: 'journal_entries', query: '?date=eq.' + today, handler: function(rows) {
      try {
        var all = JSON.parse(localStorage.getItem('fl_journal') || '{}');
        rows.forEach(function(r) {
          if (r.date) {
            var parsed = r.entry;
            if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch(pe) {} }
            all[r.date] = parsed;
          }
        });
        localStorage.setItem('fl_journal', JSON.stringify(all));
      } catch (e) {
        console.warn('[Sync] pull journal error:', e.message);
      }
    }},
    { table: 'journal_notes', query: '?date=eq.' + today, handler: function(rows) {
      if (!rows.length) return;
      var date = rows[0].date;
      var notes = JSON.parse(localStorage.getItem('fl_journal_notes_' + date) || '[]');
      rows.forEach(function(r) {
        var idx = notes.findIndex(function(n) { return n.id === r.id; });
        if (idx >= 0) notes[idx] = r; else notes.unshift(r);
      });
      notes.sort(function(a, b) { return b.ts > a.ts ? 1 : -1; });
      localStorage.setItem('fl_journal_notes_' + date, JSON.stringify(notes));
      var dates = JSON.parse(localStorage.getItem('fl_journal_note_dates') || '{}');
      dates[date] = true;
      localStorage.setItem('fl_journal_note_dates', JSON.stringify(dates));
    }},
    { table: 'journal_insights', query: '?date=eq.' + today, handler: function(rows) {
      rows.forEach(function(r) {
        if (r.date) {
          localStorage.setItem('fl_journal_insight_' + r.date, JSON.stringify(r));
          var dates = JSON.parse(localStorage.getItem('fl_journal_insight_dates') || '{}');
          dates[r.date] = true;
          localStorage.setItem('fl_journal_insight_dates', JSON.stringify(dates));
        }
      });
    }},
    { table: 'tomorrow_plan', query: '?date=in.(' + today + ',' + tomorrow + ')', handler: function(rows) {
      rows.forEach(function(r) {
        if (r.date) {
          var existing = {};
          try { existing = JSON.parse(localStorage.getItem('fl_tomorrow_' + r.date) || '{}'); } catch(e) {}
          var tasks = r.tasks;
          if (typeof tasks === 'string') { try { tasks = JSON.parse(tasks); } catch(e) { tasks = []; } }
          existing.tasks = tasks || existing.tasks || [];
          if (r.executed_pct !== undefined) existing.executed_pct = r.executed_pct;
          if (r.review_notes !== undefined) existing.review_notes = r.review_notes;
          localStorage.setItem('fl_tomorrow_' + r.date, JSON.stringify(existing));
        }
      });
    }}
  ];

  pullTasks.forEach(function(task) {
    sbFetch(task.table, 'GET', null, task.query)
      .then(function(rows) {
        if (rows && Array.isArray(rows)) {
          task.handler(rows);
        }
      })
      .catch(function(e) {
        console.warn('[Sync] pull failed for ' + task.table + ':', e.message);
      });
  });

  // Also flush any queued writes
  if (typeof flushSyncQueue === 'function') {
    setTimeout(flushSyncQueue, 1000);
  }

  // Refresh the active panel after data arrives
  setTimeout(function() {
    var activePanel = document.querySelector('.cc-panel.active');
    if (activePanel) {
      var panelId = activePanel.id.replace(/^p-/, '');
      if (typeof switchPanel === 'function') {
        switchPanel(panelId);
      }
    }
  }, 2000);
}

// ══════════════════════════════════════════════════════
// Online/Offline listeners
// ══════════════════════════════════════════════════════
window.addEventListener('online', function() {
  console.log('[Sync] Back online — flushing queue');
  if (typeof updateSyncStatus === 'function') updateSyncStatus();
  if (typeof flushSyncQueue === 'function') flushSyncQueue();
  // Re-establish Realtime if needed
  if (_syncClient && (!_syncChannel || _syncChannel.state !== 'joined')) {
    subscribeToRealtime();
  }
});

window.addEventListener('offline', function() {
  console.log('[Sync] Gone offline');
  if (typeof updateSyncStatus === 'function') updateSyncStatus();
});

// ══════════════════════════════════════════════════════
// Cleanup — unsubscribe on page unload
// ══════════════════════════════════════════════════════
window.addEventListener('beforeunload', function() {
  if (_syncClient && _syncChannel) {
    try { _syncClient.removeChannel(_syncChannel); } catch (e) { /* ignore */ }
  }
});
 
