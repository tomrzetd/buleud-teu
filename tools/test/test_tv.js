// Uji Dashboard TV Pokja (apps-script-tv/Kode.gs): agregat tanpa nama siswa, cakupan rombel, scan terakhir menang.
const assert = require('assert');
const { hitungTv_, TV_DEFAULT } = require('../../apps-script-tv/Kode.gs');
const F = require('./tv_fixture.js');
const d = hitungTv_({ ujian: F.ujian, siswa: F.siswa, hasil: F.hasilSim, sekolah: F.sekolah }, '2026-12-02', '2026-12-02 10:00:00', TV_DEFAULT);
assert.strictEqual(d.rombel.length, 19); assert.strictEqual(d.kpi.siswa, 548); assert.strictEqual(d.kpi.ujian, 51);
assert.ok(!d.sel['PPKN|7A'], 'PPKn kelas 7 tidak diujikan'); assert.strictEqual(d.sel['PJOK|9A'].t, 32);
assert.strictEqual(d.mapel[0].mapel, 'INFORMATIKA'); assert.ok(d.jadwal.find(j => j.tanggal === '2026-12-02').mapel.some(m => m.mapel === 'IPA'));
assert.strictEqual(d.kpi.kunciKosong, 51, 'kunci contoh terdeteksi');
const json = JSON.stringify(d); assert.ok(!/S7A1|8A-0|NISN/i.test(json) && !('siswa' in d), 'tidak ada nama/NISN siswa');
// scan ulang siswa yang sama: dihitung sekali, nilai terakhir dipakai
const h2 = [{ Waktu: '2026-12-01 08:00:00', 'ID Ujian': 'MTK07-ASAS2026A', 'Nama Rombel': '7A', NISN: '111', Nama: 'X', Skor: '40' },
  { Waktu: '2026-12-01 09:00:00', 'ID Ujian': 'MTK07-ASAS2026A', 'Nama Rombel': '7A', NISN: '111', Nama: 'X', Skor: '80' }];
const e = hitungTv_({ ujian: F.ujian, siswa: F.siswa, hasil: h2, sekolah: {} }, '2026-12-01', '', TV_DEFAULT);
assert.strictEqual(e.sel['MATEMATIKA|7A'].n, 1); assert.strictEqual(e.sel['MATEMATIKA|7A'].rata, 80); assert.strictEqual(e.sel['MATEMATIKA|7A'].tuntas, 100);
assert.strictEqual(e.guru.find(g => g.mapel === 'PAIBP').status, 'kunci');
console.log(`Dashboard TV OK: ${d.rombel.length} rombel × ${d.mapel.length} mapel, ${d.kpi.masuk}/${d.kpi.target} lembar, tanpa data pribadi`);
