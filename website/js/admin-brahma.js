// ═══════════════════════════════════════════
// FIRST LIGHT — BRAHMACHARYA
// ═══════════════════════════════════════════

// BRAHMACHARYA FORTRESS — Complete Implementation
// ══════════════════════════════════════════════════════

// ── AUTH GATE (Supabase Auth replaces PIN) ──
function requireBrahmaPin(callback) {
  // PIN gate removed — Supabase Auth protects all admin panels
  callback(); return;
  // Legacy PIN code below kept for reference but never executes
  var _brahmaUnlocked = true; if (_brahmaUnlocked) { callback(); return; }
  // Build overlay
  var existing = document.getElementById('brahma-pin-overlay');
  if (existing) existing.remove();
  var ov = document.createElement('div');
  ov.id = 'brahma-pin-overlay';
  ov.className = 'bf-pin-overlay';
  ov.innerHTML = '<div class="bf-pin-box">' +
'<div style="font-size:48px;margin-bottom:16px">🏰</div>' +
'<div style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:var(--brahma);letter-spacing:3px;margin-bottom:8px">BRAHMACHARYA FORTRESS</div>' +
'<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-bottom:24px">Enter PIN to access</div>' +
'<div class="bf-pin-input">' +
  '<input type="password" class="bf-pin-digit" maxlength="1" data-idx="0" inputmode="numeric">' +
  '<input type="password" class="bf-pin-digit" maxlength="1" data-idx="1" inputmode="numeric">' +
  '<input type="password" class="bf-pin-digit" maxlength="1" data-idx="2" inputmode="numeric">' +
  '<input type="password" class="bf-pin-digit" maxlength="1" data-idx="3" inputmode="numeric">' +
'</div>' +
'<div id="brahma-pin-error" style="font-family:var(--font-mono);font-size:11px;color:var(--brahma);min-height:20px"></div>' +
'<button class="btn-copy" style="margin-top:12px" onclick="switchPanel(\'dashboard\');document.getElementById(\'brahma-pin-overlay\').remove()">CANCEL</button>' +
  '</div>';
  document.body.appendChild(ov);
  var digits = ov.querySelectorAll('.bf-pin-digit');
  digits[0].focus();
  var _cb = callback;
  digits.forEach(function(d, i) {
d.addEventListener('input', function() {
  if (d.value && i < 3) digits[i + 1].focus();
  if (i === 3 && d.value) {
    var pin = '';
    digits.forEach(function(dd) { pin += dd.value; });
    if (false) { // Legacy PIN removed — Supabase Auth handles access
      _brahmaUnlocked = true;
      ov.remove();
      _cb();
    } else {
      document.getElementById('brahma-pin-error').textContent = 'ACCESS DENIED';
      digits.forEach(function(dd) { dd.value = ''; });
      digits[0].focus();
    }
  }
});
d.addEventListener('keydown', function(e) {
  if (e.key === 'Backspace' && !d.value && i > 0) { digits[i - 1].focus(); digits[i - 1].value = ''; }
  if (e.key === 'Escape') { switchPanel('dashboard'); ov.remove(); }
});
  });
}

// ── DATA HELPERS ──
function getBrahmaDaily(date) {
  try { return JSON.parse(localStorage.getItem('fl_brahma_daily_' + date) || '{}'); } catch(e) { return {}; }
}
function getBrahmaWeekly(weekDate) {
  try { return JSON.parse(localStorage.getItem('fl_brahma_weekly_' + weekDate) || '{}'); } catch(e) { return {}; }
}
function getBrahmaMonthly(month) {
  try { return JSON.parse(localStorage.getItem('fl_brahma_monthly_' + month) || '{}'); } catch(e) { return {}; }
}
function getBrahmaConfig() {
  try { return JSON.parse(localStorage.getItem('fl_brahma_config') || '{"avg_hours_per_relapse":2}'); } catch(e) { return {avg_hours_per_relapse:2}; }
}
function saveBrahmaConfig() {
  var hrs = parseFloat(document.getElementById('brahmaAvgHrs').value) || 2;
  localStorage.setItem('fl_brahma_config', JSON.stringify({avg_hours_per_relapse: hrs}));
  markSaved();
}

function isCleanDay(data) {
  return !(data.porn === true || data.sexual === true || data.masturbate === true);
}

var _brahmaTimer = null;
function saveBrahmaDaily(date, items) {
  localStorage.setItem('fl_brahma_daily_' + date, JSON.stringify(items));
  if (typeof syncSave === 'function') {
    syncSave('brahma_log', { date: date, data: JSON.stringify(items) }, 'date');
  }
  _brahmaStatsCache = null; // Invalidate cache
  syncBrahmaDaily(date, items, isCleanDay(items), items.urge || 0);
  // Update status badge
  var s = document.getElementById('brahma-status');
  if (s) { var clean = isCleanDay(items); s.textContent = clean ? 'CLEAN' : 'RELAPSE'; s.style.color = clean ? 'var(--green)' : 'var(--brahma)'; }
  markSaved();
}

// ── DATE NAVIGATION ──
function brahmaDateNav(dir) {
  var el = document.getElementById('brahmaDate');
  if (dir === 0) { el.value = getEffectiveToday(); }
  else { var d = new Date(el.value); d.setDate(d.getDate() + dir); el.value = (d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')); }
  renderBrahmaDaily();
}

// ── CHECK IF DATE IS TODAY (only today is editable) ──
function isBrahmaEditable(date) {
  return !isDateLocked(date);
}

// ── RENDER DAILY LOG — Fortress V2 ──
function renderBrahmaDaily() {
  var dateEl = document.getElementById('brahmaDate');
  if (!dateEl.value) dateEl.value = getEffectiveToday();
  var date = dateEl.value;
  var data = getBrahmaDaily(date);
  var container = document.getElementById('brahma-daily-container');
  var editable = isBrahmaEditable(date);

  var clean = isCleanDay(data);
  var s = document.getElementById('brahma-status');
  if (s) { s.textContent = clean ? 'CLEAN' : 'RELAPSE'; s.style.color = clean ? 'var(--green)' : 'var(--brahma)'; }
  var streak = computeBrahmaStreak();
  var badge = document.getElementById('brahma-streak-badge');
  if (badge) badge.textContent = 'STREAK: ' + streak.currentStreak + ' DAYS';

  // ── RULE STATES ──
  var purityHeld  = !(data.porn === true || data.masturbate === true);
  var purityLogged = data.porn !== undefined || data.masturbate !== undefined;

  var brahmaHeld  = data.brahma_held !== undefined ? data.brahma_held : !(data.sexual === true);
  var brahmaLogged = data.brahma_held !== undefined || data.sexual !== undefined;

  var citadelHeld  = !(data.phone_out === false || data.device_free === false || data.laptop_out === false);
  var citadelLogged = data.device_free !== undefined || data.phone_out !== undefined;

  var isSunday     = new Date(date).getDay() === 0;
  var perimHeld    = data.stayed_out === true;
  var perimLogged  = data.stayed_out !== undefined;

  var vigilHeld    = data.woke_3am === true;
  var vigilLogged  = data.woke_3am !== undefined;

  var chronHeld    = data.journal_written === true;
  var chronLogged  = data.journal_written !== undefined;

  var templeHeld   = data.food_rules !== false;
  var templeLogged = data.food_rules !== undefined;

  var RULES = [
    { key:'purity',    icon:'🔥', name:'PURITY',       sub:'No porn · No masturbation',          col:'255,68,68',   hex:'#FF5252', held: purityLogged  ? purityHeld  : null },
    { key:'brahma',    icon:'⚡', name:'BRAHMACHARYA', sub:'Mental energy · No sexual media',     col:'255,183,77',  hex:'#FFB74D', held: brahmaLogged  ? brahmaHeld  : null },
    { key:'citadel',   icon:'📵', name:'CITADEL',      sub:'No phone or device at home',          col:'0,212,255',   hex:'#00D4FF', held: citadelLogged ? citadelHeld : null },
    { key:'perimeter', icon:'🏠', name:'PERIMETER',    sub: isSunday ? 'Stay out until 1 PM' : 'Stay out until 6 PM', col:'38,198,218', hex:'#26C6DA', held: perimLogged  ? perimHeld  : null },
    { key:'vigil',     icon:'🌙', name:'VIGIL',        sub:'Woke up at 3:00 AM sharp',            col:'206,147,216', hex:'#CE93D8', held: vigilLogged   ? vigilHeld   : null },
    { key:'chronicle', icon:'📖', name:'CHRONICLE',    sub:'Daily journal entry written',         col:'0,230,118',   hex:'#00E676', held: chronLogged   ? chronHeld   : null },
    { key:'temple',    icon:'🌿', name:'TEMPLE',       sub:'All food rules honored',              col:'245,166,35',  hex:'#F5A623', held: templeLogged  ? templeHeld  : null }
  ];

  var heldCount    = RULES.filter(function(r) { return r.held === true;  }).length;
  var loggedCount  = RULES.filter(function(r) { return r.held !== null;  }).length;
  var totalRules   = RULES.length;
  var html = '';

  // ── LOCKED BANNER ──
  if (!editable) {
    html += '<div class="bfv2-locked"><span style="font-size:20px">🔒</span><div>';
    html += '<div class="bfv2-locked-title">LEDGER LOCKED — READ ONLY</div>';
    html += '<div class="bfv2-locked-sub">History cannot be rewritten. This is a permanent record.</div>';
    html += '</div></div>';
  }

  // ── FORTRESS SCORE CARD ──
  var scoreCol  = loggedCount === 0 ? 'rgba(255,255,255,0.2)' :
    heldCount === totalRules ? '#00E676' :
    heldCount >= totalRules - 2 ? '#F5A623' : '#FF5252';
  var scoreGlow = loggedCount === 0 ? 'transparent' :
    heldCount === totalRules ? 'rgba(0,230,118,0.18)' :
    heldCount >= totalRules - 2 ? 'rgba(245,166,35,0.12)' : 'rgba(255,68,68,0.14)';
  var scoreLabel = loggedCount === 0 ? 'AWAITING DAILY LOG' :
    heldCount === totalRules ? 'FORTRESS UNBREACHED' :
    heldCount + ' / ' + totalRules + ' WALLS HOLDING';

  html += '<div class="bfv2-score" style="box-shadow:0 0 80px ' + scoreGlow + '">';
  html += '<div class="bfv2-score-eye">' + date + ' · FORTRESS STATUS</div>';
  html += '<div class="bfv2-score-dots">';
  RULES.forEach(function(r) {
    var dBg  = r.held === null ? 'rgba(255,255,255,0.04)' : r.held ? 'rgba(' + r.col + ',0.14)' : 'rgba(255,68,68,0.1)';
    var dBdr = r.held === null ? 'rgba(255,255,255,0.1)'  : r.held ? r.hex : '#FF5252';
    var glyph = r.held === null ? '·' : r.held ? '✓' : '✗';
    var gCol  = r.held === null ? 'rgba(255,255,255,0.2)' : r.held ? r.hex : '#FF5252';
    html += '<div class="bfv2-sdot" style="background:' + dBg + ';border-color:' + dBdr + '" title="' + r.name + '">';
    html += '<span style="font-size:15px">' + r.icon + '</span>';
    html += '<span style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:' + gCol + '">' + glyph + '</span>';
    html += '</div>';
  });
  html += '</div>';
  html += '<div class="bfv2-score-main" style="color:' + scoreCol + '">' + scoreLabel + '</div>';
  if (loggedCount > 0) {
    var breached = RULES.filter(function(r) { return r.held === false; }).map(function(r) { return r.name; });
    if (breached.length) html += '<div class="bfv2-score-breach">BREACHED: ' + breached.join(' · ') + '</div>';
    if (heldCount === totalRules) html += '<div class="bfv2-score-clean">All ' + totalRules + ' fortress walls intact. Elite discipline.</div>';
  }
  html += '</div>';

  // ── RULE CARDS GRID ──
  html += '<div class="bfv2-grid">';
  RULES.forEach(function(r) {
    var cBdr  = r.held === null ? 'rgba(255,255,255,0.07)' : r.held ? 'rgba(' + r.col + ',0.22)' : 'rgba(255,68,68,0.22)';
    var cBg   = r.held === null ? 'rgba(255,255,255,0.01)' : r.held ? 'rgba(' + r.col + ',0.04)' : 'rgba(255,68,68,0.04)';
    var cGlow = r.held === false ? '0 8px 32px rgba(255,68,68,0.09)' : r.held ? '0 8px 32px rgba(' + r.col + ',0.07)' : 'none';
    var stTxt = r.held === null ? 'LOG IT' : r.held ? 'HELD' : 'BREACHED';
    var stCol = r.held === null ? 'rgba(255,255,255,0.22)' : r.held ? r.hex : '#FF5252';
    html += '<div class="bfv2-card" style="background:' + cBg + ';border-color:' + cBdr + ';box-shadow:' + cGlow + '">';
    html += '<div class="bfv2-card-top"><span class="bfv2-icon">' + r.icon + '</span>';
    html += '<div><div class="bfv2-name">' + r.name + '</div><div class="bfv2-sub">' + r.sub + '</div></div></div>';
    html += '<div class="bfv2-status" style="color:' + stCol + '">' + stTxt + '</div>';
    if (editable) {
      var hA = r.held === true  ? 'style="background:rgba(' + r.col + ',0.14);border-color:' + r.hex + ';color:' + r.hex + '"' : '';
      var bA = r.held === false ? 'style="background:rgba(255,68,68,0.12);border-color:#FF5252;color:#FF5252"' : '';
      html += '<div class="bfv2-btns">';
      html += '<button class="bfv2-btn" ' + hA + ' onclick="bfSetRule(\'' + date + '\',\'' + r.key + '\',true)">✓ HELD</button>';
      html += '<button class="bfv2-btn" ' + bA + ' onclick="bfSetRule(\'' + date + '\',\'' + r.key + '\',false)">✗ BREACH</button>';
      html += '</div>';
    }
    html += '</div>';
  });
  html += '</div>';

  // ── DETAIL SECTIONS ──

  // PURITY — breach specifics (only show when logged)
  if (purityLogged) {
    html += '<div class="panel-section" style="border-color:rgba(255,68,68,0.12)">';
    html += '<div class="bfv2-detail-hdr" style="color:#FF5252">🔥 PURITY — BREACH DETAIL</div>';
    var dLock = editable ? '' : 'opacity:0.5;pointer-events:none;';
    html += '<div class="bfv2-detail-row" style="' + dLock + '">';
    html += '<div class="bfv2-detail-label">WATCHED PORN?</div>';
    html += '<div class="bf-toggle">';
    html += '<div class="bf-toggle-btn' + (data.porn === false ? ' active-no' : '') + '" onclick="setBrahmaYN(\'' + date + '\',\'porn\',false)">NO</div>';
    html += '<div class="bf-toggle-btn' + (data.porn === true  ? ' active-yes': '') + '" onclick="setBrahmaYN(\'' + date + '\',\'porn\',true)">YES</div>';
    html += '</div></div>';
    html += '<div class="bfv2-detail-row" style="margin-top:10px;' + dLock + '">';
    html += '<div class="bfv2-detail-label">MASTURBATED?</div>';
    html += '<div class="bf-toggle">';
    html += '<div class="bf-toggle-btn' + (data.masturbate === false ? ' active-no' : '') + '" onclick="setBrahmaYN(\'' + date + '\',\'masturbate\',false)">NO</div>';
    html += '<div class="bf-toggle-btn' + (data.masturbate === true  ? ' active-yes': '') + '" onclick="setBrahmaYN(\'' + date + '\',\'masturbate\',true)">YES</div>';
    html += '</div></div>';
    if (data.porn === true && editable) {
      html += '<div style="margin-top:12px"><div class="bfv2-detail-label">SEVERITY (1–5)</div><div class="bf-severity" style="margin-top:6px">';
      for (var sv = 1; sv <= 5; sv++) html += '<div class="bf-sev-btn' + (data.porn_severity === sv ? ' active' : '') + '" onclick="setBrahmaSeverity(\'' + date + '\',' + sv + ')">' + sv + '</div>';
      html += '</div></div>';
    }
    html += '</div>';
  }

  // BRAHMACHARYA — urge + clarity sliders
  html += '<div class="panel-section" style="border-color:rgba(255,183,77,0.12)">';
  html += '<div class="bfv2-detail-hdr" style="color:#FFB74D">⚡ BRAHMACHARYA — ENERGY AUDIT</div>';
  var disAttr = editable ? '' : ' disabled';
  html += '<div class="bfv2-slider-row"><div class="bfv2-detail-label">URGE LEVEL TODAY</div>';
  html += '<div class="bfv2-slider-val" id="bfv2-urge-val">' + (data.urge || 0) + '<span>/10</span></div></div>';
  html += '<input type="range" min="0" max="10" value="' + (data.urge || 0) + '" style="width:100%;accent-color:#FFB74D;margin-bottom:16px"' + disAttr;
  html += ' oninput="setBrahmaField(\'' + date + '\',\'urge\',parseInt(this.value));var v=document.getElementById(\'bfv2-urge-val\');if(v)v.childNodes[0].textContent=this.value">';
  html += '<div class="bfv2-slider-row"><div class="bfv2-detail-label">ENERGY & CLARITY</div>';
  html += '<div class="bfv2-slider-val bfv2-clarity" id="bfv2-clarity-val">' + (data.clarity || 0) + '<span>/10</span></div></div>';
  html += '<input type="range" min="0" max="10" value="' + (data.clarity || 0) + '" style="width:100%;accent-color:var(--green)"' + disAttr;
  html += ' oninput="setBrahmaField(\'' + date + '\',\'clarity\',parseInt(this.value));var v=document.getElementById(\'bfv2-clarity-val\');if(v)v.childNodes[0].textContent=this.value">';
  html += '</div>';

  // Daily reflection
  html += '<div class="panel-section" style="border-color:rgba(255,255,255,0.06)">';
  html += '<div class="bfv2-detail-hdr">📝 DAILY REFLECTION & TRIGGERS</div>';
  html += '<textarea class="form-input" rows="4" style="font-size:12px;border-color:rgba(255,255,255,0.08);resize:vertical" placeholder="Trigger journal — what challenged you? What will you do differently?"' + (editable ? '' : ' readonly');
  html += ' oninput="setBrahmaField(\'' + date + '\',\'trigger_text\',this.value)">' + (data.trigger_text || '') + '</textarea>';
  html += '</div>';

  // CHRONICLE — journal notes
  html += '<div class="panel-section" style="border-color:rgba(0,230,118,0.1)">';
  html += '<div class="bfv2-detail-hdr" style="color:#00E676">📖 CHRONICLE — JOURNAL NOTES</div>';
  html += '<textarea class="form-input" rows="3" style="font-size:12px;border-color:rgba(0,230,118,0.1);resize:vertical" placeholder="Key insight from today\'s journal entry..."' + (editable ? '' : ' readonly');
  html += ' oninput="setBrahmaField(\'' + date + '\',\'journal_notes\',this.value)">' + (data.journal_notes || '') + '</textarea>';
  html += '</div>';

  // TEMPLE — food log
  html += '<div class="panel-section" style="border-color:rgba(245,166,35,0.1)">';
  html += '<div class="bfv2-detail-hdr" style="color:#F5A623">🌿 TEMPLE — FOOD LOG</div>';
  html += '<textarea class="form-input" rows="3" style="font-size:12px;border-color:rgba(245,166,35,0.1);resize:vertical" placeholder="What did you eat? Any food rule broken? Be specific..."' + (editable ? '' : ' readonly');
  html += ' oninput="setBrahmaField(\'' + date + '\',\'food_notes\',this.value)">' + (data.food_notes || '') + '</textarea>';
  html += '</div>';

  container.innerHTML = html;
  container.querySelectorAll('input, textarea').forEach(function(el) { el.addEventListener('click', function(e) { e.stopPropagation(); }); });
}

// ── FORTRESS RULE DISPATCH ──
function bfSetRule(date, ruleKey, held) {
  if (!isBrahmaEditable(date)) { alert('This day is locked. The ledger cannot be rewritten.'); return; }
  var data = getBrahmaDaily(date);
  switch (ruleKey) {
    case 'purity':    data.porn = held ? false : true; data.masturbate = held ? false : true; break;
    case 'brahma':    data.brahma_held = held; data.sexual = held ? false : true; break;
    case 'citadel':   data.device_free = held; data.phone_out = held; data.laptop_out = held; break;
    case 'perimeter': data.stayed_out = held; break;
    case 'vigil':     data.woke_3am = held; break;
    case 'chronicle': data.journal_written = held; break;
    case 'temple':    data.food_rules = held; break;
  }
  saveBrahmaDaily(date, data);
  renderBrahmaDaily();
}

function setBrahmaYN(date, field, value) {
  if (!isBrahmaEditable(date)) { alert('This day is locked. The ledger cannot be rewritten.'); return; }
  var data = getBrahmaDaily(date);
  data[field] = value;
  saveBrahmaDaily(date, data);
  renderBrahmaDaily();
}

function setBrahmaSeverity(date, value) {
  if (!isBrahmaEditable(date)) return;
  var data = getBrahmaDaily(date);
  data.porn_severity = value;
  saveBrahmaDaily(date, data);
  renderBrahmaDaily();
}

function setBrahmaField(date, field, value) {
  if (!isBrahmaEditable(date)) return;
  var data = getBrahmaDaily(date);
  data[field] = value;
  clearTimeout(_brahmaTimer);
  _brahmaTimer = setTimeout(function() { saveBrahmaDaily(date, data); }, 500);
}

// ── STREAK CALCULATOR ──
var _brahmaStatsCache = null;
var _brahmaStatsCacheTime = 0;
var _BRAHMA_CACHE_TTL = 5000; // 5 second cache

function computeBrahmaStreak(forceRefresh) {
  // Return cached result if fresh (avoids iterating all localStorage keys on every call)
  var now = Date.now();
  if (!forceRefresh && _brahmaStatsCache && (now - _brahmaStatsCacheTime < _BRAHMA_CACHE_TTL)) return _brahmaStatsCache;

  var allDays = [];
  var epoch = (typeof STREAK_EPOCH !== 'undefined') ? STREAK_EPOCH : '2026-04-19';
  for (var i = 0; i < localStorage.length; i++) {
var key = localStorage.key(i);
if (key && key.startsWith('fl_brahma_daily_')) {
  var date = key.replace('fl_brahma_daily_', '');
  if (date < epoch) continue; // Don't count before epoch
  var data = getBrahmaDaily(date);
  allDays.push({ date: date, isClean: isCleanDay(data), data: data });
}
  }
  allDays.sort(function(a, b) { return b.date.localeCompare(a.date); });

  var currentStreak = 0, longestStreak = 0, totalRelapses = 0, totalDays = allDays.length;
  var totalUrge = 0, urgeCount = 0;

  for (var s = 0; s < allDays.length; s++) {
if (allDays[s].isClean) currentStreak++;
else break;
  }

  var tempStreak = 0;
  allDays.slice().reverse().forEach(function(day) {
if (day.isClean) { tempStreak++; longestStreak = Math.max(longestStreak, tempStreak); }
else { tempStreak = 0; totalRelapses++; }
if (day.data.urge) { totalUrge += day.data.urge; urgeCount++; }
  });

  _brahmaStatsCache = {
currentStreak: currentStreak, longestStreak: longestStreak,
totalRelapses: totalRelapses, totalDays: totalDays,
cleanPct: totalDays > 0 ? Math.round((totalDays - totalRelapses) / totalDays * 100) : 0,
avgUrge: urgeCount > 0 ? (totalUrge / urgeCount).toFixed(1) : '—',
allDays: allDays
  };
  _brahmaStatsCacheTime = now;
  return _brahmaStatsCache;
}

// ── TRIGGER PATTERN ANALYSIS ──
function analyzeBrahmaPatterns(allDays) {
  var dayOfWeek = [0,0,0,0,0,0,0];
  var triggerKeywords = {};
  var KEYWORDS = ['loneliness','lonely','stress','stressed','bored','boredom','tired',
'late night','alone','anxious','anxiety','sad','angry','weekend','night','phone','instagram','social media'];
  var relapseUrge = 0, relapseCount = 0, cleanUrge = 0, cleanCount = 0;

  allDays.forEach(function(day) {
if (!day.isClean) {
  var d = new Date(day.date); dayOfWeek[d.getDay()]++;
}
var text = ((day.data.trigger_text || '') + '').toLowerCase();
if (text) {
  KEYWORDS.forEach(function(kw) { if (text.indexOf(kw) >= 0) triggerKeywords[kw] = (triggerKeywords[kw] || 0) + 1; });
}
if (day.data.urge) {
  if (day.isClean) { cleanUrge += day.data.urge; cleanCount++; }
  else { relapseUrge += day.data.urge; relapseCount++; }
}
  });

  var topTriggers = Object.keys(triggerKeywords).map(function(k) { return [k, triggerKeywords[k]]; })
.sort(function(a,b) { return b[1] - a[1]; }).slice(0, 5);

  return {
dayOfWeek: dayOfWeek, topTriggers: topTriggers,
avgUrgeRelapse: relapseCount > 0 ? (relapseUrge / relapseCount).toFixed(1) : '—',
avgUrgeClean: cleanCount > 0 ? (cleanUrge / cleanCount).toFixed(1) : '—'
  };
}

// ── THE WAR ROOM ──
function buildBrahmaAnalytics() {
  var stats = computeBrahmaStreak();
  var cfg = getBrahmaConfig();
  var avgHrs = cfg.avg_hours_per_relapse || 2;

  // KPIs
  document.getElementById('bk-streak').textContent = stats.currentStreak;
  document.getElementById('bk-streak').style.color = stats.currentStreak >= 7 ? 'var(--green)' : 'var(--brahma)';
  document.getElementById('bk-longest').textContent = stats.longestStreak;
  document.getElementById('bk-relapses').textContent = stats.totalRelapses;
  document.getElementById('bk-clean').textContent = stats.cleanPct + '%';
  document.getElementById('bk-clean').style.color = stats.cleanPct >= 80 ? 'var(--green)' : 'var(--brahma)';
  document.getElementById('bk-urge').textContent = stats.avgUrge;

  // Hours
  var hoursLost = stats.totalRelapses * avgHrs;
  var cleanDays = stats.totalDays - stats.totalRelapses;
  var hoursSaved = cleanDays * avgHrs;
  var net = hoursSaved - hoursLost;
  document.getElementById('bk-hours-lost').textContent = hoursLost;
  document.getElementById('bk-hours-saved').textContent = hoursSaved;
  document.getElementById('bk-hours-net').textContent = (net >= 0 ? '+' : '') + net;
  document.getElementById('bk-hours-net').style.color = net >= 0 ? 'var(--green)' : 'var(--brahma)';
  document.getElementById('brahmaAvgHrs').value = avgHrs;

  // 90-day relapse calendar
  var calHtml = '';
  var today = new Date();
  for (var i = 89; i >= 0; i--) {
var d = new Date(today); d.setDate(d.getDate() - i);
var ds = (d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));
var dayData = getBrahmaDaily(ds);
var hasData = Object.keys(dayData).length > 0;
var cls = 'bf-cal-cell';
if (i === 0) cls += ' today';
if (hasData) cls += isCleanDay(dayData) ? ' clean' : ' relapse';
calHtml += '<span class="' + cls + '" title="' + ds + (hasData ? (isCleanDay(dayData) ? ' — CLEAN' : ' — RELAPSE') : '') + '"></span>';
  }
  document.getElementById('brahma-cal').innerHTML = calHtml;

  // Trigger analysis
  var patterns = analyzeBrahmaPatterns(stats.allDays.slice().reverse());

  // Day-of-week heatmap
  var dayNames = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  var maxDow = Math.max.apply(null, patterns.dayOfWeek) || 1;
  var dowHtml = '';
  patterns.dayOfWeek.forEach(function(count, idx) {
var intensity = count / maxDow;
var bg = count === 0 ? 'var(--bg3)' : 'rgba(255,68,68,' + (0.15 + intensity * 0.6) + ')';
var col = count === 0 ? 'var(--text-dim)' : 'var(--brahma)';
dowHtml += '<div class="bf-heat-cell" style="background:' + bg + '">';
dowHtml += '<div style="font-size:9px;letter-spacing:1px;color:' + col + '">' + dayNames[idx] + '</div>';
dowHtml += '<div style="font-size:18px;font-weight:700;color:' + col + ';margin-top:4px">' + count + '</div>';
dowHtml += '</div>';
  });
  document.getElementById('brahma-dow').innerHTML = dowHtml;

  // Top triggers
  var trigHtml = '';
  if (patterns.topTriggers.length === 0) {
trigHtml = '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);padding:12px">No trigger patterns detected yet. Keep journaling.</div>';
  } else {
patterns.topTriggers.forEach(function(t, i) {
  var width = Math.max(20, (t[1] / (patterns.topTriggers[0][1] || 1)) * 100);
  trigHtml += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">';
  trigHtml += '<span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);min-width:120px">' + t[0].toUpperCase() + '</span>';
  trigHtml += '<div style="flex:1;height:16px;background:var(--bg3);border-radius:4px;overflow:hidden"><div style="width:' + width + '%;height:100%;background:rgba(255,68,68,' + (0.3 + (1 - i * 0.2)) * 0.7 + ');border-radius:4px"></div></div>';
  trigHtml += '<span style="font-family:var(--font-mono);font-size:11px;color:var(--brahma);font-weight:700">' + t[1] + '</span>';
  trigHtml += '</div>';
});
  }
  document.getElementById('brahma-triggers').innerHTML = trigHtml;

  // Urge comparison
  var ucHtml = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">';
  ucHtml += '<div style="text-align:center;padding:16px;background:rgba(255,68,68,0.03);border-radius:8px;border:1px solid rgba(255,68,68,0.08)">';
  ucHtml += '<div style="font-family:var(--font-mono);font-size:28px;font-weight:700;color:var(--brahma)">' + patterns.avgUrgeRelapse + '</div>';
  ucHtml += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin-top:4px">AVG URGE ON RELAPSE DAYS</div></div>';
  ucHtml += '<div style="text-align:center;padding:16px;background:rgba(0,229,160,0.03);border-radius:8px;border:1px solid rgba(0,229,160,0.08)">';
  ucHtml += '<div style="font-family:var(--font-mono);font-size:28px;font-weight:700;color:var(--green)">' + patterns.avgUrgeClean + '</div>';
  ucHtml += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-muted);margin-top:4px">AVG URGE ON CLEAN DAYS</div></div>';
  ucHtml += '</div>';
  document.getElementById('brahma-urge-compare').innerHTML = ucHtml;

  // 7-day urge chart
  var chartHtml = '';
  for (var c = 6; c >= 0; c--) {
var dd = new Date(today); dd.setDate(dd.getDate() - c);
var ds = (dd.getFullYear()+'-'+String(dd.getMonth()+1).padStart(2,'0')+'-'+String(dd.getDate()).padStart(2,'0'));
var dayD = getBrahmaDaily(ds);
var urge = dayD.urge || 0;
var barH = Math.max(2, urge * 12);
var barCol = urge >= 7 ? 'var(--brahma)' : urge >= 4 ? 'var(--gold)' : 'var(--green)';
chartHtml += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">';
chartHtml += '<div style="font-family:var(--font-mono);font-size:10px;font-weight:700;color:' + barCol + '">' + urge + '</div>';
chartHtml += '<div style="width:100%;height:' + barH + 'px;background:' + barCol + ';border-radius:3px 3px 0 0;min-height:2px"></div>';
chartHtml += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-top:6px">' + dayNames[dd.getDay()] + '</div>';
chartHtml += '</div>';
  }
  document.getElementById('brahma-urge-chart').innerHTML = chartHtml;
}

// ── WEEKLY REVIEW ──
function brahmaWeekNav(dir) {
  var el = document.getElementById('brahmaWeekDate');
  if (dir === 0) { el.value = getSunday(); }
  else { var d = new Date(el.value); d.setDate(d.getDate() + (dir * 7)); el.value = (d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')); }
  renderBrahmaWeekly();
}

function renderBrahmaWeekly() {
  var dateEl = document.getElementById('brahmaWeekDate');
  if (!dateEl.value) dateEl.value = getSunday();
  var weekDate = dateEl.value;
  var data = getBrahmaWeekly(weekDate);
  var container = document.getElementById('brahma-weekly-container');
  var dayNames = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  var todayStr = getEffectiveToday();

  // Gather week data
  var cleanDays = 0, relapses = 0, weekStreak = 0, tempStreak = 0;
  var weekDays = [];
  for (var d = 0; d < 7; d++) {
    var dd = new Date(weekDate); dd.setDate(dd.getDate() + d);
    var ds = (dd.getFullYear()+'-'+String(dd.getMonth()+1).padStart(2,'0')+'-'+String(dd.getDate()).padStart(2,'0'));
    var dayData = getBrahmaDaily(ds);
    var hasData = Object.keys(dayData).length > 0;
    var clean = hasData ? isCleanDay(dayData) : null;
    if (clean === true) { cleanDays++; tempStreak++; weekStreak = Math.max(weekStreak, tempStreak); }
    else if (clean === false) { relapses++; tempStreak = 0; }
    weekDays.push({ date: ds, dayName: dayNames[dd.getDay()], dayNum: dd.getDate(), hasData: hasData, clean: clean, urge: dayData.urge || 0, trigger: dayData.trigger_text || '' });
  }

  var scoreEl = document.getElementById('brahma-week-score');
  if (scoreEl) { scoreEl.textContent = cleanDays + '/7 CLEAN'; scoreEl.style.color = cleanDays >= 6 ? 'var(--green)' : cleanDays >= 4 ? 'var(--gold)' : 'var(--brahma)'; }

  var html = '';

  // ── WEEK CALENDAR STRIP ──
  html += '<div class="panel-section" style="border-color:rgba(var(--red-r),0.1);padding:20px">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--brahma);margin-bottom:16px">WEEKLY LEDGER</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-bottom:16px">';
  weekDays.forEach(function(wd) {
    var isToday = wd.date === todayStr;
    var bg, border, icon, col;
    if (!wd.hasData) { bg = 'var(--bg3)'; border = 'var(--surface-border)'; icon = '—'; col = 'var(--text-dim)'; }
    else if (wd.clean) { bg = 'rgba(0,229,160,0.08)'; border = 'rgba(0,229,160,0.25)'; icon = '✓'; col = 'var(--green)'; }
    else { bg = 'rgba(var(--red-r),0.1)'; border = 'rgba(var(--red-r),0.3)'; icon = '✗'; col = 'var(--brahma)'; }
    // Urge ring: clean days with high urge show a ring to indicate the battle was hard
    var urgeRing = (wd.clean && wd.urge >= 6) ? 'box-shadow:inset 0 0 0 3px rgba(var(--gold-r),0.4);' : '';
    html += '<div style="text-align:center;padding:12px 4px;background:' + bg + ';border:1px solid ' + border + ';border-radius:8px;' + urgeRing + (isToday ? 'outline:2px solid var(--cyan);outline-offset:2px;' : '') + 'cursor:pointer" onclick="' + (wd.trigger ? 'alert(\'' + wd.trigger.replace(/'/g, "\\'").replace(/\n/g, "\\n").substring(0, 200) + '\')' : '') + '" title="' + wd.date + (wd.urge ? ' · Urge: ' + wd.urge + '/10' : '') + (wd.trigger ? ' · ' + wd.trigger.substring(0, 50) : '') + '">';
    html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:1px;color:' + (isToday ? 'var(--cyan)' : 'var(--text-dim)') + '">' + wd.dayName + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:22px;font-weight:700;color:' + col + ';margin:6px 0">' + icon + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">' + wd.dayNum + '</div>';
    if (wd.urge > 0) html += '<div style="font-family:var(--font-mono);font-size:8px;color:' + (wd.urge >= 7 ? 'var(--brahma)' : wd.urge >= 4 ? 'var(--gold)' : 'var(--text-dim)') + ';margin-top:4px">URGE ' + wd.urge + '</div>';
    html += '</div>';
  });
  html += '</div>';

  // Summary stats
  html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">';
  html += '<div style="text-align:center;padding:10px;background:var(--bg3);border-radius:6px"><div style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:var(--green)">' + cleanDays + '</div><div style="font-family:var(--font-mono);font-size:8px;letter-spacing:1px;color:var(--text-dim)">CLEAN</div></div>';
  html += '<div style="text-align:center;padding:10px;background:var(--bg3);border-radius:6px"><div style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:var(--brahma)">' + relapses + '</div><div style="font-family:var(--font-mono);font-size:8px;letter-spacing:1px;color:var(--text-dim)">RELAPSE</div></div>';
  html += '<div style="text-align:center;padding:10px;background:var(--bg3);border-radius:6px"><div style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:var(--cyan)">' + weekStreak + '</div><div style="font-family:var(--font-mono);font-size:8px;letter-spacing:1px;color:var(--text-dim)">BEST STREAK</div></div>';
  html += '<div style="text-align:center;padding:10px;background:var(--bg3);border-radius:6px"><div style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:' + (cleanDays >= 6 ? 'var(--green)' : cleanDays >= 4 ? 'var(--gold)' : 'var(--brahma)') + '">' + Math.round(cleanDays / 7 * 100) + '%</div><div style="font-family:var(--font-mono);font-size:8px;letter-spacing:1px;color:var(--text-dim)">CLEAN RATE</div></div>';
  html += '</div></div>';

  // ── REFLECTION TEXTAREAS ──
  html += '<div class="panel-section" style="border-color:rgba(var(--red-r),0.1)">';
  html += '<div style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px">What patterns did I notice this week?</div>';
  html += '<textarea class="form-input rich-editor" id="bw-patterns" rows="4" style="border-color:rgba(var(--red-r),0.15)" placeholder="Be honest about what you observed... Use / for headings, lists" oninput="saveBrahmaWeeklyField(\'' + weekDate + '\',\'patterns\',this.value)">' + (data.patterns || '') + '</textarea>';
  html += '</div>';

  html += '<div class="panel-section" style="border-color:rgba(var(--red-r),0.1)">';
  html += '<div style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px">Win of the week — strongest moment of resistance</div>';
  html += '<textarea class="form-input rich-editor" id="bw-win" rows="3" style="border-color:rgba(var(--red-r),0.15)" placeholder="When did you resist and how?" oninput="saveBrahmaWeeklyField(\'' + weekDate + '\',\'win\',this.value)">' + (data.win || '') + '</textarea>';
  html += '</div>';

  html += '<div class="panel-section" style="border-color:rgba(var(--red-r),0.1)">';
  html += '<div style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px">Commitment for next week</div>';
  html += '<textarea class="form-input rich-editor" id="bw-commitment" rows="3" style="border-color:rgba(var(--red-r),0.15)" placeholder="What will I do differently?" oninput="saveBrahmaWeeklyField(\'' + weekDate + '\',\'commitment\',this.value)">' + (data.commitment || '') + '</textarea>';
  html += '</div>';

  container.innerHTML = html;
  // Upgrade textareas to rich editors
  if (typeof upgradeRichEditorsIn === 'function') upgradeRichEditorsIn('brahma-weekly-container');
}

var _brahmaWeekTimer = null;
function saveBrahmaWeeklyField(weekDate, field, value) {
  var data = getBrahmaWeekly(weekDate);
  data[field] = value;
  clearTimeout(_brahmaWeekTimer);
  _brahmaWeekTimer = setTimeout(function() {
localStorage.setItem('fl_brahma_weekly_' + weekDate, JSON.stringify(data));
syncBrahmaWeekly(weekDate, data);
markSaved();
  }, 500);
}

// ── MONTHLY REPORT ──
function renderBrahmaMonthly() {
  var monthEl = document.getElementById('brahmaMonth');
  if (!monthEl.value) monthEl.value = getEffectiveToday().slice(0, 7);
  var month = monthEl.value;
  var data = getBrahmaMonthly(month);
  var container = document.getElementById('brahma-monthly-container');
  var year = parseInt(month.split('-')[0]);
  var mon = parseInt(month.split('-')[1]) - 1;
  var daysInMonth = new Date(year, mon + 1, 0).getDate();
  var firstDay = new Date(year, mon, 1).getDay(); // 0=Sun
  // Shift to Mon start: Mon=0, Sun=6
  var firstDayMon = (firstDay + 6) % 7;
  var todayStr = getEffectiveToday();
  var dayLabels = ['MON','TUE','WED','THU','FRI','SAT','SUN'];

  // Gather month data
  var cleanDays = 0, relapses = 0, totalDays = 0, totalUrge = 0, urgeCount = 0;
  var bestStreak = 0, tempStreak = 0, worstWeekIdx = -1, worstWeekRelapses = 0;
  var monthDays = [];
  var weekRelapses = [0,0,0,0,0,0]; // up to 6 weeks

  for (var d = 1; d <= daysInMonth; d++) {
    var ds = month + '-' + String(d).padStart(2, '0');
    var dayData = getBrahmaDaily(ds);
    var hasData = Object.keys(dayData).length > 0;
    var clean = hasData ? isCleanDay(dayData) : null;
    if (hasData) {
      totalDays++;
      if (clean) { cleanDays++; tempStreak++; bestStreak = Math.max(bestStreak, tempStreak); }
      else { relapses++; tempStreak = 0; var weekIdx = Math.floor((firstDayMon + d - 1) / 7); weekRelapses[weekIdx]++; }
      if (dayData.urge) { totalUrge += dayData.urge; urgeCount++; }
    }
    monthDays.push({ day: d, date: ds, hasData: hasData, clean: clean, urge: dayData.urge || 0, trigger: dayData.trigger_text || '' });
  }

  // Find worst week
  var maxWR = 0;
  weekRelapses.forEach(function(wr, i) { if (wr > maxWR) { maxWR = wr; worstWeekIdx = i; } });

  var cleanPct = totalDays > 0 ? Math.round(cleanDays / totalDays * 100) : 0;
  var avgUrge = urgeCount > 0 ? (totalUrge / urgeCount).toFixed(1) : '—';

  var html = '';

  // ── KPI CARDS ──
  html += '<div class="bf-kpi-grid" style="grid-template-columns:repeat(4,1fr)">';
  html += '<div class="bf-kpi"><div class="bf-kpi-val" style="color:var(--green)">' + cleanDays + '</div><div class="bf-kpi-label">CLEAN DAYS</div></div>';
  html += '<div class="bf-kpi"><div class="bf-kpi-val" style="color:var(--brahma)">' + relapses + '</div><div class="bf-kpi-label">RELAPSES</div></div>';
  html += '<div class="bf-kpi"><div class="bf-kpi-val" style="color:var(--cyan)">' + bestStreak + '</div><div class="bf-kpi-label">BEST STREAK</div></div>';
  html += '<div class="bf-kpi"><div class="bf-kpi-val" style="color:' + (cleanPct >= 80 ? 'var(--green)' : 'var(--brahma)') + '">' + cleanPct + '%</div><div class="bf-kpi-label">CLEAN RATE</div></div>';
  html += '</div>';

  // ── MONTH CALENDAR GRID ──
  html += '<div class="panel-section" style="border-color:rgba(var(--red-r),0.1);padding:20px">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--brahma);margin-bottom:16px">MONTHLY LEDGER</div>';

  // Day headers (Mon-Sun)
  html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:6px">';
  dayLabels.forEach(function(dl) {
    html += '<div style="text-align:center;font-family:var(--font-mono);font-size:9px;letter-spacing:1px;color:var(--text-dim);padding:4px">' + dl + '</div>';
  });
  html += '</div>';

  // Calendar cells
  html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">';
  // Empty cells before first day
  for (var blank = 0; blank < firstDayMon; blank++) {
    html += '<div style="padding:8px;border-radius:6px"></div>';
  }
  // Day cells
  monthDays.forEach(function(md) {
    var isToday = md.date === todayStr;
    var bg, border, textCol, icon;
    if (!md.hasData) { bg = 'var(--bg3)'; border = 'transparent'; textCol = 'var(--text-dim)'; icon = ''; }
    else if (md.clean) { bg = 'rgba(0,229,160,0.1)'; border = 'rgba(0,229,160,0.3)'; textCol = 'var(--green)'; icon = ' ✓'; }
    else { bg = 'rgba(var(--red-r),0.12)'; border = 'rgba(var(--red-r),0.35)'; textCol = 'var(--brahma)'; icon = ' ✗'; }
    // Urge ring for clean days with high urge
    var urgeRing = (md.clean && md.urge >= 6) ? 'box-shadow:inset 0 0 0 2px rgba(var(--gold-r),0.4);' : '';
    var cursor = md.trigger ? 'cursor:pointer;' : '';
    var clickHandler = md.trigger ? 'onclick="alert(\'' + md.trigger.replace(/'/g, "\\'").replace(/\n/g, "\\n").substring(0, 300) + '\')"' : '';
    html += '<div style="text-align:center;padding:8px 4px;background:' + bg + ';border:1px solid ' + border + ';border-radius:6px;' + urgeRing + cursor + (isToday ? 'outline:2px solid var(--cyan);outline-offset:1px;' : '') + '" title="' + md.date + (md.urge ? ' · Urge: ' + md.urge : '') + (md.trigger ? ' · Click to see entry' : '') + '" ' + clickHandler + '>';
    html += '<div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:' + textCol + '">' + md.day + '<span style="font-size:10px">' + icon + '</span></div>';
    if (md.urge > 0) html += '<div style="font-family:var(--font-mono);font-size:7px;color:' + (md.urge >= 7 ? 'var(--brahma)' : 'var(--text-dim)') + ';margin-top:2px">' + md.urge + '</div>';
    html += '</div>';
  });
  html += '</div>';

  // Legend
  html += '<div style="display:flex;gap:16px;margin-top:12px;padding-top:12px;border-top:1px solid rgba(var(--red-r),0.06)">';
  html += '<div style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:2px;background:rgba(0,229,160,0.3);display:inline-block"></span><span style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim)">CLEAN</span></div>';
  html += '<div style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:2px;background:rgba(var(--red-r),0.35);display:inline-block"></span><span style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim)">RELAPSE</span></div>';
  html += '<div style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:2px;background:var(--bg3);display:inline-block"></span><span style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim)">NO DATA</span></div>';
  html += '<div style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:2px;background:var(--bg3);box-shadow:inset 0 0 0 2px rgba(var(--gold-r),0.4);display:inline-block"></span><span style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim)">HIGH URGE RESISTED</span></div>';
  html += '</div>';
  html += '</div>';

  // ── SUMMARY ROW ──
  html += '<div class="panel-section" style="border-color:rgba(var(--red-r),0.1)">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--brahma);margin-bottom:12px">MONTH SUMMARY</div>';
  html += '<div style="font-size:13px;color:var(--text-muted);line-height:2">';
  html += '<div><strong style="color:var(--text)">Best Streak:</strong> ' + bestStreak + ' consecutive clean days</div>';
  html += '<div><strong style="color:var(--text)">Avg Urge:</strong> ' + avgUrge + '/10</div>';
  if (data.prev_clean_pct !== undefined) {
    var delta = cleanPct - data.prev_clean_pct;
    var arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '—';
    var dcol = delta > 0 ? 'var(--green)' : delta < 0 ? 'var(--brahma)' : 'var(--text-dim)';
    html += '<div><strong style="color:var(--text)">vs Last Month:</strong> <span style="color:' + dcol + ';font-weight:700">' + arrow + ' ' + Math.abs(delta) + '%</span></div>';
  }
  if (worstWeekIdx >= 0 && maxWR > 0) {
    html += '<div><strong style="color:var(--brahma)">Worst Week:</strong> Week ' + (worstWeekIdx + 1) + ' (' + maxWR + ' relapse' + (maxWR > 1 ? 's' : '') + ')</div>';
  }
  html += '</div></div>';

  // ── REFLECTION TEXTAREAS ──
  html += '<div class="panel-section" style="border-color:rgba(var(--red-r),0.1)">';
  html += '<div style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px">Key Insight</div>';
  html += '<textarea class="form-input" rows="3" style="border-color:rgba(var(--red-r),0.15)" placeholder="What did this month teach you?" oninput="saveBrahmaMonthlyField(\'' + month + '\',\'insight\',this.value)">' + (data.insight || '') + '</textarea></div>';

  html += '<div class="panel-section" style="border-color:rgba(var(--red-r),0.1)">';
  html += '<div style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--text);margin-bottom:12px">Biggest Challenge</div>';
  html += '<textarea class="form-input" rows="3" style="border-color:rgba(var(--red-r),0.15)" placeholder="What was hardest?" oninput="saveBrahmaMonthlyField(\'' + month + '\',\'challenge\',this.value)">' + (data.challenge || '') + '</textarea></div>';

  container.innerHTML = html;
}

var _brahmaMonthTimer = null;
function saveBrahmaMonthlyField(month, field, value) {
  var data = getBrahmaMonthly(month);
  data[field] = value;
  clearTimeout(_brahmaMonthTimer);
  _brahmaMonthTimer = setTimeout(function() {
localStorage.setItem('fl_brahma_monthly_' + month, JSON.stringify(data));
if (typeof syncSave === 'function') {
  syncSave('brahma_monthly', { month: month, data: JSON.stringify(data) }, 'month');
}
markSaved();
  }, 500);
}

function calculateBrahmaMonthly() {
  var month = document.getElementById('brahmaMonth').value;
  if (!month) return;
  var year = parseInt(month.split('-')[0]);
  var mon = parseInt(month.split('-')[1]) - 1;
  var daysInMonth = new Date(year, mon + 1, 0).getDate();
  var data = getBrahmaMonthly(month);

  var cleanDays = 0, totalDays = 0, relapses = 0, totalUrge = 0, urgeCount = 0;
  for (var d = 1; d <= daysInMonth; d++) {
var ds = month + '-' + String(d).padStart(2, '0');
var dayData = getBrahmaDaily(ds);
if (Object.keys(dayData).length > 0) {
  totalDays++;
  if (isCleanDay(dayData)) cleanDays++;
  else relapses++;
  if (dayData.urge) { totalUrge += dayData.urge; urgeCount++; }
}
  }

  data.clean_days = cleanDays;
  data.total_days = totalDays;
  data.relapses = relapses;
  data.clean_pct = totalDays > 0 ? Math.round(cleanDays / totalDays * 100) : 0;
  data.avg_urge = urgeCount > 0 ? (totalUrge / urgeCount).toFixed(1) : '—';

  // Previous month comparison
  var prevMon = mon === 0 ? 11 : mon - 1;
  var prevYear = mon === 0 ? year - 1 : year;
  var prevKey = prevYear + '-' + String(prevMon + 1).padStart(2, '0');
  var prevData = getBrahmaMonthly(prevKey);
  if (prevData.clean_pct !== undefined) data.prev_clean_pct = prevData.clean_pct;

  localStorage.setItem('fl_brahma_monthly_' + month, JSON.stringify(data));
  renderBrahmaMonthly();
  markSaved();
}

// ── FORTRESS RULE MATRIX ──
function brahmaMatrixNav(dir) {
  var el = document.getElementById('brahmaMatrixMonth');
  if (!el) return;
  if (dir === 0) { el.value = getEffectiveToday().slice(0, 7); }
  else {
    var parts = el.value.split('-');
    var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1 + dir, 1);
    el.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  renderBrahmaMatrix();
}

function renderBrahmaMatrix() {
  var monthEl = document.getElementById('brahmaMatrixMonth');
  if (!monthEl) return;
  if (!monthEl.value) monthEl.value = getEffectiveToday().slice(0, 7);
  var month = monthEl.value;
  var year = parseInt(month.split('-')[0]);
  var mon  = parseInt(month.split('-')[1]) - 1;
  var daysInMonth = new Date(year, mon + 1, 0).getDate();
  var todayStr = getEffectiveToday();

  var RULES = [
    { key:'purity',    icon:'🔥', name:'PURITY',    col:'255,68,68',   hex:'#FF5252',
      getHeld: function(d) { if (d.porn===undefined && d.masturbate===undefined) return null; return !(d.porn===true||d.masturbate===true); } },
    { key:'brahma',    icon:'⚡', name:'BRAHMACHARYA', col:'255,183,77', hex:'#FFB74D',
      getHeld: function(d) { if (d.brahma_held!==undefined) return d.brahma_held; if (d.sexual!==undefined) return !(d.sexual===true); return null; } },
    { key:'citadel',   icon:'📵', name:'CITADEL',   col:'0,212,255',   hex:'#00D4FF',
      getHeld: function(d) { if (d.device_free===undefined && d.phone_out===undefined) return null; return !(d.phone_out===false||d.device_free===false||d.laptop_out===false); } },
    { key:'perimeter', icon:'🏠', name:'PERIMETER', col:'38,198,218',  hex:'#26C6DA',
      getHeld: function(d) { return d.stayed_out!==undefined ? d.stayed_out===true : null; } },
    { key:'vigil',     icon:'🌙', name:'VIGIL',     col:'206,147,216', hex:'#CE93D8',
      getHeld: function(d) { return d.woke_3am!==undefined ? d.woke_3am===true : null; } },
    { key:'chronicle', icon:'📖', name:'CHRONICLE', col:'0,230,118',   hex:'#00E676',
      getHeld: function(d) { return d.journal_written!==undefined ? d.journal_written===true : null; } },
    { key:'temple',    icon:'🌿', name:'TEMPLE',    col:'245,166,35',  hex:'#F5A623',
      getHeld: function(d) { return d.food_rules!==undefined ? d.food_rules!==false : null; } }
  ];

  // Pre-load all day data
  var dayDataMap = {};
  for (var d = 1; d <= daysInMonth; d++) {
    var ds = month + '-' + String(d).padStart(2, '0');
    dayDataMap[ds] = getBrahmaDaily(ds);
  }

  // Rule stats for summary cards
  var ruleStats = RULES.map(function(r) {
    var held = 0, breached = 0, logged = 0;
    for (var d = 1; d <= daysInMonth; d++) {
      var ds = month + '-' + String(d).padStart(2, '0');
      var h = r.getHeld(dayDataMap[ds]);
      if (h !== null) { logged++; if (h) held++; else breached++; }
    }
    return { held: held, breached: breached, logged: logged, pct: logged > 0 ? Math.round(held / logged * 100) : null };
  });

  // Day scores (held/logged across all rules)
  var dayScores = {};
  for (var d = 1; d <= daysInMonth; d++) {
    var ds = month + '-' + String(d).padStart(2, '0');
    var data = dayDataMap[ds];
    var hc = 0, lc = 0;
    RULES.forEach(function(r) { var h = r.getHeld(data); if (h !== null) { lc++; if (h) hc++; } });
    dayScores[ds] = { held: hc, logged: lc };
  }

  var html = '';
  var DOW_NAMES = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  // ── SUMMARY STAT CARDS ──
  html += '<div class="bfm-summary">';
  RULES.forEach(function(r, i) {
    var st = ruleStats[i];
    var pctCol = st.pct === null ? 'var(--text-dim)' : st.pct >= 90 ? '#00E676' : st.pct >= 70 ? '#F5A623' : '#FF5252';
    html += '<div class="bfm-stat-card" style="border-color:rgba(' + r.col + ',0.18)">';
    html += '<div class="bfm-stat-icon">' + r.icon + '</div>';
    html += '<div class="bfm-stat-name">' + r.name + '</div>';
    html += '<div class="bfm-stat-pct" style="color:' + pctCol + '">' + (st.pct !== null ? st.pct + '%' : '—') + '</div>';
    html += '<div class="bfm-stat-sub">' + st.held + '/' + st.logged + ' held</div>';
    if (st.breached > 0) html += '<div class="bfm-stat-breach">' + st.breached + ' breach' + (st.breached > 1 ? 'es' : '') + '</div>';
    html += '</div>';
  });
  html += '</div>';

  // ── MATRIX GRID ──
  html += '<div class="bfm-wrap"><div class="bfm-table">';

  // Header row — day numbers
  html += '<div class="bfm-row">';
  html += '<div class="bfm-row-label"></div>';
  for (var d = 1; d <= daysInMonth; d++) {
    var ds = month + '-' + String(d).padStart(2, '0');
    var dow = new Date(ds).getDay();
    var isToday = ds === todayStr;
    var isWknd  = dow === 0 || dow === 6;
    html += '<div class="bfm-day-hdr' + (isToday ? ' bfm-today-hdr' : '') + (isWknd ? ' bfm-weekend' : '') + '">';
    html += '<div class="bfm-day-num">' + d + '</div>';
    html += '<div class="bfm-day-name">' + DOW_NAMES[dow] + '</div>';
    html += '</div>';
  }
  html += '</div>';

  // Rule rows
  RULES.forEach(function(r) {
    html += '<div class="bfm-row">';
    html += '<div class="bfm-row-label">' + r.icon + ' <span>' + r.name + '</span></div>';
    for (var d = 1; d <= daysInMonth; d++) {
      var ds = month + '-' + String(d).padStart(2, '0');
      var held = r.getHeld(dayDataMap[ds]);
      var isToday = ds === todayStr;
      var bg, glyph, gCol;
      if (held === null)  { bg = 'rgba(255,255,255,0.03)'; glyph = ''; gCol = 'transparent'; }
      else if (held)      { bg = 'rgba(' + r.col + ',0.28)'; glyph = '✓'; gCol = r.hex; }
      else                { bg = 'rgba(255,68,68,0.38)'; glyph = '✗'; gCol = '#FF5252'; }
      var tt = ds + (held === null ? ' — not logged' : held ? ' — HELD' : ' — BREACHED');
      html += '<div class="bfm-cell' + (isToday ? ' bfm-today-cell' : '') + '" style="background:' + bg + '" title="' + tt + '">';
      html += '<span style="color:' + gCol + ';font-size:9px;font-weight:700;line-height:1">' + glyph + '</span>';
      html += '</div>';
    }
    html += '</div>';
  });

  // Separator
  html += '<div class="bfm-sep"></div>';

  // Fortress score row
  html += '<div class="bfm-row bfm-score-row">';
  html += '<div class="bfm-row-label">⚡ <span>SCORE</span></div>';
  for (var d = 1; d <= daysInMonth; d++) {
    var ds = month + '-' + String(d).padStart(2, '0');
    var sc = dayScores[ds];
    var isToday = ds === todayStr;
    var sBg, sTxt, sCol;
    if (sc.logged === 0) { sBg = 'rgba(255,255,255,0.03)'; sTxt = ''; sCol = 'transparent'; }
    else {
      var ratio = sc.held / sc.logged;
      sBg  = ratio === 1 ? 'rgba(0,230,118,0.25)' : ratio >= 0.7 ? 'rgba(245,166,35,0.25)' : 'rgba(255,68,68,0.25)';
      sCol = ratio === 1 ? '#00E676' : ratio >= 0.7 ? '#F5A623' : '#FF5252';
      sTxt = sc.held + '';
    }
    var tt2 = ds + ': ' + sc.held + '/' + sc.logged + ' rules held';
    html += '<div class="bfm-cell bfm-score-cell' + (isToday ? ' bfm-today-cell' : '') + '" style="background:' + sBg + '" title="' + tt2 + '">';
    html += '<span style="color:' + sCol + ';font-size:9px;font-weight:700;line-height:1">' + sTxt + '</span>';
    html += '</div>';
  }
  html += '</div>';

  html += '</div></div>'; // bfm-table, bfm-wrap

  // ── VULNERABILITY MAP — day of week ──
  var dowBreaches = [0,0,0,0,0,0,0];
  var dowLogged   = [0,0,0,0,0,0,0];
  for (var d = 1; d <= daysInMonth; d++) {
    var ds = month + '-' + String(d).padStart(2, '0');
    var data = dayDataMap[ds];
    var dow  = new Date(ds).getDay();
    var anyLogged = false;
    RULES.forEach(function(r) {
      var h = r.getHeld(data);
      if (h === false) dowBreaches[dow]++;
      if (h !== null)  anyLogged = true;
    });
    if (anyLogged) dowLogged[dow]++;
  }
  var maxBreach = Math.max.apply(null, dowBreaches) || 1;
  var worstDow  = dowBreaches.indexOf(Math.max.apply(null, dowBreaches));

  html += '<div class="panel-section" style="border-color:rgba(255,68,68,0.1);margin-top:8px">';
  html += '<div class="bfv2-detail-hdr">⚠ VULNERABILITY — DAY OF WEEK (breach count this month)</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px">';
  var DOW_FULL = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  for (var i = 0; i < 7; i++) {
    var intensity = dowBreaches[i] / maxBreach;
    var bg  = dowBreaches[i] === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,68,68,' + (0.08 + intensity * 0.35) + ')';
    var col = (i === worstDow && dowBreaches[i] > 0) ? '#FF5252' : 'var(--text-muted)';
    var fw  = (i === worstDow && dowBreaches[i] > 0) ? '700' : '400';
    html += '<div style="text-align:center;padding:10px 4px;background:' + bg + ';border-radius:8px;border:1px solid rgba(255,255,255,0.04)">';
    html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:1px;color:' + col + ';font-weight:' + fw + '">' + DOW_FULL[i] + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:' + col + ';margin:4px 0">' + dowBreaches[i] + '</div>';
    if (i === worstDow && dowBreaches[i] > 0) html += '<div style="font-family:var(--font-mono);font-size:7px;color:#FF5252;letter-spacing:1px">DANGER</div>';
    html += '</div>';
  }
  html += '</div>';
  if (dowBreaches[worstDow] > 0) {
    html += '<div style="font-family:var(--font-mono);font-size:11px;color:rgba(255,68,68,0.7);letter-spacing:1px;margin-top:12px">';
    html += '⚠ MOST VULNERABLE DAY: ' + DOW_FULL[worstDow] + ' — ' + dowBreaches[worstDow] + ' breach' + (dowBreaches[worstDow] > 1 ? 'es' : '') + ' this month';
    html += '</div>';
  }
  html += '</div>';

  document.getElementById('brahma-matrix-container').innerHTML = html;
}

// ── Dashboard streak widget ──
(function updateDashboardBrahma() {
  var stats = computeBrahmaStreak();
  var badge = document.getElementById('brahma-streak-badge');
  if (badge) badge.textContent = 'STREAK: ' + stats.currentStreak + ' DAYS';
})();
 
