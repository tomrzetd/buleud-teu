# Dashboard TV Pokja ASAS & ujian bersama

## Ujian bersama (satu soal per mapel × tingkat)
Sheet Ujian: satu baris per mapel × tingkat. Kolom **Guru** berisi semua guru pengampu, dipisah **titik koma**
(`Eti Suhaeti, S.Pd; Ikah Kartikah, S.Pd.; Tia Mutiara, S.Pd.`). Semua guru di daftar bisa memindai, mengisi/mengubah
kunci (berlaku untuk semua), menganalisis, dan membuat laporan (tanda tangan = guru yang membuat). Saat memindai,
tiap guru hanya melihat siswa rombel yang diampunya (sheet Guru). Menambah guru: tambahkan `; Nama Guru` di sel Guru.

## Dashboard TV (proyek Apps Script terpisah, hanya membaca)
Sumber: `apps-script-tv/Kode.gs` + `Tampilan.html`. Properti skrip: `SHEET_ID`, `TV_KEY`, `REKAP_KEY`.

| Alamat | Isi |
| --- | --- |
| `…/exec?k=<TV_KEY>` | Layar TV ruang pokja: progres rombel × mapel, nilai & ketuntasan per tingkat, status per guru, jadwal. **Tanpa nama siswa.** |
| `…/exec?k=<REKAP_KEY>` | **Mode rapat**: tabel nilai per rombel (No. Peserta, nama, nilai per mapel, rata-rata, peringkat), bergilir 15 detik. Hanya untuk rapat tertutup. |
| `&tingkat=9` | hanya kelas 9 · `&hal=2` kunci di halaman/rombel ke-2 |

Remote TV: ←/→ pindah halaman, OK jeda. Data diperbarui tiap 60 detik (cache 45 detik).
Ganti kunci di Project Settings → Script Properties bila alamat tersebar; tidak perlu deploy ulang.
