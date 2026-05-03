// ═══════════════════════════════════════════
// FIRST LIGHT — TOMORROW PLANNING (2MRP)
// Single-page: Today's execution + Tomorrow's plan + 30-day trend
// No tabs — everything visible in one scroll
// ═══════════════════════════════════════════

var _tmrDebounce = null;
var _tmrTrendOpen = false;
var _tmrPlanOffset = 0;   // 0 = tomorrow, -1 = day after, +1 = yesterday's tomorrow
var _tmrReviewOffset = 0; // 0 = today, -1 = yesterday, +1 = tomorrow

// ── DATA HELPERS ──

function getTomorrowPlan(date) {
  try { return JSON.parse(localStorage.getItem('fl_tomorrow_' + date) || '{}'); } catch(e) { return {}; }
}

function saveTomorrowPlan(date, data) {
  if (typeof isDateLocked === 'function' && isDateLocked(date)) { showLockWarning(); return; }
  localStorage.setItem('fl_tomorrow_' + date, JSON.stringify(data));
  if (typeof syncSave === 'function') {
    var payload = { date: date };
    payload.tasks = JSON.stringify(data.tasks || []);
    payload.executed_pct = data.executed_pct || 0;
    payload.review_notes = data.review_notes || '';
    syncSave('tomorrow_plan', payload, 'date');
  }
  if (typeof markSaved === 'function') markSaved();
}

function getTomorrowDate() {
  var t = new Date();
  t.setDate(t.getDate() + 1);
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
}

function _tmrDateOffset(base, days) {
  var d = new Date(base + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function _tmrFmtDate(dateStr) {
  var parts = dateStr.split('-');
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return days[d.getDay()] + ', ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}

function _tmrEsc(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function _tmrEstMin(est) {
  if (est === '15m') return 15;
  if (est === '30m') return 30;
  if (est === '1h') return 60;
  if (est === '2h') return 120;
  if (est === '4h') return 240;
  return 0;
}

function _tmrFmtMin(min) {
  if (min < 60) return min + 'm';
  var h = Math.floor(min / 60), m = min % 60;
  return h + 'h' + (m ? ' ' + m + 'm' : '');
}

// ── MAIN RENDER ──

function renderTomorrowPanel() {
  var container = document.getElementById('tmr-main');
  if (!container) return;

  var today = typeof getEffectiveToday === 'function' ? getEffectiveToday() : new Date().toISOString().slice(0, 10);
  var tomorrow = getTomorrowDate();

  // Execution section: review TODAY's plan (plan was saved for today)
  var execDate = _tmrDateOffset(today, _tmrReviewOffset);
  var execData = getTomorrowPlan(execDate);
  var execTasks = execData.tasks || [];
  if (typeof execData.tasks === 'string') {
    try { execTasks = JSON.parse(execData.tasks); } catch(e) { execTasks = []; }
  }

  // Plan section: planning for TOMORROW
  var planDate = _tmrDateOffset(tomorrow, _tmrPlanOffset);
  var planData = getTomorrowPlan(planDate);
  var planTasks = planData.tasks || [];
  if (typeof planData.tasks === 'string') {
    try { planTasks = JSON.parse(planData.tasks); } catch(e) { planTasks = []; }
  }

  var done = execTasks.filter(function(t) { return t.done; }).length;
  var total = execTasks.length;
  var pct = total > 0 ? Math.round(done / total * 100) : -1;
  var pctColor = pct < 0 ? 'var(--text-dim)' : pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--gold)' : 'var(--red)';
  var isExecToday = execDate === today;
  var isPlanTomorrow = planDate === tomorrow;

  var totalMin = planTasks.reduce(function(s, t) { return s + _tmrEstMin(t.estimate); }, 0);

  var html = '';

  // ════════════════════════════════════════
  // SECTION 1: TODAY'S EXECUTION
  // ════════════════════════════════════════
  html += '<div style="margin-bottom:28px">';

  // Header row
  html += '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;gap:12px">';
  html += '<div>';
  html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:3px;color:var(--text-dim);margin-bottom:4px">TODAY\'S EXECUTION</div>';
  html += '<div style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:' + (isExecToday ? 'var(--gold)' : 'var(--text)') + '">';
  html += _tmrFmtDate(execDate);
  if (isExecToday) html += ' <span style="font-size:9px;color:var(--gold);letter-spacing:1px">[TODAY]</span>';
  html += '</div>';
  html += '<div style="display:flex;gap:6px;margin-top:8px;align-items:center">';
  html += '<button class="btn-copy" onclick="_tmrReviewOffset--;renderTomorrowPanel()" style="padding:3px 10px;font-size:10px">&#9664;</button>';
  if (!isExecToday) html += '<button class="btn-copy" onclick="_tmrReviewOffset=0;renderTomorrowPanel()" style="padding:3px 10px;font-size:10px;color:var(--gold)">TODAY</button>';
  html += '<button class="btn-copy" onclick="_tmrReviewOffset++;renderTomorrowPanel()" style="padding:3px 10px;font-size:10px">&#9654;</button>';
  html += '</div>';
  html += '</div>';

  // Alignment score
  html += '<div style="text-align:center;min-width:80px">';
  if (pct >= 0) {
    html += '<div style="font-family:var(--font-mono);font-size:42px;font-weight:900;line-height:1;color:' + pctColor + '">' + pct + '<span style="font-size:20px">%</span></div>';
    html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);letter-spacing:1px;margin-top:4px">ALIGNMENT</div>';
    html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-top:2px">' + done + '/' + total + ' DONE</div>';
  } else {
    html += '<div style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:var(--text-dim)">—</div>';
    html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);letter-spacing:1px;margin-top:4px">NO PLAN</div>';
  }
  html += '</div>';
  html += '</div>'; // end header row

  // Alignment progress bar
  if (pct >= 0) {
    html += '<div style="height:3px;background:rgba(255,255,255,0.06);border-radius:2px;margin-bottom:16px;overflow:hidden">';
    html += '<div style="height:100%;width:' + pct + '%;background:' + pctColor + ';border-radius:2px;transition:width 0.6s ease"></div>';
    html += '</div>';
  }

  // Task list (execution view — checkboxes, no editing)
  if (execTasks.length === 0) {
    html += '<div style="text-align:center;padding:28px 16px;background:rgba(255,255,255,0.02);border:1px dashed rgba(255,255,255,0.07);border-radius:8px;margin-bottom:14px">';
    html += '<div style="font-size:28px;margin-bottom:8px;opacity:0.2">📋</div>';
    html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim)">No plan was set for ' + (isExecToday ? 'today' : _tmrFmtDate(execDate)) + '.</div>';
    html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);margin-top:4px;opacity:0.6">Plan tomorrow tonight to see your tasks here each morning.</div>';
    html += '</div>';
  } else {
    var priColors = { P0: 'var(--red)', P1: 'var(--gold)', P2: 'rgba(255,255,255,0.3)' };
    execTasks.forEach(function(task, i) {
      var isDone = task.done;
      var pColor = priColors[task.priority] || 'rgba(255,255,255,0.3)';
      html += '<div onclick="tmrToggleExec(' + i + ')" style="display:flex;align-items:center;gap:10px;padding:11px 14px;background:' + (isDone ? 'rgba(0,230,118,0.04)' : 'rgba(255,255,255,0.02)') + ';border:1px solid ' + (isDone ? 'rgba(0,230,118,0.12)' : 'rgba(255,255,255,0.06)') + ';border-radius:8px;margin-bottom:6px;cursor:pointer;transition:all 0.15s" onmouseover="this.style.borderColor=\'rgba(0,212,255,0.2)\'" onmouseout="this.style.borderColor=\'' + (isDone ? 'rgba(0,230,118,0.12)' : 'rgba(255,255,255,0.06)') + '\'">';
      // Checkbox
      html += '<div style="width:18px;height:18px;border:2px solid ' + (isDone ? 'var(--green)' : 'rgba(255,255,255,0.2)') + ';border-radius:4px;background:' + (isDone ? 'var(--green)' : 'transparent') + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all 0.15s">';
      if (isDone) html += '<span style="color:#0A0C10;font-size:11px;font-weight:700">✓</span>';
      html += '</div>';
      // Task text
      html += '<div style="flex:1;font-family:var(--font-mono);font-size:12px;color:' + (isDone ? 'rgba(255,255,255,0.35)' : 'var(--text)') + ';' + (isDone ? 'text-decoration:line-through;' : '') + '">' + (_tmrEsc(task.text) || '<em style="color:var(--text-dim)">Empty task</em>') + '</div>';
      // Meta
      html += '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0">';
      html += '<span style="font-family:var(--font-mono);font-size:9px;padding:2px 6px;border:1px solid ' + pColor + ';color:' + pColor + ';border-radius:3px">' + (task.priority || 'P1') + '</span>';
      if (task.estimate) html += '<span style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim)">' + task.estimate + '</span>';
      html += '</div>';
      html += '</div>';
    });
  }

  // Shift notes
  html += '<div style="margin-top:12px">';
  html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-dim);margin-bottom:6px">SHIFT NOTES — WHAT CHANGED FROM THE PLAN?</div>';
  html += '<textarea class="form-input" rows="2" placeholder="What shifted? Unexpected tasks, blockers, wins?" style="width:100%;font-size:11px;padding:8px 10px;resize:vertical" oninput="tmrSaveReviewNotes(this.value)">' + _tmrEsc(execData.review_notes || '') + '</textarea>';
  html += '</div>';

  html += '</div>'; // end execution section

  // ── DIVIDER ──
  html += '<div style="border-top:1px solid rgba(255,255,255,0.06);margin-bottom:28px;position:relative">';
  html += '<div style="position:absolute;top:-9px;left:50%;transform:translateX(-50%);background:var(--bg2);padding:0 12px;font-family:var(--font-mono);font-size:9px;color:var(--text-dim);letter-spacing:2px">PLAN ↓</div>';
  html += '</div>';

  // ════════════════════════════════════════
  // SECTION 2: TOMORROW'S PLAN
  // ════════════════════════════════════════
  html += '<div style="margin-bottom:28px">';

  // Header row
  html += '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;gap:12px">';
  html += '<div>';
  html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:3px;color:var(--text-dim);margin-bottom:4px">PLANNING FOR</div>';
  html += '<div style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:' + (isPlanTomorrow ? 'var(--cyan)' : 'var(--text)') + '">';
  html += _tmrFmtDate(planDate);
  if (isPlanTomorrow) html += ' <span style="font-size:9px;color:var(--cyan);letter-spacing:1px">[TOMORROW]</span>';
  html += '</div>';
  html += '<div style="display:flex;gap:6px;margin-top:8px;align-items:center">';
  html += '<button class="btn-copy" onclick="_tmrPlanOffset--;renderTomorrowPanel()" style="padding:3px 10px;font-size:10px">&#9664;</button>';
  if (!isPlanTomorrow) html += '<button class="btn-copy" onclick="_tmrPlanOffset=0;renderTomorrowPanel()" style="padding:3px 10px;font-size:10px;color:var(--cyan)">TOMORROW</button>';
  html += '<button class="btn-copy" onclick="_tmrPlanOffset++;renderTomorrowPanel()" style="padding:3px 10px;font-size:10px">&#9654;</button>';
  html += '</div>';
  html += '</div>';
  // Total estimate badge
  html += '<div style="text-align:right">';
  if (totalMin > 0) {
    html += '<div style="font-family:var(--font-mono);font-size:22px;font-weight:700;color:var(--cyan)">' + _tmrFmtMin(totalMin) + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);letter-spacing:1px">TOTAL</div>';
  }
  html += '</div>';
  html += '</div>'; // end header row

  // Plan task list (editable)
  if (planTasks.length === 0) {
    html += '<div style="text-align:center;padding:28px 16px;background:rgba(0,212,255,0.02);border:1px dashed rgba(0,212,255,0.1);border-radius:8px;margin-bottom:14px">';
    html += '<div style="font-size:28px;margin-bottom:8px;opacity:0.2">✍️</div>';
    html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim)">No tasks planned yet for ' + _tmrFmtDate(planDate) + '.</div>';
    html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);margin-top:4px;opacity:0.6">Add your top 3-7 tasks below.</div>';
    html += '</div>';
  } else {
    var priC = { P0: 'var(--red)', P1: 'var(--gold)', P2: 'rgba(255,255,255,0.3)' };
    planTasks.forEach(function(task, i) {
      var pColor2 = priC[task.priority] || 'var(--gold)';
      html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:8px;margin-bottom:6px">';
      // Priority selector
      html += '<select class="form-input" style="width:56px;font-size:10px;padding:3px 4px;color:' + pColor2 + ';flex-shrink:0" onchange="tmrUpdateTask(\'' + planDate + '\',' + i + ',\'priority\',this.value)">';
      ['P0','P1','P2'].forEach(function(p) {
        html += '<option value="' + p + '"' + (task.priority === p ? ' selected' : '') + '>' + p + '</option>';
      });
      html += '</select>';
      // Text input
      html += '<input type="text" class="form-input" value="' + _tmrEsc(task.text) + '" placeholder="Task description..." style="flex:1;font-size:12px;padding:6px 8px" oninput="tmrUpdateTask(\'' + planDate + '\',' + i + ',\'text\',this.value)">';
      // Estimate
      html += '<select class="form-input" style="width:62px;font-size:10px;padding:3px 4px;flex-shrink:0" onchange="tmrUpdateTask(\'' + planDate + '\',' + i + ',\'estimate\',this.value)">';
      ['15m','30m','1h','2h','4h'].forEach(function(e) {
        html += '<option value="' + e + '"' + (task.estimate === e ? ' selected' : '') + '>' + e + '</option>';
      });
      html += '</select>';
      // Remove
      html += '<button type="button" style="background:none;border:none;color:rgba(255,82,82,0.5);font-size:16px;cursor:pointer;padding:0 4px;flex-shrink:0;line-height:1" onclick="tmrRemoveTask(\'' + planDate + '\',' + i + ')">×</button>';
      html += '</div>';
    });
  }

  // Add task + total
  if (planTasks.length < 7) {
    html += '<button class="btn-copy" style="width:100%;margin-top:8px" onclick="tmrAddTask(\'' + planDate + '\')">+ ADD TASK</button>';
  } else {
    html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);text-align:center;margin-top:8px;opacity:0.5">Max 7 tasks — keep it focused</div>';
  }

  html += '</div>'; // end plan section

  // ── DIVIDER ──
  html += '<div style="border-top:1px solid rgba(255,255,255,0.06);margin-bottom:20px"></div>';

  // ════════════════════════════════════════
  // SECTION 3: 30-DAY TREND (collapsible)
  // ════════════════════════════════════════
  html += '<div>';
  html += '<div onclick="tmrToggleTrend()" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:4px 0;user-select:none" onmouseover="this.style.opacity=\'0.7\'" onmouseout="this.style.opacity=\'1\'">';
  html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:3px;color:var(--text-dim)">30-DAY ALIGNMENT TREND</div>';
  html += '<div style="font-family:var(--font-mono);font-size:12px;color:var(--text-dim);transition:transform 0.2s" id="tmr-trend-arrow">' + (_tmrTrendOpen ? '▴' : '▾') + '</div>';
  html += '</div>';
  html += '<div id="tmr-trend-body" style="display:' + (_tmrTrendOpen ? 'block' : 'none') + ';margin-top:16px">';
  if (_tmrTrendOpen) html += _tmrBuildTrend();
  html += '</div>';
  html += '</div>';

  container.innerHTML = html;
}

// ── EXECUTION ACTIONS ──

function tmrToggleExec(index) {
  var today = typeof getEffectiveToday === 'function' ? getEffectiveToday() : new Date().toISOString().slice(0, 10);
  var execDate = _tmrDateOffset(today, _tmrReviewOffset);
  var data = getTomorrowPlan(execDate);
  var tasks = data.tasks || [];
  if (typeof tasks === 'string') { try { tasks = JSON.parse(tasks); } catch(e) { tasks = []; } }
  if (!tasks[index]) return;
  tasks[index].done = !tasks[index].done;
  data.tasks = tasks;
  var done = tasks.filter(function(t) { return t.done; }).length;
  data.executed_pct = tasks.length > 0 ? Math.round(done / tasks.length * 100) : 0;
  saveTomorrowPlan(execDate, data);
  renderTomorrowPanel();
}

function tmrSaveReviewNotes(value) {
  var today = typeof getEffectiveToday === 'function' ? getEffectiveToday() : new Date().toISOString().slice(0, 10);
  var execDate = _tmrDateOffset(today, _tmrReviewOffset);
  var data = getTomorrowPlan(execDate);
  data.review_notes = value;
  clearTimeout(_tmrDebounce);
  _tmrDebounce = setTimeout(function() { saveTomorrowPlan(execDate, data); }, 800);
  localStorage.setItem('fl_tomorrow_' + execDate, JSON.stringify(data));
}

// ── PLAN ACTIONS ──

function tmrAddTask(planDate) {
  var data = getTomorrowPlan(planDate);
  var tasks = data.tasks || [];
  if (typeof tasks === 'string') { try { tasks = JSON.parse(tasks); } catch(e) { tasks = []; } }
  if (tasks.length >= 7) return;
  tasks.push({ text: '', priority: 'P1', estimate: '30m', done: false });
  data.tasks = tasks;
  saveTomorrowPlan(planDate, data);
  renderTomorrowPanel();
}

function tmrRemoveTask(planDate, index) {
  var data = getTomorrowPlan(planDate);
  var tasks = data.tasks || [];
  if (typeof tasks === 'string') { try { tasks = JSON.parse(tasks); } catch(e) { tasks = []; } }
  tasks.splice(index, 1);
  data.tasks = tasks;
  saveTomorrowPlan(planDate, data);
  renderTomorrowPanel();
}

function tmrUpdateTask(planDate, index, field, value) {
  var data = getTomorrowPlan(planDate);
  var tasks = data.tasks || [];
  if (typeof tasks === 'string') { try { tasks = JSON.parse(tasks); } catch(e) { tasks = []; } }
  while (tasks.length <= index) {
    tasks.push({ text: '', priority: 'P1', estimate: '30m', done: false });
  }
  tasks[index][field] = value;
  data.tasks = tasks;
  // Immediate localStorage write (no data loss on navigate)
  localStorage.setItem('fl_tomorrow_' + planDate, JSON.stringify(data));
  // Debounced Supabase write
  clearTimeout(_tmrDebounce);
  _tmrDebounce = setTimeout(function() { saveTomorrowPlan(planDate, data); }, 800);
}

// ── 30-DAY TREND ──

function tmrToggleTrend() {
  _tmrTrendOpen = !_tmrTrendOpen;
  var body = document.getElementById('tmr-trend-body');
  var arrow = document.getElementById('tmr-trend-arrow');
  if (body) {
    body.style.display = _tmrTrendOpen ? 'block' : 'none';
    if (_tmrTrendOpen && !body.innerHTML.trim()) body.innerHTML = _tmrBuildTrend();
  }
  if (arrow) arrow.textContent = _tmrTrendOpen ? '▴' : '▾';
}

function _tmrBuildTrend() {
  var today = typeof getEffectiveToday === 'function' ? getEffectiveToday() : new Date().toISOString().slice(0, 10);
  var scores = [];
  var totalPct = 0, daysWithPlan = 0;

  for (var i = 29; i >= 0; i--) {
    var d = _tmrDateOffset(today, -i);
    var data = getTomorrowPlan(d);
    var tasks = data.tasks || [];
    if (typeof tasks === 'string') { try { tasks = JSON.parse(tasks); } catch(e) { tasks = []; } }
    var hasPlan = tasks.length > 0;
    var pct = typeof data.executed_pct === 'number' ? data.executed_pct : (hasPlan ? -1 : -2);
    scores.push({ date: d, pct: pct, hasPlan: hasPlan });
    if (hasPlan) {
      daysWithPlan++;
      totalPct += (pct >= 0 ? pct : 0);
    }
  }

  var avgPct = daysWithPlan > 0 ? Math.round(totalPct / daysWithPlan) : 0;
  var avgColor = avgPct >= 80 ? 'var(--green)' : avgPct >= 50 ? 'var(--gold)' : 'var(--red)';

  var html = '';

  // Summary row
  html += '<div style="display:flex;gap:20px;margin-bottom:16px">';
  html += '<div style="text-align:center"><div style="font-family:var(--font-mono);font-size:28px;font-weight:700;color:' + avgColor + '">' + avgPct + '%</div><div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);letter-spacing:1px">AVG ALIGNMENT</div></div>';
  html += '<div style="text-align:center"><div style="font-family:var(--font-mono);font-size:28px;font-weight:700;color:var(--cyan)">' + daysWithPlan + '</div><div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);letter-spacing:1px">DAYS PLANNED</div></div>';
  html += '</div>';

  // Bar chart
  html += '<div style="display:flex;align-items:flex-end;gap:2px;height:80px">';
  scores.forEach(function(s, idx) {
    var barH = s.pct >= 0 ? Math.max(s.pct * 0.74, 4) : (s.hasPlan ? 8 : 3);
    var barColor = !s.hasPlan ? 'rgba(255,255,255,0.04)' : s.pct >= 80 ? '#00E676' : s.pct >= 50 ? '#F5A623' : s.pct >= 0 ? '#FF5252' : 'rgba(255,255,255,0.1)';
    var dayNum = parseInt(s.date.split('-')[2]);
    html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%">';
    html += '<div title="' + s.date + ': ' + (s.pct >= 0 ? s.pct + '%' : (s.hasPlan ? 'planned, not executed' : 'no plan')) + '" style="width:100%;height:' + barH + '%;background:' + barColor + ';border-radius:2px 2px 0 0;min-height:2px"></div>';
    if (dayNum === 1 || idx === 0 || dayNum % 7 === 0) {
      html += '<div style="font-family:var(--font-mono);font-size:7px;color:var(--text-dim);margin-top:3px">' + dayNum + '</div>';
    }
    html += '</div>';
  });
  html += '</div>';

  // Legend
  html += '<div style="display:flex;gap:12px;margin-top:10px;font-family:var(--font-mono);font-size:9px;color:var(--text-dim);flex-wrap:wrap">';
  html += '<span><span style="display:inline-block;width:8px;height:8px;background:#00E676;border-radius:2px;margin-right:4px;vertical-align:middle"></span>80%+</span>';
  html += '<span><span style="display:inline-block;width:8px;height:8px;background:#F5A623;border-radius:2px;margin-right:4px;vertical-align:middle"></span>50–79%</span>';
  html += '<span><span style="display:inline-block;width:8px;height:8px;background:#FF5252;border-radius:2px;margin-right:4px;vertical-align:middle"></span>&lt;50%</span>';
  html += '<span><span style="display:inline-block;width:8px;height:8px;background:rgba(255,255,255,0.04);border-radius:2px;margin-right:4px;vertical-align:middle"></span>No plan</span>';
  html += '</div>';

  return html;
}

// ── LEGACY STUBS (prevent errors from old HTML refs) ──
function switchTomorrowTab() { renderTomorrowPanel(); }
function renderTomorrowPlan() { renderTomorrowPanel(); }
function renderTomorrowReview() { renderTomorrowPanel(); }
function buildTomorrowAnalytics() { renderTomorrowPanel(); }
function navTomorrowPlanDate(delta) { _tmrPlanOffset += delta; renderTomorrowPanel(); }
function navTomorrowReviewDate(delta) { _tmrReviewOffset += delta; renderTomorrowPanel(); }
function resetTomorrowPlanDate() { _tmrPlanOffset = 0; renderTomorrowPanel(); }
function resetTomorrowReviewDate() { _tmrReviewOffset = 0; renderTomorrowPanel(); }
function addTomorrowTask() { var t = getTomorrowDate(); tmrAddTask(t); }
function removeTomorrowTask(i) { var t = getTomorrowDate(); tmrRemoveTask(t, i); }
function updateTomorrowTask(i, f, v) { var t = _tmrDateOffset(getTomorrowDate(), _tmrPlanOffset); tmrUpdateTask(t, i, f, v); }
function toggleTomorrowTask(i) { tmrToggleExec(i); }
function updateTomorrowReviewNotes(v) { tmrSaveReviewNotes(v); }
