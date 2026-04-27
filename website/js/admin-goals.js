// ═══════════════════════════════════════════════════════════
// FIRST LIGHT — GOALS MODULE (15-year durable design)
// Five horizons: weekly, monthly, quarterly, yearly, longterm
// Structured progress log with typed comments
// ═══════════════════════════════════════════════════════════

var GOAL_HORIZONS = ['weekly','monthly','quarterly','yearly','longterm'];
var GOAL_HORIZON_LABELS = {weekly:'WEEKLY',monthly:'MONTHLY',quarterly:'QUARTERLY',yearly:'YEARLY',longterm:'LONG-TERM'};
var GOAL_STATUSES = ['on_track','behind','blocked','paused','completed'];
var GOAL_STATUS_LABELS = {on_track:'ON TRACK',behind:'BEHIND',blocked:'BLOCKED',paused:'PAUSED',completed:'COMPLETED'};
var GOAL_STATUS_COLORS = {on_track:'var(--green,#00E676)',behind:'var(--gold,#F5A623)',blocked:'var(--red,#FF5252)',paused:'var(--text-dim,#8a9bb0)',completed:'var(--cyan,#00D4FF)'};
var GOAL_COMMENT_TYPES = ['update','blocker','milestone','decision','completion'];
var GOAL_CATEGORIES = ['body','mind','career','spiritual','financial','relationships','general'];
var GOAL_CAT_ICONS = {body:'\uD83D\uDCAA',mind:'\uD83E\uDDE0',career:'\uD83D\uDCBC',spiritual:'\uD83D\uDD49\uFE0F',financial:'\uD83D\uDCC8',relationships:'\u2764\uFE0F',general:'\u25C6'};
var GOAL_CAT_COLORS = {body:'#FC4C02',mind:'#00D4FF',career:'#F5A623',spiritual:'#E040FB',financial:'#00E676',relationships:'#FF5252',general:'#8a9bb0'};

var _goalsCache = [];
var _goalsFilter = {horizon:'all',status:'all',sort:'updated'};

// ── XSS ESCAPE ──
function _escGoal(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── DATA ──
async function loadGoals() {
  try {
    var goals = await sbFetch('goals','GET',null,'?select=*&order=sort_order.asc,updated_at.desc');
    if (goals && Array.isArray(goals)) { _goalsCache = goals; return goals; }
  } catch(e) { console.warn('[Goals] Load failed:', e); }
  return _goalsCache;
}

async function loadGoalComments(goalId) {
  try {
    var comments = await sbFetch('goal_comments','GET',null,'?goal_id=eq.'+goalId+'&order=created_at.desc');
    return comments || [];
  } catch(e) { return []; }
}

async function saveGoal(goal) {
  if (goal.id) {
    await sbFetch('goals','PATCH',goal,'?id=eq.'+goal.id);
  } else {
    await sbFetch('goals','POST',goal);
  }
  await loadGoals();
  renderGoalsPanel();
}

async function deleteGoal(goalId) {
  if (!confirm('Delete this goal permanently? This cannot be undone.')) return;
  await sbFetch('goals','DELETE',null,'?id=eq.'+goalId);
  _expandedGoalId = null;
  await loadGoals();
  renderGoalsPanel();
}

async function addGoalComment(goalId, text, type, progressFrom, progressTo) {
  var comment = {
    goal_id: goalId,
    comment_text: text,
    comment_type: type || 'update',
    progress_from: progressFrom || null,
    progress_to: progressTo || null
  };
  await sbFetch('goal_comments','POST',comment);
  if (progressTo !== null && progressTo !== undefined) {
    await sbFetch('goals','PATCH',{progress: progressTo},'?id=eq.'+goalId);
  }
  await loadGoals();
}

// ── DAYS REMAINING ──
function _daysLeft(targetDate) {
  if (!targetDate) return null;
  var diff = Math.ceil((new Date(targetDate) - new Date()) / 86400000);
  return diff;
}

function _daysLeftBadge(targetDate, status) {
  var d = _daysLeft(targetDate);
  if (d === null) return '';
  if (status === 'completed' || status === 'paused') return '';
  if (d < 0) return '<span style="font-family:var(--font-mono);font-size:7px;font-weight:700;color:var(--red,#FF5252);background:rgba(255,82,82,0.1);padding:1px 5px;border-radius:3px">OVERDUE ' + Math.abs(d) + 'd</span>';
  if (d <= 7) return '<span style="font-family:var(--font-mono);font-size:7px;font-weight:700;color:var(--gold,#F5A623);background:rgba(245,166,35,0.1);padding:1px 5px;border-radius:3px">' + d + 'd LEFT</span>';
  return '<span style="font-family:var(--font-mono);font-size:7px;color:var(--text-dim)">' + d + 'd</span>';
}

// ── RENDER MAIN PANEL ──
async function renderGoalsPanel() {
  var container = document.getElementById('goals-panel-content');
  if (!container) return;

  var goals = await loadGoals();
  var active = goals.filter(function(g) { return g.status !== 'completed' && g.status !== 'archived'; });
  var completed = goals.filter(function(g) { return g.status === 'completed' || g.status === 'archived'; });
  var overdue = active.filter(function(g) { return g.target_date && new Date(g.target_date) < new Date() && g.status !== 'paused'; });
  var atRisk = active.filter(function(g) { return g.status === 'behind' || g.status === 'blocked'; });

  var html = '';

  // ── SUMMARY METRICS ──
  html += '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:20px">';
  html += _metricCard(active.length, 'ACTIVE', 'var(--cyan)');
  html += _metricCard(completed.length, 'DONE', 'var(--green,#00E676)');
  html += _metricCard(overdue.length, 'OVERDUE', overdue.length > 0 ? 'var(--red,#FF5252)' : 'var(--text-dim)');
  html += _metricCard(atRisk.length, 'AT RISK', atRisk.length > 0 ? 'var(--gold,#F5A623)' : 'var(--text-dim)');
  html += '</div>';

  // ── FILTER BAR ──
  html += '<div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;align-items:center">';
  html += _filterSelect('goal-filter-horizon', 'HORIZON', [{v:'all',l:'ALL'}].concat(GOAL_HORIZONS.map(function(h){return{v:h,l:GOAL_HORIZON_LABELS[h]};})), _goalsFilter.horizon);
  html += _filterSelect('goal-filter-status', 'STATUS', [{v:'all',l:'ALL'}].concat(GOAL_STATUSES.map(function(s){return{v:s,l:GOAL_STATUS_LABELS[s]};})), _goalsFilter.status);
  html += _filterSelect('goal-filter-sort', 'SORT', [{v:'updated',l:'UPDATED'},{v:'progress',l:'PROGRESS'},{v:'target',l:'TARGET'},{v:'created',l:'CREATED'}], _goalsFilter.sort);
  html += '<div style="flex:1"></div>';
  html += '<button onclick="showGoalForm()" class="btn btn-primary" style="padding:8px 14px;font-size:11px;letter-spacing:1px;min-height:36px">+ ADD GOAL</button>';
  html += '</div>';

  // ── EMPTY STATE ──
  if (active.length === 0 && completed.length === 0) {
    html += '<div style="text-align:center;padding:40px 20px">';
    html += '<div style="font-size:48px;margin-bottom:12px">\uD83C\uDFAF</div>';
    html += '<div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:var(--text);margin-bottom:8px">NO GOALS YET</div>';
    html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);line-height:1.8;margin-bottom:20px">Set your first goal to start tracking.<br>Break big ambitions into weekly milestones.</div>';
    html += '<button onclick="showGoalForm()" class="btn btn-primary" style="padding:12px 24px;font-size:12px;letter-spacing:2px">+ CREATE YOUR FIRST GOAL</button>';
    html += '</div>';
  }

  // ── ACTIVE GOALS BY HORIZON ──
  var filtered = _filterGoals(active);
  var hasAnyFiltered = false;
  GOAL_HORIZONS.forEach(function(h) {
    var hGoals = filtered.filter(function(g) { return g.horizon === h; });
    if (_goalsFilter.horizon !== 'all' && hGoals.length === 0) return;
    hasAnyFiltered = hasAnyFiltered || hGoals.length > 0;
    html += '<div style="margin-bottom:16px">';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">';
    html += '<span style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:2px;color:var(--cyan,#00D4FF)">' + GOAL_HORIZON_LABELS[h] + '</span>';
    html += '<span style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim)">' + hGoals.length + '</span>';
    html += '<div style="flex:1;height:1px;background:linear-gradient(90deg,rgba(0,212,255,0.15),transparent)"></div>';
    html += '</div>';
    hGoals.forEach(function(g) { html += _renderGoalRow(g); });
    html += '</div>';
  });

  // ── COMPLETED / ARCHIVE ──
  if (completed.length > 0) {
    html += '<div style="margin-top:24px;border-top:1px solid rgba(255,255,255,0.06);padding-top:16px">';
    html += '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:2px;color:var(--green,#00E676);margin-bottom:12px">COMPLETED \u00B7 ' + completed.length + '</div>';
    completed.forEach(function(g) { html += _renderGoalRow(g, true); });
    html += '</div>';
  }

  // ── ADD GOAL FORM (hidden) ──
  html += _renderGoalForm();

  // ── GOAL DETAIL DRAWER (hidden) ──
  html += '<div id="goal-detail-drawer" style="display:none"></div>';

  // ── INLINE UPDATE FORM (hidden) ──
  html += '<div id="goal-inline-update" style="display:none"></div>';

  container.innerHTML = html;

  // Bind filter events
  ['goal-filter-horizon','goal-filter-status','goal-filter-sort'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', function() {
      if (id.includes('horizon')) _goalsFilter.horizon = this.value;
      if (id.includes('status')) _goalsFilter.status = this.value;
      if (id.includes('sort')) _goalsFilter.sort = this.value;
      renderGoalsPanel();
    });
  });
}

// ── HELPERS ──
function _metricCard(val, label, color) {
  return '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px 12px;text-align:center">' +
    '<div style="font-family:var(--font-mono);font-size:24px;font-weight:700;color:' + color + '">' + val + '</div>' +
    '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:2px;color:var(--text-dim);margin-top:2px">' + label + '</div></div>';
}

function _filterSelect(id, label, options, selected) {
  var html = '<select id="' + id + '" style="padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);color:var(--text);font-family:var(--font-mono);font-size:10px;letter-spacing:1px;min-height:36px;-webkit-appearance:none">';
  options.forEach(function(o) { html += '<option value="' + o.v + '"' + (o.v === selected ? ' selected' : '') + '>' + o.l + '</option>'; });
  return html + '</select>';
}

function _filterGoals(goals) {
  var f = goals;
  if (_goalsFilter.horizon !== 'all') f = f.filter(function(g) { return g.horizon === _goalsFilter.horizon; });
  if (_goalsFilter.status !== 'all') f = f.filter(function(g) { return g.status === _goalsFilter.status; });
  if (_goalsFilter.sort === 'progress') f.sort(function(a,b) { return b.progress - a.progress; });
  else if (_goalsFilter.sort === 'target') f.sort(function(a,b) { return (a.target_date||'9999').localeCompare(b.target_date||'9999'); });
  else if (_goalsFilter.sort === 'created') f.sort(function(a,b) { return (b.created_at||'').localeCompare(a.created_at||''); });
  return f;
}

function _renderGoalRow(g, isArchive) {
  var statusColor = GOAL_STATUS_COLORS[g.status] || 'var(--text-dim)';
  var statusLabel = GOAL_STATUS_LABELS[g.status] || g.status;
  var catIcon = GOAL_CAT_ICONS[g.category] || '\u25C6';
  var catColor = GOAL_CAT_COLORS[g.category] || '#8a9bb0';
  var timeAgo = _timeAgo(g.updated_at);
  var daysLeft = _daysLeftBadge(g.target_date, g.status);

  var html = '<div style="padding:12px;border:1px solid rgba(255,255,255,0.04);border-left:3px solid ' + statusColor + ';border-radius:0 10px 10px 0;margin-bottom:6px;cursor:pointer;transition:background 0.15s;background:rgba(255,255,255,0.01)" onclick="toggleGoalDetail(' + g.id + ')" onmouseover="this.style.background=\'rgba(255,255,255,0.03)\'" onmouseout="this.style.background=\'rgba(255,255,255,0.01)\'">';

  // Row 1: Category icon + Title + Status badge
  html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">';
  html += '<span style="font-size:16px" title="' + (g.category||'').toUpperCase() + '">' + catIcon + '</span>';
  html += '<div style="flex:1;min-width:0;font-family:var(--font-mono);font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _escGoal(g.title) + '</div>';
  html += '<span style="font-family:var(--font-mono);font-size:7px;font-weight:700;letter-spacing:1px;padding:2px 6px;border-radius:3px;background:' + statusColor + '22;color:' + statusColor + ';white-space:nowrap">' + statusLabel + '</span>';
  html += '</div>';

  // Row 2: Progress bar + % + days left + time ago
  html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">';
  html += '<div style="flex:1;height:5px;background:rgba(255,255,255,0.06);border-radius:3px;min-width:60px"><div style="height:100%;width:' + (g.progress||0) + '%;background:' + statusColor + ';border-radius:3px;transition:width 0.3s"></div></div>';
  html += '<span style="font-family:var(--font-mono);font-size:10px;color:' + statusColor + ';font-weight:700;min-width:28px;text-align:right">' + (g.progress||0) + '%</span>';
  if (daysLeft) html += daysLeft;
  html += '<span style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim);white-space:nowrap">' + timeAgo + '</span>';
  html += '</div>';

  html += '</div>';
  return html;
}

function _timeAgo(dateStr) {
  if (!dateStr) return '';
  var diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'now';
  if (diff < 3600) return Math.floor(diff/60) + 'm';
  if (diff < 86400) return Math.floor(diff/3600) + 'h';
  if (diff < 604800) return Math.floor(diff/86400) + 'd';
  return Math.floor(diff/604800) + 'w';
}

// ── GOAL DETAIL ──
var _expandedGoalId = null;

async function toggleGoalDetail(id) {
  var drawer = document.getElementById('goal-detail-drawer');
  if (!drawer) return;
  if (_expandedGoalId === id) { drawer.style.display = 'none'; _expandedGoalId = null; return; }
  _expandedGoalId = id;

  var goal = _goalsCache.find(function(g) { return g.id === id; });
  if (!goal) return;

  var comments = await loadGoalComments(id);
  var milestones = [];
  try { milestones = JSON.parse(goal.milestones || '[]'); } catch(e) {}

  var html = '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;margin:8px 0 16px">';

  // Header
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;gap:8px">';
  html += '<div style="flex:1;min-width:0">';
  html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><span style="font-size:18px">' + (GOAL_CAT_ICONS[goal.category]||'\u25C6') + '</span>';
  html += '<span style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:var(--text)">' + _escGoal(goal.title) + '</span></div>';
  if (goal.description) html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);margin-top:4px;line-height:1.5">' + _escGoal(goal.description) + '</div>';
  html += '</div>';
  html += '<div style="display:flex;gap:4px;flex-shrink:0">';
  html += '<button onclick="event.stopPropagation();showGoalForm(' + id + ')" style="font-family:var(--font-mono);font-size:8px;padding:4px 8px;border:1px solid rgba(255,255,255,0.1);border-radius:4px;background:transparent;color:var(--text-dim);cursor:pointer">EDIT</button>';
  html += '<button onclick="event.stopPropagation();deleteGoal(' + id + ')" style="font-family:var(--font-mono);font-size:8px;padding:4px 8px;border:1px solid rgba(255,82,82,0.2);border-radius:4px;background:transparent;color:var(--red,#FF5252);cursor:pointer">DELETE</button>';
  html += '</div></div>';

  // Meta row
  html += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;font-family:var(--font-mono);font-size:9px;color:var(--text-dim)">';
  html += '<span style="color:' + (GOAL_CAT_COLORS[goal.category]||'var(--text-dim)') + '">' + (goal.category||'').toUpperCase() + '</span>';
  html += '<span>' + GOAL_HORIZON_LABELS[goal.horizon] + '</span>';
  html += '<span>Start: ' + (goal.start_date||'\u2014') + '</span>';
  html += '<span>Target: ' + (goal.target_date||'\u2014') + '</span>';
  var dl = _daysLeft(goal.target_date);
  if (dl !== null && goal.status !== 'completed') html += (dl < 0 ? '<span style="color:var(--red)">OVERDUE ' + Math.abs(dl) + 'd</span>' : '<span>' + dl + 'd left</span>');
  html += '</div>';

  // ── INLINE PROGRESS SLIDER ──
  html += '<div style="margin-bottom:14px;padding:12px;background:rgba(0,212,255,0.03);border:1px solid rgba(0,212,255,0.1);border-radius:8px">';
  html += '<div style="display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:10px;margin-bottom:6px"><span style="color:var(--text-dim)">PROGRESS</span><span id="goal-prog-val-' + id + '" style="color:var(--text);font-weight:700">' + (goal.progress||0) + '%</span></div>';
  html += '<input type="range" min="0" max="100" value="' + (goal.progress||0) + '" style="width:100%;accent-color:var(--cyan,#00D4FF);height:6px" id="goal-prog-slider-' + id + '" oninput="document.getElementById(\'goal-prog-val-' + id + '\').textContent=this.value+\'%\'">';
  html += '<div style="display:flex;gap:6px;margin-top:8px">';
  html += '<input type="text" id="goal-prog-note-' + id + '" placeholder="What changed?" style="flex:1;padding:8px 10px;border:1px solid rgba(255,255,255,0.08);border-radius:6px;background:rgba(255,255,255,0.03);color:var(--text);font-family:var(--font-mono);font-size:10px;outline:none">';
  html += '<button onclick="event.stopPropagation();submitInlineProgress(' + id + ',' + (goal.progress||0) + ')" style="padding:8px 14px;background:var(--cyan,#00D4FF);color:#000;border:none;border-radius:6px;font-family:var(--font-mono);font-size:9px;font-weight:700;cursor:pointer;white-space:nowrap">UPDATE</button>';
  html += '</div></div>';

  // Milestones
  if (milestones.length > 0) {
    html += '<div style="margin-bottom:12px"><div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-dim);margin-bottom:6px">MILESTONES</div>';
    milestones.forEach(function(m) {
      html += '<div style="font-family:var(--font-mono);font-size:10px;color:' + (m.done ? 'var(--green,#00E676)' : 'var(--text-dim)') + ';padding:3px 0">' + (m.done ? '\u2713' : '\u25CB') + ' ' + _escGoal(m.title) + '</div>';
    });
    html += '</div>';
  }

  // Progress Log
  html += '<div style="margin-bottom:12px"><div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-dim);margin-bottom:6px">PROGRESS LOG</div>';
  if (comments.length === 0) {
    html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);opacity:0.5">No updates yet — use the slider above</div>';
  }
  comments.slice(0, 10).forEach(function(cm) {
    var typeColor = cm.comment_type === 'blocker' ? 'var(--red)' : cm.comment_type === 'milestone' ? 'var(--green,#00E676)' : cm.comment_type === 'completion' ? 'var(--cyan)' : cm.comment_type === 'decision' ? 'var(--gold)' : 'var(--text-dim)';
    html += '<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.03)">';
    html += '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">';
    html += '<span style="font-family:var(--font-mono);font-size:7px;font-weight:700;color:' + typeColor + ';letter-spacing:1px;text-transform:uppercase">' + _escGoal(cm.comment_type) + '</span>';
    html += '<span style="font-family:var(--font-mono);font-size:7px;color:var(--text-dim)">' + new Date(cm.created_at).toLocaleDateString() + '</span>';
    if (cm.progress_from !== null && cm.progress_to !== null) html += '<span style="font-family:var(--font-mono);font-size:7px;color:var(--text-dim)">' + cm.progress_from + '% \u2192 ' + cm.progress_to + '%</span>';
    html += '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text);margin-top:2px;line-height:1.5">' + _escGoal(cm.comment_text) + '</div>';
    html += '</div>';
  });
  if (comments.length > 10) html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);padding:4px 0">+ ' + (comments.length - 10) + ' more entries</div>';
  html += '</div>';

  // Actions
  html += '<div style="display:flex;gap:6px;flex-wrap:wrap">';
  html += '<button onclick="event.stopPropagation();showAddComment(' + id + ')" style="padding:8px 12px;font-family:var(--font-mono);font-size:9px;letter-spacing:1px;border:1px solid rgba(255,255,255,0.1);border-radius:6px;background:transparent;color:var(--text-dim);cursor:pointer;min-height:36px">ADD NOTE</button>';
  if (goal.status !== 'completed') html += '<button onclick="event.stopPropagation();markGoalComplete(' + id + ')" style="padding:8px 12px;font-family:var(--font-mono);font-size:9px;letter-spacing:1px;border:1px solid rgba(0,230,118,0.2);border-radius:6px;background:transparent;color:var(--green,#00E676);cursor:pointer;min-height:36px">\u2713 COMPLETE</button>';
  html += '</div>';

  html += '</div>';
  drawer.innerHTML = html;
  drawer.style.display = '';

  // Move drawer after the clicked row
  var rows = document.querySelectorAll('[onclick^="toggleGoalDetail"]');
  rows.forEach(function(r) {
    if (r.getAttribute('onclick').includes('(' + id + ')')) {
      r.insertAdjacentElement('afterend', drawer);
    }
  });
}

// ── INLINE PROGRESS UPDATE ──
async function submitInlineProgress(goalId, oldProgress) {
  var slider = document.getElementById('goal-prog-slider-' + goalId);
  var noteEl = document.getElementById('goal-prog-note-' + goalId);
  if (!slider) return;
  var newVal = parseInt(slider.value);
  var note = noteEl ? noteEl.value.trim() : '';
  if (newVal === oldProgress && !note) return;
  if (!note) note = 'Progress updated to ' + newVal + '%';
  await addGoalComment(goalId, note, 'update', oldProgress, newVal);
  await toggleGoalDetail(goalId); // refresh
  await toggleGoalDetail(goalId); // re-open
}

// ── ADD/EDIT GOAL FORM ──
function _renderGoalForm() {
  return '<div id="goal-form-modal" style="display:none;position:fixed;inset:0;z-index:2000;background:rgba(10,12,16,0.95);backdrop-filter:blur(8px);align-items:center;justify-content:center;padding:20px">' +
    '<div style="max-width:440px;width:100%;max-height:90vh;overflow-y:auto;padding:24px;background:var(--bg2,#121418);border:1px solid rgba(0,212,255,0.15);border-radius:12px">' +
    '<div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:var(--text);margin-bottom:16px" id="goal-form-title">ADD GOAL</div>' +
    '<input type="hidden" id="goal-edit-id">' +
    '<div style="margin-bottom:10px"><label style="font-family:var(--font-mono);font-size:9px;letter-spacing:1px;color:var(--text-dim)">TITLE *</label><input type="text" id="goal-title" class="form-input" placeholder="Goal title" style="width:100%;margin-top:4px;box-sizing:border-box"></div>' +
    '<div style="margin-bottom:10px"><label style="font-family:var(--font-mono);font-size:9px;letter-spacing:1px;color:var(--text-dim)">DESCRIPTION</label><textarea id="goal-desc" class="form-input" rows="2" placeholder="What does success look like?" style="width:100%;margin-top:4px;resize:vertical;box-sizing:border-box"></textarea></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">' +
    '<div><label style="font-family:var(--font-mono);font-size:9px;letter-spacing:1px;color:var(--text-dim)">HORIZON *</label><select id="goal-horizon" class="form-input" style="width:100%;margin-top:4px;box-sizing:border-box">' + GOAL_HORIZONS.map(function(h){return'<option value="'+h+'">'+GOAL_HORIZON_LABELS[h]+'</option>';}).join('') + '</select></div>' +
    '<div><label style="font-family:var(--font-mono);font-size:9px;letter-spacing:1px;color:var(--text-dim)">CATEGORY</label><select id="goal-category" class="form-input" style="width:100%;margin-top:4px;box-sizing:border-box">' + GOAL_CATEGORIES.map(function(c){return'<option value="'+c+'">'+GOAL_CAT_ICONS[c]+' '+c.toUpperCase()+'</option>';}).join('') + '</select></div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">' +
    '<div><label style="font-family:var(--font-mono);font-size:9px;letter-spacing:1px;color:var(--text-dim)">START DATE</label><input type="date" id="goal-start" class="form-input" style="width:100%;margin-top:4px;box-sizing:border-box"></div>' +
    '<div><label style="font-family:var(--font-mono);font-size:9px;letter-spacing:1px;color:var(--text-dim)">TARGET DATE</label><input type="date" id="goal-target" class="form-input" style="width:100%;margin-top:4px;box-sizing:border-box"></div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">' +
    '<div><label style="font-family:var(--font-mono);font-size:9px;letter-spacing:1px;color:var(--text-dim)">STATUS</label><select id="goal-status" class="form-input" style="width:100%;margin-top:4px;box-sizing:border-box">' + GOAL_STATUSES.map(function(s){return'<option value="'+s+'">'+GOAL_STATUS_LABELS[s]+'</option>';}).join('') + '</select></div>' +
    '<div><label style="font-family:var(--font-mono);font-size:9px;letter-spacing:1px;color:var(--text-dim)">PROGRESS %</label><input type="number" id="goal-progress" class="form-input" min="0" max="100" value="0" style="width:100%;margin-top:4px;box-sizing:border-box"></div>' +
    '</div>' +
    '<div style="display:flex;gap:8px">' +
    '<button onclick="submitGoalForm()" class="btn btn-primary" style="flex:1;padding:12px;min-height:44px">SAVE GOAL</button>' +
    '<button onclick="closeGoalForm()" class="btn btn-outline" style="padding:12px;min-height:44px">CANCEL</button>' +
    '</div></div></div>';
}

function showGoalForm(editId) {
  var modal = document.getElementById('goal-form-modal');
  if (!modal) return;
  modal.style.display = 'flex';

  if (editId) {
    var g = _goalsCache.find(function(x) { return x.id === editId; });
    if (g) {
      document.getElementById('goal-form-title').textContent = 'EDIT GOAL';
      document.getElementById('goal-edit-id').value = g.id;
      document.getElementById('goal-title').value = g.title || '';
      document.getElementById('goal-desc').value = g.description || '';
      document.getElementById('goal-horizon').value = g.horizon || 'weekly';
      document.getElementById('goal-category').value = g.category || 'general';
      document.getElementById('goal-start').value = g.start_date || '';
      document.getElementById('goal-target').value = g.target_date || '';
      document.getElementById('goal-status').value = g.status || 'on_track';
      document.getElementById('goal-progress').value = g.progress || 0;
    }
  } else {
    document.getElementById('goal-form-title').textContent = 'ADD GOAL';
    document.getElementById('goal-edit-id').value = '';
    document.getElementById('goal-title').value = '';
    document.getElementById('goal-desc').value = '';
    document.getElementById('goal-horizon').value = 'weekly';
    document.getElementById('goal-start').value = new Date().toISOString().split('T')[0];
    document.getElementById('goal-target').value = '';
    document.getElementById('goal-progress').value = 0;
  }
}

function closeGoalForm() {
  var modal = document.getElementById('goal-form-modal');
  if (modal) modal.style.display = 'none';
}

async function submitGoalForm() {
  var title = document.getElementById('goal-title').value.trim();
  if (!title) { alert('Title is required'); return; }
  var editId = document.getElementById('goal-edit-id').value;
  var goal = {
    title: title,
    description: document.getElementById('goal-desc').value.trim(),
    horizon: document.getElementById('goal-horizon').value,
    category: document.getElementById('goal-category').value,
    start_date: document.getElementById('goal-start').value || null,
    target_date: document.getElementById('goal-target').value || null,
    status: document.getElementById('goal-status').value,
    progress: parseInt(document.getElementById('goal-progress').value) || 0
  };
  if (editId) goal.id = parseInt(editId);
  await saveGoal(goal);
  closeGoalForm();
}

// ── QUICK ACTIONS ──
function showQuickUpdate(goalId) {
  var goal = _goalsCache.find(function(g) { return g.id === goalId; });
  if (!goal) return;
  var newProgress = prompt('Update progress (current: ' + (goal.progress||0) + '%):', goal.progress||0);
  if (newProgress === null) return;
  newProgress = parseInt(newProgress);
  if (isNaN(newProgress) || newProgress < 0 || newProgress > 100) { alert('Enter 0-100'); return; }
  var note = prompt('Progress note (what changed):');
  if (!note) return;
  addGoalComment(goalId, note, 'update', goal.progress, newProgress).then(function() { renderGoalsPanel(); });
}

function showAddComment(goalId) {
  var text = prompt('Comment:');
  if (!text) return;
  var type = prompt('Type (update/blocker/milestone/decision):', 'update');
  if (!type || GOAL_COMMENT_TYPES.indexOf(type) < 0) type = 'update';
  addGoalComment(goalId, text, type, null, null).then(function() { toggleGoalDetail(goalId); });
}

async function markGoalComplete(goalId) {
  if (!confirm('Mark this goal as COMPLETED?')) return;
  var note = prompt('Completion note (what was accomplished):');
  await addGoalComment(goalId, note || 'Goal completed', 'completion', null, 100);
  await sbFetch('goals','PATCH',{status:'completed',progress:100,completed_at:new Date().toISOString(),completion_note:note||''},'?id=eq.'+goalId);
  _expandedGoalId = null;
  await loadGoals();
  renderGoalsPanel();
}
 
