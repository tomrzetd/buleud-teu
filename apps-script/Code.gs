/*
 * BULEUD TEU — Apps Script V40  ("Buleud teu? Mun buleud, ku urang dipariksa!")
 * Satu spreadsheet per sekolah. File: Code.gs + Statistik.gs (atau BuleudTeu_lengkap.gs hasil build).
 *
 * Sheet: Sekolah · Guru · Siswa · Ujian · HasilScan · BankSoal · AN_<ujian>_<lingkup> (analisis)
 * API  : GET  ?action=config|ping
 *        POST {action:'login'|'exams'|'saveExam'|'archiveExam'|'save'|'ocr'|'analyze'|'bank', ...}
 */
var VERSION = 'V40';
var SH = { SEKOLAH: 'Sekolah', GURU: 'Guru', SISWA: 'Siswa', UJIAN: 'Ujian', HASIL: 'HasilScan', BANK: 'BankSoal' };
var HEAD = {
  Guru: ['Nama', 'Email', 'PIN', 'Mapel (pisah koma)', 'Tingkat/Rombel Diampu (pisah koma)', 'Aktif'],
  Siswa: ['NISN', 'NIS', 'Nomor Peserta', 'Nama', 'Tingkat Pendidikan', 'Nama Rombel', 'L/P'],
  Ujian: ['ID', 'Nama Ujian', 'Mapel', 'Tingkat Pendidikan', 'Nama Rombel', 'Guru', 'Tanggal', 'Opsi', 'Kunci', 'Jumlah Soal', 'KKTP', 'Status', 'Dibuat', 'Poin PG', 'Uraian Maks'],
  HasilScan: ['Waktu', 'ID Ujian', 'Mapel', 'Tingkat Pendidikan', 'Nama Rombel', 'Nama', 'NISN', 'Nomor Peserta', 'Jawaban', 'Benar', 'Jumlah Soal', 'Skor', 'Ditandai', 'Mode', 'Kualitas', 'Guru', 'ScanID', 'Uraian', 'Nilai Akhir'],
  BankSoal: ['Kode Soal', 'Mapel', 'Tingkat Pendidikan', 'Lingkup', 'ID Ujian', 'Nama Ujian', 'No', 'Kunci', 'N', 'P', 'TK', 'D', 'DP', 'r pbis', 'r tabel', 'Valid', 'KR20 jika dihapus', 'Pengecoh Berfungsi', 'Pengecoh Mati', 'Rekomendasi', 'Alasan', 'Tanggal Analisis', 'Status Guru', 'Catatan']
};
var SEKOLAH_KEYS = ['Nama Sekolah', 'NPSN', 'Jenjang (SD/SMP/SMA/SMK)', 'Alamat', 'Kota/Kabupaten', 'Kepala Sekolah', 'NIP Kepala Sekolah', 'Tahun Pelajaran', 'Logo (ID file Google Drive)', 'License'];

// ---------------------------------------------------------------- util
function doc_() {
  // SHEET_ID (Setelan proyek → Properti skrip) diutamakan, supaya skrip yang terikat ke spreadsheet lain
  // (mis. sheet respons) tetap membaca database sekolah yang benar.
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) { throw new Error('SHEET_ID tidak bisa dibuka (' + id + '): ' + e.message); } }
  try { var d = SpreadsheetApp.getActiveSpreadsheet(); if (d) return d; } catch (e) {}
  throw new Error('Spreadsheet tidak ditemukan. Isi Properti skrip SHEET_ID atau jalankan menu Buleud Teu → Setup dari spreadsheet sekolah.');
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function sheet_(name) { var s = doc_().getSheetByName(name); if (!s) throw new Error('Sheet "' + name + '" belum ada. Jalankan menu Buleud Teu → Setup.'); return s; }
var ROWS_CACHE_ = {};   // cache baca per eksekusi (dibersihkan setiap kali menulis)
function rows_(name) {
  if (ROWS_CACHE_[name]) return ROWS_CACHE_[name];
  var s = sheet_(name), lr = s.getLastRow(), lc = s.getLastColumn();
  if (lr < 2) return [];
  var head = s.getRange(1, 1, 1, lc).getDisplayValues()[0];
  return (ROWS_CACHE_[name] = s.getRange(2, 1, lr - 1, lc).getDisplayValues().map(function (r, i) {
    var o = { _row: i + 2 };
    head.forEach(function (h, j) { o[h] = String(r[j] == null ? '' : r[j]).trim(); });
    // ALIAS BACA, bukan memindahkan data. Engine statistik, laporan, API lama,
    // Android, x86 dan PWA tetap memakai kode internal kelas '8A'.
    if (name === SH.GURU) o['Kelas (pisah koma)'] = o['Tingkat/Rombel Diampu (pisah koma)'] || o['Kelas (pisah koma)'] || '';
    if (name === SH.UJIAN || name === SH.HASIL || name === SH.BANK) {
      o['Tingkat'] = o['Tingkat Pendidikan'] || o['Tingkat'] || '';
      if (name !== SH.BANK) o['Kelas'] = o['Nama Rombel'] || o['Kelas'] || '';
    }
    return o;
  }));
}
function splitList_(s) { return String(s || '').split(/[,;]/).map(function (x) { return x.trim().toUpperCase(); }).filter(String); }
function now_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'); }
/** kunci tersimpan: hanya spasi yang dibuang; karakter tak sah dipertahankan sebagai '?' agar nomor soal tidak bergeser */
function cleanKey_(k) { return String(k || '').toUpperCase().replace(/\s+/g, '').replace(/[^A-E]/g, '?'); }
/** kunci baru dari guru: DITOLAK bila ada karakter tak sah (bukan dihapus diam-diam) */
function parseKey_(k, opsi) {
  var s = String(k || '').toUpperCase().replace(/\s+/g, ''), salah = [];
  for (var i = 0; i < s.length; i++) if (opsi.indexOf(s.charAt(i)) < 0) salah.push('nomor ' + (i + 1) + ' "' + s.charAt(i) + '"');
  if (salah.length) throw new Error('Kunci tidak sah (opsi ' + opsi + '): ' + salah.slice(0, 5).join(', ') + (salah.length > 5 ? ', …' : '') + '. Perbaiki di posisi tersebut.');
  if (s.length < 1 || s.length > 50) throw new Error('Kunci harus 1–50 huruf (jumlah soal = panjang kunci).');
  return s;
}
/** KKTP 0–100; kosong = 75; nilai tak sah ditolak (bukan diam-diam menjadi 75) */
function parseKktp_(v) {
  if (v === '' || v == null) return 75;
  var n = Number(v);
  if (!isFinite(n) || n < 0 || n > 100) throw new Error('KKTP harus angka 0–100.');
  return n;
}
/** cegah formula injection: teks yang diawali = + - @ disimpan sebagai teks */
function safe_(v) { v = String(v == null ? '' : v); return /^[=+\-@\t\r]/.test(v) ? "'" + v : v; }
function normNama_(v) { return String(v || '').toUpperCase().replace(/\s+/g, ' ').trim(); }
/** hanya pemilik ujian yang boleh menyimpan, menganalisis, mengirim ke bank, dan membuat laporan */
/** Ujian bersama: kolom Guru boleh berisi beberapa nama dipisah titik koma (soal & kunci sama satu tingkat,
 *  guru pengampu/pemeriksa berbeda). Nama guru sendiri boleh mengandung koma ("Sahudin, S.Pd."). */
function daftarGuru_(s) { return String(s || '').split(/\s*[;\n]\s*/).map(function (x) { return x.trim(); }).filter(String); }
function guruBoleh_(u, nama) { var n = String(nama || '').toUpperCase().trim(); return daftarGuru_(u.guru).some(function (x) { return x.toUpperCase() === n; }); }
function assertPemilik_(g, u) {
  if (!guruBoleh_(u, g.nama)) { var e = new Error('Ujian ini milik guru lain (' + u.guru + '). Akses ditolak.'); e.forbidden = true; throw e; }
}

// ---------------------------------------------------------------- konfigurasi sekolah
function sekolah_() {
  var s = doc_().getSheetByName(SH.SEKOLAH), o = {};
  if (!s || s.getLastRow() < 1) return o;
  s.getRange(1, 1, s.getLastRow(), 2).getDisplayValues().forEach(function (r) { if (r[0]) o[String(r[0]).trim()] = String(r[1]).trim(); });
  return {
    nama: o['Nama Sekolah'] || '', npsn: o['NPSN'] || '', jenjang: (o['Jenjang (SD/SMP/SMA/SMK)'] || '').toUpperCase(),
    alamat: o['Alamat'] || '', kota: o['Kota/Kabupaten'] || '', kepala: o['Kepala Sekolah'] || '', nipKepala: o['NIP Kepala Sekolah'] || '',
    tahun: o['Tahun Pelajaran'] || '', logoId: o['Logo (ID file Google Drive)'] || '',
    licenseToken: o['License'] || ''
  };
}
/**
 * Status lisensi ditetapkan SERVER; KODE rahasia (HMAC key) HANYA dalam
 * Script Properties BT_LICENSE_HMAC_KEY, tidak di source, APK, ataupun Sheet.
 *
 * License di sheet Sekolah!B10: BTL1.<base64url(payload)>.<HMAC-SHA256>.
 * Token lama 'Terdaftar' TIDAK berlaku sebagai lisensi produksi.
 * Disalin ke sekolah lain, diubah tier/tanggal, atau kadaluarsa -> DEMO.
 */
function lisensiInfo_() {
  var inactive = { active: false, tier: 'demo', expiresAt: 0 };
  var code = String(sekolah_().licenseToken || '').trim();
  if (!/^BTL1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(code)) return inactive;
  var key = PropertiesService.getScriptProperties().getProperty('BT_LICENSE_HMAC_KEY');
  if (!key || key.length < 40) return inactive;
  try {
    var parts = code.split('.');
    var msg = parts[0] + '.' + parts[1];
    var expected = Utilities.base64EncodeWebSafe(
      Utilities.computeHmacSha256Signature(msg, key, Utilities.Charset.UTF_8)
    ).replace(/=+$/, '');
    if (parts[2].length !== expected.length) return inactive;
    var mismatch = 0;
    for (var j = 0; j < expected.length; j++) mismatch |= parts[2].charCodeAt(j) ^ expected.charCodeAt(j);
    if (mismatch) return inactive;
    // Normalisasi padding agar decoder Apps Script menerima token base64url dari Python.
    var b64payload = parts[1] + '==='.slice(0, (4 - parts[1].length % 4) % 4);
    var decoded = Utilities.newBlob(Utilities.base64DecodeWebSafe(b64payload)).getDataAsString('UTF-8');
    var payload = JSON.parse(decoded);
    var now = Math.floor(Date.now() / 1000);
    if (payload.v !== 1 || payload.product !== 'buleud-teu' ||
        payload.sid !== doc_().getId() || !/^(school|pro)$/.test(payload.tier) ||
        !Number.isFinite(payload.iat) || !Number.isFinite(payload.exp) ||
        payload.iat > now + 300 || payload.exp <= now ||
        payload.exp - payload.iat > 3650 * 86400) return inactive;
    return { active: true, tier: payload.tier, expiresAt: payload.exp };
  } catch (e) { return inactive; }
}
function lisensi_() { return lisensiInfo_().active; }
function wajibTerdaftar_() {
  if (!lisensi_()) {
    var e = new Error('Aktivasi aplikasi belum valid atau masa berlaku telah berakhir. Hubungi administrator.');
    e.forbidden = true; throw e;
  }
}
function opsiDefault_(jenjang) { return /SMA|SMK|MA\b/.test(String(jenjang).toUpperCase()) ? 'ABCDE' : 'ABCD'; }
function logoDataUrl_(id) {
  if (!id) return '';
  try {
    var m = String(id).match(/[-\w]{25,}/); var f = DriveApp.getFileById(m ? m[0] : id), b = f.getBlob();
    if (b.getBytes().length > 300000) return '';
    return 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes());
  } catch (e) { return ''; }
}

// ---------------------------------------------------------------- token (login guru)
function login_(nama, pin) {
  var cache = CacheService.getScriptCache(), kGagal = 'gagal_' + String(nama).toUpperCase();
  var gagal = Number(cache.get(kGagal) || 0);
  if (gagal >= 5) throw new Error('Terlalu banyak PIN salah. Coba lagi 10 menit lagi.');
  var g = rows_(SH.GURU).filter(function (r) { return r['Nama'].toUpperCase() === String(nama).toUpperCase() && !/^(TIDAK|NO|N)$/i.test(r['Aktif']); })[0];
  if (!g || String(g['PIN']) !== String(pin)) { cache.put(kGagal, String(gagal + 1), 600); throw new Error('Nama guru atau PIN salah.'); }
  cache.remove(kGagal);
  var token = Utilities.getUuid();
  cache.put('tok_' + token, g['Nama'], 21600); // 6 jam
  return { token: token, guru: guruInfo_(g) };
}
function guruInfo_(g) { return { nama: g['Nama'], mapel: splitList_(g['Mapel (pisah koma)']), kelas: splitList_(g['Kelas (pisah koma)']) }; }
function auth_(token) {
  var nama = token ? CacheService.getScriptCache().get('tok_' + token) : null;
  if (!nama) { var e = new Error('Sesi berakhir, silakan masuk lagi.'); e.auth = true; throw e; }
  var g = rows_(SH.GURU).filter(function (r) { return r['Nama'] === nama; })[0];
  // diperiksa setiap permintaan: guru yang dihapus / dinonaktifkan langsung kehilangan akses walau token masih berlaku
  if (!g || /^(TIDAK|NO|N)$/i.test(g['Aktif'])) { CacheService.getScriptCache().remove('tok_' + token); var e2 = new Error('Akun guru tidak aktif. Hubungi operator sekolah.'); e2.auth = true; throw e2; }
  return guruInfo_(g);
}

// ---------------------------------------------------------------- data ujian & siswa
function ujianRow_(r) {
  var kunci = cleanKey_(r['Kunci']);
  return { id: r['ID'], nama: r['Nama Ujian'], mapel: r['Mapel'].toUpperCase(), tingkat: r['Tingkat'], kelas: splitList_(r['Kelas']),
    guru: r['Guru'], tanggal: r['Tanggal'], opsi: r['Opsi'] === 'ABCDE' ? 'ABCDE' : 'ABCD', kunci: kunci, jumlah: kunci.length,
    kktp: (r['KKTP'] === '' || !isFinite(Number(r['KKTP']))) ? 75 : Number(r['KKTP']), status: r['Status'] || 'Aktif', _row: r._row,
    poinPG: poinPG_(r['Poin PG']), uraianMaks: uraianMaks_(r['Uraian Maks']) };
}
// ---------------------------------------------------------------- nilai uraian (esai)
// Nilai akhir = (jumlah benar PG × Poin PG) + jumlah skor tiap soal uraian; total maksimum wajib 100.
// Analisis butir, KR-20, bank soal TETAP hanya memakai jawaban PG.
function poinPG_(v) { var n = Number(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) && n > 0 ? n : 0; }
function uraianMaks_(v) { return String(v == null ? '' : v).split(/[;,\s]+/).filter(String).map(function (x) { return Number(x.replace(',', '.')); }).filter(function (x) { return isFinite(x) && x > 0; }); }
function adaNilaiAkhir_(u) { return u.poinPG > 0 || u.uraianMaks.length > 0; }
function nilaiMaks_(u) { return Math.round((u.jumlah * u.poinPG + u.uraianMaks.reduce(function (a, b) { return a + b; }, 0)) * 100) / 100; }
/** skor tiap soal uraian dari sel ("5,4,,3") -> array panjang = jumlah soal uraian, '' = belum dinilai */
function uraianSkor_(v, u) {
  var a = String(v == null ? '' : v).replace(/^'/, '').split(','), out = [];
  for (var i = 0; i < u.uraianMaks.length; i++) { var x = String(a[i] == null ? '' : a[i]).trim(); out.push(x === '' || !isFinite(Number(x)) ? '' : Number(x)); }
  return out;
}
/** null bila ujian tanpa uraian/poin (pakai Skor PG) atau uraian belum lengkap ("menunggu uraian") */
function hitungNilaiAkhir_(u, benar, uraian) {
  if (!adaNilaiAkhir_(u)) return null;
  var sum = 0;
  for (var i = 0; i < u.uraianMaks.length; i++) { if (uraian[i] === '' || uraian[i] == null) return null; sum += Number(uraian[i]); }
  return Math.round((benar * u.poinPG + sum) * 100) / 100;
}
/** pastikan kolom tambahan ada di baris judul (urutan HEAD); kembalikan nomor kolom (1-based) */
function kolom_(nama, judul) {
  var sh = sheet_(nama), lc = Math.max(1, sh.getLastColumn()), h = sh.getRange(1, 1, 1, lc).getDisplayValues()[0];
  var i = h.indexOf(judul); if (i >= 0) return i + 1;
  var want = HEAD[nama] || [], pos = want.indexOf(judul);
  // tambahkan semua kolom HEAD yang belum ada, berurutan, di ujung kanan
  want.slice(0, pos + 1).forEach(function (x) { if (h.indexOf(x) < 0) { h.push(x); sh.getRange(1, h.length).setValue(x).setFontWeight('bold').setBackground('#e0e7ff'); } });
  ROWS_CACHE_ = {};
  return h.indexOf(judul) + 1;
}
function validasiNilai_(jumlah, poin, maks) {
  if (!poin && !maks.length) return;
  if (!(poin > 0)) throw new Error('Isi Poin PG (poin per jawaban benar) bila ujian memakai soal uraian.');
  if (maks.length > 20) throw new Error('Soal uraian maksimal 20.');
  var total = jumlah * poin + maks.reduce(function (a, b) { return a + b; }, 0);
  if (Math.abs(total - 100) > 0.01) throw new Error('Total nilai harus 100: ' + jumlah + ' PG × ' + poin + ' + uraian ' + maks.join('+') + ' = ' + (Math.round(total * 100) / 100) + '.');
}
function getUjian_(id) {
  var r = rows_(SH.UJIAN).filter(function (x) { return x['ID'] === id; })[0];
  if (!r) throw new Error('Ujian ' + id + ' tidak ditemukan.');
  return ujianRow_(r);
}
/**
 * Dapodik: Tingkat Pendidikan (1–12) + Nama Rombel (7A, VIII-A,
 * X IPA 1, dll). Kode JSON `kelas` tetap adalah nama rombel penuh,
 * untuk menjaga engine scan, OCR, status terscan, nilai dan statistik.
 *
 * Baca tiga struktur: v2 Dapodik, v1 terbalik (Kelas=8,Tingkat=A),
 * dan v1 normal (Kelas=8A,Tingkat=8). Tidak menebak kelas yang ambigu.
 */
function tingkatKode_(raw) {
  var t = String(raw == null ? '' : raw).trim().toUpperCase();
  if (/^(1[0-2]|[1-9])$/.test(t)) return t;
  var n = typeof tingkatDariKelas === 'function' ? tingkatDariKelas(t) : null;
  return n >= 1 && n <= 12 ? String(n) : '';
}
function rombelKode_(raw, grade) {
  var r = String(raw == null ? '' : raw).trim().toUpperCase();
  if (!r) return '';
  // 8 A / 8-A / 8.A -> 8A, khusus penamaan sederhana.
  var m = r.match(/^(1[0-2]|[1-9])[\s.\-]+([A-Z]{1,2})$/);
  if (m) r = m[1] + m[2];
  // Nama Rombel 'A' pada ekspor lama dapat dibaca dengan tingkat tegas.
  if (/^[A-Z]{1,2}$/.test(r) && grade) return grade + r;
  return r;
}
function siswaInfo_(s) {
  var isV2 = Object.prototype.hasOwnProperty.call(s, 'Tingkat Pendidikan') ||
    Object.prototype.hasOwnProperty.call(s, 'Nama Rombel');
  var grade = '', kelas = '';
  if (isV2) {
    var primary = String(s['Tingkat Pendidikan'] || '').trim().toUpperCase();
    var secondary = String(s['Nama Rombel'] || '').trim().toUpperCase();
    // Graceful import: data CSV lawas kadang sudah punya E=8A F=8,
    // walaupun header baru. Hasil tetap 8A, bukan kelas '8'.
    if (!secondary && primary && !/^(1[0-2]|[1-9])$/.test(primary)) {
      // CSV lama sering hanya mengisi nama kelas lengkap E=7A, F kosong.
      grade = tingkatKode_(primary); kelas = rombelKode_(primary, grade);
    } else if (!/^(1[0-2]|[1-9])$/.test(primary) &&
        /^(1[0-2]|[1-9])$/.test(secondary) &&
        tingkatKode_(primary) === secondary) {
      grade = secondary;
      kelas = rombelKode_(primary, grade);
    } else {
      grade = tingkatKode_(primary);
      kelas = rombelKode_(secondary, grade);
      if (!grade && kelas) grade = tingkatKode_(kelas);
    }
  } else {
    var a = String(s['Kelas'] || '').trim().toUpperCase();
    var b = String(s['Tingkat'] || '').trim().toUpperCase();
    if (/^(1[0-2]|[1-9])$/.test(a) && /^[A-Z]{1,2}$/.test(b)) {
      grade = a; kelas = a + b;
    } else {
      kelas = rombelKode_(a, '');
      grade = tingkatKode_(b) || tingkatKode_(kelas);
    }
  }
  return { nama: normNama_(s['Nama']), kelas: kelas, rombel: kelas,
    nomor: s['Nomor Peserta'], nisn: s['NISN'],
    tingkat: grade, tingkatPendidikan: grade };
}
/** Kode lama "8" berarti seluruh rombel tingkat 8; "8A" hanya 8A. */
function cocokKelas_(kelasList, s) {
  if (!kelasList || !kelasList.length || kelasList.indexOf('SEMUA') >= 0) return true;
  return kelasList.some(function (k) {
    var x = String(k).toUpperCase().replace(/\s+/g, '');
    return x === s.kelas || x === s.tingkat;
  });
}
function siswaUntuk_(kelasList, tingkat) {
  var all = !kelasList || !kelasList.length || kelasList.indexOf('SEMUA') >= 0;
  return rows_(SH.SISWA).map(siswaInfo_).filter(function (s) {
    return cocokKelas_(kelasList, s) && (!all || !tingkat || s.tingkat === String(tingkat));
  }).filter(function (s) { return !!s.nama && !!s.kelas && !!s.tingkat; });
}
/** 5 nama sintetis, tidak pernah mengambil roster asli saat status Demo. */
function siswaDemo_(g) {
  var pool = ['ALYA NURFADILA (DEMO)', 'BIMA PRATAMA (DEMO)',
    'CITRA MAHARANI (DEMO)', 'DANIS WICAKSONO (DEMO)', 'EKA PUTRI (DEMO)',
    'FARHAN RAMADHAN (DEMO)', 'GITA AMELIA (DEMO)', 'HADI PRATAMA (DEMO)'];
  var seed = String(g.nama || '').split('').reduce(function (n, ch) { return n + ch.charCodeAt(0); }, 0);
  var kelas = g.kelas.length ? g.kelas[0] : '8A';
  return Array.from({ length: 5 }, function (_, i) {
    var x = pool[(seed + i * 3) % pool.length], grade = (/^(7|8|9|10|11|12)/.exec(kelas) || [])[1] || '8';
    return { nama: x, kelas: kelas, nomor: String(i + 1).padStart(3, '0'), nisn: '', tingkat: grade, demo: true };
  });
}

// ---------------------------------------------------------------- HTTP
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || 'config';
    if (action === 'ping') return json_({ ok: true, version: VERSION });
    var sk = sekolah_();
    var guru = rows_(SH.GURU).filter(function (r) { return r['Nama'] && !/^(TIDAK|NO|N)$/i.test(r['Aktif']); })
      .map(function (g) { var i = guruInfo_(g); return { nama: i.nama, mapel: i.mapel }; });
    var lic = lisensiInfo_();
    return json_({ status: 'connected', version: VERSION, sekolah: { nama: sk.nama, npsn: sk.npsn, jenjang: sk.jenjang, kota: sk.kota, tahun: sk.tahun, kepala: sk.kepala, opsiDefault: opsiDefault_(sk.jenjang), logo: logoDataUrl_(sk.logoId),
      licensed: lic.active, plan: lic.tier, expiresAt: lic.expiresAt,
      license: lic.active ? 'Terdaftar' : 'Demo' }, guru: guru });
  } catch (err) { return json_({ error: String(err.message || err) }); }
}

function doPost(e) {
  var data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return json_({ error: 'Data tidak valid' }); }
  try {
    switch (data.action) {
      case 'login': return json_(Object.assign({ result: 'success' }, login_(data.guru, data.pin)));
      case 'exams': return json_(apiExams_(data));
      case 'saveExam': return json_(withLock_(function () { return apiSaveExam_(data); }));
      case 'archiveExam': return json_(withLock_(function () { return apiArchiveExam_(data); }));
      case 'save': return json_(withLock_(function () { return apiSave_(data); }));
      case 'ocr': auth_(data.token); wajibTerdaftar_(); return json_({ result: 'success', text: ocrImage_(data.image) });
      case 'analyze': return json_(apiAnalyze_(data));
      case 'bank': return json_(withLock_(function () { return apiBank_(data); }));
      case 'essay': return json_(withLock_(function () { return apiEssay_(data); }));
      case 'essayList': return json_(apiEssayList_(data));
      case 'report': return json_(apiReport_(data));
      default: return json_({ error: 'Aksi tidak dikenal: ' + data.action });
    }
  } catch (err) { return json_({ error: String(err.message || err), auth: !!err.auth, forbidden: !!err.forbidden }); }
}
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Server sibuk, coba lagi.');
  ROWS_CACHE_ = {};
  try { return fn(); } finally { ROWS_CACHE_ = {}; lock.releaseLock(); }
}

function apiExams_(d) {
  var g = auth_(d.token);
  var ujian = rows_(SH.UJIAN).map(ujianRow_).filter(function (u) { return guruBoleh_(u, g.nama) && u.status !== 'Arsip'; });
  var registered = lisensi_();
  var siswa;
  if (!registered) {
    siswa = siswaDemo_(g);
  } else {
    var kelasSet = {};
    ujian.forEach(function (u) { siswaUntuk_(u.kelas, u.tingkat).forEach(function (s) {
      if (cocokKelas_(g.kelas, s)) kelasSet[s.kelas + '|' + s.nama] = s;
    }); });
    g.kelas.forEach(function (k) { siswaUntuk_([k]).forEach(function (s) { kelasSet[s.kelas + '|' + s.nama] = s; }); });
    siswa = Object.keys(kelasSet).map(function (k) { return kelasSet[k]; });
  }
  var cnt = {};
  if (registered) rows_(SH.HASIL).forEach(function (h) {
    var key = h['ID Ujian']; cnt[key] = cnt[key] || {}; cnt[key][h['Kelas'] + '|' + h['Nama']] = 1;
  });
  ujian.forEach(function (u) { u.terscan = registered ? Object.keys(cnt[u.id] || {}) : []; u.nilaiMaks = nilaiMaks_(u); delete u._row; });
  var kelasSemua = Array.from(new Set(siswa.map(function (s) { return s.kelas; }).concat(g.kelas))).sort();
  return { result: 'success', licensed: registered, license: registered ? 'Terdaftar' : 'Demo',
    guru: g, ujian: ujian, siswa: siswa, kelasSemua: kelasSemua, opsiDefault: opsiDefault_(sekolah_().jenjang) };
}

function apiSaveExam_(d) {
  var g = auth_(d.token); wajibTerdaftar_();
  var x = d.exam || {}, sh = sheet_(SH.UJIAN);
  if (!x.nama || !x.mapel) throw new Error('Nama ujian dan mapel wajib diisi.');
  var opsi = x.opsi === 'ABCDE' ? 'ABCDE' : 'ABCD';
  var kunci = parseKey_(x.kunci, opsi), kktp = parseKktp_(x.kktp);
  var kelas = (x.kelas || []).map(function (k) { return String(k).toUpperCase(); });
  var tingkat = x.tingkat || (kelas.length ? tingkatDariKelas(kelas[0]) : '') || '';
  var row = [x.id || '', safe_(x.nama), safe_(String(x.mapel).toUpperCase()), tingkat, safe_(kelas.join(', ') || 'SEMUA'), g.nama, x.tanggal || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'), opsi, kunci, kunci.length, kktp, 'Aktif', now_()];
  // nilai uraian: aplikasi lama tidak mengirim field ini -> pengaturan yang sudah ada dipertahankan
  var kirimNilai = x.poinPG !== undefined || x.uraian !== undefined, ex = null;
  if (x.id) {
    ex = rows_(SH.UJIAN).filter(function (r) { return r['ID'] === x.id; })[0];
    if (!ex) throw new Error('Ujian tidak ditemukan.');
    if (!guruBoleh_({ guru: ex['Guru'] }, g.nama)) throw new Error('Ujian ini milik guru lain.');
  }
  var poin = kirimNilai ? poinPG_(x.poinPG) : poinPG_(ex && ex['Poin PG']);
  var maks = kirimNilai ? (Array.isArray(x.uraian) ? x.uraian.map(Number).filter(function (v) { return isFinite(v) && v > 0; }) : uraianMaks_(x.uraian)) : uraianMaks_(ex && ex['Uraian Maks']);
  validasiNilai_(kunci.length, poin, maks);
  var rIdx;
  if (ex) {
    row[5] = ex['Guru'];   // ujian bersama: daftar guru tidak berubah saat salah satu guru mengedit kunci
    row[12] = ex['Dibuat'] || now_();
    sh.getRange(ex._row, 1, 1, row.length).setValues([row]);
    rIdx = ex._row;
  } else {
    row[0] = 'U' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMdd') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    sh.appendRow(row);
    rIdx = sh.getLastRow();
    sh.getRange(rIdx, 9).setNumberFormat('@').setValue(kunci);
  }
  if (kirimNilai) {
    sh.getRange(rIdx, kolom_(SH.UJIAN, 'Poin PG')).setValue(poin || '');
    sh.getRange(rIdx, kolom_(SH.UJIAN, 'Uraian Maks')).setNumberFormat('@').setValue(maks.join(','));
  }
  ROWS_CACHE_ = {};
  // kunci / komposisi nilai diubah setelah ada scan -> Benar, Skor, Nilai Akhir disesuaikan
  if (ex) hitungUlangHasil_(row[0]);
  return { result: 'success', id: row[0], jumlah: kunci.length, poinPG: poin, uraianMaks: maks };
}
/** aksi 'essay': simpan skor uraian per soal untuk siswa yang lembar PG-nya sudah dipindai */
function apiEssay_(d) {
  var g = auth_(d.token); wajibTerdaftar_();
  var u = getUjian_(d.examId); assertPemilik_(g, u);
  if (!u.uraianMaks.length) throw new Error('Ujian ini tidak memiliki soal uraian. Atur di Edit ujian.');
  var ps = pesertaUjian_(g, u, d.siswa || {}), nilai = cekUraian_(u, d.nilai || []);
  var milik = rows_(SH.HASIL).filter(function (h) { return h['ID Ujian'] === u.id && samaPesertaHasil_(h, ps); });
  var h = milik[milik.length - 1];
  if (!h) throw new Error('Lembar PG ' + ps.nama + ' belum dipindai. Pindai PG dulu, lalu isi nilai uraian.');
  var r = tulisNilaiAkhir_(u, h._row, Number(h['Benar']) || 0, nilai, null);
  return { result: 'success', siswa: ps.nama, kelas: ps.kelas, uraian: r.uraian, nilaiAkhir: r.nilaiAkhir };
}
/** aksi 'essayList': daftar siswa rombel guru untuk satu ujian + skor PG, uraian, nilai akhir */
function apiEssayList_(d) {
  var g = auth_(d.token); wajibTerdaftar_();
  var u = getUjian_(d.examId); assertPemilik_(g, u);
  var kls = String(d.kelas || '').toUpperCase();
  var siswa = siswaUntuk_(u.kelas, u.tingkat).filter(function (x) { return cocokKelas_(g.kelas, x) && (!kls || x.kelas === kls); });
  var hasil = rows_(SH.HASIL).filter(function (h) { return h['ID Ujian'] === u.id; });
  var list = siswa.map(function (x) {
    var m = hasil.filter(function (h) { return samaPesertaHasil_(h, x); }), h = m[m.length - 1];
    var benar = h ? Number(h['Benar']) || 0 : null, ur = h ? uraianSkor_(h['Uraian'], u) : u.uraianMaks.map(function () { return ''; });
    return { nama: x.nama, kelas: x.kelas, nisn: x.nisn, nomor: x.nomor, adaPG: !!h, benar: benar,
      skorPG: h ? Math.round(benar * u.poinPG * 100) / 100 : null, uraian: ur, nilaiAkhir: h ? hitungNilaiAkhir_(u, benar, ur) : null };
  }).sort(function (a, b) { return (a.kelas + a.nama).localeCompare(b.kelas + b.nama); });
  return { result: 'success', ujian: { id: u.id, poinPG: u.poinPG, uraianMaks: u.uraianMaks, nilaiMaks: nilaiMaks_(u), jumlah: u.jumlah, kktp: u.kktp }, siswa: list };
}
function apiArchiveExam_(d) {
  var g = auth_(d.token); wajibTerdaftar_();
  var u = getUjian_(d.id);
  if (!guruBoleh_(u, g.nama)) throw new Error('Ujian ini milik guru lain.');
  sheet_(SH.UJIAN).getRange(u._row, 12).setValue('Arsip');
  return { result: 'success' };
}

function apiSave_(d) {
  var g = auth_(d.token); wajibTerdaftar_();
  var u = getUjian_(d.examId), s = d.siswa || {};
  assertPemilik_(g, u);
  if (u.status === 'Arsip') throw new Error('Ujian sudah diarsipkan; hasil tidak dapat ditambahkan.');
  if (!s.nama) throw new Error('Nama siswa kosong.');
  // siswa harus ada di sheet Siswa DAN termasuk peserta ujian ini (identitas diambil dari roster, bukan dari aplikasi)
  var nm = normNama_(s.nama), kls = String(s.kelas || '').toUpperCase().trim();
  var peserta = siswaUntuk_(u.kelas, u.tingkat).filter(function (x) { return cocokKelas_(g.kelas, x) && normNama_(x.nama) === nm && (!kls || x.kelas === kls); });
  if (!peserta.length) {
    var diRoster = rows_(SH.SISWA).some(function (x) { return normNama_(x['Nama']) === nm; });
    throw new Error(diRoster ? 'Siswa ' + nm + (kls ? ' (' + kls + ')' : '') + ' bukan peserta ujian ini (kelas ujian: ' + (u.kelas.join(', ') || 'SEMUA') + ').' : 'Siswa ' + nm + ' tidak ada di sheet Siswa.');
  }
  if (peserta.length > 1) peserta = peserta.filter(function (x) { return !s.nisn || String(x.nisn) === String(s.nisn); });
  if (peserta.length !== 1) throw new Error('Ada lebih dari satu siswa bernama ' + nm + ' di kelas ' + kls + '. Isi NISN di sheet Siswa agar bisa dibedakan.');
  var ps = peserta[0];
  return simpanScan_(g, u, ps, d, s);
}
/** cari siswa peserta ujian di rombel guru (dipakai simpan scan & nilai uraian) */
function pesertaUjian_(g, u, s) {
  var nm = normNama_(s.nama), kls = String(s.kelas || '').toUpperCase().trim();
  var peserta = siswaUntuk_(u.kelas, u.tingkat).filter(function (x) { return cocokKelas_(g.kelas, x) && normNama_(x.nama) === nm && (!kls || x.kelas === kls); });
  if (peserta.length > 1) peserta = peserta.filter(function (x) { return !s.nisn || String(x.nisn) === String(s.nisn); });
  if (peserta.length !== 1) throw new Error(peserta.length ? 'Ada lebih dari satu siswa bernama ' + nm + '. Isi NISN di sheet Siswa.' : 'Siswa ' + nm + ' bukan peserta ujian ini di rombel Anda.');
  return peserta[0];
}
/** tulis kolom Uraian (opsional) + Nilai Akhir untuk satu baris HasilScan */
function tulisNilaiAkhir_(u, rowNo, benar, uraianBaru, uraianLama) {
  if (!adaNilaiAkhir_(u)) return { uraian: [], nilaiAkhir: null };
  var sh = sheet_(SH.HASIL);
  var ur = uraianBaru ? uraianBaru : uraianSkor_(uraianLama, u);
  if (uraianBaru) sh.getRange(rowNo, kolom_(SH.HASIL, 'Uraian')).setNumberFormat('@').setValue(ur.join(','));
  var na = hitungNilaiAkhir_(u, benar, ur);
  sh.getRange(rowNo, kolom_(SH.HASIL, 'Nilai Akhir')).setValue(na == null ? '' : na);
  return { uraian: ur, nilaiAkhir: na };
}
/** hitung ulang Benar/Skor (+ Nilai Akhir bila ada uraian) dari jawaban tersimpan; examId null = semua ujian. Pemanggil memegang lock. */
function hitungUlangHasil_(examId) {
  ROWS_CACHE_ = {};
  var byId = {}; rows_(SH.UJIAN).map(ujianRow_).forEach(function (u) { if (u.jumlah && !/\?/.test(u.kunci) && (!examId || u.id === examId)) byId[u.id] = u; });
  var sh = sheet_(SH.HASIL), head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
  var cB = head.indexOf('Benar') + 1, cS = head.indexOf('Skor') + 1, n = 0;
  if (cB < 1 || cS < 1) return 0;
  var cNA = head.indexOf('Nilai Akhir') + 1;
  rows_(SH.HASIL).forEach(function (h) {
    var u = byId[h['ID Ujian']]; if (!u) return;
    var jw = String(h['Jawaban'] || '').replace(/^'/, '').toUpperCase(), b = 0;
    for (var q = 0; q < u.jumlah; q++) if (jw.charAt(q) === u.kunci.charAt(q)) b++;
    var x = { benar: b, skor: u.jumlah ? Math.round(b / u.jumlah * 1e4) / 100 : 0 };
    if (Number(h['Benar']) !== x.benar || Math.abs(Number(h['Skor']) - x.skor) > 0.005) {
      sh.getRange(h._row, cB, 1, 1).setValue(x.benar); sh.getRange(h._row, cS, 1, 1).setValue(x.skor); n++;
    }
    var na = hitungNilaiAkhir_(u, x.benar, uraianSkor_(h['Uraian'], u)), lama = String(h['Nilai Akhir'] == null ? '' : h['Nilai Akhir']);
    var baru = na == null ? '' : String(na);
    if ((cNA || adaNilaiAkhir_(u)) && lama !== baru && !(lama !== '' && baru !== '' && Math.abs(Number(lama) - na) < 0.005)) {
      if (!cNA) { cNA = kolom_(SH.HASIL, 'Nilai Akhir'); }
      sh.getRange(h._row, cNA, 1, 1).setValue(baru === '' ? '' : na); n++;
    }
  });
  ROWS_CACHE_ = {};
  if (n) Logger.log('Skor dihitung ulang: ' + n + ' sel HasilScan (kunci/komposisi nilai berubah).');
  return n;
}
function cekUraian_(u, arr) {
  if (arr == null) return null;
  if (!u.uraianMaks.length) throw new Error('Ujian ini tidak memiliki soal uraian.');
  var out = [];
  for (var i = 0; i < u.uraianMaks.length; i++) {
    var v = arr[i];
    if (v === '' || v == null) { out.push(''); continue; }
    var n = Number(String(v).replace(',', '.'));
    if (!isFinite(n) || n < 0 || n > u.uraianMaks[i]) throw new Error('Skor uraian nomor ' + (i + 1) + ' harus 0–' + u.uraianMaks[i] + '.');
    out.push(Math.round(n * 100) / 100);
  }
  return out;
}
function simpanScan_(g, u, ps, d, s) {
  var uraianBaru = cekUraian_(u, d.uraian);
  var jw = (d.answers || []).slice(0, u.jumlah).map(function (a) { a = String(a || '-').toUpperCase(); return u.opsi.indexOf(a) >= 0 ? a : '-'; });
  while (jw.length < u.jumlah) jw.push('-');
  var benar = 0; for (var i = 0; i < u.jumlah; i++) if (jw[i] === u.kunci.charAt(i)) benar++;
  var skor = Math.round(benar / u.jumlah * 10000) / 100;
  var nomor = ps.nomor || String(s.nomor || '').replace(/\D/g, '');
  var scanId = String(d.scanId || '').replace(/[^\w-]/g, '').slice(0, 40);
  // Waktu pada sheet = saat scan disimpan di HP, bukan waktu antrean terkirim.
  // Memungkinkan retry offline lama tidak menimpa koreksi yang lebih baru.
  var tKlien = Number(d.capturedAt);
  var adaWaktuKlien = isFinite(tKlien) && tKlien > 1577836800000 && tKlien <= Date.now() + 300000;
  var waktu = adaWaktuKlien
    ? Utilities.formatDate(new Date(tKlien), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss') : now_();
  var row = [waktu, u.id, u.mapel, u.tingkat || tingkatDariKelas(ps.kelas) || '', ps.kelas, ps.nama, ps.nisn ? "'" + ps.nisn : '', nomor ? "'" + nomor : '',
    "'" + jw.join(''), benar, u.jumlah, skor, (d.flags || []).map(Number).filter(isFinite).join(','), safe_(String(d.mode || '').slice(0, 30)), safe_(String(d.quality || '').slice(0, 20)), g.nama, scanId];
  var sh = sheet_(SH.HASIL);
  var hasil = rows_(SH.HASIL).filter(function (h) { return h['ID Ujian'] === u.id; });
  // 1) Replay request identik ketika server sudah menyimpan, tetapi ACK ke HP hilang.
  var byId = scanId ? hasil.filter(function (h) { return String(h['ScanID'] || '') === scanId; })[0] : null;
  if (byId && !samaPesertaHasil_(byId, ps)) {
    throw new Error('ScanID sudah digunakan untuk siswa yang berbeda. Tidak ada data yang diubah.');
  }
  // 2) Scan ulang fisik menghasilkan ScanID BARU; tetap satu baris per ujian+siswa.
  // Bila ada duplikat historis, perbarui baris PALING AKHIR supaya algoritma
  // analisis (scan terakhir menang) dan nilai baru tetap konsisten.
  var milikSiswa = hasil.filter(function (h) { return samaPesertaHasil_(h, ps); });
  var target = byId || milikSiswa[milikSiswa.length - 1];
  if (target) {
    // Scan lama yang baru berhasil upload belakangan hanya di-ACK, tidak
    // menggantikan jawaban terbaru. Semua timestamp dari zona sekolah yang sama.
    var tersimpanPada = String(target['Waktu'] || '');
    if (adaWaktuKlien && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(tersimpanPada) &&
        tersimpanPada > waktu) {
      return { result: 'success', benar: Number(target['Benar']) || 0, jumlah: u.jumlah,
        skor: Number(target['Skor']) || 0, siswa: ps.nama, kelas: ps.kelas,
        duplikat: !!byId, usang: true };
    }
    sh.getRange(target._row, 1, 1, row.length).setValues([row]);
    var na1 = tulisNilaiAkhir_(u, target._row, benar, uraianBaru, target['Uraian']);   // uraian lama dipertahankan saat scan ulang PG
    return { result: 'success', benar: benar, jumlah: u.jumlah, skor: skor, uraian: na1.uraian, nilaiAkhir: na1.nilaiAkhir,
      siswa: ps.nama, kelas: ps.kelas, duplikat: !!byId, diperbarui: !byId };
  }
  sh.appendRow(row);
  var na2 = tulisNilaiAkhir_(u, sh.getLastRow(), benar, uraianBaru, '');
  return { result: 'success', benar: benar, jumlah: u.jumlah, skor: skor, uraian: na2.uraian, nilaiAkhir: na2.nilaiAkhir,
    siswa: ps.nama, kelas: ps.kelas, duplikat: false, diperbarui: false };
}
/** Aman terhadap NISN berawalan nol. Bila NISN salah satu kosong,
 * cocokkan kelas + nama terstandardisasi; tidak pernah cocok lintas ujian.
 * Bila kedua NISN berbeda, kedua siswa dianggap berbeda walau senama.
 */
function samaPesertaHasil_(h, ps) {
  var a = String(h['NISN'] || '').replace(/\D/g, '');
  var b = String(ps.nisn || '').replace(/\D/g, '');
  if (a && b) return a === b;
  return String(h['Kelas'] || '').trim().toUpperCase() === String(ps.kelas || '').trim().toUpperCase() &&
    normNama_(h['Nama']) === normNama_(ps.nama);
}
/** kunci identitas siswa untuk "scan terakhir menang": NISN bila ada, selain itu kelas|nama */
function kunciSiswa_(h) { var nisn = String(h['NISN'] || '').replace(/^'/, ''); return nisn ? 'NISN:' + nisn : h['Kelas'] + '|' + h['Nama']; }

// ---------------------------------------------------------------- analisis
function responsUjian_(u, lingkup, kelas) {
  var latest = {};
  rows_(SH.HASIL).forEach(function (h) {
    if (h['ID Ujian'] !== u.id) return;
    if (lingkup === 'kelas' && h['Kelas'].toUpperCase() !== String(kelas).toUpperCase()) return;
    latest[kunciSiswa_(h)] = { nama: h['Nama'], kelas: h['Kelas'], jawaban: h['Jawaban'].replace(/^'/, '') };   // scan terakhir menang
  });
  return Object.keys(latest).map(function (k) { return latest[k]; }).sort(function (a, b) { return (a.kelas + '|' + a.nama).localeCompare(b.kelas + '|' + b.nama); });
}

function analisisUjian(id, lingkup, kelas) {
  var u = getUjian_(id);
  lingkup = lingkup === 'kelas' ? 'kelas' : 'tingkat';
  var resp = responsUjian_(u, lingkup, kelas);
  var A = analisisButir(resp, u.kunci, u.opsi, u.kktp);
  var nama = ('AN_' + u.id + '_' + (lingkup === 'kelas' ? String(kelas).toUpperCase().replace(/\s+/g, '') : 'T' + (u.tingkat || ''))).slice(0, 90);
  tulisAnalisis_(nama, u, lingkup, kelas, A);
  return { sheet: nama, ujian: u, lingkup: lingkup, kelas: kelas || '', hasil: A };
}

function tulisAnalisis_(nama, u, lingkup, kelas, A) {
  var d = doc_(), sh = d.getSheetByName(nama);
  if (sh) sh.clear(); else sh = d.insertSheet(nama);
  var sk = sekolah_(), R = A.ringkasan || {}, row = 1;
  sh.getRange(row, 1).setValue('ANALISIS BUTIR SOAL — ' + (sk.nama || '')).setFontWeight('bold').setFontSize(13); row += 1;
  var info = [
    ['Ujian', u.nama + ' (' + u.id + ')'], ['Mapel', u.mapel], ['Lingkup', lingkup === 'kelas' ? 'Kelas ' + kelas : 'Tingkat ' + (u.tingkat || '-')],
    ['Jumlah siswa', A.n], ['Jumlah soal', A.k], ['Rata-rata skor', R.rataRata], ['Simpangan baku', R.sd], ['Median / Min / Maks', [R.median, R.min, R.max].join(' / ')],
    ['Reliabilitas KR-20', R.kr20 == null ? '-' : R.kr20 + ' (' + R.kategoriKr20 + ')' + (R.kr20 < 0 ? ' — negatif: butir tidak konsisten, periksa kunci' : '')], ['KR-21', R.kr21 == null ? '-' : R.kr21], ['SEM (dalam jumlah butir benar)', R.sem == null ? '-' : R.sem],
    ['r tabel (α 0,05)', R.rTabel], ['Tuntas (KKTP ' + A.kktp + ')', (R.tuntas || 0) + ' siswa (' + (R.persenTuntas || 0) + '%)'],
    ['Rekomendasi butir', R.teksRekomendasi || '-'],
    ['Dianalisis', now_()]
  ];
  sh.getRange(row, 1, info.length, 2).setValues(info.map(function (r) { return [r[0], r[1] == null ? '-' : r[1]]; }));
  sh.getRange(row, 1, info.length, 1).setFontWeight('bold');
  row += info.length;
  if (A.peringatan.length) { sh.getRange(row, 1).setValue('Catatan: ' + A.peringatan.join(' ')).setFontColor('#b45309'); row++; }
  row++;
  if (!A.butir.length) return;
  var letters = A.opsi.split('');
  var head = ['No', 'Kunci', 'Benar', 'P', 'TK', 'D', 'DP', 'r pbis', 'r tabel', 'Korelasi (r ≥ r tabel)', 'KR20 jika dihapus']
    .concat(letters.map(function (L) { return '% ' + L; })).concat(['% Kosong', 'Pengecoh Berfungsi', 'Rekomendasi', 'Alasan']);
  sh.getRange(row, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#e5e7eb');
  var body = A.butir.map(function (b) {
    return [b.no, b.kunci, b.benar, b.p, b.tk, b.d, b.dp, b.rpbis == null ? '-' : b.rpbis, b.rTabel == null ? '-' : b.rTabel, labelKorelasi(b.valid),
      b.kr20JikaDihapus == null ? '-' : b.kr20JikaDihapus]
      .concat(letters.map(function (L) { return Math.round(b.sebaran[L].p * 1000) / 10; }))
      .concat([Math.round(b.sebaran['-'].p * 1000) / 10, b.pengecohBerfungsi.join(', ') || '-', b.rekomendasi, b.alasan]);
  });
  sh.getRange(row + 1, 1, body.length, head.length).setValues(body);
  var warna = A.butir.map(function (b) { var c = b.rekomendasi === 'Diterima' ? '#dcfce7' : (b.rekomendasi === 'Audit kritis' ? '#fee2e2' : (b.rekomendasi === 'Direvisi' ? '#fef9c3' : '#f3f4f6')); return head.map(function () { return c; }); });
  sh.getRange(row + 1, 1, body.length, head.length).setBackgrounds(warna);
  row += body.length + 3;
  // tabel siswa + matriks benar/salah
  var sHead = ['No', 'Nama', 'Kelas', 'Benar', 'Skor', 'Tuntas'].concat(A.butir.map(function (b) { return 'Q' + b.no; }));
  sh.getRange(row, 1, 1, sHead.length).setValues([sHead]).setFontWeight('bold').setBackground('#e5e7eb');
  var sb = A.siswa.slice().sort(function (a, b) { return b.benar - a.benar; }).map(function (s, i) { return [i + 1, s.nama, s.kelas, s.benar, s.skor, s.tuntas ? 'Ya' : 'Tidak'].concat(s.vektor); });
  if (sb.length) sh.getRange(row + 1, 1, sb.length, sHead.length).setValues(sb);
  sh.setFrozenRows(0);
}

function apiAnalyze_(d) {
  assertPemilik_(auth_(d.token), getUjian_(d.examId)); wajibTerdaftar_();
  var r = analisisUjian(d.examId, d.lingkup, d.kelas);
  var A = r.hasil;
  return { result: 'success', sheet: r.sheet, ringkasan: A.ringkasan, peringatan: A.peringatan,
    butir: A.butir.map(function (b) { return { no: b.no, kunci: b.kunci, p: b.p, tk: b.tk, d: b.d, dp: b.dp, rpbis: b.rpbis, rTabel: b.rTabel, valid: b.valid, korelasi: b.korelasi, rekomendasi: b.rekomendasi, alasan: b.alasan, sebaran: b.sebaran,
      benar: b.benar, kr20JikaDihapus: b.kr20JikaDihapus, pengecohBerfungsi: b.pengecohBerfungsi, pengecohMati: b.pengecohMati }; }), n: A.n, opsi: A.opsi, sampelKecil: A.sampelKecil };
}

// simpan hasil analisis ke Bank Soal (upsert per Kode Soal + Lingkup)
function bankSoal(id, lingkup, kelas) {
  var r = analisisUjian(id, lingkup, kelas), u = r.ujian, A = r.hasil;
  if (!A.butir.length) throw new Error('Belum ada data scan untuk dianalisis.');
  var sh = sheet_(SH.BANK), ada = rows_(SH.BANK), idx = {};
  ada.forEach(function (b) { idx[b['Kode Soal'] + '|' + b['Lingkup']] = b._row; });
  var lk = r.lingkup === 'kelas' ? 'Kelas ' + r.kelas : 'Tingkat ' + (u.tingkat || '-');
  var tgl = now_(), baru = 0, ubah = 0;
  A.butir.forEach(function (b) {
    var kode = u.id + '-' + ('0' + b.no).slice(-2);
    var row = [kode, u.mapel, u.tingkat, lk, u.id, u.nama, b.no, b.kunci, A.n, b.p, b.tk, b.d, b.dp, b.rpbis, b.rTabel, labelKorelasi(b.valid), b.kr20JikaDihapus,
      b.pengecohBerfungsi.join(', '), b.pengecohMati.join(', '), b.rekomendasi, b.alasan, tgl];
    var r0 = idx[kode + '|' + lk];
    if (r0) { sh.getRange(r0, 1, 1, row.length).setValues([row]); ubah++; }
    else { sh.appendRow(row.concat([b.rekomendasi === 'Diterima' ? 'Pakai' : 'Telaah', ''])); baru++; }   // keputusan akhir oleh guru
  });
  return { result: 'success', baru: baru, diperbarui: ubah, sheet: r.sheet };
}
function apiBank_(d) { assertPemilik_(auth_(d.token), getUjian_(d.examId)); wajibTerdaftar_(); return bankSoal(d.examId, d.lingkup, d.kelas); }

// ---------------------------------------------------------------- OCR (Google Drive)
// Wajib: editor Apps Script → Layanan (+) → Drive API → Tambahkan.
function ocrImage_(base64) {
  if (!base64) throw new Error('gambar kosong');
  if (typeof Drive === 'undefined') throw new Error('Layanan "Drive API" belum ditambahkan di Apps Script.');
  var blob = Utilities.newBlob(Utilities.base64Decode(base64), 'image/jpeg', 'ljk_ocr.jpg'), file;
  if (Drive.Files.create) file = Drive.Files.create({ name: 'buleudteu_ocr_tmp', mimeType: MimeType.GOOGLE_DOCS }, blob, { ocrLanguage: 'id', fields: 'id' });
  else file = Drive.Files.insert({ title: 'buleudteu_ocr_tmp', mimeType: MimeType.GOOGLE_DOCS }, blob, { ocr: true, ocrLanguage: 'id' });
  try { return DocumentApp.openById(file.id).getBody().getText(); }
  finally { try { DriveApp.getFileById(file.id).setTrashed(true); } catch (e) {} }
}

// ---------------------------------------------------------------- menu & setup
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Buleud Teu')
    .addItem('1. Setup / perbaiki sheet', 'setup')
    .addItem('2. Analisis butir soal…', 'menuAnalisis')
    .addItem('3. Simpan analisis ke Bank Soal…', 'menuBank')
    .addItem('4. Buat laporan nilai / analisis (PDF, Excel)…', 'menuLaporan')
    .addSeparator()
    .addItem('Tes koneksi & izin', 'tesKoneksi')
    .addToUi();
}

/**
 * Migrasi deterministik skema siswa 2026 (A..G tidak bergeser).
 * Kelas lama 8 + Tingkat A -> Tingkat Pendidikan 8 + Nama Rombel 8A.
 * TIDAK mengubah NISN/NIS/Nomor Peserta/Nama atau nilai scan.
 * Jika ada baris ambigu, batalkan sebelum menulis satu sel pun.
 */
function migrasiSiswaDapodik_() {
  var sh = doc_().getSheetByName(SH.SISWA);
  if (!sh || sh.getLastRow() < 2) return { berubah: 0 };
  var header = sh.getRange(1, 5, 1, 2).getDisplayValues()[0];
  if (header[0] === 'Tingkat Pendidikan' && header[1] === 'Nama Rombel') return { berubah: 0 };
  if (header[0] !== 'Kelas' || header[1] !== 'Tingkat') throw new Error('Header Siswa E:F tidak dikenali; migrasi dibatalkan demi keamanan.');
  var awal = sh.getRange(2, 5, sh.getLastRow() - 1, 2).getDisplayValues();
  var baru = [], salah = [];
  awal.forEach(function (row, i) {
    var k = String(row[0] || '').trim().toUpperCase();
    var t = String(row[1] || '').trim().toUpperCase();
    if (!k && !t) { baru.push(['','']); return; }
    var grade = '', rombel = '';
    if (/^(1[0-2]|[1-9])$/.test(k) && /^[A-Z]{1,2}$/.test(t)) {
      grade = k; rombel = k + t;
    } else if (tingkatKode_(t) && tingkatKode_(k) === tingkatKode_(t) && !/^(1[0-2]|[1-9])$/.test(k)) {
      grade = tingkatKode_(t); rombel = rombelKode_(k,grade);
    } else { salah.push(i + 2); baru.push([k,t]); return; }
    baru.push([grade,rombel]);
  });
  if (salah.length) throw new Error('Migrasi dibatalkan: rombel ambigu pada baris siswa ' + salah.slice(0,20).join(', ') + '. Tidak ada data diubah.');
  sh.getRange(2, 5, baru.length, 2).setValues(baru);
  return { berubah: baru.filter(function (r) { return r[0] && r[1]; }).length };
}

function setup() {
  var P = PropertiesService.getScriptProperties(), lama = P.getProperty('SHEET_ID'), aktif = null;
  try { aktif = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) {}
  if (!lama && aktif) P.setProperty('SHEET_ID', aktif.getId());
  else if (lama && aktif && aktif.getId() !== lama) {
    // jangan diam-diam memindahkan database: tanya dulu (dari editor tanpa UI → tetap pakai SHEET_ID lama)
    var ganti = false;
    try { var ui = SpreadsheetApp.getUi(); ganti = ui.alert('Ganti database?', 'Database saat ini: ' + SpreadsheetApp.openById(lama).getName() + '\nPakai spreadsheet ini (' + aktif.getName() + ') sebagai database?', ui.ButtonSet.YES_NO) === ui.Button.YES; } catch (e) {}
    if (ganti) P.setProperty('SHEET_ID', aktif.getId());
  }
  var d = doc_();
  Logger.log('Setup pada spreadsheet: ' + d.getName() + ' (' + d.getId() + ')');
  var s = d.getSheetByName(SH.SEKOLAH);
  if (!s) { s = d.insertSheet(SH.SEKOLAH, 0); s.getRange(1, 1, SEKOLAH_KEYS.length, 2).setValues(SEKOLAH_KEYS.map(function (k) { return [k, '']; })); s.getRange(1, 1, SEKOLAH_KEYS.length, 1).setFontWeight('bold'); s.setColumnWidth(1, 230); s.setColumnWidth(2, 360); }
  // Harus dilakukan SEBELUM mengganti nama header. Tidak melanjutkan jika ambigu.
  migrasiSiswaDapodik_();
  Object.keys(HEAD).forEach(function (name) {
    var sh = d.getSheetByName(name);
    if (!sh) { sh = d.insertSheet(name); }
    var cur = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0] : [];
    if (cur.join('|') !== HEAD[name].join('|')) sh.getRange(1, 1, 1, HEAD[name].length).setValues([HEAD[name]]);
    sh.getRange(1, 1, 1, HEAD[name].length).setFontWeight('bold').setBackground('#e0e7ff');
    sh.setFrozenRows(1);
  });
  sheet_(SH.GURU).getRange('C:C').setNumberFormat('@');
  sheet_(SH.SISWA).getRange('A:C').setNumberFormat('@');
  sheet_(SH.UJIAN).getRange('I:I').setNumberFormat('@');
  var opsiRule = SpreadsheetApp.newDataValidation().requireValueInList(['ABCD', 'ABCDE'], true).build();
  sheet_(SH.UJIAN).getRange('H2:H').setDataValidation(opsiRule);
  sheet_(SH.UJIAN).getRange('L2:L').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Aktif', 'Arsip'], true).build());
  sheet_(SH.BANK).getRange('W2:W').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Pakai', 'Telaah', 'Revisi', 'Arsip'], true).build());
  sheet_(SH.GURU).getRange('F2:F').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Ya', 'Tidak'], true).build());
  try {
    SpreadsheetApp.getUi().alert('Setup selesai.\n\n1) Isi sheet Sekolah, Guru (dengan PIN 4 digit), dan Siswa (bisa tempel dari Dapodik).\n2) Ekstensi → Apps Script → Layanan + → Drive API.\n3) Terapkan → Deployment baru → Aplikasi web → Jalankan sebagai: Saya → Akses: Siapa saja.\n4) Tempel URL /exec di aplikasi Buleud Teu.');
  } catch (e) {}
  return 'ok';
}

function pilihUjianDialog_(judul) {
  var ui = SpreadsheetApp.getUi();
  var daftar = rows_(SH.UJIAN).map(function (r) { return r['ID'] + ' — ' + r['Nama Ujian'] + ' (' + r['Mapel'] + ', ' + r['Kelas'] + ')'; }).join('\n');
  var a = ui.prompt(judul, 'Ketik ID ujian:\n' + daftar, ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return null;
  var id = a.getResponseText().trim().toUpperCase();
  var b = ui.prompt(judul, 'Lingkup analisis: ketik nama KELAS (mis. 7A) untuk per kelas,\natau kosongkan untuk seluruh TINGKAT.', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return null;
  var k = b.getResponseText().trim().toUpperCase();
  return { id: id, lingkup: k ? 'kelas' : 'tingkat', kelas: k };
}
function menuAnalisis() {
  var p = pilihUjianDialog_('Analisis butir soal'); if (!p) return;
  var r = analisisUjian(p.id, p.lingkup, p.kelas), R = r.hasil.ringkasan || {};
  doc_().setActiveSheet(doc_().getSheetByName(r.sheet));
  SpreadsheetApp.getUi().alert('Selesai: ' + r.sheet + '\nSiswa ' + r.hasil.n + ', soal ' + r.hasil.k + '\nKR-20 ' + R.kr20 + ' (' + R.kategoriKr20 + ')\n' + R.teksRekomendasi + (r.hasil.peringatan.length ? '\n\n' + r.hasil.peringatan.join('\n') : ''));
}
function menuBank() {
  var p = pilihUjianDialog_('Simpan ke Bank Soal'); if (!p) return;
  var r = bankSoal(p.id, p.lingkup, p.kelas);
  SpreadsheetApp.getUi().alert('Bank Soal diperbarui: ' + r.baru + ' butir baru, ' + r.diperbarui + ' diperbarui.');
}

function tesKoneksi() {
  var d = doc_();
  Logger.log('Spreadsheet: ' + d.getName() + ' [' + d.getId() + '] | Sheet: ' + d.getSheets().map(function (s) { return s.getName(); }).join(', '));
  var c = JSON.parse(doGet({ parameter: { action: 'config' } }).getContent());
  Logger.log('Sekolah: ' + (c.sekolah ? c.sekolah.nama : '-') + ' | Guru aktif: ' + (c.guru ? c.guru.length : 0) + (c.error ? ' | ERROR ' + c.error : ''));
  Logger.log('Siswa: ' + rows_(SH.SISWA).length + ' | Ujian: ' + rows_(SH.UJIAN).length + ' | Drive API: ' + (typeof Drive !== 'undefined' ? 'aktif' : 'BELUM ditambahkan'));
  // memicu izin Google Docs + Drive (dibutuhkan OCR)
  try { var t = DocumentApp.create('buleudteu_tes_izin'); DriveApp.getFileById(t.getId()).setTrashed(true); Logger.log('Izin Docs/Drive: OK'); } catch (e) { Logger.log('Izin Docs/Drive: ' + e); }
  // memicu izin ekspor laporan (PDF/Excel): akses URL eksternal + folder arsip laporan
  try { UrlFetchApp.fetch('https://docs.google.com/', { muteHttpExceptions: true }); folderLaporan_(); Logger.log('Izin laporan (ekspor PDF/Excel): OK'); } catch (e) { Logger.log('Izin laporan: ' + e); }
}
