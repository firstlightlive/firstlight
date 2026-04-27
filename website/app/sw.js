// Self-destructing service worker — unregisters itself and clears all caches
self.addEventListener('install', function() { self.skipWaiting(); });
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(k) { return Promise.all(k.map(function(n) { return caches.delete(n); })); })
    .then(function() { return self.registration.unregister(); })
    .then(function() { return self.clients.matchAll(); })
    .then(function(clients) { clients.forEach(function(c) { c.navigate(c.url); }); })
  );
});
self.addEventListener('fetch', function(e) { e.respondWith(fetch(e.request)); });
 
