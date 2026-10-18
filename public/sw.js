// Minimal service worker: just enough for installability (PWABuilder/Android
// package generation requires one registered). Network-first, no aggressive
// caching, since the site is dynamic (live orders, stock, login sessions).
const CACHE_NAME = 'codex-shell-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
