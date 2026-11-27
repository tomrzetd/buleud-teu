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
// mode rekap (REKAP_KEY): nama & nilai per siswa hanya muncul di mode ini
const rk = hitungTv_({ ujian: F.ujian, siswa: F.siswa.map((x, i) => Object.assign({ NISN: String(500 + i) }, x)), hasil: [{ Waktu: '2026-12-01 09:00:00', 'ID Ujian': 'MTK07-ASAS2026A', 'Nama Rombel': '7A', NISN: '500', Nama: 'S7A0', Skor: '80' }], sekolah: {} }, '2026-12-01', '', TV_DEFAULT, true);
assert.strictEqual(rk.mode, 'rekap'); assert.strictEqual(rk.rekap.rombel['7A'].length, 29); assert.strictEqual(rk.rekap.rombel['7A'].find(x => x.nama === 'S7A0').n.MATEMATIKA, 80);
assert.strictEqual(d.rekap, null, 'mode TV tidak membawa data siswa');
// ujian bersama: satu baris, dua guru -> dua kartu dengan rombel masing-masing
const ub = F.ujian.filter(u => u.ID === 'BIND08-ASAS2026A').map(u => Object.assign({}, u, { Guru: 'Eti Suhaeti, S.Pd; Ikah Kartikah, S.Pd.' }));
const gb = hitungTv_({ ujian: ub, siswa: F.siswa, hasil: [], guru: [{ Nama: 'Eti Suhaeti, S.Pd', 'Mapel (pisah koma)': 'B. Indonesia', 'Tingkat/Rombel Diampu (pisah koma)': '8A,8B' }, { Nama: 'Ikah Kartikah, S.Pd.', 'Mapel (pisah koma)': 'B. Indonesia', 'Tingkat/Rombel Diampu (pisah koma)': '8C,8D,9E' }], sekolah: {} }, '2026-11-27', '', TV_DEFAULT);
assert.deepStrictEqual(gb.guru.map(g => g.guru + ':' + g.rombel + ':' + g.target).sort(), ['Eti Suhaeti, S.Pd:8A 8B:56', 'Ikah Kartikah, S.Pd.:8C 8D:55']);
// ujian ber-uraian: pakai Nilai Akhir, siswa tanpa nilai uraian tidak dirata-rata
const ue = F.ujian.map(u => u.ID === 'MTK07-ASAS2026A' ? Object.assign({}, u, { 'Poin PG': '3', 'Uraian Maks': '10,15' }) : u);
const he = [{ Waktu: '2026-12-01 09:00:00', 'ID Ujian': 'MTK07-ASAS2026A', 'Nama Rombel': '7A', NISN: '500', Nama: 'S7A0', Skor: '80', 'Nilai Akhir': '90' },
  { Waktu: '2026-12-01 09:01:00', 'ID Ujian': 'MTK07-ASAS2026A', 'Nama Rombel': '7A', NISN: '501', Nama: 'S7A1', Skor: '60', 'Nilai Akhir': '' }];
const es = hitungTv_({ ujian: ue, siswa: F.siswa.map((x, i) => Object.assign({ NISN: String(500 + i) }, x)), hasil: he, sekolah: {} }, '2026-12-01', '', TV_DEFAULT, true);
assert.strictEqual(es.sel['MATEMATIKA|7A'].n, 2, 'tetap terhitung masuk'); assert.strictEqual(es.sel['MATEMATIKA|7A'].rata, 90); assert.strictEqual(es.sel['MATEMATIKA|7A'].mu, 1);
assert.strictEqual(es.kpi.menunggu, 1); assert.strictEqual(es.kpi.rata, 90);
const r1 = es.rekap.rombel['7A'].find(x => x.nama === 'S7A1'); assert.ok('MATEMATIKA' in r1.n && r1.n.MATEMATIKA === null && r1.rata === null);
console.log(`Dashboard TV OK: ${d.rombel.length} rombel × ${d.mapel.length} mapel, ${d.kpi.masuk}/${d.kpi.target} lembar, tanpa data pribadi`);
