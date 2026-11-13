# Buleud Teu Distribution Center — blueprint dan MVP
Tanggal audit: 2026-11-13. Branch: `feat/school-distribution-onboarding-20261113`.

## Tujuan operasional
Admin pusat menyiapkan banyak sekolah tanpa menyebarkan `BT_LICENSE_HMAC_KEY`
ke APK/repo/paket guru. Setiap sekolah tetap memiliki Google Spreadsheet sendiri.
Sekolah harus memberikan izin eksplisit untuk mengakses/menyalin atau
mengonfigurasi sumber daya Google miliknya.

### Status nyata saat ini
| Komponen | Status | Catatan |
| --- | --- | --- |
| Release APK bertanda tangan | ADA | .github/workflows/android.yml + GitHub Release |
| Deteksi versi baru Android | ADA | Updater.kt membandingkan tag versi dan versionCode |
| Unduh dan install APK dari dalam aplikasi | BELUM | Saat ini membuka browser ke GitHub; instalasi butuh persetujuan Android |
| Penyiapan Spreadsheet per sekolah | MANUAL | Saat ini `setup()` setelah deploy script |
| Generator lisensi HMAC BTL1 | ADA | tools/license_generate.py |
| Paket berkas aktivasi operator/guru | MVP BARU | tools/school_pack.py; seluruh output lokal |
| API penyiapan Drive+Apps Script + OAuth | BELUM | Membutuhkan consent owner Google dan akses Apps Script API |
| Portal registrasi, billing, admin sekolah | BELUM | Rancang kemudian, jangan taruh secret di Pages |
| Portal update OTA + checksum | MANIFEST BARU | tools/release_manifest.py, belum dikonsumsi Updater.kt |
| Rollout bertahap stable/beta | MANIFEST MENYIAPKAN | Belum ada pengendalian rilis per sekolah |

## Workflow yang direkomendasikan
1. Admin pusat mengisi nama sekolah, jenjang, tahun pelajaran, kontak
   operator, ID Spreadsheet dan URL `/exec` Apps Script sekolah.
2. **Paket operator** mendapat lisensi bertanda tangan yang dimasukkan ke
   `Sekolah!B10`. HMAC secret tetap di secret manager dan Script Properties.
3. **Paket guru** berisi panduan, URL APK resmi, URL PWA, dan endpoint
   Apps Script sekolah. Tidak berisi secret/token/PIN/lisensi.
4. Guru memakai satu APK universal di semua sekolah; proses setup meminta
   endpoint sekolah. Selanjutnya login dengan akun guru yang ada di Sheet Guru.
5. Saat APK versi baru stabil dirilis di GitHub Release, manifest versi/digest
   dapat dipakai oleh updater. Saat ini updater Android hanya membuka browser.
6. Hasil yang belum tersinkron ke Spreadsheet wajib tetap di SQLite; jangan
   menghapus app data/uninstall. Paket update dengan **packageName + sertifikat
   signing yang sama** tidak menghapus app data.

## MVP paket operator, dapat langsung dipakai
**Jalankan lokal di PC operator, bukan pada GitHub Actions public atau
GitHub Pages.** Secret HMAC dibaca dari env `BT_LICENSE_HMAC_KEY`. Jangan
mengetik nilainya sebagai argumen CLI atau mengirim screenshot secret.

PowerShell:
```powershell
$env:BT_LICENSE_HMAC_KEY = Read-Host "Tempel secret operator (tidak disimpan dalam perintah)"
python tools/school_pack.py `
  --school "SMP CONTOH" `
  --sheet-id "ID_SPREADSHEET_SEKOLAH" `
  --script-url "https://script.google.com/macros/s/DEPLOYMENT_ID/exec" `
  --tier school --days 365 --output dist/schools
```
Untuk masukan secret benar-benar tersembunyi pada layar, pakai password
manager atau PowerShell `Read-Host -AsSecureString` dengan konversi
lokal seperlunya; jangan simpan plaintext di terminal history.
Skrip menulis:
- `OPERATOR-RAHASIA.txt`: lisensi BTL1, Spreadsheet ID, dan petunjuk
  aktivasi; **jangan dibagikan**.
- `PAKET-GURU.zip`: `PANDUAN-GURU.txt` + `konfigurasi-guru.json`;
  **boleh dibagikan** dan tidak memiliki token/lisensi/ID Spreadsheet.
Setelah selesai, `Remove-Item Env:BT_LICENSE_HMAC_KEY` bila tidak lagi
diperlukan pada sesi terminal tersebut.

> Catatan: `Read-Host` di atas masih memunculkan input pada layar; alternatif
> yang benar-benar tertutup memerlukan input secure/prompt dari secret manager.
> Jangan masukkan secret pada command line yang bisa terlihat di history.

## Tahap 2: sekolah satu klik (butuh OAuth resmi)
Operator menghubungkan akun Google miliknya, lalu server provisioning
membuat salinan template Sheets melalui Google Drive API, membuat
bound Apps Script melalui `projects.create(parentId)`, mengunggah
source melalui `projects.updateContent`, membuat versi
`projects.versions.create`, dan deployment dengan
`projects.deployments.create` / `update` untuk versi berikutnya.
API ini memerlukan otorisasi OAuth dan Apps Script API diaktifkan.
Pengaturan **Script Properties** dan pemberian consent eksekusi harus
direncanakan sebagai langkah operator yang terautentikasi; jangan
menganggap API di atas otomatis memberi semua izin. Deployment ID stabil
harus dipertahankan saat upgrade.

Skema Dapodik: `Siswa!E = Tingkat Pendidikan`, `Siswa!F = Nama Rombel`.
Kode internal `kelas` tetap nama rombel penuh (8A), demi kompatibilitas.

## Tahap 3: licenser komersial
Saat ini HMAC secret yang dipasang di Script Properties sekolah masih
dapat dijangkau pihak yang mempunyai hak edit ke proyek script tersebut.
Ini cukup untuk prototipe sekolah tepercaya, tetapi **tidak aman sebagai
rahasia penerbit lisensi untuk banyak sekolah**.

Untuk distribusi komersial:
- Pindahkan private signing key ke **vendor-controlled backend** (mis.
  Cloud Run + Secret Manager), bukan server sekolah/Sheet/GitHub/PWA.
- Gunakan verifikasi dengan **public key** di klien sekolah jika implementasi
  kriptografinya diverifikasi/diuji, atau central license entitlement API
  yang diautentikasi.
- Admin pusat mengatur masa aktif, tier, blokir, jumlah sekolah dan audit
  tanpa memajang detail aktivasi di layar guru.
- Selalu verifikasi akses operasi server-side; UI entitlement hanya tampilan.
- Jika sekolah dapat mengubah Apps Script sendiri, tidak ada teknik kode
  lisensi di script itu yang benar-benar tak bisa dilewati. Layanan kritikal
  yang perlu enforcement penuh harus berada pada server vendor.

## Update Android resmi
Existing: `Updater.kt` membaca Latest GitHub Release, menampilkan catatan
dan tombol buka browser. **Belum ada auto-install dan auto-download**.

Blueprint updater:
1. Rilis APK **hanya dari main**, keystore rilis resmi, cek signing cert.
2. GitHub Actions melampirkan `update-manifest.json` dengan `versionCode`,
   `versionName`, `packageName`, SHA-256 APK, SHA-256 sertifikat, URL asset.
3. Android background worker cek paling sering setiap ~24 jam bila
   jaringan ada (WorkManager best-effort).
4. Tampilkan update jika `versionCode` naik; jangan interupsi scan aktif.
5. Hentikan instalasi sampai jumlah scan pending = 0, atau beri pilihan
   terus bekerja dan update nanti.
6. Unduh paket di lokasi internal, verifikasi SHA-256, certificate signer dan
   package name; ajukan instalasi via `PackageInstaller`/intent Android.
   Untuk sideload, pengguna biasanya tetap harus memberi izin/persetujuan.
7. APK signed dengan key sama akan meng-upgrade tanpa menghapus antrean
   SQLite. Jika signer tidak cocok, **tolak update**, jangan uninstall.
8. Saluran `beta` terpisah untuk uji HP, `stable` untuk sekolah, disertai
   rollback code terkontrol dan backup database saat migrasi schema.

Jika distribusi pindah ke Google Play, gunakan **Play Core In-app Updates**
sebagai jalur resmi untuk instalasi yang didistribusikan Google Play.

## Port lain
- Desktop Windows **x64** dan Linux **x64** sudah ada dalam
  `.github/workflows/desktop.yml`. Installer perlu channel versi terpisah
  dari APK. Native Windows x86 **32-bit** tidak termasuk paket sekarang.
- PWA dapat dirilis lewat GitHub Pages; bump service worker cache pada
  setiap rilis dan migrasikan data offline dengan aman. Jangan kirim
  akses lisensi privat dari GitHub Pages yang merupakan konten publik.
- Analisis soal, OpenCV/marker, OCR identitas, dan geometri form tidak
  perlu disentuh oleh pipeline distribusi.

## Acceptance criteria rilis produksi
- Google Actions: engine+statistik+Android+desktop+PWA E2E lulus.
- APK release punya signer resmi, `versionCode` monoton, manifest SHA benar.
- Tidak ada token sekolah, HMAC key, PIN, atau NISN masuk release artifacts.
- Lisensi aktivasi, perpanjang, kadaluarsa, dan pencabutan diuji server-side.
- 25 PG vs 20 soal aktif tetap benar.
- Hasil tertunda di HP tetap aman saat update dan setelah aplikasi restart.
- Seluruh sekolah tersinkron tanpa mengganti URL Apps Script lama.
