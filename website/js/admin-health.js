/* ═══════════════════════════════════════════════════════
   FIRST LIGHT — Apple Health Analytics Dashboard
   Next-gen health tracking: Sleep, Heart, Fitness, Activity
   Data source: Health Auto Export → Supabase health_daily
   ═══════════════════════════════════════════════════════ */

(function() {
  'use strict';

  // ── State ──
  var _healthData = [];
  var _viewRange = 30; // default 30 days
  var _loaded = false;

  // ── Colors ──
  var C = {
    sleep: '#70AEFF',
    sleepDeep: '#1E3A6E',
    sleepRem: '#5C8FD6',
    sleepCore: '#3A6BC5',
    sleepAwake: '#FF5252',
    hr: '#FF5252',
    hrv: '#00E676',
    vo2: '#F5A623',
    steps: '#00D4FF',
    cal: '#FC4C02',
    exercise: '#E040FB',
    spo2: '#26C6DA',
    wake: '#FFD54F',
    bedtime: '#7C4DFF',
    score: '#00E676',
    good: '#00E676',
    warn: '#F5A623',
    bad: '#FF5252',
    grid: 'rgba(255,255,255,0.06)',
    text: 'rgba(255,255,255,0.5)',
    textBright: 'rgba(255,255,255,0.9)',
  };

  // ── Helpers ──
  function fmt(n, d) { return n != null ? parseFloat(n).toFixed(d || 0) : '—'; }
  function pct(v, max) { return Math.min(100, Math.round((v / max) * 100)); }
  function avg(arr) { if (!arr.length) return 0; return arr.reduce(function(s,v){return s+v;},0)/arr.length; }
  function timeToMin(t) { if (!t) return null; var p = t.split(':'); return parseInt(p[0]) * 60 + parseInt(p[1]); }
  function minToTime(m) { if (m == null) return '—'; var h = Math.floor(m / 60) % 24; return String(h).padStart(2,'0') + ':' + String(Math.round(m % 60)).padStart(2,'0'); }
  function dayLabel(d) { return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(d + 'T00:00:00').getDay()]; }
  function shortDate(d) { var p = d.split('-'); return parseInt(p[2]) + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(p[1])-1]; }
  function scoreColor(s) { return s >= 70 ? C.good : s >= 40 ? C.warn : C.bad; }
  function trendArrow(curr, prev) { if (!prev || !curr) return ''; var d = curr - prev; return d > 0 ? '<span style="color:'+C.good+'">▲</span>' : d < 0 ? '<span style="color:'+C.bad+'">▼</span>' : '<span style="color:'+C.warn+'">━</span>'; }

  // ── Canvas chart helpers ──
  function getCtx(id, w, h) {
    var el = document.getElementById(id);
    if (!el) return null;
    el.width = w || el.parentElement.offsetWidth || 600;
    el.height = h || 200;
    var ctx = el.getContext('2d');
    ctx.clearRect(0, 0, el.width, el.height);
    return ctx;
  }

  function drawLine(ctx, points, color, w, h, minV, maxV, filled) {
    if (points.length < 2) return;
    var pad = { t: 10, b: 25, l: 5, r: 5 };
    var cw = w - pad.l - pad.r;
    var ch = h - pad.t - pad.b;
    var range = maxV - minV || 1;

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';

    for (var i = 0; i < points.length; i++) {
      var x = pad.l + (i / (points.length - 1)) * cw;
      var y = pad.t + ch - ((points[i] - minV) / range) * ch;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    if (filled) {
      ctx.lineTo(pad.l + cw, pad.t + ch);
      ctx.lineTo(pad.l, pad.t + ch);
      ctx.closePath();
      ctx.fillStyle = color.replace(')', ',0.1)').replace('rgb', 'rgba');
      ctx.fill();
    }
  }

  function drawBars(ctx, values, color, w, h, maxV, labels) {
    var pad = { t: 10, b: 28, l: 5, r: 5 };
    var cw = w - pad.l - pad.r;
    var ch = h - pad.t - pad.b;
    var bw = Math.max(2, (cw / values.length) - 2);
    var gap = (cw - bw * values.length) / (values.length + 1);

    for (var i = 0; i < values.length; i++) {
      var bh = maxV > 0 ? (values[i] / maxV) * ch : 0;
      var x = pad.l + gap + i * (bw + gap);
      var y = pad.t + ch - bh;

      ctx.fillStyle = typeof color === 'function' ? color(values[i], i) : color;
      ctx.beginPath();
      // roundRect polyfill for Safari < 16
      if (ctx.roundRect) { ctx.roundRect(x, y, bw, bh, [2, 2, 0, 0]); }
      else { ctx.moveTo(x+2,y); ctx.lineTo(x+bw-2,y); ctx.quadraticCurveTo(x+bw,y,x+bw,y+2); ctx.lineTo(x+bw,y+bh); ctx.lineTo(x,y+bh); ctx.lineTo(x,y+2); ctx.quadraticCurveTo(x,y,x+2,y); }
      ctx.fill();

      // Label below
      if (labels && labels[i] && values.length <= 31) {
        ctx.fillStyle = C.text;
        ctx.font = '9px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(labels[i], x + bw / 2, h - 4);
      }
    }
  }

  // Heatmap (GitHub-style)
  function drawHeatmap(containerId, data, colorFn, label) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var size = 14, gap = 2, cols = 52, rows = 7;
    var w = cols * (size + gap) + 40;
    var h = rows * (size + gap) + 30;

    var html = '<div style="position:relative;overflow-x:auto;-webkit-overflow-scrolling:touch">';
    html += '<svg width="'+w+'" height="'+h+'" style="display:block">';

    // Day labels
    var days = ['','Mon','','Wed','','Fri',''];
    for (var d = 0; d < 7; d++) {
      html += '<text x="0" y="'+(25 + d*(size+gap) + size/2)+'" fill="'+C.text+'" font-size="9" font-family="IBM Plex Mono" dominant-baseline="middle">'+days[d]+'</text>';
    }

    // Build date map
    var today = new Date();
    var startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (cols * 7 - 1));
    // Align to Sunday
    startDate.setDate(startDate.getDate() - startDate.getDay());

    var dateMap = {};
    for (var i = 0; i < data.length; i++) { dateMap[data[i].date] = data[i]; }

    var monthLabels = {};
    var cur = new Date(startDate);
    for (var c = 0; c < cols; c++) {
      for (var r = 0; r < rows; r++) {
        var ds = cur.toISOString().substring(0, 10);
        var val = dateMap[ds];
        var color = val ? colorFn(val) : 'rgba(255,255,255,0.04)';
        var x = 30 + c * (size + gap);
        var y = 20 + r * (size + gap);
        html += '<rect x="'+x+'" y="'+y+'" width="'+size+'" height="'+size+'" rx="2" fill="'+color+'" data-date="'+ds+'"><title>'+ds+(val ? ': '+label(val) : '')+'</title></rect>';

        // Month label
        if (cur.getDate() <= 7 && r === 0 && !monthLabels[cur.getMonth()]) {
          monthLabels[cur.getMonth()] = true;
          html += '<text x="'+x+'" y="14" fill="'+C.text+'" font-size="9" font-family="IBM Plex Mono">'+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][cur.getMonth()]+'</text>';
        }
        cur.setDate(cur.getDate() + 1);
      }
    }
    html += '</svg></div>';
    el.innerHTML = html;
  }

  // Sleep/wake scatter plot
  function drawSleepWakeChart(canvasId, data, w, h) {
    var ctx = getCtx(canvasId, w, h);
    if (!ctx) return;
    var pad = { t: 20, b: 30, l: 50, r: 10 };
    var cw = w - pad.l - pad.r;
    var ch = h - pad.t - pad.b;

    // Y-axis: time in minutes (20:00=1200 to 08:00=480, inverted for bedtime at top)
    // Bedtime range: 20:00 (1200) to 02:00 (1560/120)
    // Wake range: 03:00 (180) to 08:00 (480)
    var bedMin = 1200, bedMax = 1560; // 20:00 to 02:00 next day (as 26:00)
    var wakeMin = 180, wakeMax = 480; // 03:00 to 08:00

    // Grid lines
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 0.5;
    var gridTimes = [1200, 1260, 1320, 1380, 1440, 1500, 1560]; // 20:00 to 02:00
    for (var g = 0; g < gridTimes.length; g++) {
      var gy = pad.t + (1 - (gridTimes[g] - bedMin) / (bedMax - bedMin)) * (ch / 2);
      ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(w - pad.r, gy); ctx.stroke();
      ctx.fillStyle = C.text; ctx.font = '9px "IBM Plex Mono"'; ctx.textAlign = 'right';
      var label = minToTime(gridTimes[g] % 1440);
      ctx.fillText(label, pad.l - 4, gy + 3);
    }

    var wakeGridTimes = [180, 240, 300, 360, 420, 480];
    for (var g2 = 0; g2 < wakeGridTimes.length; g2++) {
      var gy2 = pad.t + ch / 2 + 10 + ((wakeGridTimes[g2] - wakeMin) / (wakeMax - wakeMin)) * (ch / 2 - 10);
      ctx.beginPath(); ctx.moveTo(pad.l, gy2); ctx.lineTo(w - pad.r, gy2); ctx.stroke();
      ctx.fillStyle = C.text; ctx.font = '9px "IBM Plex Mono"'; ctx.textAlign = 'right';
      ctx.fillText(minToTime(wakeGridTimes[g2]), pad.l - 4, gy2 + 3);
    }

    // Separator
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    var sepY = pad.t + ch / 2 + 5;
    ctx.beginPath(); ctx.moveTo(pad.l, sepY); ctx.lineTo(w - pad.r, sepY); ctx.stroke();
    ctx.setLineDash([]);

    // Labels
    ctx.fillStyle = C.bedtime; ctx.font = 'bold 10px "IBM Plex Mono"'; ctx.textAlign = 'left';
    ctx.fillText('BEDTIME', pad.l, pad.t - 5);
    ctx.fillStyle = C.wake;
    ctx.fillText('WAKE UP', pad.l + 80, pad.t - 5);

    // Plot points
    var filtered = data.filter(function(d) { return d.bedtime || d.wake_time; });
    if (!filtered.length) return;

    for (var i = 0; i < filtered.length; i++) {
      var d = filtered[i];
      var x = pad.l + (i / Math.max(1, filtered.length - 1)) * cw;

      // Bedtime dot
      if (d.bedtime) {
        var bedM = timeToMin(d.bedtime);
        if (bedM < 720) bedM += 1440; // after midnight → next day offset
        var by = pad.t + (1 - (bedM - bedMin) / (bedMax - bedMin)) * (ch / 2);
        ctx.beginPath(); ctx.arc(x, by, 4, 0, Math.PI * 2);
        ctx.fillStyle = C.bedtime; ctx.fill();
      }

      // Wake dot
      if (d.wake_time) {
        var wakeM = timeToMin(d.wake_time);
        var wy = pad.t + ch / 2 + 10 + ((wakeM - wakeMin) / (wakeMax - wakeMin)) * (ch / 2 - 10);
        ctx.beginPath(); ctx.arc(x, wy, 4, 0, Math.PI * 2);
        ctx.fillStyle = C.wake; ctx.fill();
      }

      // Date label (sparse)
      if (i % Math.max(1, Math.floor(filtered.length / 8)) === 0) {
        ctx.fillStyle = C.text; ctx.font = '8px "IBM Plex Mono"'; ctx.textAlign = 'center';
        ctx.fillText(shortDate(d.date), x, h - 5);
      }
    }
  }

  // Weekly pattern chart (day of week averages)
  function drawWeeklyPattern(containerId, data, field, unit, color) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var dayBuckets = [[], [], [], [], [], [], []]; // Sun-Sat
    for (var i = 0; i < data.length; i++) {
      var val = data[i][field];
      if (val != null) {
        var dow = new Date(data[i].date + 'T00:00:00').getDay();
        dayBuckets[dow].push(val);
      }
    }
    var dayNames = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
    var html = '<div style="display:flex;gap:8px;align-items:flex-end;height:100px">';
    var maxAvg = 0;
    var avgs = dayBuckets.map(function(b) { var a = b.length ? avg(b) : 0; if (a > maxAvg) maxAvg = a; return a; });

    for (var d = 0; d < 7; d++) {
      var h2 = maxAvg > 0 ? Math.round((avgs[d] / maxAvg) * 80) : 0;
      html += '<div style="flex:1;text-align:center">';
      html += '<div style="font-family:\'IBM Plex Mono\';font-size:10px;color:'+C.textBright+';margin-bottom:4px">'+fmt(avgs[d], 1)+'</div>';
      html += '<div style="height:'+h2+'px;background:'+color+';border-radius:4px 4px 0 0;min-height:2px;opacity:'+(avgs[d] > 0 ? 1 : 0.2)+'"></div>';
      html += '<div style="font-family:\'IBM Plex Mono\';font-size:9px;color:'+C.text+';margin-top:4px">'+dayNames[d]+'</div>';
      html += '</div>';
    }
    html += '</div>';
    el.innerHTML = html;
  }

  // Monthly summary table
  function drawMonthlySummary(containerId, data) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var months = {};
    for (var i = 0; i < data.length; i++) {
      var mk = data[i].date.substring(0, 7);
      if (!months[mk]) months[mk] = { sleep: [], rhr: [], hrv: [], steps: [], vo2: [], score: [], wake: [], bed: [], exercise: [] };
      var d = data[i];
      if (d.sleep_hours) months[mk].sleep.push(d.sleep_hours);
      if (d.resting_hr) months[mk].rhr.push(d.resting_hr);
      if (d.hrv_avg) months[mk].hrv.push(d.hrv_avg);
      if (d.steps) months[mk].steps.push(d.steps);
      if (d.vo2_max) months[mk].vo2.push(d.vo2_max);
      if (d.sleep_score) months[mk].score.push(d.sleep_score);
      if (d.wake_time) months[mk].wake.push(timeToMin(d.wake_time));
      if (d.bedtime) months[mk].bed.push(timeToMin(d.bedtime));
      if (d.exercise_minutes) months[mk].exercise.push(d.exercise_minutes);
    }

    var keys = Object.keys(months).sort().reverse();
    var html = '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch"><table style="width:100%;border-collapse:collapse;font-family:\'IBM Plex Mono\';font-size:11px">';
    html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.1)">';
    html += '<th style="text-align:left;padding:8px 6px;color:'+C.text+'">MONTH</th>';
    html += '<th style="text-align:center;padding:8px 4px;color:'+C.sleep+'">SLEEP</th>';
    html += '<th style="text-align:center;padding:8px 4px;color:'+C.score+'">SCORE</th>';
    html += '<th style="text-align:center;padding:8px 4px;color:'+C.wake+'">WAKE</th>';
    html += '<th style="text-align:center;padding:8px 4px;color:'+C.hr+'">RHR</th>';
    html += '<th style="text-align:center;padding:8px 4px;color:'+C.hrv+'">HRV</th>';
    html += '<th style="text-align:center;padding:8px 4px;color:'+C.steps+'">STEPS</th>';
    html += '<th style="text-align:center;padding:8px 4px;color:'+C.vo2+'">VO2</th>';
    html += '</tr>';

    for (var k = 0; k < keys.length; k++) {
      var m = months[keys[k]];
      var mLabel = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(keys[k].split('-')[1]) - 1] + ' ' + keys[k].split('-')[0];
      html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">';
      html += '<td style="padding:8px 6px;color:'+C.textBright+'">'+mLabel+'</td>';
      html += '<td style="text-align:center;padding:8px 4px;color:'+C.sleep+'">'+fmt(avg(m.sleep), 1)+'h</td>';
      html += '<td style="text-align:center;padding:8px 4px;color:'+scoreColor(avg(m.score))+'">'+fmt(avg(m.score), 0)+'</td>';
      html += '<td style="text-align:center;padding:8px 4px;color:'+C.wake+'">'+(m.wake.length ? minToTime(avg(m.wake)) : '—')+'</td>';
      html += '<td style="text-align:center;padding:8px 4px;color:'+C.hr+'">'+fmt(avg(m.rhr), 0)+'</td>';
      html += '<td style="text-align:center;padding:8px 4px;color:'+C.hrv+'">'+fmt(avg(m.hrv), 0)+'ms</td>';
      html += '<td style="text-align:center;padding:8px 4px;color:'+C.steps+'">'+fmt(avg(m.steps), 0)+'</td>';
      html += '<td style="text-align:center;padding:8px 4px;color:'+C.vo2+'">'+fmt(avg(m.vo2), 1)+'</td>';
      html += '</tr>';
    }
    html += '</table></div>';
    el.innerHTML = html;
  }

  // ── MAIN RENDER ──
  function renderHealthDashboard() {
    var data = _healthData;
    if (!data.length) {
      var container = document.getElementById('health-dashboard-content');
      if (container) container.innerHTML = '<div style="text-align:center;padding:40px;color:'+C.text+'">No health data yet. Configure Health Auto Export app to start syncing.</div>';
      return;
    }

    // Sort by date ascending
    data.sort(function(a, b) { return a.date < b.date ? -1 : 1; });

    // Filter by range
    var rangeData = data;
    if (_viewRange < 999) {
      var cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - _viewRange);
      var cutStr = cutoff.toISOString().substring(0, 10);
      rangeData = data.filter(function(d) { return d.date >= cutStr; });
    }

    var today = rangeData.length ? rangeData[rangeData.length - 1] : {};
    var yesterday = rangeData.length > 1 ? rangeData[rangeData.length - 2] : {};

    // 7-day averages
    var last7 = rangeData.slice(-7);
    var last30 = rangeData.slice(-30);
    var avgSleep7 = avg(last7.filter(function(d){return d.sleep_hours;}).map(function(d){return d.sleep_hours;}));
    var avgRHR7 = avg(last7.filter(function(d){return d.resting_hr;}).map(function(d){return d.resting_hr;}));
    var avgHRV7 = avg(last7.filter(function(d){return d.hrv_avg;}).map(function(d){return d.hrv_avg;}));
    var avgSteps7 = avg(last7.filter(function(d){return d.steps;}).map(function(d){return d.steps;}));
    var avgSleep30 = avg(last30.filter(function(d){return d.sleep_hours;}).map(function(d){return d.sleep_hours;}));
    var avgRHR30 = avg(last30.filter(function(d){return d.resting_hr;}).map(function(d){return d.resting_hr;}));
    var avgHRV30 = avg(last30.filter(function(d){return d.hrv_avg;}).map(function(d){return d.hrv_avg;}));

    // Compute recovery score (composite)
    function recoveryScore(d) {
      if (!d.hrv_avg && !d.resting_hr && !d.sleep_score) return null;
      var s = 0, w = 0;
      if (d.sleep_score) { s += d.sleep_score * 0.4; w += 0.4; }
      if (d.hrv_avg && avgHRV30) { s += Math.min(100, (d.hrv_avg / avgHRV30) * 50) * 0.35; w += 0.35; }
      if (d.resting_hr && avgRHR30) { s += Math.min(100, (avgRHR30 / d.resting_hr) * 50) * 0.25; w += 0.25; }
      return w > 0 ? Math.round(s / w) : null;
    }

    var todayRecovery = recoveryScore(today);

    // Sleep debt (14 days, target 7hrs using 5hr threshold per user pref)
    var last14 = rangeData.slice(-14);
    var sleepDebt = 0;
    for (var sd = 0; sd < last14.length; sd++) {
      if (last14[sd].sleep_hours) sleepDebt += (7 - last14[sd].sleep_hours);
    }

    // ── BUILD HTML ──
    var h = '';

    // === SECTION 1: TODAY'S VITALS ===
    h += '<div class="panel-section" style="margin-bottom:24px">';
    h += '<div class="panel-section-title">TODAY\'S VITALS</div>';

    // Recovery score big
    h += '<div style="display:flex;align-items:center;gap:24px;margin-bottom:20px;flex-wrap:wrap">';
    if (todayRecovery != null) {
      h += '<div style="text-align:center">';
      h += '<div style="width:90px;height:90px;border-radius:50%;border:4px solid '+scoreColor(todayRecovery)+';display:flex;align-items:center;justify-content:center;flex-direction:column">';
      h += '<div style="font-family:\'IBM Plex Mono\';font-size:28px;font-weight:700;color:'+scoreColor(todayRecovery)+'">'+todayRecovery+'</div>';
      h += '<div style="font-family:\'IBM Plex Mono\';font-size:8px;color:'+C.text+';letter-spacing:2px">RECOVERY</div>';
      h += '</div></div>';
    }
    // Key metrics cards
    var vitals = [
      { label: 'SLEEP', val: fmt(today.sleep_hours, 1) + 'h', sub: 'Score: ' + fmt(today.sleep_score, 0), color: C.sleep, trend: trendArrow(today.sleep_hours, yesterday.sleep_hours) },
      { label: 'RESTING HR', val: fmt(today.resting_hr, 0) + ' bpm', sub: '7d: ' + fmt(avgRHR7, 0), color: C.hr, trend: trendArrow(yesterday.resting_hr, today.resting_hr) },
      { label: 'HRV', val: fmt(today.hrv_avg, 0) + ' ms', sub: '7d: ' + fmt(avgHRV7, 0), color: C.hrv, trend: trendArrow(today.hrv_avg, yesterday.hrv_avg) },
      { label: 'VO2 MAX', val: fmt(today.vo2_max, 1), sub: '90d trend', color: C.vo2 },
      { label: 'STEPS', val: today.steps ? today.steps.toLocaleString() : '—', sub: '7d: ' + fmt(avgSteps7, 0), color: C.steps },
      { label: 'SLEEP DEBT', val: fmt(Math.abs(sleepDebt), 1) + 'h', sub: sleepDebt > 0 ? 'DEFICIT' : 'SURPLUS', color: sleepDebt > 2 ? C.bad : sleepDebt > 0 ? C.warn : C.good },
    ];
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px;flex:1">';
    for (var v = 0; v < vitals.length; v++) {
      var vi = vitals[v];
      h += '<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:12px;text-align:center">';
      h += '<div style="font-family:\'IBM Plex Mono\';font-size:9px;color:'+vi.color+';letter-spacing:2px;margin-bottom:6px">'+vi.label+'</div>';
      h += '<div style="font-family:\'IBM Plex Mono\';font-size:20px;font-weight:700;color:'+C.textBright+'">'+vi.val+' '+(vi.trend||'')+'</div>';
      h += '<div style="font-family:\'IBM Plex Mono\';font-size:9px;color:'+C.text+';margin-top:4px">'+vi.sub+'</div>';
      h += '</div>';
    }
    h += '</div></div></div>';

    // === SECTION 2: SLEEP & WAKE ANALYSIS (SPECIAL FOCUS) ===
    h += '<div class="panel-section" style="margin-bottom:24px">';
    h += '<div class="panel-section-title">SLEEP & WAKE ANALYSIS</div>';

    // Today's sleep breakdown
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:10px;margin-bottom:20px">';
    var sleepCards = [
      { label: 'BEDTIME', val: today.bedtime || '—', color: C.bedtime },
      { label: 'WAKE UP', val: today.wake_time || '—', color: C.wake },
      { label: 'DURATION', val: fmt(today.sleep_hours, 1) + 'h', color: C.sleep },
      { label: 'DEEP', val: fmt(today.sleep_deep_min, 0) + 'm', color: C.sleepDeep },
      { label: 'REM', val: fmt(today.sleep_rem_min, 0) + 'm', color: C.sleepRem },
      { label: 'CORE', val: fmt(today.sleep_core_min, 0) + 'm', color: C.sleepCore },
      { label: 'AWAKE', val: fmt(today.sleep_awake_min, 0) + 'm', color: C.sleepAwake },
      { label: 'SCORE', val: fmt(today.sleep_score, 0) + '/100', color: scoreColor(today.sleep_score || 0) },
    ];
    for (var sc = 0; sc < sleepCards.length; sc++) {
      h += '<div style="background:rgba(255,255,255,0.03);border-radius:8px;padding:10px;text-align:center">';
      h += '<div style="font-size:8px;color:'+sleepCards[sc].color+';letter-spacing:2px;font-family:\'IBM Plex Mono\'">'+sleepCards[sc].label+'</div>';
      h += '<div style="font-size:18px;font-weight:700;color:'+C.textBright+';font-family:\'IBM Plex Mono\';margin-top:4px">'+sleepCards[sc].val+'</div>';
      h += '</div>';
    }
    h += '</div>';

    // Bedtime vs Wake time scatter chart
    h += '<div style="margin-bottom:20px">';
    h += '<div style="font-family:\'IBM Plex Mono\';font-size:10px;color:'+C.text+';letter-spacing:2px;margin-bottom:8px">BEDTIME & WAKE PATTERN — LAST '+rangeData.length+' DAYS</div>';
    h += '<canvas id="health-sleep-wake-chart" style="width:100%;background:rgba(0,0,0,0.2);border-radius:8px"></canvas>';
    h += '</div>';

    // Sleep duration bars
    h += '<div style="margin-bottom:20px">';
    h += '<div style="font-family:\'IBM Plex Mono\';font-size:10px;color:'+C.text+';letter-spacing:2px;margin-bottom:8px">SLEEP DURATION — 7d AVG: <span style="color:'+C.sleep+'">'+fmt(avgSleep7, 1)+'h</span> · 30d: <span style="color:'+C.sleep+'">'+fmt(avgSleep30, 1)+'h</span></div>';
    h += '<canvas id="health-sleep-bars" style="width:100%;background:rgba(0,0,0,0.2);border-radius:8px"></canvas>';
    h += '</div>';

    // Weekly sleep pattern
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">';
    h += '<div>';
    h += '<div style="font-family:\'IBM Plex Mono\';font-size:10px;color:'+C.text+';letter-spacing:2px;margin-bottom:8px">SLEEP BY DAY OF WEEK</div>';
    h += '<div id="health-sleep-weekly"></div>';
    h += '</div>';
    h += '<div>';
    h += '<div style="font-family:\'IBM Plex Mono\';font-size:10px;color:'+C.text+';letter-spacing:2px;margin-bottom:8px">WAKE TIME BY DAY OF WEEK</div>';
    h += '<div id="health-wake-weekly"></div>';
    h += '</div>';
    h += '</div>';

    // Sleep stages breakdown (stacked for range)
    h += '<div style="margin-bottom:16px">';
    h += '<div style="font-family:\'IBM Plex Mono\';font-size:10px;color:'+C.text+';letter-spacing:2px;margin-bottom:8px">SLEEP STAGES AVG</div>';
    var avgDeep = avg(rangeData.filter(function(d){return d.sleep_deep_min;}).map(function(d){return d.sleep_deep_min;}));
    var avgRem = avg(rangeData.filter(function(d){return d.sleep_rem_min;}).map(function(d){return d.sleep_rem_min;}));
    var avgCore = avg(rangeData.filter(function(d){return d.sleep_core_min;}).map(function(d){return d.sleep_core_min;}));
    var avgAwake = avg(rangeData.filter(function(d){return d.sleep_awake_min;}).map(function(d){return d.sleep_awake_min;}));
    var totalStages = avgDeep + avgRem + avgCore + avgAwake || 1;
    h += '<div style="display:flex;height:24px;border-radius:6px;overflow:hidden;margin-bottom:8px">';
    h += '<div style="width:'+pct(avgDeep,totalStages)+'%;background:'+C.sleepDeep+'" title="Deep: '+fmt(avgDeep,0)+'m"></div>';
    h += '<div style="width:'+pct(avgCore,totalStages)+'%;background:'+C.sleepCore+'" title="Core: '+fmt(avgCore,0)+'m"></div>';
    h += '<div style="width:'+pct(avgRem,totalStages)+'%;background:'+C.sleepRem+'" title="REM: '+fmt(avgRem,0)+'m"></div>';
    h += '<div style="width:'+pct(avgAwake,totalStages)+'%;background:'+C.sleepAwake+'" title="Awake: '+fmt(avgAwake,0)+'m"></div>';
    h += '</div>';
    h += '<div style="display:flex;gap:16px;flex-wrap:wrap">';
    h += '<span style="font-size:10px;font-family:\'IBM Plex Mono\';color:'+C.sleepDeep+'">● Deep '+fmt(avgDeep,0)+'m ('+pct(avgDeep,totalStages)+'%)</span>';
    h += '<span style="font-size:10px;font-family:\'IBM Plex Mono\';color:'+C.sleepCore+'">● Core '+fmt(avgCore,0)+'m ('+pct(avgCore,totalStages)+'%)</span>';
    h += '<span style="font-size:10px;font-family:\'IBM Plex Mono\';color:'+C.sleepRem+'">● REM '+fmt(avgRem,0)+'m ('+pct(avgRem,totalStages)+'%)</span>';
    h += '<span style="font-size:10px;font-family:\'IBM Plex Mono\';color:'+C.sleepAwake+'">● Awake '+fmt(avgAwake,0)+'m ('+pct(avgAwake,totalStages)+'%)</span>';
    h += '</div></div>';

    h += '</div>'; // end sleep section

    // === SECTION 3: HEART & RECOVERY ===
    h += '<div class="panel-section" style="margin-bottom:24px">';
    h += '<div class="panel-section-title">HEART & RECOVERY</div>';

    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">';
    // Resting HR trend
    h += '<div>';
    h += '<div style="font-family:\'IBM Plex Mono\';font-size:10px;color:'+C.text+';letter-spacing:2px;margin-bottom:8px">RESTING HR TREND</div>';
    h += '<canvas id="health-rhr-chart" style="width:100%;background:rgba(0,0,0,0.2);border-radius:8px"></canvas>';
    h += '</div>';
    // HRV trend
    h += '<div>';
    h += '<div style="font-family:\'IBM Plex Mono\';font-size:10px;color:'+C.text+';letter-spacing:2px;margin-bottom:8px">HRV TREND (higher = better)</div>';
    h += '<canvas id="health-hrv-chart" style="width:100%;background:rgba(0,0,0,0.2);border-radius:8px"></canvas>';
    h += '</div>';
    h += '</div>';

    // VO2 Max
    h += '<div style="margin-bottom:16px">';
    h += '<div style="font-family:\'IBM Plex Mono\';font-size:10px;color:'+C.text+';letter-spacing:2px;margin-bottom:8px">VO2 MAX — LONGEVITY INDICATOR</div>';
    h += '<canvas id="health-vo2-chart" style="width:100%;background:rgba(0,0,0,0.2);border-radius:8px"></canvas>';
    h += '</div>';

    h += '</div>'; // end heart section

    // === SECTION 4: FITNESS & ACTIVITY ===
    h += '<div class="panel-section" style="margin-bottom:24px">';
    h += '<div class="panel-section-title">FITNESS & ACTIVITY</div>';

    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">';
    // Steps
    h += '<div>';
    h += '<div style="font-family:\'IBM Plex Mono\';font-size:10px;color:'+C.text+';letter-spacing:2px;margin-bottom:8px">DAILY STEPS</div>';
    h += '<canvas id="health-steps-chart" style="width:100%;background:rgba(0,0,0,0.2);border-radius:8px"></canvas>';
    h += '</div>';
    // Calories
    h += '<div>';
    h += '<div style="font-family:\'IBM Plex Mono\';font-size:10px;color:'+C.text+';letter-spacing:2px;margin-bottom:8px">ACTIVE CALORIES</div>';
    h += '<canvas id="health-cal-chart" style="width:100%;background:rgba(0,0,0,0.2);border-radius:8px"></canvas>';
    h += '</div>';
    h += '</div>';

    // Weekly patterns
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">';
    h += '<div>';
    h += '<div style="font-family:\'IBM Plex Mono\';font-size:10px;color:'+C.text+';letter-spacing:2px;margin-bottom:8px">STEPS BY DAY OF WEEK</div>';
    h += '<div id="health-steps-weekly"></div>';
    h += '</div>';
    h += '<div>';
    h += '<div style="font-family:\'IBM Plex Mono\';font-size:10px;color:'+C.text+';letter-spacing:2px;margin-bottom:8px">CALORIES BY DAY OF WEEK</div>';
    h += '<div id="health-cal-weekly"></div>';
    h += '</div>';
    h += '</div>';

    h += '</div>'; // end fitness

    // === SECTION 5: YEAR HEATMAPS ===
    h += '<div class="panel-section" style="margin-bottom:24px">';
    h += '<div class="panel-section-title">YEAR VIEW — HEATMAPS</div>';

    h += '<div style="margin-bottom:16px">';
    h += '<div style="font-family:\'IBM Plex Mono\';font-size:10px;color:'+C.sleep+';letter-spacing:2px;margin-bottom:8px">SLEEP HOURS</div>';
    h += '<div id="health-heatmap-sleep"></div>';
    h += '</div>';

    h += '<div style="margin-bottom:16px">';
    h += '<div style="font-family:\'IBM Plex Mono\';font-size:10px;color:'+C.hrv+';letter-spacing:2px;margin-bottom:8px">HRV</div>';
    h += '<div id="health-heatmap-hrv"></div>';
    h += '</div>';

    h += '<div style="margin-bottom:16px">';
    h += '<div style="font-family:\'IBM Plex Mono\';font-size:10px;color:'+C.steps+';letter-spacing:2px;margin-bottom:8px">STEPS</div>';
    h += '<div id="health-heatmap-steps"></div>';
    h += '</div>';

    h += '</div>'; // end heatmaps

    // === SECTION 6: MONTHLY SUMMARY TABLE ===
    h += '<div class="panel-section" style="margin-bottom:24px">';
    h += '<div class="panel-section-title">MONTHLY SUMMARY</div>';
    h += '<div id="health-monthly-table"></div>';
    h += '</div>';

    // Inject HTML
    var container = document.getElementById('health-dashboard-content');
    if (container) container.innerHTML = h;

    // ── POST-RENDER: Draw canvases ──
    setTimeout(function() {
      var cw = (container ? container.offsetWidth : 600) - 40;

      // Sleep/wake scatter
      drawSleepWakeChart('health-sleep-wake-chart', rangeData, cw, 260);

      // Sleep bars
      (function() {
        var vals = rangeData.map(function(d) { return d.sleep_hours || 0; });
        var labels = rangeData.map(function(d) { return d.date.substring(8); });
        var ctx = getCtx('health-sleep-bars', cw, 160);
        if (ctx) {
          // 5hr and 7hr target lines
          var maxS = Math.max(10, Math.max.apply(null, vals));
          drawBars(ctx, vals, function(v) {
            return v >= 7 ? C.good : v >= 5 ? C.warn : C.bad;
          }, cw, 160, maxS, labels);
          // Target lines
          var pad = { t: 10, b: 28, l: 5, r: 5 };
          var ch = 160 - pad.t - pad.b;
          [5, 7].forEach(function(target) {
            var y = pad.t + ch - (target / maxS) * ch;
            ctx.strokeStyle = target === 7 ? 'rgba(0,230,118,0.3)' : 'rgba(245,166,35,0.3)';
            ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(cw - pad.r, y); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = C.text; ctx.font = '9px "IBM Plex Mono"'; ctx.textAlign = 'left';
            ctx.fillText(target + 'h', pad.l + 2, y - 4);
          });
        }
      })();

      // Weekly patterns
      drawWeeklyPattern('health-sleep-weekly', rangeData, 'sleep_hours', 'hrs', C.sleep);

      // Wake time by day of week
      (function() {
        var el = document.getElementById('health-wake-weekly');
        if (!el) return;
        var dayBuckets = [[], [], [], [], [], [], []];
        for (var i = 0; i < rangeData.length; i++) {
          if (rangeData[i].wake_time) {
            var dow = new Date(rangeData[i].date + 'T00:00:00').getDay();
            dayBuckets[dow].push(timeToMin(rangeData[i].wake_time));
          }
        }
        var dayNames = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
        var html2 = '<div style="display:flex;gap:8px;align-items:flex-end;height:100px">';
        for (var d = 0; d < 7; d++) {
          var a = dayBuckets[d].length ? avg(dayBuckets[d]) : 0;
          var barH = a > 0 ? Math.round(((a - 180) / 300) * 80) : 0; // 03:00=180 to 08:00=480
          html2 += '<div style="flex:1;text-align:center">';
          html2 += '<div style="font-family:\'IBM Plex Mono\';font-size:10px;color:'+C.textBright+';margin-bottom:4px">'+(a > 0 ? minToTime(a) : '—')+'</div>';
          html2 += '<div style="height:'+Math.max(2, barH)+'px;background:'+C.wake+';border-radius:4px 4px 0 0;opacity:'+(a > 0 ? 1 : 0.2)+'"></div>';
          html2 += '<div style="font-family:\'IBM Plex Mono\';font-size:9px;color:'+C.text+';margin-top:4px">'+dayNames[d]+'</div>';
          html2 += '</div>';
        }
        html2 += '</div>';
        el.innerHTML = html2;
      })();

      // RHR trend
      (function() {
        var pts = rangeData.filter(function(d){return d.resting_hr;}).map(function(d){return d.resting_hr;});
        if (pts.length > 1) {
          var ctx = getCtx('health-rhr-chart', cw / 2 - 8, 150);
          if (ctx) drawLine(ctx, pts, C.hr, cw / 2 - 8, 150, Math.min.apply(null, pts) - 5, Math.max.apply(null, pts) + 5, true);
        }
      })();

      // HRV trend
      (function() {
        var pts = rangeData.filter(function(d){return d.hrv_avg;}).map(function(d){return d.hrv_avg;});
        if (pts.length > 1) {
          var ctx = getCtx('health-hrv-chart', cw / 2 - 8, 150);
          if (ctx) drawLine(ctx, pts, C.hrv, cw / 2 - 8, 150, Math.min.apply(null, pts) - 5, Math.max.apply(null, pts) + 5, true);
        }
      })();

      // VO2 Max
      (function() {
        var pts = data.filter(function(d){return d.vo2_max;}).map(function(d){return d.vo2_max;});
        if (pts.length > 1) {
          var ctx = getCtx('health-vo2-chart', cw, 120);
          if (ctx) drawLine(ctx, pts, C.vo2, cw, 120, Math.min.apply(null, pts) - 1, Math.max.apply(null, pts) + 1, true);
        }
      })();

      // Steps bars
      (function() {
        var vals = rangeData.map(function(d){return d.steps || 0;});
        var labels = rangeData.map(function(d){return d.date.substring(8);});
        var ctx = getCtx('health-steps-chart', cw / 2 - 8, 150);
        if (ctx) drawBars(ctx, vals, C.steps, cw / 2 - 8, 150, Math.max(15000, Math.max.apply(null, vals)), labels);
      })();

      // Cal bars
      (function() {
        var vals = rangeData.map(function(d){return d.active_calories || 0;});
        var labels = rangeData.map(function(d){return d.date.substring(8);});
        var ctx = getCtx('health-cal-chart', cw / 2 - 8, 150);
        if (ctx) drawBars(ctx, vals, C.cal, cw / 2 - 8, 150, Math.max(1000, Math.max.apply(null, vals)), labels);
      })();

      // Weekly patterns
      drawWeeklyPattern('health-steps-weekly', rangeData, 'steps', 'steps', C.steps);
      drawWeeklyPattern('health-cal-weekly', rangeData, 'active_calories', 'kcal', C.cal);

      // Year heatmaps
      drawHeatmap('health-heatmap-sleep', data,
        function(d) {
          if (!d.sleep_hours) return 'rgba(255,255,255,0.04)';
          var h2 = d.sleep_hours;
          if (h2 >= 7) return 'rgba(112,174,255,0.9)';
          if (h2 >= 6) return 'rgba(112,174,255,0.6)';
          if (h2 >= 5) return 'rgba(245,166,35,0.7)';
          return 'rgba(255,82,82,0.7)';
        },
        function(d) { return d.sleep_hours ? fmt(d.sleep_hours, 1) + 'h' : 'no data'; }
      );

      drawHeatmap('health-heatmap-hrv', data,
        function(d) {
          if (!d.hrv_avg) return 'rgba(255,255,255,0.04)';
          var ratio = avgHRV30 > 0 ? d.hrv_avg / avgHRV30 : 1;
          if (ratio >= 1.1) return 'rgba(0,230,118,0.9)';
          if (ratio >= 0.9) return 'rgba(0,230,118,0.5)';
          if (ratio >= 0.8) return 'rgba(245,166,35,0.7)';
          return 'rgba(255,82,82,0.7)';
        },
        function(d) { return d.hrv_avg ? fmt(d.hrv_avg, 0) + 'ms' : 'no data'; }
      );

      drawHeatmap('health-heatmap-steps', data,
        function(d) {
          if (!d.steps) return 'rgba(255,255,255,0.04)';
          if (d.steps >= 10000) return 'rgba(0,212,255,0.9)';
          if (d.steps >= 7000) return 'rgba(0,212,255,0.6)';
          if (d.steps >= 4000) return 'rgba(0,212,255,0.35)';
          return 'rgba(0,212,255,0.15)';
        },
        function(d) { return d.steps ? d.steps.toLocaleString() + ' steps' : 'no data'; }
      );

      // Monthly table
      drawMonthlySummary('health-monthly-table', data);

    }, 100);
  }

  // ── DATA LOADING ──
  function loadHealthData() {
    if (typeof sbFetch !== 'function') return;
    sbFetch('health_daily', 'GET', null, '?order=date.asc&limit=1000').then(function(data) {
      if (data && data.length) {
        _healthData = data;
        _loaded = true;
        renderHealthDashboard();
      } else {
        _healthData = [];
        renderHealthDashboard();
      }
    }).catch(function(e) {
      console.error('Health data load failed:', e);
    });
  }

  // ── EXPOSE GLOBALS ──
  window.loadHealthData = loadHealthData;

  window.healthSetRange = function(days) {
    _viewRange = days;
    document.querySelectorAll('.health-range-btn').forEach(function(b) {
      b.classList.toggle('active', parseInt(b.dataset.range) === days);
    });
    renderHealthDashboard();
  };

})();
