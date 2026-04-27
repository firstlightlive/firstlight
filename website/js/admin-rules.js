// ═══════════════════════════════════════════
// FIRST LIGHT — 25 DAILY RULES LIBRARY
// Full reading page with individual tracking
// Uses DAILY_RULES from admin-reading.js
// ═══════════════════════════════════════════

// Iron Covenant operational rules (kept for reference / declaration panel)
var COVENANT_RULES = [
  {n:1, title:'WAKE AT 3:15 AM', origin:'VEDIC'},
  {n:2, title:'BRAHMA MUHURTA IS SACRED', origin:'VEDIC'},
  {n:3, title:'RUN EVERY DAY', origin:'IRON COVENANT'},
  {n:4, title:'GYM AFTER RUN', origin:'IRON COVENANT'},
  {n:5, title:'FOOD CODE: NO SUGAR, NO JUNK', origin:'IRON COVENANT'},
  {n:6, title:'NO SCREENS AFTER 6 PM', origin:'BIOHACK'},
  {n:7, title:'LIGHTS OUT BY 8:30 PM', origin:'CIRCADIAN'},
  {n:8, title:'₹15,000 STAKES EVERY DAY', origin:'FIRST LIGHT'},
  {n:9, title:'THIS IS THE INFINITE GAME', origin:'FIRST LIGHT'}
];

// ── GET TODAY'S INDIVIDUAL RULE READ STATE ──
function getRules25State() {
  var today = getEffectiveToday();
  try { return JSON.parse(localStorage.getItem('fl_rules25_' + today) || '{}'); } catch(e) { return {}; }
}

function saveRules25State(state) {
  var today = getEffectiveToday();
  localStorage.setItem('fl_rules25_' + today, JSON.stringify(state));
}

// ── COMPUTE 25-RULES TRACKING STATS ──
function compute25RulesStats() {
  var today = new Date();
  var todayStr = (today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0'));
  var stats = { todayRead: 0, thisWeek: 0, weekDays: 0, thisMonth: 0, monthDays: 0, thisYear: 0, yearDays: 0, lifetimeCycles: 0 };

  // Today
  var todayState = getRules25State();
  stats.todayRead = Object.keys(todayState).filter(function(k) { return todayState[k]; }).length;

  // Count complete days (all 25 read) across different periods
  for (var i = 0; i < 365; i++) {
    var d = new Date(today); d.setDate(d.getDate() - i);
    var ds = (d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));
    var state = null;
    try { state = JSON.parse(localStorage.getItem('fl_rules25_' + ds) || 'null'); } catch(e) {}
    if (!state) continue;
    var readCount = Object.keys(state).filter(function(k) { return state[k]; }).length;
    var isComplete = readCount >= 25;

    if (isComplete) {
      // This week (last 7 days)
      if (i < 7) { stats.thisWeek++; stats.weekDays = Math.max(stats.weekDays, i + 1); }
      // This month
      if (ds.substring(0, 7) === todayStr.substring(0, 7)) stats.thisMonth++;
      // This year
      if (ds.substring(0, 4) === todayStr.substring(0, 4)) stats.thisYear++;
      stats.lifetimeCycles++;
    }
    if (i < 7) stats.weekDays = 7;
  }

  // Count days in current month
  stats.monthDays = today.getDate();
  // Count days in current year
  var yearStart = new Date(today.getFullYear(), 0, 1);
  stats.yearDays = Math.floor((today - yearStart) / 86400000) + 1;

  return stats;
}

// ── RENDER 25 RULES LIBRARY ──
function renderRules() {
  // DAILY_RULES is defined in admin-reading.js (loaded before this file)
  var rules = (typeof DAILY_RULES !== 'undefined') ? DAILY_RULES : null;
  if (!rules || !rules.length) {
    // Retry after a short delay if DAILY_RULES isn't ready yet
    setTimeout(function() {
      if (typeof DAILY_RULES !== 'undefined' && DAILY_RULES.length) renderRules();
    }, 500);
    return;
  }
  var container = document.getElementById('rules25-container');
  var progressEl = document.getElementById('rules25-progress');
  var trackingEl = document.getElementById('rules25-tracking');
  if (!container) return;
  try {

  var today = getEffectiveToday();
  var state = getRules25State();
  var readCount = Object.keys(state).filter(function(k) { return state[k]; }).length;
  var pct = Math.round(readCount / 25 * 100);

  // Progress bar
  if (progressEl) {
    progressEl.innerHTML =
      '<div style="margin-bottom:20px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
          '<span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">TODAY\'S PROGRESS</span>' +
          '<span style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:' + (pct >= 100 ? 'var(--green)' : 'var(--cyan)') + '">' + readCount + ' / 25</span>' +
        '</div>' +
        '<div style="height:6px;background:var(--bg3);border-radius:3px;overflow:hidden">' +
          '<div style="height:100%;width:' + pct + '%;background:' + (pct >= 100 ? 'var(--green)' : 'var(--cyan)') + ';border-radius:3px;transition:width 0.3s"></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:12px">' +
          '<button class="btn btn-primary btn-sm" onclick="markAll25Read()" style="' + (pct >= 100 ? 'background:var(--green);border-color:var(--green);opacity:0.7' : '') + '">' + (pct >= 100 ? '✓ ALL 25 READ' : 'MARK ALL READ') + '</button>' +
          '<button class="btn btn-outline btn-sm" onclick="randomRule25()">RANDOM RULE</button>' +
        '</div>' +
      '</div>';
  }

  // Rules cards
  var html = '';
  rules.forEach(function(r) {
    var isRead = state[r.n];
    html += '<div class="panel-section" id="rule25-' + r.n + '" style="border-color:' + (isRead ? 'rgba(0,230,118,0.15)' : 'rgba(0,212,255,0.06)') + ';' + (isRead ? 'background:rgba(0,230,118,0.02)' : '') + ';cursor:pointer" onclick="toggle25Rule(' + r.n + ')">';

    // Header row: number + title + origin + checkbox
    html += '<div style="display:flex;align-items:flex-start;gap:12px">';
    html += '<div style="font-family:var(--font-mono);font-size:28px;font-weight:700;color:' + (isRead ? 'var(--green)' : 'var(--cyan)') + ';opacity:' + (isRead ? '0.6' : '0.3') + ';line-height:1;min-width:36px">' + String(r.n).padStart(2, '0') + '</div>';
    html += '<div style="flex:1">';
    html += '<div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:var(--text);letter-spacing:1px">' + r.title + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--gold);letter-spacing:2px;margin-top:2px">' + r.origin + '</div>';
    html += '</div>';
    html += '<div style="font-size:18px;min-width:24px;text-align:center">' + (isRead ? '✓' : '○') + '</div>';
    html += '</div>';

    // Body (collapsible — show first line, expand on click)
    html += '<div style="margin-top:12px;font-family:var(--font-mono);font-size:12px;color:var(--text-muted);line-height:1.7">' + r.body + '</div>';

    // Remember line
    html += '<div style="margin-top:12px;padding:10px 14px;background:rgba(245,166,35,0.04);border:1px solid rgba(245,166,35,0.1);border-radius:6px;font-family:var(--font-mono);font-size:11px;color:var(--gold);font-style:italic">Remember: ' + r.remember + '</div>';

    html += '</div>';
  });
  container.innerHTML = html;

  // Tracking stats
  if (trackingEl) {
    var stats = compute25RulesStats();
    trackingEl.innerHTML =
      '<div class="panel-section" style="border-color:rgba(0,212,255,0.12);margin-top:24px">' +
        '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:3px;color:var(--cyan);margin-bottom:16px;font-weight:700">READING TRACKER</div>' +
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">' +
          ruleStatCard(stats.thisWeek + '/7', 'THIS WEEK', stats.thisWeek >= 6 ? 'var(--green)' : 'var(--cyan)') +
          ruleStatCard(stats.thisMonth + '/' + stats.monthDays, 'THIS MONTH', 'var(--cyan)') +
          ruleStatCard(stats.thisYear + '/' + stats.yearDays, 'THIS YEAR', 'var(--cyan)') +
          ruleStatCard(stats.lifetimeCycles, 'LIFETIME DAYS', 'var(--gold)') +
        '</div>' +
      '</div>';
  }
  } catch(e) { console.error('[Rules] renderRules error:', e); }
}

function ruleStatCard(val, label, color) {
  return '<div style="text-align:center;padding:12px 6px;background:var(--surface);border:1px solid var(--surface-border);border-radius:10px">' +
    '<div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:' + color + '">' + val + '</div>' +
    '<div style="font-family:var(--font-mono);font-size:7px;letter-spacing:2px;color:var(--text-muted);margin-top:3px">' + label + '</div></div>';
}

// ── TOGGLE INDIVIDUAL RULE READ ──
function toggle25Rule(ruleNum) {
  var state = getRules25State();
  state[ruleNum] = !state[ruleNum];
  saveRules25State(state);
  renderRules();
  markSaved();

  // All 25 state stored in localStorage only — no Supabase sync
}

// ── MARK ALL 25 READ ──
function markAll25Read() {
  var state = getRules25State();
  var allRead = Object.keys(state).filter(function(k) { return state[k]; }).length >= 25;
  if (allRead) return; // Already all read
  for (var i = 1; i <= 25; i++) state[i] = true;
  saveRules25State(state);
  renderRules();
  markSaved();
  // No Supabase sync — localStorage only
}

// ── RANDOM RULE ──
function randomRule25() {
  var idx = Math.floor(Math.random() * 25) + 1;
  var el = document.getElementById('rule25-' + idx);
  if (el) {
    el.style.boxShadow = '0 0 0 2px var(--cyan)';
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(function() { el.style.boxShadow = ''; }, 3000);
  }
}

// Init on load — delayed to ensure DAILY_RULES is available
setTimeout(function() { renderRules(); }, 100);
 
