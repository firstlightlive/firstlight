// ═══════════════════════════════════════════
// FIRST LIGHT — EKADASHI TRACKER
// Named Ekadashis, observance logging, yearly/monthly views
// ═══════════════════════════════════════════

var _ekadashiMonth = new Date().getMonth();
var _ekadashiYear = new Date().getFullYear();
var _ekadashiTab = 'month';
var _ekadashiCache = {}; // { "2026": [...dates] }

// ── EKADASHI NAMES (24 per year, cycling through lunar months) ──
var EKADASHI_NAMES = {
  shukla: ['Putrada','Jaya','Amalaki','Kamada','Mohini','Nirjala','Devshayani','Putrada','Parsva','Papankusha','Prabodhini','Mokshada'],
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

// ── GET ALL EKADASHI DATES FOR A YEAR (with names) ──
function getEkadashiYear(year) {
  if (_ekadashiCache[year]) return _ekadashiCache[year];
  var dates = [];
  var shuklaIdx = 0, krishnaIdx = 0;

  for (var m = 0; m < 12; m++) {
    var daysInMonth = new Date(year, m + 1, 0).getDate();
    for (var d = 1; d <= daysInMonth; d++) {
      var tithi = calculateTithi(new Date(year, m, d, 12));
      if (tithi === 11) {
        var name = EKADASHI_NAMES.shukla[shuklaIdx % 12];
        dates.push({ date: year + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0'), day: d, month: m, year: year, name: name, paksha: 'shukla', fullName: name + ' Ekadashi' });
        shuklaIdx++;
      } else if (tithi === 26) {
        var name = EKADASHI_NAMES.krishna[krishnaIdx % 12];
        dates.push({ date: year + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0'), day: d, month: m, year: year, name: name, paksha: 'krishna', fullName: name + ' Ekadashi' });
        krishnaIdx++;
      }
    }
  }
  _ekadashiCache[year] = dates;
  return dates;
}

// ── GET EKADASHI DATES FOR A SPECIFIC MONTH ──
function getEkadashiDates(year, month) {
  var all = getEkadashiYear(year);
  return all.filter(function(e) { return e.month === month; });
}

// ── EKADASHI LOG (localStorage + Supabase) ──
function getEkadashiLog() {
  try { return JSON.parse(localStorage.getItem('fl_ekadashi_log') || '{}'); } catch(e) { return {}; }
}

function saveEkadashiLog(date, name, paksha, status, note) {
  var log = getEkadashiLog();
  log[date] = { name: name, paksha: paksha, status: status, note: note || '' };
  localStorage.setItem('fl_ekadashi_log', JSON.stringify(log));
  // Sync to Supabase
  if (typeof syncSave === 'function') {
    syncSave('ekadashi_log', { date: date, status: status, note: note || '' }, 'date');
  }
  if (typeof sbFetch === 'function') {
    sbFetch('ekadashi_log', 'POST', { date: date, ekadashi_name: name, paksha: paksha, status: status, note: note || '' }, '?on_conflict=date');
  }
  markSaved();
}

// ── NEXT EKADASHI (for dashboard widget) ──
function getNextEkadashi() {
  var today = new Date();
  var todayStr = (today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0'));
  var years = [today.getFullYear(), today.getFullYear() + 1];
  for (var yi = 0; yi < years.length; yi++) {
    var all = getEkadashiYear(years[yi]);
    for (var i = 0; i < all.length; i++) {
      if (all[i].date >= todayStr) return all[i];
    }
  }
  return null;
}

// ── TAB SWITCHING ──
function switchEkadashiTab(tab) {
  _ekadashiTab = tab;
  document.getElementById('ekMonthView').style.display = tab === 'month' ? 'block' : 'none';
  document.getElementById('ekYearView').style.display = tab === 'year' ? 'block' : 'none';
  document.getElementById('ekTabMonth').classList.toggle('active', tab === 'month');
  document.getElementById('ekTabYear').classList.toggle('active', tab === 'year');
  if (tab === 'month') renderEkadashiMonthly();
  else renderEkadashiYearly();
}

// ── MONTH NAVIGATION ──
function changeEkadashiMonth(dir) {
  if (dir === 0) { _ekadashiMonth = new Date().getMonth(); _ekadashiYear = new Date().getFullYear(); }
  else { _ekadashiMonth += dir; if (_ekadashiMonth > 11) { _ekadashiMonth = 0; _ekadashiYear++; } if (_ekadashiMonth < 0) { _ekadashiMonth = 11; _ekadashiYear--; } }
  renderEkadashiMonthly();
}

// ── RENDER MONTHLY VIEW ──
function renderEkadashiMonthly() {
  // Show quick summary above calendar
  var summaryEl = document.getElementById('ekMonthSummary');
  if (summaryEl) {
    var log = getEkadashiLog();
    var year = new Date().getFullYear();
    var all = getEkadashiYear(year);
    var todayStr = getEffectiveToday();
    var observed = 0, total = all.length;
    all.forEach(function(e) { if (log[e.date] && log[e.date].status === 'observed') observed++; });
    var next = getNextEkadashi();
    var nextDiff = next ? Math.floor((new Date(next.date) - new Date()) / 86400000) + 1 : 0;
    var allTimeObs = 0;
    Object.keys(log).forEach(function(k) { if (log[k].status === 'observed') allTimeObs++; });

    summaryEl.innerHTML =
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">' +
      ekStatCard(observed + '/' + total, year + ' OBSERVED', observed > 0 ? 'var(--green)' : 'var(--text-dim)') +
      ekStatCard(allTimeObs, 'ALL-TIME FASTS', allTimeObs > 0 ? 'var(--gold)' : 'var(--text-dim)') +
      ekStatCard(next ? nextDiff + 'd' : '—', 'NEXT: ' + (next ? next.name.substring(0, 8).toUpperCase() : '—'), nextDiff <= 2 ? 'var(--brahma)' : 'var(--gold)') +
      '</div>';
  }
  renderEkadashiCalendar();
}

function renderEkadashiCalendar() {
  var monthNames = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
  document.getElementById('ekadashiMonthLabel').textContent = monthNames[_ekadashiMonth] + ' ' + _ekadashiYear;

  var ekDates = getEkadashiDates(_ekadashiYear, _ekadashiMonth);
  var ekMap = {};
  ekDates.forEach(function(e) { ekMap[e.day] = e; });
  var log = getEkadashiLog();
  var daysInMonth = new Date(_ekadashiYear, _ekadashiMonth + 1, 0).getDate();
  var firstDay = new Date(_ekadashiYear, _ekadashiMonth, 1).getDay();
  var today = new Date();
  var todayDay = (today.getFullYear() === _ekadashiYear && today.getMonth() === _ekadashiMonth) ? today.getDate() : -1;
  var dayNames = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

  var html = '';
  dayNames.forEach(function(dn) { html += '<div style="text-align:center;font-family:var(--font-mono);font-size:9px;letter-spacing:1px;color:var(--text-dim);padding:4px">' + dn + '</div>'; });
  for (var blank = 0; blank < firstDay; blank++) html += '<div></div>';

  for (var d = 1; d <= daysInMonth; d++) {
    var ek = ekMap[d];
    var isToday = d === todayDay;
    var logEntry = ek ? log[ek.date] : null;
    var statusIcon = '';
    var bg, border, fontWeight, cursor;

    if (ek) {
      fontWeight = '700';
      cursor = 'cursor:pointer;';
      if (logEntry) {
        if (logEntry.status === 'observed') { bg = 'rgba(0,229,160,0.15)'; border = 'rgba(0,229,160,0.4)'; statusIcon = ' ✓'; }
        else if (logEntry.status === 'missed') { bg = 'rgba(var(--red-r),0.12)'; border = 'rgba(var(--red-r),0.35)'; statusIcon = ' ✗'; }
        else { bg = 'rgba(var(--gold-r),0.15)'; border = 'rgba(var(--gold-r),0.35)'; statusIcon = ' ◐'; }
      } else {
        bg = 'rgba(var(--gold-r),0.12)'; border = 'var(--gold)'; statusIcon = '';
      }
    } else {
      bg = 'var(--bg3)'; border = 'transparent'; fontWeight = '400'; cursor = '';
    }

    var outline = isToday ? 'outline:2px solid var(--cyan);outline-offset:1px;' : '';
    var click = ek ? 'onclick="showEkadashiLogModal(\'' + ek.date + '\',\'' + ek.name + '\',\'' + ek.paksha + '\')"' : '';
    var title = ek ? 'title="' + ek.fullName + ' (' + (ek.paksha === 'shukla' ? 'Bright Half' : 'Dark Half') + ')' + (logEntry ? ' — ' + logEntry.status.toUpperCase() : '') + '"' : '';

    html += '<div style="text-align:center;padding:6px 2px;background:' + bg + ';border:1px solid ' + border + ';border-radius:6px;font-family:var(--font-mono);font-size:12px;font-weight:' + fontWeight + ';' + cursor + outline + '" ' + click + ' ' + title + '>';
    html += '<div style="color:' + (ek ? 'var(--gold)' : 'var(--text-dim)') + '">' + d + statusIcon + '</div>';
    if (ek) html += '<div style="font-size:7px;color:var(--gold);margin-top:2px;letter-spacing:0.5px">' + ek.name.substring(0, 6).toUpperCase() + '</div>';
    html += '</div>';
  }
  document.getElementById('ekadashiCalendar').innerHTML = html;

  // Upcoming list
  var upcoming = [];
  for (var m = 0; m < 3 && upcoming.length < 6; m++) {
    var um = (_ekadashiMonth + m) % 12;
    var uy = _ekadashiYear + Math.floor((_ekadashiMonth + m) / 12);
    var eds = getEkadashiDates(uy, um);
    eds.forEach(function(e) {
      if (e.date >= getEffectiveToday() && upcoming.length < 6) upcoming.push(e);
    });
  }
  var upHtml = '';
  upcoming.forEach(function(u) {
    var diff = Math.floor((new Date(u.date) - new Date()) / 86400000) + 1;
    var logE = log[u.date];
    var badge = diff <= 2 ? '<span style="color:var(--brahma);margin-left:8px;font-weight:700">' + diff + ' DAY' + (diff !== 1 ? 'S' : '') + '</span>' : '<span style="color:var(--text-dim);margin-left:8px">' + diff + ' days</span>';
    var statusBadge = logE ? '<span style="color:' + (logE.status === 'observed' ? 'var(--green)' : 'var(--brahma)') + ';font-weight:700;margin-left:8px">' + (logE.status === 'observed' ? '✓' : '✗') + '</span>' : '';
    upHtml += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(var(--gold-r),0.06)">';
    upHtml += '<div><span style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--gold)">' + u.fullName + '</span>' + badge + statusBadge + '</div>';
    upHtml += '<span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">' + u.date + ' · ' + (u.paksha === 'shukla' ? 'Bright' : 'Dark') + '</span>';
    upHtml += '</div>';
  });
  document.getElementById('ekadashiUpcomingList').innerHTML = upHtml || '<div style="color:var(--text-dim);font-family:var(--font-mono);font-size:11px">No upcoming dates</div>';
}

// ── LOG MODAL ──
function showEkadashiLogModal(date, name, paksha) {
  var log = getEkadashiLog();
  var existing = log[date] || {};
  var modal = document.getElementById('ekLogModal');
  if (!modal) return;
  var locked = isDateLocked(date);

  var html = '<div style="padding:24px;background:var(--bg2);border:1px solid rgba(var(--gold-r),0.2);border-radius:12px">' +
    '<div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:var(--gold);margin-bottom:4px">' + name + ' Ekadashi</div>' +
    '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);margin-bottom:16px">' + date + ' · ' + (paksha === 'shukla' ? 'Shukla Paksha (Bright Half)' : 'Krishna Paksha (Dark Half)') + '</div>';

  if (locked) {
    html += getLockBannerHTML(date);
    if (existing.status) {
      var statusLabel = existing.status === 'observed' ? '✓ OBSERVED' : existing.status === 'missed' ? '✗ MISSED' : '◐ PARTIAL';
      var statusColor = existing.status === 'observed' ? 'var(--green)' : existing.status === 'missed' ? 'var(--brahma)' : 'var(--gold)';
      html += '<div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:' + statusColor + ';margin-bottom:8px">' + statusLabel + '</div>';
      if (existing.note) html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">' + existing.note + '</div>';
    } else {
      html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim)">No observance logged</div>';
    }
  } else {
    html += '<div style="display:flex;gap:8px;margin-bottom:16px">' +
      '<button class="btn ' + (existing.status === 'observed' ? 'btn-primary' : 'btn-outline') + ' btn-sm" style="flex:1;' + (existing.status === 'observed' ? 'background:var(--green);border-color:var(--green)' : '') + '" onclick="logEkadashi(\'' + date + '\',\'' + name + '\',\'' + paksha + '\',\'observed\')">✓ OBSERVED</button>' +
      '<button class="btn ' + (existing.status === 'missed' ? 'btn-primary' : 'btn-outline') + ' btn-sm" style="flex:1;' + (existing.status === 'missed' ? 'background:var(--brahma);border-color:var(--brahma)' : '') + '" onclick="logEkadashi(\'' + date + '\',\'' + name + '\',\'' + paksha + '\',\'missed\')">✗ MISSED</button>' +
      '<button class="btn ' + (existing.status === 'partial' ? 'btn-primary' : 'btn-outline') + ' btn-sm" style="flex:1;' + (existing.status === 'partial' ? 'background:var(--gold);border-color:var(--gold)' : '') + '" onclick="logEkadashi(\'' + date + '\',\'' + name + '\',\'' + paksha + '\',\'partial\')">◐ PARTIAL</button>' +
    '</div>' +
    '<textarea class="form-input" rows="2" style="font-size:11px;border-color:rgba(var(--gold-r),0.15)" id="ekLogNote" placeholder="Optional note...">' + (existing.note || '') + '</textarea>';
  }
  html += '<div style="display:flex;gap:8px;margin-top:12px"><button class="btn btn-outline btn-sm" style="flex:1" onclick="document.getElementById(\'ekLogModal\').style.display=\'none\'">CLOSE</button></div></div>';
  modal.innerHTML = html;
  modal.style.display = 'block';
}

function logEkadashi(date, name, paksha, status) {
  if (isDateLocked(date)) { showLockWarning(); return; }
  var note = document.getElementById('ekLogNote') ? document.getElementById('ekLogNote').value : '';
  saveEkadashiLog(date, name, paksha, status, note);
  document.getElementById('ekLogModal').style.display = 'none';
  if (_ekadashiTab === 'month') renderEkadashiMonthly();
  else renderEkadashiYearly();
}

// ── RENDER YEARLY VIEW ──
function renderEkadashiYearly() {
  var container = document.getElementById('ekYearView');
  if (!container) return;
  var year = _ekadashiYear || new Date().getFullYear();
  var all = getEkadashiYear(year);
  var log = getEkadashiLog();
  var todayStr = getEffectiveToday();

  var observed = 0, missed = 0, partial = 0, total = all.length;
  all.forEach(function(e) {
    var l = log[e.date];
    if (l && l.status === 'observed') observed++;
    else if (l && l.status === 'missed') missed++;
    else if (l && l.status === 'partial') partial++;
  });

  // Count all-time stats across all years we have data for
  var allTimeObserved = 0, allTimeTotal = 0;
  var logKeys = Object.keys(log);
  logKeys.forEach(function(k) { if (log[k].status === 'observed') allTimeObserved++; });
  // Count total Ekadashis from 2026 to current year
  for (var y = 2026; y <= new Date().getFullYear(); y++) {
    var yearEks = getEkadashiYear(y);
    yearEks.forEach(function(e) { if (e.date <= todayStr) allTimeTotal++; });
  }

  var pct = total > 0 ? Math.round(observed / total * 100) : 0;
  var pastEks = all.filter(function(e) { return e.date < todayStr; }).length;
  var pastObserved = 0;
  all.forEach(function(e) { if (e.date < todayStr && log[e.date] && log[e.date].status === 'observed') pastObserved++; });
  var pastPct = pastEks > 0 ? Math.round(pastObserved / pastEks * 100) : 0;

  var html = '';

  // Year selector
  html += '<div style="display:flex;gap:8px;align-items:center;margin-bottom:20px">';
  html += '<button class="btn-copy" onclick="_ekadashiYear=' + (year - 1) + ';renderEkadashiYearly()">◀ ' + (year - 1) + '</button>';
  html += '<span style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:var(--gold)">' + year + '</span>';
  html += '<button class="btn-copy" onclick="_ekadashiYear=' + (year + 1) + ';renderEkadashiYearly()">' + (year + 1) + ' ▶</button>';
  html += '</div>';

  // KPI strip
  html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px">';
  html += ekStatCard(observed, 'OBSERVED', observed > 0 ? 'var(--green)' : 'var(--text-dim)');
  html += ekStatCard(missed, 'MISSED', missed > 0 ? 'var(--brahma)' : 'var(--text-dim)');
  html += ekStatCard(partial, 'PARTIAL', partial > 0 ? 'var(--gold)' : 'var(--text-dim)');
  html += ekStatCard(total - observed - missed - partial, 'REMAINING', 'var(--text-dim)');
  html += '</div>';

  // Progress bar
  html += '<div class="panel-section" style="border-color:rgba(var(--gold-r),0.15);text-align:center;padding:24px">';
  html += '<div style="font-family:var(--font-mono);font-size:48px;font-weight:700;color:' + (pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--gold)' : 'var(--brahma)') + '">' + pct + '%</div>';
  html += '<div style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);margin-top:4px">' + observed + ' of ' + total + ' OBSERVED IN ' + year + '</div>';
  html += '<div style="height:8px;background:var(--bg3);border-radius:4px;margin-top:12px;overflow:hidden">';
  html += '<div style="height:100%;width:' + pct + '%;background:' + (pct >= 70 ? 'var(--green)' : 'var(--gold)') + ';border-radius:4px;transition:width 0.3s"></div>';
  html += '</div>';

  // Past accuracy (only count Ekadashis that have already passed)
  if (pastEks > 0) {
    html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-top:12px">Past Ekadashis accuracy: <span style="color:' + (pastPct >= 70 ? 'var(--green)' : 'var(--gold)') + ';font-weight:700">' + pastPct + '%</span> (' + pastObserved + '/' + pastEks + ' observed)</div>';
  }

  // All-time stats
  if (allTimeTotal > 0) {
    html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-top:6px">All-time: <span style="color:var(--gold);font-weight:700">' + allTimeObserved + '</span> observed out of <span style="font-weight:700">' + allTimeTotal + '</span> total Ekadashis</div>';
  }
  html += '</div>';

  // 12-month timeline
  html += '<div class="panel-section" style="border-color:rgba(var(--gold-r),0.1)">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--gold);margin-bottom:16px">YEARLY TIMELINE</div>';

  var months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  for (var m = 0; m < 12; m++) {
    var monthEks = all.filter(function(e) { return e.month === m; });
    if (monthEks.length === 0) continue;

    html += '<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid rgba(var(--gold-r),0.04)">';
    html += '<span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);min-width:32px">' + months[m] + '</span>';

    monthEks.forEach(function(ek) {
      var l = log[ek.date];
      var isPast = ek.date < todayStr;
      var col, icon;
      if (l && l.status === 'observed') { col = 'var(--green)'; icon = '✓'; }
      else if (l && l.status === 'missed') { col = 'var(--brahma)'; icon = '✗'; }
      else if (l && l.status === 'partial') { col = 'var(--gold)'; icon = '◐'; }
      else if (isPast) { col = 'var(--text-dim)'; icon = '—'; }
      else { col = 'var(--text-dim)'; icon = '○'; }

      var pakshaLabel = ek.paksha === 'shukla' ? 'S' : 'K';
      html += '<div style="flex:1;display:flex;align-items:center;gap:6px;cursor:pointer" onclick="showEkadashiLogModal(\'' + ek.date + '\',\'' + ek.name + '\',\'' + ek.paksha + '\')">';
      html += '<span style="color:' + col + ';font-weight:700;font-size:14px">' + icon + '</span>';
      html += '<span style="font-family:var(--font-mono);font-size:11px;color:var(--text)">' + ek.name + '</span>';
      html += '<span style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim)">(' + pakshaLabel + ')</span>';
      html += '<span style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-left:auto">' + ek.date.substring(5) + '</span>';
      html += '</div>';
    });
    html += '</div>';
  }
  html += '</div>';

  container.innerHTML = html;
}

function ekStatCard(val, label, color) {
  return '<div style="text-align:center;padding:12px 6px;background:var(--surface);border:1px solid var(--surface-border);border-radius:10px">' +
    '<div style="font-family:var(--font-mono);font-size:22px;font-weight:700;color:' + (color || 'var(--text)') + '">' + val + '</div>' +
    '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:2px;color:var(--text-muted);margin-top:4px">' + label + '</div></div>';
}

// ── NOTIFICATIONS ──
function enableEkadashiNotifications() {
  if (!('Notification' in window)) { alert('Notifications not supported'); return; }
  Notification.requestPermission().then(function(perm) {
    if (perm === 'granted') { saveConfig({EKADASHI_NOTIFICATIONS: true}); alert('Ekadashi notifications enabled!'); checkEkadashiNotifications(); }
  });
}

function checkEkadashiNotifications() {
  if (!FL.EKADASHI_NOTIFICATIONS || Notification.permission !== 'granted') return;
  var next = getNextEkadashi();
  if (!next) return;
  var diff = Math.floor((new Date(next.date) - new Date()) / 86400000) + 1;
  if (diff === 1 || diff === 2) {
    new Notification('🙏 ' + next.fullName + ' in ' + diff + ' day' + (diff > 1 ? 's' : ''), {
      body: (next.paksha === 'shukla' ? 'Shukla Paksha' : 'Krishna Paksha') + ' — Prepare for fasting. Fruit, milk, water only.',
      icon: '/website/icon-512.png'
    });
  }
}

setTimeout(checkEkadashiNotifications, 2000);
 
