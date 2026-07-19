// ═══════════════════════════════════════════════════════
// FIRST LIGHT — MISS-CONFIRM GATE (operator control for #2)
//
// The engine records a MISS to the ledger but HOLDS the public Instagram post
// until you confirm it — so a flaky data feed (Strava ban / Apple Health gaps)
// can never auto-shame a day the run actually happened.
//
// This module detects held misses (proof_archive.verdict=MISS + ig_post_id null,
// Chapter 03 onward) and shows a banner in admin with two choices:
//   • CONFIRM & POST → calls ?action=confirm-miss (re-judges, then posts; if the
//     day is now a WIN from a late sync, a WIN posts instead — self-heals).
//   • KEEP PRIVATE   → dismiss locally. No post goes out; the slip stays pending.
// Self-contained: injects its own banner, no HTML container required.
// ═══════════════════════════════════════════════════════

(function () {
  'use strict';

  var SUPA = (window.FL && FL.SUPABASE_URL) || localStorage.getItem('fl_supabase_url') || '';
  var KEY  = (window.FL && FL.SUPABASE_ANON_KEY) || localStorage.getItem('fl_supabase_key') || '';
  var SYNC_URL = SUPA + '/functions/v1/firstlight-sync';
  var ADMIN_KEY = ['934c03a18ffe22cb', 'ccef763b4bf480d5', '3f0690177904ba2b', '1d9ebacd52b0eb5d'].join('');
  var CH3_START = '2026-07-19';   // gate applies from Chapter 03 onward
  var GOLD = '#F5A623', RED = '#FF5252', GREEN = '#00E676';
  var _busy = false;

  function disputed(date) { return localStorage.getItem('fl_miss_disputed_' + date) === '1'; }

  // Held miss = proof_archive row judged MISS, not yet posted (ig_post_id null), Chapter 03+.
  function fetchHeldMisses() {
    if (!SUPA || !KEY) return Promise.resolve([]);
    var q = '/rest/v1/proof_archive?select=date,verdict,ig_post_id'
      + '&verdict=eq.MISS&ig_post_id=is.null&date=gte.' + CH3_START
      + '&order=date.desc&limit=10';
    return fetch(SUPA + q, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) { return (rows || []).filter(function (x) { return !disputed(x.date); }); })
      .catch(function () { return []; });
  }

  function confirmMiss(date, btn) {
    if (_busy) return;
    _busy = true;
    if (btn) { btn.textContent = 'POSTING…'; btn.disabled = true; }
    fetch(SYNC_URL + '?action=confirm-miss&date=' + encodeURIComponent(date) + '&admin_key=' + ADMIN_KEY,
      { method: 'GET', headers: { Authorization: 'Bearer ' + KEY } })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        _busy = false;
        var v = (res && res.verdict && res.verdict.verdict) || '?';
        var posted = res && (res.publishedPost || res.publishedStory);
        if (posted || v === 'WIN') {
          // WIN self-heal or MISS posted — clear the row's banner.
          alert(v === 'WIN'
            ? 'Re-judged as WIN (a run synced late) — a WIN was posted, not a miss.'
            : 'Miss confirmed and posted publicly. Donation flow started.');
          removeRow(date);
        } else {
          alert('Confirm ran but nothing posted.\n' + ((res.errors || []).join('\n') || 'See response.'));
          if (btn) { btn.textContent = 'CONFIRM & POST'; btn.disabled = false; }
        }
      })
      .catch(function (e) {
        _busy = false;
        alert('Confirm failed: ' + e.message);
        if (btn) { btn.textContent = 'CONFIRM & POST'; btn.disabled = false; }
      });
  }

  function keepPrivate(date) {
    localStorage.setItem('fl_miss_disputed_' + date, '1');
    removeRow(date);
  }

  function removeRow(date) {
    var row = document.getElementById('fl-heldmiss-' + date);
    if (row) row.parentNode.removeChild(row);
    var wrap = document.getElementById('fl-heldmiss-wrap');
    if (wrap && !wrap.querySelector('.fl-heldmiss-row')) wrap.parentNode.removeChild(wrap);
  }

  function render(misses) {
    if (!misses.length) return;
    if (document.getElementById('fl-heldmiss-wrap')) return; // already shown
    var wrap = document.createElement('div');
    wrap.id = 'fl-heldmiss-wrap';
    wrap.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9999;'
      + 'background:rgba(10,12,16,0.97);border-top:2px solid ' + RED + ';'
      + 'box-shadow:0 -8px 32px rgba(0,0,0,0.6);padding:14px 16px;'
      + 'font-family:"IBM Plex Mono",monospace;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)';

    var head = document.createElement('div');
    head.style.cssText = 'font-size:11px;letter-spacing:2px;color:' + RED + ';font-weight:700;margin-bottom:10px';
    head.textContent = '⏸ MISS HELD — NOT POSTED PUBLICLY (' + misses.length + ')';
    wrap.appendChild(head);

    misses.forEach(function (mrow) {
      var row = document.createElement('div');
      row.className = 'fl-heldmiss-row';
      row.id = 'fl-heldmiss-' + mrow.date;
      row.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;'
        + 'padding:8px 0;border-top:1px solid rgba(255,255,255,0.06)';

      var label = document.createElement('div');
      label.style.cssText = 'flex:1 1 180px;min-width:160px;font-size:12px;color:#E8EDF2';
      label.innerHTML = '<strong style="color:' + GOLD + '">' + mrow.date + '</strong> — judged a miss. '
        + '<span style="color:#8a9bb0">Confirm to post + donate, or keep private if the run actually happened.</span>';
      row.appendChild(label);

      var cbtn = document.createElement('button');
      cbtn.textContent = 'CONFIRM & POST';
      cbtn.style.cssText = 'padding:8px 14px;border:0;border-radius:6px;background:' + RED + ';color:#0A0C10;'
        + 'font-family:inherit;font-size:11px;font-weight:700;letter-spacing:1px;cursor:pointer;'
        + '-webkit-tap-highlight-color:transparent;touch-action:manipulation;min-height:40px';
      cbtn.addEventListener('click', function () {
        if (confirm('Post the ' + mrow.date + ' MISS publicly to Instagram and start the ₹1,500 donation flow?')) {
          confirmMiss(mrow.date, cbtn);
        }
      });
      row.appendChild(cbtn);

      var kbtn = document.createElement('button');
      kbtn.textContent = 'KEEP PRIVATE';
      kbtn.style.cssText = 'padding:8px 14px;border:1px solid ' + GREEN + ';border-radius:6px;background:transparent;'
        + 'color:' + GREEN + ';font-family:inherit;font-size:11px;font-weight:700;letter-spacing:1px;cursor:pointer;'
        + '-webkit-tap-highlight-color:transparent;touch-action:manipulation;min-height:40px';
      kbtn.addEventListener('click', function () { keepPrivate(mrow.date); });
      row.appendChild(kbtn);

      wrap.appendChild(row);
    });

    document.body.appendChild(wrap);
  }

  function check() { fetchHeldMisses().then(render); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', check);
  } else {
    check();
  }
  // Re-check when the operator returns to the tab (a nightly verdict may have landed).
  window.addEventListener('focus', function () {
    if (!document.getElementById('fl-heldmiss-wrap')) check();
  });
})();
