// ═══════════════════════════════════════════
// FIRST LIGHT — EKADASHI TRACKER
// 3 tabs: CALENDAR · MY JOURNEY · ALL TIME
// ═══════════════════════════════════════════

var _ekadashiMonth = new Date().getMonth();
var _ekadashiYear  = new Date().getFullYear();
var _ekadashiTab   = 'calendar';
var _ekadashiCache = {};

// ── EKADASHI NAMES ──
var EKADASHI_NAMES = {
  shukla:  ['Putrada','Jaya','Amalaki','Kamada','Mohini','Nirjala','Devshayani','Putrada','Parsva','Papankusha','Prabodhini','Mokshada'],
  krishna: ['Shattila','Vijaya','Papamochani','Varuthini','Apara','Yogini','Kamika','Aja','Indira','Rama','Utpanna','Saphala']
};

// ── TITHI CALCULATION ──
function calculateTithi(date) {
  var epoch = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
  var synodicMonth = 29.530588853;
  var daysSince = (date.getTime() - epoch.getTime()) / 86400000;
  var lunarDay = ((daysSince % synodicMonth) + synodicMonth) % synodicMonth;
  return Math.floor(lunarDay / (synodicMonth / 30)) + 1;
}

// ── ALL EKADASHI DATES FOR A YEAR ──
function getEkadashiYear(year) {
  if (_ekadashiCache[year]) return _ekadashiCache[year];
  var dates = [];
  var shuklaIdx = 0, krishnaIdx = 0;
  for (var m = 0; m < 12; m++) {
    var daysInMonth = new Date(year, m + 1, 0).getDate();
    for (var d = 1; d <= daysInMonth; d++) {
      var tithi = calculateTithi(new Date(year, m, d, 12));
      if (tithi === 11) {
        var sName = EKADASHI_NAMES.shukla[shuklaIdx % 12];
        dates.push({ date: year + '-' + String(m+1).padStart(2,'0') + '-' + String(d).padStart(2,'0'), day: d, month: m, year: year, name: sName, paksha: 'shukla', fullName: sName + ' Ekadashi' });
        shuklaIdx++;
      } else if (tithi === 26) {
        var kName = EKADASHI_NAMES.krishna[krishnaIdx % 12];
        dates.push({ date: year + '-' + String(m+1).padStart(2,'0') + '-' + String(d).padStart(2,'0'), day: d, month: m, year: year, name: kName, paksha: 'krishna', fullName: kName + ' Ekadashi' });
        krishnaIdx++;
      }
    }
  }
  _ekadashiCache[year] = dates;
  return dates;
}

function getEkadashiDates(year, month) {
  return getEkadashiYear(year).filter(function(e) { return e.month === month; });
}

// ── DATA HELPERS ──
function getEkadashiLog() {
  try { return JSON.parse(localStorage.getItem('fl_ekadashi_log') || '{}'); } catch(e) { return {}; }
}

function saveEkadashiLog(date, name, paksha, status, note) {
  var log = getEkadashiLog();
  log[date] = { name: name, paksha: paksha, status: status, note: note || '' };
  localStorage.setItem('fl_ekadashi_log', JSON.stringify(log));
  if (typeof syncSave === 'function') {
    syncSave('ekadashi_log', { date: date, ekadashi_name: name, paksha: paksha, status: status, note: note || '' }, 'date');
  }
  if (typeof markSaved === 'function') markSaved();
}

// ── NEXT EKADASHI ──
function getNextEkadashi() {
  var today = new Date();
  var todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
  for (var yi = 0; yi < 2; yi++) {
    var all = getEkadashiYear(today.getFullYear() + yi);
    for (var i = 0; i < all.length; i++) {
      if (all[i].date >= todayStr) return all[i];
    }
  }
  return null;
}

// ── STREAK CALCULATION ──
function _ekCalcStreaks(log, allPast) {
  // allPast: chronological array of past+today Ekadashis
  var best = 0, running = 0, current = 0;
  for (var i = 0; i < allPast.length; i++) {
    var l = log[allPast[i].date];
    if (l && l.status === 'observed') { running++; if (running > best) best = running; }
    else running = 0;
  }
  for (var j = allPast.length - 1; j >= 0; j--) {
    var entry = log[allPast[j].date];
    if (entry && entry.status === 'observed') current++;
    else break;
  }
  return { current: current, best: best };
}

// ── ALL-TIME EKADASHIS (2025 → current year) ──
function _ekAllTime(todayStr) {
  var currentYear = new Date().getFullYear();
  var all = [];
  for (var y = 2025; y <= currentYear; y++) {
    getEkadashiYear(y).forEach(function(e) { all.push(e); });
  }
  all.sort(function(a, b) { return a.date < b.date ? -1 : 1; });
  return {
    all: all,
    past: all.filter(function(e) { return e.date <= todayStr; }),
    future: all.filter(function(e) { return e.date > todayStr; })
  };
}

// ══════════════════════════════════════════════════════
// TAB SWITCHING
// ══════════════════════════════════════════════════════
function switchEkadashiTab(tab) {
  _ekadashiTab = tab;
  ['calendar','journey','alltime'].forEach(function(t) {
    var btn  = document.getElementById('ekTab-' + t);
    var view = document.getElementById('ekView-' + t);
    if (btn)  btn.classList.toggle('active', t === tab);
    if (view) view.style.display = (t === tab) ? 'block' : 'none';
  });
  if (tab === 'calendar') renderEkadashiCalendarView();
  else if (tab === 'journey')  renderEkadashiJourney();
  else if (tab === 'alltime')  renderEkadashiAllTime();
}

function changeEkadashiMonth(dir) {
  if (dir === 0) { _ekadashiMonth = new Date().getMonth(); _ekadashiYear = new Date().getFullYear(); }
  else {
    _ekadashiMonth += dir;
    if (_ekadashiMonth > 11) { _ekadashiMonth = 0; _ekadashiYear++; }
    if (_ekadashiMonth < 0)  { _ekadashiMonth = 11; _ekadashiYear--; }
  }
  renderEkadashiCalendarView();
}

// ══════════════════════════════════════════════════════
// TAB 1 — CALENDAR
// ══════════════════════════════════════════════════════
function renderEkadashiCalendarView() {
  var log      = getEkadashiLog();
  var todayStr = typeof getEffectiveToday === 'function' ? getEffectiveToday() : new Date().toISOString().slice(0,10);
  var ekt      = _ekAllTime(todayStr);
  var streaks  = _ekCalcStreaks(log, ekt.past);
  var next     = getNextEkadashi();
  var nextDiff = next ? Math.max(0, Math.round((new Date(next.date + 'T00:00:00') - new Date()) / 86400000)) : 0;

  var thisYearEks  = getEkadashiYear(new Date().getFullYear());
  var thisYearPast = thisYearEks.filter(function(e) { return e.date <= todayStr; });
  var thisYearObs  = thisYearPast.filter(function(e) { return log[e.date] && log[e.date].status === 'observed'; }).length;
  var allTimeObs   = ekt.past.filter(function(e) { return log[e.date] && log[e.date].status === 'observed'; }).length;

  var summaryEl = document.getElementById('ekMonthSummary');
  if (summaryEl) {
    summaryEl.innerHTML =
      '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px">' +
      ekStatCard(allTimeObs, 'ALL-TIME FASTS', allTimeObs > 0 ? 'var(--gold)' : 'var(--text-dim)') +
      ekStatCard(streaks.current + (streaks.current > 0 ? ' 🔥' : ''), 'CUR STREAK', streaks.current > 0 ? 'var(--green)' : 'var(--text-dim)') +
      ekStatCard(thisYearObs + '/' + thisYearPast.length, 'THIS YEAR', 'var(--cyan)') +
      ekStatCard(next ? nextDiff + 'd' : '—', 'NEXT: ' + (next ? next.name.substring(0,7).toUpperCase() : '—'), nextDiff <= 2 ? '#E040FB' : 'var(--gold)') +
      '</div>';
  }
  _renderEkCalendar(log, todayStr);
}

function _renderEkCalendar(log, todayStr) {
  var monthNames = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
  var monthLabel = document.getElementById('ekadashiMonthLabel');
  if (monthLabel) monthLabel.textContent = monthNames[_ekadashiMonth] + ' ' + _ekadashiYear;

  var ekDates = getEkadashiDates(_ekadashiYear, _ekadashiMonth);
  var ekMap = {};
  ekDates.forEach(function(e) { ekMap[e.day] = e; });

  var daysInMonth = new Date(_ekadashiYear, _ekadashiMonth + 1, 0).getDate();
  var firstDay    = new Date(_ekadashiYear, _ekadashiMonth, 1).getDay();
  var today       = new Date();
  var todayDay    = (today.getFullYear() === _ekadashiYear && today.getMonth() === _ekadashiMonth) ? today.getDate() : -1;
  var dayNames    = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

  var html = '';
  dayNames.forEach(function(dn) {
    html += '<div style="text-align:center;font-family:var(--font-mono);font-size:9px;letter-spacing:1px;color:var(--text-dim);padding:4px">' + dn + '</div>';
  });
  for (var blank = 0; blank < firstDay; blank++) html += '<div></div>';

  for (var d = 1; d <= daysInMonth; d++) {
    var ek = ekMap[d];
    var isToday = (d === todayDay);
    var logEntry = ek ? log[ek.date] : null;
    var bg, border, cursor, statusIcon, nameColor;

    if (ek) {
      cursor = 'cursor:pointer;';
      nameColor = 'var(--gold)';
      if (logEntry) {
        if (logEntry.status === 'observed') { bg = 'rgba(0,230,118,0.14)'; border = 'rgba(0,230,118,0.45)'; statusIcon = '✓'; }
        else if (logEntry.status === 'missed') { bg = 'rgba(255,82,82,0.1)'; border = 'rgba(255,82,82,0.3)'; statusIcon = '✗'; }
        else { bg = 'rgba(245,166,35,0.14)'; border = 'rgba(245,166,35,0.4)'; statusIcon = '◐'; }
      } else {
        bg = 'rgba(245,166,35,0.07)'; border = 'rgba(245,166,35,0.35)'; statusIcon = '';
      }
    } else {
      bg = 'var(--bg3)'; border = 'transparent'; cursor = ''; statusIcon = ''; nameColor = 'transparent';
    }

    var outline = isToday ? 'outline:2px solid var(--cyan);outline-offset:1px;' : '';
    var click   = ek ? 'onclick="showEkadashiLogModal(\'' + ek.date + '\',\'' + ek.name + '\',\'' + ek.paksha + '\')"' : '';
    var tipText = ek ? (ek.fullName + ' — ' + (ek.paksha === 'shukla' ? 'Bright Half' : 'Dark Half') + (logEntry ? ' · ' + logEntry.status.toUpperCase() : '')) : '';

    html += '<div style="text-align:center;padding:5px 2px;background:' + bg + ';border:1px solid ' + border + ';border-radius:7px;font-family:var(--font-mono);font-size:12px;' + cursor + outline + '" ' + click + ' title="' + tipText + '">';
    html += '<div style="font-weight:' + (ek ? '700' : '400') + ';color:' + (ek ? 'var(--gold)' : 'var(--text-dim)') + ';line-height:1.3">' + d + (statusIcon ? '<span style="font-size:9px"> ' + statusIcon + '</span>' : '') + '</div>';
    if (ek) {
      var pakshaDot = ek.paksha === 'shukla' ? '<span style="color:#00D4FF;font-size:6px;margin-right:1px">●</span>' : '<span style="color:#E040FB;font-size:6px;margin-right:1px">●</span>';
      html += '<div style="font-size:7px;color:var(--gold);margin-top:2px;letter-spacing:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + pakshaDot + ek.name.substring(0,7) + '</div>';
    }
    html += '</div>';
  }

  var calEl = document.getElementById('ekadashiCalendar');
  if (calEl) calEl.innerHTML = html;

  // Upcoming list
  var upcoming = [];
  for (var mi = 0; mi < 3 && upcoming.length < 6; mi++) {
    var um = (_ekadashiMonth + mi) % 12;
    var uy = _ekadashiYear + Math.floor((_ekadashiMonth + mi) / 12);
    getEkadashiDates(uy, um).forEach(function(e) {
      if (e.date >= todayStr && upcoming.length < 6) upcoming.push(e);
    });
  }
  var upHtml = '';
  upcoming.forEach(function(u) {
    var diff = Math.max(0, Math.round((new Date(u.date + 'T00:00:00') - new Date()) / 86400000));
    var le   = log[u.date];
    var pakCol = u.paksha === 'shukla' ? '#00D4FF' : '#E040FB';
    var pakLabel = u.paksha === 'shukla' ? '☀ Shukla' : '🌙 Krishna';
    var urgency  = diff <= 1 ? '#E040FB' : diff <= 3 ? 'var(--gold)' : 'var(--text-dim)';
    var statusBadge = le ? '<span style="margin-left:8px;font-weight:700;color:' + (le.status==='observed'?'var(--green)':'var(--red)') + '">' + (le.status==='observed'?'✓ OBSERVED':'✗ MISSED') + '</span>' : '';
    upHtml +=
      '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(245,166,35,0.06)">' +
        '<div style="width:3px;height:36px;background:' + pakCol + ';border-radius:2px;flex-shrink:0"></div>' +
        '<div style="flex:1">' +
          '<div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--gold)">' + u.fullName + statusBadge + '</div>' +
          '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-top:2px">' + pakLabel + ' · ' + u.date + '</div>' +
        '</div>' +
        '<div style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:' + urgency + ';text-align:right">' + (diff === 0 ? 'TODAY' : diff + 'd') + '</div>' +
      '</div>';
  });
  var upEl = document.getElementById('ekadashiUpcomingList');
  if (upEl) upEl.innerHTML = upHtml || '<div style="color:var(--text-dim);font-family:var(--font-mono);font-size:11px;padding:12px 0">No upcoming dates in next 3 months</div>';
}

// ══════════════════════════════════════════════════════
// TAB 2 — MY JOURNEY
// ══════════════════════════════════════════════════════
function renderEkadashiJourney() {
  var container = document.getElementById('ekView-journey');
  if (!container) return;

  var log      = getEkadashiLog();
  var todayStr = typeof getEffectiveToday === 'function' ? getEffectiveToday() : new Date().toISOString().slice(0,10);
  var ekt      = _ekAllTime(todayStr);
  var allPast  = ekt.past;
  var streaks  = _ekCalcStreaks(log, allPast);

  // Lifetime counts
  var totalObs     = allPast.filter(function(e) { return log[e.date] && log[e.date].status === 'observed'; }).length;
  var totalMissed  = allPast.filter(function(e) { return log[e.date] && log[e.date].status === 'missed';   }).length;
  var totalPartial = allPast.filter(function(e) { return log[e.date] && log[e.date].status === 'partial';  }).length;
  var completionRate = allPast.length > 0 ? Math.round(totalObs / allPast.length * 100) : 0;

  // Paksha split
  var shuklaPast  = allPast.filter(function(e) { return e.paksha === 'shukla'; });
  var krishnaPast = allPast.filter(function(e) { return e.paksha === 'krishna'; });
  var shuklaObs   = shuklaPast.filter(function(e) { return log[e.date] && log[e.date].status === 'observed'; }).length;
  var krishnaObs  = krishnaPast.filter(function(e) { return log[e.date] && log[e.date].status === 'observed'; }).length;
  var shuklaPct   = shuklaPast.length  > 0 ? Math.round(shuklaObs  / shuklaPast.length  * 100) : 0;
  var krishnaPct  = krishnaPast.length > 0 ? Math.round(krishnaObs / krishnaPast.length  * 100) : 0;

  var rateColor = completionRate >= 80 ? 'var(--green)' : completionRate >= 50 ? 'var(--gold)' : 'var(--red)';

  var html = '';

  // ── SECTION A: HERO ──
  html += '<div style="background:rgba(245,166,35,0.05);border:1px solid rgba(245,166,35,0.18);border-radius:14px;padding:20px 16px;margin-bottom:16px">';
  html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:3px;color:rgba(245,166,35,0.6);margin-bottom:16px">MY EKADASHI JOURNEY</div>';

  // Big number
  html += '<div style="text-align:center;padding:8px 0 20px">';
  html += '<div style="font-family:var(--font-mono);font-size:clamp(56px,12vw,80px);font-weight:900;color:var(--gold);line-height:1;letter-spacing:-3px">' + totalObs + '</div>';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:3px;color:var(--text-dim);margin-top:6px">EKADASHIS OBSERVED · ALL TIME</div>';
  html += '</div>';

  // 4-stat row
  html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px">';
  html += ekStatCard(completionRate + '%', 'COMPLETION', rateColor);
  html += ekStatCard(streaks.current + (streaks.current > 0 ? ' 🔥' : ''), 'STREAK NOW', streaks.current > 0 ? 'var(--green)' : 'var(--text-dim)');
  html += ekStatCard(streaks.best, 'BEST EVER', streaks.best > 0 ? 'var(--cyan)' : 'var(--text-dim)');
  html += ekStatCard(allPast.length, 'TOTAL PAST', 'var(--text-muted)');
  html += '</div>';

  // Breakdown pills
  html += '<div style="display:flex;gap:8px;font-family:var(--font-mono);font-size:10px;flex-wrap:wrap;margin-bottom:14px">';
  html += '<span style="padding:4px 10px;border-radius:4px;background:rgba(0,230,118,0.1);color:var(--green)">✓ ' + totalObs + ' observed</span>';
  html += '<span style="padding:4px 10px;border-radius:4px;background:rgba(255,82,82,0.08);color:var(--red)">✗ ' + totalMissed + ' missed</span>';
  if (totalPartial > 0) html += '<span style="padding:4px 10px;border-radius:4px;background:rgba(245,166,35,0.08);color:var(--gold)">◐ ' + totalPartial + ' partial</span>';
  var unlogged = allPast.length - totalObs - totalMissed - totalPartial;
  if (unlogged > 0) html += '<span style="padding:4px 10px;border-radius:4px;background:rgba(255,255,255,0.04);color:var(--text-dim)">— ' + unlogged + ' not logged</span>';
  html += '</div>';

  // Progress bar
  html += '<div style="height:8px;background:rgba(255,255,255,0.06);border-radius:4px;overflow:hidden;margin-bottom:4px">';
  html += '<div style="height:100%;width:' + completionRate + '%;background:' + rateColor + ';border-radius:4px;transition:width 0.8s ease"></div>';
  html += '</div>';
  html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);text-align:right">' + totalObs + ' of ' + allPast.length + ' past Ekadashis</div>';
  html += '</div>'; // hero card

  // ── SECTION B: PAKSHA SPLIT ──
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">';

  // Shukla
  html += '<div style="background:rgba(0,212,255,0.04);border:1px solid rgba(0,212,255,0.14);border-radius:10px;padding:14px">';
  html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--cyan);margin-bottom:4px">☀ SHUKLA PAKSHA</div>';
  html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-bottom:10px">Bright Half — Waxing Moon</div>';
  html += '<div style="font-family:var(--font-mono);font-size:clamp(22px,5vw,32px);font-weight:900;color:var(--cyan);line-height:1">' + shuklaObs + '</div>';
  html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-top:4px">' + shuklaObs + '/' + shuklaPast.length + ' · ' + shuklaPct + '%</div>';
  html += '<div style="height:4px;background:rgba(255,255,255,0.05);border-radius:2px;margin-top:10px;overflow:hidden"><div style="height:100%;width:' + shuklaPct + '%;background:var(--cyan);border-radius:2px;transition:width 0.6s ease"></div></div>';
  html += '</div>';

  // Krishna
  html += '<div style="background:rgba(224,64,251,0.04);border:1px solid rgba(224,64,251,0.14);border-radius:10px;padding:14px">';
  html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:#E040FB;margin-bottom:4px">🌙 KRISHNA PAKSHA</div>';
  html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-bottom:10px">Dark Half — Waning Moon</div>';
  html += '<div style="font-family:var(--font-mono);font-size:clamp(22px,5vw,32px);font-weight:900;color:#E040FB;line-height:1">' + krishnaObs + '</div>';
  html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-top:4px">' + krishnaObs + '/' + krishnaPast.length + ' · ' + krishnaPct + '%</div>';
  html += '<div style="height:4px;background:rgba(255,255,255,0.05);border-radius:2px;margin-top:10px;overflow:hidden"><div style="height:100%;width:' + krishnaPct + '%;background:#E040FB;border-radius:2px;transition:width 0.6s ease"></div></div>';
  html += '</div>';

  html += '</div>'; // paksha grid

  // ── SECTION C: MONTH-OVER-MONTH ──
  html += _ekBuildMoM(log, todayStr);

  // ── SECTION D: MONTHLY SCORE HEATMAP ──
  html += _ekBuildHeatmap(log, todayStr);

  // ── SECTION E: YEAR-OVER-YEAR ──
  html += _ekBuildYoY(log, todayStr);

  container.innerHTML = html;
}

// ── Month-over-Month chart (last 12 months) ──
function _ekBuildMoM(log, todayStr) {
  var today  = new Date();
  var mNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var data   = [];

  for (var i = 11; i >= 0; i--) {
    var d  = new Date(today.getFullYear(), today.getMonth() - i, 1);
    var y  = d.getFullYear(), m = d.getMonth();
    var eks = getEkadashiDates(y, m);
    var past = eks.filter(function(e) { return e.date <= todayStr; });
    var obs = 0, missed = 0, partial = 0;
    past.forEach(function(e) {
      var l = log[e.date];
      if (!l) return;
      if (l.status === 'observed') obs++;
      else if (l.status === 'missed') missed++;
      else if (l.status === 'partial') partial++;
    });
    data.push({ y: y, m: m, label: mNames[m], yr2: String(y).slice(2), obs: obs, missed: missed, partial: partial, total: past.length, future: eks.length - past.length });
  }

  var html = '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:16px;margin-bottom:16px">';
  html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:3px;color:var(--text-dim);margin-bottom:14px">MONTH — OVER — MONTH</div>';

  // Dots chart — 2 dots per month (Shukla = top, Krishna = bottom)
  html += '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:4px">';
  html += '<div style="display:flex;gap:4px;min-width:480px;align-items:flex-end;padding:0 2px">';

  data.forEach(function(d) {
    var isCurrent = (d.y === today.getFullYear() && d.m === today.getMonth());
    var shuklaEks = getEkadashiDates(d.y, d.m).filter(function(e) { return e.paksha === 'shukla' && e.date <= todayStr; });
    var krishnaEks = getEkadashiDates(d.y, d.m).filter(function(e) { return e.paksha === 'krishna' && e.date <= todayStr; });

    function dotColor(eks, paksha) {
      if (!eks.length) return 'rgba(255,255,255,0.06)';
      var l = log[eks[0].date];
      if (!l) return 'rgba(255,255,255,0.12)';
      if (l.status === 'observed') return paksha === 'shukla' ? '#00D4FF' : '#E040FB';
      if (l.status === 'missed') return '#FF5252';
      return '#F5A623';
    }

    var barH = d.total === 0 ? 8 : Math.max(14, Math.round(d.obs / Math.max(d.total, 1) * 68));
    var barCol = d.total === 0 ? 'rgba(255,255,255,0.05)' : d.obs === d.total && d.total > 0 ? '#00E676' : d.obs > 0 ? '#F5A623' : (d.missed > 0 ? '#FF5252' : 'rgba(255,255,255,0.08)');

    html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">';

    // Two paksha dots
    html += '<div style="display:flex;flex-direction:column;gap:2px;align-items:center;margin-bottom:3px">';
    html += '<div style="width:8px;height:8px;border-radius:50%;background:' + dotColor(shuklaEks, 'shukla') + '" title="Shukla"></div>';
    html += '<div style="width:8px;height:8px;border-radius:50%;background:' + dotColor(krishnaEks, 'krishna') + '" title="Krishna"></div>';
    html += '</div>';

    // Bar
    html += '<div style="width:100%;border-radius:3px 3px 0 0;background:' + barCol + ';height:' + barH + 'px;min-height:4px;position:relative">';
    if (isCurrent) html += '<div style="position:absolute;top:-3px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;background:var(--cyan)"></div>';
    html += '</div>';

    // Label
    html += '<div style="font-family:var(--font-mono);font-size:8px;color:' + (isCurrent ? 'var(--cyan)' : 'var(--text-dim)') + ';margin-top:3px;text-align:center">' + d.label + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:8px;color:' + barCol + ';text-align:center">' + (d.total > 0 ? d.obs + '/' + d.total : '—') + '</div>';
    html += '</div>'; // month column
  });

  html += '</div></div>'; // scroll + flex

  // Legend
  html += '<div style="display:flex;gap:10px;margin-top:12px;font-family:var(--font-mono);font-size:9px;color:var(--text-dim);flex-wrap:wrap">';
  html += '<span><span style="display:inline-block;width:8px;height:8px;background:#00E676;border-radius:2px;vertical-align:middle;margin-right:4px"></span>Perfect</span>';
  html += '<span><span style="display:inline-block;width:8px;height:8px;background:#F5A623;border-radius:2px;vertical-align:middle;margin-right:4px"></span>1/2</span>';
  html += '<span><span style="display:inline-block;width:8px;height:8px;background:#FF5252;border-radius:2px;vertical-align:middle;margin-right:4px"></span>Missed</span>';
  html += '<span><span style="display:inline-block;width:8px;height:8px;background:rgba(255,255,255,0.1);border-radius:2px;vertical-align:middle;margin-right:4px"></span>Not logged</span>';
  html += '<span style="margin-left:auto"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#00D4FF;vertical-align:middle;margin-right:3px"></span>Shukla · <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#E040FB;vertical-align:middle;margin:0 3px 0 4px"></span>Krishna</span>';
  html += '</div>';
  html += '</div>'; // card
  return html;
}

// ── Monthly heatmap (current year's 12 months) ──
function _ekBuildHeatmap(log, todayStr) {
  var year   = _ekadashiYear;
  var mNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var today  = new Date();

  var html = '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:16px;margin-bottom:16px">';
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">';
  html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:3px;color:var(--text-dim)">' + year + ' HEATMAP</div>';
  html += '<div style="display:flex;gap:6px">';
  html += '<button class="btn-copy" onclick="_ekadashiYear=' + (year-1) + ';renderEkadashiJourney()" style="padding:3px 8px;font-size:9px">◀</button>';
  html += '<button class="btn-copy" onclick="_ekadashiYear=' + (year+1) + ';renderEkadashiJourney()" style="padding:3px 8px;font-size:9px">▶</button>';
  html += '</div></div>';

  html += '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px">';

  for (var m = 0; m < 12; m++) {
    var eks  = getEkadashiDates(year, m);
    var past = eks.filter(function(e) { return e.date <= todayStr; });
    var obs  = past.filter(function(e) { return log[e.date] && log[e.date].status === 'observed'; }).length;
    var isFuture = past.length === 0;

    var boxBg, scoreLabel, scoreColor;
    if (isFuture) {
      boxBg = 'rgba(255,255,255,0.02)'; scoreLabel = '—'; scoreColor = 'rgba(255,255,255,0.15)';
    } else if (obs === past.length && past.length > 0) {
      boxBg = 'rgba(0,230,118,0.14)'; scoreLabel = '✓✓'; scoreColor = '#00E676';
    } else if (obs === 1) {
      boxBg = 'rgba(245,166,35,0.12)'; scoreLabel = '✓'; scoreColor = '#F5A623';
    } else {
      boxBg = 'rgba(255,82,82,0.08)'; scoreLabel = '✗'; scoreColor = '#FF5252';
    }

    var isCurrentMonth = (year === today.getFullYear() && m === today.getMonth());

    html += '<div onclick="_ekadashiMonth=' + m + ';_ekadashiYear=' + year + ';switchEkadashiTab(\'calendar\')" style="background:' + boxBg + ';border:1px solid ' + (isCurrentMonth ? 'var(--cyan)' : 'rgba(255,255,255,0.06)') + ';border-radius:8px;padding:10px 6px;text-align:center;cursor:pointer;transition:all 0.15s" onmouseover="this.style.opacity=\'0.75\'" onmouseout="this.style.opacity=\'1\'">';
    html += '<div style="font-family:var(--font-mono);font-size:8px;color:' + (isCurrentMonth ? 'var(--cyan)' : 'var(--text-dim)') + ';letter-spacing:1px">' + mNames[m] + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:18px;font-weight:900;color:' + scoreColor + ';margin:4px 0 2px;line-height:1">' + scoreLabel + '</div>';
    if (!isFuture) html += '<div style="font-family:var(--font-mono);font-size:8px;color:' + scoreColor + '">' + obs + '/' + past.length + '</div>';
    html += '</div>';
  }

  html += '</div>';
  html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-top:10px;opacity:0.6">Tap any month to jump to calendar view</div>';
  html += '</div>';
  return html;
}

// ── Year-over-year bars ──
function _ekBuildYoY(log, todayStr) {
  var currentYear = new Date().getFullYear();
  var html = '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:16px">';
  html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:3px;color:var(--text-dim);margin-bottom:16px">YEAR — OVER — YEAR</div>';

  var hasData = false;
  for (var y = 2025; y <= currentYear; y++) {
    var eks  = getEkadashiYear(y);
    var past = eks.filter(function(e) { return e.date <= todayStr; });
    if (!past.length) continue;
    hasData = true;

    var obs = past.filter(function(e) { return log[e.date] && log[e.date].status === 'observed'; }).length;
    var pct = Math.round(obs / past.length * 100);
    var barColor = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--gold)' : 'var(--red)';
    var isCurrent = (y === currentYear);

    html += '<div style="margin-bottom:14px">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">';
    html += '<span style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:' + (isCurrent ? 'var(--gold)' : 'var(--text)') + '">' + y + (isCurrent ? ' ←' : '') + '</span>';
    html += '<div style="display:flex;gap:12px;font-family:var(--font-mono);font-size:10px">';
    html += '<span style="color:var(--green)">✓ ' + obs + '</span>';
    var missed = past.filter(function(e) { return log[e.date] && log[e.date].status === 'missed'; }).length;
    if (missed > 0) html += '<span style="color:var(--red)">✗ ' + missed + '</span>';
    html += '<span style="color:' + barColor + ';font-weight:700">' + pct + '%</span>';
    html += '</div></div>';
    html += '<div style="height:10px;background:rgba(255,255,255,0.05);border-radius:5px;overflow:hidden">';
    html += '<div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:5px;transition:width 0.7s ease"></div>';
    html += '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-top:4px">' + obs + ' of ' + past.length + ' past Ekadashis observed</div>';
    html += '</div>';
  }

  if (!hasData) {
    html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);text-align:center;padding:16px">Start logging to see year-over-year data</div>';
  }
  html += '</div>';
  return html;
}

// ══════════════════════════════════════════════════════
// TAB 3 — ALL TIME
// ══════════════════════════════════════════════════════
function renderEkadashiAllTime() {
  var container = document.getElementById('ekView-alltime');
  if (!container) return;

  var log      = getEkadashiLog();
  var todayStr = typeof getEffectiveToday === 'function' ? getEffectiveToday() : new Date().toISOString().slice(0,10);
  var currentYear = new Date().getFullYear();

  // All Ekadashis reverse-chrono
  var allEks = [];
  for (var y = 2025; y <= currentYear; y++) {
    getEkadashiYear(y).forEach(function(e) { allEks.push(e); });
  }
  allEks.sort(function(a, b) { return a.date > b.date ? -1 : 1; });

  // Summary counts at top
  var allPast = allEks.filter(function(e) { return e.date <= todayStr; });
  var obs = allPast.filter(function(e) { return log[e.date] && log[e.date].status === 'observed'; }).length;
  var missed = allPast.filter(function(e) { return log[e.date] && log[e.date].status === 'missed'; }).length;
  var partial = allPast.filter(function(e) { return log[e.date] && log[e.date].status === 'partial'; }).length;
  var unlogged = allPast.length - obs - missed - partial;

  var html = '';

  // Summary strip
  html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;font-family:var(--font-mono);font-size:10px">';
  html += '<span style="padding:5px 12px;border-radius:4px;background:rgba(0,230,118,0.1);border:1px solid rgba(0,230,118,0.2);color:var(--green)">✓ ' + obs + ' observed</span>';
  html += '<span style="padding:5px 12px;border-radius:4px;background:rgba(255,82,82,0.08);border:1px solid rgba(255,82,82,0.15);color:var(--red)">✗ ' + missed + ' missed</span>';
  if (partial > 0) html += '<span style="padding:5px 12px;border-radius:4px;background:rgba(245,166,35,0.08);border:1px solid rgba(245,166,35,0.15);color:var(--gold)">◐ ' + partial + ' partial</span>';
  if (unlogged > 0) html += '<span style="padding:5px 12px;border-radius:4px;background:rgba(255,255,255,0.04);color:var(--text-dim)">— ' + unlogged + ' not logged</span>';
  html += '<span style="padding:5px 12px;border-radius:4px;background:rgba(0,212,255,0.06);border:1px solid rgba(0,212,255,0.1);color:var(--cyan)">○ ' + allEks.filter(function(e){return e.date>todayStr;}).length + ' upcoming</span>';
  html += '</div>';

  // Full list grouped by year
  var lastYear = null;
  allEks.forEach(function(ek) {
    if (ek.year !== lastYear) {
      if (lastYear !== null) html += '</div>';
      html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:3px;color:var(--text-dim);margin:' + (lastYear !== null ? '20px' : '0') + ' 0 8px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.05)">' + ek.year + '</div>';
      html += '<div>';
      lastYear = ek.year;
    }

    var l       = log[ek.date];
    var isPast  = ek.date <= todayStr;
    var status  = l ? l.status : (isPast ? 'unlogged' : 'upcoming');

    var sColor, sLabel, sBg, sBorderLeft;
    if (status === 'observed') {
      sColor = '#00E676'; sLabel = '✓ OBSERVED'; sBg = 'rgba(0,230,118,0.05)'; sBorderLeft = '#00E676';
    } else if (status === 'missed') {
      sColor = '#FF5252'; sLabel = '✗ MISSED'; sBg = 'rgba(255,82,82,0.04)'; sBorderLeft = '#FF5252';
    } else if (status === 'partial') {
      sColor = '#F5A623'; sLabel = '◐ PARTIAL'; sBg = 'rgba(245,166,35,0.04)'; sBorderLeft = '#F5A623';
    } else if (status === 'unlogged') {
      sColor = 'rgba(255,255,255,0.2)'; sLabel = '— NOT LOGGED'; sBg = 'transparent'; sBorderLeft = 'rgba(255,255,255,0.08)';
    } else {
      sColor = 'var(--cyan)'; sLabel = '○ UPCOMING'; sBg = 'rgba(0,212,255,0.03)'; sBorderLeft = 'rgba(0,212,255,0.25)';
    }

    var pakshaDot = ek.paksha === 'shukla'
      ? '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#00D4FF;vertical-align:middle;margin-right:4px"></span>'
      : '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#E040FB;vertical-align:middle;margin-right:4px"></span>';
    var pakshaLabel = ek.paksha === 'shukla' ? 'Shukla' : 'Krishna';

    html += '<div onclick="showEkadashiLogModal(\'' + ek.date + '\',\'' + ek.name + '\',\'' + ek.paksha + '\')" ';
    html += 'style="display:flex;align-items:center;gap:10px;padding:9px 10px;background:' + sBg + ';border:1px solid rgba(255,255,255,0.04);border-left:3px solid ' + sBorderLeft + ';border-radius:6px;margin-bottom:4px;cursor:pointer;transition:background 0.12s" ';
    html += 'onmouseover="this.style.background=\'rgba(255,255,255,0.03)\'" onmouseout="this.style.background=\'' + sBg + '\'">';
    html += '<div style="flex:1;min-width:0">';
    html += '<div style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + ek.fullName + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-top:2px">' + pakshaDot + pakshaLabel + ' · ' + ek.date + '</div>';
    if (l && l.note) html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-top:2px;font-style:italic;opacity:0.7">"' + l.note + '"</div>';
    html += '</div>';
    html += '<span style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:' + sColor + ';white-space:nowrap;flex-shrink:0">' + sLabel + '</span>';
    html += '</div>';
  });

  if (lastYear !== null) html += '</div>';
  container.innerHTML = html || '<div style="text-align:center;padding:32px;color:var(--text-dim);font-family:var(--font-mono)">No Ekadashi data yet.</div>';
}

// ══════════════════════════════════════════════════════
// LOG MODAL
// ══════════════════════════════════════════════════════
function showEkadashiLogModal(date, name, paksha) {
  var log      = getEkadashiLog();
  var existing = log[date] || {};
  var modal    = document.getElementById('ekLogModal');
  if (!modal) return;
  var locked = typeof isDateLocked === 'function' && isDateLocked(date);

  var pakCol   = paksha === 'shukla' ? '#00D4FF' : '#E040FB';
  var pakshaFull = paksha === 'shukla' ? '☀ Shukla Paksha (Bright Half)' : '🌙 Krishna Paksha (Dark Half)';

  var html = '<div style="padding:20px;background:var(--bg2);border:1px solid rgba(245,166,35,0.2);border-top:3px solid ' + pakCol + ';border-radius:12px;margin-top:16px">';
  html += '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px">';
  html += '<div>';
  html += '<div style="font-family:var(--font-mono);font-size:15px;font-weight:700;color:var(--gold)">' + name + ' Ekadashi</div>';
  html += '<div style="font-family:var(--font-mono);font-size:9px;color:' + pakCol + ';margin-top:3px">' + pakshaFull + '</div>';
  html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-top:2px">' + date + '</div>';
  html += '</div>';
  html += '<button onclick="document.getElementById(\'ekLogModal\').style.display=\'none\'" style="background:none;border:none;color:var(--text-dim);font-size:20px;cursor:pointer;padding:0;line-height:1;flex-shrink:0">×</button>';
  html += '</div>';

  if (locked) {
    if (typeof getLockBannerHTML === 'function') html += getLockBannerHTML(date);
    if (existing.status) {
      var statusColors = { observed: 'var(--green)', missed: 'var(--red)', partial: 'var(--gold)' };
      var statusLabels = { observed: '✓ OBSERVED', missed: '✗ MISSED', partial: '◐ PARTIAL' };
      html += '<div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:' + (statusColors[existing.status]||'var(--text)') + ';margin:12px 0 6px">' + (statusLabels[existing.status]||existing.status.toUpperCase()) + '</div>';
      if (existing.note) html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);font-style:italic">"' + existing.note + '"</div>';
    } else {
      html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim)">No observance was logged for this date.</div>';
    }
  } else {
    // Status buttons
    html += '<div style="display:flex;gap:8px;margin-bottom:14px">';
    var btnDefs = [
      { s: 'observed', label: '✓ OBSERVED', active: 'background:#00E676;border-color:#00E676;color:#0A0C10' },
      { s: 'missed',   label: '✗ MISSED',   active: 'background:#FF5252;border-color:#FF5252;color:#0A0C10' },
      { s: 'partial',  label: '◐ PARTIAL',  active: 'background:#F5A623;border-color:#F5A623;color:#0A0C10' }
    ];
    btnDefs.forEach(function(b) {
      var isActive = existing.status === b.s;
      html += '<button class="btn btn-outline btn-sm" style="flex:1;' + (isActive ? b.active : '') + '" onclick="logEkadashi(\'' + date + '\',\'' + name + '\',\'' + paksha + '\',\'' + b.s + '\')">' + b.label + '</button>';
    });
    html += '</div>';
    html += '<textarea class="form-input" rows="2" id="ekLogNote" placeholder="Optional note — how was the fast?" style="font-size:11px;border-color:rgba(245,166,35,0.15);resize:vertical">' + (existing.note || '') + '</textarea>';
  }

  html += '</div>';
  modal.innerHTML = html;
  modal.style.display = 'block';
  modal.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function logEkadashi(date, name, paksha, status) {
  if (typeof isDateLocked === 'function' && isDateLocked(date)) { if (typeof showLockWarning === 'function') showLockWarning(); return; }
  var note = document.getElementById('ekLogNote') ? document.getElementById('ekLogNote').value : '';
  saveEkadashiLog(date, name, paksha, status, note);
  document.getElementById('ekLogModal').style.display = 'none';
  if (_ekadashiTab === 'calendar') renderEkadashiCalendarView();
  else if (_ekadashiTab === 'journey') renderEkadashiJourney();
  else if (_ekadashiTab === 'alltime') renderEkadashiAllTime();
}

// ── STAT CARD ──
function ekStatCard(val, label, color) {
  return '<div style="text-align:center;padding:12px 6px;background:var(--surface);border:1px solid var(--surface-border);border-radius:10px">' +
    '<div style="font-family:var(--font-mono);font-size:clamp(16px,4vw,22px);font-weight:700;color:' + (color || 'var(--text)') + '">' + val + '</div>' +
    '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:1.5px;color:var(--text-muted);margin-top:4px">' + label + '</div>' +
    '</div>';
}

// ── NOTIFICATIONS ──
function enableEkadashiNotifications() {
  if (!('Notification' in window)) { alert('Notifications not supported'); return; }
  Notification.requestPermission().then(function(perm) {
    if (perm === 'granted') {
      if (typeof saveConfig === 'function') saveConfig({ EKADASHI_NOTIFICATIONS: true });
      alert('Ekadashi notifications enabled!');
      checkEkadashiNotifications();
    }
  });
}

function checkEkadashiNotifications() {
  if (typeof FL === 'undefined' || !FL.EKADASHI_NOTIFICATIONS || Notification.permission !== 'granted') return;
  var next = getNextEkadashi();
  if (!next) return;
  var diff = Math.floor((new Date(next.date) - new Date()) / 86400000) + 1;
  if (diff === 1 || diff === 2) {
    new Notification('🙏 ' + next.fullName + ' in ' + diff + ' day' + (diff > 1 ? 's' : ''), {
      body: (next.paksha === 'shukla' ? 'Shukla Paksha' : 'Krishna Paksha') + ' — Prepare for fasting. Fruit, milk, water only.',
      icon: '/icon-512.png'
    });
  }
}

setTimeout(checkEkadashiNotifications, 2000);

// ── LEGACY STUBS (admin-core switchPanel compatibility) ──
function renderEkadashiMonthly() { renderEkadashiCalendarView(); }
function renderEkadashiYearly()  { renderEkadashiJourney(); }
