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

  function getDayNumber() {
    var startDate = new Date('2026-02-16');
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.floor((now - startDate) / 86400000) + 1;
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

    // Subtle gradient overlay
    var grad = ctx.createRadialGradient(W / 2, H / 3, 0, W / 2, H / 3, W * 0.7);
    grad.addColorStop(0, T.accent + '08');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    var y = 0;

    // ── Top Section: Week Label ──
    y = 70;
    ctx.font = '500 14px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.dim;
    ctx.textAlign = 'center';
    ctx.letterSpacing = '6px';
    ctx.fillText('WEEK ' + getWeekNumber(weekRange.start) + '  ·  ' + fmtDate(weekRange.start) + ' – ' + fmtDate(weekRange.end), W / 2, y);

    // Day number
    y += 50;
    ctx.font = '200 72px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.text;
    ctx.fillText('DAY ' + getDayNumber(), W / 2, y);

    // ── Progress Bar (vs 150km target) ──
    y += 50;
    var barX = 120, barW = W - 240, barH = 8;
    var pct = Math.min(stats.totalKm / 150, 1);

    ctx.fillStyle = T.barBg;
    ctx.beginPath();
    ctx.roundRect(barX, y, barW, barH, 4);
    ctx.fill();

    ctx.fillStyle = T.bar;
    ctx.beginPath();
    ctx.roundRect(barX, y, barW * pct, barH, 4);
    ctx.fill();

    y += 30;
    ctx.font = '600 18px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.text;
    ctx.fillText(Math.round(stats.totalKm) + ' KM', W / 2 - 60, y);
    ctx.font = '400 14px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.dim;
    ctx.fillText('/ 150 KM TARGET', W / 2 + 50, y);

    // ── Day-by-Day Grid ──
    y += 55;
    var dayW = 110, dayH = 180;
    var gridX = (W - (7 * dayW + 6 * 12)) / 2;
    var days = stats.days;

    for (var i = 0; i < 7; i++) {
      var dx = gridX + i * (dayW + 12);
      var dd = stats.dayData[i];
      var hasDone = dd.activities.length > 0;

      // Card bg
      ctx.fillStyle = hasDone ? T.cardBg : 'rgba(255,255,255,0.01)';
      ctx.strokeStyle = hasDone ? T.cardBorder : 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(dx, y, dayW, dayH, 10);
      ctx.fill();
      ctx.stroke();

      // Day label
      ctx.font = '700 11px "IBM Plex Mono", monospace';
      ctx.fillStyle = hasDone ? T.accent : T.dim;
      ctx.textAlign = 'center';
      ctx.fillText(days[i], dx + dayW / 2, y + 24);

      if (hasDone) {
        // Sport icon
        var mainSport = dd.activities[0].type;
        ctx.font = '700 10px "IBM Plex Mono", monospace';
        ctx.fillStyle = sportColors[mainSport] || T.accent;
        ctx.fillText(sportIcons[mainSport] || mainSport.toUpperCase(), dx + dayW / 2, y + 48);

        // KM
        ctx.font = '700 22px "IBM Plex Mono", monospace';
        ctx.fillStyle = T.text;
        ctx.fillText(dd.km.toFixed(1), dx + dayW / 2, y + 82);

        ctx.font = '400 9px "IBM Plex Mono", monospace';
        ctx.fillStyle = T.dim;
        ctx.fillText('KM', dx + dayW / 2, y + 96);

        // Duration
        ctx.font = '500 11px "IBM Plex Mono", monospace';
        ctx.fillStyle = T.accent2;
        ctx.fillText(fmtDur(dd.min), dx + dayW / 2, y + 118);

        // Activity list
        var listY = y + 138;
        dd.activities.forEach(function(act) {
          if (listY > y + dayH - 10) return;
          var label = sportIcons[act.type] || act.type;
          ctx.font = '400 8px "IBM Plex Mono", monospace';
          ctx.fillStyle = sportColors[act.type] || T.dim;
          ctx.fillText(label + ' ' + act.km.toFixed(1) + 'km', dx + dayW / 2, listY);
          listY += 13;
        });
      } else {
        // Rest day or missed
        ctx.font = '400 10px "IBM Plex Mono", monospace';
        ctx.fillStyle = T.dim;
        ctx.fillText('REST', dx + dayW / 2, y + 95);
      }
    }

    // ── Sport Breakdown Cards ──
    y += dayH + 40;
    var sports = Object.keys(stats.sportTotals);
    var cardW = Math.min(160, (W - 120 - (sports.length - 1) * 16) / sports.length);
    var sportsX = (W - (sports.length * cardW + (sports.length - 1) * 16)) / 2;

    sports.forEach(function(sport, si) {
      var sx = sportsX + si * (cardW + 16);
      var s = stats.sportTotals[sport];
      var label = sportIcons[sport] || sport.toUpperCase();
      var color = sportColors[sport] || T.accent;

      ctx.fillStyle = T.cardBg;
      ctx.strokeStyle = color + '25';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(sx, y, cardW, 90, 8);
      ctx.fill();
      ctx.stroke();

      ctx.font = '700 10px "IBM Plex Mono", monospace';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.fillText(label, sx + cardW / 2, y + 22);

      ctx.font = '700 20px "IBM Plex Mono", monospace';
      ctx.fillStyle = T.text;
      ctx.fillText(s.km.toFixed(1), sx + cardW / 2, y + 50);

      ctx.font = '400 9px "IBM Plex Mono", monospace';
      ctx.fillStyle = T.dim;
      ctx.fillText(s.count + 'x · ' + fmtDur(s.min), sx + cardW / 2, y + 68);
    });

    // ── Summary Line ──
    y += 130;
    ctx.font = '500 14px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.accent;
    ctx.textAlign = 'center';
    ctx.fillText(stats.totalSessions + ' SESSIONS  ·  ' + fmtDur(stats.totalMin) + '  ·  ' + stats.completedDays + '/7 DAYS', W / 2, y);

    // ── CTA ──
    y = H - 50;
    ctx.font = '600 12px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.dim;
    ctx.fillText('FIRSTLIGHT.LIVE', W / 2, y);

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

    var grad = ctx.createRadialGradient(W / 2, H / 4, 0, W / 2, H / 4, W * 0.8);
    grad.addColorStop(0, T.accent + '06');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    var y = 140;

    // Week label
    ctx.font = '500 16px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.dim;
    ctx.textAlign = 'center';
    ctx.fillText('WEEK ' + getWeekNumber(weekRange.start) + '  ·  ' + fmtDate(weekRange.start) + ' – ' + fmtDate(weekRange.end), W / 2, y);

    // Day number
    y += 70;
    ctx.font = '200 96px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.text;
    ctx.fillText('DAY ' + getDayNumber(), W / 2, y);

    // Total km hero
    y += 90;
    ctx.font = '200 120px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.accent;
    ctx.fillText(Math.round(stats.totalKm), W / 2, y);
    ctx.font = '500 18px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.dim;
    ctx.fillText('KILOMETERS', W / 2, y + 35);

    // Progress bar
    y += 70;
    var barX = 140, barW = W - 280, barH = 10;
    var pct = Math.min(stats.totalKm / 150, 1);
    ctx.fillStyle = T.barBg;
    ctx.beginPath(); ctx.roundRect(barX, y, barW, barH, 5); ctx.fill();
    ctx.fillStyle = T.bar;
    ctx.beginPath(); ctx.roundRect(barX, y, barW * pct, barH, 5); ctx.fill();

    ctx.font = '400 12px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.dim;
    ctx.fillText(Math.round(stats.totalKm) + ' / 150 KM TARGET', W / 2, y + 30);

    // Day cards (vertical, bigger)
    y += 65;
    var dayW = 130, dayH = 110;
    var days = stats.days;

    // Row 1: MON-THU
    for (var r = 0; r < 2; r++) {
      var cols = r === 0 ? 4 : 3;
      var rowX = (W - (cols * dayW + (cols - 1) * 14)) / 2;
      for (var c = 0; c < cols; c++) {
        var idx = r * 4 + c;
        if (idx >= 7) break;
        var dx = rowX + c * (dayW + 14);
        var dd = stats.dayData[idx];
        var hasDone = dd.activities.length > 0;

        ctx.fillStyle = hasDone ? T.cardBg : 'rgba(255,255,255,0.01)';
        ctx.strokeStyle = hasDone ? T.cardBorder : 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(dx, y, dayW, dayH, 10); ctx.fill(); ctx.stroke();

        ctx.font = '700 12px "IBM Plex Mono", monospace';
        ctx.fillStyle = hasDone ? T.accent : T.dim;
        ctx.textAlign = 'center';
        ctx.fillText(days[idx], dx + dayW / 2, y + 26);

        if (hasDone) {
          var ms = dd.activities[0].type;
          ctx.font = '700 10px "IBM Plex Mono", monospace';
          ctx.fillStyle = sportColors[ms] || T.accent;
          ctx.fillText(sportIcons[ms] || ms, dx + dayW / 2, y + 48);

          ctx.font = '700 24px "IBM Plex Mono", monospace';
          ctx.fillStyle = T.text;
          ctx.fillText(dd.km.toFixed(1), dx + dayW / 2, y + 78);

          ctx.font = '400 10px "IBM Plex Mono", monospace';
          ctx.fillStyle = T.dim;
          ctx.fillText(fmtDur(dd.min), dx + dayW / 2, y + 96);
        } else {
          ctx.font = '400 12px "IBM Plex Mono", monospace';
          ctx.fillStyle = T.dim;
          ctx.fillText('REST', dx + dayW / 2, y + 65);
        }
      }
      y += dayH + 14;
    }

    // Sport breakdown
    y += 20;
    var sports = Object.keys(stats.sportTotals);
    var scardW = 150, scardH = 80;
    var cols2 = Math.min(sports.length, 3);
    var sX = (W - (cols2 * scardW + (cols2 - 1) * 16)) / 2;

    for (var row = 0; row < Math.ceil(sports.length / 3); row++) {
      for (var sc = 0; sc < 3; sc++) {
        var si = row * 3 + sc;
        if (si >= sports.length) break;
        var sport = sports[si];
        var s = stats.sportTotals[sport];
        var sx = sX + sc * (scardW + 16);

        ctx.fillStyle = T.cardBg;
        ctx.strokeStyle = (sportColors[sport] || T.accent) + '25';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(sx, y, scardW, scardH, 8); ctx.fill(); ctx.stroke();

        ctx.font = '700 11px "IBM Plex Mono", monospace';
        ctx.fillStyle = sportColors[sport] || T.accent;
        ctx.textAlign = 'center';
        ctx.fillText(sportIcons[sport] || sport, sx + scardW / 2, y + 22);

        ctx.font = '700 22px "IBM Plex Mono", monospace';
        ctx.fillStyle = T.text;
        ctx.fillText(s.km.toFixed(1) + ' km', sx + scardW / 2, y + 50);

        ctx.font = '400 10px "IBM Plex Mono", monospace';
        ctx.fillStyle = T.dim;
        ctx.fillText(s.count + 'x · ' + fmtDur(s.min), sx + scardW / 2, y + 68);
      }
      y += scardH + 12;
    }

    // Summary
    y += 20;
    ctx.font = '500 16px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.accent;
    ctx.textAlign = 'center';
    ctx.fillText(stats.totalSessions + ' SESSIONS  ·  ' + fmtDur(stats.totalMin), W / 2, y);

    y += 30;
    ctx.font = '600 14px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.text;
    ctx.fillText(stats.completedDays + '/7 DAYS  ·  ' + Math.round(stats.completedDays / 7 * 100) + '% COMPLIANCE', W / 2, y);

    // CTA
    ctx.font = '600 14px "IBM Plex Mono", monospace';
    ctx.fillStyle = T.dim;
    ctx.fillText('FIRSTLIGHT.LIVE', W / 2, H - 80);

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
      statusEl.textContent = 'Fetching data...';
      generateBtn.disabled = true;

      var range;
      if (mode === 'weekly') {
        range = getWeekRange(new Date());
      } else {
        range = getMonthRange(new Date());
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
