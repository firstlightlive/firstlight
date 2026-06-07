// ═══════════════════════════════════════════════════════
// FIRST LIGHT — Weekly/Monthly Recap Generator
// Instagram 1080x1080 post + 1080x1920 story
// ═══════════════════════════════════════════════════════

(function() {
  'use strict';

  var SUPA = (window.FL && FL.SUPABASE_URL) || localStorage.getItem('fl_supabase_url') || '';
  var KEY = (window.FL && FL.SUPABASE_ANON_KEY) || localStorage.getItem('fl_supabase_key') || '';

  // ── Theme Definitions ──
  var THEMES = {
    noir: {
      name: 'NOIR',
      bg: '#000000',
      text: '#FFFFFF',
      dim: '#5A6B80',
      accent: '#FFFFFF',
      accent2: '#888888',
      bar: '#FFFFFF',
      barBg: 'rgba(255,255,255,0.08)',
      cardBg: 'rgba(255,255,255,0.04)',
      cardBorder: 'rgba(255,255,255,0.1)',
      grain: true,
      scanlines: false
    },
    heatmap: {
      name: 'HEAT MAP',
      bg: '#0A0C10',
      text: '#FFFFFF',
      dim: '#5A6B80',
      accent: '#FC4C02',
      accent2: '#F5A623',
      bar: '#FC4C02',
      barBg: 'rgba(252,76,2,0.1)',
      cardBg: 'rgba(252,76,2,0.05)',
      cardBorder: 'rgba(252,76,2,0.15)',
      grain: true,
      scanlines: false
    },
    terminal: {
      name: 'TERMINAL',
      bg: '#0A0F0A',
      text: '#00E676',
      dim: '#1B5E20',
      accent: '#00E676',
      accent2: '#4CAF50',
      bar: '#00E676',
      barBg: 'rgba(0,230,118,0.08)',
      cardBg: 'rgba(0,230,118,0.04)',
      cardBorder: 'rgba(0,230,118,0.12)',
      grain: false,
      scanlines: true
    },
    gradient: {
      name: 'GRADIENT',
      bg: '#0A0C1A',
      text: '#FFFFFF',
      dim: '#6B7DB8',
      accent: '#00D4FF',
      accent2: '#A855F7',
      bar: '#00D4FF',
      barBg: 'rgba(0,212,255,0.08)',
      cardBg: 'rgba(0,212,255,0.04)',
      cardBorder: 'rgba(0,212,255,0.12)',
      grain: true,
      scanlines: false
    },
    strava: {
      name: 'STRAVA',
      bg: '#000000',
      text: '#FFFFFF',
      dim: '#5A6B80',
      accent: '#FC4C02',
      accent2: '#FC4C02',
      bar: '#FC4C02',
      barBg: 'rgba(252,76,2,0.1)',
      cardBg: 'rgba(252,76,2,0.06)',
      cardBorder: 'rgba(252,76,2,0.2)',
      grain: true,
      scanlines: false
    }
  };

  var sportIcons = { Run: 'RUN', Ride: 'RIDE', Swim: 'SWIM', Walk: 'WALK', Workout: 'GYM', WeightTraining: 'GYM', VirtualRun: 'RUN', Yoga: 'YOGA' };
  var sportColors = { Run: '#FC4C02', Ride: '#00D4FF', Swim: '#6EE7B7', Walk: '#F5A623', Workout: '#C084FC', WeightTraining: '#C084FC', VirtualRun: '#FC4C02' };

  // ── Fetch Strava Data ──
  function fetchActivities(startDate, endDate, cb) {
    var url = SUPA + '/rest/v1/strava_activities?start_date_local=gte.' + startDate + '&start_date_local=lte.' + endDate + '&select=start_date_local,type,name,distance,moving_time&order=start_date_local.asc';
    fetch(url, { headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY } })
      .then(function(r) { return r.json(); })
      .then(function(data) { cb(null, data); })
      .catch(function(e) { cb(e, []); });
  }

  // ── Parse local date (strip timezone) ──
  function parseLocal(dateStr) {
    if (!dateStr) return new Date();
    return new Date(dateStr.replace(/[+-]\d{2}:\d{2}$/, ''));
  }

  // ── Get week boundaries (Mon-Sun) ──
  function getWeekRange(date) {
    var d = new Date(date);
    var day = d.getDay();
    var mondayOffset = day === 0 ? 6 : day - 1;
    var monday = new Date(d);
    monday.setDate(d.getDate() - mondayOffset);
    monday.setHours(0, 0, 0, 0);
    var sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { start: monday, end: sunday };
  }

  // ── Get month boundaries ──
  function getMonthRange(date) {
    var d = new Date(date);
    var start = new Date(d.getFullYear(), d.getMonth(), 1);
    var end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start: start, end: end };
  }

  // ── Process activities into stats ──
  function processWeekly(activities) {
    var days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    var dayData = {};
    for (var i = 0; i < 7; i++) dayData[i] = { types: [], km: 0, min: 0, activities: [] };

    var sportTotals = {};
    var totalKm = 0, totalMin = 0, totalSessions = 0;
    var longestKm = 0, longestName = '';

    activities.forEach(function(a) {
      var d = parseLocal(a.start_date_local);
      var dow = d.getDay();
      var idx = dow === 0 ? 6 : dow - 1;
      var km = (a.distance || 0) / 1000;
      var min = (a.moving_time || 0) / 60;

      dayData[idx].types.push(a.type);
      dayData[idx].km += km;
      dayData[idx].min += min;
      dayData[idx].activities.push({ type: a.type, km: km, min: min });

      if (!sportTotals[a.type]) sportTotals[a.type] = { km: 0, min: 0, count: 0 };
      sportTotals[a.type].km += km;
      sportTotals[a.type].min += min;
      sportTotals[a.type].count++;

      totalKm += km;
      totalMin += min;
      totalSessions++;

      if (km > longestKm) { longestKm = km; longestName = a.name || a.type; }
    });

    var completedDays = 0;
    for (var j = 0; j < 7; j++) { if (dayData[j].activities.length > 0) completedDays++; }

    return {
      days: days,
      dayData: dayData,
      sportTotals: sportTotals,
      totalKm: totalKm,
      totalMin: totalMin,
      totalSessions: totalSessions,
      completedDays: completedDays,
      longestKm: longestKm,
      longestName: longestName
    };
  }

  function processMonthly(activities) {
    var weeks = {};
    var sportTotals = {};
    var totalKm = 0, totalMin = 0, totalSessions = 0;
    var bestRun = 0, bestRide = 0;

    activities.forEach(function(a) {
      var d = parseLocal(a.start_date_local);
      var weekNum = Math.ceil(d.getDate() / 7);
      var wk = 'WK' + weekNum;
      if (!weeks[wk]) weeks[wk] = { km: 0, min: 0, count: 0 };
      var km = (a.distance || 0) / 1000;
      var min = (a.moving_time || 0) / 60;
      weeks[wk].km += km;
      weeks[wk].min += min;
      weeks[wk].count++;

      if (!sportTotals[a.type]) sportTotals[a.type] = { km: 0, min: 0, count: 0 };
      sportTotals[a.type].km += km;
      sportTotals[a.type].min += min;
      sportTotals[a.type].count++;

      totalKm += km;
      totalMin += min;
      totalSessions++;

      if (a.type === 'Run' && km > bestRun) bestRun = km;
      if (a.type === 'Ride' && km > bestRide) bestRide = km;
    });

    return { weeks: weeks, sportTotals: sportTotals, totalKm: totalKm, totalMin: totalMin, totalSessions: totalSessions, bestRun: bestRun, bestRide: bestRide };
  }

  // ── Format helpers ──
  function fmtDur(min) {
    if (min < 60) return Math.round(min) + 'm';
    var h = Math.floor(min / 60);
    var m = Math.round(min % 60);
    return h + 'h' + (m > 0 ? ' ' + m + 'm' : '');
  }

  function fmtDate(d) {
    var months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return months[d.getMonth()] + ' ' + d.getDate();
  }

  function getWeekNumber(d) {
    var start = new Date(d.getFullYear(), 0, 1);
    var diff = d - start + ((start.getTimezoneOffset() - d.getTimezoneOffset()) * 60000);
    return Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
  }

  function getDayNumber(forDate) {
    var startDate = new Date('2026-02-10T12:00:00');
    var d = forDate ? new Date(forDate) : new Date();
    d.setHours(12, 0, 0, 0);
    return Math.floor((d - startDate) / 86400000) + 1;
  }

  // ── Draw Film Grain ──
  function drawGrain(ctx, w, h) {
    var imageData = ctx.getImageData(0, 0, w, h);
    var pixels = imageData.data;
    for (var i = 0; i < pixels.length; i += 4) {
      var noise = (Math.random() - 0.5) * 18;
      pixels[i] += noise;
      pixels[i + 1] += noise;
      pixels[i + 2] += noise;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  // ── Draw Scanlines ──
  function drawScanlines(ctx, w, h) {
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    for (var y = 0; y < h; y += 4) {
      ctx.fillRect(0, y, w, 2);
    }
  }

  // ══════════════════════════════════════════
  // RENDER: WEEKLY POST (1080x1080)
  // ══════════════════════════════════════════
  function renderWeeklyPost(canvas, stats, weekRange, theme) {
    var T = THEMES[theme] || THEMES.noir;
    var W = 1080, H = 1080;
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, W, H);

    // Dramatic radial glow behind hero number
    var grad = ctx.createRadialGradient(W / 2, 260, 0, W / 2, 260, 400);
    grad.addColorStop(0, T.accent + '0C');
    grad.addColorStop(0.5, T.accent + '04');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // ── Header: Week + Day ──
    ctx.textAlign = 'center';
    ctx.font = '600 18px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.accent;
    ctx.fillText('W E E K  ' + getWeekNumber(weekRange.start), W / 2, 55);

    ctx.font = '400 12px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.dim;
    ctx.fillText(fmtDate(weekRange.start) + '  —  ' + fmtDate(weekRange.end), W / 2, 78);

    // ── HERO: Giant KM Number ──
    ctx.font = '200 140px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.text;
    ctx.fillText(Math.round(stats.totalKm), W / 2, 210);

    ctx.font = '300 18px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.dim;
    ctx.fillText('K I L O M E T E R S', W / 2, 240);

    // ── Circular Progress Ring ──
    var ringX = W / 2, ringY = 330, ringR = 42;
    var pct = Math.min(stats.totalKm / 150, 1);
    var targetHit = stats.totalKm >= 150;

    // Ring background
    ctx.beginPath();
    ctx.arc(ringX, ringY, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = T.barBg;
    ctx.lineWidth = 5;
    ctx.stroke();

    // Ring fill
    ctx.beginPath();
    ctx.arc(ringX, ringY, ringR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
    ctx.strokeStyle = targetHit ? '#00E676' : T.bar;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt';

    // Percentage inside ring
    ctx.font = '700 18px "IBM Plex Mono", monospace';
    ctx.fillStyle = targetHit ? '#00E676' : T.text;
    ctx.fillText(Math.round(stats.totalKm / 150 * 100) + '%', ringX, ringY + 6);

    // Target text beside ring
    ctx.font = '500 13px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.dim;
    ctx.textAlign = 'left';
    ctx.fillText(Math.round(stats.totalKm) + ' / 150 KM', ringX + 60, ringY - 10);

    if (targetHit) {
      ctx.font = '700 13px "IBM Plex Mono", monospace';
      ctx.fillStyle = '#00E676';
      ctx.fillText('TARGET HIT', ringX + 60, ringY + 12);
    } else {
      ctx.font = '400 11px "IBM Plex Mono", monospace';
      ctx.fillStyle = T.dim;
      ctx.fillText(Math.round(150 - stats.totalKm) + ' km remaining', ringX + 60, ringY + 12);
    }

    // Day number on left side of ring
    ctx.textAlign = 'right';
    ctx.font = '600 13px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.accent;
    ctx.fillText('DAY ' + getDayNumber(weekRange.end), ringX - 60, ringY - 10);

    ctx.font = '400 11px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.dim;
    ctx.fillText(stats.completedDays + '/7 ACTIVE', ringX - 60, ringY + 12);

    ctx.textAlign = 'center';

    // ── Thin divider ──
    ctx.strokeStyle = T.cardBorder;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(120, 395);
    ctx.lineTo(W - 120, 395);
    ctx.stroke();

    // ── Day-by-Day Grid ──
    var dayY = 420;
    var dayW = 128, dayH = 155, dayGap = 8;
    var gridW = 7 * dayW + 6 * dayGap;
    var gridX = (W - gridW) / 2;
    var days = stats.days;

    for (var i = 0; i < 7; i++) {
      var dx = gridX + i * (dayW + dayGap);
      var dd = stats.dayData[i];
      var hasDone = dd.activities.length > 0;

      // Card
      ctx.fillStyle = hasDone ? T.cardBg : 'rgba(255,255,255,0.01)';
      ctx.strokeStyle = hasDone ? T.cardBorder : 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(dx, dayY, dayW, dayH, 10);
      ctx.fill();
      ctx.stroke();

      // Day name
      ctx.font = '700 13px "IBM Plex Mono", monospace';
      ctx.fillStyle = hasDone ? T.text : T.dim;
      ctx.textAlign = 'center';
      ctx.fillText(days[i], dx + dayW / 2, dayY + 24);

      if (hasDone) {
        // Sport color bar at top
        var mainSport = dd.activities[0].type;
        var sColor = sportColors[mainSport] || T.accent;
        ctx.fillStyle = sColor;
        ctx.beginPath();
        ctx.roundRect(dx + 20, dayY + 34, dayW - 40, 3, 1.5);
        ctx.fill();

        // Sport label
        ctx.font = '600 9px "IBM Plex Mono", monospace';
        ctx.fillStyle = sColor;
        ctx.fillText(sportIcons[mainSport] || mainSport.toUpperCase(), dx + dayW / 2, dayY + 53);

        // Distance — BIG
        ctx.font = '700 28px "IBM Plex Mono", monospace';
        ctx.fillStyle = T.text;
        ctx.fillText(dd.km.toFixed(1), dx + dayW / 2, dayY + 88);

        ctx.font = '400 9px "IBM Plex Mono", monospace';
        ctx.fillStyle = T.dim;
        ctx.fillText('KM', dx + dayW / 2, dayY + 102);

        // Duration
        ctx.font = '500 11px "IBM Plex Mono", monospace';
        ctx.fillStyle = T.accent2;
        ctx.fillText(fmtDur(dd.min), dx + dayW / 2, dayY + 122);

        // Session count badge
        if (dd.activities.length > 1) {
          ctx.font = '600 8px "IBM Plex Mono", monospace';
          ctx.fillStyle = T.dim;
          ctx.fillText(dd.activities.length + ' sessions', dx + dayW / 2, dayY + 140);
        }
      } else {
        ctx.font = '300 11px "IBM Plex Mono", monospace';
        ctx.fillStyle = T.dim;
        ctx.fillText('—', dx + dayW / 2, dayY + 85);
      }
    }

    // ── Sport Breakdown (horizontal bars) ──
    var sportY = dayY + dayH + 30;
    var sports = Object.keys(stats.sportTotals);
    var maxSportKm = Math.max.apply(null, sports.map(function(s) { return stats.sportTotals[s].km; })) || 1;
    var barLeft = 220, barRight = W - 120, maxBarW = barRight - barLeft;

    // Swim equivalent note
    var hasSwim = stats.sportTotals['Swim'];
    var swimEquivKm = hasSwim ? hasSwim.km * 10 : 0;

    sports.forEach(function(sport, si) {
      var s = stats.sportTotals[sport];
      var label = sportIcons[sport] || sport.toUpperCase();
      var color = sportColors[sport] || T.accent;
      var displayKm = s.km;
      var suffix = '';
      if (sport === 'Swim') { suffix = '  (x10 = ' + (s.km * 10).toFixed(0) + ' km)'; }

      var sy = sportY + si * 36;

      // Label
      ctx.font = '700 11px "IBM Plex Mono", monospace';
      ctx.fillStyle = color;
      ctx.textAlign = 'right';
      ctx.fillText(label, barLeft - 16, sy + 14);

      // Bar bg
      ctx.fillStyle = T.barBg;
      ctx.beginPath();
      ctx.roundRect(barLeft, sy, maxBarW, 20, 4);
      ctx.fill();

      // Bar fill
      var bw = Math.max(4, (displayKm / maxSportKm) * maxBarW);
      ctx.fillStyle = color + 'CC';
      ctx.beginPath();
      ctx.roundRect(barLeft, sy, bw, 20, 4);
      ctx.fill();

      // Value on bar
      ctx.font = '600 10px "IBM Plex Mono", monospace';
      ctx.fillStyle = T.text;
      ctx.textAlign = 'left';
      ctx.fillText(displayKm.toFixed(1) + ' km' + suffix, barLeft + bw + 10, sy + 14);
    });

    // ── Summary Footer ──
    var footerY = H - 95;
    ctx.textAlign = 'center';

    // Stats row
    var statItems = [
      { val: stats.totalSessions, label: 'SESSIONS' },
      { val: fmtDur(stats.totalMin), label: 'DURATION' },
      { val: stats.completedDays + '/7', label: 'DAYS' }
    ];
    var statSpacing = 200;
    var statStartX = W / 2 - statSpacing;

    statItems.forEach(function(item, si) {
      var sx = statStartX + si * statSpacing;
      ctx.font = '700 20px "IBM Plex Mono", monospace';
      ctx.fillStyle = T.text;
      ctx.fillText(item.val, sx, footerY);
      ctx.font = '400 9px "IBM Plex Mono", monospace';
      ctx.fillStyle = T.dim;
      ctx.fillText(item.label, sx, footerY + 16);
    });

    // CTA
    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.dim;
    ctx.fillText('F I R S T L I G H T . L I V E', W / 2, H - 35);

    // ── Effects ──
    if (T.grain) drawGrain(ctx, W, H);
    if (T.scanlines) drawScanlines(ctx, W, H);
  }

  // ══════════════════════════════════════════
  // RENDER: WEEKLY STORY (1080x1920)
  // ══════════════════════════════════════════
  function renderWeeklyStory(canvas, stats, weekRange, theme) {
    var T = THEMES[theme] || THEMES.noir;
    var W = 1080, H = 1920;
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');

    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, W, H);

    // Dramatic glow
    var grad = ctx.createRadialGradient(W / 2, 350, 0, W / 2, 350, 500);
    grad.addColorStop(0, T.accent + '0A');
    grad.addColorStop(0.5, T.accent + '03');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';

    // ── Week label ──
    var y = 130;
    ctx.font = '600 18px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.accent;
    ctx.fillText('W E E K  ' + getWeekNumber(weekRange.start), W / 2, y);

    y += 26;
    ctx.font = '400 13px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.dim;
    ctx.fillText(fmtDate(weekRange.start) + '  —  ' + fmtDate(weekRange.end), W / 2, y);

    // ── DAY number ──
    y += 75;
    ctx.font = '300 24px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.dim;
    ctx.fillText('D A Y', W / 2, y);

    y += 90;
    ctx.font = '200 80px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.text;
    ctx.fillText(getDayNumber(weekRange.end), W / 2, y);

    // ── Divider line ──
    y += 55;
    ctx.strokeStyle = T.cardBorder;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(300, y);
    ctx.lineTo(W - 300, y);
    ctx.stroke();

    // ── HERO KM ──
    y += 120;
    ctx.font = '200 180px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.text;
    ctx.fillText(Math.round(stats.totalKm), W / 2, y);

    y += 40;
    ctx.font = '300 20px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.dim;
    ctx.fillText('K I L O M E T E R S', W / 2, y);

    // ── Progress ring + target ──
    y += 80;
    var ringR = 55;
    var pctRaw = stats.totalKm / 150;
    var pctClamped = Math.min(pctRaw, 1);
    var targetHit = stats.totalKm >= 150;
    var pctDisplay = Math.round(pctRaw * 100);

    // Ring bg
    ctx.beginPath();
    ctx.arc(W / 2, y, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = T.barBg;
    ctx.lineWidth = 7;
    ctx.stroke();

    // Ring fill (full circle if target hit)
    ctx.beginPath();
    ctx.arc(W / 2, y, ringR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pctClamped);
    ctx.strokeStyle = targetHit ? '#00E676' : T.bar;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt';

    // Percentage inside ring
    ctx.font = '700 24px "IBM Plex Mono", monospace';
    ctx.fillStyle = targetHit ? '#00E676' : T.text;
    ctx.fillText(pctDisplay + '%', W / 2, y + 8);

    // Target text below ring
    y += ringR + 30;
    if (targetHit) {
      ctx.font = '700 18px "IBM Plex Mono", monospace';
      ctx.fillStyle = '#00E676';
      ctx.fillText('TARGET HIT', W / 2, y);
      y += 25;
      ctx.font = '400 14px "IBM Plex Mono", monospace';
      ctx.fillStyle = T.dim;
      ctx.fillText(Math.round(stats.totalKm) + ' / 150 KM', W / 2, y);
    } else {
      ctx.font = '400 14px "IBM Plex Mono", monospace';
      ctx.fillStyle = T.dim;
      ctx.fillText(Math.round(stats.totalKm) + ' / 150 KM  ·  ' + Math.round(150 - stats.totalKm) + ' km to go', W / 2, y);
    }

    // ── Divider ──
    y += 35;
    ctx.strokeStyle = T.cardBorder;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(160, y);
    ctx.lineTo(W - 160, y);
    ctx.stroke();

    // ── Day Cards (all 7 in a row) ──
    y += 30;
    var dayW = 130, dayH = 130, dayGap = 10;
    var gridW = 7 * dayW + 6 * dayGap;
    var gridX = (W - gridW) / 2;
    var days = stats.days;

    for (var i = 0; i < 7; i++) {
      var dx = gridX + i * (dayW + dayGap);
      var dd = stats.dayData[i];
      var hasDone = dd.activities.length > 0;

      ctx.fillStyle = hasDone ? T.cardBg : 'rgba(255,255,255,0.01)';
      ctx.strokeStyle = hasDone ? T.cardBorder : 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(dx, y, dayW, dayH, 10);
      ctx.fill();
      ctx.stroke();

      ctx.font = '700 13px "IBM Plex Mono", monospace';
      ctx.fillStyle = hasDone ? T.text : T.dim;
      ctx.textAlign = 'center';
      ctx.fillText(days[i], dx + dayW / 2, y + 24);

      if (hasDone) {
        var mainSport = dd.activities[0].type;
        var sColor = sportColors[mainSport] || T.accent;

        // Color bar
        ctx.fillStyle = sColor;
        ctx.beginPath();
        ctx.roundRect(dx + 25, y + 34, dayW - 50, 3, 1.5);
        ctx.fill();

        ctx.font = '600 9px "IBM Plex Mono", monospace';
        ctx.fillStyle = sColor;
        ctx.fillText(sportIcons[mainSport] || mainSport, dx + dayW / 2, y + 52);

        ctx.font = '700 26px "IBM Plex Mono", monospace';
        ctx.fillStyle = T.text;
        ctx.fillText(dd.km.toFixed(1), dx + dayW / 2, y + 84);

        ctx.font = '500 10px "IBM Plex Mono", monospace';
        ctx.fillStyle = T.accent2;
        ctx.fillText(fmtDur(dd.min), dx + dayW / 2, y + 104);

        // Green dot
        ctx.fillStyle = '#00E676';
        ctx.beginPath();
        ctx.arc(dx + dayW / 2, y + dayH - 10, 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.font = '300 12px "IBM Plex Mono", monospace';
        ctx.fillStyle = T.dim;
        ctx.fillText('—', dx + dayW / 2, y + 70);
      }
    }

    // ── Sport Breakdown (horizontal bars) ──
    y += dayH + 45;
    ctx.font = '400 11px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.dim;
    ctx.textAlign = 'center';
    ctx.fillText('S P O R T  B R E A K D O W N', W / 2, y);

    y += 30;
    var sports = Object.keys(stats.sportTotals);
    var maxSportKm = Math.max.apply(null, sports.map(function(s) { return stats.sportTotals[s].km; })) || 1;
    var barLeft = 250, maxBarW = W - 380;

    sports.forEach(function(sport, si) {
      var s = stats.sportTotals[sport];
      var label = sportIcons[sport] || sport.toUpperCase();
      var color = sportColors[sport] || T.accent;
      var sy = y + si * 50;

      // Label
      ctx.font = '700 13px "IBM Plex Mono", monospace';
      ctx.fillStyle = color;
      ctx.textAlign = 'right';
      ctx.fillText(label, barLeft - 20, sy + 17);

      // Bar bg
      ctx.fillStyle = T.barBg;
      ctx.beginPath();
      ctx.roundRect(barLeft, sy, maxBarW, 26, 5);
      ctx.fill();

      // Bar fill
      var bw = Math.max(6, (s.km / maxSportKm) * maxBarW);
      ctx.fillStyle = color + 'CC';
      ctx.beginPath();
      ctx.roundRect(barLeft, sy, bw, 26, 5);
      ctx.fill();

      // Value
      ctx.font = '600 11px "IBM Plex Mono", monospace';
      ctx.fillStyle = T.text;
      ctx.textAlign = 'left';
      var suffix = sport === 'Swim' ? '  (x10 = ' + (s.km * 10).toFixed(0) + 'km)' : '';
      ctx.fillText(s.km.toFixed(1) + ' km  ·  ' + s.count + 'x' + suffix, barLeft + bw + 14, sy + 17);
    });

    // ── Summary Stats ──
    y += sports.length * 50 + 50;
    var statItems = [
      { val: stats.totalSessions, label: 'SESSIONS' },
      { val: fmtDur(stats.totalMin), label: 'DURATION' },
      { val: stats.completedDays + '/7', label: 'DAYS' }
    ];
    var statSpacing = 240;
    var statStartX = W / 2 - statSpacing;

    ctx.textAlign = 'center';
    statItems.forEach(function(item, si) {
      var sx = statStartX + si * statSpacing;
      ctx.font = '700 28px "IBM Plex Mono", monospace';
      ctx.fillStyle = T.text;
      ctx.fillText(item.val, sx, y);
      ctx.font = '400 10px "IBM Plex Mono", monospace';
      ctx.fillStyle = T.dim;
      ctx.fillText(item.label, sx, y + 20);
    });

    // ── Compliance badge ──
    y += 55;
    var compPct = Math.round(stats.completedDays / 7 * 100);
    ctx.font = '700 18px "IBM Plex Mono", monospace';
    ctx.fillStyle = compPct >= 70 ? '#00E676' : compPct >= 40 ? '#F5A623' : '#FF5252';
    ctx.fillText(compPct + '% COMPLIANCE', W / 2, y);

    // ── CTA ──
    ctx.font = '500 13px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.dim;
    ctx.fillText('F I R S T L I G H T . L I V E', W / 2, H - 70);

    if (T.grain) drawGrain(ctx, W, H);
    if (T.scanlines) drawScanlines(ctx, W, H);
  }

  // ══════════════════════════════════════════
  // RENDER: MONTHLY POST (1080x1080)
  // ══════════════════════════════════════════
  function renderMonthlyPost(canvas, stats, monthRange, theme) {
    var T = THEMES[theme] || THEMES.noir;
    var W = 1080, H = 1080;
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');

    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, W, H);

    var grad = ctx.createRadialGradient(W / 2, H / 3, 0, W / 2, H / 3, W * 0.7);
    grad.addColorStop(0, T.accent + '08');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    var months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
    var y = 80;

    // Month name
    ctx.font = '500 14px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.dim;
    ctx.textAlign = 'center';
    ctx.fillText(months[monthRange.start.getMonth()] + ' ' + monthRange.start.getFullYear(), W / 2, y);

    // Hero KM
    y += 80;
    ctx.font = '200 120px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.text;
    ctx.fillText(Math.round(stats.totalKm), W / 2, y);

    ctx.font = '500 16px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.dim;
    ctx.fillText('KILOMETERS', W / 2, y + 30);

    // Stats line
    y += 60;
    ctx.font = '500 14px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.accent;
    ctx.fillText(stats.totalSessions + ' SESSIONS  ·  ' + fmtDur(stats.totalMin), W / 2, y);

    // Weekly bars
    y += 55;
    var weeks = stats.weeks;
    var weekKeys = Object.keys(weeks).sort();
    var maxWkKm = Math.max.apply(null, weekKeys.map(function(k) { return weeks[k].km; })) || 1;
    var barMaxW = W - 320;

    weekKeys.forEach(function(wk, wi) {
      var wData = weeks[wk];
      var bw = (wData.km / maxWkKm) * barMaxW;

      ctx.font = '600 12px "IBM Plex Mono", monospace';
      ctx.fillStyle = T.dim;
      ctx.textAlign = 'right';
      ctx.fillText(wk, 140, y + 14);

      ctx.fillStyle = T.barBg;
      ctx.beginPath(); ctx.roundRect(160, y, barMaxW, 20, 4); ctx.fill();

      ctx.fillStyle = T.bar;
      ctx.beginPath(); ctx.roundRect(160, y, bw, 20, 4); ctx.fill();

      ctx.font = '600 11px "IBM Plex Mono", monospace';
      ctx.fillStyle = T.text;
      ctx.textAlign = 'left';
      ctx.fillText(Math.round(wData.km) + ' km', 160 + bw + 12, y + 14);

      y += 36;
    });

    // Sport cards
    y += 30;
    var sports = Object.keys(stats.sportTotals);
    var cardW = 160, cardH = 90;
    var cols = Math.min(sports.length, 4);
    var sX = (W - (cols * cardW + (cols - 1) * 16)) / 2;

    sports.slice(0, 4).forEach(function(sport, si) {
      var sx = sX + si * (cardW + 16);
      var s = stats.sportTotals[sport];

      ctx.fillStyle = T.cardBg;
      ctx.strokeStyle = (sportColors[sport] || T.accent) + '25';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(sx, y, cardW, cardH, 8); ctx.fill(); ctx.stroke();

      ctx.font = '700 10px "IBM Plex Mono", monospace';
      ctx.fillStyle = sportColors[sport] || T.accent;
      ctx.textAlign = 'center';
      ctx.fillText(sportIcons[sport] || sport, sx + cardW / 2, y + 22);

      ctx.font = '700 20px "IBM Plex Mono", monospace';
      ctx.fillStyle = T.text;
      ctx.fillText(Math.round(s.km) + ' km', sx + cardW / 2, y + 50);

      ctx.font = '400 9px "IBM Plex Mono", monospace';
      ctx.fillStyle = T.dim;
      ctx.fillText(s.count + 'x · ' + fmtDur(s.min), sx + cardW / 2, y + 68);
    });

    // PRs
    y += cardH + 40;
    if (stats.bestRun > 0 || stats.bestRide > 0) {
      ctx.font = '500 12px "IBM Plex Mono", monospace';
      ctx.fillStyle = T.dim;
      ctx.textAlign = 'center';
      var prText = 'BEST:';
      if (stats.bestRun > 0) prText += '  ' + stats.bestRun.toFixed(1) + ' km run';
      if (stats.bestRide > 0) prText += '  ·  ' + stats.bestRide.toFixed(1) + ' km ride';
      ctx.fillText(prText, W / 2, y);
    }

    // CTA
    ctx.font = '600 12px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.dim;
    ctx.textAlign = 'center';
    ctx.fillText('FIRSTLIGHT.LIVE', W / 2, H - 50);

    if (T.grain) drawGrain(ctx, W, H);
    if (T.scanlines) drawScanlines(ctx, W, H);
  }

  // ══════════════════════════════════════════
  // CAPTION GENERATOR
  // ══════════════════════════════════════════
  function generateWeeklyCaption(stats, weekRange) {
    var sports = Object.keys(stats.sportTotals);
    var sportLine = sports.map(function(s) {
      return (sportIcons[s] || s) + ' ' + stats.sportTotals[s].km.toFixed(1);
    }).join(' · ');

    return 'Week ' + getWeekNumber(weekRange.start) + '. ' + Math.round(stats.totalKm) + ' km. ' + stats.completedDays + '/7 days.\n\n' + sportLine + '\n\nfirstlight.live';
  }

  function generateMonthlyCaption(stats, monthRange) {
    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return months[monthRange.start.getMonth()] + '. ' + Math.round(stats.totalKm) + ' km. ' + stats.totalSessions + ' sessions. ' + fmtDur(stats.totalMin) + '.\n\nfirstlight.live';
  }

  // ══════════════════════════════════════════
  // PANEL INIT
  // ══════════════════════════════════════════
  function initRecapPanel() {
    var panel = document.getElementById('p-recap');
    if (!panel) return;

    var modeSelect = panel.querySelector('#recapMode');
    var themeSelect = panel.querySelector('#recapTheme');
    var generateBtn = panel.querySelector('#recapGenerate');
    var downloadPostBtn = panel.querySelector('#recapDownloadPost');
    var downloadStoryBtn = panel.querySelector('#recapDownloadStory');
    var copyCaptionBtn = panel.querySelector('#recapCopyCaption');
    var previewPost = panel.querySelector('#recapPreviewPost');
    var previewStory = panel.querySelector('#recapPreviewStory');
    var statusEl = panel.querySelector('#recapStatus');
    var captionEl = panel.querySelector('#recapCaption');

    if (!generateBtn) return;

    var currentStats = null;
    var currentRange = null;
    var currentCaption = '';

    generateBtn.addEventListener('click', function() {
      var mode = modeSelect.value;
      var theme = themeSelect.value;
      var periodSelect = panel.querySelector('#recapPeriod');
      var periodOffset = periodSelect ? parseInt(periodSelect.value) || 0 : 0;
      statusEl.textContent = 'Fetching data...';
      generateBtn.disabled = true;

      var range;
      var refDate = new Date();
      if (mode === 'weekly') {
        // Offset: 0 = this week, -1 = last week, -2 = 2 weeks ago
        refDate.setDate(refDate.getDate() + (periodOffset * 7));
        range = getWeekRange(refDate);
      } else {
        // Offset: 0 = this month, -1 = last month
        refDate.setMonth(refDate.getMonth() + periodOffset);
        range = getMonthRange(refDate);
      }

      var startStr = range.start.getFullYear() + '-' + String(range.start.getMonth() + 1).padStart(2, '0') + '-' + String(range.start.getDate()).padStart(2, '0') + 'T00:00:00';
      var endStr = range.end.getFullYear() + '-' + String(range.end.getMonth() + 1).padStart(2, '0') + '-' + String(range.end.getDate()).padStart(2, '0') + 'T23:59:59';

      fetchActivities(startStr, endStr, function(err, activities) {
        generateBtn.disabled = false;
        if (err || !activities.length) {
          statusEl.textContent = err ? 'Error: ' + err.message : 'No activities found for this period.';
          return;
        }

        if (mode === 'weekly') {
          currentStats = processWeekly(activities);
          currentRange = range;
          renderWeeklyPost(previewPost, currentStats, range, theme);
          renderWeeklyStory(previewStory, currentStats, range, theme);
          currentCaption = generateWeeklyCaption(currentStats, range);
        } else {
          currentStats = processMonthly(activities);
          currentRange = range;
          renderMonthlyPost(previewPost, currentStats, range, theme);
          previewStory.width = 0;
          previewStory.height = 0;
          currentCaption = generateMonthlyCaption(currentStats, range);
        }

        captionEl.value = currentCaption;
        statusEl.textContent = 'Generated! ' + activities.length + ' activities processed.';
        downloadPostBtn.style.display = '';
        if (mode === 'weekly') downloadStoryBtn.style.display = '';
        else downloadStoryBtn.style.display = 'none';
        copyCaptionBtn.style.display = '';
      });
    });

    downloadPostBtn.addEventListener('click', function() {
      var mode = modeSelect.value;
      var link = document.createElement('a');
      link.download = mode + '-recap-' + new Date().toISOString().slice(0, 10) + '.jpg';
      link.href = previewPost.toDataURL('image/jpeg', 0.95);
      link.click();
    });

    downloadStoryBtn.addEventListener('click', function() {
      var link = document.createElement('a');
      link.download = 'weekly-story-' + new Date().toISOString().slice(0, 10) + '.jpg';
      link.href = previewStory.toDataURL('image/jpeg', 0.95);
      link.click();
    });

    copyCaptionBtn.addEventListener('click', function() {
      navigator.clipboard.writeText(captionEl.value).then(function() {
        copyCaptionBtn.textContent = 'COPIED!';
        setTimeout(function() { copyCaptionBtn.textContent = 'COPY CAPTION'; }, 2000);
      });
    });

    // ── Instagram Publish ──
    var SYNC_URL = SUPA + '/functions/v1/firstlight-sync';
    var ADMIN_KEY = ['b8464678b573c885', 'c449958a9ea760c0', '8b01279d01d3a1f9', '96fc92b7364f10b7'].join('');
    var IG_ACCOUNT = '17841466893616231';

    function uploadCanvasToStorage(canvas, filename) {
      return new Promise(function(resolve, reject) {
        var dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        var base64 = dataUrl.split(',')[1];
        var binary = atob(base64);
        var arr = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);

        var path = 'instagram/' + filename;
        fetch(SUPA + '/storage/v1/object/media/' + path, {
          method: 'POST',
          headers: {
            'apikey': KEY,
            'Authorization': 'Bearer ' + KEY,
            'Content-Type': 'image/jpeg',
            'x-upsert': 'true'
          },
          body: arr
        }).then(function(r) {
          if (!r.ok) throw new Error('Upload failed: ' + r.status);
          resolve(SUPA + '/storage/v1/object/public/media/' + path);
        }).catch(reject);
      });
    }

    function igProxy(endpoint, params) {
      return fetch(SYNC_URL + '?action=ig-proxy&admin_key=' + ADMIN_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
        body: JSON.stringify({ endpoint: endpoint, params: params })
      }).then(function(r) { return r.json(); });
    }

    function publishToIG(canvas, caption, type) {
      var filename = type + '_' + Date.now() + '.jpg';
      statusEl.textContent = 'Uploading image...';

      return uploadCanvasToStorage(canvas, filename)
        .then(function(publicUrl) {
          statusEl.textContent = 'Creating Instagram container...';
          return igProxy(IG_ACCOUNT + '/media', {
            image_url: publicUrl,
            caption: caption,
            media_type: 'IMAGE'
          });
        })
        .then(function(container) {
          if (!container || !container.id) throw new Error('Container creation failed: ' + JSON.stringify(container));
          statusEl.textContent = 'Publishing to Instagram...';
          // Wait for processing
          return new Promise(function(resolve) { setTimeout(function() { resolve(container.id); }, 4000); });
        })
        .then(function(containerId) {
          return igProxy(IG_ACCOUNT + '/media_publish', { creation_id: containerId });
        })
        .then(function(pub) {
          if (!pub || !pub.id) throw new Error('Publish failed: ' + JSON.stringify(pub));
          return pub.id;
        });
    }

    var publishPostBtn = panel.querySelector('#recapPublishPost');
    var publishStoryBtn = panel.querySelector('#recapPublishStory');

    if (publishPostBtn) {
      publishPostBtn.addEventListener('click', function() {
        if (!previewPost.width) { statusEl.textContent = 'Generate first!'; return; }
        publishPostBtn.disabled = true;
        publishPostBtn.textContent = 'PUBLISHING...';
        var caption = captionEl.value || '';

        publishToIG(previewPost, caption, 'weekly_recap')
          .then(function(mediaId) {
            statusEl.textContent = 'Published to Instagram! Media ID: ' + mediaId;
            publishPostBtn.textContent = 'PUBLISHED!';
            publishPostBtn.style.background = 'linear-gradient(135deg,#00E676,#00C853)';
            setTimeout(function() {
              publishPostBtn.textContent = 'PUBLISH POST TO IG';
              publishPostBtn.style.background = '';
              publishPostBtn.disabled = false;
            }, 5000);
          })
          .catch(function(err) {
            statusEl.textContent = 'Publish failed: ' + err.message;
            publishPostBtn.textContent = 'PUBLISH POST TO IG';
            publishPostBtn.disabled = false;
          });
      });
    }

    if (publishStoryBtn) {
      publishStoryBtn.addEventListener('click', function() {
        if (!previewStory.width) { statusEl.textContent = 'Generate first!'; return; }
        publishStoryBtn.disabled = true;
        publishStoryBtn.textContent = 'PUBLISHING...';

        var storyFilename = 'weekly_story_' + Date.now() + '.jpg';
        uploadCanvasToStorage(previewStory, storyFilename)
          .then(function(publicUrl) {
            statusEl.textContent = 'Creating story container...';
            return igProxy(IG_ACCOUNT + '/media', {
              image_url: publicUrl,
              media_type: 'STORIES'
            });
          })
          .then(function(container) {
            if (!container || !container.id) throw new Error('Story container failed: ' + JSON.stringify(container));
            statusEl.textContent = 'Publishing story...';
            return new Promise(function(resolve) { setTimeout(function() { resolve(container.id); }, 4000); });
          })
          .then(function(containerId) {
            return igProxy(IG_ACCOUNT + '/media_publish', { creation_id: containerId });
          })
          .then(function(pub) {
            if (!pub || !pub.id) throw new Error('Story publish failed');
            statusEl.textContent = 'Story published! Media ID: ' + pub.id;
            publishStoryBtn.textContent = 'PUBLISHED!';
            publishStoryBtn.style.background = 'linear-gradient(135deg,#00E676,#00C853)';
            setTimeout(function() {
              publishStoryBtn.textContent = 'PUBLISH STORY TO IG';
              publishStoryBtn.style.background = '';
              publishStoryBtn.disabled = false;
            }, 5000);
          })
          .catch(function(err) {
            statusEl.textContent = 'Story publish failed: ' + err.message;
            publishStoryBtn.textContent = 'PUBLISH STORY TO IG';
            publishStoryBtn.disabled = false;
          });
      });
    }

    // Update period options when mode changes
    var periodSelect = panel.querySelector('#recapPeriod');
    if (modeSelect && periodSelect) {
      modeSelect.addEventListener('change', function() {
        var mode = modeSelect.value;
        if (mode === 'weekly') {
          periodSelect.innerHTML = '<option value="0">THIS WEEK</option><option value="-1" selected>LAST WEEK</option><option value="-2">2 WEEKS AGO</option><option value="-3">3 WEEKS AGO</option><option value="-4">4 WEEKS AGO</option>';
        } else {
          periodSelect.innerHTML = '<option value="0">THIS MONTH</option><option value="-1" selected>LAST MONTH</option><option value="-2">2 MONTHS AGO</option><option value="-3">3 MONTHS AGO</option>';
        }
      });
    }

    // Auto-update preview when theme changes
    themeSelect.addEventListener('change', function() {
      if (currentStats && currentRange) {
        var mode = modeSelect.value;
        var theme = themeSelect.value;
        if (mode === 'weekly') {
          renderWeeklyPost(previewPost, currentStats, currentRange, theme);
          renderWeeklyStory(previewStory, currentStats, currentRange, theme);
        } else {
          renderMonthlyPost(previewPost, currentStats, currentRange, theme);
        }
      }
    });
  }

  // Init when panel becomes visible
  if (typeof window.switchPanel === 'function') {
    var _origSwitch = window.switchPanel;
    window.switchPanel = function(name) {
      _origSwitch(name);
      if (name === 'recap') initRecapPanel();
    };
  }
  // Also init on DOMContentLoaded if panel exists
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(initRecapPanel, 500);
  });
})();
