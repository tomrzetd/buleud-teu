# OTA smoke test — build berurutan
Ini adalah catatan uji build rilis bertanda tangan; bukan source rahasia.

1. Build awal dari branch ini **v4.1.61** dengan tema Cerah/Gelap,
   pengaturan URL mirror sekolah, dan dialog pembaruan.
2. Build uji berikutnya (**v4.1.62** jika GitHub run_number terus naik 1)
   memakai source yang sama + catatan pengujian ini.
3. APK awal diinstal *menimpa* 4.1.57 tanpa uninstall.
4. Hanya APK dan manifest **build lebih baru** ditempatkan di server sekolah.
5. Buka Buleud Teu versi awal → tekan **Cek versi terbaru** → harus
   muncul dialog pemberitahuan versi baru → verifikasi SHA-256 + signer
   → instal melalui installer resmi Android.
6. Uji jaringan mati / URL Quick Tunnel berubah; fallback Github tetap
   ada. Jangan menghapus cache/data aplikasi saat sedang ada scan offline.
7. Pastikan nilai hasil scan dan login lama tetap ada setelah update.

Kunci release ditangani GitHub Actions dan **tidak** disimpan di repository.
Quick Tunnel tidak cocok sebagai alamat produksi permanen.
