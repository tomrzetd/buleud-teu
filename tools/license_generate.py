#!/usr/bin/env python3
"""Buleud Teu — pembuat lisensi sekolah bertanda tangan HMAC-SHA256.

Key pribadi HANYA disimpan di komputer operator dan Script Properties Apps Script.
JANGAN commit BT_LICENSE_HMAC_KEY atau berikan kepada APK / pengguna.
Contoh:
    python tools/license_generate.py init-secret
    set BT_LICENSE_HMAC_KEY=<secret_tersimpan_aman>
    python tools/license_generate.py issue --sheet-id 1abc... --tier school --days 365
    python tools/license_generate.py inspect '<kode>'
    python tools/license_generate.py verify '<kode>' --sheet-id 1abc...
"""
import argparse
import base64
import datetime as dt
import hashlib
import hmac
import json
import os
import secrets
import sys

PREFIX = "BTL1"
PRODUCT = "buleud-teu"
TZ = dt.timezone.utc


def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def unb64(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + ("=" * (-len(data) % 4)))


def secret() -> bytes:
    s = os.environ.get("BT_LICENSE_HMAC_KEY", "")
    if len(s) < 40:
        raise SystemExit("BT_LICENSE_HMAC_KEY tidak ditemukan atau terlalu pendek (min 40 karakter).")
    return s.encode("utf-8")


def encode(payload: dict, key: bytes) -> str:
    data = b64(json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    signing_input = f"{PREFIX}.{data}"
    sig = b64(hmac.new(key, signing_input.encode("utf-8"), hashlib.sha256).digest())
    return signing_input + "." + sig


def decode(token: str, key: bytes | None = None, expected_sid: str | None = None) -> dict:
    fields = token.strip().split(".")
    if len(fields) != 3 or fields[0] != PREFIX:
        raise ValueError("Format lisensi tidak dikenal")
    if key is not None:
        expect = b64(hmac.new(key, ".".join(fields[:2]).encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(fields[2], expect):
            raise ValueError("Tanda tangan lisensi tidak sah")
    payload = json.loads(unb64(fields[1]))
    if payload.get("v") != 1 or payload.get("product") != PRODUCT:
        raise ValueError("Produk/versi lisensi salah")
    if expected_sid and payload.get("sid") != expected_sid:
        raise ValueError("Lisensi untuk Spreadsheet yang berbeda")
    if key is not None:
        now = int(dt.datetime.now(TZ).timestamp())
        if int(payload.get("iat", 0)) > now + 300 or int(payload.get("exp", 0)) <= now:
            raise ValueError("Lisensi belum berlaku atau sudah kedaluwarsa")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Generator lisensi Buleud Teu — kunci rahasia hanya di operator/server")
    sub = parser.add_subparsers(dest="action", required=True)
    sub.add_parser("init-secret", help="Buat kunci HMAC 256-bit. Simpan ke secret manager / Script Properties.")
    issue = sub.add_parser("issue", help="Tandatangani lisensi untuk satu spreadsheet sekolah")
    issue.add_argument("--sheet-id", required=True)
    issue.add_argument("--tier", choices=("school", "pro"), default="school")
    issue.add_argument("--days", type=int, default=365)
    inspect = sub.add_parser("inspect", help="Lihat metadata kode tanpa validasi tanda tangan")
    inspect.add_argument("license")
    verify = sub.add_parser("verify", help="Periksa tanda tangan, spreadsheet, dan masa aktif")
    verify.add_argument("license")
    verify.add_argument("--sheet-id", required=True)
    a = parser.parse_args()
    if a.action == "init-secret":
        print(secrets.token_hex(32))
        print("Simpan rahasia ini di tempat aman, jangan di Git / APK.", file=sys.stderr)
    elif a.action == "issue":
        if a.days < 1 or a.days > 3650:
            parser.error("--days harus 1..3650")
        now = int(dt.datetime.now(TZ).timestamp())
        payload = {
            "v": 1, "product": PRODUCT, "sid": a.sheet_id.strip(), "tier": a.tier,
            "iat": now, "exp": now + a.days * 86400, "jti": secrets.token_hex(8),
        }
        print(encode(payload, secret()))
    elif a.action == "inspect":
        print(json.dumps(decode(a.license), indent=2))
        print("PERINGATAN: metadata belum memverifikasi tanda tangan", file=sys.stderr)
    elif a.action == "verify":
        print(json.dumps(decode(a.license, secret(), a.sheet_id), indent=2))
        print("VALID — tanda tangan, produk, Spreadsheet dan tanggal cocok.", file=sys.stderr)


if __name__ == "__main__":
    main()
