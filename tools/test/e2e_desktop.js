// E2E Buleud Teu Desktop: server tiruan Apps Script (Code.gs asli, balasan 302 seperti Google) + UI Swing di Xvfb
// mode -Dbt.autotest: pilih ujian -> pantau folder -> berkas hasil scan ADF masuk -> proses + OCR -> rekomendasi/cari -> simpan semua.
// Pemakaian: node tools/test/e2e_desktop.js   (butuh: gen_scans.py; BT_DESKTOP=perintah aplikasi, bawaan java -cp /tmp/bt-cp)
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), assert = require('assert');
const { createGas } = require('./gas_mock.js');
const SC = path.join(__dirname, 'scans'), meta = JSON.parse(fs.readFileSync(path.join(SC, 'meta.json'))).marker40;
const NAMES = [['IBNU BIN LADEN', '9A'], ['SITI AMINAH', '9A'], ['ASEP SURYANA', '9B'], ['DEDE KOMALA', '9B'], ['RINA MARLINA', '9A'], ['UJANG SOLIHIN', '9C'], ['NENG ELIS', '9C']];
const gas = createGas(), { ss } = gas;
gas.ctx.setup();
ss.getSheetByName('Sekolah').getRange(1, 2, 8, 1).setValues([['SMP NEGERI 2 JALAKSANA'], ['20212345'], ['SMP'], ['Jl. Raya'], ['Kuningan'], ['Dra. Kepala'], [''], ['2026/2027']]);
ss.getSheetByName('Sekolah').getRange(10, 2).setValue(mintLicense());
ss.getSheetByName('Guru').appendRow(['NURHAYATI', '', '1234', 'IPA', '9A, 9B, 9C', 'Ya']);
for (const [n, k] of NAMES.concat([['IBNU SINA', '9A'], ['SITI NURHALIZA', '9B'], ['ASEP SUNANDAR', '9C']])) ss.getSheetByName('Siswa').appendRow(['', '', '', n, k, '', 'L']);
const tok = gas.POST({ action: 'login', guru: 'NURHAYATI', pin: '1234' }).token;
const ex = gas.POST({ action: 'saveExam', token: tok, exam: { nama: 'PSAS GANJIL IPA', mapel: 'IPA', kelas: ['9A', '9B', '9C'], opsi: 'ABCD', kunci: meta.kunci, kktp: 75 } });
assert(!ex.error, ex.error);
// server: POST -> 302 -> GET /echo (perilaku Web App Google)
const pending = new Map(); let seq = 0; const calls = [];
const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (req.method === 'POST') { let b = ''; req.on('data', d => b += d); req.on('end', () => { const id = 'r' + (++seq); calls.push('POST ' + JSON.parse(b).action); pending.set(id, gas.doPost(b)); res.writeHead(302, { Location: `http://127.0.0.1:${srv.address().port}/echo?id=${id}` }); res.end(); }); return; }
    if (u.pathname === '/echo') { const body = pending.get(u.searchParams.get('id')); pending.delete(u.searchParams.get('id')); res.writeHead(200, { 'content-type': 'application/json' }); res.end(body); return; }
    calls.push('GET ' + u.searchParams.get('action')); res.writeHead(200, { 'content-type': 'application/json' }); res.end(gas.doGet(Object.fromEntries(u.searchParams)));
});
srv.listen(0, '127.0.0.1', () => {
    const port = srv.address().port, tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'btd-')), cfg = path.join(tmp, 'cfg', 'buleudteu'), watch = path.join(tmp, 'masuk'), out = path.join(__dirname, 'shots', 'desktop');
    fs.mkdirSync(cfg, { recursive: true }); fs.mkdirSync(watch); fs.rmSync(out, { recursive: true, force: true });
    fs.writeFileSync(path.join(cfg, 'pengaturan.properties'), [`api=http\\://127.0.0.1\\:${port}/exec`, `token=${tok}`, 'guru=NURHAYATI', 'source=folder', `watchDir=${watch.replace(/\\/g, '\\\\').replace(/:/g, '\\:')}`, 'dpi=200', 'ocr=1'].join('\n'));
    const names = {}; meta.halaman.forEach((h, i) => names[h.label] = NAMES[i][0]); fs.writeFileSync(path.join(tmp, 'names.json'), JSON.stringify(names));
    const props = [`-Dbt.autotest=${out}`, `-Dbt.expect=${meta.halaman.length}`, `-Dbt.names=${path.join(tmp, 'names.json')}`];
    const cmd = process.env.BT_DESKTOP ? process.env.BT_DESKTOP.split(' ') : ['java', ...props, '-cp', fs.readFileSync('/tmp/bt-cp', 'utf8').trim(), 'id.buleudteu.desktop.MainKt'];
    const env = Object.assign({}, process.env, { XDG_CONFIG_HOME: path.join(tmp, 'cfg'), JAVA_OPTS: props.join(' ') });
    const p = cp.spawn('xvfb-run', ['-a', '-s', '-screen 0 1400x800x24', ...cmd], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', d => process.stdout.write(d)); p.stderr.on('data', d => { const t = d.toString(); if (!/JAVA_TOOL|^\s*$/.test(t)) process.stderr.write(t); });
    // salin hasil "scan" setelah aplikasi siap memantau (seperti software scanner menyimpan satu per satu)
    const iv = setInterval(() => {
        if (!fs.existsSync(path.join(out, 'siap_pantau'))) return; clearInterval(iv);
        let i = 0; const files = fs.readdirSync(path.join(SC, 'marker40')).sort();
        const next = () => { if (i >= files.length) return; fs.copyFileSync(path.join(SC, 'marker40', files[i]), path.join(watch, files[i])); i++; setTimeout(next, 700); }; next();
    }, 300);
    p.on('exit', (code) => {
        srv.close();
        assert.strictEqual(code, 0, 'aplikasi keluar dengan kode ' + code);
        const rep = JSON.parse(fs.readFileSync(path.join(out, 'laporan.json')));
        const hs = ss.getSheetByName('HasilScan'), rows = hs.getLastRow() > 1 ? hs.getRange(2, 1, hs.getLastRow() - 1, 14).getValues() : [];
        console.log('Baris HasilScan:', rows.length); rows.forEach(r => console.log('  ' + r.slice(0, 12).join(' | ')));
        let ok = 0;
        for (const h of meta.halaman) { const r = rep.hasil.find(x => x.halaman === h.label); const good = r && r.status === 'SAVED' && r.siswa === names[h.label] && r.jawaban.slice(0, 40) === h.jawaban; ok += good;
            console.log(good ? '✓' : '✗', h.label.padEnd(24), r && r.siswa, '| OCR:', r && r.ocr, '| rekomendasi', r && r.rekomendasi, r && r.skorOcr, '|', r && r.simpan); }
        assert.strictEqual(rows.length, meta.halaman.length, 'jumlah baris tersimpan');
        console.log('Panggilan API:', [...new Set(calls)].join(', '));
        console.log(`E2E desktop: ${ok}/${meta.halaman.length} lembar benar & tersimpan, ${rep.otomatisRekomendasi} dari rekomendasi OCR ≥90%`);
        process.exitCode = ok === meta.halaman.length ? 0 : 1;
    });
});
