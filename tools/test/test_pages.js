// Uji mandiri deployment GitHub Pages dan perilaku SW; tanpa paket NPM/layanan eksternal.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '../..');
const WEB = path.join(ROOT, 'web');
const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
const worker = fs.readFileSync(path.join(WEB, 'sw.js'), 'utf8');
const base = 'https://tomrzetd.github.io/buleud-teu/';
const toUrl = (v) => new URL(v, base).href;
const local = [...html.matchAll(/<script\s+src="([^"]+)"|<link\s+[^>]*href="([^"]+)"/g)]
  .map(m => m[1] || m[2])
  .filter(v => !/^https?:\/\//.test(v));
for (const link of local) {
  assert(!link.startsWith('/'), 'Path asset tidak boleh root-absolute pada project Pages: ' + link);
  assert(fs.existsSync(path.join(WEB, link)), 'Asset HTML hilang: ' + link);
}
assert(html.includes('id="scr-setup"'), 'Layar awal koneksi Apps Script tidak ada');

const eventMap = {};
const maps = new Map();
function fakeCache(name) {
  if (!maps.has(name)) maps.set(name, new Map());
  const data = maps.get(name);
  return {
    async addAll(names) {
      for (const file of names) {
        const u = toUrl(file);
        const rel = decodeURI(new URL(u).pathname.replace('/buleud-teu/', ''));
        if (rel) assert(fs.existsSync(path.join(WEB, rel)), 'Precache hilang: ' + rel);
        data.set(u, { source: file, type: 'basic' });
      }
    },
    async put(key, response) { data.set(String(key), response); }
  };
}
const caches = {
  async open(key) { return fakeCache(key); },
  async keys() { return [...maps.keys()]; },
  async delete(key) { return maps.delete(key); },
  async match(key) {
    for (const data of maps.values()) if (data.has(String(key))) return data.get(String(key));
    return undefined;
  }
};
let claimed = false, skipped = false;
const context = vm.createContext({
  URL, Set, caches,
  fetch: async () => { throw new Error('Offline'); },
  self: {
    registration: { scope: base },
    addEventListener: (name, fn) => eventMap[name] = fn,
    skipWaiting: async () => { skipped = true; },
    clients: { claim: async () => { claimed = true; } }
  }
});
vm.runInContext(worker, context, { filename: 'web/sw.js' });
const shell = vm.runInContext('SHELL', context);
for (const asset of shell) {
  assert(!asset.startsWith('/'), 'Precache root-absolute: ' + asset);
  const rel = new URL(asset, base).pathname.replace('/buleud-teu/', '');
  if (rel) assert(fs.existsSync(path.join(WEB, rel)), 'Asset precache hilang: ' + asset);
}

async function dispatch(type, event = {}) {
  let promise;
  event.waitUntil = p => { promise = p; };
  eventMap[type](event);
  if (promise) await promise;
}
async function request(url, mode = 'same-origin') {
  let handled = false, response;
  eventMap.fetch({
    request: { method: 'GET', url, mode },
    respondWith: p => { handled = true; response = p; }
  });
  return { handled, response };
}
(async () => {
  maps.set('cikaracak-0.6.0', new Map([['unchanged', 1]]));
  maps.set('buleudteu-v40-1', new Map([['old', 1]]));
  await dispatch('install');
  assert(skipped, 'SW install harus memanggil skipWaiting');
  await dispatch('activate');
  assert(claimed, 'SW activate harus memanggil clients.claim');
  assert(!maps.has('buleudteu-v40-1'), 'Versi cache lama harus dibersihkan');
  assert(maps.has('cikaracak-0.6.0'), 'Cache Cikaracak tidak boleh dihapus');

  const offlinePage = await request(base + '?uji=offline', 'navigate');
  assert(offlinePage.handled, 'Dokumen Pages harus ditangani SW');
  assert.equal((await offlinePage.response).source, 'index.html', 'Offline harus kembali ke dokumen aplikasi');
  const js = await request(base + 'js/app.js');
  assert(js.handled, 'Script aplikasi harus tersedia offline');
  assert.equal((await js.response).source, 'js/app.js');
  assert(!(await request(base + 'file-tidak-ada.js')).handled, 'Asset tak dikenal jangan dialihkan ke HTML');
  assert(!(await request('https://tomrzetd.github.io/cikaracak/')).handled, 'Path proyek lain jangan diintersep');
  assert(!(await request('https://script.google.com/macros/s/xxx/exec')).handled, 'API Apps Script jangan di-cache');

  // Jika asset inti hilang saat offline, jangan salah memberi HTML sebagai berkas JS.
  maps.get('buleudteu-v40-pages2').delete(base + 'js/app.js');
  await assert.rejects((await request(base + 'js/app.js')).response, /Offline/);

  console.log('OK: GitHub Pages paths, asset, pre-cache, offline, isolasi Cikaracak/API');
})().catch(e => { console.error(e); process.exitCode = 1; });
