// ===== Buleud Teu V40 — file tunggal (hasil build Code.gs + Statistik.gs). Tempel seluruh isi ke Code.gs =====

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
var SEKOLAH_KEYS = ['Nama Sekolah', 'NPSN', 'Jenjang (SD/SMP/SMA/SMK)', 'Alamat', 'Kota/Kabupaten', 'Kepala Sekolah', 'NIP Kepala Sekolah', 'Tahun Pelajaran', 'Logo (ID file Google Drive)'];

// ---------------------------------------------------------------- util
function doc_() {
  try { var d = SpreadsheetApp.getActiveSpreadsheet(); if (d) return d; } catch (e) {}
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Spreadsheet tidak ditemukan. Jalankan menu Buleud Teu → Setup dari spreadsheet sekolah.');
  return SpreadsheetApp.openById(id);
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
function cleanKey_(k) { return String(k || '').toUpperCase().replace(/[^A-E]/g, ''); }

// ---------------------------------------------------------------- konfigurasi sekolah
function sekolah_() {
  var s = doc_().getSheetByName(SH.SEKOLAH), o = {};
  if (!s || s.getLastRow() < 1) return o;
  s.getRange(1, 1, s.getLastRow(), 2).getDisplayValues().forEach(function (r) { if (r[0]) o[String(r[0]).trim()] = String(r[1]).trim(); });
  return {
    nama: o['Nama Sekolah'] || '', npsn: o['NPSN'] || '', jenjang: (o['Jenjang (SD/SMP/SMA/SMK)'] || '').toUpperCase(),
    alamat: o['Alamat'] || '', kota: o['Kota/Kabupaten'] || '', kepala: o['Kepala Sekolah'] || '', nipKepala: o['NIP Kepala Sekolah'] || '',
    tahun: o['Tahun Pelajaran'] || '', logoId: o['Logo (ID file Google Drive)'] || ''
  };
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
  if (!g) { var e2 = new Error('Guru tidak ditemukan.'); e2.auth = true; throw e2; }
  return guruInfo_(g);
}

// ---------------------------------------------------------------- data ujian & siswa
function ujianRow_(r) {
  var kunci = cleanKey_(r['Kunci']);
  return { id: r['ID'], nama: r['Nama Ujian'], mapel: r['Mapel'].toUpperCase(), tingkat: r['Tingkat'], kelas: splitList_(r['Kelas']),
    guru: r['Guru'], tanggal: r['Tanggal'], opsi: r['Opsi'] === 'ABCDE' ? 'ABCDE' : 'ABCD', kunci: kunci, jumlah: kunci.length,
    kktp: Number(r['KKTP']) || 75, status: r['Status'] || 'Aktif', _row: r._row };
}
function getUjian_(id) {
  var r = rows_(SH.UJIAN).filter(function (x) { return x['ID'] === id; })[0];
  if (!r) throw new Error('Ujian ' + id + ' tidak ditemukan.');
  return ujianRow_(r);
}
function siswaUntuk_(kelasList, tingkat) {
  var semua = kelasList.length === 0 || kelasList.indexOf('SEMUA') >= 0;
  return rows_(SH.SISWA).filter(function (s) {
    var kls = s['Kelas'].toUpperCase(), tk = s['Tingkat'] || String(tingkatDariKelas(kls) || '');
    return semua ? (!tingkat || String(tk) === String(tingkat)) : kelasList.indexOf(kls) >= 0;
  }).map(function (s) {
    return { nama: s['Nama'].toUpperCase(), kelas: s['Kelas'].toUpperCase(), nomor: s['Nomor Peserta'], nisn: s['NISN'],
      tingkat: s['Tingkat'] || String(tingkatDariKelas(s['Kelas']) || '') };
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
    return json_({ status: 'connected', version: VERSION, sekolah: { nama: sk.nama, npsn: sk.npsn, jenjang: sk.jenjang, kota: sk.kota, tahun: sk.tahun, kepala: sk.kepala, opsiDefault: opsiDefault_(sk.jenjang), logo: logoDataUrl_(sk.logoId) }, guru: guru });
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
      case 'ocr': auth_(data.token); return json_({ result: 'success', text: ocrImage_(data.image) });
      case 'analyze': return json_(apiAnalyze_(data));
      case 'bank': return json_(withLock_(function () { return apiBank_(data); }));
      default: return json_({ error: 'Aksi tidak dikenal: ' + data.action });
    }
  } catch (err) { return json_({ error: String(err.message || err), auth: !!err.auth }); }
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
  var kelasSet = {};
  ujian.forEach(function (u) { siswaUntuk_(u.kelas, u.tingkat).forEach(function (s) { kelasSet[s.kelas + '|' + s.nama] = s; }); });
  g.kelas.forEach(function (k) { siswaUntuk_([k]).forEach(function (s) { kelasSet[s.kelas + '|' + s.nama] = s; }); });
  var siswa = Object.keys(kelasSet).map(function (k) { return kelasSet[k]; });
  // jumlah yang sudah discan per ujian
  var hasil = rows_(SH.HASIL), cnt = {};
  hasil.forEach(function (h) { var k = h['ID Ujian']; cnt[k] = cnt[k] || {}; cnt[k][h['Kelas'] + '|' + h['Nama']] = 1; });
  ujian.forEach(function (u) { u.terscan = Object.keys(cnt[u.id] || {}); delete u._row; });
  var kelasSemua = Object.keys(rows_(SH.SISWA).reduce(function (a, s) { a[s['Kelas'].toUpperCase()] = 1; return a; }, {})).sort();
  return { result: 'success', guru: g, ujian: ujian, siswa: siswa, kelasSemua: kelasSemua, opsiDefault: opsiDefault_(sekolah_().jenjang) };
}

function apiSaveExam_(d) {
  var g = auth_(d.token), x = d.exam || {}, sh = sheet_(SH.UJIAN);
  var kunci = cleanKey_(x.kunci);
  if (!x.nama || !x.mapel) throw new Error('Nama ujian dan mapel wajib diisi.');
  if (kunci.length < 1 || kunci.length > 50) throw new Error('Kunci harus 1–50 huruf (jumlah soal = panjang kunci).');
  var opsi = x.opsi === 'ABCDE' ? 'ABCDE' : 'ABCD';
  if (opsi === 'ABCD' && /E/.test(kunci)) throw new Error('Kunci berisi E padahal opsi ABCD.');
  var kelas = (x.kelas || []).map(function (k) { return String(k).toUpperCase(); });
  var tingkat = x.tingkat || (kelas.length ? tingkatDariKelas(kelas[0]) : '') || '';
  var row = [x.id || '', x.nama, String(x.mapel).toUpperCase(), tingkat, kelas.join(', ') || 'SEMUA', g.nama, x.tanggal || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'), opsi, kunci, kunci.length, Number(x.kktp) || 75, 'Aktif', now_()];
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
  var g = auth_(d.token), u = getUjian_(d.id);
  if (u.guru.toUpperCase() !== g.nama.toUpperCase()) throw new Error('Ujian ini milik guru lain.');
  sheet_(SH.UJIAN).getRange(u._row, 12).setValue('Arsip');
  return { result: 'success' };
}

function apiSave_(d) {
  var g = auth_(d.token), u = getUjian_(d.examId), s = d.siswa || {};
  if (!s.nama) throw new Error('Nama siswa kosong.');
  var jw = (d.answers || []).slice(0, u.jumlah).map(function (a) { a = String(a || '-').toUpperCase(); return u.opsi.indexOf(a) >= 0 ? a : '-'; });
  while (jw.length < u.jumlah) jw.push('-');
  var benar = 0; for (var i = 0; i < u.jumlah; i++) if (jw[i] === u.kunci.charAt(i)) benar++;
  var skor = Math.round(benar / u.jumlah * 10000) / 100;
  var kls = String(s.kelas || '').toUpperCase();
  sheet_(SH.HASIL).appendRow([now_(), u.id, u.mapel, u.tingkat || tingkatDariKelas(kls) || '', kls, String(s.nama).toUpperCase(), s.nisn ? "'" + s.nisn : '', s.nomor ? "'" + s.nomor : '',
    "'" + jw.join(''), benar, u.jumlah, skor, (d.flags || []).join(','), d.mode || '', d.quality || '', g.nama, d.scanId || '']);
  return { result: 'success', benar: benar, jumlah: u.jumlah, skor: skor };
}

// ---------------------------------------------------------------- analisis
function responsUjian_(u, lingkup, kelas) {
  var latest = {};
  rows_(SH.HASIL).forEach(function (h) {
    if (h['ID Ujian'] !== u.id) return;
    if (lingkup === 'kelas' && h['Kelas'].toUpperCase() !== String(kelas).toUpperCase()) return;
    latest[h['Kelas'] + '|' + h['Nama']] = { nama: h['Nama'], kelas: h['Kelas'], jawaban: h['Jawaban'].replace(/^'/, '') };   // scan terakhir menang
  });
  return Object.keys(latest).sort().map(function (k) { return latest[k]; });
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
    ['Reliabilitas KR-20', R.kr20 == null ? '-' : R.kr20 + ' (' + R.kategoriKr20 + ')'], ['KR-21', R.kr21], ['SEM (skor mentah)', R.sem],
    ['r tabel (α 0,05)', R.rTabel], ['Tuntas (KKTP ' + A.kktp + ')', (R.tuntas || 0) + ' siswa (' + (R.persenTuntas || 0) + '%)'],
    ['Rekomendasi butir', 'Diterima ' + (R.diterima || 0) + ' · Direvisi ' + (R.direvisi || 0) + ' · Dibuang ' + (R.dibuang || 0)],
    ['Dianalisis', now_()]
  ];
  sh.getRange(row, 1, info.length, 2).setValues(info.map(function (r) { return [r[0], r[1] == null ? '-' : r[1]]; }));
  sh.getRange(row, 1, info.length, 1).setFontWeight('bold');
  row += info.length;
  if (A.peringatan.length) { sh.getRange(row, 1).setValue('Catatan: ' + A.peringatan.join(' ')).setFontColor('#b45309'); row++; }
  row++;
  if (!A.butir.length) return;
  var letters = A.opsi.split('');
  var head = ['No', 'Kunci', 'Benar', 'P', 'TK', 'D', 'DP', 'r pbis', 'r tabel', 'Valid', 'KR20 jika dihapus']
    .concat(letters.map(function (L) { return '% ' + L; })).concat(['% Kosong', 'Pengecoh Berfungsi', 'Rekomendasi', 'Alasan']);
  sh.getRange(row, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#e5e7eb');
  var body = A.butir.map(function (b) {
    return [b.no, b.kunci, b.benar, b.p, b.tk, b.d, b.dp, b.rpbis == null ? '-' : b.rpbis, b.rTabel == null ? '-' : b.rTabel, b.valid ? 'Valid' : 'Tidak',
      b.kr20JikaDihapus == null ? '-' : b.kr20JikaDihapus]
      .concat(letters.map(function (L) { return Math.round(b.sebaran[L].p * 1000) / 10; }))
      .concat([Math.round(b.sebaran['-'].p * 1000) / 10, b.pengecohBerfungsi.join(', ') || '-', b.rekomendasi, b.alasan]);
  });
  sh.getRange(row + 1, 1, body.length, head.length).setValues(body);
  var warna = A.butir.map(function (b) { var c = b.rekomendasi === 'Diterima' ? '#dcfce7' : (b.rekomendasi === 'Dibuang' ? '#fee2e2' : '#fef9c3'); return head.map(function () { return c; }); });
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
  auth_(d.token);
  var r = analisisUjian(d.examId, d.lingkup, d.kelas);
  var A = r.hasil;
  return { result: 'success', sheet: r.sheet, ringkasan: A.ringkasan, peringatan: A.peringatan,
    butir: A.butir.map(function (b) { return { no: b.no, kunci: b.kunci, p: b.p, tk: b.tk, d: b.d, dp: b.dp, rpbis: b.rpbis, valid: b.valid, rekomendasi: b.rekomendasi, alasan: b.alasan, sebaran: b.sebaran }; }) };
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
    var row = [kode, u.mapel, u.tingkat, lk, u.id, u.nama, b.no, b.kunci, A.n, b.p, b.tk, b.d, b.dp, b.rpbis, b.rTabel, b.valid ? 'Valid' : 'Tidak', b.kr20JikaDihapus,
      b.pengecohBerfungsi.join(', '), b.pengecohMati.join(', '), b.rekomendasi, b.alasan, tgl];
    var r0 = idx[kode + '|' + lk];
    if (r0) { sh.getRange(r0, 1, 1, row.length).setValues([row]); ubah++; }
    else { sh.appendRow(row.concat([b.rekomendasi === 'Diterima' ? 'Pakai' : (b.rekomendasi === 'Dibuang' ? 'Arsip' : 'Revisi'), ''])); baru++; }
  });
  return { result: 'success', baru: baru, diperbarui: ubah, sheet: r.sheet };
}
function apiBank_(d) { auth_(d.token); return bankSoal(d.examId, d.lingkup, d.kelas); }

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
    .addSeparator()
    .addItem('Tes koneksi & izin', 'tesKoneksi')
    .addToUi();
}

function setup() {
  var d = doc_();
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', d.getId());
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
  sheet_(SH.BANK).getRange('W2:W').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Pakai', 'Revisi', 'Arsip'], true).build());
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
  SpreadsheetApp.getUi().alert('Selesai: ' + r.sheet + '\nSiswa ' + r.hasil.n + ', soal ' + r.hasil.k + '\nKR-20 ' + R.kr20 + ' (' + R.kategoriKr20 + ')\nDiterima ' + R.diterima + ' · Direvisi ' + R.direvisi + ' · Dibuang ' + R.dibuang + (r.hasil.peringatan.length ? '\n\n' + r.hasil.peringatan.join('\n') : ''));
}
function menuBank() {
  var p = pilihUjianDialog_('Simpan ke Bank Soal'); if (!p) return;
  var r = bankSoal(p.id, p.lingkup, p.kelas);
  SpreadsheetApp.getUi().alert('Bank Soal diperbarui: ' + r.baru + ' butir baru, ' + r.diperbarui + ' diperbarui.');
}

function tesKoneksi() {
  var d = doc_();
  Logger.log('Spreadsheet: ' + d.getName() + ' | Sheet: ' + d.getSheets().map(function (s) { return s.getName(); }).join(', '));
  var c = JSON.parse(doGet({ parameter: { action: 'config' } }).getContent());
  Logger.log('Sekolah: ' + (c.sekolah ? c.sekolah.nama : '-') + ' | Guru aktif: ' + (c.guru ? c.guru.length : 0) + (c.error ? ' | ERROR ' + c.error : ''));
  Logger.log('Siswa: ' + rows_(SH.SISWA).length + ' | Ujian: ' + rows_(SH.UJIAN).length + ' | Drive API: ' + (typeof Drive !== 'undefined' ? 'aktif' : 'BELUM ditambahkan'));
  // memicu izin Google Docs + Drive (dibutuhkan OCR)
  try { var t = DocumentApp.create('buleudteu_tes_izin'); DriveApp.getFileById(t.getId()).setTrashed(true); Logger.log('Izin Docs/Drive: OK'); } catch (e) { Logger.log('Izin Docs/Drive: ' + e); }
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
 *   Validitas             : r point-biserial terkoreksi (butir vs skor total tanpa butir itu) >= r tabel (α = 0,05, dua sisi)
 *   Reliabilitas          : KR-20 (varians populasi /N), KR-21, SEM
 *                           0,80–1,00 Sangat Tinggi · 0,60–0,79 Tinggi · 0,40–0,59 Sedang · 0,20–0,39 Rendah · <0,20 Sangat Rendah
 *   Pengecoh berfungsi    : dipilih >= 5% peserta DAN lebih banyak dipilih kelompok bawah daripada kelompok atas
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
  kunci = String(kunci || '').toUpperCase().replace(/[^A-E]/g, '');
  opsi = opsi === 'ABCDE' ? 'ABCDE' : 'ABCD';
  kktp = Number(kktp) || 75;
  var k = kunci.length, n = respons.length;
  var hasil = { n: n, k: k, opsi: opsi, kktp: kktp, peringatan: [], butir: [], siswa: [], ringkasan: null };
  if (!k) { hasil.peringatan.push('Kunci jawaban kosong.'); return hasil; }
  if (n < 2) { hasil.peringatan.push('Minimal 2 siswa untuk analisis.'); return hasil; }
  if (n < 20) hasil.peringatan.push('Jumlah siswa ' + n + ' (< 20): statistik butir kurang stabil, gunakan sebagai gambaran awal.');

  // matriks benar/salah + pilihan
  var X = [], C = [];
  respons.forEach(function (r) {
    var jw = String(r.jawaban || '').toUpperCase(), row = [], ch = [];
    for (var j = 0; j < k; j++) { var a = jw.charAt(j) || '-'; if (opsi.indexOf(a) < 0) a = '-'; ch.push(a); row.push(a === kunci.charAt(j) ? 1 : 0); }
    X.push(row); C.push(ch);
  });
  var total = X.map(function (r) { return r.reduce(function (s, v) { return s + v; }, 0); });
  var skor = total.map(function (t) { return Math.round(t / k * 10000) / 100; });

  // kelompok atas/bawah 27% (n < 20: 50%)
  var urut = total.map(function (t, i) { return { t: t, i: i }; }).sort(function (a, b) { return b.t - a.t || a.i - b.i; });
  var g = n >= 20 ? Math.max(1, Math.round(n * 0.27)) : Math.floor(n / 2);
  var atas = urut.slice(0, g).map(function (o) { return o.i; }), bawah = urut.slice(n - g).map(function (o) { return o.i; });

  var rTab = statRTabel_(n);
  var varTot = statVarPop_(total), sdTot = Math.sqrt(varTot);
  var r20 = kr20_(X, k);
  var M = statMean_(total);
  var r21 = (varTot > 0 && k > 1) ? (k / (k - 1)) * (1 - M * (k - M) / (k * varTot)) : null;

  for (var j = 0; j < k; j++) {
    var col = X.map(function (r) { return r[j]; });
    var benar = col.reduce(function (s, v) { return s + v; }, 0), p = benar / n;
    var pU = atas.reduce(function (s, i) { return s + X[i][j]; }, 0) / g;
    var pL = bawah.reduce(function (s, i) { return s + X[i][j]; }, 0) / g;
    var D = g ? pU - pL : null;
    var rest = total.map(function (t, i) { return t - X[i][j]; });
    var rpb = statPearson_(col, rest);
    var valid = rpb != null && rTab != null && rpb >= rTab;
    // KR-20 jika butir dihapus
    var Xd = X.map(function (r) { return r.filter(function (_, jj) { return jj !== j; }); });
    var r20del = kr20_(Xd, k - 1);
    // pengecoh
    var dist = {}, berfungsi = [], mati = [];
    var letters = (opsi + '-').split('');
    letters.forEach(function (L) {
      var cnt = 0, cU = 0, cL = 0;
      for (var i = 0; i < n; i++) if (C[i][j] === L) cnt++;
      atas.forEach(function (i) { if (C[i][j] === L) cU++; });
      bawah.forEach(function (i) { if (C[i][j] === L) cL++; });
      dist[L] = { n: cnt, p: cnt / n, atas: g ? cU / g : 0, bawah: g ? cL / g : 0 };
      if (L !== '-' && L !== kunci.charAt(j)) {
        if (cnt / n >= 0.05 && cL >= cU) berfungsi.push(L); else mati.push(L);
      }
    });
    var nDis = opsi.length - 1;
    // rekomendasi
    var alasan = [], rek;
    if ((D != null && D < 0) || (rpb != null && rpb < 0)) {
      rek = 'Dibuang';
      if (D != null && D < 0) alasan.push('daya pembeda negatif (kelompok bawah lebih banyak benar)');
      if (rpb != null && rpb < 0) alasan.push('korelasi butir-total negatif');
      alasan.push('periksa kunci jawaban');
    } else {
      if (!valid) alasan.push(rpb == null ? 'validitas tidak dapat dihitung (semua benar/salah)' : 'tidak valid (r ' + rpb.toFixed(2) + ' < r tabel ' + (rTab == null ? '-' : rTab.toFixed(2)) + ')');
      if (D == null || D <= 0.20) alasan.push('daya pembeda jelek');
      if (berfungsi.length < Math.ceil(nDis / 2)) alasan.push('pengecoh tidak berfungsi: ' + (mati.join(', ') || '-'));
      if (p > 0.90) alasan.push('terlalu mudah');
      if (p < 0.10) alasan.push('terlalu sukar');
      rek = alasan.length === 0 || (alasan.length === 1 && /terlalu/.test(alasan[0]) && valid && D > 0.20) ? 'Diterima' : 'Direvisi';
    }
    hasil.butir.push({
      no: j + 1, kunci: kunci.charAt(j), benar: benar, p: round_(p, 3), tk: kategoriP_(p),
      d: D == null ? null : round_(D, 3), dp: kategoriD_(D), rpbis: rpb == null ? null : round_(rpb, 3), rTabel: rTab == null ? null : round_(rTab, 3),
      valid: valid, kr20JikaDihapus: r20del == null ? null : round_(r20del, 3), sebaran: dist,
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
    dibuang: hasil.butir.filter(function (b) { return b.rekomendasi === 'Dibuang'; }).length
  };
  return hasil;
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

if (typeof module !== 'undefined') module.exports = { analisisButir: analisisButir, statRTabel_: statRTabel_, kr20_: kr20_, tingkatDariKelas: tingkatDariKelas };
