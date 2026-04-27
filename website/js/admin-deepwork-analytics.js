// ═══════════════════════════════════════════
// FIRST LIGHT — DEEP WORK ANALYTICS
// Weekly & Monthly trends, category breakdown, biggest wins
// ═══════════════════════════════════════════

var _dwAnalyticsTab = 'week';

function switchDWAnalyticsTab(tab) {
  _dwAnalyticsTab = tab;
  document.getElementById('dwAnalyticsWeek').style.display = tab === 'week' ? 'block' : 'none';
  document.getElementById('dwAnalyticsMonth').style.display = tab === 'month' ? 'block' : 'none';
  document.getElementById('dwAnalyticsTabWeek').classList.toggle('active', tab === 'week');
  document.getElementById('dwAnalyticsTabMonth').classList.toggle('active', tab === 'month');
  buildDWAnalytics();
}

function buildDWAnalytics() {
  if (_dwAnalyticsTab === 'week') buildDWWeekly();
  else buildDWMonthly();
}

// ── Helper: read deep work data for a date ──
function getDWData(dateStr) {
  try { return JSON.parse(localStorage.getItem('fl_deepwork_' + dateStr) || 'null'); } catch(e) { return null; }
}

// ── WEEKLY VIEW ──
function buildDWWeekly() {
  var container = document.getElementById('dwAnalyticsWeek');
  if (!container) return;
  var today = new Date();
  var dayNames = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  var html = '';

  // Gather 7 days
  var weekData = [];
  var totalBlocks = 0, totalDone = 0, totalHours = 0;
  var catCounts = {};
  var bigWins = [];

  for (var i = 6; i >= 0; i--) {
    var d = new Date(today); d.setDate(d.getDate() - i);
    var ds = (d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));
    var data = getDWData(ds);
    var done = 0, planned = 0, hours = 0;
    if (data && data.blocks) {
      planned = data.blocks.filter(function(b) { return b.task; }).length;
      data.blocks.forEach(function(b) {
        if (b.done) {
          done++;
          // Estimate hours from time slot
          if (b.time && b.time.indexOf('-') > -1) {
            var parts = b.time.split('-');
            var start = parseTimeStr(parts[0]);
            var end = parseTimeStr(parts[1]);
            if (start !== null && end !== null && end > start) hours += (end - start);
          } else {
            hours += 1.5; // Default block = 1.5h
          }
          // Category tracking
          var cat = b.category || 'Deep Work';
          catCounts[cat] = (catCounts[cat] || 0) + 1;
        }
      });
      if (data.bigWin) bigWins.push({ date: ds, win: data.bigWin });
    }
    totalBlocks += planned;
    totalDone += done;
    totalHours += hours;
    weekData.push({ date: ds, day: dayNames[d.getDay()], done: done, planned: planned, hours: hours });
  }

  var avgPerDay = weekData.length > 0 ? (totalDone / 7).toFixed(1) : 0;
  var completionPct = totalBlocks > 0 ? Math.round(totalDone / totalBlocks * 100) : 0;

  // Summary cards
  html += '<div class="panel-section">';
  html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">';
  html += dwStatCard(totalDone, 'BLOCKS DONE', totalDone >= 20 ? 'var(--green)' : totalDone >= 10 ? 'var(--gold)' : 'var(--red)');
  html += dwStatCard(totalHours.toFixed(1) + 'h', 'FOCUS HOURS', 'var(--cyan)');
  html += dwStatCard(avgPerDay, 'AVG / DAY', 'var(--text)');
  html += dwStatCard(completionPct + '%', 'COMPLETION', completionPct >= 80 ? 'var(--green)' : completionPct >= 50 ? 'var(--gold)' : 'var(--red)');
  html += '</div>';

  // Daily bar chart
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--cyan);margin-bottom:12px">DAILY BREAKDOWN</div>';
  var maxDone = Math.max.apply(null, weekData.map(function(d) { return d.done; }).concat([1]));
  weekData.forEach(function(wd) {
    var barWidth = maxDone > 0 ? Math.round(wd.done / maxDone * 100) : 0;
    var isToday = wd.date === (today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0'));
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">';
    html += '<span style="font-family:var(--font-mono);font-size:10px;color:' + (isToday ? 'var(--cyan)' : 'var(--text-muted)') + ';min-width:32px;font-weight:' + (isToday ? '700' : '400') + '">' + wd.day + '</span>';
    html += '<div style="flex:1;height:20px;background:var(--bg3);border-radius:4px;overflow:hidden">';
    html += '<div style="height:100%;width:' + barWidth + '%;background:' + (wd.done >= 5 ? 'var(--green)' : wd.done >= 3 ? 'var(--cyan)' : wd.done > 0 ? 'var(--gold)' : 'transparent') + ';border-radius:4px;transition:width 0.3s"></div>';
    html += '</div>';
    html += '<span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);min-width:45px;text-align:right">' + wd.done + '/' + wd.planned + '</span>';
    html += '<span style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);min-width:35px;text-align:right">' + wd.hours.toFixed(1) + 'h</span>';
    html += '</div>';
  });
  html += '</div>';

  // Category breakdown
  html += '<div class="panel-section">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--cyan);margin-bottom:12px">CATEGORY BREAKDOWN</div>';
  var catColors = { 'Deep Work':'var(--cyan)', 'Learning':'#E040FB', 'Planning':'var(--gold)', 'Creative':'#FF69B4', 'Review':'#70AEFF', 'Admin':'var(--text-dim)' };
  var sortedCats = Object.keys(catCounts).sort(function(a, b) { return catCounts[b] - catCounts[a]; });
  if (sortedCats.length === 0) {
    html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim)">No completed blocks this week</div>';
  } else {
    sortedCats.forEach(function(cat) {
      var catPct = Math.round(catCounts[cat] / totalDone * 100);
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">';
      html += '<span style="width:8px;height:8px;border-radius:50%;background:' + (catColors[cat] || 'var(--text-dim)') + ';flex-shrink:0"></span>';
      html += '<span style="font-family:var(--font-mono);font-size:11px;color:var(--text);min-width:80px">' + cat + '</span>';
      html += '<div style="flex:1;height:12px;background:var(--bg3);border-radius:3px;overflow:hidden">';
      html += '<div style="height:100%;width:' + catPct + '%;background:' + (catColors[cat] || 'var(--text-dim)') + ';opacity:0.6;border-radius:3px"></div>';
      html += '</div>';
      html += '<span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);min-width:50px;text-align:right">' + catCounts[cat] + ' (' + catPct + '%)</span>';
      html += '</div>';
    });
  }
  html += '</div>';

  // Biggest wins
  if (bigWins.length > 0) {
    html += '<div class="panel-section">';
    html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--gold);margin-bottom:12px">BIGGEST WINS THIS WEEK</div>';
    bigWins.reverse().forEach(function(w) {
      html += '<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid rgba(0,212,255,0.04)">';
      html += '<span style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);min-width:70px">' + w.date.substring(5) + '</span>';
      html += '<span style="font-family:var(--font-mono);font-size:11px;color:var(--text)">' + w.win + '</span>';
      html += '</div>';
    });
    html += '</div>';
  }

  // ── 5-WEEK HISTORY ──
  html += '<div class="panel-section">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--cyan);margin-bottom:16px">5-WEEK PERFORMANCE</div>';

  var weeks = [];
  for (var w = 4; w >= 0; w--) {
    var wBlocks = 0, wDone = 0, wHours = 0, wBigWin = '';
    var wCats = {};
    var wStart = new Date(today); wStart.setDate(wStart.getDate() - (w * 7 + 6));
    var wEnd = new Date(today); wEnd.setDate(wEnd.getDate() - (w * 7));
    var startLabel = (wStart.getMonth() + 1) + '/' + wStart.getDate();
    var endLabel = (wEnd.getMonth() + 1) + '/' + wEnd.getDate();

    for (var wd = 0; wd < 7; wd++) {
      var wd2 = new Date(wStart); wd2.setDate(wd2.getDate() + wd);
      var wds = (wd2.getFullYear()+'-'+String(wd2.getMonth()+1).padStart(2,'0')+'-'+String(wd2.getDate()).padStart(2,'0'));
      var wdata = getDWData(wds);
      if (wdata && wdata.blocks) {
        wdata.blocks.forEach(function(b) {
          if (b.task) wBlocks++;
          if (b.done) {
            wDone++;
            if (b.time && b.time.indexOf('-') > -1) {
              var pts = b.time.split('-');
              var s = parseTimeStr(pts[0]), e = parseTimeStr(pts[1]);
              if (s !== null && e !== null && e > s) wHours += (e - s);
            } else { wHours += 1.5; }
            var wcat = b.category || 'Deep Work';
            wCats[wcat] = (wCats[wcat] || 0) + 1;
          }
        });
        if (wdata.bigWin && !wBigWin) wBigWin = wdata.bigWin;
      }
    }
    var wPct = wBlocks > 0 ? Math.round(wDone / wBlocks * 100) : 0;
    var topCat = '';
    var topCatCount = 0;
    Object.keys(wCats).forEach(function(c) { if (wCats[c] > topCatCount) { topCat = c; topCatCount = wCats[c]; } });
    weeks.push({ label: startLabel + ' – ' + endLabel, blocks: wBlocks, done: wDone, hours: wHours, pct: wPct, topCat: topCat, bigWin: wBigWin, isCurrent: w === 0 });
  }

  var maxWeekDone = Math.max.apply(null, weeks.map(function(wk) { return wk.done; }).concat([1]));

  // Week-over-week cards
  weeks.forEach(function(wk, idx) {
    var trend = '';
    if (idx > 0) {
      var prev = weeks[idx - 1];
      if (wk.done > prev.done) trend = '<span style="color:var(--green);font-size:10px;margin-left:6px">▲ ' + (wk.done - prev.done) + '</span>';
      else if (wk.done < prev.done) trend = '<span style="color:var(--red);font-size:10px;margin-left:6px">▼ ' + (prev.done - wk.done) + '</span>';
      else trend = '<span style="color:var(--text-dim);font-size:10px;margin-left:6px">━</span>';
    }

    var barW = maxWeekDone > 0 ? Math.round(wk.done / maxWeekDone * 100) : 0;
    var barColor = wk.pct >= 80 ? 'var(--green)' : wk.pct >= 50 ? 'var(--cyan)' : wk.pct > 0 ? 'var(--gold)' : 'var(--bg3)';
    var borderColor = wk.isCurrent ? 'var(--cyan)' : 'var(--surface-border)';
    var badge = wk.isCurrent ? '<span style="font-size:8px;background:var(--cyan);color:#000;padding:1px 6px;border-radius:3px;margin-left:6px;font-weight:700">NOW</span>' : '';

    html += '<div style="padding:14px;margin-bottom:10px;background:var(--surface);border:1px solid ' + borderColor + ';border-radius:10px' + (wk.isCurrent ? ';box-shadow:0 0 12px rgba(0,212,255,0.08)' : '') + '">';

    // Header row
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">';
    html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text);font-weight:600">' + wk.label + badge + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">' + wk.pct + '% complete</div>';
    html += '</div>';

    // Progress bar
    html += '<div style="height:8px;background:var(--bg3);border-radius:4px;overflow:hidden;margin-bottom:10px">';
    html += '<div style="height:100%;width:' + barW + '%;background:' + barColor + ';border-radius:4px;transition:width 0.3s"></div>';
    html += '</div>';

    // Stats row
    html += '<div style="display:flex;gap:16px;flex-wrap:wrap">';
    html += '<span style="font-family:var(--font-mono);font-size:11px;color:var(--text)">' + wk.done + '<span style="color:var(--text-dim)">/' + wk.blocks + ' blocks</span>' + trend + '</span>';
    html += '<span style="font-family:var(--font-mono);font-size:11px;color:var(--cyan)">' + wk.hours.toFixed(1) + 'h</span>';
    if (wk.topCat) html += '<span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted)">Top: ' + wk.topCat + '</span>';
    html += '</div>';

    // Big win
    if (wk.bigWin) {
      html += '<div style="margin-top:8px;padding:6px 10px;background:rgba(255,215,0,0.06);border-left:2px solid var(--gold);border-radius:0 4px 4px 0">';
      html += '<span style="font-family:var(--font-mono);font-size:9px;color:var(--gold);letter-spacing:1px">WIN: </span>';
      html += '<span style="font-family:var(--font-mono);font-size:10px;color:var(--text)">' + wk.bigWin + '</span>';
      html += '</div>';
    }

    html += '</div>';
  });

  // Trend summary
  if (weeks.length >= 2) {
    var first = weeks[0], last = weeks[weeks.length - 1];
    var blocksTrend = last.done - first.done;
    var hoursTrend = last.hours - first.hours;
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">';
    html += '<div style="text-align:center;padding:10px;background:var(--surface);border:1px solid var(--surface-border);border-radius:8px">';
    html += '<div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:' + (blocksTrend >= 0 ? 'var(--green)' : 'var(--red)') + '">' + (blocksTrend >= 0 ? '+' : '') + blocksTrend + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:1px;color:var(--text-muted);margin-top:2px">BLOCKS TREND</div></div>';
    html += '<div style="text-align:center;padding:10px;background:var(--surface);border:1px solid var(--surface-border);border-radius:8px">';
    html += '<div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:' + (hoursTrend >= 0 ? 'var(--green)' : 'var(--red)') + '">' + (hoursTrend >= 0 ? '+' : '') + hoursTrend.toFixed(1) + 'h</div>';
    html += '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:1px;color:var(--text-muted);margin-top:2px">HOURS TREND</div></div>';
    html += '</div>';
  }

  html += '</div>';

  container.innerHTML = html;
}

// ── MONTHLY VIEW ──
function buildDWMonthly() {
  var container = document.getElementById('dwAnalyticsMonth');
  if (!container) return;
  var today = new Date();
  var year = today.getFullYear();
  var month = today.getMonth();
  var daysInMonth = new Date(year, month + 1, 0).getDate();
  var monthNames = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
  var html = '';

  var totalDone = 0, totalPlanned = 0, totalHours = 0, daysWorked = 0;
  var catCounts = {};
  var bigWins = [];
  var dailyData = [];

  for (var d = 1; d <= daysInMonth; d++) {
    var ds = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    var data = getDWData(ds);
    var done = 0, planned = 0, hours = 0;
    if (data && data.blocks) {
      planned = data.blocks.filter(function(b) { return b.task; }).length;
      data.blocks.forEach(function(b) {
        if (b.done) {
          done++;
          if (b.time && b.time.indexOf('-') > -1) {
            var parts = b.time.split('-');
            var start = parseTimeStr(parts[0]);
            var end = parseTimeStr(parts[1]);
            if (start !== null && end !== null && end > start) hours += (end - start);
          } else { hours += 1.5; }
          var cat = b.category || 'Deep Work';
          catCounts[cat] = (catCounts[cat] || 0) + 1;
        }
      });
      if (done > 0) daysWorked++;
      if (data.bigWin) bigWins.push({ date: ds, win: data.bigWin });
    }
    totalDone += done;
    totalPlanned += planned;
    totalHours += hours;
    dailyData.push({ day: d, date: ds, done: done, planned: planned });
  }

  var completionPct = totalPlanned > 0 ? Math.round(totalDone / totalPlanned * 100) : 0;

  // Month header + stats
  html += '<div class="panel-section">';
  html += '<div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:var(--text);margin-bottom:16px">' + monthNames[month] + ' ' + year + '</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">';
  html += dwStatCard(totalDone, 'BLOCKS DONE', totalDone >= 60 ? 'var(--green)' : 'var(--gold)');
  html += dwStatCard(totalHours.toFixed(0) + 'h', 'FOCUS HOURS', 'var(--cyan)');
  html += dwStatCard(daysWorked + '/' + daysInMonth, 'DAYS WORKED', daysWorked >= 20 ? 'var(--green)' : 'var(--gold)');
  html += dwStatCard(completionPct + '%', 'COMPLETION', completionPct >= 80 ? 'var(--green)' : 'var(--gold)');
  html += '</div>';

  // Heatmap grid (7 cols x 5 rows)
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--cyan);margin-bottom:12px">DAILY HEATMAP</div>';
  var firstDay = new Date(year, month, 1).getDay();
  html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px">';
  var dayLabels = ['S','M','T','W','T','F','S'];
  dayLabels.forEach(function(l) { html += '<div style="text-align:center;font-family:var(--font-mono);font-size:8px;color:var(--text-dim);padding:2px">' + l + '</div>'; });
  for (var blank = 0; blank < firstDay; blank++) html += '<div></div>';
  dailyData.forEach(function(dd) {
    var isToday = dd.date === (today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0'));
    var intensity = dd.done === 0 ? 0 : dd.done <= 2 ? 1 : dd.done <= 5 ? 2 : 3;
    var colors = ['var(--bg3)', 'rgba(0,212,255,0.15)', 'rgba(0,212,255,0.35)', 'rgba(0,229,160,0.5)'];
    var outline = isToday ? 'outline:2px solid var(--cyan);outline-offset:1px;' : '';
    html += '<div style="text-align:center;padding:4px 2px;background:' + colors[intensity] + ';border-radius:4px;font-family:var(--font-mono);font-size:10px;color:' + (dd.done > 0 ? 'var(--text)' : 'var(--text-dim)') + ';' + outline + '" title="' + dd.date + ': ' + dd.done + ' blocks">' + dd.day + '</div>';
  });
  html += '</div>';
  html += '</div>';

  // Category breakdown
  html += '<div class="panel-section">';
  html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--cyan);margin-bottom:12px">CATEGORY SPLIT</div>';
  var catColors = { 'Deep Work':'var(--cyan)', 'Learning':'#E040FB', 'Planning':'var(--gold)', 'Creative':'#FF69B4', 'Review':'#70AEFF', 'Admin':'var(--text-dim)' };
  var sortedCats = Object.keys(catCounts).sort(function(a, b) { return catCounts[b] - catCounts[a]; });
  if (sortedCats.length === 0) {
    html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim)">No data yet</div>';
  } else {
    sortedCats.forEach(function(cat) {
      var catPct = Math.round(catCounts[cat] / totalDone * 100);
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">';
      html += '<span style="width:8px;height:8px;border-radius:50%;background:' + (catColors[cat] || 'var(--text-dim)') + ';flex-shrink:0"></span>';
      html += '<span style="font-family:var(--font-mono);font-size:11px;color:var(--text);min-width:80px">' + cat + '</span>';
      html += '<div style="flex:1;height:12px;background:var(--bg3);border-radius:3px;overflow:hidden">';
      html += '<div style="height:100%;width:' + catPct + '%;background:' + (catColors[cat] || 'var(--text-dim)') + ';opacity:0.6;border-radius:3px"></div>';
      html += '</div>';
      html += '<span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);min-width:50px;text-align:right">' + catCounts[cat] + ' (' + catPct + '%)</span>';
      html += '</div>';
    });
  }
  html += '</div>';

  // Biggest wins
  if (bigWins.length > 0) {
    html += '<div class="panel-section">';
    html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--gold);margin-bottom:12px">BIGGEST WINS — ' + monthNames[month] + '</div>';
    bigWins.reverse().forEach(function(w) {
      html += '<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid rgba(0,212,255,0.04)">';
      html += '<span style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);min-width:50px">' + w.date.substring(5) + '</span>';
      html += '<span style="font-family:var(--font-mono);font-size:11px;color:var(--text)">' + w.win + '</span>';
      html += '</div>';
    });
    html += '</div>';
  }

  container.innerHTML = html;
}

// ── Helpers ──
function dwStatCard(val, label, color) {
  return '<div style="text-align:center;padding:14px 8px;background:var(--surface);border:1px solid var(--surface-border);border-radius:10px">' +
    '<div style="font-family:var(--font-mono);font-size:22px;font-weight:700;color:' + (color || 'var(--text)') + ';font-variant-numeric:tabular-nums">' + val + '</div>' +
    '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:2px;color:var(--text-muted);margin-top:4px">' + label + '</div></div>';
}

function parseTimeStr(str) {
  if (!str) return null;
  str = str.trim();
  var parts = str.split(':');
  if (parts.length < 2) return null;
  var h = parseInt(parts[0]);
  var m = parseInt(parts[1]);
  if (isNaN(h) || isNaN(m)) return null;
  return h + m / 60;
}
 
