# Apps Script “Lieur Edition” — minifikasi aman untuk distribusi

Tujuan: sumber Apps Script yang diberikan kepada operator sekolah lebih
sulit dibaca secara kasual tanpa biaya server tambahan dan tanpa mengganti
algoritma LJK, Apps Script API, lisensi BTL1, statistik, atau database.

## Prinsip KISS

- Kode asli tetap rapi dalam `apps-script/Code.gs`, `Statistik.gs`,
  dan `Laporan.gs`. **Jangan pernah minify file sumber di Git.**
- Hanya file deploy `apps-script/dist/BuleudTeu_deploy_min.gs` yang
  dipadatkan. Output dibuat ketika build, bukan disimpan permanen di repo.
- Builder memakai **Terser 5.44.1** (parser JavaScript, bukan regex):
  `compress: false`, `mangle.toplevel: false`,
  `keep_fnames: true`, `mangle.properties: false`.
- Semua nama fungsi publik tetap utuh: `doGet`, `doPost`,
  `onOpen`, `setup`, handler menu/dialog, dan semua fungsi
  laporan serta analisis. String action API (`save`, `exams`,
  `login`, dll), header spreadsheet, endpoint, label tetap sama.
- **Tidak** menaruh secret HMAC ke file deploy, APK, PWA, atau repositori.
  Script Properties tetap memegang konfigurasi khusus sekolah.

## Cara membangun

Jalankan dari folder proyek (Node.js sudah terpasang):

```bash
npm install --no-save terser@5.44.1
node tools/minify_gas.js
```

File hasil: `apps-script/dist/BuleudTeu_deploy_min.gs`.

Untuk sekolah, lebih praktis lewat **GitHub Actions → Apps Script -
Paket Distribusi Minified → Run workflow** (workflow akan tersedia di menu
Actions setelah masuk branch default). Unduh artifact
`BuleudTeu-AppsScript-Siap-Tempel` pada run yang hijau.

Jalur CI reguler **Uji engine & Apps Script** juga melampirkan artifact
`buleud-teu-apps-script-minified` setelah **seluruh** regresi lulus.
Tidak ada server baru, tidak ada npm library yang perlu dipasang ke Apps
Script. Dependensi Terser hanya digunakan ketika build di PC/Actions.

## Apa yang diuji otomatis

Mode biasa dijalankan dengan tiga file source asli, kemudian pengujian
yang sama dijalankan ulang terhadap **satu file minified** melalui
`BT_GAS_BUNDLE`. Cakupannya:

- Setup database + migrasi Dapodik, pembatasan guru dan roster;
- Login dan lisensi BTL1, tampering/expiry/revocation;
- Save/replay ScanID, deduplikasi siswa, scan tertunda;
- Statistik analisis butir, bank soal, laporan;
- Penanganan input tidak sah dan uji keamanan lain.

Build dibatalkan bila salah satu nama fungsi global hilang, parser gagal,
atau regresi source minified gagal. Tidak perlu membuat server tambahan.

## Deploy tanpa memutus HP yang sudah dipakai

1. Pastikan Android **hasil scan pending = 0**.
2. Cadangkan project Apps Script; simpan source yang mudah dibaca.
3. Buka project Apps Script **yang sama**, tempel seluruh file
   `BuleudTeu_deploy_min.gs` ke file Code.gs; jangan tempel bersama
   source lama karena fungsi akan terdefinisi ganda.
4. Simpan lalu **Deploy → Manage deployments → Edit → New version → Deploy**.
   Jaga URL `/exec` yang lama agar tidak perlu setting ulang Android.
5. Uji `?action=ping` dan `?action=config`, login guru, 1 scan
   dummy, analisis serta laporan dengan data uji.
6. Bila ada kendala, deploy versi source **readable** terakhir sebagai
   versi baru pada deployment ID yang sama.

### Batasan yang perlu jujur disampaikan

Minifikasi bukan pengamanan antimanipulasi kriptografis.
Pihak yang bisa mengedit Apps Script tetap bisa mengganti source sendiri,
dan bila repositori sumber **publik**, mereka juga dapat membaca file asli
secara langsung di GitHub. Ini lapisan penghalang iseng, bukan DRM.
Untuk menjaga lisensi tetap valid, pengecekan BTL1 di server tidak
dihapus/dimodifikasi oleh minifier.

Output satu baris akan menyulitkan debugging: temukan bug di source asli
dan ulangi build/test, bukan memperbaiki satu baris hasil minify langsung.
