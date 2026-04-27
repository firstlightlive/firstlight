// ═══════════════════════════════════════════
// FIRST LIGHT — VOICE JOURNAL
// Record, transcribe via Gemini, analyze emotional intensity
// ═══════════════════════════════════════════

var voiceState = { recording: false, mediaRecorder: null, chunks: [], startTime: 0, timerInterval: null, audioCtx: null };

// ── RECORDING ──

function toggleVoiceRecording() {
  if (voiceState.recording) stopVoiceRecording();
  else startVoiceRecording();
}

function startVoiceRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('Your browser does not support audio recording.');
    return;
  }
  navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
    var mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
    voiceState.mediaRecorder = new MediaRecorder(stream, { mimeType: mimeType });
    voiceState.chunks = [];
    voiceState.startTime = Date.now();
    voiceState.recording = true;

    voiceState.mediaRecorder.ondataavailable = function(e) { if (e.data.size > 0) voiceState.chunks.push(e.data); };
    voiceState.mediaRecorder.onstop = function() { processVoiceRecording(); };
    voiceState.mediaRecorder.start(250); // Collect data every 250ms

    // Update UI
    var fab = document.getElementById('voiceFab');
    if (fab) { fab.classList.add('recording'); fab.querySelector('#voiceFabIcon').textContent = '⏹'; }
    showVoiceSheet();
    startVoiceTimer();
    startWaveformAnimation(stream);
  }).catch(function(err) {
    alert('Microphone access denied. Please allow microphone in browser settings.\n\n' + err.message);
  });
}

function stopVoiceRecording() {
  if (voiceState.mediaRecorder && voiceState.recording) {
    voiceState.recording = false;
    voiceState.mediaRecorder.stop();
    voiceState.mediaRecorder.stream.getTracks().forEach(function(t) { t.stop(); });
    if (voiceState.audioCtx) { voiceState.audioCtx.close(); voiceState.audioCtx = null; }
    clearInterval(voiceState.timerInterval);
    var fab = document.getElementById('voiceFab');
    if (fab) { fab.classList.remove('recording'); fab.querySelector('#voiceFabIcon').textContent = '🎙'; }
  }
}

function cancelVoiceRecording() {
  voiceState.recording = false;
  if (voiceState.mediaRecorder && voiceState.mediaRecorder.state !== 'inactive') {
    voiceState.mediaRecorder.stop();
    voiceState.mediaRecorder.stream.getTracks().forEach(function(t) { t.stop(); });
  }
  if (voiceState.audioCtx) { voiceState.audioCtx.close(); voiceState.audioCtx = null; }
  clearInterval(voiceState.timerInterval);
  voiceState.chunks = [];
  var fab = document.getElementById('voiceFab');
  if (fab) { fab.classList.remove('recording'); fab.querySelector('#voiceFabIcon').textContent = '🎙'; }
  hideVoiceSheet();
}

// ── PROCESSING PIPELINE ──

async function processVoiceRecording() {
  var mimeType = voiceState.mediaRecorder ? voiceState.mediaRecorder.mimeType : 'audio/webm';
  var blob = new Blob(voiceState.chunks, { type: mimeType });
  var duration = Math.round((Date.now() - voiceState.startTime) / 1000);
  var date = getEffectiveToday();
  var timestamp = Date.now();

  // Voice journal is always for today, which is never locked
  // But guard anyway for safety
  if (isDateLocked(date)) { showLockWarning(); hideVoiceSheet(); return; }

  updateVoiceSheetState('transcribing');

  // 1. Transcribe via Gemini
  var transcript = await transcribeAudio(blob);

  // 2. Analyze emotional intensity
  var analysis = analyzeTranscript(transcript);

  // 3. Build entry
  var entry = {
    id: timestamp,
    date: date,
    recorded_at: new Date().toISOString(),
    duration_seconds: duration,
    transcript: transcript,
    emotional_intensity: analysis.intensity,
    mood: analysis.mood,
    tags: analysis.tags,
    audio_url: null
  };

  // 4. Save to localStorage
  var entries = JSON.parse(localStorage.getItem('fl_voice_entries') || '[]');
  entries.unshift(entry);
  localStorage.setItem('fl_voice_entries', JSON.stringify(entries));

  // 5. Sync to Supabase
  syncVoiceEntry(entry);

  // 6. Upload audio (background, non-blocking)
  uploadAudioToStorage(blob, date, timestamp).then(function(url) {
    if (url) {
      entry.audio_url = url;
      var all = JSON.parse(localStorage.getItem('fl_voice_entries') || '[]');
      var idx = all.findIndex(function(e) { return e.id === timestamp; });
      if (idx >= 0) { all[idx].audio_url = url; localStorage.setItem('fl_voice_entries', JSON.stringify(all)); }
    }
  });

  // 7. Show success
  updateVoiceSheetState('done', entry);
}

// ── TRANSCRIPTION: OpenAI Whisper (primary) → Gemini (fallback) ──

async function transcribeAudio(blob) {
  var keys = JSON.parse(localStorage.getItem('fl_api_keys') || '{}');

  // Debug: log which keys are available
  console.log('[Voice] Available keys:', Object.keys(keys).filter(function(k) { return keys[k]; }).join(', ') || 'NONE');
  console.log('[Voice] OpenAI key:', keys.openai ? 'YES (' + keys.openai.substring(0, 8) + '...)' : 'NOT SET');
  console.log('[Voice] Gemini key:', keys.gemini ? 'YES (' + keys.gemini.substring(0, 8) + '...)' : 'NOT SET');

  // Trim whitespace from keys
  if (keys.openai) keys.openai = keys.openai.trim();
  if (keys.gemini) keys.gemini = keys.gemini.trim();

  // Try OpenAI Whisper first (purpose-built for audio transcription)
  if (keys.openai && keys.openai.trim()) {
    console.log('[Voice] Using OpenAI Whisper for transcription...');
    console.log('[Voice] Audio size: ' + Math.round(blob.size / 1024) + 'KB, type: ' + (blob.type || 'unknown'));
    var result = await transcribeWithWhisper(blob, keys.openai.trim());
    if (result && !result.startsWith('[')) return result;
    // If Whisper fails, show the error directly — don't silently fall through
    console.error('[Voice] Whisper failed with:', result);
    alert('OpenAI Whisper transcription failed:\n\n' + result + '\n\nCheck your OpenAI API key and billing at platform.openai.com');
    return result;
  }

  // Fallback to Gemini only if no OpenAI key
  if (keys.gemini && keys.gemini.trim()) {
    console.log('[Voice] No OpenAI key — using Gemini fallback...');
    return await transcribeWithGemini(blob, keys.gemini.trim());
  }

  alert('No API key found for transcription.\n\nAdd your OpenAI key (sk-...) in System → API Keys.\nWhisper is the best for voice transcription.');
  return '[No API key. Add OpenAI key in System → API Keys.]';
}

// ── OpenAI Whisper API ──
async function transcribeWithWhisper(blob, apiKey) {
  try {
    var formData = new FormData();
    formData.append('file', blob, 'voice.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');

    var res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey },
      body: formData
    });

    var data = await res.json();
    console.log('[Voice] Whisper response:', JSON.stringify(data).substring(0, 200));

    if (!res.ok) {
      var errMsg = data.error ? data.error.message : 'HTTP ' + res.status;
      console.error('[Voice] Whisper error:', errMsg);
      return '[Whisper error: ' + errMsg + ']';
    }

    if (data.text) {
      console.log('[Voice] Whisper transcript: ' + data.text.substring(0, 100));
      return data.text;
    }
    return '[Whisper returned empty response]';
  } catch (e) {
    console.error('[Voice] Whisper network error:', e);
    return '[Whisper error: ' + e.message + ']';
  }
}

// ── Gemini Multimodal API (fallback) ──
async function transcribeWithGemini(blob, apiKey) {
  try {
    var base64 = await new Promise(function(resolve) {
      var reader = new FileReader();
      reader.onload = function() { resolve(reader.result.split(',')[1]); };
      reader.readAsDataURL(blob);
    });

    var mimeType = blob.type || 'audio/webm';
    var res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { inlineData: { mimeType: mimeType, data: base64 } },
          { text: 'Transcribe this audio accurately. Return ONLY the transcript text.' }
        ]}]
      })
    });

    var data = await res.json();
    console.log('[Voice] Gemini response:', JSON.stringify(data).substring(0, 200));

    if (!res.ok) {
      var errMsg = data.error ? data.error.message : 'HTTP ' + res.status;
      console.error('[Voice] Gemini error:', errMsg);
      return '[Gemini error: ' + errMsg + ']';
    }

    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
      return data.candidates[0].content.parts[0].text || '[Empty transcript]';
    }
    return '[Gemini returned no candidates]';
  } catch (e) {
    console.error('[Voice] Gemini network error:', e);
    return '[Gemini error: ' + e.message + ']';
  }
}

// ── EMOTIONAL ANALYSIS ──

var EMOTION_KEYWORDS = {
  high: ['angry','frustrated','anxious','scared','overwhelmed','crying','panic','terrible','hate','furious','depressed','hopeless','desperate','suicidal','breaking'],
  medium: ['stressed','worried','sad','tired','confused','lonely','bored','annoyed','disappointed','nervous','exhausted','drained','struggling'],
  positive: ['grateful','happy','proud','excited','peaceful','calm','focused','strong','motivated','inspired','love','amazing','breakthrough','clarity','grateful']
};

function analyzeTranscript(text) {
  if (!text || text.startsWith('[')) return { intensity: 0, mood: 'neutral', tags: [] };
  var lower = text.toLowerCase();
  var intensity = 0;
  var tags = [];
  var mood = 'neutral';

  EMOTION_KEYWORDS.high.forEach(function(kw) {
    if (lower.includes(kw)) { intensity = Math.max(intensity, 8); if (tags.indexOf(kw) < 0) tags.push(kw); mood = 'distressed'; }
  });
  EMOTION_KEYWORDS.medium.forEach(function(kw) {
    if (lower.includes(kw)) { intensity = Math.max(intensity, 5); if (tags.indexOf(kw) < 0) tags.push(kw); if (mood === 'neutral') mood = 'concerned'; }
  });
  EMOTION_KEYWORDS.positive.forEach(function(kw) {
    if (lower.includes(kw)) { if (tags.indexOf(kw) < 0) tags.push(kw); if (mood === 'neutral' || mood === 'concerned') mood = 'positive'; }
  });

  if (text.length > 500) intensity = Math.min(10, intensity + 1);
  return { intensity: Math.min(10, intensity), mood: mood, tags: tags.slice(0, 5) };
}

// ── AUDIO STORAGE ──

async function uploadAudioToStorage(blob, date, timestamp) {
  // Upload to GCS via local file server (more reliable, no storage limits)
  if (typeof uploadBlobToGcs === 'function') {
    var result = await uploadBlobToGcs(blob, 'voice', timestamp + '.webm');
    if (result.success) return result.path;
  }
  // Fallback: store locally only (sync later)
  console.warn('[Voice] GCS upload failed — audio saved locally only');
  return null;
}

async function syncVoiceEntry(entry) {
  if (!SB.init()) return;
  await sbFetch('voice_entries', 'POST', {
    date: entry.date, recorded_at: entry.recorded_at, duration_seconds: entry.duration_seconds,
    transcript: entry.transcript, emotional_intensity: entry.emotional_intensity,
    mood: entry.mood, tags: entry.tags, audio_url: entry.audio_url || null
  });
}

// ── UI: Voice Sheet ──

function showVoiceSheet() {
  var sheet = document.getElementById('voiceSheet');
  if (sheet) sheet.classList.add('open');
}

function hideVoiceSheet() {
  var sheet = document.getElementById('voiceSheet');
  if (sheet) sheet.classList.remove('open');
}

function updateVoiceSheetState(state, entry) {
  var status = document.getElementById('voiceStatus');
  var timer = document.getElementById('voiceTimer');
  if (state === 'transcribing') {
    if (status) status.textContent = 'Transcribing with Gemini...';
    if (timer) timer.style.color = 'var(--gold)';
  } else if (state === 'done' && entry) {
    if (status) {
      var preview = entry.transcript ? entry.transcript.substring(0, 100) + (entry.transcript.length > 100 ? '...' : '') : 'No transcript';
      status.innerHTML = '<div style="color:var(--green);font-weight:700;margin-bottom:8px">SAVED ✓</div>' +
        '<div style="color:var(--text-muted);font-size:12px;line-height:1.5">' + preview + '</div>' +
        (entry.tags && entry.tags.length ? '<div style="margin-top:6px">' + entry.tags.map(function(t) { return '<span style="font-size:9px;padding:2px 8px;border-radius:10px;background:var(--bg3);color:var(--text-dim);margin-right:4px">' + t + '</span>'; }).join('') + '</div>' : '');
    }
    if (timer) timer.style.color = 'var(--green)';
    // Auto-dismiss after 3s
    setTimeout(hideVoiceSheet, 3000);
  }
}

function startVoiceTimer() {
  var el = document.getElementById('voiceTimer');
  if (el) el.textContent = '00:00';
  voiceState.timerInterval = setInterval(function() {
    if (!voiceState.recording) { clearInterval(voiceState.timerInterval); return; }
    var secs = Math.round((Date.now() - voiceState.startTime) / 1000);
    var m = Math.floor(secs / 60);
    var s = secs % 60;
    if (el) el.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }, 1000);
}

function startWaveformAnimation(stream) {
  try {
    voiceState.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    var analyser = voiceState.audioCtx.createAnalyser();
    var src = voiceState.audioCtx.createMediaStreamSource(stream);
    src.connect(analyser);
    analyser.fftSize = 32;
    var bars = document.querySelectorAll('.voice-wave-bar');
    var freqData = new Uint8Array(analyser.frequencyBinCount);

    function draw() {
      if (!voiceState.recording) return;
      analyser.getByteFrequencyData(freqData);
      bars.forEach(function(bar, i) {
        var h = Math.max(4, (freqData[i % freqData.length] / 255) * 48);
        bar.style.height = h + 'px';
      });
      requestAnimationFrame(draw);
    }
    draw();
  } catch (e) {
    // AudioContext not available — waveform won't animate, recording still works
  }
}

// ── RENDER VOICE ENTRIES (for Journal Archive) ──

function getVoiceEntries() {
  try { return JSON.parse(localStorage.getItem('fl_voice_entries') || '[]'); } catch(e) { return []; }
}

function renderVoiceEntriesForDate(date) {
  var entries = getVoiceEntries().filter(function(e) { return e.date === date; });
  if (!entries.length) return '';
  var html = '<div style="margin-top:8px">';
  entries.forEach(function(e) {
    var intColor = e.emotional_intensity >= 7 ? 'var(--red)' : e.emotional_intensity >= 4 ? 'var(--gold)' : 'var(--green)';
    html += '<div class="voice-entry">';
    html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">';
    html += '<span style="font-size:16px">🎙</span>';
    html += '<span class="mono" style="font-size:11px;color:var(--text-muted)">' + new Date(e.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</span>';
    html += '<span class="mono" style="font-size:10px;color:var(--text-dim)">' + e.duration_seconds + 's</span>';
    if (e.emotional_intensity > 0) {
      html += '<span class="voice-intensity-badge" style="background:rgba(var(--' + (e.emotional_intensity >= 7 ? 'red' : e.emotional_intensity >= 4 ? 'gold' : 'green') + '-r),0.1);color:' + intColor + '">INTENSITY ' + e.emotional_intensity + '</span>';
    }
    html += '</div>';
    if (e.transcript && !e.transcript.startsWith('[')) {
      html += '<div style="font-size:13px;color:var(--text-muted);line-height:1.6">' + e.transcript.replace(/</g, '&lt;') + '</div>';
    }
    if (e.tags && e.tags.length) {
      html += '<div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap">';
      e.tags.forEach(function(t) {
        html += '<span style="font-family:var(--font-mono);font-size:9px;padding:2px 8px;border-radius:10px;background:var(--bg3);color:var(--text-dim)">' + t + '</span>';
      });
      html += '</div>';
    }
    html += '</div>';
  });
  html += '</div>';
  return html;
}

// ── INIT: Generate waveform bars ──
(function() {
  var wf = document.getElementById('voiceWaveform');
  if (wf) {
    var barsHtml = '';
    for (var i = 0; i < 16; i++) barsHtml += '<div class="voice-wave-bar" style="height:4px"></div>';
    wf.innerHTML = barsHtml;
  }

  // Gemini API key is managed via System → API Keys panel
})();
 
