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
  var mode = modeKunci_(p.k);
  if (!mode) {
    return HtmlService.createHtmlOutput('<body style="background:#0b1220;color:#e5e7eb;font:28px sans-serif;display:grid;place-items:center;height:95vh">Akses ditolak — tambahkan <code>?k=…</code> pada alamat.</body>');
  }
  var t = HtmlService.createTemplateFromFile('Tampilan');
  t.kunci = String(p.k || ''); t.tingkat = String(p.tingkat || ''); t.hal = String(p.hal || ''); t.mode = mode;
  return t.evaluate().setTitle('Dashboard ' + TV_DEFAULT.namaUjian + ' — Buleud Teu')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
/** 'tv' (angka gabungan) | 'rekap' (nilai per siswa, kunci REKAP_KEY khusus rapat) | '' (ditolak) */
function modeKunci_(k) {
  var P = PropertiesService.getScriptProperties(), tv = P.getProperty('TV_KEY'), rk = P.getProperty('REKAP_KEY');
  k = String(k || '');
  if (rk && k === rk) return 'rekap';
  return !tv || k === tv ? 'tv' : '';
}

/** dipanggil halaman TV (google.script.run) tiap ±60 detik */
function tvData(k) {
  var mode = modeKunci_(k);
  if (!mode) throw new Error('Akses ditolak');
  var cache = CacheService.getScriptCache(), ck = 'tv_v2_' + mode, hit = cache.get(ck);
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
  var out = hitungTv_({ ujian: tab('Ujian'), siswa: tab('Siswa'), hasil: tab('HasilScan'), guru: tab('Guru'), sekolah: sek },
    Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'), Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss'), TV_DEFAULT, mode === 'rekap');
  try { cache.put(ck, JSON.stringify(out), TV_DEFAULT.cacheDetik); } catch (e) {}   // >100 KB tidak di-cache: dihitung ulang
  return out;
}

/** Perhitungan murni (diuji di Node): tabel -> agregat untuk layar TV. */
function hitungTv_(T, hariIni, sekarang, cfg, rekap) {
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
  // rombel diampu per guru (sheet Guru) -> progres per guru dalam ujian bersama
  var ampu = {};
  (T.guru || []).forEach(function (g) {
    var nm = up(g['Nama']); if (!nm) return;
    var ks = String(g['Tingkat/Rombel Diampu (pisah koma)'] || g['Kelas (pisah koma)'] || '').split(/[,;.]/).map(up).filter(String);
    var mp = String(g['Mapel (pisah koma)'] || '').split(/[,;]/).map(up).filter(String);
    var a = ampu[nm] = ampu[nm] || [];
    a.push({ mapel: mp, rombel: ks.reduce(function (o, x) { return o.concat(/^\d{1,2}$/.test(x) ? (rombelT[x] || []) : [x]); }, []) });
  });
  var scanRb = {};   // id|rombel -> siswa unik
  T.hasil.forEach(function (h) {
    var u = byId[h['ID Ujian']]; if (!u) return;
    var k = u.id + '|' + up(h['Nama Rombel'] || h['Kelas']);
    (scanRb[k] = scanRb[k] || {})[String(h['NISN'] || '').replace(/\D/g, '') || up(h['Nama'])] = 1;
  });
  var guru = [];
  Object.keys(byId).forEach(function (id) {
    var u = byId[id], daftar = String(u.guru || '').split(/\s*[;\n]\s*/).filter(String);
    daftar.forEach(function (g) {
      var tugas = (ampu[up(g)] || []).filter(function (a) { return !a.mapel.length || a.mapel.some(function (m) { return m === u.mapel || u.mapel.indexOf(m) >= 0 || m.indexOf(u.mapel) >= 0; }); });
      var rbs = u.rombel.filter(function (rb) { return !tugas.length || tugas.some(function (a) { return a.rombel.indexOf(rb) >= 0; }); });
      if (!rbs.length) rbs = u.rombel;
      var n = 0, target = 0;
      rbs.forEach(function (rb) { target += jml[rb] || 0; n += Math.min(jml[rb] || 0, Object.keys(scanRb[id + '|' + rb] || {}).length); });
      var status = u.kunciKosong ? 'kunci' : n ? (target && n >= target ? 'selesai' : 'jalan') : (u.tanggal && u.tanggal <= hariIni ? 'telat' : 'belum');
      guru.push({ guru: g, mapel: u.mapel, tingkat: u.tingkat, rombel: rbs.length === u.rombel.length && daftar.length === 1 ? '' : rbs.join(' '), n: n, target: target, status: status, tanggal: u.tanggal, bersama: daftar.length });
    });
  });
  guru = guru.sort(function (a, b) { var o = { telat: 0, kunci: 1, belum: 2, jalan: 3, selesai: 4 }; return (o[a.status] - o[b.status]) || a.mapel.localeCompare(b.mapel) || a.tingkat.localeCompare(b.tingkat) || a.guru.localeCompare(b.guru); });
  // --- REKAP NILAI per siswa: HANYA untuk kunci REKAP_KEY (rapat pokja), tidak pernah di mode TV
  var rekapOut = null;
  if (rekap) {
    var kktpMT = {}; Object.keys(byId).forEach(function (id) { kktpMT[byId[id].mapel + '|' + byId[id].tingkat] = byId[id].kktp; });
    var nilaiS = {};   // rombel|kunciSiswa -> {mapel: {skor, w}}
    T.hasil.forEach(function (h) {
      var u = byId[h['ID Ujian']]; if (!u) return;
      var rb = up(h['Nama Rombel'] || h['Kelas']), ks = String(h['NISN'] || '').replace(/\D/g, '') || up(h['Nama']);
      var o = nilaiS[rb + '|' + ks] = nilaiS[rb + '|' + ks] || {}, w = String(h['Waktu'] || '');
      if (!o[u.mapel] || w >= o[u.mapel].w) o[u.mapel] = { s: Number(String(h['Skor']).replace(',', '.')) || 0, w: w };
    });
    rekapOut = { kktp: kktpMT, rombel: {} };
    T.siswa.forEach(function (s) {
      var rb = up(s['Nama Rombel'] || s['Kelas']); if (!rb || !s['Nama']) return;
      var ks = String(s['NISN'] || '').replace(/\D/g, '') || up(s['Nama']), v = nilaiS[rb + '|' + ks] || nilaiS[rb + '|' + up(s['Nama'])] || {};
      var nl = {}, sum = 0, c = 0;
      mapel.forEach(function (mp) { if (v[mp]) { nl[mp] = v[mp].s; sum += v[mp].s; c++; } });
      (rekapOut.rombel[rb] = rekapOut.rombel[rb] || []).push({ nama: up(s['Nama']), no: s['Nomor Peserta'] || '', n: nl, rata: c ? Math.round(sum / c * 10) / 10 : null, c: c });
    });
    Object.keys(rekapOut.rombel).forEach(function (rb) {
      var L = rekapOut.rombel[rb].sort(function (a, b) { return String(a.no).localeCompare(String(b.no)) || a.nama.localeCompare(b.nama); });
      var ur = L.filter(function (x) { return x.rata != null; }).map(function (x) { return x.rata; }).sort(function (a, b) { return b - a; });
      L.forEach(function (x) { x.rank = x.rata == null ? null : ur.indexOf(x.rata) + 1; });
    });
  }
  return {
    v: 2, mode: rekap ? 'rekap' : 'tv', rekap: rekapOut, diperbarui: sekarang, hariIni: hariIni,
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
