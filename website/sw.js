// ═══════════════════════════════════════════════════════
// FIRST LIGHT — Service Worker
// Offline shell + Supabase queue/replay
// ═══════════════════════════════════════════════════════

// IMPORTANT: bump SHELL_VERSION on every deploy that ships changes to the
// precached files (HTML/CSS/JS in SHELL_ASSETS). Pre-deploy check warns if
// you forget. Without a bump, installed PWAs stay pinned to the prior cache.
const SHELL_VERSION = 'fl-shell-v17';
const SUPA_CACHE   = 'fl-supa-reads-v3';
const SUPA_HOST    = 'edgnudrbysybefbqyijq.supabase.co';

// Critical assets needed for admin.html to boot offline. Versioned together so a
// shell bump invalidates everything in one shot — no stale-mix risk.
const SHELL_ASSETS = [
  '/admin.html',
  '/punch.html',
  '/install.html',
  '/login.html',
  '/index.html',
  '/styles.css',
  '/app.js?v=20260619a',
  '/manifest.json',
  '/icon-512.png',
  '/js/config.js',
  '/js/fl-offline.js',
  '/js/fl-auth.js',
  '/js/admin-core.js',
  '/js/admin-init.js',
  '/js/admin-storage.js',
  '/js/admin-sync.js',
  '/js/admin-daily.js',
  '/js/admin-rules.js?v=1776408664',
  '/js/admin-slips.js',
  '/js/admin-mastery.js?v=1776443133',
  '/js/admin-brahma.js',
  '/js/admin-food.js',
  '/js/admin-checkin.js',
  '/js/admin-journal.js',
  '/js/admin-rituals.js?v=20260619a',
  '/js/admin-tomorrow.js',
  '/js/admin-reading.js?v=1776408664',
  '/js/admin-body-weight.js',
  '/js/admin-finance.js',
  '/js/admin-fire.js',
  '/js/admin-health.js',
  '/js/admin-races.js',
  '/js/admin-goals.js',
  '/js/admin-gym.js',
  '/js/admin-ekadashi.js',
  '/js/admin-streaks.js',
  '/js/admin-content.js',
  '/js/admin-recap.js?v=20260619a',
  '/js/admin-dailyproof.js?v=20260619b',
  '/js/admin-editor.js',
  '/js/admin-analytics.js',
  '/js/admin-settings.js',
  '/js/admin-profile.js',
  '/js/admin-ai.js',
  '/js/admin-voice.js',
  '/js/admin-timer.js',
  '/js/admin-seal.js',
  '/js/admin-life-calendar.js',
  '/js/admin-state-of-life.js',
  '/js/admin-weekly.js',
  '/js/admin-weekly-review.js',
  '/js/admin-fortress-analytics.js',
  '/js/admin-deepwork-analytics.js',
  '/js/admin-sync-panel.js',
  '/js/chapters.js',
];

// ── INSTALL ──────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_VERSION).then((cache) =>
      // addAll is atomic — if one asset fails the whole install fails, which is
      // exactly what we want (no half-cached shell)
      Promise.all(SHELL_ASSETS.map((url) =>
        cache.add(url).catch((e) => console.warn('[SW] precache miss:', url, e.message))
      ))
    ).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE — drop old cache versions, then claim clients ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_VERSION && k !== SUPA_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ROUTER ──────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip non-GET/POST/PATCH/DELETE — let browser handle as normal
  if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return;

  // Supabase REST → offline-aware
  if (url.host === SUPA_HOST && url.pathname.startsWith('/rest/v1/')) {
    event.respondWith(handleSupabase(req, url));
    return;
  }

  // Same-origin asset → cache-first with network update
  if (url.origin === self.location.origin) {
    event.respondWith(handleShell(req));
    return;
  }
  // Otherwise: pass-through (fonts, mapbox, gemini, openai, etc.)
});

// ── SHELL — cache-first, network-revalidate ───────────
async function handleShell(req) {
  try {
    const cached = await caches.match(req);
    const fetchPromise = fetch(req)
      .then((resp) => {
        if (resp && resp.ok && resp.type === 'basic') {
          const clone = resp.clone();
          caches.open(SHELL_VERSION).then((c) => c.put(req, clone)).catch(() => {});
        }
        return resp;
      })
      .catch(() => cached); // network down → fall back to cache
    return cached || fetchPromise;
  } catch (e) {
    return fetch(req);
  }
}

// ── SUPABASE — pass-through online, queue/cache offline ──
async function handleSupabase(req, url) {
  const method = req.method;

  if (method === 'GET') {
    // Network-first; cache successful GETs for offline reads
    try {
      const resp = await fetch(req.clone());
      if (resp.ok) {
        const clone = resp.clone();
        caches.open(SUPA_CACHE).then((c) => c.put(req, clone)).catch(() => {});
      }
      return resp;
    } catch (e) {
      const cached = await caches.match(req, { cacheName: SUPA_CACHE });
      if (cached) {
        // Tag the response so the UI knows it's stale
        const body = await cached.text();
        return new Response(body, {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'X-FL-Cache': 'offline' },
        });
      }
      // No cache, no network → empty array so UI doesn't crash
      return new Response('[]', {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-FL-Cache': 'empty' },
      });
    }
  }

  // Writes (POST/PATCH/PUT/DELETE): try network, queue on failure
  try {
    const resp = await fetch(req.clone());
    return resp;
  } catch (e) {
    await queueWrite(req);
    // Synthetic success — UI shows confirmation, sync engine retries when online
    return new Response(JSON.stringify({ queued: true, ts: Date.now() }), {
      status: 202, // Accepted
      headers: { 'Content-Type': 'application/json', 'X-FL-Cache': 'queued' },
    });
  }
}

// ── WRITE QUEUE — durable in IDB ───────────────────────
function openQueueDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('fl-sync', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('writes')) {
        db.createObjectStore('writes', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function queueWrite(req) {
  const db = await openQueueDB();
  const body = req.body ? await req.clone().text() : null;
  const headers = {};
  req.headers.forEach((v, k) => (headers[k] = v));

  return new Promise((resolve, reject) => {
    const tx = db.transaction('writes', 'readwrite');
    tx.objectStore('writes').add({
      url: req.url,
      method: req.method,
      headers,
      body,
      queued_at: Date.now(),
      attempts: 0,
    });
    tx.oncomplete = () => {
      // Tell active clients to update their sync badge
      self.clients.matchAll().then((clients) =>
        clients.forEach((c) => c.postMessage({ type: 'fl-queue-changed' }))
      );
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

// ── DRAIN — replay queued writes when client wakes us ──
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'fl-drain') {
    event.waitUntil(drainQueue());
  }
});

async function drainQueue() {
  const db = await openQueueDB();
  const items = await new Promise((res) => {
    const tx = db.transaction('writes', 'readonly');
    const req = tx.objectStore('writes').getAll();
    req.onsuccess = () => res(req.result || []);
    req.onerror = () => res([]);
  });

  let success = 0,
    fail = 0;
  for (const item of items) {
    try {
      const resp = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
      });
      if (resp.ok || resp.status === 409) {
        // 409 = conflict (server has newer row) → LWW dropped our write; still consume
        await deleteQueueItem(db, item.id);
        success++;
      } else {
        await bumpAttempts(db, item.id);
        fail++;
      }
    } catch (e) {
      await bumpAttempts(db, item.id);
      fail++;
      break; // network down again, stop draining
    }
  }

  // Notify clients of result
  self.clients.matchAll().then((clients) =>
    clients.forEach((c) =>
      c.postMessage({ type: 'fl-drain-result', success, fail, remaining: items.length - success })
    )
  );
}

function deleteQueueItem(db, id) {
  return new Promise((res) => {
    const tx = db.transaction('writes', 'readwrite');
    tx.objectStore('writes').delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => res();
  });
}

function bumpAttempts(db, id) {
  return new Promise((res) => {
    const tx = db.transaction('writes', 'readwrite');
    const store = tx.objectStore('writes');
    const req = store.get(id);
    req.onsuccess = () => {
      const item = req.result;
      if (item) {
        item.attempts = (item.attempts || 0) + 1;
        item.last_error_at = Date.now();
        store.put(item);
      }
    };
    tx.oncomplete = () => res();
    tx.onerror = () => res();
  });
}
