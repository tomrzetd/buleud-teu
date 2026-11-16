# Uji OTA server sekolah via Quick Tunnel — Buleud Teu Android

Status: **pengujian terkontrol**, bukan GitHub Release publik dan bukan distribusi massal.
Tidak mengubah scanner, hasil siswa, database, atau source Apps Script.

## Dua APK resmi yang diperlukan

GitHub Actions `Android APK` menyediakan artifact bernama `buleud-teu-apk`.
Pastikan status workflow **SUCCESS**, log menunjukkan sertifikat release resmi,
dan ZIP mengandung ketiganya:

- `BuleudTeu.apk`
- `BuleudTeu-4.1.N.apk`
- `update-manifest.json`

Jangan campur APK dan manifest dari versi berbeda. Android akan menolak
jika hash, ukuran, versionCode, package, atau sertifikat berbeda.

### Uji bertahap (run #61 → #62)

1. **Cadangkan data penting dan sinkronkan outbox (pending 0)**.
2. Dari Actions run build **4.1.61**, unduh APK bertanda tangan resmi.
   Instal **menimpa** versi lama (4.1.57) melalui Android Package Installer.
   **Jangan uninstall!** Versi kode harus naik, sertifikat sama.
3. Dari Actions run build **4.1.62**, ambil `BuleudTeu.apk` dan
   `update-manifest.json`. Taruh **keduanya** ke folder publik
   `C:\BuleudTeu\` pada server Windows. Jangan taruh dokumen siswa di sini.
4. Jalankan web server di `127.0.0.1:8080` dan Quick Tunnel yang sudah
   diujikan dari jaringan seluler. Buka
   `https://<hostname>.trycloudflare.com/update-manifest.json`
   dan `https://<hostname>.trycloudflare.com/BuleudTeu.apk`.
5. Pada Android 4.1.61 buka **Ujian saya → Pembaruan aplikasi →
   ⚙ Atur server pembaruan**, pastikan URL origin tunnel tepat
   (hanya `https://host.trycloudflare.com`, tanpa garis miring tambahan,
   nama APK atau parameter). Klik **Simpan sumber update**.
6. Tekan **↻ Cek versi terbaru**. Harus muncul
   **🔔 Pembaruan Buleud Teu — versi 4.1.62 tersedia**.
7. Pastikan tidak ada antrean scan lokal, tekan **Unduh, verifikasi & perbarui**,
   izinkan instalasi dari aplikasi bila diminta, lalu setujui layar installer
   Android. Buka kembali dan pastikan terpasang **4.1.62** serta data lama
   dan server sekolah masih ada.
8. Uji penolakan: sengaja pasang manifest lama atau APK berbeda pada server
   TEST (bukan produksi); aplikasi tidak boleh menawarkan instalasi file
   yang gagal checksum/cert. Kembalikan file yang benar setelahnya.

## Cara kerja dan batasan

- Konfigurasi awal **Quick Tunnel hanya untuk test**, bisa diubah dari HP
  jika host acak berubah. Jika kosong, APK menggunakan GitHub Releases saja.
- Manifest dihasilkan CI dengan URL rilis GitHub, tetapi mirror sekolah
  membaca `BuleudTeu.apk` dari origin lokal dan memeriksa ulang SHA-256,
  ukuran, packageName, versionCode, serta sertifikat penandatangan yang sama.
- Jika server sekolah mati / Quick Tunnel hilang, updater mencoba kanal
  GitHub resmi. Ia tidak otomatis menganggap bahwa semua rilis di GitHub
  lebih baru dari APK yang terpasang.
- Tombol cek memerlukan internet; popup in-app hanya muncul saat aplikasi
  dibuka/dicek, **bukan notifikasi push Android 24 jam**.
- GitHub Actions pada branch pengembangan **tidak menerbitkan GitHub Release**:
  APK bertanda tangan release dapat diunduh dari artifact workflow.
  Rilis publik hanya diizinkan dari branch `main` dengan workflow manual.
- Quick Tunnel tidak memiliki jaminan uptime dan URL berubah setiap kali
  proses tunnel baru berjalan. Belum cocok untuk distribusi produksi 24 jam.
- Keamanan: **jangan membagikan signing keystore, token cloudflared,
  lisensi BTL1, PIN guru, atau database siswa**.

## Warna skin

Tema **Cerah Tenang** adalah default: navy header, putih bersih untuk kartu,
teal untuk aksi utama, abu-biru lembut untuk background.
Tema **Gelap Klasik** dapat dipilih dari ikon bulan/matahari di beranda.
Tema tersimpan lokal dan tidak mempengaruhi OCR, marker, ataupun offline outbox.
