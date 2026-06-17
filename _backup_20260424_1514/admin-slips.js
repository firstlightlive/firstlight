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

// ── DATA ──

function getSlips() {
  try { return JSON.parse(localStorage.getItem('fl_slips') || '[]'); } catch (e) { return []; }
}

function saveSlips(slips) {
  localStorage.setItem('fl_slips', JSON.stringify(slips));
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

  // Penalty
  html += '<div style="background:rgba(231,76,60,0.1);border:1px solid var(--red,#e74c3c);border-radius:8px;padding:12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">';
  html += '<span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);letter-spacing:1px">PENALTY ASSIGNED</span>';
  html += '<span style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--red,#e74c3c)">20 KM WALK</span>';
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
  if (!sel || !warn) return;
  var cat = sel.value;
  if (cat === 'brahmacharya_gate') {
    warn.style.display = 'block';
    warn.innerHTML = '⚠ ENHANCED PENALTY: 50km walk + 5km run OR 100km cycling<br><span style="font-size:9px;color:var(--text-dim)">This cannot be undone. The penalty is permanent and must be cleared with proof.</span>';
  } else {
    warn.style.display = 'none';
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

  var slip = {
    id: 'slip_' + Date.now(),
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
    penalty_proof_url: null,
    penalty_km: null,
    strava_url: null,
    created_at: new Date().toISOString()
  };

  // Save to localStorage
  var slips = getSlips();
  slips.push(slip);
  saveSlips(slips);
  if (typeof syncSave === 'function') {
    syncSave('slips', slip, 'id');
  }

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

  // Sync
  syncSlip(slip);
  syncArchEntry(archEntry);

  markSaved();
  alert('Slip logged. This is now permanent and public.');

  // Reset form
  _selectedSlipRule = '';
  renderSlipLog();
}

// ── RENDER SLIP HISTORY ──

function renderSlipHistory() {
  var c = document.getElementById('slip-history-container');
  if (!c) return;

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

    // Proof section
    if (!isPending && slip.penalty_proof_url) {
      html += '<div style="display:flex;align-items:center;gap:8px;font-family:var(--font-mono);font-size:11px;color:var(--green,#2ecc71)">';
      html += '<img src="' + slip.penalty_proof_url + '" style="width:40px;height:40px;object-fit:cover;border-radius:4px;border:1px solid var(--border)">';
      html += '<span>' + (slip.penalty_km || 20) + ' km completed</span>';
      if (slip.strava_url) html += ' <a href="' + slip.strava_url + '" target="_blank" style="color:var(--accent,#fc4c02)">Strava</a>';
      html += '</div>';
    } else if (isPending) {
      html += '<button onclick="uploadSlipProof(' + realIdx + ')" class="btn-copy" style="font-size:10px;padding:6px 12px;border-color:var(--red,#e74c3c);color:var(--red,#e74c3c)">UPLOAD PROOF</button>';
    }

    // NO delete. NO edit. NO hide.
    html += '</div>';
  });

  c.innerHTML = html;
}

function filterSlipHistory(val) {
  var c = document.getElementById('slip-history-container');
  if (c) c.dataset.filter = val;
  renderSlipHistory();
}

// ── UPLOAD SLIP PROOF ──

function uploadSlipProof(slipIndex) {
  var c = document.getElementById('slip-history-container');
  if (!c) return;
  var slips = getSlips();
  var slip = slips[slipIndex];
  if (!slip) return;

  var html = '';
  html += '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:16px">';
  html += '<div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--text);margin-bottom:4px">UPLOAD PENALTY PROOF</div>';
  html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-bottom:12px">Slip: ' + slip.date + ' — ' + (SLIP_RULES[slip.rule] ? SLIP_RULES[slip.rule].label : slip.rule) + '</div>';

  html += '<label style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);letter-spacing:1px">SCREENSHOT (Watch / Garmin / Strava)</label>';
  html += '<input type="file" id="slip-proof-file" accept="image/*" style="width:100%;margin:4px 0 12px;font-family:var(--font-mono);font-size:11px;color:var(--text)">';

  var isBrahma = slip.category === 'brahmacharya_gate';
  var minKm = isBrahma ? 50 : 20;
  var penaltyDesc = isBrahma ? '50km walk + 5km run OR 100km cycling' : '20km walk';
  html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--red);margin-bottom:8px;letter-spacing:0.5px">PENALTY: ' + penaltyDesc + '</div>';
  html += '<label style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);letter-spacing:1px">TOTAL KM COMPLETED (must be ' + minKm + '+)</label>';
  html += '<input type="number" id="slip-proof-km" min="' + minKm + '" step="0.1" placeholder="' + minKm + '" data-min-km="' + minKm + '" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--text);font-family:var(--font-mono);font-size:12px;margin:4px 0 12px;box-sizing:border-box">';

  html += '<label style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);letter-spacing:1px">STRAVA ACTIVITY URL (optional)</label>';
  html += '<input type="url" id="slip-proof-strava" placeholder="https://strava.com/activities/..." style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--text);font-family:var(--font-mono);font-size:12px;margin:4px 0 16px;box-sizing:border-box">';

  html += '<div style="display:flex;gap:8px">';
  html += '<button onclick="submitSlipProof(' + slipIndex + ')" class="btn-primary" style="flex:1;font-size:11px">SUBMIT PROOF</button>';
  html += '<button onclick="renderSlipHistory()" class="btn-copy" style="font-size:11px">CANCEL</button>';
  html += '</div>';
  html += '</div>';

  c.innerHTML = html;
}

function submitSlipProof(slipIndex) {
  var kmInput = document.getElementById('slip-proof-km');
  var km = parseFloat(kmInput.value);
  var minKm = parseInt(kmInput.dataset.minKm) || 20;
  if (!km || km < minKm) { alert('Minimum ' + minKm + ' km required for penalty clearance.'); return; }

  var fileInput = document.getElementById('slip-proof-file');
  var stravaUrl = document.getElementById('slip-proof-strava').value.trim();

  if (!fileInput.files || !fileInput.files[0]) { alert('Upload a screenshot as proof.'); return; }

  var reader = new FileReader();
  reader.onload = function(e) {
    var proofUrl = e.target.result; // data URL

    var slips = getSlips();
    var slip = slips[slipIndex];
    if (!slip) return;

    slip.penalty_status = 'cleared';
    slip.penalty_proof_url = proofUrl;
    slip.penalty_km = km;
    slip.strava_url = stravaUrl || null;
    slip.cleared_at = new Date().toISOString();

    saveSlips(slips);
    if (typeof syncSave === 'function') {
      syncSave('slips', slip, 'id');
    }
    syncSlipProof(slip.id, proofUrl, km, stravaUrl);
    markSaved();
    renderSlipHistory();
  };
  reader.readAsDataURL(fileInput.files[0]);
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
  if (typeof sbFetch !== 'function' || (typeof SB !== 'undefined' && !SB.init())) return;
  sbFetch('slips', 'POST', {
    id: slip.id,
    date: slip.date,
    day_number: slip.day_number,
    rule: slip.rule,
    category: slip.category,
    function_met: slip.function_met,
    failure_point: slip.failure_point,
    insight: slip.insight,
    architectural_state: JSON.stringify(slip.architectural_state),
    penalty: slip.penalty,
    penalty_status: slip.penalty_status,
    created_at: slip.created_at
  });
}

function syncSlipProof(slipId, proofUrl, proofKm, stravaUrl) {
  if (typeof sbFetch !== 'function' || (typeof SB !== 'undefined' && !SB.init())) return;
  sbFetch('slips', 'PATCH', {
    penalty_status: 'cleared',
    penalty_proof_url: proofUrl,
    penalty_km: proofKm,
    strava_url: stravaUrl || null,
    cleared_at: new Date().toISOString()
  }, '?id=eq.' + slipId);
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
