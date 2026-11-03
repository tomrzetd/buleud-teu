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
