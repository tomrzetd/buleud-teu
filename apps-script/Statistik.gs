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
