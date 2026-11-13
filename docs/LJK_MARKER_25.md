# LJK F4 bermarker 25 soal (ABCD) — F4-25-ABCD-v1

## Keputusan desain
- F4 **215 × 330 mm**; cetak **skala 100%**, bukan Fit/Fit to Page.
- **25 bulatan pilihan ganda**, 5 kolom × 5 baris: 1–5, 6–10,
  11–15, 16–20, 21–25. Opsi A/B/C/D.
- Area **esai kosong tanpa garis** mulai di bawah kotak pilihan ganda.
  Kolom Nilai dan Paraf Guru **tidak ada**.
- 4 marker sudut + 2 marker tengah + 1 marker arah **TIDAK BERUBAH**
  dari `F4-50-v1`; koordinat OCR nama, nomor, dan kelas juga **tetap**.
- Nilai **bukan** jumlah bulatan kertas. Jumlah soal aktif selalu dari
  `Ujian.jumlah` / panjang kunci Google Spreadsheet. Contoh:
  **20 kunci + 25 bulatan** => hanya nomor 1–20 dinilai, 21–25 nonaktif.

## Posisi (semua dalam mm dari kiri atas)
- Marker sudut pusat: (10,10), (205,10), (205,320), (10,320), sisi 8.
- Marker tengah: (8.5,165), (206.5,165), sisi 6.
- Orientasi: (19,8), sisi 4.
- PG: 5 blok, masing-masing 5 baris. `x = 27 + floor(q/5)*36.6 + option*5.6`,
  `y = 116 + (q%5)*8`, dengan `q=0..24`, `option=0..3`, `r=2.2`.
- Frame PG: [15,104,200,155].
- OCR tetap pada `Nama (52,52,26×5.6×7)`,
  `Nomor (52,63,10×5.6×7)`, `Kelas (150,63,6×5.6×7)`.

## Kompatibilitas dan pembacaan
- Android native: `LjkEngine.processMarkerAuto` dipakai untuk ujian ABCD
  dengan `jumlah <= 25`; tetap mendukung template F4-50 lama.
- Web PWA: `processMarkerAuto` setara dengan Kotlin; cetak default
  untuk ujian ABCD hingga 25 soal adalah **F4 bermarker 25**.
- Desktop ADF: memakai auto-layout yang sama; pratinjau bulatan
  menyesuaikan 25 atau 50.
- Deteksi memilih profil 50 bila garis bulatan pada baris 6–10 terbukti.
  Jika tidak, hanya memilih 25 apabila kecocokan kisi naik lebih dari 12%.
  Jadi tidak memilih 25 semata karena jumlah kunci ujian 20.
- Template LJK 50 lama, ABCDE, dan tanpa marker 20/25 **tidak dihapus**.

## OCR identitas
- Android menggunakan crop OCR lama yang telah terkalibrasi.
- Garis kisi identitas yang menjadi abu-abu setelah fotokopi hitam-putih
  dipadamkan sesuai koordinat per sel, lalu dibaca ML Kit.
- Pembacaan diulang pada crop 2× apabila hasil awal pendek.
  Jika belum meyakinkan, OCR Google dan pencocokan daftar siswa tetap berlaku.
- OCR **hanya rekomendasi**; guru tetap harus mengonfirmasi identitas.

## Mencetak
- **Aplikasi Android:** tombol `Template F4 25 soal ABCD bermarker
  (PDF vektor)` pada beranda, atau tombol cetak pada kartu ujian ABCD
  yang panjang kuncinya tidak melebihi 25.
  PDF digambar secara vektor pada perangkat dan memakai nama/logo sekolah
  dari konfigurasi Sheet.
- **Aplikasi Web:** buka kartu ujian → Cetak → `F4 bermarker · 25 soal ABCD`.
- **Generator proyek:** `node tools/render_templates.js 200`;
  keluaran `templates/LJK_F4_MARKER_25_ABCD.pdf` dan SVG.
  Generator tidak menempel logo sekolah secara statis; web dan Android
  mengambil logo dari konfigurasi sekolah.

## Pengujian
```bash
node tools/test/test_marker25.js
node tools/render_templates.js 200
node tools/test/run_engine.js
```
Regresi sintetis menguji **25 cetak / 20 kunci**, **25 / 25**,
**50 / 20**, dan **kertas pola lama 25 pertama / 20**.
Android APK dan Desktop Windows/Linux dibangun oleh GitHub Actions.

**Belum cukup untuk produksi massal:** sebelum ujian, cetak 1 lembar di
printer sekolah pada skala 100%, lalu scan memakai HP Android asli dengan
foto miring, pencahayaan berbeda, isian pensil tipis/ganda/hapusan,
serta foto setelah area esai diisi. Verifikasi manual status per nomor,
OCR nama/nomor/kelas, dan hasil yang tersimpan ke Google Sheet.

## Catatan penandatanganan APK
Build GitHub Actions hanya memakai keystore rilis bila secrets terkait
tersedia. Tanpa secrets, `assembleRelease` menggunakan signing debug.
Untuk upgrade APK yang terpasang, signing certificate **harus sama**
dan `versionCode` baru harus lebih tinggi.
