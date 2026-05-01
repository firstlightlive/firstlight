// ═══════════════════════════════════════════
// FIRST LIGHT — TOMORROW PLANNING (2MRP)
// Plan tomorrow, review today, track alignment
// ═══════════════════════════════════════════

var _tmrDebounce = null;
var _tmrActiveTab = 'plan';
var _tmrPlanDate = null;   // null = tomorrow (default)
var _tmrReviewDate = null; // null = today (default)

// ── DATA HELPERS ──

function getTomorrowPlan(date) {
  try { return JSON.parse(localStorage.getItem('fl_tomorrow_' + date) || '{}'); } catch(e) { return {}; }
}

function saveTomorrowPlan(date, data) {
  if (isDateLocked(date)) { showLockWarning(); return; }
  localStorage.setItem('fl_tomorrow_' + date, JSON.stringify(data));
  if (typeof syncSave === 'function') {
    syncSave('tomorrow_plan', Object.assign({ date: date }, data), 'date');
  }
  markSaved();
}

function getTomorrowDate() {
  var today = new Date();
  today.setDate(today.getDate() + 1);
  var y = today.getFullYear();
  var m = String(today.getMonth() + 1).padStart(2, '0');
  var d = String(today.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

function _tmrOffsetDate(base, days) {
  var d = new Date(base + 'T00:00:00');
  d.setDate(d.getDate() + days);
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + dd;
}

function navTomorrowPlanDate(delta) {
  var base = _tmrPlanDate || getTomorrowDate();
  _tmrPlanDate = _tmrOffsetDate(base, delta);
  renderTomorrowPlan();
}

function navTomorrowReviewDate(delta) {
  var base = _tmrReviewDate || getEffectiveToday();
  _tmrReviewDate = _tmrOffsetDate(base, delta);
  renderTomorrowReview();
}

function resetTomorrowPlanDate() {
  _tmrPlanDate = null;
  renderTomorrowPlan();
}

function resetTomorrowReviewDate() {
  _tmrReviewDate = null;
  renderTomorrowReview();
}

function formatDateLabel(dateStr) {
  var parts = dateStr.split('-');
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return days[d.getDay()] + ', ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}

// ── TAB SWITCH ──

function switchTomorrowTab(tab) {
  _tmrActiveTab = tab;
  ['plan','review','analytics'].forEach(function(t) {
    var btn = document.getElementById('tmrTab-' + t);
    var sec = document.getElementById('tmrSec-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
    if (sec) sec.style.display = t === tab ? 'block' : 'none';
  });
  if (tab === 'plan') renderTomorrowPlan();
  if (tab === 'review') renderTomorrowReview();
  if (tab === 'analytics') buildTomorrowAnalytics();
}

// ── RENDER: PLAN TOMORROW ──

function renderTomorrowPlan() {
  var container = document.getElementById('tmrPlanContainer');
  if (!container) return;

  var defaultDate = getTomorrowDate();
  var tmrDate = _tmrPlanDate || defaultDate;
  var data = getTomorrowPlan(tmrDate);
  var tasks = data.tasks || [];
  var isDefaultDate = (tmrDate === defaultDate);
  var locked = isDateLocked(tmrDate);

  var dateLabel = document.getElementById('tmrPlanDate');
  if (dateLabel) dateLabel.textContent = formatDateLabel(tmrDate);

  var html = '';

  // Date navigation bar
  html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap">';
  html += '<button class="btn-copy" onclick="navTomorrowPlanDate(-1)" style="padding:5px 12px">&#9664;</button>';
  html += '<div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:' + (isDefaultDate ? 'var(--cyan)' : 'var(--gold)') + ';flex:1;text-align:center">' + formatDateLabel(tmrDate) + (isDefaultDate ? ' <span style="font-size:9px;color:var(--cyan);letter-spacing:1px">[TOMORROW]</span>' : '') + '</div>';
  html += '<button class="btn-copy" onclick="navTomorrowPlanDate(1)" style="padding:5px 12px">&#9654;</button>';
  if (!isDefaultDate) html += '<button class="btn-copy" onclick="resetTomorrowPlanDate()" style="font-size:10px;padding:5px 10px;color:var(--cyan)">TOMORROW</button>';
  html += '</div>';

  if (locked) {
    html += '<div style="background:rgba(245,166,35,0.08);border:1px solid rgba(245,166,35,0.2);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-family:var(--font-mono);font-size:11px;color:var(--gold)">&#128274; This date is locked — view only</div>';
  }

  // Task list
  html += '<div id="tmrTaskList">';
  if (tasks.length === 0 && !locked) {
    // Start with one empty task and persist it immediately
    tasks = [{ text: '', priority: 'P1', estimate: '30m', done: false }];
    data.tasks = tasks;
    localStorage.setItem('fl_tomorrow_' + tmrDate, JSON.stringify(data));
  }
  tasks.forEach(function(task, i) {
    html += buildTaskRow(task, i, false, locked);
  });
  html += '</div>';

  // Add task button (max 7, not locked)
  if (tasks.length < 7 && !locked) {
    html += '<button class="btn-copy" style="margin-top:12px;width:100%" onclick="addTomorrowTask()">+ ADD TASK</button>';
  }

  // Total estimate
  var totalMin = 0;
  tasks.forEach(function(t) { totalMin += estimateToMin(t.estimate); });
  html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-top:16px;text-align:right">';
  html += 'TOTAL ESTIMATE: <span style="color:var(--cyan)">' + formatMinutes(totalMin) + '</span>';
  html += '</div>';

  container.innerHTML = html;
}

function buildTaskRow(task, index, isReview, locked) {
  var priColors = { P0: 'var(--red)', P1: 'var(--gold)', P2: 'var(--text-muted)' };
  var priColor = priColors[task.priority] || 'var(--text-muted)';
  var readOnly = isReview || locked;

  var html = '<div class="panel-section" style="padding:12px 14px;margin-bottom:8px;border-color:' +
    (task.done ? 'rgba(0,230,118,0.15)' : 'rgba(0,212,255,0.06)') + '">';

  // Row 1: checkbox + text
  html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">';
  html += '<div class="ritual-check" style="' +
    (task.done ? 'background:var(--green);border-color:var(--green);color:#0A0C10;font-size:10px' : '') +
    ';cursor:' + (locked ? 'default' : 'pointer') + ';flex-shrink:0"' +
    (locked ? '' : ' onclick="toggleTomorrowTask(' + index + ',' + isReview + ')"') + '>' +
    (task.done ? '&#10003;' : '') + '</div>';

  if (readOnly) {
    html += '<div style="flex:1;font-size:13px;color:var(--text);' +
      (task.done ? 'text-decoration:line-through;opacity:0.5' : '') + '">' +
      (task.text || '<em style="color:var(--text-dim)">Empty task</em>') + '</div>';
  } else {
    html += '<input type="text" class="form-input" value="' + escTmrAttr(task.text) + '" ' +
      'placeholder="Task description..." ' +
      'style="flex:1;font-size:13px" ' +
      'oninput="updateTomorrowTask(' + index + ',\'text\',this.value)">';
  }

  // Remove button (plan mode, not locked)
  if (!readOnly) {
    html += '<span style="cursor:pointer;color:var(--text-dim);font-size:16px;padding:4px" ' +
      'onclick="removeTomorrowTask(' + index + ')">&#215;</span>';
  }
  html += '</div>';

  // Row 2: priority + estimate
  html += '<div style="display:flex;align-items:center;gap:12px">';

  if (readOnly) {
    html += '<span style="font-family:var(--font-mono);font-size:10px;font-weight:600;color:' + priColor +
      ';letter-spacing:1px;padding:2px 8px;border:1px solid ' + priColor + ';border-radius:4px">' + task.priority + '</span>';
    html += '<span style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim)">' + task.estimate + '</span>';
  } else {
    html += '<select class="form-input" style="width:70px;font-size:11px;padding:4px 6px;color:' + priColor + '" ' +
      'onchange="updateTomorrowTask(' + index + ',\'priority\',this.value)">';
    ['P0','P1','P2'].forEach(function(p) {
      html += '<option value="' + p + '"' + (task.priority === p ? ' selected' : '') + '>' + p + '</option>';
    });
    html += '</select>';

    html += '<select class="form-input" style="width:80px;font-size:11px;padding:4px 6px" ' +
      'onchange="updateTomorrowTask(' + index + ',\'estimate\',this.value)">';
    ['15m','30m','1h','2h','4h'].forEach(function(e) {
      html += '<option value="' + e + '"' + (task.estimate === e ? ' selected' : '') + '>' + e + '</option>';
    });
    html += '</select>';
  }

  html += '</div>';
  html += '</div>';
  return html;
}

function escTmrAttr(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function estimateToMin(est) {
  if (!est) return 0;
  if (est === '15m') return 15;
  if (est === '30m') return 30;
  if (est === '1h') return 60;
  if (est === '2h') return 120;
  if (est === '4h') return 240;
  return 0;
}

function formatMinutes(min) {
  if (min < 60) return min + 'm';
  var h = Math.floor(min / 60);
  var m = min % 60;
  return h + 'h' + (m > 0 ? ' ' + m + 'm' : '');
}

// ── TASK MUTATIONS ──

function updateTomorrowTask(index, field, value) {
  var tmrDate = _tmrPlanDate || getTomorrowDate();
  var data = getTomorrowPlan(tmrDate);
  var tasks = data.tasks || [];
  // Auto-extend tasks array if needed (handles initial empty-task state)
  while (tasks.length <= index) {
    tasks.push({ text: '', priority: 'P1', estimate: '30m', done: false });
  }
  tasks[index][field] = value;
  data.tasks = tasks;

  // Quick localStorage update for responsiveness
  localStorage.setItem('fl_tomorrow_' + tmrDate, JSON.stringify(data));

  // Debounced Supabase save
  clearTimeout(_tmrDebounce);
  _tmrDebounce = setTimeout(function() {
    saveTomorrowPlan(tmrDate, data);
  }, 800);
}

function addTomorrowTask() {
  var tmrDate = _tmrPlanDate || getTomorrowDate();
  var data = getTomorrowPlan(tmrDate);
  var tasks = data.tasks || [];
  if (tasks.length >= 7) return;
  tasks.push({ text: '', priority: 'P1', estimate: '30m', done: false });
  data.tasks = tasks;
  saveTomorrowPlan(tmrDate, data);
  renderTomorrowPlan();
}

function removeTomorrowTask(index) {
  var tmrDate = _tmrPlanDate || getTomorrowDate();
  var data = getTomorrowPlan(tmrDate);
  var tasks = data.tasks || [];
  tasks.splice(index, 1);
  data.tasks = tasks;
  saveTomorrowPlan(tmrDate, data);
  renderTomorrowPlan();
}

function toggleTomorrowTask(index, isReview) {
  var date = isReview ? (_tmrReviewDate || getEffectiveToday()) : (_tmrPlanDate || getTomorrowDate());
  var data = getTomorrowPlan(date);
  var tasks = data.tasks || [];
  if (!tasks[index]) return;
  tasks[index].done = !tasks[index].done;
  data.tasks = tasks;

  // Recalculate executed_pct
  if (isReview) {
    var total = tasks.length;
    var done = tasks.filter(function(t) { return t.done; }).length;
    data.executed_pct = total > 0 ? Math.round(done / total * 100) : 0;
  }

  saveTomorrowPlan(date, data);
  if (isReview) renderTomorrowReview(); else renderTomorrowPlan();
}

// ── RENDER: REVIEW TODAY ──

function renderTomorrowReview() {
  var container = document.getElementById('tmrReviewContainer');
  if (!container) return;

  var defaultDate = getEffectiveToday();
  var today = _tmrReviewDate || defaultDate;
  var data = getTomorrowPlan(today);
  var tasks = data.tasks || [];
  var isDefaultDate = (today === defaultDate);

  var dateLabel = document.getElementById('tmrReviewDate');
  if (dateLabel) dateLabel.textContent = formatDateLabel(today);

  var html = '';

  // Date navigation bar
  html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap">';
  html += '<button class="btn-copy" onclick="navTomorrowReviewDate(-1)" style="padding:5px 12px">&#9664;</button>';
  html += '<div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:' + (isDefaultDate ? 'var(--gold)' : 'var(--text)') + ';flex:1;text-align:center">' + formatDateLabel(today) + (isDefaultDate ? ' <span style="font-size:9px;color:var(--gold);letter-spacing:1px">[TODAY]</span>' : '') + '</div>';
  html += '<button class="btn-copy" onclick="navTomorrowReviewDate(1)" style="padding:5px 12px">&#9654;</button>';
  if (!isDefaultDate) html += '<button class="btn-copy" onclick="resetTomorrowReviewDate()" style="font-size:10px;padding:5px 10px;color:var(--gold)">TODAY</button>';
  html += '</div>';

  if (tasks.length === 0) {
    html += '<div class="panel-section" style="text-align:center;padding:40px 20px">';
    html += '<div style="font-size:32px;margin-bottom:12px;opacity:0.3">&#128203;</div>';
    html += '<div style="font-family:var(--font-mono);font-size:12px;color:var(--text-dim)">No plan was set for ' + (isDefaultDate ? 'today' : 'this date') + '.</div>';
    html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);margin-top:4px">Plan tomorrow tonight to see tasks here.</div>';
    html += '</div>';
    container.innerHTML = html;
    return;
  }

  // Task checklist
  html += '<div id="tmrReviewList">';
  tasks.forEach(function(task, i) {
    html += buildTaskRow(task, i, true);
  });
  html += '</div>';

  // Alignment score
  var total = tasks.length;
  var done = tasks.filter(function(t) { return t.done; }).length;
  var pct = total > 0 ? Math.round(done / total * 100) : 0;
  data.executed_pct = pct;

  var pctColor = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--gold)' : 'var(--red)';

  html += '<div class="panel-section" style="text-align:center;padding:28px 20px;margin-top:16px;border-color:' +
    (pct >= 80 ? 'rgba(0,230,118,0.15)' : pct >= 50 ? 'rgba(245,166,35,0.15)' : 'rgba(255,82,82,0.15)') + '">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted);margin-bottom:8px">ALIGNMENT SCORE</div>';
  html += '<div style="font-family:var(--font-mono);font-size:48px;font-weight:700;color:' + pctColor + '">' + pct + '%</div>';
  html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);margin-top:4px">' + done + ' / ' + total + ' tasks executed</div>';
  html += '</div>';

  // Notes field
  html += '<div class="panel-section" style="margin-top:16px">';
  html += '<div class="panel-section-title">SHIFT NOTES</div>';
  html += '<textarea class="form-input" rows="3" placeholder="What shifted? What changed from the plan?" ' +
    'style="width:100%;margin-top:8px" ' +
    'oninput="updateTomorrowReviewNotes(this.value)">' + escTmrAttr(data.review_notes || '') + '</textarea>';
  html += '</div>';

  container.innerHTML = html;
}

function updateTomorrowReviewNotes(value) {
  var today = _tmrReviewDate || getEffectiveToday();
  var data = getTomorrowPlan(today);
  data.review_notes = value;

  localStorage.setItem('fl_tomorrow_' + today, JSON.stringify(data));
  clearTimeout(_tmrDebounce);
  _tmrDebounce = setTimeout(function() {
    saveTomorrowPlan(today, data);
  }, 800);
}

// ── RENDER: 30-DAY ANALYTICS ──

function buildTomorrowAnalytics() {
  var container = document.getElementById('tmrAnalyticsContainer');
  if (!container) return;

  var today = getEffectiveToday();
  var scores = [];
  var totalPct = 0;
  var daysWithPlan = 0;

  for (var i = 29; i >= 0; i--) {
    var d = new Date();
    d.setDate(d.getDate() - i);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    var dateStr = y + '-' + m + '-' + dd;

    var data = getTomorrowPlan(dateStr);
    var hasPlan = data.tasks && data.tasks.length > 0;
    var pct = typeof data.executed_pct === 'number' ? data.executed_pct : -1;

    scores.push({ date: dateStr, day: d.getDate(), pct: pct, hasPlan: hasPlan });
    if (hasPlan) {
      daysWithPlan++;
      totalPct += (pct >= 0 ? pct : 0);
    }
  }

  var avgPct = daysWithPlan > 0 ? Math.round(totalPct / daysWithPlan) : 0;
  var avgColor = avgPct >= 80 ? 'var(--green)' : avgPct >= 50 ? 'var(--gold)' : 'var(--red)';

  var html = '';

  // Summary
  html += '<div class="panel-section" style="text-align:center;padding:24px 20px;margin-bottom:16px">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted);margin-bottom:8px">30-DAY AVG ALIGNMENT</div>';
  html += '<div style="font-family:var(--font-mono);font-size:42px;font-weight:700;color:' + avgColor + '">' + avgPct + '%</div>';
  html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);margin-top:4px">' + daysWithPlan + ' / 30 days planned</div>';
  html += '</div>';

  // Bar chart
  html += '<div class="panel-section" style="padding:20px 14px">';
  html += '<div class="panel-section-title">DAILY ALIGNMENT</div>';
  html += '<div style="display:flex;align-items:flex-end;gap:3px;height:120px;margin-top:12px">';

  scores.forEach(function(s) {
    var barH = s.pct >= 0 ? Math.max(s.pct * 1.1, 4) : 4;
    var barColor = !s.hasPlan ? 'rgba(255,255,255,0.05)' :
      s.pct >= 80 ? 'var(--green)' :
      s.pct >= 50 ? 'var(--gold)' : 'var(--red)';
    var opacity = s.hasPlan ? '1' : '0.3';

    html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%">';
    html += '<div style="width:100%;height:' + barH + '%;background:' + barColor + ';opacity:' + opacity +
      ';border-radius:2px 2px 0 0;min-height:2px" title="' + s.date + ': ' + (s.pct >= 0 ? s.pct + '%' : 'No data') + '"></div>';
    // Show day label every 5 days
    if (s.day % 5 === 0 || s.day === 1) {
      html += '<div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim);margin-top:4px">' + s.day + '</div>';
    }
    html += '</div>';
  });

  html += '</div>';
  html += '</div>';

  // Legend
  html += '<div style="display:flex;gap:16px;justify-content:center;margin-top:12px;font-family:var(--font-mono);font-size:10px;color:var(--text-dim)">';
  html += '<span><span style="display:inline-block;width:8px;height:8px;background:var(--green);border-radius:2px;margin-right:4px"></span>80%+</span>';
  html += '<span><span style="display:inline-block;width:8px;height:8px;background:var(--gold);border-radius:2px;margin-right:4px"></span>50-79%</span>';
  html += '<span><span style="display:inline-block;width:8px;height:8px;background:var(--red);border-radius:2px;margin-right:4px"></span>&lt;50%</span>';
  html += '<span><span style="display:inline-block;width:8px;height:8px;background:rgba(255,255,255,0.05);border-radius:2px;margin-right:4px"></span>No plan</span>';
  html += '</div>';

  container.innerHTML = html;
}
 
