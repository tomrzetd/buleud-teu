"""Generator foto uji LJK F4 (sintetis): isi jawaban + tulisan tangan, lalu simulasi kamera HP.
Output: tools/test/cases/<nama>.raw (RGBA) + .jpg + meta.json (kunci jawaban yang diharapkan).
Pemakaian: python3 tools/test/gen_cases.py
"""
import json, math, os, random
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'cases'); os.makedirs(OUT, exist_ok=True)
DPI = 200; PXMM = DPI / 25.4
SPEC = dict(x0=16, blockW=36.6, optOffset=11, optPitch=5.6, y0=116, rowPitch=8, rows=10, r=2.2)
IDENT = dict(nama=(52, 52, 26), nomor=(52, 63, 10), kelas=(150, 63, 6))
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf'

def bubble(q, o):
    b, r = q // SPEC['rows'], q % SPEC['rows']
    return SPEC['x0'] + b * SPEC['blockW'] + SPEC['optOffset'] + o * SPEC['optPitch'], SPEC['y0'] + r * SPEC['rowPitch']

def mm(v): return v * PXMM

def fill_sheet(variant, answers, marks=None, ident=None, seed=0):
    rnd = random.Random(seed)
    img = cv2.imread(os.path.join(HERE, 'render', f'LJK_F4_{variant}_{DPI}dpi.png'))
    marks = marks or {}
    for q, a in enumerate(answers):
        style = marks.get(q, 'fill')
        opts = [a] if isinstance(a, int) else (a or [])
        for o in opts:
            if o is None: continue
            x, y = bubble(q, o); cx, cy = mm(x) + rnd.uniform(-0.25, 0.25) * PXMM, mm(y) + rnd.uniform(-0.25, 0.25) * PXMM
            if style == 'fill':
                ax, ay = mm(SPEC['r']) * rnd.uniform(0.82, 1.05), mm(SPEC['r']) * rnd.uniform(0.80, 1.0)
                shade = rnd.randint(35, 75)
                cv2.ellipse(img, (int(cx), int(cy)), (int(ax), int(ay)), rnd.uniform(0, 180), 0, 360, (shade, shade, shade), -1, cv2.LINE_AA)
            elif style == 'x':
                d = mm(1.9)
                cv2.line(img, (int(cx - d), int(cy - d)), (int(cx + d), int(cy + d)), (30, 30, 40), 4, cv2.LINE_AA)
                cv2.line(img, (int(cx - d), int(cy + d)), (int(cx + d), int(cy - d)), (30, 30, 40), 4, cv2.LINE_AA)
            elif style == 'erased':
                cv2.ellipse(img, (int(cx), int(cy)), (int(mm(2.0)), int(mm(1.9))), 0, 0, 360, (188, 188, 188), -1, cv2.LINE_AA)
            elif style == 'faint':
                cv2.ellipse(img, (int(cx), int(cy)), (int(mm(2.0)), int(mm(1.9))), 0, 0, 360, (125, 125, 125), -1, cv2.LINE_AA)
    # pensil: tekstur
    noise = np.random.default_rng(seed).normal(0, 6, img.shape[:2]).astype(np.int16)
    img = np.clip(img.astype(np.int16) + noise[..., None], 0, 255).astype(np.uint8)
    if ident:
        pil = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)); dr = ImageDraw.Draw(pil)
        font = ImageFont.truetype(FONT, int(mm(5.0)))
        for key, text in ident.items():
            x0, y0, n = IDENT[key]
            for i, ch in enumerate(text[:n]):
                if ch == ' ': continue
                dr.text((mm(x0 + i * 5.6 + 1.0) + rnd.uniform(-2, 2), mm(y0 + 0.6) + rnd.uniform(-2, 2)), ch, font=font, fill=(25, 30, 70))
        img = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
    return img

def curl(img, amp_mm):
    if not amp_mm: return img
    h, w = img.shape[:2]
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    dy = (amp_mm * PXMM) * np.sin(np.pi * xs / w)            # kertas melengkung (cembung)
    dx = (amp_mm * PXMM * 0.3) * np.sin(np.pi * ys / h)
    return cv2.remap(img, xs + dx, ys - dy + amp_mm * PXMM * 0.5, cv2.INTER_LINEAR, borderValue=(255, 255, 255))

def photo(page, frame=(1080, 1920), fill=0.86, rot=0.0, persp=0.0, bg='wood', shade=0.0, blur=0, jpeg=85, noise=4, seed=0, curl_mm=0, flip=False, landscape=False):
    rnd = random.Random(seed)
    page = curl(page, curl_mm)
    if flip: page = cv2.rotate(page, cv2.ROTATE_180)
    fw, fh = frame
    if landscape: fw, fh = fh, fw
    ph, pw = page.shape[:2]
    if landscape: page = cv2.rotate(page, cv2.ROTATE_90_CLOCKWISE); ph, pw = page.shape[:2]
    s = min(fw / pw, fh / ph) * fill
    w, h = pw * s, ph * s
    cx, cy = fw / 2 + rnd.uniform(-0.03, 0.03) * fw, fh / 2 + rnd.uniform(-0.03, 0.03) * fh
    k = persp * w
    dst = np.float32([[cx - w / 2 + k, cy - h / 2], [cx + w / 2 - k, cy - h / 2], [cx + w / 2 + k * 0.3, cy + h / 2], [cx - w / 2 - k * 0.3, cy + h / 2]])
    src = np.float32([[0, 0], [pw, 0], [pw, ph], [0, ph]])
    M = cv2.getPerspectiveTransform(src, dst)
    R = np.vstack([cv2.getRotationMatrix2D((cx, cy), rot, 1), [0, 0, 1]])
    M = R @ M
    # latar
    if bg == 'wood':
        base = np.zeros((fh, fw, 3), np.uint8); base[:] = (60, 95, 140)
        stripes = (np.sin(np.linspace(0, 60, fw))[None, :] * 18).astype(np.int16)
        base = np.clip(base.astype(np.int16) + stripes[..., None], 0, 255).astype(np.uint8)
    elif bg == 'dark':
        base = np.full((fh, fw, 3), 28, np.uint8)
        for _ in range(40):  # benda-benda gelap/kotak (keyboard dsb)
            x, y = rnd.randint(0, fw), rnd.randint(0, fh); sz = rnd.randint(20, 80)
            cv2.rectangle(base, (x, y), (x + sz, y + sz), (rnd.randint(0, 20),) * 3, -1)
    else:
        base = np.full((fh, fw, 3), 200, np.uint8)
    warped = cv2.warpPerspective(page, M, (fw, fh), flags=cv2.INTER_AREA)
    mask = cv2.warpPerspective(np.full(page.shape[:2], 255, np.uint8), M, (fw, fh))
    out = base.copy(); out[mask > 0] = warped[mask > 0]
    if shade:
        g = np.linspace(1.0, 1.0 - shade, fw)[None, :, None] * np.linspace(1.0, 1.0 - shade * 0.4, fh)[:, None, None]
        out = (out * g).astype(np.uint8)
        # bayangan HP: elips gelap lembut
        sh = np.ones((fh, fw), np.float32); cv2.ellipse(sh, (int(fw * 0.7), int(fh * 0.25)), (int(fw * 0.25), int(fh * 0.12)), 20, 0, 360, 1 - shade * 0.6, -1)
        sh = cv2.GaussianBlur(sh, (0, 0), fw * 0.04); out = (out * sh[..., None]).astype(np.uint8)
    if blur: out = cv2.GaussianBlur(out, (0, 0), blur)
    if noise: out = np.clip(out.astype(np.int16) + np.random.default_rng(seed).normal(0, noise, out.shape).astype(np.int16), 0, 255).astype(np.uint8)
    out = cv2.imdecode(cv2.imencode('.jpg', out, [cv2.IMWRITE_JPEG_QUALITY, jpeg])[1], 1)
    return out

def main():
    rnd = random.Random(42)
    LET = 'ABCDE'
    cases = []
    def add(name, variant, nopt, active, answers_idx, img, expect=None, flags=None):
        exp = expect if expect is not None else ''.join(LET[a] if isinstance(a, int) else '-' for a in answers_idx[:active])
        fn = os.path.join(OUT, name + '.raw')
        cv2.cvtColor(img, cv2.COLOR_BGR2RGBA).tofile(fn); cv2.imwrite(os.path.join(OUT, name + '.jpg'), img, [cv2.IMWRITE_JPEG_QUALITY, 80])
        cases.append(dict(name=name, file=fn, w=img.shape[1], h=img.shape[0], variant=variant, options=nopt, active=active, expect=exp, flags=flags or {}))

    ident = dict(nama='IBNU BIN LADEN', nomor='08101', kelas='9A')
    A5 = [rnd.randrange(5) for _ in range(50)]
    A4 = [rnd.randrange(4) for _ in range(50)]
    p5 = fill_sheet('ABCDE', A5, ident=ident, seed=1)
    p4 = fill_sheet('ABCD', A4, ident=ident, seed=2)
    add('01_ideal_ABCDE', 'ABCDE', 5, 50, A5, photo(p5, seed=1))
    add('02_ideal_ABCD', 'ABCD', 4, 50, A4, photo(p4, seed=2))
    add('03_miring_12', 'ABCDE', 5, 50, A5, photo(p5, rot=12, fill=0.8, seed=3))
    add('04_perspektif_kuat', 'ABCDE', 5, 50, A5, photo(p5, persp=0.09, seed=4))
    add('05_terbalik_180', 'ABCDE', 5, 50, A5, photo(p5, flip=True, seed=5))
    add('06_landscape_90', 'ABCD', 4, 50, A4, photo(p4, landscape=True, fill=0.95, seed=6))
    add('07_kertas_melengkung', 'ABCDE', 5, 50, A5, photo(p5, curl_mm=4, persp=0.03, seed=7))
    add('08_bayangan', 'ABCDE', 5, 50, A5, photo(p5, shade=0.5, seed=8))
    add('09_latar_gelap_benda', 'ABCD', 4, 50, A4, photo(p4, bg='dark', fill=0.7, rot=-6, seed=9))
    add('10_jauh_kecil', 'ABCDE', 5, 50, A5, photo(p5, fill=0.55, seed=10))
    add('11_buram_jpeg', 'ABCDE', 5, 50, A5, photo(p5, blur=1.6, jpeg=45, seed=11))
    add('12_hp_4k', 'ABCDE', 5, 50, A5, photo(p5, frame=(3000, 4000), rot=3, persp=0.03, seed=12))
    add('13_kombinasi_berat', 'ABCDE', 5, 50, A5, photo(p5, rot=-9, persp=0.06, shade=0.45, curl_mm=3, blur=1.0, jpeg=60, bg='dark', fill=0.75, seed=13))
    # soal aktif 30 (sisa 20 dikosongkan siswa)
    A30 = A4[:30] + [None] * 20
    add('14_aktif_30_soal', 'ABCD', 4, 30, A30, photo(fill_sheet('ABCD', A30, ident=ident, seed=14), seed=14))
    # tanda silang, ganda, hapusan, tipis, kosong
    marks = {3: 'x', 7: 'x', 21: 'x'}
    AX = list(A5); AX[10] = [1, 3]; AX[15] = None; AX[40] = None
    pX = fill_sheet('ABCDE', AX, marks=marks, ident=ident, seed=15)
    # hapusan di soal 25 (opsi lain), tipis di soal 33
    pX2 = fill_sheet('ABCDE', [None] * 25 + [(A5[25] + 2) % 5] + [None] * 24, marks={25: 'erased'}, seed=16)
    pX = np.minimum(pX, pX2)
    exp = ''.join('-' if (a is None or isinstance(a, list)) else LET[a] for a in AX)
    add('15_silang_ganda_hapus', 'ABCDE', 5, 50, AX, photo(pX, seed=15), expect=exp, flags={'double': [11], 'blank': [16, 41]})
    add('16_varian_salah_ABCDE_diatur_ABCD', 'ABCD', 4, 50, [a if a < 4 else None for a in A5], photo(p5, seed=17), flags={'warnVariant': True})
    json.dump(cases, open(os.path.join(OUT, 'meta.json'), 'w'), indent=1)
    print(len(cases), 'kasus dibuat')

if __name__ == '__main__':
    main()
