// Regresi struktur siswa impor Dapodik: Kelas=8, Tingkat=A -> rombel 8A.
const assert = require('node:assert/strict');
const { createGas } = require('./gas_mock.js');
const { ctx, ss, POST, GET, mintLicense } = createGas();
ctx.setup();
const sk = ss.getSheetByName('Sekolah');
sk.getRange(1, 2).setValue('SMPN 2 JALAKSANA');
sk.getRange(10, 2).setValue(mintLicense());
const g = ss.getSheetByName('Guru');
g.appendRow(['GURU IPA', '', '1111', 'IPA', '8A,8B,9', 'Ya']);
const students = ss.getSheetByName('Siswa');
for (const [nm, kelas, tingkat] of [
  ['ANDI 8A', '8','A'],
  ['BUDI 8B', '8','B'],
  ['CITRA 8D', '8','D'],
  ['DEDE 9A', '9','A'],
  ['ERNA 9B', '9','B'],
  ['FADLI 7A', '7','A']
]) students.appendRow(['1234', '', '', nm, kelas, tingkat, 'L']);
const tok = POST({action:'login',guru:'GURU IPA',pin:'1111'}).token;
const all = POST({action:'exams',token:tok});
assert.equal(all.license,'Terdaftar');
assert.deepEqual(all.siswa.map(s=>s.kelas).sort(), ['8A','8B','9A','9B']);
assert.deepEqual(all.siswa.filter(s=>s.kelas==='8A').map(s=>s.tingkat), ['8']);
const create = POST({action:'saveExam',token:tok,exam:{nama:'ASAS',mapel:'IPA',kelas:['8'],opsi:'ABCD',kunci:'ABCD',kktp:75}});
assert.equal(create.result, 'success', create.error);
const examId=create.id;
const allowed = POST({action:'save',token:tok,examId,siswa:{nama:'ANDI 8A',kelas:'8A'},answers:['A','B','C','D']});
assert.equal(allowed.result,'success',allowed.error);
const denied = POST({action:'save',token:tok,examId,siswa:{nama:'CITRA 8D',kelas:'8D'},answers:['A','B','C','D']});
assert.ok(denied.error,'guru tidak boleh menyimpan siswa luar rombel tugas meskipun ujian kelas=8');
const old = ss.getSheetByName('Siswa');
old.appendRow(['12345', '', '', 'FORMAT LAMA', '8A', '8', 'L']);
ctx.ROWS_CACHE_={};
assert.ok(POST({action:'exams',token:tok}).siswa.some(s=>s.nama==='FORMAT LAMA'));
sk.getRange(10,2).setValue('Belum Terdaftar');
const demo=POST({action:'exams',token:tok});
assert.equal(GET('config').sekolah.license,'Demo');
assert.equal(demo.siswa.length,5);
assert.ok(demo.siswa.every(s=>s.nama.includes('(DEMO)')));
assert.ok(!demo.siswa.some(s=>s.nama==='ANDI 8A'));
assert.ok(POST({action:'save',token:tok,examId,siswa:{nama:'ANDI 8A',kelas:'8A'},answers:['A','B','C','D']}).error);
console.log('PASS roster grade/rombel: tugas guru, kelas tingkat 8, format lama, demo revoke');
