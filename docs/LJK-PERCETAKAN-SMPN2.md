# LJK percetakan SMPN 2 Jalaksana (F4-25-SMPN2)

Lembar ASAS 2026/2027 dari percetakan: kop sekolah + QR, 25 soal ABCD (5 kolom × 5 baris), kotak isian
identitas **hitam**, dan bagian esai di bawah. Desainnya turunan F4 Buleud Teu, tetapi **semua marker
bergeser**, sehingga profil `F4-25-ABCD-v1` maupun `F4-25-ABCD-PRINTSHOP-v1` (yang memakai posisi marker
F4 resmi) tidak cocok (0/13 pada uji di bawah).

## Geometri (mm, pojok kiri atas kertas F4 215 × 330)

Diukur dari scan 200 dpi (8 px/mm) lembar kosong, 27 Nov 2026.

| Bagian | Nilai |
| --- | --- |
| Marker sudut 8,5 mm | (10, 16) · (205, 16) · (205, 314) · (10, 314) |
| Marker tengah 6,2 mm | (9,25, 168,6) · (205,75, 168,6) |
| Penanda arah 4,3 mm | (19,1, 13,9) |
| Bulatan A soal 1 | (35,44, 130,57); jarak opsi 5,25; jarak baris 6,72; jarak blok 33,47; r 2,0 |
| Kotak nama / nomor / kelas | x 53 y 70,4 (26 × 5,33) · x 53 y 82 (10 × 5,34) · x 149 y 82,1 (6 × 5,32) |

Sumber tunggal: `SPEC_SMPN2_25` di `web/js/ljk-spec.js` dan `MarkerLayouts.SMPN2_25` di
`android/.../engine/LjkMarkerLayout.kt` (posisi bulatan diekspor ke `spec/ljk-f4-25-smpn2.json`).

## Cara kerja

- `processMarkerAuto` (web, Android, desktop) mencoba formulir resmi dulu. Bila tidak cocok kuat (< 80%),
  profil SMPN 2 dicoba dan dipakai bila ≥ 60% bulatan cocok dan unggul ≥ 12 poin. Jenis terakhir yang
  berhasil dicoba lebih dulu (1 tumpuk ADF = 1 jenis), jadi scan berikutnya tidak melambat.
- **Kotak bawah terpotong:** patokan cadangan = 2 sudut atas + 2 marker tengah. Ukuran tiap kotak harus
  cocok dengan posisinya (8,5 mm atas, 6,2 mm tengah), dan tiap hipotesis dinilai dengan lingkaran pada
  skalanya sendiri. Di Android/desktop hasil dari patokan cadangan wajib ≥ 82% bulatan cocok, dan aplikasi
  meminta guru memeriksa jawaban sebelum menyimpan.
- OCR identitas: garis kotak isian hitam dihapus memakai posisi kotak profil ini.

## Uji

```
python3 tools/test/gen_percetakan.py sintetis /tmp/percetakan     # lembar tiruan dari spec (CI)
python3 tools/test/gen_percetakan.py <scan_kosong.png> /tmp/p     # dari scan asli (tidak disimpan di repo)
node tools/test/test_percetakan.js /tmp/percetakan
```

13 kondisi: scan pensil/pulpen, kosong & ganda, arsiran tipis, terbalik, miring 4°, foto perspektif,
resolusi rendah, buram, bayangan, landscape, kotak bawah terpotong (scan & foto). Hasil pada scan asli:
web 13/13, Kotlin 13/13 (arsiran tipis ditandai "ragu" dengan saran benar).
