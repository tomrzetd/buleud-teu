# Buleud Teu — Database Skema Dapodik v2 (2026)

## Tujuan
Buleud Teu menggunakan istilah administratif **Tingkat Pendidikan** dan **Nama Rombel**.
Kode internal `kelas` dalam JSON/SQLite tetap berupa **Nama Rombel lengkap**, misalnya
`8A`. Ini mempertahankan kompatibilitas hasil scan lama, kunci ujian, OCR,
analisis butir/statistik, laporan, dan antrean offline Android/desktop/PWA.

### Skema baru per tab
| Tab | Kolom | Isi contoh | Catatan |
| --- | --- | --- | --- |
| Siswa | E: **Tingkat Pendidikan** | `8` | SMP 7–9; SD 1–6; SMA/SMK 10–12 |
| Siswa | F: **Nama Rombel** | `8A` | Nama lengkap, jangan hanya `A` |
| Guru | E: **Tingkat/Rombel Diampu (pisah koma)** | `8A,8B,9` | `9` = semua rombel tingkat 9 (legacy yang didukung) |
| Ujian | D: **Tingkat Pendidikan** | `8` | Jenjang dari ujian |
| Ujian | E: **Nama Rombel** | `8A,8B`, `SEMUA` | `SEMUA` + tingkat = seluruh siswa tingkat tersebut |
| HasilScan | D: **Tingkat Pendidikan** | `8` | Ditulis server |
| HasilScan | E: **Nama Rombel** | `8A` | Jangan edit manual |
| BankSoal | C: **Tingkat Pendidikan** | `8` | Kolom dan engine statistik tetap sama |

Kolom identitas lainnya tidak berubah: NISN, NIS, nomor peserta, dan nama.
**Pastikan kolom NISN/NIS/Nomor Peserta berformat teks** agar nol di depan tidak hilang.

## Format lama dan aturan migrasi
| Lama E/F siswa | Baru E/F siswa |
| --- | --- |
| `Kelas=8`, `Tingkat=A` | `Tingkat Pendidikan=8`, `Nama Rombel=8A` |
| `Kelas=8A`, `Tingkat=8` | `Tingkat Pendidikan=8`, `Nama Rombel=8A` |
| `Kelas=10`, `Tingkat=B` | `Tingkat Pendidikan=10`, `Nama Rombel=10B` |

Nama rombel lain seperti `VIII-A`, `X IPA 1`, `XI.1`, atau `3 Mawar`
diterima apa adanya, dengan Tingkat Pendidikan tetap menjadi atribut terpisah.
Jika ada data ambigu, helper `migrasiSiswaDapodik_()` akan menolak migrasi,
bukan menebak nilai atau menghapus siswa.

## Urutan rilis (WAJIB)
1. Cadangkan **Spreadsheet** dan APK lama; tunggu antrean scan Android offline = **0**
   sebelum mengubah skema sekolah.
2. Gunakan branch `feat/dapodik-rombel-schema-crossplatform-20261113`; jalankan CI
   `Uji engine & Apps Script`, `Android APK`, dan `Desktop Windows/Linux`.
3. Tempel `apps-script/dist/BuleudTeu_lengkap.gs` terbaru di Apps Script,
   **Deploy > Manage deployments > Edit > New version > Deploy** pada deployment ID lama.
4. Jalankan menu **Buleud Teu > Setup / perbaiki sheet** atau fungsi `setup()`.
   Fungsi tersebut mengonversi E/F siswa **sebelum** mengganti header. Bila
   baris tidak dikenali, proses dibatalkan dan data tetap apa adanya.
5. Periksa tab `Siswa` E/F beberapa rombel (7A, 8A, 9A), lalu `Guru`,
   `Ujian` (catatan: tingkat tanpa huruf dulu tetap diterima), `HasilScan`.
6. Rebuild APK Android (release ditandatangani key lama), desktop x86_64 dan
   PWA; pada aplikasi tekan refresh login agar cache roster dimuat kembali.
7. Tes siswa 8A dan 9A, ujian semua tingkat 8, OCR, scan 25 dan 50, rescan,
   sinkronisasi offline, analisis butir, ekspor laporan, dan bank soal.

**Jangan** hanya mengganti header di Spreadsheet sebelum Apps Script lama
di-*deploy* ulang. Engine lama membaca nama header sehingga akan gagal menemukan siswa.

## Kontrak API lintas platform
Apps Script tetap mengirim:
```json
{
  "siswa": [{"nama": "CONTOH", "tingkat": "8", "kelas": "8A", "rombel": "8A", "tingkatPendidikan": "8"}],
  "ujian": [{"tingkat": "8", "kelas": ["8A", "8B"]}]
}
```
Android Kotlin, desktop JVM (Windows x64/Linux x64), dan PWA menggunakan
`kelas` sebagai **kode rombel**, bukan angka tingkat. Jangan ubah kontrak
ini tanpa migrasi SQLite (scan_outbox.student_key) dan hasil historis.

## Audit port
- **Android:** UI Jetpack Compose, CameraX/OpenCV; engine geometri dan OCR
  tidak berubah. Hanya label administratif dan kontrak roster server.
- **Desktop Windows x64/Linux:** aplikasi Kotlin/JVM + WIA/NAPS2/SANE.
  Bukan binary 32-bit x86; installer bundled Java x64. Scanner/WIA yang
  menggunakan driver 32-bit dapat memerlukan bridge/perangkat tersendiri.
- **Web PWA:** pemrosesan OMR di JavaScript pada browser, backend Apps Script.
  Rute indeks dan service worker disimpan per subpath; tidak membuat
  perubahan koordinat form, statistik, atau data OCR.
- **Statistik:** `Statistik.gs` tidak mengubah rumus P, D, r-pbis, KR-20,
  SEM, dsb. `Laporan.gs` mendapatkan alias lama dari `rows_()` server.
- **Keamanan:** lisensi BTL1 dan validasi kepemilikan ujian tetap di server,
  tidak disimplifikasi.

## Diagnostik
- Semua siswa tak muncul: cek sheet Siswa!E/F dan Guru!E serta status lisensi.
- Siswa tertentu tak muncul: periksa Nama Rombel (mis. `8A`, bukan `A`);
  mode guru tingkat `8` memang mengizinkan seluruh rombel tingkat 8.
- Angka nilai keliru: periksa jumlah kunci ujian, bukan kapasitas LJK.
- Status scan/antrean hilang: cek cache dan SQLite, jangan hapus data APK.

