/* ══════════════════════════════════════════════════════
   FORTRESS ANALYTICS — admin-fortress-analytics.js
   Streak Leaderboard · Year Calendar · Multi-Month Trend
   Breach Recovery · Correlation Intel · Champion Days
   Danger Alerts · Life Score Composite · Mastery Heatmap
══════════════════════════════════════════════════════ */

// ── Rule Definitions ──────────────────────────────────
var FA_RULES = [
  { key:'purity',    icon:'🔱', name:'PURITY',    hex:'#FF5252', col:'#FF5252',
    getHeld: function(d){ return d && !d.porn && !d.masturbate; } },
  { key:'brahma',    icon:'⚡', name:'BRAHMA',    hex:'#FFB74D', col:'#FFB74D',
    getHeld: function(d){ return d && d.brahma_held && !d.sexual; } },
  { key:'citadel',   icon:'🏰', name:'CITADEL',   hex:'#00D4FF', col:'#00D4FF',
    getHeld: function(d){ return d && (d.device_free || d.phone_out); } },
  { key:'perimeter', icon:'🚪', name:'PERIMETER', hex:'#F5A623', col:'#F5A623',
    getHeld: function(d){ return d && d.stayed_out; } },
  { key:'vigil',     icon:'🌙', name:'VIGIL',     hex:'#CE93D8', col:'#CE93D8',
    getHeld: function(d){ return d && d.woke_3am; } },
  { key:'chronicle', icon:'📖', name:'CHRONICLE', hex:'#00E676', col:'#00E676',
    getHeld: function(d){ return d && d.journal_written; } },
  { key:'temple',    icon:'🌿', name:'TEMPLE',    hex:'#80CBC4', col:'#80CBC4',
    getHeld: function(d){ return d && d.food_rules; } }
];

// ── Data Helpers ───────────────────────────────────────
function faGetDay(date) {
  try { return JSON.parse(localStorage.getItem('fl_brahma_daily_' + date) || 'null'); } catch(e) { return null; }
}
function faGetMastery(date) {
  try { return JSON.parse(localStorage.getItem('fl_mastery_daily_' + date) || 'null'); } catch(e) { return null; }
}
function faDateStr(d) {
  var m = d.getMonth() + 1, day = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
}
function faAddDays(dateStr, n) {
  var d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return faDateStr(d);
}
function faDayScore(data) {
  if (!data) return null;
  var score = 0;
  FA_RULES.forEach(function(r) { if (r.getHeld(data)) score++; });
  return score;
}
function faHexToRgb(hex) {
  var r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return r ? [parseInt(r[1], 16), parseInt(r[2], 16), parseInt(r[3], 16)] : [0, 212, 255];
}
function faToday() {
  return (typeof getEffectiveToday === 'function') ? getEffectiveToday() : faDateStr(new Date());
}
function faGetAllDates() {
  var dates = [];
  for (var i = 0; i < localStorage.length; i++) {
    var key = localStorage.key(i);
    if (key && key.startsWith('fl_brahma_daily_')) {
      var d = key.replace('fl_brahma_daily_', '');
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) dates.push(d);
    }
  }
  return dates.sort();
}

// ══════════════════════════════════════════════════════
// PANEL 1 — STREAK LEADERBOARD
// ══════════════════════════════════════════════════════
function faComputeStreaks() {
  var today = faToday();
  var allDates = faGetAllDates();
  if (!allDates.length) return FA_RULES.map(function(r) {
    return { rule: r, current: 0, longest: 0, lastBreach: null, total: 0, held: 0, pct: 0 };
  });
  var first = allDates[0];
  return FA_RULES.map(function(r) {
    var current = 0, longest = 0, lastBreach = null, total = 0, held = 0, run = 0;
    var d = new Date(first + 'T00:00:00');
    var todayD = new Date(today + 'T00:00:00');
    while (d <= todayD) {
      var ds = faDateStr(d);
      var data = faGetDay(ds);
      if (data) {
        total++;
        if (r.getHeld(data)) { held++; run++; if (run > longest) longest = run; }
        else { if (run > 0) lastBreach = ds; run = 0; }
      }
      d.setDate(d.getDate() + 1);
    }
    current = run;
    return { rule: r, current: current, longest: longest, lastBreach: lastBreach,
             total: total, held: held, pct: total > 0 ? Math.round(100 * held / total) : 0 };
  }).sort(function(a, b) { return b.current - a.current; });
}

function renderFortressStreaks() {
  var el = document.getElementById('fortress-streaks-container');
  if (!el) return;
  var streaks = faComputeStreaks();
  var allDates = faGetAllDates();
  var champDays = allDates.filter(function(d) { return faDayScore(faGetDay(d)) === 7; }).length;
  var best = streaks[0];
  var avgScore = 0;
  if (allDates.length) {
    var sum = 0, cnt = 0;
    allDates.forEach(function(d) { var s = faDayScore(faGetDay(d)); if (s !== null) { sum += s; cnt++; } });
    avgScore = cnt ? (sum / cnt).toFixed(1) : 0;
  }

  var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:24px">';
  [
    { v: best.current, l: 'LONGEST ACTIVE STREAK', sub: best.rule.icon + ' ' + best.rule.name, c: 'var(--cyan)' },
    { v: champDays,    l: 'PERFECT DAYS (7/7)',     sub: allDates.length + ' days logged',       c: 'var(--gold)' },
    { v: avgScore,     l: 'AVG FORTRESS SCORE',     sub: 'out of 7 rules',                       c: 'var(--green)' }
  ].forEach(function(k) {
    var rgb = faHexToRgb(k.c.indexOf('#') === 0 ? k.c : '#00D4FF');
    html += '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:18px;text-align:center">';
    html += '<div style="font-family:var(--font-mono);font-size:32px;font-weight:700;color:' + k.c + '">' + k.v + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:1.5px;color:var(--text-muted);margin-top:4px">' + k.l + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-top:3px">' + k.sub + '</div>';
    html += '</div>';
  });
  html += '</div>';

  html += '<div style="display:flex;flex-direction:column;gap:8px">';
  streaks.forEach(function(s, idx) {
    var r = s.rule;
    var rgb = faHexToRgb(r.hex);
    var medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '#' + (idx + 1);
    html += '<div style="background:rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.04);border:1px solid rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.14);border-radius:12px;padding:14px 16px">';
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">';
    html += '<span style="font-size:20px">' + r.icon + '</span>';
    html += '<div style="flex:1">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between">';
    html += '<span style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:' + r.col + ';letter-spacing:2px">' + medal + ' ' + r.name + '</span>';
    html += '<span style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim)">' + s.pct + '% clean</span>';
    html += '</div>';
    html += '<div style="height:4px;background:rgba(255,255,255,0.05);border-radius:2px;margin-top:6px;overflow:hidden">';
    html += '<div style="height:100%;width:' + Math.min(100, s.pct) + '%;background:' + r.col + ';border-radius:2px;transition:width 0.5s"></div>';
    html += '</div></div></div>';
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">';
    [
      { v: s.current, l: 'CURRENT' },
      { v: s.longest, l: 'BEST' },
      { v: s.held,    l: 'HELD' },
      { v: s.total,   l: 'LOGGED' }
    ].forEach(function(k, ki) {
      var vc = ki === 0 ? r.col : 'var(--text)';
      html += '<div style="text-align:center"><div style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:' + vc + '">' + k.v + '</div>';
      html += '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:1px;color:var(--text-dim)">' + k.l + '</div></div>';
    });
    html += '</div>';
    if (s.lastBreach) html += '<div style="margin-top:8px;font-family:var(--font-mono);font-size:9px;color:rgba(255,82,82,0.65)">Last breach: ' + s.lastBreach + '</div>';
    html += '</div>';
  });
  html += '</div>';
  el.innerHTML = html;
}

// ══════════════════════════════════════════════════════
// PANEL 2 — YEAR HEATMAP CALENDAR + 6-MONTH TREND
// ══════════════════════════════════════════════════════
var _faYearNavYear = 0;

function faYearNav(dir) {
  if (!_faYearNavYear) _faYearNavYear = new Date().getFullYear();
  _faYearNavYear += dir;
  renderFortressYear();
}

function renderFortressYear() {
  var el = document.getElementById('fortress-year-container');
  if (!el) return;
  if (!_faYearNavYear) _faYearNavYear = new Date().getFullYear();
  var year = _faYearNavYear;
  var todayStr = faToday();
  var lbl = document.getElementById('faYearLabel');
  if (lbl) lbl.textContent = year;

  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var DOW = ['S','M','T','W','T','F','S'];

  // Collect scores for the year
  var dataByDate = {};
  var d = new Date(year, 0, 1);
  var dec31 = new Date(year, 11, 31);
  while (d <= dec31) {
    var ds = faDateStr(d);
    var data = faGetDay(ds);
    if (data) dataByDate[ds] = faDayScore(data);
    d.setDate(d.getDate() + 1);
  }

  var yearDates = Object.keys(dataByDate);
  var yearLogged = yearDates.length;
  var yearChamp  = yearDates.filter(function(ds) { return dataByDate[ds] === 7; }).length;
  var yearBreach = yearDates.filter(function(ds) { return dataByDate[ds] !== null && dataByDate[ds] < 7; }).length;
  var yearAvg    = yearLogged ? (yearDates.reduce(function(s, ds) { return s + (dataByDate[ds] || 0); }, 0) / yearLogged).toFixed(1) : 0;

  var html = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px">';
  [
    { v: yearLogged,        l: 'DAYS LOGGED',   c: 'var(--cyan)' },
    { v: yearChamp,         l: 'PERFECT DAYS',  c: 'var(--gold)' },
    { v: yearAvg + '/7',   l: 'AVG SCORE',     c: 'var(--green)' },
    { v: yearBreach,        l: 'BREACH DAYS',   c: 'var(--red)' }
  ].forEach(function(k) {
    html += '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:14px;text-align:center">';
    html += '<div style="font-family:var(--font-mono);font-size:24px;font-weight:700;color:' + k.c + '">' + k.v + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:1.5px;color:var(--text-dim);margin-top:3px">' + k.l + '</div>';
    html += '</div>';
  });
  html += '</div>';

  // GitHub-style heatmap
  var jan1 = new Date(year, 0, 1);
  var weekStart = new Date(jan1);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  var numWeeks = Math.ceil(((dec31 - weekStart) / 86400000 + 1) / 7);

  // Month label positions
  var monthPositions = [];
  for (var m = 0; m < 12; m++) {
    var firstOfMonth = new Date(year, m, 1);
    var wIdx = Math.floor((firstOfMonth - weekStart) / (7 * 86400000));
    if (wIdx >= 0 && wIdx < numWeeks) monthPositions.push({ idx: wIdx, name: MONTHS[m] });
  }

  html += '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:8px">';
  html += '<div style="min-width:max-content">';

  // Month labels row
  html += '<div style="display:flex;gap:0;margin-bottom:2px">';
  html += '<div style="width:28px"></div>';
  for (var w = 0; w < numWeeks; w++) {
    var ml = '';
    for (var mp = 0; mp < monthPositions.length; mp++) {
      if (monthPositions[mp].idx === w) { ml = monthPositions[mp].name; break; }
    }
    html += '<div style="width:13px;text-align:left;font-family:var(--font-mono);font-size:8px;color:var(--text-dim);height:12px;line-height:12px">' + (ml || '') + '</div>';
  }
  html += '</div>';

  // Day rows
  for (var dow = 0; dow < 7; dow++) {
    html += '<div style="display:flex;gap:0;align-items:center">';
    html += '<div style="width:28px;font-family:var(--font-mono);font-size:8px;color:var(--text-dim);text-align:right;padding-right:5px">' + (dow % 2 === 1 ? DOW[dow] : '') + '</div>';
    for (var w2 = 0; w2 < numWeeks; w2++) {
      var cellDate = new Date(weekStart);
      cellDate.setDate(cellDate.getDate() + w2 * 7 + dow);
      var cellDs = faDateStr(cellDate);
      if (cellDate.getFullYear() !== year) {
        html += '<div style="width:11px;height:11px;margin:1px"></div>';
        continue;
      }
      var score = dataByDate[cellDs] !== undefined ? dataByDate[cellDs] : null;
      var isToday = cellDs === todayStr;
      var bg = 'rgba(255,255,255,0.03)';
      if (score !== null) {
        if (score === 7) bg = 'rgba(0,230,118,0.85)';
        else if (score >= 5) bg = 'rgba(0,230,118,' + (0.25 + score * 0.07) + ')';
        else if (score >= 3) bg = 'rgba(245,166,35,' + (0.25 + score * 0.07) + ')';
        else bg = 'rgba(255,82,82,' + (0.3 + score * 0.07) + ')';
      }
      var outline = isToday ? 'outline:1.5px solid var(--cyan);outline-offset:1px;' : '';
      html += '<div style="width:11px;height:11px;margin:1px;border-radius:2px;background:' + bg + ';' + outline + '" title="' + cellDs + (score !== null ? ' (' + score + '/7)' : ' (no log)') + '"></div>';
    }
    html += '</div>';
  }

  // Legend
  html += '<div style="display:flex;align-items:center;gap:8px;margin-top:8px">';
  html += '<div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim)">Less</div>';
  ['rgba(255,255,255,0.03)','rgba(255,82,82,0.4)','rgba(245,166,35,0.45)','rgba(0,230,118,0.45)','rgba(0,230,118,0.85)'].forEach(function(bg) {
    html += '<div style="width:11px;height:11px;border-radius:2px;background:' + bg + '"></div>';
  });
  html += '<div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim)">More</div>';
  html += '</div>';

  html += '</div></div>';

  // Monthly breakdown
  html += '<div style="margin-top:20px">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted);margin-bottom:12px">MONTHLY BREAKDOWN</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px">';
  for (var m2 = 0; m2 < 12; m2++) {
    var mFirst = new Date(year, m2, 1);
    var mLast = new Date(year, m2 + 1, 0);
    var mTotal = 0, mHeld = 0;
    var md = new Date(mFirst);
    while (md <= mLast) {
      var mds = faDateStr(md);
      if (dataByDate[mds] !== undefined) {
        mTotal++;
        if (dataByDate[mds] >= 5) mHeld++;
      }
      md.setDate(md.getDate() + 1);
    }
    var mPct = mTotal ? Math.round(100 * mHeld / mTotal) : null;
    var mColor = mPct === null ? 'var(--text-dim)' : mPct >= 80 ? 'var(--green)' : mPct >= 50 ? 'var(--gold)' : 'var(--red)';
    html += '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:10px;text-align:center">';
    html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:1px;color:var(--text-dim);margin-bottom:4px">' + MONTHS[m2].toUpperCase() + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:' + mColor + '">' + (mPct !== null ? mPct + '%' : '—') + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim)">' + mTotal + ' days</div>';
    html += '</div>';
  }
  html += '</div></div>';

  // 6-month trend
  html += _faRenderMultiMonthTrend();

  el.innerHTML = html;
}

function _faRenderMultiMonthTrend() {
  var today = new Date();
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var mData = [];
  for (var i = 5; i >= 0; i--) {
    var d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    var mFirst = new Date(d.getFullYear(), d.getMonth(), 1);
    var mLast = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    var scores = [], ruleHeld = FA_RULES.map(function() { return 0; }), ruleTotal = FA_RULES.map(function() { return 0; });
    var dd = new Date(mFirst);
    while (dd <= mLast && dd <= today) {
      var ds = faDateStr(dd);
      var dayData = faGetDay(ds);
      if (dayData) {
        var s = faDayScore(dayData);
        if (s !== null) scores.push(s);
        FA_RULES.forEach(function(r, ri) { ruleTotal[ri]++; if (r.getHeld(dayData)) ruleHeld[ri]++; });
      }
      dd.setDate(dd.getDate() + 1);
    }
    mData.push({
      label: MONTHS[d.getMonth()].toUpperCase(),
      avg: scores.length ? scores.reduce(function(a, b) { return a + b; }, 0) / scores.length : null,
      days: scores.length,
      ruleHeld: ruleHeld,
      ruleTotal: ruleTotal
    });
  }

  var html = '<div style="margin-top:24px">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted);margin-bottom:12px">6-MONTH TREND</div>';
  html += '<div style="display:flex;align-items:flex-end;gap:6px;height:80px;margin-bottom:4px">';
  mData.forEach(function(m) {
    var h = m.avg !== null ? Math.round((m.avg / 7) * 70) : 0;
    var col = m.avg === null ? 'rgba(255,255,255,0.05)' : m.avg >= 6 ? 'var(--green)' : m.avg >= 4 ? 'var(--gold)' : 'var(--red)';
    html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">';
    html += '<div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim)">' + (m.avg !== null ? m.avg.toFixed(1) : '') + '</div>';
    html += '<div style="width:100%;height:' + h + 'px;background:' + col + ';border-radius:3px 3px 0 0;min-height:2px"></div>';
    html += '</div>';
  });
  html += '</div>';
  html += '<div style="display:flex;gap:6px;margin-bottom:16px">';
  mData.forEach(function(m) {
    html += '<div style="flex:1;text-align:center;font-family:var(--font-mono);font-size:8px;color:var(--text-dim)">' + m.label.slice(0, 3) + '</div>';
  });
  html += '</div>';

  // Per-rule table
  html += '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch">';
  html += '<table style="width:100%;border-collapse:collapse;min-width:360px">';
  html += '<thead><tr><th style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim);text-align:left;padding:4px 6px;letter-spacing:1px">RULE</th>';
  mData.forEach(function(m) {
    html += '<th style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim);text-align:center;padding:4px">' + m.label.slice(0, 3) + '</th>';
  });
  html += '</tr></thead><tbody>';
  FA_RULES.forEach(function(r, ri) {
    html += '<tr><td style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:' + r.col + ';padding:4px 6px;letter-spacing:1px">' + r.icon + ' ' + r.name + '</td>';
    mData.forEach(function(m) {
      var pct = m.ruleTotal[ri] ? Math.round(100 * m.ruleHeld[ri] / m.ruleTotal[ri]) : null;
      var col = pct === null ? 'var(--text-dim)' : pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--gold)' : 'var(--red)';
      html += '<td style="text-align:center;padding:4px;font-family:var(--font-mono);font-size:9px;font-weight:700;color:' + col + '">' + (pct !== null ? pct + '%' : '—') + '</td>';
    });
    html += '</tr>';
  });
  html += '</tbody></table></div></div>';
  return html;
}

// ══════════════════════════════════════════════════════
// PANEL 3 — FORTRESS INTELLIGENCE
// ══════════════════════════════════════════════════════
function faComputeBreachRecovery() {
  var allDates = faGetAllDates();
  var results = {};
  FA_RULES.forEach(function(r) { results[r.key] = { recoveries: [], avg: null, count: 0 }; });
  FA_RULES.forEach(function(r) {
    var breachStart = null;
    var recoveries = [];
    allDates.forEach(function(ds) {
      var data = faGetDay(ds);
      var held = data && r.getHeld(data);
      if (!held && data) {
        if (!breachStart) breachStart = ds;
      } else if (held && breachStart) {
        var bD = new Date(breachStart + 'T00:00:00');
        var rD = new Date(ds + 'T00:00:00');
        recoveries.push(Math.round((rD - bD) / 86400000));
        breachStart = null;
      }
    });
    results[r.key].recoveries = recoveries;
    results[r.key].count = recoveries.length;
    if (recoveries.length) {
      results[r.key].avg = (recoveries.reduce(function(a, b) { return a + b; }, 0) / recoveries.length).toFixed(1);
    }
  });
  return results;
}

function faComputeCorrelation() {
  var allDates = faGetAllDates();
  var pairBreaches = {}, pairCount = {};
  for (var i = 0; i < FA_RULES.length; i++) {
    for (var j = i + 1; j < FA_RULES.length; j++) {
      var key = FA_RULES[i].key + '|' + FA_RULES[j].key;
      pairBreaches[key] = 0;
      pairCount[key] = 0;
    }
  }
  allDates.forEach(function(ds) {
    var data = faGetDay(ds);
    if (!data) return;
    var heldMap = {};
    FA_RULES.forEach(function(r) { heldMap[r.key] = r.getHeld(data); });
    for (var i = 0; i < FA_RULES.length; i++) {
      for (var j = i + 1; j < FA_RULES.length; j++) {
        var key = FA_RULES[i].key + '|' + FA_RULES[j].key;
        pairCount[key]++;
        if (!heldMap[FA_RULES[i].key] && !heldMap[FA_RULES[j].key]) pairBreaches[key]++;
      }
    }
  });
  var pairs = [];
  for (var key in pairBreaches) {
    if (!pairCount[key]) continue;
    var parts = key.split('|');
    var r1 = null, r2 = null;
    FA_RULES.forEach(function(r) { if (r.key === parts[0]) r1 = r; if (r.key === parts[1]) r2 = r; });
    pairs.push({ r1: r1, r2: r2, coFail: pairBreaches[key], total: pairCount[key],
                 rate: Math.round(100 * pairBreaches[key] / pairCount[key]) });
  }
  return pairs.sort(function(a, b) { return b.coFail - a.coFail; }).slice(0, 6);
}

function faGetChampionDays() {
  var allDates = faGetAllDates();
  var today = faToday();
  var thisMonth = today.slice(0, 7);
  var thisYear = today.slice(0, 4);
  var allTime = allDates.filter(function(d) { return faDayScore(faGetDay(d)) === 7; });
  var monthCounts = {};
  allTime.forEach(function(d) { var m = d.slice(0, 7); monthCounts[m] = (monthCounts[m] || 0) + 1; });
  var bestMonth = null, bestMonthCount = 0;
  for (var m in monthCounts) {
    if (monthCounts[m] > bestMonthCount) { bestMonthCount = monthCounts[m]; bestMonth = m; }
  }
  return {
    allTime: allTime.length,
    thisMonth: allTime.filter(function(d) { return d.startsWith(thisMonth); }).length,
    thisYear: allTime.filter(function(d) { return d.startsWith(thisYear); }).length,
    bestMonth: bestMonth, bestMonthCount: bestMonthCount,
    lastChampion: allTime.length ? allTime[allTime.length - 1] : null
  };
}

function faGetDangerAlerts(streaks) {
  var alerts = [];
  var today = faToday();
  var MILESTONES = [7, 14, 21, 30, 60, 90, 100, 180, 365];
  (streaks || faComputeStreaks()).forEach(function(s) {
    if (s.current > 0 && MILESTONES.indexOf(s.current + 1) !== -1) {
      alerts.push({ msg: s.rule.icon + ' ' + s.rule.name + ' hits ' + (s.current + 1) + '-day streak TOMORROW!', color: 'var(--gold)' });
    }
    if (s.current === 0 && s.longest > 7) {
      alerts.push({ msg: s.rule.icon + ' ' + s.rule.name + ' streak broken — longest was ' + s.longest + ' days', color: 'var(--red)' });
    }
    if (s.pct < 40 && s.total >= 14) {
      alerts.push({ msg: s.rule.icon + ' ' + s.rule.name + ' failing ' + (100 - s.pct) + '% of days — needs urgent attention', color: '#FF5252' });
    }
  });
  // Check 3-day consecutive breach pattern
  var last3 = [0, 1, 2].map(function(i) { return faAddDays(today, -i); });
  FA_RULES.forEach(function(r) {
    var allBreach = last3.every(function(d) { var data = faGetDay(d); return data && !r.getHeld(data); });
    if (allBreach) alerts.push({ msg: r.icon + ' ' + r.name + ' breached 3 days in a row — BREAK THE PATTERN NOW', color: '#FF5252' });
  });
  return alerts.slice(0, 8);
}

function renderFortressIntel() {
  var el = document.getElementById('fortress-intel-container');
  if (!el) return;
  var streaks  = faComputeStreaks();
  var recovery = faComputeBreachRecovery();
  var corr     = faComputeCorrelation();
  var champ    = faGetChampionDays();
  var alerts   = faGetDangerAlerts(streaks);
  var html = '';

  // Danger Alerts
  if (alerts.length) {
    html += '<div style="margin-bottom:22px">';
    html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--red);margin-bottom:10px">⚠ ACTIVE ALERTS</div>';
    alerts.forEach(function(a) {
      html += '<div style="padding:10px 14px;background:rgba(255,82,82,0.04);border:1px solid rgba(255,82,82,0.14);border-radius:8px;margin-bottom:6px">';
      html += '<div style="font-family:var(--font-mono);font-size:10px;color:' + a.color + ';line-height:1.5">' + a.msg + '</div>';
      html += '</div>';
    });
    html += '</div>';
  }

  // Champion Days
  html += '<div style="margin-bottom:22px">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--gold);margin-bottom:10px">🏆 CHAMPION DAYS (7/7 RULES)</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px">';
  [
    { v: champ.thisMonth, l: 'THIS MONTH', c: 'var(--cyan)' },
    { v: champ.thisYear,  l: 'THIS YEAR',  c: 'var(--gold)' },
    { v: champ.allTime,   l: 'ALL TIME',   c: 'var(--green)' },
    { v: champ.bestMonthCount, l: 'BEST MONTH\n(' + (champ.bestMonth || '—') + ')', c: 'var(--text)' }
  ].forEach(function(k) {
    html += '<div style="background:rgba(245,166,35,0.04);border:1px solid rgba(245,166,35,0.1);border-radius:10px;padding:12px;text-align:center">';
    html += '<div style="font-family:var(--font-mono);font-size:24px;font-weight:700;color:' + k.c + '">' + k.v + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:7px;letter-spacing:1px;color:var(--text-dim);margin-top:4px;white-space:pre-line">' + k.l + '</div>';
    html += '</div>';
  });
  html += '</div>';
  if (champ.lastChampion) html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-top:8px">Last perfect day: ' + champ.lastChampion + '</div>';
  html += '</div>';

  // Co-failure Correlation
  html += '<div style="margin-bottom:22px">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--cyan);margin-bottom:6px">🔗 RULE CO-FAILURE CORRELATION</div>';
  html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-bottom:10px">Rules that fail together on the same day</div>';
  if (!corr.length) {
    html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim)">Not enough data yet (need at least 7 logged days)</div>';
  } else {
    html += '<div style="display:flex;flex-direction:column;gap:6px">';
    corr.forEach(function(p) {
      html += '<div style="padding:10px 12px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:8px">';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">';
      html += '<span style="font-family:var(--font-mono);font-size:10px;color:var(--text)">' + p.r1.icon + ' ' + p.r1.name + ' + ' + p.r2.icon + ' ' + p.r2.name + '</span>';
      html += '<span style="font-family:var(--font-mono);font-size:10px;font-weight:700;color:var(--red)">' + p.coFail + 'x</span>';
      html += '</div>';
      html += '<div style="height:3px;background:rgba(255,255,255,0.04);border-radius:2px;overflow:hidden">';
      html += '<div style="height:100%;width:' + Math.min(100, p.rate * 2) + '%;background:var(--red);border-radius:2px"></div>';
      html += '</div>';
      html += '<div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim);margin-top:4px">Co-failed ' + p.coFail + 'x out of ' + p.total + ' days logged (' + p.rate + '%)</div>';
      html += '</div>';
    });
    html += '</div>';
  }
  html += '</div>';

  // Breach Recovery
  html += '<div style="margin-bottom:22px">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted);margin-bottom:10px">⚡ BREACH RECOVERY ANALYSIS</div>';
  html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-bottom:10px">Avg days to get back on track after a breach</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px">';
  FA_RULES.forEach(function(r) {
    var rec = recovery[r.key];
    var rgb = faHexToRgb(r.hex);
    html += '<div style="background:rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.04);border:1px solid rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.1);border-radius:10px;padding:12px">';
    html += '<div style="font-size:16px;margin-bottom:4px">' + r.icon + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:2px;color:' + r.col + ';margin-bottom:6px">' + r.name + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:var(--text)">' + (rec.avg !== null ? rec.avg + 'd' : '—') + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim)">avg · ' + rec.count + ' breaches</div>';
    html += '</div>';
  });
  html += '</div></div>';

  // Day-of-week vulnerability
  html += '<div style="margin-bottom:22px">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted);margin-bottom:10px">📅 DAY-OF-WEEK VULNERABILITY MAP</div>';
  var allDates = faGetAllDates();
  var dowScores = [0,0,0,0,0,0,0], dowCount = [0,0,0,0,0,0,0];
  var DOW_NAMES = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  allDates.forEach(function(ds) {
    var data = faGetDay(ds);
    if (!data) return;
    var dow = new Date(ds + 'T00:00:00').getDay();
    var score = faDayScore(data);
    if (score !== null) { dowScores[dow] += score; dowCount[dow]++; }
  });
  html += '<div style="display:flex;gap:6px;align-items:flex-end;height:70px;margin-bottom:4px">';
  for (var i = 0; i < 7; i++) {
    var avg = dowCount[i] ? dowScores[i] / dowCount[i] : null;
    var h = avg !== null ? Math.round((avg / 7) * 60) : 0;
    var col = avg === null ? 'rgba(255,255,255,0.05)' : avg >= 6 ? 'var(--green)' : avg >= 4 ? 'var(--gold)' : 'var(--red)';
    html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">';
    html += '<div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim)">' + (avg !== null ? avg.toFixed(1) : '') + '</div>';
    html += '<div style="width:100%;height:' + h + 'px;background:' + col + ';border-radius:3px 3px 0 0;min-height:2px"></div>';
    html += '</div>';
  }
  html += '</div>';
  html += '<div style="display:flex;gap:6px">';
  DOW_NAMES.forEach(function(n) {
    html += '<div style="flex:1;text-align:center;font-family:var(--font-mono);font-size:8px;color:var(--text-dim)">' + n.slice(0,2) + '</div>';
  });
  html += '</div></div>';

  el.innerHTML = html;
}

// ══════════════════════════════════════════════════════
// PANEL 4 — LIFE SCORE COMPOSITE
// ══════════════════════════════════════════════════════
function faMasteryScore(date) {
  var data = faGetMastery(date);
  if (!data || !data.items) return null;
  var done = 0, total = 0;
  data.items.forEach(function(item) {
    if (item.inputType === 'checkbox') {
      total++;
      if (item.value === true || item.value === 'true' || item.value === 1) done++;
    } else if (item.inputType === 'number' || item.inputType === 'emotional') {
      total++;
      var v = parseFloat(item.value);
      if (!isNaN(v) && v > 0) done++;
    } else if (item.inputType === 'text' || item.inputType === 'predictions') {
      total++;
      if (typeof item.value === 'string' && item.value.trim().length > 0) done++;
    }
  });
  return total > 0 ? Math.round(100 * done / total) : null;
}

var _faLifeWeeks = 8;

function renderLifeScore() {
  var el = document.getElementById('life-score-container');
  if (!el) return;
  var today = faToday();
  var numWeeks = _faLifeWeeks || 8;
  var weekData = [];

  for (var w = numWeeks - 1; w >= 0; w--) {
    var weekStart = faAddDays(today, -w * 7 - 6);
    var days = [];
    for (var i = 0; i <= 6; i++) {
      var d = faAddDays(weekStart, i);
      var brahmaData = faGetDay(d);
      days.push({ date: d, fortress: brahmaData ? faDayScore(brahmaData) : null, mastery: faMasteryScore(d) });
    }
    var fVals = days.filter(function(d) { return d.fortress !== null; }).map(function(d) { return d.fortress; });
    var mVals = days.filter(function(d) { return d.mastery !== null; }).map(function(d) { return d.mastery; });
    var avgF = fVals.length ? fVals.reduce(function(a, b) { return a + b; }, 0) / fVals.length : null;
    var avgM = mVals.length ? mVals.reduce(function(a, b) { return a + b; }, 0) / mVals.length : null;
    var lifeScore = null;
    if (avgF !== null && avgM !== null) lifeScore = Math.round((avgF / 7) * 100 * 0.6 + avgM * 0.4);
    else if (avgF !== null) lifeScore = Math.round((avgF / 7) * 100);
    else if (avgM !== null) lifeScore = Math.round(avgM);
    weekData.push({ label: 'W' + (numWeeks - w), start: weekStart, days: days, avgF: avgF, avgM: avgM, lifeScore: lifeScore });
  }

  var thisWeek = weekData[weekData.length - 1];
  var scoreColor = thisWeek.lifeScore === null ? 'var(--text-dim)' :
    thisWeek.lifeScore >= 80 ? 'var(--green)' : thisWeek.lifeScore >= 60 ? 'var(--gold)' : 'var(--red)';

  var html = '<div style="text-align:center;padding:32px 20px;background:linear-gradient(145deg,rgba(255,255,255,0.025),rgba(0,0,0,0.4));border:1px solid rgba(255,255,255,0.07);border-radius:20px;margin-bottom:20px">';
  html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:4px;color:var(--text-dim);margin-bottom:16px">THIS WEEK LIFE SCORE</div>';
  html += '<div style="font-family:var(--font-mono);font-size:72px;font-weight:700;color:' + scoreColor + ';line-height:1">' + (thisWeek.lifeScore !== null ? thisWeek.lifeScore : '—') + '</div>';
  html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);margin-top:4px">/ 100</div>';
  html += '<div style="display:flex;justify-content:center;gap:24px;margin-top:20px">';
  html += '<div style="text-align:center"><div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:var(--brahma)">' + (thisWeek.avgF !== null ? thisWeek.avgF.toFixed(1) + '/7' : '—') + '</div><div style="font-family:var(--font-mono);font-size:8px;letter-spacing:1.5px;color:var(--text-dim)">FORTRESS AVG · 60%</div></div>';
  html += '<div style="text-align:center"><div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:var(--cyan)">' + (thisWeek.avgM !== null ? thisWeek.avgM.toFixed(0) + '%' : '—') + '</div><div style="font-family:var(--font-mono);font-size:8px;letter-spacing:1.5px;color:var(--text-dim)">MASTERY · 40%</div></div>';
  html += '</div></div>';

  // Weekly trend bars
  html += '<div style="margin-bottom:20px">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted);margin-bottom:12px">WEEKLY LIFE SCORE TREND</div>';
  html += '<div style="display:flex;align-items:flex-end;gap:5px;height:90px;margin-bottom:6px">';
  weekData.forEach(function(w) {
    var h = w.lifeScore !== null ? Math.round(w.lifeScore * 0.85) : 0;
    var col = w.lifeScore === null ? 'rgba(255,255,255,0.05)' :
      w.lifeScore >= 80 ? 'var(--green)' : w.lifeScore >= 60 ? 'var(--gold)' : 'var(--red)';
    html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">';
    html += '<div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim)">' + (w.lifeScore !== null ? w.lifeScore : '') + '</div>';
    html += '<div style="width:100%;height:' + h + 'px;background:' + col + ';border-radius:4px 4px 0 0;min-height:3px"></div>';
    html += '</div>';
  });
  html += '</div>';
  html += '<div style="display:flex;gap:5px">';
  weekData.forEach(function(w) {
    html += '<div style="flex:1;text-align:center;font-family:var(--font-mono);font-size:8px;color:var(--text-dim)">' + w.label + '</div>';
  });
  html += '</div></div>';

  // Day-by-day this week
  var DOW_NAMES = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  html += '<div style="margin-bottom:20px">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-muted);margin-bottom:12px">THIS WEEK DAY-BY-DAY</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">';
  thisWeek.days.forEach(function(d) {
    var dayDate = new Date(d.date + 'T00:00:00');
    var isToday = d.date === today;
    var fortCol = d.fortress === null ? 'var(--text-dim)' : d.fortress === 7 ? 'var(--green)' : d.fortress >= 5 ? 'var(--gold)' : 'var(--red)';
    var bg = isToday ? 'rgba(0,212,255,0.06)' : 'rgba(255,255,255,0.02)';
    var border = isToday ? '1px solid rgba(0,212,255,0.2)' : '1px solid rgba(255,255,255,0.05)';
    html += '<div style="background:' + bg + ';border:' + border + ';border-radius:8px;padding:8px 4px;text-align:center">';
    html += '<div style="font-family:var(--font-mono);font-size:7px;letter-spacing:1px;color:var(--text-dim)">' + DOW_NAMES[dayDate.getDay()] + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);margin-top:2px">' + dayDate.getDate() + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:' + fortCol + ';margin-top:6px">' + (d.fortress !== null ? d.fortress : '·') + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:7px;color:var(--text-dim)">FORT</div>';
    html += '<div style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:var(--cyan);margin-top:4px">' + (d.mastery !== null ? d.mastery + '%' : '·') + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:7px;color:var(--text-dim)">MAST</div>';
    html += '</div>';
  });
  html += '</div></div>';

  // Formula
  html += '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:14px">';
  html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-dim);margin-bottom:6px">SCORING FORMULA</div>';
  html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">Life Score = (Fortress/7 × 60%) + (Mastery% × 40%)</div>';
  html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-top:4px">Fortress rules carry more weight — they are the non-negotiable foundation</div>';
  html += '</div>';

  el.innerHTML = html;
}

// ══════════════════════════════════════════════════════
// PANEL 5 — MASTERY RITUAL HEATMAP
// ══════════════════════════════════════════════════════
function renderMasteryRitualHeatmap() {
  var el = document.getElementById('mastery-heatmap-container');
  if (!el) return;
  var today = faToday();
  var numDays = 30;
  var dates = [];
  for (var i = numDays - 1; i >= 0; i--) dates.push(faAddDays(today, -i));

  var items = (typeof MASTERY_ITEMS !== 'undefined') ? MASTERY_ITEMS : [];
  var domains = (typeof MASTERY_DOMAINS !== 'undefined') ? MASTERY_DOMAINS : {};

  if (!items.length) {
    el.innerHTML = '<div style="font-family:var(--font-mono);font-size:12px;color:var(--text-dim);padding:20px">Mastery data not available. Open Mastery Daily first to load items.</div>';
    return;
  }

  // Gather completion data
  var itemData = {};
  items.forEach(function(item) { itemData[item.id] = {}; });
  dates.forEach(function(d) {
    var data = faGetMastery(d);
    if (!data || !data.items) return;
    data.items.forEach(function(entry) {
      if (!itemData[entry.id]) return;
      var done = false;
      if (entry.inputType === 'checkbox') done = entry.value === true || entry.value === 'true' || entry.value === 1;
      else if (entry.inputType === 'number' || entry.inputType === 'emotional') { var v = parseFloat(entry.value); done = !isNaN(v) && v > 0; }
      else if (entry.inputType === 'text' || entry.inputType === 'predictions') done = typeof entry.value === 'string' && entry.value.trim().length > 0;
      itemData[entry.id][d] = done;
    });
  });

  var DOW_NAMES = ['S','M','T','W','T','F','S'];
  var DOMAIN_COLORS = { A: '#00D4FF', B: '#F5A623', C: '#CE93D8', D: '#00E676', E: '#FF5252' };

  var html = '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:8px">';
  html += '<div style="min-width:max-content">';

  // Date header
  html += '<div style="display:flex;gap:1px;margin-bottom:6px;align-items:flex-end">';
  html += '<div style="width:176px;flex-shrink:0;font-family:var(--font-mono);font-size:9px;letter-spacing:1px;color:var(--text-dim)">ITEM</div>';
  dates.forEach(function(d) {
    var dd = new Date(d + 'T00:00:00');
    var isToday = d === today;
    html += '<div style="width:16px;flex-shrink:0;text-align:center">';
    html += '<div style="font-family:var(--font-mono);font-size:7px;color:' + (isToday ? 'var(--cyan)' : 'rgba(255,255,255,0.2)') + '">' + DOW_NAMES[dd.getDay()] + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:7px;font-weight:' + (isToday ? 700 : 400) + ';color:' + (isToday ? 'var(--cyan)' : 'rgba(255,255,255,0.3)') + '">' + dd.getDate() + '</div>';
    html += '</div>';
  });
  html += '</div>';

  // Rows grouped by domain
  Object.keys(domains).forEach(function(dk) {
    var dItems = items.filter(function(item) { return item.domain === dk; });
    if (!dItems.length) return;
    var dColor = DOMAIN_COLORS[dk] || '#aaa';
    var rgb = faHexToRgb(dColor);

    // Domain header
    html += '<div style="display:flex;gap:1px;margin:10px 0 3px;align-items:center">';
    html += '<div style="width:176px;flex-shrink:0;font-family:var(--font-mono);font-size:8px;letter-spacing:2px;font-weight:700;color:' + dColor + '">' + dk + ' — ' + (domains[dk] || '') + '</div>';
    dates.forEach(function() { html += '<div style="width:16px;flex-shrink:0"></div>'; });
    html += '</div>';

    dItems.forEach(function(item) {
      // Compute pct for this item
      var loggedCount = 0, doneCount = 0;
      dates.forEach(function(d) {
        if (itemData[item.id][d] !== undefined) { loggedCount++; if (itemData[item.id][d]) doneCount++; }
      });
      var pct = loggedCount ? Math.round(100 * doneCount / loggedCount) : null;
      var pctCol = pct === null ? 'var(--text-dim)' : pct >= 80 ? dColor : pct >= 50 ? '#F5A623' : '#FF5252';

      html += '<div style="display:flex;gap:1px;margin-bottom:1px;align-items:center">';
      html += '<div style="width:176px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;padding-right:6px">';
      html += '<div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px" title="' + item.label + '">' + item.id + '. ' + item.label + '</div>';
      html += '<div style="font-family:var(--font-mono);font-size:8px;font-weight:700;color:' + pctCol + ';flex-shrink:0;margin-left:4px">' + (pct !== null ? pct + '%' : '') + '</div>';
      html += '</div>';
      dates.forEach(function(d) {
        var done = itemData[item.id][d];
        var noData = itemData[item.id][d] === undefined;
        var isToday = d === today;
        var bg = noData ? 'rgba(255,255,255,0.03)' : done ? 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.75)' : 'rgba(255,82,82,0.18)';
        var outline = isToday ? 'outline:1.5px solid var(--cyan);outline-offset:1px;' : '';
        html += '<div style="width:16px;height:16px;flex-shrink:0;border-radius:2px;background:' + bg + ';' + outline + '" title="' + d + (noData ? '' : done ? ' ✓' : ' ✗') + '"></div>';
      });
      html += '</div>';
    });
  });

  html += '</div></div>';

  // Legend
  html += '<div style="display:flex;gap:16px;margin-top:14px;flex-wrap:wrap">';
  [
    { bg: 'rgba(0,212,255,0.7)',  label: 'Completed' },
    { bg: 'rgba(255,82,82,0.18)', label: 'Missed' },
    { bg: 'rgba(255,255,255,0.03)', label: 'No log' }
  ].forEach(function(l) {
    html += '<div style="display:flex;align-items:center;gap:6px"><div style="width:12px;height:12px;border-radius:2px;background:' + l.bg + '"></div><div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim)">' + l.label + '</div></div>';
  });
  html += '</div>';

  el.innerHTML = html;
}
