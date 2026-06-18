// ═══════════════════════════════════════════════════════
// FIRST LIGHT — Daily Proof Generator (Chapter 02)
// Instagram 1080x1080 post + 1080x1920 story, auto from Strava
// ═══════════════════════════════════════════════════════

(function() {
  'use strict';

  var SUPA = (window.FL && FL.SUPABASE_URL) || localStorage.getItem('fl_supabase_url') || '';
  var KEY = (window.FL && FL.SUPABASE_ANON_KEY) || localStorage.getItem('fl_supabase_key') || '';

  var CHAPTER1_DAYS = 110;
  var STREAK_START = (window.FL && FL.STREAK_START) || '2026-06-13';

  var THEMES = {
    noir:     { name: 'NOIR',     bg: '#000000', text: '#FFFFFF', dim: '#5A6B80', accent: '#FFFFFF', accent2: '#888888', cardBg: 'rgba(255,255,255,0.04)', cardBorder: 'rgba(255,255,255,0.1)',  grain: true,  scanlines: false },
    heatmap:  { name: 'HEAT MAP', bg: '#0A0C10', text: '#FFFFFF', dim: '#5A6B80', accent: '#FC4C02', accent2: '#F5A623', cardBg: 'rgba(252,76,2,0.05)',    cardBorder: 'rgba(252,76,2,0.15)',   grain: true,  scanlines: false },
    terminal: { name: 'TERMINAL', bg: '#0A0F0A', text: '#00E676', dim: '#1B5E20', accent: '#00E676', accent2: '#4CAF50', cardBg: 'rgba(0,230,118,0.04)',   cardBorder: 'rgba(0,230,118,0.12)',  grain: false, scanlines: true  },
    gradient: { name: 'GRADIENT', bg: '#0A0C1A', text: '#FFFFFF', dim: '#6B7DB8', accent: '#00D4FF', accent2: '#A855F7', cardBg: 'rgba(0,212,255,0.04)',   cardBorder: 'rgba(0,212,255,0.12)',  grain: true,  scanlines: false },
    strava:   { name: 'STRAVA',   bg: '#000000', text: '#FFFFFF', dim: '#5A6B80', accent: '#FC4C02', accent2: '#FC4C02', cardBg: 'rgba(252,76,2,0.06)',    cardBorder: 'rgba(252,76,2,0.2)',    grain: true,  scanlines: false },
    arctic:   { name: 'ARCTIC',   bg: '#0A1628', text: '#E8EDF5', dim: '#3B5998', accent: '#93C5FD', accent2: '#60A5FA', cardBg: 'rgba(147,197,253,0.04)', cardBorder: 'rgba(147,197,253,0.12)', grain: false, scanlines: false },
    infrared: { name: 'INFRARED', bg: '#0A0000', text: '#FFFFFF', dim: '#4A1010', accent: '#FF1744', accent2: '#FF5252', cardBg: 'rgba(255,23,68,0.05)',   cardBorder: 'rgba(255,23,68,0.15)',  grain: true,  scanlines: false },
    gold:     { name: 'GOLD',     bg: '#080808', text: '#FFFFFF', dim: '#6B5B00', accent: '#F5A623', accent2: '#D4A017', cardBg: 'rgba(245,166,35,0.04)',  cardBorder: 'rgba(245,166,35,0.12)', grain: true,  scanlines: false },
    neon:     { name: 'NEON',     bg: '#0A0A14', text: '#FFFFFF', dim: '#4A148C', accent: '#E040FB', accent2: '#00E5FF', cardBg: 'rgba(224,64,251,0.04)',  cardBorder: 'rgba(224,64,251,0.12)', grain: false, scanlines: true  },
    earth:    { name: 'EARTH',    bg: '#1A1410', text: '#E8DCC8', dim: '#4E342E', accent: '#8D6E63', accent2: '#558B2F', cardBg: 'rgba(141,110,99,0.05)',  cardBorder: 'rgba(141,110,99,0.12)', grain: true,  scanlines: false }
  };

  var MONO = '"IBM Plex Mono", monospace';
  var GREEN = '#00E676', RED = '#FF5252';

  // ── Helpers ──
  function parseLocal(dateStr) {
    if (!dateStr) return new Date();
    return new Date(dateStr.replace(/[+-]\d{2}:\d{2}$/, ''));
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function fmtClock(d) {
    var h = d.getHours(), m = d.getMinutes();
    var ap = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return pad(h12) + ':' + pad(m) + ' ' + ap;
  }

  function fmtDateLong(d) {
    var days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    var months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return days[d.getDay()] + ' · ' + pad(d.getDate()) + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function fmtDur(sec) {
    var m = Math.floor(sec / 60), s = Math.round(sec % 60);
    if (m >= 60) { var h = Math.floor(m / 60); return h + ':' + pad(m % 60) + ':' + pad(s); }
    return m + ':' + pad(s);
  }

  function fmtMargin(min) {
    min = Math.round(Math.abs(min));
    var h = Math.floor(min / 60), m = min % 60;
    if (h > 0) return h + 'H ' + pad(m) + 'M';
    return m + 'M';
  }

  function getDayNumber(forDate) {
    var start = new Date(STREAK_START + 'T12:00:00');
    var d = new Date(forDate); d.setHours(12, 0, 0, 0);
    return Math.floor((d - start) / 86400000) + 1;
  }

  function dateStrLocal(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // ── Data ──
  function fetchDay(dateStr, cb) {
    // Deadline is 6 AM, so fetch from 6 AM on dateStr to 6 AM on next date
    var parts = dateStr.split('-');
    var nextDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    nextDate.setDate(nextDate.getDate() + 1);
    var nextDateStr = nextDate.getFullYear() + '-' + String(nextDate.getMonth() + 1).padStart(2, '0') + '-' + String(nextDate.getDate()).padStart(2, '0');
    var url = SUPA + '/rest/v1/strava_activities?start_date_local=gte.' + dateStr + 'T00:30:00&start_date_local=lt.' + nextDateStr + 'T00:30:00&select=start_date_local,type,sport_type,name,distance,moving_time,average_heartrate&order=start_date_local.asc';
    fetch(url, { headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY } })
      .then(function(r) { return r.json(); })
      .then(function(data) { cb(null, Array.isArray(data) ? data : []); })
      .catch(function(e) { cb(e, []); });
  }

  function buildStats(activities, dateStr) {
    var date = new Date(dateStr + 'T12:00:00');
    var runs = activities.filter(function(a) { return a.type === 'Run' || a.type === 'VirtualRun'; });
    var pick = null;
    // Prefer the earliest run that finished before 6:00 AM
    for (var i = 0; i < runs.length; i++) {
      var st = parseLocal(runs[i].start_date_local);
      var en = new Date(st.getTime() + (runs[i].moving_time || 0) * 1000);
      if (en.getHours() < 6) { pick = runs[i]; break; }
    }
    if (!pick && runs.length) pick = runs[0];
    if (!pick && activities.length) pick = activities[0];
    if (!pick) return null;

    var start = parseLocal(pick.start_date_local);
    var end = new Date(start.getTime() + (pick.moving_time || 0) * 1000);
    var deadline = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 6, 0, 0);
    var marginMin = (deadline - end) / 60000;
    var km = (pick.distance || 0) / 1000;
    var paceSec = km > 0 ? (pick.moving_time || 0) / km : 0;
    var isRun = pick.type === 'Run' || pick.type === 'VirtualRun';

    return {
      date: date,
      day: getDayNumber(date),
      lifetime: CHAPTER1_DAYS + Math.max(0, getDayNumber(date)),
      type: isRun ? 'RUN' : (pick.type || '').toUpperCase(),
      km: km,
      durSec: pick.moving_time || 0,
      paceSec: paceSec,
      hr: pick.average_heartrate ? Math.round(pick.average_heartrate) : null,
      start: start,
      end: end,
      made: marginMin >= 0 && isRun && km >= 4.95,
      marginMin: marginMin,
      extraSessions: activities.length - 1
    };
  }

  // ── FX ──
  function drawGrain(ctx, w, h) {
    var imageData = ctx.getImageData(0, 0, w, h);
    var p = imageData.data;
    for (var i = 0; i < p.length; i += 4) {
      var n = (Math.random() - 0.5) * 18;
      p[i] += n; p[i + 1] += n; p[i + 2] += n;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  function drawScanlines(ctx, w, h) {
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    for (var y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 2);
  }

  function applyFX(ctx, T, w, h) {
    if (T.grain) drawGrain(ctx, w, h);
    if (T.scanlines) drawScanlines(ctx, w, h);
  }

  function heroGradient(ctx, T, yTop, yBottom) {
    var g = ctx.createLinearGradient(0, yTop, 0, yBottom);
    g.addColorStop(0, T.text);
    g.addColorStop(1, T.accent === T.text ? T.accent2 : T.accent);
    return g;
  }

  function sealColorFor(s, T) {
    if (!s.made) return RED;
    return T.accent === '#FFFFFF' ? GREEN : T.accent;
  }

  // ══════════════════════════════════════════
  // RENDER: DAILY STORY (1080x1920) — THE RECEIPT
  // ══════════════════════════════════════════
  function renderStory(canvas, s, theme) {
    var T = THEMES[theme] || THEMES.gold;
    var W = 1080, H = 1920;
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');

    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, W, H);

    var halo = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, 900);
    halo.addColorStop(0, T.cardBg);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, 900);

    ctx.textAlign = 'center';

    // Brand + chapter
    ctx.font = '700 30px ' + MONO;
    ctx.fillStyle = T.accent;
    ctx.fillText('◆  F I R S T   L I G H T', W / 2, 128);
    ctx.font = '500 22px ' + MONO;
    ctx.fillStyle = T.dim;
    ctx.fillText('C H A P T E R   0 2  —  R E B U I L D', W / 2, 196);

    // DAY hero
    ctx.font = '500 26px ' + MONO;
    ctx.fillStyle = T.dim;
    ctx.fillText('DAY', W / 2, 312);
    ctx.font = '700 290px ' + MONO;
    ctx.fillStyle = heroGradient(ctx, T, 330, 600);
    ctx.fillText(String(s.day), W / 2, 586);
    ctx.font = '500 25px ' + MONO;
    ctx.fillStyle = T.dim;
    ctx.fillText(fmtDateLong(s.date), W / 2, 668);

    // Receipt card
    var cardX = 90, cardW = W - 180, cardY = 716, cardH = 324;
    ctx.fillStyle = T.cardBg;
    ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, cardH, 14); ctx.fill();
    ctx.strokeStyle = T.cardBorder;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, cardH, 14); ctx.stroke();

    var foodBroken = s.foodClean === false;
    var rows = [
      ['STARTED', fmtClock(s.start)],
      ['ENDED', fmtClock(s.end)],
      ['DEADLINE', '06:00 AM'],
      ['FOOD CODE', foodBroken ? '✗ BROKEN' : '✓ CLEAN', foodBroken ? RED : GREEN]
    ];
    var ry = cardY + 68;
    rows.forEach(function(row) {
      ctx.textAlign = 'left';
      ctx.font = '500 26px ' + MONO;
      ctx.fillStyle = T.dim;
      ctx.fillText(row[0], cardX + 50, ry);
      ctx.textAlign = 'right';
      ctx.font = '700 30px ' + MONO;
      ctx.fillStyle = row[2] || T.text;
      ctx.fillText(row[1], cardX + cardW - 50, ry);
      ry += 64;
    });

    // Proof seal
    ctx.textAlign = 'center';
    var sealY = 1080, sealH = 190;
    var sc = sealColorFor(s, T);
    ctx.save();
    ctx.shadowColor = sc;
    ctx.shadowBlur = 60;
    ctx.fillStyle = T.cardBg;
    ctx.beginPath(); ctx.roundRect(90, sealY, W - 180, sealH, 14); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = sc;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(90, sealY, W - 180, sealH, 14); ctx.stroke();

    ctx.font = '700 52px ' + MONO;
    ctx.fillStyle = sc;
    if (s.made) {
      ctx.fillText('✓ BEFORE 6:00 AM', W / 2, sealY + 84);
      ctx.font = '500 26px ' + MONO;
      ctx.fillStyle = T.dim;
      ctx.fillText(fmtMargin(s.marginMin) + ' TO SPARE', W / 2, sealY + 142);
    } else {
      ctx.fillText('✗ DEADLINE MISSED', W / 2, sealY + 84);
      ctx.font = '500 26px ' + MONO;
      ctx.fillStyle = T.dim;
      ctx.fillText('₹15,000 PAID · STREAK CONTINUES', W / 2, sealY + 142);
    }

    // Stats — 3 columns
    var statY = 1390;
    ctx.strokeStyle = T.cardBorder;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(90, statY - 72); ctx.lineTo(W - 90, statY - 72); ctx.stroke();

    var cols = [
      [s.km.toFixed(1), 'KM ' + s.type],
      [fmtDur(s.paceSec) + '/K', 'PACE'],
      [s.hr ? s.hr : fmtDur(s.durSec), s.hr ? 'AVG HR' : 'TIME']
    ];
    var cx = [220, W / 2, W - 220];
    cols.forEach(function(c, i) {
      ctx.font = '700 56px ' + MONO;
      ctx.fillStyle = T.text;
      ctx.fillText(String(c[0]), cx[i], statY);
      ctx.font = '500 20px ' + MONO;
      ctx.fillStyle = T.dim;
      ctx.fillText(c[1], cx[i], statY + 46);
    });

    ctx.beginPath(); ctx.moveTo(90, statY + 104); ctx.lineTo(W - 90, statY + 104); ctx.stroke();

    // Stake line
    ctx.font = '700 34px ' + MONO;
    ctx.fillStyle = T.text;
    ctx.fillText(s.made ? '₹15,000 STAKED. STILL MINE.' : '₹15,000 GONE. TOMORROW I SHOW UP.', W / 2, 1584);

    // Lifetime strip
    ctx.font = '500 22px ' + MONO;
    ctx.fillStyle = T.dim;
    var extra = s.extraSessions > 0 ? '  ·  +' + s.extraSessions + ' MORE TODAY' : '';
    ctx.fillText('LIFETIME ' + s.lifetime + '  ·  CH 01: 110  ·  CH 02: ' + s.day + extra, W / 2, 1648);

    // Badges
    var bw = 150, bh = 52, gap = 16, by = 1742;
    ctx.fillStyle = '#0084c8';
    ctx.beginPath(); ctx.roundRect(W / 2 - bw - gap / 2, by, bw, bh, 8); ctx.fill();
    ctx.font = '700 22px ' + MONO;
    ctx.fillStyle = '#fff';
    ctx.fillText('GARMIN', W / 2 - gap / 2 - bw / 2, by + 34);
    ctx.fillStyle = '#FC4C02';
    ctx.beginPath(); ctx.roundRect(W / 2 + gap / 2, by, bw, bh, 8); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText('STRAVA', W / 2 + gap / 2 + bw / 2, by + 34);

    ctx.font = '500 26px ' + MONO;
    ctx.fillStyle = T.dim;
    ctx.fillText('f i r s t l i g h t . l i v e', W / 2, 1858);

    applyFX(ctx, T, W, H);
  }

  // ══════════════════════════════════════════
  // RENDER: DAILY POST (1080x1080) — THE MONUMENT
  // ══════════════════════════════════════════
  function renderPost(canvas, s, theme) {
    var T = THEMES[theme] || THEMES.gold;
    var W = 1080, H = 1080;
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');

    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, W, H);

    var halo = ctx.createRadialGradient(W / 2, H / 2 - 80, 0, W / 2, H / 2 - 80, 700);
    halo.addColorStop(0, T.cardBg);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';

    ctx.font = '700 26px ' + MONO;
    ctx.fillStyle = T.accent;
    ctx.fillText('◆  F I R S T   L I G H T', W / 2, 122);
    ctx.font = '500 20px ' + MONO;
    ctx.fillStyle = T.dim;
    ctx.fillText('C H A P T E R   0 2', W / 2, 176);

    // Monument number
    var numStr = String(s.day);
    var numSize = numStr.length >= 3 ? 360 : 440;
    ctx.font = '700 ' + numSize + 'px ' + MONO;
    ctx.fillStyle = heroGradient(ctx, T, 270, 680);
    ctx.fillText(numStr, W / 2, 646);

    ctx.strokeStyle = T.accent;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(W / 2 - 50, 716); ctx.lineTo(W / 2 + 50, 716); ctx.stroke();

    ctx.font = '700 38px ' + MONO;
    ctx.fillStyle = T.text;
    ctx.fillText('5 KM BEFORE 6:00 AM', W / 2, 796);

    var sc = sealColorFor(s, T);
    ctx.font = '500 26px ' + MONO;
    ctx.fillStyle = sc;
    if (s.made) {
      ctx.fillText('✓ DONE ' + fmtClock(s.end) + ' · ' + fmtMargin(s.marginMin) + ' EARLY', W / 2, 858);
    } else {
      ctx.fillText('✗ MISSED · ₹15,000 SELF-IMPOSED · STREAK CONTINUES', W / 2, 858);
    }

    ctx.font = '500 20px ' + MONO;
    ctx.fillStyle = T.dim;
    ctx.fillText('₹15,000 DAILY PERSONAL COMMITMENT · NO END DATE', W / 2, 926);

    ctx.font = '500 24px ' + MONO;
    ctx.fillStyle = T.dim;
    ctx.fillText('f i r s t l i g h t . l i v e', W / 2, 1008);

    applyFX(ctx, T, W, H);
  }

  // ══════════════════════════════════════════
  // RENDER: RESTART ANNOUNCEMENT — DAY 0
  // ══════════════════════════════════════════
  function renderRestartStory(canvas, theme) {
    var T = THEMES[theme] || THEMES.gold;
    var W = 1080, H = 1920;
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');

    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, W, H);

    var halo = ctx.createRadialGradient(W / 2, 760, 0, W / 2, 760, 900);
    halo.addColorStop(0, T.cardBg);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';

    ctx.font = '700 30px ' + MONO;
    ctx.fillStyle = T.accent;
    ctx.fillText('◆  F I R S T   L I G H T', W / 2, 128);
    ctx.font = '500 22px ' + MONO;
    ctx.fillStyle = T.dim;
    ctx.fillText('C H A P T E R   0 2  —  R E B U I L D', W / 2, 196);

    ctx.font = '700 40px ' + MONO;
    ctx.fillStyle = T.text;
    ctx.fillText('I RAN 110 DAYS STRAIGHT.', W / 2, 348);
    ctx.fillStyle = T.accent === T.text ? T.accent2 : T.accent;
    ctx.fillText("THEN ONE MORNING, I DIDN'T.", W / 2, 418);

    ctx.font = '500 24px ' + MONO;
    ctx.fillStyle = T.dim;
    ctx.fillText('THE COUNTER RESETS.', W / 2, 530);

    ctx.font = '700 320px ' + MONO;
    ctx.fillStyle = heroGradient(ctx, T, 570, 860);
    ctx.fillText('0', W / 2, 850);

    // Rules card
    var cardX = 90, cardW = W - 180, cardY = 930, cardH = 260;
    ctx.fillStyle = T.cardBg;
    ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, cardH, 14); ctx.fill();
    ctx.strokeStyle = T.cardBorder;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(cardX, cardY, cardW, cardH, 14); ctx.stroke();

    var rows = [
      ['THE RULE', '5 KM RUN · BEFORE 6 AM'],
      ['THE STAKE', '₹15,000 / DAY'],
      ['END DATE', 'NONE']
    ];
    var ry = cardY + 74;
    rows.forEach(function(row) {
      ctx.textAlign = 'left';
      ctx.font = '500 26px ' + MONO;
      ctx.fillStyle = T.dim;
      ctx.fillText(row[0], cardX + 50, ry);
      ctx.textAlign = 'right';
      ctx.font = '700 30px ' + MONO;
      ctx.fillStyle = T.text;
      ctx.fillText(row[1], cardX + cardW - 50, ry);
      ry += 74;
    });

    // Day 1 seal
    ctx.textAlign = 'center';
    var sealY = 1268, sealH = 184;
    var sc = T.accent === '#FFFFFF' ? GREEN : T.accent;
    ctx.save();
    ctx.shadowColor = sc;
    ctx.shadowBlur = 60;
    ctx.fillStyle = T.cardBg;
    ctx.beginPath(); ctx.roundRect(90, sealY, W - 180, sealH, 14); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = sc;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(90, sealY, W - 180, sealH, 14); ctx.stroke();

    ctx.font = '700 48px ' + MONO;
    ctx.fillStyle = sc;
    ctx.fillText('DAY 1 — TOMORROW', W / 2, sealY + 82);
    ctx.font = '500 25px ' + MONO;
    ctx.fillStyle = T.dim;
    ctx.fillText('13 JUN 2026 · 5 KM · BEFORE 6:00 AM', W / 2, sealY + 140);

    ctx.font = '700 38px ' + MONO;
    ctx.fillStyle = T.text;
    ctx.fillText('WATCH ME REBUILD.', W / 2, 1570);

    ctx.font = '500 22px ' + MONO;
    ctx.fillStyle = T.dim;
    ctx.fillText('CHAPTER 01 — 110 DAYS — PRESERVED FOREVER', W / 2, 1636);

    var bw = 150, bh = 52, gap = 16, by = 1742;
    ctx.fillStyle = '#0084c8';
    ctx.beginPath(); ctx.roundRect(W / 2 - bw - gap / 2, by, bw, bh, 8); ctx.fill();
    ctx.font = '700 22px ' + MONO;
    ctx.fillStyle = '#fff';
    ctx.fillText('GARMIN', W / 2 - gap / 2 - bw / 2, by + 34);
    ctx.fillStyle = '#FC4C02';
    ctx.beginPath(); ctx.roundRect(W / 2 + gap / 2, by, bw, bh, 8); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText('STRAVA', W / 2 + gap / 2 + bw / 2, by + 34);

    ctx.font = '500 26px ' + MONO;
    ctx.fillStyle = T.dim;
    ctx.fillText('f i r s t l i g h t . l i v e', W / 2, 1858);

    applyFX(ctx, T, W, H);
  }

  function renderRestartPost(canvas, theme) {
    var T = THEMES[theme] || THEMES.gold;
    var W = 1080, H = 1080;
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');

    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, W, H);

    var halo = ctx.createRadialGradient(W / 2, H / 2 - 60, 0, W / 2, H / 2 - 60, 700);
    halo.addColorStop(0, T.cardBg);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';

    ctx.font = '700 26px ' + MONO;
    ctx.fillStyle = T.accent;
    ctx.fillText('◆  F I R S T   L I G H T', W / 2, 122);

    ctx.font = '500 24px ' + MONO;
    ctx.fillStyle = T.dim;
    ctx.fillText('110 DAYS. THEN ONE MORNING — NOTHING.', W / 2, 268);

    ctx.font = '700 430px ' + MONO;
    ctx.fillStyle = heroGradient(ctx, T, 320, 700);
    ctx.fillText('0', W / 2, 690);

    ctx.strokeStyle = T.accent;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(W / 2 - 50, 752); ctx.lineTo(W / 2 + 50, 752); ctx.stroke();

    ctx.font = '700 46px ' + MONO;
    ctx.fillStyle = T.text;
    ctx.fillText('STARTING OVER', W / 2, 830);

    ctx.font = '500 27px ' + MONO;
    ctx.fillStyle = T.accent === T.text ? T.accent2 : T.accent;
    ctx.fillText('5 KM BEFORE 6:00 AM · EVERY DAY', W / 2, 890);

    ctx.font = '500 20px ' + MONO;
    ctx.fillStyle = T.dim;
    ctx.fillText('₹15,000/DAY AT STAKE · DAY 1 — 13 JUN 2026', W / 2, 948);

    ctx.font = '500 24px ' + MONO;
    ctx.fillStyle = T.dim;
    ctx.fillText('f i r s t l i g h t . l i v e', W / 2, 1014);

    applyFX(ctx, T, W, H);
  }

  // ── Caption ──
  // ══════════════════════════════════════════
  // RENDER: THE COMEBACK (Chapter 2 Day 1) — real run stats, rebuild narrative
  // ══════════════════════════════════════════
  function renderComebackStory(canvas, s, theme) {
    var T = THEMES[theme] || THEMES.gold;
    var W = 1080, H = 1920;
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');

    ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
    var halo = ctx.createRadialGradient(W / 2, 640, 0, W / 2, 640, 900);
    halo.addColorStop(0, T.cardBg); halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';

    ctx.font = '700 26px ' + MONO; ctx.fillStyle = T.accent;
    ctx.fillText('◆  F I R S T   L I G H T', W / 2, 122);
    ctx.font = '500 22px ' + MONO; ctx.fillStyle = T.dim;
    ctx.fillText('CHAPTER 02 — REBUILD', W / 2, 170);

    ctx.font = '700 44px ' + MONO; ctx.fillStyle = T.text;
    ctx.fillText('I RAN 110 DAYS STRAIGHT.', W / 2, 300);
    ctx.fillStyle = T.accent === T.text ? T.accent2 : T.accent;
    ctx.fillText('THIS MORNING — I CAME BACK.', W / 2, 364);

    ctx.font = '700 24px ' + MONO; ctx.fillStyle = T.dim;
    ctx.fillText('D A Y', W / 2, 520);
    ctx.font = '700 360px ' + MONO;
    ctx.fillStyle = heroGradient(ctx, T, 540, 880);
    ctx.fillText(String(s.day), W / 2, 860);

    var cardY = 950, cardH = 420;
    ctx.save(); ctx.fillStyle = T.cardBg;
    ctx.beginPath(); ctx.roundRect(90, cardY, W - 180, cardH, 14); ctx.fill(); ctx.restore();
    ctx.strokeStyle = T.cardBorder; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(90, cardY, W - 180, cardH, 14); ctx.stroke();

    function row(label, val, y) {
      ctx.textAlign = 'left'; ctx.font = '500 24px ' + MONO; ctx.fillStyle = T.dim;
      ctx.fillText(label, 140, y);
      ctx.textAlign = 'right'; ctx.font = '700 28px ' + MONO; ctx.fillStyle = T.text;
      ctx.fillText(val, W - 140, y);
    }
    row('STARTED', s.start ? fmtClock(s.start) : '—', cardY + 70);
    row('ENDED', s.end ? fmtClock(s.end) : '—', cardY + 136);
    row('DISTANCE', s.km ? s.km.toFixed(2) + ' KM' : '—', cardY + 202);
    row('PACE', s.paceSec ? fmtDur(Math.round(s.paceSec)) + ' /KM' : '—', cardY + 268);
    row('HEART RATE', s.hr ? s.hr + ' BPM' : '—', cardY + 334);
    ctx.textAlign = 'center';

    var sc = sealColorFor(s, T);
    var sealY = 1430, sealH = 170;
    ctx.save(); ctx.fillStyle = T.cardBg;
    ctx.beginPath(); ctx.roundRect(90, sealY, W - 180, sealH, 14); ctx.fill(); ctx.restore();
    ctx.strokeStyle = sc; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(90, sealY, W - 180, sealH, 14); ctx.stroke();
    ctx.font = '700 44px ' + MONO; ctx.fillStyle = sc;
    ctx.fillText(s.made ? '✓ BEFORE 6:00 AM' : '✗ AFTER 6:00 AM — ₹15,000 PAID', W / 2, sealY + 78);
    ctx.font = '500 24px ' + MONO; ctx.fillStyle = T.dim;
    ctx.fillText(s.made ? fmtMargin(s.marginMin) + ' OF MARGIN · DEADLINE HELD' : 'THE STREAK CONTINUES — NO RESET', W / 2, sealY + 130);

    ctx.font = '700 38px ' + MONO; ctx.fillStyle = T.text;
    ctx.fillText('110 BEHIND ME. REBUILDING.', W / 2, 1690);

    var bw = 150, bh = 52, gap = 16, by = 1756;
    ctx.fillStyle = '#0084c8';
    ctx.beginPath(); ctx.roundRect(W / 2 - bw - gap / 2, by, bw, bh, 8); ctx.fill();
    ctx.font = '700 22px ' + MONO; ctx.fillStyle = '#fff';
    ctx.fillText('GARMIN', W / 2 - gap / 2 - bw / 2, by + 34);
    ctx.fillStyle = '#FC4C02';
    ctx.beginPath(); ctx.roundRect(W / 2 + gap / 2, by, bw, bh, 8); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText('STRAVA', W / 2 + gap / 2 + bw / 2, by + 34);

    ctx.font = '500 26px ' + MONO; ctx.fillStyle = T.dim;
    ctx.fillText('f i r s t l i g h t . l i v e', W / 2, 1872);

    applyFX(ctx, T, W, H);
  }

  function renderComebackPost(canvas, s, theme) {
    var T = THEMES[theme] || THEMES.gold;
    var W = 1080, H = 1080;
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');

    ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H);
    var halo = ctx.createRadialGradient(W / 2, H / 2 - 60, 0, W / 2, H / 2 - 60, 700);
    halo.addColorStop(0, T.cardBg); halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';

    ctx.font = '700 26px ' + MONO; ctx.fillStyle = T.accent;
    ctx.fillText('◆  F I R S T   L I G H T', W / 2, 122);

    ctx.font = '500 24px ' + MONO; ctx.fillStyle = T.dim;
    ctx.fillText('YESTERDAY: 0. THIS MORNING:', W / 2, 268);

    ctx.font = '700 430px ' + MONO;
    ctx.fillStyle = heroGradient(ctx, T, 320, 700);
    ctx.fillText(String(s.day), W / 2, 690);

    ctx.strokeStyle = T.accent; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(W / 2 - 50, 752); ctx.lineTo(W / 2 + 50, 752); ctx.stroke();

    ctx.font = '700 46px ' + MONO; ctx.fillStyle = T.text;
    ctx.fillText('THE COMEBACK', W / 2, 830);

    var sc = sealColorFor(s, T);
    ctx.font = '500 27px ' + MONO; ctx.fillStyle = sc;
    var statLine = (s.km ? s.km.toFixed(1) + ' KM' : '5 KM') + ' · ' + (s.end ? 'DONE ' + fmtClock(s.end) : 'BEFORE 6:00 AM');
    ctx.fillText((s.made ? '✓ ' : '') + statLine, W / 2, 890);

    ctx.font = '500 20px ' + MONO; ctx.fillStyle = T.dim;
    var MABBR = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    var dd = s.date ? (String(s.date.getDate()).padStart(2, '0') + ' ' + MABBR[s.date.getMonth()] + ' ' + s.date.getFullYear()) : '';
    ctx.fillText('₹15,000 STAKED · STILL MINE · DAY ' + s.day + (dd ? ' — ' + dd : ''), W / 2, 948);

    ctx.font = '500 24px ' + MONO; ctx.fillStyle = T.dim;
    ctx.fillText('f i r s t l i g h t . l i v e', W / 2, 1014);

    applyFX(ctx, T, W, H);
  }

  function comebackCaption(s) {
    return '1\n\nYesterday I posted a zero.\nThis morning: ' + (s.km ? s.km.toFixed(1) : '5') + ' km, done ' +
      (s.end ? fmtClock(s.end).toLowerCase() : 'before 6:00 am') + '.\n\nDay 1 of the rebuild.\n\nfirstlight.live';
  }

  function generateCaption(s) {
    if (!s.made) {
      return 'Day ' + s.day + '. Missed.\nSelf-imposed ₹15,000 personal commitment honoured.\nThe streak continues tomorrow.\n\nfirstlight.live';
    }
    return s.day + '\n\n' + s.km.toFixed(1) + ' km. Done ' + fmtClock(s.end).toLowerCase() + '. ' + fmtMargin(s.marginMin).toLowerCase() + ' before deadline.\n\nfirstlight.live';
  }

  // ══════════════════════════════════════════
  // PANEL
  // ══════════════════════════════════════════
  var currentStats = null;
  var inited = false;

  function initDailyProofPanel() {
    var panel = document.getElementById('p-dailyproof');
    if (!panel || inited) return;
    inited = true;

    var modeSelect = panel.querySelector('#dproofMode');
    var dateSelect = panel.querySelector('#dproofDate');
    var themeSelect = panel.querySelector('#dproofTheme');
    var generateBtn = panel.querySelector('#dproofGenerate');
    var downloadPostBtn = panel.querySelector('#dproofDownloadPost');
    var downloadStoryBtn = panel.querySelector('#dproofDownloadStory');
    var copyCaptionBtn = panel.querySelector('#dproofCopyCaption');
    var previewPost = panel.querySelector('#dproofPreviewPost');
    var previewStory = panel.querySelector('#dproofPreviewStory');
    var statusEl = panel.querySelector('#dproofStatus');
    var captionEl = panel.querySelector('#dproofCaption');

    var SYNC_URL = SUPA + '/functions/v1/firstlight-sync';
    var ADMIN_KEY = ['934c03a18ffe22cb', 'ccef763b4bf480d5', '3f0690177904ba2b', '1d9ebacd52b0eb5d'].join('');
    var IG_ACCOUNT = '17841466893616231';

    function renderBoth() {
      var theme = themeSelect.value;
      if (currentStats && currentStats.restart) {
        renderRestartStory(previewStory, theme);
        renderRestartPost(previewPost, theme);
        return;
      }
      if (currentStats && currentStats.comeback) {
        renderComebackStory(previewStory, currentStats, theme);
        renderComebackPost(previewPost, currentStats, theme);
        return;
      }
      renderStory(previewStory, currentStats, theme);
      renderPost(previewPost, currentStats, theme);
    }

    generateBtn.addEventListener('click', function() {
      if (modeSelect && modeSelect.value === 'restart') {
        currentStats = { restart: true, day: 0 };
        renderBoth();
        captionEl.value = '0\n\n110 days. Then one morning, nothing.\nRestarting tomorrow — 5 km before 6 AM. Every day.\n₹15,000 daily self-imposed personal commitment.\n\nfirstlight.live';
        statusEl.textContent = 'Restart announcement rendered — Day 0. No Strava data needed.';
        downloadPostBtn.style.display = '';
        downloadStoryBtn.style.display = '';
        copyCaptionBtn.style.display = '';
        return;
      }
      var d = new Date();
      if (dateSelect.value === '-1') d.setDate(d.getDate() - 1);
      var dateStr = dateStrLocal(d);
      statusEl.textContent = 'Fetching ' + dateStr + ' from Strava...';

      fetchDay(dateStr, function(err, activities) {
        if (err) { statusEl.textContent = 'Fetch failed: ' + err.message; return; }
        if (!activities.length) { statusEl.textContent = 'No activities found for ' + dateStr + ' — sync Strava first.'; return; }
        currentStats = buildStats(activities, dateStr);
        if (currentStats && modeSelect && modeSelect.value === 'comeback') currentStats.comeback = true;
        fetch(SUPA + '/rest/v1/proof_archive?date=eq.' + dateStr + '&select=food_clean', { headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY } })
          .then(function(r) { return r.json(); })
          .then(function(rows) { currentStats.foodClean = (rows && rows[0]) ? rows[0].food_clean !== false : true; })
          .catch(function() { currentStats.foodClean = true; })
          .then(function() {
            renderBoth();
            captionEl.value = currentStats.comeback ? comebackCaption(currentStats) : generateCaption(currentStats);
            statusEl.textContent = 'Day ' + currentStats.day + ' · ' + currentStats.km.toFixed(1) + ' km · ' +
              (currentStats.made ? '✓ before 6 AM (' + fmtMargin(currentStats.marginMin) + ' margin)' : '✗ deadline missed — slip variant rendered') +
              (currentStats.foodClean === false ? ' · food code BROKEN' : ' · food ✓');
            downloadPostBtn.style.display = '';
            downloadStoryBtn.style.display = '';
            copyCaptionBtn.style.display = '';
          });
      });
    });

    themeSelect.addEventListener('change', function() { if (currentStats) renderBoth(); });

    downloadPostBtn.addEventListener('click', function() {
      var link = document.createElement('a');
      link.download = (currentStats.restart ? 'restart-post' : (currentStats.comeback ? 'comeback-post-day' + currentStats.day : 'daily-post-day' + currentStats.day)) + '.jpg';
      link.href = previewPost.toDataURL('image/jpeg', 0.95);
      link.click();
    });

    downloadStoryBtn.addEventListener('click', function() {
      var link = document.createElement('a');
      link.download = (currentStats.restart ? 'restart-story' : (currentStats.comeback ? 'comeback-story-day' + currentStats.day : 'daily-story-day' + currentStats.day)) + '.jpg';
      link.href = previewStory.toDataURL('image/jpeg', 0.95);
      link.click();
    });

    copyCaptionBtn.addEventListener('click', function() {
      navigator.clipboard.writeText(captionEl.value);
      copyCaptionBtn.textContent = 'COPIED!';
      setTimeout(function() { copyCaptionBtn.textContent = 'COPY CAPTION'; }, 2000);
    });

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
          headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
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

    function publishCanvas(canvas, params, filename) {
      return uploadCanvasToStorage(canvas, filename)
        .then(function(publicUrl) {
          params.image_url = publicUrl;
          statusEl.textContent = 'Creating Instagram container...';
          return igProxy(IG_ACCOUNT + '/media', params);
        })
        .then(function(container) {
          if (!container || !container.id) throw new Error('Container failed: ' + JSON.stringify(container));
          statusEl.textContent = 'Publishing...';
          return new Promise(function(resolve) { setTimeout(function() { resolve(container.id); }, 4000); });
        })
        .then(function(containerId) { return igProxy(IG_ACCOUNT + '/media_publish', { creation_id: containerId }); })
        .then(function(pub) {
          if (!pub || !pub.id) throw new Error('Publish failed: ' + JSON.stringify(pub));
          return pub.id;
        });
    }

    function wirePublish(btn, getCanvas, getParams, prefix, label) {
      if (!btn) return;
      btn.addEventListener('click', function() {
        if (!currentStats) { statusEl.textContent = 'Generate first!'; return; }
        btn.disabled = true;
        btn.textContent = 'PUBLISHING...';
        statusEl.textContent = 'Uploading image...';
        publishCanvas(getCanvas(), getParams(), prefix + '_day' + currentStats.day + '_' + Date.now() + '.jpg')
          .then(function(mediaId) {
            statusEl.textContent = 'Published! Media ID: ' + mediaId;
            btn.textContent = 'PUBLISHED!';
            btn.style.background = 'linear-gradient(135deg,#00E676,#00C853)';
            setTimeout(function() { btn.textContent = label; btn.style.background = ''; btn.disabled = false; }, 5000);
          })
          .catch(function(err) {
            statusEl.textContent = 'Publish failed: ' + err.message;
            btn.textContent = label;
            btn.disabled = false;
          });
      });
    }

    wirePublish(panel.querySelector('#dproofPublishPost'),
      function() { return previewPost; },
      function() { return { caption: captionEl.value || '', media_type: 'IMAGE' }; },
      'daily_post', 'PUBLISH POST TO IG');

    wirePublish(panel.querySelector('#dproofPublishStory'),
      function() { return previewStory; },
      function() { return { media_type: 'STORIES' }; },
      'daily_story', 'PUBLISH STORY TO IG');

    var swatchContainer = panel.querySelector('#dproofThemeSwatches');
    if (swatchContainer) {
      swatchContainer.addEventListener('click', function(e) {
        var swatch = e.target.closest('[data-swatch]');
        if (!swatch) return;
        themeSelect.value = swatch.dataset.swatch;
        themeSelect.dispatchEvent(new Event('change'));
        swatchContainer.querySelectorAll('[data-swatch]').forEach(function(sw) {
          sw.style.transform = sw.dataset.swatch === themeSelect.value ? 'scale(1.2)' : 'scale(1)';
        });
      });
    }
  }

  window.FL_DAILYPROOF = { renderStory: renderStory, renderPost: renderPost, buildStats: buildStats, renderRestartStory: renderRestartStory, renderRestartPost: renderRestartPost, renderComebackStory: renderComebackStory, renderComebackPost: renderComebackPost };

  if (typeof window.switchPanel === 'function') {
    var _origSwitch = window.switchPanel;
    window.switchPanel = function(name) {
      _origSwitch(name);
      if (name === 'dailyproof') initDailyProofPanel();
    };
  }
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(initDailyProofPanel, 500);
  });
})();
