"""Uji Buleud Teu Desktop (mode --batch, tanpa jaringan) pada hasil scan ADF sintetis (gen_scans.py).
Perintah aplikasi: env BT_DESKTOP (mis. desktop/build/install/buleud-teu-desktop/bin/buleud-teu-desktop),
bawaan: java -cp $(cat /tmp/bt-cp) id.buleudteu.desktop.MainKt
"""
import json, os, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__)); SC = os.path.join(HERE, 'scans')
cmd = [os.path.normpath(os.environ['BT_DESKTOP'])] if os.environ.get('BT_DESKTOP') else ['java', '-cp', open('/tmp/bt-cp').read().strip(), 'id.buleudteu.desktop.MainKt']
# Verify the SV600 operator path exists even though the CI runner has no scanner.
listing = subprocess.run(cmd + ['--list-scanners'], capture_output=True, text=True, timeout=100)
assert listing.returncode == 0 and 'sv600' in listing.stdout.lower() and 'ScanSnap SV600' in listing.stdout, (
    'Mode ScanSnap Home SV600 tidak ditemukan dalam desktop scanner list: ' + listing.stdout[-400:])
meta = json.load(open(os.path.join(SC, 'meta.json'), encoding='utf-8'))
ok = tot = 0
for grp, m in meta.items():
    out = tempfile.mktemp(suffix='.json')
    r = subprocess.run(cmd + ['--batch', os.path.join(SC, grp), '--kunci', m['kunci'], '--opsi', m['opsi'], '--json', out], capture_output=True, text=True)
    if r.returncode not in (0, 1) or not os.path.exists(out): print(r.stdout, r.stderr); sys.exit(2)
    got = {x['halaman']: x for x in json.load(open(out, encoding='utf-8'))}
    for p in m['halaman']:
        tot += 1; g = got.get(p['label'])
        good = g is not None and g['ok'] and g['jawaban'][:len(m['kunci'])] == p['jawaban']
        ok += good
        print('✓' if good else '✗', grp.ljust(9), p['label'].ljust(26), (g['mode'] + '/' + str(int(g['soal'])) + ' skor ' + str(g['skor'])) if g and g['ok'] else ('GAGAL ' + str(g and g['error'])), '' if good else '\n   harap ' + p['jawaban'] + '\n   dapat ' + str(g and g['jawaban']))
print(f'Desktop batch (ADF + ekspor ScanSnap Home sintetis): {ok}/{tot}')
sys.exit(0 if ok == tot else 1)
