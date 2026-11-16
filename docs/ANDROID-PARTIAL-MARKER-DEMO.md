# Pengecekan video Android: LJK F4 dari percetakan vs LJK F4 lama

16 November 2026. Source pengguna: video HP, gambar setup, dan satu PDF
ScanSnap SV600 dari percetakan. **Jangan memasukkan rekaman/screenshot asli,
nama/nomor peserta, token atau kunci lisensi ke git/CI.**

## Temuan visual dalam video
- Saat kamera diarahkan pada LJK 25 ABCD dari percetakan, tampil pesan
  `Susunan 4 marker sudut tidak cocok dengan LJK F4. Foto seluruh halaman.`
- Pada LJK F4 lama, kamera berhasil membentuk quadrilateral orange dan
  menampilkan lembar hasil dengan 25 bulatan dan pilihan koreksi.
- Artinya patch kisi cetakan sebelumnya *tidak cukup*: Android memerlukan
  pemulihan marker lebih awal, sebelum pembacaan kisi.

## Patch
1. Profil geometri percetakan `PRINTSHOP_F4_25` yang telah ada dipertahankan.
2. Saat normal 4 sudut gagal karena 2 marker bawah terpotong, cari empat titik
   nyata: 2 marker sudut atas (8 mm) + 2 marker tengah (6 mm). Fit homografi
   dan proyeksikan posisi bawah yang hilang. **Tidak memakai tiga titik/tebakan
   sudut tanpa landasan.**
3. Menerima hasil hanya jika kesesuaian kisi pilihan ganda >=82%.
   Jika berbeda atau marker atas/tengah tidak cukup, tampil pesan gagal.
4. Preview CameraX menandai marker bawah sebagai *estimasi*, tidak
   mengaktifkan auto-capture; guru menekan tombol foto biru secara manual.
   Hasil memiliki peringatan merah/kuning untuk periksa seluruh pilihan.
5. Deteksi normal LJK lama tetap diprioritaskan jika empat marker utuh.
6. Masuk tanpa URL Apps Script sekarang langsung **MODE DEMO** lokal:
   `GURU DEMO`, 3 kelas, 18 siswa fiktif, 3 ujian latihan 25 ABCD.
   Bisa memindai, mengoreksi jawaban dan memeriksa foto overlay.
   Tidak bisa menulis ke Sheets/SQLite/outbox; **tombol Simpan tidak
   ditampilkan**. Hubungkan sekolah melalui Pengaturan.
7. Mode asli tetap memakai Apps Script V40 serta autentikasi guru/lisensi;
   tidak ada bypass lisensi. Tidak uninstall / mereset hasil scan lokal.

## CI/regresi
- Fixture sintetis **tanpa data siswa** menguji marker utuh dan dua
  marker bawah hanya 25% tercetak.
- Keduanya wajib berakhir `marker/25`, bukan jatuh diam-diam ke hasil
  markerless tanpa mengetahui profil cetakan.
- Periksa 24 jawaban tunggal dan nomor 3 terdeteksi ganda, bukan ditebak.
- Android perlu build release-signing resmi dan uji kamera HP fisik.

## SOP verifikasi di sekolah
1. Backup/sinkronkan semua data scan sebelum menginstal APK uji.
2. Ambil **5 lembar** cetak dari awal/tengah/akhir tumpukan.
3. Setiap lembar: seluruh kertas terlihat, marker atas/tengah tidak tertutup;
   arahkan HP tegak, matikan Auto bila marker bawah rusak, **tekan foto manual**.
4. Saat masuk hasil: cek kesesuaian 25 bulatan, nomor ganda/kosong,
   rekomendasi OCR nama/nomor, dan bukti deteksi; cocokkan manual.
5. **Jangan kirim ke database nilai** sebelum uji 5 lembar konsisten.
6. Jika masih gagal, kirim screenshot pesan error dan scan cetak
   yang *identitasnya disamarkan*, bukan log berisi nama/nomor siswa.

### Batas
Automated tests are synthetic. Video footage is evidence of previous failure,
not a physical verification that the new APK now succeeds on the same phone.
