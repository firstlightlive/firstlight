// ════════════════════════════════════════════════════════════════════════════
// FIRST LIGHT — Strategy panels (Brand & Strategy, Reel Lab, Travel, Growth)
// Wires up 4 new Content Engine panels for the Instagram growth strategy.
// All client-side; calls firstlight-sync for publish_mode setting.
// ════════════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  var SUPA = (window.FL && FL.SUPABASE_URL) || '';
  var KEY  = (window.FL && FL.SUPABASE_ANON_KEY) || '';
  var ADMIN_KEY = localStorage.getItem('fl_admin_key') || '';

  // ── Generic Supabase fetcher (read) ──
  function sb(path, opts) {
    opts = opts || {};
    return fetch(SUPA + '/rest/v1/' + path, Object.assign({
      headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' }
    }, opts)).then(function(r) { return r.json(); });
  }

  // ── Edge Function caller (writes go through firstlight-sync) ──
  function callEdge(action, body) {
    var url = SUPA + '/functions/v1/firstlight-sync?action=' + action;
    return fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Authorization': 'Bearer ' + KEY,
        'x-admin-key': ADMIN_KEY,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    }).then(function(r) { return r.json(); });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BRAND & STRATEGY PANEL
  // ─────────────────────────────────────────────────────────────────────────
  function initBrandStrategy() {
    var panel = document.getElementById('p-brand-strategy');
    if (!panel || panel.dataset.inited) return;
    panel.dataset.inited = '1';

    // Load current publish_mode
    sb('secrets?key=eq.publish_mode&select=value').then(function(data) {
      var mode = (data && data[0] && data[0].value) || 'story';
      _updateModeUI(mode);
    });

    // Mode buttons
    panel.querySelectorAll('.bs-mode-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var mode = btn.dataset.mode;
        // Save via Edge Function admin-write (which has service-role access to secrets table)
        callEdge('admin-write', {
          table: 'secrets',
          data: { key: 'publish_mode', value: mode },
          onConflict: 'key'
        }).then(function(res) {
          _updateModeUI(mode);
        }).catch(function() {
          _updateModeUI(mode);
        });
      });
    });

    function _updateModeUI(mode) {
      panel.querySelectorAll('.bs-mode-btn').forEach(function(b) {
        var active = b.dataset.mode === mode;
        b.style.borderColor = active ? 'rgba(0,212,255,0.5)' : 'rgba(255,255,255,0.06)';
        b.style.background = active ? 'rgba(0,212,255,0.08)' : 'var(--bg3)';
        b.style.color = active ? 'var(--cyan)' : 'var(--text-muted)';
      });
      var label = panel.querySelector('#bsCurrentMode');
      if (label) {
        var pretty = mode === 'carousel' ? 'CAROUSEL (WIN: 2 slides + GPS route) · 23:30 IST' :
                     mode === 'story'    ? 'STORY ONLY · 23:30 IST' :
                     mode === 'feed'     ? 'FEED ONLY · 23:30 IST' :
                     mode === 'both'     ? 'STORY + FEED · 23:30 IST' : mode.toUpperCase();
        label.textContent = 'Current mode: ' + pretty;
      }
    }

    // Copy positioning + bio
    var copyPos = document.getElementById('bsCopyPositioning');
    if (copyPos) copyPos.addEventListener('click', function() {
      var txt = 'Data Architect. Endurance athlete.\nI run cities at 5 AM and build the systems that keep me going.';
      _copy(txt, copyPos);
    });
    var copyBio = document.getElementById('bsCopyBio');
    if (copyBio) copyBio.addEventListener('click', function() {
      var ta = document.getElementById('bsBioText');
      _copy(ta ? ta.value : '', copyBio);
    });

    // Pinned posts — drafts the 3 angles for the top of feed
    var pinned = [
      {
        title: '📌 PIN #1 — The System (engineering angle)',
        caption: 'I\'m a Data Architect.\n\nFor 4 months I tried streak apps. None worked.\n\nSo I built my own: a daily-verdict engine that checks Strava at 23:30 IST. If I trained → win post auto-publishes. If I missed → ₹1,500 goes to Akshaya Patra. No negotiation.\n\nDay 1 of running it autonomously.\n\nfirstlight.live\n.\n.\n#engineering #buildinpublic #ironmantraining #accountability #strava',
        visual: 'Screenshot of the dashboard at 23:30 + a 5 AM run map · carousel of 3 slides'
      },
      {
        title: '📌 PIN #2 — The City (travel/photo angle)',
        caption: '5 AM in Bangalore.\n\nThe city is yours for 90 minutes a day if you\'re willing to be awake.\n\nDay 1. 5.2 km. Same time tomorrow.\n\nfirstlight.live\n.\n.\n#bangaluru #runnersofindia #5am #morningmotivation #ironmantraining',
        visual: 'Photo from the actual run — empty road, sky turning orange · 1 image'
      },
      {
        title: '📌 PIN #3 — The Why (story angle)',
        caption: '110 days. Then I missed.\n\nNot because I didn\'t want to run. Because the daily-run rule broke my knees.\n\nNew chapter starts today. Move every day — walk, run, cycle, swim, gym. Miss = 1 child gets school meals for a year at Akshaya Patra. Designed sustainable, not heroic.\n\nThe story of why is on the website.\n\nfirstlight.live\n.\n.\n#endurance #ironmanindia #accountability #akshayapatra',
        visual: 'Bangalore morning landscape · 1 image with text overlay'
      }
    ];
    var pList = document.getElementById('bsPinnedList');
    if (pList) {
      pinned.forEach(function(p) {
        var card = document.createElement('div');
        card.style.cssText = 'background:var(--bg3);padding:14px;border-radius:8px;border-left:3px solid var(--cyan)';
        card.innerHTML =
          '<div style="font:700 12px var(--font-mono);color:var(--cyan);letter-spacing:1px;margin-bottom:8px">' + p.title + '</div>' +
          '<div style="font:500 12px var(--font-mono);color:var(--text);line-height:1.7;white-space:pre-wrap;margin-bottom:10px">' + p.caption + '</div>' +
          '<div style="font:500 11px var(--font-mono);color:var(--text-muted);font-style:italic">Visual: ' + p.visual + '</div>' +
          '<div style="margin-top:10px"><button class="btn btn-secondary copy-pin-btn" style="font-size:11px;padding:8px 14px">COPY CAPTION</button></div>';
        var btn = card.querySelector('.copy-pin-btn');
        btn.addEventListener('click', function() { _copy(p.caption, btn); });
        pList.appendChild(card);
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REEL LAB PANEL
  // ─────────────────────────────────────────────────────────────────────────
  function initReelLab() {
    var panel = document.getElementById('p-reel-lab');
    if (!panel || panel.dataset.inited) return;
    panel.dataset.inited = '1';

    var REEL_TEMPLATES = {
      'week-recap': {
        hook: 'I ran {DAYS}/7 mornings this week.',
        shotList: [
          '0-3s: Top-down map zoom. 7 polylines drawing one by one. Music kicks in.',
          '3-8s: Cut to face/back — sunrise, sweating. One line of text: \"5 AM.\"',
          '8-13s: Stats overlay: weekly km, total time, miss count.',
          '13-15s: Black card: \"Day {DAY}. firstlight.live\"'
        ],
        caption: 'Week {WEEK} recap.\n{KM} km. {DAYS}/7 mornings held. {MISSES} missed.\n\nThe streak isn\'t about perfection. It\'s about honesty.\n\nfirstlight.live',
        hashtags: '#ironmantraining #marathontraining #runnersofindia #weekrecap #strava',
        music: 'Build-up electronic / cinematic — "Wake" by Slick Pulla or any 110bpm track'
      },
      'system-tour': {
        hook: 'I\'m a Data Architect. I built myself an accountability OS.',
        shotList: [
          '0-2s: Hands on laptop, code editor open. Title overlay: "Day {DAY}".',
          '2-6s: Cursor scrolls through code → terminal → engine logs streaming.',
          '6-10s: Cut to firstlight.live dashboard rendering live. Stats animating.',
          '10-13s: Cut to phone — engine email arriving at 23:30.',
          '13-15s: "If I miss, ₹1,500 → Akshaya Patra." Black card. URL.'
        ],
        caption: 'I\'m a Data Architect.\n\nFor 4 months I tried streak apps. None worked.\nSo I built my own: a daily-verdict engine that checks Strava at 23:30 IST. WIN or MISS — system decides, system publishes.\n\nMiss = ₹1,500 to Akshaya Patra (1 child sponsored for 1 academic year).\n\nfirstlight.live\n\n#buildinpublic #engineering #ironmantraining #accountability',
        hashtags: '#buildinpublic #engineering #ironmantraining #accountability #strava',
        music: 'Tech / synthwave — "Pacific Coast Highway" or any 100bpm electronic'
      },
      'sunrise-run': {
        hook: '5 AM in Bangalore. Before the city wakes.',
        shotList: [
          '0-3s: Hyperlapse of streetlights still on. Empty road.',
          '3-7s: First runner pov — feet on tarmac. Sky lightening.',
          '7-11s: Sky color shift accelerated. Birds. One car. Park gates opening.',
          '11-15s: Watch hits 5 km. Sun fully up. Caption: "{DIST} km · firstlight.live"'
        ],
        caption: '5 AM in Bangalore. Before the city wakes.\n\nThe road is yours for 90 minutes a day if you\'re willing to be awake.\n\nfirstlight.live\n\n#bangaluru #runnersofindia #5am #sunriserun',
        hashtags: '#bangaluru #runnersofindia #5am #sunriserun #ironmantraining',
        music: 'Ambient electronic — "Memories" Bicep or any sunrise track'
      },
      'city-discovery': {
        hook: '5 AM in {CITY}.',
        shotList: [
          '0-3s: Iconic city landmark in low light. Title: "5 AM in {CITY}".',
          '3-8s: Strava route polyline drawing on map of city.',
          '8-12s: Quick cuts — landmarks passed during the run.',
          '12-15s: Final stat card: distance, time, location pin, firstlight.live'
        ],
        caption: '5 AM in {CITY}.\n\nNew city, same engine. {DIST} km logged. The streak doesn\'t care where you are.\n\nfirstlight.live\n\n#{CITYSLUG} #runnersofindia #travelrunner #ironmantraining',
        hashtags: '#travelrunner #runnersofindia #ironmantraining #5am #strava',
        music: 'City-tied — local music if possible, else cinematic electronic'
      },
      'why-charity': {
        hook: 'Why I donate ₹1,500 to Akshaya Patra every time I miss.',
        shotList: [
          '0-3s: Black card: "I missed today." Text typewriter effect.',
          '3-7s: Cut to UPI payment screen. ₹1,500 → Akshaya Patra. Confirmation.',
          '7-12s: Akshaya Patra info card: "₹1,500 = 1 child sponsored for 1 academic year. ~200 mid-day meals."',
          '12-15s: "My miss = their meal. Both win." Black card. URL.'
        ],
        caption: 'Why I donate ₹1,500 to Akshaya Patra every time I miss training.\n\n₹1,500 is their exact sponsorship price: 1 child fed for an entire school year (~200 mid-day meals).\n\nIf I train: streak continues.\nIf I don\'t: a kid in Bangalore eats lunch every day for a year.\n\nBoth outcomes move the world forward.\n\nfirstlight.live\n\n#akshayapatra #accountability #charity #ironmantraining',
        hashtags: '#akshayapatra #accountability #charity #ironmantraining #feedingindia',
        music: 'Warm, hopeful — piano + strings'
      }
    };

    var output = document.getElementById('reelOutput');
    var type = document.getElementById('reelType');
    var btn  = document.getElementById('reelGenerate');
    var copyBtn = document.getElementById('reelCopy');

    function render() {
      var key = type.value;
      var t = REEL_TEMPLATES[key];
      if (!t) return;
      // Hydrate placeholders with reasonable defaults
      var day = '1', dist = '5.2', km = '21', misses = '0', days = '6', week = '1', city = 'BANGALORE', citySlug = 'bangaluru';
      var script =
        '🎯 HOOK (line 1, says first 2 seconds):\n' + t.hook.replace('{DAYS}', days).replace('{CITY}', city) + '\n\n' +
        '🎬 SHOT LIST (15 seconds total):\n' +
        t.shotList.map(function(s) {
          return '  • ' + s.replace('{DAY}', day).replace('{DIST}', dist).replace('{CITY}', city);
        }).join('\n') + '\n\n' +
        '📝 CAPTION (post under the Reel):\n' +
        t.caption
          .replace(/\{DAY\}/g, day).replace(/\{DIST\}/g, dist).replace(/\{KM\}/g, km)
          .replace(/\{DAYS\}/g, days).replace(/\{MISSES\}/g, misses).replace(/\{WEEK\}/g, week)
          .replace(/\{CITY\}/g, city).replace(/\{CITYSLUG\}/g, citySlug) + '\n\n' +
        '#️⃣ HASHTAGS:\n' + t.hashtags + '\n\n' +
        '🎵 MUSIC:\n' + t.music + '\n\n' +
        '⏱  POST WINDOW: Tuesday or Friday, 8-10 AM IST (best reach window for fitness in India).';
      output.textContent = script;
      output.dataset.lastScript = script;
    }

    btn.addEventListener('click', render);
    copyBtn.addEventListener('click', function() {
      var txt = output.dataset.lastScript || output.textContent;
      _copy(txt, copyBtn);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TRAVEL SERIES PANEL
  // ─────────────────────────────────────────────────────────────────────────
  function initTravelSeries() {
    var panel = document.getElementById('p-travel-series');
    if (!panel || panel.dataset.inited) return;
    panel.dataset.inited = '1';

    var output = document.getElementById('travelOutput');
    var cityIn = document.getElementById('travelCity');
    var lmIn   = document.getElementById('travelLandmark');
    var btn    = document.getElementById('travelGenerate');
    var copyBtn = document.getElementById('travelCopy');

    btn.addEventListener('click', function() {
      var city = (cityIn.value || 'Bangalore').trim();
      var landmark = (lmIn.value || '').trim();
      var citySlug = city.toLowerCase().replace(/\s+/g, '');

      var post =
        '📰 FEED POST CAPTION:\n' +
        '5 AM in ' + city + '.\n\n' +
        (landmark ? landmark + '. Empty. Mine for 90 minutes.\n\n' : 'Empty. Mine for 90 minutes.\n\n') +
        'New city. Same engine. The streak doesn\'t care where I am.\n\nfirstlight.live\n\n' +
        '#' + citySlug + ' #runnersofindia #travelrunner #ironmantraining #5am\n\n' +
        '────────────────────\n\n' +
        '📱 STORY SEQUENCE (3 frames):\n\n' +
        'Frame 1 (5s): Photo of city skyline at dawn.\n' +
        '  Sticker: Poll — "Colder than Bangalore?"\n\n' +
        'Frame 2 (5s): Strava route map.\n' +
        '  Sticker: Add yours — "Where did YOU run today?"\n\n' +
        'Frame 3 (5s): "Day __ · firstlight.live" text card.\n' +
        '  Sticker: Link → firstlight.live\n\n' +
        '────────────────────\n\n' +
        '📍 GEO-TAG: ' + (landmark ? landmark + ', ' : '') + city + '\n' +
        '🎵 STORY MUSIC: Local artist if available · else ambient electronic\n' +
        '⏱  POST: Same day, before noon. Geo-tag drives 2-3x local discovery.';

      output.textContent = post;
      output.dataset.lastPost = post;
    });

    copyBtn.addEventListener('click', function() {
      var txt = output.dataset.lastPost || output.textContent;
      _copy(txt, copyBtn);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GROWTH TRACKER PANEL
  // ─────────────────────────────────────────────────────────────────────────
  function initGrowthTracker() {
    var panel = document.getElementById('p-growth-tracker');
    if (!panel || panel.dataset.inited) return;
    panel.dataset.inited = '1';

    var saveBtn = document.getElementById('gtSave');
    var historyEl = document.getElementById('gtHistory');

    function renderHistory() {
      var rows = JSON.parse(localStorage.getItem('fl_growth_log') || '[]');
      if (!rows.length) { historyEl.textContent = 'No data yet. Log this week to start tracking.'; return; }
      // Sort by date desc
      rows.sort(function(a, b) { return b.date.localeCompare(a.date); });
      var html = '<div style="display:grid;grid-template-columns:auto repeat(4,1fr) auto;gap:8px 14px;align-items:center">' +
        '<div style="font:700 10px var(--font-mono);color:var(--text-muted);letter-spacing:1px">WEEK</div>' +
        '<div style="font:700 10px var(--font-mono);color:var(--text-muted);letter-spacing:1px;text-align:center">FOLLOWERS</div>' +
        '<div style="font:700 10px var(--font-mono);color:var(--text-muted);letter-spacing:1px;text-align:center">POSTS</div>' +
        '<div style="font:700 10px var(--font-mono);color:var(--text-muted);letter-spacing:1px;text-align:center">LIKES/POST</div>' +
        '<div style="font:700 10px var(--font-mono);color:var(--text-muted);letter-spacing:1px;text-align:center">ENG. RATE</div>' +
        '<div></div>';
      rows.forEach(function(r, i) {
        var likesPerPost = r.posts > 0 ? Math.round(r.likes / r.posts) : 0;
        var engRate = r.followers > 0 ? ((r.likes + r.comments) / r.posts / r.followers * 100).toFixed(2) : '—';
        var prev = rows[i + 1];
        var delta = prev ? r.followers - prev.followers : 0;
        var deltaStr = delta > 0 ? '+' + delta : String(delta);
        var deltaColor = delta > 0 ? 'var(--green)' : delta < 0 ? 'var(--red)' : 'var(--text-muted)';
        html += '<div style="font:500 11px var(--font-mono);color:var(--text)">' + r.date + '</div>';
        html += '<div style="font:600 13px var(--font-mono);color:var(--cyan);text-align:center">' + r.followers + ' <span style="font-size:10px;color:' + deltaColor + '">' + deltaStr + '</span></div>';
        html += '<div style="font:500 12px var(--font-mono);color:var(--text);text-align:center">' + r.posts + '</div>';
        html += '<div style="font:500 12px var(--font-mono);color:var(--text);text-align:center">' + likesPerPost + '</div>';
        html += '<div style="font:600 12px var(--font-mono);color:var(--gold);text-align:center">' + engRate + '%</div>';
        html += '<div><button class="gt-del" data-i="' + i + '" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:14px">×</button></div>';
      });
      html += '</div>';
      historyEl.innerHTML = html;
      historyEl.querySelectorAll('.gt-del').forEach(function(b) {
        b.addEventListener('click', function() {
          var i = parseInt(b.dataset.i);
          rows.splice(i, 1);
          localStorage.setItem('fl_growth_log', JSON.stringify(rows));
          renderHistory();
        });
      });
    }

    saveBtn.addEventListener('click', function() {
      var followers = parseInt(document.getElementById('gtFollowers').value);
      var posts = parseInt(document.getElementById('gtPosts').value);
      var likes = parseInt(document.getElementById('gtLikes').value);
      var comments = parseInt(document.getElementById('gtComments').value);
      if (!followers) { alert('Enter at least follower count.'); return; }
      var entry = {
        date: new Date().toISOString().slice(0, 10),
        followers: followers,
        posts: posts || 0,
        likes: likes || 0,
        comments: comments || 0
      };
      var rows = JSON.parse(localStorage.getItem('fl_growth_log') || '[]');
      rows.push(entry);
      localStorage.setItem('fl_growth_log', JSON.stringify(rows));
      // Clear inputs
      ['gtFollowers', 'gtPosts', 'gtLikes', 'gtComments'].forEach(function(id) {
        var el = document.getElementById(id); if (el) el.value = '';
      });
      renderHistory();
      _flashBtn(saveBtn, 'SAVED ✓');
    });

    renderHistory();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED HELPERS
  // ─────────────────────────────────────────────────────────────────────────
  function _copy(text, btn) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(function() { _flashBtn(btn, 'COPIED ✓'); });
  }
  function _flashBtn(btn, msg) {
    if (!btn) return;
    var orig = btn.textContent;
    btn.textContent = msg;
    btn.style.opacity = '0.7';
    setTimeout(function() { btn.textContent = orig; btn.style.opacity = ''; }, 1500);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PANEL ACTIVATION HOOK
  // Listen for panel-show events from admin-core (switchPanel function)
  // ─────────────────────────────────────────────────────────────────────────
  document.addEventListener('click', function(e) {
    var item = e.target.closest('.cc-item');
    if (!item) return;
    var panel = item.dataset.panel;
    // Defer init to next tick so the panel is visible
    setTimeout(function() {
      if (panel === 'brand-strategy') initBrandStrategy();
      else if (panel === 'reel-lab') initReelLab();
      else if (panel === 'travel-series') initTravelSeries();
      else if (panel === 'growth-tracker') initGrowthTracker();
    }, 50);
  });

  // Init immediately if any of the panels are already visible (page load with hash)
  setTimeout(function() {
    if (document.getElementById('p-brand-strategy')) initBrandStrategy();
    if (document.getElementById('p-reel-lab')) initReelLab();
    if (document.getElementById('p-travel-series')) initTravelSeries();
    if (document.getElementById('p-growth-tracker')) initGrowthTracker();
  }, 200);
})();
