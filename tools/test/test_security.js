// Uji regresi keamanan & integritas statistik (temuan audit 6 Nov 2026) — Code.gs asli di layanan Google tiruan.
// Pemakaian: node tools/test/test_security.js
const assert = require('assert');
const { createGas } = require('./gas_mock.js');
const S = require('../../apps-script/Statistik.gs');
const { ctx, ss, POST } = createGas();
ctx.setup();
// Uji keamanan produksi memakai lisensi terdaftar; mode demo dites terpisah.
ss.getSheetByName('Sekolah').getRange(10, 2).setValue('Terdaftar');
const sh = (n) => ss.getSheetByName(n);
sh('Guru').appendRow(['GURU A', 'a@x.id', '1111', 'IPA', '7A, 7B', 'Ya']);
sh('Guru').appendRow(['GURU B', '', '2222', 'IPA', '7A', 'Ya']);
for (const [k, n] of [['7A', 6], ['7B', 6], ['8A', 3]]) for (let i = 1; i <= n; i++) sh('Siswa').appendRow([`9${k.charCodeAt(1)}${i}`, '', '', `SISWA ${k} ${i}`, k, '', 'L']);
sh('Siswa').appendRow(['', '', '', 'KEMBAR', '7A', '', 'L']); sh('Siswa').appendRow(['', '', '', 'KEMBAR', '7A', '', 'P']);
const tA = POST({ action: 'login', guru: 'GURU A', pin: '1111' }).token, tB = POST({ action: 'login', guru: 'GURU B', pin: '2222' }).token;
const ok = (r, m) => assert.ok(!r.error, (m || '') + ' — ' + r.error);
const ditolak = (r, re, m) => { assert.ok(r.error, m + ' seharusnya ditolak'); if (re) assert.ok(re.test(r.error), m + ': pesan "' + r.error + '"'); };
let n = 0; const lulus = (m) => { n++; console.log('  ✓ ' + m); };

// ---------- KEY-01: kunci tak sah ditolak, posisi tidak bergeser
ditolak(POST({ action: 'saveExam', token: tA, exam: { nama: 'X', mapel: 'IPA', kelas: ['7A'], opsi: 'ABCD', kunci: 'A?BC' } }), /nomor 2 "\?"/, 'kunci A?BC');
ditolak(POST({ action: 'saveExam', token: tA, exam: { nama: 'X', mapel: 'IPA', kelas: ['7A'], opsi: 'ABCD', kunci: 'ABEC' } }), /nomor 3 "E"/, 'kunci E pada opsi ABCD');
const e1 = POST({ action: 'saveExam', token: tA, exam: { nama: 'UH 1', mapel: 'IPA', kelas: ['7A', '7B'], opsi: 'ABCD', kunci: 'AB CD ABCD', kktp: 0 } }); ok(e1, 'kunci dengan spasi');
assert.strictEqual(e1.jumlah, 8); lulus('KEY-01 kunci tak sah ditolak dengan nomor posisinya; spasi diabaikan; jumlah soal tetap');
// kunci yang diedit manual di sheet dengan karakter salah: posisi tetap, nomor itu Audit kritis
const ex = ctx.getUjian_(e1.id); assert.strictEqual(ex.kktp, 0, 'KKTP 0 tetap 0'); lulus('STAT-06 KKTP 0 tidak berubah menjadi 75');
ditolak(POST({ action: 'saveExam', token: tA, exam: { nama: 'X', mapel: 'IPA', kelas: ['7A'], opsi: 'ABCD', kunci: 'AB', kktp: 150 } }), /KKTP/, 'KKTP 150');
ditolak(POST({ action: 'saveExam', token: tA, exam: { nama: 'X', mapel: 'IPA', kelas: ['7A'], opsi: 'ABCD', kunci: 'AB', kktp: 'abc' } }), /KKTP/, 'KKTP abc'); lulus('STAT-06 KKTP di luar 0–100 / bukan angka ditolak');
const rk = S.analisisButir([{ jawaban: 'ABCD' }, { jawaban: 'ABCA' }, { jawaban: 'AACD' }], 'A?CD', 'ABCD', 75);
assert.strictEqual(rk.k, 4); assert.strictEqual(rk.butir[2].kunci, 'C', 'nomor 3 tidak bergeser'); assert.strictEqual(rk.butir[1].rekomendasi, 'Audit kritis');
lulus('KEY-01 kunci tersimpan rusak: posisi dipertahankan, nomor rusak ditandai Audit kritis');

// ---------- SEC-01: kepemilikan ujian
const save = (tok, nama, kelas, extra) => POST(Object.assign({ action: 'save', token: tok, examId: e1.id, siswa: { nama, kelas }, answers: [...'ABCDABCD'] }, extra || {}));
ditolak(save(tB, 'SISWA 7A 1', '7A'), /milik guru lain/, 'Guru B menyimpan ke ujian Guru A');
ditolak(POST({ action: 'analyze', token: tB, examId: e1.id }), /milik guru lain/, 'Guru B menganalisis');
ditolak(POST({ action: 'bank', token: tB, examId: e1.id }), /milik guru lain/, 'Guru B bank soal');
ditolak(POST({ action: 'report', token: tB, examId: e1.id }), /milik guru lain/, 'Guru B laporan');
ditolak(POST({ action: 'saveExam', token: tB, exam: { id: e1.id, nama: 'ambil alih', mapel: 'IPA', kunci: 'AAAA' } }), /milik guru lain/, 'Guru B mengubah ujian');
ditolak(POST({ action: 'archiveExam', token: tB, id: e1.id }), /milik guru lain/, 'Guru B mengarsipkan');
assert.ok(!POST({ action: 'exams', token: tB }).ujian.some(u => u.id === e1.id), 'ujian Guru A tidak tampil untuk Guru B');
assert.strictEqual(POST({ action: 'analyze', token: tB, examId: e1.id }).forbidden, true);
lulus('SEC-01 Guru B ditolak: simpan, analisis, bank, laporan, ubah, arsip, dan daftar ujian');

// ---------- SEC-02: siswa harus di roster & peserta ujian
ditolak(save(tA, 'SISWA PALSU', '7A'), /tidak ada di sheet Siswa/, 'siswa palsu');
ditolak(save(tA, 'SISWA 8A 1', '8A'), /bukan peserta ujian/, 'siswa kelas lain');
ditolak(save(tA, 'SISWA 7A 1', '7B'), /bukan peserta ujian/, 'kelas dipalsukan');
ditolak(save(tA, 'KEMBAR', '7A'), /lebih dari satu siswa/, 'nama kembar tanpa NISN');
const r1 = save(tA, '  siswa   7a 1 ', '7a', { siswa: { nama: '  siswa   7a 1 ', kelas: '7a', nisn: '999', nomor: '=1+1' } }); ok(r1, 'nama dinormalisasi');
const row1 = sh('HasilScan').getRange(2, 1, 1, 17).getValues()[0];
assert.strictEqual(row1[5], 'SISWA 7A 1'); assert.strictEqual(String(row1[6]).replace(/^'/, ''), '9651', 'NISN dari roster, bukan dari aplikasi');
lulus('SEC-02 siswa palsu / kelas lain / kelas dipalsukan / nama kembar ditolak; identitas diambil dari roster');

// ---------- SYNC-01: ScanID idempoten
const before = sh('HasilScan').getLastRow();
ok(save(tA, 'SISWA 7A 2', '7A', { scanId: 'abc123' })); const r2 = save(tA, 'SISWA 7A 2', '7A', { scanId: 'abc123', answers: [...'AAAAAAAA'] });
ok(r2); assert.strictEqual(r2.duplikat, true); assert.strictEqual(sh('HasilScan').getLastRow(), before + 1, 'kiriman ulang tidak menambah baris');
assert.strictEqual(r2.benar, 2, 'baris diperbarui dengan jawaban terbaru');
lulus('SYNC-01 kiriman ulang dengan ScanID sama memperbarui baris, tidak menduplikasi');

// ---------- SEC-03: guru dinonaktifkan kehilangan akses walau token masih berlaku
const tB2 = POST({ action: 'login', guru: 'GURU B', pin: '2222' }).token;
const gb = ctx.rows_('Guru').find(r => r['Nama'] === 'GURU B'); sh('Guru').getRange(gb._row, 6).setValue('Tidak'); ctx.ROWS_CACHE_ = {};
const rx = POST({ action: 'exams', token: tB2 }); ditolak(rx, /tidak aktif/, 'token guru nonaktif'); assert.strictEqual(rx.auth, true);
lulus('SEC-03 status Aktif guru diperiksa di setiap permintaan');

// ---------- formula injection
const e2 = POST({ action: 'saveExam', token: tA, exam: { nama: '=HYPERLINK("http://x","klik")', mapel: '+IPA', kelas: ['7A'], opsi: 'ABCD', kunci: 'AB' } }); ok(e2);
const ur = ctx.rows_('Ujian').find(r => r['ID'] === e2.id);
assert.ok(String(sh('Ujian').getRange(ur._row, 2).getValue()).startsWith("'="), 'nama ujian disimpan sebagai teks');
lulus('Formula injection: teks diawali = + - @ disimpan sebagai teks');

// ---------- ujian diarsipkan tidak menerima hasil
ok(POST({ action: 'archiveExam', token: tA, id: e2.id })); ditolak(POST({ action: 'save', token: tA, examId: e2.id, siswa: { nama: 'SISWA 7A 1', kelas: '7A' }, answers: ['A', 'B'] }), /diarsipkan/, 'simpan ke ujian arsip');
lulus('Ujian yang diarsipkan menolak hasil baru');

// ---------- STAT-01: kelompok atas/bawah tidak bergantung urutan saat skor seri
const key = 'ABCDABCDAB';
const pola = ['ABCDABCDAB', 'ABCDABCDAA', 'ABCDABCDCC', 'BBCDABCDCC', 'BBCDABCDCC', 'ABCAABCACC', 'CBCAABCACC', 'ABAAAACACC', 'DBAAAACACC', 'ABAAAAAAAA',
  'CDAAAAAAAA', 'ABCDDDDDDD', 'BACDDDDDDD', 'DDDDABCDAB', 'CCCCABCDAB', 'ABCDBBBBBB', 'DCBAABCDAB', 'ABCDDCBADC', 'BADCABCDAB', 'ABCDCDABAB',
  'CDABABCDAB', 'AAAAAAAAAA', 'BBBBBBBBBB', 'ABCDABCDCD'];
const resp = pola.map((j, i) => ({ nama: 'S' + i, kelas: '7A', jawaban: j }));
const sig = (R) => JSON.stringify(R.butir.map(b => [b.d, b.p, b.rpbis, b.pengecohBerfungsi, b.rekomendasi]));
const base = S.analisisButir(resp, key, 'ABCD', 75); let beda = 0;
for (let t = 0; t < 200; t++) { const p = resp.map(x => [Math.sin(t * 999 + x.nama.length * 7 + Number(x.nama.slice(1))) , x]).sort((a, b) => a[0] - b[0]).map(x => x[1]); if (sig(S.analisisButir(p, key, 'ABCD', 75)) !== sig(base)) beda++; }
assert.strictEqual(beda, 0, 'statistik berubah karena urutan data');
lulus('STAT-01 D, pengecoh, dan rekomendasi identik pada 200 urutan acak data yang sama (skor seri)');

// ---------- STAT-02/03/04: label & rekomendasi
const besar = []; for (let i = 0; i < 30; i++) besar.push({ nama: 'B' + i, kelas: '7A', jawaban: i < 15 ? 'ABCDABCDCA' : 'BACDDDDDAB' });
const Rb = S.analisisButir(besar, key, 'ABCD', 75);
assert.ok(!Rb.butir.some(b => b.rekomendasi === 'Dibuang'), 'tidak ada label Dibuang');
assert.ok(Rb.butir.every(b => ['Memadai', 'Rendah', '-'].includes(b.korelasi)), 'label korelasi 3 keadaan');
const kecil = S.analisisButir(resp.slice(0, 12), key, 'ABCD', 75);
assert.ok(kecil.butir.every(b => ['Data kurang', 'Audit kritis', '-'].includes(b.rekomendasi)), 'n < 20 tanpa Diterima/Direvisi');
const semuaBenar = S.analisisButir(resp.map(r => ({ ...r, jawaban: 'A' + r.jawaban.slice(1) })), key, 'ABCD', 75);
assert.strictEqual(semuaBenar.butir[0].korelasi, '-'); assert.strictEqual(semuaBenar.butir[0].valid, null);
assert.ok(Rb.ringkasan.teksRekomendasi.includes('Audit kritis')); assert.strictEqual(Rb.ringkasan.dibuang, Rb.ringkasan.auditKritis, 'kompatibel versi lama');
lulus('STAT-02/03/04 korelasi Memadai/Rendah/-, tidak ada "Dibuang" otomatis (Audit kritis), n < 20 → Data kurang');

// ---------- STAT-05: pengecoh seri atas = bawah tidak dihitung berfungsi
const dis = []; for (let i = 0; i < 20; i++) dis.push({ nama: 'D' + i, kelas: '7A', jawaban: (i < 5 ? 'A' : i < 10 ? 'B' : i < 15 ? 'A' : 'B') + 'BCDABCDAB'.slice(0, 9) });
const Rd = S.analisisButir(dis.map((r, i) => ({ ...r, jawaban: r.jawaban.slice(0, 1) + (i % 2 ? 'BCDABCDAB' : 'BCDABCDAA') })), key, 'ABCD', 75);
assert.ok(Rd.butir[0].pengecohMati.includes('B') || Rd.butir[0].sebaran.B.bawah > Rd.butir[0].sebaran.B.atas, 'pengecoh seri tidak lolos');
lulus('STAT-05 pengecoh hanya berfungsi bila LEBIH banyak dipilih kelompok bawah');

console.log(`Uji keamanan & integritas: ${n} kelompok lulus`);
