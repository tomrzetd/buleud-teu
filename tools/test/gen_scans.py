"""Generator hasil SCAN ADF sintetis (bukan foto HP): kertas rata, sedikit miring/bergeser saat ditarik feeder,
sebagian terbalik (tumpukan dimasukkan terbalik), mode abu-abu, DPI 150/200/300, JPEG/PNG/TIFF/PDF multi-halaman.
Output: tools/test/scans/<kelompok>/... + meta.json {kelompok: {kunci, opsi, halaman: [{label, jawaban}]}}
Pemakaian: python3 tools/test/gen_scans.py   (butuh render template: node tools/render_templates.js 200)
"""
import json, os, random, sys
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import gen_cases as G
OUT = os.path.join(HERE, 'scans')
PXMM = 200 / 25.4
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf'

def scan(page, dpi=200, skew=0.0, dx=0.0, dy=0.0, flip=False, gray=False, seed=0, bright=1.0):
    """page = gambar 200 dpi; hasil = pindaian F4 penuh pada dpi tertentu (latar putih feeder)."""
    rnd = np.random.default_rng(seed)
    h, w = page.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), skew, 1.0); M[0, 2] += dx * PXMM; M[1, 2] += dy * PXMM
    im = cv2.warpAffine(page, M, (w, h), flags=cv2.INTER_LINEAR, borderValue=(250, 250, 250))
    if dpi != 200: im = cv2.resize(im, (round(w * dpi / 200), round(h * dpi / 200)), interpolation=cv2.INTER_AREA)
    im = np.clip(im.astype(np.float32) * bright + rnd.normal(0, 2.5, im.shape), 0, 255).astype(np.uint8)
    if flip: im = cv2.rotate(im, cv2.ROTATE_180)
    if gray: im = cv2.cvtColor(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)
    return im

def pil(im): return Image.fromarray(cv2.cvtColor(im, cv2.COLOR_BGR2RGB))

def lama(n, ans, seed, ident):
    ax, bp = (26.85, 37.0) if n == 25 else (24.67, 50.52)
    rnd = random.Random(seed)
    img = cv2.imread(os.path.join(HERE, 'render', f'LJK_F4_LAMA{n}_200dpi.png'))
    for q, a in enumerate(ans):
        if a is None: continue
        x = (ax + (q // 5) * bp + a * 6.51) * PXMM + rnd.uniform(-1.5, 1.5); y = (86.3 + (q % 5) * 6.68) * PXMM + rnd.uniform(-1.5, 1.5)
        cv2.ellipse(img, (int(x), int(y)), (int(2.75 * PXMM * rnd.uniform(0.8, 0.95)), int(2.75 * PXMM * rnd.uniform(0.78, 0.92))), rnd.uniform(0, 180), 0, 360, (40, 40, 40), -1, cv2.LINE_AA)
    p = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)); d = ImageDraw.Draw(p); f = ImageFont.truetype(FONT, int(4.2 * PXMM))
    for t, y in zip(ident, [42.8, 48.4, 53.9, 59.5]): d.text((48 * PXMM, (y - 4.6) * PXMM), t, font=f, fill=(25, 30, 70))
    return cv2.cvtColor(np.array(p), cv2.COLOR_RGB2BGR)

def main():
    rnd = random.Random(7); meta = {}
    L4 = 'ABCD'
    # ---------- 1) LJK F4 bermarker, ujian 40 soal ABCD: PDF 3 halaman + TIFF 2 halaman (1 terbalik) + PNG abu-abu 150 dpi + JPG 300 dpi
    d = os.path.join(OUT, 'marker40'); os.makedirs(d, exist_ok=True)
    key = [rnd.randrange(4) for _ in range(40)]
    sheets = []
    names = [('IBNU BIN LADEN', '08101', '9A'), ('SITI AMINAH', '08102', '9A'), ('ASEP SURYANA', '08103', '9B'), ('DEDE KOMALA', '08104', '9B'),
             ('RINA MARLINA', '08105', '9A'), ('UJANG SOLIHIN', '08106', '9C'), ('NENG ELIS', '08107', '9C')]
    for i, (nm, no, kl) in enumerate(names):
        a = [k if rnd.random() < 0.7 else rnd.randrange(4) for k in key] + [None] * 10
        sheets.append((G.fill_sheet('ABCD', a, ident=dict(nama=nm, nomor=no, kelas=kl), seed=100 + i), ''.join(L4[x] for x in a[:40])))
    pages = []
    def add(label, exp): pages.append(dict(label=label, jawaban=exp))
    pdf = [pil(scan(sheets[i][0], 200, skew=rnd.uniform(-1.2, 1.2), dx=rnd.uniform(-2, 2), dy=rnd.uniform(-3, 3), seed=i)) for i in range(3)]
    pdf[0].save(os.path.join(d, 'adf_batch.pdf'), save_all=True, append_images=pdf[1:], resolution=200, quality=85)
    for i in range(3): add(f'adf_batch.pdf · hal {i + 1}', sheets[i][1])
    tif = [pil(scan(sheets[3][0], 200, skew=0.6, seed=3)), pil(scan(sheets[4][0], 200, skew=-0.8, flip=True, seed=4))]
    tif[0].save(os.path.join(d, 'adf_tiff.tif'), save_all=True, append_images=tif[1:], compression='tiff_lzw', dpi=(200, 200))
    add('adf_tiff.tif · hal 1', sheets[3][1]); add('adf_tiff.tif · hal 2', sheets[4][1])
    cv2.imwrite(os.path.join(d, 'hal_0006.png'), scan(sheets[5][0], 150, skew=1.5, gray=True, seed=5)); add('hal_0006.png', sheets[5][1])
    cv2.imwrite(os.path.join(d, 'hal_0007.jpg'), scan(sheets[6][0], 300, skew=-0.4, seed=6, bright=0.93), [cv2.IMWRITE_JPEG_QUALITY, 80]); add('hal_0007.jpg', sheets[6][1])
    meta['marker40'] = dict(kunci=''.join(L4[k] for k in key), opsi='ABCD', halaman=pages)
    # ---------- 2) LJK lama 25 soal: JPG + PNG terbalik + PDF 2 halaman
    for n in (25, 20):
        d = os.path.join(OUT, f'lama{n}'); os.makedirs(d, exist_ok=True)
        key = [rnd.randrange(4) for _ in range(n)]; pages = []
        sh = []
        for i in range(4):
            a = [k if rnd.random() < 0.7 else rnd.randrange(4) for k in key]
            sh.append((lama(n, a, 200 + i, ('0810%d' % i, names[i][0], names[i][2], 'IPA')), ''.join(L4[x] for x in a)))
        cv2.imwrite(os.path.join(d, 'scan_001.jpg'), scan(sh[0][0], 200, skew=0.9, seed=11), [cv2.IMWRITE_JPEG_QUALITY, 82]); pages.append(dict(label='scan_001.jpg', jawaban=sh[0][1]))
        cv2.imwrite(os.path.join(d, 'scan_002.png'), scan(sh[1][0], 200, skew=-1.1, flip=True, gray=True, seed=12)); pages.append(dict(label='scan_002.png', jawaban=sh[1][1]))
        pp = [pil(scan(sh[2][0], 200, skew=0.3, seed=13)), pil(scan(sh[3][0], 150, skew=-0.5, seed=14))]
        pp[0].save(os.path.join(d, 'scan_003.pdf'), save_all=True, append_images=pp[1:], resolution=200, quality=85)
        pages += [dict(label='scan_003.pdf · hal 1', jawaban=sh[2][1]), dict(label='scan_003.pdf · hal 2', jawaban=sh[3][1])]
        meta[f'lama{n}'] = dict(kunci=''.join(L4[k] for k in key), opsi='ABCD', halaman=pages)
    # ---------- 3) ScanSnap SV600 intermediary workflow (simulated export,
    # not hardware capture): JPEG and 2-page PDF saved by ScanSnap Home.
    # Confirms that the same OMR pipeline used by folder watcher reads these
    # formats/filenames. Actual SV600 imaging must be tested on the school PC.
    import shutil
    d = os.path.join(OUT, 'sv600_export'); os.makedirs(d, exist_ok=True)
    shutil.copyfile(os.path.join(OUT, 'lama25', 'scan_001.jpg'),
                    os.path.join(d, 'ScanSnapHome_SV600_001.jpg'))
    shutil.copyfile(os.path.join(OUT, 'lama25', 'scan_003.pdf'),
                    os.path.join(d, 'ScanSnapHome_SV600_002.pdf'))
    src = meta['lama25']
    meta['sv600_export'] = dict(
        kunci=src['kunci'], opsi=src['opsi'],
        halaman=[
            dict(label='ScanSnapHome_SV600_001.jpg', jawaban=src['halaman'][0]['jawaban']),
            dict(label='ScanSnapHome_SV600_002.pdf · hal 1', jawaban=src['halaman'][2]['jawaban']),
            dict(label='ScanSnapHome_SV600_002.pdf · hal 2', jawaban=src['halaman'][3]['jawaban'])
        ])
    json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print('ok', {k: len(v['halaman']) for k, v in meta.items()})

if __name__ == '__main__': main()
