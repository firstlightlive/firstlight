// ═══════════════════════════════════════════════════════
// FIRST LIGHT — BODY WEIGHT TRACKER
// Weekly weigh-in · trend graph · BMI · goal progress
// ═══════════════════════════════════════════════════════

// ── STORAGE ──────────────────────────────────────────────────
function _bwGetLog() {
  try { return JSON.parse(localStorage.getItem('fl_weight_log') || '[]'); } catch (e) { return []; }
}

function _bwSaveLog(entries) {
  entries.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  localStorage.setItem('fl_weight_log', JSON.stringify(entries));
}

function _bwGetConfig() {
  try { return JSON.parse(localStorage.getItem('fl_bw_config') || '{}'); } catch (e) { return {}; }
}

function _bwSaveConfig(cfg) {
  localStorage.setItem('fl_bw_config', JSON.stringify(cfg));
}

function _bwSyncEntry(entry) {
  if (typeof syncSave === 'function') {
    syncSave('body_weight', { date: entry.date, weight_kg: entry.kg, body_fat_pct: entry.fat || null, notes: entry.notes || '' }, 'date');
  }
}

// ── STATS ─────────────────────────────────────────────────────
function _bwStats(entries, cfg) {
  if (!entries.length) return null;
  var sorted = entries.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  var latest = sorted[sorted.length - 1];
  var first = sorted[0];
  var current = parseFloat(latest.kg);
  var start = parseFloat(first.kg);
  var change = parseFloat((current - start).toFixed(1));
  var bmi = null;
  if (cfg.heightCm && cfg.heightCm > 0) {
    var h = cfg.heightCm / 100;
    bmi = (current / (h * h)).toFixed(1);
  }
  var goalKg = cfg.goalKg ? parseFloat(cfg.goalKg) : null;
  var goalProgress = null;
  var eta = null;
  if (goalKg !== null && start !== current) {
    goalProgress = Math.min(100, Math.max(0, Math.round(Math.abs(current - start) / Math.abs(goalKg - start) * 100)));
    // ETA based on avg weekly rate
    var weeks = sorted.length > 1 ? (new Date(latest.date) - new Date(first.date)) / (7 * 86400000) : 1;
    var weeklyRate = Math.abs(change) / Math.max(weeks, 1);
    if (weeklyRate > 0) {
      var kgLeft = Math.abs(current - goalKg);
      var weeksLeft = kgLeft / weeklyRate;
      var etaDate = new Date();
      etaDate.setDate(etaDate.getDate() + Math.round(weeksLeft * 7));
      eta = etaDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
  }
  return { current: current, start: start, change: change, bmi: bmi, goalKg: goalKg, goalProgress: goalProgress, eta: eta, latest: latest, count: sorted.length };
}

// ── SVG CHART ─────────────────────────────────────────────────
function _bwDrawChart(entries, cfg) {
  if (entries.length < 2) {
    return '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);text-align:center;padding:30px">Add at least 2 entries to see your weight chart.</div>';
  }

  var sorted = entries.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  // Show last 180 days max
  var cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 180);
  var cutStr = cutoff.getFullYear() + '-' + String(cutoff.getMonth() + 1).padStart(2, '0') + '-' + String(cutoff.getDate()).padStart(2, '0');
  var visible = sorted.filter(function (e) { return e.date >= cutStr; });
  if (visible.length < 2) visible = sorted.slice(-30);

  var weights = visible.map(function (e) { return parseFloat(e.kg); });
  var minW = Math.min.apply(null, weights);
  var maxW = Math.max.apply(null, weights);
  var goalKg = cfg.goalKg ? parseFloat(cfg.goalKg) : null;
  if (goalKg !== null) { minW = Math.min(minW, goalKg); maxW = Math.max(maxW, goalKg); }
  var pad = Math.max((maxW - minW) * 0.15, 0.5);
  minW -= pad; maxW += pad;
  var range = maxW - minW || 1;

  var W = 560, H = 200, padL = 44, padR = 12, padT = 16, padB = 28;
  var cW = W - padL - padR, cH = H - padT - padB;
  var n = visible.length;

  function xp(i) { return padL + (i / (n - 1)) * cW; }
  function yp(v) { return padT + (1 - (v - minW) / range) * cH; }

  var svg = '<svg width="100%" viewBox="0 0 ' + W + ' ' + H + '" style="display:block;overflow:visible">';

  // Y-axis grid lines (4 levels)
  var yLevels = [0, 0.33, 0.67, 1];
  yLevels.forEach(function (pct) {
    var val = (minW + pct * range).toFixed(1);
    var y = padT + (1 - pct) * cH;
    svg += '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (padL + cW) + '" y2="' + y.toFixed(1) + '" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>';
    svg += '<text x="' + (padL - 4) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end" font-family="IBM Plex Mono,monospace" font-size="8" fill="rgba(255,255,255,0.2)">' + val + '</text>';
  });

  // Goal line (dashed)
  if (goalKg !== null) {
    var gy = yp(goalKg);
    svg += '<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (padL + cW) + '" y2="' + gy.toFixed(1) + '" stroke="rgba(0,230,118,0.4)" stroke-width="1" stroke-dasharray="4 3"/>';
    svg += '<text x="' + (padL + cW - 2) + '" y="' + (gy - 4).toFixed(1) + '" text-anchor="end" font-family="IBM Plex Mono,monospace" font-size="8" fill="rgba(0,230,118,0.7)">GOAL ' + goalKg + 'kg</text>';
  }

  // Area fill under line
  var points = visible.map(function (e, i) { return xp(i).toFixed(1) + ',' + yp(parseFloat(e.kg)).toFixed(1); });
  var areaPath = 'M' + padL.toFixed(1) + ',' + (padT + cH).toFixed(1) +
    ' L' + points.join(' L') +
    ' L' + (padL + cW).toFixed(1) + ',' + (padT + cH).toFixed(1) + ' Z';
  svg += '<defs><linearGradient id="bwFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#00D4FF" stop-opacity="0.15"/><stop offset="100%" stop-color="#00D4FF" stop-opacity="0"/></linearGradient></defs>';
  svg += '<path d="' + areaPath + '" fill="url(#bwFill)"/>';

  // Weight line
  svg += '<polyline points="' + points.join(' ') + '" fill="none" stroke="#00D4FF" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';

  // 7-day moving average
  if (visible.length >= 7) {
    var maPoints = [];
    for (var i = 0; i < visible.length; i++) {
      var start = Math.max(0, i - 3), end = Math.min(visible.length - 1, i + 3);
      var slice = visible.slice(start, end + 1).map(function (e) { return parseFloat(e.kg); });
      var avg = slice.reduce(function (a, b) { return a + b; }, 0) / slice.length;
      maPoints.push(xp(i).toFixed(1) + ',' + yp(avg).toFixed(1));
    }
    svg += '<polyline points="' + maPoints.join(' ') + '" fill="none" stroke="rgba(245,166,35,0.7)" stroke-width="1.5" stroke-dasharray="3 2" stroke-linejoin="round"/>';
  }

  // Dots
  visible.forEach(function (e, i) {
    var x = xp(i), y = yp(parseFloat(e.kg));
    var isLatest = i === visible.length - 1;
    svg += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (isLatest ? 5 : 3) + '" fill="' + (isLatest ? '#00D4FF' : '#00D4FF99') + '"/>';
    if (isLatest) {
      svg += '<text x="' + x.toFixed(1) + '" y="' + (y - 9).toFixed(1) + '" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="9" fill="#00D4FF" font-weight="700">' + e.kg + 'kg</text>';
    }
  });

  // X-axis date labels (up to 6)
  var labelIdx = [];
  if (n <= 6) { for (var li = 0; li < n; li++) labelIdx.push(li); }
  else { var step = Math.floor(n / 5); for (var li2 = 0; li2 < n; li2 += step) labelIdx.push(li2); if (labelIdx[labelIdx.length - 1] !== n - 1) labelIdx.push(n - 1); }

  labelIdx.forEach(function (i) {
    var d = visible[i].date;
    var short = d.slice(5); // MM-DD
    svg += '<text x="' + xp(i).toFixed(1) + '" y="' + (padT + cH + 14) + '" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="7.5" fill="rgba(255,255,255,0.2)">' + short + '</text>';
  });

  svg += '</svg>';

  var legend = '<div style="display:flex;gap:16px;margin-top:8px;flex-wrap:wrap">';
  legend += '<div style="display:flex;align-items:center;gap:5px"><div style="width:20px;height:2px;background:#00D4FF;border-radius:1px"></div><span style="font-family:var(--font-mono);font-size:8px;color:rgba(255,255,255,0.3)">WEIGHT</span></div>';
  if (visible.length >= 7) legend += '<div style="display:flex;align-items:center;gap:5px"><div style="width:20px;height:2px;background:rgba(245,166,35,0.7);border-radius:1px;border-top:1px dashed rgba(245,166,35,0.7)"></div><span style="font-family:var(--font-mono);font-size:8px;color:rgba(255,255,255,0.3)">7-DAY AVG</span></div>';
  if (goalKg !== null) legend += '<div style="display:flex;align-items:center;gap:5px"><div style="width:20px;height:1px;border-top:2px dashed rgba(0,230,118,0.4)"></div><span style="font-family:var(--font-mono);font-size:8px;color:rgba(255,255,255,0.3)">GOAL</span></div>';
  legend += '</div>';

  return svg + legend;
}

// ── MAIN RENDER ───────────────────────────────────────────────
function renderBodyWeight() {
  var el = document.getElementById('body-weight-content');
  if (!el) return;

  var entries = _bwGetLog();
  var cfg = _bwGetConfig();
  var stats = _bwStats(entries, cfg);
  var sorted = entries.slice().sort(function (a, b) { return b.date < a.date ? -1 : 1; }); // newest first
  var today = typeof getEffectiveToday === 'function' ? getEffectiveToday() : new Date().toISOString().slice(0, 10);
  var existingToday = entries.find(function (e) { return e.date === today; });

  var html = '';

  // ── SETUP STRIP (goal + height) ──
  html += '<div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:14px 16px;margin-bottom:20px">';
  html += '<div style="font-family:var(--font-mono);font-size:8.5px;letter-spacing:2px;color:var(--text-dim);margin-bottom:10px">SETUP</div>';
  html += '<div style="display:flex;gap:10px;flex-wrap:wrap">';
  html += '<div style="flex:1;min-width:110px"><div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim);margin-bottom:4px">HEIGHT (cm)</div>';
  html += '<input type="number" id="bw_height" value="' + (cfg.heightCm || '') + '" placeholder="e.g. 175" oninput="_bwSaveCfg()" style="width:100%;box-sizing:border-box;background:var(--bg3);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:8px 10px;font-family:var(--font-mono);font-size:12px;color:var(--text);outline:none"></div>';
  html += '<div style="flex:1;min-width:110px"><div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim);margin-bottom:4px">GOAL WEIGHT (kg)</div>';
  html += '<input type="number" id="bw_goal" value="' + (cfg.goalKg || '') + '" placeholder="e.g. 70" step="0.1" oninput="_bwSaveCfg()" style="width:100%;box-sizing:border-box;background:var(--bg3);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:8px 10px;font-family:var(--font-mono);font-size:12px;color:var(--text);outline:none"></div>';
  html += '</div></div>';

  // ── LOG ENTRY FORM ──
  html += '<div class="panel-section">';
  html += '<div class="panel-section-title">LOG WEIGHT</div>';
  html += '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">';
  html += '<div style="flex:1;min-width:110px"><div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim);margin-bottom:4px">DATE</div>';
  html += '<input type="date" id="bw_date" value="' + today + '" style="width:100%;box-sizing:border-box;background:var(--bg3);border:1px solid rgba(0,212,255,0.15);border-radius:6px;padding:9px 10px;font-family:var(--font-mono);font-size:11px;color:var(--text);outline:none"></div>';
  html += '<div style="flex:1;min-width:90px"><div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim);margin-bottom:4px">WEIGHT (kg)</div>';
  html += '<input type="number" id="bw_kg" value="' + (existingToday ? existingToday.kg : '') + '" placeholder="78.5" step="0.1" style="width:100%;box-sizing:border-box;background:var(--bg3);border:1px solid rgba(0,212,255,0.15);border-radius:6px;padding:9px 10px;font-family:var(--font-mono);font-size:12px;color:var(--text);outline:none"></div>';
  html += '<div style="flex:1;min-width:90px"><div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim);margin-bottom:4px">BODY FAT % <span style="opacity:0.5">(optional)</span></div>';
  html += '<input type="number" id="bw_fat" value="' + (existingToday ? (existingToday.fat || '') : '') + '" placeholder="18.5" step="0.1" style="width:100%;box-sizing:border-box;background:var(--bg3);border:1px solid rgba(255,255,255,0.06);border-radius:6px;padding:9px 10px;font-family:var(--font-mono);font-size:12px;color:var(--text);outline:none"></div>';
  html += '<div style="flex:0 0 auto"><button onclick="_bwSaveEntry()" style="padding:9px 20px;background:rgba(0,212,255,0.1);border:1px solid rgba(0,212,255,0.3);border-radius:6px;font-family:var(--font-mono);font-size:10px;letter-spacing:1px;color:var(--cyan);cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;white-space:nowrap">SAVE</button></div>';
  html += '</div>';
  html += '<div id="bw_save_msg" style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);margin-top:8px;min-height:16px"></div>';
  html += '</div>';

  // ── STATS ROW ──
  if (stats) {
    var changeColor = stats.change < 0 ? 'var(--green)' : stats.change > 0 ? 'var(--red)' : 'var(--text-dim)';
    var changeStr = (stats.change > 0 ? '+' : '') + stats.change + ' kg';
    var bmiColor = stats.bmi ?
      (stats.bmi < 18.5 ? '#70AEFF' : stats.bmi < 25 ? 'var(--green)' : stats.bmi < 30 ? 'var(--gold)' : 'var(--red)') : 'var(--text-dim)';
    var bmiLabel = stats.bmi ?
      (stats.bmi < 18.5 ? 'UNDERWEIGHT' : stats.bmi < 25 ? 'HEALTHY' : stats.bmi < 30 ? 'OVERWEIGHT' : 'OBESE') : '';

    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;margin-bottom:20px">';
    var statCards = [
      { label: 'CURRENT', val: stats.current + ' kg', color: 'var(--cyan)' },
      { label: 'STARTING', val: stats.start + ' kg', color: 'var(--text-muted)' },
      { label: 'TOTAL CHANGE', val: changeStr, color: changeColor },
      { label: 'BMI', val: stats.bmi || '—', sub: bmiLabel, color: bmiColor },
    ];
    if (stats.goalKg !== null) {
      statCards.push({ label: 'GOAL', val: stats.goalKg + ' kg', color: 'var(--green)' });
      statCards.push({ label: 'PROGRESS', val: (stats.goalProgress || 0) + '%', sub: stats.eta ? 'ETA ' + stats.eta : '', color: 'var(--gold)' });
    }
    statCards.forEach(function (c) {
      html += '<div style="background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:14px 12px;text-align:center">';
      html += '<div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:' + c.color + ';line-height:1">' + c.val + '</div>';
      if (c.sub) html += '<div style="font-family:var(--font-mono);font-size:7.5px;color:' + c.color + ';margin-top:3px;opacity:0.7">' + c.sub + '</div>';
      html += '<div style="font-family:var(--font-mono);font-size:7px;letter-spacing:1.5px;color:var(--text-dim);margin-top:6px">' + c.label + '</div>';
      html += '</div>';
    });
    html += '</div>';

    // Goal progress bar
    if (stats.goalKg !== null && stats.goalProgress !== null) {
      html += '<div style="margin-bottom:20px">';
      html += '<div style="display:flex;justify-content:space-between;margin-bottom:6px">';
      html += '<div style="font-family:var(--font-mono);font-size:8px;color:var(--text-dim)">START ' + stats.start + 'kg</div>';
      html += '<div style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:var(--gold)">' + stats.goalProgress + '% to goal</div>';
      html += '<div style="font-family:var(--font-mono);font-size:8px;color:var(--green)">GOAL ' + stats.goalKg + 'kg</div>';
      html += '</div>';
      html += '<div style="height:8px;background:rgba(255,255,255,0.06);border-radius:4px"><div style="height:100%;width:' + stats.goalProgress + '%;background:linear-gradient(90deg,var(--cyan),var(--green));border-radius:4px;transition:width 0.5s ease"></div></div>';
      html += '</div>';
    }
  }

  // ── CHART ──
  html += '<div class="panel-section">';
  html += '<div class="panel-section-title">WEIGHT TREND</div>';
  if (entries.length >= 2) {
    html += '<div style="background:rgba(0,0,0,0.2);border-radius:10px;padding:12px">';
    html += _bwDrawChart(entries, cfg);
    html += '</div>';
  } else {
    html += '<div style="background:rgba(255,255,255,0.015);border:1px dashed rgba(255,255,255,0.06);border-radius:10px;padding:30px;text-align:center">';
    html += '<div style="font-size:32px;margin-bottom:10px">📉</div>';
    html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim)">Log at least 2 entries to see your trend graph</div>';
    html += '</div>';
  }
  html += '</div>';

  // ── HISTORY TABLE ──
  html += '<div class="panel-section">';
  html += '<div class="panel-section-title">HISTORY</div>';
  if (!sorted.length) {
    html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);padding:16px 0">No entries yet. Log your first weight above.</div>';
  } else {
    html += '<div style="overflow-x:auto">';
    html += '<table style="width:100%;border-collapse:collapse">';
    html += '<thead><tr>';
    ['DATE', 'WEIGHT', 'BODY FAT', 'CHANGE', ''].forEach(function (h) {
      html += '<th style="font-family:var(--font-mono);font-size:8px;letter-spacing:1.5px;color:var(--text-dim);padding:6px 4px;text-align:left;border-bottom:1px solid rgba(255,255,255,0.05)">' + h + '</th>';
    });
    html += '</tr></thead><tbody>';

    sorted.forEach(function (e, i) {
      var prev = sorted[i + 1]; // next oldest
      var delta = prev ? parseFloat((parseFloat(e.kg) - parseFloat(prev.kg)).toFixed(1)) : null;
      var dStr = delta !== null ? (delta > 0 ? '+' + delta : delta) + ' kg' : '—';
      var dCol = delta === null ? 'var(--text-dim)' : delta < 0 ? 'var(--green)' : delta > 0 ? 'var(--red)' : 'var(--text-dim)';
      var isToday2 = e.date === today;

      html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.03)">';
      html += '<td style="font-family:var(--font-mono);font-size:10px;color:' + (isToday2 ? 'var(--cyan)' : 'var(--text-muted)') + ';padding:8px 4px">' + e.date + (isToday2 ? ' <span style="font-size:8px;color:var(--cyan);opacity:0.7">TODAY</span>' : '') + '</td>';
      html += '<td style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--text);padding:8px 4px">' + e.kg + ' kg</td>';
      html += '<td style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);padding:8px 4px">' + (e.fat ? e.fat + '%' : '—') + '</td>';
      html += '<td style="font-family:var(--font-mono);font-size:11px;font-weight:700;color:' + dCol + ';padding:8px 4px">' + dStr + '</td>';
      html += '<td style="padding:8px 4px;text-align:right"><button onclick="_bwDeleteEntry(\'' + e.date + '\')" style="font-family:var(--font-mono);font-size:9px;color:var(--red);background:transparent;border:none;cursor:pointer;opacity:0.5;-webkit-tap-highlight-color:transparent" title="Delete">✕</button></td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';
  }
  html += '</div>';

  // ── SUPABASE SQL NOTE ──
  html += '<details style="margin-top:16px">';
  html += '<summary style="font-family:var(--font-mono);font-size:9px;letter-spacing:1px;color:var(--text-dim);cursor:pointer;-webkit-tap-highlight-color:transparent">SUPABASE SETUP (run once)</summary>';
  html += '<div style="background:rgba(0,0,0,0.3);border-radius:6px;padding:12px;margin-top:8px;font-family:var(--font-mono);font-size:9px;color:rgba(255,255,255,0.4);line-height:1.8;white-space:pre-wrap">';
  html += 'CREATE TABLE IF NOT EXISTS public.body_weight (\n  date DATE PRIMARY KEY,\n  weight_kg DECIMAL(5,2),\n  body_fat_pct DECIMAL(4,1),\n  notes TEXT,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\nALTER TABLE public.body_weight ENABLE ROW LEVEL SECURITY;\nCREATE POLICY open_access ON public.body_weight\n  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);';
  html += '</div></details>';

  el.innerHTML = html;
}

// ── ENTRY ACTIONS ─────────────────────────────────────────────
function _bwSaveEntry() {
  var dateEl = document.getElementById('bw_date');
  var kgEl = document.getElementById('bw_kg');
  var fatEl = document.getElementById('bw_fat');
  var msg = document.getElementById('bw_save_msg');

  if (!dateEl || !kgEl) return;
  var date = dateEl.value.trim();
  var kg = parseFloat(kgEl.value);
  if (!date || isNaN(kg) || kg <= 0) {
    if (msg) { msg.textContent = 'Enter a valid date and weight.'; msg.style.color = 'var(--red)'; }
    return;
  }

  var entries = _bwGetLog();
  var idx = entries.findIndex(function (e) { return e.date === date; });
  var entry = { date: date, kg: kg, fat: fatEl && fatEl.value ? parseFloat(fatEl.value) : null };

  if (idx >= 0) entries[idx] = entry; else entries.push(entry);
  _bwSaveLog(entries);
  _bwSyncEntry(entry);

  if (msg) { msg.textContent = '✓ Saved — ' + kg + ' kg on ' + date; msg.style.color = 'var(--green)'; }
  setTimeout(function () { renderBodyWeight(); }, 600);
}

function _bwDeleteEntry(date) {
  if (!confirm('Delete weight entry for ' + date + '?')) return;
  var entries = _bwGetLog().filter(function (e) { return e.date !== date; });
  _bwSaveLog(entries);
  renderBodyWeight();
}

function _bwSaveCfg() {
  var h = document.getElementById('bw_height');
  var g = document.getElementById('bw_goal');
  var cfg = _bwGetConfig();
  if (h && h.value) cfg.heightCm = parseFloat(h.value);
  if (g && g.value) cfg.goalKg = parseFloat(g.value);
  _bwSaveConfig(cfg);
}
