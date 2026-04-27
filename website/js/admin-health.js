/* ═══════════════════════════════════════════════════════
   FIRST LIGHT — Apple Health Analytics Dashboard V2
   Premium health tracking: Sleep, Heart, Fitness, Activity
   Gradient fills, glow effects, month-over-month analysis
   Data source: Health Auto Export → Supabase health_daily
   ═══════════════════════════════════════════════════════ */

(function() {
  'use strict';

  var _healthData = [];
  var _viewRange = 30;
  var _loaded = false;

  // ── Premium Color Palette ──
  var C = {
    sleep: '#70AEFF', sleepDeep: '#1a3a8a', sleepRem: '#5C8FD6', sleepCore: '#3A6BC5', sleepAwake: '#FF5252',
    hr: '#FF5252', hrv: '#00E676', vo2: '#F5A623', steps: '#00D4FF', cal: '#FC4C02',
    exercise: '#E040FB', spo2: '#26C6DA', wake: '#FFD54F', bedtime: '#7C4DFF',
    good: '#00E676', warn: '#F5A623', bad: '#FF5252',
    grid: 'rgba(255,255,255,0.05)', text: 'rgba(255,255,255,0.45)', textBright: 'rgba(255,255,255,0.9)',
    cardBg: 'rgba(255,255,255,0.03)', cardBorder: 'rgba(255,255,255,0.06)',
  };

  // ── Helpers ──
  function fmt(n, d) { return n != null ? parseFloat(n).toFixed(d || 0) : '—'; }
  function pct(v, max) { return Math.min(100, Math.round((v / max) * 100)); }
  function avg(arr) { if (!arr.length) return 0; return arr.reduce(function(s,v){return s+v;},0)/arr.length; }
  function median(arr) { if (!arr.length) return 0; var s = arr.slice().sort(function(a,b){return a-b;}); var m = Math.floor(s.length/2); return s.length%2 ? s[m] : (s[m-1]+s[m])/2; }
  function stddev(arr) { if (arr.length < 2) return 0; var m = avg(arr); return Math.sqrt(arr.reduce(function(s,v){return s+Math.pow(v-m,2);},0)/arr.length); }
  function timeToMin(t) { if (!t) return null; var p = t.split(':'); return parseInt(p[0]) * 60 + parseInt(p[1]); }
  function minToTime(m) { if (m == null) return '—'; var h = Math.floor(m / 60) % 24; return String(h).padStart(2,'0') + ':' + String(Math.round(m % 60)).padStart(2,'0'); }
  function shortDate(d) { var p = d.split('-'); return parseInt(p[2]) + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(p[1])-1]; }
  function monthName(m) { return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m]; }
  function scoreColor(s) { return s >= 70 ? C.good : s >= 40 ? C.warn : C.bad; }
  function trendIcon(curr, prev) { if (!prev || !curr) return ''; return curr > prev ? '<span style="color:'+C.good+'">&#9650;</span>' : curr < prev ? '<span style="color:'+C.bad+'">&#9660;</span>' : '<span style="color:'+C.warn+'">&#9472;</span>'; }
  function changePct(curr, prev) { if (!prev) return ''; var p = ((curr - prev) / prev * 100).toFixed(1); return (p > 0 ? '+' : '') + p + '%'; }

  // ── Canvas Helpers ──
  function getCtx(id, w, h) {
    var el = document.getElementById(id);
    if (!el) return null;
    el.width = w || el.parentElement.offsetWidth || 600;
    el.height = h || 200;
    var ctx = el.getContext('2d');
    ctx.clearRect(0, 0, el.width, el.height);
    return ctx;
  }

  // Gradient line chart with glow
  function drawGradientLine(ctx, points, color, w, h, minV, maxV, options) {
    if (points.length < 2) return;
    var opt = options || {};
    var pad = { t: 15, b: opt.labels ? 28 : 15, l: opt.yAxis ? 40 : 8, r: 8 };
    var cw = w - pad.l - pad.r;
    var ch = h - pad.t - pad.b;
    var range = maxV - minV || 1;

    function xPos(i) { return pad.l + (i / (points.length - 1)) * cw; }
    function yPos(v) { return pad.t + ch - ((v - minV) / range) * ch; }

    // Grid lines
    if (opt.gridLines) {
      ctx.strokeStyle = C.grid; ctx.lineWidth = 0.5;
      for (var g = 0; g <= 4; g++) {
        var gy = pad.t + (g / 4) * ch;
        ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(w - pad.r, gy); ctx.stroke();
        if (opt.yAxis) {
          ctx.fillStyle = C.text; ctx.font = '9px "IBM Plex Mono",monospace'; ctx.textAlign = 'right';
          ctx.fillText(fmt(maxV - (g / 4) * range, opt.decimals || 0), pad.l - 4, gy + 3);
        }
      }
    }

    // Glow effect
    ctx.shadowColor = color; ctx.shadowBlur = 8;

    // Line
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    for (var i = 0; i < points.length; i++) {
      if (i === 0) ctx.moveTo(xPos(i), yPos(points[i]));
      else ctx.lineTo(xPos(i), yPos(points[i]));
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Gradient fill
    ctx.lineTo(xPos(points.length - 1), pad.t + ch);
    ctx.lineTo(xPos(0), pad.t + ch);
    ctx.closePath();
    var grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ch);
    grad.addColorStop(0, color.replace(')', ',0.25)').replace('rgb', 'rgba').replace('#', ''));
    // Fallback for hex colors
    if (color.startsWith('#')) {
      var r2 = parseInt(color.slice(1,3),16), g2 = parseInt(color.slice(3,5),16), b2 = parseInt(color.slice(5,7),16);
      grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ch);
      grad.addColorStop(0, 'rgba('+r2+','+g2+','+b2+',0.25)');
      grad.addColorStop(1, 'rgba('+r2+','+g2+','+b2+',0.02)');
    }
    ctx.fillStyle = grad; ctx.fill();

    // End dot with glow
    var lastX = xPos(points.length - 1), lastY = yPos(points[points.length - 1]);
    ctx.shadowColor = color; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.shadowBlur = 0;

    // Average line (dashed)
    if (opt.showAvg) {
      var a = avg(points);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1; ctx.setLineDash([4,4]);
      ctx.beginPath(); ctx.moveTo(pad.l, yPos(a)); ctx.lineTo(w - pad.r, yPos(a)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.text; ctx.font = '8px "IBM Plex Mono"'; ctx.textAlign = 'right';
      ctx.fillText('avg ' + fmt(a, opt.decimals || 0), w - pad.r, yPos(a) - 4);
    }

    // Labels
    if (opt.labels && opt.labels.length) {
      ctx.fillStyle = C.text; ctx.font = '8px "IBM Plex Mono"'; ctx.textAlign = 'center';
      var step = Math.max(1, Math.floor(opt.labels.length / 8));
      for (var li = 0; li < opt.labels.length; li += step) {
        ctx.fillText(opt.labels[li], xPos(li), h - 4);
      }
    }
  }

  // Premium bar chart with gradient bars
  function drawGradientBars(ctx, values, color, w, h, maxV, options) {
    var opt = options || {};
    var pad = { t: 15, b: opt.labels ? 28 : 15, l: 8, r: 8 };
    var cw = w - pad.l - pad.r;
    var ch = h - pad.t - pad.b;
    var bw = Math.max(3, (cw / values.length) - 2);
    var gap = (cw - bw * values.length) / (values.length + 1);

    // Parse color for gradient
    var r2, g2, b2;
    if (color.startsWith('#')) { r2 = parseInt(color.slice(1,3),16); g2 = parseInt(color.slice(3,5),16); b2 = parseInt(color.slice(5,7),16); }
    else { r2 = 100; g2 = 180; b2 = 255; }

    for (var i = 0; i < values.length; i++) {
      var bh = maxV > 0 ? (values[i] / maxV) * ch : 0;
      var x = pad.l + gap + i * (bw + gap);
      var y = pad.t + ch - bh;

      // Gradient bar
      var barGrad = ctx.createLinearGradient(x, y, x, pad.t + ch);
      var barColor = typeof opt.colorFn === 'function' ? opt.colorFn(values[i]) : color;
      if (barColor.startsWith('#')) { r2 = parseInt(barColor.slice(1,3),16); g2 = parseInt(barColor.slice(3,5),16); b2 = parseInt(barColor.slice(5,7),16); }
      barGrad.addColorStop(0, 'rgba('+r2+','+g2+','+b2+',0.9)');
      barGrad.addColorStop(1, 'rgba('+r2+','+g2+','+b2+',0.3)');

      ctx.fillStyle = barGrad;
      ctx.beginPath();
      if (ctx.roundRect) { ctx.roundRect(x, y, bw, bh, [3, 3, 0, 0]); }
      else { ctx.moveTo(x+3,y); ctx.lineTo(x+bw-3,y); ctx.quadraticCurveTo(x+bw,y,x+bw,y+3); ctx.lineTo(x+bw,y+bh); ctx.lineTo(x,y+bh); ctx.lineTo(x,y+3); ctx.quadraticCurveTo(x,y,x+3,y); }
      ctx.fill();

      // Labels
      if (opt.labels && opt.labels[i] && values.length <= 35) {
        ctx.fillStyle = C.text; ctx.font = '8px "IBM Plex Mono"'; ctx.textAlign = 'center';
        if (i % Math.max(1, Math.floor(values.length / 10)) === 0) ctx.fillText(opt.labels[i], x + bw / 2, h - 4);
      }
    }

    // Target lines
    if (opt.targets) {
      for (var ti = 0; ti < opt.targets.length; ti++) {
        var tgt = opt.targets[ti];
        var ty = pad.t + ch - (tgt.value / maxV) * ch;
        ctx.strokeStyle = tgt.color || 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1; ctx.setLineDash([4,4]);
        ctx.beginPath(); ctx.moveTo(pad.l, ty); ctx.lineTo(w - pad.r, ty); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = tgt.color || C.text; ctx.font = '8px "IBM Plex Mono"'; ctx.textAlign = 'left';
        ctx.fillText(tgt.label, pad.l + 2, ty - 4);
      }
    }
  }

  // GitHub-style heatmap
  function drawHeatmap(containerId, data, colorFn, labelFn) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var size = 13, gap = 2, cols = 52, rows = 7;
    var w = cols * (size + gap) + 40;
    var h = rows * (size + gap) + 30;
    var html = '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch"><svg width="'+w+'" height="'+h+'">';
    var days = ['','M','','W','','F',''];
    for (var d = 0; d < 7; d++) {
      html += '<text x="0" y="'+(25 + d*(size+gap) + size/2)+'" fill="'+C.text+'" font-size="9" font-family="IBM Plex Mono" dominant-baseline="middle">'+days[d]+'</text>';
    }
    var today = new Date(); var startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (cols * 7 - 1));
    startDate.setDate(startDate.getDate() - startDate.getDay());
    var dateMap = {};
    for (var i = 0; i < data.length; i++) dateMap[data[i].date] = data[i];
    var monthLabels = {};
    var cur = new Date(startDate);
    for (var c = 0; c < cols; c++) {
      for (var r = 0; r < rows; r++) {
        var ds = cur.toISOString().substring(0, 10);
        var val = dateMap[ds];
        var clr = val ? colorFn(val) : 'rgba(255,255,255,0.03)';
        var x = 30 + c * (size + gap); var y = 20 + r * (size + gap);
        html += '<rect x="'+x+'" y="'+y+'" width="'+size+'" height="'+size+'" rx="2" fill="'+clr+'"><title>'+ds+(val ? ': '+labelFn(val) : '')+'</title></rect>';
        if (cur.getDate() <= 7 && r === 0 && !monthLabels[cur.getMonth()]) {
          monthLabels[cur.getMonth()] = true;
          html += '<text x="'+x+'" y="14" fill="'+C.text+'" font-size="9" font-family="IBM Plex Mono">'+monthName(cur.getMonth())+'</text>';
        }
        cur.setDate(cur.getDate() + 1);
      }
    }
    html += '</svg></div>';
    el.innerHTML = html;
  }

  // Donut chart for sleep stages
  function drawDonut(containerId, segments, centerText, centerSub) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var size = 120;
    var html = '<svg width="'+size+'" height="'+size+'" viewBox="0 0 120 120">';
    var total = segments.reduce(function(s,seg){return s+seg.value;},0) || 1;
    var start = -90;
    for (var i = 0; i < segments.length; i++) {
      var pctVal = segments[i].value / total;
      var angle = pctVal * 360;
      var end = start + angle;
      var large = angle > 180 ? 1 : 0;
      var r = 50, cx = 60, cy = 60;
      var x1 = cx + r * Math.cos(start * Math.PI / 180);
      var y1 = cy + r * Math.sin(start * Math.PI / 180);
      var x2 = cx + r * Math.cos(end * Math.PI / 180);
      var y2 = cy + r * Math.sin(end * Math.PI / 180);
      html += '<path d="M '+cx+' '+cy+' L '+x1+' '+y1+' A '+r+' '+r+' 0 '+large+' 1 '+x2+' '+y2+' Z" fill="'+segments[i].color+'" opacity="0.85"><title>'+segments[i].label+': '+fmt(segments[i].value,0)+'m ('+fmt(pctVal*100,0)+'%)</title></path>';
      start = end;
    }
    // Inner circle (donut hole)
    html += '<circle cx="60" cy="60" r="32" fill="#0A0C10"/>';
    html += '<text x="60" y="56" text-anchor="middle" fill="'+C.textBright+'" font-size="16" font-weight="700" font-family="IBM Plex Mono">'+centerText+'</text>';
    html += '<text x="60" y="72" text-anchor="middle" fill="'+C.text+'" font-size="8" font-family="IBM Plex Mono">'+centerSub+'</text>';
    html += '</svg>';
    el.innerHTML = html;
  }

  // Weekly pattern (day-of-week)
  function buildWeeklyPattern(data, field, color, isTime) {
    var buckets = [[], [], [], [], [], [], []];
    for (var i = 0; i < data.length; i++) {
      var val = isTime ? timeToMin(data[i][field]) : data[i][field];
      if (val != null) buckets[new Date(data[i].date + 'T00:00:00').getDay()].push(val);
    }
    var names = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
    var avgs = buckets.map(function(b){return b.length ? avg(b) : 0;});
    var maxA = Math.max.apply(null, avgs) || 1;
    var html = '<div style="display:flex;gap:6px;align-items:flex-end;height:100px">';
    for (var d = 0; d < 7; d++) {
      var barH = avgs[d] > 0 ? Math.round((avgs[d] / maxA) * 75) : 0;
      var valStr = isTime ? minToTime(avgs[d]) : fmt(avgs[d], 1);
      html += '<div style="flex:1;text-align:center">';
      html += '<div style="font:10px \'IBM Plex Mono\';color:'+C.textBright+';margin-bottom:3px">'+(avgs[d]>0?valStr:'—')+'</div>';
      html += '<div style="height:'+Math.max(2,barH)+'px;background:linear-gradient(180deg,'+color+','+color+'44);border-radius:3px 3px 0 0;opacity:'+(avgs[d]>0?1:0.15)+'"></div>';
      html += '<div style="font:9px \'IBM Plex Mono\';color:'+C.text+';margin-top:3px">'+names[d]+'</div>';
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  // Month-over-month comparison table
  function buildMonthComparison(data) {
    var months = {};
    for (var i = 0; i < data.length; i++) {
      var mk = data[i].date.substring(0, 7);
      if (!months[mk]) months[mk] = { sleep:[], rhr:[], hrv:[], steps:[], vo2:[], score:[], wake:[], bed:[], cal:[], exercise:[], deep:[], rem:[] };
      var d = data[i];
      if (d.sleep_hours) months[mk].sleep.push(d.sleep_hours);
      if (d.resting_hr) months[mk].rhr.push(d.resting_hr);
      if (d.hrv_avg) months[mk].hrv.push(d.hrv_avg);
      if (d.steps) months[mk].steps.push(d.steps);
      if (d.vo2_max) months[mk].vo2.push(d.vo2_max);
      if (d.sleep_score) months[mk].score.push(d.sleep_score);
      if (d.wake_time) months[mk].wake.push(timeToMin(d.wake_time));
      if (d.bedtime) { var bm = timeToMin(d.bedtime); if (bm < 720) bm += 1440; months[mk].bed.push(bm); }
      if (d.active_calories) months[mk].cal.push(d.active_calories);
      if (d.exercise_minutes) months[mk].exercise.push(d.exercise_minutes);
      if (d.sleep_deep_min) months[mk].deep.push(d.sleep_deep_min);
      if (d.sleep_rem_min) months[mk].rem.push(d.sleep_rem_min);
    }
    var keys = Object.keys(months).sort().reverse();
    if (keys.length === 0) return '<div style="color:'+C.text+';text-align:center;padding:20px">No monthly data yet</div>';

    var html = '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch"><table style="width:100%;border-collapse:collapse;font:11px \'IBM Plex Mono\',monospace">';
    html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.1)">';
    var headers = ['MONTH','SLEEP','SCORE','WAKE','BED','RHR','HRV','STEPS','VO2','CAL','DEEP','REM'];
    var colors = [C.text,C.sleep,C.good,C.wake,C.bedtime,C.hr,C.hrv,C.steps,C.vo2,C.cal,C.sleepDeep,C.sleepRem];
    for (var hi = 0; hi < headers.length; hi++) {
      html += '<th style="text-align:'+(hi===0?'left':'center')+';padding:8px 4px;color:'+colors[hi]+';font-size:9px;letter-spacing:1px">'+headers[hi]+'</th>';
    }
    html += '</tr>';

    for (var k = 0; k < keys.length; k++) {
      var m = months[keys[k]];
      var prevM = k < keys.length - 1 ? months[keys[k + 1]] : null;
      var label = monthName(parseInt(keys[k].split('-')[1]) - 1) + ' ' + keys[k].split('-')[0].slice(2);

      html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.03)">';
      html += '<td style="padding:8px 4px;color:'+C.textBright+';font-weight:700">'+label+'</td>';

      // Sleep
      var slpAvg = avg(m.sleep);
      html += '<td style="text-align:center;padding:8px 3px;color:'+C.sleep+'">'+fmt(slpAvg,1)+'h '+(prevM?trendIcon(slpAvg,avg(prevM.sleep)):'')+'</td>';
      // Score
      var scAvg = avg(m.score);
      html += '<td style="text-align:center;padding:8px 3px;color:'+scoreColor(scAvg)+'">'+fmt(scAvg,0)+'</td>';
      // Wake
      html += '<td style="text-align:center;padding:8px 3px;color:'+C.wake+'">'+(m.wake.length?minToTime(avg(m.wake)):'—')+'</td>';
      // Bedtime
      html += '<td style="text-align:center;padding:8px 3px;color:'+C.bedtime+'">'+(m.bed.length?minToTime(avg(m.bed)%1440):'—')+'</td>';
      // RHR
      var rhrAvg = avg(m.rhr);
      html += '<td style="text-align:center;padding:8px 3px;color:'+C.hr+'">'+fmt(rhrAvg,0)+' '+(prevM?trendIcon(avg(prevM.rhr),rhrAvg):'')+'</td>';
      // HRV
      var hrvAvg = avg(m.hrv);
      html += '<td style="text-align:center;padding:8px 3px;color:'+C.hrv+'">'+fmt(hrvAvg,0)+'ms '+(prevM?trendIcon(hrvAvg,avg(prevM.hrv)):'')+'</td>';
      // Steps
      html += '<td style="text-align:center;padding:8px 3px;color:'+C.steps+'">'+fmt(avg(m.steps),0)+'</td>';
      // VO2
      html += '<td style="text-align:center;padding:8px 3px;color:'+C.vo2+'">'+fmt(avg(m.vo2),1)+'</td>';
      // Calories
      html += '<td style="text-align:center;padding:8px 3px;color:'+C.cal+'">'+fmt(avg(m.cal),0)+'</td>';
      // Deep
      html += '<td style="text-align:center;padding:8px 3px;color:'+C.sleepDeep+'">'+fmt(avg(m.deep),0)+'m</td>';
      // REM
      html += '<td style="text-align:center;padding:8px 3px;color:'+C.sleepRem+'">'+fmt(avg(m.rem),0)+'m</td>';
      html += '</tr>';
    }
    html += '</table></div>';
    return html;
  }

  // ── Correlation calculator ──
  function correlation(arr1, arr2) {
    if (arr1.length < 5 || arr1.length !== arr2.length) return null;
    var n = arr1.length, m1 = avg(arr1), m2 = avg(arr2);
    var num = 0, d1 = 0, d2 = 0;
    for (var i = 0; i < n; i++) {
      num += (arr1[i]-m1)*(arr2[i]-m2);
      d1 += (arr1[i]-m1)*(arr1[i]-m1);
      d2 += (arr2[i]-m2)*(arr2[i]-m2);
    }
    return d1 && d2 ? num / Math.sqrt(d1 * d2) : null;
  }

  // ══════════════════════════════════════════
  // MAIN RENDER
  // ══════════════════════════════════════════
  function renderHealthDashboard() {
    var data = _healthData;
    if (!data.length) {
      var c = document.getElementById('health-dashboard-content');
      if (c) c.innerHTML = '<div style="text-align:center;padding:60px 20px;color:'+C.text+'"><div style="font-size:40px;margin-bottom:16px">&#9829;</div><div style="font:13px \'IBM Plex Mono\'">No health data yet.<br>Configure Health Auto Export to start syncing.</div></div>';
      return;
    }

    data.sort(function(a, b) { return a.date < b.date ? -1 : 1; });

    // Filter by range
    var rangeData = data;
    if (_viewRange < 9999) {
      var cutoff = new Date(); cutoff.setDate(cutoff.getDate() - _viewRange);
      var cutStr = cutoff.toISOString().substring(0, 10);
      rangeData = data.filter(function(d) { return d.date >= cutStr; });
    }

    var today = rangeData.length ? rangeData[rangeData.length - 1] : {};
    var yesterday = rangeData.length > 1 ? rangeData[rangeData.length - 2] : {};
    var last7 = rangeData.slice(-7);
    var last30 = rangeData.slice(-30);

    var avgSleep7 = avg(last7.filter(function(d){return d.sleep_hours;}).map(function(d){return d.sleep_hours;}));
    var avgSleep30 = avg(last30.filter(function(d){return d.sleep_hours;}).map(function(d){return d.sleep_hours;}));
    var avgRHR7 = avg(last7.filter(function(d){return d.resting_hr;}).map(function(d){return d.resting_hr;}));
    var avgRHR30 = avg(last30.filter(function(d){return d.resting_hr;}).map(function(d){return d.resting_hr;}));
    var avgHRV7 = avg(last7.filter(function(d){return d.hrv_avg;}).map(function(d){return d.hrv_avg;}));
    var avgHRV30 = avg(last30.filter(function(d){return d.hrv_avg;}).map(function(d){return d.hrv_avg;}));
    var avgSteps7 = avg(last7.filter(function(d){return d.steps;}).map(function(d){return d.steps;}));

    // Recovery score
    function recoveryScore(d) {
      if (!d.hrv_avg && !d.resting_hr && !d.sleep_score) return null;
      var s = 0, w = 0;
      if (d.sleep_score) { s += d.sleep_score * 0.4; w += 0.4; }
      if (d.hrv_avg && avgHRV30) { s += Math.min(100, (d.hrv_avg / avgHRV30) * 50) * 0.35; w += 0.35; }
      if (d.resting_hr && avgRHR30) { s += Math.min(100, (avgRHR30 / d.resting_hr) * 50) * 0.25; w += 0.25; }
      return w > 0 ? Math.round(s / w) : null;
    }
    var todayRecovery = recoveryScore(today);

    // Sleep debt (14d, target 7h)
    var last14 = rangeData.slice(-14);
    var sleepDebt = 0;
    for (var sd = 0; sd < last14.length; sd++) { if (last14[sd].sleep_hours) sleepDebt += (7 - last14[sd].sleep_hours); }

    // Sleep consistency (stddev of bedtimes)
    var bedtimes = rangeData.filter(function(d){return d.bedtime;}).map(function(d){ var m=timeToMin(d.bedtime); return m<720?m+1440:m; });
    var sleepConsistency = bedtimes.length >= 3 ? Math.max(0, 100 - Math.round(stddev(bedtimes) * 2)) : null;

    // ── BUILD HTML ──
    var h = '';

    // ═══ SECTION 1: RECOVERY SCORE + KEY METRICS ═══
    h += '<div class="panel-section" style="margin-bottom:24px">';
    h += '<div class="panel-section-title">TODAY\'S VITALS — ' + (today.date || 'N/A') + '</div>';
    h += '<div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">';

    // Recovery ring
    if (todayRecovery != null) {
      var rc = scoreColor(todayRecovery);
      h += '<div style="text-align:center;flex-shrink:0">';
      h += '<svg width="100" height="100" viewBox="0 0 100 100">';
      h += '<circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="6"/>';
      h += '<circle cx="50" cy="50" r="42" fill="none" stroke="'+rc+'" stroke-width="6" stroke-dasharray="'+Math.round(todayRecovery*2.64)+' 264" transform="rotate(-90 50 50)" stroke-linecap="round" style="filter:drop-shadow(0 0 6px '+rc+')"/>';
      h += '<text x="50" y="46" text-anchor="middle" fill="'+rc+'" font-size="24" font-weight="700" font-family="IBM Plex Mono">'+todayRecovery+'</text>';
      h += '<text x="50" y="62" text-anchor="middle" fill="'+C.text+'" font-size="8" font-family="IBM Plex Mono" letter-spacing="2">RECOVERY</text>';
      h += '</svg></div>';
    }

    // Metric cards grid
    var vitals = [
      { l:'SLEEP', v:fmt(today.sleep_hours,1)+'h', s:'7d:'+fmt(avgSleep7,1)+' 30d:'+fmt(avgSleep30,1), c:C.sleep, t:trendIcon(today.sleep_hours,yesterday.sleep_hours) },
      { l:'RESTING HR', v:fmt(today.resting_hr,0)+' bpm', s:'7d:'+fmt(avgRHR7,0)+' 30d:'+fmt(avgRHR30,0), c:C.hr, t:trendIcon(yesterday.resting_hr,today.resting_hr) },
      { l:'HRV', v:fmt(today.hrv_avg,0)+' ms', s:'7d:'+fmt(avgHRV7,0)+' 30d:'+fmt(avgHRV30,0), c:C.hrv, t:trendIcon(today.hrv_avg,yesterday.hrv_avg) },
      { l:'VO2 MAX', v:fmt(today.vo2_max,1), s:'Longevity index', c:C.vo2 },
      { l:'STEPS', v:today.steps?today.steps.toLocaleString():'—', s:'7d avg:'+fmt(avgSteps7,0), c:C.steps },
      { l:'SLEEP DEBT', v:fmt(Math.abs(sleepDebt),1)+'h', s:sleepDebt>0?'14-DAY DEFICIT':'SURPLUS', c:sleepDebt>2?C.bad:sleepDebt>0?C.warn:C.good },
    ];
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px;flex:1">';
    for (var vi = 0; vi < vitals.length; vi++) {
      var v = vitals[vi];
      h += '<div style="background:'+C.cardBg+';border:1px solid '+C.cardBorder+';border-radius:10px;padding:12px 10px;text-align:center">';
      h += '<div style="font:700 8px \'IBM Plex Mono\';color:'+v.c+';letter-spacing:2px;margin-bottom:6px">'+v.l+'</div>';
      h += '<div style="font:700 18px \'IBM Plex Mono\';color:'+C.textBright+'">'+v.v+' '+(v.t||'')+'</div>';
      h += '<div style="font:9px \'IBM Plex Mono\';color:'+C.text+';margin-top:4px">'+v.s+'</div>';
      h += '</div>';
    }
    h += '</div></div></div>';

    // ═══ SECTION 2: SLEEP & WAKE ANALYSIS ═══
    h += '<div class="panel-section" style="margin-bottom:24px">';
    h += '<div class="panel-section-title">SLEEP & WAKE ANALYSIS</div>';

    // Today's sleep cards + donut
    h += '<div style="display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap;align-items:center">';
    // Donut
    var deepM = today.sleep_deep_min||0, remM = today.sleep_rem_min||0, coreM = today.sleep_core_min||0, awakeM = today.sleep_awake_min||0;
    h += '<div id="health-sleep-donut" style="flex-shrink:0"></div>';
    // Cards
    h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;flex:1">';
    var sc = [
      {l:'BEDTIME',v:today.bedtime||'—',c:C.bedtime}, {l:'WAKE UP',v:today.wake_time||'—',c:C.wake},
      {l:'DURATION',v:fmt(today.sleep_hours,1)+'h',c:C.sleep}, {l:'SCORE',v:fmt(today.sleep_score,0),c:scoreColor(today.sleep_score||0)},
      {l:'DEEP',v:fmt(deepM,0)+'m',c:C.sleepDeep}, {l:'REM',v:fmt(remM,0)+'m',c:C.sleepRem},
      {l:'CORE',v:fmt(coreM,0)+'m',c:C.sleepCore}, {l:'CONSISTENCY',v:sleepConsistency!=null?sleepConsistency+'%':'—',c:sleepConsistency>=70?C.good:sleepConsistency>=40?C.warn:C.bad},
    ];
    for (var si = 0; si < sc.length; si++) {
      h += '<div style="background:'+C.cardBg+';border-radius:8px;padding:8px;text-align:center">';
      h += '<div style="font:700 7px \'IBM Plex Mono\';color:'+sc[si].c+';letter-spacing:1.5px">'+sc[si].l+'</div>';
      h += '<div style="font:700 16px \'IBM Plex Mono\';color:'+C.textBright+';margin-top:3px">'+sc[si].v+'</div></div>';
    }
    h += '</div></div>';

    // Sleep duration chart
    h += '<div style="margin-bottom:20px">';
    h += '<div style="font:10px \'IBM Plex Mono\';color:'+C.text+';letter-spacing:2px;margin-bottom:8px">SLEEP DURATION — 7d: <span style="color:'+C.sleep+'">'+fmt(avgSleep7,1)+'h</span> &middot; 30d: <span style="color:'+C.sleep+'">'+fmt(avgSleep30,1)+'h</span></div>';
    h += '<canvas id="health-sleep-bars" style="width:100%;background:rgba(0,0,0,0.15);border-radius:10px"></canvas></div>';

    // Bedtime & Wake scatter
    h += '<div style="margin-bottom:20px">';
    h += '<div style="font:10px \'IBM Plex Mono\';color:'+C.text+';letter-spacing:2px;margin-bottom:8px"><span style="color:'+C.bedtime+'">&#9679; BEDTIME</span> &middot; <span style="color:'+C.wake+'">&#9679; WAKE UP</span></div>';
    h += '<canvas id="health-sleep-wake-chart" style="width:100%;background:rgba(0,0,0,0.15);border-radius:10px"></canvas></div>';

    // Weekly patterns
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">';
    h += '<div><div style="font:10px \'IBM Plex Mono\';color:'+C.text+';letter-spacing:2px;margin-bottom:8px">SLEEP BY DAY</div>'+buildWeeklyPattern(rangeData,'sleep_hours',C.sleep,false)+'</div>';
    h += '<div><div style="font:10px \'IBM Plex Mono\';color:'+C.text+';letter-spacing:2px;margin-bottom:8px">WAKE TIME BY DAY</div>'+buildWeeklyPattern(rangeData,'wake_time',C.wake,true)+'</div>';
    h += '</div></div>';

    // ═══ SECTION 3: HEART & RECOVERY ═══
    h += '<div class="panel-section" style="margin-bottom:24px">';
    h += '<div class="panel-section-title">HEART & RECOVERY</div>';
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">';
    h += '<div><div style="font:10px \'IBM Plex Mono\';color:'+C.hr+';letter-spacing:2px;margin-bottom:8px">RESTING HR</div><canvas id="health-rhr-chart" style="width:100%;background:rgba(0,0,0,0.15);border-radius:10px"></canvas></div>';
    h += '<div><div style="font:10px \'IBM Plex Mono\';color:'+C.hrv+';letter-spacing:2px;margin-bottom:8px">HRV (higher = better)</div><canvas id="health-hrv-chart" style="width:100%;background:rgba(0,0,0,0.15);border-radius:10px"></canvas></div>';
    h += '</div>';
    h += '<div style="margin-bottom:16px"><div style="font:10px \'IBM Plex Mono\';color:'+C.vo2+';letter-spacing:2px;margin-bottom:8px">VO2 MAX — LONGEVITY INDEX</div><canvas id="health-vo2-chart" style="width:100%;background:rgba(0,0,0,0.15);border-radius:10px"></canvas></div>';
    h += '</div>';

    // ═══ SECTION 4: ACTIVITY ═══
    h += '<div class="panel-section" style="margin-bottom:24px">';
    h += '<div class="panel-section-title">FITNESS & ACTIVITY</div>';
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">';
    h += '<div><div style="font:10px \'IBM Plex Mono\';color:'+C.steps+';letter-spacing:2px;margin-bottom:8px">DAILY STEPS</div><canvas id="health-steps-chart" style="width:100%;background:rgba(0,0,0,0.15);border-radius:10px"></canvas></div>';
    h += '<div><div style="font:10px \'IBM Plex Mono\';color:'+C.cal+';letter-spacing:2px;margin-bottom:8px">ACTIVE CALORIES</div><canvas id="health-cal-chart" style="width:100%;background:rgba(0,0,0,0.15);border-radius:10px"></canvas></div>';
    h += '</div>';
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">';
    h += '<div><div style="font:10px \'IBM Plex Mono\';color:'+C.text+';letter-spacing:2px;margin-bottom:8px">STEPS BY DAY</div>'+buildWeeklyPattern(rangeData,'steps',C.steps,false)+'</div>';
    h += '<div><div style="font:10px \'IBM Plex Mono\';color:'+C.text+';letter-spacing:2px;margin-bottom:8px">CALORIES BY DAY</div>'+buildWeeklyPattern(rangeData,'active_calories',C.cal,false)+'</div>';
    h += '</div></div>';

    // ═══ SECTION 5: CORRELATIONS & INSIGHTS ═══
    h += '<div class="panel-section" style="margin-bottom:24px">';
    h += '<div class="panel-section-title">INSIGHTS & CORRELATIONS</div>';
    h += '<div id="health-insights" style="display:grid;grid-template-columns:1fr 1fr;gap:12px"></div></div>';

    // ═══ SECTION 6: YEAR HEATMAPS ═══
    h += '<div class="panel-section" style="margin-bottom:24px">';
    h += '<div class="panel-section-title">YEAR VIEW</div>';
    h += '<div style="margin-bottom:16px"><div style="font:10px \'IBM Plex Mono\';color:'+C.sleep+';letter-spacing:2px;margin-bottom:8px">SLEEP HOURS</div><div id="health-hm-sleep"></div></div>';
    h += '<div style="margin-bottom:16px"><div style="font:10px \'IBM Plex Mono\';color:'+C.hrv+';letter-spacing:2px;margin-bottom:8px">HRV</div><div id="health-hm-hrv"></div></div>';
    h += '<div style="margin-bottom:16px"><div style="font:10px \'IBM Plex Mono\';color:'+C.steps+';letter-spacing:2px;margin-bottom:8px">STEPS</div><div id="health-hm-steps"></div></div>';
    h += '</div>';

    // ═══ SECTION 7: MONTH-OVER-MONTH ═══
    h += '<div class="panel-section" style="margin-bottom:24px">';
    h += '<div class="panel-section-title">MONTH-OVER-MONTH</div>';
    h += buildMonthComparison(data);
    h += '</div>';

    // Inject
    var container = document.getElementById('health-dashboard-content');
    if (container) container.innerHTML = h;

    // ── POST-RENDER: Draw canvases ──
    setTimeout(function() {
      var cw = (container ? container.offsetWidth : 600) - 40;
      var labels = rangeData.map(function(d){ return d.date.substring(8); });

      // Sleep donut
      drawDonut('health-sleep-donut',
        [{value:deepM,color:C.sleepDeep,label:'Deep'},{value:coreM,color:C.sleepCore,label:'Core'},{value:remM,color:C.sleepRem,label:'REM'},{value:awakeM,color:C.sleepAwake,label:'Awake'}],
        fmt(today.sleep_hours,1)+'h', 'SLEEP'
      );

      // Sleep bars
      (function(){
        var vals = rangeData.map(function(d){return d.sleep_hours||0;});
        var ctx = getCtx('health-sleep-bars', cw, 170);
        if (ctx) drawGradientBars(ctx, vals, C.sleep, cw, 170, Math.max(10, Math.max.apply(null,vals)), {
          labels: labels,
          colorFn: function(v){ return v>=7?C.good:v>=5?C.warn:C.bad; },
          targets: [{value:7,label:'7h',color:'rgba(0,230,118,0.3)'},{value:5,label:'5h',color:'rgba(245,166,35,0.3)'}]
        });
      })();

      // Sleep/wake scatter
      (function(){
        var ctx = getCtx('health-sleep-wake-chart', cw, 250);
        if (!ctx) return;
        var pad = {t:20,b:28,l:50,r:10}, cWidth = cw-pad.l-pad.r, cHeight = 250-pad.t-pad.b;
        var filtered = rangeData.filter(function(d){return d.bedtime||d.wake_time;});
        if (!filtered.length) return;
        // Grid
        ctx.strokeStyle = C.grid; ctx.lineWidth = 0.5;
        var gridTimes = [{m:1260,l:'21:00'},{m:1320,l:'22:00'},{m:1380,l:'23:00'},{m:1440,l:'00:00'},{m:1500,l:'01:00'}];
        for (var gt=0;gt<gridTimes.length;gt++){
          var gy=pad.t+(1-(gridTimes[gt].m-1200)/360)*(cHeight/2);
          ctx.beginPath();ctx.moveTo(pad.l,gy);ctx.lineTo(cw-pad.r,gy);ctx.stroke();
          ctx.fillStyle=C.text;ctx.font='9px "IBM Plex Mono"';ctx.textAlign='right';ctx.fillText(gridTimes[gt].l,pad.l-4,gy+3);
        }
        var wakeGrid=[{m:180,l:'03:00'},{m:240,l:'04:00'},{m:300,l:'05:00'},{m:360,l:'06:00'},{m:420,l:'07:00'}];
        for(var wg=0;wg<wakeGrid.length;wg++){
          var wy=pad.t+cHeight/2+10+((wakeGrid[wg].m-180)/300)*(cHeight/2-10);
          ctx.beginPath();ctx.moveTo(pad.l,wy);ctx.lineTo(cw-pad.r,wy);ctx.stroke();
          ctx.fillStyle=C.text;ctx.font='9px "IBM Plex Mono"';ctx.textAlign='right';ctx.fillText(wakeGrid[wg].l,pad.l-4,wy+3);
        }
        // Separator
        ctx.strokeStyle='rgba(255,255,255,0.12)';ctx.setLineDash([4,4]);
        ctx.beginPath();ctx.moveTo(pad.l,pad.t+cHeight/2+5);ctx.lineTo(cw-pad.r,pad.t+cHeight/2+5);ctx.stroke();ctx.setLineDash([]);
        // Points
        for(var fi=0;fi<filtered.length;fi++){
          var fd=filtered[fi], fx=pad.l+(fi/(Math.max(1,filtered.length-1)))*cWidth;
          if(fd.bedtime){var bm=timeToMin(fd.bedtime);if(bm<720)bm+=1440;var by=pad.t+(1-(bm-1200)/360)*(cHeight/2);
            ctx.shadowColor=C.bedtime;ctx.shadowBlur=6;ctx.beginPath();ctx.arc(fx,by,4,0,Math.PI*2);ctx.fillStyle=C.bedtime;ctx.fill();ctx.shadowBlur=0;}
          if(fd.wake_time){var wm=timeToMin(fd.wake_time);var wy2=pad.t+cHeight/2+10+((wm-180)/300)*(cHeight/2-10);
            ctx.shadowColor=C.wake;ctx.shadowBlur=6;ctx.beginPath();ctx.arc(fx,wy2,4,0,Math.PI*2);ctx.fillStyle=C.wake;ctx.fill();ctx.shadowBlur=0;}
          if(fi%Math.max(1,Math.floor(filtered.length/8))===0){ctx.fillStyle=C.text;ctx.font='8px "IBM Plex Mono"';ctx.textAlign='center';ctx.fillText(shortDate(fd.date),fx,250-4);}
        }
      })();

      // RHR
      (function(){
        var pts=rangeData.filter(function(d){return d.resting_hr;}).map(function(d){return d.resting_hr;});
        if(pts.length>1){var ctx=getCtx('health-rhr-chart',cw/2-8,160);if(ctx)drawGradientLine(ctx,pts,C.hr,cw/2-8,160,Math.min.apply(null,pts)-3,Math.max.apply(null,pts)+3,{gridLines:true,showAvg:true});}
      })();
      // HRV
      (function(){
        var pts=rangeData.filter(function(d){return d.hrv_avg;}).map(function(d){return d.hrv_avg;});
        if(pts.length>1){var ctx=getCtx('health-hrv-chart',cw/2-8,160);if(ctx)drawGradientLine(ctx,pts,C.hrv,cw/2-8,160,Math.min.apply(null,pts)-3,Math.max.apply(null,pts)+3,{gridLines:true,showAvg:true});}
      })();
      // VO2
      (function(){
        var pts=data.filter(function(d){return d.vo2_max;}).map(function(d){return d.vo2_max;});
        if(pts.length>1){var ctx=getCtx('health-vo2-chart',cw,130);if(ctx)drawGradientLine(ctx,pts,C.vo2,cw,130,Math.min.apply(null,pts)-1,Math.max.apply(null,pts)+1,{gridLines:true,showAvg:true,decimals:1});}
      })();
      // Steps
      (function(){
        var vals=rangeData.map(function(d){return d.steps||0;});
        var ctx=getCtx('health-steps-chart',cw/2-8,160);
        if(ctx)drawGradientBars(ctx,vals,C.steps,cw/2-8,160,Math.max(15000,Math.max.apply(null,vals)),{labels:labels,targets:[{value:10000,label:'10K',color:'rgba(0,212,255,0.3)'}]});
      })();
      // Calories
      (function(){
        var vals=rangeData.map(function(d){return d.active_calories||0;});
        var ctx=getCtx('health-cal-chart',cw/2-8,160);
        if(ctx)drawGradientBars(ctx,vals,C.cal,cw/2-8,160,Math.max(1000,Math.max.apply(null,vals)),{labels:labels});
      })();

      // Heatmaps
      drawHeatmap('health-hm-sleep',data,function(d){if(!d.sleep_hours)return'rgba(255,255,255,0.03)';return d.sleep_hours>=7?'rgba(112,174,255,0.85)':d.sleep_hours>=6?'rgba(112,174,255,0.5)':d.sleep_hours>=5?'rgba(245,166,35,0.6)':'rgba(255,82,82,0.6)';},function(d){return d.sleep_hours?fmt(d.sleep_hours,1)+'h':'—';});
      drawHeatmap('health-hm-hrv',data,function(d){if(!d.hrv_avg)return'rgba(255,255,255,0.03)';var r=avgHRV30>0?d.hrv_avg/avgHRV30:1;return r>=1.1?'rgba(0,230,118,0.85)':r>=0.9?'rgba(0,230,118,0.45)':r>=0.8?'rgba(245,166,35,0.6)':'rgba(255,82,82,0.6)';},function(d){return d.hrv_avg?fmt(d.hrv_avg,0)+'ms':'—';});
      drawHeatmap('health-hm-steps',data,function(d){if(!d.steps)return'rgba(255,255,255,0.03)';return d.steps>=10000?'rgba(0,212,255,0.85)':d.steps>=7000?'rgba(0,212,255,0.55)':d.steps>=4000?'rgba(0,212,255,0.3)':'rgba(0,212,255,0.12)';},function(d){return d.steps?d.steps.toLocaleString():'—';});

      // Insights & Correlations
      (function(){
        var el=document.getElementById('health-insights');if(!el)return;
        var paired=rangeData.filter(function(d){return d.sleep_hours&&d.hrv_avg;});
        var slpArr=paired.map(function(d){return d.sleep_hours;}), hrvArr=paired.map(function(d){return d.hrv_avg;});
        var slpHrv=correlation(slpArr,hrvArr);

        var paired2=rangeData.filter(function(d){return d.sleep_hours&&d.resting_hr;});
        var slpRhr=correlation(paired2.map(function(d){return d.sleep_hours;}),paired2.map(function(d){return d.resting_hr;}));

        var paired3=rangeData.filter(function(d){return d.steps&&d.sleep_hours;});
        var stpSlp=correlation(paired3.map(function(d){return d.steps;}),paired3.map(function(d){return d.sleep_hours;}));

        var insights=[];
        if(slpHrv!=null) insights.push({icon:'&#128150;',title:'Sleep &harr; HRV',value:'r = '+fmt(slpHrv,2),desc:slpHrv>0.3?'Strong: better sleep = higher HRV':slpHrv>0?'Weak positive correlation':'Negative — investigate',color:slpHrv>0.3?C.good:C.warn});
        if(slpRhr!=null) insights.push({icon:'&#10084;',title:'Sleep &harr; Resting HR',value:'r = '+fmt(slpRhr,2),desc:slpRhr<-0.2?'Good: more sleep = lower RHR':'Weak correlation',color:slpRhr<-0.2?C.good:C.warn});
        if(stpSlp!=null) insights.push({icon:'&#128694;',title:'Steps &harr; Sleep',value:'r = '+fmt(stpSlp,2),desc:stpSlp>0.2?'More active days = better sleep':'No strong link',color:stpSlp>0.2?C.good:C.text});

        // Sleep debt insight
        if(sleepDebt>3) insights.push({icon:'&#9888;',title:'Sleep Debt Alert',value:fmt(sleepDebt,1)+'h deficit',desc:'You owe your body sleep. Recovery is compromised.',color:C.bad});
        else if(sleepDebt<-2) insights.push({icon:'&#9989;',title:'Sleep Surplus',value:fmt(Math.abs(sleepDebt),1)+'h surplus',desc:'Well rested. Great recovery window.',color:C.good});

        // Bedtime consistency
        if(sleepConsistency!=null){
          insights.push({icon:'&#128337;',title:'Bedtime Consistency',value:sleepConsistency+'%',desc:sleepConsistency>=70?'Consistent schedule — circadian rhythm healthy':'Irregular bedtimes — affects sleep quality',color:sleepConsistency>=70?C.good:C.warn});
        }

        // VO2 trend
        var vo2All=data.filter(function(d){return d.vo2_max;}).map(function(d){return d.vo2_max;});
        if(vo2All.length>=10){
          var vo2First=avg(vo2All.slice(0,5)),vo2Last=avg(vo2All.slice(-5));
          insights.push({icon:'&#127942;',title:'VO2 Max Trend',value:fmt(vo2Last,1)+' ('+changePct(vo2Last,vo2First)+')',desc:vo2Last>vo2First?'Fitness improving — great trajectory':'Fitness declining — increase cardio',color:vo2Last>=vo2First?C.good:C.warn});
        }

        var ih='';
        for(var ii=0;ii<insights.length;ii++){
          var ins=insights[ii];
          ih+='<div style="background:'+C.cardBg+';border:1px solid '+C.cardBorder+';border-radius:10px;padding:14px">';
          ih+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="font-size:16px">'+ins.icon+'</span><span style="font:700 11px \'IBM Plex Mono\';color:'+C.textBright+'">'+ins.title+'</span></div>';
          ih+='<div style="font:700 18px \'IBM Plex Mono\';color:'+ins.color+';margin-bottom:4px">'+ins.value+'</div>';
          ih+='<div style="font:9px \'IBM Plex Mono\';color:'+C.text+'">'+ins.desc+'</div></div>';
        }
        el.innerHTML=ih;
      })();

    }, 100);
  }

  // ── DATA LOADING ──
  function loadHealthData() {
    if (typeof sbFetch !== 'function') return;
    sbFetch('health_daily', 'GET', null, '?order=date.asc&limit=1000').then(function(data) {
      _healthData = data && data.length ? data : [];
      _loaded = true;
      renderHealthDashboard();
    }).catch(function(e) { console.error('Health data load failed:', e); });
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
