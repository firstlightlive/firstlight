// ═══════════════════════════════════════════
// FIRST LIGHT — LIFE CALENDAR
// AI-powered daily quality tracking
// ═══════════════════════════════════════════

var _lcMonth = new Date().getMonth();
var _lcYear = new Date().getFullYear();

// ══════════════════════════════════════
// COMPUTE DAY SCORE (0-100)
// ══════════════════════════════════════
function computeDayScore(dateStr) {
  var score = 0;
  var hasData = false;

  // ── 1. Rituals (weight 25%) ──
  var ritualTotal = 0;
  var ritualDone = 0;
  ['morning', 'midday', 'evening'].forEach(function(period) {
    var defs = getRitualDefs(period);
    var key = 'fl_rituals_' + period + '_' + dateStr;
    var raw = JSON.parse(localStorage.getItem(key) || '[]');
    if (raw.length > 0) hasData = true;
    ritualTotal += defs.length;
    // Support both index-based and ID-based formats
    raw.forEach(function(v) {
      if (typeof v === 'string') {
        ritualDone++;
      } else if (typeof v === 'number' && v < defs.length) {
        ritualDone++;
      }
    });
  });
  var ritualPct = ritualTotal > 0 ? (ritualDone / ritualTotal * 100) : 0;
  score += ritualPct * 0.25;

  // ── 2. Mastery (weight 20%) ──
  var masteryRaw = localStorage.getItem('fl_mastery_daily_' + dateStr);
  var masteryPct = 0;
  if (masteryRaw) {
    try {
      var masteryData = JSON.parse(masteryRaw);
      var mItems = masteryData.items || masteryData;
      var mTotal = 0;
      var mDone = 0;
      if (Array.isArray(mItems)) {
        mTotal = mItems.length;
        mItems.forEach(function(it) { if (it.done) mDone++; });
      } else if (typeof mItems === 'object') {
        var mKeys = Object.keys(mItems);
        mTotal = mKeys.length;
        mKeys.forEach(function(k) { if (mItems[k].done) mDone++; });
      }
      if (mTotal > 0) {
        masteryPct = mDone / mTotal * 100;
        hasData = true;
      }
    } catch(e) {}
  }
  score += masteryPct * 0.20;

  // ── 3. Run (weight 20%) ──
  var proofData = JSON.parse(localStorage.getItem('fl_proof_data') || '[]');
  var dayProof = null;
  for (var i = 0; i < proofData.length; i++) {
    if (proofData[i].date === dateStr) { dayProof = proofData[i]; break; }
  }
  if (dayProof) {
    hasData = true;
    var runKm = parseFloat(dayProof.runKm) || 0;
    score += (runKm > 2 ? 100 : 0) * 0.20;

    // ── 4. Gym (weight 10%) ──
    var didGym = dayProof.gym === true || dayProof.gym === 'true' || dayProof.gym === 1;
    score += (didGym ? 100 : 0) * 0.10;

    // ── 5. Sleep (weight 15%) ──
    var sleepHrs = parseFloat(dayProof.sleepHrs) || 0;
    var sleepScore = sleepHrs >= 7 ? 100 : (sleepHrs >= 6 ? 70 : 30);
    score += sleepScore * 0.15;
  }

  // ── 6. Journal mood (weight 10%) ──
  var journalRaw = localStorage.getItem('fl_journal');
  if (journalRaw) {
    try {
      var journalData = JSON.parse(journalRaw);
      var entry = journalData[dateStr];
      if (entry && entry.mood) {
        hasData = true;
        score += Math.min(entry.mood * 10, 100) * 0.10;
      }
    } catch(e) {}
  }

  return { score: Math.round(score), hasData: hasData };
}

// ══════════════════════════════════════
// GET DAY METRICS (for detail card)
// ══════════════════════════════════════
function getDayMetrics(dateStr) {
  var metrics = {
    ritualsDone: 0, ritualsTotal: 0,
    masteryDone: 0, masteryTotal: 0,
    runKm: 0, gym: false, sleepHrs: 0,
    journalMood: null, foodClean: null, mood: null
  };

  // Rituals
  ['morning', 'midday', 'evening'].forEach(function(period) {
    var defs = getRitualDefs(period);
    var key = 'fl_rituals_' + period + '_' + dateStr;
    var raw = JSON.parse(localStorage.getItem(key) || '[]');
    metrics.ritualsTotal += defs.length;
    raw.forEach(function(v) {
      if (typeof v === 'string' || typeof v === 'number') metrics.ritualsDone++;
    });
  });

  // Mastery
  var masteryRaw = localStorage.getItem('fl_mastery_daily_' + dateStr);
  if (masteryRaw) {
    try {
      var masteryData = JSON.parse(masteryRaw);
      var mItems = masteryData.items || masteryData;
      if (Array.isArray(mItems)) {
        metrics.masteryTotal = mItems.length;
        mItems.forEach(function(it) { if (it.done) metrics.masteryDone++; });
      } else if (typeof mItems === 'object') {
        var mKeys = Object.keys(mItems);
        metrics.masteryTotal = mKeys.length;
        mKeys.forEach(function(k) { if (mItems[k].done) metrics.masteryDone++; });
      }
    } catch(e) {}
  }

  // Proof data
  var proofData = JSON.parse(localStorage.getItem('fl_proof_data') || '[]');
  for (var i = 0; i < proofData.length; i++) {
    if (proofData[i].date === dateStr) {
      metrics.runKm = parseFloat(proofData[i].runKm) || 0;
      metrics.gym = proofData[i].gym === true || proofData[i].gym === 'true' || proofData[i].gym === 1;
      metrics.sleepHrs = parseFloat(proofData[i].sleepHrs) || 0;
      metrics.foodClean = proofData[i].foodClean;
      metrics.mood = proofData[i].mood;
      break;
    }
  }

  // Journal
  var journalRaw = localStorage.getItem('fl_journal');
  if (journalRaw) {
    try {
      var journalData = JSON.parse(journalRaw);
      var entry = journalData[dateStr];
      if (entry) metrics.journalMood = entry.mood || null;
    } catch(e) {}
  }

  return metrics;
}

// ══════════════════════════════════════
// RENDER LIFE CALENDAR
// ══════════════════════════════════════
function renderLifeCalendar() {
  var container = document.getElementById('lc-calendar-grid');
  var monthLabel = document.getElementById('lc-month-label');
  if (!container || !monthLabel) return;

  var year = _lcYear;
  var month = _lcMonth;
  var months = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
  monthLabel.textContent = months[month] + ' ' + year;

  var firstDay = new Date(year, month, 1);
  var lastDay = new Date(year, month + 1, 0);
  var startDow = (firstDay.getDay() + 6) % 7; // Mon=0
  var totalDays = lastDay.getDate();
  var today = new Date();
  var todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

  var html = '';
  // Day headers
  var dayHeaders = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
  dayHeaders.forEach(function(d) {
    html += '<div class="lc-header-cell">' + d + '</div>';
  });

  // Empty cells before first day
  for (var e = 0; e < startDow; e++) {
    html += '<div class="lc-cell lc-empty"></div>';
  }

  // Day cells
  for (var d = 1; d <= totalDays; d++) {
    var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    var result = computeDayScore(dateStr);
    var dotClass = 'lc-dot-gray';
    if (result.hasData) {
      if (result.score >= 70) dotClass = 'lc-dot-green';
      else if (result.score >= 40) dotClass = 'lc-dot-gold';
      else dotClass = 'lc-dot-red';
    }
    var isToday = dateStr === todayStr;
    html += '<div class="lc-cell' + (isToday ? ' lc-today' : '') + '" data-date="' + dateStr + '">';
    html += '<div class="lc-day-num">' + d + '</div>';
    html += '<div class="lc-dot ' + dotClass + '"></div>';
    if (result.hasData) html += '<div class="lc-score">' + result.score + '</div>';
    html += '</div>';
  }

  container.innerHTML = html;

  // Bind click events
  var cells = container.querySelectorAll('.lc-cell[data-date]');
  for (var c = 0; c < cells.length; c++) {
    cells[c].addEventListener('click', function() {
      // Remove previous selection
      var prev = container.querySelector('.lc-cell.lc-selected');
      if (prev) prev.classList.remove('lc-selected');
      this.classList.add('lc-selected');
      showDayInsight(this.dataset.date);
    });
  }

  // Clear detail card
  document.getElementById('lc-detail-card').innerHTML = '<div style="text-align:center;color:var(--text-dim);font-family:var(--font-mono);font-size:12px;padding:24px">Click a day to see details</div>';
}

// ══════════════════════════════════════
// MONTH NAVIGATION
// ══════════════════════════════════════
function lcPrevMonth() {
  _lcMonth--;
  if (_lcMonth < 0) { _lcMonth = 11; _lcYear--; }
  renderLifeCalendar();
}

function lcNextMonth() {
  _lcMonth++;
  if (_lcMonth > 11) { _lcMonth = 0; _lcYear++; }
  renderLifeCalendar();
}

// ══════════════════════════════════════
// SHOW DAY INSIGHT (detail card)
// ══════════════════════════════════════
function showDayInsight(dateStr) {
  var card = document.getElementById('lc-detail-card');
  if (!card) return;

  var metrics = getDayMetrics(dateStr);
  var result = computeDayScore(dateStr);
  var ritualPct = metrics.ritualsTotal > 0 ? Math.round(metrics.ritualsDone / metrics.ritualsTotal * 100) : 0;
  var masteryPct = metrics.masteryTotal > 0 ? Math.round(metrics.masteryDone / metrics.masteryTotal * 100) : 0;

  // Format date display
  var parts = dateStr.split('-');
  var dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  var dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var dateDisplay = dayNames[dateObj.getDay()] + ', ' + parseInt(parts[2]) + ' ' + monthNames[parseInt(parts[1]) - 1] + ' ' + parts[0];

  // Score color
  var scoreColor = result.score >= 70 ? 'var(--green)' : (result.score >= 40 ? 'var(--gold)' : 'var(--red)');
  if (!result.hasData) scoreColor = 'var(--text-dim)';

  var html = '';
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">';
  html += '  <div style="font-family:var(--font-mono);font-size:14px;font-weight:600;color:var(--text)">' + dateDisplay + '</div>';
  html += '  <div style="font-family:var(--font-mono);font-size:24px;font-weight:700;color:' + scoreColor + '">' + result.score + '<span style="font-size:12px;color:var(--text-dim)">/100</span></div>';
  html += '</div>';

  // Metrics grid
  html += '<div class="lc-metrics-grid">';

  // Run
  html += '<div class="lc-metric">';
  html += '  <div class="lc-metric-icon" style="color:var(--cyan)">🏃</div>';
  html += '  <div class="lc-metric-value">' + metrics.runKm.toFixed(1) + ' km</div>';
  html += '  <div class="lc-metric-label">RUN</div>';
  html += '</div>';

  // Sleep
  var sleepColor = metrics.sleepHrs >= 7 ? 'var(--green)' : (metrics.sleepHrs >= 6 ? 'var(--gold)' : 'var(--red)');
  html += '<div class="lc-metric">';
  html += '  <div class="lc-metric-icon" style="color:' + sleepColor + '">🌙</div>';
  html += '  <div class="lc-metric-value">' + metrics.sleepHrs.toFixed(1) + 'h</div>';
  html += '  <div class="lc-metric-label">SLEEP</div>';
  html += '</div>';

  // Gym
  html += '<div class="lc-metric">';
  html += '  <div class="lc-metric-icon" style="color:' + (metrics.gym ? 'var(--green)' : 'var(--red)') + '">🏋</div>';
  html += '  <div class="lc-metric-value">' + (metrics.gym ? 'YES' : 'NO') + '</div>';
  html += '  <div class="lc-metric-label">GYM</div>';
  html += '</div>';

  // Rituals
  html += '<div class="lc-metric">';
  html += '  <div class="lc-metric-icon" style="color:var(--gold)">☀</div>';
  html += '  <div class="lc-metric-value">' + metrics.ritualsDone + '/' + metrics.ritualsTotal + '</div>';
  html += '  <div class="lc-metric-label">RITUALS (' + ritualPct + '%)</div>';
  html += '</div>';

  // Mastery
  html += '<div class="lc-metric">';
  html += '  <div class="lc-metric-icon" style="color:var(--cyan)">🧠</div>';
  html += '  <div class="lc-metric-value">' + metrics.masteryDone + '/' + metrics.masteryTotal + '</div>';
  html += '  <div class="lc-metric-label">MASTERY (' + masteryPct + '%)</div>';
  html += '</div>';

  // Journal Mood
  html += '<div class="lc-metric">';
  html += '  <div class="lc-metric-icon" style="color:var(--gold)">📓</div>';
  html += '  <div class="lc-metric-value">' + (metrics.journalMood !== null ? metrics.journalMood + '/10' : '--') + '</div>';
  html += '  <div class="lc-metric-label">MOOD</div>';
  html += '</div>';

  html += '</div>';

  // AI Insight section
  var cachedInsight = localStorage.getItem('fl_insight_' + dateStr);
  if (cachedInsight) {
    html += '<div class="lc-ai-insight">';
    html += '  <div class="lc-ai-header">AI INSIGHT</div>';
    html += '  <div class="lc-ai-body">' + cachedInsight.replace(/\n/g, '<br>') + '</div>';
    html += '</div>';
  }

  html += '<div style="margin-top:16px;text-align:center">';
  html += '  <button class="btn btn-outline lc-ai-btn" id="lcAiBtn" data-date="' + dateStr + '">';
  html += (cachedInsight ? 'REGENERATE' : 'GENERATE') + ' AI INSIGHT';
  html += '  </button>';
  html += '</div>';

  // Loading indicator (hidden by default)
  html += '<div id="lc-ai-loading" style="display:none;text-align:center;padding:16px">';
  html += '  <div style="font-family:var(--font-mono);font-size:11px;color:var(--cyan);animation:pulse 1.5s infinite">Generating insight...</div>';
  html += '</div>';

  // AI result container
  html += '<div id="lc-ai-result"></div>';

  card.innerHTML = html;

  // Bind AI button
  var aiBtn = document.getElementById('lcAiBtn');
  if (aiBtn) {
    aiBtn.addEventListener('click', function() {
      generateAIInsight(this.dataset.date, getDayMetrics(this.dataset.date));
    });
  }
}

// ══════════════════════════════════════
// GENERATE AI INSIGHT (Gemini API)
// ══════════════════════════════════════
function generateAIInsight(dateStr, dayData) {
  var apiKey = localStorage.getItem('fl_aikey');
  if (!apiKey) {
    var resultEl = document.getElementById('lc-ai-result');
    if (resultEl) {
      resultEl.innerHTML = '<div style="color:var(--red);font-family:var(--font-mono);font-size:11px;padding:12px;text-align:center">No API key found. Set your Gemini key in API Keys panel.</div>';
    }
    return;
  }

  var btn = document.getElementById('lcAiBtn');
  var loading = document.getElementById('lc-ai-loading');
  if (btn) btn.style.display = 'none';
  if (loading) loading.style.display = 'block';

  var ritualPct = dayData.ritualsTotal > 0 ? Math.round(dayData.ritualsDone / dayData.ritualsTotal * 100) : 0;
  var masteryPct = dayData.masteryTotal > 0 ? Math.round(dayData.masteryDone / dayData.masteryTotal * 100) : 0;

  var prompt = 'You are a strict personal performance coach for a man building an elite discipline system called FirstLight. '
    + 'Analyze this day and provide exactly 3 things:\n'
    + '1. A 3-line summary of the day quality\n'
    + '2. What was lacking or weak\n'
    + '3. One specific recommendation for tomorrow\n\n'
    + 'Date: ' + dateStr + '\n'
    + 'Run: ' + dayData.runKm.toFixed(1) + ' km\n'
    + 'Sleep: ' + dayData.sleepHrs.toFixed(1) + ' hours\n'
    + 'Gym: ' + (dayData.gym ? 'Yes' : 'No') + '\n'
    + 'Rituals: ' + dayData.ritualsDone + '/' + dayData.ritualsTotal + ' (' + ritualPct + '%)\n'
    + 'Mastery: ' + dayData.masteryDone + '/' + dayData.masteryTotal + ' (' + masteryPct + '%)\n'
    + 'Journal Mood: ' + (dayData.journalMood !== null ? dayData.journalMood + '/10' : 'Not logged') + '\n\n'
    + 'Keep it blunt, no fluff. Use short punchy lines. Format with clear headers.';

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  })
  .then(function(resp) { return resp.json(); })
  .then(function(data) {
    var text = '';
    try {
      text = data.candidates[0].content.parts[0].text;
    } catch(e) {
      text = 'Error: Could not parse AI response.';
    }

    // Cache the result
    localStorage.setItem('fl_insight_' + dateStr, text);

    // Display
    if (loading) loading.style.display = 'none';
    var resultEl = document.getElementById('lc-ai-result');
    if (resultEl) {
      resultEl.innerHTML = '<div class="lc-ai-insight">'
        + '<div class="lc-ai-header">AI INSIGHT</div>'
        + '<div class="lc-ai-body">' + text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') + '</div>'
        + '</div>';
    }
    if (btn) { btn.style.display = 'inline-flex'; btn.textContent = 'REGENERATE AI INSIGHT'; }
  })
  .catch(function(err) {
    if (loading) loading.style.display = 'none';
    if (btn) btn.style.display = 'inline-flex';
    var resultEl = document.getElementById('lc-ai-result');
    if (resultEl) {
      resultEl.innerHTML = '<div style="color:var(--red);font-family:var(--font-mono);font-size:11px;padding:12px;text-align:center">Error: ' + err.message + '</div>';
    }
  });
}
 
