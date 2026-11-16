#!/usr/bin/env python3
"""Regression for F4-25 PRINTSHOP scan geometry, fully synthetic; no student PII."""
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from PIL import Image, ImageDraw

EXPECTED = "DB-CBABBBCABDBAABCBAABCBA"
assert len(EXPECTED) == 25

def fixture(path: Path):
    # 200 dpi F4, same fixed corner/mid/orientation markers as canonical spec.
    k = 200 / 25.4
    im = Image.new("RGB", (round(215*k), round(330*k)), "white")
    draw = ImageDraw.Draw(im)
    def square(x, y, d):
        draw.rectangle(((x-d/2)*k, (y-d/2)*k, (x+d/2)*k, (y+d/2)*k), fill="black")
    for x,y in [(10,10),(205,10),(205,320),(10,320)]: square(x,y,8)
    for x,y in [(8.5,165),(206.5,165)]: square(x,y,6)
    square(19,8,4)
    for q in range(25):
        for oi, letter in enumerate("ABCD"):
            x = 24.5 + (q // 5)*34.1 + 11 + oi*5.3
            y = 137 + (q % 5)*6.65
            radius = 2.0
            bounds = ((x-radius)*k,(y-radius)*k,(x+radius)*k,(y+radius)*k)
            is_marked = EXPECTED[q] == letter or (q == 2 and letter in "BD")
            if is_marked:
                draw.ellipse(bounds, fill=(16,16,16))
            else:
                draw.ellipse(bounds, outline=(16,16,16), width=3)
    im.save(path)

def main():
    exe = sys.argv[1] if len(sys.argv) > 1 else "desktop/build/install/buleud-teu-desktop/bin/buleud-teu-desktop"
    with tempfile.TemporaryDirectory(prefix="bt-printshop-fixture-") as d:
        picture = Path(d) / "synthetic-printshop25.png"
        fixture(picture)
        env = os.environ.copy()
        env["JAVA_TOOL_OPTIONS"] = "-Djava.awt.headless=true"
        completed = subprocess.run([exe, "--batch", str(picture), "--kunci", "A"*25, "--opsi", "ABCD"],
                                   text=True, capture_output=True, encoding="utf-8", errors="replace",
                                   env=env, timeout=65)
        msg = completed.stdout + completed.stderr
        assert completed.returncode == 0, msg
        assert "marker/25" in msg, msg
        assert EXPECTED in msg, "Wrong positions or double bubble not withheld: " + msg
        print("PASS: printshop F4-25 geometry, 24 unambiguous marks, q3 double withheld.")

if __name__ == "__main__":
    main()
