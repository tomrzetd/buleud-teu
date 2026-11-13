// Dapodik schema migration/compatibility smoke checks without touching school data.
const assert = require('node:assert/strict');
const { createGas } = require('./gas_mock.js');

// Fresh v2 school: one `Tingkat Pendidikan` per student and full `Nama Rombel`.
{
  const {ctx,ss,POST,mintLicense} = createGas();
  ctx.setup();
  const siswa = ss.getSheetByName('Siswa');
  assert.deepEqual(siswa.getRange(1,5,1,2).getValues()[0],
    ['Tingkat Pendidikan','Nama Rombel']);
  siswa.appendRow(['0123','0005','08002','SISWA DELAPAN A',8,'8A','P']);
  siswa.appendRow(['0456','0006','08003','SISWA DELAPAN B',8,'8B','L']);
  siswa.appendRow(['0789','0007','07004','SISWA TUJUH',7,'7A','P']);
  siswa.appendRow(['0890','0008','10001','SISWA SMA',10,'X IPA 1','P']);
  ss.getSheetByName('Guru').appendRow(['GURU TEST','','1234','IPA','8A,8B,7','Ya']);
  ss.getSheetByName('Sekolah').getRange(10,2).setValue(mintLicense());
  const tok = POST({action:'login',guru:'GURU TEST',pin:'1234'}).token;
  const all = POST({action:'exams',token:tok});
  assert.deepEqual(all.siswa.map(x=>x.kelas).sort(),['7A','8A','8B']);
  assert.ok(all.siswa.every(x => x.tingkat === x.kelas.substring(0,1)));
  const ujian = POST({action:'saveExam',token:tok,exam:
    {nama:'ASAS',mapel:'IPA',kelas:['8'],opsi:'ABCD',kunci:'ABCD'}});
  assert.equal(ujian.result,'success',ujian.error);
  const save = POST({action:'save',token:tok,examId:ujian.id,
    siswa:{nama:'SISWA DELAPAN A',kelas:'8A'},answers:['A','B','C','D']});
  assert.equal(save.result,'success',save.error);
  assert.equal(ss.getSheetByName('HasilScan').getRange(2,5).getValue(),'8A');
  assert.equal(POST({action:'analyze',token:tok,examId:ujian.id,lingkup:'tingkat'}).result,'success');
}

// Legacy v1 school: E=Kelas 8, F=Tingkat A. Running setup migrates
// values + headers atomically at each sheet; other identity fields unchanged.
{
  const {ctx,ss}=createGas();
  ctx.setup();
  const siswa = ss.getSheetByName('Siswa');
  siswa.getRange(1,5,1,2).setValues([['Kelas','Tingkat']]);
  siswa.appendRow(['000012','000099','07001','ANAK A',7,'A','L']);
  siswa.appendRow(['000013','000100','08001','ANAK B',8,'B','P']);
  const firstBefore = siswa.getRange(2,1,2,4).getValues();
  ctx.setup();
  assert.deepEqual(siswa.getRange(1,5,1,2).getValues()[0],['Tingkat Pendidikan','Nama Rombel']);
  assert.deepEqual(siswa.getRange(2,5,2,2).getValues(),[['7','7A'],['8','8B']]);
  assert.deepEqual(siswa.getRange(2,1,2,4).getValues(), firstBefore);
  const once = siswa.getRange(2,5,2,2).getValues();
  ctx.setup();
  assert.deepEqual(siswa.getRange(2,5,2,2).getValues(), once);
}

// Ambiguous migration must abort without changing a single cell.
{
  const {ctx,ss}=createGas();
  ctx.setup();
  const siswa = ss.getSheetByName('Siswa');
  siswa.getRange(1,5,1,2).setValues([['Kelas','Tingkat']]);
  siswa.appendRow(['','','','ERROR',8,'?','L']);
  const before=siswa.getRange(1,5,2,2).getValues();
  assert.throws(()=>ctx.setup(),/migrasi dibatalkan|Migrasi dibatalkan/);
  assert.deepEqual(siswa.getRange(1,5,2,2).getValues(),before);
}

// Existing CSV formats and other jenjang keep stable class identifiers.
{
  const {ctx}=createGas();
  ctx.setup();
  const parse = x=>ctx.siswaInfo_(Object.assign({Nama:'TES',NISN:'', 'Nomor Peserta':''},x));
  assert.deepEqual([parse({'Kelas':'8','Tingkat':'A'}).tingkat,parse({'Kelas':'8','Tingkat':'A'}).kelas],['8','8A']);
  assert.deepEqual([parse({'Kelas':'8A','Tingkat':'8'}).tingkat,parse({'Kelas':'8A','Tingkat':'8'}).kelas],['8','8A']);
  assert.deepEqual([parse({'Tingkat Pendidikan':'8','Nama Rombel':'8A'}).tingkat,parse({'Tingkat Pendidikan':'8','Nama Rombel':'8A'}).kelas],['8','8A']);
  assert.deepEqual([parse({'Tingkat Pendidikan':'8A','Nama Rombel':'8'}).tingkat,parse({'Tingkat Pendidikan':'8A','Nama Rombel':'8'}).kelas],['8','8A']);
  assert.equal(parse({'Tingkat Pendidikan':'10','Nama Rombel':'X IPA 1'}).kelas,'X IPA 1');
  assert.equal(parse({'Tingkat Pendidikan':'2','Nama Rombel':'2B'}).kelas,'2B');
}
console.log('PASS Dapodik v2 schema, v1 migration, no destructive failure, stable JSON and statistics');