#!/usr/bin/env python3
"""Write immutable OTA manifest from the APK that was actually signed in CI.

The manifest is not itself a cryptographic signature; APK update code must
verify SHA-256 and the Android package signing identity before installation.
"""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import re

CERT = re.compile(r"^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$")
REPO = "tomrzetd/buleud-teu"


def create_manifest(apk: Path, version_name: str, version_code: int,
                    cert: str, channel: str = "stable") -> dict:
    if not apk.is_file() or apk.stat().st_size < 1000:
        raise ValueError("APK hasil build tidak ditemukan atau terlalu kecil")
    if not re.fullmatch(r"\d+\.\d+\.\d+", version_name):
        raise ValueError("versionName bukan semver tiga angka")
    if not (version_code > 1000):
        raise ValueError("versionCode harus lebih besar dari 1000")
    if channel not in ("stable", "beta"):
        raise ValueError("channel harus stable atau beta")
    if not CERT.fullmatch(cert):
        raise ValueError("SHA-256 sertifikat harus 32 byte uppercase dengan separator ':'")
    tag = "v" + version_name
    h = hashlib.sha256()
    with apk.open("rb") as f:
        while True:
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return {
        "schema": 1, "product": "buleud-teu", "channel": channel,
        "packageName": "id.buleudteu.ljk", "versionName": version_name,
        "versionCode": version_code, "minSdk": 24,
        "certSha256": cert,
        "apk": {
            "url": f"https://github.com/{REPO}/releases/download/{tag}/BuleudTeu.apk",
            "sha256": h.hexdigest(), "sizeBytes": apk.stat().st_size
        },
        "publishedAt": dt.datetime.now(dt.timezone.utc).isoformat()
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--apk", required=True, type=Path)
    p.add_argument("--version-name", required=True)
    p.add_argument("--version-code", required=True, type=int)
    p.add_argument("--cert-sha256", required=True)
    p.add_argument("--channel", choices=("stable", "beta"), default="stable")
    p.add_argument("--output", required=True, type=Path)
    a = p.parse_args()
    out = create_manifest(a.apk, a.version_name, a.version_code,
                          a.cert_sha256, a.channel)
    a.output.parent.mkdir(parents=True, exist_ok=True)
    a.output.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("Manifest ready:", a.output.name, out["versionName"], out["apk"]["sha256"][:12])


if __name__ == "__main__":
    main()
