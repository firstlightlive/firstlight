/* ═══════════════════════════════════════════════════════
   FIRST LIGHT — 7D Futuristic Experience Engine
   Three.js particles + GSAP ScrollTrigger + Lenis + Canvas
   Zero frameworks. Pure vanilla JS.
   ═══════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── Wait for DOM + libs ──
  document.addEventListener('DOMContentLoaded', init);

  var SUPA, KEY;

  function init() {
    SUPA = (window.FL && FL.SUPABASE_URL) || 'https://edgnudrbysybefbqyijq.supabase.co';
    KEY = (window.FL && FL.SUPABASE_ANON_KEY) || '';

    var steps = [
      populateDayNumbers,
      initLenis,
      initParticleHero,
      initGSAPAnimations,
      initHoloCard,
      initECG,
      initSleepWave,
      initNavScroll,
      loadLiveData,
      loadMilestones,
      renderWakeHeatmap,
      renderTrainingHeatmap
    ];
    steps.forEach(function (fn) {
      try { fn(); } catch (e) { console.error('[home-3d] ' + fn.name + ' failed:', e); }
    });
  }

  // ══════════════════════════════════
  //  DAY NUMBERS
  // ══════════════════════════════════
  function getCumulativeUnclaimedHome(day) {
    // Mirror STAKE_SCHEDULE from app.js
    if (typeof getCumulativeUnclaimed === 'function') return getCumulativeUnclaimed(day);
    var schedule = [
      { fromDay: 1, amount: 15000 },
      { fromDay: 101, amount: 20000 },
      { fromDay: 111, amount: 5000 }
    ];
    var total = 0;
    for (var i = 0; i < schedule.length; i++) {
      var start = schedule[i].fromDay;
      var end = (i < schedule.length - 1) ? schedule[i + 1].fromDay - 1 : day;
      end = Math.min(end, day);
      if (start > day) break;
      var days = end - start + 1;
      if (days > 0) total += days * schedule[i].amount;
    }
    return total;
  }

  function getDayNum() {
    if (typeof getDayNumber === 'function') return getDayNumber();
    var start = new Date('2026-02-10T00:00:00+05:30');
    var now = new Date();
    var utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    var ist = new Date(utc + (5.5 * 3600000));
    var today = new Date(ist.getFullYear(), ist.getMonth(), ist.getDate());
    return Math.max(1, Math.floor((today - start) / 86400000) + 1);
  }

  function populateDayNumbers() {
    var day = getDayNum();
    var el = document.getElementById('heroDayNum');
    if (el) animateCounter(el, day);
    var navDay = document.getElementById('navDay');
    if (navDay) navDay.textContent = day;
    var footDay = document.getElementById('footDay');
    if (footDay) footDay.textContent = day;
    var streakDays = document.getElementById('streakDays');
    if (streakDays) animateCounter(streakDays, day);
    // Total at risk (₹5,000 per day)
    var totalRisk = document.getElementById('totalRisk');
    if (totalRisk) {
      var amt = getCumulativeUnclaimedHome(day);
      if (typeof formatINR === 'function') {
        totalRisk.textContent = '₹' + formatINR(amt);
      } else {
        totalRisk.textContent = '₹' + amt.toLocaleString('en-IN');
      }
    }
  }

  function animateCounter(el, target) {
    var start = 0;
    var duration = 1800;
    var startTime = null;
    function step(ts) {
      if (!startTime) startTime = ts;
      var progress = Math.min((ts - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(start + (target - start) * eased);
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ══════════════════════════════════
  //  LENIS SMOOTH SCROLL
  // ══════════════════════════════════
  function initLenis() {
    if (typeof Lenis === 'undefined') return;
    var lenis = new Lenis({
      duration: 1.2,
      easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
      touchMultiplier: 2,
    });
    // Sync with GSAP ticker if available
    if (typeof gsap !== 'undefined') {
      gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
      gsap.ticker.lagSmoothing(0);
      // Sync with ScrollTrigger
      lenis.on('scroll', function () {
        if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.update();
      });
    } else {
      function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
      requestAnimationFrame(raf);
    }
  }

  // ══════════════════════════════════
  //  THREE.JS PARTICLE HERO
  // ══════════════════════════════════
  function initParticleHero() {
    var canvas = document.getElementById('heroCanvas');
    if (!canvas) { console.warn('[FL] No heroCanvas found'); return; }

    // Fallback: animated CSS gradient if WebGL unavailable
    if (typeof THREE === 'undefined') {
      console.warn('[FL] Three.js not loaded — using CSS fallback');
      canvas.style.display = 'none';
      document.querySelector('.hero-section').style.background =
        'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(0,212,255,0.1) 0%, #060810 70%)';
      return;
    }

    try {
      var w = window.innerWidth;
      var h = window.innerHeight;

      // Explicitly set canvas dimensions
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      canvas.style.display = 'block';

      var scene = new THREE.Scene();
      var camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000);
      camera.position.z = 3.5;

      var renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: false });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0); // transparent background

      // Particle count
      var isMobile = w < 768;
      var count = isMobile ? 4000 : 10000;

      var geometry = new THREE.BufferGeometry();
      var positions = new Float32Array(count * 3);
      var colors = new Float32Array(count * 3);
      var speeds = new Float32Array(count);

      var cyan = new THREE.Color(0x00D4FF);
      var gold = new THREE.Color(0xF5A623);
      var white = new THREE.Color(0xFFFFFF);
      var green = new THREE.Color(0x00E676);

      for (var i = 0; i < count; i++) {
        // Sphere + spiral distribution
        var phi = Math.acos(2 * Math.random() - 1);
        var theta = Math.random() * Math.PI * 2;
        var r = 1.5 + Math.random() * 1.2;

        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);

        // Color distribution
        var rnd = Math.random();
        var col = rnd < 0.5 ? cyan : rnd < 0.75 ? gold : rnd < 0.9 ? green : white;
        colors[i * 3] = col.r;
        colors[i * 3 + 1] = col.g;
        colors[i * 3 + 2] = col.b;

        speeds[i] = 0.3 + Math.random() * 0.7;
      }

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      var material = new THREE.PointsMaterial({
        size: isMobile ? 2.5 : 2.0,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        sizeAttenuation: false, // fixed screen-space size — always visible
        depthWrite: false,
      });

      var points = new THREE.Points(geometry, material);
      scene.add(points);

      console.log('[FL] Particles created:', count, 'size:', material.size);

      // Mouse interaction
      var mouse = { x: 0, y: 0 };
      var targetMouse = { x: 0, y: 0 };
      document.addEventListener('mousemove', function (e) {
        targetMouse.x = (e.clientX / w - 0.5) * 2;
        targetMouse.y = (e.clientY / h - 0.5) * 2;
      });

      // Gyroscope for mobile
      if (window.DeviceOrientationEvent && isMobile) {
        window.addEventListener('deviceorientation', function (e) {
          if (e.gamma !== null) targetMouse.x = (e.gamma / 45);
          if (e.beta !== null) targetMouse.y = ((e.beta - 45) / 45);
        });
      }

      // Animation loop
      var clock = new THREE.Clock();
      function animate() {
        requestAnimationFrame(animate);

        var elapsed = clock.getElapsedTime();

        // Smooth mouse follow
        mouse.x += (targetMouse.x - mouse.x) * 0.05;
        mouse.y += (targetMouse.y - mouse.y) * 0.05;

        // Rotate particles
        points.rotation.y = elapsed * 0.06 + mouse.x * 0.3;
        points.rotation.x = Math.sin(elapsed * 0.03) * 0.1 + mouse.y * 0.15;

        // Breathing effect
        var breathe = 1 + Math.sin(elapsed * 0.4) * 0.04;
        points.scale.set(breathe, breathe, breathe);

        // Subtle shimmer
        var pos = geometry.attributes.position.array;
        for (var i = 0; i < Math.min(count, 2000); i++) {
          pos[i * 3 + 1] += Math.sin(elapsed * speeds[i] + i) * 0.0004;
        }
        geometry.attributes.position.needsUpdate = true;

        renderer.render(scene, camera);
      }

      animate();

      // Resize
      window.addEventListener('resize', function () {
        w = window.innerWidth;
        h = window.innerHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
      });

      // Scroll fade
      window.addEventListener('scroll', function () {
        var scrollY = window.scrollY || window.pageYOffset;
        var heroH = document.querySelector('.hero-section').offsetHeight;
        canvas.style.opacity = Math.max(0, 1 - scrollY / (heroH * 0.6));
      });

      console.log('[FL] Particle hero initialized successfully');

    } catch (err) {
      console.error('[FL] Particle hero failed:', err);
      canvas.style.display = 'none';
      document.querySelector('.hero-section').style.background =
        'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(0,212,255,0.1) 0%, #060810 70%)';
    }
  }

  // ══════════════════════════════════
  //  GSAP SCROLL ANIMATIONS
  // ══════════════════════════════════
  function initGSAPAnimations() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
    gsap.registerPlugin(ScrollTrigger);

    // Reveal-up elements
    gsap.utils.toArray('.reveal-up').forEach(function (el) {
      gsap.to(el, {
        opacity: 1, y: 0, duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none none' }
      });
    });

    // Reveal-left elements (race nodes)
    gsap.utils.toArray('.reveal-left').forEach(function (el, i) {
      gsap.to(el, {
        opacity: 1, x: 0, duration: 0.7,
        delay: i * 0.1,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 85%', toggleActions: 'play none none none' }
      });
    });

    // Reveal-scale (holo card, wake clock)
    gsap.utils.toArray('.reveal-scale').forEach(function (el) {
      gsap.to(el, {
        opacity: 1, scale: 1, duration: 0.8,
        ease: 'back.out(1.7)',
        scrollTrigger: { trigger: el, start: 'top 80%', toggleActions: 'play none none none' }
      });
    });

    // Bento cards — stagger
    gsap.utils.toArray('.bento-card').forEach(function (card, i) {
      gsap.from(card, {
        opacity: 0, y: 30, duration: 0.6,
        delay: i * 0.08,
        ease: 'power2.out',
        scrollTrigger: { trigger: card, start: 'top 90%', toggleActions: 'play none none none' }
      });
    });

    // Stat cards — stagger count-up
    gsap.utils.toArray('.stat-card').forEach(function (card, i) {
      gsap.from(card, {
        opacity: 0, y: 20, duration: 0.5,
        delay: i * 0.1,
        ease: 'power2.out',
        scrollTrigger: { trigger: card, start: 'top 90%', toggleActions: 'play none none none' }
      });
    });

    // Week bars animate height
    ScrollTrigger.create({
      trigger: '#weekBars',
      start: 'top 85%',
      onEnter: animateWeekBars,
      once: true
    });
  }

  // ══════════════════════════════════
  //  HOLOGRAPHIC CARD TILT
  // ══════════════════════════════════
  function initHoloCard() {
    var card = document.getElementById('holoCard');
    if (!card) return;

    card.addEventListener('mousemove', function (e) {
      var rect = card.getBoundingClientRect();
      var x = (e.clientX - rect.left) / rect.width - 0.5;
      var y = (e.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = 'perspective(800px) rotateY(' + (x * 12) + 'deg) rotateX(' + (-y * 12) + 'deg)';
    });

    card.addEventListener('mouseleave', function () {
      card.style.transform = 'perspective(800px) rotateY(0deg) rotateX(0deg)';
    });

    // Mobile gyroscope tilt
    if (window.DeviceOrientationEvent && window.innerWidth < 768) {
      window.addEventListener('deviceorientation', function (e) {
        if (e.gamma === null) return;
        var x = Math.max(-1, Math.min(1, e.gamma / 30));
        var y = Math.max(-1, Math.min(1, (e.beta - 60) / 30));
        card.style.transform = 'perspective(800px) rotateY(' + (x * 8) + 'deg) rotateX(' + (-y * 8) + 'deg)';
      });
    }
  }

  // ══════════════════════════════════
  //  ECG HEARTBEAT ANIMATION (Canvas)
  // ══════════════════════════════════
  function initECG() {
    var canvas = document.getElementById('ecgCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var w, h;

    function resize() {
      var rect = canvas.parentElement.getBoundingClientRect();
      w = canvas.width = rect.width;
      h = canvas.height = 40;
    }
    resize();
    window.addEventListener('resize', resize);

    var offset = 0;
    function draw() {
      requestAnimationFrame(draw);
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,82,82,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      for (var x = 0; x < w; x++) {
        var t = (x + offset) * 0.04;
        var cycle = t % (Math.PI * 2);
        var y;

        // ECG-like waveform
        if (cycle < 0.8) {
          y = h / 2;
        } else if (cycle < 1.0) {
          y = h / 2 - Math.sin((cycle - 0.8) * Math.PI / 0.2) * (h * 0.15);
        } else if (cycle < 1.3) {
          y = h / 2;
        } else if (cycle < 1.5) {
          y = h / 2 - Math.sin((cycle - 1.3) * Math.PI / 0.2) * (h * 0.6);
        } else if (cycle < 1.7) {
          y = h / 2 + Math.sin((cycle - 1.5) * Math.PI / 0.2) * (h * 0.2);
        } else if (cycle < 2.2) {
          y = h / 2;
        } else if (cycle < 2.6) {
          y = h / 2 - Math.sin((cycle - 2.2) * Math.PI / 0.4) * (h * 0.12);
        } else {
          y = h / 2;
        }

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Glow line
      ctx.shadowColor = 'rgba(255,82,82,0.4)';
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.shadowBlur = 0;

      offset += 1.2;
    }
    draw();
  }

  // ══════════════════════════════════
  //  SLEEP WAVE ANIMATION (Canvas)
  // ══════════════════════════════════
  function initSleepWave() {
    var canvas = document.getElementById('sleepWave');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var w, h;

    function resize() {
      var rect = canvas.parentElement.getBoundingClientRect();
      w = canvas.width = rect.width;
      h = canvas.height = 30;
    }
    resize();
    window.addEventListener('resize', resize);

    var time = 0;
    function draw() {
      requestAnimationFrame(draw);
      ctx.clearRect(0, 0, w, h);

      // Draw 2 overlapping waves
      for (var wave = 0; wave < 2; wave++) {
        ctx.beginPath();
        ctx.strokeStyle = wave === 0 ? 'rgba(0,212,255,0.4)' : 'rgba(0,212,255,0.15)';
        ctx.lineWidth = wave === 0 ? 1.5 : 1;

        for (var x = 0; x < w; x++) {
          var freq = wave === 0 ? 0.015 : 0.02;
          var amp = wave === 0 ? h * 0.3 : h * 0.2;
          var phase = wave === 0 ? time * 0.02 : time * 0.015 + 1;
          var y = h / 2 + Math.sin(x * freq + phase) * amp * Math.sin(x * 0.003 + phase * 0.5);

          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      time++;
    }
    draw();
  }

  // ══════════════════════════════════
  //  NAV HIDE ON SCROLL DOWN
  // ══════════════════════════════════
  function initNavScroll() {
    var nav = document.querySelector('.fl-nav');
    if (!nav) return;
    var lastScroll = 0;

    window.addEventListener('scroll', function () {
      var current = window.scrollY || window.pageYOffset;
      if (current > 100 && current > lastScroll) {
        nav.classList.add('hidden');
      } else {
        nav.classList.remove('hidden');
      }
      lastScroll = current;
    });

    // Mobile nav toggle
    var toggle = document.querySelector('.fl-nav-toggle');
    var links = document.querySelector('.fl-nav-links');
    if (toggle && links) {
      toggle.addEventListener('click', function () {
        var isOpen = links.style.display === 'flex';
        links.style.display = isOpen ? 'none' : 'flex';
        links.style.position = isOpen ? '' : 'fixed';
        links.style.top = isOpen ? '' : '60px';
        links.style.left = isOpen ? '' : '0';
        links.style.right = isOpen ? '' : '0';
        links.style.bottom = isOpen ? '' : '0';
        links.style.background = isOpen ? '' : 'rgba(6,8,16,0.98)';
        links.style.flexDirection = isOpen ? '' : 'column';
        links.style.alignItems = isOpen ? '' : 'center';
        links.style.justifyContent = isOpen ? '' : 'center';
        links.style.gap = isOpen ? '' : '24px';
        links.style.zIndex = isOpen ? '' : '999';
        links.style.backdropFilter = isOpen ? '' : 'blur(20px)';
      });
    }
  }

  // ══════════════════════════════════
  //  LIVE DATA FROM SUPABASE
  // ══════════════════════════════════
  function fetchSB(table, query) {
    var url = SUPA + '/rest/v1/' + table + (query || '');
    return fetch(url, {
      headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY }
    }).then(function (r) {
      if (!r.ok) { console.warn('[fetchSB] ' + table + ' HTTP ' + r.status); return []; }
      return r.json();
    }).then(function (data) {
      return Array.isArray(data) ? data : [];
    }).catch(function (e) { console.error('[fetchSB] ' + table + ' error:', e); return []; });
  }

  function loadLiveData() {
    var ist = (typeof getNowIST === 'function') ? getNowIST() : new Date();
    var todayStr = ist.getFullYear() + '-' + String(ist.getMonth() + 1).padStart(2, '0') + '-' + String(ist.getDate()).padStart(2, '0');

    // Get Monday of this week
    var dayOfWeek = ist.getDay(); // 0=Sun
    var mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    var monday = new Date(ist);
    monday.setDate(ist.getDate() - mondayOffset);
    var mondayStr = monday.getFullYear() + '-' + String(monday.getMonth() + 1).padStart(2, '0') + '-' + String(monday.getDate()).padStart(2, '0');

    // Today's proof
    fetchSB('proof_archive', '?date=eq.' + todayStr + '&select=*').then(function (data) {
      if (!data || !data.length) return;
      var d = data[0];
      setVal('sleepHrs', d.sleep_hrs ? parseFloat(d.sleep_hrs).toFixed(1) : '--', ' HRS');
      setVal('runKm', d.run_km ? parseFloat(d.run_km).toFixed(1) : '--', ' KM');
      if (d.run_pace) setHTML('runPace', d.run_pace + '/km &middot; Strava GPS');
      if (d.avg_hr) setVal('restHR', Math.round(d.avg_hr), ' BPM');
      if (d.cycle_km) setVal('bikeKm', parseFloat(d.cycle_km).toFixed(1), ' KM');
      if (d.swim_km) setVal('swimKm', parseFloat(d.swim_km).toFixed(1), ' KM');
    });

    // This week's Strava activities
    fetchSB('strava_activities', '?start_date_local=gte.' + mondayStr + 'T00:00:00&select=type,distance,moving_time,start_date_local&order=start_date_local.asc').then(function (acts) {
      if (!acts || !acts.length) return;

      var totalSec = 0, runKm = 0, bikeKm = 0, swimKm = 0, walkKm = 0;
      var dayBars = [0, 0, 0, 0, 0, 0, 0]; // Mon-Sun

      acts.forEach(function (a) {
        var dist = (a.distance || 0) / 1000;
        var dur = a.moving_time || 0;
        totalSec += dur;

        var d = new Date(a.start_date_local);
        var di = d.getDay(); // 0=Sun
        var barIdx = di === 0 ? 6 : di - 1;
        dayBars[barIdx] += dur / 60; // minutes

        var t = (a.type || '');
        if (t === 'Run' || t === 'VirtualRun') runKm += dist;
        else if (t === 'Ride') bikeKm += dist;
        else if (t === 'Swim') swimKm += dist;
        else if (t === 'Walk' || t === 'Hike') walkKm += dist;
      });

      setVal('weekHours', (totalSec / 3600).toFixed(1), ' HRS');
      setHTML('weekSummary', acts.length + ' activities &middot; ' + runKm.toFixed(0) + ' km run &middot; ' + bikeKm.toFixed(0) + ' km bike');

      if (bikeKm > 0) setVal('bikeKm', bikeKm.toFixed(1), ' KM');
      if (swimKm > 0) setVal('swimKm', swimKm.toFixed(1), ' KM');

      // Store bars for animation
      window._weekBarData = dayBars;

      // Weekly 150km gauge
      var weekTotal = runKm + bikeKm + walkKm + (swimKm * 10);
      var weekPct = Math.min(100, Math.round(weekTotal / 150 * 100));
      var deficit = Math.max(0, 150 - weekTotal);
      var circ = 2 * Math.PI * 52;
      var el;
      el = document.getElementById('weekGaugeArc'); if (el) el.setAttribute('stroke-dasharray', Math.round(weekPct / 100 * circ) + ' ' + circ);
      el = document.getElementById('weekGaugePct'); if (el) el.textContent = weekPct + '%';
      el = document.getElementById('weekGaugeKm'); if (el) el.innerHTML = Math.round(weekTotal) + ' <span style="font-size:0.6em;color:var(--text-dim)">/ 150 KM</span>';
      el = document.getElementById('weekGaugeRun'); if (el) el.textContent = Math.round(runKm);
      el = document.getElementById('weekGaugeRide'); if (el) el.textContent = Math.round(bikeKm);
      el = document.getElementById('weekGaugeWalk'); if (el) el.textContent = Math.round(walkKm);
      el = document.getElementById('weekGaugeSwim'); if (el) el.textContent = (swimKm * 10).toFixed(0);
      el = document.getElementById('weekGaugeDeficit');
      if (el) {
        if (deficit <= 0) { el.textContent = 'TARGET HIT'; el.style.color = '#00E676'; }
        else if (deficit > 50) { el.textContent = 'DEFICIT: ' + Math.round(deficit) + ' km — PENALTY ZONE'; el.style.color = '#FF5252'; }
        else { el.textContent = 'DEFICIT: ' + Math.round(deficit) + ' km — carries forward'; el.style.color = '#F5A623'; }
      }
    });

    // Today's Strava — render ALL activities dynamically (include sport_type for Dance/Boxing/etc)
    console.log('[home] Fetching today activities for: ' + todayStr);
    fetchSB('strava_activities', '?start_date_local=gte.' + todayStr + 'T00:00:00&start_date_local=lt.' + todayStr + 'T23:59:59&select=name,type,sport_type,distance,moving_time,average_heartrate,calories,start_date_local&order=start_date_local.asc').then(function (acts) {
      console.log('[home] Today activities result:', acts.length, 'items', acts);
      renderTodayActivities(acts || []);
      if (acts && acts.length) {
        acts.forEach(function (a) {
          if (a.average_heartrate) setVal('restHR', Math.round(a.average_heartrate), ' BPM');
        });
      }

    });

    // Lifetime stats — include sport_type for Dance/Boxing/Pilates/Yoga breakdown
    fetchSB('strava_activities', '?select=type,sport_type,distance').then(function (acts) {
      if (!acts || !acts.length) return;
      var run = 0, bike = 0, swim = 0, walk = 0, gym = 0, yoga = 0, dance = 0;
      acts.forEach(function (a) {
        var t = (a.type || '');
        var st = (a.sport_type || t);
        var km = (a.distance || 0) / 1000;
        if (t === 'Run' || t === 'VirtualRun') run += km;
        else if (t === 'Ride') bike += km;
        else if (t === 'Swim') swim += km;
        else if (t === 'Walk' || t === 'Hike') walk += km;
        else if (st === 'Yoga' || st === 'Pilates') yoga++;
        else if (st === 'Dance') dance++;
        else if (t === 'WeightTraining' || t === 'Workout') gym++;
        else if (t === 'Yoga') yoga++;
        else if (t === 'StairStepper') gym++;
      });
      setHTML('ltRun', Math.round(run).toLocaleString());
      setHTML('ltBike', Math.round(bike).toLocaleString());
      setHTML('ltSwim', swim.toFixed(1));
      setHTML('ltWalk', Math.round(walk).toLocaleString());
      setHTML('ltGym', gym.toString());
      setHTML('ltYoga', yoga.toString());
      setHTML('ltDance', dance.toString());
      var day = getDayNum();
      var stake = getCumulativeUnclaimedHome(day);
      if (typeof formatINR === 'function') {
        setHTML('ltStake', '₹' + formatINR(stake));
      } else {
        setHTML('ltStake', '₹' + stake.toLocaleString('en-IN'));
      }
    });

    // Wake-up time — today first, fallback to most recent
    fetchSB('health_daily', '?select=date,wake_time&wake_time=not.is.null&order=date.desc&limit=30').then(function (data) {
      if (!data || !data.length) return;

      // Find today's or most recent wake time
      var todayEntry = data.find(function (d) { return d.date === todayStr; });
      var latest = todayEntry || data[0];
      if (latest && latest.wake_time) {
        displayWakeTime(latest.wake_time);
        if (!todayEntry) {
          // Show it's from a previous day
          var heroLabel = document.querySelector('.hero-wake-label');
          if (heroLabel) heroLabel.textContent = 'LAST WAKE · ' + latest.date;
        }
      }

      renderWakeHeatmapData(data);
      computeWakeStats(data);
    });
  }

  // ── Display wake time in flip clock ──
  function displayWakeTime(timeStr) {
    // timeStr might be "04:12" or "04:12:00" or ISO
    var parts = timeStr.split(':');
    var h = parseInt(parts[0]) || 0;
    var m = parseInt(parts[1]) || 0;
    var period = h < 12 ? 'AM' : 'PM';
    var h12 = h % 12 || 12;
    var hStr = String(h12).padStart(2, '0');
    var mStr = String(m).padStart(2, '0');

    setHTML('wakeH1', hStr[0]);
    setHTML('wakeH2', hStr[1]);
    setHTML('wakeM1', mStr[0]);
    setHTML('wakeM2', mStr[1]);
    setHTML('wakePeriod', period);

    // Hero display
    var heroWake = document.getElementById('heroWakeTime');
    if (heroWake) heroWake.textContent = hStr + ':' + mStr + ' ' + period;

    var heroCheck = document.getElementById('heroWakeCheck');
    if (heroCheck) {
      if (h < 6) {
        heroCheck.textContent = 'BEFORE 6 AM ✓';
        heroCheck.style.color = 'var(--green)';
      } else {
        heroCheck.textContent = 'AFTER 6 AM ✗';
        heroCheck.style.color = 'var(--red)';
      }
    }
  }

  // ── Wake heatmap (30 cells) ──
  function renderWakeHeatmap() {
    var container = document.getElementById('wakeHeatmap');
    if (!container) return;
    // Render 30 empty cells initially
    for (var i = 0; i < 30; i++) {
      var cell = document.createElement('div');
      cell.className = 'wake-heatmap-cell whc-empty';
      cell.title = 'Loading...';
      container.appendChild(cell);
    }
  }

  function renderWakeHeatmapData(data) {
    var container = document.getElementById('wakeHeatmap');
    if (!container) return;
    container.innerHTML = '';

    // data is sorted desc — reverse for chronological
    var sorted = data.slice().reverse();
    // Pad to 30
    while (sorted.length < 30) sorted.unshift(null);
    // Take last 30
    sorted = sorted.slice(-30);

    sorted.forEach(function (d) {
      var cell = document.createElement('div');
      cell.className = 'wake-heatmap-cell';
      if (!d || !d.wake_time) {
        cell.classList.add('whc-empty');
        cell.title = 'No data';
      } else {
        var h = parseInt(d.wake_time.split(':')[0]) || 0;
        if (h < 5) { cell.classList.add('whc-green'); cell.title = d.date + ': ' + d.wake_time; }
        else if (h < 6) { cell.classList.add('whc-gold'); cell.title = d.date + ': ' + d.wake_time; }
        else { cell.classList.add('whc-red'); cell.title = d.date + ': ' + d.wake_time; }
      }
      container.appendChild(cell);
    });
  }

  function computeWakeStats(data) {
    var times = [];
    data.forEach(function (d) {
      if (!d.wake_time) return;
      var parts = d.wake_time.split(':');
      var mins = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      times.push(mins);
    });
    if (!times.length) return;

    var avg = Math.round(times.reduce(function (a, b) { return a + b; }, 0) / times.length);
    var best = Math.min.apply(null, times);
    var worst = Math.max.apply(null, times);

    setHTML('wakeAvg', fmtTime(avg));
    setHTML('wakeBest', fmtTime(best));
    setHTML('wakeWorst', fmtTime(worst));
  }

  function fmtTime(mins) {
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    var period = h < 12 ? ' AM' : ' PM';
    var h12 = h % 12 || 12;
    return String(h12).padStart(2, '0') + ':' + String(m).padStart(2, '0') + period;
  }

  // ── Training Heatmap (Canvas) ──
  function renderTrainingHeatmap() {
    var canvas = document.getElementById('trainingHeatmap');
    if (!canvas) return;

    fetchSB('strava_activities', '?select=type,start_date_local,moving_time&order=start_date_local.asc').then(function (acts) {
      if (!acts || !acts.length) return;

      var ctx = canvas.getContext('2d');
      var wrapper = canvas.parentElement;
      var cellSize = 14;
      var gap = 3;

      // Build day map: date -> { type, duration }
      var dayMap = {};
      acts.forEach(function (a) {
        var dateStr = (a.start_date_local || '').substring(0, 10);
        if (!dateStr) return;
        var existing = dayMap[dateStr];
        var dur = a.moving_time || 0;
        if (!existing || dur > existing.duration) {
          dayMap[dateStr] = { type: (a.type || '').toLowerCase(), duration: dur };
        }
      });

      // Get date range (last 52 weeks)
      var ist = (typeof getNowIST === 'function') ? getNowIST() : new Date();
      var today = new Date(ist.getFullYear(), ist.getMonth(), ist.getDate());
      var startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 364);
      // Align to Sunday
      startDate.setDate(startDate.getDate() - startDate.getDay());

      var weeks = 53;
      canvas.width = weeks * (cellSize + gap) + 40;
      canvas.height = 7 * (cellSize + gap) + 20;

      var typeColors = {
        run: '#FC4C02',
        ride: '#00E676',
        swim: '#00B0FF',
        weighttraining: '#AB47BC',
        workout: '#AB47BC',
        walk: '#F5A623',
        hike: '#F5A623',
      };

      for (var week = 0; week < weeks; week++) {
        for (var day = 0; day < 7; day++) {
          var d = new Date(startDate);
          d.setDate(d.getDate() + week * 7 + day);
          var dStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

          var x = week * (cellSize + gap) + 24;
          var y = day * (cellSize + gap);

          var entry = dayMap[dStr];
          if (entry) {
            ctx.fillStyle = typeColors[entry.type] || 'rgba(255,255,255,0.15)';
            // Intensity based on duration (darker = longer)
            ctx.globalAlpha = Math.min(1, 0.3 + (entry.duration / 7200) * 0.7);
          } else {
            ctx.fillStyle = 'rgba(255,255,255,0.03)';
            ctx.globalAlpha = 1;
          }

          roundRect(ctx, x, y, cellSize, cellSize, 2);
          ctx.globalAlpha = 1;
        }
      }

      // Day labels
      var labels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '9px "IBM Plex Mono", monospace';
      for (var i = 0; i < 7; i++) {
        ctx.fillText(labels[i], 4, i * (cellSize + gap) + 11);
      }
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.fill();
  }

  // ══════════════════════════════════
  //  MILESTONES — Auto-computed from real Strava data
  // ══════════════════════════════════
  function loadMilestones() {
    fetchSB('strava_activities', '?select=type,distance,moving_time,start_date_local,name&order=start_date_local.asc').then(function (acts) {
      if (!acts || !acts.length) return;

      var milestones = [];
      var runTotal = 0, bikeTotal = 0, swimTotal = 0;
      var longestRun = 0, longestRide = 0, longestSwim = 0;
      var longestRunDate = '', longestRideDate = '', longestSwimDate = '';
      var firstRun = null, firstRide = null, firstSwim = null;
      var run100hit = false, bike100hit = false, run500hit = false, bike500hit = false;
      var monthlyRun = {}, monthlyBike = {};

      acts.forEach(function (a) {
        var t = (a.type || '').toLowerCase();
        var km = (a.distance || 0) / 1000;
        var dateStr = (a.start_date_local || '').substring(0, 10);
        var monthKey = dateStr.substring(0, 7);

        if (t === 'run' || t === 'virtualrun') {
          if (!firstRun) { firstRun = dateStr; milestones.push({ date: dateStr, title: 'First Run', desc: km.toFixed(1) + ' km', type: 'run' }); }
          runTotal += km;
          if (!monthlyRun[monthKey]) monthlyRun[monthKey] = 0;
          monthlyRun[monthKey] += km;
          if (km > longestRun) { longestRun = km; longestRunDate = dateStr; }
          if (km >= 10 && !milestones.find(function(m){ return m.title === 'First 10K Run'; })) {
            milestones.push({ date: dateStr, title: 'First 10K Run', desc: km.toFixed(1) + ' km', type: 'run' });
          }
          if (km >= 21 && !milestones.find(function(m){ return m.title === 'First Half Marathon Distance'; })) {
            milestones.push({ date: dateStr, title: 'First Half Marathon Distance', desc: km.toFixed(1) + ' km', type: 'run' });
          }
          if (km >= 42 && !milestones.find(function(m){ return m.title === 'First Marathon Distance'; })) {
            milestones.push({ date: dateStr, title: 'First Marathon Distance', desc: km.toFixed(1) + ' km', type: 'run' });
          }
          if (runTotal >= 100 && !run100hit) { run100hit = true; milestones.push({ date: dateStr, title: '100 km Total Running', desc: runTotal.toFixed(0) + ' km cumulative', type: 'run' }); }
          if (runTotal >= 500 && !run500hit) { run500hit = true; milestones.push({ date: dateStr, title: '500 km Total Running', desc: runTotal.toFixed(0) + ' km cumulative', type: 'run' }); }
        }

        if (t === 'ride') {
          if (!firstRide) { firstRide = dateStr; milestones.push({ date: dateStr, title: 'First Bike Ride', desc: km.toFixed(1) + ' km', type: 'bike' }); }
          bikeTotal += km;
          if (!monthlyBike[monthKey]) monthlyBike[monthKey] = 0;
          monthlyBike[monthKey] += km;
          if (km > longestRide) { longestRide = km; longestRideDate = dateStr; }
          if (km >= 50 && !milestones.find(function(m){ return m.title === 'First 50K Ride'; })) {
            milestones.push({ date: dateStr, title: 'First 50K Ride', desc: km.toFixed(1) + ' km', type: 'bike' });
          }
          if (km >= 100 && !milestones.find(function(m){ return m.title === 'First Century Ride'; })) {
            milestones.push({ date: dateStr, title: 'First Century Ride', desc: km.toFixed(1) + ' km', type: 'bike' });
          }
          if (bikeTotal >= 100 && !bike100hit) { bike100hit = true; milestones.push({ date: dateStr, title: '100 km Total Cycling', desc: bikeTotal.toFixed(0) + ' km cumulative', type: 'bike' }); }
          if (bikeTotal >= 500 && !bike500hit) { bike500hit = true; milestones.push({ date: dateStr, title: '500 km Total Cycling', desc: bikeTotal.toFixed(0) + ' km cumulative', type: 'bike' }); }
        }

        if (t === 'swim') {
          if (!firstSwim) { firstSwim = dateStr; milestones.push({ date: dateStr, title: 'First Swim', desc: (km * 1000).toFixed(0) + ' m', type: 'swim' }); }
          swimTotal += km;
          if (km > longestSwim) { longestSwim = km; longestSwimDate = dateStr; }
          if (km >= 1 && !milestones.find(function(m){ return m.title === 'First 1K Swim'; })) {
            milestones.push({ date: dateStr, title: 'First 1K Swim', desc: (km * 1000).toFixed(0) + ' m', type: 'swim' });
          }
        }

        if (t === 'walk' || t === 'hike') {
          if (!milestones.find(function(m){ return m.title === 'First Walk'; })) {
            milestones.push({ date: dateStr, title: 'First Walk', desc: km.toFixed(1) + ' km', type: 'walk' });
          }
          if (km >= 10 && !milestones.find(function(m){ return m.title === 'First 10K Walk'; })) {
            milestones.push({ date: dateStr, title: 'First 10K Walk', desc: km.toFixed(1) + ' km', type: 'walk' });
          }
        }

        if (t === 'weighttraining' || t === 'workout') {
          if (!milestones.find(function(m){ return m.title === 'First Gym Session'; })) {
            milestones.push({ date: dateStr, title: 'First Gym Session', desc: a.name || 'Workout', type: 'gym' });
          }
        }
      });

      // Check monthly records
      Object.keys(monthlyRun).forEach(function (m) {
        if (monthlyRun[m] >= 100 && !milestones.find(function(ms){ return ms.title === '100+ km Run Month' && ms.desc.indexOf(m) >= 0; })) {
          milestones.push({ date: m + '-28', title: '100+ km Run Month', desc: monthlyRun[m].toFixed(0) + ' km in ' + formatMonth(m), type: 'run' });
        }
      });
      Object.keys(monthlyBike).forEach(function (m) {
        if (monthlyBike[m] >= 200 && !milestones.find(function(ms){ return ms.title === '200+ km Bike Month' && ms.desc.indexOf(m) >= 0; })) {
          milestones.push({ date: m + '-28', title: '200+ km Bike Month', desc: monthlyBike[m].toFixed(0) + ' km in ' + formatMonth(m), type: 'bike' });
        }
      });

      // Sort by date
      milestones.sort(function (a, b) { return a.date.localeCompare(b.date); });

      // Render
      renderMilestonesTimeline(milestones);

      // Update progression stats
      setHTML('progLongestRun', longestRun.toFixed(1) + ' km');
      setHTML('progLongestRide', longestRide.toFixed(1) + ' km');
      setHTML('progLongestSwim', longestSwim > 0 ? (longestSwim * 1000).toFixed(0) + ' m' : '0 m');
    });
  }

  function formatMonth(ym) {
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var parts = ym.split('-');
    return months[parseInt(parts[1]) - 1] + ' ' + parts[0];
  }

  function renderMilestonesTimeline(milestones) {
    var container = document.getElementById('msGrid');
    if (!container) return;

    if (!milestones.length) {
      container.innerHTML = '<div style="grid-column:1/-1;font-family:var(--font-mono);font-size:11px;color:var(--text-dim);padding:40px;text-align:center">No milestones yet — keep training!</div>';
      return;
    }

    container.innerHTML = '';
    var typeIcons = { run: '🏃', bike: '🚴', swim: '🏊', gym: '🏋️', walk: '🚶' };

    // Major milestones that deserve a wider card
    var majorKeywords = ['100 km', '500 km', '1000 km', 'Marathon', 'Century', 'First 1K Swim', 'Half Marathon'];

    milestones.forEach(function (m) {
      var isMajor = majorKeywords.some(function (kw) { return m.title.indexOf(kw) >= 0; });
      var card = document.createElement('div');
      card.className = 'ms-card ms-card--' + (m.type || 'run') + (isMajor ? ' ms-card--major' : '');

      card.innerHTML =
        '<div class="ms-icon">' + (typeIcons[m.type] || '⭐') + '</div>' +
        '<div class="ms-title">' + escHTML(m.title) + '</div>' +
        '<div class="ms-val">' + escHTML(m.desc) + '</div>' +
        '<div class="ms-date">' + formatDateShort(m.date) + '</div>';

      container.appendChild(card);
    });

    // Update milestone count
    setHTML('progTotal', milestones.length.toString());

    // Animate if GSAP available
    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
      gsap.utils.toArray('#msGrid .ms-card').forEach(function (el, i) {
        gsap.from(el, {
          opacity: 0, y: 20, scale: 0.95, duration: 0.4, delay: i * 0.05,
          ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 92%', toggleActions: 'play none none none' }
        });
      });
    }
  }

  // ══════════════════════════════════
  //  RACES — From Supabase races table
  // ══════════════════════════════════
  function loadRaces() {
    fetchSB('races', '?select=*&order=date.asc').then(function (races) {
      var container = document.getElementById('racesTimeline');
      if (!container) return;

      if (!races || !races.length) {
        container.innerHTML = '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);padding:20px;text-align:center">No races registered yet</div>';
        return;
      }

      container.innerHTML = '';
      var ist = (typeof getNowIST === 'function') ? getNowIST() : new Date();
      var todayStr = ist.getFullYear() + '-' + String(ist.getMonth() + 1).padStart(2, '0') + '-' + String(ist.getDate()).padStart(2, '0');

      races.forEach(function (r) {
        var node = document.createElement('div');
        node.className = 'race-node';

        var status = (r.status || 'upcoming').toLowerCase();
        var isPast = status === 'completed' || status === 'dnf' || status === 'dns';
        var isNext = !isPast && status === 'upcoming';
        var dotClass = isPast ? 'race-dot--done' : isNext ? 'race-dot--next' : 'race-dot--future';
        var badgeClass = isPast ? 'race-badge--registered' : 'race-badge--planned';
        var badgeText = status === 'completed' ? 'COMPLETED' : status === 'dnf' ? 'DNF' : status === 'dns' ? 'DNS' : 'UPCOMING';
        var badgeColor = status === 'completed' ? 'var(--green)' : status === 'dnf' ? 'var(--red)' : status === 'dns' ? 'var(--red)' : 'var(--gold)';

        var dist = r.distance ? r.distance + ' km' : '';
        var typeLabel = r.type ? r.type.toUpperCase().replace('_', ' ') : '';
        var finishInfo = '';
        if (r.finishTime) finishInfo = ' &middot; ' + r.finishTime;
        if (r.pace) finishInfo += ' &middot; ' + r.pace + '/km';
        var location = r.location ? ' &middot; ' + escHTML(r.location) : '';

        node.innerHTML =
          '<div class="race-dot ' + dotClass + '"></div>' +
          '<div class="race-year">' + formatDateShort(r.date) + (typeLabel ? ' &middot; ' + typeLabel : '') + '</div>' +
          '<div class="race-name">' + escHTML(r.name || r.shortName || 'Race') + '</div>' +
          '<div class="race-details">' + dist + location + finishInfo + '</div>' +
          '<span class="race-badge ' + badgeClass + '" style="color:' + badgeColor + ';border-color:' + badgeColor + '">' + badgeText + '</span>';

        container.appendChild(node);
      });

      // Animate
      if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
        gsap.utils.toArray('#racesTimeline .race-node').forEach(function (el, i) {
          gsap.from(el, {
            opacity: 0, x: -30, duration: 0.5, delay: i * 0.08,
            ease: 'power2.out',
            scrollTrigger: { trigger: el, start: 'top 90%', toggleActions: 'play none none none' }
          });
        });
      }
    });
  }

  function formatDateShort(dateStr) {
    if (!dateStr) return '';
    var months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    var parts = dateStr.split('-');
    return months[parseInt(parts[1]) - 1] + ' ' + parts[2] + ', ' + parts[0];
  }

  function escHTML(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // ══════════════════════════════════
  //  TODAY'S ACTIVITIES — Dynamic Cards
  // ══════════════════════════════════
  function renderTodayActivities(acts) {
    var container = document.getElementById('todayActivities');
    if (!container) return;

    if (!acts.length) {
      container.innerHTML =
        '<div class="today-empty">' +
          '<div class="today-empty-icon">&#128694;</div>' +
          '<div class="today-empty-text">No activities logged yet today</div>' +
          '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);margin-top:8px;opacity:0.5">Activities appear here as soon as they sync from Strava</div>' +
        '</div>';
      return;
    }

    var icons = {
      Run: '&#127939;', VirtualRun: '&#127939;', Ride: '&#128692;', Swim: '&#127946;',
      Walk: '&#128694;', Hike: '&#9968;', Workout: '&#127947;', WeightTraining: '&#127947;',
      Yoga: '&#129495;', StairStepper: '&#128694;',
      Dance: '&#128131;', Boxing: '&#129354;', MartialArts: '&#129354;',
      Pilates: '&#129495;', HIIT: '&#128293;', Crossfit: '&#128170;'
    };

    var html = '';
    acts.forEach(function (a) {
      // Use sport_type for better label (Dance, Boxing, Pilates etc.)
      var sportType = a.sport_type || a.type || 'Workout';
      var type = sportType;
      var km = (a.distance || 0) / 1000;
      var mins = Math.round((a.moving_time || 0) / 60);
      var hrs = Math.floor(mins / 60);
      var durStr = hrs > 0 ? hrs + 'h ' + (mins % 60) + 'm' : mins + ' min';
      var hr = a.average_heartrate ? Math.round(a.average_heartrate) : null;
      var cal = a.calories ? Math.round(a.calories) : null;
      var timeStr = '';
      if (a.start_date_local) {
        var d = new Date(a.start_date_local);
        var h = d.getHours(); var m = d.getMinutes();
        var period = h < 12 ? 'AM' : 'PM';
        var h12 = h % 12 || 12;
        timeStr = String(h12).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ' ' + period;
      }
      var pace = '';
      if ((type === 'Run' || type === 'VirtualRun') && km > 0 && a.moving_time > 0) {
        var paceMin = (a.moving_time / 60) / km;
        var pm = Math.floor(paceMin);
        var ps = Math.round((paceMin - pm) * 60);
        pace = pm + ':' + String(ps).padStart(2, '0') + '/km';
      }

      html += '<div class="act-card act-card--' + type + '" style="opacity:1;transform:none;visibility:visible">';
      html += '<div class="act-head">';
      var displayType = type.toUpperCase().replace('WEIGHTTRAINING', 'GYM').replace('VIRTUALRUN', 'RUN').replace('STAIRSTEPPER', 'STAIRS').replace('MARTIALARTS', 'MARTIAL ARTS');
      html += '<div class="act-type">' + (icons[type] || icons[a.type] || '&#127939;') + ' ' + displayType + '</div>';
      html += '<div class="act-time-badge">' + timeStr + '</div>';
      html += '</div>';
      html += '<div class="act-metrics" style="display:flex;gap:20px;flex-wrap:wrap">';

      if (km > 0.01) {
        html += '<div class="act-metric"><div class="act-metric-val" style="color:#fff;font-size:1.6rem">' + km.toFixed(1) + '</div><div class="act-metric-label">KM</div></div>';
      }
      html += '<div class="act-metric"><div class="act-metric-val" style="color:#fff;font-size:1.6rem">' + durStr + '</div><div class="act-metric-label">DURATION</div></div>';
      if (pace) {
        html += '<div class="act-metric"><div class="act-metric-val" style="color:#fff;font-size:1.6rem">' + pace + '</div><div class="act-metric-label">PACE</div></div>';
      }
      if (hr) {
        html += '<div class="act-metric"><div class="act-metric-val" style="color:#fff;font-size:1.6rem">' + hr + '</div><div class="act-metric-label">AVG HR</div></div>';
      }
      if (cal) {
        html += '<div class="act-metric"><div class="act-metric-val" style="color:#fff;font-size:1.6rem">' + cal + '</div><div class="act-metric-label">CAL</div></div>';
      }

      html += '</div>';
      if (a.name) html += '<div class="act-name" style="color:#5A6B80;margin-top:12px">' + escHTML(a.name) + '</div>';
      html += '</div>';
    });

    container.innerHTML = html;

    // GSAP animate — simple entrance, no ScrollTrigger (cards are dynamically injected)
    if (typeof gsap !== 'undefined') {
      gsap.utils.toArray('#todayActivities .act-card').forEach(function (el, i) {
        gsap.fromTo(el, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, delay: i * 0.1, ease: 'power2.out' });
      });
    }
  }

  // ── Animate week bars ──
  function animateWeekBars() {
    var bars = document.querySelectorAll('#weekBars .week-bar');
    var data = window._weekBarData || [30, 60, 45, 0, 50, 90, 20];
    var max = Math.max.apply(null, data) || 1;

    bars.forEach(function (bar, i) {
      var pct = Math.round((data[i] / max) * 100);
      setTimeout(function () {
        bar.style.height = Math.max(4, pct) + '%';
      }, i * 80);
    });
  }

  // ── Helpers ──
  function setVal(id, value, unit) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = value + '<span class="unit">' + (unit || '') + '</span>';
  }

  function setHTML(id, html) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

})();
