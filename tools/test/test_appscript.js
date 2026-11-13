// Uji Apps Script (Code.gs + Statistik.gs) dengan tiruan layanan Google. Pemakaian: node tools/test/test_appscript.js
const assert = require('assert');

const { createGas } = require('./gas_mock.js');
const { ctx, ss, GET, POST, created, fetched, drive, mintLicense } = createGas();
// ---------------- skenario
ctx.setup();
assert.deepStrictEqual(ss.sheets.map(s => s.name), ['Sekolah', 'Guru', 'Siswa', 'Ujian', 'HasilScan', 'BankSoal']);
ss.getSheetByName('Sekolah').getRange(1, 2, 3, 1).setValues([['SMPN 2 JALAKSANA'], ['20212345'], ['SMP']]);
// Fixture produksi: default tanpa License memang DEMO dan wajib ditolak.
ss.getSheetByName('Sekolah').getRange(10, 2).setValue(mintLicense());
ss.getSheetByName('Guru').appendRow(['NURHAYATI', 'n@x.id', '1234', 'IPA, MTK', '7A, 7B', 'Ya']);
ss.getSheetByName('Guru').appendRow(['BUDI', '', '9999', 'IPS', '8A', 'Ya']);
const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const siswa = [];
for (const k of ['7A', '7B', '8A']) for (let i = 1; i <= 25; i++) { const nm = `SISWA ${k} ${String(i).padStart(2, '0')}`; siswa.push([k, nm]); ss.getSheetByName('Siswa').appendRow(['00' + k.replace(/\D/g, '') + k.slice(-1).charCodeAt(0) + String(i).padStart(2, '0'), '', `${k}${i}`, nm, k, '', 'L']); }

let c = GET('config');
assert.strictEqual(c.version, 'V40'); assert.strictEqual(c.sekolah.nama, 'SMPN 2 JALAKSANA'); assert.strictEqual(c.sekolah.opsiDefault, 'ABCD'); assert.strictEqual(c.guru.length, 2);
assert.ok(!JSON.stringify(c).includes('"1234"') && !/pin/i.test(JSON.stringify(c.guru)), 'PIN tidak boleh bocor di config');
let r = POST({ action: 'login', guru: 'NURHAYATI', pin: '0000' }); assert.ok(r.error);
r = POST({ action: 'login', guru: 'nurhayati', pin: '1234' }); assert.strictEqual(r.result, 'success'); const tok = r.token;
assert.ok(POST({ action: 'exams', token: 'palsu' }).auth, 'token palsu ditolak');
const KEY = 'ABCDABCDACBDDCBAABCDABCDACBDDCBAABCDACBD'; // 40 soal
r = POST({ action: 'saveExam', token: tok, exam: { nama: 'PSAS Ganjil', mapel: 'IPA', kelas: ['7A', '7B'], opsi: 'ABCD', kunci: KEY, kktp: 70 } });
assert.strictEqual(r.result, 'success'); assert.strictEqual(r.jumlah, 40); const examId = r.id;
assert.ok(POST({ action: 'saveExam', token: tok, exam: { nama: 'x', mapel: 'IPA', opsi: 'ABCD', kunci: 'ABE' } }).error, 'E ditolak untuk ABCD');
r = POST({ action: 'exams', token: tok });
assert.strictEqual(r.ujian.length, 1); assert.strictEqual(r.ujian[0].jumlah, 40); assert.strictEqual(r.siswa.length, 50, 'siswa 7A+7B');
// simpan 50 scan (kemampuan acak) + 1 scan ulang
for (const [k, nm] of siswa.filter(s => s[0] !== '8A')) {
    const th = rnd() * 2 - 0.5;
    const ans = [...KEY].map((ch, j) => rnd() < 1 / (1 + Math.exp(-(th * 2 - (j % 7) / 3))) ? ch : 'ABCD'[Math.floor(rnd() * 4)]);
    const s = POST({ action: 'save', token: tok, examId, siswa: { nama: nm, kelas: k }, answers: ans, mode: 'marker' });
    assert.strictEqual(s.result, 'success'); assert.strictEqual(s.jumlah, 40);
}
const ulang = POST({ action: 'save', token: tok, examId, siswa: { nama: 'SISWA 7A 01', kelas: '7A' }, answers: [...KEY] });
assert.strictEqual(ulang.skor, 100);
assert.strictEqual(ss.getSheetByName('HasilScan').getLastRow(), 52);
// analisis per tingkat & per kelas
const t = POST({ action: 'analyze', token: tok, examId, lingkup: 'tingkat' });
assert.strictEqual(t.result, 'success'); assert.strictEqual(t.ringkasan.n, 50, 'scan ulang tidak dihitung dua kali'); assert.strictEqual(t.ringkasan.k, 40);
const kA = POST({ action: 'analyze', token: tok, examId, lingkup: 'kelas', kelas: '7A' });
assert.strictEqual(kA.ringkasan.n, 25);
const anSheet = ss.getSheetByName(t.sheet); assert.ok(anSheet, 'sheet analisis dibuat');
assert.ok(anSheet.getLastColumn() >= 46, 'tabel 40 soal melewati kolom Z (bug lama A3:Z1000)');
// bank soal: upsert
let b = POST({ action: 'bank', token: tok, examId, lingkup: 'tingkat' }); assert.strictEqual(b.baru, 40);
b = POST({ action: 'bank', token: tok, examId, lingkup: 'tingkat' }); assert.strictEqual(b.baru, 0); assert.strictEqual(b.diperbarui, 40);
b = POST({ action: 'bank', token: tok, examId, lingkup: 'kelas', kelas: '7B' }); assert.strictEqual(b.baru, 40);
assert.strictEqual(ss.getSheetByName('BankSoal').getLastRow(), 81);
// guru lain tidak boleh mengubah ujian ini
const tok2 = POST({ action: 'login', guru: 'BUDI', pin: '9999' }).token;
assert.ok(POST({ action: 'saveExam', token: tok2, exam: { id: examId, nama: 'x', mapel: 'IPA', opsi: 'ABCD', kunci: 'AB' } }).error);
assert.strictEqual(POST({ action: 'exams', token: tok2 }).ujian.length, 0);
// kunci PIN setelah 5x salah
for (let i = 0; i < 5; i++) POST({ action: 'login', guru: 'BUDI', pin: '1' });
assert.ok(/Terlalu banyak/.test(POST({ action: 'login', guru: 'BUDI', pin: '9999' }).error));
// ---------------- laporan
const tokN = POST({ action: 'login', guru: 'NURHAYATI', pin: '1234' }).token;
const cells = (sh) => Array.from(sh.cells, r => Array.from(r || [], v => v == null ? '' : String(v)));
const findRow = (sh, first) => cells(sh).findIndex(r => r[0] === first || r[1] === first);
// 1) simpel PDF: satu tab Nilai, kunci + pilihan + benar/skor, ekspor PDF F4
let L = POST({ action: 'report', token: tokN, examId, mode: 'simpel', format: 'pdf', lingkup: 'tingkat' });
assert.strictEqual(L.result, 'success', L.error); assert.strictEqual(L.mime, 'application/pdf'); assert.ok(L.fileName.endsWith('.pdf'));
assert.ok(Buffer.from(L.base64, 'base64').toString().startsWith('%PDF'), 'isi PDF');
assert.deepStrictEqual(L.bagian, ['identitas', 'nilai', 'jawaban', 'rekap', 'ttd']);
let S = created.at(-1); assert.deepStrictEqual(S.sheets.map(x => x.name), ['Nilai']);
assert.ok(/size=folio/.test(fetched.at(-1)) && /portrait=false/.test(fetched.at(-1)), 'F4, mendatar karena 40 soal');
let nilai = S.getSheetByName('Nilai'), hr = findRow(nilai, 'No');
const head = cells(nilai)[hr]; assert.deepStrictEqual(head.slice(0, 4), ['No', 'Nama', 'Kelas', 'No. Peserta']); assert.strictEqual(head.length, 4 + 40 + 4); assert.deepStrictEqual(head.slice(-4), ['Benar', 'Skor', 'Tuntas', 'Peringkat']);
assert.strictEqual(cells(nilai)[hr + 1].slice(4, 44).join(''), KEY, 'baris KUNCI');
const rowsN = cells(nilai).slice(hr + 2).filter(r => /^\d+$/.test(r[0]) && /^SISWA/.test(r[1]));
assert.strictEqual(rowsN.length, 50, '50 siswa (scan ulang tidak dobel)');
const s01 = rowsN.find(r => r[1] === 'SISWA 7A 01'); assert.strictEqual(s01[44], '40'); assert.strictEqual(s01[45], '100'); assert.strictEqual(s01[47], '1', 'peringkat 1');
assert.ok(cells(nilai).some(r => r.some(v => /Kepala Sekolah/.test(v))), 'tanda tangan');
assert.ok(drive.moved.at(-1)[1] === 'Buleud Teu — Laporan', 'arsip di folder laporan'); assert.deepStrictEqual(drive.viewers.at(-1).slice(1), ['n@x.id'], 'dibagikan ke email guru');
// 2) lengkap XLSX: Nilai + Analisis Butir + Pengecoh + Matriks
L = POST({ action: 'report', token: tokN, examId, mode: 'lengkap', format: 'xlsx', urut: 'skor' });
assert.strictEqual(L.result, 'success', L.error); assert.ok(L.fileName.endsWith('.xlsx')); assert.ok(/format=xlsx/.test(fetched.at(-1)));
S = created.at(-1); assert.deepStrictEqual(S.sheets.map(x => x.name), ['Nilai', 'Analisis Butir', 'Pengecoh', 'Matriks']);
const an = S.getSheetByName('Analisis Butir'), ah = findRow(an, 'No');
assert.strictEqual(cells(an).slice(ah + 1).filter(r => /^\d+$/.test(r[0])).length, 40, '40 butir');
assert.ok(cells(an).some(r => r[0] === 'Reliabilitas KR-20'), 'ringkasan statistik');
const urut = cells(S.getSheetByName('Nilai')).filter(r => /^SISWA/.test(r[1])).map(r => Number(r[r.length - 3]));
assert.ok(urut.every((v, i) => i === 0 || urut[i - 1] >= v), 'urut skor menurun');
// 3) pilihan bebas: hanya analisis butir (tanpa halaman nilai kosong), per kelas, Google Sheet saja
L = POST({ action: 'report', token: tokN, examId, bagian: ['butir'], format: 'sheet', lingkup: 'kelas', kelas: '7B' });
assert.strictEqual(L.result, 'success', L.error); assert.ok(!L.base64 && /spreadsheets\/d\//.test(L.url)); assert.strictEqual(L.ringkas.siswa, 25);
assert.deepStrictEqual(created.at(-1).sheets.map(x => x.name), ['Analisis Butir']);
// 3b) anonim: tidak ada nama siswa di laporan
L = POST({ action: 'report', token: tokN, examId, mode: 'lengkap', format: 'pdf', anonim: true });
assert.strictEqual(L.result, 'success', L.error); assert.ok(/Anonim/.test(L.fileName));
const isi = created.at(-1).sheets.flatMap(x => cells(x)).flat().join(' ');
assert.ok(!/SISWA 7A/.test(isi), 'nama siswa tidak boleh muncul'); assert.ok(/Peserta 01/.test(isi));
// 4) galat yang jelas
assert.ok(/Belum ada hasil scan/.test(POST({ action: 'report', token: tokN, examId, lingkup: 'kelas', kelas: '8A' }).error));
assert.ok(POST({ action: 'report', token: 'palsu', examId }).auth);
// 5) skor seragam (screenshot pengguna): r pbis / KR-20 jika dihapus tidak boleh -1 / negatif palsu
// Operator memberi tugas 8A kepada guru sebelum tes ini, untuk memenuhi
// pembatasan roster berdasarkan penugasan guru di backend.
ss.getSheetByName('Guru').getRange(2, 5).setValue('7A, 7B, 8A');
ctx.ROWS_CACHE_ = {};
const kU = POST({ action: 'saveExam', token: tokN, exam: { nama: 'UH SERAGAM', mapel: 'IPA', kelas: ['8A'], opsi: 'ABCD', kunci: 'ABAB' } }).id;
for (const nm of ['S1', 'S2', 'S3', 'S4']) ss.getSheetByName('Siswa').appendRow(['99' + nm, '', '', nm, '8A', '', 'L']);
for (const [nm, a] of [['S1', 'ABCC'], ['S2', 'CBAC'], ['S3', 'CCAB'], ['S4', 'AAAA']]) POST({ action: 'save', token: tokN, examId: kU, siswa: { nama: nm, kelas: '8A' }, answers: [...a] });
const tU = POST({ action: 'analyze', token: tokN, examId: kU, lingkup: 'tingkat' });
assert.ok(tU.butir.every(b => b.rpbis == null && b.d == null && b.rekomendasi === '-'), 'butir tidak terdefinisi saat skor seragam');
assert.ok(tU.peringatan.some(p => /skor total sama/.test(p)));
console.log(`Laporan OK — simpel PDF (1 tab), lengkap XLSX (4 tab), pilihan bebas per kelas (Google Sheet), skor seragam aman`);
const R = t.ringkasan;
console.log(`Apps Script OK — ujian ${examId}: n=${R.n}, k=${R.k}, rata ${R.rataRata}, KR-20 ${R.kr20} (${R.kategoriKr20}), SEM ${R.sem}, tuntas ${R.persenTuntas}%, diterima ${R.diterima}/direvisi ${R.direvisi}/dibuang ${R.dibuang}; sheet ${t.sheet} (${anSheet.getLastRow()} baris x ${anSheet.getLastColumn()} kolom)`);

/** Mode DEMO tidak boleh mengirim roster asli, maupun menulis ke HasilScan/analisis. */
ss.getSheetByName('Sekolah').getRange(10, 2).setValue('Belum terdaftar');
const demoCfg = GET('config');
assert.strictEqual(demoCfg.sekolah.license, 'Demo');
const demo = POST({ action: 'exams', token: tokN });
assert.strictEqual(demo.license, 'Demo');
assert.strictEqual(demo.siswa.length, 5);
assert.ok(demo.siswa.every(s => s.nama.includes('(DEMO)')));
assert.ok(!JSON.stringify(demo.siswa).includes('SISWA 7A'));
assert.ok(POST({ action: 'save', token: tokN, examId, siswa: { nama: 'SISWA 7A 01', kelas: '7A' }, answers: [...KEY] }).error);
assert.ok(POST({ action: 'analyze', token: tokN, examId }).error);
assert.ok(POST({ action: 'bank', token: tokN, examId }).error);
assert.ok(POST({ action: 'report', token: tokN, examId }).error);
assert.ok(POST({ action: 'saveExam', token: tokN, exam: { nama: 'DEMO', mapel: 'IPA', kelas: ['7A'], opsi: 'ABCD', kunci: 'ABCD' } }).error);
console.log('License DEMO OK: 5 siswa sintetis, simpan dan analisis diblokir di server');
