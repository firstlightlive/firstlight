// ═══════════════════════════════════════════
// FIRST LIGHT — AI REFLECTION (Gemini)
// ═══════════════════════════════════════════

var _aiLastRun = 0;
var _AI_COOLDOWN = 60000; // 60 second cooldown between API calls

async function runAiReflection() {
  // Cooldown check
  var now = Date.now();
  if (now - _aiLastRun < _AI_COOLDOWN) {
    var secs = Math.ceil((_AI_COOLDOWN - (now - _aiLastRun)) / 1000);
    alert('Please wait ' + secs + ' seconds before running another analysis.');
    return;
  }

  // Try multiple key sources: fl_aikey (Gemini), fl_api_keys.gemini, fl_api_keys.anthropic
  var apiKey = localStorage.getItem('fl_aikey') || '';
  var provider = 'gemini';
  if (!apiKey) {
    var keys = JSON.parse(localStorage.getItem('fl_api_keys') || '{}');
    if (keys.gemini) { apiKey = keys.gemini; provider = 'gemini'; }
    else if (keys.anthropic) { apiKey = keys.anthropic; provider = 'anthropic'; }
  }

  if (!apiKey) {
    alert('Add your Gemini API key in the Carousel Generator (AI toggle) or System settings first.');
    return;
  }

  var days = parseInt(document.getElementById('aiTimeRange').value);
  var data = gatherReflectionData(days);
  var btn = document.getElementById('aiAnalyzeBtn');
  var status = document.getElementById('aiStatus');
  _aiLastRun = now;
  btn.disabled = true; btn.textContent = 'ANALYZING...';
  status.textContent = 'Sending ' + days + ' days of data to AI...';

  try {
    var result;
    var prompt = buildReflectionPrompt(data);

    if (provider === 'anthropic') {
      var res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6-20250514',
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      result = await res.json();
      if (result.content && result.content[0]) {
        document.getElementById('aiReflectionOutput').innerHTML = formatAiResponse(result.content[0].text);
        status.textContent = 'Analysis complete (Claude) — ' + new Date().toLocaleTimeString();
      } else {
        document.getElementById('aiReflectionOutput').innerHTML = '<div style="color:var(--red)">Error: ' + JSON.stringify(result.error || result) + '</div>';
      }
    } else {
      // Gemini
      var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;
      var res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });
      result = await res.json();
      if (result.candidates && result.candidates[0] && result.candidates[0].content) {
        var text = result.candidates[0].content.parts[0].text;
        document.getElementById('aiReflectionOutput').innerHTML = formatAiResponse(text);
        status.textContent = 'Analysis complete (Gemini) — ' + new Date().toLocaleTimeString();
      } else {
        var errMsg = result.error ? result.error.message : JSON.stringify(result);
        document.getElementById('aiReflectionOutput').innerHTML = '<div style="color:var(--red)">Error: ' + errMsg + '</div>';
      }
    }
  } catch(e) {
    document.getElementById('aiReflectionOutput').innerHTML = '<div style="color:var(--red)">Error: ' + e.message + '. Make sure you are online.</div>';
  }
  btn.disabled = false; btn.textContent = 'ANALYZE';
}

function gatherReflectionData(days) {
  var data = { journal: [], dailyLogs: [], rituals: [], mastery: [] };
  for (var i = 0; i < days; i++) {
    var d = new Date(); d.setDate(d.getDate() - i);
    var ds = (d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));
    var jAll = JSON.parse(localStorage.getItem('fl_journal') || '{}');
    if (jAll[ds]) data.journal.push(Object.assign({date: ds}, jAll[ds]));
    var morn = JSON.parse(localStorage.getItem('fl_rituals_morning_' + ds) || '[]');
    var eve = JSON.parse(localStorage.getItem('fl_rituals_evening_' + ds) || '[]');
    if (morn.length || eve.length) data.rituals.push({date: ds, morning: morn.length, evening: eve.length});
    var mastery = getMasteryDaily(ds);
    var mStats = computeMasteryStats(mastery);
    if (mStats.completed > 0) data.mastery.push({date: ds, completed: mStats.completed, pct: mStats.pct});
  }
  var proof = getProofData();
  proof.slice(0, days).forEach(function(p) { data.dailyLogs.push(p); });
  // Include voice journal transcripts
  var cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  var cutoffStr = (cutoffDate.getFullYear()+'-'+String(cutoffDate.getMonth()+1).padStart(2,'0')+'-'+String(cutoffDate.getDate()).padStart(2,'0'));
  var voiceEntries = (typeof getVoiceEntries === 'function') ? getVoiceEntries() : [];
  data.voiceJournal = voiceEntries.filter(function(e) { return e.date >= cutoffStr; }).map(function(e) {
    return { date: e.date, transcript: e.transcript, intensity: e.emotional_intensity, mood: e.mood, tags: e.tags };
  });
  return data;
}

function buildReflectionPrompt(data) {
  var hasVoice = data.voiceJournal && data.voiceJournal.length > 0;
  return 'You are a personal development analyst reviewing data for a disciplined individual who tracks daily rituals (morning/evening), journal reflections, mastery items (25 skills across social intelligence, communication, mental performance, brand/career, relationships), and fitness (sleep, running, gym, food).' +
  (hasVoice ? ' This person also records VOICE JOURNAL entries which are transcribed. Pay special attention to voice entries with emotional_intensity >= 7 — these indicate distress and should be prioritized in your ALARMING PATTERNS section.' : '') +
  '\n\nAnalyze this data and provide EXACTLY these 5 sections:\n\n' +
  '## STRENGTHS\nWhat patterns show strong discipline and consistency?\n\n' +
  '## AREAS NEEDING WORK\nWhere are the gaps or declining trends?\n\n' +
  '## ALARMING PATTERNS\nRed flags in sleep, mood, energy, missed rituals, or declining metrics.' + (hasVoice ? ' Include analysis of voice journal emotional patterns.' : '') + '\n\n' +
  '## LIFE TRAJECTORY\nBased on current patterns, where is this person heading in 6 months?\n\n' +
  '## PRIORITIZED ACTIONS\nTop 3 specific, actionable changes to make THIS WEEK.\n\n' +
  'DATA:\n' + JSON.stringify(data, null, 2);
}

function formatAiResponse(text) {
  return text
    .replace(/## (.*)/g, '<div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:var(--cyan);margin:20px 0 8px;letter-spacing:1px">$1</div>')
    .replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--text)">$1</strong>')
    .replace(/\n- /g, '\n\u2022 ')
    .replace(/\n/g, '<br>');
}
 
