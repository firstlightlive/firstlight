// ═══════════════════════════════════════════
// FIRST LIGHT — UNIFIED STREAKS PANEL
// All streaks, heatmaps, history, trends
// ═══════════════════════════════════════════

var _streakRetryCount = 0;
function renderUnifiedStreaks() {
  var container = document.getElementById('unifiedStreaksContent');
  if (!container) return;

  // If proof data is empty, bootstrap may still be loading — retry up to 10 times (20s total)
  var proof = getProofData();
  if (!proof || proof.length === 0) {
    _streakRetryCount++;
    if (_streakRetryCount <= 10) {
      container.innerHTML = '<div style="text-align:center;padding:40px;font-family:var(--font-mono);font-size:12px;color:var(--text-dim)">Loading streak data from cloud... (' + _streakRetryCount + '/10)</div>';
      setTimeout(renderUnifiedStreaks, 2000);
    } else {
      container.innerHTML = '<div style="text-align:center;padding:40px;font-family:var(--font-mono);font-size:12px;color:var(--red)">Could not load proof data. Please check Sync Center or refresh the page.</div>';
    }
    return;
  }
  _streakRetryCount = 0;

  var html = '';
  var today = new Date();
  var todayStr = (today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0'));

  // ── Gather ALL streak data ──
  var streaks = gatherAllStreaks();

  // ── HERO: Overall Discipline Score ──
  var activeStreaks = streaks.filter(function(s) { return s.current > 0; }).length;
  var totalStreaks = streaks.length;
  var disciplineScore = totalStreaks > 0 ? Math.round(activeStreaks / totalStreaks * 100) : 0;
  var longestAny = Math.max.apply(null, streaks.map(function(s) { return s.longest; }).concat([0]));

  html += '<div class="panel-section" style="border-color:rgba(0,212,255,0.2);background:rgba(0,212,255,0.02)">';
  html += '<div style="text-align:center;margin-bottom:16px">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:3px;color:var(--text-muted);margin-bottom:8px">DISCIPLINE SCORE</div>';
  html += '<div style="font-family:var(--font-mono);font-size:48px;font-weight:700;color:' + (disciplineScore >= 80 ? 'var(--green)' : disciplineScore >= 50 ? 'var(--cyan)' : 'var(--gold)') + ';line-height:1">' + disciplineScore + '%</div>';
  html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);margin-top:6px">' + activeStreaks + '/' + totalStreaks + ' STREAKS ACTIVE · BEST EVER: ' + longestAny + ' DAYS</div>';
  html += '</div>';

  // Score bar
  html += '<div style="height:8px;background:var(--bg3);border-radius:4px;overflow:hidden">';
  html += '<div style="height:100%;width:' + disciplineScore + '%;background:linear-gradient(90deg,' + (disciplineScore >= 80 ? 'var(--green),#00E676' : disciplineScore >= 50 ? 'var(--cyan),#00D4FF' : 'var(--gold),#F5A623') + ');border-radius:4px;transition:width 0.5s"></div>';
  html += '</div>';
  html += '</div>';

  // ── STREAK CARDS GRID ──
  html += '<div class="panel-section">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--cyan);margin-bottom:16px">ALL STREAKS</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">';

  streaks.forEach(function(s) {
    var isActive = s.current > 0;
    var pctOfBest = s.longest > 0 ? Math.round(s.current / s.longest * 100) : 0;
    var ring = isActive ? 'border-color:' + s.color : 'border-color:var(--surface-border);opacity:0.5';

    html += '<div style="text-align:center;padding:16px 8px;background:var(--surface);border:2px solid ' + (isActive ? s.color : 'var(--surface-border)') + ';border-radius:12px;' + (isActive ? 'box-shadow:0 0 12px ' + s.color + '20' : 'opacity:0.6') + ';cursor:pointer" onclick="scrollToStreakDetail(\'' + s.key + '\')">';

    // Status dot
    html += '<div style="display:flex;justify-content:center;margin-bottom:8px">';
    html += '<div style="width:8px;height:8px;border-radius:50%;background:' + (isActive ? s.color : 'var(--text-dim)') + (isActive ? ';box-shadow:0 0 6px ' + s.color : '') + '"></div>';
    html += '</div>';

    // Current streak number
    html += '<div style="font-family:var(--font-mono);font-size:28px;font-weight:700;color:' + (isActive ? s.color : 'var(--text-dim)') + ';line-height:1">' + s.current + '</div>';

    // Label
    html += '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:2px;color:var(--text-muted);margin-top:6px">' + s.label + '</div>';

    // Best
    html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-top:4px">BEST: ' + s.longest + '</div>';

    // Mini progress toward best
    if (s.longest > 0) {
      html += '<div style="height:3px;background:var(--bg3);border-radius:2px;overflow:hidden;margin-top:6px">';
      html += '<div style="height:100%;width:' + Math.min(pctOfBest, 100) + '%;background:' + s.color + ';border-radius:2px"></div>';
      html += '</div>';
    }

    html += '</div>';
  });

  html += '</div>';
  html += '</div>';

  // ── 90-DAY HEATMAP — All Streaks Combined ──
  html += '<div class="panel-section">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--cyan);margin-bottom:12px">90-DAY DISCIPLINE MAP</div>';
  html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-bottom:12px">Each cell = how many streaks were active that day</div>';

  var dayLabels = ['S','M','T','W','T','F','S'];
  html += '<div style="display:grid;grid-template-columns:repeat(13,1fr);gap:2px">';

  // 90 days in 13 columns (weeks)
  var startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 90);
  // Align to start of week
  startDate.setDate(startDate.getDate() - startDate.getDay());

  var proof = getProofData();
  var proofMap = {};
  if (proof) proof.forEach(function(p) { proofMap[p.date] = p; });

  for (var col = 0; col < 13; col++) {
    for (var row = 0; row < 7; row++) {
      var cellDate = new Date(startDate);
      cellDate.setDate(cellDate.getDate() + col * 7 + row);
      var cellStr = (cellDate.getFullYear()+'-'+String(cellDate.getMonth()+1).padStart(2,'0')+'-'+String(cellDate.getDate()).padStart(2,'0'));

      if (cellDate > today) {
        html += '<div style="width:100%;aspect-ratio:1;border-radius:2px"></div>';
        continue;
      }

      var activeCount = countActiveStreaksForDate(cellStr, proofMap);
      var intensity = activeCount === 0 ? 0 : activeCount <= 2 ? 1 : activeCount <= 4 ? 2 : activeCount <= 6 ? 3 : 4;
      var heatColors = ['var(--bg3)', 'rgba(0,212,255,0.12)', 'rgba(0,212,255,0.25)', 'rgba(0,229,160,0.4)', 'rgba(0,229,160,0.65)'];
      var isToday2 = cellStr === todayStr;

      html += '<div style="width:100%;aspect-ratio:1;background:' + heatColors[intensity] + ';border-radius:2px;' + (isToday2 ? 'outline:2px solid var(--cyan);outline-offset:1px;' : '') + '" title="' + cellStr + ': ' + activeCount + '/' + totalStreaks + ' active"></div>';
    }
  }
  html += '</div>';

  // Legend
  html += '<div style="display:flex;align-items:center;gap:4px;margin-top:8px;justify-content:flex-end">';
  html += '<span style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim)">Less</span>';
  ['var(--bg3)', 'rgba(0,212,255,0.12)', 'rgba(0,212,255,0.25)', 'rgba(0,229,160,0.4)', 'rgba(0,229,160,0.65)'].forEach(function(c) {
    html += '<div style="width:10px;height:10px;background:' + c + ';border-radius:2px"></div>';
  });
  html += '<span style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim)">More</span>';
  html += '</div>';
  html += '</div>';

  // ── INDIVIDUAL STREAK DETAILS ──
  streaks.forEach(function(s) {
    html += buildStreakDetailCard(s, today, proofMap);
  });

  // ── CROSS-RULE PATTERN DETECTION ──
  html += buildPatternDetection(streaks, proof, today);

  container.innerHTML = html;
}

// ── Gather all streaks with history ──
function gatherAllStreaks() {
  var rs = (typeof computeRunStreak === 'function') ? computeRunStreak() : {current:0,longest:0};
  var fs = (typeof computeFoodStreak === 'function') ? computeFoodStreak() : {current:0,longest:0};
  var fos = (typeof computeFortressOutStreak === 'function') ? computeFortressOutStreak() : {current:0,longest:0};
  var bs = (typeof computeBrahmaStreak === 'function') ? computeBrahmaStreak() : {currentStreak:0,longestStreak:0};
  var js = (typeof computeJapaStreak === 'function') ? computeJapaStreak() : {current:0,longest:0};
  var rds = (typeof computeReadingStreak === 'function') ? computeReadingStreak() : {current:0,longest:0};
  var ss = computeSleepStreak();
  var dws = computeDeepWorkStreak();
  var ws = computeWakeStreak();

  return [
    { key:'run', label:'RUN', current:rs.current, longest:rs.longest, color:'var(--cyan)', icon:'🏃', rule:'BODY' },
    { key:'food', label:'FOOD', current:fs.current, longest:fs.longest, color:'var(--green)', icon:'🥗', rule:'BODY' },
    { key:'sleep', label:'SLEEP 5h+', current:ss.current, longest:ss.longest, color:'#B388FF', icon:'😴', rule:'BODY' },
    { key:'wake', label:'WAKE <4AM', current:ws.current, longest:ws.longest, color:'#FF9E80', icon:'⏰', rule:'BODY' },
    { key:'fortress', label:'FORTRESS', current:fos.current, longest:fos.longest, color:'var(--brahma)', icon:'🏰', rule:'FORTRESS' },
    { key:'brahma', label:'BRAHMA', current:bs.currentStreak||0, longest:bs.longestStreak||0, color:'var(--brahma)', icon:'⚔', rule:'FORTRESS' },
    { key:'japa', label:'JAPA', current:js.current, longest:js.longest, color:'var(--gold)', icon:'📿', rule:'SADHANA' },
    { key:'reading', label:'READING', current:rds.current, longest:rds.longest, color:'#4FC3F7', icon:'📖', rule:'SADHANA' },
    { key:'deepwork', label:'DEEP WORK', current:dws.current, longest:dws.longest, color:'#E040FB', icon:'⚡', rule:'DEEP WORK' }
  ];
}

// ── Sleep Streak (5h+ threshold, starts from STREAK_EPOCH, with gap detection) ──
function computeSleepStreak() {
  var proof = getProofData();
  if (!proof || !proof.length) return { current: 0, longest: 0 };
  proof = proof.filter(function(p) { return p.date >= STREAK_EPOCH; });
  if (!proof.length) return { current: 0, longest: 0 };
  var dateMap = {};
  proof.forEach(function(p) { dateMap[p.date] = p; });

  var today = getEffectiveToday();
  var current = 0;
  for (var i = 0; i < 400; i++) {
    var d = new Date(today + 'T12:00:00');
    d.setDate(d.getDate() - i);
    var ds = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    if (ds < STREAK_EPOCH) break;
    var entry = dateMap[ds];
    if (entry && entry.sleepHrs >= 5) { current++; }
    else if (i === 0) { continue; }
    else { break; }
  }

  proof.sort(function(a, b) { return a.date < b.date ? -1 : 1; });
  var longest = 0, streak = 0;
  for (var j = 0; j < proof.length; j++) {
    if (proof[j].sleepHrs >= 5) {
      if (j > 0 && streak > 0) {
        var prev = new Date(proof[j-1].date + 'T12:00:00');
        var curr = new Date(proof[j].date + 'T12:00:00');
        if (Math.round((curr - prev) / 86400000) > 1) streak = 0;
      }
      streak++;
      longest = Math.max(longest, streak);
    } else { streak = 0; }
  }
  return { current: current, longest: longest };
}

// ── Wake Before 4 AM Streak (starts from STREAK_EPOCH, with gap detection) ──
function computeWakeStreak() {
  var proof = getProofData();
  if (!proof || !proof.length) return { current: 0, longest: 0 };
  proof = proof.filter(function(p) { return p.date >= STREAK_EPOCH; });
  if (!proof.length) return { current: 0, longest: 0 };
  var dateMap = {};
  proof.forEach(function(p) { dateMap[p.date] = p; });

  var today = getEffectiveToday();
  var current = 0;
  for (var i = 0; i < 400; i++) {
    var d = new Date(today + 'T12:00:00');
    d.setDate(d.getDate() - i);
    var ds = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    if (ds < STREAK_EPOCH) break;
    var entry = dateMap[ds];
    if (entry && entry.wakeTime && entry.wakeTime <= '04:00') { current++; }
    else if (i === 0) { continue; }
    else { break; }
  }

  proof.sort(function(a, b) { return a.date < b.date ? -1 : 1; });
  var longest = 0, streak = 0;
  for (var j = 0; j < proof.length; j++) {
    var wt = proof[j].wakeTime;
    if (wt && wt <= '04:00') {
      if (j > 0 && streak > 0) {
        var prev = new Date(proof[j-1].date + 'T12:00:00');
        var curr = new Date(proof[j].date + 'T12:00:00');
        if (Math.round((curr - prev) / 86400000) > 1) streak = 0;
      }
      streak++;
      longest = Math.max(longest, streak);
    } else { streak = 0; }
  }
  return { current: current, longest: longest };
}

// ── Deep Work Streak (at least 1 block done, starts from STREAK_EPOCH, with today-skip) ──
function computeDeepWorkStreak() {
  var today = getEffectiveToday();
  var current = 0;
  for (var i = 0; i < 365; i++) {
    var d = new Date(today + 'T12:00:00');
    d.setDate(d.getDate() - i);
    var ds = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    if (ds < STREAK_EPOCH) break;
    var data = null;
    try { data = JSON.parse(localStorage.getItem('fl_deepwork_' + ds) || 'null'); } catch(e) {}
    var done = 0;
    if (data && data.blocks) {
      data.blocks.forEach(function(b) { if (b.done) done++; });
    }
    if (done > 0) { current++; }
    else if (i === 0) { continue; } // Today might not have data yet
    else { break; }
  }
  // Longest (within epoch)
  var longest = 0, streak = 0;
  var epochDate = new Date(STREAK_EPOCH + 'T12:00:00');
  var todayDate = new Date(today + 'T12:00:00');
  var daysFromEpoch = Math.ceil((todayDate - epochDate) / 86400000);
  for (var k = 0; k <= daysFromEpoch; k++) {
    var d2 = new Date(epochDate); d2.setDate(d2.getDate() + k);
    var ds2 = d2.getFullYear() + '-' + String(d2.getMonth()+1).padStart(2,'0') + '-' + String(d2.getDate()).padStart(2,'0');
    var data2 = null;
    try { data2 = JSON.parse(localStorage.getItem('fl_deepwork_' + ds2) || 'null'); } catch(e2) {}
    var done2 = 0;
    if (data2 && data2.blocks) {
      data2.blocks.forEach(function(b) { if (b.done) done2++; });
    }
    if (done2 > 0) { streak++; longest = Math.max(longest, streak); }
    else streak = 0;
  }
  return { current: current, longest: longest };
}

// ── Count active streaks for a specific date ──
function countActiveStreaksForDate(dateStr, proofMap) {
  var count = 0;
  var p = proofMap[dateStr];

  // Run
  if (p && p.runKm > 0) count++;
  // Food
  if (p && p.foodClean) count++;
  // Sleep 5h+
  if (p && p.sleepHrs >= 5) count++;
  // Wake < 4AM
  if (p && p.wakeTime && p.wakeTime <= '04:00') count++;
  // Japa
  if (p && p.japa) count++;

  // Fortress
  try {
    var brahma = JSON.parse(localStorage.getItem('fl_brahma_daily_' + dateStr) || 'null');
    if (brahma && brahma.stayed_out === true) count++;
    // Brahma clean (flat object: porn, sexual, masturbate)
    if (brahma && !(brahma.porn || brahma.sexual || brahma.masturbate)) count++;
  } catch(e) {}

  // Reading
  if (localStorage.getItem('fl_daily_rule_read_' + dateStr)) count++;

  // Deep work
  try {
    var dw = JSON.parse(localStorage.getItem('fl_deepwork_' + dateStr) || 'null');
    if (dw && dw.blocks) {
      var dwDone = 0;
      dw.blocks.forEach(function(b) { if (b.done) dwDone++; });
      if (dwDone > 0) count++;
    }
  } catch(e2) {}

  return count;
}

// ── Build individual streak detail card ──
function buildStreakDetailCard(s, today, proofMap) {
  var html = '';
  html += '<div class="panel-section" id="streak-detail-' + s.key + '" style="border-color:' + s.color + '15">';

  // Header
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">';
  html += '<div style="display:flex;align-items:center;gap:8px">';
  html += '<span style="font-size:18px">' + s.icon + '</span>';
  html += '<span style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--text)">' + s.label + '</span>';
  html += '<span style="font-family:var(--font-mono);font-size:9px;padding:2px 8px;border-radius:4px;background:' + s.color + '15;color:' + s.color + '">' + s.rule + '</span>';
  html += '</div>';
  html += '<div style="text-align:right">';
  html += '<div style="font-family:var(--font-mono);font-size:24px;font-weight:700;color:' + s.color + '">' + s.current + '</div>';
  html += '<div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim)">CURRENT</div>';
  html += '</div>';
  html += '</div>';

  // Stats row
  html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">';
  html += streakMiniStat(s.longest, 'LONGEST', s.color);
  var pctOfBest = s.longest > 0 ? Math.round(s.current / s.longest * 100) : 0;
  html += streakMiniStat(pctOfBest + '%', '% OF BEST', pctOfBest >= 100 ? 'var(--green)' : pctOfBest >= 50 ? s.color : 'var(--gold)');
  var daysToRecord = s.longest > 0 ? Math.max(0, s.longest - s.current + 1) : 1;
  html += streakMiniStat(s.current >= s.longest && s.current > 0 ? 'NEW!' : daysToRecord, s.current >= s.longest && s.current > 0 ? 'RECORD' : 'TO RECORD', s.current >= s.longest && s.current > 0 ? 'var(--green)' : 'var(--text-muted)');
  html += '</div>';

  // 30-day calendar strip
  html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:1px;color:var(--text-dim);margin-bottom:8px">LAST 30 DAYS</div>';
  html += '<div style="display:flex;gap:2px;flex-wrap:wrap">';
  for (var i = 29; i >= 0; i--) {
    var d = new Date(today); d.setDate(d.getDate() - i);
    var ds = (d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));
    var active = isStreakActiveOnDate(s.key, ds, proofMap);
    var isToday3 = ds === (today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0'));
    html += '<div style="width:calc(100%/30 - 2px);aspect-ratio:1;background:' + (active ? s.color : 'var(--bg3)') + ';border-radius:2px;' + (active ? 'opacity:0.7' : 'opacity:0.3') + ';' + (isToday3 ? 'outline:1px solid ' + s.color + ';opacity:1;' : '') + '" title="' + ds + '"></div>';
  }
  html += '</div>';

  // Streak history (last 5 streaks)
  var streakHistory = computeStreakHistory(s.key, proofMap, today);
  if (streakHistory.length > 1) {
    html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:1px;color:var(--text-dim);margin-top:14px;margin-bottom:8px">STREAK HISTORY</div>';
    var maxHist = Math.max.apply(null, streakHistory.map(function(h) { return h.length; }).concat([1]));
    streakHistory.slice(0, 5).forEach(function(h, idx) {
      var barW = Math.round(h.length / maxHist * 100);
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">';
      html += '<span style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);min-width:55px">' + h.start.substring(5) + '</span>';
      html += '<div style="flex:1;height:14px;background:var(--bg3);border-radius:3px;overflow:hidden">';
      html += '<div style="height:100%;width:' + barW + '%;background:' + s.color + ';opacity:' + (idx === 0 ? '0.8' : '0.4') + ';border-radius:3px"></div>';
      html += '</div>';
      html += '<span style="font-family:var(--font-mono);font-size:10px;color:' + (idx === 0 ? s.color : 'var(--text-dim)') + ';min-width:30px;text-align:right;font-weight:' + (idx === 0 ? '700' : '400') + '">' + h.length + 'd</span>';
      html += '</div>';
    });
  }

  html += '</div>';
  return html;
}

// ── Check if a specific streak was active on a date ──
function isStreakActiveOnDate(key, dateStr, proofMap) {
  var p = proofMap[dateStr];
  switch(key) {
    case 'run': return p && p.runKm > 0;
    case 'food': return p && p.foodClean;
    case 'sleep': return p && p.sleepHrs >= 5;
    case 'wake': return p && p.wakeTime && p.wakeTime <= '04:00';
    case 'japa': return p && p.japa;
    case 'fortress':
      try {
        var b = JSON.parse(localStorage.getItem('fl_brahma_daily_' + dateStr) || 'null');
        return b && b.stayed_out === true;
      } catch(e) { return false; }
    case 'brahma':
      try {
        var b2 = JSON.parse(localStorage.getItem('fl_brahma_daily_' + dateStr) || 'null');
        if (!b2) return false;
        return !(b2.porn || b2.sexual || b2.masturbate);
      } catch(e2) { return false; }
    case 'reading':
      return !!localStorage.getItem('fl_daily_rule_read_' + dateStr);
    case 'deepwork':
      try {
        var dw = JSON.parse(localStorage.getItem('fl_deepwork_' + dateStr) || 'null');
        if (!dw || !dw.blocks) return false;
        var done = 0;
        dw.blocks.forEach(function(b3) { if (b3.done) done++; });
        return done > 0;
      } catch(e3) { return false; }
    default: return false;
  }
}

// ── Compute streak history (last N streaks) ──
function computeStreakHistory(key, proofMap, today) {
  var history = [];
  var currentStreak = null;

  for (var i = 0; i < 365; i++) {
    var d = new Date(today); d.setDate(d.getDate() - i);
    var ds = (d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));
    var active = isStreakActiveOnDate(key, ds, proofMap);

    if (active) {
      if (!currentStreak) currentStreak = { end: ds, start: ds, length: 0 };
      currentStreak.start = ds;
      currentStreak.length++;
    } else {
      if (currentStreak) {
        history.push(currentStreak);
        currentStreak = null;
      }
    }
  }
  if (currentStreak) history.push(currentStreak);
  return history;
}

// ── CROSS-RULE PATTERN DETECTION ──
function buildPatternDetection(streaks, proof, today) {
  if (!proof || proof.length < 14) return ''; // Need at least 2 weeks

  var html = '<div class="panel-section" style="border-color:rgba(245,166,35,0.15);background:rgba(245,166,35,0.02)">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--gold);margin-bottom:4px">PATTERN DETECTION</div>';
  html += '<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-bottom:16px">Cross-rule correlations from your data</div>';

  var insights = [];

  // Sort proof chronologically
  proof.sort(function(a, b) { return a.date < b.date ? -1 : 1; });

  // ── Sleep vs Food correlation ──
  var sleepGoodFood = 0, sleepGoodTotal = 0, sleepBadFood = 0, sleepBadTotal = 0;
  proof.forEach(function(p) {
    if (p.sleepHrs >= 5) {
      sleepGoodTotal++;
      if (p.foodClean) sleepGoodFood++;
    } else if (p.sleepHrs > 0) {
      sleepBadTotal++;
      if (p.foodClean) sleepBadFood++;
    }
  });
  if (sleepGoodTotal >= 5 && sleepBadTotal >= 3) {
    var goodPct = Math.round(sleepGoodFood / sleepGoodTotal * 100);
    var badPct = Math.round(sleepBadFood / sleepBadTotal * 100);
    if (Math.abs(goodPct - badPct) >= 10) {
      insights.push({
        title: 'SLEEP → FOOD',
        text: 'Sleep 5h+: food compliance ' + goodPct + '% · Under 5h: ' + badPct + '%',
        delta: goodPct - badPct,
        color: goodPct > badPct ? 'var(--green)' : 'var(--red)'
      });
    }
  }

  // ── Sleep vs Fortress correlation ──
  var sleepGoodFortress = 0, sleepBadFortress = 0;
  proof.forEach(function(p) {
    try {
      var b = JSON.parse(localStorage.getItem('fl_brahma_daily_' + p.date) || 'null');
      if (!b) return;
      var clean = !(b.porn || b.sexual || b.masturbate);
      if (p.sleepHrs >= 5) { if (clean) sleepGoodFortress++; }
      else if (p.sleepHrs > 0) { if (clean) sleepBadFortress++; }
    } catch(e) {}
  });
  if (sleepGoodTotal >= 5 && sleepBadTotal >= 3) {
    var fGoodPct = Math.round(sleepGoodFortress / sleepGoodTotal * 100);
    var fBadPct = sleepBadTotal > 0 ? Math.round(sleepBadFortress / sleepBadTotal * 100) : 0;
    if (Math.abs(fGoodPct - fBadPct) >= 10) {
      insights.push({
        title: 'SLEEP → FORTRESS',
        text: 'Sleep 5h+: fortress clean ' + fGoodPct + '% · Under 5h: ' + fBadPct + '%',
        delta: fGoodPct - fBadPct,
        color: fGoodPct > fBadPct ? 'var(--green)' : 'var(--red)'
      });
    }
  }

  // ── Run vs Deep Work correlation ──
  var runDW = 0, runTotal = 0, noRunDW = 0, noRunTotal = 0;
  proof.forEach(function(p) {
    try {
      var dw = JSON.parse(localStorage.getItem('fl_deepwork_' + p.date) || 'null');
      var dwDone = 0;
      if (dw && dw.blocks) dw.blocks.forEach(function(b) { if (b.done) dwDone++; });
      if (p.runKm > 0) { runTotal++; runDW += dwDone; }
      else { noRunTotal++; noRunDW += dwDone; }
    } catch(e) {}
  });
  if (runTotal >= 5 && noRunTotal >= 3) {
    var runAvg = (runDW / runTotal).toFixed(1);
    var noRunAvg = (noRunDW / noRunTotal).toFixed(1);
    if (Math.abs(runAvg - noRunAvg) >= 0.5) {
      insights.push({
        title: 'RUN → DEEP WORK',
        text: 'Run days: ' + runAvg + ' blocks avg · Rest days: ' + noRunAvg + ' blocks avg',
        delta: runAvg - noRunAvg,
        color: runAvg > noRunAvg ? 'var(--green)' : 'var(--red)'
      });
    }
  }

  // ── Japa vs Overall day quality ──
  var japaGood = 0, japaTotal = 0, noJapaGood = 0, noJapaTotal = 0;
  proof.forEach(function(p) {
    var quality = 0;
    if (p.runKm > 0) quality++;
    if (p.foodClean) quality++;
    if (p.sleepHrs >= 5) quality++;
    if (p.japa) {
      japaTotal++;
      japaGood += quality;
    } else {
      noJapaTotal++;
      noJapaGood += quality;
    }
  });
  if (japaTotal >= 5 && noJapaTotal >= 3) {
    var japaAvg = (japaGood / japaTotal).toFixed(1);
    var noJapaAvg = (noJapaGood / noJapaTotal).toFixed(1);
    if (Math.abs(japaAvg - noJapaAvg) >= 0.3) {
      insights.push({
        title: 'JAPA → DAY QUALITY',
        text: 'Japa days: ' + japaAvg + '/3 quality · No japa: ' + noJapaAvg + '/3',
        delta: japaAvg - noJapaAvg,
        color: japaAvg > noJapaAvg ? 'var(--green)' : 'var(--red)'
      });
    }
  }

  // ── Wake time vs Run ──
  var earlyRun = 0, earlyTotal = 0, lateRun = 0, lateTotal = 0;
  proof.forEach(function(p) {
    if (p.wakeTime && p.wakeTime <= '04:00') {
      earlyTotal++;
      if (p.runKm > 0) earlyRun++;
    } else if (p.wakeTime) {
      lateTotal++;
      if (p.runKm > 0) lateRun++;
    }
  });
  if (earlyTotal >= 5 && lateTotal >= 3) {
    var earlyPct = Math.round(earlyRun / earlyTotal * 100);
    var latePct = Math.round(lateRun / lateTotal * 100);
    if (Math.abs(earlyPct - latePct) >= 10) {
      insights.push({
        title: 'WAKE TIME → RUN',
        text: 'Wake <4AM: ran ' + earlyPct + '% · Wake later: ran ' + latePct + '%',
        delta: earlyPct - latePct,
        color: earlyPct > latePct ? 'var(--green)' : 'var(--red)'
      });
    }
  }

  if (insights.length === 0) {
    html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);text-align:center;padding:20px 0">Need more data to detect patterns. Keep logging daily.</div>';
  } else {
    insights.forEach(function(ins) {
      html += '<div style="padding:12px;margin-bottom:8px;background:var(--surface);border:1px solid var(--surface-border);border-radius:8px">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">';
      html += '<span style="font-family:var(--font-mono);font-size:10px;font-weight:700;color:var(--gold);letter-spacing:1px">' + ins.title + '</span>';
      html += '<span style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:' + ins.color + '">' + (ins.delta > 0 ? '+' : '') + (typeof ins.delta === 'number' ? (Number.isInteger(ins.delta) ? ins.delta + '%' : ins.delta) : ins.delta) + '</span>';
      html += '</div>';
      html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">' + ins.text + '</div>';
      html += '</div>';
    });
  }

  html += '</div>';
  return html;
}

// ── Helpers ──
function streakMiniStat(val, label, color) {
  return '<div style="text-align:center;padding:10px 4px;background:var(--bg3);border-radius:8px">' +
    '<div style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:' + (color || 'var(--text)') + '">' + val + '</div>' +
    '<div style="font-family:var(--font-mono);font-size:7px;letter-spacing:1px;color:var(--text-dim);margin-top:2px">' + label + '</div></div>';
}

function scrollToStreakDetail(key) {
  var el = document.getElementById('streak-detail-' + key);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
 
