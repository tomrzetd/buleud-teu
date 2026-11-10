// Smoke test nyata di Chromium: Buleud Teu dapat dibuka di subpath project Pages,
// setelah reload offline tetap memuat halaman setup dan JS tanpa error runtime.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const WEB = path.resolve(__dirname,'../../web');
const MIME = {'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8',
  '.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const server = http.createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(!u.pathname.startsWith('/buleud-teu/')) {res.writeHead(404).end();return;}
  const rel=decodeURIComponent(u.pathname.slice('/buleud-teu/'.length))||'index.html';
  const file=path.resolve(WEB,rel);
  if(!file.startsWith(WEB+path.sep)) {res.writeHead(403).end();return;}
  fs.readFile(file,(err,data)=>{
    if(err){res.writeHead(404).end('Not found');return;}
    res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream',
      'Cache-Control':'no-cache'}).end(data);
  });
});
(async()=>{
  await new Promise(res=>server.listen(0,'127.0.0.1',res));
  const port=server.address().port;
  const browser=await chromium.launch({headless:true});
  try{
    const ctx=await browser.newContext({serviceWorkers:'allow'});
    const page=await ctx.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const url='http://127.0.0.1:'+port+'/buleud-teu/';
    await page.goto(url,{waitUntil:'load'});
    await page.locator('#scr-setup.on').waitFor();
    assert.equal(await page.title(),'Buleud Teu — Scan LJK');
    await page.evaluate(()=>navigator.serviceWorker.ready);
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    const current=await page.evaluate(async()=>caches.keys());
    assert(current.some(s=>s.startsWith('buleudteu-')),'cache PWA belum terbentuk');

    await ctx.setOffline(true);
    await page.reload({waitUntil:'load'});
    await page.locator('#scr-setup.on').waitFor();
    const scripts=await page.evaluate(()=>({
      app: typeof window.App,
      engine: typeof window.LJKEngine,
      spec: typeof window.LJKSpec,
      controller:!!navigator.serviceWorker.controller
    }));
    assert.equal(scripts.app,'object','App tidak siap offline');
    assert.equal(scripts.spec,'object','LJKSpec tidak siap offline');
    assert(scripts.controller,'SW tidak mengendalikan halaman');
    assert.deepEqual(errors,[],'JavaScript runtime error: '+errors.join(' | '));
    console.log('OK: project subpath, home, service worker, offline reload, JavaScript');
    await ctx.close();
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
