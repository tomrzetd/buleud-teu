/* Buleud Teu PWA: cache hanya berkas Buleud Teu, bukan cache proyek lain di github.io.
 * API Apps Script, respons siswa, dan berkas lintas origin tidak pernah masuk Cache Storage.
 */
const PREFIX = 'buleudteu-';
const CACHE = 'buleudteu-v41-marker25';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'js/ljk-spec.js', 'js/ljk-template.js', 'js/ljk-engine.js',
  'js/ljk-ident.js', 'js/app.js',
  'icons/icon-192.png', 'icons/icon-512.png'
];
const BASE = new URL('./', self.registration.scope);
const INDEX = new URL('index.html', BASE).href;
const SHELL_URLS = new Set(SHELL.map(p => new URL(p, BASE).href));

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Cache Storage bersifat per ORIGIN: jangan hapus cache Cikaracak/proyek lain.
    await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;

  const navigation = request.mode === 'navigate';
  // Hindari menyimpan GET lain, termasuk parameter yang mungkin mengandung data.
  const key = new URL(url.pathname, url.origin).href;
  if (!navigation && !SHELL_URLS.has(key)) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok && response.type !== 'opaque') {
        const cache = await caches.open(CACHE);
        // Navigasi selalu di-cache sebagai dokumen utama, bukan per query URL.
        await cache.put(navigation ? INDEX : key, response.clone());
      }
      return response;
    } catch (error) {
      const hit = await caches.match(navigation ? INDEX : key);
      if (hit) return hit;
      // Tidak mengembalikan HTML untuk permintaan JS/CSS/gambar yang gagal.
      throw error;
    }
  })());
});
