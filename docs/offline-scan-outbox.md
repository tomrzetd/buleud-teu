# Buleud Teu — mode scan offline-first (Android)

## Aturan utama
1. **Scan berhasil tidak berarti terkirim.** Sesudah guru memilih siswa dan menekan **Simpan**, jawaban disimpan secara **durable** ke SQLite internal `bt_scans.db`.
2. Baru setelah transaksi lokal sukses aplikasi kembali ke kamera. Jika ruang penyimpanan habis atau SQL gagal, tetap di halaman hasil scan dan menampilkan peringatan.
3. WorkManager berjalan otomatis saat kondisi jaringan `CONNECTED`, termasuk saat HP kembali online atau aplikasi tidak aktif. Jika server sibuk/timeout/HTTP 429/5xx, WorkManager retry dengan *exponential backoff*.
4. Jawaban yang belum dikonfirmasi server **tidak pernah dihapus** oleh klien. Balasan positif dari endpoint `save` adalah satu-satunya kondisi penghapusan record SQLite.
5. Jika Apps Script ternyata sudah menerima ScanID tapi respons hilang, retry mengirim ScanID yang sama. Server `HasilScan` melakukan *upsert* berdasar `ID Ujian + ScanID` dan menghindari baris ganda.
6. Server tetap memeriksa autentikasi, kepemilikan ujian, roster siswa, dan lisensi pada setiap write. Client tidak mengecek lisensi setiap navigasi layar; UI menggunakan snapshot entitlement login / refresh eksplisit.
7. Kesalahan otentikasi, lisensi atau roster yang bukan masalah sementara menyebabkan item berstatus **blocked**, tidak dihapus. Guru memperbaiki data, login kembali, atau ketuk **Coba kirim hasil tertunda** untuk retry.
8. Antrean yang tersimpan milik endpoint URL dan nama guru tertentu, tidak boleh otomatis dikirim jika berpindah akun atau Apps Script sekolah.
9. Saat aplikasi diperbarui dari versi sebelumnya, antrean JSON lama di SharedPreferences dimigrasikan ke SQLite dan hanya dihapus setelah seluruh record berhasil ditulis.

## Saat guru memakai aplikasi
- Halaman utama tidak lagi melakukan `config` + `exams` tiap `ON_RESUME`.
- Login baru / saat pertama kali belum ada cache: satu kali permintaan `exams` memuat daftar siswa/ujian dan keputusan lisensi.
- Saat kembali dari scan atau berpindah halaman: gunakan data cache; **tidak menunggu server**.
- Tombol ↻ tetap menyediakan refresh manual untuk roster, ujian, lisensi dan progres scan dari Spreadsheet.
- Card **N hasil scan tersimpan di HP** menunjukkan data yang belum memperoleh konfirmasi server.
- Tombol **Coba kirim hasil tertunda** dapat mengatasi WorkManager yang sedang dalam jeda backoff atau item yang diblokir karena server.
- Jika token guru kedaluwarsa, login ulang lalu upload akan dijadwalkan lagi tanpa menghapus antrean.
- **Jangan hapus data aplikasi / uninstall / pindah HP** sebelum pending = 0. SQLite disimpan di perangkat, bukan cloud sebelum upload selesai.

## Matriks uji manual pada APK release
| Kondisi | Harapan |
|---|---|
| Internet mati sebelum scan | Simpan berhasil lokal, kamera langsung siap, pending +1 |
| Google Apps Script lambat 30–150 dtk | Tidak menahan kamera/dashboard; pending tetap tercatat |
| Data seluler aktif lagi | WorkManager mulai mengirim; pending turun setelah ACK |
| Server menerima save lalu koneksi putus sebelum respons | Retry dengan ScanID sama; satu baris di HasilScan |
| Server menolak roster / lisensi | Pending tidak dihapus; status perlu diperiksa |
| Token 6 jam kedaluwarsa | Pending tidak dihapus; login ulang lalu retry |
| Aplikasi ditutup / dibuka ulang | Antrean SQLite tetap ada |
| Apps Script URL diganti | Antrean tujuan lama tidak bocor ke endpoint baru |
| Banyak scan cepat | Seluruh `scanId` unik; FIFO terkirim |
| Data GPS/foto | Tidak disimpan di antrean; hanya jawaban, identitas terpilih, metadata kualitas |
| LJK bermarker 25/50 | Koordinat, engine dan skor tetap sama |

## Catatan keamanan & pemeliharaan
- Basis data `bt_scans.db` berada dalam *private app storage* Android, `allowBackup=false`. Ini bukan database terenkripsi end-to-end. Lindungi HP dengan PIN/biometrik dan batasi akses staf.
- `WorkManager` adalah sinkronisasi **best-effort**, bukan koneksi instan terjamin. Penghematan baterai, pembatasan sistem, dan konektivitas dapat menunda pengiriman.
- Sistem online dapat mencabut lisensi kapan saja; UI offline mungkin masih menunjukkan entitlement sesi sebelumnya, **namun server tetap menolak seluruh operasi terproteksi**.
- Update APK memakai keystore lama dan versionCode lebih tinggi. Pembaruan yang normal menjaga database SQLite; menghapus aplikasi akan menghapus pending.
