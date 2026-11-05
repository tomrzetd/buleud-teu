// Uji end-to-end web app (Chromium) + Code.gs asli (tiruan Google) + OCR Tesseract.
// Pemakaian: node tools/test/e2e_web.js   (butuh: python3 tools/test/gen_cases.py lebih dulu)
const path = require('path'), fs = require('fs'), assert = require('assert');
const { chromium } = require('playwright');
const { createGas } = require('./gas_mock.js');
const ROOT = path.join(__dirname, '..', '..');
const SHOT = path.join(__dirname, 'shots'); fs.mkdirSync(SHOT, { recursive: true });
const API = 'https://script.google.com/macros/s/UJI_BULEUD/exec';

(async () => {
    const gas = createGas();
    const { ss } = gas;
    gas.ctx.setup();
    ss.getSheetByName('Sekolah').getRange(1, 2, 8, 1).setValues([['SMP NEGERI 2 JALAKSANA'], ['20212345'], ['SMP'], ['Jl. Raya'], ['Kuningan'], ['Dra. Kepala'], [''], ['2026/2027']]);
    ss.getSheetByName('Guru').appendRow(['NURHAYATI', '', '1234', 'IPA', '9A, 9B', 'Ya']);
    for (const [n, k] of [['IBNU BIN LADEN', '9A'], ['IBNU SINA', '9A'], ['INDAH LESTARI', '9A'], ['BUDI SANTOSO', '9B'], ['LADENA PUTRI', '9B']])
        ss.getSheetByName('Siswa').appendRow(['', '', '', n, k, '', 'L']);
    const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases', 'meta.json')));
    const c02 = cases.find(c => c.name.startsWith('02_'));   // ABCD, 50 soal
    const KEY = c02.expect.slice(0, 40).replace(/^(.)/, ch => ch === 'A' ? 'B' : 'A');   // 40 soal, soal 1 sengaja beda -> 39/40

    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
    const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    const calls = [];
    await page.route('https://script.google.com/**', async (route, req) => {
        const u = new URL(req.url());
        let body;
        if (req.method() === 'GET') { body = gas.doGet(Object.fromEntries(u.searchParams)); calls.push('GET ' + u.searchParams.get('action')); }
        else { const d = req.postData(); body = gas.doPost(d); calls.push('POST ' + JSON.parse(d).action); }
        await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body });
    });
    await page.goto('file://' + (process.env.HTML || path.join(ROOT, 'web', 'index.html')));
    // 1) setup
    await page.fill('#inApi', API); await page.click('text=Sambungkan');
    await page.waitForSelector('#scr-login.on');
    // 2) login PIN salah lalu benar
    for (const k of '0000') await page.click(`#pinPad [data-k="${k}"]`);
    await page.waitForFunction(() => /salah/i.test(document.getElementById('loginMsg').textContent));
    for (const k of '1234') await page.click(`#pinPad [data-k="${k}"]`);
    await page.waitForSelector('#scr-home.on'); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOT, '1_beranda_kosong.png') });
    // 3) buat ujian 40 soal ABCD kelas 9A, 9B
    await page.click('text=＋ Ujian baru');
    await page.fill('#exNama', 'PSAS GANJIL IPA'); await page.fill('#exMapel', 'IPA');
    await page.click('#exKelas [data-k="9A"]'); await page.click('#exKelas [data-k="9B"]');
    await page.click('[data-opsi="ABCD"]');
    await page.fill('#exKunci', KEY); await page.dispatchEvent('#exKunci', 'input');
    assert.strictEqual(await page.textContent('#keyCount'), '40 soal');
    await page.screenshot({ path: path.join(SHOT, '2_ujian_kunci.png') });
    await page.click('text=Simpan ujian');
    await page.waitForSelector('#scr-home.on'); await page.waitForSelector('.exam');
    await page.screenshot({ path: path.join(SHOT, '3_beranda_ujian.png') });
    // 4) scan dari galeri (kamera tidak ada di uji headless)
    await page.click('text=📷 Scan');
    await page.waitForSelector('#scr-scan.on');
    await page.setInputFiles('#scr-scan input[type=file]', c02.file.replace('.raw', '.jpg'));
    await page.waitForSelector('#scr-result.on', { timeout: 20000 });
    await page.waitForFunction(() => /→|tidak|belum|kosong|Rekomendasi|Offline/.test(document.getElementById('ocrStatus').textContent), null, { timeout: 30000 });
    const st = await page.evaluate(() => ({ score: document.getElementById('resScore').textContent, benar: document.getElementById('resBenar').textContent, kelas: document.getElementById('selKelas').value, siswa: document.getElementById('selSiswa').value, ocr: document.getElementById('ocrStatus').textContent, ans: App._S.answers.slice(0, 40).map(a => a || '-').join('') }));
    console.log('Hasil scan:', st);
    assert.strictEqual(st.benar, '39 benar dari 40 soal');
    assert.strictEqual(st.ans, c02.expect.slice(0, 40));
    await page.screenshot({ path: path.join(SHOT, '4_hasil_atas.png') });
    await page.evaluate(() => document.querySelector('#ljkGrid').scrollIntoView());
    await page.screenshot({ path: path.join(SHOT, '5_ljk_digital.png') });
    // lapisan: foto asli + kehitaman
    await page.click('#layerChips [data-ly="view"]'); await page.click('#layerChips [data-ly="dark"]');
    await page.evaluate(() => document.querySelector('#evCanvas').scrollIntoView());
    await page.screenshot({ path: path.join(SHOT, '6_bukti_foto_asli.png') });
    await page.click('#layerChips [data-ly="view"]');
    await page.evaluate(() => document.querySelector('#evCanvas').scrollIntoView());
    await page.screenshot({ path: path.join(SHOT, '7_bukti_diluruskan.png') });
    // koreksi manual soal 1 -> jawaban kunci, skor jadi 40/40
    await page.click(`#ljkGrid [data-q="0"][data-l="${KEY[0]}"]`);
    assert.strictEqual(await page.textContent('#resBenar'), '40 benar dari 40 soal');
    // 5) simpan (pastikan siswa terpilih)
    assert.strictEqual(st.siswa, '', 'OCR tidak boleh memilih siswa otomatis');
    await page.fill('#cariSiswa', 'ibnu ladn');               // salah ketik tetap ketemu
    await page.waitForSelector('#cariHasil .hit');
    assert.ok((await page.textContent('#cariHasil .hit')).includes('IBNU BIN LADEN'));
    await page.click('#cariHasil .hit');
    assert.strictEqual(await page.evaluate(() => document.getElementById('selSiswa').value), 'IBNU BIN LADEN');
    assert.ok((await page.textContent('#pilihan')).includes('IBNU BIN LADEN'));
    await page.evaluate(() => document.querySelector('#idCard').scrollIntoView());
    await page.screenshot({ path: path.join(SHOT, '11_identitas_cari.png') });
    await page.click('#btnSave');
    await page.waitForFunction(() => /✅/.test(document.getElementById('toast').textContent), null, { timeout: 10000 });
    const hs = ss.getSheetByName('HasilScan'); assert.strictEqual(hs.getLastRow(), 2);
    const row = hs.getRange(2, 1, 1, 17).getDisplayValues()[0];
    console.log('Baris HasilScan:', row.slice(1, 12).join(' | '));
    assert.strictEqual(row[11], '100');
    // 5b) LJK LAMA (tanpa marker) discan dari kartu ujian 20 soal -> dikenali otomatis, dinilai, OCR, simpan
    const OLD = process.env.LJK_LAMA || '/home/claude/test/ljk_asli.png';
    if (fs.existsSync(OLD)) {
        await page.evaluate(() => App.go('home'));
        await page.click('text=＋ Ujian baru');
        await page.fill('#exNama', 'PSAS LJK LAMA'); await page.fill('#exMapel', 'IPA');
        await page.click('#exKelas [data-k="9A"]'); await page.click('[data-opsi="ABCD"]');
        await page.fill('#exKunci', 'ACCBBCBCDCCDCBAADCBA'); await page.dispatchEvent('#exKunci', 'input');
        await page.click('text=Simpan ujian'); await page.waitForSelector('#scr-home.on'); await page.waitForTimeout(400);
        const idx = await page.evaluate(() => App._S.data.ujian.findIndex(u => u.nama === 'PSAS LJK LAMA'));
        await page.evaluate((i) => App.startScan(i, 'exam'), idx);
        await page.setInputFiles('#scr-scan input[type=file]', OLD);
        await page.waitForSelector('#scr-result.on', { timeout: 20000 });
        await page.waitForFunction(() => /→|tidak|belum|kosong|Rekomendasi|Offline/.test(document.getElementById('ocrStatus').textContent), null, { timeout: 30000 });
        const o = await page.evaluate(() => ({ mode: App._S.res.mode, benar: document.getElementById('resBenar').textContent, notes: document.getElementById('resNotes').textContent, ocr: document.getElementById('ocrStatus').textContent, strip: !!document.querySelector('#idStrips canvas'), bubbles: document.querySelectorAll('#ljkGrid .bub').length }));
        console.log('LJK lama dari kartu ujian:', o);
        assert.strictEqual(o.mode, 'markerless'); assert.strictEqual(o.benar, '20 benar dari 20 soal'); assert.ok(o.strip); assert.strictEqual(o.bubbles, 80);
        await page.screenshot({ path: path.join(SHOT, '10_ljk_lama_hasil.png') });
        await page.selectOption('#selKelas', '9A'); await page.selectOption('#selSiswa', 'IBNU BIN LADEN');
        const before = ss.getSheetByName('HasilScan').getLastRow();
        await page.click('#btnSave'); await page.waitForTimeout(1500);
        if (ss.getSheetByName('HasilScan').getLastRow() === before) { await page.click('#btnSave'); await page.waitForTimeout(1500); } // konfirmasi siswa sudah pernah discan
        assert.strictEqual(ss.getSheetByName('HasilScan').getLastRow(), before + 1, 'hasil LJK lama tersimpan');
        console.log('Baris LJK lama:', ss.getSheetByName('HasilScan').getRange(before + 1, 1, 1, 14).getDisplayValues()[0].slice(1, 14).join(' | '));
    }
    // 6) analisis (tambahkan beberapa scan langsung lewat API agar n cukup)
    const tok = await page.evaluate(() => App._S.token), exam = await page.evaluate(() => App._S.data.ujian.find(u => u.nama === 'PSAS GANJIL IPA').id);
    ['IBNU SINA', 'INDAH LESTARI', 'BUDI SANTOSO', 'LADENA PUTRI'].forEach((n, i) => gas.POST({ action: 'save', token: tok, examId: exam, siswa: { nama: n, kelas: i < 2 ? '9A' : '9B' }, answers: [...KEY].map((ch, j) => (j + i) % (i + 2) ? ch : 'D') }));
    await page.evaluate(() => App.go('home'));
    await page.evaluate(() => App.openAnalysis(App._S.data.ujian.findIndex(u => u.nama === 'PSAS GANJIL IPA'))); await page.click('text=Hitung analisis');
    await page.waitForSelector('#anOut table', { timeout: 15000 });
    await page.screenshot({ path: path.join(SHOT, '8_analisis.png'), fullPage: false });
    await page.click('text=Simpan ke Bank Soal'); await page.waitForFunction(() => /Bank Soal/.test(document.getElementById('toast').textContent));
    assert.strictEqual(ss.getSheetByName('BankSoal').getLastRow(), 41);
    // 6b) laporan: simpel PDF (unduhan otomatis), lalu lengkap Excel
    await page.locator('#repCard').scrollIntoViewIfNeeded();
    let dl = page.waitForEvent('download'); await page.click('text=Buat laporan'); let d = await dl;
    assert.ok(d.suggestedFilename().endsWith('.pdf'), 'unduhan PDF'); const pdfBytes = fs.readFileSync(await d.path()); assert.ok(pdfBytes.toString().startsWith('%PDF'));
    assert.deepStrictEqual(gas.created.at(-1).sheets.map(x => x.name), ['Nilai']);
    await page.screenshot({ path: path.join(SHOT, '12_laporan.png') });
    await page.click('#repMode [data-m="lengkap"]'); await page.selectOption('#repFormat', 'xlsx');
    dl = page.waitForEvent('download'); await page.click('text=Buat laporan'); d = await dl;
    assert.ok(d.suggestedFilename().endsWith('.xlsx'), 'unduhan Excel');
    assert.deepStrictEqual(gas.created.at(-1).sheets.map(x => x.name), ['Nilai', 'Analisis Butir', 'Pengecoh', 'Matriks']);
    console.log('Laporan web:', d.suggestedFilename());
    // 7) cetak
    await page.evaluate(() => App.go('home')); await page.click('text=Cetak LJK >> nth=0');
    await page.waitForSelector('#prPreview svg');
    await page.screenshot({ path: path.join(SHOT, '9_cetak.png') });
    await page.emulateMedia({ media: 'print' });
    await page.pdf({ path: path.join(SHOT, 'cetak_dari_app.pdf'), width: '215mm', height: '330mm', printBackground: true });
    await page.emulateMedia({ media: 'screen' });
    // 8) offline: simpan masuk antrean lalu terkirim
    await page.evaluate(() => App.go('home'));
    assert.deepStrictEqual(errs, [], 'tidak ada error JS: ' + errs.join(' | '));
    console.log('Panggilan API:', [...new Set(calls)].join(', '));
    console.log('E2E web OK');
    await browser.close();
})().catch(e => { console.error('E2E GAGAL:', e); process.exit(1); });
