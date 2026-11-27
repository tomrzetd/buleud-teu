// Nilai uraian (essay) manual: Nilai Akhir = PG benar × Poin PG + Σ skor uraian (maks 100).
// Analisis butir & database tetap hanya PG. Pemakaian: node tools/test/test_uraian.js | BT_GAS_BUNDLE=... node ...
const assert = require('assert');
const { createGas } = require('./gas_mock.js');
const { ctx, ss, POST, mintLicense } = createGas();
ctx.setup();
ss.getSheetByName('Sekolah').getRange(10, 2).setValue(mintLicense());
ss.getSheetByName('Guru').appendRow(['Eti Suhaeti, S.Pd', '', '1111', 'B. Indonesia', '8A', 'Ya']);
const S = ss.getSheetByName('Siswa');
for (let i = 1; i <= 3; i++) S.appendRow(['00' + (810 + i), '', '8A' + i, `SISWA 8A ${i}`, '8', '8A', 'P']);
const U = ss.getSheetByName('Ujian');
const KEY = 'ABCD'.repeat(5);
U.appendRow(['BIND08-ASAS2026A', 'ASAS', 'B. INDONESIA', '8', '8', 'Eti Suhaeti, S.Pd', '2026-11-30', 'ABCD', KEY, 20, 75, 'Aktif', '']);
const t = POST({ action: 'login', guru: 'Eti Suhaeti, S.Pd', pin: '1111' }).token;
const exam = (x) => POST({ action: 'saveExam', token: t, exam: Object.assign({ id: 'BIND08-ASAS2026A', nama: 'ASAS', mapel: 'B. INDONESIA', kelas: ['8'], tingkat: '8', opsi: 'ABCD', kunci: KEY, kktp: 75 }, x) });
// validasi total 100
let r = exam({ poinPG: 3, uraian: [10, 10] }); assert.ok(r.error && /100/.test(r.error), 'total ≠ 100 ditolak: ' + JSON.stringify(r));
r = exam({ uraian: [20] }); assert.ok(r.error, 'uraian tanpa Poin PG ditolak');
r = exam({ poinPG: 4, uraian: '10,5,5' }); assert.strictEqual(r.result, 'success', JSON.stringify(r));
assert.deepStrictEqual(r.uraianMaks, [10, 5, 5]);
let ex = POST({ action: 'exams', token: t }).ujian[0];
assert.strictEqual(ex.poinPG, 4); assert.deepStrictEqual(ex.uraianMaks, [10, 5, 5]); assert.strictEqual(ex.nilaiMaks, 100);
// edit kunci dari aplikasi lama (tanpa field nilai) mempertahankan pengaturan
r = exam({}); assert.strictEqual(r.result, 'success'); assert.deepStrictEqual(POST({ action: 'exams', token: t }).ujian[0].uraianMaks, [10, 5, 5]);
// essay sebelum scan PG ditolak
r = POST({ action: 'essay', token: t, examId: 'BIND08-ASAS2026A', siswa: { nama: 'SISWA 8A 1', kelas: '8A' }, nilai: [8, 5, 4] });
assert.ok(r.error && /belum dipindai/.test(r.error), JSON.stringify(r));
// scan PG 15 benar -> nilai akhir menunggu uraian
const ans = KEY.split(''); for (let i = 0; i < 5; i++) ans[i] = 'D' === ans[i] ? 'A' : 'D';
r = POST({ action: 'save', token: t, examId: 'BIND08-ASAS2026A', siswa: { nama: 'SISWA 8A 1', kelas: '8A' }, answers: ans });
assert.strictEqual(r.benar, 15); assert.strictEqual(r.nilaiAkhir, null, 'menunggu uraian');
assert.strictEqual(r.skor, 75, 'skor PG murni (database/analisis) tidak berubah');
// sebagian uraian -> tetap null
r = POST({ action: 'essay', token: t, examId: 'BIND08-ASAS2026A', siswa: { nama: 'SISWA 8A 1', kelas: '8A' }, nilai: [8, '', 4] });
assert.strictEqual(r.result, 'success', JSON.stringify(r)); assert.strictEqual(r.nilaiAkhir, null);
r = POST({ action: 'essay', token: t, examId: 'BIND08-ASAS2026A', siswa: { nama: 'SISWA 8A 1', kelas: '8A' }, nilai: [8, 6, 4] });
assert.ok(r.error && /0–5/.test(r.error), 'melebihi maks ditolak');
r = POST({ action: 'essay', token: t, examId: 'BIND08-ASAS2026A', siswa: { nama: 'SISWA 8A 1', kelas: '8A' }, nilai: [8, 5, '4,5'] });
assert.strictEqual(r.nilaiAkhir, 15 * 4 + 8 + 5 + 4.5);
// scan ulang PG mempertahankan uraian, nilai akhir dihitung ulang
r = POST({ action: 'save', token: t, examId: 'BIND08-ASAS2026A', siswa: { nama: 'SISWA 8A 1', kelas: '8A' }, answers: KEY.split('') });
assert.strictEqual(r.nilaiAkhir, 80 + 17.5, JSON.stringify(r));
// uraian bisa dikirim bersama scan
r = POST({ action: 'save', token: t, examId: 'BIND08-ASAS2026A', siswa: { nama: 'SISWA 8A 2', kelas: '8A' }, answers: KEY.split(''), uraian: [10, 5, 5] });
assert.strictEqual(r.nilaiAkhir, 100);
// daftar
r = POST({ action: 'essayList', token: t, examId: 'BIND08-ASAS2026A' });
assert.strictEqual(r.result, 'success', JSON.stringify(r)); assert.strictEqual(r.siswa.length, 3);
const s3 = r.siswa.find(x => x.nama === 'SISWA 8A 3'); assert.strictEqual(s3.adaPG, false);
const s1 = r.siswa.find(x => x.nama === 'SISWA 8A 1'); assert.strictEqual(s1.skorPG, 80); assert.deepStrictEqual(s1.uraian, [8, 5, 4.5]);
// kolom tambahan di HasilScan, analisis tetap PG
const H = ss.getSheetByName('HasilScan'); const hd = H.getRange(1, 1, 1, H.getLastColumn()).getValues()[0];
assert.ok(hd.includes('Uraian') && hd.includes('Nilai Akhir'), hd.join('|'));
r = POST({ action: 'analyze', token: t, examId: 'BIND08-ASAS2026A' }); assert.strictEqual(r.result, 'success', JSON.stringify(r));
// laporan per guru: memuat skor uraian & nilai akhir; siswa tanpa uraian lengkap = 'Menunggu uraian'
POST({ action: 'save', token: t, examId: 'BIND08-ASAS2026A', siswa: { nama: 'SISWA 8A 3', kelas: '8A' }, answers: KEY.split('') });
r = POST({ action: 'report', token: t, examId: 'BIND08-ASAS2026A', mode: 'lengkap', format: 'sheet', urut: 'skor' });
assert.strictEqual(r.result, 'success', JSON.stringify(r));
const D = ctx.dataLaporan_('BIND08-ASAS2026A', ctx.opsiLaporan_({ mode: 'lengkap', urut: 'skor' }));
const tb = D.sheets[0].blok.find(b => b.jenis === 'tabel');
const hk = tb.kepala; assert.ok(hk.includes('Skor PG') && hk.includes('Nilai Akhir') && hk.includes('U1 (10)'), hk.join('|'));
const bar = tb.baris.filter(x => typeof x[0] === 'number');
const iNA = hk.indexOf('Nilai Akhir'), iT = hk.indexOf('Tuntas'), iP = hk.indexOf('Peringkat');
assert.strictEqual(bar[0][1], 'SISWA 8A 2'); assert.strictEqual(bar[0][iNA], 100); assert.strictEqual(bar[0][iP], 1);
const b3 = bar.find(x => x[1] === 'SISWA 8A 3'); assert.strictEqual(b3[iT], 'Menunggu uraian'); assert.strictEqual(b3[iP], '-');
assert.strictEqual(D.ringkas.rataRata, (100 + 97.5) / 2, 'rekap hanya dari nilai akhir lengkap');
const sbA = D.sheets.find(x => x.nama === 'Analisis Butir'); assert.ok(sbA, 'analisis butir tetap ada (PG saja)');
// ubah komposisi (5 PG poin) -> nilai akhir tersimpan ikut dihitung ulang; mis. 20×4+20 -> 20×3+40
r = exam({ poinPG: 3, uraian: [20, 10, 10] }); assert.strictEqual(r.result, 'success', JSON.stringify(r));
const ls = POST({ action: 'essayList', token: t, examId: 'BIND08-ASAS2026A' }).siswa;
assert.strictEqual(ls.find(x => x.nama === 'SISWA 8A 2').nilaiAkhir, 60 + 20, 'nilai uraian lama tetap, PG pakai poin baru');
const hd2 = H.getRange(1, 1, 1, H.getLastColumn()).getValues()[0], iN = hd2.indexOf('Nilai Akhir');
const rowS2 = H.getRange(1, 1, H.getLastRow(), H.getLastColumn()).getValues().find(x => x[5] === 'SISWA 8A 2'); assert.strictEqual(Number(rowS2[iN]), 80, 'kolom Nilai Akhir di sheet ikut diperbarui');
globalThis.__ctx = ctx;
module.exports = { ctx, ss, POST, t };
if (require.main === module) console.log('Nilai uraian OK' + (process.env.BT_GAS_BUNDLE ? ' (bundel minified)' : '') + ': validasi 100, menunggu uraian, scan ulang menjaga uraian, essayList');
