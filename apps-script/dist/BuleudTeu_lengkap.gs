// ===== Buleud Teu V40 — satu file deploy (Code.gs + Statistik.gs + Laporan.gs), generated =====

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
  Guru: ['Nama', 'Email', 'PIN', 'Mapel (pisah koma)', 'Kelas (pisah koma)', 'Aktif'],
  Siswa: ['NISN', 'NIS', 'Nomor Peserta', 'Nama', 'Kelas', 'Tingkat', 'L/P'],
  Ujian: ['ID', 'Nama Ujian', 'Mapel', 'Tingkat', 'Kelas', 'Guru', 'Tanggal', 'Opsi', 'Kunci', 'Jumlah Soal', 'KKTP', 'Status', 'Dibuat'],
  HasilScan: ['Waktu', 'ID Ujian', 'Mapel', 'Tingkat', 'Kelas', 'Nama', 'NISN', 'Nomor Peserta', 'Jawaban', 'Benar', 'Jumlah Soal', 'Skor', 'Ditandai', 'Mode', 'Kualitas', 'Guru', 'ScanID'],
  BankSoal: ['Kode Soal', 'Mapel', 'Tingkat', 'Lingkup', 'ID Ujian', 'Nama Ujian', 'No', 'Kunci', 'N', 'P', 'TK', 'D', 'DP', 'r pbis', 'r tabel', 'Valid', 'KR20 jika dihapus', 'Pengecoh Berfungsi', 'Pengecoh Mati', 'Rekomendasi', 'Alasan', 'Tanggal Analisis', 'Status Guru', 'Catatan']
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
    var o = { _row: i + 2 }; head.forEach(function (h, j) { o[h] = String(r[j] == null ? '' : r[j]).trim(); }); return o;
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
function assertPemilik_(g, u) {
  if (String(u.guru).toUpperCase() !== String(g.nama).toUpperCase()) { var e = new Error('Ujian ini milik guru lain (' + u.guru + '). Akses ditolak.'); e.forbidden = true; throw e; }
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
    kktp: (r['KKTP'] === '' || !isFinite(Number(r['KKTP']))) ? 75 : Number(r['KKTP']), status: r['Status'] || 'Aktif', _row: r._row };
}
function getUjian_(id) {
  var r = rows_(SH.UJIAN).filter(function (x) { return x['ID'] === id; })[0];
  if (!r) throw new Error('Ujian ' + id + ' tidak ditemukan.');
  return ujianRow_(r);
}
/**
 * Sheet Siswa yang diimpor Dapodik kadang memakai:
 *   Kelas = 8, Tingkat = A  -> rombel 8A, tingkat akademik 8
 * atau format normal:
 *   Kelas = 8A, Tingkat = 8 -> rombel 8A, tingkat akademik 8.
 * Tidak mengubah sel database yang sudah ada.
 */
function siswaInfo_(s) {
  var raw = String(s['Kelas'] || '').toUpperCase().replace(/\s+/g, '');
  var other = String(s['Tingkat'] || '').toUpperCase().replace(/\s+/g, '');
  var grade = (/^(7|8|9|10|11|12)/.exec(raw) || [])[1] || '';
  var kelas = /^(7|8|9|10|11|12)$/.test(raw) && /^[A-Z]{1,2}$/.test(other) ? raw + other : raw;
  return { nama: String(s['Nama'] || '').toUpperCase(), kelas: kelas,
    nomor: s['Nomor Peserta'], nisn: s['NISN'], tingkat: grade || other };
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
  }).filter(function (s) { return !!s.nama; });
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
  var ujian = rows_(SH.UJIAN).map(ujianRow_).filter(function (u) { return u.guru.toUpperCase() === g.nama.toUpperCase() && u.status !== 'Arsip'; });
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
  ujian.forEach(function (u) { u.terscan = registered ? Object.keys(cnt[u.id] || {}) : []; delete u._row; });
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
  if (x.id) {
    var ex = rows_(SH.UJIAN).filter(function (r) { return r['ID'] === x.id; })[0];
    if (!ex) throw new Error('Ujian tidak ditemukan.');
    if (ex['Guru'].toUpperCase() !== g.nama.toUpperCase()) throw new Error('Ujian ini milik guru lain.');
    row[12] = ex['Dibuat'] || now_();
    sh.getRange(ex._row, 1, 1, row.length).setValues([row]);
  } else {
    row[0] = 'U' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMdd') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    sh.appendRow(row);
    sh.getRange(sh.getLastRow(), 9).setNumberFormat('@').setValue(kunci);
  }
  ROWS_CACHE_ = {};
  return { result: 'success', id: row[0], jumlah: kunci.length };
}
function apiArchiveExam_(d) {
  var g = auth_(d.token); wajibTerdaftar_();
  var u = getUjian_(d.id);
  if (u.guru.toUpperCase() !== g.nama.toUpperCase()) throw new Error('Ujian ini milik guru lain.');
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
    if (adaWaktuKlien && /^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}$/.test(tersimpanPada) &&
        tersimpanPada > waktu) {
      return { result: 'success', benar: Number(target['Benar']) || 0, jumlah: u.jumlah,
        skor: Number(target['Skor']) || 0, siswa: ps.nama, kelas: ps.kelas,
        duplikat: !!byId, usang: true };
    }
    sh.getRange(target._row, 1, 1, row.length).setValues([row]);
    return { result: 'success', benar: benar, jumlah: u.jumlah, skor: skor,
      siswa: ps.nama, kelas: ps.kelas, duplikat: !!byId, diperbarui: !byId };
  }
  sh.appendRow(row);
  return { result: 'success', benar: benar, jumlah: u.jumlah, skor: skor,
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


/*
 * Buleud Teu — STATISTIK BUTIR SOAL (fungsi murni, tanpa API Google; diuji di tools/test/test_stats.js)
 *
 * analisisButir(respons, kunci, opsi, kktp)
 *   respons : [{ nama, kelas, jawaban: 'ABD-C...' }]   (satu baris per siswa; '-' = kosong)
 *   kunci   : 'ACBD...'   (panjang kunci = jumlah soal aktif)
 *   opsi    : 'ABCD' | 'ABCDE'
 *   kktp    : nilai minimal tuntas (0-100)
 *
 * Acuan kategori (dipakai luas di sekolah Indonesia):
 *   Tingkat kesukaran P   : 0,00–0,30 Sukar · 0,31–0,70 Sedang · 0,71–1,00 Mudah
 *   Daya pembeda D (27%)  : <0 Negatif · 0,00–0,20 Jelek · 0,21–0,40 Cukup · 0,41–0,70 Baik · 0,71–1,00 Baik Sekali
 *   Korelasi butir-total  : r point-biserial terkoreksi (item-rest) dibanding r tabel (α = 0,05, dua sisi)
 *                           -> 'Memadai' / 'Rendah' / '-' (tidak dapat dihitung). Ini bukti KONSISTENSI INTERNAL,
 *                           bukan validitas isi (kesesuaian dengan CP/TP & kisi-kisi tetap ditelaah guru).
 *   Kelompok atas/bawah   : 27% (n < 20: 50%); skor SERI di batas kelompok dibagi berbobot (fraksional),
 *                           sehingga hasil tidak bergantung urutan data.
 *   Reliabilitas          : KR-20 (varians populasi /N), KR-21, SEM
 *                           0,80–1,00 Sangat Tinggi · 0,60–0,79 Tinggi · 0,40–0,59 Sedang · 0,20–0,39 Rendah · <0,20 Sangat Rendah
 *   Pengecoh berfungsi    : dipilih >= 5% peserta DAN lebih banyak dipilih kelompok bawah daripada kelompok atas
 *   Rekomendasi           : Diterima · Direvisi · Audit kritis (D/r negatif: periksa kunci & soal, keputusan guru)
 *                           · Data kurang (n < 20: indikator ditampilkan, tanpa rekomendasi keras) · '-' (skor seragam)
 */

function statMean_(a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : 0; }
function statVarPop_(a) { var m = statMean_(a); return a.length ? a.reduce(function (s, v) { return s + (v - m) * (v - m); }, 0) / a.length : 0; }
function statMedian_(a) { if (!a.length) return 0; var s = a.slice().sort(function (x, y) { return x - y; }); var h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; }
function statPearson_(x, y) {
  var n = x.length; if (n < 3) return null;
  var mx = statMean_(x), my = statMean_(y), sxy = 0, sxx = 0, syy = 0;
  for (var i = 0; i < n; i++) { var dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}
// t kritis dua sisi α = 0,05 (ekspansi Cornish-Fisher, galat < 0,5% untuk df >= 3)
function statTCrit_(df) {
  if (df < 1) return null;
  var table = { 1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776 };
  if (table[df]) return table[df];
  var z = 1.959963985, z3 = z * z * z, z5 = z3 * z * z, z7 = z5 * z * z;
  return z + (z3 + z) / (4 * df) + (5 * z5 + 16 * z3 + 3 * z) / (96 * df * df) + (3 * z7 + 19 * z5 + 17 * z3 - 15 * z) / (384 * df * df * df);
}
// r tabel product-moment (α = 0,05 dua sisi) untuk n peserta
function statRTabel_(n) { var df = n - 2, t = statTCrit_(df); return t == null ? null : t / Math.sqrt(df + t * t); }

function kategoriP_(p) { return p <= 0.30 ? 'Sukar' : (p <= 0.70 ? 'Sedang' : 'Mudah'); }
function kategoriD_(d) { if (d == null) return '-'; return d < 0 ? 'Negatif' : (d <= 0.20 ? 'Jelek' : (d <= 0.40 ? 'Cukup' : (d <= 0.70 ? 'Baik' : 'Baik Sekali'))); }
function kategoriR_(r) { if (r == null) return '-'; return r >= 0.80 ? 'Sangat Tinggi' : (r >= 0.60 ? 'Tinggi' : (r >= 0.40 ? 'Sedang' : (r >= 0.20 ? 'Rendah' : 'Sangat Rendah'))); }

function kr20_(X, k) {
  var n = X.length; if (n < 2 || k < 2) return null;
  var tot = X.map(function (r) { return r.reduce(function (s, v) { return s + v; }, 0); });
  var v = statVarPop_(tot); if (v === 0) return null;
  var spq = 0;
  for (var j = 0; j < k; j++) { var p = 0; for (var i = 0; i < n; i++) p += X[i][j]; p /= n; spq += p * (1 - p); }
  return (k / (k - 1)) * (1 - spq / v);
}

function analisisButir(respons, kunci, opsi, kktp) {
  // posisi kunci dipertahankan: karakter tak sah menjadi '?' (tidak pernah cocok), BUKAN dihapus (nomor tidak bergeser)
  opsi = opsi === 'ABCDE' ? 'ABCDE' : 'ABCD';
  kunci = String(kunci || '').toUpperCase().replace(/\s+/g, '').split('').map(function (c) { return opsi.indexOf(c) >= 0 ? c : '?'; }).join('');
  kktp = (kktp === '' || kktp == null || !isFinite(Number(kktp))) ? 75 : Math.max(0, Math.min(100, Number(kktp)));
  var k = kunci.length, n = respons.length;
  var hasil = { n: n, k: k, opsi: opsi, kktp: kktp, peringatan: [], butir: [], siswa: [], ringkasan: null, sampelKecil: n < 20 };
  if (/\?/.test(kunci)) hasil.peringatan.push('Kunci memuat karakter tidak sah pada nomor ' + kunci.split('').map(function (c, i) { return c === '?' ? i + 1 : 0; }).filter(Boolean).join(', ') + ': nomor itu dinilai salah untuk semua siswa — perbaiki kunci.');
  if (!k) { hasil.peringatan.push('Kunci jawaban kosong.'); return hasil; }
  if (n < 2) { hasil.peringatan.push('Minimal 2 siswa untuk analisis.'); return hasil; }
  if (n < 20) hasil.peringatan.push('Jumlah siswa ' + n + ' (< 20): statistik butir kurang stabil. Indikator ditampilkan sebagai gambaran awal; rekomendasi Diterima/Direvisi ditahan ("Data kurang").');

  // matriks benar/salah + pilihan
  var X = [], C = [];
  respons.forEach(function (r) {
    var jw = String(r.jawaban || '').toUpperCase(), row = [], ch = [];
    for (var j = 0; j < k; j++) { var a = jw.charAt(j) || '-'; if (opsi.indexOf(a) < 0) a = '-'; ch.push(a); row.push(a === kunci.charAt(j) ? 1 : 0); }
    X.push(row); C.push(ch);
  });
  var total = X.map(function (r) { return r.reduce(function (s, v) { return s + v; }, 0); });
  var skor = total.map(function (t) { return Math.round(t / k * 10000) / 100; });

  // kelompok atas/bawah 27% (n < 20: 50%). Bobot fraksional untuk skor seri di batas kelompok:
  // siswa dengan skor sama mendapat bobot sama -> hasil identik apa pun urutan datanya (= rata-rata semua cara memecah seri).
  var g = n >= 20 ? Math.max(1, Math.round(n * 0.27)) : Math.floor(n / 2);
  function bobotKelompok_(atasKah) {
    var penuh = total.map(function () { return false; }), seri = penuh.slice(), fr = 0;
    if (!g) return { penuh: penuh, seri: seri, fr: 0 };
    var s = total.slice().sort(function (a, b) { return atasKah ? b - a : a - b; }), batas = s[g - 1];
    var lewat = 0, nSeri = 0;
    total.forEach(function (t, i) { if (atasKah ? t > batas : t < batas) { penuh[i] = true; lewat++; } else if (t === batas) { seri[i] = true; nSeri++; } });
    return { penuh: penuh, seri: seri, fr: (g - lewat) / nSeri };
  }
  var wA = bobotKelompok_(true), wB = bobotKelompok_(false);
  // jumlah bilangan bulat dulu, bobot pecahan dikalikan sekali -> hasil persis sama apa pun urutan data
  function sumW_(w, f) { var a = 0, b = 0; for (var i = 0; i < n; i++) { if (w.penuh[i]) a += f(i); else if (w.seri[i]) b += f(i); } return a + w.fr * b; }

  var rTab = statRTabel_(n);
  var varTot = statVarPop_(total), sdTot = Math.sqrt(varTot);
  var r20 = kr20_(X, k);
  var M = statMean_(total);
  var r21 = (varTot > 0 && k > 1) ? (k / (k - 1)) * (1 - M * (k - M) / (k * varTot)) : null;
  // skor total semua siswa sama -> korelasi, daya pembeda, dan reliabilitas tidak terdefinisi (bukan -1 / negatif)
  var seragam = varTot === 0;
  if (seragam) hasil.peringatan.push('Semua siswa memperoleh skor total sama (' + total[0] + '): validitas, daya pembeda, dan reliabilitas tidak dapat dihitung.');

  for (var j = 0; j < k; j++) {
    var col = X.map(function (r) { return r[j]; });
    var benar = col.reduce(function (s, v) { return s + v; }, 0), p = benar / n;
    var pU = g ? sumW_(wA, function (i) { return X[i][j]; }) / g : 0;
    var pL = g ? sumW_(wB, function (i) { return X[i][j]; }) / g : 0;
    var D = g && !seragam ? pU - pL : null;
    var rest = total.map(function (t, i) { return t - X[i][j]; });
    var rpb = seragam ? null : statPearson_(col, rest);
    // tiga keadaan: true (r >= r tabel) · false · null (tidak dapat dihitung)
    var valid = rpb == null || rTab == null ? null : rpb >= rTab;
    // KR-20 jika butir dihapus
    var Xd = X.map(function (r) { return r.filter(function (_, jj) { return jj !== j; }); });
    var r20del = seragam ? null : kr20_(Xd, k - 1);
    // pengecoh
    var dist = {}, berfungsi = [], mati = [];
    var letters = (opsi + '-').split('');
    letters.forEach(function (L) {
      var cnt = 0;
      for (var i = 0; i < n; i++) if (C[i][j] === L) cnt++;
      var cU = sumW_(wA, function (i) { return C[i][j] === L ? 1 : 0; }), cL = sumW_(wB, function (i) { return C[i][j] === L ? 1 : 0; });
      dist[L] = { n: cnt, p: cnt / n, atas: g ? round_(cU / g, 4) : 0, bawah: g ? round_(cL / g, 4) : 0 };
      if (L !== '-' && L !== kunci.charAt(j)) {
        if (cnt / n >= 0.05 && cL > cU + 1e-9) berfungsi.push(L); else mati.push(L);   // lebih banyak (bukan sama) dipilih kelompok bawah
      }
    });
    var nDis = opsi.length - 1;
    // rekomendasi
    var alasan = [], rek;
    if (seragam) { rek = '-'; alasan.push('skor total seragam: belum bisa dinilai'); }
    else if (kunci.charAt(j) === '?') { rek = 'Audit kritis'; alasan.push('kunci nomor ini tidak sah'); }
    else if ((D != null && D < 0) || (rpb != null && rpb < 0)) {
      // bukan "buang otomatis": penyebab bisa salah kunci, gangguan pembacaan, soal multidimensi, atau sampel kecil
      rek = 'Audit kritis';
      if (D != null && D < 0) alasan.push('daya pembeda negatif (kelompok bawah lebih banyak benar)');
      if (rpb != null && rpb < 0) alasan.push('korelasi butir-total negatif');
      alasan.push('periksa kunci, naskah soal, dan bukti scan; keputusan akhir oleh guru');
    } else {
      if (valid !== true) alasan.push(rpb == null ? 'korelasi butir-total tidak dapat dihitung (semua benar/salah)' : 'korelasi butir-total rendah (r ' + rpb.toFixed(2) + ' < r tabel ' + (rTab == null ? '-' : rTab.toFixed(2)) + ')');
      if (D == null || D <= 0.20) alasan.push('daya pembeda jelek');
      if (berfungsi.length < Math.ceil(nDis / 2)) alasan.push('pengecoh tidak berfungsi: ' + (mati.join(', ') || '-'));
      if (p > 0.90) alasan.push('terlalu mudah');
      if (p < 0.10) alasan.push('terlalu sukar');
      rek = alasan.length === 0 || (alasan.length === 1 && /terlalu/.test(alasan[0]) && valid === true && D > 0.20) ? 'Diterima' : 'Direvisi';
      if (n < 20) { alasan.unshift('sampel kecil (n ' + n + ' < 20), indikasi awal: ' + rek.toLowerCase()); rek = 'Data kurang'; }
    }
    hasil.butir.push({
      no: j + 1, kunci: kunci.charAt(j), benar: benar, p: round_(p, 3), tk: kategoriP_(p),
      d: D == null ? null : round_(D, 3), dp: kategoriD_(D), rpbis: rpb == null ? null : round_(rpb, 3), rTabel: rTab == null ? null : round_(rTab, 3),
      valid: valid, korelasi: labelKorelasi(valid), kr20JikaDihapus: r20del == null ? null : round_(r20del, 3), sebaran: dist,
      pengecohBerfungsi: berfungsi, pengecohMati: mati, rekomendasi: rek, alasan: alasan.join('; ')
    });
  }

  respons.forEach(function (r, i) {
    hasil.siswa.push({ nama: r.nama, kelas: r.kelas, benar: total[i], skor: skor[i], tuntas: skor[i] >= kktp, vektor: X[i] });
  });
  var tuntas = skor.filter(function (s) { return s >= kktp; }).length;
  hasil.ringkasan = {
    n: n, k: k, rataRata: round_(statMean_(skor), 2), sd: round_(Math.sqrt(statVarPop_(skor)), 2), median: round_(statMedian_(skor), 2),
    min: Math.min.apply(null, skor), max: Math.max.apply(null, skor), rataBenar: round_(M, 2), sdBenar: round_(sdTot, 3),
    kr20: r20 == null ? null : round_(r20, 3), kategoriKr20: kategoriR_(r20), kr21: r21 == null ? null : round_(r21, 3),
    sem: r20 == null ? null : round_(sdTot * Math.sqrt(Math.max(0, 1 - r20)), 3), rTabel: rTab == null ? null : round_(rTab, 3),
    tuntas: tuntas, persenTuntas: round_(tuntas / n * 100, 1), kelompok: g,
    diterima: hasil.butir.filter(function (b) { return b.rekomendasi === 'Diterima'; }).length,
    direvisi: hasil.butir.filter(function (b) { return b.rekomendasi === 'Direvisi'; }).length,
    auditKritis: hasil.butir.filter(function (b) { return b.rekomendasi === 'Audit kritis'; }).length,
    dataKurang: hasil.butir.filter(function (b) { return b.rekomendasi === 'Data kurang'; }).length
  };
  hasil.ringkasan.dibuang = hasil.ringkasan.auditKritis;   // kompatibel aplikasi versi lama
  hasil.ringkasan.teksRekomendasi = teksRekomendasi(hasil.ringkasan);
  return hasil;
}

/** label korelasi butir-total tiga keadaan */
function labelKorelasi(valid) { return valid === true ? 'Memadai' : (valid === false ? 'Rendah' : '-'); }
/** ringkasan rekomendasi untuk ditampilkan (hanya kategori yang ada) */
function teksRekomendasi(R) {
  var a = ['Diterima ' + (R.diterima || 0), 'Direvisi ' + (R.direvisi || 0), 'Audit kritis ' + (R.auditKritis || 0)];
  if (R.dataKurang) a.push('Data kurang ' + R.dataKurang);
  return a.join(' · ');
}

function round_(v, d) { var f = Math.pow(10, d); return Math.round(v * f) / f; }

// ambil tingkat dari nama kelas: "7A" -> 7, "IX-B" -> 9, "X IPA 1" -> 10, "XII" -> 12
function tingkatDariKelas(kelas) {
  var s = String(kelas || '').toUpperCase().trim();
  var m = s.match(/^(\d{1,2})/); if (m) return Number(m[1]);
  var r = s.match(/^(XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)(?![A-Z])/);
  if (r) return { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12 }[r[1]];
  return null;
}

if (typeof module !== 'undefined') module.exports = { analisisButir: analisisButir, labelKorelasi: labelKorelasi, teksRekomendasi: teksRekomendasi, statRTabel_: statRTabel_, kr20_: kr20_, tingkatDariKelas: tingkatDariKelas };


/**
 * Buleud Teu — LAPORAN (simpel / lengkap) → Google Sheet, PDF (F4), atau Excel (.xlsx).
 * Dipanggil dari aplikasi (aksi POST "report") atau dari menu spreadsheet "Buleud Teu → 4. Buat laporan…".
 *
 * Bagian laporan (bisa dipilih bebas; mode hanya mengisi pilihan bawaan):
 *   identitas  Kop sekolah + identitas ujian (mapel, kelas/tingkat, jumlah soal, KKTP, guru)
 *   nilai      Daftar nilai: nama, kelas, nomor peserta, jumlah benar, skor, tuntas
 *   jawaban    Pilihan jawaban siswa per nomor (benar hijau / salah merah / kosong abu) di tabel nilai
 *   rekap      Rata-rata, tertinggi, terendah, ketuntasan
 *   statistik  Ringkasan statistik tes: simpangan baku, KR-20, KR-21, SEM, r tabel
 *   butir      Analisis butir: P, TK, D, DP, r pbis, valid, KR-20 jika dihapus, rekomendasi + alasan
 *   pengecoh   Sebaran jawaban per opsi + pengecoh berfungsi / mati
 *   matriks    Matriks benar/salah (0/1) siswa × butir
 *   ttd        Tanda tangan guru mapel & kepala sekolah
 */
var LAP_BAGIAN = [
  ['identitas', 'Identitas ujian & kop sekolah'], ['nilai', 'Daftar nilai (benar & skor)'], ['jawaban', 'Pilihan jawaban siswa per nomor'],
  ['rekap', 'Rekap nilai & ketuntasan'], ['statistik', 'Ringkasan statistik tes (KR-20, SEM)'], ['butir', 'Analisis butir soal + rekomendasi'],
  ['pengecoh', 'Sebaran jawaban & pengecoh'], ['matriks', 'Matriks benar/salah (0/1)'], ['ttd', 'Tanda tangan guru & kepala sekolah']
];
var LAP_MODE = {
  simpel: ['identitas', 'nilai', 'jawaban', 'rekap', 'ttd'],
  lengkap: ['identitas', 'nilai', 'jawaban', 'rekap', 'statistik', 'butir', 'pengecoh', 'matriks', 'ttd']
};
var LAP_FOLDER = 'Buleud Teu — Laporan';
var LAP_WARNA = { kepala: '#e5e7eb', benar: '#dcfce7', salah: '#fee2e2', kosong: '#f3f4f6', diterima: '#dcfce7', direvisi: '#fef9c3', dibuang: '#fee2e2', biru: '#1e3a8a' };

/** opsi laporan → {bagian (urut baku), mode, format, urut, lingkup, kelas} */
function opsiLaporan_(o) {
  o = o || {};
  var mode = o.mode === 'lengkap' ? 'lengkap' : 'simpel';
  var pilih = (o.bagian && o.bagian.length ? o.bagian : LAP_MODE[mode]).map(String);
  var bagian = LAP_BAGIAN.map(function (b) { return b[0]; }).filter(function (k) { return pilih.indexOf(k) >= 0; });
  if (!bagian.length) throw new Error('Pilih minimal satu bagian laporan.');
  return {
    mode: mode, bagian: bagian, format: ['pdf', 'xlsx', 'sheet'].indexOf(o.format) >= 0 ? o.format : 'pdf',
    urut: ['nama', 'skor', 'kelas'].indexOf(o.urut) >= 0 ? o.urut : 'kelas',
    lingkup: o.lingkup === 'kelas' ? 'kelas' : 'tingkat', kelas: String(o.kelas || '').toUpperCase(), orientasi: o.orientasi || 'auto',
    anonim: o.anonim === true || o.anonim === 'true'
  };
}

/** respons lengkap (dengan nomor peserta & NISN) — scan terakhir per siswa menang */
function responsLaporan_(u, lingkup, kelas) {
  var latest = {};
  rows_(SH.HASIL).forEach(function (h) {
    if (h['ID Ujian'] !== u.id) return;
    if (lingkup === 'kelas' && h['Kelas'].toUpperCase() !== String(kelas).toUpperCase()) return;
    latest[kunciSiswa_(h)] = { nama: h['Nama'], kelas: h['Kelas'], jawaban: String(h['Jawaban']).replace(/^'/, ''),
      nomor: String(h['Nomor Peserta'] || '').replace(/^'/, ''), nisn: String(h['NISN'] || '').replace(/^'/, ''), waktu: h['Waktu'] };
  });
  return Object.keys(latest).map(function (k) { return latest[k]; }).sort(function (a, b) { return (a.kelas + '|' + a.nama).localeCompare(b.kelas + '|' + b.nama); });
}

/**
 * DATA laporan (murni, tanpa layanan Google selain baca sheet) — dipakai untuk render sheet dan diuji di Node.
 * hasil: { judul, subjudul, file, sheets: [{ nama, blok: [ {jenis:'judul'|'kv'|'tabel'|'catatan'|'ttd', ...} ] }], ringkas }
 */
function dataLaporan_(examId, o) {
  var u = getUjian_(examId), sk = sekolah_();
  var resp = responsLaporan_(u, o.lingkup, o.kelas);
  if (!resp.length) throw new Error('Belum ada hasil scan untuk ' + (o.lingkup === 'kelas' ? 'kelas ' + o.kelas : 'ujian ini') + '.');
  var A = analisisButir(resp, u.kunci, u.opsi, u.kktp), R = A.ringkasan || {};
  var has = function (k) { return o.bagian.indexOf(k) >= 0; };
  var lingkupTeks = o.lingkup === 'kelas' ? 'Kelas ' + o.kelas : (u.kelas.length && u.kelas.indexOf('SEMUA') < 0 ? 'Kelas ' + u.kelas.join(', ') : 'Tingkat ' + (u.tingkat || '-'));
  var analisis = has('statistik') || has('butir') || has('pengecoh') || has('matriks');
  var judul = analisis ? 'LAPORAN HASIL & ANALISIS BUTIR SOAL' : 'LAPORAN HASIL PENILAIAN';
  var kop = [{ jenis: 'judul', teks: (sk.nama || 'SEKOLAH').toUpperCase(), besar: 14 }, { jenis: 'judul', teks: judul, besar: 12 },
    { jenis: 'judul', teks: (u.nama || '').toUpperCase() + (sk.tahun ? ' · TAHUN PELAJARAN ' + sk.tahun : ''), besar: 10 }];

  // siswa: gabung respons + hasil analisis (urutan sama), lalu urutkan sesuai pilihan
  var siswa = resp.map(function (r, i) { var s = A.siswa[i]; return { nama: r.nama, kelas: r.kelas, nomor: r.nomor, nisn: r.nisn, jawaban: r.jawaban, benar: s.benar, skor: s.skor, tuntas: s.tuntas, vektor: s.vektor }; });
  siswa.sort(function (a, b) {
    if (o.urut === 'skor') return b.skor - a.skor || a.nama.localeCompare(b.nama);
    if (o.urut === 'nama') return a.nama.localeCompare(b.nama);
    return a.kelas.localeCompare(b.kelas) || a.nama.localeCompare(b.nama);
  });
  // mode anonim (rapat MGMP / presentasi): nama -> "Peserta 01", nomor & NISN dikosongkan; urutan tetap sesuai pilihan
  if (o.anonim) siswa.forEach(function (s, i) { s.nama = 'Peserta ' + ('0' + (i + 1)).slice(-Math.max(2, String(siswa.length).length)); s.nomor = ''; s.nisn = ''; });
  // peringkat (skor sama = peringkat sama)
  var byScore = siswa.map(function (s) { return s.skor; }).sort(function (a, b) { return b - a; });
  siswa.forEach(function (s) { s.peringkat = byScore.indexOf(s.skor) + 1; });

  var sheets = [], utama = { nama: has('nilai') || has('jawaban') ? 'Nilai' : 'Ringkasan', blok: kop.slice() };
  if (has('identitas')) utama.blok.push({ jenis: 'kv', baris: [
    ['Mata pelajaran', u.mapel], ['Kelas / lingkup', lingkupTeks], ['Jumlah soal', u.jumlah + ' (opsi ' + u.opsi + ')'], ['KKTP', u.kktp],
    ['Guru', u.guru || '-'], ['Tanggal ujian', u.tanggal || '-'], ['Jumlah siswa', siswa.length + (o.anonim ? ' (anonim)' : '')]] });
  if (has('rekap')) utama.blok.push({ jenis: 'kv', judul: 'Rekap nilai', baris: [
    ['Rata-rata', R.rataRata], ['Tertinggi / terendah', R.max + ' / ' + R.min], ['Median', R.median], ['Simpangan baku', R.sd],
    ['Tuntas (≥ ' + u.kktp + ')', R.tuntas + ' siswa (' + R.persenTuntas + '%)'], ['Belum tuntas', (siswa.length - R.tuntas) + ' siswa']] });
  if (has('nilai') || has('jawaban')) {
    var head = ['No', 'Nama', 'Kelas', 'No. Peserta'], jw = has('jawaban');
    if (jw) for (var q = 1; q <= u.jumlah; q++) head.push(String(q));
    if (has('nilai')) head = head.concat(['Benar', 'Skor', 'Tuntas', 'Peringkat']);
    var rows = [], warna = [];
    if (jw) { var kr = ['', 'KUNCI', '', '']; for (var j = 0; j < u.jumlah; j++) kr.push(u.kunci.charAt(j)); if (has('nilai')) kr = kr.concat(['', '', '', '']); rows.push(kr); warna.push(kr.map(function () { return LAP_WARNA.kepala; })); }
    siswa.forEach(function (s, i) {
      var r = [i + 1, s.nama, s.kelas, s.nomor || ''], w = [null, null, null, null];
      if (jw) for (var j = 0; j < u.jumlah; j++) { var a = s.jawaban.charAt(j) || '-'; if (u.opsi.indexOf(a) < 0) a = '-'; r.push(a); w.push(a === '-' ? LAP_WARNA.kosong : (a === u.kunci.charAt(j) ? LAP_WARNA.benar : LAP_WARNA.salah)); }
      if (has('nilai')) { r = r.concat([s.benar, s.skor, s.tuntas ? 'Ya' : 'Tidak', s.peringkat]); w = w.concat([null, null, s.tuntas ? LAP_WARNA.benar : LAP_WARNA.salah, null]); }
      rows.push(r); warna.push(w);
    });
    utama.blok.push({ jenis: 'tabel', judul: has('nilai') ? (jw ? 'Daftar nilai & pilihan jawaban' : 'Daftar nilai') : 'Pilihan jawaban siswa', kepala: head, baris: rows, warna: warna, sempit: jw ? 4 : 99 });
  }
  if (has('ttd')) utama.blok.push({ jenis: 'ttd', kiri: ['Mengetahui,', 'Kepala Sekolah', '', '', '', sk.kepala || '........................', sk.nipKepala ? 'NIP. ' + sk.nipKepala : 'NIP. ................'],
    kanan: [(sk.kota || '..........') + ', ' + tanggalIndo_(new Date()), 'Guru Mata Pelajaran', '', '', '', u.guru || '........................', 'NIP. ................'] });
  if (utama.blok.length > kop.length || !analisis) sheets.push(utama);   // tanpa halaman pertama kosong bila hanya bagian analisis dipilih

  if (has('statistik') || has('butir')) {
    var sb = { nama: 'Analisis Butir', blok: [{ jenis: 'judul', teks: 'ANALISIS BUTIR SOAL — ' + (u.nama || '').toUpperCase(), besar: 12 }, { jenis: 'judul', teks: u.mapel + ' · ' + lingkupTeks + ' · ' + siswa.length + ' siswa', besar: 10 }] };
    if (has('statistik')) sb.blok.push({ jenis: 'kv', judul: 'Ringkasan statistik tes', baris: [
      ['Jumlah siswa / soal', A.n + ' / ' + A.k], ['Rata-rata benar (simpangan baku)', R.rataBenar + ' (' + R.sdBenar + ')'],
      ['Reliabilitas KR-20', R.kr20 == null ? '-' : R.kr20 + ' (' + R.kategoriKr20 + ')'], ['KR-21', R.kr21 == null ? '-' : R.kr21], ['SEM (dalam jumlah butir benar)', R.sem == null ? '-' : R.sem],
      ['r tabel (α 0,05; n = ' + A.n + ')', R.rTabel == null ? '-' : R.rTabel], ['Kelompok atas/bawah', R.kelompok + ' siswa (' + (A.n >= 20 ? '27%' : '50%') + ')'],
      ['Rekomendasi butir', R.teksRekomendasi]] });
    if (A.peringatan.length) sb.blok.push({ jenis: 'catatan', teks: 'Catatan: ' + A.peringatan.join(' ') });
    if (has('butir')) {
      var bh = ['No', 'Kunci', 'Benar', 'P', 'Tingkat kesukaran', 'D', 'Daya pembeda', 'r pbis', 'Korelasi (r ≥ r tabel)', 'KR-20 jika dihapus', 'Rekomendasi', 'Alasan'];
      var bw = [], br = A.butir.map(function (b) {
        var c = b.rekomendasi === 'Diterima' ? LAP_WARNA.diterima : (b.rekomendasi === 'Audit kritis' ? LAP_WARNA.dibuang : (b.rekomendasi === 'Direvisi' ? LAP_WARNA.direvisi : null));
        bw.push(bh.map(function () { return c; }));
        return [b.no, b.kunci, b.benar, b.p, b.tk, b.d == null ? '-' : b.d, b.dp, b.rpbis == null ? '-' : b.rpbis, labelKorelasi(b.valid), b.kr20JikaDihapus == null ? '-' : b.kr20JikaDihapus, b.rekomendasi, b.alasan || '-'];
      });
      sb.blok.push({ jenis: 'tabel', judul: 'Analisis butir', kepala: bh, baris: br, warna: bw, lebarAkhir: 320 });
      sb.blok.push({ jenis: 'catatan', teks: 'P = proporsi menjawab benar (≤ 0,30 sukar · ≤ 0,70 sedang · > 0,70 mudah). D = daya pembeda kelompok atas − bawah (≤ 0,20 jelek · ≤ 0,40 cukup · ≤ 0,70 baik · > 0,70 baik sekali). Korelasi memadai bila r butir-total terkoreksi ≥ r tabel: bukti konsistensi internal, bukan validitas isi (kesesuaian dengan CP/TP dan kisi-kisi tetap ditelaah). Audit kritis = D atau r negatif: periksa kunci, naskah, dan bukti scan; keputusan akhir oleh guru.' });
    }
    sheets.push(sb);
  }
  if (has('pengecoh')) {
    var L = u.opsi.split('');
    var ph = ['No', 'Kunci'].concat(L.map(function (x) { return '% ' + x; })).concat(['% Kosong', 'Pengecoh berfungsi', 'Pengecoh tidak berfungsi']);
    var pw = [], pr = A.butir.map(function (b) {
      pw.push(ph.map(function (h, ci) { var Lc = ci >= 2 && ci < 2 + L.length ? L[ci - 2] : null; return Lc && Lc === b.kunci ? LAP_WARNA.benar : null; }));
      return [b.no, b.kunci].concat(L.map(function (x) { return Math.round(b.sebaran[x].p * 1000) / 10; })).concat([Math.round(b.sebaran['-'].p * 1000) / 10, b.pengecohBerfungsi.join(', ') || '-', b.pengecohMati.join(', ') || '-']);
    });
    sheets.push({ nama: 'Pengecoh', blok: [{ jenis: 'judul', teks: 'SEBARAN JAWABAN & EFEKTIVITAS PENGECOH', besar: 12 }, { jenis: 'judul', teks: u.nama + ' · ' + lingkupTeks, besar: 10 },
      { jenis: 'tabel', kepala: ph, baris: pr, warna: pw },
      { jenis: 'catatan', teks: 'Kolom hijau = kunci. Pengecoh berfungsi bila dipilih ≥ 5% siswa dan lebih banyak dipilih kelompok bawah daripada kelompok atas.' }] });
  }
  if (has('matriks')) {
    var mh = ['No', 'Nama', 'Kelas'].concat(A.butir.map(function (b) { return String(b.no); })).concat(['Benar']);
    var mw = [], mr = siswa.map(function (s, i) { mw.push(mh.map(function (h, ci) { return ci >= 3 && ci < 3 + s.vektor.length ? (s.vektor[ci - 3] ? LAP_WARNA.benar : LAP_WARNA.salah) : null; })); return [i + 1, s.nama, s.kelas].concat(s.vektor).concat([s.benar]); });
    sheets.push({ nama: 'Matriks', blok: [{ jenis: 'judul', teks: 'MATRIKS JAWABAN BENAR (1) / SALAH (0)', besar: 12 }, { jenis: 'judul', teks: u.nama + ' · ' + lingkupTeks, besar: 10 },
      { jenis: 'tabel', kepala: mh, baris: mr, warna: mw, sempit: 3 }] });
  }
  var nmFile = 'Laporan ' + (analisis ? 'Analisis ' : 'Nilai ') + (o.anonim ? 'Anonim ' : '') + u.nama + ' - ' + lingkupTeks + ' - ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var lebar = o.bagian.indexOf('jawaban') >= 0 && u.jumlah > 20 || o.bagian.indexOf('matriks') >= 0 || o.bagian.indexOf('butir') >= 0;
  return { ujian: u, sekolah: sk, judul: judul, file: nmFile.replace(/[\\/:*?"<>|]+/g, '-'), sheets: sheets, landscape: o.orientasi === 'landscape' || (o.orientasi === 'auto' && lebar),
    ringkas: { siswa: siswa.length, rataRata: R.rataRata, tuntas: R.tuntas, kr20: R.kr20, bagian: o.bagian, mode: o.mode, anonim: o.anonim } };
}

function tanggalIndo_(d) {
  var bln = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var t = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd').split('-');
  return Number(t[2]) + ' ' + bln[Number(t[1]) - 1] + ' ' + t[0];
}

/** tulis data laporan ke spreadsheet baru (satu tab per bagian besar) */
function renderLaporan_(D) {
  var ss = SpreadsheetApp.create(D.file), pertama = ss.getSheets()[0];
  D.sheets.forEach(function (S, si) {
    var sh = si === 0 ? pertama.setName(S.nama) : ss.insertSheet(S.nama);
    var row = 1, maxCol = 2;
    S.blok.forEach(function (b) { if (b.jenis === 'tabel') maxCol = Math.max(maxCol, b.kepala.length); });
    S.blok.forEach(function (b) {
      if (b.jenis === 'judul') {
        sh.getRange(row, 1, 1, maxCol).merge().setValue(b.teks).setFontWeight('bold').setFontSize(b.besar || 11).setHorizontalAlignment('center').setFontColor(b.besar >= 12 ? LAP_WARNA.biru : '#374151');
        row++;
        return;
      }
      if (b.jenis === 'kv') {
        row++;
        if (b.judul) { sh.getRange(row, 1).setValue(b.judul).setFontWeight('bold'); row++; }
        var lebarLabel = Math.min(4, Math.max(2, maxCol > 6 ? 3 : 1));
        b.baris.forEach(function (kv) {
          sh.getRange(row, 1, 1, lebarLabel).merge().setValue(kv[0]).setFontColor('#4b5563');
          sh.getRange(row, lebarLabel + 1, 1, Math.max(1, Math.min(maxCol, 12) - lebarLabel)).merge().setValue(kv[1] == null ? '-' : kv[1]).setHorizontalAlignment('left').setFontWeight('bold');
          row++;
        });
        return;
      }
      if (b.jenis === 'catatan') {
        row++;
        sh.getRange(row, 1, 1, maxCol).merge().setValue(b.teks).setFontColor('#92400e').setFontStyle('italic').setWrap(true);
        sh.setRowHeight(row, 34); row++;
        return;
      }
      if (b.jenis === 'tabel') {
        row++;
        if (b.judul) { sh.getRange(row, 1).setValue(b.judul).setFontWeight('bold'); row++; }
        var n = b.kepala.length;
        sh.getRange(row, 1, 1, n).setValues([b.kepala]).setFontWeight('bold').setBackground(LAP_WARNA.kepala).setHorizontalAlignment('center').setWrap(true);
        if (b.baris.length) {
          var rg = sh.getRange(row + 1, 1, b.baris.length, n);
          rg.setValues(b.baris);
          rg.setBackgrounds(b.warna.map(function (w) { return w.map(function (c) { return c || '#ffffff'; }); }));
          rg.setVerticalAlignment('middle');
          sh.getRange(row, 1, b.baris.length + 1, n).setBorder(true, true, true, true, true, true, '#9ca3af', SpreadsheetApp.BorderStyle.SOLID);
          for (var c = 1; c <= n; c++) if (c !== 2 && !(b.lebarAkhir && c === n)) sh.getRange(row + 1, c, b.baris.length, 1).setHorizontalAlignment('center');
        }
        // lebar kolom: No sempit, Nama lebar, kolom jawaban/0-1 sempit
        sh.setColumnWidth(1, 36);
        if (S.nama === 'Nilai' || S.nama === 'Matriks') sh.setColumnWidth(2, 210);
        for (var k = (b.sempit || 99); k < n - (S.nama === 'Nilai' && b.kepala.indexOf('Benar') >= 0 ? 4 : (S.nama === 'Matriks' ? 1 : 0)); k++) sh.setColumnWidth(k + 1, 24);
        if (b.lebarAkhir) sh.setColumnWidth(n, b.lebarAkhir);
        row += b.baris.length + 1;
        sh.setFrozenRows(0);
        return;
      }
      if (b.jenis === 'ttd') {
        row += 2;
        var kanan = Math.max(3, maxCol - 7), span = Math.max(1, maxCol - kanan + 1);
        b.kiri.forEach(function (t, i) { if (t) sh.getRange(row + i, 2).setValue(t).setFontWeight(i === 5 ? 'bold' : 'normal'); });
        b.kanan.forEach(function (t, i) { if (t) sh.getRange(row + i, kanan, 1, span).merge().setValue(t).setFontWeight(i === 5 ? 'bold' : 'normal'); });
        row += b.kiri.length;
      }
    });
    sh.setHiddenGridlines(true);
  });
  SpreadsheetApp.flush();
  return ss;
}

/** folder arsip laporan di Drive pemilik Apps Script */
function folderLaporan_() {
  var it = DriveApp.getFoldersByName(LAP_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(LAP_FOLDER);
}

/** ekspor spreadsheet ke PDF (kertas F4/Folio) atau XLSX lewat endpoint ekspor Google */
function eksporLaporan_(ss, format, landscape) {
  var base = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?';
  var q = format === 'xlsx' ? 'format=xlsx' : ['format=pdf', 'size=folio', 'portrait=' + (!landscape), 'fitw=true', 'gridlines=false', 'printtitle=false', 'sheetnames=false',
    'pagenum=CENTER', 'fzr=false', 'horizontal_alignment=CENTER', 'top_margin=0.5', 'bottom_margin=0.5', 'left_margin=0.4', 'right_margin=0.4'].join('&');
  var r = UrlFetchApp.fetch(base + q, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('Ekspor ' + format.toUpperCase() + ' gagal (' + r.getResponseCode() + '). Jalankan menu Buleud Teu → Tes koneksi & izin sekali di spreadsheet.');
  return r.getBlob();
}

/** buat laporan; kembalikan berkas (base64) untuk diunduh aplikasi + tautan arsip Google Sheet */
function buatLaporan(examId, opsi, emailGuru) {
  var o = opsiLaporan_(opsi);
  var D = dataLaporan_(examId, o);
  var ss = renderLaporan_(D), file = DriveApp.getFileById(ss.getId());
  try { file.moveTo(folderLaporan_()); } catch (e) {}
  if (emailGuru) { try { file.addViewer(emailGuru); } catch (e) {} }
  var out = { result: 'success', nama: D.file, url: ss.getUrl(), format: o.format, bagian: o.bagian, mode: o.mode, ringkas: D.ringkas, landscape: D.landscape };
  if (o.format !== 'sheet') {
    var blob = eksporLaporan_(ss, o.format, D.landscape);
    out.mime = o.format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf';
    out.fileName = D.file + (o.format === 'xlsx' ? '.xlsx' : '.pdf');
    out.base64 = Utilities.base64Encode(blob.getBytes());
    out.ukuran = blob.getBytes().length;
  }
  return out;
}

/** aksi aplikasi: {action:'report', examId, mode, bagian[], format, lingkup, kelas, urut, orientasi} */
function apiReport_(d) {
  var g = auth_(d.token);
  wajibTerdaftar_();
  assertPemilik_(g, getUjian_(d.examId));
  var guru = rows_(SH.GURU).filter(function (r) { return r['Nama'] === g.nama; })[0];
  return buatLaporan(d.examId, d, guru && /@/.test(guru['Email']) ? String(guru['Email']).trim() : '');
}

// ---------------------------------------------------------------- menu spreadsheet: dialog pilihan laporan
function menuLaporan() {
  var html = HtmlService.createHtmlOutput(htmlDialogLaporan_()).setWidth(520).setHeight(640);
  SpreadsheetApp.getUi().showModalDialog(html, 'Buat laporan — Buleud Teu');
}
/** data untuk dialog: ujian aktif + kelas yang punya hasil scan */
function laporanPilihan() {
  var kelasPer = {};
  rows_(SH.HASIL).forEach(function (h) { var k = h['ID Ujian']; kelasPer[k] = kelasPer[k] || {}; kelasPer[k][String(h['Kelas']).toUpperCase()] = 1; });
  return { bagian: LAP_BAGIAN, mode: LAP_MODE, ujian: rows_(SH.UJIAN).map(ujianRow_).filter(function (u) { return u.status !== 'Arsip'; })
    .map(function (u) { return { id: u.id, nama: u.nama, mapel: u.mapel, guru: u.guru, jumlah: u.jumlah, kelas: Object.keys(kelasPer[u.id] || {}).sort() }; }) };
}
function laporanDariMenu(opsi) { return buatLaporan(opsi.examId, opsi, ''); }

function htmlDialogLaporan_() {
  return '<!doctype html><html><head><base target="_top"><style>' +
    'body{font:13px Arial,sans-serif;color:#1f2937;margin:14px}label{display:block;margin:3px 0}select,button{font:inherit;padding:6px;width:100%;margin:4px 0 10px}' +
    '.row{display:flex;gap:10px}.row>div{flex:1}.m{display:flex;gap:8px;margin-bottom:8px}.m label{flex:1;border:1px solid #cbd5e1;border-radius:8px;padding:8px;cursor:pointer}' +
    'h4{margin:10px 0 4px;color:#1e3a8a}#out{margin-top:10px;padding:8px;border-radius:8px;background:#f1f5f9;display:none}button.p{background:#2f62b0;color:#fff;border:0;border-radius:8px;padding:10px}' +
    '</style></head><body>' +
    '<h4>Ujian</h4><select id="ujian"></select>' +
    '<div class="row"><div><h4>Lingkup</h4><select id="lingkup"></select></div><div><h4>Urutan siswa</h4><select id="urut"><option value="kelas">Kelas, lalu nama</option><option value="nama">Nama</option><option value="skor">Skor tertinggi</option></select></div></div>' +
    '<h4>Mode</h4><div class="m"><label><input type="radio" name="mode" value="simpel" checked> <b>Simpel</b><br><small>pilihan jawaban, jumlah benar, skor</small></label>' +
    '<label><input type="radio" name="mode" value="lengkap"> <b>Lengkap</b><br><small>+ statistik & analisis butir</small></label></div>' +
    '<h4>Bagian yang dimuat</h4><div id="bagian"></div>' +
    '<div class="row"><div><h4>Format</h4><select id="format"><option value="pdf">PDF (kertas F4)</option><option value="xlsx">Excel (.xlsx)</option><option value="sheet">Google Sheet saja</option></select></div>' +
    '<div><h4>Privasi</h4><label><input type="checkbox" id="anonim"> Anonim (untuk rapat MGMP)</label></div><div><h4>Orientasi PDF</h4><select id="orientasi"><option value="auto">Otomatis</option><option value="portrait">Tegak</option><option value="landscape">Mendatar</option></select></div></div>' +
    '<button class="p" id="go">Buat laporan</button><div id="out"></div>' +
    '<script>var P;function $(i){return document.getElementById(i)}' +
    'function setMode(m){P.bagian.forEach(function(b){$("b_"+b[0]).checked=P.mode[m].indexOf(b[0])>=0})}' +
    'function kelas(){var u=P.ujian[$("ujian").selectedIndex];$("lingkup").innerHTML="<option value=\\"\\">Seluruh peserta ujian</option>"+(u?u.kelas:[]).map(function(k){return "<option>"+k+"</option>"}).join("")}' +
    'google.script.run.withSuccessHandler(function(p){P=p;$("ujian").innerHTML=p.ujian.map(function(u){return "<option>"+u.nama+" · "+u.mapel+" · "+u.jumlah+" soal"+(u.kelas.length?"":" (belum ada scan)")+"</option>"}).join("");kelas();' +
    '$("bagian").innerHTML=p.bagian.map(function(b){return "<label><input type=checkbox id=\\"b_"+b[0]+"\\"> "+b[1]+"</label>"}).join("");setMode("simpel")}).laporanPilihan();' +
    '$("ujian").onchange=kelas;document.querySelectorAll("input[name=mode]").forEach(function(r){r.onchange=function(){setMode(r.value)}});' +
    '$("go").onclick=function(){var u=P.ujian[$("ujian").selectedIndex];if(!u)return;var k=$("lingkup").value;' +
    'var o={examId:u.id,mode:document.querySelector("input[name=mode]:checked").value,bagian:P.bagian.map(function(b){return b[0]}).filter(function(b){return $("b_"+b).checked}),' +
    'format:$("format").value,anonim:$("anonim").checked,orientasi:$("orientasi").value,urut:$("urut").value,lingkup:k?"kelas":"tingkat",kelas:k};' +
    '$("go").disabled=true;$("go").textContent="Membuat laporan…";$("out").style.display="none";' +
    'google.script.run.withSuccessHandler(function(r){$("go").disabled=false;$("go").textContent="Buat laporan";var h="<b>Selesai:</b> "+r.nama+"<br><a href=\\""+r.url+"\\" target=_blank>Buka Google Sheet laporan</a>";' +
    'if(r.base64)h+="<br><a download=\\""+r.fileName+"\\" href=\\"data:"+r.mime+";base64,"+r.base64+"\\">Unduh "+r.format.toUpperCase()+"</a>";$("out").innerHTML=h;$("out").style.display="block"})' +
    '.withFailureHandler(function(e){$("go").disabled=false;$("go").textContent="Buat laporan";$("out").innerHTML="<b style=color:#b91c1c>Gagal:</b> "+e.message;$("out").style.display="block"}).laporanDariMenu(o)}' +
    '</script></body></html>';
}
