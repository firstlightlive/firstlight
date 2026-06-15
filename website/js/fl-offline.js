// ═══════════════════════════════════════════════════════
// FIRST LIGHT — Offline Runtime
// ─────────────────────────────────────────────────────────
// Loads in admin.html before the admin-* modules. Owns:
//  • service worker registration
//  • IndexedDB (separate from sw.js' fl-sync — this one caches per-row reads)
//  • flFetch / flUpsert wrappers modules can opt into
//  • device_id (one per install, used as LWW tiebreak)
//  • online/offline events → trigger queue drain
//  • status indicator badge (top-right)
//  • Supabase Realtime subscription so other devices' writes flow in live
// ═══════════════════════════════════════════════════════

(function () {
  'use strict';

  const FL_DB_NAME = 'fl-cache';
  const FL_DB_VER  = 1;
  const DEVICE_ID_KEY = 'fl_device_id';

  // ── device id (LWW tiebreak, also useful for diagnostics) ──
  function getDeviceId() {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      const bytes = new Uint8Array(8);
      crypto.getRandomValues(bytes);
      id = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  }

  const DEVICE_ID = getDeviceId();

  // ── IDB ─────────────────────────────────────────────
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(FL_DB_NAME, FL_DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('rows')) {
          // composite key: table + row id → unique per logical row
          const s = db.createObjectStore('rows', { keyPath: 'pk' });
          s.createIndex('by_table', 'table', { unique: false });
          s.createIndex('dirty', 'dirty', { unique: false });
        }
        if (!db.objectStoreNames.contains('conflicts')) {
          db.createObjectStore('conflicts', { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function tx(db, store, mode) {
    return db.transaction(store, mode).objectStore(store);
  }

  async function idbPut(store, value) {
    const db = await openDB();
    return new Promise((res, rej) => {
      const t = db.transaction(store, 'readwrite');
      t.objectStore(store).put(value);
      t.oncomplete = () => res(value);
      t.onerror = () => rej(t.error);
    });
  }

  async function idbGet(store, key) {
    const db = await openDB();
    return new Promise((res) => {
      const t = db.transaction(store, 'readonly');
      const r = t.objectStore(store).get(key);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => res(null);
    });
  }

  async function idbAll(store, indexName, indexValue) {
    const db = await openDB();
    return new Promise((res) => {
      const t = db.transaction(store, 'readonly');
      const s = t.objectStore(store);
      const src = indexName ? s.index(indexName) : s;
      const r = indexValue !== undefined ? src.getAll(indexValue) : src.getAll();
      r.onsuccess = () => res(r.result || []);
      r.onerror = () => res([]);
    });
  }

  // ── Queue DB (shared with sw.js) — counted for status badge ──
  async function queueSize() {
    return new Promise((res) => {
      const req = indexedDB.open('fl-sync', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('writes')) {
          db.createObjectStore('writes', { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => {
        try {
          const db = req.result;
          const t = db.transaction('writes', 'readonly');
          const r = t.objectStore('writes').count();
          r.onsuccess = () => res(r.result || 0);
          r.onerror = () => res(0);
        } catch (e) { res(0); }
      };
      req.onerror = () => res(0);
    });
  }

  // ── Status indicator (top-right pill) ────────────────
  function ensureStatusEl() {
    let el = document.getElementById('fl-sync-status');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'fl-sync-status';
    el.style.cssText = `
      position:fixed;top:14px;right:14px;z-index:9999;
      font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:600;letter-spacing:1.2px;
      padding:6px 10px;border-radius:14px;cursor:pointer;user-select:none;
      background:rgba(0,212,255,0.10);border:1px solid rgba(0,212,255,0.3);color:#00D4FF;
      backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
      box-shadow:0 2px 8px rgba(0,0,0,0.3);transition:all .25s ease;
      -webkit-tap-highlight-color:transparent;touch-action:manipulation;
    `;
    el.innerHTML = '<span id="fl-sync-dot">●</span> <span id="fl-sync-text">ONLINE · SYNCED</span>';
    el.addEventListener('click', toggleStatusPanel);
    document.body.appendChild(el);

    // detail panel (drops down below the pill)
    const panel = document.createElement('div');
    panel.id = 'fl-sync-panel';
    panel.style.cssText = `
      position:fixed;top:46px;right:14px;z-index:9998;
      width:260px;padding:12px;border-radius:10px;
      background:#0F1218;border:1px solid rgba(0,212,255,0.18);color:#F0EDE5;
      font-family:'IBM Plex Mono',monospace;font-size:10px;line-height:1.6;
      box-shadow:0 8px 32px rgba(0,0,0,0.5);
      display:none;
    `;
    panel.innerHTML = `
      <div style="font-size:9px;letter-spacing:2px;color:#00D4FF;margin-bottom:8px">SYNC ENGINE</div>
      <div>Device: <span id="fl-dev-id" style="color:#F5A623">—</span></div>
      <div>Pending: <span id="fl-pending" style="color:#00E676">0</span></div>
      <div>Conflicts: <span id="fl-conflicts" style="color:#FF5252">0</span></div>
      <div>Last drain: <span id="fl-last-drain" style="color:#8a9aa8">—</span></div>
      <div style="margin-top:10px;display:flex;gap:6px">
        <button id="fl-drain-btn" style="flex:1;background:#00D4FF;color:#0A0C10;border:none;padding:6px;border-radius:4px;font:600 9px 'IBM Plex Mono',monospace;letter-spacing:1px;cursor:pointer">DRAIN NOW</button>
        <button id="fl-clear-btn" style="flex:1;background:transparent;color:#FF5252;border:1px solid rgba(255,82,82,.4);padding:6px;border-radius:4px;font:600 9px 'IBM Plex Mono',monospace;letter-spacing:1px;cursor:pointer">CLEAR LOCAL</button>
      </div>
    `;
    document.body.appendChild(panel);

    panel.querySelector('#fl-dev-id').textContent = DEVICE_ID.slice(0, 8);
    panel.querySelector('#fl-drain-btn').addEventListener('click', drainNow);
    panel.querySelector('#fl-clear-btn').addEventListener('click', clearLocal);

    return el;
  }

  function toggleStatusPanel() {
    const panel = document.getElementById('fl-sync-panel');
    if (!panel) return;
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
    refreshStatus();
  }

  async function refreshStatus() {
    const online = navigator.onLine;
    const pending = await queueSize();
    const conflicts = (await idbAll('conflicts')).length;

    const el = document.getElementById('fl-sync-status');
    const dot = document.getElementById('fl-sync-dot');
    const text = document.getElementById('fl-sync-text');
    if (!el) return;

    if (!online && pending === 0) {
      el.style.background = 'rgba(245,166,35,0.12)';
      el.style.border = '1px solid rgba(245,166,35,0.4)';
      el.style.color = '#F5A623';
      dot.textContent = '◐';
      text.textContent = 'OFFLINE · SYNCED';
    } else if (!online && pending > 0) {
      el.style.background = 'rgba(245,166,35,0.18)';
      el.style.border = '1px solid rgba(245,166,35,0.5)';
      el.style.color = '#F5A623';
      dot.textContent = '◐';
      text.textContent = `OFFLINE · ${pending} PENDING`;
    } else if (pending > 0) {
      el.style.background = 'rgba(0,212,255,0.15)';
      el.style.border = '1px solid rgba(0,212,255,0.4)';
      el.style.color = '#00D4FF';
      dot.textContent = '⟳';
      text.textContent = `SYNCING · ${pending}`;
    } else {
      el.style.background = 'rgba(0,230,118,0.12)';
      el.style.border = '1px solid rgba(0,230,118,0.4)';
      el.style.color = '#00E676';
      dot.textContent = '●';
      text.textContent = 'ONLINE · SYNCED';
    }

    const p = document.getElementById('fl-pending');
    const c = document.getElementById('fl-conflicts');
    if (p) p.textContent = String(pending);
    if (c) c.textContent = String(conflicts);
  }

  async function drainNow() {
    if (!navigator.serviceWorker.controller) return;
    navigator.serviceWorker.controller.postMessage({ type: 'fl-drain' });
  }

  async function clearLocal() {
    if (!confirm('Clear local cache + pending queue? Unsynced changes will be lost.')) return;
    try {
      indexedDB.deleteDatabase('fl-cache');
      indexedDB.deleteDatabase('fl-sync');
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      alert('Local cache cleared. Reload the page.');
    } catch (e) { alert('Clear failed: ' + e.message); }
  }

  // ── flFetch — modules use this in place of fetch() for Supabase reads ──
  async function flFetch(url, opts) {
    const r = await fetch(url, opts);
    if (r.headers && r.headers.get && r.headers.get('X-FL-Cache') === 'offline') {
      // tag this for the UI if it cares (admin-* can check r.flStale)
      r.flStale = true;
    }
    return r;
  }

  // ── flUpsert — write helper with LWW envelope ──
  //
  // Usage from an admin-* module:
  //    await FL.upsert('slips', { id: 'uuid', date: '2026-06-15', reason: 'late' });
  //
  // Auto-attaches updated_at + device_id. Online → straight POST/PATCH.
  // Offline → SW queues it, returns synthetic 202, drains on reconnect.
  async function flUpsert(table, row, opts) {
    opts = opts || {};
    const SUPA_URL = (window.FL && window.FL.SUPABASE_URL) || localStorage.getItem('fl_supabase_url');
    const SUPA_KEY = (window.FL && window.FL.SUPABASE_ANON_KEY) || localStorage.getItem('fl_supabase_key');
    if (!SUPA_URL || !SUPA_KEY) throw new Error('flUpsert: SUPA URL/KEY missing');

    const payload = Object.assign({}, row, {
      updated_at: new Date().toISOString(),
      device_id: DEVICE_ID,
    });

    const url = SUPA_URL + '/rest/v1/' + table + (opts.upsert !== false ? '?on_conflict=' + (opts.onConflict || 'id') : '');
    const headers = {
      'apikey': SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=representation',
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    // mirror to IDB cache so reads while offline see this row
    try {
      await idbPut('rows', {
        pk: table + ':' + (row.id || row.date || JSON.stringify(row).slice(0, 64)),
        table,
        row: payload,
        updated_at: payload.updated_at,
        device_id: DEVICE_ID,
        dirty: resp.status === 202 ? 1 : 0,
      });
    } catch (_) {}

    // tickle the status indicator
    setTimeout(refreshStatus, 50);
    return resp;
  }

  // ── REALTIME live sync (when online) ──
  //
  // Subscribes to all sync tables. Other devices' writes land in IDB + emit
  // a 'fl-row' event modules can listen to so the UI refreshes instantly.
  let _realtime = null;
  function startRealtime() {
    if (_realtime || !navigator.onLine) return;
    const SUPA_URL = (window.FL && window.FL.SUPABASE_URL);
    const SUPA_KEY = (window.FL && window.FL.SUPABASE_ANON_KEY);
    if (!SUPA_URL) return;

    try {
      const wsUrl = SUPA_URL.replace('https://', 'wss://') + '/realtime/v1/websocket?apikey=' + SUPA_KEY + '&vsn=1.0.0';
      _realtime = new WebSocket(wsUrl);
      _realtime.onopen = () => {
        const sub = {
          topic: 'realtime:public',
          event: 'phx_join',
          payload: { config: { postgres_changes: [{ event: '*', schema: 'public' }] } },
          ref: '1',
        };
        _realtime.send(JSON.stringify(sub));
        console.log('[FL] Realtime subscribed');
      };
      _realtime.onmessage = (e) => {
        try {
          const m = JSON.parse(e.data);
          if (m.event === 'postgres_changes' && m.payload && m.payload.data) {
            const d = m.payload.data;
            if (d.record && d.record.device_id === DEVICE_ID) return; // skip our own echo
            window.dispatchEvent(new CustomEvent('fl-row', { detail: { table: d.table, record: d.record, op: d.type } }));
          }
        } catch (_) {}
      };
      _realtime.onerror = () => { _realtime = null; setTimeout(startRealtime, 5000); };
      _realtime.onclose = () => { _realtime = null; };
    } catch (e) { console.warn('[FL] Realtime failed:', e); }
  }

  // ── SW registration + event wiring ──
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').then(
      (reg) => { console.log('[FL] SW registered:', reg.scope); },
      (err) => { console.warn('[FL] SW failed:', err); }
    );

    navigator.serviceWorker.addEventListener('message', (event) => {
      const m = event.data || {};
      if (m.type === 'fl-queue-changed') refreshStatus();
      if (m.type === 'fl-drain-result') {
        const ld = document.getElementById('fl-last-drain');
        if (ld) ld.textContent = `${m.success} ok · ${m.fail} fail`;
        refreshStatus();
      }
    });
  }

  // ── boot ───────────────────────────────────────────
  function boot() {
    ensureStatusEl();
    registerSW();
    refreshStatus();
    setTimeout(startRealtime, 1500);

    window.addEventListener('online', () => {
      refreshStatus();
      drainNow();
      startRealtime();
    });
    window.addEventListener('offline', () => {
      refreshStatus();
      if (_realtime) { try { _realtime.close(); } catch (_) {} _realtime = null; }
    });

    // Periodic light poll — covers iOS Safari which is stingy with online events
    setInterval(() => { if (navigator.onLine) drainNow(); refreshStatus(); }, 30000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // ── public API ─────────────────────────────────────
  window.FL = window.FL || {};
  window.FL.deviceId = DEVICE_ID;
  window.FL.fetch    = flFetch;
  window.FL.upsert   = flUpsert;
  window.FL.drainNow = drainNow;
  window.FL.queueSize = queueSize;
  window.FL.refreshStatus = refreshStatus;
})();
