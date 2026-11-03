"""Uji Statistik.gs vs perhitungan independen numpy/scipy. Pemakaian: python3 tools/test/test_stats.py"""
import json, subprocess, os, numpy as np
from scipy import stats
rng = np.random.default_rng(7)
HERE = os.path.dirname(os.path.abspath(__file__))
ok = True
for n, k, opsi in [(36, 40, 'ABCD'), (120, 50, 'ABCDE'), (12, 20, 'ABCD')]:
    theta = rng.normal(0, 1, n); b = rng.normal(0, 1, k); a = rng.uniform(0.3, 2.0, k)
    key = ''.join(rng.choice(list(opsi), k))
    P = 1 / (1 + np.exp(-a * (theta[:, None] - b[None, :])))
    X = (rng.random((n, k)) < P).astype(int)
    if k > 3: X[:, 3] = 1 - X[:, 3]            # butir "kunci salah" -> D negatif
    resp = []
    for i in range(n):
        s = ''
        for j in range(k):
            if X[i, j]: s += key[j]
            else:
                wrong = [c for c in opsi if c != key[j]]
                s += '-' if rng.random() < 0.05 else wrong[int(rng.integers(len(wrong)))]
        resp.append({'nama': f'S{i}', 'kelas': '7A', 'jawaban': s})
    js = subprocess.run(['node', '-e', f"const S=require('{os.path.join(HERE,'..','..','apps-script','Statistik.gs')}');process.stdout.write(JSON.stringify(S.analisisButir({json.dumps(resp)},'{key}','{opsi}',75)))"], capture_output=True, text=True)
    R = json.loads(js.stdout)
    Xc = np.array([[1 if r['jawaban'][j] == key[j] else 0 for j in range(k)] for r in resp])
    tot = Xc.sum(1); p = Xc.mean(0)
    kr20 = k / (k - 1) * (1 - (p * (1 - p)).sum() / tot.var())
    M = tot.mean(); kr21 = k / (k - 1) * (1 - M * (k - M) / (k * tot.var()))
    rtab = stats.t.ppf(0.975, n - 2) / np.sqrt(n - 2 + stats.t.ppf(0.975, n - 2) ** 2)
    order = sorted(range(n), key=lambda i: (-tot[i], i)); g = max(1, round(n * 0.27)) if n >= 20 else n // 2
    up, lo = order[:g], order[n - g:]
    D = Xc[up].mean(0) - Xc[lo].mean(0)
    rp = np.array([np.corrcoef(Xc[:, j], tot - Xc[:, j])[0, 1] if Xc[:, j].std() > 0 else np.nan for j in range(k)])
    err = dict(
        kr20=abs(R['ringkasan']['kr20'] - kr20), kr21=abs(R['ringkasan']['kr21'] - kr21), rtabel=abs(R['ringkasan']['rTabel'] - rtab),
        p=max(abs(bb['p'] - p[j]) for j, bb in enumerate(R['butir'])), D=max(abs(bb['d'] - D[j]) for j, bb in enumerate(R['butir'])),
        rpbis=max(abs((bb['rpbis'] if bb['rpbis'] is not None else np.nan) - rp[j]) for j, bb in enumerate(R['butir']) if not np.isnan(rp[j])))
    good = all(v < 2e-3 for v in err.values())
    ok &= good
    r = R['ringkasan']
    print(f"n={n:3d} k={k} {opsi}: {'OK' if good else 'BEDA'}  KR20 {r['kr20']} ({r['kategoriKr20']}) vs {kr20:.3f}, KR21 {r['kr21']} vs {kr21:.3f}, r tabel {r['rTabel']} vs {rtab:.3f}, "
          f"galat maks p {err['p']:.1e} D {err['D']:.1e} rpbis {err['rpbis']:.1e} | diterima {r['diterima']} direvisi {r['direvisi']} dibuang {r['dibuang']} | butir 4: {R['butir'][3]['rekomendasi']} ({R['butir'][3]['alasan'][:60]})")
print('SEMUA OK' if ok else 'ADA BEDA'); raise SystemExit(0 if ok else 1)
