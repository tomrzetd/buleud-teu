# Lisensi Buleud Teu — Panduan Operator (BTL1)

## Desain

- **Sheet `Sekolah!B10`** berisi kode lisensi berformat `BTL1.payload.signature`; bukan status tulisan biasa.
- Token ditandatangani HMAC-SHA256, diikat ke **ID spreadsheet**, **tier**, **tanggal terbit**, **masa kedaluwarsa**, dan **jti**.
- **BT_LICENSE_HMAC_KEY** hanya disimpan di komputer penerbit lisensi dan *Apps Script → Project Settings → Script properties*. **Jangan** taruh rahasia itu di APK, GitHub, sheet, QR, atau `local.properties`.
- Android hanya menerima hasil pemeriksaan server berupa `licensed: true/false`; setiap aksi menulis/menganalisis/diverifikasi kembali oleh Apps Script.
- `Terdaftar` (teks lama) **TIDAK lagi mengaktifkan produksi**. Ini penting untuk mencegah siapa pun mengubah sel dengan mudah.
- Kode lisensi bertanda tangan dapat dibaca metadata-nya tanpa key; keamanan berasal dari **tanda tangan** yang tidak bisa dipalsukan tanpa secret.
- Build APK yang di-patch tetap bisa mengaktifkan tombolnya di layar; namun **tidak bisa membuat server menulis data** jika signature tidak sah. Sistem lisensi perangkat yang benar-benar "bulletproof" tidak ada.

## Langkah pertama (hanya operator)

1. Pada PC tepercaya, jalankan:

   ```powershell
   python tools/license_generate.py init-secret
   ```

   Hasilnya secret random 64 karakter heksadesimal. Simpan pada password manager, **jangan commit atau kirim di chat**.
2. Di **Apps Script → Project Settings → Script properties**, tambah:
   - Property: `BT_LICENSE_HMAC_KEY`
   - Value: isi secret tadi.
3. **Deploy server versi baru**: tempel `apps-script/dist/BuleudTeu_lengkap.gs` ke project Apps Script yang terkait spreadsheet, **Deploy → Manage deployments → Edit → New version → Deploy**. Jaga deployment ID/URL lama supaya APK tidak perlu disetel ulang.
4. Set `BT_LICENSE_HMAC_KEY` pada environment PC lokal (PowerShell sesi saat ini):

   ```powershell
   $env:BT_LICENSE_HMAC_KEY = "secret dari password manager"
   ```

   Jangan tulis secret literal di skrip otomatis atau file repo.
5. Terbitkan kode lisensi untuk spreadsheet yang benar (contoh format perintah):

   ```powershell
   python tools/license_generate.py issue --sheet-id 1seqo92lrB86VuGTBc20NCAZXl5we0-5fdkWYs3LTQVg --tier school --days 365
   ```

   Tersedia tier `school` dan `pro` untuk metadata paket; keduanya saat ini memberikan akses penuh fitur produksi. Token akan tampil di terminal, **tempel token lengkap** ke **`Sekolah!B10`** sebagai *plain text*.
6. Tekan **↻** pada halaman Ujian Saya. Status baru hanya aktif setelah respons `exams` dari server live berhasil. Jika ada error, lihat Apps Script Executions dan pastikan deployment ID, Spreadsheet ID, Script Properties, dan isi B10 semuanya benar.

## Pemeriksaan / perpanjangan / pencabutan

- Validasi di PC: `python tools/license_generate.py verify "<kode>" --sheet-id <sheet-id>`.
- Perpanjang: terbitkan token baru dan timpa nilai B10. Anda **tidak perlu membuat APK baru**.
- Cabut lisensi: kosongkan B10. Apps Script menolak permintaan simpan, ubah ujian, OCR cloud, analisis, bank, dan laporan pada tiap request.
- Token hanya berlaku pada spreadsheet ber-ID sama: **tidak bisa** disalin ke sekolah lain.
- Untuk diagnosis jaringan, buka deployment Web App yang digunakan aplikasi dengan `?action=config` dan cek objek `sekolah.licensed`. Tidak menampilkan token/secret.
- Jika status tetap Demo setelah B10 berubah, cek apakah APK memakai URL deployment lama, apakah redeploy sudah *New version*, dan apakah `BT_LICENSE_HMAC_KEY` telah disetel. **Mengganti B10 menjadi tulisan `Terdaftar` tidak cukup.**

## Data dan privasi

- Saat tidak aktif: server hanya mengirim lima **identitas contoh sintetis**, bukan roster nyata.
- Android tidak menampilkan kartu tutorial aktivasi di dashboard. Tombol yang perlu lisensi nonaktif; pemindaian tetap bisa dicoba dengan watermark Demo.
- Jika HP offline, tidak ada status aktivasi segar; akses produksi diperlakukan fail-closed saat refresh. Antrean offline yang sudah ada tetap tersimpan hingga aktivasi dapat diverifikasi lagi.
- Jangan kirim kunci, token guru, NISN, atau data siswa ke log publik.
