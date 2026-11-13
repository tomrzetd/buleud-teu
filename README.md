# Buleud Teu 🟢

> **"Buleud teu? Mun buleud, ku urang dipariksa!"**

Buleud Teu memindai dan mengoreksi LJK pilihan ganda dengan kamera HP. Aplikasi ini juga menganalisis butir soal dan menyusun bank soal. Datanya tersimpan di Google Sheet milik sekolah sendiri. Dirancang untuk guru SD, SMP, dan SMA.

| Komponen | Isi |
|---|---|
| `web/` | Aplikasi web (PWA) yang bisa dipasang di HP, berjalan offline, tanpa CDN maupun OpenCV |
| `android/` | Aplikasi Android native (Kotlin, Jetpack Compose, CameraX, OpenCV, ML Kit) |
| `desktop/` | Aplikasi PC **Windows 10/11 x64 & Linux x64** untuk scanner **ADF** (pindai massal satu tumpukan LJK) |
| `apps-script/` | Backend Google Sheet: data sekolah, guru, siswa, ujian, hasil, analisis butir, dan bank soal |
| `templates/` | Template F4 bermarker **25 soal ABCD (5×5, esai polos)** dan 50 soal ABCD/ABCDE; juga template lama tanpa marker 20/25. Generator `node tools/render_templates.js 200`. |
| (unduh) | **APK Android untuk guru:** https://github.com/tomrzetd/buleud-teu/releases/latest/download/BuleudTeu.apk |
| `docs/` | **[Panduan lengkap](docs/PANDUAN.md)**: persiapan database, penamaan kelas & mapel SMP, template LJK, scan, laporan, pemecahan masalah |
| `spec/` | Geometri LJK F4 (sumber tunggal untuk web, Android, dan template) |
| `tools/` | Generator template, generator foto uji, dan semua pengujian |

## Dua mode pemindaian

1. **LJK F4 dengan marker sudut (mode utama).** Empat kotak hitam di sudut ditambah dua marker tengah membuat geometri halaman pasti. Penanda arah membuat LJK yang terbalik atau menyamping tetap terbaca. Setiap blok soal lalu disetel ulang dari bulatan yang terdeteksi, sehingga kertas yang melengkung tetap presisi.
2. **LJK lama tanpa marker (20 soal 4 kolom × 5 baris, atau 25 soal 5 kolom × 5 baris; dikenali otomatis).** Posisi jawaban disimpulkan dari pola bulatan itu sendiri (inferensi kisi + homografi).

Keputusan jawaban di kedua mode bersifat **relatif per lembar**: tingkat "kosong" dan "terisi" diukur dari lembar itu sendiri. Hasilnya tahan terhadap bayangan dan pensil tipis. Isian ganda, isian tipis, dan bekas hapusan ditandai **kuning** untuk dicek guru, bukan dipilih diam-diam.

## Baru: LJK bermarker 25 soal ABCD (5 kolom × 5 baris)

Formulir baru `F4-25-ABCD-v1` menampilkan **1–5, 6–10, 11–15,
16–20, 21–25** dan seluruh area di bawahnya tersedia untuk esai **tanpa
garis/kolom nilai/paraf**. Semua marker dan tiga area OCR tetap pada posisi
`F4-50-v1`. Web, Android, dan desktop melakukan pemilihan kisi 25/50
secara otomatis saat memindai lembar bermarker.

**Panjang kunci di Google Spreadsheet tetap sumber jumlah soal aktif.**
Misalnya ujian Informatika memiliki 20 kunci, sementara formulir mencetak
25 bulatan: hanya nomor **1–20** dinilai; 21–25 ditampilkan nonaktif
pada hasil digital. Template 50 ABCD/ABCDE lama tetap bisa dibaca.

- **Android:** tombol cetak PDF vektor 25 soal tersedia di beranda dan
  kartu ujian ABCD ≤25 soal; memakai logo/nama/tahun dari konfigurasi.
- **Web:** Cetak LJK otomatis memilih formulir 25 bermarker bila jumlah
  soal ABCD ≤25, tetapi opsi 50 dan tanpa marker tetap tersedia.
- **Pengujian:** `node tools/test/test_marker25.js`, serta suite lama.
- **Detail geometri dan panduan cetak:** [docs/LJK_MARKER_25.md](docs/LJK_MARKER_25.md).

## Hasil pengujian

Semua pengujian ada di `tools/test/` dan bisa dijalankan ulang.

| Uji | Hasil |
|---|---|
| Mode marker, 16 kondisi foto (ideal, miring 12°, perspektif kuat, terbalik 180°, landscape 90°, kertas melengkung 4 mm, bayangan, latar gelap berisi kotak pengecoh, jauh/kecil, buram + JPEG 45, HP 4K, kombinasi berat, 30 soal aktif, tanda silang/ganda/hapusan, varian salah) | **16/16 lolos, 50/50 soal**; residu geometri 0,04–0,13 mm; 100–500 ms |
| Mode tanpa marker (foto LJK asli + 20 variasi) | **21/21** |
| Engine Kotlin vs JS (jawaban & status per soal) | **identik 16/16** (marker) dan **21/21** (tanpa marker) |
| Statistik butir vs numpy/scipy (KR-20, KR-21, r tabel, P, D, r pbis) | cocok (galat < 0,001) |
| Apps Script dengan tiruan layanan Google (login PIN, kunci PIN, izin guru, simpan, scan ulang, analisis 40 soal, bank soal upsert) | lolos |
| End-to-end web di Chromium + Apps Script asli + OCR | setup → login → buat ujian → scan → OCR → koreksi → simpan → analisis → bank soal → cetak: lolos |

## Mulai cepat (untuk operator sekolah)

### 1. Spreadsheet sekolah + Apps Script
1. Buat Google Sheet baru, misalnya "Buleud Teu — SMPN 2 …".
2. Buka **Ekstensi → Apps Script**. Hapus isi `Code.gs`, lalu tempel **seluruh** isi `apps-script/dist/BuleudTeu_lengkap.gs`.
3. Klik **Layanan (+) → Drive API → Tambahkan**. Ini dibutuhkan untuk OCR identitas.
4. Simpan. Pilih fungsi **`setup`**, lalu **Jalankan** dan setujui izinnya. Sheet `Sekolah`, `Guru`, `Siswa`, `Ujian`, `HasilScan`, dan `BankSoal` akan dibuat.
5. Isi datanya:
   - **Sekolah:** nama, NPSN, jenjang (SD/SMP/SMA), tahun pelajaran, dan ID file logo di Google Drive.
   - **Guru:** nama, PIN 4 digit, mapel yang diampu, kelas yang diampu, dan Aktif = Ya.
   - **Siswa:** NISN, NIS, Nomor Peserta, Nama, Kelas (bisa ditempel dari ekspor Dapodik).
6. Klik **Terapkan → Deployment baru → Aplikasi web**, dengan *Jalankan sebagai: **Saya*** dan *Akses: **Siapa saja***. Salin URL yang berakhiran `/exec`.
   - Akun `belajar.id` kadang tidak menyediakan pilihan "Siapa saja" karena dibatasi admin domain. Kalau begitu, pasang di akun Gmail biasa.
7. Setiap kali kode diubah, buka **Kelola deployment → Edit → Versi baru**.

### 2. Aplikasi web
- Aktifkan **Settings → Pages → Source: GitHub Actions** sebelum menjalankan workflow. Jika belum aktif, `configure-pages` gagal dengan `Get Pages site failed / Not Found`. Panduan rinci: **[Aktivasi GitHub Pages & audit PWA](docs/GITHUB_PAGES.md)**. Workflow `pages.yml` menerbitkan folder `web/` ke `https://<username>.github.io/buleud-teu/` setelah deployment sukses.
- Buka alamat itu di HP, lalu pilih **Tambahkan ke layar utama**. Tempel URL `/exec`, pilih nama guru, dan masukkan PIN.
- Kalau perlu satu file saja (misalnya untuk hosting sederhana), pakai `web/dist/buleud-teu.html`.

### 3. Cetak LJK
- Dari aplikasi: **Cetak LJK** pada kartu ujian. Kop sekolah, logo, nama ujian, dan mapel terisi otomatis.
- Atau cetak `templates/LJK_F4_ABCD.pdf` / `templates/LJK_F4_ABCDE.pdf`, atau `templates/LJK_F4_TANPA_MARKER_20_ABCD.pdf` / `templates/LJK_F4_TANPA_MARKER_25_ABCD.pdf` untuk ujian 20 / 25 soal (dibaca mode tanpa marker; buat ujian 20 atau 25 soal ABCD lalu Scan dari kartu ujian).
- **Kertas F4/Folio 215 × 330 mm, skala 100%** (jangan "fit to page"). Keempat kotak hitam harus tercetak utuh.
- Kotak isian identitas dicetak **merah muda**, yaitu warna "dropout" yang dihapus engine sebelum OCR. Siswa boleh memakai pulpen biru/hitam atau pensil.

### 4. Scan → simpan → analisis
1. Pilih ujian lalu ketuk **Scan**. Arahkan kamera ke seluruh LJK. Bingkai berubah hijau dan foto diambil otomatis (auto-capture).
2. Periksa **LJK digital** (tersusun seperti kertasnya) dan ketuk bulatan untuk mengoreksi.
3. Identitas dibaca OCR dan dicocokkan ke daftar siswa. Periksa hasilnya, lalu **Simpan**.
4. **Analisis**, per kelas atau per tingkat, menghitung tingkat kesukaran, daya pembeda 27%, validitas r point-biserial terkoreksi vs r tabel, KR-20/KR-21/SEM, KR-20 jika butir dihapus, efektivitas pengecoh, dan rekomendasi *Diterima/Direvisi/Dibuang*. Hasilnya ditulis ke sheet `AN_<ujian>_<lingkup>`.
5. **Simpan ke Bank Soal** untuk memilah soal. Kolom *Status Guru* (Pakai/Revisi/Arsip) bisa diubah.
6. **Laporan** (kartu Laporan di layar analisis, atau menu spreadsheet **Buleud Teu → 4. Buat laporan…**): mode **Simpel** (pilihan jawaban, jumlah benar, skor) atau **Lengkap** (+ statistik tes, analisis butir, pengecoh, matriks); setiap bagian bisa dipilih; format **PDF F4**, **Excel**, atau **Google Sheet**. Setelah memperbarui kode, jalankan **Tes koneksi & izin** sekali untuk menyetujui izin ekspor. Contoh: [simpel](docs/contoh/contoh_laporan_simpel.pdf), [lengkap](docs/contoh/contoh_laporan_lengkap.pdf).

## Android
- APK debug dibuat otomatis oleh GitHub Actions (`android.yml`) setiap kali ada push. Unduh dari tab **Actions → artifact `buleud-teu-apk`**.
- Untuk membangun lokal, buka folder `android/` di Android Studio (Ladybug atau lebih baru, JDK 17).
- Engine (`engine/LjkEngine.kt`) adalah port 1:1 dari engine web dan sudah diuji identik.
- OpenCV menangani deteksi marker real-time di preview kamera.
- ML Kit menangani OCR identitas di perangkat. Kalau hasilnya belum yakin, aplikasi beralih ke OCR Google Drive.
- Target: HP kelas menengah ke atas (Android 7+, kamera ≥ 8 MP).

## Desktop (PC + scanner ADF)
Untuk menilai satu tumpukan LJK sekaligus dengan scanner ber-ADF (Automatic Document Feeder).
- **Unduh:** tab **Actions → Desktop (Windows & Linux)** → artifact `buleud-teu-desktop-windows` (installer `.exe` + versi portabel `.zip`) atau `buleud-teu-desktop-linux` (`.deb` + `.tar.gz`). Java sudah termasuk; tidak perlu memasang apa pun lagi.
- **Jalur scanner:**
  - **WIA** (Windows): driver resmi Canon / Epson / Brother. Feeder dipakai otomatis sampai kertas habis; panjang pindai diatur F4 (330 mm); duplex bila didukung.
  - **TWAIN lewat NAPS2** (Windows, opsional): untuk driver yang ADF-nya hanya lewat TWAIN. Pasang NAPS2 gratis.
  - **SANE** (Linux): `sudo apt install sane-utils` + backend scanner (Brother brscan4/5, Epson epsonscan2/epson2, Canon pixma, jaringan sane-airscan).
  - **Folder pantau** (semua OS): software bawaan scanner (Epson Scan 2, Canon IJ Scan Utility, Brother ControlCenter, scan-to-folder) menyimpan ke satu folder; tiap berkas baru (JPG/PNG/TIFF/PDF multi-halaman) langsung diproses.
- **Alur:** masuk (nama guru + PIN) → pilih ujian → **Mulai scan ADF** → tiap lembar dibaca (LJK bermarker F4, atau LJK lama 20/25 soal untuk ujian ≤ 25 soal ABCD) → OCR identitas menjadi **rekomendasi** → guru memilih/mencari siswa (Enter = pilih, lanjut ke lembar berikutnya) atau **Terima rekomendasi ≥ 90%** → **Simpan semua**. Lembar ganda, nomor kuning, dan siswa yang sudah pernah discan diberi peringatan sebelum disimpan. Offline → antrean, dikirim otomatis.
- **Saran pindai:** kertas F4, 200 dpi, berwarna (kotak identitas merah muda dihapus otomatis untuk OCR). Lembar boleh terbalik.
- Engine yang dipakai adalah kode Kotlin yang sama dengan Android (sudah diuji identik dengan web).

## Pengujian
```bash
node tools/render_templates.js 200        # template PDF + PNG uji (butuh Playwright/Chromium)
python3 tools/test/gen_cases.py           # 16 foto uji sintetis
node tools/test/run_engine.js             # engine mode marker
python3 tools/test/test_stats.py          # statistik vs numpy/scipy
node tools/test/test_appscript.js         # Apps Script (tiruan layanan Google)
node tools/test/e2e_web.js                # end-to-end web + Apps Script + OCR (butuh tesseract)
bash tools/test/run_kotlin.sh             # engine Kotlin vs JS (compiler Kotlin dari Gradle)
python3 tools/test/gen_scans.py           # hasil scan ADF sintetis (PDF/TIFF multi-halaman, terbalik, abu-abu)
python3 tools/test/test_desktop_batch.py  # desktop: baca batch (BT_DESKTOP=perintah aplikasi)
node tools/test/e2e_desktop.js            # desktop: UI di Xvfb + server tiruan Apps Script
node tools/build.js                       # build web/dist + apps-script/dist + spec JSON
```

## Acuan statistik
- Tingkat kesukaran P: 0,00–0,30 Sukar · 0,31–0,70 Sedang · 0,71–1,00 Mudah.
- Daya pembeda D (kelompok atas/bawah 27%; n < 20 memakai 50%): <0 Negatif · ≤0,20 Jelek · ≤0,40 Cukup · ≤0,70 Baik · >0,70 Baik Sekali.
- Validitas: r point-biserial terkoreksi ≥ r tabel product-moment (α = 0,05, dua sisi).
- Reliabilitas KR-20 (varians populasi /N): ≥0,80 Sangat Tinggi · ≥0,60 Tinggi · ≥0,40 Sedang · ≥0,20 Rendah.
- Pengecoh berfungsi bila dipilih ≥ 5% peserta **dan** lebih banyak dipilih kelompok bawah.

## Privasi
Data siswa (anak di bawah umur) disimpan di Google Sheet milik sekolah masing-masing. PIN guru disimpan di sheet `Guru`; batasi akses spreadsheet hanya untuk operator. Untuk distribusi di Play Store, siapkan kebijakan privasi dan formulir *Data safety*.
