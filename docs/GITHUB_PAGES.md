# Status GitHub Pages dan kesiapan web — Buleud Teu

Audit 11 November 2026 terhadap branch main pada repo tomrzetd/buleud-teu.

## Masalah yang terkonfirmasi
- Workflow Web app (GitHub Pages), run #42184445367 (6 November 2026), gagal pada
  langkah actions/configure-pages@v5: "Get Pages site failed ... Error: Not Found".
- Ini berarti Pages site belum ditemukan/diaktifkan pada saat workflow dijalankan.
  **Bukan bukti bahwa engine LJK gagal.**
- Workflow Android APK, Desktop, dan Uji engine & Apps Script terakhir telah sukses.
  Itu bukan jaminan bahwa backend sekolah aktif atau hasil foto nyata sudah tervalidasi.

## Aktifkan Pages (dilakukan oleh pemilik repo melalui web GitHub)
1. Buka https://github.com/tomrzetd/buleud-teu/settings/pages
2. Pada Build and deployment → Source, pilih **GitHub Actions**.
3. TIDAK perlu membuat template Jekyll atau Static HTML. Repo telah mempunyai
   workflow .github/workflows/pages.yml.
4. Setelah perubahan ini di-merge ke main, buka
   https://github.com/tomrzetd/buleud-teu/actions/workflows/pages.yml
   → Run workflow → pilih main → Run workflow.
5. Tunggu hingga job **Validasi dan kemas web** dan **Terbitkan ke GitHub Pages**
   keduanya berhasil. Lihat URL yang diberikan workflow.
6. Alamat standar: https://tomrzetd.github.io/buleud-teu/ .
   Selama deployment belum sukses, URL ini tidak boleh dinyatakan aktif.

Penting: sekadar mengatur **enablement: true** pada actions/configure-pages
tidak dapat mengaktifkan Pages dengan GITHUB_TOKEN standar. Dibutuhkan
token dengan izin tambahan; cara yang paling sederhana dan aman ialah menu Settings.

## Yang diuji oleh PR
- Seluruh link HTML (JS, manifest, ikon) mengarah ke path relatif dan berkasnya ada.
- Cache offline hanya menggunakan prefix buleudteu- dan tidak menghapus cache
  Cikaracak pada origin github.io yang sama.
- Offline navigation membuka index.html, sementara file JS hilang tidak disamarkan
  menjadi halaman HTML.
- Requests ke script.google.com, path Cikaracak, atau URL luar shell tidak ditangani SW.
- Smoke test Chromium menyajikan aplikasi dari /buleud-teu/ lalu memuat ulang offline.
- Folder web saja yang dideploy; bukan database sekolah, APK, atau source Apps Script.

## Batas operasional
Aplikasi web memerlukan URL Apps Script Web App sekolah yang sah untuk melakukan
login guru dan menyimpan hasil ke Google Sheet. Laman GitHub Pages hanya
menyajikan frontend statis (HTML, JS, PWA); ia bukan backend sekolah.

Backend saat ini menggunakan PIN 4 digit di sheet Guru, token di penyimpanan
browser, dan akses Apps Script "Siapa saja". Perlu peninjauan keamanan khusus
sebelum digunakan untuk data peserta didik produksi; jangan gunakan PIN sederhana,
jangan bagikan URL/hasil sensitif, dan batasi akses spreadsheet hanya untuk petugas.
Sebaiknya uji proyek demo dengan data fiktif terlebih dahulu, termasuk akses operator,
rate-limit PIN, akhir sesi, pemulihan offline, serta kebijakan retensi data.

## Troubleshooting
- **Get Pages site failed / Not Found:** Pages belum aktif atau Source bukan GitHub Actions.
- **Halaman 404:** pastikan job deploy sukses dan domain/URL repositorinya tepat.
- **Website terbuka, tetapi layar Sambungkan:** normal; frontend butuh URL Apps Script
  sekolah. Tidak berarti GitHub Pages rusak.
- **Gagal login / Failed to fetch:** cek URL /exec, status deploy Apps Script,
  autentikasi, akses, dan respons server; jangan menempel PIN di GitHub Issues.
- **Versi lama setelah deploy:** reload biasa, lalu Ctrl+Shift+R. Jangan buru-buru
  hapus semua Site Data: localStorage mungkin menyimpan token, antrean offline,
  dan ringkasan ujian.

## Langkah mutu berikutnya
1. Sertakan CI smoke PWA pada setiap perubahan web/service worker.
2. Pindahkan token rahasia dari localStorage ke mekanisme sesi yang lebih aman,
   dengan desain ulang backend dan uji migrasi; jangan mengubah sepihak di produksi.
3. Pertimbangkan identitas pengguna yang kuat menggantikan PIN 4 digit, serta audit akses.
4. Pindahkan antrean scan offline ke IndexedDB, karena localStorage terbatas kapasitas.
5. Validasi OMR memakai foto lapangan berlabel dari kamera, kertas dan pencahayaan berbeda.
