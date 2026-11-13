// Regression: a mobile outbox can replay after a lost server acknowledgement
// without duplicating rows or losing the last confirmed answer.
const assert = require('node:assert/strict');
const { createGas } = require('./gas_mock.js');
const { ctx, ss, POST, mintLicense } = createGas();
ctx.setup();
ss.getSheetByName('Sekolah').getRange(10, 2).setValue(mintLicense());
ss.getSheetByName('Guru').appendRow(['GURU SCAN', '', '1234', 'INFORMATIKA', '8A', 'Ya']);
ss.getSheetByName('Siswa').appendRow(['001','','0042','SISWA UJI','8','A','L']);
const login = POST({action:'login', guru:'GURU SCAN', pin:'1234'});
assert.equal(login.result, 'success', login.error);
const token = login.token;
const exam = POST({action:'saveExam',token,exam:{
    nama:'ASAS',mapel:'INFORMATIKA',kelas:['8A'],opsi:'ABCD',kunci:'ABCD',kktp:75
}});
assert.equal(exam.result,'success',exam.error);
const id='7f1b1e06-b7f1-43b0-a331-c4f10ab650ef';
const startedAt = Date.now() - 120000;
const body={ action:'save', token, examId: exam.id,
    siswa:{nama:'SISWA UJI',kelas:'8A',nomor:'0042'},
    answers:['A','B','C','D'],flags:[],mode:'marker-android',quality:'A96',scanId:id, capturedAt:startedAt
};
const first = POST(body);
assert.equal(first.result,'success',first.error);
assert.equal(first.skor,100);
const afterFirst = ss.getSheetByName('HasilScan').getLastRow();
const retry = POST(body);
assert.equal(retry.result,'success',retry.error);
assert.equal(retry.duplikat,true,'repeated ScanID updates existing row');
assert.equal(ss.getSheetByName('HasilScan').getLastRow(), afterFirst,'no duplicate when server ACK is lost');
const different = {...body, scanId:'other-scan-id', capturedAt:startedAt+60000, answers:['B','B','C','D']};
const rescan = POST(different);
assert.equal(rescan.result,'success',rescan.error);
assert.equal(rescan.diperbarui,true,'physical rescan is update, not append');
assert.equal(ss.getSheetByName('HasilScan').getLastRow(), afterFirst,
    'same exam+same roster student never creates another row');
assert.equal(Number(ss.getSheetByName('HasilScan').getRange(2,12).getValue()),75,
    'latest answers and score replace old score');
// A stale older offline retry MUST NOT overwrite a newer correction.
const oldRetry = POST(body);
assert.equal(oldRetry.result, 'success', oldRetry.error);
assert.equal(oldRetry.usang, true, 'older ScanID accepted as no-op');
assert.equal(Number(ss.getSheetByName('HasilScan').getRange(2,12).getValue()),75,
    'older replay cannot overwrite newer score');
const danger = {...different, siswa:{nama:'SISWA LAIN',kelas:'8A'}, scanId:'other-scan-id'};
ss.getSheetByName('Siswa').appendRow(['2','','0043','SISWA LAIN','8','A','P']);
assert.ok(POST(danger).error,'ScanID cannot be replayed against another roster student');
assert.equal(ss.getSheetByName('HasilScan').getLastRow(), afterFirst,
    'tampered or swapped identity cannot write');
const second = POST({...danger,scanId:'different-person'});
assert.equal(second.result,'success',second.error);
assert.equal(ss.getSheetByName('HasilScan').getLastRow(),afterFirst+1,
    'different student may add a new row');
console.log('PASS outbox replay: same ScanID retry + new ScanID rescan upsert, identity isolation');
