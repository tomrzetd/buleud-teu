# Tindak lanjut audit teknis & psikometrik (6 November 2026)

Setiap temuan diverifikasi dulu terhadap kode lama dengan probe di layanan Google tiruan, lalu diperbaiki dan dikunci dengan uji regresi `tools/test/test_security.js` (dijalankan di CI). Kolom "Kode lama" adalah hasil probe sebelum patch.

| ID | Temuan | Kode lama (probe) | Status | Perbaikan |
|---|---|---|---|---|
| SEC-01 | Guru lain bisa memakai ujian | Guru B berhasil menyimpan ke ujian Guru A | **Selesai** | `assertPemilik_` di simpan, analisis, bank, laporan (ubah/arsip sudah dicek) |
| SEC-02 | Identitas siswa bebas | "SISWA PALSU" diterima | **Selesai** | Siswa wajib ada di sheet Siswa & kelas ujian; NISN/nomor dari roster; nama kembar wajib NISN |
| KEY-01 | Kunci salah dihapus, nomor bergeser | `A?BC` disimpan `ABC` | **Selesai** | Kunci tak sah ditolak dengan nomor posisi; kunci rusak di sheet dipertahankan sebagai `?` (Audit kritis) |
| SYNC-01 | Kirim ulang menggandakan baris | 2 baris | **Selesai** | ScanID idempoten: kirim ulang memperbarui baris |
| SYNC-02 | Antrean offline gagal tulis tetap "tersimpan" | — | **Selesai (minimal)** | Web/Android/desktop memverifikasi tulis; antrean yang ditolak server dilaporkan, tidak diulang selamanya. IndexedDB: berikutnya |
| SEC-03 | Guru nonaktif tetap bisa memakai token | masih bisa | **Selesai** | Status Aktif diperiksa setiap permintaan; PIN ber-hash: berikutnya |
| STAT-01 | D bergantung urutan saat skor seri | D butir 1 = 0,25 atau −0,25 | **Selesai** | Bobot fraksional di batas kelompok; diuji 200 urutan acak + referensi independen numpy |
| STAT-02 | "Valid" disamakan dengan r ≥ r tabel | — | **Selesai** | Label "Korelasi butir-total: Memadai / Rendah / –", catatan bukan validitas isi |
| STAT-03 | D/r negatif otomatis "Dibuang" | Dibuang | **Selesai** | "Audit kritis" + keputusan guru; bank soal status awal "Telaah" |
| STAT-04 | Rekomendasi keras pada n < 20 | — | **Selesai** | n < 20: "Data kurang" (indikasi awal tetap ditampilkan) |
| STAT-05 | Pengecoh seri atas = bawah dihitung berfungsi | — | **Selesai** | Harus lebih banyak dipilih kelompok bawah |
| STAT-06 | KKTP 0 menjadi 75 | 75 | **Selesai** | 0–100 divalidasi; kosong = 75 |
| STAT-07 | Kosong/ganda/salah sama-sama 0 | — | Berikutnya | Simpan status per butir (kosong, ganda, koreksi manual) terpisah |
| STAT-08 | Satuan SEM | — | **Selesai** | "SEM (dalam jumlah butir benar)", peringatan KR-20 negatif |
| DATA-01 | Scan terakhir dikunci nama+kelas | — | **Selesai** | Dikunci NISN bila ada |
| DATA-02 | Bank soal tanpa naskah/kisi-kisi | — | Berikutnya | Skema item, versi, kisi-kisi, telaah (Aiken's V) |
| SEC-04 | Token & data lokal tanpa enkripsi | — | Berikutnya | Kebijakan retensi & hapus cache |
| Formula | Teks diawali `=` masuk sheet | — | **Selesai** | `safe_()` menyimpan sebagai teks |
| ENG-01 | Uji OMR lapangan | — | Berikutnya | Dataset foto LJK nyata berlabel |
| UI-01 | Dashboard analisis | — | **Selesai** | Ringkasan KPI, peta butir (warna + kode teks), filter/urutan, detail butir atas vs bawah + saran, mode anonim laporan |
| CI-01 | Uji keamanan belum di CI | — | **Selesai** | `test_security.js` di workflow Tests; parity Kotlin: berikutnya |

Batasan: verifikasi dilakukan pada layanan Google tiruan; belum menggantikan uji di spreadsheet produksi.
