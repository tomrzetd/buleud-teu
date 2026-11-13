#!/usr/bin/env python3
"""Operator onboarding package must never expose signing secret/license to teachers."""
import datetime as dt
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import school_pack
import license_generate

SECRET = "test-only-never-use-in-production-" + "0123456789" * 4
SHEET = "1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
SCRIPT = "https://script.google.com/macros/s/AKfycbxDemoSchoolOnly123456/exec"

class PackageTest(unittest.TestCase):
    def test_private_and_public_separation(self):
        with tempfile.TemporaryDirectory() as d, patch.dict(os.environ, {"BT_LICENSE_HMAC_KEY": SECRET}):
            now = dt.datetime(2026, 11, 13, 16, 0, tzinfo=dt.timezone.utc)
            res = school_pack.make_package("SMP SEKOLAH CONTOH", SHEET, SCRIPT,
                 days=365, output=Path(d), clock=now)
            private = Path(res["private"]).read_text(encoding="utf8")
            self.assertIn("Lisensi: BTL1.", private)
            token = private.split("Lisensi: ", 1)[1].splitlines()[0]
            parsed = license_generate.decode(token, SECRET.encode(), SHEET)
            self.assertEqual(parsed["sid"], SHEET)
            self.assertEqual(parsed["tier"], "school")
            self.assertEqual(parsed["exp"] - parsed["iat"], 365*86400)
            with zipfile.ZipFile(res["teacher_package"]) as z:
                self.assertEqual(sorted(z.namelist()),
                  ["PANDUAN-GURU.txt", "konfigurasi-guru.json"])
                raw = b"\n".join(z.read(item) for item in z.namelist())
                self.assertNotIn(SECRET.encode(), raw)
                self.assertNotIn(SHEET.encode(), raw)
                self.assertNotIn(token.encode(), raw)
                c = json.loads(z.read("konfigurasi-guru.json"))
                self.assertEqual(c["scriptUrl"], SCRIPT)
                self.assertEqual(c["schoolName"], "SMP SEKOLAH CONTOH")
                self.assertNotIn("license", c)
            if os.name == "posix":
                self.assertEqual(Path(res["private"]).stat().st_mode & 0o777, 0o600)

    def test_no_key_fails_closed(self):
        with tempfile.TemporaryDirectory() as d, patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(SystemExit):
                school_pack.make_package("SMP CONTOH", SHEET, SCRIPT, output=Path(d))
            self.assertEqual(list(Path(d).iterdir()), [])

    def test_bad_url_and_id_rejected(self):
        with tempfile.TemporaryDirectory() as d, patch.dict(os.environ, {"BT_LICENSE_HMAC_KEY":SECRET}):
            for url in ["http://script.google.com/macros/s/abc/exec",
                        "https://evil.example.com/path",
                        "https://script.google.com/macros/s/test/edit"]:
                with self.assertRaises(ValueError):
                    school_pack.make_package("SMP", SHEET, url, output=Path(d))
            with self.assertRaises(ValueError):
                school_pack.make_package("SMP", "bad", SCRIPT, output=Path(d))
            self.assertEqual(list(Path(d).iterdir()), [])

if __name__ == "__main__":
    unittest.main(verbosity=2)
