// Uji Apps Script (Code.gs + Statistik.gs) dengan tiruan layanan Google. Pemakaian: node tools/test/test_appscript.js
const assert = require('assert');

const { createGas } = require('./gas_mock.js');
const { ctx, ss, GET, POST } = createGas();
// ---------------- skenario
ctx.setup();
assert.deepStrictEqual(ss.sheets.map(s => s.name), ['Sekolah', 'Guru', 'Siswa', 'Ujian', 'HasilScan', 'BankSoal']);
ss.getSheetByName('Sekolah').getRange(1, 2, 3, 1).setValues([['SMPN 2 JALAKSANA'], ['20212345'], ['SMP']]);
ss.getSheetByName('Guru').appendRow(['NURHAYATI', 'n@x.id', '1234', 'IPA, MTK', '7A, 7B', 'Ya']);
ss.getSheetByName('Guru').appendRow(['BUDI', '', '9999', 'IPS', '8A', 'Ya']);
const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const siswa = [];
for (const k of ['7A', '7B', '8A']) for (let i = 1; i <= 25; i++) { const nm = `SISWA ${k} ${String(i).padStart(2, '0')}`; siswa.push([k, nm]); ss.getSheetByName('Siswa').appendRow(['00' + i, '', `${k}${i}`, nm, k, '', 'L']); }

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
const R = t.ringkasan;
console.log(`Apps Script OK — ujian ${examId}: n=${R.n}, k=${R.k}, rata ${R.rataRata}, KR-20 ${R.kr20} (${R.kategoriKr20}), SEM ${R.sem}, tuntas ${R.persenTuntas}%, diterima ${R.diterima}/direvisi ${R.direvisi}/dibuang ${R.dibuang}; sheet ${t.sheet} (${anSheet.getLastRow()} baris x ${anSheet.getLastColumn()} kolom)`);
