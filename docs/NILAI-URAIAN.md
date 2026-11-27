# Nilai Uraian (Essay) Manual — PG + Uraian = 100

**Rumus:** Nilai Akhir = (jumlah PG benar × Poin PG) + Σ skor uraian. Total maksimal wajib 100.
Contoh ASAS 25 PG: Poin PG 3 → 75, uraian `10;10;5` → 25, total 100.

| Bagian | Isi |
|---|---|
| Sheet `Ujian` | kolom baru **Poin PG**, **Uraian Maks** (mis. `10,10,5`). Kosong = skor PG murni (perilaku lama). |
| Sheet `HasilScan` | kolom baru **Uraian** (skor per soal) dan **Nilai Akhir**. Kolom **Skor** tetap skor PG murni 0–100. |
| Analisis butir, KR-20, database PG | **hanya PG** (tidak berubah). |
| Laporan unduhan per guru | Benar, Skor PG, U1…Un, Nilai Akhir, Tuntas, Peringkat; rekap dari nilai akhir. |
| Dashboard TV / Rekap rapat | memakai Nilai Akhir untuk ujian ber-uraian; siswa yang uraiannya belum lengkap tetap terhitung "masuk" tetapi tidak dirata-rata. |

Status **Menunggu uraian**: lembar PG sudah dipindai tetapi ada skor uraian yang masih kosong —
belum diberi peringkat dan belum dihitung tuntas/tidak.

## Cara pakai (guru)
1. **Edit ujian** → bagian *Soal uraian*: isi Poin per PG benar dan skor maks. tiap uraian. Aplikasi menolak bila total ≠ 100.
   Untuk ujian bersama (satu mapel × tingkat), cukup satu guru yang mengatur.
2. Pindai LJK PG seperti biasa. Skor uraian boleh langsung diisi di layar hasil, atau nanti.
3. Menu **✍️ Nilai uraian** pada kartu ujian: tabel per rombel; isi skor lalu Enter/✓ — tersimpan otomatis (butuh internet).
4. Pindai ulang PG tidak menghapus skor uraian; nilai akhir dihitung ulang. Mengubah kunci/poin juga menghitung ulang semua nilai.

Aksi API: `essay` (simpan skor uraian satu siswa, butuh scan PG), `essayList` (daftar per rombel guru).
Uji: `tools/test/test_uraian.js` (sumber & bundel minified), `tools/test/e2e_uraian.js` (Playwright).
