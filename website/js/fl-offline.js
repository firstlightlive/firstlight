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
        <button id="fl-drain-btn"     style="flex:1;background:#00D4FF;color:#0A0C10;border:none;padding:6px;border-radius:4px;font:600 9px 'IBM Plex Mono',monospace;letter-spacing:1px;cursor:pointer">DRAIN NOW</button>
        <button id="fl-inspect-btn"   style="flex:1;background:transparent;color:#F5A623;border:1px solid rgba(245,166,35,.4);padding:6px;border-radius:4px;font:600 9px 'IBM Plex Mono',monospace;letter-spacing:1px;cursor:pointer">VIEW QUEUE</button>
      </div>
      <div style="margin-top:6px;display:flex;gap:6px">
        <button id="fl-prefetch-btn" style="flex:1;background:transparent;color:#00D4FF;border:1px solid rgba(0,212,255,.4);padding:6px;border-radius:4px;font:600 9px 'IBM Plex Mono',monospace;letter-spacing:1px;cursor:pointer">WARM CACHE</button>
        <button id="fl-clear-btn"    style="flex:1;background:transparent;color:#FF5252;border:1px solid rgba(255,82,82,.4);padding:6px;border-radius:4px;font:600 9px 'IBM Plex Mono',monospace;letter-spacing:1px;cursor:pointer">CLEAR LOCAL</button>
      </div>
      <div id="fl-inspector" style="display:none;margin-top:10px;border-top:1px solid rgba(255,255,255,0.08);padding-top:8px;max-height:280px;overflow-y:auto">
        <div style="font-size:8px;letter-spacing:1.5px;color:#8a9aa8;margin-bottom:6px">QUEUE INSPECTOR</div>
        <div id="fl-inspector-rows" style="display:flex;flex-direction:column;gap:6px"></div>
      </div>
    `;
    document.body.appendChild(panel);

    panel.querySelector('#fl-dev-id').textContent = DEVICE_ID.slice(0, 8);
    panel.querySelector('#fl-drain-btn').addEventListener('click', drainNow);
    panel.querySelector('#fl-clear-btn').addEventListener('click', clearLocal);
    panel.querySelector('#fl-prefetch-btn').addEventListener('click', async () => {
      const btn = panel.querySelector('#fl-prefetch-btn');
      btn.textContent = '⏳ WARMING...';
      await prefetchAllTables(true);
      btn.textContent = '✓ WARMED';
      setTimeout(() => { btn.textContent = 'WARM CACHE'; }, 1500);
    });
    panel.querySelector('#fl-inspect-btn').addEventListener('click', toggleInspector);

    return el;
  }

  // ── QUEUE INSPECTOR ──
  let _inspectorOpen = false;
  async function toggleInspector() {
    _inspectorOpen = !_inspectorOpen;
    const wrap = document.getElementById('fl-inspector');
    if (!wrap) return;
    wrap.style.display = _inspectorOpen ? 'block' : 'none';
    if (_inspectorOpen) await renderInspector();
  }

  async function getQueueItems() {
    return new Promise((res) => {
      const req = indexedDB.open('fl-sync', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('writes')) db.createObjectStore('writes', { keyPath: 'id', autoIncrement: true });
      };
      req.onsuccess = () => {
        try {
          const db = req.result;
          const t = db.transaction('writes', 'readonly');
          const r = t.objectStore('writes').getAll();
          r.onsuccess = () => res(r.result || []);
          r.onerror  = () => res([]);
        } catch (_) { res([]); }
      };
      req.onerror = () => res([]);
    });
  }

  async function deleteQueueItem(id) {
    return new Promise((res) => {
      const req = indexedDB.open('fl-sync', 1);
      req.onsuccess = () => {
        try {
          const db = req.result;
          const t = db.transaction('writes', 'readwrite');
          t.objectStore('writes').delete(id);
          t.oncomplete = () => res(true);
          t.onerror    = () => res(false);
        } catch (_) { res(false); }
      };
      req.onerror = () => res(false);
    });
  }

  async function retryOneItem(item) {
    try {
      const resp = await fetch(item.url, { method: item.method, headers: item.headers, body: item.body });
      if (resp.ok || resp.status === 409) {
        await deleteQueueItem(item.id);
        return { ok: true };
      }
      return { ok: false, status: resp.status };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  function tableFromUrl(url) {
    try {
      const u = new URL(url);
      const m = u.pathname.match(/\/rest\/v1\/([^?\/]+)/);
      return m ? m[1] : u.pathname;
    } catch (_) { return '?'; }
  }
  function payloadPreview(body) {
    if (!body) return '';
    try {
      const j = JSON.parse(body);
      const keys = Object.keys(j).slice(0, 4);
      return keys.map((k) => k + ':' + String(j[k]).slice(0, 16)).join(' · ');
    } catch (_) { return String(body).slice(0, 64); }
  }

  async function renderInspector() {
    const rows = document.getElementById('fl-inspector-rows');
    if (!rows) return;
    const items = await getQueueItems();
    rows.innerHTML = '';
    if (!items.length) {
      rows.innerHTML = '<div style="font-size:9px;color:#8a9aa8;padding:8px;text-align:center">Queue empty</div>';
      return;
    }
    items.slice(0, 50).forEach((it) => {
      const row = document.createElement('div');
      row.style.cssText = 'padding:6px 8px;background:rgba(255,255,255,0.03);border-left:2px solid #F5A623;border-radius:4px;font-size:9px;line-height:1.45';
      const tbl = tableFromUrl(it.url);
      const age = Math.floor((Date.now() - (it.queued_at || Date.now())) / 1000);
      const ageStr = age < 60 ? age + 's' : age < 3600 ? Math.floor(age/60) + 'm' : Math.floor(age/3600) + 'h';
      row.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="color:#00D4FF;font-weight:700">${tbl}</span>
          <span style="color:#8a9aa8;font-size:8px">${it.method} · ${ageStr}${it.attempts ? ' · ' + it.attempts + ' tries' : ''}</span>
        </div>
        <div style="color:#B6BFCB;margin-top:2px;word-break:break-all">${payloadPreview(it.body)}</div>
        <div style="margin-top:5px;display:flex;gap:5px">
          <button data-act="retry" data-id="${it.id}" style="flex:1;background:transparent;color:#00E676;border:1px solid rgba(0,230,118,.35);padding:3px;border-radius:3px;font:600 8px 'IBM Plex Mono',monospace;letter-spacing:1px;cursor:pointer">RETRY</button>
          <button data-act="drop"  data-id="${it.id}" style="flex:1;background:transparent;color:#FF5252;border:1px solid rgba(255,82,82,.35);padding:3px;border-radius:3px;font:600 8px 'IBM Plex Mono',monospace;letter-spacing:1px;cursor:pointer">DISCARD</button>
        </div>
      `;
      rows.appendChild(row);
    });
    if (items.length > 50) {
      const more = document.createElement('div');
      more.style.cssText = 'font-size:9px;color:#8a9aa8;padding:6px;text-align:center';
      more.textContent = `+ ${items.length - 50} more not shown`;
      rows.appendChild(more);
    }
    // Wire the per-row actions
    rows.querySelectorAll('button[data-act]').forEach((b) => {
      b.addEventListener('click', async () => {
        const id = parseInt(b.dataset.id, 10);
        const act = b.dataset.act;
        b.disabled = true;
        b.textContent = act === 'retry' ? '⏳' : '✕';
        if (act === 'drop') {
          await deleteQueueItem(id);
        } else {
          const all = await getQueueItems();
          const item = all.find((x) => x.id === id);
          if (item) await retryOneItem(item);
        }
        await renderInspector();
        await refreshStatus();
      });
    });
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

  // ── PREFETCH — warm offline cache for all sync tables ──
  //
  // SW caches successful GET responses by URL. We prefetch broad queries here so
  // every module's typical read paths hit cache when offline. Fires on boot (if
  // online) + every 'online' event + once per hour while online.

  const PREFETCH_QUERIES = [
    // table, query string, label
    ['daily_logs',           '?select=*&order=date.desc&limit=120',                       'daily 120d'],
    ['slips',                '?select=*&order=date.desc&limit=300',                       'slips 300'],
    ['mastery_log',          '?select=*&order=date.desc&limit=120',                       'mastery 120d'],
    ['sleep_log',            '?select=*&order=date.desc&limit=120',                       'sleep 120d'],
    ['proof_archive',        '?select=*&order=date.desc&limit=120',                       'proof 120d'],
    ['strava_activities',    '?select=*&order=start_date_local.desc&limit=500',           'strava 500'],
    ['expense_log',          '?select=*&order=date.desc&limit=300',                       'expense 300'],
    ['income_log',           '?select=*&order=date.desc&limit=200',                       'income 200'],
    ['investment_log',       '?select=*&order=date.desc&limit=200',                       'investment 200'],
    ['reading_log',          '?select=*&order=date.desc&limit=200',                       'reading 200'],
    ['tomorrow_plan',        '?select=*&order=date.desc&limit=60',                        'tomorrow 60d'],
    ['health_daily',         '?select=*&order=date.desc&limit=120',                       'health 120d'],
    ['instagram_posts',      '?select=*&order=created_at.desc&limit=100',                 'ig 100'],
    ['config',               '?select=*',                                                 'config all'],
    ['finance_budgets',      '?select=*',                                                 'budgets'],
    ['finance_annual_budgets','?select=*',                                                'annual budgets'],
    ['finance_networth',     '?select=*&order=date.desc&limit=120',                       'networth 120d'],
    ['finance_recurring',    '?select=*',                                                 'recurring'],
    ['finance_fire_config',  '?select=*',                                                 'fire config'],
  ];

  let _lastPrefetchAt = 0;
  const PREFETCH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

  async function prefetchAllTables(force) {
    if (!navigator.onLine) return;
    if (!force && (Date.now() - _lastPrefetchAt) < PREFETCH_INTERVAL_MS) return;

    const SUPA_URL = (window.FL && window.FL.SUPABASE_URL);
    const SUPA_KEY = (window.FL && window.FL.SUPABASE_ANON_KEY);
    if (!SUPA_URL || !SUPA_KEY) return;

    _lastPrefetchAt = Date.now();
    let ok = 0, fail = 0;

    // Run sequentially-ish (3 at a time) so we don't hammer the API.
    const queue = [...PREFETCH_QUERIES];
    const CONCURRENCY = 3;
    async function worker() {
      while (queue.length) {
        const [table, qs, label] = queue.shift();
        const url = `${SUPA_URL}/rest/v1/${table}${qs}`;
        try {
          const r = await fetch(url, {
            headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY },
          });
          if (r.ok) ok++; else fail++;
        } catch (_) { fail++; }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    console.log(`[FL Prefetch] ${ok} ok · ${fail} fail`);
    // notify UI
    const ld = document.getElementById('fl-last-drain');
    // (we reuse the same field; rename later if we add more granular telemetry)
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
    // Warm offline cache once the auth gate has cleared
    window.addEventListener('fl-unlocked', () => { setTimeout(() => prefetchAllTables(true), 800); });
    // Also try shortly after boot in case gate is already gone
    setTimeout(() => prefetchAllTables(false), 2500);

    window.addEventListener('online', () => {
      refreshStatus();
      drainNow();
      startRealtime();
      prefetchAllTables(true);
    });
    window.addEventListener('offline', () => {
      refreshStatus();
      if (_realtime) { try { _realtime.close(); } catch (_) {} _realtime = null; }
    });

    // Periodic light poll — covers iOS Safari which is stingy with online events
    setInterval(() => {
      if (navigator.onLine) drainNow();
      refreshStatus();
      prefetchAllTables(false); // honors PREFETCH_INTERVAL_MS internally
    }, 30000);
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
  window.FL.prefetchAll = (force) => prefetchAllTables(!!force);
})();
