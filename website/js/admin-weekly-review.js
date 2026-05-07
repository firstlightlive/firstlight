// ═══════════════════════════════════════════════════════
// FIRST LIGHT — WEEKLY REVIEW RITUAL
// Replaces buildWeeklyReview() from admin-weekly.js
// Sunday deep-dive: wins, failures, non-negotiables, data
// ═══════════════════════════════════════════════════════

// ── DATA HELPERS ─────────────────────────────────────────────
function _wrGetMonday(date) {
  var d = date ? new Date(date) : new Date();
  var day = d.getDay(); // 0=Sun, 1=Mon...
  var diff = (day === 0) ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function _wrDs(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function _wrWeekKey(monday) {
  return _wrDs(typeof monday === 'object' ? monday : new Date(monday));
}

function _wrGetData(key) {
  try { return JSON.parse(localStorage.getItem('fl_wr_' + key) || '{}'); } catch (e) { return {}; }
}

function _wrSaveData(key, data) {
  data.savedAt = new Date().toISOString();
  localStorage.setItem('fl_wr_' + key, JSON.stringify(data));
  if (typeof syncSave === 'function') {
    syncSave('weekly_schedule', { week_key: 'review_' + key, data: JSON.stringify(data) }, 'week_key');
  }
}

// ── COMPUTE WEEK SNAPSHOT ─────────────────────────────────────
function _wrSnapshot(monday) {
  var days = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(monday); d.setDate(monday.getDate() + i);
    days.push(_wrDs(d));
  }

  // Ritual completion (morning/evening)
  var mornScores = [], eveScores = [];
  days.forEach(function (date) {
    var mornDone = 0, eveDone = 0, mornTotal = 0, eveTotal = 0;
    try {
      var mDefs = (typeof getRitualDefs === 'function') ? getRitualDefs('morning').filter(function (r) { return r.active !== false; }) : [];
      var eDefs = (typeof getRitualDefs === 'function') ? getRitualDefs('evening').filter(function (r) { return r.active !== false; }) : [];
      mornTotal = mDefs.length || 1;
      eveTotal = eDefs.length || 1;
      var mDone = JSON.parse(localStorage.getItem('fl_rituals_morning_' + date) || '[]');
      var eDone = JSON.parse(localStorage.getItem('fl_rituals_evening_' + date) || '[]');
      mornDone = mDone.length;
      eveDone = eDone.length;
    } catch (e) {}
    mornScores.push(Math.round(mornDone / mornTotal * 100));
    eveScores.push(Math.round(eveDone / eveTotal * 100));
  });

  var avgMorn = Math.round(mornScores.reduce(function (a, b) { return a + b; }, 0) / 7);
  var avgEve = Math.round(eveScores.reduce(function (a, b) { return a + b; }, 0) / 7);
  var perfectDays = mornScores.filter(function (m, i) { return m >= 90 && eveScores[i] >= 90; }).length;

  // Mastery avg
  var mastScores = [];
  days.forEach(function (date) {
    var ms = (typeof faMasteryScore === 'function') ? faMasteryScore(date) : null;
    if (ms !== null) mastScores.push(ms);
  });
  var mastAvg = mastScores.length ? Math.round(mastScores.reduce(function (a, b) { return a + b; }, 0) / mastScores.length) : null;

  // Mastery domain breakdown (this week vs prev week)
  var prevDays = [];
  for (var j = 0; j < 7; j++) {
    var pd = new Date(monday); pd.setDate(monday.getDate() - 7 + j);
    prevDays.push(_wrDs(pd));
  }

  var domains = (typeof MASTERY_DOMAINS !== 'undefined') ? MASTERY_DOMAINS : {};
  var items = (typeof MASTERY_ITEMS !== 'undefined') ? MASTERY_ITEMS : [];
  var domainTrend = [];

  Object.keys(domains).forEach(function (dk) {
    var dom = domains[dk];
    var domItems = items.filter(function (it) { return it.domain === dk; });
    if (!domItems.length) return;

    function avgForDays(daysArr) {
      var scores = [];
      daysArr.forEach(function (date) {
        try {
          var data = JSON.parse(localStorage.getItem('fl_mastery_daily_' + date) || '{}');
          if (!Object.keys(data).length) return;
          var done = domItems.filter(function (item) {
            var e = data[item.id];
            return e && (e.done === true || (e.value && e.value !== ''));
          }).length;
          scores.push(Math.round(done / domItems.length * 100));
        } catch (e) {}
      });
      return scores.length ? Math.round(scores.reduce(function (a, b) { return a + b; }, 0) / scores.length) : null;
    }

    var thisWeekAvg = avgForDays(days);
    var prevWeekAvg = avgForDays(prevDays);
    domainTrend.push({ key: dk, name: dom.name, color: dom.color, this: thisWeekAvg, prev: prevWeekAvg });
  });

  // Sleep / Runs / Gym from proof data
  var proof = (typeof getProofData === 'function') ? getProofData() : [];
  var pm = {};
  proof.forEach(function (p) { pm[p.date] = p; });

  var sleeps = [], runs = 0, gyms = 0;
  days.forEach(function (date) {
    var p = pm[date] || {};
    if (p.sleepHrs) sleeps.push(parseFloat(p.sleepHrs));
    if (p.runKm > 0) runs++;
    if (p.gym) gyms++;
    if (!p.gym) {
      try {
        var gw = JSON.parse(localStorage.getItem('fl_gym_workout_' + date) || 'null');
        if (gw && gw.exercises && gw.exercises.length > 0) gyms++;
      } catch (e) {}
    }
  });
  var sleepAvg = sleeps.length ? (sleeps.reduce(function (a, b) { return a + b; }, 0) / sleeps.length).toFixed(1) : null;

  // Deep work
  var dwHours = 0, dwSessions = 0;
  days.forEach(function (date) {
    try {
      var dw = JSON.parse(localStorage.getItem('fl_deepwork_' + date) || 'null');
      if (dw && dw.blocks) {
        dw.blocks.forEach(function (b) {
          if (b.done) {
            dwSessions++;
            if (b.time && b.time.indexOf('-') > -1) {
              var pts = b.time.split('-');
              var s = _wrParseTime(pts[0]), e = _wrParseTime(pts[1]);
              if (s !== null && e !== null && e > s) dwHours += (e - s);
            } else { dwHours += 1.5; }
          }
        });
      }
    } catch (e) {}
  });

  return {
    avgMorn: avgMorn, avgEve: avgEve, perfectDays: perfectDays, overall: Math.round((avgMorn + avgEve) / 2),
    mastAvg: mastAvg, domainTrend: domainTrend,
    sleepAvg: sleepAvg, runs: runs, gyms: gyms,
    dwHours: parseFloat(dwHours.toFixed(1)), dwSessions: dwSessions,
    days: days, mornScores: mornScores, eveScores: eveScores
  };
}

function _wrParseTime(s) {
  if (!s) return null;
  s = s.trim().replace(/\s/g, '');
  var m = s.match(/^(\d{1,2}):(\d{2})(AM|PM)?$/i);
  if (!m) return null;
  var h = parseInt(m[1]), mn = parseInt(m[2]);
  if (/PM/i.test(s) && h < 12) h += 12;
  if (/AM/i.test(s) && h === 12) h = 0;
  return h + mn / 60;
}

// ── MAIN RENDER ───────────────────────────────────────────────
function buildWeeklyReview() {
  var container = document.getElementById('weeklyReviewContent');
  if (!container) return;

  var today = (typeof getNowIST === 'function') ? getNowIST() : new Date();
  var monday = _wrGetMonday(today);
  var weekKey = _wrWeekKey(monday);
  var isSunday = today.getDay() === 0;

  // Week number
  var startOfYear = new Date(today.getFullYear(), 0, 1);
  var weekNum = Math.ceil(((today - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);

  var data = _wrGetData(weekKey);
  var snap = _wrSnapshot(monday);

  var monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  var sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  var weekLabel = 'WK ' + weekNum + ' · ' + monday.getDate() + ' ' + monthNames[monday.getMonth()] + ' – ' + sunday.getDate() + ' ' + monthNames[sunday.getMonth()];

  var html = '';

  // ── HEADER + LOCK BANNER ──
  html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:20px">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text-dim)">' + weekLabel + '</div>';
  html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:1px;color:' + (isSunday ? 'var(--green)' : 'var(--text-dim)') + '">' + (isSunday ? '✓ SUNDAY — EDIT UNLOCKED' : 'EDITABLE SUNDAYS ONLY') + '</div>';
  html += '</div>';

  if (!isSunday) {
    html += '<div style="padding:12px 16px;background:rgba(255,165,0,0.05);border:1px solid rgba(255,165,0,0.15);border-radius:8px;margin-bottom:20px;display:flex;align-items:center;gap:10px">';
    html += '<div style="font-size:18px">🔒</div>';
    html += '<div style="font-family:var(--font-mono);font-size:10px;color:rgba(255,165,0,0.8)">Review is read-only · Come back Sunday to write this week\'s reflection</div>';
    html += '</div>';
  }

  // ── KPI ROW ──
  var kpiItems = [
    { val: snap.avgMorn + '%', label: 'AVG MORNING', color: 'var(--cyan)' },
    { val: snap.avgEve + '%', label: 'AVG EVENING', color: 'var(--gold)' },
    { val: snap.perfectDays + '/7', label: '90%+ DAYS', color: 'var(--green)' },
    { val: snap.overall + '%', label: 'RITUAL SCORE', color: snap.overall >= 80 ? 'var(--green)' : snap.overall >= 60 ? 'var(--gold)' : 'var(--red)' },
    { val: snap.mastAvg !== null ? snap.mastAvg + '%' : '—', label: 'MASTERY AVG', color: 'var(--cyan)' }
  ];

  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px;margin-bottom:28px">';
  kpiItems.forEach(function (k) {
    html += '<div style="background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:16px 10px;text-align:center">';
    html += '<div style="font-family:var(--font-mono);font-size:22px;font-weight:700;color:' + k.color + ';line-height:1">' + k.val + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:7.5px;letter-spacing:1.5px;color:var(--text-dim);margin-top:6px">' + k.label + '</div>';
    html += '</div>';
  });
  html += '</div>';

  // ── DATA SNAPSHOT ──
  html += '<div style="background:rgba(0,212,255,0.03);border:1px solid rgba(0,212,255,0.08);border-radius:10px;padding:14px 16px;margin-bottom:24px">';
  html += '<div style="font-family:var(--font-mono);font-size:8.5px;letter-spacing:2.5px;color:var(--cyan);margin-bottom:10px;font-weight:700">DATA SNAPSHOT</div>';
  html += '<div style="display:flex;flex-wrap:wrap;gap:6px 20px">';
  var snapItems = [
    { icon: '😴', label: 'Sleep', val: snap.sleepAvg ? snap.sleepAvg + 'h avg' : 'no data' },
    { icon: '🏃', label: 'Runs', val: snap.runs + ' this week' },
    { icon: '🏋', label: 'Gym', val: snap.gyms + ' sessions' },
    { icon: '🎯', label: 'Deep Work', val: snap.dwHours + 'h · ' + snap.dwSessions + ' blocks' }
  ];
  snapItems.forEach(function (s) {
    html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">' + s.icon + ' <span style="color:var(--text-dim)">' + s.label + ':</span> <span style="color:var(--text)">' + s.val + '</span></div>';
  });
  html += '</div></div>';

  // ── QUALITATIVE SECTION ──
  var qReadonly = !isSunday;
  var roAttr = qReadonly ? ' readonly disabled style="opacity:0.5;cursor:not-allowed"' : '';

  // TOP 3 WINS
  html += '<div class="panel-section">';
  html += '<div class="panel-section-title" style="color:var(--green)">🏆 TOP 3 WINS THIS WEEK</div>';
  html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-bottom:10px">What went really well? Momentum you want to build on.</div>';
  [0, 1, 2].forEach(function (i) {
    var val = (data.wins && data.wins[i]) ? data.wins[i] : '';
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">';
    html += '<div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:var(--green);min-width:24px;opacity:0.6">' + (i + 1) + '</div>';
    html += '<input type="text" id="wr_win_' + i + '" value="' + _wrEsc(val) + '" placeholder="Win #' + (i + 1) + ' — be specific" ' + (qReadonly ? 'readonly' : '') + ' oninput="_wrAutosave()" style="flex:1;background:rgba(0,230,118,0.04);border:1px solid rgba(0,230,118,' + (qReadonly ? '0.08' : '0.15') + ');border-radius:6px;padding:10px 12px;font-family:var(--font-mono);font-size:11px;color:var(--text);outline:none;' + (qReadonly ? 'opacity:0.6;cursor:not-allowed' : '') + '">';
    html += '</div>';
  });
  html += '</div>';

  // TOP 3 FAILURES + ROOT CAUSE
  html += '<div class="panel-section">';
  html += '<div class="panel-section-title" style="color:var(--red)">⚡ TOP 3 FAILURES + ROOT CAUSE</div>';
  html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-bottom:12px">What broke down? What was the real reason — not the excuse.</div>';

  html += '<div style="display:grid;grid-template-columns:1fr 12px 1fr;gap:0;align-items:center;margin-bottom:8px">';
  html += '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:1.5px;color:var(--text-dim);padding:0 4px">WHAT FAILED</div>';
  html += '<div></div>';
  html += '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:1.5px;color:var(--text-dim);padding:0 4px">ROOT CAUSE</div>';
  html += '</div>';

  [0, 1, 2].forEach(function (i) {
    var fw = (data.failures && data.failures[i]) ? data.failures[i].what || '' : '';
    var fr = (data.failures && data.failures[i]) ? data.failures[i].why || '' : '';
    html += '<div style="display:grid;grid-template-columns:1fr 20px 1fr;gap:4px;align-items:center;margin-bottom:8px">';
    html += '<input type="text" id="wr_fail_' + i + '_what" value="' + _wrEsc(fw) + '" placeholder="What failed" ' + (qReadonly ? 'readonly' : '') + ' oninput="_wrAutosave()" style="background:rgba(255,82,82,0.04);border:1px solid rgba(255,82,82,' + (qReadonly ? '0.07' : '0.15') + ');border-radius:6px;padding:9px 10px;font-family:var(--font-mono);font-size:10px;color:var(--text);outline:none;' + (qReadonly ? 'opacity:0.6;cursor:not-allowed' : '') + '">';
    html += '<div style="text-align:center;font-family:var(--font-mono);font-size:12px;color:var(--text-dim)">→</div>';
    html += '<input type="text" id="wr_fail_' + i + '_why" value="' + _wrEsc(fr) + '" placeholder="Root cause" ' + (qReadonly ? 'readonly' : '') + ' oninput="_wrAutosave()" style="background:rgba(255,82,82,0.04);border:1px solid rgba(255,82,82,' + (qReadonly ? '0.07' : '0.15') + ');border-radius:6px;padding:9px 10px;font-family:var(--font-mono);font-size:10px;color:var(--text);outline:none;' + (qReadonly ? 'opacity:0.6;cursor:not-allowed' : '') + '">';
    html += '</div>';
  });
  html += '</div>';

  // NON-NEGOTIABLE NEXT WEEK
  html += '<div class="panel-section">';
  html += '<div class="panel-section-title" style="color:var(--cyan)">🎯 NON-NEGOTIABLE FOR NEXT WEEK</div>';
  html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-bottom:10px">The ONE thing you commit to no matter what. Specific. Measurable.</div>';
  var nnVal = data.nonNeg || '';
  html += '<textarea id="wr_nonneg" ' + (qReadonly ? 'readonly' : '') + ' oninput="_wrAutosave()" placeholder="e.g. Complete every brahma rule every day · No exceptions." style="width:100%;box-sizing:border-box;background:rgba(0,212,255,0.03);border:1px solid rgba(0,212,255,' + (qReadonly ? '0.07' : '0.15') + ');border-radius:8px;padding:12px;font-family:var(--font-mono);font-size:11px;color:var(--text);outline:none;resize:vertical;min-height:60px;' + (qReadonly ? 'opacity:0.6;cursor:not-allowed' : '') + '">' + _wrEsc(nnVal) + '</textarea>';
  html += '</div>';

  // WEEK RATING
  html += '<div class="panel-section">';
  html += '<div class="panel-section-title">⭐ WEEK RATING</div>';
  html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-bottom:12px">Honest self-assessment — how would you rate this week overall?</div>';
  html += '<div style="display:flex;gap:6px;flex-wrap:wrap">';
  var currentRating = data.rating || 0;
  for (var r = 1; r <= 10; r++) {
    var isActive = r <= currentRating;
    var rColor = r <= 3 ? '#FF5252' : r <= 6 ? '#F5A623' : r <= 8 ? '#00D4FF' : '#00E676';
    html += '<button id="wr_rat_' + r + '" onclick="_wrSetRating(' + r + ')" style="width:40px;height:40px;border-radius:8px;border:1px solid ' + (isActive ? rColor : 'rgba(255,255,255,0.08)') + ';background:' + (isActive ? rColor + '22' : 'transparent') + ';font-family:var(--font-mono);font-size:12px;font-weight:700;color:' + (isActive ? rColor : 'var(--text-dim)') + ';cursor:' + (qReadonly ? 'not-allowed' : 'pointer') + ';-webkit-tap-highlight-color:transparent;touch-action:manipulation' + (qReadonly ? ';opacity:0.5;pointer-events:none' : '') + '">' + r + '</button>';
  }
  html += '</div>';
  if (currentRating > 0) {
    var ratingLabel = currentRating <= 3 ? 'Rough week — reflect deeply' : currentRating <= 5 ? 'Below par — identify the gaps' : currentRating <= 7 ? 'Solid week — keep building' : currentRating <= 9 ? 'Strong week — momentum is real' : 'Elite execution — replicate this';
    html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-top:10px">' + ratingLabel + '</div>';
  }
  html += '</div>';

  // MASTERY DOMAIN TRENDS
  if (snap.domainTrend.length > 0) {
    html += '<div class="panel-section">';
    html += '<div class="panel-section-title">🧠 MASTERY DOMAIN TRENDS</div>';
    html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-bottom:12px">This week vs last week per domain</div>';

    snap.domainTrend.forEach(function (d) {
      var delta = (d.this !== null && d.prev !== null) ? d.this - d.prev : null;
      var arrow = delta === null ? '—' : delta > 0 ? '▲ +' + delta + '%' : delta < 0 ? '▼ ' + delta + '%' : '── same';
      var arrowCol = delta === null ? 'var(--text-dim)' : delta > 0 ? 'var(--green)' : delta < 0 ? 'var(--red)' : 'var(--text-dim)';
      var barW = d.this !== null ? d.this : 0;
      var barCol = barW >= 80 ? 'var(--green)' : barW >= 60 ? 'var(--gold)' : 'var(--red)';

      html += '<div style="margin-bottom:12px">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">';
      html += '<div style="font-family:var(--font-mono);font-size:9px;color:' + d.color + ';letter-spacing:0.5px">' + d.name + '</div>';
      html += '<div style="display:flex;align-items:center;gap:12px">';
      html += '<div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--text)">' + (d.this !== null ? d.this + '%' : '—') + '</div>';
      html += '<div style="font-family:var(--font-mono);font-size:10px;color:' + arrowCol + ';min-width:60px;text-align:right">' + arrow + '</div>';
      html += '</div></div>';
      html += '<div style="height:5px;background:rgba(255,255,255,0.06);border-radius:3px"><div style="height:100%;width:' + barW + '%;background:' + barCol + ';border-radius:3px"></div></div>';
      html += '</div>';
    });
    html += '</div>';
  }

  // 7-DAY BREAKDOWN
  var dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  var todayStr = _wrDs(today);

  html += '<div class="panel-section">';
  html += '<div class="panel-section-title">THIS WEEK — DAY BY DAY</div>';
  snap.days.forEach(function (date, i) {
    var m = snap.mornScores[i], e = snap.eveScores[i];
    var overall = Math.round((m + e) / 2);
    var col = overall >= 90 ? 'var(--green)' : overall >= 60 ? 'var(--gold)' : overall >= 30 ? '#FF9800' : 'var(--red)';
    var dayDate = new Date(date + 'T00:00:00');
    var isToday = date === todayStr;

    html += '<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(0,212,255,0.04)">';
    html += '<div style="font-family:var(--font-mono);font-size:10px;font-weight:700;color:' + (isToday ? 'var(--cyan)' : 'var(--text-dim)') + ';min-width:34px">' + dayNames[dayDate.getDay()] + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);min-width:20px">' + dayDate.getDate() + '</div>';
    html += '<div style="flex:1;display:flex;align-items:center;gap:5px">';
    html += '<div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim);min-width:14px">AM</div>';
    html += '<div style="flex:1;height:6px;background:var(--bg3);border-radius:3px"><div style="height:100%;width:' + m + '%;background:var(--cyan);border-radius:3px"></div></div>';
    html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);min-width:26px;text-align:right">' + m + '%</div>';
    html += '</div>';
    html += '<div style="flex:1;display:flex;align-items:center;gap:5px">';
    html += '<div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim);min-width:14px">PM</div>';
    html += '<div style="flex:1;height:6px;background:var(--bg3);border-radius:3px"><div style="height:100%;width:' + e + '%;background:var(--gold);border-radius:3px"></div></div>';
    html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);min-width:26px;text-align:right">' + e + '%</div>';
    html += '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:' + col + ';min-width:32px;text-align:right">' + overall + '%</div>';
    html += '</div>';
  });
  html += '</div>';

  // 4-WEEK HISTORY
  html += '<div class="panel-section">';
  html += '<div class="panel-section-title">4-WEEK RITUAL HISTORY</div>';
  var prevData = [];
  for (var w = 0; w < 4; w++) {
    var wMon = new Date(monday); wMon.setDate(monday.getDate() - w * 7);
    var wSnap = _wrSnapshot(wMon);
    var wKey = _wrWeekKey(wMon);
    var wRev = _wrGetData(wKey);
    prevData.push({ label: _wrDs(wMon), snap: wSnap, rating: wRev.rating || 0 });
  }

  var prevOverallLast = null;
  prevData.forEach(function (wd, idx) {
    var s = wd.snap.overall;
    var delta = prevOverallLast !== null ? s - prevOverallLast : null;
    var arrow = delta === null ? '' : delta > 0 ? '▲+' + delta : delta < 0 ? '▼' + delta : '——';
    var arrowCol = delta === null ? '' : delta > 0 ? 'var(--green)' : delta < 0 ? 'var(--red)' : 'var(--text-dim)';
    var barCol = s >= 80 ? 'var(--green)' : s >= 60 ? 'var(--gold)' : 'var(--red)';
    var stars = wd.rating > 0 ? '★'.repeat(Math.round(wd.rating / 2)) : '';

    html += '<div style="display:grid;grid-template-columns:90px 1fr 46px 46px;gap:8px;align-items:center;padding:9px 0;border-bottom:1px solid rgba(0,212,255,0.04)">';
    html += '<div style="font-family:var(--font-mono);font-size:9.5px;color:' + (idx === 0 ? 'var(--cyan)' : 'var(--text-muted)') + '">' + wd.label + '</div>';
    html += '<div class="prog-bar" style="margin:0"><div class="prog-fill" style="width:' + s + '%;background:' + barCol + '"></div></div>';
    html += '<div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--text);text-align:right">' + s + '%</div>';
    html += '<div style="font-family:var(--font-mono);font-size:10px;color:' + (arrowCol || 'var(--text-dim)') + ';text-align:right">' + arrow + '</div>';
    html += '</div>';
    if (stars) {
      html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--gold);margin-top:-6px;padding-bottom:6px;padding-left:98px">' + stars + ' (' + wd.rating + '/10)</div>';
    }
    prevOverallLast = s;
  });
  html += '</div>';

  // SAVE STATUS
  if (isSunday) {
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding:12px 16px;background:rgba(0,230,118,0.04);border:1px solid rgba(0,230,118,0.12);border-radius:8px">';
    html += '<div id="wr_save_status" style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim)">' + (data.savedAt ? 'Last saved ' + new Date(data.savedAt).toLocaleTimeString() : 'Not saved yet') + '</div>';
    html += '<button onclick="_wrSaveNow()" style="font-family:var(--font-mono);font-size:10px;letter-spacing:1px;padding:8px 18px;background:rgba(0,230,118,0.12);border:1px solid rgba(0,230,118,0.3);border-radius:6px;color:var(--green);cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation">SAVE REVIEW</button>';
    html += '</div>';
  }

  container.innerHTML = html;
  // Store current week key for autosave
  container._wrCurrentKey = weekKey;
}

// ── AUTOSAVE & MANUAL SAVE ────────────────────────────────────
function _wrEsc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _wrCollectData() {
  var wins = [0, 1, 2].map(function (i) {
    var el = document.getElementById('wr_win_' + i);
    return el ? el.value.trim() : '';
  });
  var failures = [0, 1, 2].map(function (i) {
    var w = document.getElementById('wr_fail_' + i + '_what');
    var y = document.getElementById('wr_fail_' + i + '_why');
    return { what: w ? w.value.trim() : '', why: y ? y.value.trim() : '' };
  });
  var nnEl = document.getElementById('wr_nonneg');
  var nonNeg = nnEl ? nnEl.value.trim() : '';

  // Rating from highlighted buttons
  var rating = 0;
  for (var r = 10; r >= 1; r--) {
    var btn = document.getElementById('wr_rat_' + r);
    if (btn && btn.style.background && btn.style.background !== 'transparent') { rating = r; break; }
  }
  return { wins: wins, failures: failures, nonNeg: nonNeg, rating: rating };
}

var _wrAutosaveTimer = null;
function _wrAutosave() {
  clearTimeout(_wrAutosaveTimer);
  _wrAutosaveTimer = setTimeout(function () {
    var container = document.getElementById('weeklyReviewContent');
    var key = container ? container._wrCurrentKey : null;
    if (!key) return;
    var data = _wrGetData(key);
    var fresh = _wrCollectData();
    data.wins = fresh.wins;
    data.failures = fresh.failures;
    data.nonNeg = fresh.nonNeg;
    if (fresh.rating > 0) data.rating = fresh.rating;
    _wrSaveData(key, data);
    var status = document.getElementById('wr_save_status');
    if (status) status.textContent = 'Auto-saved ' + new Date().toLocaleTimeString();
  }, 800);
}

function _wrSetRating(r) {
  var container = document.getElementById('weeklyReviewContent');
  var key = container ? container._wrCurrentKey : null;
  if (!key) return;

  var today = (typeof getNowIST === 'function') ? getNowIST() : new Date();
  if (today.getDay() !== 0) return; // Sundays only

  var rColors = ['', '#FF5252', '#FF5252', '#FF5252', '#F5A623', '#F5A623', '#F5A623', '#00D4FF', '#00D4FF', '#00E676', '#00E676'];
  for (var i = 1; i <= 10; i++) {
    var btn = document.getElementById('wr_rat_' + i);
    if (!btn) continue;
    var active = i <= r;
    var col = rColors[i];
    btn.style.background = active ? col + '22' : 'transparent';
    btn.style.border = '1px solid ' + (active ? col : 'rgba(255,255,255,0.08)');
    btn.style.color = active ? col : 'var(--text-dim)';
  }

  var data = _wrGetData(key);
  data.rating = r;
  _wrSaveData(key, data);
  var status = document.getElementById('wr_save_status');
  if (status) status.textContent = 'Rating saved · ' + new Date().toLocaleTimeString();
}

function _wrSaveNow() {
  var container = document.getElementById('weeklyReviewContent');
  var key = container ? container._wrCurrentKey : null;
  if (!key) return;
  var data = _wrGetData(key);
  var fresh = _wrCollectData();
  Object.assign(data, fresh);
  _wrSaveData(key, data);
  var status = document.getElementById('wr_save_status');
  if (status) {
    status.textContent = '✓ Saved ' + new Date().toLocaleTimeString();
    status.style.color = 'var(--green)';
    setTimeout(function () { if (status) status.style.color = 'var(--text-dim)'; }, 3000);
  }
}
