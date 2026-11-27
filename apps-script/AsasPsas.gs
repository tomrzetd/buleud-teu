/*
 * BULEUD TEU — Pembuat kode ujian ASAS/PSAS massal + Dashboard Rekap
 * File TAMBAHAN di proyek Apps Script yang sama dengan Code.gs (Code.gs boleh versi minified).
 * Tidak perlu redeploy: fungsi dijalankan dari editor (pilih fungsi → Run).
 *
 *   1. rencanaUjianASAS()   : tulis sheet "Rencana Ujian ASAS" (tidak mengubah sheet Ujian). Periksa dulu.
 *   2. buatUjianASAS()      : tambahkan baris ke sheet Ujian sesuai rencana (yang sudah ada dilewati).
 *   3. perbaruiDashboardASAS(): sheet "Dashboard ASAS" (progres scan, rata-rata, ketuntasan per mapel × rombel).
 *      pasangPemicuDashboardASAS(): perbarui otomatis tiap 10 menit.
 *
 * Satu ujian = satu guru × satu mapel × satu tingkat, rombel = rombel yang diampu guru itu di tingkat tsb.
 * Kunci diisi "?" sebanyak jumlah soal: guru WAJIB mengisi kunci lewat Edit di aplikasi sebelum memindai.
 */
var ASAS_CONFIG = {
  namaUjian: 'ASAS',
  jumlahSoal: 25,
  opsi: 'ABCD',
  // KKTP PSAT Semester Ganjil 2026-2027 (Tabel KKTP SMPN 2 Jalaksana, 20 Nov 2026) untuk tingkat 7, 8, 9.
  // Tanggal dari Jadwal Pengawas PSAS Ganjil 2026-2027 (hari 1–4). Mapel tanpa tanggal: belum ada di jadwal.
  mapel: [
    { kode: 'PAI',    re: /AGAMA|\bPAI\b|PAI.?BP|PABP|BUDI PEKERTI/, kktp: [73, 75, 77], tanggal: '2026-11-30' },
    { kode: 'BINDO',  re: /INDONESIA|\bB\.? ?INDO|\bBIND\b/,            kktp: [73, 75, 77], tanggal: '2026-11-30' },
    { kode: 'MTK',    re: /MATEMATIKA|\bMTK\b|\bMAT\b/,                 kktp: [71, 73, 75], tanggal: '2026-12-01' },
    { kode: 'SUNDA',  re: /SUNDA/,                                      kktp: [73, 75, 77], tanggal: '2026-12-01' },
    { kode: 'IPA',    re: /\bIPA\b|PENGETAHUAN ALAM/,                   kktp: [71, 73, 75], tanggal: '2026-12-02' },
    { kode: 'BING',   re: /INGGRIS|\bB\.? ?ING\b|\bBING\b/,             kktp: [71, 73, 75], tanggal: '2026-12-02' },
    { kode: 'PPKN',   re: /PPKN|\bPKN\b|PANCASILA|KEWARGANEGARAAN/,     kktp: [73, 75, 77], tanggal: '2026-12-03' },
    { kode: 'IPS',    re: /\bIPS\b|PENGETAHUAN SOSIAL/,                 kktp: [73, 75, 77], tanggal: '2026-12-03' },
    { kode: 'PENJAS', re: /PENJAS|PJOK|JASMANI|OLAHRAGA/,               kktp: [73, 75, 77], tanggal: '' },
    { kode: 'INFO',   re: /INFORMATIKA|\bTIK\b|CODING/,                 kktp: [71, 73, 75], tanggal: '' },
    { kode: 'PKY',    re: /PRAKARYA/,                                   kktp: [73, 75, 77], tanggal: '' },
    { kode: 'MULOK',  re: /CIREMAI|MULOK|MUATAN LOKAL/,                 kktp: [73, 75, 77], tanggal: '' }
  ]
};
var ASAS_SHEET_RENCANA = 'Rencana Ujian ASAS';
var ASAS_SHEET_DASH = 'Dashboard ASAS';

function asasMapel_(nama) {
  var u = String(nama || '').toUpperCase();
  for (var i = 0; i < ASAS_CONFIG.mapel.length; i++) if (ASAS_CONFIG.mapel[i].re.test(u)) return ASAS_CONFIG.mapel[i];
  return null;
}
function asasTingkat_(kode) {
  var t = tingkatDariKelas(kode);
  return t >= 7 && t <= 9 ? String(t) : '';
}
/** daftar rombel yang ada di sheet Siswa per tingkat: { '7': ['7A',...], ... } */
function asasRombel_() {
  var out = { '7': {}, '8': {}, '9': {} };
  rows_(SH.SISWA).map(siswaInfo_).forEach(function (s) { if (out[s.tingkat] && s.kelas) out[s.tingkat][s.kelas] = (out[s.tingkat][s.kelas] || 0) + 1; });
  Object.keys(out).forEach(function (t) { out[t] = Object.keys(out[t]).sort(); });
  return out;
}

/** Hitung rencana tanpa mengubah apa pun. */
function rencanaASAS_() {
  ROWS_CACHE_ = {};
  var rombel = asasRombel_();
  var ada = rows_(SH.UJIAN).map(ujianRow_).filter(function (u) { return u.status !== 'Arsip'; });
  var plan = [], catatan = [];
  rows_(SH.GURU).filter(function (g) { return g['Nama'] && !/^(TIDAK|NO|N)$/i.test(g['Aktif']); }).forEach(function (row) {
    var g = guruInfo_(row);
    if (!g.mapel.length) { catatan.push(g.nama + ': kolom Mapel kosong'); return; }
    if (!g.kelas.length) { catatan.push(g.nama + ': kolom Tingkat/Rombel Diampu kosong'); return; }
    // kelompokkan rombel diampu per tingkat; "8" = seluruh tingkat 8, "SEMUA" = semua tingkat
    var perT = {};
    g.kelas.forEach(function (k) {
      if (k === 'SEMUA') { ['7', '8', '9'].forEach(function (t) { perT[t] = perT[t] || {}; perT[t][t] = 1; }); return; }
      var t = asasTingkat_(k);
      if (!t) { catatan.push(g.nama + ': kelas "' + k + '" tidak dikenali'); return; }
      perT[t] = perT[t] || {};
      if (/^(7|8|9)$/.test(k)) perT[t][k] = 1;
      else if (rombel[t].indexOf(k) >= 0) perT[t][k] = 1;
      else catatan.push(g.nama + ': rombel ' + k + ' tidak ada di sheet Siswa');
    });
    g.mapel.forEach(function (mp) {
      var cfg = asasMapel_(mp);
      if (!cfg) { catatan.push(g.nama + ': mapel "' + mp + '" tidak ada di tabel KKTP/jadwal, dilewati'); return; }
      Object.keys(perT).sort().forEach(function (t) {
        var rb = Object.keys(perT[t]);
        if (!rb.length) return;
        // "8" menutupi seluruh tingkat: rombel lain di tingkat itu tidak perlu ditulis
        if (rb.indexOf(t) >= 0) rb = [t];
        rb.sort();
        var sama = ada.filter(function (u) {
          return u.guru.toUpperCase() === g.nama.toUpperCase() && u.mapel === mp.toUpperCase() &&
            String(u.tingkat) === t && u.nama.toUpperCase() === ASAS_CONFIG.namaUjian.toUpperCase();
        })[0];
        var kktp = cfg.kktp[Number(t) - 7];
        plan.push({
          guru: g.nama, mapel: mp.toUpperCase(), tingkat: t, rombel: rb.join(', '), tanggal: cfg.tanggal, kktp: kktp,
          status: sama ? 'Sudah ada (' + sama.id + ')' : 'Akan dibuat',
          catatan: sama ? ((sama.kktp !== kktp ? 'KKTP di sheet ' + sama.kktp + ', tabel ' + kktp + '. ' : '') +
            (/\?/.test(sama.kunci) ? 'Kunci belum lengkap.' : '')) : (cfg.tanggal ? '' : 'Tanggal belum ada di jadwal (isi manual).'),
          ada: sama || null
        });
      });
    });
  });
  return { plan: plan, catatan: catatan };
}

function tulisRencana_(r, judul) {
  var d = doc_(), sh = d.getSheetByName(ASAS_SHEET_RENCANA) || d.insertSheet(ASAS_SHEET_RENCANA);
  sh.clear();
  sh.getRange(1, 1).setValue(judul).setFontWeight('bold').setFontSize(12);
  var head = ['Guru', 'Mapel', 'Tingkat', 'Nama Rombel', 'Tanggal', 'KKTP', 'Status', 'Catatan'];
  sh.getRange(3, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#e0e7ff');
  if (r.plan.length) {
    sh.getRange(4, 1, r.plan.length, head.length).setValues(r.plan.map(function (p) { return [p.guru, p.mapel, p.tingkat, p.rombel, p.tanggal || '-', p.kktp, p.status, p.catatan || '']; }));
    sh.getRange(4, 1, r.plan.length, head.length).setBackgrounds(r.plan.map(function (p) {
      var c = /^Dibuat|^Akan/.test(p.status) ? '#dcfce7' : '#f3f4f6'; return head.map(function () { return c; });
    }));
  }
  var y = 5 + r.plan.length;
  if (r.catatan.length) {
    sh.getRange(y, 1).setValue('Perlu diperiksa di sheet Guru / Siswa:').setFontWeight('bold').setFontColor('#b45309');
    sh.getRange(y + 1, 1, r.catatan.length, 1).setValues(r.catatan.map(function (c) { return [c]; }));
  }
  sh.setFrozenRows(3);
  return sh;
}

/** LANGKAH 1: hanya menulis sheet "Rencana Ujian ASAS". */
function rencanaUjianASAS() {
  var r = rencanaASAS_();
  var baru = r.plan.filter(function (p) { return p.status === 'Akan dibuat'; }).length;
  tulisRencana_(r, 'Rencana ' + ASAS_CONFIG.namaUjian + ' — ' + baru + ' ujian akan dibuat, ' + (r.plan.length - baru) + ' sudah ada · ' + now_());
  Logger.log('Rencana: ' + baru + ' baru, ' + (r.plan.length - baru) + ' sudah ada, ' + r.catatan.length + ' catatan. Lihat sheet "' + ASAS_SHEET_RENCANA + '".');
  return { baru: baru, ada: r.plan.length - baru, catatan: r.catatan };
}

/** LANGKAH 2: tambahkan ujian yang belum ada ke sheet Ujian. Aman dijalankan berulang. */
function buatUjianASAS() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Server sibuk, coba lagi.');
  try {
    var r = rencanaASAS_(), sh = sheet_(SH.UJIAN);
    var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
    var col = function (n) { var i = head.indexOf(n); if (i < 0 && n === 'Tingkat Pendidikan') i = head.indexOf('Tingkat'); if (i < 0 && n === 'Nama Rombel') i = head.indexOf('Kelas'); return i; };
    ['ID', 'Nama Ujian', 'Mapel', 'Tingkat Pendidikan', 'Nama Rombel', 'Guru', 'Kunci', 'Status'].forEach(function (n) { if (col(n) < 0) throw new Error('Kolom "' + n + '" tidak ada di sheet Ujian. Jalankan Setup dulu.'); });
    var dipakai = {}; rows_(SH.UJIAN).forEach(function (u) { dipakai[u['ID']] = 1; });
    var tgl = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyMMdd'), rowsOut = [];
    r.plan.forEach(function (p) {
      if (p.status !== 'Akan dibuat') return;
      var id; do { id = 'U' + tgl + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(); } while (dipakai[id]); dipakai[id] = 1;
      var row = head.map(function () { return ''; }), set = function (n, v) { var i = col(n); if (i >= 0) row[i] = v; };
      set('ID', id); set('Nama Ujian', ASAS_CONFIG.namaUjian); set('Mapel', p.mapel); set('Tingkat Pendidikan', p.tingkat);
      set('Nama Rombel', p.rombel); set('Guru', p.guru); set('Tanggal', p.tanggal); set('Opsi', ASAS_CONFIG.opsi);
      set('Kunci', new Array(ASAS_CONFIG.jumlahSoal + 1).join('?')); set('Jumlah Soal', ASAS_CONFIG.jumlahSoal);
      set('KKTP', p.kktp); set('Status', 'Aktif'); set('Dibuat', now_());
      rowsOut.push(row); p.status = 'Dibuat (' + id + ')'; p.catatan = 'Guru mengisi kunci lewat Edit di aplikasi.';
    });
    if (rowsOut.length) {
      var start = sh.getLastRow() + 1;
      sh.getRange(start, 1, rowsOut.length, head.length).setValues(rowsOut);
      sh.getRange(start, col('Kunci') + 1, rowsOut.length, 1).setNumberFormat('@');
      sh.getRange(start, col('Kunci') + 1, rowsOut.length, 1).setValues(rowsOut.map(function (x) { return [x[col('Kunci')]]; }));
    }
    ROWS_CACHE_ = {};
    tulisRencana_(r, 'Hasil ' + ASAS_CONFIG.namaUjian + ' — ' + rowsOut.length + ' ujian dibuat · ' + now_());
    Logger.log(rowsOut.length + ' ujian dibuat. Rincian di sheet "' + ASAS_SHEET_RENCANA + '".');
    return { dibuat: rowsOut.length, catatan: r.catatan };
  } finally { lock.releaseLock(); }
}

/** Dashboard: progres scan & hasil per mapel × rombel untuk semua ujian bernama ASAS. */
function perbaruiDashboardASAS() {
  ROWS_CACHE_ = {};
  var nama = ASAS_CONFIG.namaUjian.toUpperCase();
  var ujian = rows_(SH.UJIAN).map(ujianRow_).filter(function (u) { return u.status !== 'Arsip' && u.nama.toUpperCase() === nama; });
  var siswa = rows_(SH.SISWA).map(siswaInfo_).filter(function (s) { return s.nama && s.kelas && /^(7|8|9)$/.test(s.tingkat); });
  var jmlRombel = {}; siswa.forEach(function (s) { jmlRombel[s.kelas] = (jmlRombel[s.kelas] || 0) + 1; });
  var rombelT = asasRombel_(), semuaRombel = [].concat(rombelT['7'], rombelT['8'], rombelT['9']);
  sinkronSkor_();
  var hasil = {}, byId = {}; ujian.forEach(function (u) { byId[u.id] = u; });
  rows_(SH.HASIL).forEach(function (h) {
    var u = byId[h['ID Ujian']]; if (!u) return;
    var k = h['ID Ujian'] + '|' + String(h['Kelas']).toUpperCase();
    var key = String(h['NISN'] || '').replace(/\D/g, '') || h['Nama'];
    (hasil[k] = hasil[k] || {})[key] = skorDariJawaban_(h['Jawaban'], u).skor;   // selalu dari kunci TERBARU
  });
  // sel: mapel × rombel -> { n, total, rata, tuntas, kunciOk }
  var mapelList = [], sel = {};
  ujian.forEach(function (u) {
    if (mapelList.indexOf(u.mapel) < 0) mapelList.push(u.mapel);
    var rbs = (u.kelas.length && u.kelas.indexOf('SEMUA') < 0 ? u.kelas : [String(u.tingkat)]).reduce(function (a, k) {
      return a.concat(/^(7|8|9)$/.test(k) ? (rombelT[k] || []) : [k]);
    }, []);
    rbs.forEach(function (rb) {
      var sk = hasil[u.id + '|' + rb] || {}, vals = Object.keys(sk).map(function (x) { return sk[x]; });
      var c = sel[u.mapel + '|' + rb] = sel[u.mapel + '|' + rb] || { n: 0, total: jmlRombel[rb] || 0, sum: 0, tuntas: 0, kunciOk: true, kktp: u.kktp, guru: [] };
      c.n += vals.length; vals.forEach(function (v) { c.sum += v; if (v >= u.kktp) c.tuntas++; });
      if (/\?/.test(u.kunci)) c.kunciOk = false;
      if (c.guru.indexOf(u.guru) < 0) c.guru.push(u.guru);
    });
  });
  mapelList.sort(function (a, b) { var ia = idx(a), ib = idx(b); return ia - ib || a.localeCompare(b); });
  function idx(m) { var c = asasMapel_(m); return c ? ASAS_CONFIG.mapel.indexOf(c) : 99; }

  var d = doc_(), sh = d.getSheetByName(ASAS_SHEET_DASH) || d.insertSheet(ASAS_SHEET_DASH);
  sh.clear();
  var sk = sekolah_();
  sh.getRange(1, 1).setValue('DASHBOARD ' + nama + ' — ' + (sk.nama || '') + (sk.tahun ? ' · ' + sk.tahun : '')).setFontWeight('bold').setFontSize(13);
  // ringkasan
  var totN = 0, totT = 0, totTuntas = 0, totSum = 0, kunciKosong = 0;
  Object.keys(sel).forEach(function (k) { var c = sel[k]; totN += c.n; totT += c.total; totTuntas += c.tuntas; totSum += c.sum; if (!c.kunciOk) kunciKosong++; });
  var ring = [['Diperbarui', now_()], ['Ujian ' + nama + ' aktif', ujian.length], ['Lembar terscan', totN + ' dari ' + totT + ' (' + (totT ? Math.round(totN / totT * 100) : 0) + '%)'],
    ['Rata-rata skor', totN ? Math.round(totSum / totN * 10) / 10 : '-'], ['Tuntas KKTP', totN ? totTuntas + ' (' + Math.round(totTuntas / totN * 100) + '%)' : '-'],
    ['Sel mapel × rombel dengan kunci belum lengkap', kunciKosong]];
  sh.getRange(3, 1, ring.length, 2).setValues(ring);
  sh.getRange(3, 1, ring.length, 1).setFontWeight('bold');
  var y = 4 + ring.length;
  // tiga matriks: progres scan, rata-rata, % tuntas
  var blok = [
    ['PROGRES SCAN (terscan / jumlah siswa)', function (c) { return c.n + '/' + c.total; }, function (c) { return !c.kunciOk ? '#fde68a' : c.total && c.n >= c.total ? '#86efac' : c.n ? '#dcfce7' : '#f3f4f6'; }],
    ['RATA-RATA SKOR', function (c) { return c.n ? Math.round(c.sum / c.n * 10) / 10 : ''; }, function (c) { return !c.n ? '#f3f4f6' : c.sum / c.n >= c.kktp ? '#dcfce7' : '#fee2e2'; }],
    ['% TUNTAS KKTP', function (c) { return c.n ? Math.round(c.tuntas / c.n * 100) + '%' : ''; }, function (c) { return !c.n ? '#f3f4f6' : c.tuntas / c.n >= 0.75 ? '#dcfce7' : c.tuntas / c.n >= 0.5 ? '#fef9c3' : '#fee2e2'; }]
  ];
  blok.forEach(function (b) {
    sh.getRange(y, 1).setValue(b[0]).setFontWeight('bold').setFontColor('#1e3a8a'); y++;
    var head = ['Mapel'].concat(semuaRombel);
    sh.getRange(y, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#e0e7ff');
    if (mapelList.length) {
      var vals = mapelList.map(function (m) { return [m].concat(semuaRombel.map(function (rb) { var c = sel[m + '|' + rb]; return c ? b[1](c) : '—'; })); });
      var bg = mapelList.map(function (m) { return ['#ffffff'].concat(semuaRombel.map(function (rb) { var c = sel[m + '|' + rb]; return c ? b[2](c) : '#ffffff'; })); });
      sh.getRange(y + 1, 1, vals.length, head.length).setValues(vals).setBackgrounds(bg).setHorizontalAlignment('center');
      sh.getRange(y + 1, 1, vals.length, 1).setHorizontalAlignment('left').setFontWeight('bold');
    }
    y += mapelList.length + 3;
  });
  sh.getRange(y, 1).setValue('Kuning = kunci ujian belum diisi lengkap (guru: Edit ujian di aplikasi). Hijau tua = semua siswa rombel sudah terscan. "—" = mapel itu tidak diujikan di rombel tsb.').setFontColor('#6b7280').setFontStyle('italic');
  sh.setFrozenRows(0);
  try { sh.setColumnWidth(1, 190); } catch (e) {}
  return { ujian: ujian.length, terscan: totN, siswa: totT };
}

function skorDariJawaban_(jawaban, u) {
  var a = String(jawaban || '').replace(/^'/, ''), b = 0;
  for (var i = 0; i < u.jumlah; i++) if (a.charAt(i) === u.kunci.charAt(i)) b++;
  return { benar: b, skor: u.jumlah ? Math.round(b / u.jumlah * 1e4) / 100 : 0 };
}
/** Kunci diubah setelah lembar dipindai (mis. ujian dibuat dengan kunci "?") -> Benar/Skor di HasilScan
 *  dihitung ulang dari jawaban tersimpan. Hanya ujian yang kuncinya sudah lengkap. */
function sinkronSkor_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return 0;
  try {
    ROWS_CACHE_ = {};
    var byId = {}; rows_(SH.UJIAN).map(ujianRow_).forEach(function (u) { if (u.jumlah && !/\?/.test(u.kunci)) byId[u.id] = u; });
    var sh = sheet_(SH.HASIL), head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
    var cB = head.indexOf('Benar') + 1, cS = head.indexOf('Skor') + 1, n = 0;
    if (cB < 1 || cS < 1) return 0;
    rows_(SH.HASIL).forEach(function (h) {
      var u = byId[h['ID Ujian']]; if (!u) return;
      var x = skorDariJawaban_(h['Jawaban'], u);
      if (Number(h['Benar']) !== x.benar || Math.abs(Number(h['Skor']) - x.skor) > 0.005) {
        sh.getRange(h._row, cB, 1, 1).setValue(x.benar); sh.getRange(h._row, cS, 1, 1).setValue(x.skor); n++;
      }
    });
    ROWS_CACHE_ = {};
    if (n) Logger.log('Skor dihitung ulang: ' + n + ' baris HasilScan (kunci berubah).');
    return n;
  } finally { lock.releaseLock(); }
}
/** Jalankan manual bila guru baru saja mengisi/mengubah kunci. */
function hitungUlangSkorASAS() { var n = sinkronSkor_(); Logger.log(n + ' baris diperbarui.'); return n; }

/** Pasang pembaruan otomatis Dashboard ASAS tiap 10 menit (sekali saja). */
function pasangPemicuDashboardASAS() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'perbaruiDashboardASAS') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('perbaruiDashboardASAS').timeBased().everyMinutes(10).create();
  perbaruiDashboardASAS();
  Logger.log('Dashboard ASAS diperbarui otomatis tiap 10 menit.');
}
