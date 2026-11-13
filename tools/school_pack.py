#!/usr/bin/env python3
"""Paket aktivasi Buleud Teu untuk operator sekolah (offline, tanpa layanan pihak ketiga).

PENTING:
  - BT_LICENSE_HMAC_KEY dibaca dari environment, tidak dari CLI/source.
  - File lisensi PRIVAT untuk operator; arsip guru TIDAK berisi kode lisensi,
    Spreadsheet ID, token login, PIN, atau secret.
  - Belum menyalin Spreadsheet/deploy Apps Script: dibutuhkan OAuth Google.
  - Tidak memublikasikan ke GitHub; seluruh output dibuat di komputer operator.

Contoh:
    python tools/school_pack.py --school "SMP CONTOH" \
      --sheet-id SPREADSHEET_ID --script-url "https://script.google.com/macros/s/.../exec" \
      --days 365 --tier school --output dist/schools
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import sys
import zipfile

from license_generate import PREFIX, PRODUCT, encode, secret

URL_PATTERN = re.compile(r"^https://script\.google\.com/macros/s/[A-Za-z0-9_-]+/exec$")
SHEET_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{20,}$")
RELEASE_APK = "https://github.com/tomrzetd/buleud-teu/releases/latest/download/BuleudTeu.apk"
WEB_PWA = "https://tomrzetd.github.io/buleud-teu/"


def sanitize_name(s: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", s.casefold()).strip("-")
    return slug[:42] or "sekolah"


def write_private(path: Path, content: str):
    # Secret stays local with restricted POSIX permissions. Windows relies
    # on normal user's local file ACL; operator should lock their profile.
    flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY
    fd = os.open(path, flags, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(content)


def make_package(school: str, sheet_id: str, script_url: str,
                 tier: str = "school", days: int = 365,
                 output: Path = Path("dist/schools"), clock=None) -> dict:
    school = school.strip()
    sheet_id = sheet_id.strip()
    script_url = script_url.strip()
    if not school or len(school) > 140 or any(ord(c) < 32 for c in school):
        raise ValueError("Nama sekolah wajib 1–140 karakter tanpa control character")
    if not SHEET_ID_PATTERN.fullmatch(sheet_id):
        raise ValueError("Spreadsheet ID tidak sah. Gunakan ID, bukan URL.")
    if not URL_PATTERN.fullmatch(script_url):
        raise ValueError("URL Apps Script harus HTTPS /macros/s/.../exec (bukan URL editor).")
    if tier not in {"school", "pro"} or not (1 <= days <= 3650):
        raise ValueError("Tier atau masa lisensi tidak sah")

    # Signing operation happens only on the operator's machine.
    key = secret()
    now = clock or dt.datetime.now(dt.timezone.utc)
    issued = int(now.timestamp())
    payload = {"v": 1, "product": PRODUCT, "sid": sheet_id, "tier": tier,
               "iat": issued, "exp": issued + days * 86400, "jti": secrets.token_hex(8)}
    signed = encode(payload, key)
    nonce = secrets.token_hex(3)
    folder = output / f"{sanitize_name(school)}-{now.strftime('%Y%m%d')}-{nonce}"
    folder.mkdir(parents=True, exist_ok=False)
    private = folder / "OPERATOR-RAHASIA.txt"
    public = folder / "PANDUAN-GURU.txt"
    config = folder / "konfigurasi-guru.json"
    archive = folder / "PAKET-GURU.zip"
    expires = dt.datetime.fromtimestamp(payload["exp"], dt.timezone.utc).strftime("%Y-%m-%d")

    write_private(private,
        "KHUSUS OPERATOR — jangan dibagikan ke guru, grup WA, GitHub, atau siswa.\n"
        f"Nama sekolah: {school}\nSpreadsheet ID: {sheet_id}\n"
        f"Lisensi: {signed}\nBerakhir (UTC): {expires}\n"
        "Tempel LISENSI di tab Sekolah!B10 sebagai teks.\n"
        "BT_LICENSE_HMAC_KEY yang SAMA harus tersedia di Apps Script > Script Properties.\n"
        "Rahasia HMAC asli tidak disalin ke paket ini.\n"
        "Deploy Apps Script terbaru pada URL yang sama sebelum aktivasi.\n")

    config_data = {"schema": 1, "product": "buleud-teu", "schoolName": school,
                   "scriptUrl": script_url, "webPwa": WEB_PWA, "androidApk": RELEASE_APK}
    config.write_text(json.dumps(config_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    public.write_text(
        f"BUKU PANDUAN SINGKAT GURU — {school}\n\n"
        "1. Instal APK resmi dari tautan ini (Android):\n"
        f"   {RELEASE_APK}\n"
        "2. Atau buka PWA di browser:\n"
        f"   {WEB_PWA}\n"
        "3. Saat penyiapan awal, tempel URL server sekolah berikut:\n"
        f"   {script_url}\n"
        "4. Pilih akun guru sesuai daftar sekolah, lalu login dengan PIN yang diberikan operator\n"
        "   secara privat. Jangan tulis PIN siswa/guru dalam grup.\n"
        "5. Saat kembali dari scan, tunggu hasil tertunda di HP menjadi 0 sebelum\n"
        "   hapus aplikasi, mengganti perangkat, atau membersihkan data.\n"
        "6. Update APK hanya dari rilis resmi. Jangan gunakan file debug.\n"
        "Bila server sibuk, hasil scan yang sudah disimpan secara lokal akan diunggah otomatis.\n",
        encoding="utf-8")

    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as z:
        z.write(public, public.name)
        z.write(config, config.name)

    # Critical audit: no private token or spreadsheet ID in teacher package.
    assert signed not in archive.read_bytes()
    assert sheet_id.encode("utf-8") not in archive.read_bytes()
    return {"folder": str(folder), "private": str(private),
            "teacher_package": str(archive), "expires": expires,
            "license_prefix": PREFIX}


def main():
    p = argparse.ArgumentParser(description="Buat paket aktivasi sekolah Buleud Teu dan ZIP panduan guru")
    p.add_argument("--school", required=True, help="Nama sekolah")
    p.add_argument("--sheet-id", required=True, help="ID Spreadsheet sekolah")
    p.add_argument("--script-url", required=True, help="URL Apps Script sekolah (/exec)")
    p.add_argument("--tier", choices=("school", "pro"), default="school")
    p.add_argument("--days", type=int, default=365)
    p.add_argument("--output", type=Path, default=Path("dist/schools"))
    a = p.parse_args()
    try:
        result = make_package(a.school, a.sheet_id, a.script_url, a.tier, a.days, a.output)
    except (ValueError, OSError) as e:
        p.error(str(e))
    # Never echo full license, raw signing key or student credentials on stdout.
    print(json.dumps(result, indent=2, ensure_ascii=False))
    print("PENTING: OPERATOR-RAHASIA.txt jangan dibagikan. ZIP boleh dibagikan ke guru.")


if __name__ == "__main__":
    main()
