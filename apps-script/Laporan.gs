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
