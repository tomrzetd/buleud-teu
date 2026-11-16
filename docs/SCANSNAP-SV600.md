# ScanSnap SV600 ↔ Buleud Teu Desktop

**Status:** dukungan melalui **hasil file ScanSnap Home**, bukan kendali langsung USB, WIA, TWAIN, atau ISIS.
Ricoh menyatakan seri ScanSnap termasuk SV600 **tidak menyediakan TWAIN/ISIS**.
Driver/aplikasi yang didukung adalah **ScanSnap Home**.

Sumber: https://scansnap-faq.pfu.ricoh.com/hc/en-us/articles/27610858674713-Does-the-ScanSnap-Series-support-TWAIN-or-ISIS
dan https://www.pfu.ricoh.com/global/scanners/scansnap/sv600/index.html

## Sistem operasi: apa yang sudah dan belum

- **Windows x64 (64-bit)**: paket portable dan installer EXE menyertakan
  runtime Java dan merupakan jalur utama.
- **Windows x86 32-bit**: branch ini menyiapkan ZIP *eksperimental*
  `windows-x86-32bit-Java17-required.zip` berisi JVM bytecode portable,
  **tanpa runtime**. Pengguna perlu memasang **Azul Zulu Java 17 x86**.
  CI akan menguji aplikasi lewat JVM x86 di runner Windows; pengujian di
  **PC Windows 10 32-bit nyata** tetap diperlukan sebelum klaim produksi.
- **Linux x64**: paket terpisah. APK Android bukan versi Windows.
- **ScanSnap Home SV600** menurut Ricoh mendukung Windows 10 32/64-bit dan
  Windows 11; lihat dukungan driver resmi untuk versi Windows yang dipakai.
  **Kompatibilitas driver ≠ kompatibilitas paket Buleud Teu.**
- Jangan memakai scanner SV600 dengan jalur WIA/TWAIN/NAPS2 Buleud Teu;
  ia tidak akan muncul dalam daftar perangkat TWAIN/ISIS.
- Kebutuhan Java x86: https://www.azul.com/downloads/?architecture=x86-32-bit&os=windows&package=jre
  pilih **Java 17 / Windows x86 32-bit**. Jalankan file
  `buleud-teu-desktop/bin/buleud-teu-desktop.bat` setelah memasangnya.
- JVM 32-bit memiliki keterbatasan RAM. Engine memproses gambar F4 dan OCR
  **satu per satu** pada JVM 32-bit; jangan membuka PDF ratusan halaman
  sekaligus. Ini jalur uji awal, tidak menyertakan Java yang dipaketkan.
- Dukungan driver SV600 pada Windows 10 x86 dan pembacaan file Buleud Teu
  adalah dua hal yang berbeda; kompatibilitas nyata belum terverifikasi.

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
