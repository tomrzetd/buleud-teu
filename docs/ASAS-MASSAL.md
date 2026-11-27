# Membuat semua kode ujian ASAS/PSAS sekaligus + Dashboard ASAS

File `apps-script/AsasPsas.gs` ditambahkan sebagai **file kedua** di proyek Apps Script sekolah
(di samping Code.gs, boleh versi minified). Tidak perlu redeploy.

1. Apps Script → **Files +** → **Script** → beri nama `AsasPsas` → tempel isi file → Simpan.
2. Pilih fungsi **`rencanaUjianASAS`** → **Run**. Sheet *Rencana Ujian ASAS* berisi daftar ujian yang
   akan dibuat (guru × mapel × tingkat, rombel yang diampu, tanggal jadwal, KKTP tabel) serta catatan
   data Guru/Siswa yang perlu dibetulkan. Sheet Ujian belum diubah.
3. Bila rencana sudah benar, jalankan **`buatUjianASAS`**. Ujian yang sudah ada (nama "ASAS", guru,
   mapel, tingkat sama) dilewati; aman dijalankan ulang.
4. Jalankan **`pasangPemicuDashboardASAS`** sekali: sheet *Dashboard ASAS* (progres scan, rata-rata,
   % tuntas per mapel × rombel) diperbarui tiap 10 menit.

Kunci ujian baru diisi `?` (25 soal). Guru **wajib** membuka ujiannya di aplikasi → **Edit** → isi
kunci. Lembar yang terlanjur dipindai sebelum kunci diisi tidak hilang: Benar/Skor dihitung ulang
otomatis saat dashboard diperbarui (atau jalankan `hitungUlangSkorASAS`).

Sumber data: Tabel KKTP SMPN 2 Jalaksana 2026-2027 (Semester Ganjil, kolom PSAT) dan Jadwal Pengawas
PSAS Ganjil 2026-2027 (30 Nov–3 Des). Mapel yang belum ada di jadwal (Penjas, Informatika, Prakarya,
Mulok) dibuat tanpa tanggal. Ubah `ASAS_CONFIG` untuk PSAT/ASAS semester genap.

Asumsi: guru yang mengampu lebih dari satu mapel mengajar mapel-mapel itu di rombel yang sama
(sheet Guru tidak memisahkan rombel per mapel). Periksa sheet rencana sebelum langkah 3.
