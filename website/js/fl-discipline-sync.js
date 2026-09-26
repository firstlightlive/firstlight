// ═══════════════════════════════════════════════════════════════
// FIRST LIGHT — DISCIPLINE SYNC
//
// Gives discipline.html's covenant record a home beyond one browser. Until
// 2026-09-26 the 5 ritual marks AND the whole Punishment Cycle debt ledger
// lived in localStorage only (fl_ch4_log + fl_ch6_cleared_<epoch>): one device,
// no backup, no sync. Clearing the browser erased the record.
//
// Supabase `discipline_log` is now the durable copy; localStorage stays the
// working store so the page keeps functioning with the home network off. Writes
// go through FL.upsert, so the service worker queues them and replays with a
// re-stamped token when signal returns.
//
// MERGE POLICY — deliberately different for the two kinds of row:
//   day entries : last-write-wins on a recorded timestamp. A day's marks are a
//                 statement of fact about that day; the most recent statement
//                 is the one to keep.
//   cleared km  : MAX per component, never a plain overwrite. This is money
//                 already paid in distance. If two devices each recorded a
//                 payment, taking the larger can at worst under-credit a later
//                 payment (recoverable by re-entering it); overwriting could
//                 silently delete a ride that was genuinely ridden.
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var TABLE = 'discipline_log';
  var LOG_KEY = 'fl_ch4_log';
  var SNAP_KEY = 'fl_disc_synced';      // what we last pushed, to diff against
  var clearedKey = null;                 // set by init(); depends on the run epoch
  var epoch = null;
  var _remoteCb = null;

  function jget(k, d) { try { return JSON.parse(localStorage.getItem(k) || d); } catch (e) { return JSON.parse(d); } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function loadLog() { return jget(LOG_KEY, '{}'); }
  function loadCleared() { return jget(clearedKey, '{"cycle":0,"run":0,"walk":0}'); }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

  function supa() {
    var u = window.FL && FL.SUPABASE_URL, k = window.FL && FL.SUPABASE_ANON_KEY;
    return (u && k) ? { url: u, key: k } : null;
  }

  async function token() {
    var s = supa(); if (!s) return null;
    if (window.FL && typeof FL.ownerToken === 'function') {
      try { return (await FL.ownerToken()) || s.key; } catch (e) { return s.key; }
    }
    try {
      var sess = JSON.parse(localStorage.getItem('fl_supabase_session') || 'null');
      return (sess && sess.access_token) || s.key;
    } catch (e) { return s.key; }
  }

  // ── push ──────────────────────────────────────────────
  async function upsert(row) {
    if (!(window.FL && typeof FL.upsert === 'function')) return false;
    try {
      var r = await FL.upsert(TABLE, row, { owner: true, onConflict: 'date,kind' });
      return !!(r && r.ok && r.status !== 202);   // 202 = queued by the SW
    } catch (e) {
      console.warn('[disc] push failed, kept locally:', e.message);
      return false;
    }
  }

  // Push only the days that actually changed since the last successful push, so
  // re-rendering or a backfill sweep does not re-send the whole history.
  async function syncDays(logObj) {
    logObj = logObj || loadLog();
    var snap = jget(SNAP_KEY, '{}');
    var dates = Object.keys(logObj).filter(function (ds) {
      if (epoch && ds < epoch) return false;              // previous runs stay local
      return JSON.stringify(logObj[ds]) !== JSON.stringify(snap[ds]);
    });
    if (!dates.length) return 0;
    var n = 0;
    for (var i = 0; i < dates.length; i++) {
      var ds = dates[i];
      var ok = await upsert({ date: ds, kind: 'day', data: logObj[ds] });
      // Record it as synced even when the SW queued it: the queue owns delivery
      // from that point, and re-pushing an identical row on every render would
      // be noise. A genuine failure leaves it un-snapshotted and retries.
      if (ok) { snap[ds] = logObj[ds]; n++; }
    }
    jset(SNAP_KEY, snap);
    return n;
  }

  async function syncCleared(c) {
    c = c || loadCleared();
    if (!epoch) return false;
    return upsert({ date: epoch, kind: 'cleared', data: c });
  }

  // ── pull + merge ──────────────────────────────────────
  async function pull() {
    var s = supa(); if (!s) return false;
    var rows;
    try {
      var t = await token();
      var r = await fetch(s.url + '/rest/v1/' + TABLE + '?select=*&order=date.desc', {
        headers: { apikey: s.key, Authorization: 'Bearer ' + t }
      });
      if (!r.ok) return false;
      rows = await r.json();
      if (!Array.isArray(rows)) return false;
    } catch (e) { return false; }     // offline — the local store is authoritative

    var logObj = loadLog(), cl = loadCleared(), changed = false;

    rows.forEach(function (row) {
      if (row.kind === 'cleared') {
        // MAX per component — never drop a payment that was genuinely made.
        var d = row.data || {};
        ['cycle', 'run', 'walk'].forEach(function (k) {
          if (num(d[k]) > num(cl[k])) { cl[k] = num(d[k]); changed = true; }
        });
        return;
      }
      if (!row.date || !row.data) return;
      var mine = logObj[row.date];
      var theirs = row.data;
      if (!mine) { logObj[row.date] = theirs; changed = true; return; }
      // Last-write-wins on the recorded timestamp. Without one on either side we
      // keep the local copy rather than guess.
      var mineTs = mine._ts ? Date.parse(mine._ts) : 0;
      var theirTs = theirs._ts ? Date.parse(theirs._ts) : Date.parse(row.updated_at || 0) || 0;
      if (theirTs > mineTs) { logObj[row.date] = theirs; changed = true; }
    });

    if (changed) {
      jset(LOG_KEY, logObj);
      jset(clearedKey, cl);
      // Keep the diff snapshot in step so the merge does not immediately
      // re-push everything it just pulled.
      var snap = jget(SNAP_KEY, '{}');
      Object.keys(logObj).forEach(function (ds) { snap[ds] = logObj[ds]; });
      jset(SNAP_KEY, snap);
      if (_remoteCb) { try { _remoteCb(); } catch (e) {} }
    }
    return changed;
  }

  // ── reconcile — PULL FIRST, THEN PUSH. Order is load-bearing ──
  //
  // Running pull() and syncCleared() concurrently corrupts the ledger: the push
  // reads localStorage before the merge lands, so a device that only knows about
  // 30 km paid will overwrite a server row recording 120 km, and the MAX policy
  // never gets a chance to protect the larger total. A regression test covers
  // this exact sequence — do not "optimise" these into parallel calls.
  var _busy = false;
  async function reconcile() {
    if (_busy) return;
    _busy = true;
    try {
      await pull();          // merge the server's record in first
      await syncDays();      // then flush whatever this device logged offline
      await syncCleared();
    } finally {
      _busy = false;
    }
  }

  // ── public API ────────────────────────────────────────
  // init(epochDate, clearedStorageKey, onRemoteChange)
  function init(epochDate, ck, onRemote) {
    epoch = epochDate || null;
    clearedKey = ck;
    _remoteCb = typeof onRemote === 'function' ? onRemote : null;

    reconcile();

    // Another tab/page or another device changed it.
    if (window.FL && typeof FL.onChange === 'function') {
      FL.onChange(function (m) {
        if (!m || m.source === 'local') return;
        if (m.type && m.type !== TABLE) return;
        reconcile();
      });
    }
    window.addEventListener('online', reconcile);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') reconcile();
    });
    return reconcile();
  }

  window.FLDisc = {
    init: init,
    reconcile: reconcile,
    pull: pull,
    syncDays: syncDays,
    syncCleared: syncCleared,
    // Stamp a day entry so last-write-wins has something to compare.
    stamp: function (entry) {
      if (entry && typeof entry === 'object') entry._ts = new Date().toISOString();
      return entry;
    }
  };
})();
