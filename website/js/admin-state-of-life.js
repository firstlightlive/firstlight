// ═══════════════════════════════════════════════════════
// FIRST LIGHT — STATE OF LIFE DASHBOARD
// "One Screen, One Truth" — 5 Life Dimensions
// Physical · Mental · Spiritual · Social · Financial
// ═══════════════════════════════════════════════════════

(function () {
  // ── DATE UTILS ──────────────────────────────────────
  function _ds(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function _getLast7(anchorDate) {
    var days = [];
    var base = anchorDate || new Date();
    for (var i = 6; i >= 0; i--) {
      var d = new Date(base);
      d.setDate(base.getDate() - i);
      days.push(_ds(d));
    }
    return days;
  }

  function _avg(arr) {
    var v = arr.filter(function (x) { return x !== null && x !== undefined && !isNaN(x); });
    return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null;
  }

  function _clamp(v) { return Math.min(100, Math.max(0, Math.round(v || 0))); }

  function _parseTime(s) {
    if (!s) return null;
    s = s.trim().replace(/\s/g, '');
    var m = s.match(/^(\d{1,2}):(\d{2})(AM|PM)?$/i);
    if (!m) return null;
    var h = parseInt(m[1]), mn = parseInt(m[2]);
    if (/PM/i.test(s) && h < 12) h += 12;
    if (/AM/i.test(s) && h === 12) h = 0;
    return h + mn / 60;
  }

  // ── SCORE: PHYSICAL ─────────────────────────────────
  // Sleep avg (30%) · Runs 7d (35%) · Gym 7d (35%)
  function _physical(days7) {
    var proof = (typeof getProofData === 'function') ? getProofData() : [];
    var pm = {};
    proof.forEach(function (p) { pm[p.date] = p; });

    var sleeps = [], runs = 0, gyms = 0;
    days7.forEach(function (date) {
      var p = pm[date] || {};
      if (p.sleepHrs) sleeps.push(parseFloat(p.sleepHrs));
      if (p.runKm > 0) runs++;
      if (p.gym) gyms++;
      // Also check direct gym log (in case proof not sealed)
      if (!p.gym) {
        try {
          var gw = JSON.parse(localStorage.getItem('fl_gym_workout_' + date) || 'null');
          if (gw && gw.exercises && gw.exercises.length > 0) gyms++;
        } catch (e) {}
      }
    });

    var sleepAvg = _avg(sleeps);
    // 5h=50, 6h=80, 7h=93, 8h+=100
    var sleepScore = sleepAvg ? _clamp((sleepAvg / 8) * 100) : 0;
    if (sleepAvg && sleepAvg >= 6) sleepScore = _clamp(80 + (sleepAvg - 6) * 10);
    var runScore = runs >= 4 ? 100 : runs === 3 ? 85 : runs === 2 ? 60 : runs === 1 ? 30 : 0;
    var gymScore = gyms >= 4 ? 100 : gyms === 3 ? 85 : gyms === 2 ? 60 : gyms === 1 ? 30 : 0;

    return {
      score: _clamp(sleepScore * 0.30 + runScore * 0.35 + gymScore * 0.35),
      sleepAvg: sleepAvg ? sleepAvg.toFixed(1) : null,
      runs: runs, gyms: gyms
    };
  }

  // ── SCORE: MENTAL ────────────────────────────────────
  // Mastery avg 7d (60%) · Deep Work hours (40%)
  function _mental(days7) {
    var mastScores = [], dwHours = 0, dwSessions = 0;

    days7.forEach(function (date) {
      // Mastery score
      var ms = (typeof faMasteryScore === 'function') ? faMasteryScore(date) : null;
      if (ms !== null) mastScores.push(ms);

      // Deep work
      try {
        var dw = JSON.parse(localStorage.getItem('fl_deepwork_' + date) || 'null');
        if (dw && dw.blocks) {
          dw.blocks.forEach(function (b) {
            if (b.done) {
              dwSessions++;
              if (b.time && b.time.indexOf('-') > -1) {
                var pts = b.time.split('-');
                var s = _parseTime(pts[0]), e = _parseTime(pts[1]);
                if (s !== null && e !== null && e > s) dwHours += (e - s);
              } else { dwHours += 1.5; }
            }
          });
        }
      } catch (e) {}
    });

    var mastAvg = _avg(mastScores);
    var mastScore = mastAvg !== null ? _clamp(mastAvg) : 0;
    var dwPerDay = dwHours / 7;
    var dwScore = dwPerDay >= 3 ? 100 : dwPerDay >= 2 ? 75 : dwPerDay >= 1 ? 50 : dwPerDay >= 0.5 ? 25 : 0;

    return {
      score: _clamp(mastScore * 0.60 + dwScore * 0.40),
      mastAvg: mastAvg !== null ? Math.round(mastAvg) : null,
      dwHours: parseFloat(dwHours.toFixed(1)), dwSessions: dwSessions
    };
  }

  // ── SCORE: SPIRITUAL ─────────────────────────────────
  // Brahma clean days 7d (70%) · Ekadashi compliance (30%)
  function _spiritual(days7) {
    var cleanDays = 0;
    days7.forEach(function (date) {
      var bd = (typeof faGetDay === 'function') ? faGetDay(date) : null;
      if (bd && (typeof faDayScore === 'function') && faDayScore(bd) >= 6) cleanDays++;
    });

    var brahmaScore = _clamp(cleanDays / 7 * 100);

    var ekScore = 75; // default = no data, give benefit of doubt
    try {
      // fl_ekadashi_log is an OBJECT keyed by date: { 'YYYY-MM-DD': { status, name, paksha, note } }
      var logObj = JSON.parse(localStorage.getItem('fl_ekadashi_log') || '{}');
      var ekDates = Object.keys(logObj).sort(); // ascending
      if (ekDates.length >= 2) {
        var last2 = ekDates.slice(-2);
        var ok = last2.filter(function (d) { return logObj[d] && logObj[d].status === 'observed'; }).length;
        ekScore = ok === 2 ? 100 : ok === 1 ? 50 : 0;
      } else if (ekDates.length === 1) {
        ekScore = (logObj[ekDates[0]] && logObj[ekDates[0]].status === 'observed') ? 100 : 0;
      }
    } catch (e) {}

    return {
      score: _clamp(brahmaScore * 0.70 + ekScore * 0.30),
      cleanDays: cleanDays, brahmaScore: brahmaScore, ekScore: ekScore
    };
  }

  // ── SCORE: SOCIAL ────────────────────────────────────
  // Mastery social domains A+E (70%) · Instagram posts (30%)
  // igPostCount is pre-fetched from Supabase by renderStateOfLife
  function _social(days7, igPostCount) {
    var socialItems = (typeof MASTERY_ITEMS !== 'undefined')
      ? MASTERY_ITEMS.filter(function (i) { return i.domain === 'A' || i.domain === 'E'; })
      : [];

    var socialPcts = [];
    days7.forEach(function (date) {
      try {
        var data = JSON.parse(localStorage.getItem('fl_mastery_daily_' + date) || '{}');
        if (socialItems.length > 0 && Object.keys(data).length > 0) {
          var done = socialItems.filter(function (item) {
            var e = data[item.id];
            return e && (e.done === true || (e.value && e.value !== ''));
          }).length;
          socialPcts.push(Math.round(done / socialItems.length * 100));
        }
      } catch (e) {}
    });

    var mastSocialAvg = _avg(socialPcts);
    var mastSocialScore = mastSocialAvg !== null ? _clamp(mastSocialAvg) : 50;

    var igPosts = igPostCount || 0;
    var igScore = igPosts >= 5 ? 100 : igPosts === 4 ? 85 : igPosts === 3 ? 70 : igPosts === 2 ? 50 : igPosts === 1 ? 25 : 0;

    return {
      score: _clamp(mastSocialScore * 0.70 + igScore * 0.30),
      mastSocialScore: mastSocialScore, igPosts: igPosts,
      mastSocialAvg: mastSocialAvg !== null ? Math.round(mastSocialAvg) : null
    };
  }

  // ── SCORE: FINANCIAL ─────────────────────────────────
  // Clean days this month (70%) · Slip-free streak (30%)
  function _financial() {
    var slips = [];
    try { slips = JSON.parse(localStorage.getItem('fl_slips') || '[]'); } catch (e) {}

    var today = new Date();
    var monthStart = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-01';
    var dayOfMonth = today.getDate();

    var slipDates = new Set(
      slips.filter(function (s) { return s.date >= monthStart; }).map(function (s) { return s.date; })
    );
    var cleanDays = dayOfMonth - slipDates.size;
    var cleanScore = _clamp(cleanDays / dayOfMonth * 100);

    // Current streak (days since last slip)
    var streak = 0;
    var check = new Date(today);
    for (var i = 0; i < 365; i++) {
      if (slips.find(function (s) { return s.date === _ds(check); })) break;
      streak++;
      check.setDate(check.getDate() - 1);
    }
    var streakScore = streak >= 60 ? 100 : streak >= 30 ? 85 : streak >= 14 ? 70 : streak >= 7 ? 55 : streak >= 3 ? 35 : streak >= 1 ? 20 : 0;

    return {
      score: _clamp(cleanScore * 0.70 + streakScore * 0.30),
      slipDays: slipDates.size, cleanDays: cleanDays,
      dayOfMonth: dayOfMonth, streak: streak, cleanScore: cleanScore
    };
  }

  // ── OVERALL SCORE FOR A WEEK (for trend chart) ───────
  function _weekOverall(weekStartStr) {
    try {
      var start = new Date(weekStartStr + 'T00:00:00');
      var days7 = [];
      for (var i = 0; i < 7; i++) {
        var d = new Date(start);
        d.setDate(start.getDate() + i);
        days7.push(_ds(d));
      }
      var p = _physical(days7).score;
      var m = _mental(days7).score;
      var sp = _spiritual(days7).score;
      var so = _social(days7).score;
      var f = _financial().score; // month-based, not week-specific
      return Math.round((p + m + sp + so + f) / 5);
    } catch (e) { return null; }
  }

  // ── SVG PENTAGON RADAR CHART ──────────────────────────
  function _radar(scores) {
    var cx = 130, cy = 135, maxR = 105;
    var labels = ['BODY', 'MIND', 'SPIRIT', 'SOCIAL', '₹₹₹'];
    var colors = ['#00D4FF', '#F5A623', '#FF5252', '#00E676', '#F5A623'];
    var angDeg = [-90, -18, 54, 126, 198];
    var angs = angDeg.map(function (a) { return a * Math.PI / 180; });

    function pt(r, i) {
      return [cx + r * Math.cos(angs[i]), cy + r * Math.sin(angs[i])];
    }
    function ptStr(r, i) { var p = pt(r, i); return p[0].toFixed(1) + ',' + p[1].toFixed(1); }

    var gridLevels = [maxR * 0.25, maxR * 0.5, maxR * 0.75, maxR];
    var svg = '<svg width="100%" viewBox="0 0 260 280" style="max-width:280px;display:block;margin:0 auto">';

    // Glow filter
    svg += '<defs><filter id="sol-glow" x="-50%" y="-50%" width="200%" height="200%">';
    svg += '<feGaussianBlur stdDeviation="3" result="blur"/>';
    svg += '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';

    // Grid rings
    gridLevels.forEach(function (r, ri) {
      var pts = angs.map(function (_, i) { return ptStr(r, i); }).join(' ');
      svg += '<polygon points="' + pts + '" fill="none" stroke="rgba(255,255,255,' + (0.03 + ri * 0.02) + ')" stroke-width="1"/>';
    });

    // % labels on rings
    [25, 50, 75, 100].forEach(function (pct, ri) {
      var r = gridLevels[ri];
      svg += '<text x="' + (cx + 4) + '" y="' + (cy - r + 3).toFixed(1) + '" font-family="IBM Plex Mono,monospace" font-size="7" fill="rgba(255,255,255,0.2)">' + pct + '</text>';
    });

    // Axis lines
    angs.forEach(function (_, i) {
      svg += '<line x1="' + cx + '" y1="' + cy + '" x2="' + pt(maxR, i)[0].toFixed(1) + '" y2="' + pt(maxR, i)[1].toFixed(1) + '" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>';
    });

    // Filled score polygon
    var scorePts = scores.map(function (s, i) { return ptStr(s / 100 * maxR, i); }).join(' ');
    svg += '<polygon points="' + scorePts + '" fill="rgba(0,212,255,0.07)" stroke="rgba(0,212,255,0.45)" stroke-width="1.5"/>';

    // Score dots
    scores.forEach(function (s, i) {
      var p = pt(s / 100 * maxR, i);
      svg += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="6" fill="' + colors[i] + '44" filter="url(#sol-glow)"/>';
      svg += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.5" fill="' + colors[i] + '"/>';
    });

    // Outer labels with scores
    var labelPad = 22;
    var labelAnchor = ['middle', 'start', 'start', 'end', 'end'];
    scores.forEach(function (s, i) {
      var p = pt(maxR + labelPad, i);
      // Adjust x anchor for sides
      svg += '<text x="' + p[0].toFixed(1) + '" y="' + (p[1] - 7).toFixed(1) + '" text-anchor="' + labelAnchor[i] + '" font-family="IBM Plex Mono,monospace" font-size="7.5" letter-spacing="1" fill="' + colors[i] + '" font-weight="700">' + labels[i] + '</text>';
      svg += '<text x="' + p[0].toFixed(1) + '" y="' + (p[1] + 6).toFixed(1) + '" text-anchor="' + labelAnchor[i] + '" font-family="IBM Plex Mono,monospace" font-size="13" fill="rgba(255,255,255,0.75)" font-weight="700">' + s + '</text>';
    });

    svg += '</svg>';
    return svg;
  }

  // ── SCORE BAR (mini arc using div) ───────────────────
  function _bar(score, color) {
    var col = score >= 80 ? 'var(--green)' : score >= 60 ? 'var(--gold)' : 'var(--red)';
    return '<div style="height:4px;background:rgba(255,255,255,0.07);border-radius:2px;margin:10px 0">' +
      '<div style="height:100%;width:' + score + '%;background:' + col + ';border-radius:2px"></div></div>';
  }

  // ── MAIN RENDER ──────────────────────────────────────
  window.renderStateOfLife = function () {
    var el = document.getElementById('life-score-container');
    if (!el) return;

    el.innerHTML = '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);padding:30px;text-align:center">Computing life scores...</div>';

    setTimeout(async function () {
      try {
        var today = (typeof getNowIST === 'function') ? getNowIST() : new Date();
        var days7 = _getLast7(today);
        var prevDays7 = _getLast7(new Date(today.getTime() - 7 * 86400000));

        // Fetch IG posts from Supabase for this week (not in localStorage)
        var igPostCount = 0;
        try {
          if (typeof sbFetch === 'function') {
            var weekStart = days7[0];
            var igData = await sbFetch('instagram_posts', 'GET', null,
              '?select=id,timestamp&timestamp=gte.' + weekStart + 'T00:00:00Z&limit=50');
            igPostCount = (igData && Array.isArray(igData)) ? igData.length : 0;
          }
        } catch (e) {}

        var P = _physical(days7), M = _mental(days7), Sp = _spiritual(days7),
          So = _social(days7, igPostCount), F = _financial();

        var overall = Math.round((P.score + M.score + Sp.score + So.score + F.score) / 5);

        var pP = _physical(prevDays7), pM = _mental(prevDays7), pSp = _spiritual(prevDays7),
          pSo = _social(prevDays7, 0), pF = F; // financial is month-based; prev IG not fetched
        var prevOverall = Math.round((pP.score + pM.score + pSp.score + pSo.score + pF.score) / 5);

        var overallDelta = overall - prevOverall;
        var overallColor = overall >= 80 ? 'var(--green)' : overall >= 65 ? 'var(--gold)' : 'var(--red)';
        var overallLabel = overall >= 85 ? 'ELITE' : overall >= 75 ? 'STRONG' : overall >= 65 ? 'SOLID' : overall >= 50 ? 'BUILDING' : 'NEEDS WORK';
        var deltaStr = overallDelta > 0 ? '▲ +' + overallDelta : overallDelta < 0 ? '▼ ' + overallDelta : '── no change';
        var deltaCol = overallDelta > 0 ? 'var(--green)' : overallDelta < 0 ? 'var(--red)' : 'var(--text-dim)';

        var dims = [
          {
            label: 'BODY', icon: '💪', color: '#00D4FF', score: P.score, prev: pP.score,
            lines: (function() {
              var ls = [
                '😴 Sleep ' + (P.sleepAvg ? P.sleepAvg + 'h avg' : 'no data'),
                '🏃 ' + P.runs + ' run' + (P.runs !== 1 ? 's' : '') + ' this week',
                '🏋 ' + P.gyms + ' gym session' + (P.gyms !== 1 ? 's' : '')
              ];
              try {
                var wLog = JSON.parse(localStorage.getItem('fl_weight_log') || '[]');
                if (wLog.length) {
                  var latest = wLog.sort(function(a,b){return a.date<b.date?1:-1;})[0];
                  ls.push('⚖ ' + latest.kg + 'kg on ' + latest.date.slice(5));
                }
              } catch(e) {}
              return ls;
            })()
          },
          {
            label: 'MIND', icon: '🧠', color: '#F5A623', score: M.score, prev: pM.score,
            lines: [
              '⚡ Mastery ' + (M.mastAvg !== null ? M.mastAvg + '%' : 'no data'),
              '🎯 ' + M.dwHours + 'h deep work',
              '📦 ' + M.dwSessions + ' blocks done'
            ]
          },
          {
            label: 'SPIRIT', icon: '🔥', color: '#FF5252', score: Sp.score, prev: pSp.score,
            lines: [
              '🛡 Brahma ' + Sp.cleanDays + '/7 clean',
              '🙏 Ekadashi ' + (Sp.ekScore >= 80 ? '✓ clean' : Sp.ekScore >= 50 ? '~ partial' : '✗ broken')
            ]
          },
          {
            label: 'SOCIAL', icon: '🌐', color: '#00E676', score: So.score, prev: pSo.score,
            lines: [
              '👁 Social mastery ' + (So.mastSocialAvg !== null ? So.mastSocialAvg + '%' : '—'),
              '📸 ' + So.igPosts + ' IG post' + (So.igPosts !== 1 ? 's' : '') + ' this week'
            ]
          },
          {
            label: 'FINANCE', icon: '₹', color: '#F5A623', score: F.score, prev: pF.score,
            lines: [
              '✅ ' + F.cleanDays + '/' + F.dayOfMonth + ' clean days',
              '🔥 ' + F.streak + '-day streak',
              (F.slipDays > 0 ? '⚠ ' + F.slipDays + ' slip day' + (F.slipDays > 1 ? 's' : '') + ' this month' : '🏆 No slips this month')
            ]
          }
        ];

        var advice = {
          'BODY': 'Run 3-4x this week · hit 3+ gym sessions · protect 6h sleep',
          'MIND': 'Complete daily mastery items · stack 3+ deep work blocks/day',
          'SPIRIT': 'Log brahma daily — 6/7 clean minimum · honor ekadashi fasts',
          'SOCIAL': 'Do social mastery items daily · post 4-5x on Instagram',
          'FINANCE': 'Stay slip-free — every clean day compounds the streak'
        };

        var sorted = dims.slice().sort(function (a, b) { return a.score - b.score; });
        var dateLabel = today.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

        // 8-week trend
        var trendWeeks = [];
        for (var w = 7; w >= 0; w--) {
          var ws = new Date(today);
          ws.setDate(today.getDate() - w * 7 - 6);
          var wsStr = _ds(ws);
          var we = new Date(today); we.setDate(today.getDate() - w * 7);
          trendWeeks.push({ label: 'W' + (8 - w), score: _weekOverall(wsStr) });
        }
        var maxTrend = Math.max.apply(null, trendWeeks.map(function (w) { return w.score || 0; })) || 100;

        var html = '';

        // HEADER
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:8px">';
        html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:3px;color:var(--text-dim)">' + dateLabel.toUpperCase() + '</div>';
        html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-dim)">LAST 7 DAYS</div>';
        html += '</div>';

        // RADAR + HERO SCORE
        html += '<div style="display:flex;align-items:center;gap:16px;margin-bottom:28px;flex-wrap:wrap;justify-content:center">';

        // Radar
        html += '<div style="flex:0 0 auto;max-width:280px;width:100%">';
        html += _radar([P.score, M.score, Sp.score, So.score, F.score]);
        html += '</div>';

        // Score hero
        html += '<div style="flex:1;min-width:140px;text-align:center;padding:20px 0">';
        html += '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:5px;color:var(--text-dim);margin-bottom:8px">LIFE SCORE</div>';
        html += '<div style="font-family:var(--font-mono);font-size:80px;font-weight:700;color:' + overallColor + ';line-height:1;text-shadow:0 0 60px ' + overallColor + '55">' + overall + '</div>';
        html += '<div style="font-family:var(--font-mono);font-size:12px;color:var(--text-dim);margin-top:6px">/ 100</div>';
        html += '<div style="font-family:var(--font-mono);font-size:13px;font-weight:700;letter-spacing:4px;color:' + overallColor + ';margin-top:14px;border:1px solid ' + overallColor + '44;display:inline-block;padding:4px 14px;border-radius:4px">' + overallLabel + '</div>';
        html += '<div style="font-family:var(--font-mono);font-size:11px;color:' + deltaCol + ';margin-top:10px">' + deltaStr + ' vs last 7d</div>';
        html += '</div>';

        html += '</div>';

        // 5 DIMENSION CARDS
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:24px">';
        dims.forEach(function (dim) {
          var delta = dim.score - dim.prev;
          var dStr = delta > 0 ? '+' + delta + ' ▲' : delta < 0 ? delta + ' ▼' : '──';
          var dCol = delta > 0 ? 'var(--green)' : delta < 0 ? 'var(--red)' : 'var(--text-dim)';
          var sCol = dim.score >= 80 ? 'var(--green)' : dim.score >= 60 ? 'var(--gold)' : 'var(--red)';

          html += '<div style="background:rgba(255,255,255,0.02);border:1px solid ' + dim.color + '20;border-top:3px solid ' + dim.color + ';border-radius:10px;padding:14px 12px;transition:all 0.2s">';
          html += '<div style="font-family:var(--font-mono);font-size:7.5px;letter-spacing:2px;color:' + dim.color + ';margin-bottom:6px;font-weight:700">' + dim.icon + ' ' + dim.label + '</div>';
          html += '<div style="font-family:var(--font-mono);font-size:30px;font-weight:700;color:' + sCol + ';line-height:1">' + dim.score + '</div>';
          html += '<div style="font-family:var(--font-mono);font-size:9px;color:' + dCol + ';margin-top:3px">' + dStr + '</div>';
          html += _bar(dim.score, dim.color);
          dim.lines.forEach(function (line) {
            html += '<div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim);margin-bottom:3px;line-height:1.4">' + line + '</div>';
          });
          html += '</div>';
        });
        html += '</div>';

        // 8-WEEK TREND
        html += '<div style="background:rgba(255,255,255,0.015);border:1px solid rgba(0,212,255,0.06);border-radius:12px;padding:18px;margin-bottom:20px">';
        html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2.5px;color:var(--text-muted);margin-bottom:16px">8-WEEK LIFE SCORE TREND</div>';
        html += '<div style="display:flex;align-items:flex-end;gap:5px;height:90px">';
        trendWeeks.forEach(function (w, i) {
          var isNow = i === trendWeeks.length - 1;
          var h = w.score !== null ? Math.round((w.score / maxTrend) * 80) : 0;
          var col = w.score === null ? 'rgba(255,255,255,0.05)'
            : w.score >= 80 ? 'var(--green)' : w.score >= 60 ? 'var(--gold)' : 'var(--red)';
          html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">';
          html += '<div style="font-family:var(--font-mono);font-size:8.5px;color:' + (isNow ? 'var(--text)' : 'var(--text-dim)') + ';font-weight:' + (isNow ? '700' : '400') + '">' + (w.score !== null ? w.score : '–') + '</div>';
          html += '<div style="width:100%;flex:1;display:flex;align-items:flex-end"><div style="width:100%;height:' + Math.max(h, 2) + 'px;background:' + col + ';border-radius:3px 3px 0 0;opacity:' + (isNow ? '1' : '0.55') + '"></div></div>';
          html += '</div>';
        });
        html += '</div>';
        html += '<div style="display:flex;gap:5px;margin-top:6px;border-top:1px solid rgba(255,255,255,0.04);padding-top:6px">';
        trendWeeks.forEach(function (w, i) {
          var isNow = i === trendWeeks.length - 1;
          html += '<div style="flex:1;text-align:center;font-family:var(--font-mono);font-size:7px;color:' + (isNow ? 'var(--cyan)' : 'var(--text-dim)') + '">' + w.label + '</div>';
        });
        html += '</div>';
        html += '</div>';

        // NEEDS ATTENTION (bottom 2)
        html += '<div style="background:rgba(255,82,82,0.03);border:1px solid rgba(255,82,82,0.12);border-radius:12px;padding:16px;margin-bottom:20px">';
        html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:3px;color:rgba(255,82,82,0.8);margin-bottom:14px">⚠ NEEDS ATTENTION</div>';
        sorted.slice(0, 2).forEach(function (dim, i) {
          html += '<div style="display:flex;align-items:flex-start;gap:14px;padding:10px 0;' + (i > 0 ? 'border-top:1px solid rgba(255,255,255,0.04)' : '') + '">';
          html += '<div style="font-family:var(--font-mono);font-size:26px;font-weight:700;color:' + (dim.score < 60 ? 'var(--red)' : 'var(--gold)') + ';min-width:40px;line-height:1">' + dim.score + '</div>';
          html += '<div>';
          html += '<div style="font-family:var(--font-mono);font-size:8.5px;letter-spacing:2px;color:' + dim.color + ';font-weight:700;margin-bottom:4px">' + dim.icon + ' ' + dim.label + '</div>';
          html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);line-height:1.5">' + (advice[dim.label] || '') + '</div>';
          html += '</div></div>';
        });
        html += '</div>';

        // FORMULA NOTE
        html += '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.04);border-radius:8px;padding:12px">';
        html += '<div style="font-family:var(--font-mono);font-size:8px;letter-spacing:2px;color:var(--text-dim);margin-bottom:6px">SCORING</div>';
        html += '<div style="font-family:var(--font-mono);font-size:9px;color:rgba(255,255,255,0.25);line-height:1.8">';
        html += 'BODY: Sleep 30% · Runs 35% · Gym 35%<br>';
        html += 'MIND: Mastery 60% · Deep Work 40%<br>';
        html += 'SPIRIT: Brahma 70% · Ekadashi 30%<br>';
        html += 'SOCIAL: Social Mastery 70% · Instagram 30%<br>';
        html += 'FINANCE: Clean Days 70% · Streak 30%';
        html += '</div></div>';

        el.innerHTML = html;
      } catch (err) {
        console.error('[StateOfLife]', err);
        el.innerHTML = '<div style="font-family:var(--font-mono);color:var(--red);padding:20px">Error computing scores: ' + err.message + '</div>';
      }
    }, 60);
  };

})();
