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
      case 'report': return json_(apiReport_(data));
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
    .addItem('4. Buat laporan nilai / analisis (PDF, Excel)…', 'menuLaporan')
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
  // memicu izin ekspor laporan (PDF/Excel): akses URL eksternal + folder arsip laporan
  try { UrlFetchApp.fetch('https://docs.google.com/', { muteHttpExceptions: true }); folderLaporan_(); Logger.log('Izin laporan (ekspor PDF/Excel): OK'); } catch (e) { Logger.log('Izin laporan: ' + e); }
}
