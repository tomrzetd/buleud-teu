// Signed-license regressions: no plaintext unlock, tamper, copied school, expired, revoke.
// This validates the REAL Apps Script implementation under a local GAS mock.
const assert = require('node:assert/strict');
const { createGas } = require('./gas_mock.js');
const { ctx, ss, POST, GET, mintLicense } = createGas();
ctx.setup();
const school = ss.getSheetByName('Sekolah');
const teacher = ss.getSheetByName('Guru');
teacher.appendRow(['GURU TES', '', '1234', 'IPA', '8A', 'Ya']);
const student = ss.getSheetByName('Siswa');
student.appendRow(['1','','1','SISWA TES','8','A','L']);
const token = POST({ action: 'login', guru: 'GURU TES', pin: '1234' }).token;
function check(active, description) {
    const conf = GET('config');
    const exams = POST({action:'exams',token});
    assert.equal(conf.sekolah.licensed, active, description + ' config');
    assert.equal(exams.licensed, active, description + ' roster');
    assert.equal(exams.siswa.length, active ? 1 : 5, description + ' roster privacy');
}
check(false, 'blank');
school.getRange(10,2).setValue('Terdaftar');
check(false, 'plaintext insecure MUST remain demo');
const valid = mintLicense();
school.getRange(10,2).setValue(valid);
check(true, 'valid license');
const tampered = valid.slice(0,-1)+(valid.slice(-1)==='A'?'B':'A');
school.getRange(10,2).setValue(tampered);
check(false, 'tampered signature');
school.getRange(10,2).setValue(mintLicense('school','DIFFERENT_SPREADSHEET'));
check(false, 'copied school ID');
school.getRange(10,2).setValue(mintLicense('school',ss.getId(),-60));
check(false, 'expired license');
const saveError = POST({action:'saveExam',token,exam:{nama:'Ujian',mapel:'IPA',kelas:['8A'],opsi:'ABCD',kunci:'ABCD'}});
assert.ok(saveError.error, 'server blocks writes for expired license');
school.getRange(10,2).setValue(mintLicense());
const saveOK = POST({action:'saveExam',token,exam:{nama:'Ujian',mapel:'IPA',kelas:['8A'],opsi:'ABCD',kunci:'ABCD'}});
assert.equal(saveOK.result,'success',saveOK.error);
school.getRange(10,2).setValue('');
assert.ok(POST({action:'save',token,examId:saveOK.id,siswa:{nama:'SISWA TES',kelas:'8A'},answers:['A','B','C','D']}).error,'revoke effective on each write');
console.log('PASS signed licensing: plaintext, tamper, copied school, expiry, revoke, write protection');
