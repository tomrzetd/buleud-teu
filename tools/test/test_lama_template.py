"""Uji template LJK F4 tanpa marker (20 / 25 soal; argumen: 20|25): isi, foto sintetis, baca dengan engine tanpa marker (+ arah otomatis)."""
import os, sys, json, random, subprocess
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import gen_cases as G   # memakai fungsi photo() yang sama dengan uji F4
PXMM = 200 / 25.4
N = int(sys.argv[1]) if len(sys.argv) > 1 else 20
AX, BP, OP, Y0, RP, R = (26.85, 37.0, 6.51, 86.3, 6.68, 2.75) if N == 25 else (24.67, 50.52, 6.51, 86.3, 6.68, 2.75)
OUT = os.path.join(HERE, 'cases_lama%d' % N); os.makedirs(OUT, exist_ok=True)

def fill(ans, seed):
    rnd = random.Random(seed)
    img = cv2.imread(os.path.join(HERE, 'render', 'LJK_F4_LAMA%d_200dpi.png' % N))
    for q, a in enumerate(ans):
        if a is None: continue
        x = (AX + (q // 5) * BP + a * OP) * PXMM + rnd.uniform(-1.5, 1.5); y = (Y0 + (q % 5) * RP) * PXMM + rnd.uniform(-1.5, 1.5)
        cv2.ellipse(img, (int(x), int(y)), (int(R * PXMM * rnd.uniform(0.8, 0.95)), int(R * PXMM * rnd.uniform(0.78, 0.92))), rnd.uniform(0, 180), 0, 360, (40, 40, 40), -1, cv2.LINE_AA)
    pil = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)); d = ImageDraw.Draw(pil)
    f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf', int(4.2 * PXMM))
    for t, y in [('08 101', 42.8), ('IBNU BIN LADEN', 48.4), ('7F', 53.9), ('IPA', 59.5)]:
        d.text((48 * PXMM, (y - 4.6) * PXMM), t, font=f, fill=(25, 30, 70))
    return cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)

rnd = random.Random(5); KEY = [rnd.randrange(4) for _ in range(N)]
page = fill(KEY, 1)
cases = {'lurus': dict(), 'miring_8': dict(rot=8, fill=0.8), 'perspektif': dict(persp=0.06), 'bayangan': dict(shade=0.45),
         'latar_gelap': dict(bg='dark', fill=0.75, rot=-5), 'buram_jpeg': dict(blur=1.4, jpeg=50), 'hp_4k': dict(frame=(3000, 4000), rot=2),
         'jauh': dict(fill=0.6), 'terbalik': dict(flip=True), 'menyamping': dict(landscape=True, fill=0.95)}
meta = []
for name, kw in cases.items():
    im = G.photo(page, seed=hash(name) % 1000, **kw)
    fn = os.path.join(OUT, name + '.raw'); cv2.cvtColor(im, cv2.COLOR_BGR2RGBA).tofile(fn); cv2.imwrite(fn.replace('.raw', '.jpg'), im)
    meta.append(dict(name=name, file=fn, w=im.shape[1], h=im.shape[0], key=''.join('ABCD'[a] for a in KEY)))
json.dump(dict(n=N, cases=meta), open(os.path.join(OUT, 'meta.json'), 'w'))
js = r"""
const fs=require('fs'),E=require(process.argv[1]);const M=JSON.parse(fs.readFileSync(process.argv[2])),m=M.cases,N=M.n;let ok=0;
for(const c of m){const img={width:c.w,height:c.h,data:new Uint8ClampedArray(fs.readFileSync(c.file))};const t=Date.now();
 const r=E.processMarkerlessAuto(img,{layouts:E.LEGACY_LAYOUTS});const got=r.success?r.answers.map(a=>a||'-').join(''):'GAGAL '+r.error;
 const okL=r.success&&r.geo.layout.questions===N;if(got===c.key&&okL)ok++; console.log((got===c.key&&okL?'✓':'✗'),c.name.padEnd(12),got,(Date.now()-t)+'ms','kualitas '+(r.quality?r.quality.grade+r.quality.score:'-'),r.rotation?('diputar '+r.rotation+'°'):'');
 if(c.name==='bayangan'&&r.success){const rc=E.identLattice(r.image||img,r.geo,1100);fs.writeFileSync('/tmp/lama_ident'+N+'.pgm',Buffer.concat([Buffer.from('P5 '+rc.w+' '+rc.h+' 255\n'),Buffer.from(rc.data)]));}}
console.log('Template F4 tanpa marker '+N+' soal: '+ok+'/'+m.length); process.exitCode = ok===m.length?0:1;"""
sys.exit(subprocess.run(['node', '-e', js, os.path.join(HERE, '..', '..', 'web', 'js', 'ljk-engine.js'), os.path.join(OUT, 'meta.json')]).returncode)
