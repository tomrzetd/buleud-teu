# ScanSnap SV600 ↔ Buleud Teu Desktop

**Status:** dukungan melalui **hasil file ScanSnap Home**, bukan kendali langsung USB, WIA, TWAIN, atau ISIS.
Ricoh menyatakan seri ScanSnap termasuk SV600 **tidak menyediakan TWAIN/ISIS**.
Driver/aplikasi yang didukung adalah **ScanSnap Home**.

Sumber: https://scansnap-faq.pfu.ricoh.com/hc/en-us/articles/27610858674713-Does-the-ScanSnap-Series-support-TWAIN-or-ISIS
dan https://www.pfu.ricoh.com/global/scanners/scansnap/sv600/index.html

## Sistem operasi: apa yang sudah dan belum

- **Buleud Teu Desktop** CI saat ini mengemas **Windows x64 (64-bit)** dan Linux x64.
  Engine Kotlin/JVM sama untuk scan dari file. Paket **Windows x86 32-bit
  belum dibuat/diuji**. Jangan menamai APK Android sebagai versi Windows.
- **ScanSnap Home SV600** menurut Ricoh mendukung Windows 10 32/64-bit dan
  Windows 11; lihat dukungan driver resmi untuk versi Windows yang dipakai.
  **Kompatibilitas driver ≠ kompatibilitas paket Buleud Teu.**
- Jangan memakai scanner SV600 dengan jalur WIA/TWAIN/NAPS2 Buleud Teu;
  ia tidak akan muncul dalam daftar perangkat TWAIN/ISIS.
- Untuk 32-bit diperlukan paket Java dan pengujian terpisah; JVM 32-bit
  cenderung kekurangan memori untuk dokumen F4 resolusi tinggi.
  Tidak ada klaim kompatibilitas x86 asli sampai diuji pada komputer 32-bit.

## Workflow operasional paling sederhana

1. Hubungkan SV600 lewat USB dan instal **ScanSnap Home resmi**.
2. Di ScanSnap Home buat *scan profile* khusus, misalnya:
   `LJK BuleudTeu F4`.
3. Atur **dokumen rata satu lembar F4 (215×330 mm)**, latar bersih,
   **JPEG berkualitas tinggi disarankan** (PDF juga didukung),
   warna, resolusi 300 dpi jika tersedia,
   **automatic document crop + deskew** supaya seluruh kertas termasuk
   marker empat sudut tetap masuk. Hindari *book spread/two-page split*,
   background clipping, dan efek yang menghapus bulatan jawaban.
4. Pilih folder keluaran yang mudah dicari, misalnya
   `C:\\LJK-SV600\\Masuk`. Gunakan nama file unik per lembar.
5. Di **Buleud Teu Desktop**, pilih ujian dan pilih **Sumber:
   ScanSnap SV600 — lewat ScanSnap Home**.
6. Klik **Pilih folder**, arahkan ke folder yang sama.
7. **Tekan “Pantau hasil SV600” terlebih dahulu**.
   Kemudian lakukan Scan di ScanSnap Home atau tombol perangkat.
   Setelah file JPEG/PDF selesai ditulis dan stabil 2,4 detik,
   file otomatis masuk daftar hasil Buleud Teu.
8. Cek hasil deteksi marker dan identitas siswa; koreksi manual jika
   perlu, kemudian simpan/sinkronkan jawaban.

Jika ScanSnap Home sudah telanjur membuat file sebelum mode pantau aktif,
tekan **Impor berkas / folder**. Mode pantau tidak otomatis
mengimpor file lama agar mencegah duplikasi.
Jika file dengan nama sama ditimpa tetapi ukuran/waktu modifikasinya
berubah, file dianggap sebagai pindaian baru.

## Pengujian fisik yang WAJIB dilakukan di sekolah

Gunakan **3 lembar LJK F4 uji**, bukan nilai resmi siswa:
(1) marker 25 ABCD, (2) marker 50, (3) LJK lama 25.
Perhatikan apakah ujung bawah F4, marker, dan seluruh bulatan
masih terlihat. Uji JPEG dan PDF, scan ulang, file sangat besar,
scan orientasi terbalik, serta pastikan satu file tidak masuk dua kali.
Perbaiki posisi/kontras/auto crop di ScanSnap Home sebelum
mencoba mengubah kalibrasi engine. Hindari lampu/sinar
langsung yang menyebabkan bayangan atau refleksi.

**Penting:** Tes CI membaca JPEG/PDF sintetis dengan engine yang sama
dan memastikan profil SV600 muncul di aplikasi. CI **tidak memiliki
perangkat SV600**, sehingga integrasi fisik dan akurasi terhadap
hasil asli belum dapat diklaim lulus.
