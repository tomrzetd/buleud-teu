import hashlib
import os
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from release_manifest import create_manifest

class ReleaseManifestTest(unittest.TestCase):
    def test_digest_version_and_url(self):
        with tempfile.TemporaryDirectory() as d:
            apk = Path(d)/"BuleudTeu.apk"
            payload = b"APKTEST" * 1000
            apk.write_bytes(payload)
            cert = "AB:" * 31 + "AB"
            obj = create_manifest(apk, "4.1.135", 1135, cert)
            self.assertEqual(obj["packageName"], "id.buleudteu.ljk")
            self.assertEqual(obj["versionCode"], 1135)
            self.assertEqual(obj["apk"]["sizeBytes"], len(payload))
            self.assertEqual(obj["apk"]["sha256"], hashlib.sha256(payload).hexdigest())
            self.assertTrue(obj["apk"]["url"].endswith("/v4.1.135/BuleudTeu.apk"))
            self.assertEqual(obj["certSha256"], cert)

    def test_rejects_invalid_metadata(self):
        with tempfile.TemporaryDirectory() as d:
            apk = Path(d)/"x.apk"; apk.write_bytes(b"x"*1200)
            c = "AB:" * 31 + "AB"
            for ver, code, cert in [("v1",1200,c),("4.1.1",1000,c),("4.1.1",1200,"bad")]:
                with self.assertRaises(ValueError):
                    create_manifest(apk,ver,code,cert)
            with self.assertRaises(ValueError):
                create_manifest(Path(d)/"absent.apk","4.1.1",1001,c)

if __name__ == "__main__":
    unittest.main(verbosity=2)
