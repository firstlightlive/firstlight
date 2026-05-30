// ═══════════════════════════════════════════
// FIRST LIGHT — FOOD SCANNER (Gemini Vision)
// Scan food photos, analyze nutrition, auto-punish violations
// FAULT TOLERANT — punishment depends on this
// ═══════════════════════════════════════════

(function() {
  'use strict';

  var VIOLATION_PENALTY_KM = 20;
  var MAX_IMAGE_SIZE = 4 * 1024 * 1024; // 4MB max for Gemini
  var ANALYSIS_TIMEOUT = 30000; // 30 second timeout
  var MAX_RETRIES = 2; // retry on failure

  // ── Get Gemini API key ──
  function getAiKey() {
    var key = localStorage.getItem('fl_aikey') || '';
    if (!key) {
      try {
        var keys = JSON.parse(localStorage.getItem('fl_api_keys') || '{}');
        if (keys.gemini) key = keys.gemini;
      } catch(e) {}
    }
    return key;
  }

  // ── Convert file to base64 with size validation ──
  function fileToBase64(file) {
    return new Promise(function(resolve, reject) {
      if (!file) { reject(new Error('No file provided')); return; }
      if (file.size > MAX_IMAGE_SIZE) {
        reject(new Error('Image too large (' + Math.round(file.size/1024/1024) + 'MB). Max 4MB. Try a lower resolution photo.'));
        return;
      }
      if (!file.type.startsWith('image/')) {
        reject(new Error('Not an image file. Please take a photo of your food.'));
        return;
      }
      var reader = new FileReader();
      reader.onload = function() {
        try { resolve(reader.result.split(',')[1]); }
        catch(e) { reject(new Error('Failed to encode image')); }
      };
      reader.onerror = function() { reject(new Error('Failed to read image file')); };
      reader.readAsDataURL(file);
    });
  }

  // ── Upload photo to Supabase Storage (non-blocking, failure OK) ──
  async function uploadFoodPhoto(file) {
    try {
      if (typeof SB === 'undefined' || !SB.init()) return null;
      var ist = (typeof getNowIST === 'function') ? getNowIST() : new Date();
      var dateStr = ist.getFullYear() + '-' + String(ist.getMonth()+1).padStart(2,'0') + '-' + String(ist.getDate()).padStart(2,'0');
      var timeStr = String(ist.getHours()).padStart(2,'0') + String(ist.getMinutes()).padStart(2,'0') + String(ist.getSeconds()).padStart(2,'0');
      var ext = (file.name || 'photo.jpg').split('.').pop() || 'jpg';
      var path = 'food_scans/' + dateStr + '_' + timeStr + '.' + ext;

      var token = localStorage.getItem('fl_supabase_token') || FL.SUPABASE_ANON_KEY;
      var res = await fetch(FL.SUPABASE_URL + '/storage/v1/object/firstlightlive/' + path, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': file.type || 'image/jpeg', 'x-upsert': 'true' },
        body: file
      });
      if (res.ok) return FL.SUPABASE_URL + '/storage/v1/object/public/firstlightlive/' + path;
    } catch(e) { console.warn('[food] Upload failed (non-critical):', e.message); }
    return null;
  }

  // ── Fetch with timeout ──
  function fetchWithTimeout(url, options, timeout) {
    return Promise.race([
      fetch(url, options),
      new Promise(function(_, reject) {
        setTimeout(function() { reject(new Error('Request timed out after ' + (timeout/1000) + 's. Check your internet connection.')); }, timeout);
      })
    ]);
  }

  // ── Analyze food with Gemini Vision (with retry) ──
  async function analyzeFoodImage(base64Data, mimeType, retryCount) {
    retryCount = retryCount || 0;
    var apiKey = getAiKey();
    if (!apiKey) {
      throw new Error('No Gemini API key found.\n\nGo to Command Center → System → API Keys and add your Gemini key.\nGet a free key at aistudio.google.com/apikey');
    }

    var prompt = 'You are a strict nutrition analyst for an athlete following these ABSOLUTE food rules:\n\n' +
      'RULE 1.1: No fried food (zero tolerance — pakora, samosa, fries, anything fried in oil)\n' +
      'RULE 1.2: No sugar (raw fruits OK, but no juices, sweets, desserts, added sugar, mithai, halwa, jalebi)\n' +
      'RULE 1.3: No alcohol (beer, wine, spirits — zero tolerance)\n' +
      'RULE 1.5: No cold drinks or carbonated beverages (cola, pepsi, sprite, soda, energy drinks)\n' +
      'RULE 1.6: No junk food (pizza, burger, processed, packaged, fast food, maggi, chips)\n' +
      'RULE 1.7: No Biryani (any form — Hyderabadi, Lucknowi, Dum, chicken, mutton, egg, veg, pulao)\n\n' +
      'Analyze this food photo carefully. Identify every item visible.\n\n' +
      'Return ONLY valid JSON with this EXACT structure (no markdown, no backticks, no extra text):\n' +
      '{"items":[{"name":"item name","estimated_grams":100,"calories":200,"protein_g":10,"carbs_g":30,"fat_g":8,"fiber_g":2}],' +
      '"total":{"calories":500,"protein_g":25,"carbs_g":60,"fat_g":15,"fiber_g":5},' +
      '"violations":[],' +
      '"verdict":"CLEAN",' +
      '"health_score":7,' +
      '"summary":"One line summary"}\n\n' +
      'RULES:\n' +
      '- If ANY violation found: verdict must be "VIOLATION" and violations array must list each with rule, item, and reason\n' +
      '- If clean: verdict must be "CLEAN" and violations must be empty []\n' +
      '- If no food visible: verdict must be "NO_FOOD"\n' +
      '- health_score: 1-10 (10 = perfect athlete food like grilled chicken + veggies)\n' +
      '- Be STRICT — if it looks fried, flagged. If it looks sugary, flagged. When in doubt, flag it.\n' +
      '- Estimate grams, calories, macros as accurately as possible from the photo';

    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;

    try {
      var res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType || 'image/jpeg', data: base64Data } }
          ]}],
          generationConfig: { temperature: 0.1 } // low temperature for consistent structured output
        })
      }, ANALYSIS_TIMEOUT);

      if (!res.ok) {
        var errBody = await res.text();
        if (res.status === 429) throw new Error('Gemini rate limit hit. Wait 60 seconds and try again.');
        if (res.status === 403) throw new Error('Gemini API key invalid or expired. Update in System > API Keys.');
        throw new Error('Gemini API error (HTTP ' + res.status + '): ' + errBody.substring(0, 200));
      }

      var result = await res.json();

      // Check for safety blocks
      if (result.candidates && result.candidates[0] && result.candidates[0].finishReason === 'SAFETY') {
        throw new Error('Gemini blocked the image for safety reasons. Try a clearer photo of just the food.');
      }

      if (!result.candidates || !result.candidates[0] || !result.candidates[0].content) {
        if (result.error) throw new Error('Gemini error: ' + result.error.message);
        throw new Error('Gemini returned empty response. Try again.');
      }

      var text = result.candidates[0].content.parts[0].text;
      // Clean markdown code blocks
      text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

      // Validate JSON
      var analysis;
      try {
        analysis = JSON.parse(text);
      } catch(parseErr) {
        console.error('[food] JSON parse failed. Raw text:', text);
        // Try to extract JSON from the response
        var jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try { analysis = JSON.parse(jsonMatch[0]); }
          catch(e2) { throw new Error('AI returned invalid format. Please try scanning again.'); }
        } else {
          throw new Error('AI returned invalid format. Please try scanning again.');
        }
      }

      // Validate required fields
      if (!analysis.verdict) analysis.verdict = 'CLEAN';
      if (!analysis.items) analysis.items = [];
      if (!analysis.total) analysis.total = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 };
      if (!analysis.violations) analysis.violations = [];
      if (typeof analysis.health_score !== 'number') analysis.health_score = 5;
      if (!analysis.summary) analysis.summary = analysis.items.length ? analysis.items.map(function(i){return i.name}).join(', ') : 'No items detected';

      // Cross-validate: if violations exist, verdict MUST be VIOLATION
      if (analysis.violations.length > 0 && analysis.verdict !== 'VIOLATION') {
        analysis.verdict = 'VIOLATION';
      }

      return analysis;

    } catch(e) {
      // Retry on transient failures
      if (retryCount < MAX_RETRIES && (e.message.includes('timed out') || e.message.includes('empty response') || e.message.includes('NetworkError'))) {
        console.warn('[food] Retry ' + (retryCount + 1) + '/' + MAX_RETRIES + ':', e.message);
        await new Promise(function(r) { setTimeout(r, 2000); });
        return analyzeFoodImage(base64Data, mimeType, retryCount + 1);
      }
      throw e;
    }
  }

  // ── Auto-create punishment slip (with dedup) ──
  async function createFoodViolationSlip(violations, photoUrl) {
    var ist = (typeof getNowIST === 'function') ? getNowIST() : new Date();
    var dateStr = ist.getFullYear() + '-' + String(ist.getMonth()+1).padStart(2,'0') + '-' + String(ist.getDate()).padStart(2,'0');
    var ruleText = violations.map(function(v) { return 'Rule ' + v.rule + ': ' + v.item + ' (' + v.reason + ')'; }).join('; ');
    var slipId = 'food_scan_' + dateStr + '_' + Date.now();

    var slip = {
      id: slipId,
      client_id: slipId,
      date: dateStr,
      rule: 'body',
      category: 'food_violation',
      penalty: VIOLATION_PENALTY_KM + 'km_walk',
      penalty_status: 'pending',
      insight: 'FOOD CODE VIOLATION — ' + ruleText,
      proof_photo_url: photoUrl || '',
      immutable: true,
      created_at: new Date().toISOString()
    };

    // Save to localStorage
    try {
      var slips = JSON.parse(localStorage.getItem('fl_slips') || '[]');
      slips.push(slip);
      localStorage.setItem('fl_slips', JSON.stringify(slips));
    } catch(e) { console.error('[food] localStorage save failed:', e); }

    // Try Supabase (non-blocking)
    if (typeof sbFetch === 'function') {
      try { await sbFetch('slips', 'POST', slip); }
      catch(e) { console.warn('[food] Slip Supabase sync failed (saved locally):', e.message); }
    }

    return slip;
  }

  // ── Save food log entry ──
  function saveFoodLog(entry) {
    try {
      var logs = JSON.parse(localStorage.getItem('fl_food_log') || '[]');
      logs.push(entry);
      // Keep max 500 entries to prevent localStorage bloat
      if (logs.length > 500) logs = logs.slice(-500);
      localStorage.setItem('fl_food_log', JSON.stringify(logs));
    } catch(e) { console.error('[food] Log save failed:', e); }
  }

  // ── Get today's food log ──
  function getTodayFoodLog() {
    try {
      var ist = (typeof getNowIST === 'function') ? getNowIST() : new Date();
      var dateStr = ist.getFullYear() + '-' + String(ist.getMonth()+1).padStart(2,'0') + '-' + String(ist.getDate()).padStart(2,'0');
      var logs = JSON.parse(localStorage.getItem('fl_food_log') || '[]');
      return logs.filter(function(l) { return l.date === dateStr; });
    } catch(e) { return []; }
  }

  // ── Render food scanner panel ──
  window.renderFoodScanner = function() {
    var panel = document.getElementById('panel-food-scanner');
    if (!panel) return;

    var todayLogs = getTodayFoodLog();
    var totalCal = 0, totalP = 0, totalC = 0, totalF = 0, totalFiber = 0;
    var violationCount = 0;
    todayLogs.forEach(function(l) {
      if (l.total) { totalCal += l.total.calories||0; totalP += l.total.protein_g||0; totalC += l.total.carbs_g||0; totalF += l.total.fat_g||0; totalFiber += l.total.fiber_g||0; }
      if (l.verdict === 'VIOLATION') violationCount++;
    });

    var html = '';

    // Header
    html += '<div style="text-align:center;margin-bottom:24px">';
    html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:4px;color:var(--text-dim);margin-bottom:8px">AI-POWERED</div>';
    html += '<h2 style="font-family:var(--font-mono);font-size:1.4rem;font-weight:700;letter-spacing:2px;margin-bottom:4px">FOOD SCANNER</h2>';
    html += '<div style="font-family:var(--font-mono);font-size:0.7rem;color:var(--text-dim)">Scan. Analyze. No violations go unrecorded.</div>';

    // API key check
    var hasKey = !!getAiKey();
    if (!hasKey) {
      html += '<div style="margin-top:12px;padding:10px;background:rgba(255,82,82,0.06);border:1px solid rgba(255,82,82,0.2);border-radius:8px;font-family:var(--font-mono);font-size:0.65rem;color:var(--red)">';
      html += 'No Gemini API key found. Go to System > API Keys to add one (free at aistudio.google.com/apikey)';
      html += '</div>';
    }
    html += '</div>';

    // Camera button
    html += '<div style="text-align:center;margin-bottom:24px">';
    html += '<label style="display:inline-flex;align-items:center;gap:10px;padding:16px 32px;background:linear-gradient(135deg,rgba(252,76,2,0.1),rgba(255,82,82,0.1));border:2px dashed rgba(252,76,2,0.3);border-radius:14px;cursor:pointer;transition:all 0.3s;font-family:var(--font-mono);font-size:12px;font-weight:700;letter-spacing:2px;color:var(--strava,#FC4C02)">';
    html += '<span style="font-size:24px">&#128247;</span> SCAN FOOD';
    html += '<input type="file" id="foodCameraInput" accept="image/*" capture="environment" style="display:none" onchange="handleFoodCapture(this)">';
    html += '</label>';
    html += '<div style="font-family:var(--font-mono);font-size:0.6rem;color:var(--text-dim);margin-top:8px">Opens camera — take a photo of your meal</div>';
    html += '</div>';

    // Analysis result area
    html += '<div id="foodAnalysisResult"></div>';

    // Today's summary
    if (todayLogs.length > 0) {
      html += '<div style="margin-top:32px">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">';
      html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:3px;color:var(--text-dim)">TODAY\'S INTAKE</div>';
      html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim)">' + todayLogs.length + ' meal' + (todayLogs.length > 1 ? 's' : '') + ' scanned</div>';
      html += '</div>';

      // Macro cards
      html += '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:16px">';
      html += '<div style="text-align:center;padding:12px 6px;background:var(--bg3);border-radius:10px"><div style="font-family:var(--font-mono);font-size:1.1rem;font-weight:700;color:#FC4C02">' + Math.round(totalCal) + '</div><div style="font-family:var(--font-mono);font-size:7px;letter-spacing:1px;color:var(--text-dim)">CALORIES</div></div>';
      html += '<div style="text-align:center;padding:12px 6px;background:var(--bg3);border-radius:10px"><div style="font-family:var(--font-mono);font-size:1.1rem;font-weight:700;color:#00E676">' + Math.round(totalP) + 'g</div><div style="font-family:var(--font-mono);font-size:7px;letter-spacing:1px;color:var(--text-dim)">PROTEIN</div></div>';
      html += '<div style="text-align:center;padding:12px 6px;background:var(--bg3);border-radius:10px"><div style="font-family:var(--font-mono);font-size:1.1rem;font-weight:700;color:#F5A623">' + Math.round(totalC) + 'g</div><div style="font-family:var(--font-mono);font-size:7px;letter-spacing:1px;color:var(--text-dim)">CARBS</div></div>';
      html += '<div style="text-align:center;padding:12px 6px;background:var(--bg3);border-radius:10px"><div style="font-family:var(--font-mono);font-size:1.1rem;font-weight:700;color:#FF5252">' + Math.round(totalF) + 'g</div><div style="font-family:var(--font-mono);font-size:7px;letter-spacing:1px;color:var(--text-dim)">FAT</div></div>';
      html += '<div style="text-align:center;padding:12px 6px;background:var(--bg3);border-radius:10px"><div style="font-family:var(--font-mono);font-size:1.1rem;font-weight:700;color:#00B0FF">' + Math.round(totalFiber) + 'g</div><div style="font-family:var(--font-mono);font-size:7px;letter-spacing:1px;color:var(--text-dim)">FIBER</div></div>';
      html += '</div>';

      // Violation count
      if (violationCount > 0) {
        html += '<div style="padding:10px;background:rgba(255,82,82,0.06);border:1px solid rgba(255,82,82,0.2);border-radius:8px;margin-bottom:12px;text-align:center">';
        html += '<div style="font-family:var(--font-mono);font-size:0.7rem;color:var(--red);font-weight:700">' + violationCount + ' VIOLATION' + (violationCount > 1 ? 'S' : '') + ' TODAY — ' + (violationCount * VIOLATION_PENALTY_KM) + ' KM PENDING</div>';
        html += '</div>';
      }

      // Meal entries
      todayLogs.forEach(function(log) {
        var isViolation = log.verdict === 'VIOLATION';
        html += '<div style="padding:12px;background:' + (isViolation ? 'rgba(255,82,82,0.04)' : 'rgba(0,230,118,0.03)') + ';border:1px solid ' + (isViolation ? 'rgba(255,82,82,0.12)' : 'rgba(0,230,118,0.08)') + ';border-radius:8px;margin-bottom:6px">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center">';
        html += '<div style="font-family:var(--font-mono);font-size:0.65rem;font-weight:700;color:' + (isViolation ? 'var(--red)' : 'var(--green)') + '">' + (isViolation ? 'VIOLATION' : 'CLEAN') + ' — ' + (log.time || '') + '</div>';
        html += '<div style="font-family:var(--font-mono);font-size:0.65rem;color:var(--text-dim)">' + Math.round(log.total.calories || 0) + ' cal | P:' + Math.round(log.total.protein_g||0) + 'g</div>';
        html += '</div>';
        html += '<div style="font-family:var(--font-mono);font-size:0.6rem;color:var(--text-dim);margin-top:3px">' + (log.summary || '') + '</div>';
        html += '</div>';
      });

      html += '</div>';
    }

    // Food code reminder
    html += '<div style="margin-top:24px;padding:14px;background:rgba(255,82,82,0.03);border:1px solid rgba(255,82,82,0.08);border-radius:10px">';
    html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:3px;color:var(--red);font-weight:700;margin-bottom:6px">FOOD CODE — ZERO TOLERANCE</div>';
    html += '<div style="font-family:var(--font-mono);font-size:0.6rem;color:var(--text-dim);line-height:1.8">';
    html += 'No fried food | No sugar | No alcohol | No cold drinks | No junk food | No biryani<br>';
    html += '<span style="color:var(--red)">Violation = ' + VIOLATION_PENALTY_KM + ' km walk punishment (immutable, auto-logged)</span>';
    html += '</div></div>';

    panel.innerHTML = html;
  };

  // ── Handle camera capture ──
  window.handleFoodCapture = async function(input) {
    if (!input.files || !input.files[0]) return;
    var file = input.files[0];

    var apiKey = getAiKey();
    if (!apiKey) {
      alert('No Gemini API key found.\n\nGo to Command Center → System → API Keys and add your Gemini key.\nGet a free key at aistudio.google.com/apikey');
      input.value = '';
      return;
    }

    var resultDiv = document.getElementById('foodAnalysisResult');
    if (!resultDiv) return;

    // Show preview + loading
    var previewUrl;
    try { previewUrl = URL.createObjectURL(file); }
    catch(e) { previewUrl = ''; }

    resultDiv.innerHTML =
      (previewUrl ? '<div style="text-align:center;margin-bottom:16px"><img src="' + previewUrl + '" style="max-width:100%;max-height:250px;border-radius:12px;border:2px solid rgba(252,76,2,0.2)"></div>' : '') +
      '<div style="text-align:center;padding:20px">' +
      '<div class="food-loading" style="font-family:var(--font-mono);font-size:12px;letter-spacing:2px;color:var(--strava,#FC4C02)">ANALYZING WITH AI...</div>' +
      '<div style="font-family:var(--font-mono);font-size:0.6rem;color:var(--text-dim);margin-top:4px">Gemini Vision scanning · may take 5-10 seconds</div>' +
      '<div style="margin-top:12px;height:3px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;max-width:200px;margin-left:auto;margin-right:auto"><div style="height:100%;width:30%;background:var(--strava);border-radius:2px;animation:foodProgress 2s ease-in-out infinite"></div></div>' +
      '</div>' +
      '<style>@keyframes foodProgress{0%{width:10%;margin-left:0}50%{width:60%;margin-left:20%}100%{width:10%;margin-left:90%}}</style>';

    try {
      // Convert to base64 (with validation)
      var base64 = await fileToBase64(file);
      var mimeType = file.type || 'image/jpeg';

      // Upload to storage (non-blocking — don't wait)
      var photoUrlPromise = uploadFoodPhoto(file);

      // Analyze with Gemini (with retry)
      var analysis = await analyzeFoodImage(base64, mimeType);

      // Wait for upload (but don't fail if it doesn't work)
      var photoUrl = null;
      try { photoUrl = await photoUrlPromise; } catch(e) {}

      // Handle NO_FOOD verdict
      if (analysis.verdict === 'NO_FOOD') {
        resultDiv.innerHTML =
          (previewUrl ? '<div style="text-align:center;margin-bottom:16px"><img src="' + previewUrl + '" style="max-width:100%;max-height:200px;border-radius:12px;border:2px solid rgba(245,166,35,0.3)"></div>' : '') +
          '<div style="text-align:center;padding:16px;background:rgba(245,166,35,0.05);border:1px solid rgba(245,166,35,0.2);border-radius:12px">' +
          '<div style="font-family:var(--font-mono);font-size:1rem;font-weight:700;color:var(--gold);letter-spacing:2px">NO FOOD DETECTED</div>' +
          '<div style="font-family:var(--font-mono);font-size:0.7rem;color:var(--text-dim);margin-top:4px">Take a clear photo of your meal. Make sure food is visible.</div>' +
          '</div>';
        input.value = '';
        return;
      }

      // Save to food log
      var ist = (typeof getNowIST === 'function') ? getNowIST() : new Date();
      var timeStr = String(ist.getHours()).padStart(2,'0') + ':' + String(ist.getMinutes()).padStart(2,'0');
      var dateStr = ist.getFullYear() + '-' + String(ist.getMonth()+1).padStart(2,'0') + '-' + String(ist.getDate()).padStart(2,'0');

      saveFoodLog({
        date: dateStr, time: timeStr, photo_url: photoUrl,
        items: analysis.items, total: analysis.total,
        violations: analysis.violations, verdict: analysis.verdict,
        health_score: analysis.health_score, summary: analysis.summary
      });

      // Render result
      var isViolation = analysis.verdict === 'VIOLATION';
      var html = '';

      // Photo
      if (previewUrl) {
        html += '<div style="text-align:center;margin-bottom:16px">';
        html += '<img src="' + previewUrl + '" style="max-width:100%;max-height:250px;border-radius:12px;border:2px solid ' + (isViolation ? 'rgba(255,82,82,0.4)' : 'rgba(0,230,118,0.3)') + '">';
        html += '</div>';
      }

      // Verdict banner
      if (isViolation) {
        html += '<div style="text-align:center;padding:16px;background:linear-gradient(135deg,rgba(255,82,82,0.1),rgba(255,82,82,0.05));border:2px solid rgba(255,82,82,0.3);border-radius:12px;margin-bottom:16px">';
        html += '<div style="font-family:var(--font-mono);font-size:1.2rem;font-weight:700;color:var(--red);letter-spacing:2px">FOOD CODE VIOLATION</div>';
        html += '<div style="font-family:var(--font-mono);font-size:0.8rem;color:var(--red);margin-top:4px">' + VIOLATION_PENALTY_KM + ' KM WALK PUNISHMENT — AUTO-LOGGED</div>';
        analysis.violations.forEach(function(v) {
          html += '<div style="font-family:var(--font-mono);font-size:0.65rem;color:var(--text-dim);margin-top:6px">Rule ' + (v.rule||'?') + ': ' + (v.item||'?') + ' — ' + (v.reason||'') + '</div>';
        });
        html += '</div>';
      } else {
        html += '<div style="text-align:center;padding:16px;background:rgba(0,230,118,0.05);border:1px solid rgba(0,230,118,0.2);border-radius:12px;margin-bottom:16px">';
        html += '<div style="font-family:var(--font-mono);font-size:1.2rem;font-weight:700;color:var(--green);letter-spacing:2px">CLEAN</div>';
        html += '<div style="font-family:var(--font-mono);font-size:0.7rem;color:var(--green);margin-top:4px">No food code violations detected</div>';
        html += '</div>';
      }

      // Health score
      var scoreColor = analysis.health_score >= 7 ? '#00E676' : analysis.health_score >= 4 ? '#F5A623' : '#FF5252';
      html += '<div style="text-align:center;margin-bottom:16px">';
      html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-dim);margin-bottom:4px">HEALTH SCORE</div>';
      html += '<div style="font-family:var(--font-mono);font-size:2rem;font-weight:700;color:' + scoreColor + '">' + (analysis.health_score || 0) + '<span style="font-size:0.8rem;color:var(--text-dim)">/10</span></div>';
      html += '<div style="font-family:var(--font-mono);font-size:0.65rem;color:var(--text-dim)">' + (analysis.summary || '') + '</div>';
      html += '</div>';

      // Nutrition breakdown table
      if (analysis.items && analysis.items.length) {
        html += '<div style="margin-bottom:16px">';
        html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:3px;color:var(--text-dim);margin-bottom:8px">NUTRITION BREAKDOWN</div>';
        html += '<table style="width:100%;border-collapse:collapse;font-family:var(--font-mono);font-size:0.6rem">';
        html += '<tr style="color:var(--text-dim);border-bottom:1px solid rgba(255,255,255,0.06)"><th style="text-align:left;padding:5px 3px">ITEM</th><th style="text-align:right;padding:5px 3px">g</th><th style="text-align:right;padding:5px 3px">CAL</th><th style="text-align:right;padding:5px 3px">P</th><th style="text-align:right;padding:5px 3px">C</th><th style="text-align:right;padding:5px 3px">F</th></tr>';
        analysis.items.forEach(function(item) {
          html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.03)">';
          html += '<td style="padding:5px 3px;color:#fff">' + (item.name||'?') + '</td>';
          html += '<td style="text-align:right;padding:5px 3px;color:var(--text-dim)">' + (item.estimated_grams||'-') + '</td>';
          html += '<td style="text-align:right;padding:5px 3px;color:#FC4C02">' + (item.calories||0) + '</td>';
          html += '<td style="text-align:right;padding:5px 3px;color:#00E676">' + (item.protein_g||0) + '</td>';
          html += '<td style="text-align:right;padding:5px 3px;color:#F5A623">' + (item.carbs_g||0) + '</td>';
          html += '<td style="text-align:right;padding:5px 3px;color:#FF5252">' + (item.fat_g||0) + '</td>';
          html += '</tr>';
        });
        if (analysis.total) {
          html += '<tr style="border-top:2px solid rgba(255,255,255,0.1);font-weight:700">';
          html += '<td style="padding:6px 3px;color:#fff">TOTAL</td><td></td>';
          html += '<td style="text-align:right;padding:6px 3px;color:#FC4C02">' + Math.round(analysis.total.calories||0) + '</td>';
          html += '<td style="text-align:right;padding:6px 3px;color:#00E676">' + Math.round(analysis.total.protein_g||0) + '</td>';
          html += '<td style="text-align:right;padding:6px 3px;color:#F5A623">' + Math.round(analysis.total.carbs_g||0) + '</td>';
          html += '<td style="text-align:right;padding:6px 3px;color:#FF5252">' + Math.round(analysis.total.fat_g||0) + '</td>';
          html += '</tr>';
        }
        html += '</table></div>';
      }

      resultDiv.innerHTML = html;

      // Auto-create punishment if violation
      if (isViolation && analysis.violations.length > 0) {
        var slip = await createFoodViolationSlip(analysis.violations, photoUrl);
        // Show confirmation
        var confirmDiv = document.createElement('div');
        confirmDiv.style.cssText = 'text-align:center;padding:12px;background:rgba(255,82,82,0.08);border:1px solid rgba(255,82,82,0.2);border-radius:8px;margin-top:12px';
        confirmDiv.innerHTML = '<div style="font-family:var(--font-mono);font-size:0.7rem;color:var(--red);font-weight:700">SLIP CREATED: ' + VIOLATION_PENALTY_KM + ' KM WALK</div><div style="font-family:var(--font-mono);font-size:0.6rem;color:var(--text-dim);margin-top:2px">ID: ' + slip.id + ' · Immutable</div>';
        resultDiv.appendChild(confirmDiv);
      }

      // Refresh panel to show updated daily log
      setTimeout(function() { renderFoodScanner(); }, 2000);

    } catch(e) {
      console.error('[food] Analysis error:', e);
      resultDiv.innerHTML =
        (previewUrl ? '<div style="text-align:center;margin-bottom:16px"><img src="' + previewUrl + '" style="max-width:100%;max-height:200px;border-radius:12px;opacity:0.5"></div>' : '') +
        '<div style="text-align:center;padding:20px;background:rgba(255,82,82,0.04);border:1px solid rgba(255,82,82,0.15);border-radius:12px">' +
        '<div style="font-family:var(--font-mono);font-size:14px;color:var(--red);font-weight:700;letter-spacing:1px">ANALYSIS FAILED</div>' +
        '<div style="font-family:var(--font-mono);font-size:0.7rem;color:var(--text-dim);margin-top:8px;line-height:1.6">' + e.message + '</div>' +
        '<div style="margin-top:12px"><button onclick="document.getElementById(\'foodCameraInput\').click()" style="padding:10px 20px;background:rgba(252,76,2,0.1);border:1px solid rgba(252,76,2,0.3);border-radius:8px;color:#FC4C02;font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:1px;cursor:pointer">TRY AGAIN</button></div>' +
        '</div>';
    }

    input.value = '';
  };

})();
