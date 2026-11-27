"""Kasus uji LJK percetakan 25 soal (F4-25-SMPN2): isi bulatan ala pensil/pulpen, lalu variasi scan/foto
(putar, perspektif, resolusi rendah, buram, redup, bayangan).
Pemakaian: python3 gen_percetakan.py <scan_kosong.png | sintetis> <folder_keluar>
  'sintetis' = lembar tiruan digambar dari spec/ljk-f4-25-smpn2.json (dipakai CI; scan asli guru tidak disimpan di repo)."""
import sys, os, json, random
import cv2, numpy as np
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
def sintetis():
    sp = json.load(open(os.path.join(os.path.dirname(__file__), '..', '..', 'spec', 'ljk-f4-25-smpn2.json')))['spec']
    K = 8; W, H = int(sp['page']['w'] * K), int(sp['page']['h'] * K)
    im = np.full((H, W, 3), 246, np.uint8)
    P = lambda u, v: (int(round(u * K)), int(round(v * K)))
    def sq(c, size, col=60):
        h = size / 2; cv2.rectangle(im, P(c[0] - h, c[1] - h), P(c[0] + h, c[1] + h), (col, col, col), -1)
    M = sp['markers']
    for c in M['corner']['centers']: sq(c, M['corner']['size'])
    for c in M['mid']['centers']: sq(c, M['mid']['size'])
    sq(M['orient']['center'], M['orient']['size'])
    g = sp['pg']; f = g['frame']
    cv2.rectangle(im, P(f[0], f[1]), P(f[2], f[3]), (30, 30, 30), 2)
    for b in range(g['blocks']):
        for r in range(g['rows']):
            q = b * g['rows'] + r; y = g['y0'] + r * g['rowPitch']
            cv2.putText(im, f"{q + 1}.", P(g['x0'] + b * g['blockW'] + 2, y + 1.6), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (40, 40, 40), 2, cv2.LINE_AA)
            for o in range(4):
                x = g['x0'] + b * g['blockW'] + g['optOffset'] + o * g['optPitch']
                cv2.circle(im, P(x, y), int(g['r'] * K), (40, 40, 40), 2, cv2.LINE_AA)
                cv2.putText(im, 'ABCD'[o], P(x - 0.9, y + 0.9), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (40, 40, 40), 1, cv2.LINE_AA)
        if b: cv2.line(im, P(g['x0'] + b * g['blockW'] - 1, f[1] + 3), P(g['x0'] + b * g['blockW'] - 1, f[3] - 3), (30, 30, 30), 3)
    for k in ('nama', 'nomor', 'kelas'):
        c = sp['ident'][k]
        for i in range(c['n'] + 1): cv2.line(im, P(c['x'] + i * c['cw'], c['y']), P(c['x'] + i * c['cw'], c['y'] + c['h']), (30, 30, 30), 2)
        cv2.rectangle(im, P(c['x'], c['y']), P(c['x'] + c['n'] * c['cw'], c['y'] + c['h']), (30, 30, 30), 2)
    # kop: kotak gelap & QR tiruan (pengganggu deteksi marker)
    cv2.rectangle(im, P(30, 24), P(43, 40), (70, 70, 70), -1)
    rnd0 = np.random.RandomState(3)
    for i in range(12):
        for j in range(12):
            if rnd0.rand() < 0.5: cv2.rectangle(im, P(178 + i * 1.3, 24 + j * 1.3), P(178 + (i + 1) * 1.3, 24 + (j + 1) * 1.3), (20, 20, 20), -1)
    for y in range(175, 300, 7): cv2.line(im, P(22, y), P(193, y), (120, 120, 120), 1)
    return im
base = sintetis() if src == 'sintetis' else cv2.imread(src)
g = cv2.cvtColor(base, cv2.COLOR_BGR2GRAY)
# pusat marker sudut (px) -> homografi mm->px
def squares(g):
    th = cv2.adaptiveThreshold(g, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 151, 22)
    n, l, st, cen = cv2.connectedComponentsWithStats(th)
    S = []
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if 35 < w < 110 and 35 < h < 110 and a > 0.75 * w * h and 0.75 < w / h < 1.33: S.append((cen[i][0], cen[i][1], w * h))
    return S
S = squares(g)
H0, W0 = g.shape
def near(px, py): return min(S, key=lambda s: (s[0] - px) ** 2 + (s[1] - py) ** 2)
corners_px = [near(0, 0), near(W0, 0), near(W0, H0), near(0, H0)]
mm = np.float32([[10, 16], [205, 16], [205, 314], [10, 314]])
Hm = cv2.getPerspectiveTransform(mm, np.float32([c[:2] for c in corners_px]))
def px(u, v): p = Hm @ [u, v, 1]; return p[0] / p[2], p[1] / p[2]
pxmm = np.hypot(*(np.subtract(px(205, 16), px(10, 16)))) / 195
def bub(q, o):
    b, r = q // 5, q % 5
    return px(24 + b * 33.47 + 11.44 + o * 5.25, 130.57 + r * 6.72)
L = 'ABCD'
meta = []
rnd = random.Random(7)
def fill(img, q, o, kind):
    x, y = bub(q, o); r = 2.0 * pxmm
    c = (int(round(x)), int(round(y)))
    if kind == 'pensil':
        cv2.ellipse(img, c, (int(r * 0.95), int(r * 0.85)), rnd.uniform(0, 180), 0, 360, (70, 70, 70), -1, cv2.LINE_AA)
        # tekstur goresan
        for _ in range(12):
            a = rnd.uniform(0, np.pi); d = r * 0.9
            cv2.line(img, (int(x - d * np.cos(a)), int(y - d * np.sin(a))), (int(x + d * np.cos(a)), int(y + d * np.sin(a))), (40, 40, 40), 1, cv2.LINE_AA)
    elif kind == 'pulpen':
        cv2.circle(img, c, int(r * 0.9), (120, 40, 20), -1, cv2.LINE_AA)
    elif kind == 'tipis':   # diarsir kurang penuh
        cv2.ellipse(img, (c[0] + 1, c[1]), (int(r * 0.7), int(r * 0.6)), 30, 0, 360, (110, 110, 110), -1, cv2.LINE_AA)
def make(name, kind='pensil', blanks=(), double=()):
    img = base.copy(); key = ''
    for q in range(25):
        if q in blanks: key += '-'; continue
        o = rnd.randrange(4); fill(img, q, o, kind)
        if q in double: fill(img, q, (o + 2) % 4, kind); key += '*'
        else: key += L[o]
    return img, key
def save(name, img, key, note=''):
    f = os.path.join(out, name + '.rgba')
    rgba = cv2.cvtColor(img, cv2.COLOR_BGR2RGBA)
    open(f, 'wb').write(rgba.tobytes())
    cv2.imwrite(os.path.join(out, name + '.jpg'), img, [cv2.IMWRITE_JPEG_QUALITY, 80])
    meta.append({'name': name, 'file': f, 'w': img.shape[1], 'h': img.shape[0], 'expect': key, 'note': note})
def persp(img, k):
    h, w = img.shape[:2]
    s = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    d = np.float32([[w * k, h * 0.02], [w * (1 - k * 0.4), 0], [w, h], [0, h * (1 - k * 0.3)]])
    M = cv2.getPerspectiveTransform(s, d)
    return cv2.warpPerspective(img, M, (w, h), borderValue=(90, 80, 70))
def rot(img, deg):
    h, w = img.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), deg, 1)
    c, s_ = abs(M[0, 0]), abs(M[0, 1]); nw, nh = int(h * s_ + w * c), int(h * c + w * s_)
    M[0, 2] += nw / 2 - w / 2; M[1, 2] += nh / 2 - h / 2
    return cv2.warpAffine(img, M, (nw, nh), borderValue=(90, 80, 70))
def shadow(img):
    h, w = img.shape[:2]; X = np.linspace(0.55, 1.0, w)[None, :, None]
    return np.clip(img * X, 0, 255).astype(np.uint8)
img, k = make('scan_pensil'); save('scan_pensil', img, k, 'scan 200 dpi, pensil')
img, k = make('scan_pulpen', 'pulpen'); save('scan_pulpen', img, k, 'pulpen biru')
img, k = make('scan_kosong_ganda', blanks=(3, 11, 24), double=(7, 18)); save('scan_kosong_ganda', img, k, 'ada kosong & ganda')
img, k = make('tipis', 'tipis'); save('tipis', img, k, 'arsiran tipis')
img, k = make('terbalik'); save('terbalik', cv2.rotate(img, cv2.ROTATE_180), k, 'masuk feeder terbalik')
img, k = make('miring4'); save('miring4', rot(img, 4), k, 'miring 4 derajat')
img, k = make('foto_perspektif'); save('foto_perspektif', persp(img, 0.08), k, 'foto HP miring')
img, k = make('foto_kecil'); save('foto_kecil', cv2.resize(persp(img, 0.05), None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA), k, 'resolusi rendah ~4 px/mm')
img, k = make('buram'); save('buram', cv2.GaussianBlur(img, (0, 0), 2.2), k, 'buram')
img, k = make('bayangan'); save('bayangan', shadow(persp(img, 0.04)), k, 'bayangan sisi kiri')
img, k = make('potong_bawah'); cut = int(px(10, 300)[1]); save('potong_bawah', img[:cut].copy(), k, 'kotak bawah terpotong saat pemotongan kertas')
img, k = make('potong_foto'); save('potong_foto', persp(img[:int(px(10, 300)[1])].copy(), 0.05), k, 'kotak bawah terpotong + foto miring')
img, k = make('landscape'); save('landscape', cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE), k, 'diputar 90')
json.dump(meta, open(os.path.join(out, 'meta.json'), 'w'), indent=1)
print(len(meta), 'kasus;', 'px/mm', round(pxmm, 2), 'marker', [tuple(round(v) for v in c[:2]) for c in corners_px])
