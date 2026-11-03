/* Buleud Teu service worker: cache aplikasi agar bisa dibuka offline. API (script.google.com) tidak di-cache. */
const CACHE = 'buleudteu-v40-1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'js/ljk-spec.js', 'js/ljk-template.js', 'js/ljk-engine.js', 'js/ljk-ident.js', 'js/app.js', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;           // API & lintas domain: langsung ke jaringan
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));   // jaringan dulu, cadangan cache
});
