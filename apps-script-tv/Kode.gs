/*
 * BULEUD TEU — Dashboard TV Pokja ASAS/PSAS (proyek Apps Script TERPISAH, hanya membaca)
 *
 * Layar TV membuka URL web app ini. Tidak ada akses edit ke spreadsheet, tidak ada rumus yang bisa
 * terhapus, dan TIDAK ADA nama siswa / nilai perorangan yang ditampilkan: hanya angka agregat.
 *
 * Pasang: script.google.com → Proyek baru → file Kode.gs (ini) + file HTML "Tampilan" →
 *   Properti skrip: SHEET_ID = ID spreadsheet database, TV_KEY = kata sandi pendek (opsional) →
 *   Terapkan → Deployment baru → Aplikasi web → Jalankan sebagai: Saya → Akses: Siapa saja.
 *   Buka di TV: <URL /exec>?k=<TV_KEY>   (opsional: &tingkat=8, &hal=1 untuk mengunci halaman)
 */
var TV_DEFAULT = {
  namaUjian: 'ASAS',
  judul: 'ASESMEN SUMATIF AKHIR SEMESTER GANJIL',
  kunciContoh: ['AAAABCDABCDAAAABCDAADDACD'],   // kunci contoh/placeholder: tandai "kunci belum diisi"
  cacheDetik: 45
};

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!kunciOk_(p.k)) {
    return HtmlService.createHtmlOutput('<body style="background:#0b1220;color:#e5e7eb;font:28px sans-serif;display:grid;place-items:center;height:95vh">Akses ditolak — tambahkan <code>?k=…</code> pada alamat.</body>');
  }
  var t = HtmlService.createTemplateFromFile('Tampilan');
  t.kunci = String(p.k || ''); t.tingkat = String(p.tingkat || ''); t.hal = String(p.hal || '');
  return t.evaluate().setTitle('Dashboard ' + TV_DEFAULT.namaUjian + ' — Buleud Teu')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function kunciOk_(k) {
  var want = PropertiesService.getScriptProperties().getProperty('TV_KEY');
  return !want || String(k || '') === want;
}

/** dipanggil halaman TV (google.script.run) tiap ±60 detik */
function tvData(k) {
  if (!kunciOk_(k)) throw new Error('Akses ditolak');
  var cache = CacheService.getScriptCache(), hit = cache.get('tv_v1');
  if (hit) return JSON.parse(hit);
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Properti skrip SHEET_ID belum diisi.');
  var ss = SpreadsheetApp.openById(id);
  var tab = function (n) {
    var sh = ss.getSheetByName(n); if (!sh || sh.getLastRow() < 2) return [];
    var v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getDisplayValues(), h = v[0];
    return v.slice(1).map(function (r) { var o = {}; h.forEach(function (x, i) { o[String(x).trim()] = String(r[i] == null ? '' : r[i]).trim(); }); return o; });
  };
  var sek = {};
  var shS = ss.getSheetByName('Sekolah');
  if (shS && shS.getLastRow()) shS.getRange(1, 1, shS.getLastRow(), 2).getDisplayValues().forEach(function (r) { sek[r[0]] = r[1]; });
  var tz = Session.getScriptTimeZone();
  var out = hitungTv_({ ujian: tab('Ujian'), siswa: tab('Siswa'), hasil: tab('HasilScan'), sekolah: sek },
    Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'), Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss'), TV_DEFAULT);
  try { cache.put('tv_v1', JSON.stringify(out), TV_DEFAULT.cacheDetik); } catch (e) {}
  return out;
}

/** Perhitungan murni (diuji di Node): tabel -> agregat untuk layar TV. */
function hitungTv_(T, hariIni, sekarang, cfg) {
  var up = function (s) { return String(s || '').trim().toUpperCase(); };
  var tingkatDari = function (r) { var m = /^(\d{1,2})/.exec(r); return m ? m[1] : ''; };
  // --- rombel & jumlah siswa
  var jml = {}, tOf = {};
  T.siswa.forEach(function (s) {
    var rb = up(s['Nama Rombel'] || s['Kelas']), t = up(s['Tingkat Pendidikan'] || s['Tingkat']) || tingkatDari(rb);
    if (!rb || !s['Nama']) return;
    jml[rb] = (jml[rb] || 0) + 1; tOf[rb] = t || tingkatDari(rb);
  });
  var rombel = Object.keys(jml).sort(function (a, b) { return (Number(tOf[a]) - Number(tOf[b])) || a.localeCompare(b); });
  var rombelT = {}; rombel.forEach(function (r) { (rombelT[tOf[r]] = rombelT[tOf[r]] || []).push(r); });
  // --- ujian
  var nama = up(cfg.namaUjian);
  var ujian = T.ujian.filter(function (u) { return up(u['Nama Ujian']) === nama && up(u['Status']) !== 'ARSIP' && u['ID']; });
  var byId = {}, mapelInfo = {}, cover = {};
  ujian.forEach(function (u) {
    var mp = up(u['Mapel']), t = up(u['Tingkat Pendidikan'] || u['Tingkat']);
    var rbList = String(u['Nama Rombel'] || u['Kelas'] || '').split(/[,;]/).map(up).filter(String);
    var rbs = [];
    if (!rbList.length || rbList.indexOf('SEMUA') >= 0) rbs = rombelT[t] || [];
    else rbList.forEach(function (x) { rbs = rbs.concat(/^\d{1,2}$/.test(x) ? (rombelT[x] || []) : (jml[x] ? [x] : [])); });
    var kunci = up(u['Kunci']).replace(/\s+/g, '');
    var kunciKosong = !kunci || /[^A-E]/.test(kunci) || cfg.kunciContoh.indexOf(kunci) >= 0;
    var tgl = /^\d{4}-\d{2}-\d{2}/.test(u['Tanggal']) ? u['Tanggal'].slice(0, 10) : '';
    byId[u['ID']] = { id: u['ID'], mapel: mp, tingkat: t, guru: u['Guru'], kktp: Number(u['KKTP']) || 75, rombel: rbs, kunciKosong: kunciKosong, tanggal: tgl, n: 0 };
    var mi = mapelInfo[mp] = mapelInfo[mp] || { mapel: mp, tanggal: {}, kunciKosong: 0, ujian: 0 };
    if (tgl) mi.tanggal[tgl] = 1; mi.ujian++; if (kunciKosong) mi.kunciKosong++;
    rbs.forEach(function (rb) {
      var c = cover[mp + '|' + rb] = cover[mp + '|' + rb] || { target: jml[rb] || 0, kktp: byId[u['ID']].kktp, ids: {}, kunciKosong: false, siswa: {} };
      c.ids[u['ID']] = 1; if (kunciKosong) c.kunciKosong = true;
    });
  });
  // --- hasil scan (scan terakhir per siswa menang)
  var recent = [];
  T.hasil.forEach(function (h) {
    var u = byId[h['ID Ujian']]; if (!u) return;
    var rb = up(h['Nama Rombel'] || h['Kelas']), c = cover[u.mapel + '|' + rb];
    var key = String(h['NISN'] || '').replace(/\D/g, '') || up(h['Nama']);
    var w = String(h['Waktu'] || '');
    if (c) {
      var prev = c.siswa[key];
      if (!prev || w >= prev.w) c.siswa[key] = { w: w, skor: Number(String(h['Skor']).replace(',', '.')) || 0, kktp: u.kktp };
    }
    u.n++;
    recent.push({ w: w, mapel: u.mapel, rombel: rb });
  });
  recent.sort(function (a, b) { return a.w < b.w ? 1 : a.w > b.w ? -1 : 0; });
  // --- urutan mapel: tanggal ujian lalu nama
  var mapel = Object.keys(mapelInfo).sort(function (a, b) {
    var ta = Object.keys(mapelInfo[a].tanggal).sort()[0] || '9999', tb = Object.keys(mapelInfo[b].tanggal).sort()[0] || '9999';
    return ta < tb ? -1 : ta > tb ? 1 : a.localeCompare(b);
  });
  // --- sel matriks
  var sel = {}, tot = { target: 0, masuk: 0, sum: 0, tuntas: 0, selesai: 0, sel: 0 };
  var perMapel = {}, perTingkat = {};
  mapel.forEach(function (mp) { perMapel[mp] = { target: 0, masuk: 0, sum: 0, tuntas: 0, perT: {} }; });
  Object.keys(cover).forEach(function (k) {
    var c = cover[k], mp = k.split('|')[0], rb = k.split('|')[1], t = tOf[rb];
    var vals = Object.keys(c.siswa).map(function (s) { return c.siswa[s]; });
    var n = Math.min(vals.length, c.target || vals.length), sum = 0, tun = 0;
    vals.forEach(function (v) { sum += v.skor; if (v.skor >= v.kktp) tun++; });
    sel[k] = { t: c.target, n: n, rata: vals.length ? Math.round(sum / vals.length * 10) / 10 : null, tuntas: vals.length ? Math.round(tun / vals.length * 100) : null, kk: c.kunciKosong };
    tot.target += c.target; tot.masuk += n; tot.sum += sum; tot.tuntas += tun; tot.sel++; if (c.target && n >= c.target) tot.selesai++;
    var pm = perMapel[mp]; pm.target += c.target; pm.masuk += n; pm.sum += sum; pm.tuntas += tun;
    var pt = pm.perT[t] = pm.perT[t] || { masuk: 0, sum: 0, tuntas: 0, target: 0 }; pt.masuk += vals.length; pt.sum += sum; pt.tuntas += tun; pt.target += c.target;
    var tt = perTingkat[t] = perTingkat[t] || { target: 0, masuk: 0 }; tt.target += c.target; tt.masuk += n;
  });
  var nilai = mapel.map(function (mp) {
    var pm = perMapel[mp];
    return { mapel: mp, masuk: pm.masuk, target: pm.target,
      rata: pm.masuk ? Math.round(pm.sum / pm.masuk * 10) / 10 : null, tuntas: pm.masuk ? Math.round(pm.tuntas / pm.masuk * 100) : null,
      perT: Object.keys(pm.perT).sort().map(function (t) { var x = pm.perT[t]; return { t: t, n: x.masuk, rata: x.masuk ? Math.round(x.sum / x.masuk * 10) / 10 : null, tuntas: x.masuk ? Math.round(x.tuntas / x.masuk * 100) : null }; }) };
  });
  // --- jadwal (tanggal -> mapel)
  var jadwal = {};
  mapel.forEach(function (mp) { Object.keys(mapelInfo[mp].tanggal).forEach(function (d) { (jadwal[d] = jadwal[d] || []).push(mp); }); });
  var jadwalList = Object.keys(jadwal).sort().map(function (d) {
    return { tanggal: d, mapel: jadwal[d].map(function (mp) { return { mapel: mp, masuk: perMapel[mp].masuk, target: perMapel[mp].target }; }) };
  });
  // --- status per ujian (guru) — tanpa data siswa
  var guru = Object.keys(byId).map(function (id) {
    var u = byId[id], target = u.rombel.reduce(function (s, rb) { return s + (jml[rb] || 0); }, 0);
    var status = u.kunciKosong ? 'kunci' : u.n ? 'jalan' : (u.tanggal && u.tanggal <= hariIni ? 'telat' : 'belum');
    return { guru: u.guru, mapel: u.mapel, tingkat: u.tingkat, n: u.n, target: target, status: status, tanggal: u.tanggal };
  }).sort(function (a, b) { var o = { telat: 0, kunci: 1, belum: 2, jalan: 3 }; return (o[a.status] - o[b.status]) || a.mapel.localeCompare(b.mapel) || a.tingkat.localeCompare(b.tingkat); });
  return {
    v: 1, diperbarui: sekarang, hariIni: hariIni,
    sekolah: { nama: T.sekolah['Nama Sekolah'] || '', tahun: T.sekolah['Tahun Pelajaran'] || '' },
    judul: cfg.judul, namaUjian: cfg.namaUjian,
    rombel: rombel.map(function (r) { return { r: r, t: tOf[r], n: jml[r] }; }),
    mapel: mapel.map(function (mp) { return { mapel: mp, kunciKosong: mapelInfo[mp].kunciKosong, ujian: mapelInfo[mp].ujian, tanggal: Object.keys(mapelInfo[mp].tanggal).sort() }; }),
    sel: sel,
    kpi: { target: tot.target, masuk: tot.masuk, persen: tot.target ? Math.round(tot.masuk / tot.target * 1000) / 10 : 0,
      rata: tot.masuk ? Math.round(tot.sum / tot.masuk * 10) / 10 : null, tuntas: tot.masuk ? Math.round(tot.tuntas / tot.masuk * 100) : null,
      selSelesai: tot.selesai, sel: tot.sel, siswa: rombel.reduce(function (s, r) { return s + jml[r]; }, 0),
      ujian: Object.keys(byId).length, kunciKosong: Object.keys(byId).filter(function (id) { return byId[id].kunciKosong; }).length },
    perTingkat: Object.keys(perTingkat).sort().map(function (t) { return { t: t, masuk: perTingkat[t].masuk, target: perTingkat[t].target }; }),
    nilai: nilai, jadwal: jadwalList, guru: guru,
    terbaru: recent.slice(0, 12).map(function (r) { return { w: r.w, mapel: r.mapel, rombel: r.rombel }; })
  };
}
if (typeof module !== 'undefined') module.exports = { hitungTv_: hitungTv_, TV_DEFAULT: TV_DEFAULT };
