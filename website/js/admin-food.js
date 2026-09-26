// ═══════════════════════════════════════════
// FIRST LIGHT — FOOD LOG (lifetime) + SCANNER (Gemini Vision)
//
// THE RECORD IS FOR LIFE. Every meal ever logged is kept: Supabase `food_log`
// is the source of truth (no date window, no row cap, no retention rule) and
// localStorage is only an offline cache. Before 2026-09-26 this module wrote to
// localStorage ONLY, capped at 500 entries, and rendered today alone — clearing
// the browser or logging meal 501 silently destroyed the oldest history.
//
// WORKS WITH THE HOME NETWORK OFF. Two paths log a meal:
//   • SCAN   — Gemini Vision reads the photo. Needs the network.
//   • MANUAL — typed entry, no AI, no photo. Works fully offline.
// Either way the write goes through FL.upsert, so the service worker queues it
// and replays it (with a re-stamped token) the next time there is signal.
//
// AI verdicts are ADVISORY ONLY. Nothing here can create debt or a slip — only
// the owner's explicit BROKEN mark in rules.html does that.
// ═══════════════════════════════════════════

(function() {
  'use strict';

  var MAX_IMAGE_SIZE = 4 * 1024 * 1024; // 4MB max for Gemini
  var ANALYSIS_TIMEOUT = 30000; // 30 second timeout
  var MAX_RETRIES = 2; // retry on failure
  var CACHE_KEY = 'fl_food_log';
  // Cap applies to SYNCED cache rows only — those already exist in Supabase, so
  // trimming them loses nothing. Unsynced rows are NEVER trimmed at any count:
  // they are the only copy until the queue drains.
  var SYNCED_CACHE_MAX = 1200;
  var TABLE = 'food_log';

  // ── ids ──
  function newId() {
    try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch(e) {}
    var b = new Uint8Array(16);
    try { crypto.getRandomValues(b); } catch(e) { for (var i=0;i<16;i++) b[i]=Math.floor(Math.random()*256); }
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.from(b).map(function(x){ return x.toString(16).padStart(2,'0'); }).join('');
    return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
  }

  function istNow() {
    return (typeof getNowIST === 'function') ? getNowIST() : new Date();
  }
  function istDate(d) {
    d = d || istNow();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function istTime(d) {
    d = d || istNow();
    return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }

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

  // ═══ CACHE (offline mirror of food_log) ═══════════════
  function loadCache() {
    try {
      var a = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
      return Array.isArray(a) ? a : [];
    } catch(e) { return []; }
  }

  function saveCache(rows) {
    // Keep every unsynced row. Trim only the oldest synced ones.
    var unsynced = rows.filter(function(r){ return !r.synced; });
    var synced = rows.filter(function(r){ return r.synced; })
      .sort(function(a,b){ return keyOf(b) < keyOf(a) ? -1 : 1; })
      .slice(0, SYNCED_CACHE_MAX);
    var merged = unsynced.concat(synced).sort(function(a,b){ return keyOf(b) < keyOf(a) ? -1 : 1; });
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(merged));
    } catch(e) {
      // Quota hit: shed synced rows only, never the unsynced ones.
      console.warn('[food] cache quota, shedding synced rows:', e.message);
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(unsynced.concat(synced.slice(0, 200))));
      } catch(e2) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(unsynced)); } catch(e3) {}
      }
    }
    return merged;
  }

  function keyOf(r) { return (r.date || '') + 'T' + (r.time || '00:00'); }

  // ═══ CROSS-PAGE SYNC ══════════════════════════════════════
  // One food store, many surfaces: the admin panel, the Lifetime System
  // widget, and food.html can all be open at once. Any write announces itself
  // on the FL bus; every mounted surface re-renders. Without this they read the
  // same localStorage but never learn it changed.
  var _subs = [];          // external subscribers (e.g. food.html)
  var _mounts = [];        // live renderInto() targets to repaint

  function announce(detail) {
    try { if (window.FL && typeof FL.emit === 'function') FL.emit('food_log', detail || null); }
    catch (e) {}
    notifyLocal('local');
  }

  function notifyLocal(source) {
    source = source || 'local';
    _subs.slice().forEach(function(fn) {
      try { fn({ source: source }); } catch (e) { console.warn('[food] subscriber:', e.message); }
    });
    // Compact widgets hold no transient state, so they are always safe to repaint.
    _mounts = _mounts.filter(function(m) { return m.el && m.el.isConnected; });
    _mounts.forEach(function(m) {
      try { paintWidget(m.el, m.opts); } catch (e) {}
    });
    // The FULL panel is deliberately NOT repainted for a local write. The local
    // flow owns that surface and may be mid-way through showing something
    // transient — a scan's verdict, macros and photo live in #foodAnalysisResult,
    // and a repaint here detaches that node before the user ever sees it. Both
    // local paths already re-render themselves once the result has been shown.
    if (source === 'local') return;
    schedulePanelRepaint();
  }

  // Coalesced: a draining queue can announce many times in a row, and that
  // should cost one repaint, not twenty.
  var _panelTimer = null;
  function schedulePanelRepaint() {
    if (_panelTimer) return;
    _panelTimer = setTimeout(function() {
      _panelTimer = null;
      var panel = document.getElementById('panel-food-scanner');
      if (!panel || !panel.childElementCount) return;
      if (typeof window.renderFoodScanner !== 'function') return;
      // Don't stomp a scan result the user is currently reading.
      var res = document.getElementById('foodAnalysisResult');
      if (res && res.childElementCount) return;
      _historyRows = null;
      try { window.renderFoodScanner(); } catch (e) {}
    }, 300);
  }

  function onChange(fn) {
    if (typeof fn !== 'function') return function() {};
    _subs.push(fn);
    return function() { _subs = _subs.filter(function(f) { return f !== fn; }); };
  }

  // Another tab, or another device via Realtime, changed food_log.
  function wireBus() {
    if (!(window.FL && typeof FL.onChange === 'function')) return;
    FL.onChange(function(msg) {
      if (!msg || msg.source === 'local') return;      // our own write, already painted
      if (msg.type !== 'food_log') return;
      // A remote row is not in our cache yet, so pull the record again.
      _historyRows = null;
      if (msg.source === 'remote') { refreshHistory(); }
      notifyLocal(msg.source);
    });
  }

  function upsertCache(entry) {
    var rows = loadCache();
    var i = rows.findIndex(function(r){ return r.id && entry.id && r.id === entry.id; });
    if (i >= 0) rows[i] = Object.assign({}, rows[i], entry);
    else rows.push(entry);
    return saveCache(rows);
  }

  // ═══ SUPABASE (the lifetime record) ═══════════════════
  function toRow(e) {
    return {
      id: e.id,
      date: e.date,
      meal_time: e.time || null,
      source: e.source || 'scan',
      photo_url: e.photo_url || null,
      verdict: e.verdict || 'UNREVIEWED',
      calories: (e.total && num(e.total.calories)) || 0,
      summary: e.summary || '',
      data: { items: e.items || [], total: e.total || {}, violations: e.violations || [], health_score: e.health_score }
    };
  }

  function fromRow(r) {
    var d = r.data || {};
    return {
      id: r.id,
      date: r.date,
      time: r.meal_time || '',
      source: r.source || 'scan',
      photo_url: r.photo_url || null,
      verdict: r.verdict || 'UNREVIEWED',
      items: d.items || [],
      total: d.total || { calories: num(r.calories) },
      violations: d.violations || [],
      health_score: d.health_score,
      summary: r.summary || '',
      synced: true
    };
  }

  // Push one entry. Offline → FL.upsert returns a synthetic 202 from the SW
  // after queueing, so the entry stays unsynced in cache and the queue owns it.
  async function pushRow(entry) {
    if (!(window.FL && typeof FL.upsert === 'function')) return false;
    try {
      var resp = await FL.upsert(TABLE, toRow(entry), { owner: true, onConflict: 'id' });
      var ok = !!(resp && resp.ok && resp.status !== 202);
      if (ok) upsertCache({ id: entry.id, synced: true });
      return ok;
    } catch(e) {
      console.warn('[food] push failed, kept locally:', e.message);
      return false;
    }
  }

  // Retry everything still unsynced. Safe to call often: the upsert keys on the
  // client-minted uuid, so a replayed write merges instead of duplicating.
  async function syncPending() {
    if (!navigator.onLine) return 0;
    var pending = loadCache().filter(function(r){ return !r.synced; });
    var n = 0;
    for (var i = 0; i < pending.length; i++) {
      if (await pushRow(pending[i])) n++;
    }
    // Only speak up if something actually changed state, so the periodic
    // sync sweep does not cause a render storm.
    if (n) announce({ synced: n });
    return n;
  }

  // Read the lifetime record. The SW caches this GET, so it still answers with
  // the home network off; on a cold cache we fall back to localStorage alone.
  async function fetchHistory() {
    var out = loadCache();
    var SUPA = window.FL && FL.SUPABASE_URL;
    var KEY = window.FL && FL.SUPABASE_ANON_KEY;
    if (!SUPA || !KEY) return dedupe(out);
    try {
      var token = KEY;
      if (typeof FL.ownerToken === 'function') token = (await FL.ownerToken()) || KEY;
      var r = await fetch(SUPA + '/rest/v1/' + TABLE + '?select=*&order=date.desc,logged_at.desc', {
        headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + token }
      });
      if (r.ok) {
        var rows = await r.json();
        if (Array.isArray(rows)) out = rows.map(fromRow).concat(out);
      }
    } catch(e) { /* offline — cache only */ }
    return dedupe(out);
  }

  // Server rows come first, so they win on id; unsynced local rows survive.
  function dedupe(rows) {
    var seen = {}, out = [];
    rows.forEach(function(r) {
      var k = r.id || keyOf(r) + (r.summary || '');
      if (seen[k]) return;
      seen[k] = 1; out.push(r);
    });
    return out.sort(function(a,b){ return keyOf(b) < keyOf(a) ? -1 : 1; });
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
      var dateStr = istDate();
      var ist = istNow();
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

    var prompt = 'You are a nutrition assistant. Your photo analysis is advisory, not a confirmed rule check-in. The owner follows these food rules:\n\n' +
      'RULE 1.1: No fried food (zero tolerance — pakora, samosa, fries, anything fried in oil)\n' +
      'RULE 1.2: No sugar (raw fruits OK, but no juices, sweets, desserts, added sugar, mithai, halwa, jalebi)\n' +
      'RULE 1.3: No alcohol (beer, wine, spirits — zero tolerance)\n' +
      'RULE 1.5: No cold drinks or carbonated beverages (cola, pepsi, sprite, soda, energy drinks)\n' +
      'RULE 1.6: No junk food (pizza, burger, processed, packaged, fast food, maggi, chips)\n' +
      'RULE 1.7: No ice cream. Training over 90 minutes may allow gels, dates, or banana; race day is exempt. A photo alone cannot establish that context.\n\n' +
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
      '- Do not infer a violation from uncertain appearance or invent a rule not listed above. Mark uncertain items for owner review in the reason.\n' +
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

  // ── Save one meal: cache first (so it survives a dead network), then push ──
  function saveFoodLog(entry) {
    entry.id = entry.id || newId();
    entry.synced = false;
    upsertCache(entry);
    announce({ id: entry.id, date: entry.date });   // every open surface repaints
    pushRow(entry);   // fire and forget: queued by the SW when offline
    return entry;
  }

  // ── Totals ──
  function sumTotals(entries) {
    var t = { calories:0, protein_g:0, carbs_g:0, fat_g:0, fiber_g:0, violations:0 };
    entries.forEach(function(l) {
      if (l.total) {
        t.calories += num(l.total.calories); t.protein_g += num(l.total.protein_g);
        t.carbs_g += num(l.total.carbs_g);   t.fat_g += num(l.total.fat_g);
        t.fiber_g += num(l.total.fiber_g);
      }
      if (l.verdict === 'VIOLATION') t.violations++;
    });
    return t;
  }

  function getTodayFoodLog() {
    var today = istDate();
    return loadCache().filter(function(l) { return l.date === today; });
  }

  // ═══ RENDER HELPERS ═══════════════════════════════════
  var TAP = '-webkit-tap-highlight-color:transparent;touch-action:manipulation';

  function macroGrid(t) {
    // auto-fit so five cards reflow instead of overflowing a 375px phone
    var cells = [
      ['CALORIES', Math.round(t.calories), '#FC4C02'],
      ['PROTEIN', Math.round(t.protein_g) + 'g', '#00E676'],
      ['CARBS', Math.round(t.carbs_g) + 'g', '#F5A623'],
      ['FAT', Math.round(t.fat_g) + 'g', '#FF5252'],
      ['FIBER', Math.round(t.fiber_g) + 'g', '#00B0FF']
    ];
    var h = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(62px,1fr));gap:6px;margin-bottom:16px">';
    cells.forEach(function(c) {
      h += '<div style="text-align:center;padding:12px 4px;background:var(--bg3);border-radius:10px">' +
        '<div style="font-family:var(--font-mono);font-size:1rem;font-weight:700;color:' + c[2] + '">' + c[1] + '</div>' +
        '<div style="font-family:var(--font-mono);font-size:7px;letter-spacing:1px;color:var(--text-dim)">' + c[0] + '</div></div>';
    });
    return h + '</div>';
  }

  function mealRow(log) {
    var isViolation = log.verdict === 'VIOLATION';
    var unrev = log.verdict === 'UNREVIEWED';
    var col = isViolation ? 'var(--red)' : (unrev ? 'var(--gold)' : 'var(--green)');
    var label = isViolation ? 'POSSIBLE VIOLATION' : (unrev ? 'LOGGED — NOT AI-REVIEWED' : 'NO ISSUE FLAGGED');
    var bg = isViolation ? 'rgba(255,82,82,0.04)' : (unrev ? 'rgba(245,166,35,0.04)' : 'rgba(0,230,118,0.03)');
    var bd = isViolation ? 'rgba(255,82,82,0.12)' : (unrev ? 'rgba(245,166,35,0.12)' : 'rgba(0,230,118,0.08)');
    var h = '<div style="padding:12px;background:' + bg + ';border:1px solid ' + bd + ';border-radius:8px;margin-bottom:6px">';
    h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">';
    h += '<div style="font-family:var(--font-mono);font-size:0.65rem;font-weight:700;color:' + col + '">' + label + ' — ' + esc(log.time || '') +
         (log.synced === false ? ' <span style="color:var(--gold)">· PENDING SYNC</span>' : '') + '</div>';
    h += '<div style="font-family:var(--font-mono);font-size:0.65rem;color:var(--text-dim)">' +
         Math.round(num(log.total && log.total.calories)) + ' cal | P:' + Math.round(num(log.total && log.total.protein_g)) + 'g</div>';
    h += '</div>';
    h += '<div style="font-family:var(--font-mono);font-size:0.6rem;color:var(--text-dim);margin-top:3px">' + esc(log.summary || '') + '</div>';
    return h + '</div>';
  }

  // ── Lifetime history, grouped by day ──
  function historyHtml(rows, days) {
    var byDate = {};
    rows.forEach(function(r) { (byDate[r.date] = byDate[r.date] || []).push(r); });
    var dates = Object.keys(byDate).sort().reverse();
    var lifetimeDays = dates.length;
    var lifetimeMeals = rows.length;
    var first = dates.length ? dates[dates.length - 1] : null;
    var shown = (days === 'all') ? dates : dates.slice(0, days);

    var h = '';
    h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">';
    h += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:3px;color:var(--text-dim)">FOOD LOG — LIFETIME</div>';
    h += '<div style="display:flex;gap:4px" id="foodRangeBtns">';
    [['7','7D'],['30','30D'],['90','90D'],['all','ALL']].forEach(function(r) {
      var on = String(days) === r[0];
      h += '<button type="button" data-range="' + r[0] + '" style="min-height:32px;padding:6px 10px;border-radius:6px;cursor:pointer;' + TAP + ';' +
        'font-family:var(--font-mono);font-size:9px;font-weight:700;letter-spacing:1px;' +
        (on ? 'background:rgba(0,212,255,0.15);border:1px solid rgba(0,212,255,0.45);color:#00D4FF'
            : 'background:transparent;border:1px solid rgba(255,255,255,0.12);color:var(--text-dim)') + '">' + r[1] + '</button>';
    });
    h += '</div></div>';

    h += '<div style="font-family:var(--font-mono);font-size:0.6rem;color:var(--text-dim);margin-bottom:12px">' +
      lifetimeMeals + ' meals logged across ' + lifetimeDays + ' day' + (lifetimeDays === 1 ? '' : 's') +
      (first ? ' · since ' + esc(first) : '') + ' · kept for life, never pruned</div>';

    if (!dates.length) {
      return h + '<div style="padding:14px;text-align:center;font-family:var(--font-mono);font-size:0.65rem;color:var(--text-dim);' +
        'border:1px dashed rgba(255,255,255,0.12);border-radius:8px">NO MEALS LOGGED YET. SCAN ONE, OR ADD IT BY HAND.</div>';
    }

    shown.forEach(function(ds) {
      var t = sumTotals(byDate[ds]);
      h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;margin-bottom:4px;' +
        'background:var(--bg3);border-radius:8px;border-left:3px solid ' + (t.violations ? 'var(--red)' : 'var(--green)') + '">';
      h += '<div style="font-family:var(--font-mono);font-size:0.68rem;font-weight:700;color:#fff">' + esc(ds) +
        '<span style="color:var(--text-dim);font-weight:400"> · ' + byDate[ds].length + ' meal' + (byDate[ds].length === 1 ? '' : 's') + '</span></div>';
      h += '<div style="font-family:var(--font-mono);font-size:0.62rem;color:var(--text-dim)">' +
        Math.round(t.calories) + ' cal · P' + Math.round(t.protein_g) + ' C' + Math.round(t.carbs_g) + ' F' + Math.round(t.fat_g) +
        (t.violations ? ' · <span style="color:var(--red)">' + t.violations + ' flagged</span>' : '') + '</div>';
      h += '</div>';
    });
    if (days !== 'all' && dates.length > shown.length) {
      h += '<div style="font-family:var(--font-mono);font-size:0.6rem;color:var(--text-dim);text-align:center;padding:6px">' +
        '+ ' + (dates.length - shown.length) + ' earlier day' + (dates.length - shown.length === 1 ? '' : 's') + ' — tap ALL</div>';
    }
    return h;
  }

  // ── Manual entry form — the offline path (no AI, no photo, no network) ──
  function manualFormHtml() {
    var f = function(id, ph, extra) {
      return '<input id="' + id + '" placeholder="' + ph + '" ' + (extra || '') +
        ' style="min-height:44px;padding:10px;background:var(--bg3);border:1px solid rgba(255,255,255,0.1);border-radius:8px;' +
        'color:#fff;font-family:var(--font-mono);font-size:0.7rem;width:100%;box-sizing:border-box;' + TAP + '">';
    };
    var h = '<details id="foodManualWrap" style="margin-bottom:20px;border:1px solid rgba(0,212,255,0.18);border-radius:12px;padding:12px">';
    h += '<summary style="font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:2px;color:#00D4FF;cursor:pointer;' + TAP + '">' +
      '＋ LOG A MEAL BY HAND <span style="color:var(--text-dim);font-weight:400;letter-spacing:0">— works offline</span></summary>';
    h += '<div style="font-family:var(--font-mono);font-size:0.6rem;color:var(--text-dim);margin:10px 0">' +
      'No photo, no AI, no network needed. Saved on this device and pushed to the lifetime record the next time there is signal.</div>';
    h += '<div style="display:grid;gap:8px">';
    h += f('fdmDesc', 'what you ate — e.g. 3 roti, dal, sabzi', 'maxlength="160"');
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(78px,1fr));gap:8px">';
    h += f('fdmCal', 'cal', 'type="number" inputmode="numeric" min="0"');
    h += f('fdmP', 'protein g', 'type="number" inputmode="numeric" min="0"');
    h += f('fdmC', 'carbs g', 'type="number" inputmode="numeric" min="0"');
    h += f('fdmF', 'fat g', 'type="number" inputmode="numeric" min="0"');
    h += f('fdmFib', 'fiber g', 'type="number" inputmode="numeric" min="0"');
    h += '</div>';
    h += '<button type="button" id="fdmSave" style="min-height:44px;padding:12px;border-radius:8px;cursor:pointer;' + TAP + ';' +
      'background:rgba(0,212,255,0.12);border:1px solid rgba(0,212,255,0.4);color:#00D4FF;' +
      'font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:2px">SAVE MEAL</button>';
    h += '<div id="fdmMsg" style="font-family:var(--font-mono);font-size:0.62rem;color:var(--text-dim)"></div>';
    h += '</div></details>';
    return h;
  }

  // ═══ MAIN PANEL ═══════════════════════════════════════
  var _range = 30;
  var _historyRows = null;

  window.renderFoodScanner = function() {
    var panel = document.getElementById('panel-food-scanner');
    if (!panel) return;

    var todayLogs = getTodayFoodLog();
    var t = sumTotals(todayLogs);
    var offline = !navigator.onLine;
    var pending = loadCache().filter(function(r){ return !r.synced; }).length;

    var html = '';

    // Header
    html += '<div style="text-align:center;margin-bottom:20px">';
    html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:4px;color:var(--text-dim);margin-bottom:8px">LIFETIME RECORD</div>';
    html += '<h2 style="font-family:var(--font-mono);font-size:clamp(1.1rem,5vw,1.4rem);font-weight:700;letter-spacing:2px;margin-bottom:4px">FOOD LOG</h2>';
    html += '<div style="font-family:var(--font-mono);font-size:0.7rem;color:var(--text-dim)">Every meal, for life. AI findings never create a penalty.</div>';
    html += '<div style="font-family:var(--font-mono);font-size:0.65rem;margin-top:8px;line-height:2">' +
      '<a href="food.html" style="color:var(--cyan,#00D4FF)">FOOD CALENDAR — WHICH DAYS I TRACKED →</a><br>' +
      '<a href="rules.html" style="color:var(--gold)">OPEN OWNER FOOD &amp; RULES CHECK-IN →</a></div>';

    if (offline || pending) {
      html += '<div style="margin-top:12px;padding:10px;background:rgba(245,166,35,0.06);border:1px solid rgba(245,166,35,0.25);border-radius:8px;' +
        'font-family:var(--font-mono);font-size:0.62rem;color:var(--gold);line-height:1.6">' +
        (offline ? 'OFFLINE — logging still works. ' : '') +
        (pending ? pending + ' meal' + (pending === 1 ? '' : 's') + ' waiting to sync. ' : '') +
        'Nothing is dropped; the queue replays when there is signal.</div>';
    }

    // API key check — scanning needs one, hand-logging does not
    if (!getAiKey()) {
      html += '<div style="margin-top:12px;padding:10px;background:rgba(255,82,82,0.06);border:1px solid rgba(255,82,82,0.2);border-radius:8px;font-family:var(--font-mono);font-size:0.65rem;color:var(--red)">';
      html += 'No Gemini API key found — photo scanning is off. Hand-logging below still works. Add a key in System &gt; API Keys (free at aistudio.google.com/apikey)';
      html += '</div>';
    }
    html += '</div>';

    // Camera button
    html += '<div style="text-align:center;margin-bottom:16px">';
    html += '<label id="foodScanLabel" style="display:inline-flex;align-items:center;gap:10px;min-height:44px;padding:16px 28px;background:linear-gradient(135deg,rgba(252,76,2,0.1),rgba(255,82,82,0.1));border:2px dashed rgba(252,76,2,0.3);border-radius:14px;cursor:pointer;font-family:var(--font-mono);font-size:12px;font-weight:700;letter-spacing:2px;color:var(--strava,#FC4C02);' + TAP + '">';
    html += '<span style="font-size:24px">&#128247;</span> SCAN FOOD';
    html += '<input type="file" id="foodCameraInput" accept="image/*" capture="environment" style="display:none">';
    html += '</label>';
    html += '<div style="font-family:var(--font-mono);font-size:0.6rem;color:var(--text-dim);margin-top:8px">Opens camera — take a photo of your meal' +
      (offline ? ' (needs signal; use hand-logging below)' : '') + '</div>';
    html += '</div>';

    // Manual (offline) entry
    html += manualFormHtml();

    // Analysis result area
    html += '<div id="foodAnalysisResult"></div>';

    // Today's summary
    if (todayLogs.length > 0) {
      html += '<div style="margin-top:28px">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px">';
      html += '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:3px;color:var(--text-dim)">TODAY\'S INTAKE</div>';
      html += '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim)">' + todayLogs.length + ' meal' + (todayLogs.length > 1 ? 's' : '') + ' logged</div>';
      html += '</div>';
      html += macroGrid(t);

      // AI flags are advisory; no slip or distance debt is created here.
      if (t.violations > 0) {
        html += '<div style="padding:10px;background:rgba(255,82,82,0.06);border:1px solid rgba(255,82,82,0.2);border-radius:8px;margin-bottom:12px;text-align:center">';
        html += '<div style="font-family:var(--font-mono);font-size:0.7rem;color:var(--red);font-weight:700">' + t.violations + ' POSSIBLE VIOLATION' + (t.violations > 1 ? 'S' : '') + ' FLAGGED BY AI — NO DEBT CREATED</div>';
        html += '</div>';
      }

      todayLogs.forEach(function(log) { html += mealRow(log); });
      html += '</div>';
    }

    // Lifetime history
    html += '<div id="foodHistory" style="margin-top:28px">' +
      '<div style="font-family:var(--font-mono);font-size:0.65rem;color:var(--text-dim)">LOADING LIFETIME LOG…</div></div>';

    // Food code reminder
    html += '<div style="margin-top:24px;padding:14px;background:rgba(255,82,82,0.03);border:1px solid rgba(255,82,82,0.08);border-radius:10px">';
    html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:3px;color:var(--red);font-weight:700;margin-bottom:6px">FOOD CODE — ZERO TOLERANCE</div>';
    html += '<div style="font-family:var(--font-mono);font-size:0.6rem;color:var(--text-dim);line-height:1.8">';
    html += 'No fried food | No sugar | No alcohol | No cold drinks | No junk food | No biryani<br>';
    html += '<span style="color:var(--gold)">AI scans are advisory. Only an explicit BROKEN mark in the owner check-in can create the 50 km food penalty.</span>';
    html += '</div></div>';

    panel.innerHTML = html;
    wirePanel(panel);
    refreshHistory();
    syncPending();
  };

  // ── events (no inline handlers) ──
  function wirePanel(root) {
    var input = root.querySelector('#foodCameraInput');
    if (input) input.addEventListener('change', function() { window.handleFoodCapture(input); });

    var save = root.querySelector('#fdmSave');
    if (save) save.addEventListener('click', function() { saveManual(root); });
  }

  function wireRange(wrap) {
    var btns = wrap.querySelector('#foodRangeBtns');
    if (!btns) return;
    btns.querySelectorAll('button[data-range]').forEach(function(b) {
      b.addEventListener('click', function() {
        var r = b.dataset.range;
        _range = (r === 'all') ? 'all' : parseInt(r, 10);
        renderHistoryInto(wrap);
      });
    });
  }

  function renderHistoryInto(wrap) {
    if (!wrap) return;
    wrap.innerHTML = historyHtml(_historyRows || loadCache(), _range);
    wireRange(wrap);
  }

  async function refreshHistory() {
    var wrap = document.getElementById('foodHistory');
    if (!wrap) return;
    try { _historyRows = await fetchHistory(); } catch(e) { _historyRows = loadCache(); }
    renderHistoryInto(document.getElementById('foodHistory'));
  }

  function saveManual(root) {
    var desc = (root.querySelector('#fdmDesc') || {}).value || '';
    var msg = root.querySelector('#fdmMsg');
    desc = String(desc).trim();
    if (!desc) { if (msg) { msg.style.color = 'var(--red)'; msg.textContent = 'Describe the meal first.'; } return; }

    var entry = saveFoodLog({
      date: istDate(), time: istTime(), source: 'manual', photo_url: null,
      items: [{ name: desc, calories: num((root.querySelector('#fdmCal')||{}).value) }],
      total: {
        calories: num((root.querySelector('#fdmCal')||{}).value),
        protein_g: num((root.querySelector('#fdmP')||{}).value),
        carbs_g: num((root.querySelector('#fdmC')||{}).value),
        fat_g: num((root.querySelector('#fdmF')||{}).value),
        fiber_g: num((root.querySelector('#fdmFib')||{}).value)
      },
      violations: [],
      // Never default to CLEAN. A hand-logged meal is recorded, not judged —
      // the owner's mark in rules.html is the only thing that rules on it.
      verdict: 'UNREVIEWED',
      health_score: null,
      summary: desc
    });

    if (msg) {
      msg.style.color = 'var(--green)';
      msg.textContent = navigator.onLine ? 'SAVED ✓ — in the lifetime log.' : 'SAVED ✓ — queued, syncs when there is signal.';
    }
    ['fdmDesc','fdmCal','fdmP','fdmC','fdmF','fdmFib'].forEach(function(id) {
      var el = root.querySelector('#' + id); if (el) el.value = '';
    });
    _historyRows = null;
    setTimeout(function() { window.renderFoodScanner(); }, 700);
    return entry;
  }

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

      // Save to the lifetime food log (cache first, then Supabase/queue)
      saveFoodLog({
        date: istDate(), time: istTime(), source: 'scan', photo_url: photoUrl,
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
        html += '<div style="font-family:var(--font-mono);font-size:1.2rem;font-weight:700;color:var(--red);letter-spacing:2px">POSSIBLE FOOD CODE VIOLATION</div>';
        html += '<div style="font-family:var(--font-mono);font-size:0.8rem;color:var(--gold);margin-top:4px">AI SUGGESTION ONLY — NO PENALTY CREATED</div>';
        analysis.violations.forEach(function(v) {
          html += '<div style="font-family:var(--font-mono);font-size:0.65rem;color:var(--text-dim);margin-top:6px">Rule ' + esc(v.rule||'?') + ': ' + esc(v.item||'?') + ' — ' + esc(v.reason||'') + '</div>';
        });
        html += '</div>';
      } else {
        html += '<div style="text-align:center;padding:16px;background:rgba(0,230,118,0.05);border:1px solid rgba(0,230,118,0.2);border-radius:12px;margin-bottom:16px">';
        html += '<div style="font-family:var(--font-mono);font-size:1.2rem;font-weight:700;color:var(--green);letter-spacing:2px">NO ISSUE FLAGGED</div>';
        html += '<div style="font-family:var(--font-mono);font-size:0.7rem;color:var(--green);margin-top:4px">AI analysis only — confirm the day in the owner check-in</div>';
        html += '</div>';
      }

      // Health score
      var scoreColor = analysis.health_score >= 7 ? '#00E676' : analysis.health_score >= 4 ? '#F5A623' : '#FF5252';
      html += '<div style="text-align:center;margin-bottom:16px">';
      html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text-dim);margin-bottom:4px">HEALTH SCORE</div>';
      html += '<div style="font-family:var(--font-mono);font-size:2rem;font-weight:700;color:' + scoreColor + '">' + (analysis.health_score || 0) + '<span style="font-size:0.8rem;color:var(--text-dim)">/10</span></div>';
      html += '<div style="font-family:var(--font-mono);font-size:0.65rem;color:var(--text-dim)">' + esc(analysis.summary || '') + '</div>';
      html += '</div>';

      // Nutrition breakdown table
      if (analysis.items && analysis.items.length) {
        html += '<div style="margin-bottom:16px;overflow-x:auto;-webkit-overflow-scrolling:touch">';
        html += '<div style="font-family:var(--font-mono);font-size:9px;letter-spacing:3px;color:var(--text-dim);margin-bottom:8px">NUTRITION BREAKDOWN</div>';
        html += '<table style="width:100%;border-collapse:collapse;font-family:var(--font-mono);font-size:0.6rem">';
        html += '<tr style="color:var(--text-dim);border-bottom:1px solid rgba(255,255,255,0.06)"><th style="text-align:left;padding:5px 3px">ITEM</th><th style="text-align:right;padding:5px 3px">g</th><th style="text-align:right;padding:5px 3px">CAL</th><th style="text-align:right;padding:5px 3px">P</th><th style="text-align:right;padding:5px 3px">C</th><th style="text-align:right;padding:5px 3px">F</th></tr>';
        analysis.items.forEach(function(item) {
          html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.03)">';
          html += '<td style="padding:5px 3px;color:#fff">' + esc(item.name||'?') + '</td>';
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
          html += '<td style="text-align:right;padding:6px 3px;color:#FC4C02">' + Math.round(num(analysis.total.calories)) + '</td>';
          html += '<td style="text-align:right;padding:6px 3px;color:#00E676">' + Math.round(num(analysis.total.protein_g)) + '</td>';
          html += '<td style="text-align:right;padding:6px 3px;color:#F5A623">' + Math.round(num(analysis.total.carbs_g)) + '</td>';
          html += '<td style="text-align:right;padding:6px 3px;color:#FF5252">' + Math.round(num(analysis.total.fat_g)) + '</td>';
          html += '</tr>';
        }
        html += '</table></div>';
      }

      html += '<div style="text-align:center;font-family:var(--font-mono);font-size:0.7rem;margin-top:12px"><a href="rules.html" style="color:var(--gold)">REVIEW IN OWNER FOOD &amp; RULES CHECK-IN →</a></div>';
      resultDiv.innerHTML = html;

      // Refresh panel to show updated daily + lifetime log
      _historyRows = null;
      setTimeout(function() { window.renderFoodScanner(); }, 2000);

    } catch(e) {
      console.error('[food] Analysis error:', e);
      resultDiv.innerHTML =
        (previewUrl ? '<div style="text-align:center;margin-bottom:16px"><img src="' + previewUrl + '" style="max-width:100%;max-height:200px;border-radius:12px;opacity:0.5"></div>' : '') +
        '<div style="text-align:center;padding:20px;background:rgba(255,82,82,0.04);border:1px solid rgba(255,82,82,0.15);border-radius:12px">' +
        '<div style="font-family:var(--font-mono);font-size:14px;color:var(--red);font-weight:700;letter-spacing:1px">ANALYSIS FAILED</div>' +
        '<div style="font-family:var(--font-mono);font-size:0.7rem;color:var(--text-dim);margin-top:8px;line-height:1.6">' + esc(e.message) + '</div>' +
        '<div style="font-family:var(--font-mono);font-size:0.62rem;color:var(--gold);margin-top:8px">The meal is not lost — log it by hand above; that path needs no network.</div>' +
        '<div style="margin-top:12px"><button type="button" id="foodRetryBtn" style="min-height:44px;padding:10px 20px;background:rgba(252,76,2,0.1);border:1px solid rgba(252,76,2,0.3);border-radius:8px;color:#FC4C02;font-family:var(--font-mono);font-size:11px;font-weight:700;letter-spacing:1px;cursor:pointer;' + TAP + '">TRY AGAIN</button></div>' +
        '</div>';
      var retry = document.getElementById('foodRetryBtn');
      if (retry) retry.addEventListener('click', function() {
        var el = document.getElementById('foodCameraInput'); if (el) el.click();
      });
    }

    input.value = '';
  };

  // ═══ COMPACT WIDGET — embedded in other panels ════════
  // Used by the lifetime electronics system panel so food lives next to it
  // without forking a second food store.
  function renderInto(el, opts) {
    if (!el) return;
    opts = opts || {};
    // Remember the mount so a change anywhere repaints it.
    if (!_mounts.some(function(m) { return m.el === el; })) _mounts.push({ el: el, opts: opts });
    paintWidget(el, opts);
  }

  function paintWidget(el, opts) {
    if (!el) return;
    opts = opts || {};
    var today = getTodayFoodLog();
    var t = sumTotals(today);
    var pending = loadCache().filter(function(r){ return !r.synced; }).length;

    var h = '';
    h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">';
    h += '<div style="font-family:var(--font-mono);font-size:0.68rem;font-weight:700;color:#fff">TODAY — ' + today.length + ' meal' + (today.length === 1 ? '' : 's') + '</div>';
    h += '<div style="font-family:var(--font-mono);font-size:0.6rem;color:var(--text-dim)">' +
      (navigator.onLine ? 'ONLINE' : 'OFFLINE') + (pending ? ' · ' + pending + ' pending' : '') + '</div>';
    h += '</div>';
    h += macroGrid(t);
    if (t.violations) {
      h += '<div style="padding:8px;margin-bottom:10px;background:rgba(255,82,82,0.06);border:1px solid rgba(255,82,82,0.2);border-radius:8px;text-align:center;' +
        'font-family:var(--font-mono);font-size:0.62rem;color:var(--red);font-weight:700">' +
        t.violations + ' FLAGGED BY AI — ADVISORY, NO DEBT</div>';
    }
    if (!today.length) {
      h += '<div style="padding:12px;text-align:center;font-family:var(--font-mono);font-size:0.62rem;color:var(--text-dim);' +
        'border:1px dashed rgba(255,255,255,0.12);border-radius:8px;margin-bottom:10px">NOTHING LOGGED TODAY YET.</div>';
    } else {
      today.slice(0, 4).forEach(function(l) { h += mealRow(l); });
    }
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">';
    h += '<button type="button" id="fdWidgetOpen" style="flex:1;min-width:130px;min-height:44px;padding:10px;border-radius:8px;cursor:pointer;' + TAP + ';' +
      'background:rgba(252,76,2,0.1);border:1px solid rgba(252,76,2,0.35);color:#FC4C02;' +
      'font-family:var(--font-mono);font-size:10px;font-weight:700;letter-spacing:1px">OPEN FULL FOOD LOG</button>';
    h += '<a href="food.html" style="flex:1;min-width:130px;min-height:44px;padding:10px;border-radius:8px;text-align:center;box-sizing:border-box;' + TAP + ';' +
      'background:rgba(0,212,255,0.08);border:1px solid rgba(0,212,255,0.35);color:var(--cyan,#00D4FF);text-decoration:none;' +
      'font-family:var(--font-mono);font-size:10px;font-weight:700;letter-spacing:1px;display:inline-flex;align-items:center;justify-content:center">FOOD CALENDAR →</a>';
    h += '<a href="rules.html" style="flex:1;min-width:130px;min-height:44px;padding:10px;border-radius:8px;text-align:center;box-sizing:border-box;' + TAP + ';' +
      'background:rgba(245,166,35,0.08);border:1px solid rgba(245,166,35,0.35);color:var(--gold,#F5A623);text-decoration:none;' +
      'font-family:var(--font-mono);font-size:10px;font-weight:700;letter-spacing:1px;display:inline-flex;align-items:center;justify-content:center">RULES CHECK-IN →</a>';
    h += '</div>';
    el.innerHTML = h;

    var open = el.querySelector('#fdWidgetOpen');
    if (open) open.addEventListener('click', function() {
      if (typeof window.switchPanel === 'function') window.switchPanel('food-scanner');
      else location.hash = '#food-scanner';
    });
    syncPending();
  }

  // ── Drain pending meals whenever the network comes back ──
  window.addEventListener('online', function() { syncPending(); });

  // ── Cross-page/device sync ──
  // fl-offline.js may load after this file, so retry the wiring briefly.
  (function bootBus(tries) {
    if (window.FL && typeof FL.onChange === 'function') { wireBus(); return; }
    if ((tries || 0) > 20) return;
    setTimeout(function() { bootBus((tries || 0) + 1); }, 150);
  })(0);

  // Repaint when the page comes back to the foreground — a phone sitting in a
  // pocket misses realtime frames, and this is the cheapest way to catch up.
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState !== 'visible') return;
    _historyRows = null;
    syncPending();
    notifyLocal('resume');
  });

  // ── public API ──
  window.FLFood = {
    renderInto: renderInto,
    logMeal: saveFoodLog,
    today: getTodayFoodLog,
    history: fetchHistory,
    totals: sumTotals,
    syncPending: syncPending,
    onChange: onChange,        // surfaces subscribe to stay in step
    announce: announce
  };

})();
