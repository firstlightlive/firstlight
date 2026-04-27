// ═══════════════════════════════════════════
// FIRST LIGHT — ANALYTICS
// ═══════════════════════════════════════════

var MONTHLY_GRIDS = {
  morning: [
    'Wake+Scraper+Oil+Dive',
    'Brush+Fenugreek',
    'Marma+Pranayama+Japa',
    'Chyawanprash+Collagen',
    'Run—Iron Covenant',
    'Stability+Gym',
    'Barefoot sunlight 5min',
    'Ikigai spoken aloud',
    'All supplements taken',
    'Deep work blocks done'
  ],
  evening: [
    'Ginger+lime before meal',
    'No food after 6 PM',
    'Loban+Dive reflex',
    'Gua Sha+Coconut oil',
    'Nasya+Mula Bandha+Abhyanga',
    'Shilajit 7:00 PM',
    'Milk+Ashwagandha 8:00',
    'Examen+Wins+Replay',
    'Gratitude+Trataka+Tape',
    'Lights out 8:00 PM'
  ],
  weekly: [
    'Wed—Hair+Abhyanga',
    'Thu—Swim+Sauna',
    'Sat—Swim+Sauna+Hammam',
    'Sun—Nature+Swim+Sauna',
    'Sun—PERMA audit',
    'Social covenant',
    'Ekadasi fast (2x/month)'
  ],
  supplements: [
    'Collagen+lemon (3:58)',
    'Creatine+L-Carnitine (4:00)',
    'D3+K2+Omega-3+CDP',
    'Mucuna/Tyrosine (NEVER both)',
    'PM—Shilajit (7:00)',
    'PM—Mg+Triphala+Glycine',
    'PM—Milk+Ashwa+B.seed (8:00)'
  ],
  metrics: [
    'Weight (kg)',
    'Sleep (hrs) / Run (km)'
  ]
};

function buildMonthlyGrid(gridId) {
  var container = document.getElementById('mgrid-' + gridId);
  var rows = MONTHLY_GRIDS[gridId];
  var now = new Date();
  var daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  var monthKey = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  var stored = JSON.parse(localStorage.getItem('fl_monthly_' + monthKey) || '{}');
  if (!stored[gridId]) stored[gridId] = {};

  var html = '<table><thead><tr><th class="row-label"></th>';
  for (var d = 1; d <= daysInMonth; d++) html += '<th>' + d + '</th>';
  html += '<th>%</th></tr></thead><tbody>';

  rows.forEach(function(label, ri) {
    html += '<tr><td class="row-label">' + label + '</td>';
    var doneCount = 0;
    for (var d = 1; d <= daysInMonth; d++) {
      var cellKey = ri + '_' + d;
      var state = (stored[gridId][cellKey]) || '';
      var cls = state ? ' ' + state : '';
      var txt = state === 'done' ? '✓' : state === 'miss' ? '✗' : state === 'na' ? '—' : '';
      if (state === 'done') doneCount++;
      html += '<td><div class="cell' + cls + '" onclick="toggleGridCell(this,\'' + gridId + '\',' + ri + ',' + d + ')">' + txt + '</div></td>';
    }
    var pct = now.getDate() > 0 ? Math.round(doneCount / Math.min(now.getDate(), daysInMonth) * 100) : 0;
    html += '<td style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted)">' + pct + '%</td>';
    html += '</tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

function toggleGridCell(el, gridId, row, day) {
  // History lock: check if this day in the current month is past
  var now = new Date();
  var cellDate = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  if (isDateLocked(cellDate)) { showLockWarning(); return; }
  var states = ['', 'done', 'miss', 'na'];
  var current = 0;
  states.forEach(function(s, i) { if (s && el.classList.contains(s)) current = i; });
  var next = (current + 1) % states.length;
  el.className = 'cell' + (states[next] ? ' ' + states[next] : '');
  el.textContent = next === 1 ? '✓' : next === 2 ? '✗' : next === 3 ? '—' : '';
  saveMonthlyGrid(gridId, row, day, states[next]);
}

function saveMonthlyGrid(gridId, row, day, state) {
  var monthKey = getEffectiveToday().slice(0, 7);
  var stored = JSON.parse(localStorage.getItem('fl_monthly_' + monthKey) || '{}');
  if (!stored[gridId]) stored[gridId] = {};
  var cellKey = row + '_' + day;
  if (state) stored[gridId][cellKey] = state;
  else delete stored[gridId][cellKey];
  localStorage.setItem('fl_monthly_' + monthKey, JSON.stringify(stored));
  syncMonthlyGrid(monthKey, stored);
  markSaved();
  buildMonthlyGrid(gridId); // rebuild to update %
}

// Build all grids
Object.keys(MONTHLY_GRIDS).forEach(function(gid) { buildMonthlyGrid(gid); });

// ══════════════════════════════════════
// CALENDAR HEATMAP
// ══════════════════════════════════════
var calOffset = 0;

function changeCalMonth(dir) {
  if (dir === 0) calOffset = 0;
  else calOffset += dir;
  buildCalHeatMap();
}

function buildCalHeatMap() {
  var container = document.getElementById('calHeatMap');
  var label = document.getElementById('calMonthLabel');
  if (!container) return;

  var now = new Date();
  var month = new Date(now.getFullYear(), now.getMonth() + calOffset, 1);
  var monthNames = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
  if (label) label.textContent = monthNames[month.getMonth()] + ' ' + month.getFullYear();

  var daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  var firstDayOfWeek = month.getDay();
  var monthStr = month.getFullYear() + '-' + String(month.getMonth()+1).padStart(2,'0');

  // Fetch from Supabase first, fallback to localStorage
  if (typeof sbFetch === 'function') {
    sbFetch('daily_rituals', 'GET', null, '?date=gte.' + monthStr + '-01&date=lte.' + monthStr + '-' + daysInMonth + '&select=date,period,done_indices,completion_pct')
    .then(function(data) {
      var ritualMap = {};
      if (data && data.length) {
        for (var i = 0; i < data.length; i++) {
          var r = data[i];
          if (!ritualMap[r.date]) ritualMap[r.date] = {};
          ritualMap[r.date][r.period] = { done: (r.done_indices || []).length, pct: r.completion_pct || 0 };
        }
      }
      _renderCalGrid(container, month, daysInMonth, firstDayOfWeek, ritualMap);
    })
    .catch(function() {
      _renderCalGrid(container, month, daysInMonth, firstDayOfWeek, null);
    });
  } else {
    _renderCalGrid(container, month, daysInMonth, firstDayOfWeek, null);
  }
}

function _renderCalGrid(container, month, daysInMonth, firstDayOfWeek, ritualMap) {
  var html = '';
  ['SUN','MON','TUE','WED','THU','FRI','SAT'].forEach(function(d) {
    html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);text-align:center;padding:4px">' + d + '</div>';
  });

  for (var i = 0; i < firstDayOfWeek; i++) {
    html += '<div></div>';
  }

  for (var d = 1; d <= daysInMonth; d++) {
    var dateKey = month.getFullYear() + '-' + String(month.getMonth()+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');

    var mornDone = 0, eveDone = 0, midDone = 0, pct = 0;

    // Try Supabase data first
    if (ritualMap && ritualMap[dateKey]) {
      var rm = ritualMap[dateKey];
      mornDone = rm.morning ? rm.morning.done : 0;
      midDone = rm.midday ? rm.midday.done : 0;
      eveDone = rm.evening ? rm.evening.done : 0;
      // Use average of available period percentages
      var periods = 0, totalPct = 0;
      if (rm.morning) { totalPct += rm.morning.pct; periods++; }
      if (rm.midday) { totalPct += rm.midday.pct; periods++; }
      if (rm.evening) { totalPct += rm.evening.pct; periods++; }
      pct = periods > 0 ? Math.round(totalPct / periods) : 0;
    }

    // Fallback to localStorage
    if (mornDone === 0 && eveDone === 0) {
      var lsMorn = JSON.parse(localStorage.getItem('fl_rituals_morning_' + dateKey) || '[]');
      var lsEve = JSON.parse(localStorage.getItem('fl_rituals_evening_' + dateKey) || '[]');
      mornDone = lsMorn.length;
      eveDone = lsEve.length;
      if (mornDone > 0 || eveDone > 0) {
        pct = Math.round(((mornDone / 42 + eveDone / 41) / 2) * 100);
      }
    }

    var totalDone = mornDone + midDone + eveDone;
    var bg = 'var(--bg3)';
    var textColor = 'var(--text-dim)';
    if (totalDone > 0) {
      if (pct >= 90) { bg = 'rgba(0,229,160,0.25)'; textColor = 'var(--green)'; }
      else if (pct >= 60) { bg = 'rgba(0,212,255,0.2)'; textColor = 'var(--cyan)'; }
      else if (pct >= 30) { bg = 'rgba(245,166,35,0.2)'; textColor = 'var(--gold)'; }
      else { bg = 'rgba(255,68,68,0.15)'; textColor = 'var(--red)'; }
    }

    var isToday = dateKey === getEffectiveToday();
    var border = isToday ? 'border:2px solid var(--cyan);' : '';

    html += '<div style="aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;background:' + bg + ';border-radius:6px;cursor:pointer;' + border + '" title="' + dateKey + ': ' + pct + '% complete">';
    html += '<div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:' + textColor + '">' + d + '</div>';
    if (totalDone > 0) {
      html += '<div style="font-family:var(--font-mono);font-size:8px;color:' + textColor + ';opacity:0.7">' + pct + '%</div>';
    }
    html += '</div>';
  }

  container.innerHTML = html;
}

// RITUAL ANALYTICS ENGINE
// ══════════════════════════════════════

function raColor(pct) {
  if (pct >= 90) return 'var(--green)';
  if (pct >= 70) return 'var(--cyan)';
  if (pct >= 50) return 'var(--gold)';
  return 'var(--red)';
}

function raTrend(recent, baseline) {
  var diff = Math.round(recent - baseline);
  if (diff > 5) return { arrow: '▲', color: 'var(--green)', text: '+' + diff + '%' };
  if (diff < -5) return { arrow: '▼', color: 'var(--red)', text: diff + '%' };
  return { arrow: '→', color: 'var(--text-dim)', text: (diff >= 0 ? '+' : '') + diff + '%' };
}

function scanAllRitualData() {
  var mornDefs = getRitualDefs('morning').filter(function(r) { return r.active !== false; });
  var midDefs = getRitualDefs('midday').filter(function(r) { return r.active !== false; });
  var eveDefs = getRitualDefs('evening').filter(function(r) { return r.active !== false; });
  var mornTotal = mornDefs.length;
  var midTotal = midDefs.length;
  var eveTotal = eveDefs.length;
  var mornIds = mornDefs.map(function(r) { return r.id; });
  var midIds = midDefs.map(function(r) { return r.id; });
  var eveIds = eveDefs.map(function(r) { return r.id; });
  var allDefs = mornDefs.concat(midDefs).concat(eveDefs);

  var days = {};
  var today = getEffectiveToday();

  // Scan localStorage for all ritual keys
  for (var i = 0; i < localStorage.length; i++) {
var key = localStorage.key(i);
if (key.startsWith('fl_rituals_morning_') || key.startsWith('fl_rituals_midday_') || key.startsWith('fl_rituals_evening_')) {
  var period = key.startsWith('fl_rituals_morning_') ? 'morning' : key.startsWith('fl_rituals_midday_') ? 'midday' : 'evening';
  var date = key.replace('fl_rituals_' + period + '_', '');
  if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) continue;
  if (!days[date]) days[date] = { morning: [], midday: [], evening: [] };
  try { days[date][period] = JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) {}
}
  }

  var dates = Object.keys(days).sort();
  var totalDaysTracked = dates.length;

  // Per-ritual stats
  var ritualStats = {};
  allDefs.forEach(function(r) {
var rPeriod = r.id.startsWith('mid_') ? 'midday' : r.id.startsWith('m_') ? 'morning' : 'evening';
ritualStats[r.id] = { id: r.id, title: r.title, cat: r.cat, period: rPeriod, totalDays: 0, completedDays: 0, last7: 0, last7total: 0, last30: 0, last30total: 0, last90: 0, last90total: 0 };
  });

  var now = new Date();
  dates.forEach(function(date) {
var d = new Date(date + 'T12:00:00');
var daysAgo = Math.floor((now - d) / 86400000);
var dayData = days[date];

allDefs.forEach(function(r) {
  var period = r.id.startsWith('mid_') ? 'midday' : r.id.startsWith('m_') ? 'morning' : 'evening';
  var done = dayData[period] || [];
  var rs = ritualStats[r.id];
  if (!rs) return;
  rs.totalDays++;
  var completed = done.indexOf(r.id) >= 0;
  if (completed) rs.completedDays++;
  if (daysAgo < 7) { rs.last7total++; if (completed) rs.last7++; }
  if (daysAgo < 30) { rs.last30total++; if (completed) rs.last30++; }
  if (daysAgo < 90) { rs.last90total++; if (completed) rs.last90++; }
});
  });

  // Compute percentages
  Object.keys(ritualStats).forEach(function(id) {
var rs = ritualStats[id];
rs.pctAll = rs.totalDays > 0 ? Math.round(rs.completedDays / rs.totalDays * 100) : 0;
rs.pct7 = rs.last7total > 0 ? Math.round(rs.last7 / rs.last7total * 100) : 0;
rs.pct30 = rs.last30total > 0 ? Math.round(rs.last30 / rs.last30total * 100) : 0;
rs.pct90 = rs.last90total > 0 ? Math.round(rs.last90 / rs.last90total * 100) : 0;
  });

  // Weekly aggregates (last 12 weeks)
  var weeks = {};
  for (var w = 0; w < 12; w++) {
var wStart = new Date();
wStart.setDate(wStart.getDate() - wStart.getDay() + 1 - (w * 7));
wStart.setHours(0,0,0,0);
var wKey = (wStart.getFullYear()+'-'+String(wStart.getMonth()+1).padStart(2,'0')+'-'+String(wStart.getDate()).padStart(2,'0'));
var wEnd = new Date(wStart); wEnd.setDate(wEnd.getDate() + 6);
var wMorn = 0, wMid = 0, wEve = 0, wDays = 0;
for (var wd = 0; wd < 7; wd++) {
  var dd = new Date(wStart); dd.setDate(dd.getDate() + wd);
  var dk = (dd.getFullYear()+'-'+String(dd.getMonth()+1).padStart(2,'0')+'-'+String(dd.getDate()).padStart(2,'0'));
  if (days[dk]) {
    wDays++;
    wMorn += mornTotal > 0 ? Math.round((days[dk].morning || []).length / mornTotal * 100) : 0;
    wMid += midTotal > 0 ? Math.round((days[dk].midday || []).length / midTotal * 100) : 0;
    wEve += eveTotal > 0 ? Math.round((days[dk].evening || []).length / eveTotal * 100) : 0;
  }
}
// ISO week number
var dISO = new Date(Date.UTC(wStart.getFullYear(), wStart.getMonth(), wStart.getDate()));
var dayNum = dISO.getUTCDay() || 7;
dISO.setUTCDate(dISO.getUTCDate() + 4 - dayNum);
var yearStart = new Date(Date.UTC(dISO.getUTCFullYear(), 0, 1));
var weekNum = Math.ceil((((dISO - yearStart) / 86400000) + 1) / 7);
weeks[wKey] = { mornPct: wDays > 0 ? Math.round(wMorn / wDays) : 0, midPct: wDays > 0 ? Math.round(wMid / wDays) : 0, evePct: wDays > 0 ? Math.round(wEve / wDays) : 0, days: wDays, weekNum: weekNum };
weeks[wKey].totalPct = Math.round((weeks[wKey].mornPct + weeks[wKey].midPct + weeks[wKey].evePct) / 3);
  }

  // Monthly aggregates
  var months = {};
  var monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  dates.forEach(function(date) {
var mk = date.slice(0, 7); // YYYY-MM
if (!months[mk]) months[mk] = { mornSum: 0, midSum: 0, eveSum: 0, days: 0, label: '' };
months[mk].days++;
months[mk].mornSum += mornTotal > 0 ? (days[date].morning || []).length / mornTotal * 100 : 0;
months[mk].midSum += midTotal > 0 ? (days[date].midday || []).length / midTotal * 100 : 0;
months[mk].eveSum += eveTotal > 0 ? (days[date].evening || []).length / eveTotal * 100 : 0;
var parts = mk.split('-');
months[mk].label = monthNames[parseInt(parts[1]) - 1] + ' ' + parts[0];
  });
  Object.keys(months).forEach(function(mk) {
var m = months[mk];
m.mornPct = m.days > 0 ? Math.round(m.mornSum / m.days) : 0;
m.midPct = m.days > 0 ? Math.round(m.midSum / m.days) : 0;
m.evePct = m.days > 0 ? Math.round(m.eveSum / m.days) : 0;
m.totalPct = Math.round((m.mornPct + m.midPct + m.evePct) / 3);
  });

  // Today's stats
  var todayData = days[today] || { morning: [], midday: [], evening: [] };
  var todayMornPct = mornTotal > 0 ? Math.round(todayData.morning.length / mornTotal * 100) : 0;
  var todayMidPct = midTotal > 0 ? Math.round((todayData.midday || []).length / midTotal * 100) : 0;
  var todayEvePct = eveTotal > 0 ? Math.round(todayData.evening.length / eveTotal * 100) : 0;
  var todayPct = Math.round((todayMornPct + todayMidPct + todayEvePct) / 3);

  // Current streak (consecutive days >= 80%)
  var streak = 0;
  var sortedDesc = dates.slice().sort().reverse();
  for (var si = 0; si < sortedDesc.length; si++) {
var sd = days[sortedDesc[si]];
var sp = Math.round(((sd.morning || []).length / (mornTotal || 1) + ((sd.midday || []).length / (midTotal || 1)) + (sd.evening || []).length / (eveTotal || 1)) / 3 * 100);
if (sp >= 80) streak++; else break;
  }

  // Yearly stats
  var thisYear = String(now.getFullYear());
  var yearDays = dates.filter(function(d) { return d.startsWith(thisYear); });
  var yearMorn = 0, yearMid = 0, yearEve = 0;
  yearDays.forEach(function(d) {
yearMorn += (days[d].morning || []).length;
yearMid += (days[d].midday || []).length;
yearEve += (days[d].evening || []).length;
  });
  var yearTotalPossible = yearDays.length * (mornTotal + midTotal + eveTotal);
  var yearPct = yearTotalPossible > 0 ? Math.round((yearMorn + yearMid + yearEve) / yearTotalPossible * 100) : 0;

  return {
days: days, dates: dates, totalDaysTracked: totalDaysTracked,
ritualStats: ritualStats, weeks: weeks, months: months,
today: { pct: todayPct, mornPct: todayMornPct, evePct: todayEvePct },
thisWeek: weeks[Object.keys(weeks).sort().reverse()[0]] || { totalPct: 0 },
thisMonth: months[today.slice(0, 7)] || { totalPct: 0 },
yearPct: yearPct, yearDays: yearDays.length, yearMorn: yearMorn, yearMid: yearMid, yearEve: yearEve,
yearTotal: yearTotalPossible, streak: streak,
mornTotal: mornTotal, midTotal: midTotal, eveTotal: eveTotal, mornDefs: mornDefs, midDefs: midDefs, eveDefs: eveDefs
  };
}

var _raData = null;
var _raTab = 'morning';

function buildRitualAnalytics() {
  _raData = scanAllRitualData();
  var d = _raData;
  var container = document.getElementById('ritualAnalyticsContent');
  if (!container) return;
  var html = '';

  // ── SECTION A: KPI STRIP ──
  var thisWeekPct = d.thisWeek.totalPct || 0;
  var thisMonthPct = d.thisMonth.totalPct || 0;
  html += '<div class="ra-kpi-grid">';
  html += '<div class="ra-kpi"><div class="ra-kpi-val" style="color:' + raColor(d.today.pct) + '">' + d.today.pct + '%</div><div class="ra-kpi-label">TODAY</div></div>';
  html += '<div class="ra-kpi"><div class="ra-kpi-val" style="color:' + raColor(thisWeekPct) + '">' + thisWeekPct + '%</div><div class="ra-kpi-label">THIS WEEK</div></div>';
  html += '<div class="ra-kpi"><div class="ra-kpi-val" style="color:' + raColor(thisMonthPct) + '">' + thisMonthPct + '%</div><div class="ra-kpi-label">THIS MONTH</div></div>';
  html += '<div class="ra-kpi"><div class="ra-kpi-val" style="color:' + raColor(d.yearPct) + '">' + d.yearPct + '%</div><div class="ra-kpi-label">THIS YEAR</div></div>';
  html += '<div class="ra-kpi"><div class="ra-kpi-val" style="color:var(--green)">' + d.streak + '</div><div class="ra-kpi-label">80%+ STREAK</div></div>';
  html += '</div>';

  // ── SECTION B: WEEKLY TREND (last 8 weeks) ──
  html += '<div class="panel-section"><div class="panel-section-title">WEEKLY TREND — LAST 8 WEEKS</div>';
  var weekKeys = Object.keys(d.weeks).sort().slice(-8);
  if (weekKeys.length > 0) {
html += '<div class="ra-week-chart">';
weekKeys.forEach(function(wk) {
  var w = d.weeks[wk];
  var mH = Math.max(2, w.mornPct * 1.4);
  var mdH = Math.max(2, (w.midPct || 0) * 1.4);
  var eH = Math.max(2, w.evePct * 1.4);
  html += '<div class="ra-week-col">';
  html += '<div class="ra-week-pct" style="color:' + raColor(w.totalPct) + '">' + w.totalPct + '%</div>';
  html += '<div style="width:100%;display:flex;flex-direction:column;align-items:stretch;gap:2px">';
  html += '<div class="ra-week-bar" style="height:' + mH + 'px;background:var(--cyan)"></div>';
  html += '<div class="ra-week-bar" style="height:' + mdH + 'px;background:#FF9933"></div>';
  html += '<div class="ra-week-bar" style="height:' + eH + 'px;background:var(--gold)"></div>';
  html += '</div>';
  html += '<div class="ra-week-label">W' + w.weekNum + '</div>';
  html += '</div>';
});
html += '</div>';
// Trend vs 4 weeks ago
if (weekKeys.length >= 5) {
  var recent = d.weeks[weekKeys[weekKeys.length - 1]].totalPct;
  var fourAgo = d.weeks[weekKeys[weekKeys.length - 5]].totalPct;
  var trend = raTrend(recent, fourAgo);
  html += '<div style="text-align:right;margin-top:12px;font-family:var(--font-mono);font-size:12px;font-weight:700;color:' + trend.color + '">' + trend.arrow + ' ' + trend.text + ' vs 4W AGO</div>';
}
html += '<div style="display:flex;gap:16px;margin-top:8px;font-family:var(--font-mono);font-size:9px;color:var(--text-dim)"><span style="color:var(--cyan)">■</span> MORNING <span style="color:#FF9933">■</span> MIDDAY <span style="color:var(--gold)">■</span> EVENING</div>';
  } else {
html += '<div style="text-align:center;padding:32px;color:var(--text-muted);font-family:var(--font-mono);font-size:12px">No weekly data yet. Start checking rituals!</div>';
  }
  html += '</div>';

  // ── SECTION C: MONTH-OVER-MONTH (last 6 months) ──
  html += '<div class="panel-section"><div class="panel-section-title">MONTH-OVER-MONTH</div>';
  var monthKeys = Object.keys(d.months).sort().slice(-6);
  if (monthKeys.length > 0) {
var prevPct = null;
monthKeys.forEach(function(mk) {
  var m = d.months[mk];
  var delta = prevPct !== null ? raTrend(m.totalPct, prevPct) : { arrow: '', color: 'var(--text-dim)', text: '—' };
  html += '<div class="ra-month-row">';
  html += '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:1px;color:var(--text-muted)">' + m.label + '</div>';
  html += '<div class="ra-month-bar-wrap"><div class="ra-month-bar" style="width:' + m.totalPct + '%;background:linear-gradient(90deg,var(--cyan),' + raColor(m.totalPct) + ')"></div></div>';
  html += '<div class="ra-month-pct" style="color:' + raColor(m.totalPct) + '">' + m.totalPct + '%</div>';
  html += '<div class="ra-month-delta" style="color:' + delta.color + '">' + delta.arrow + ' ' + delta.text + '</div>';
  html += '</div>';
  prevPct = m.totalPct;
});
// Best month
var bestMonth = monthKeys.reduce(function(best, mk) { return d.months[mk].totalPct > (d.months[best] ? d.months[best].totalPct : 0) ? mk : best; }, monthKeys[0]);
html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);margin-top:12px">BEST MONTH: <span style="color:var(--green)">' + d.months[bestMonth].label + ' (' + d.months[bestMonth].totalPct + '%)</span></div>';
  }
  html += '</div>';

  // ── SECTION D: ANNUAL PERCENTAGE ──
  html += '<div class="panel-section" style="text-align:center;padding:32px 20px">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:3px;color:var(--text-muted);margin-bottom:12px">ANNUAL COMPLETION — ' + new Date().getFullYear() + '</div>';
  html += '<div class="ra-annual-big" style="color:' + raColor(d.yearPct) + '">' + d.yearPct + '%</div>';
  html += '<div class="ra-annual-sub">' + (d.yearMorn + d.yearEve) + ' / ' + d.yearTotal + ' ritual-checks completed across ' + d.yearDays + ' days</div>';
  html += '<div style="display:flex;gap:24px;justify-content:center;margin-top:16px">';
  var yearMornPct = d.yearDays > 0 && d.mornTotal > 0 ? Math.round(d.yearMorn / (d.yearDays * d.mornTotal) * 100) : 0;
  var yearEvePct = d.yearDays > 0 && d.eveTotal > 0 ? Math.round(d.yearEve / (d.yearDays * d.eveTotal) * 100) : 0;
  html += '<div><span style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:var(--cyan)">' + yearMornPct + '%</span><div style="font-family:var(--font-mono);font-size:9px;letter-spacing:1px;color:var(--text-dim);margin-top:2px">MORNING</div></div>';
  html += '<div><span style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:var(--gold)">' + yearEvePct + '%</span><div style="font-family:var(--font-mono);font-size:9px;letter-spacing:1px;color:var(--text-dim);margin-top:2px">EVENING</div></div>';
  html += '</div>';
  // 12-month mini grid
  html += '<div class="ra-mini-grid">';
  var monthLabels = ['J','F','M','A','M','J','J','A','S','O','N','D'];
  for (var mi = 0; mi < 12; mi++) {
var mk = new Date().getFullYear() + '-' + String(mi + 1).padStart(2, '0');
var mData = d.months[mk];
var mPct = mData ? mData.totalPct : 0;
var mBg = mData ? raColor(mPct) : 'var(--bg3)';
var mText = mData ? (mPct + '%') : '—';
html += '<div class="ra-mini-cell" style="background:' + (mData ? mBg + '22' : 'var(--bg3)') + ';border:1px solid ' + (mData ? mBg + '33' : 'rgba(255,255,255,0.04)') + '">';
html += '<div style="font-size:8px;color:' + (mData ? mBg.replace('var(','').replace(')','') : 'var(--text-dim)') + ';letter-spacing:1px">' + monthLabels[mi] + '</div>';
html += '<div style="font-size:11px;font-weight:700;color:' + (mData ? mBg : 'var(--text-dim)') + '">' + mText + '</div>';
html += '</div>';
  }
  html += '</div>';
  html += '</div>';

  // ── SECTION E: PER-RITUAL HABIT STRENGTH MATRIX ──
  html += '<div class="panel-section"><div class="panel-section-title">HABIT STRENGTH MATRIX</div>';
  html += '<div style="display:flex;gap:8px;margin-bottom:16px">';
  html += '<button class="ra-tab' + (_raTab === 'morning' ? ' active' : '') + '" onclick="_raTab=\'morning\';renderHabitTable()">MORNING (' + d.mornDefs.length + ')</button>';
  html += '<button class="ra-tab' + (_raTab === 'midday' ? ' active' : '') + '" onclick="_raTab=\'midday\';renderHabitTable()">MIDDAY (' + d.midDefs.length + ')</button>';
  html += '<button class="ra-tab' + (_raTab === 'evening' ? ' active' : '') + '" onclick="_raTab=\'evening\';renderHabitTable()">EVENING (' + d.eveDefs.length + ')</button>';
  html += '<span style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-left:auto;align-self:center">SORTED BY WEAKEST FIRST</span>';
  html += '</div>';
  html += '<div id="habitTableContainer"></div>';
  html += '</div>';

  container.innerHTML = html;
  renderHabitTable();
}

function renderHabitTable() {
  if (!_raData) return;
  var container = document.getElementById('habitTableContainer');
  if (!container) return;
  var defs = _raTab === 'morning' ? _raData.mornDefs : _raTab === 'midday' ? _raData.midDefs : _raData.eveDefs;
  var stats = defs.map(function(r) { return _raData.ritualStats[r.id] || {}; });

  // Sort by ALL-time percentage ascending (weakest first)
  stats.sort(function(a, b) { return (a.pctAll || 0) - (b.pctAll || 0); });

  var catColors = {
SACRED:'#FF9933', AYUR:'#00E5A0', BIOHACK:'#00D4FF', FUEL:'#D4A017',
MIND:'#E040FB', MOVE:'#FF4136', SKIN:'#FF69B4', SLEEP:'#70AEFF', OIL:'#F5A623'
  };

  var html = '<div style="overflow-x:auto"><table class="ra-habit-table">';
  html += '<thead><tr><th>#</th><th>RITUAL</th><th>CAT</th><th>7D</th><th>30D</th><th>90D</th><th>ALL</th><th>TREND</th></tr></thead><tbody>';

  stats.forEach(function(s, i) {
var trend = raTrend(s.pct7 || 0, s.pct30 || 0);
var cc = catColors[s.cat] || '#888';
var rowClass = '';
if (i < 5) rowClass = ' style="border-left:3px solid var(--red)"'; // Bottom 5 (weakest)
else if (i >= stats.length - 5) rowClass = ' style="border-left:3px solid var(--green)"'; // Top 5 (strongest)
html += '<tr' + rowClass + '>';
html += '<td style="color:var(--text-dim)">' + (i + 1) + '</td>';
html += '<td style="color:var(--text);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (s.title || '—') + '</td>';
html += '<td><span style="font-size:8px;padding:2px 5px;border-radius:3px;background:' + cc + '18;color:' + cc + '">' + (s.cat || '') + '</span></td>';
html += '<td style="color:' + raColor(s.pct7 || 0) + '">' + (s.pct7 || 0) + '%</td>';
html += '<td style="color:' + raColor(s.pct30 || 0) + '">' + (s.pct30 || 0) + '%</td>';
html += '<td style="color:' + raColor(s.pct90 || 0) + '">' + (s.pct90 || 0) + '%</td>';
html += '<td style="color:' + raColor(s.pctAll || 0) + ';font-weight:700">' + (s.pctAll || 0) + '%</td>';
html += '<td style="color:' + trend.color + '">' + trend.arrow + ' ' + trend.text + '</td>';
html += '</tr>';
  });

  html += '</tbody></table></div>';
  container.innerHTML = html;

  // Update tab states
  document.querySelectorAll('.ra-tab').forEach(function(t) {
t.className = 'ra-tab' + (t.textContent.toLowerCase().indexOf(_raTab) >= 0 ? ' active' : '');
  });
}
 
