// ═══════════════════════════════════════════
// FIRST LIGHT — ACCOUNTABILITY (SLIPS)
// Immutable slip logging, architecture log,
// penalty proof uploads. NO delete. NO hide.
// ═══════════════════════════════════════════

var SLIP_RULES = {
  body: {
    label: 'BODY',
    categories: [
      { key: 'food_violation', label: 'Food violation' },
      { key: 'missed_run', label: 'Missed run' }
    ]
  },
  fortress: {
    label: 'FORTRESS',
    categories: [
      { key: 'brahmacharya_gate', label: 'Brahmacharya gate broken', penalty: '50km walk + 5km run OR 100km cycling' },
      { key: 'device_at_home', label: 'Device brought into home' }
    ]
  },
  sadhana: {
    label: 'SADHANA',
    categories: [
      { key: 'missed_diary', label: 'Diary entry missed' }
    ]
  }
};

var SLIP_FUNCTIONS = ['loneliness', 'stress', 'boredom', 'self-soothing', 'fatigue', 'other'];

// ══════════════════════════════════════════════════
// PENALTY ESCALATION ENGINE
// Rules:
//   - Base: 20km (general) or 50km (brahmacharya)
//   - Grace period: 7 days
//   - After day 7: +3km per day
//   - Cap: 70km — penalty freezes, cascade spawns
//   - Cascade: new 25km base, also +3km/day, also caps at 70km
//   - Activity: Walk/Run = 1x, Cycling = 0.5x (need double)
// ══════════════════════════════════════════════════

var ESCALATION = {
  GRACE_DAYS: 7,
  DAILY_INCREASE: 3,
  CAP_KM: 70,
  CASCADE_BASE_KM: 25,
  CYCLING_MULTIPLIER: 2  // cycling distance must be 2x walk equivalent
};

// Calculate current required KM for a pending slip (IST-based to match DB trigger)
function getEscalatedKm(slip) {
  if (slip.penalty_status === 'cleared') return parseFloat(slip.proof_km) || 0;

  var baseKm = slip.category === 'brahmacharya_gate' ? 50 : 20;
  if (slip.cascade_level && slip.cascade_level > 0) baseKm = ESCALATION.CASCADE_BASE_KM;

  // Use IST (UTC+5:30) to match DB trigger
  var ist = (typeof getNowIST === 'function') ? getNowIST() : new Date();
  var slipDate = new Date(slip.date + 'T00:00:00+05:30');
  var daysElapsed = Math.floor((ist.getTime() - slipDate.getTime()) / 86400000);
  var overdueDays = Math.max(0, daysElapsed - ESCALATION.GRACE_DAYS);
  var escalated = baseKm + (overdueDays * ESCALATION.DAILY_INCREASE);

  return Math.min(escalated, ESCALATION.CAP_KM);
}

// Check if a slip has hit the 70km cap and needs a cascade penalty
function needsCascade(slip) {
  if (slip.penalty_status === 'cleared') return false;
  return getEscalatedKm(slip) >= ESCALATION.CAP_KM;
}

// Get the effective KM needed for a Strava activity based on its type
function getEffectiveKm(activityType, distanceKm) {
  if (activityType === 'Ride') return distanceKm / ESCALATION.CYCLING_MULTIPLIER;
  return distanceKm; // Walk, Run count at 1x
}

// Human-readable escalation status
function getEscalationStatus(slip) {
  if (slip.penalty_status === 'cleared') return null;

  var baseKm = slip.category === 'brahmacharya_gate' ? 50 : 20;
  if (slip.cascade_level && slip.cascade_level > 0) baseKm = ESCALATION.CASCADE_BASE_KM;

  var daysElapsed = Math.floor((new Date() - new Date(slip.date)) / 86400000);
  var currentKm = getEscalatedKm(slip);
  var overdueDays = Math.max(0, daysElapsed - ESCALATION.GRACE_DAYS);
  var atCap = currentKm >= ESCALATION.CAP_KM;
  var daysLeft = Math.max(0, ESCALATION.GRACE_DAYS - daysElapsed);

  if (daysLeft > 0) {
    return { level: 'grace', text: daysLeft + ' day' + (daysLeft !== 1 ? 's' : '') + ' left at ' + baseKm + ' km', km: baseKm, color: 'var(--gold,#F5A623)' };
  }
  if (atCap) {
    return { level: 'capped', text: 'CAPPED AT ' + ESCALATION.CAP_KM + ' KM — cascade penalty spawned', km: ESCALATION.CAP_KM, color: 'var(--red,#FF5252)' };
  }
  return { level: 'escalating', text: 'ESCALATED: ' + currentKm + ' km (+' + ESCALATION.DAILY_INCREASE + ' km/day, ' + overdueDays + ' days overdue)', km: currentKm, color: 'var(--red,#FF5252)' };
}

// Auto-create cascade penalty if needed
function checkAndCreateCascades() {
  var slips = getSlips();
  var created = false;

  slips.forEach(function(slip) {
    if (slip.penalty_status === 'cleared') return;
    if (!needsCascade(slip)) return;

    // Check if cascade already exists (by parent_slip_id in local OR remote)
    var parentRef = slip.client_id || slip.id;
    var existing = slips.find(function(s) { return s.parent_slip_id === parentRef; });
    if (existing) return;

    // Create cascade penalty
    var cascadeLevel = (slip.cascade_level || 0) + 1;
    var cascadeClientId = generateClientId();
    var cascadeSlip = {
      id: cascadeClientId,
      client_id: cascadeClientId,
      date: new Date().toISOString().split('T')[0],
      day_number: (typeof getDayNumber === 'function') ? getDayNumber() : 0,
      rule: slip.rule,
      category: slip.category,
      function_met: 'escalation',
      failure_point: 'Penalty escalation — original slip hit ' + ESCALATION.CAP_KM + 'km cap',
      insight: 'Cascade penalty level ' + cascadeLevel + ' — consequence of delay',
      architectural_state: {},
      penalty: ESCALATION.CASCADE_BASE_KM + 'km_walk_cascade',
      penalty_status: 'pending',
      proof_url: null,
      proof_km: null,
      proof_strava_url: null,
      parent_slip_id: parentRef,
      cascade_level: cascadeLevel,
      created_at: new Date().toISOString()
    };

    slips.push(cascadeSlip);
    created = true;

    // Sync cascade to Supabase
    syncSlip(cascadeSlip);
  });

  if (created) saveSlips(slips);
  return created;
}

// ── DATA ──

function getSlips() {
  try { return JSON.parse(localStorage.getItem('fl_slips') || '[]'); } catch (e) { return []; }
}

function saveSlips(slips) {
  localStorage.setItem('fl_slips', JSON.stringify(slips));
}

// Generate a unique client_id for dedup
function generateClientId() {
  return 'slip_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
}

// Pull slips from Supabase → merge into localStorage (survive browser wipe)
async function pullSlipsFromSupabase() {
  if (typeof SB === 'undefined' || !SB.init()) return;
  try {
    var remote = await sbFetch('slips', 'GET', null, '?select=id,client_id,date,day_number,rule,category,function_met,failure_point,insight,penalty,penalty_status,proof_km,proof_strava_url,proof_strava_activity_id,parent_slip_id,cascade_level,cleared_at,created_at&order=date.desc');
    if (!remote || !Array.isArray(remote)) return;

    var local = getSlips();
    var localClientIds = {};
    local.forEach(function(s) { if (s.client_id) localClientIds[s.client_id] = true; if (s.db_id) localClientIds['db_' + s.db_id] = true; });

    var merged = false;
    remote.forEach(function(r) {
      // Skip if already in local (by client_id or db_id)
      if (r.client_id && localClientIds[r.client_id]) return;
      if (localClientIds['db_' + r.id]) return;

      // Add remote slip to local
      local.push({
        id: r.client_id || ('remote_' + r.id),
        db_id: r.id,
        client_id: r.client_id,
        date: r.date,
        day_number: r.day_number,
        rule: r.rule,
        category: r.category,
        function_met: r.function_met,
        failure_point: r.failure_point,
        insight: r.insight,
        penalty: r.penalty,
        penalty_status: r.penalty_status,
        proof_km: r.proof_km,
        proof_strava_url: r.proof_strava_url,
        proof_strava_activity_id: r.proof_strava_activity_id,
        parent_slip_id: r.parent_slip_id,
        cascade_level: r.cascade_level,
        cleared_at: r.cleared_at,
        created_at: r.created_at
      });
      merged = true;
    });

    if (merged) {
      saveSlips(local);
      console.log('[SLIPS] Merged ' + remote.length + ' remote slips into local');
    }
  } catch(e) {
    console.warn('[SLIPS] Pull from Supabase failed:', e.message);
  }
}

function getArchLog() {
  try { return JSON.parse(localStorage.getItem('fl_arch_log') || '[]'); } catch (e) { return []; }
}

function saveArchLog(log) {
  localStorage.setItem('fl_arch_log', JSON.stringify(log));
}

// ── GATHER ARCHITECTURAL STATE ──

function gatherArchitecturalState() {
  var today = getEffectiveToday();
  var state = { sleep: '—', food_clean: '—', brahma_clean: '—', mood: '—', urge: '—', morning_pct: '—' };

  // Sleep from proof data
  var proof = (typeof getProofData === 'function') ? getProofData() : [];
  var todayProof = proof.find(function(p) { return p.date === today; });
  if (todayProof && todayProof.sleep) state.sleep = todayProof.sleep + 'h';

  // Checkin signals
  var checkin = (typeof getCheckin === 'function') ? getCheckin(today) : {};
  if (checkin.food_clean !== undefined) state.food_clean = checkin.food_clean ? 'YES' : 'NO';
  if (checkin.mood) state.mood = checkin.mood;
  if (checkin.morning_pct !== undefined) state.morning_pct = checkin.morning_pct + '%';

  // Brahma daily
  var brahma = (typeof getBrahmaDaily === 'function') ? getBrahmaDaily(today) : {};
  if (typeof isCleanDay === 'function') state.brahma_clean = isCleanDay(brahma) ? 'CLEAN' : 'BROKEN';
  if (brahma.urge_level !== undefined) state.urge = brahma.urge_level + '/10';

  return state;
}

// ── RENDER SLIP LOG FORM ──

function renderSlipLog() {
  var c = document.getElementById('slip-log-container');
  if (!c) return;

  // Pull remote slips on first render (async, won't block)
  if (!window._slipsPulled) { window._slipsPulled = true; pullSlipsFromSupabase(); }

  var state = gatherArchitecturalState();
  var today = getEffectiveToday();
  var dayNum = (typeof getDayNumber === 'function') ? getDayNumber() : '—';

  var html = '';
  html += '<div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:var(--red,#e74c3c);letter-spacing:2px;margin-bottom:8px">LOG SLIP — PERMANENT RECORD</div>';
  html += '<div style="background:rgba(231,76,60,0.15);border:1px solid var(--red,#e74c3c);border-radius:8px;padding:12px;margin-bottom:16px;font-family:var(--font-mono);font-size:11px;color:var(--red,#e74c3c);line-height:1.5">';
  html += 'WARNING: This entry cannot be deleted or modified after submission. It will be visible on the public website. There is no undo.';
  html += '</div>';

  // Date + Day
  html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-bottom:16px">' + today + ' · DAY ' + dayNum + '</div>';

  // Rule selector
  html += '<label style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);letter-spacing:1px">RULE BROKEN</label>';
  html += '<div id="slip-rule-btns" style="display:flex;gap:8px;margin:8px 0 16px">';
  Object.keys(SLIP_RULES).forEach(function(key) {
    html += '<button class="btn-copy" onclick="selectSlipRule(\'' + key + '\')" id="slip-rule-' + key + '" style="flex:1;font-size:11px;padding:8px 0">' + SLIP_RULES[key].label + '</button>';
  });
  html += '</div>';

  // Category selector
  html += '<div id="slip-cat-wrap" style="margin-bottom:16px;display:none">';
  html += '<label style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);letter-spacing:1px">CATEGORY</label>';
  html += '<select id="slip-category" onchange="showSlipPenaltyWarning()" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--text);font-family:var(--font-mono);font-size:12px;margin-top:4px"></select>';
  html += '<div id="slip-penalty-warning" style="display:none;margin-top:8px;padding:10px 12px;background:rgba(255,82,82,0.08);border:1px solid rgba(255,82,82,0.2);border-radius:6px;font-family:var(--font-mono);font-size:10px;color:var(--red,#FF5252)"></div>';
  html += '</div>';

  // Architectural state (read-only)
  html += '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:16px">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);letter-spacing:1px;margin-bottom:8px">ARCHITECTURAL STATE (AUTO-CAPTURED)</div>';
  var stateRows = [
    ['Sleep', state.sleep], ['Food clean', state.food_clean], ['Brahma clean', state.brahma_clean],
    ['Mood', state.mood], ['Urge level', state.urge], ['Morning rituals', state.morning_pct]
  ];
  stateRows.forEach(function(r) {
    html += '<div style="display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:11px;padding:2px 0"><span style="color:var(--text-muted)">' + r[0] + '</span><span style="color:var(--text)">' + r[1] + '</span></div>';
  });
  html += '</div>';

  // Function dropdown
  html += '<label style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);letter-spacing:1px">WHAT FUNCTION WERE YOU TRYING TO MEET? *</label>';
  html += '<select id="slip-function" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--text);font-family:var(--font-mono);font-size:12px;margin:4px 0 4px">';
  html += '<option value="">— select —</option>';
  SLIP_FUNCTIONS.forEach(function(f) { html += '<option value="' + f + '">' + f.charAt(0).toUpperCase() + f.slice(1) + '</option>'; });
  html += '</select>';
  html += '<input id="slip-function-other" type="text" placeholder="Describe (if other)" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--text);font-family:var(--font-mono);font-size:12px;margin-bottom:16px;display:none;box-sizing:border-box">';

  // Where did architecture fail
  html += '<label style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);letter-spacing:1px">WHERE DID THE ARCHITECTURE FAIL? * (1-3 sentences)</label>';
  html += '<textarea id="slip-failure" rows="3" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--text);font-family:var(--font-mono);font-size:12px;margin:4px 0 16px;resize:vertical;box-sizing:border-box"></textarea>';

  // Insight
  html += '<label style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);letter-spacing:1px">WHAT DID THIS TEACH YOU? * (1 sentence — becomes architecture log entry)</label>';
  html += '<textarea id="slip-insight" rows="2" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--text);font-family:var(--font-mono);font-size:12px;margin:4px 0 16px;resize:vertical;box-sizing:border-box"></textarea>';

  // Penalty (dynamic — updates when category changes)
  html += '<div id="slip-penalty-display" style="background:rgba(231,76,60,0.1);border:1px solid var(--red,#e74c3c);border-radius:8px;padding:12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">';
  html += '<span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);letter-spacing:1px">PENALTY ASSIGNED</span>';
  html += '<span id="slip-penalty-text" style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--red,#e74c3c)">20 KM WALK</span>';
  html += '</div>';

  // Submit
  html += '<button onclick="submitSlip()" style="width:100%;padding:12px;border:2px solid var(--red,#e74c3c);background:rgba(231,76,60,0.2);color:var(--red,#e74c3c);font-family:var(--font-mono);font-size:13px;font-weight:700;letter-spacing:2px;border-radius:8px;cursor:pointer">SUBMIT SLIP — NO UNDO</button>';

  c.innerHTML = html;

  // Show/hide other text field
  document.getElementById('slip-function').addEventListener('change', function() {
    document.getElementById('slip-function-other').style.display = this.value === 'other' ? '' : 'none';
  });
}

var _selectedSlipRule = '';

function selectSlipRule(rule) {
  _selectedSlipRule = rule;
  // Highlight selected
  Object.keys(SLIP_RULES).forEach(function(k) {
    var btn = document.getElementById('slip-rule-' + k);
    if (btn) {
      btn.style.background = k === rule ? 'var(--red,#e74c3c)' : '';
      btn.style.color = k === rule ? '#fff' : '';
    }
  });
  // Populate categories
  var wrap = document.getElementById('slip-cat-wrap');
  var sel = document.getElementById('slip-category');
  if (!wrap || !sel) return;
  wrap.style.display = '';
  sel.innerHTML = '<option value="">— select category —</option>';
  SLIP_RULES[rule].categories.forEach(function(cat) {
    sel.innerHTML += '<option value="' + cat.key + '">' + cat.label + '</option>';
  });
}

function showSlipPenaltyWarning() {
  var sel = document.getElementById('slip-category');
  var warn = document.getElementById('slip-penalty-warning');
  var penaltyText = document.getElementById('slip-penalty-text');
  if (!sel || !warn) return;
  var cat = sel.value;
  if (cat === 'brahmacharya_gate') {
    warn.style.display = 'block';
    warn.innerHTML = '⚠ ENHANCED PENALTY: 50km walk + 5km run OR 100km cycling<br><span style="font-size:9px;color:var(--text-dim)">This cannot be undone. The penalty is permanent and must be cleared with proof.</span>';
    if (penaltyText) penaltyText.textContent = '50 KM WALK + 5 KM RUN';
  } else {
    warn.style.display = 'none';
    if (penaltyText) penaltyText.textContent = '20 KM WALK';
  }
}

// ── SUBMIT SLIP ──

function submitSlip() {
  if (!_selectedSlipRule) { alert('Select which rule was broken.'); return; }
  var category = document.getElementById('slip-category').value;
  if (!category) { alert('Select the specific category.'); return; }
  var fn = document.getElementById('slip-function').value;
  if (!fn) { alert('Select the function you were trying to meet.'); return; }
  if (fn === 'other') {
    fn = document.getElementById('slip-function-other').value.trim();
    if (!fn) { alert('Describe the function (other).'); return; }
  }
  var failure = document.getElementById('slip-failure').value.trim();
  if (!failure) { alert('Describe where the architecture failed.'); return; }
  var insight = document.getElementById('slip-insight').value.trim();
  if (!insight) { alert('Write what this taught you.'); return; }

  var today = getEffectiveToday();
  var dayNum = (typeof getDayNumber === 'function') ? getDayNumber() : 0;
  var state = gatherArchitecturalState();

  var clientId = generateClientId();
  var slip = {
    id: clientId,
    client_id: clientId,
    date: today,
    day_number: dayNum,
    rule: _selectedSlipRule,
    category: category,
    function_met: fn,
    failure_point: failure,
    insight: insight,
    architectural_state: state,
    penalty: category === 'brahmacharya_gate' ? '50km_walk_5km_run_or_100km_cycle' : '20km_walk',
    penalty_status: 'pending',
    proof_url: null,
    proof_km: null,
    proof_strava_url: null,
    created_at: new Date().toISOString()
  };

  // Save to localStorage
  var slips = getSlips();
  slips.push(slip);
  saveSlips(slips);

  // Auto-create architecture log entry
  var archEntry = {
    id: 'arch_' + Date.now(),
    date: today,
    source: 'slip',
    slip_id: slip.id,
    observation: insight,
    hypothesis: '',
    proposed_change: '',
    status: 'open',
    created_at: new Date().toISOString()
  };
  var archLog = getArchLog();
  archLog.push(archEntry);
  saveArchLog(archLog);

  // Sync to Supabase immediately — this is critical
  var syncOk = syncSlip(slip);
  syncArchEntry(archEntry);

  markSaved();

  if (syncOk === false) {
    alert('SLIP SAVED LOCALLY but Supabase sync failed. It will retry automatically. Check console for errors.');
  } else {
    alert('Slip logged. Penalty triggered. This is now permanent and public.');
  }

  // Reset form
  _selectedSlipRule = '';
  renderSlipLog();
}

// ── RENDER SLIP HISTORY ──

function renderSlipHistory() {
  var c = document.getElementById('slip-history-container');
  if (!c) return;

  // Auto-create cascade penalties if any slip hit the 70km cap
  checkAndCreateCascades();

  var slips = getSlips();
  var filter = (c.dataset.filter) || 'all';

  var html = '';

  // Filter bar
  html += '<div style="display:flex;gap:8px;margin-bottom:12px;align-items:center">';
  html += '<label style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);letter-spacing:1px">FILTER</label>';
  html += '<select id="slip-filter" onchange="filterSlipHistory(this.value)" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--text);font-family:var(--font-mono);font-size:11px">';
  ['all','body','fortress','sadhana'].forEach(function(f) {
    html += '<option value="' + f + '"' + (f === filter ? ' selected' : '') + '>' + f.toUpperCase() + '</option>';
  });
  html += '</select></div>';

  // Stats
  var total = slips.length;
  var cleared = slips.filter(function(s) { return s.penalty_status === 'cleared'; }).length;
  var pending = total - cleared;

  html += '<div style="display:flex;gap:16px;margin-bottom:16px;font-family:var(--font-mono);font-size:12px">';
  html += '<span style="color:var(--text-muted)">Total <strong style="color:var(--text)">' + total + '</strong></span>';
  html += '<span style="color:var(--text-muted)">Cleared <strong style="color:var(--green,#2ecc71)">' + cleared + '</strong></span>';
  html += '<span style="color:var(--text-muted)">Pending <strong style="color:var(--red,#e74c3c)">' + pending + '</strong></span>';
  html += '</div>';

  // List (reverse chronological)
  var filtered = filter === 'all' ? slips : slips.filter(function(s) { return s.rule === filter; });
  filtered = filtered.slice().reverse();

  if (filtered.length === 0) {
    html += '<div style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);text-align:center;padding:32px 0">No slips recorded.</div>';
  }

  filtered.forEach(function(slip, i) {
    var realIdx = slips.indexOf(slip);
    var isPending = slip.penalty_status !== 'cleared';
    var ruleLabel = SLIP_RULES[slip.rule] ? SLIP_RULES[slip.rule].label : slip.rule;
    var catObj = SLIP_RULES[slip.rule] ? SLIP_RULES[slip.rule].categories.find(function(c) { return c.key === slip.category; }) : null;
    var catLabel = catObj ? catObj.label : slip.category;

    html += '<div style="background:var(--bg-card);border:1px solid ' + (isPending ? 'var(--red,#e74c3c)' : 'var(--green,#2ecc71)') + ';border-radius:8px;padding:12px;margin-bottom:10px">';

    // Header row
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
    html += '<span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">' + slip.date + ' · DAY ' + (slip.day_number || '—') + '</span>';
    if (isPending) {
      html += '<span style="font-family:var(--font-mono);font-size:10px;font-weight:700;color:var(--red,#e74c3c);background:rgba(231,76,60,0.15);padding:2px 8px;border-radius:4px;letter-spacing:1px">PENDING</span>';
    } else {
      html += '<span style="font-family:var(--font-mono);font-size:10px;font-weight:700;color:var(--green,#2ecc71);background:rgba(46,204,113,0.15);padding:2px 8px;border-radius:4px;letter-spacing:1px">CLEARED</span>';
    }
    html += '</div>';

    // Rule + category
    html += '<div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--text);margin-bottom:4px">' + ruleLabel + ' — ' + catLabel + '</div>';

    // Insight
    if (slip.insight) {
      html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-bottom:8px;font-style:italic">"' + slip.insight + '"</div>';
    }

    // Proof section — Strava verified
    if (!isPending && slip.proof_km) {
      html += '<div style="display:flex;align-items:center;gap:8px;font-family:var(--font-mono);font-size:11px;color:var(--green,#2ecc71);margin-bottom:' + (slip.proof_strava_activity_id ? '10px' : '0') + '">';
      html += '<span style="font-size:16px">✅</span>';
      html += '<span><strong>' + slip.proof_km + ' km</strong> — Strava verified</span>';
      if (slip.proof_strava_url) html += ' <a href="' + slip.proof_strava_url + '" target="_blank" style="color:var(--accent,#fc4c02)">View on Strava →</a>';
      html += '</div>';
      if (slip.proof_strava_activity_id) {
        html += '<div id="slip-map-' + slip.proof_strava_activity_id + '" class="smap-wrap"></div>';
      }
    } else if (isPending) {
      // Show escalation status
      var escStatus = getEscalationStatus(slip);
      if (escStatus) {
        html += '<div style="font-family:var(--font-mono);font-size:10px;color:' + escStatus.color + ';margin-bottom:8px;padding:6px 10px;background:rgba(255,82,82,0.06);border-radius:6px;letter-spacing:0.5px">';
        html += 'CURRENT REQUIREMENT: <strong>' + escStatus.km + ' km walk</strong> (or ' + (escStatus.km * ESCALATION.CYCLING_MULTIPLIER) + ' km cycling)';
        html += '<br>' + escStatus.text;
        html += '</div>';
      }
      if (slip.parent_slip_id) {
        html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-bottom:6px">CASCADE from ' + slip.parent_slip_id + '</div>';
      }
      html += '<button onclick="uploadSlipProof(' + realIdx + ')" class="btn-copy" style="font-size:10px;padding:6px 12px;border-color:var(--red,#e74c3c);color:var(--red,#e74c3c)">CLEAR WITH STRAVA ACTIVITY</button>';
    }

    // NO delete. NO edit. NO hide.
    html += '</div>';
  });

  c.innerHTML = html;
  // Render interactive route maps for all cleared slips
  filtered.forEach(function(slip) {
    if (slip.penalty_status === 'cleared' && slip.proof_strava_activity_id) {
      renderSlipMap('slip-map-' + slip.proof_strava_activity_id, slip.proof_strava_activity_id, slip);
    }
  });
}

function filterSlipHistory(val) {
  var c = document.getElementById('slip-history-container');
  if (c) c.dataset.filter = val;
  renderSlipHistory();
}

// ── CLEAR PENALTY — STRAVA ACTIVITY PICKER ──

var _proofSelectedActivity = null;

function uploadSlipProof(slipIndex) {
  var c = document.getElementById('slip-history-container');
  if (!c) return;
  var slips = getSlips();
  var slip = slips[slipIndex];
  if (!slip) return;

  // Check for cascades first
  checkAndCreateCascades();

  _proofSelectedActivity = null;

  var minKm = getEscalatedKm(slip);
  var cyclingKm = minKm * ESCALATION.CYCLING_MULTIPLIER;
  var escStatus = getEscalationStatus(slip);
  var penaltyDesc = minKm + 'km walk / run OR ' + cyclingKm + 'km cycling';

  var html = '';
  html += '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:16px">';
  html += '<div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:var(--red,#e74c3c);letter-spacing:2px;margin-bottom:8px">CLEAR PENALTY — STRAVA VERIFIED</div>';
  html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-bottom:4px">Slip: ' + slip.date + ' — ' + (SLIP_RULES[slip.rule] ? SLIP_RULES[slip.rule].label : slip.rule) + '</div>';

  // Escalation status box
  if (escStatus) {
    html += '<div style="background:rgba(255,82,82,0.06);border:1px solid rgba(255,82,82,0.15);border-radius:8px;padding:12px;margin-bottom:16px">';
    html += '<div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:' + escStatus.color + ';margin-bottom:4px">' + escStatus.text + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:var(--red,#FF5252);margin:8px 0">' + minKm + ' KM WALK/RUN</div>';
    html += '<div style="font-family:var(--font-mono);font-size:12px;color:var(--text-dim)">or ' + cyclingKm + ' km cycling (2x multiplier)</div>';
    html += '<div style="margin-top:8px;font-family:var(--font-mono);font-size:9px;color:var(--text-dim);letter-spacing:0.5px">Must be completed in a SINGLE Strava activity. One activity = one penalty.</div>';
    html += '</div>';
  } else {
    html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--red);margin-bottom:16px;letter-spacing:0.5px">REQUIRED: ' + penaltyDesc + '</div>';
  }

  // Activity picker container
  html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);letter-spacing:1px;margin-bottom:8px">SELECT ONE STRAVA ACTIVITY (Walk or Ride)</div>';
  html += '<div id="strava-picker" style="max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;margin-bottom:16px;scrollbar-width:thin">';
  html += '<div style="text-align:center;padding:24px;font-family:var(--font-mono);font-size:11px;color:var(--text-dim)">Loading Strava activities...</div>';
  html += '</div>';

  // Selected activity display
  html += '<div id="strava-selected" style="display:none;background:rgba(0,230,118,0.06);border:1px solid rgba(0,230,118,0.2);border-radius:8px;padding:12px;margin-bottom:16px">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--green,#00E676);letter-spacing:1px;margin-bottom:4px">SELECTED ACTIVITY</div>';
  html += '<div id="strava-selected-info" style="font-family:var(--font-mono);font-size:12px;color:var(--text)"></div>';
  html += '</div>';

  // KM verification display
  html += '<div id="strava-km-check" style="display:none;padding:10px 12px;border-radius:6px;margin-bottom:16px;font-family:var(--font-mono);font-size:11px"></div>';

  html += '<div style="display:flex;gap:8px">';
  html += '<button id="slip-proof-submit" onclick="submitSlipProof(' + slipIndex + ')" class="btn-primary" style="flex:1;font-size:11px" disabled>SELECT AN ACTIVITY FIRST</button>';
  html += '<button onclick="renderSlipHistory()" class="btn-copy" style="font-size:11px">CANCEL</button>';
  html += '</div>';
  html += '</div>';

  c.innerHTML = html;

  // Load Strava activities
  loadStravaActivitiesForPicker(slipIndex, minKm);
}

async function loadStravaActivitiesForPicker(slipIndex, minKm) {
  var picker = document.getElementById('strava-picker');
  if (!picker) return;

  // Fetch Walk + Ride activities from Supabase
  var activities = null;
  if (typeof sbFetch === 'function' && typeof SB !== 'undefined' && SB.init()) {
    activities = await sbFetch('strava_activities', 'GET', null,
      '?select=id,name,type,distance,moving_time,start_date_local&type=in.(Walk,Ride,Run)&order=start_date_local.desc&limit=200');
  }

  if (!activities || !Array.isArray(activities) || activities.length === 0) {
    picker.innerHTML = '<div style="text-align:center;padding:24px;font-family:var(--font-mono);font-size:11px;color:var(--red)">No Walk or Ride activities found in Strava. Complete your penalty walk first, then sync Strava.</div>';
    return;
  }

  // Get IDs of activities already used for other penalties
  var usedIds = getUsedStravaActivityIds();

  var html = '';
  activities.forEach(function(act) {
    var rawKm = (parseFloat(act.distance) / 1000);
    var effectiveKm = getEffectiveKm(act.type, rawKm);
    var displayKm = rawKm.toFixed(2);
    var mins = Math.floor((act.moving_time || 0) / 60);
    var hrs = Math.floor(mins / 60);
    var remMins = mins % 60;
    var timeStr = hrs > 0 ? hrs + 'h ' + remMins + 'm' : remMins + 'm';
    var dateStr = act.start_date_local ? act.start_date_local.split('T')[0] : '—';
    var isUsed = usedIds.indexOf(act.id) >= 0;
    var meetsMin = effectiveKm >= minKm;
    var isCycling = act.type === 'Ride';

    var borderColor = isUsed ? 'rgba(255,255,255,0.04)' : meetsMin ? 'rgba(0,230,118,0.15)' : 'rgba(255,82,82,0.1)';
    var opacity = isUsed ? '0.35' : '1';
    var cursor = isUsed ? 'not-allowed' : 'pointer';
    var onclick = isUsed ? '' : 'onclick="selectStravaActivity(' + act.id + ',' + effectiveKm.toFixed(2) + ',' + displayKm + ',\'' + (act.name || '').replace(/'/g, "\\'") + '\',\'' + act.type + '\',\'' + dateStr + '\',\'' + timeStr + '\',' + minKm + ')"';

    html += '<div ' + onclick + ' id="strava-act-' + act.id + '" style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.04);border-left:3px solid ' + borderColor + ';cursor:' + cursor + ';opacity:' + opacity + ';transition:background 0.15s" onmouseover="if(!this.style.opacity||this.style.opacity==\'1\')this.style.background=\'rgba(0,212,255,0.04)\'" onmouseout="this.style.background=\'\'">';

    // Left: name + date + type badge
    html += '<div>';
    html += '<div style="display:flex;align-items:center;gap:6px">';
    html += '<span style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--text)">' + (act.name || act.type) + '</span>';
    var typeBadge = act.type === 'Walk' ? '🚶' : act.type === 'Run' ? '🏃' : act.type === 'Ride' ? '🚴' : '🏋️';
    html += '<span style="font-size:14px">' + typeBadge + '</span>';
    html += '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim)">' + dateStr + ' · ' + act.type + ' · ' + timeStr + '</div>';
    html += '</div>';

    // Right: distance + effective KM + status
    html += '<div style="text-align:right">';
    html += '<div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:' + (meetsMin ? 'var(--green,#00E676)' : 'var(--text)') + '">' + displayKm + ' km</div>';
    if (isCycling) {
      html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--cyan,#00D4FF)">= ' + effectiveKm.toFixed(1) + ' km walk equiv (÷2)</div>';
    }
    if (isUsed) {
      html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--red);letter-spacing:1px;font-weight:700">ALREADY USED</div>';
    } else if (!meetsMin) {
      html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);letter-spacing:0.5px">need ' + (isCycling ? (minKm * 2) + ' km cycling' : minKm + ' km') + '</div>';
    } else {
      html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--green,#00E676);letter-spacing:1px">ELIGIBLE</div>';
    }
    html += '</div>';

    html += '</div>';
  });

  picker.innerHTML = html;
}

function getUsedStravaActivityIds() {
  var slips = getSlips();
  var ids = [];
  slips.forEach(function(s) {
    if (s.proof_strava_activity_id) ids.push(s.proof_strava_activity_id);
  });
  return ids;
}

function selectStravaActivity(id, effectiveKm, rawKm, name, type, date, time, minKm) {
  _proofSelectedActivity = { id: id, km: effectiveKm, rawKm: rawKm, name: name, type: type, date: date, time: time };
  var km = effectiveKm;

  // Highlight selected row
  var picker = document.getElementById('strava-picker');
  if (picker) {
    picker.querySelectorAll('[id^="strava-act-"]').forEach(function(el) {
      el.style.background = '';
    });
    var sel = document.getElementById('strava-act-' + id);
    if (sel) sel.style.background = 'rgba(0,230,118,0.08)';
  }

  // Show selected info
  var selDiv = document.getElementById('strava-selected');
  var selInfo = document.getElementById('strava-selected-info');
  if (selDiv && selInfo) {
    selDiv.style.display = '';
    var kmDisplay = type === 'Ride' ? rawKm + ' km cycling (= ' + km + ' km walk equivalent)' : km + ' km ' + type.toLowerCase();
    selInfo.innerHTML = '<strong>' + name + '</strong> · ' + date + ' · ' + kmDisplay + ' · ' + time;
  }

  // KM check
  var kmCheck = document.getElementById('strava-km-check');
  var btn = document.getElementById('slip-proof-submit');
  if (km >= minKm) {
    if (kmCheck) {
      kmCheck.style.display = '';
      kmCheck.style.background = 'rgba(0,230,118,0.06)';
      kmCheck.style.border = '1px solid rgba(0,230,118,0.2)';
      kmCheck.style.color = 'var(--green,#00E676)';
      kmCheck.textContent = 'VERIFIED: ' + km + ' km >= ' + minKm + ' km minimum. PENALTY CAN BE CLEARED.';
    }
    if (btn) { btn.disabled = false; btn.textContent = 'CLEAR PENALTY — ' + km + ' KM VERIFIED'; }
  } else {
    if (kmCheck) {
      kmCheck.style.display = '';
      kmCheck.style.background = 'rgba(255,82,82,0.06)';
      kmCheck.style.border = '1px solid rgba(255,82,82,0.2)';
      kmCheck.style.color = 'var(--red,#FF5252)';
      kmCheck.textContent = 'INSUFFICIENT: ' + km + ' km < ' + minKm + ' km minimum. This activity does not meet the penalty requirement.';
    }
    if (btn) { btn.disabled = true; btn.textContent = 'ACTIVITY DOES NOT MEET MINIMUM'; }
  }
}

function submitSlipProof(slipIndex) {
  if (!_proofSelectedActivity) { alert('Select a Strava activity first.'); return; }

  var slips = getSlips();
  var slip = slips[slipIndex];
  if (!slip) return;

  var minKm = getEscalatedKm(slip);
  var km = _proofSelectedActivity.km; // effective KM (after cycling multiplier)

  if (km < minKm) { alert('BLOCKED: ' + km + ' km does not meet the ' + minKm + ' km minimum. No exceptions.'); return; }

  // Check this activity isn't already used
  var usedIds = getUsedStravaActivityIds();
  if (usedIds.indexOf(_proofSelectedActivity.id) >= 0) { alert('This Strava activity is already linked to another penalty.'); return; }

  var stravaUrl = 'https://www.strava.com/activities/' + _proofSelectedActivity.id;

  slip.penalty_status = 'cleared';
  slip.proof_km = km;
  slip.proof_strava_url = stravaUrl;
  slip.proof_strava_activity_id = _proofSelectedActivity.id;
  slip.cleared_at = new Date().toISOString();

  saveSlips(slips);

  // Sync to Supabase with activity ID
  syncSlipProof(slip, km, stravaUrl, _proofSelectedActivity.id);

  _proofSelectedActivity = null;
  markSaved();
  alert('PENALTY CLEARED. ' + km + ' km verified via Strava. This is permanent.');
  renderSlipHistory();
}

// ── ARCHITECTURE LOG ──

function renderArchLog() {
  var c = document.getElementById('arch-log-container');
  if (!c) return;

  var log = getArchLog();
  var html = '';

  // Add insight button
  html += '<button onclick="showArchEntryForm()" class="btn-copy" style="margin-bottom:16px;font-size:11px;border-color:var(--accent-blue,#3498db);color:var(--accent-blue,#3498db)">+ ADD INSIGHT</button>';

  // Standalone entry form (hidden by default)
  html += '<div id="arch-entry-form" style="display:none;background:var(--bg-card);border:1px solid var(--accent-blue,#3498db);border-radius:8px;padding:16px;margin-bottom:16px">';
  html += '<div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--accent-blue,#3498db);margin-bottom:12px;letter-spacing:1px">NEW ARCHITECTURE INSIGHT</div>';

  html += '<label style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);letter-spacing:1px">OBSERVATION *</label>';
  html += '<textarea id="arch-observation" rows="2" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--text);font-family:var(--font-mono);font-size:12px;margin:4px 0 12px;resize:vertical;box-sizing:border-box"></textarea>';

  html += '<label style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);letter-spacing:1px">HYPOTHESIS</label>';
  html += '<textarea id="arch-hypothesis" rows="2" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--text);font-family:var(--font-mono);font-size:12px;margin:4px 0 12px;resize:vertical;box-sizing:border-box"></textarea>';

  html += '<label style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);letter-spacing:1px">PROPOSED CHANGE</label>';
  html += '<textarea id="arch-proposed" rows="2" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--text);font-family:var(--font-mono);font-size:12px;margin:4px 0 12px;resize:vertical;box-sizing:border-box"></textarea>';

  html += '<div style="display:flex;gap:8px">';
  html += '<button onclick="saveStandaloneArchEntry()" class="btn-primary" style="flex:1;font-size:11px">SAVE INSIGHT</button>';
  html += '<button onclick="hideArchEntryForm()" class="btn-copy" style="font-size:11px">CANCEL</button>';
  html += '</div>';
  html += '</div>';

  // List entries (reverse chronological)
  var sorted = log.slice().reverse();
  if (sorted.length === 0) {
    html += '<div style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);text-align:center;padding:32px 0">No architecture log entries yet.</div>';
  }

  sorted.forEach(function(entry) {
    var statusColor = entry.status === 'confirmed' ? 'var(--green,#2ecc71)' : entry.status === 'testing' ? 'var(--yellow,#f39c12)' : 'var(--accent-blue,#3498db)';
    var statusBg = entry.status === 'confirmed' ? 'rgba(46,204,113,0.15)' : entry.status === 'testing' ? 'rgba(243,156,18,0.15)' : 'rgba(52,152,219,0.15)';

    html += '<div style="background:var(--bg-card);border:1px solid var(--accent-blue,#3498db);border-left:3px solid ' + statusColor + ';border-radius:8px;padding:12px;margin-bottom:10px">';

    // Header
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">';
    html += '<span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">' + entry.date + (entry.source === 'slip' ? ' · from slip' : ' · standalone') + '</span>';
    html += '<span style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:' + statusColor + ';background:' + statusBg + ';padding:2px 8px;border-radius:4px;letter-spacing:1px;text-transform:uppercase">' + (entry.status || 'open') + '</span>';
    html += '</div>';

    // Observation
    html += '<div style="font-family:var(--font-mono);font-size:12px;color:var(--text);margin-bottom:4px">' + entry.observation + '</div>';

    // Hypothesis
    if (entry.hypothesis) {
      html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-bottom:2px"><span style="color:var(--accent-blue,#3498db)">Hypothesis:</span> ' + entry.hypothesis + '</div>';
    }

    // Proposed change
    if (entry.proposed_change) {
      html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)"><span style="color:var(--accent-blue,#3498db)">Change:</span> ' + entry.proposed_change + '</div>';
    }

    // Status toggle
    html += '<div style="margin-top:8px;display:flex;gap:6px">';
    ['open','testing','confirmed'].forEach(function(s) {
      var active = (entry.status || 'open') === s;
      html += '<button onclick="updateArchStatus(\'' + entry.id + '\',\'' + s + '\')" style="font-family:var(--font-mono);font-size:9px;padding:2px 8px;border-radius:4px;border:1px solid var(--border);background:' + (active ? statusColor : 'transparent') + ';color:' + (active ? '#fff' : 'var(--text-muted)') + ';cursor:pointer;letter-spacing:1px">' + s.toUpperCase() + '</button>';
    });
    html += '</div>';

    html += '</div>';
  });

  c.innerHTML = html;
}

function showArchEntryForm() {
  var f = document.getElementById('arch-entry-form');
  if (f) f.style.display = '';
}

function hideArchEntryForm() {
  var f = document.getElementById('arch-entry-form');
  if (f) f.style.display = 'none';
}

function saveStandaloneArchEntry() {
  var obs = document.getElementById('arch-observation').value.trim();
  if (!obs) { alert('Observation is required.'); return; }

  var entry = {
    id: 'arch_' + Date.now(),
    date: getEffectiveToday(),
    source: 'standalone',
    slip_id: null,
    observation: obs,
    hypothesis: document.getElementById('arch-hypothesis').value.trim(),
    proposed_change: document.getElementById('arch-proposed').value.trim(),
    status: 'open',
    created_at: new Date().toISOString()
  };

  saveArchEntry(entry);
  markSaved();
  renderArchLog();
}

function saveArchEntry(entry) {
  var log = getArchLog();
  log.push(entry);
  saveArchLog(log);
  syncArchEntry(entry);
}

function updateArchStatus(id, status) {
  var log = getArchLog();
  var entry = log.find(function(e) { return e.id === id; });
  if (!entry) return;
  entry.status = status;
  saveArchLog(log);
  syncArchEntry(entry);
  markSaved();
  renderArchLog();
}

// ── SYNC ──

function syncSlip(slip) {
  if (typeof SB === 'undefined' || !SB.init()) {
    console.warn('[SLIPS] Supabase not available — slip queued for retry');
    if (typeof addToSyncQueue === 'function') addToSyncQueue('slips', slip, '');
    return false;
  }
  // Get user_id — required by RLS policy
  var uid = (typeof getAuthUserId === 'function') ? getAuthUserId() : null;
  if (!uid) {
    // Fallback: use a fixed UUID so RLS allows the insert
    uid = '00000000-0000-0000-0000-000000000001';
  }

  var syncData = {
    client_id: slip.client_id || slip.id,
    user_id: uid,
    date: slip.date,
    day_number: slip.day_number,
    rule: slip.rule,
    category: slip.category,
    function_met: slip.function_met,
    failure_point: slip.failure_point,
    insight: slip.insight,
    upstream_gap: slip.failure_point || 'not specified',
    architectural_state: JSON.stringify(slip.architectural_state),
    penalty: slip.penalty || '20km_walk',
    penalty_status: slip.penalty_status,
    created_at: slip.created_at
  };
  if (slip.parent_slip_id) syncData.parent_slip_id = slip.parent_slip_id;
  if (slip.cascade_level) syncData.cascade_level = slip.cascade_level;

  // POST with return=representation to get DB id
  console.log('[SLIPS] Syncing slip to Supabase...', syncData.client_id);
  fetch(SB.url + '/rest/v1/slips', {
    method: 'POST',
    headers: {
      'apikey': SB.key, 'Authorization': 'Bearer ' + SB._getToken(),
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(syncData)
  }).then(function(res) {
    if (!res.ok) {
      res.text().then(function(t) { console.error('[SLIPS] Supabase write FAILED:', res.status, t); alert('SLIP SYNC FAILED: ' + t); });
      return null;
    }
    return res.json();
  }).then(function(rows) {
    if (rows && rows.length > 0) {
      slip.db_id = rows[0].id;
      // Update this specific slip in localStorage
      var all = getSlips();
      var idx = all.findIndex(function(s) { return s.client_id === slip.client_id || s.id === slip.id; });
      if (idx >= 0) { all[idx].db_id = rows[0].id; saveSlips(all); }
      console.log('[SLIPS] Synced, DB id:', rows[0].id);
    }
  }).catch(function(e) {
    console.error('[SLIPS] Sync error:', e.message);
  });
  return true;
}

function syncSlipProof(slip, proofKm, stravaUrl, stravaActivityId) {
  if (typeof SB === 'undefined' || !SB.init()) return;

  // Match by db_id (best) → client_id (fallback)
  var query;
  if (slip.db_id) {
    query = '?id=eq.' + slip.db_id;
  } else if (slip.client_id) {
    query = '?client_id=eq.' + encodeURIComponent(slip.client_id);
  } else {
    query = '?date=eq.' + slip.date + '&created_at=eq.' + encodeURIComponent(slip.created_at);
  }

  var data = {
    penalty_status: 'cleared',
    proof_km: proofKm,
    proof_strava_url: stravaUrl || null,
    proof_strava_activity_id: stravaActivityId || null,
    proof_url: stravaUrl || 'strava_verified',
    cleared_at: new Date().toISOString()
  };

  fetch(SB.url + '/rest/v1/slips' + query, {
    method: 'PATCH',
    headers: {
      'apikey': SB.key, 'Authorization': 'Bearer ' + SB._getToken(),
      'Content-Type': 'application/json', 'Prefer': 'return=minimal'
    },
    body: JSON.stringify(data)
  }).then(function(res) {
    if (!res.ok) {
      res.text().then(function(t) { console.error('[SLIPS] Proof sync FAILED:', res.status, t); });
      alert('PENALTY CLEAR FAILED. The server rejected the proof. Check console. Error: ' + res.status);
    } else {
      console.log('[SLIPS] Penalty cleared via Strava:', slip.id);
    }
  }).catch(function(e) {
    console.error('[SLIPS] Proof sync error:', e.message);
  });
}

// ══════════════════════════════════════════════════════════════
// PUNISHMENT ROUTE MAP — Interactive Mapbox GL JS
// READ-ONLY: only reads strava_activities. Zero writes. Zero
// impact on immutability triggers or slip table.
// ══════════════════════════════════════════════════════════════

function _smapDecodePolyline(str) {
  var coords = [], idx = 0, lat = 0, lng = 0;
  while (idx < str.length) {
    var b, shift = 0, result = 0;
    do { b = str.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = str.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    coords.push([lng / 1e5, lat / 1e5]);
  }
  return coords;
}

function _smapLoadGL() {
  return new Promise(function(resolve) {
    if (window.mapboxgl) { resolve(); return; }
    if (!document.getElementById('mbgl-css')) {
      var lnk = document.createElement('link');
      lnk.id = 'mbgl-css'; lnk.rel = 'stylesheet';
      lnk.href = 'https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css';
      document.head.appendChild(lnk);
    }
    var s = document.createElement('script');
    s.src = 'https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js';
    s.onload = resolve;
    document.head.appendChild(s);
  });
}

function _smapFmtTime(secs) {
  var h = Math.floor(secs / 3600);
  var m = Math.floor((secs % 3600) / 60);
  var s = Math.floor(secs % 60);
  if (h > 0) return h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

function _smapFmtPace(secs, distKm, type) {
  if (!distKm || distKm <= 0) return '—';
  if (type === 'Ride') return (distKm / (secs / 3600)).toFixed(1) + ' km/h';
  var mpm = (secs / 60) / distKm;
  var m = Math.floor(mpm), sc = Math.round((mpm - m) * 60);
  return m + ':' + (sc < 10 ? '0' : '') + sc + '/km';
}

function _smapCountUp(el, to, dur, fmt) {
  if (!el) return;
  var t0 = null;
  (function step(ts) {
    if (!t0) t0 = ts;
    var p = Math.min((ts - t0) / dur, 1);
    var e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(to * e);
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = fmt(to);
  })(performance.now());
}

function _smapBuildMetrics(act, uid) {
  var distKm = (act.distance || 0) / 1000;
  var type = act.type || 'Walk';
  var typeColor = type === 'Ride' ? '#FC4C02' : type === 'Run' ? '#00E676' : '#00D4FF';
  var dateStr = act.start_date_local ? act.start_date_local.split('T')[0] : '';
  var html = '<div class="smap-metrics">';
  html += '<div class="smap-metric"><span class="smap-mval" id="' + uid + '-dist" style="color:' + typeColor + '">—</span><span class="smap-mlbl">KM</span></div>';
  html += '<div class="smap-metric"><span class="smap-mval" id="' + uid + '-time">—</span><span class="smap-mlbl">TIME</span></div>';
  html += '<div class="smap-metric"><span class="smap-mval" id="' + uid + '-pace">—</span><span class="smap-mlbl">' + (type === 'Ride' ? 'SPEED' : 'PACE') + '</span></div>';
  if (act.total_elevation_gain) html += '<div class="smap-metric"><span class="smap-mval" id="' + uid + '-elev">—</span><span class="smap-mlbl">ELEV ↑</span></div>';
  if (act.calories) html += '<div class="smap-metric"><span class="smap-mval" id="' + uid + '-cal">—</span><span class="smap-mlbl">KCAL</span></div>';
  html += '</div>';
  if (dateStr) {
    var typeEmoji = type === 'Ride' ? '🚴' : type === 'Run' ? '🏃' : '🚶';
    html += '<div class="smap-footer">' + typeEmoji + ' ' + (act.name || type) + ' &nbsp;·&nbsp; ' + dateStr + '</div>';
  }
  return html;
}

function _smapStartCountUp(act, uid) {
  var distKm = (act.distance || 0) / 1000, dur = 1400;
  _smapCountUp(document.getElementById(uid + '-dist'), distKm, dur, function(v) { return v.toFixed(1); });
  var timeEl = document.getElementById(uid + '-time');
  if (timeEl) {
    var t0 = null, total = act.moving_time || 0;
    (function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min((ts - t0) / dur, 1), e = 1 - Math.pow(1 - p, 3);
      timeEl.textContent = _smapFmtTime(Math.floor(total * e));
      if (p < 1) requestAnimationFrame(step); else timeEl.textContent = _smapFmtTime(total);
    })(performance.now());
  }
  var paceEl = document.getElementById(uid + '-pace');
  if (paceEl) paceEl.textContent = _smapFmtPace(act.moving_time, distKm, act.type);
  if (act.total_elevation_gain) _smapCountUp(document.getElementById(uid + '-elev'), act.total_elevation_gain, dur, function(v) { return Math.round(v) + 'm'; });
  if (act.calories) _smapCountUp(document.getElementById(uid + '-cal'), act.calories, dur, function(v) { return Math.round(v) + ''; });
}

async function renderSlipMap(containerId, activityId, slip) {
  var wrap = document.getElementById(containerId);
  if (!wrap || !activityId) return;

  wrap.innerHTML = '<div class="smap-loading"><div class="smap-spinner"></div>Loading route map...</div>';

  try {
    if (typeof sbFetch !== 'function') { wrap.innerHTML = ''; return; }

    var acts = await sbFetch('strava_activities', 'GET', null,
      '?id=eq.' + activityId + '&select=id,name,type,distance,moving_time,total_elevation_gain,calories,summary_polyline,start_date_local,average_speed&limit=1');

    if (!acts || !acts[0]) { wrap.innerHTML = ''; return; }
    var act = acts[0];
    if (slip && slip.proof_strava_url) act._stravaUrl = slip.proof_strava_url;

    var type = act.type || 'Walk';
    var typeColor = type === 'Ride' ? '#FC4C02' : type === 'Run' ? '#00E676' : '#00D4FF';
    var typeEmoji = type === 'Ride' ? '🚴' : type === 'Run' ? '🏃' : '🚶';
    var uid = 'sm' + activityId;

    if (!act.summary_polyline) {
      wrap.innerHTML = '<div class="smap-no-route">📍 No GPS route (indoor or privacy zone activity)</div>' + _smapBuildMetrics(act, uid);
      setTimeout(function() { _smapStartCountUp(act, uid); }, 200);
      return;
    }

    var coords = _smapDecodePolyline(act.summary_polyline);
    if (!coords || coords.length < 2) { wrap.innerHTML = ''; return; }

    await _smapLoadGL();

    wrap.innerHTML =
      '<div class="smap-inner">' +
        '<div id="' + uid + '-canvas" class="smap-canvas"></div>' +
        '<div id="' + uid + '-stamp" class="smap-stamp">PUNISHMENT<br>SERVED</div>' +
        '<div class="smap-badge" style="background:' + typeColor + '18;color:' + typeColor + ';border-color:' + typeColor + '44">' + typeEmoji + ' ' + type.toUpperCase() + '</div>' +
      '</div>' +
      _smapBuildMetrics(act, uid);

    mapboxgl.accessToken = (window.FL && window.FL.MAPBOX_TOKEN) ? window.FL.MAPBOX_TOKEN : '';
    // Disable Mapbox telemetry to avoid CSP issues
    if (mapboxgl.config) mapboxgl.config.EVENTS_URL = null;

    var map = new mapboxgl.Map({
      container: uid + '-canvas',
      style: 'mapbox://styles/mapbox/dark-v11',
      center: coords[0],
      zoom: 13,
      interactive: true,
      attributionControl: false
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new mapboxgl.FullscreenControl(), 'top-right');

    map.on('load', function() {
      // Fit to route bounds
      var lngs = coords.map(function(c) { return c[0]; });
      var lats = coords.map(function(c) { return c[1]; });
      map.fitBounds(
        [[Math.min.apply(null, lngs), Math.min.apply(null, lats)],
         [Math.max.apply(null, lngs), Math.max.apply(null, lats)]],
        { padding: 50, duration: 0 }
      );

      // Ghost — full dim path (shows route immediately)
      map.addSource('ghost-' + uid, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } });
      map.addLayer({ id: 'ghost-' + uid, type: 'line', source: 'ghost-' + uid,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': typeColor, 'line-width': 2, 'line-opacity': 0.18 }
      });

      // Animated route source
      map.addSource('route-' + uid, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [coords[0]] } } });

      // Glow layer
      map.addLayer({ id: 'glow-' + uid, type: 'line', source: 'route-' + uid,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': typeColor, 'line-width': 14, 'line-opacity': 0.1, 'line-blur': 8 }
      });

      // Main route line
      map.addLayer({ id: 'route-' + uid, type: 'line', source: 'route-' + uid,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': typeColor, 'line-width': 4, 'line-opacity': 1 }
      });

      // Start marker (green pulse)
      var sEl = document.createElement('div'); sEl.className = 'smap-marker smap-marker-start';
      new mapboxgl.Marker({ element: sEl, anchor: 'center' }).setLngLat(coords[0]).addTo(map);

      // Animate route drawing
      var t0 = null;
      var animDur = Math.max(1600, Math.min(3200, coords.length * 5));

      (function animateRoute(ts) {
        if (!t0) t0 = ts;
        var p = Math.min((ts - t0) / animDur, 1);
        var eased = 1 - Math.pow(1 - p, 2.5);
        var count = Math.max(2, Math.floor(eased * coords.length));
        map.getSource('route-' + uid).setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords.slice(0, count) } });

        if (p < 1) {
          requestAnimationFrame(animateRoute);
        } else {
          // End marker (red pulse)
          var eEl = document.createElement('div'); eEl.className = 'smap-marker smap-marker-end';
          new mapboxgl.Marker({ element: eEl, anchor: 'center' }).setLngLat(coords[coords.length - 1]).addTo(map);

          // Stamp reveal
          var stamp = document.getElementById(uid + '-stamp');
          if (stamp) { stamp.style.opacity = '1'; stamp.style.transform = 'rotate(-14deg) translate(-50%,-50%) scale(1)'; }

          // Metrics count-up
          _smapStartCountUp(act, uid);
        }
      })(performance.now());
    });

    map.on('error', function(e) { console.warn('[SlipMap]', e.error); });

  } catch(e) {
    console.error('[SlipMap]', e);
    if (wrap) wrap.innerHTML = '';
  }
}

function syncArchEntry(entry) {
  if (typeof sbFetch !== 'function' || (typeof SB !== 'undefined' && !SB.init())) return;
  sbFetch('architecture_log', 'POST', {
    id: entry.id,
    date: entry.date,
    source: entry.source,
    slip_id: entry.slip_id,
    observation: entry.observation,
    hypothesis: entry.hypothesis || '',
    proposed_change: entry.proposed_change || '',
    status: entry.status,
    created_at: entry.created_at
  }, '?on_conflict=id');
}
 
