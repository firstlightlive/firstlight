// ═══════════════════════════════════════════
// FIRST LIGHT — FOCUS TIMER
// Event delegation — no dependency on load order
// ═══════════════════════════════════════════

(function() {
  // State
  var _timerBlock = null;
  var _timerInterval = null;
  var _wakeLock = null;

  // ── Event delegation: catch ALL timer button clicks ──
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.dw-timer-btn');
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      openTimer(btn);
    }
  }, true);

  // ── Beep via Web Audio API ──
  function beep(freq, ms, count) {
    try {
      var ac = new (window.AudioContext || window.webkitAudioContext)();
      var i = 0;
      (function next() {
        if (i >= count) return;
        var o = ac.createOscillator();
        var g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.frequency.value = freq; o.type = 'sine'; g.gain.value = 0.15;
        o.start(); o.stop(ac.currentTime + ms / 1000);
        i++;
        if (i < count) setTimeout(next, ms + 150);
      })();
    } catch(e) {}
  }

  function fmt(s) {
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  function fmtClock(d) {
    var h = d.getHours(), m = d.getMinutes(), ap = h >= 12 ? 'PM' : 'AM';
    return (h % 12 || 12) + ':' + String(m).padStart(2, '0') + ' ' + ap;
  }

  // ═══════════════════════════════════════
  // SCREEN 1: Time Picker Dial
  // ═══════════════════════════════════════
  function openTimer(btn) {
    var block = btn.closest('.dw-block');
    if (!block) return;
    _timerBlock = block;

    var taskInputs = block.querySelectorAll('input[type="text"]');
    var existingTask = taskInputs[1] ? taskInputs[1].value : '';

    // Remove old overlay
    var old = document.getElementById('ft-overlay');
    if (old) old.remove();

    var sel = 30; // default 30 min
    var opts = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

    var ov = document.createElement('div');
    ov.id = 'ft-overlay';
    ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;background:#0A0C10;display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto';
    document.body.appendChild(ov);

    function draw() {
      var w = Math.min(280, window.innerWidth - 32);
      var h = '';
      h += '<div style="text-align:center;width:100%;max-width:320px">';

      // Title
      h += '<div style="font-family:IBM Plex Mono,monospace;font-size:10px;letter-spacing:4px;color:#00D4FF;margin-bottom:16px">FOCUS TIMER</div>';

      // Big number
      h += '<div style="font-family:IBM Plex Mono,monospace;font-size:64px;font-weight:700;color:#E8EDF2;line-height:1;margin-bottom:4px">' + sel + '</div>';
      h += '<div style="font-family:IBM Plex Mono,monospace;font-size:9px;letter-spacing:3px;color:#5a6a7a;margin-bottom:24px">MINUTES</div>';

      // Pill buttons — simple, guaranteed touch works
      h += '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:28px">';
      opts.forEach(function(m) {
        var active = m === sel;
        h += '<button data-ft-pick="' + m + '" style="';
        h += 'width:48px;height:48px;border-radius:50%;border:2px solid ' + (active ? '#00D4FF' : 'rgba(255,255,255,0.1)') + ';';
        h += 'background:' + (active ? '#00D4FF' : 'transparent') + ';';
        h += 'color:' + (active ? '#000' : (active ? '#00D4FF' : '#8a9bb0')) + ';';
        h += 'font-family:IBM Plex Mono,monospace;font-size:13px;font-weight:' + (active ? '700' : '500') + ';';
        h += 'cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;';
        if (active) h += 'box-shadow:0 0 16px rgba(0,212,255,0.4);';
        h += '">' + m + '</button>';
      });
      h += '</div>';

      // Task input
      h += '<div style="margin-bottom:20px">';
      h += '<input type="text" id="ft-task" value="' + (existingTask || '').replace(/"/g, '&quot;') + '" placeholder="What will you focus on?" style="';
      h += 'width:100%;padding:14px 16px;background:#141720;border:1px solid rgba(255,255,255,0.1);border-radius:10px;';
      h += 'color:#E8EDF2;font-family:IBM Plex Mono,monospace;font-size:14px;box-sizing:border-box;outline:none;text-align:center">';
      h += '</div>';

      // Start
      h += '<button id="ft-start" style="';
      h += 'width:100%;padding:18px;background:#00D4FF;color:#000;border:none;border-radius:12px;';
      h += 'font-family:IBM Plex Mono,monospace;font-size:16px;font-weight:700;letter-spacing:2px;';
      h += 'cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;min-height:56px">';
      h += 'START FOCUS</button>';

      // Cancel
      h += '<button id="ft-cancel" style="';
      h += 'background:none;border:none;color:#5a6a7a;font-family:IBM Plex Mono,monospace;font-size:11px;';
      h += 'letter-spacing:1px;margin-top:20px;padding:12px 24px;cursor:pointer;min-height:44px;';
      h += 'touch-action:manipulation;-webkit-tap-highlight-color:transparent">CANCEL</button>';

      h += '</div>';
      ov.innerHTML = h;

      // Attach pick handlers
      ov.querySelectorAll('[data-ft-pick]').forEach(function(b) {
        b.addEventListener('click', function() {
          sel = parseInt(this.getAttribute('data-ft-pick'));
          var ti = document.getElementById('ft-task');
          if (ti) existingTask = ti.value;
          draw();
        });
      });

      var startBtn = document.getElementById('ft-start');
      if (startBtn) startBtn.addEventListener('click', function() {
        var task = (document.getElementById('ft-task') || {}).value || '';
        ov.remove();
        startCountdown(sel, task.trim());
      });

      var cancelBtn = document.getElementById('ft-cancel');
      if (cancelBtn) cancelBtn.addEventListener('click', function() { ov.remove(); });
    }

    draw();
  }

  // ═══════════════════════════════════════
  // SCREEN 2: Countdown with Ring
  // ═══════════════════════════════════════
  function startCountdown(minutes, task) {
    var total = minutes * 60;
    var remain = total;
    var startTime = new Date();
    var blockNum = _timerBlock ? (_timerBlock.querySelector('.dw-num') || {}).textContent || '?' : '?';

    beep(880, 150, 1);

    // Wake lock
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function(w) { _wakeLock = w; }).catch(function() {}); } catch(e) {}

    var ov = document.createElement('div');
    ov.id = 'ft-overlay';
    ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;background:#0A0C10;display:flex;align-items:center;justify-content:center;padding:16px';
    document.body.appendChild(ov);

    var sz = Math.min(280, window.innerWidth - 40);
    var cx = sz / 2, r = sz / 2 - 16;
    var circ = 2 * Math.PI * r;

    function renderCD() {
      var pct = remain / total;
      var last60 = remain <= 60 && remain > 0;
      var col = last60 ? '#FF5252' : '#00D4FF';

      var h = '<div style="text-align:center;max-width:360px;width:100%">';
      h += '<div style="font-family:IBM Plex Mono,monospace;font-size:10px;letter-spacing:4px;color:#00D4FF;margin-bottom:20px">DEEP WORK</div>';

      // Ring
      h += '<div style="width:' + sz + 'px;height:' + sz + 'px;margin:0 auto 16px;position:relative">';
      h += '<svg viewBox="0 0 ' + sz + ' ' + sz + '" width="' + sz + '" height="' + sz + '" style="display:block;transform:rotate(-90deg)">';
      h += '<circle cx="' + cx + '" cy="' + cx + '" r="' + r + '" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="6"/>';
      h += '<circle id="ft-ring" cx="' + cx + '" cy="' + cx + '" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="6" stroke-linecap="round" stroke-dasharray="' + circ + '" stroke-dashoffset="' + (circ * (1 - pct)) + '" style="transition:stroke-dashoffset 1s linear"/>';
      h += '</svg>';

      // Center
      h += '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center">';
      h += '<div id="ft-time" style="font-family:IBM Plex Mono,monospace;font-size:clamp(44px,12vw,64px);font-weight:700;color:' + col + ';line-height:1;font-variant-numeric:tabular-nums;' + (last60 ? 'animation:ftPulse 1s infinite' : '') + '">' + fmt(remain) + '</div>';
      if (task) h += '<div style="font-family:IBM Plex Mono,monospace;font-size:11px;color:#8a9bb0;margin-top:10px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + task + '</div>';
      h += '</div>';
      h += '</div>';

      // Info
      var done = total - remain;
      var donePct = total > 0 ? Math.round(done / total * 100) : 0;
      h += '<div style="font-family:IBM Plex Mono,monospace;font-size:10px;color:#5a6a7a;margin-bottom:4px">Block ' + blockNum + ' · ' + fmtClock(startTime) + '</div>';
      h += '<div style="font-family:IBM Plex Mono,monospace;font-size:12px;color:#8a9bb0;margin-bottom:28px">' + donePct + '% complete</div>';

      // Stop
      h += '<button id="ft-stop" style="padding:14px 32px;background:transparent;border:1px solid rgba(255,82,82,0.4);border-radius:10px;color:#FF5252;font-family:IBM Plex Mono,monospace;font-size:12px;letter-spacing:1px;cursor:pointer;min-height:48px;touch-action:manipulation;-webkit-tap-highlight-color:transparent">STOP EARLY</button>';
      h += '</div>';
      return h;
    }

    ov.innerHTML = renderCD();
    document.getElementById('ft-stop').addEventListener('click', function() {
      clearInterval(_timerInterval);
      finish(false);
    });

    _timerInterval = setInterval(function() {
      remain--;
      if (remain <= 0) {
        clearInterval(_timerInterval);
        beep(1000, 200, 3);
        finish(true);
        return;
      }
      var last60 = remain <= 60;
      var col = last60 ? '#FF5252' : '#00D4FF';
      var ring = document.getElementById('ft-ring');
      if (ring) { ring.style.strokeDashoffset = circ * (1 - remain / total); ring.style.stroke = col; }
      var tm = document.getElementById('ft-time');
      if (tm) { tm.textContent = fmt(remain); tm.style.color = col; tm.style.animation = last60 ? 'ftPulse 1s infinite' : ''; }
    }, 1000);

    // ═══════════════════════════════════════
    // SCREEN 3: Complete
    // ═══════════════════════════════════════
    function finish(completed) {
      if (_wakeLock) { try { _wakeLock.release(); } catch(e) {} _wakeLock = null; }
      var endTime = new Date();
      var elapsed = Math.round((endTime - startTime) / 1000);
      var elMin = Math.floor(elapsed / 60);

      var h = '<div style="text-align:center;max-width:360px">';
      var c = completed ? '#00E676' : '#F5A623';
      h += '<div style="font-size:56px;margin-bottom:16px;animation:ftBounce 0.5s ease-out">' + (completed ? '✓' : '⏸') + '</div>';
      h += '<div style="font-family:IBM Plex Mono,monospace;font-size:10px;letter-spacing:3px;color:' + c + ';margin-bottom:16px">' + (completed ? 'SESSION COMPLETE' : 'SESSION STOPPED') + '</div>';
      h += '<div style="font-family:IBM Plex Mono,monospace;font-size:42px;font-weight:700;color:#E8EDF2">' + elMin + ':' + String(elapsed % 60).padStart(2, '0') + '</div>';
      h += '<div style="font-family:IBM Plex Mono,monospace;font-size:10px;color:#5a6a7a;margin-top:4px;letter-spacing:1px">MINUTES FOCUSED</div>';
      h += '<div style="font-family:IBM Plex Mono,monospace;font-size:12px;color:#8a9bb0;margin-top:16px">' + fmtClock(startTime) + ' → ' + fmtClock(endTime) + '</div>';
      if (task) h += '<div style="font-family:IBM Plex Mono,monospace;font-size:11px;color:#5a6a7a;margin-top:8px">"' + task + '"</div>';
      h += '<button id="ft-close" style="margin-top:32px;padding:16px 40px;background:#00D4FF;color:#000;border:none;border-radius:10px;font-family:IBM Plex Mono,monospace;font-size:14px;font-weight:700;letter-spacing:2px;cursor:pointer;min-height:52px;touch-action:manipulation;-webkit-tap-highlight-color:transparent">CLOSE</button>';
      h += '</div>';
      ov.innerHTML = h;

      document.getElementById('ft-close').addEventListener('click', function() { ov.remove(); });

      // Auto-fill block
      if (_timerBlock) {
        var ti = _timerBlock.querySelector('.dw-time input');
        if (ti) {
          var sh = startTime.getHours(), sm = startTime.getMinutes();
          var eh = endTime.getHours(), em = endTime.getMinutes();
          ti.value = sh + ':' + String(sm).padStart(2, '0') + '-' + eh + ':' + String(em).padStart(2, '0');
        }
        var txs = _timerBlock.querySelectorAll('input[type="text"]');
        if (txs[1] && task) txs[1].value = task;
        var cb = _timerBlock.querySelector('input[type="checkbox"]');
        if (cb && !cb.checked) { cb.checked = true; if (typeof updateDwSessions === 'function') updateDwSessions(); }
        if (typeof saveDeepWork === 'function') saveDeepWork();
      }
    }
  }

  // Inject animations
  var s = document.createElement('style');
  s.textContent = '@keyframes ftPulse{0%,100%{opacity:1}50%{opacity:0.4}} @keyframes ftBounce{0%{transform:scale(0)}60%{transform:scale(1.2)}100%{transform:scale(1)}}';
  document.head.appendChild(s);
})();
 
