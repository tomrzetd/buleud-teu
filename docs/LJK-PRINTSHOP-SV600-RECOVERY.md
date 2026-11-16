# LJK percetakan F4-25 — pemulihan geometri ScanSnap SV600

**16 November 2026 · mode pengujian terkontrol**.

## Temuan dari sampel scan nyata, diproses secara lokal
Sampel satu halaman PDF berasal dari ScanSnap Home/ScanSnap SV600,
ukuran F4 215 × 330 mm. Dokumen aslinya mengandung identitas siswa:
**jangan unggah ke GitHub, CI, issue, atau test fixture publik**.

- PDF dapat dibaca oleh PDFBox pada JVM dengan konfigurasi grafik yang benar.
- Corner marker 4/4 dan marker tengah 2/2 terdeteksi.
- Template canonical F4-25-ABCD-v1 hanya cocok **36%** posisi bulatan.
  Meskipun fungsi sempat mengembalikan success, jawaban banyak kosong.
- Kisi percetakan memiliki blok lebih rapat, pitch vertikal lebih kecil,
  dan posisi lebih bawah.
- Profil `F4-25-ABCD-PRINTSHOP-v1`: **100%** posisi bulatan cocok.
  Engine menemukan 24 pilihan tunggal dan 1 nomor ganda (nomor 3),
  bukan memaksakan jawaban yang ambigu.
- Ini verifikasi satu sampel, **bukan klaim akurasi untuk seluruh batch**
  percetakan. Uji beberapa lembar dari awal, tengah, akhir tumpukan.

## Keamanan pemilihan layout
Profil standar F4-50/F4-25 tetap diutamakan dan tidak berubah. Profil
percetakan dipakai hanya apabila:
- jumlah soal aktif tidak lebih dari 25 dan opsi ABCD;
- layout standar belum kuat (kecocokan di bawah 80%);
- kandidat percetakan memiliki kecocokan sedikitnya 82% dan unggul
  minimal 18 poin persentase atas layout normal.

Temuan ambigu/double diberi flag untuk tinjauan; identitas siswa tetap
harus diverifikasi secara manual sebelum menyimpan.

## SOP awal: 5 lembar, bukan seluruh lembar ujian
1. Di ScanSnap Home, simpan satu halaman F4 utuh sebagai JPEG resolusi
   tinggi; PDF satu halaman juga didukung. Jangan aktifkan pemotongan
   otomatis yang menghapus sisa marker bawah.
2. Pilih ujian aktif ABCD **25 soal** di desktop/native Android.
3. Impor/scan LJK yang sesuai, periksa indikator layout dan semua 25
   jawaban, termasuk nomor 1, 5, 6, 10, 11, 15, 20, dan 25.
4. Bandingkan satu per satu dengan bulatan yang benar-benar dihitamkan;
   jawaban ganda/tipis/kosong harus ditandai, bukan ditebak.
5. Ulangi pada lima lembar dari posisi cetak berbeda. Jika ada jawaban
   bergeser/salah terbaca, **jangan sinkronkan nilai**; minta audit
   tambahan untuk variasi ukuran/penjilidan/trim.

## Batas
- Cetakan yang **marker sudutnya hilang sepenuhnya** belum ditangani
  oleh profil ini; belum ada pemaksaan homografi 3-marker.
- Percetakan yang memakai layout berbeda dari sampel ini perlu
  kalibrasi terpisah.
- Kalibrasi kisi jawaban tidak sama dengan kalibrasi OCR identitas;
  nomor peserta/nama wajib diperiksa manual.
- Pada Linux headless, CLI pembaca PDF membutuhkan
  `JAVA_TOOL_OPTIONS=-Djava.awt.headless=true`; kegagalan AWT di
  runner tidak menunjukkan marker gagal.
- File sampel nyata tetap di luar repositori. Tes CI membuat gambar
  sintetis tanpa data pribadi siswa.
