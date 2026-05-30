// ═══════════════════════════════════════════
// FIRST LIGHT — FOOD SCANNER (Gemini Vision)
// Scan food photos, analyze nutrition, auto-punish violations
// ═══════════════════════════════════════════

(function() {
  'use strict';

  // Food Code Rules from The Iron Covenant
  var FOOD_RULES = [
    { id: '1.1', rule: 'No fried food — zero fried food, no exceptions', keywords: ['fried', 'deep fried', 'frying', 'fryer', 'tempura', 'pakora', 'samosa', 'bhaji', 'french fries', 'chips'] },
    { id: '1.2', rule: 'No sugar — raw fruits only; no juices, no sweets, no desserts', keywords: ['sugar', 'sweet', 'dessert', 'cake', 'cookie', 'ice cream', 'chocolate', 'candy', 'mithai', 'gulab jamun', 'rasgulla', 'jalebi', 'halwa', 'laddu', 'kheer', 'juice', 'milkshake', 'smoothie'] },
    { id: '1.3', rule: 'No alcohol — complete abstinence', keywords: ['alcohol', 'beer', 'wine', 'whisky', 'vodka', 'rum', 'cocktail', 'liquor', 'spirits'] },
    { id: '1.5', rule: 'No cold drinks — no carbonated beverages', keywords: ['cola', 'pepsi', 'coke', 'sprite', 'fanta', 'soda', 'carbonated', 'soft drink', 'cold drink', 'energy drink', 'red bull'] },
    { id: '1.6', rule: 'No junk food — processed, packaged, or fast food', keywords: ['pizza', 'burger', 'hot dog', 'nuggets', 'fast food', 'mcdonalds', 'kfc', 'dominos', 'subway', 'processed', 'instant noodles', 'maggi', 'chips', 'nachos', 'popcorn'] },
    { id: '1.7', rule: 'No Biryani — all forms', keywords: ['biryani', 'biriyani', 'pulao', 'pulav', 'dum biryani', 'hyderabadi', 'lucknowi'] }
  ];

  var VIOLATION_PENALTY_KM = 20;

  // ── Get Gemini API key ──
  function getAiKey() {
    var key = localStorage.getItem('fl_aikey') || '';
    if (!key) {
      var keys = JSON.parse(localStorage.getItem('fl_api_keys') || '{}');
      if (keys.gemini) key = keys.gemini;
    }
    return key;
  }

  // ── Convert file to base64 ──
  function fileToBase64(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function() { resolve(reader.result.split(',')[1]); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ── Upload photo to Supabase Storage ──
  async function uploadFoodPhoto(file) {
    if (!SB.init()) return null;
    var ist = (typeof getNowIST === 'function') ? getNowIST() : new Date();
    var dateStr = ist.getFullYear() + '-' + String(ist.getMonth()+1).padStart(2,'0') + '-' + String(ist.getDate()).padStart(2,'0');
    var timeStr = String(ist.getHours()).padStart(2,'0') + String(ist.getMinutes()).padStart(2,'0') + String(ist.getSeconds()).padStart(2,'0');
    var ext = file.name.split('.').pop() || 'jpg';
    var path = 'food_scans/' + dateStr + '_' + timeStr + '.' + ext;

    try {
      var res = await fetch(FL.SUPABASE_URL + '/storage/v1/object/firstlightlive/' + path, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + (localStorage.getItem('fl_supabase_token') || FL.SUPABASE_ANON_KEY),
          'Content-Type': file.type,
          'x-upsert': 'true'
        },
        body: file
      });
      if (res.ok) {
        return FL.SUPABASE_URL + '/storage/v1/object/public/firstlightlive/' + path;
      }
    } catch(e) { console.error('[food] Upload failed:', e); }
    return null;
  }

  // ── Analyze food with Gemini Vision ──
  async function analyzeFoodImage(base64Data, mimeType) {
    var apiKey = getAiKey();
    if (!apiKey) {
      throw new Error('No Gemini API key. Add it in System > API Keys.');
    }

    var prompt = 'You are a strict nutrition analyst for an athlete following these ABSOLUTE food rules:\n\n' +
      'RULE 1.1: No fried food (zero tolerance)\n' +
      'RULE 1.2: No sugar (raw fruits OK, but no juices, sweets, desserts, added sugar)\n' +
      'RULE 1.3: No alcohol\n' +
      'RULE 1.5: No cold drinks or carbonated beverages\n' +
      'RULE 1.6: No junk food (processed, packaged, fast food)\n' +
      'RULE 1.7: No Biryani (any form — Hyderabadi, Lucknowi, Dum, any rice dish resembling biryani/pulao)\n\n' +
      'Analyze this food photo. Return ONLY valid JSON (no markdown, no backticks):\n' +
      '{\n' +
      '  "items": [{"name": "food item", "estimated_grams": 100, "calories": 200, "protein_g": 10, "carbs_g": 30, "fat_g": 8, "fiber_g": 2}],\n' +
      '  "total": {"calories": 500, "protein_g": 25, "carbs_g": 60, "fat_g": 15, "fiber_g": 5},\n' +
      '  "violations": [{"rule": "1.7", "item": "Biryani", "reason": "Rice dish is biryani"}],\n' +
      '  "verdict": "VIOLATION" or "CLEAN",\n' +
      '  "health_score": 7,\n' +
      '  "summary": "Brief one-line summary"\n' +
      '}\n\n' +
      'Be STRICT. If anything looks fried, sugary, processed, or resembles biryani — flag it. health_score is 1-10 (10 = perfectly clean athlete food). If no food is visible, return {"items":[],"total":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0},"violations":[],"verdict":"NO_FOOD","health_score":0,"summary":"No food detected"}';

    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;
    var res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: base64Data } }
          ]
        }]
      })
    });

    var result = await res.json();
    if (result.candidates && result.candidates[0] && result.candidates[0].content) {
      var text = result.candidates[0].content.parts[0].text;
      // Clean markdown code blocks if present
      text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(text);
    }
    throw new Error(result.error ? result.error.message : 'Gemini returned no response');
  }

  // ── Auto-create punishment slip ──
  async function createFoodViolationSlip(violations, photoUrl) {
    var ist = (typeof getNowIST === 'function') ? getNowIST() : new Date();
    var dateStr = ist.getFullYear() + '-' + String(ist.getMonth()+1).padStart(2,'0') + '-' + String(ist.getDate()).padStart(2,'0');
    var ruleText = violations.map(function(v) { return 'Rule ' + v.rule + ': ' + v.item + ' (' + v.reason + ')'; }).join('; ');

    var slip = {
      date: dateStr,
      rule: 'body',
      category: 'food_violation',
      penalty: VIOLATION_PENALTY_KM + 'km_walk',
      penalty_status: 'pending',
      insight: 'FOOD CODE VIOLATION — ' + ruleText,
      proof_photo_url: photoUrl || '',
      client_id: 'food_scan_' + dateStr + '_' + Date.now()
    };

    // Save to localStorage
    var slips = JSON.parse(localStorage.getItem('fl_slips') || '[]');
    slip.id = slip.client_id;
    slips.push(slip);
    localStorage.setItem('fl_slips', JSON.stringify(slips));

    // Try Supabase
    if (typeof sbFetch === 'function') {
      try {
        await sbFetch('slips', 'POST', slip);
      } catch(e) { console.warn('[food] Slip sync failed:', e); }
    }

    return slip;
  }

  // ── Save food log entry ──
  function saveFoodLog(entry) {
    var logs = JSON.parse(localStorage.getItem('fl_food_log') || '[]');
    logs.push(entry);
    localStorage.setItem('fl_food_log', JSON.stringify(logs));
  }

  // ── Get today's food log ──
  function getTodayFoodLog() {
    var ist = (typeof getNowIST === 'function') ? getNowIST() : new Date();
    var dateStr = ist.getFullYear() + '-' + String(ist.getMonth()+1).padStart(2,'0') + '-' + String(ist.getDate()).padStart(2,'0');
    var logs = JSON.parse(localStorage.getItem('fl_food_log') || '[]');
    return logs.filter(function(l) { return l.date === dateStr; });
  }

  // ── Render food scanner panel ──
  window.renderFoodScanner = function() {
    var panel = document.getElementById('panel-food-scanner');
    if (!panel) return;

    var todayLogs = getTodayFoodLog();
    var totalCal = 0, totalP = 0, totalC = 0, totalF = 0;
    todayLogs.forEach(function(l) {
      if (l.total) { totalCal += l.total.calories||0; totalP += l.total.protein_g||0; totalC += l.total.carbs_g||0; totalF += l.total.fat_g||0; }
    });

    var html = '';

    // Header
    html += '<div style="text-align:center;margin-bottom:24px">';
    html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:4px;color:var(--text-dim);margin-bottom:8px">AI-POWERED</div>';
    html += '<h2 style="font-family:var(--font-mono);font-size:1.4rem;font-weight:700;letter-spacing:2px;margin-bottom:4px">FOOD SCANNER</h2>';
    html += '<div style="font-family:var(--font-mono);font-size:0.7rem;color:var(--text-dim)">Scan. Analyze. No violations go unrecorded.</div>';
    html += '</div>';

    // Camera button
    html += '<div style="text-align:center;margin-bottom:24px">';
    html += '<label style="display:inline-flex;align-items:center;gap:10px;padding:16px 32px;background:linear-gradient(135deg,rgba(252,76,2,0.1),rgba(255,82,82,0.1));border:2px dashed rgba(252,76,2,0.3);border-radius:14px;cursor:pointer;transition:all 0.3s;font-family:var(--font-mono);font-size:12px;font-weight:700;letter-spacing:2px;color:var(--strava,#FC4C02)" onmouseover="this.style.borderColor=\'#FC4C02\';this.style.background=\'rgba(252,76,2,0.15)\'" onmouseout="this.style.borderColor=\'rgba(252,76,2,0.3)\';this.style.background=\'linear-gradient(135deg,rgba(252,76,2,0.1),rgba(255,82,82,0.1))\'">';
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
      html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:3px;color:var(--text-dim);margin-bottom:12px">TODAY\'S INTAKE</div>';

      // Macro cards
      html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px">';
      html += '<div style="text-align:center;padding:14px 8px;background:var(--bg3);border-radius:10px"><div style="font-family:var(--font-mono);font-size:1.2rem;font-weight:700;color:#FC4C02">' + Math.round(totalCal) + '</div><div style="font-family:var(--font-mono);font-size:8px;letter-spacing:1px;color:var(--text-dim)">CALORIES</div></div>';
      html += '<div style="text-align:center;padding:14px 8px;background:var(--bg3);border-radius:10px"><div style="font-family:var(--font-mono);font-size:1.2rem;font-weight:700;color:#00E676">' + Math.round(totalP) + 'g</div><div style="font-family:var(--font-mono);font-size:8px;letter-spacing:1px;color:var(--text-dim)">PROTEIN</div></div>';
      html += '<div style="text-align:center;padding:14px 8px;background:var(--bg3);border-radius:10px"><div style="font-family:var(--font-mono);font-size:1.2rem;font-weight:700;color:#F5A623">' + Math.round(totalC) + 'g</div><div style="font-family:var(--font-mono);font-size:8px;letter-spacing:1px;color:var(--text-dim)">CARBS</div></div>';
      html += '<div style="text-align:center;padding:14px 8px;background:var(--bg3);border-radius:10px"><div style="font-family:var(--font-mono);font-size:1.2rem;font-weight:700;color:#FF5252">' + Math.round(totalF) + 'g</div><div style="font-family:var(--font-mono);font-size:8px;letter-spacing:1px;color:var(--text-dim)">FAT</div></div>';
      html += '</div>';

      // Meal entries
      todayLogs.forEach(function(log, idx) {
        var isViolation = log.verdict === 'VIOLATION';
        html += '<div style="padding:14px;background:' + (isViolation ? 'rgba(255,82,82,0.05)' : 'rgba(0,230,118,0.03)') + ';border:1px solid ' + (isViolation ? 'rgba(255,82,82,0.15)' : 'rgba(0,230,118,0.1)') + ';border-radius:10px;margin-bottom:8px">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center">';
        html += '<div style="font-family:var(--font-mono);font-size:0.7rem;font-weight:700;color:' + (isViolation ? 'var(--red)' : 'var(--green)') + '">' + (isViolation ? 'VIOLATION' : 'CLEAN') + ' — ' + (log.time || '') + '</div>';
        html += '<div style="font-family:var(--font-mono);font-size:0.7rem;color:var(--text-dim)">' + Math.round(log.total.calories || 0) + ' cal</div>';
        html += '</div>';
        html += '<div style="font-family:var(--font-mono);font-size:0.65rem;color:var(--text-dim);margin-top:4px">' + (log.summary || '') + '</div>';
        if (log.items && log.items.length) {
          html += '<div style="font-family:var(--font-mono);font-size:0.6rem;color:var(--text-dim);margin-top:4px">';
          html += log.items.map(function(i) { return i.name + ' (' + i.calories + ' cal)'; }).join(' | ');
          html += '</div>';
        }
        html += '</div>';
      });

      html += '</div>';
    }

    // Food code reminder
    html += '<div style="margin-top:24px;padding:16px;background:rgba(255,82,82,0.03);border:1px solid rgba(255,82,82,0.1);border-radius:10px">';
    html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:3px;color:var(--red);font-weight:700;margin-bottom:8px">FOOD CODE — ZERO TOLERANCE</div>';
    html += '<div style="font-family:var(--font-mono);font-size:0.65rem;color:var(--text-dim);line-height:1.8">';
    html += 'No fried food | No sugar | No alcohol | No cold drinks | No junk food | No biryani<br>';
    html += '<span style="color:var(--red)">Violation = 20 km walk punishment (immutable, auto-logged)</span>';
    html += '</div></div>';

    panel.innerHTML = html;
  };

  // ── Handle camera capture ──
  window.handleFoodCapture = async function(input) {
    if (!input.files || !input.files[0]) return;
    var file = input.files[0];

    var apiKey = getAiKey();
    if (!apiKey) {
      alert('No Gemini API key found. Go to System > API Keys and add your Gemini key first.');
      return;
    }

    var resultDiv = document.getElementById('foodAnalysisResult');
    if (!resultDiv) return;

    // Show preview + loading
    var previewUrl = URL.createObjectURL(file);
    resultDiv.innerHTML =
      '<div style="text-align:center;margin-bottom:16px">' +
      '<img src="' + previewUrl + '" style="max-width:100%;max-height:300px;border-radius:12px;border:2px solid rgba(252,76,2,0.2)">' +
      '</div>' +
      '<div style="text-align:center;padding:20px">' +
      '<div style="font-family:var(--font-mono);font-size:12px;letter-spacing:2px;color:var(--strava,#FC4C02);animation:pulse 1s infinite">ANALYZING WITH AI...</div>' +
      '<div style="font-family:var(--font-mono);font-size:0.6rem;color:var(--text-dim);margin-top:4px">Gemini Vision scanning nutrients + checking food code</div>' +
      '</div>';

    try {
      // Convert to base64
      var base64 = await fileToBase64(file);
      var mimeType = file.type || 'image/jpeg';

      // Upload to Supabase Storage
      var photoUrl = await uploadFoodPhoto(file);

      // Analyze with Gemini
      var analysis = await analyzeFoodImage(base64, mimeType);

      // Save to food log
      var ist = (typeof getNowIST === 'function') ? getNowIST() : new Date();
      var timeStr = String(ist.getHours()).padStart(2,'0') + ':' + String(ist.getMinutes()).padStart(2,'0');
      var dateStr = ist.getFullYear() + '-' + String(ist.getMonth()+1).padStart(2,'0') + '-' + String(ist.getDate()).padStart(2,'0');

      var logEntry = {
        date: dateStr,
        time: timeStr,
        photo_url: photoUrl,
        items: analysis.items || [],
        total: analysis.total || {},
        violations: analysis.violations || [],
        verdict: analysis.verdict || 'CLEAN',
        health_score: analysis.health_score || 0,
        summary: analysis.summary || ''
      };
      saveFoodLog(logEntry);

      // Render result
      var isViolation = analysis.verdict === 'VIOLATION';
      var html = '';

      // Photo
      html += '<div style="text-align:center;margin-bottom:16px">';
      html += '<img src="' + previewUrl + '" style="max-width:100%;max-height:250px;border-radius:12px;border:2px solid ' + (isViolation ? 'rgba(255,82,82,0.4)' : 'rgba(0,230,118,0.3)') + '">';
      html += '</div>';

      // Verdict banner
      if (isViolation) {
        html += '<div style="text-align:center;padding:16px;background:linear-gradient(135deg,rgba(255,82,82,0.1),rgba(255,82,82,0.05));border:2px solid rgba(255,82,82,0.3);border-radius:12px;margin-bottom:16px">';
        html += '<div style="font-family:var(--font-mono);font-size:1.2rem;font-weight:700;color:var(--red);letter-spacing:2px">FOOD CODE VIOLATION</div>';
        html += '<div style="font-family:var(--font-mono);font-size:0.8rem;color:var(--red);margin-top:4px">' + VIOLATION_PENALTY_KM + ' KM WALK PUNISHMENT — AUTO-LOGGED</div>';
        analysis.violations.forEach(function(v) {
          html += '<div style="font-family:var(--font-mono);font-size:0.65rem;color:var(--text-dim);margin-top:6px">Rule ' + v.rule + ': ' + v.item + ' — ' + v.reason + '</div>';
        });
        html += '</div>';
      } else {
        html += '<div style="text-align:center;padding:16px;background:rgba(0,230,118,0.05);border:1px solid rgba(0,230,118,0.2);border-radius:12px;margin-bottom:16px">';
        html += '<div style="font-family:var(--font-mono);font-size:1.2rem;font-weight:700;color:var(--green);letter-spacing:2px">CLEAN</div>';
        html += '<div style="font-family:var(--font-mono);font-size:0.7rem;color:var(--green);margin-top:4px">No food code violations detected</div>';
        html += '</div>';
      }

      // Health score
      html += '<div style="text-align:center;margin-bottom:16px">';
      html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-dim);margin-bottom:4px">HEALTH SCORE</div>';
      var scoreColor = analysis.health_score >= 7 ? '#00E676' : analysis.health_score >= 4 ? '#F5A623' : '#FF5252';
      html += '<div style="font-family:var(--font-mono);font-size:2rem;font-weight:700;color:' + scoreColor + '">' + (analysis.health_score || 0) + '<span style="font-size:0.8rem;color:var(--text-dim)">/10</span></div>';
      html += '<div style="font-family:var(--font-mono);font-size:0.65rem;color:var(--text-dim)">' + (analysis.summary || '') + '</div>';
      html += '</div>';

      // Nutrition breakdown
      if (analysis.items && analysis.items.length) {
        html += '<div style="margin-bottom:16px">';
        html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:3px;color:var(--text-dim);margin-bottom:10px">NUTRITION BREAKDOWN</div>';
        html += '<table style="width:100%;border-collapse:collapse;font-family:var(--font-mono);font-size:0.65rem">';
        html += '<tr style="color:var(--text-dim);border-bottom:1px solid rgba(255,255,255,0.06)"><th style="text-align:left;padding:6px 4px">ITEM</th><th style="text-align:right;padding:6px 4px">GRAMS</th><th style="text-align:right;padding:6px 4px">CAL</th><th style="text-align:right;padding:6px 4px">PROTEIN</th><th style="text-align:right;padding:6px 4px">CARBS</th><th style="text-align:right;padding:6px 4px">FAT</th></tr>';
        analysis.items.forEach(function(item) {
          html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.03)">';
          html += '<td style="padding:6px 4px;color:#fff">' + item.name + '</td>';
          html += '<td style="text-align:right;padding:6px 4px;color:var(--text-dim)">' + (item.estimated_grams || '-') + '</td>';
          html += '<td style="text-align:right;padding:6px 4px;color:#FC4C02">' + (item.calories || 0) + '</td>';
          html += '<td style="text-align:right;padding:6px 4px;color:#00E676">' + (item.protein_g || 0) + 'g</td>';
          html += '<td style="text-align:right;padding:6px 4px;color:#F5A623">' + (item.carbs_g || 0) + 'g</td>';
          html += '<td style="text-align:right;padding:6px 4px;color:#FF5252">' + (item.fat_g || 0) + 'g</td>';
          html += '</tr>';
        });
        // Totals row
        if (analysis.total) {
          html += '<tr style="border-top:2px solid rgba(255,255,255,0.1);font-weight:700">';
          html += '<td style="padding:8px 4px;color:#fff">TOTAL</td><td></td>';
          html += '<td style="text-align:right;padding:8px 4px;color:#FC4C02">' + Math.round(analysis.total.calories || 0) + '</td>';
          html += '<td style="text-align:right;padding:8px 4px;color:#00E676">' + Math.round(analysis.total.protein_g || 0) + 'g</td>';
          html += '<td style="text-align:right;padding:8px 4px;color:#F5A623">' + Math.round(analysis.total.carbs_g || 0) + 'g</td>';
          html += '<td style="text-align:right;padding:8px 4px;color:#FF5252">' + Math.round(analysis.total.fat_g || 0) + 'g</td>';
          html += '</tr>';
        }
        html += '</table>';
        html += '</div>';
      }

      resultDiv.innerHTML = html;

      // Auto-create punishment if violation
      if (isViolation && analysis.violations.length > 0) {
        await createFoodViolationSlip(analysis.violations, photoUrl);
      }

      // Refresh the panel to show updated daily log
      setTimeout(function() { renderFoodScanner(); }, 1000);

    } catch(e) {
      resultDiv.innerHTML =
        '<div style="text-align:center;padding:20px">' +
        '<div style="font-family:var(--font-mono);font-size:12px;color:var(--red)">ANALYSIS FAILED</div>' +
        '<div style="font-family:var(--font-mono);font-size:0.7rem;color:var(--text-dim);margin-top:8px">' + e.message + '</div>' +
        '</div>';
    }

    // Reset input so same file can be selected again
    input.value = '';
  };

})();
