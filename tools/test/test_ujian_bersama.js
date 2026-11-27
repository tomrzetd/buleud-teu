// Ujian bersama: satu baris Ujian (soal & kunci sama satu tingkat), beberapa guru di kolom Guru dipisah ';'.
// Pemakaian: node tools/test/test_ujian_bersama.js   |   BT_GAS_BUNDLE=apps-script/dist/BuleudTeu_min.gs node ...
const assert = require('assert');
const { createGas } = require('./gas_mock.js');
const { ctx, ss, POST, mintLicense } = createGas();
ctx.setup();
ss.getSheetByName('Sekolah').getRange(10, 2).setValue(mintLicense());
const G = ss.getSheetByName('Guru');
G.appendRow(['Eti Suhaeti, S.Pd', '', '1111', 'B. Indonesia', '8A,8B', 'Ya']);
G.appendRow(['Ikah Kartikah, S.Pd.', '', '2222', 'B. Indonesia', '8C,8D', 'Ya']);
G.appendRow(['Wintono, S.Pd.', '', '3333', 'Matematika', '8A', 'Ya']);
const S = ss.getSheetByName('Siswa');
for (const k of ['8A', '8B', '8C', '8D']) for (let i = 1; i <= 3; i++) S.appendRow(['00' + (k.charCodeAt(1) * 10 + i), '', k + i, `SISWA ${k} ${i}`, '8', k, 'P']);
const U = ss.getSheetByName('Ujian');
U.appendRow(['BIND08-ASAS2026A', 'ASAS', 'B. INDONESIA', '8', '8', 'Eti Suhaeti, S.Pd; Ikah Kartikah, S.Pd.', '2026-11-30', 'ABCD', 'ABCD'.repeat(5), 20, 75, 'Aktif', '']);
const login = (n, p) => POST({ action: 'login', guru: n, pin: p }).token;
const tE = login('Eti Suhaeti, S.Pd', '1111'), tI = login('Ikah Kartikah, S.Pd.', '2222'), tW = login('Wintono, S.Pd.', '3333');
let r = POST({ action: 'exams', token: tE }); assert.strictEqual(r.ujian.length, 1, 'Eti melihat ujian bersama');
assert.deepStrictEqual([...new Set(r.siswa.map(s => s.kelas))].sort(), ['8A', '8B'], 'Eti hanya melihat rombelnya');
r = POST({ action: 'exams', token: tI }); assert.strictEqual(r.ujian.length, 1, 'Ikah melihat ujian bersama');
assert.deepStrictEqual([...new Set(r.siswa.map(s => s.kelas))].sort(), ['8C', '8D']);
assert.strictEqual(POST({ action: 'exams', token: tW }).ujian.length, 0, 'guru mapel lain tidak melihat');
r = POST({ action: 'save', token: tE, examId: 'BIND08-ASAS2026A', siswa: { nama: 'SISWA 8A 1', kelas: '8A' }, answers: 'ABCD'.repeat(5).split('') });
assert.strictEqual(r.result, 'success', JSON.stringify(r)); assert.strictEqual(r.benar, 20);
r = POST({ action: 'save', token: tI, examId: 'BIND08-ASAS2026A', siswa: { nama: 'SISWA 8C 1', kelas: '8C' }, answers: 'ABCD'.repeat(5).split('') });
assert.strictEqual(r.result, 'success', 'guru kedua bisa menyimpan: ' + JSON.stringify(r));
assert.ok(POST({ action: 'save', token: tW, examId: 'BIND08-ASAS2026A', siswa: { nama: 'SISWA 8A 2', kelas: '8A' }, answers: [] }).forbidden, 'guru lain ditolak');
// Ikah mengubah kunci: berlaku untuk semua guru, daftar guru tetap
r = POST({ action: 'saveExam', token: tI, exam: { id: 'BIND08-ASAS2026A', nama: 'ASAS', mapel: 'B. INDONESIA', kelas: ['8'], tingkat: '8', opsi: 'ABCD', kunci: 'DCBA'.repeat(5), kktp: 75 } });
assert.strictEqual(r.result, 'success', JSON.stringify(r));
const row = U.getRange(2, 1, 1, 13).getValues()[0];
assert.strictEqual(row[5], 'Eti Suhaeti, S.Pd; Ikah Kartikah, S.Pd.', 'daftar guru dipertahankan');
assert.strictEqual(POST({ action: 'exams', token: tE }).ujian[0].kunci, 'DCBA'.repeat(5), 'Eti melihat kunci baru');
assert.ok(POST({ action: 'saveExam', token: tW, exam: { id: 'BIND08-ASAS2026A', nama: 'X', mapel: 'MATEMATIKA', opsi: 'ABCD', kunci: 'A' } }).error, 'guru lain tidak bisa mengedit');
// analisis tingkat oleh guru mana pun dalam daftar
r = POST({ action: 'analyze', token: tI, examId: 'BIND08-ASAS2026A', lingkup: 'tingkat' }); assert.strictEqual(r.result, 'success', JSON.stringify(r)); assert.strictEqual(r.n, 2);
// laporan: tanda tangan = guru yang meminta
r = POST({ action: 'report', token: tI, examId: 'BIND08-ASAS2026A', mode: 'simpel', format: 'sheet' });
assert.strictEqual(r.result, 'success', JSON.stringify(r));
console.log('Ujian bersama OK' + (process.env.BT_GAS_BUNDLE ? ' (bundel minified)' : '') + ': 2 guru satu kunci, rombel terpisah, edit kunci berbagi, guru lain ditolak');
