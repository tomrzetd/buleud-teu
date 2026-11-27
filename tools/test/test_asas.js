// Uji pembuat ujian ASAS massal + Dashboard ASAS (apps-script/AsasPsas.gs) di atas Code.gs sumber ATAU bundel minified.
// Pemakaian: node tools/test/test_asas.js            (sumber)
//            BT_GAS_BUNDLE=<file .gs minified> node tools/test/test_asas.js
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const { createGas } = require('./gas_mock.js');
const { ctx, ss, POST, mintLicense } = createGas();
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../apps-script/AsasPsas.gs'), 'utf8'), ctx);
ctx.setup();
ss.getSheetByName('Sekolah').getRange(1, 2, 1, 1).setValues([['SMPN 2 JALAKSANA']]);
ss.getSheetByName('Sekolah').getRange(10, 2).setValue(mintLicense());
const G = ss.getSheetByName('Guru');
G.appendRow(['H. RIZAL ABDURRAHMAN, S.PD', '', '1111', 'INFORMATIKA', '8A, 8B, 9A', 'Ya']);
G.appendRow(['TIA MUTIARA, S.PD', '', '2222', 'IPA, MATEMATIKA', '7A, 7B', 'Ya']);
G.appendRow(['DEDE YUSUF R., S.PD', '', '3333', 'PJOK', '9', 'Ya']);
G.appendRow(['GURU NONAKTIF', '', '4444', 'IPS', '8A', 'Tidak']);
G.appendRow(['GURU SALAH', '', '5555', 'SENI RUPA, BAHASA SUNDA', '8Z', 'Ya']);
const S = ss.getSheetByName('Siswa');
for (const k of ['7A', '7B', '8A', '8B', '9A', '9B']) for (let i = 1; i <= 4; i++) S.appendRow(['00' + k + i, '', k + i, `SISWA ${k} ${i}`, k.slice(0, 1), k, 'P']);
// ujian yang sudah dibuat guru lewat aplikasi (kunci lengkap) -> dilewati
let r = POST({ action: 'login', guru: 'H. RIZAL ABDURRAHMAN, S.PD', pin: '1111' }); const tok = r.token;
r = POST({ action: 'saveExam', token: tok, exam: { nama: 'ASAS', mapel: 'INFORMATIKA', kelas: ['8A', '8B'], tingkat: '8', opsi: 'ABCD', kunci: 'A'.repeat(25), kktp: 75 } });
assert.strictEqual(r.result, 'success', JSON.stringify(r));

const rc = ctx.rencanaUjianASAS();
const U = ss.getSheetByName('Ujian'), nUjian0 = U.getLastRow();
assert.strictEqual(nUjian0, 2, 'rencana tidak mengubah sheet Ujian');
assert.strictEqual(rc.baru, 4, 'INFO 9, IPA 7, MTK 7, PJOK 9: ' + JSON.stringify(rc)); assert.strictEqual(rc.ada, 1);
assert.ok(rc.catatan.some(c => /SENI RUPA/.test(c)) && rc.catatan.some(c => /8Z/.test(c)), 'mapel/rombel tak dikenal dilaporkan');
assert.ok(!rc.catatan.some(c => /NONAKTIF/.test(c)));
const plan = ss.getSheetByName('Rencana Ujian ASAS').getRange(4, 1, 6, 8).getValues();
assert.ok(plan.some(p => p[0] === 'H. RIZAL ABDURRAHMAN, S.PD' && p[2] === '8' && /Sudah ada/.test(p[6]) && /KKTP di sheet 75, tabel 73/.test(p[7])), 'KKTP beda dilaporkan');

const b = ctx.buatUjianASAS();
assert.strictEqual(b.dibuat, 4);
assert.strictEqual(ctx.buatUjianASAS().dibuat, 0, 'idempoten');
const rows = U.getRange(2, 1, U.getLastRow() - 1, 13).getValues();
const info9 = rows.find(x => x[2] === 'INFORMATIKA' && String(x[3]) === '9');
assert.deepStrictEqual([info9[1], info9[4], info9[5], info9[8], info9[9], info9[10], info9[11]], ['ASAS', '9A', 'H. RIZAL ABDURRAHMAN, S.PD', '?'.repeat(25), 25, 75, 'Aktif']);
const ipa7 = rows.find(x => x[2] === 'IPA'); assert.strictEqual(ipa7[4], '7A, 7B'); assert.strictEqual(ipa7[6], '2026-12-02'); assert.strictEqual(ipa7[10], 71);
const mtk7 = rows.find(x => x[2] === 'MATEMATIKA'); assert.strictEqual(mtk7[6], '2026-12-01');
const pj = rows.find(x => x[2] === 'PJOK'); assert.strictEqual(String(pj[3]), '9'); assert.strictEqual(String(pj[4]), '9'); assert.strictEqual(pj[10], 77);
assert.ok(new Set(rows.map(x => x[0])).size === rows.length, 'ID unik');

// aplikasi melihat ujian baru; guru memindai dengan kunci "?" lalu mengisi kunci -> skor dihitung ulang
r = POST({ action: 'exams', token: tok });
const ex9 = r.ujian.find(u => u.mapel === 'INFORMATIKA' && String(u.tingkat) === '9');
assert.ok(ex9 && ex9.jumlah === 25 && /\?{25}/.test(ex9.kunci), 'ujian baru tampil di aplikasi');
r = POST({ action: 'save', token: tok, examId: ex9.id, siswa: { nama: 'SISWA 9A 1', kelas: '9A' }, answers: 'ABCDABCDABCDABCDABCDABCDA'.split('') });
assert.strictEqual(r.result, 'success'); assert.strictEqual(r.benar, 0, 'kunci "?" -> 0 dulu');
r = POST({ action: 'saveExam', token: tok, exam: { id: ex9.id, nama: 'ASAS', mapel: 'INFORMATIKA', kelas: ['9A'], tingkat: '9', opsi: 'ABCD', kunci: 'ABCDABCDABCDABCDABCDABCDD', kktp: 75 } });
assert.strictEqual(r.result, 'success', JSON.stringify(r));
const d = ctx.perbaruiDashboardASAS();
const H = ss.getSheetByName('HasilScan'), hr = H.getRange(2, 1, 1, 17).getValues()[0];
assert.strictEqual(hr[9], 24); assert.strictEqual(hr[11], 96, 'Benar/Skor HasilScan dihitung ulang dari kunci baru');
assert.strictEqual(d.ujian, 5); assert.strictEqual(d.terscan, 1);
const D = ss.getSheetByName('Dashboard ASAS'), all = D.getRange(1, 1, 40, 8).getValues().map(r => r.join('|')).join('\n');
assert.ok(/PROGRES SCAN/.test(all) && /INFORMATIKA\|—\|—\|0\/4\|0\/4\|1\/4\|—/.test(all), all);
assert.ok(/RATA-RATA SKOR[\s\S]*INFORMATIKA\|—\|—\|\|\|96\|—/.test(all), all);
console.log(`ASAS massal OK${process.env.BT_GAS_BUNDLE ? ' (bundel minified)' : ''}: 4 ujian dibuat + 1 dilewati, idempoten, skor dihitung ulang setelah kunci diisi, dashboard ${d.ujian} ujian`);
