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
const body={ action:'save', token, examId: exam.id,
    siswa:{nama:'SISWA UJI',kelas:'8A',nomor:'0042'},
    answers:['A','B','C','D'],flags:[],mode:'marker-android',quality:'A96',scanId:id
};
const first = POST(body);
assert.equal(first.result,'success',first.error);
assert.equal(first.skor,100);
const afterFirst = ss.getSheetByName('HasilScan').getLastRow();
const retry = POST(body);
assert.equal(retry.result,'success',retry.error);
assert.equal(retry.duplikat,true,'repeated ScanID updates existing row');
assert.equal(ss.getSheetByName('HasilScan').getLastRow(), afterFirst,'no duplicate when server ACK is lost');
const different = {...body, scanId:'other-scan-id', answers:['B','B','C','D']};
assert.equal(POST(different).result,'success');
assert.equal(ss.getSheetByName('HasilScan').getLastRow(), afterFirst+1,
    'new physically scanned attempt with new ScanID may be appended');
console.log('PASS outbox replay: duplicate-safe ScanID and independent subsequent scans');
