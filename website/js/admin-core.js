// ═══════════════════════════════════════════
// FIRST LIGHT — CORE
// ═══════════════════════════════════════════

if(!requireAuth()){document.body.innerHTML='';}

function toggleGroup(group) {
  group.classList.toggle('open');
}

function switchPanel(panelId) {
  // Clear ritual date overrides when navigating away
  if (typeof ritualDateOverride !== 'undefined') { ritualDateOverride.morning = null; ritualDateOverride.evening = null; }
  document.querySelectorAll('.cc-item').forEach(i => i.classList.toggle('active', i.dataset.panel === panelId));
  document.querySelectorAll('.cc-panel').forEach(p => p.classList.toggle('active', p.id === 'p-' + panelId));
  document.getElementById('sidebar').classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  // Auto-open parent group
  var activeItem = document.querySelector('.cc-item[data-panel="' + panelId + '"]');
  if (activeItem) {
    var group = activeItem.closest('.cc-group');
    if (group && !group.classList.contains('open')) group.classList.add('open');
  }
  // Build dynamic panels
  if (panelId === 'manage-rituals') loadRitualManager(currentMgrPeriod);
  if (panelId === 'weekly-review') buildWeeklyReview();
  if (panelId === 'monthly') buildCalHeatMap();
  if (panelId === 'weekly') { renderWeeklySchedule(); loadWeeklyState(); }
  if (panelId === 'rules25') renderRules();
  if (panelId === 'ritual-analytics') buildRitualAnalytics();
  if (panelId === 'mastery-daily') renderMasteryDaily();
  if (panelId === 'mastery-weekly') renderMasteryWeekly();
  if (panelId === 'mastery-ideas') renderMasteryIdeas();
  if (panelId === 'mastery-analytics') buildMasteryAnalytics();
  if (panelId === 'mastery-monthly') { renderMasteryMonthly(); setTimeout(function(){ if(typeof calculateMonthlyScores==='function') calculateMonthlyScores(); }, 100); }
  if (panelId === 'morning' || panelId === 'midday' || panelId === 'evening') initRitualDateNav(panelId);
  if (panelId === 'deepwork') initDeepWorkDateNav();
  if (panelId === 'deepwork-analytics') buildDWAnalytics();
  if (panelId === 'gym-log') { initGymDateNav(); renderGymLog(); }
  if (panelId === 'gym-analytics') buildGymAnalytics();
  if (panelId === 'gym-exercises') renderExerciseLibrary('push');
  if (panelId === 'reflection') { initReflectionDateNav(); if (typeof initRichEditorsForPanel === 'function') setTimeout(function() { initRichEditorsForPanel('reflection'); }, 500); }
  if (panelId === 'journal-today') { if (typeof initJournalToday === 'function') initJournalToday(); }
  if (panelId === 'journal-review') { if (typeof renderJournalReview === 'function') renderJournalReview(); }
  if (panelId === 'ekadashi') switchEkadashiTab(_ekadashiTab || 'month');
  if (panelId === 'profile') loadProfile();
  if (panelId === 'brahma-log') { requireBrahmaPin(function(){ renderBrahmaDaily(); }); }
  if (panelId === 'brahma-analytics') { requireBrahmaPin(function(){ buildBrahmaAnalytics(); }); }
  if (panelId === 'brahma-review') { requireBrahmaPin(function(){ renderBrahmaWeekly(); }); }
  if (panelId === 'brahma-monthly') { requireBrahmaPin(function(){ renderBrahmaMonthly(); }); }
  if (panelId === 'brahma-matrix')  { requireBrahmaPin(function(){ var el=document.getElementById('brahmaMatrixMonth'); if(el&&!el.value) el.value=getEffectiveToday().slice(0,7); renderBrahmaMatrix(); }); }
  if (panelId === 'fortress-streaks') { requireBrahmaPin(function(){ if(typeof renderFortressStreaks==='function') renderFortressStreaks(); }); }
  if (panelId === 'fortress-year')    { requireBrahmaPin(function(){ if(typeof renderFortressYear==='function'){ if(!_faYearNavYear) _faYearNavYear=new Date().getFullYear(); renderFortressYear(); } }); }
  if (panelId === 'fortress-intel')   { requireBrahmaPin(function(){ if(typeof renderFortressIntel==='function') renderFortressIntel(); }); }
  if (panelId === 'life-score')       { if(typeof renderLifeScore==='function') renderLifeScore(); }
  if (panelId === 'mastery-heatmap')  { if(typeof renderMasteryRitualHeatmap==='function') renderMasteryRitualHeatmap(); }
  if (panelId === 'checkin') { if (typeof renderCheckin === 'function') renderCheckin(); }
  if (panelId === 'goals') { if (typeof renderGoalsPanel === 'function') renderGoalsPanel(); }
  if (panelId === 'daily-rule') { if (typeof renderDailyRule === 'function') renderDailyRule(); }
  if (panelId === 'slip-log') { if (typeof renderSlipLog === 'function') renderSlipLog(); }
  if (panelId === 'slip-history') { if (typeof renderSlipHistory === 'function') renderSlipHistory(); }
  if (panelId === 'tomorrow') { if (typeof switchTomorrowTab === 'function') switchTomorrowTab(_tmrActiveTab || 'plan'); }
  if (panelId === 'arch-log') { if (typeof renderArchLog === 'function') renderArchLog(); }
  if (panelId === 'unified-streaks') { if (typeof renderUnifiedStreaks === 'function') renderUnifiedStreaks(); }
  if (panelId === 'sync-center') { if (typeof renderSyncCenter === 'function') renderSyncCenter(); }
  if (panelId === 'journal-archive') { if (typeof renderJournalCalendar === 'function') renderJournalCalendar(); }
  if (panelId === 'life-calendar') { if (typeof renderLifeCalendar === 'function') renderLifeCalendar(); }
  if (panelId === 'health-dashboard') { if (typeof loadHealthData === 'function') loadHealthData(); }
}

// Legacy support — map old switchTab calls to switchPanel
function switchTab(tabId) {
  var map = { 'overview': 'dashboard', 'instagram': 'schedule', 'content': 'calendar' };
  switchPanel(map[tabId] || tabId);
}

function flashBtn(btn, text) {
  var orig = btn.textContent;
  btn.textContent = text;
  btn.style.background = 'var(--green)';
  markSaved();
  setTimeout(function() { btn.textContent = orig; btn.style.background = ''; }, 2000);
}

function toggleRitualInfo(e, el) {
  e.stopPropagation();
  el.closest('.ritual-item').classList.toggle('info-open');
}

function createDateNav(containerId, options) {
  var days = options.days || 7;
  var onSelect = options.onSelect || function(){};
  var container = document.getElementById(containerId);
  if (!container) return null;
  var state = { currentDate: getEffectiveToday() };
  var dayNames = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

  function render() {
var today = getEffectiveToday();
var html = '<div class="date-nav">';
html += '<button class="btn-copy" onclick="window._dnNav[\'' + containerId + '\'].nav(-1)">◀</button>';
html += '<button class="btn-copy" onclick="window._dnNav[\'' + containerId + '\'].nav(0)">TODAY</button>';
html += '<button class="btn-copy" onclick="window._dnNav[\'' + containerId + '\'].nav(1)">▶</button>';
html += '</div>';
html += '<div class="date-nav-strip" style="grid-template-columns:repeat(' + days + ',1fr)">';
for (var i = days - 1; i >= 0; i--) {
  var d = new Date(state.currentDate + 'T12:00:00');
  d.setDate(d.getDate() - i);
  var ds = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  var isActive = ds === state.currentDate;
  var isToday = ds === today;
  html += '<div class="date-nav-day' + (isActive ? ' active' : '') + (isToday ? ' today' : '') + '" onclick="window._dnNav[\'' + containerId + '\'].select(\'' + ds + '\')">';
  html += '<div class="dn-name">' + dayNames[d.getDay()] + '</div>';
  html += '<div class="dn-num">' + d.getDate() + '</div>';
  html += '</div>';
}
html += '</div>';
container.innerHTML = html;
  }

  var ctrl = {
setDate: function(ds) { state.currentDate = ds; render(); onSelect(ds); },
getDate: function() { return state.currentDate; },
select: function(ds) { state.currentDate = ds; render(); onSelect(ds); },
nav: function(dir) {
  if (dir === 0) { state.currentDate = getEffectiveToday(); }
  else { var d = new Date(state.currentDate + 'T12:00:00'); d.setDate(d.getDate() + dir); state.currentDate = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  render(); onSelect(state.currentDate);
},
refresh: render
  };

  if (!window._dnNav) window._dnNav = {};
  window._dnNav[containerId] = ctrl;
  render();
  return ctrl;
}

// ══════════════════════════════════════════════════════
// FEATURE 9: DATE NAVIGATION FOR RITUALS
// ══════════════════════════════════════════════════════

var ritualDateOverride = { morning: null, evening: null };

function initRitualDateNav(period) {
  createDateNav(period + '-date-nav', {
days: 7,
onSelect: function(dateStr) {
  ritualDateOverride[period] = dateStr;
  renderRituals(period);
}
  });
}

// Patch renderRituals to use date override — see PATCHES section below

// ══════════════════════════════════════════════════════
// FEATURE 3: DAILY REFLECTION — 7-DAY DATE BAR
// ══════════════════════════════════════════════════════

var reflectionDate = getEffectiveToday();

function initReflectionDateNav() {
  createDateNav('reflection-date-nav', {
days: 7,
onSelect: function(dateStr) {
  reflectionDate = dateStr;
  loadReflection(dateStr);
}
  });
}

function loadReflection(dateStr) {
  var el = function(id) { return document.getElementById(id); };
  if (el('reflDate')) el('reflDate').textContent = dateStr;
  var all = JSON.parse(localStorage.getItem('fl_journal') || '{}');
  var entry = all[dateStr];
  if (typeof entry === 'string') { try { entry = JSON.parse(entry); } catch(pe) { entry = {}; } }
  entry = entry || {};
  if (el('jAligned')) el('jAligned').value = entry.aligned || '';
  if (el('jNotAligned')) el('jNotAligned').value = entry.notAligned || '';
  if (el('jWins')) el('jWins').value = entry.wins || '';
  if (el('jChanges')) el('jChanges').value = entry.changes || '';
  if (el('jImprove')) el('jImprove').value = entry.improve || '';
  if (el('jThoughts')) el('jThoughts').value = entry.thoughts || '';
  document.querySelectorAll('#jMoodRow span').forEach(function(s) {
s.classList.toggle('active', s.dataset.mood === (entry.mood || ''));
  });
  var energyEl = el('jEnergy');
  if (energyEl) { energyEl.value = entry.energy || 5; }
  var evalEl = el('jEnergyVal');
  if (evalEl) evalEl.textContent = energyEl ? energyEl.value : '5';

  // Lock UI for past dates
  var locked = isDateLocked(dateStr);
  var reflPanel = document.getElementById('p-reflection');
  if (reflPanel) {
    var existingBanner = reflPanel.querySelector('.lock-banner');
    if (existingBanner) existingBanner.remove();
    var saveBtn = reflPanel.querySelector('.btn-primary');
    var inputs = reflPanel.querySelectorAll('textarea, select, input:not([type="date"])');
    var moods = reflPanel.querySelectorAll('#jMoodRow span');
    if (locked) {
      var banner = document.createElement('div');
      banner.className = 'lock-banner';
      banner.innerHTML = getLockBannerHTML(dateStr);
      var dateNav = document.getElementById('reflection-date-nav');
      if (dateNav && dateNav.nextSibling) dateNav.parentNode.insertBefore(banner, dateNav.nextSibling);
      if (saveBtn) saveBtn.style.display = 'none';
      inputs.forEach(function(inp) { inp.disabled = true; inp.style.opacity = '0.6'; });
      moods.forEach(function(m) { m.style.pointerEvents = 'none'; m.style.opacity = '0.6'; });
    } else {
      if (saveBtn) saveBtn.style.display = '';
      inputs.forEach(function(inp) { inp.disabled = false; inp.style.opacity = ''; });
      moods.forEach(function(m) { m.style.pointerEvents = ''; m.style.opacity = ''; });
    }
  }
}

// ══════════════════════════════════════
// DECLARATION READ ALOUD
// ══════════════════════════════════════
function toggleReadAloud() {
  var container = document.getElementById('p-declaration');
  container.classList.toggle('read-aloud-mode');
  var btn = document.getElementById('readAloudBtn');
  btn.textContent = container.classList.contains('read-aloud-mode') ? 'EXIT READ ALOUD' : 'READ ALOUD MODE';
}

// ══════════════════════════════════════
// SUPABASE SETTINGS + SYNC
// ══════════════════════════════════════
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

// ══════════════════════════════════════
// INIT: RENDER JOURNAL ARCHIVE ON LOAD
// ══════════════════════════════════════
renderJournalArchive();

// ══════════════════════════════════════
// CMD+K COMMAND PALETTE
// ══════════════════════════════════════
(function(){
  var palette = document.createElement('div');
  palette.id = 'cmdPalette';
  palette.innerHTML = '<div class="cmd-overlay" onclick="closePalette()"></div><div class="cmd-box"><input type="text" id="cmdInput" placeholder="Type to jump... (morning, hashtags, races, journal...)" autocomplete="off"><div id="cmdResults"></div></div>';
  document.body.appendChild(palette);

  var panels = [];
  document.querySelectorAll('.cc-item[data-panel]').forEach(function(el) {
panels.push({ name: el.textContent.trim(), panel: el.dataset.panel, icon: el.querySelector('.cc-icon') ? el.querySelector('.cc-icon').textContent : '' });
  });

  function openPalette() {
palette.classList.add('open');
document.getElementById('cmdInput').value = '';
document.getElementById('cmdInput').focus();
renderResults('');
  }
  function closePalette() { palette.classList.remove('open'); }
  function renderResults(q) {
var filtered = q ? panels.filter(function(p) { return p.name.toLowerCase().includes(q.toLowerCase()); }) : panels;
document.getElementById('cmdResults').innerHTML = filtered.map(function(p, i) {
  return '<div class="cmd-result' + (i === 0 ? ' active' : '') + '" data-panel="' + p.panel + '" onclick="switchPanel(\'' + p.panel + '\');closePalette()">' + p.icon + ' ' + p.name + '</div>';
}).join('');
  }

  document.addEventListener('keydown', function(e) {
if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openPalette(); return; }
if (!palette.classList.contains('open')) return;
if (e.key === 'Escape') { closePalette(); return; }
if (e.key === 'Enter') {
  var active = document.querySelector('.cmd-result.active');
  if (active) { switchPanel(active.dataset.panel); closePalette(); }
}
if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
  e.preventDefault();
  var results = document.querySelectorAll('.cmd-result');
  var idx = -1;
  results.forEach(function(r, i) { if (r.classList.contains('active')) idx = i; });
  results.forEach(function(r) { r.classList.remove('active'); });
  if (e.key === 'ArrowDown') idx = Math.min(idx + 1, results.length - 1);
  else idx = Math.max(idx - 1, 0);
  if (results[idx]) results[idx].classList.add('active');
}
  });

  document.getElementById('cmdInput').addEventListener('input', function() { renderResults(this.value); });
  window.openPalette = openPalette;
  window.closePalette = closePalette;
})();

(function initDateBar() {
  var now = new Date();
  var days = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
  var months = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
  var dayEl = document.getElementById('dateBarDay');
  var fullEl = document.getElementById('dateBarFull');
  var weekEl = document.getElementById('dateBarWeekNum');
  if (dayEl) dayEl.textContent = days[now.getDay()];
  if (fullEl) fullEl.textContent = now.getDate() + ' ' + months[now.getMonth()] + ' ' + now.getFullYear() + ' · STREAK DAY ' + getDayNumber();
  // Calculate week number (ISO)
  var d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  var dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  var weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  if (weekEl) weekEl.textContent = 'W' + weekNum;
})();
 
