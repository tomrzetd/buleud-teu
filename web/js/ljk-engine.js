/*
 * Buleud Teu — LJK ENGINE (JavaScript murni, tanpa OpenCV)
 *
 *  processMarker(img, opt)     : LJK F4 dengan marker sudut (mode utama, 50 soal, ABCD/ABCDE)
 *  processMarkerless(img, opt) : LJK lama tanpa marker (inferensi kisi, V33)
 *  detectMarkersFast(img)      : deteksi marker cepat untuk auto-capture kamera
 *  rectifyMM / identityStrips  : potongan lurus (debug view, OCR identitas)
 *
 * img = { width, height, data: RGBA Uint8ClampedArray } (ImageData)
 * Port Kotlin: android/app/src/main/java/id/buleudteu/ljk/engine/ — logika harus identik.
 */
(function (root) {
    const SpecMod = (typeof module !== 'undefined' && module.exports) ? require('./ljk-spec.js') : root.LJKSpec;
    const median = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

    // =================================================================
    // 1. Citra dasar
    // =================================================================
    function toGray(img, maxSide) {
        const sw = img.width, sh = img.height, d = img.data;
        const s = Math.min(1, maxSide / Math.max(sw, sh));
        const W = Math.max(1, Math.round(sw * s)), H = Math.max(1, Math.round(sh * s));
        const g = new Uint8ClampedArray(W * H);
        if (s === 1) {
            for (let i = 0, p = 0; i < W * H; i++, p += 4) g[i] = (d[p] * 77 + d[p + 1] * 150 + d[p + 2] * 29) >> 8;
        } else {
            const inv = 1 / s;
            for (let y = 0; y < H; y++) {
                const y0 = Math.floor(y * inv), y1 = Math.min(sh, Math.max(y0 + 1, Math.floor((y + 1) * inv)));
                for (let x = 0; x < W; x++) {
                    const x0 = Math.floor(x * inv), x1 = Math.min(sw, Math.max(x0 + 1, Math.floor((x + 1) * inv)));
                    let sum = 0, n = 0;
                    for (let yy = y0; yy < y1; yy++) {
                        let p = (yy * sw + x0) * 4;
                        for (let xx = x0; xx < x1; xx++, p += 4) { sum += (d[p] * 77 + d[p + 1] * 150 + d[p + 2] * 29) >> 8; n++; }
                    }
                    g[y * W + x] = sum / n;
                }
            }
        }
        return { g, W, H, scale: s };
    }

    function integral(g, W, H) {
        const I = new Float64Array((W + 1) * (H + 1));
        for (let y = 0; y < H; y++) {
            let row = 0;
            for (let x = 0; x < W; x++) { row += g[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; }
        }
        return I;
    }

    // piksel "tinta" bila lebih gelap dari rata-rata lokal (jendela 2*rad+1) dikurangi C
    function adaptiveThreshold(g, W, H, rad, C, I) {
        I = I || integral(g, W, H);
        const bin = new Uint8Array(W * H);
        for (let y = 0; y < H; y++) {
            const y0 = Math.max(0, y - rad), y1 = Math.min(H, y + rad + 1);
            for (let x = 0; x < W; x++) {
                const x0 = Math.max(0, x - rad), x1 = Math.min(W, x + rad + 1);
                const sum = I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0];
                bin[y * W + x] = g[y * W + x] < sum / ((x1 - x0) * (y1 - y0)) - C ? 1 : 0;
            }
        }
        return bin;
    }

    // komponen terhubung 8-arah + momen (untuk uji "kotak padat")
    function components(bin, W, H) {
        const lab = new Int32Array(W * H), stack = new Int32Array(W * H), comps = [];
        let next = 0;
        for (let i = 0; i < W * H; i++) {
            if (!bin[i] || lab[i]) continue;
            next++;
            let sp = 0; stack[sp++] = i; lab[i] = next;
            let minx = W, maxx = 0, miny = H, maxy = 0, n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
            while (sp) {
                const p = stack[--sp], px = p % W, py = (p - px) / W;
                n++; sx += px; sy += py; sxx += px * px; syy += py * py; sxy += px * py;
                if (px < minx) minx = px; if (px > maxx) maxx = px;
                if (py < miny) miny = py; if (py > maxy) maxy = py;
                for (let dy = -1; dy <= 1; dy++) {
                    const ny = py + dy; if (ny < 0 || ny >= H) continue;
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = px + dx; if (nx < 0 || nx >= W) continue;
                        const q = ny * W + nx;
                        if (bin[q] && !lab[q]) { lab[q] = next; stack[sp++] = q; }
                    }
                }
            }
            comps.push({ id: next, minx, maxx, miny, maxy, n, sx, sy, sxx, syy, sxy });
        }
        return { lab, comps };
    }

    // =================================================================
    // 2. Lingkaran (cincin kosong atau bulatan penuh)
    // =================================================================
    function circleCandidates(lab, comps, W, H, rMin, rMax) {
        const out = [], RAYS = 24;
        for (const c of comps) {
            const w = c.maxx - c.minx + 1, h = c.maxy - c.miny + 1;
            const R = (w + h) / 4, ar = w / h;
            if (R < rMin || R > rMax || ar < 0.72 || ar > 1.38) continue;
            if (c.n < Math.PI * 2 * R * 0.45) continue;
            const cx = (c.minx + c.maxx) / 2, cy = (c.miny + c.maxy) / 2;
            let outside = 0; const R2 = (1.18 * R) ** 2;
            for (let y = c.miny; y <= c.maxy; y++) for (let x = c.minx; x <= c.maxx; x++)
                if (lab[y * W + x] === c.id && (x - cx) ** 2 + (y - cy) ** 2 > R2) outside++;
            if (outside / c.n > 0.06) continue;
            let hit = 0;
            for (let k = 0; k < RAYS; k++) {
                const a = (k / RAYS) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
                for (let t = 0.6; t <= 1.12; t += 0.08) {
                    const x = Math.round(cx + ca * R * t), y = Math.round(cy + sa * R * t);
                    if (x >= 0 && y >= 0 && x < W && y < H && lab[y * W + x] === c.id) { hit++; break; }
                }
            }
            if (hit / RAYS < 0.8) continue;
            out.push({ x: cx, y: cy, r: R });
        }
        return out;
    }
    function removeNested(cands) {
        return cands.filter(a => !cands.some(b => b !== a && b.r > a.r * 1.4 && Math.hypot(a.x - b.x, a.y - b.y) < b.r * 0.7));
    }

    // =================================================================
    // 3. Homografi (least squares, >= 4 pasangan)  {u,v} -> {x,y}
    // =================================================================
    function solve(A, b) {
        const n = b.length;
        for (let i = 0; i < n; i++) {
            let p = i;
            for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
            [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
            if (Math.abs(A[i][i]) < 1e-12) return null;
            for (let r = i + 1; r < n; r++) {
                const f = A[r][i] / A[i][i];
                for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
                b[r] -= f * b[i];
            }
        }
        const x = new Array(n).fill(0);
        for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c]; x[i] = s / A[i][i]; }
        return x;
    }
    function fitHomography(pairs) {
        if (pairs.length < 4) return null;
        const mx = pairs.reduce((a, p) => a + p.u, 0) / pairs.length, my = pairs.reduce((a, p) => a + p.v, 0) / pairs.length;
        const sc = pairs.reduce((a, p) => a + Math.hypot(p.u - mx, p.v - my), 0) / pairs.length || 1;
        const ATA = Array.from({ length: 8 }, () => new Array(8).fill(0)), ATb = new Array(8).fill(0);
        const add = (row, val) => { for (let i = 0; i < 8; i++) { ATb[i] += row[i] * val; for (let j = 0; j < 8; j++) ATA[i][j] += row[i] * row[j]; } };
        for (const p of pairs) {
            const u = (p.u - mx) / sc, v = (p.v - my) / sc;
            add([u, v, 1, 0, 0, 0, -u * p.x, -v * p.x], p.x);
            add([0, 0, 0, u, v, 1, -u * p.y, -v * p.y], p.y);
        }
        const h = solve(ATA, ATb);
        if (!h || h.some(v => !isFinite(v))) return null;
        const f = (u0, v0) => {
            const u = (u0 - mx) / sc, v = (v0 - my) / sc, den = h[6] * u + h[7] * v + 1;
            return { x: (h[0] * u + h[1] * v + h[2]) / den, y: (h[3] * u + h[4] * v + h[5]) / den };
        };
        return f;
    }
    // homografi + kebalikannya dari pasangan mm <-> piksel
    function fitPair(pairs) {
        const fwd = fitHomography(pairs);
        const inv = fitHomography(pairs.map(p => ({ u: p.x, v: p.y, x: p.u, y: p.v })));
        return fwd && inv ? { fwd, inv } : null;
    }

    // =================================================================
    // 4. Kehitaman relatif terhadap kertas di sekelilingnya
    // =================================================================
    function darkness(g, W, H, cx, cy, r) {
        const rin = r * 0.55, r1 = r * 1.22, r2 = r * 1.5;
        let sIn = 0, nIn = 0; const ring = [];
        const x0 = Math.max(0, Math.floor(cx - r2)), x1 = Math.min(W - 1, Math.ceil(cx + r2));
        const y0 = Math.max(0, Math.floor(cy - r2)), y1 = Math.min(H - 1, Math.ceil(cy + r2));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const d = Math.hypot(x - cx, y - cy), v = g[y * W + x];
            if (d <= rin) { sIn += v; nIn++; } else if (d >= r1 && d <= r2) ring.push(v);
        }
        if (!nIn || !ring.length) return 0;
        ring.sort((a, b) => a - b);
        const paper = ring[Math.floor(ring.length * 0.8)] || 1;
        return clamp(1 - (sIn / nIn) / Math.max(1, paper), 0, 1);
    }
    // kehitaman rata-rata sebuah persegi (untuk marker arah)
    function squareDark(g, W, H, cx, cy, half) {
        let sIn = 0, nIn = 0; const ring = [];
        const R2 = half * 2.6;
        for (let y = Math.max(0, Math.floor(cy - R2)); y <= Math.min(H - 1, Math.ceil(cy + R2)); y++)
            for (let x = Math.max(0, Math.floor(cx - R2)); x <= Math.min(W - 1, Math.ceil(cx + R2)); x++) {
                const dx = Math.abs(x - cx), dy = Math.abs(y - cy), v = g[y * W + x];
                if (dx <= half * 0.6 && dy <= half * 0.6) { sIn += v; nIn++; }
                else if (Math.max(dx, dy) >= half * 1.6) ring.push(v);
            }
        if (!nIn || !ring.length) return 0;
        ring.sort((a, b) => a - b);
        return clamp(1 - (sIn / nIn) / Math.max(1, ring[Math.floor(ring.length * 0.8)]), 0, 1);
    }

    // =================================================================
    // 5. Keputusan per soal (dipakai kedua mode)
    // =================================================================
    function decide(qDs, letters, sens) {
        const all = []; qDs.forEach(ds => ds.forEach(d => all.push(d)));
        const empty = median(all);
        const filledQ = qDs.map(ds => Math.max(...ds)).filter(v => v > empty + 0.18);
        const full = filledQ.length ? median(filledQ) : empty + 0.45;
        const span = Math.max(0.2, full - empty), thr = empty + span * sens;
        const res = { answers: [], status: [], suggest: [], notes: [], conf: [], empty, full, thr, filled: 0 };
        qDs.forEach((ds) => {
            const order = ds.map((d, i) => ({ d, i })).sort((a, b) => b.d - a.d);
            const top = order[0], sec = order[1], above = order.filter(o => o.d >= thr);
            let a = null, st, sg = null, note, conf;
            if (above.length === 1) {
                a = letters[top.i]; st = 'ok'; note = `${(top.d * 100).toFixed(0)}%`;
                conf = clamp(Math.min((top.d - thr) / (span * 0.5), (top.d - sec.d) / (span * 0.6)), 0, 1);
            } else if (above.length === 0) {
                if (top.d - sec.d > span * 0.25 && top.d > empty + span * 0.3) { st = 'weak'; sg = letters[top.i]; note = `tipis ${sg}?`; }
                else { st = 'blank'; note = 'kosong'; }
                conf = st === 'blank' ? clamp((thr - top.d) / (span * 0.5), 0, 1) : 0.3;
            } else if (top.d - sec.d > span * 0.35) {
                a = letters[top.i]; st = 'weak'; sg = a; note = `bekas hapus ${letters[sec.i]}?`; conf = 0.45;
            } else {
                st = 'double'; sg = above.map(o => letters[o.i]).sort().join('/'); note = `GANDA ${sg}`; conf = 0;
            }
            res.answers.push(a); res.status.push(st); res.suggest.push(sg); res.notes.push(note); res.conf.push(+conf.toFixed(2));
            if (a) res.filled++;
        });
        return res;
    }

    // ketajaman: rata-rata |Laplacian| di sekitar titik-titik bulatan (dinormalisasi kontras)
    function sharpness(g, W, H, pts, r) {
        let s = 0, n = 0;
        const R = Math.max(2, Math.round(r * 1.4));
        for (const p of pts) {
            const cx = Math.round(p.x), cy = Math.round(p.y);
            for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
                if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
                const i = y * W + x;
                s += Math.abs(4 * g[i] - g[i - 1] - g[i + 1] - g[i - W] - g[i + W]); n++;
            }
        }
        return n ? s / n : 0;
    }

    // =================================================================
    // 6. MODE MARKER (LJK F4)
    // =================================================================
    function solidSquares(comps, W, H) {
        const out = [];
        const sMin = Math.max(5, Math.max(W, H) / 170), sMax = Math.max(W, H) / 7;
        for (const c of comps) {
            if (c.n < sMin * sMin * 0.6) continue;
            const mx = c.sx / c.n, my = c.sy / c.n;
            const a = c.sxx / c.n - mx * mx, b = c.syy / c.n - my * my, cxy = c.sxy / c.n - mx * my;
            const tr = a + b, det = a * b - cxy * cxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
            const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
            if (l2 <= 0 || l1 / l2 > 2.2) continue;
            const side = Math.sqrt(12 * Math.sqrt(l1 * l2));
            const fill = c.n / (side * side);
            if (fill < 0.82 || fill > 1.25) continue;               // padat (bukan cincin/teks)
            const bw = c.maxx - c.minx + 1, bh = c.maxy - c.miny + 1;
            if (c.n / (bw * bh) < 0.45) continue;
            if (side < sMin || side > sMax) continue;
            // persegi vs lingkaran: persegi mengisi kotak pembatas yang diputar lebih penuh
            out.push({ x: mx, y: my, side, n: c.n, sq: c.n / (bw * bh) });
        }
        return out;
    }

    const CORNER_ORDER = ['TL', 'TR', 'BR', 'BL'];
    function markerHypotheses(cands, spec, g, W, H) {
        const M = spec.markers;
        const pool = cands.slice().sort((a, b) => b.n - a.n).slice(0, 14);
        const hyps = [];
        const tpl = M.corner.centers;
        for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++)
            for (let k = j + 1; k < pool.length; k++) for (let l = k + 1; l < pool.length; l++) {
                const q = [pool[i], pool[j], pool[k], pool[l]];
                const sides = q.map(c => c.side), smax = Math.max(...sides), smin = Math.min(...sides);
                if (smax / smin > 1.9) continue;
                const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4, cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
                q.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)); // searah jarum jam (y ke bawah)
                // cembung + luas wajar
                let area = 0, convex = true;
                for (let t = 0; t < 4; t++) {
                    const a = q[t], b = q[(t + 1) % 4], c = q[(t + 2) % 4];
                    area += a.x * b.y - b.x * a.y;
                    if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= 0) convex = false;
                }
                area = Math.abs(area) / 2;
                if (!convex || area < W * H * 0.06) continue;
                // ukuran marker sebanding dengan halaman: 8 mm dari 195 mm
                const pxPerMm = Math.sqrt(area / ((tpl[1][0] - tpl[0][0]) * (tpl[3][1] - tpl[0][1])));
                const expSide = M.corner.size * pxPerMm;
                if (median(sides) < expSide * 0.45 || median(sides) > expSide * 1.9) continue;
                for (let rot = 0; rot < 4; rot++) {
                    const pairs = tpl.map((t, ti) => ({ u: t[0], v: t[1], x: q[(ti + rot) % 4].x, y: q[(ti + rot) % 4].y }));
                    const Hm = fitHomography(pairs);
                    if (!Hm) continue;
                    // verifikasi: marker tengah + penanda arah
                    let mids = 0; const midPts = [];
                    for (const mc of M.mid.centers) {
                        const p = Hm(mc[0], mc[1]);
                        const hit = cands.find(c => Math.hypot(c.x - p.x, c.y - p.y) < 3 * pxPerMm && c.side < expSide * 1.1 && c.side > expSide * 0.4);
                        if (hit) { mids++; midPts.push({ u: mc[0], v: mc[1], x: hit.x, y: hit.y }); }
                    }
                    const po = Hm(M.orient.center[0], M.orient.center[1]);
                    const od = squareDark(g, W, H, po.x, po.y, M.orient.size / 2 * pxPerMm);
                    // posisi "cermin" penanda arah harus putih
                    const pm = Hm(spec.page.w - M.orient.center[0], M.orient.center[1]);
                    const odm = squareDark(g, W, H, pm.x, pm.y, M.orient.size / 2 * pxPerMm);
                    const score = mids * 2 + (od > 0.4 && odm < 0.25 ? 3 : 0) + od - odm;
                    hyps.push({ score, pairs, midPts, pxPerMm, mids, od, odm, quad: q, rot });
                }
            }
        hyps.sort((a, b) => b.score - a.score);
        return hyps;
    }

    // cari pergeseran lokal (mm) sebuah blok soal yang paling banyak mencocokkan bulatan terdeteksi
    // (menangani kertas melengkung / perspektif sisa). mmPts = titik bulatan dalam mm (homografi global).
    function blockShift(mmPts, spec, b, nOpt, active, range = 3.5, step = 0.5, tol = 0.9) {
        const P = spec.pg, bx = P.x0 + b * P.blockW + P.optOffset;
        const rowsActive = Math.max(0, Math.min(P.rows, active - b * P.rows));
        if (!rowsActive) return { dx: 0, dy: 0, hits: 0, tot: 0 };
        const near = mmPts.filter(p => p.x > bx - range - 3 && p.x < bx + (nOpt - 1) * P.optPitch + range + 3 && p.y > P.y0 - range - 3 && p.y < P.y0 + (rowsActive - 1) * P.rowPitch + range + 3);
        let best = { dx: 0, dy: 0, hits: -1 };
        for (let dy = -range; dy <= range + 1e-9; dy += step) for (let dx = -range; dx <= range + 1e-9; dx += step) {
            let hits = 0;
            for (const p of near) {
                const o = Math.round((p.x - dx - bx) / P.optPitch), r = Math.round((p.y - dy - P.y0) / P.rowPitch);
                if (o < 0 || o >= nOpt || r < 0 || r >= rowsActive) continue;
                if (Math.abs(p.x - dx - (bx + o * P.optPitch)) < tol && Math.abs(p.y - dy - (P.y0 + r * P.rowPitch)) < tol) hits++;
            }
            if (hits > best.hits || (hits === best.hits && Math.hypot(dx, dy) < Math.hypot(best.dx, best.dy))) best = { dx, dy, hits };
        }
        best.tot = rowsActive * nOpt;
        return best;
    }

    function processMarker(img, opt = {}) {
        const spec = opt.spec || SpecMod.SPEC, P = spec.pg;
        const nOpt = opt.options === 5 ? 5 : 4;
        const active = clamp(opt.active || P.questions, 1, P.questions);
        const LET = SpecMod.LETTERS.slice(0, nOpt);
        const sens = clamp((opt.sensitivity ?? 50) / 100, 0.2, 0.8);
        const t0 = now();
        const ret = { mode: 'marker', success: false, error: null, answers: [], status: [], suggest: [], notes: [], conf: [], dark: [], logs: [], warnings: [], filledAnswers: 0, totalCircles: 0, quality: null, debug: null, geo: null };
        const log = (m) => ret.logs.push(m);
        const fail = (msg) => { ret.error = msg; log('GAGAL: ' + msg); return ret; };

        const { g, W, H, scale } = toGray(img, opt.maxSide || 1600);
        const I = integral(g, W, H);
        ret.debug = { g, W, H, scale, markers: [], cands: [], bin: null };

        // --- marker: ambang dengan jendela besar agar kotak hitam terisi penuh
        const binM = adaptiveThreshold(g, W, H, Math.max(15, Math.round(Math.max(W, H) / 12)), 22, I);
        const cm = components(binM, W, H);
        const squares = solidSquares(cm.comps, W, H);
        ret.debug.squares = squares;
        log(`Gambar ${W}x${H}, kotak padat ${squares.length}`);
        if (squares.length < 4) return fail('Marker sudut tidak ditemukan. Pastikan keempat kotak hitam di sudut LJK masuk bingkai.');
        const hyps = markerHypotheses(squares, spec, g, W, H);
        if (!hyps.length) return fail('Susunan 4 marker sudut tidak cocok dengan LJK F4. Foto seluruh halaman.');

        // --- lingkaran untuk verifikasi & penyetelan (skala dari hipotesis terbaik)
        const pxPerMm0 = hyps[0].pxPerMm;
        const rPx = P.r * pxPerMm0;
        const binC = adaptiveThreshold(g, W, H, Math.max(5, Math.round(rPx * 3)), opt.contrast ?? 10, I);
        ret.debug.bin = binC;
        const cc = components(binC, W, H);
        const circles = removeNested(circleCandidates(cc.lab, cc.comps, W, H, rPx * 0.6, rPx * 1.6));
        ret.totalCircles = circles.length;
        ret.debug.cands = circles;

        // pilih hipotesis: skor marker + kecocokan bulatan
        const bubbleMatch = (inv) => {
            const mm = circles.map(c => inv(c.x, c.y));
            let hit = 0, tot = 0;
            for (let b = 0; b < P.blocks; b++) { const s = blockShift(mm, spec, b, Math.min(nOpt, 4), active, 3.5, 0.5, 0.9); hit += s.hits; tot += s.tot; }
            return tot ? hit / tot : 0;
        };
        let best = null;
        for (const h of hyps.slice(0, 4)) {
            const fp = fitPair(h.pairs.concat(h.midPts));
            if (!fp) continue;
            const bm = bubbleMatch(fp.inv);
            const total = h.score + bm * 4;
            if (!best || total > best.total) best = Object.assign({}, h, { fp, bm, total });
        }
        if (!best || best.bm < 0.25) return fail('Marker ditemukan tapi bulatan jawaban tidak cocok. Foto ulang lebih dekat/terang.');
        if (best.od < 0.4) ret.warnings.push('Penanda arah (kotak kecil kiri atas) tidak jelas; arah LJK ditebak dari pola bulatan.');
        const Hg = best.fp;
        const pxPerMm = best.pxPerMm;
        ret.debug.markers = best.pairs.concat(best.midPts).map(p => ({ x: p.x, y: p.y, u: p.u, v: p.v }));
        log(`Marker OK (tengah ${best.mids}/2, arah ${(best.od * 100).toFixed(0)}%), skala ${pxPerMm.toFixed(2)} px/mm, bulatan cocok ${(best.bm * 100).toFixed(0)}%`);

        // --- penyetelan per blok dari bulatan yang terdeteksi (tahan kertas melengkung)
        const blockFits = [], matchedByBubble = new Map();
        const mmC = circles.map(c => ({ c, m: Hg.inv(c.x, c.y) }));
        let resid = [];
        const mmPts = mmC.map(e => e.m);
        for (let b = 0; b < P.blocks; b++) {
            const sh = blockShift(mmPts, spec, b, nOpt, active);
            const collect = (mapInv, dx, dy, tol) => {
                const pairs = [];
                const rowsActive = Math.max(0, Math.min(P.rows, active - b * P.rows));
                for (let r = 0; r < rowsActive; r++) {
                    const q = b * P.rows + r;
                    for (let o = 0; o < nOpt; o++) {
                        const bm = SpecMod.bubbleMM(q, o, spec);
                        let bestC = null, bd = tol;
                        for (const e of mmC) { const m = mapInv ? mapInv(e.c) : e.m; const d = Math.hypot(m.x - dx - bm.x, m.y - dy - bm.y); if (d < bd) { bd = d; bestC = e.c; } }
                        if (bestC) pairs.push({ u: bm.x, v: bm.y, x: bestC.x, y: bestC.y, key: q + ',' + o });
                    }
                }
                return pairs;
            };
            let pairs = collect(null, sh.dx, sh.dy, 1.0);
            // putaran kedua: cocokkan ulang dengan homografi blok sementara
            if (pairs.length >= 8) {
                const tmp = fitPair(pairs);
                if (tmp) { const p2 = collect(c => tmp.inv(c.x, c.y), 0, 0, 1.0); if (p2.length >= pairs.length) pairs = p2; }
            }
            pairs.forEach(p => { const c = mmC.find(e => e.c.x === p.x && e.c.y === p.y); if (c) matchedByBubble.set(p.key, c.c); });
            let fit = null;
            const rowsSeen = new Set(pairs.map(p => p.v)).size;
            if (pairs.length >= 10 && rowsSeen >= 3) {
                // gabung dengan titik global di sekitar blok agar stabil
                const f = fitHomography(pairs);
                if (f) {
                    const err = pairs.map(p => { const q = f(p.u, p.v); return Math.hypot(q.x - p.x, q.y - p.y); });
                    const me = median(err);
                    const good = pairs.filter((p, i) => err[i] < Math.max(1.5, me * 3));
                    fit = fitHomography(good) || f;
                    good.forEach(p => { const q = fit(p.u, p.v); resid.push(Math.hypot(q.x - p.x, q.y - p.y) / pxPerMm); });
                }
            }
            blockFits.push(fit || Hg.fwd);
        }
        const residMm = resid.length ? median(resid) : null;

        // --- sampling semua bulatan aktif
        const grid = [], qDs = [], samplePts = [];
        for (let q = 0; q < active; q++) {
            const b = Math.floor(q / P.rows), F = blockFits[b], row = [], ds = [];
            for (let o = 0; o < nOpt; o++) {
                const bm = SpecMod.bubbleMM(q, o, spec);
                let p = F(bm.x, bm.y);
                const pr = F(bm.x + P.r, bm.y), rLocal = Math.hypot(pr.x - p.x, pr.y - p.y);
                const det = matchedByBubble.get(q + ',' + o);
                const use = det && Math.hypot(det.x - p.x, det.y - p.y) < rLocal * 0.5;
                if (use) p = { x: det.x, y: det.y };
                const d = darkness(g, W, H, p.x, p.y, rLocal);
                row.push({ x: p.x, y: p.y, r: rLocal, d, detected: !!use });
                ds.push(d); samplePts.push(p);
            }
            grid.push(row); qDs.push(ds);
        }
        ret.dark = qDs;
        // varian: apakah kolom E tercetak padahal ujian ABCD?
        if (nOpt === 4) {
            let eHit = 0; for (let q = 0; q < active; q++) if (mmC.some(e => Math.hypot(e.m.x - SpecMod.bubbleMM(q, 4, spec).x, e.m.y - SpecMod.bubbleMM(q, 4, spec).y) < 1.1)) eHit++;
            if (eHit > active * 0.5) ret.warnings.push('LJK ini tampaknya varian ABCDE, sedangkan ujian diatur ABCD. Opsi E diabaikan.');
        }

        const dec = decide(qDs, LET, sens);
        Object.assign(ret, { answers: dec.answers, status: dec.status, suggest: dec.suggest, notes: dec.notes, conf: dec.conf, filledAnswers: dec.filled, thr: dec.thr, empty: dec.empty, full: dec.full });

        // --- kualitas foto
        const sharp = sharpness(g, W, H, samplePts.filter((_, i) => i % 3 === 0), P.r * pxPerMm) / Math.max(10, 255 * (dec.full - dec.empty + 0.2));
        const paperLv = []; for (let b = 0; b < P.blocks; b++) { const p = blockFits[b](P.x0 + b * P.blockW + 5, P.y0 - 6); const x = Math.round(p.x), y = Math.round(p.y); if (x >= 0 && y >= 0 && x < W && y < H) paperLv.push(g[y * W + x]); }
        const light = paperLv.length ? Math.min(...paperLv) / Math.max(1, Math.max(...paperLv)) : 1;
        const c0 = Hg.fwd(0, 0), c1 = Hg.fwd(spec.page.w, 0);
        const tilt = Math.abs(Math.atan2(c1.y - c0.y, c1.x - c0.x) * 180 / Math.PI);
        let qScore = 100;
        if (pxPerMm < 3) qScore -= (3 - pxPerMm) * 25;
        if (residMm != null) qScore -= clamp((residMm - 0.15) * 80, 0, 30);
        if (light < 0.75) qScore -= (0.75 - light) * 80;
        if (sharp < 0.25) qScore -= (0.25 - sharp) * 120;
        if (!best.mids) qScore -= 10;
        qScore = Math.round(clamp(qScore, 0, 100));
        ret.quality = { score: qScore, grade: qScore >= 80 ? 'A' : qScore >= 60 ? 'B' : 'C', pxPerMm: +pxPerMm.toFixed(2), residMm: residMm == null ? null : +residMm.toFixed(2), light: +light.toFixed(2), sharp: +sharp.toFixed(2), tilt: +tilt.toFixed(1) };
        ret.geo = { kind: 'mm', spec, H: Hg, blocks: blockFits, scale, pxPerMm, nOpt, active };
        ret.debug.grid = grid;
        ret.success = true;
        log(`Ambang ${(dec.thr * 100).toFixed(0)}% (kosong ${(dec.empty * 100).toFixed(0)}%, terisi ${(dec.full * 100).toFixed(0)}%), residu ${residMm == null ? '-' : residMm.toFixed(2) + ' mm'}, kualitas ${qScore}`);
        log(`Selesai ${Math.round(now() - t0)} ms`);
        return ret;
    }

    // Auto-layout F4 bermarker 25 (5x5) / 50 (5x10), dengan marker identik.
    // Kapasitas kertas TIDAK mengubah panjang kunci ujian dalam database.
    function processMarkerAuto(img, opt = {}) {
        const standard = processMarker(img, Object.assign({}, opt, { spec: SpecMod.SPEC }));
        if (opt.options === 5 || (opt.active || 50) > 25) return standard;
        const compact = processMarker(img, Object.assign({}, opt, { spec: SpecMod.SPEC25 }));
        if (!compact.success) return standard;
        if (!standard.success) return compact;
        const mmCircles = (standard.debug.cands || []).map(c => standard.geo.H.inv(c.x, c.y));
        let extra = 0;
        for (let b = 0; b < 5; b++) for (let row = 5; row < 10; row++) for (let o = 0; o < 4; o++) {
            const p = SpecMod.bubbleMM(b * 10 + row, o, SpecMod.SPEC);
            if (mmCircles.some(c => Math.hypot(c.x - p.x, c.y - p.y) < 1.1)) extra++;
        }
        const selected = extra >= 18 ? standard : compact;
        selected.logs.push('Auto-layout: ' + selected.geo.spec.id + ', bulatan baris 6-10: ' + extra + '/100');
        return selected;
    }

    // deteksi marker cepat (preview kamera, ~640 px): kembalikan 4 sudut dalam koordinat gambar asli
    function detectMarkersFast(img, opt = {}) {
        const spec = opt.spec || SpecMod.SPEC;
        const { g, W, H, scale } = toGray(img, opt.maxSide || 640);
        const bin = adaptiveThreshold(g, W, H, Math.max(9, Math.round(Math.max(W, H) / 12)), 22);
        const sq = solidSquares(components(bin, W, H).comps, W, H);
        if (sq.length < 4) return null;
        const h = markerHypotheses(sq, spec, g, W, H)[0];
        if (!h || h.score < 3) return null;
        return { corners: h.pairs.map(p => ({ x: p.x / scale, y: p.y / scale })), score: h.score, pxPerMm: h.pxPerMm / scale };
    }

    // =================================================================
    // 7. MODE TANPA MARKER (LJK lama 20 soal, inferensi kisi V33)
    // =================================================================
    function radiusModes(cands, maxModes) {
        const modes = []; let pool = cands.slice();
        while (pool.length && modes.length < maxModes) {
            let best = 0, bestR = 0;
            for (const c of pool) { let cnt = 0; for (const d of pool) if (d.r >= c.r / 1.22 && d.r <= c.r * 1.22) cnt++; if (cnt > best) { best = cnt; bestR = c.r; } }
            if (best < 12) break;
            const R = median(pool.filter(d => d.r >= bestR / 1.22 && d.r <= bestR * 1.22).map(d => d.r));
            modes.push(R);
            pool = pool.filter(d => d.r < R / 1.35 || d.r > R * 1.35);
        }
        return modes;
    }
    function cluster1D(items, key, gap) {
        const s = items.slice().sort((a, b) => a[key] - b[key]), cl = [];
        for (const it of s) {
            const last = cl[cl.length - 1];
            if (last && it[key] - last.max <= gap) { last.items.push(it); last.max = it[key]; }
            else cl.push({ items: [it], max: it[key] });
        }
        cl.forEach(c => { c.c = c.items.reduce((a, b) => a + b[key], 0) / c.items.length; c.size = c.items.length; });
        return cl;
    }
    function rebuildColumns(xs, blocks, options) {
        if (xs.length < blocks * 2) return null;
        const gaps = []; for (let i = 1; i < xs.length; i++) gaps.push({ g: xs[i] - xs[i - 1], i });
        const small = median(gaps.map(g => g.g).sort((a, b) => a - b).slice(0, Math.max(1, gaps.length - (blocks - 1))));
        const cuts = gaps.filter(g => g.g > small * 1.6).sort((a, b) => b.g - a.g).slice(0, blocks - 1).map(g => g.i).sort((a, b) => a - b);
        if (cuts.length !== blocks - 1) return null;
        const groups = []; let s0 = 0; for (const c of cuts) { groups.push(xs.slice(s0, c)); s0 = c; } groups.push(xs.slice(s0));
        if (groups.some(gr => gr.length > options || gr.length === 0)) return null;
        const fullG = groups.filter(gr => gr.length === options);
        const tmpl = fullG.length ? Array.from({ length: options }, (_, k) => median(fullG.map(gr => gr[k] - gr[0]))) : Array.from({ length: options }, (_, k) => k * small);
        const starts = groups.map(gr => gr.length === options ? gr[0] : null), pitches = [];
        for (let i = 0; i < blocks; i++) for (let j = i + 1; j < blocks; j++) if (starts[i] != null && starts[j] != null) pitches.push((starts[j] - starts[i]) / (j - i));
        const pitch = pitches.length ? median(pitches) : null, out = [];
        groups.forEach((gr, gi) => {
            if (gr.length === options) { out.push(...gr); return; }
            let expStart = null;
            if (pitch != null) { const ref = starts.map((st, i) => st != null ? { st, i } : null).filter(Boolean).sort((a, b) => Math.abs(a.i - gi) - Math.abs(b.i - gi))[0]; expStart = ref.st + (gi - ref.i) * pitch; }
            let best = null;
            for (let sh = 0; sh + gr.length <= options; sh++) {
                const off = median(gr.map((x, k) => x - tmpl[sh + k]));
                let err = gr.reduce((a, x, k) => a + Math.abs(x - (off + tmpl[sh + k])), 0);
                if (expStart != null) err += Math.abs(off - expStart) * 2;
                if (!best || err < best.err) best = { err, off };
            }
            out.push(...tmpl.map(t => best.off + t));
        });
        return out;
    }

    function processMarkerless(img, opt = {}) {
        const L = Object.assign({ questions: 20, blocks: 4, options: 4 }, opt.layout || {});
        const ROWS = Math.ceil(L.questions / L.blocks), NCOL = L.blocks * L.options;
        const LET = SpecMod.LETTERS.slice(0, L.options);
        const sens = clamp((opt.sensitivity ?? 50) / 100, 0.2, 0.8);
        const t0 = now();
        const ret = { mode: 'markerless', success: false, error: null, answers: [], status: [], suggest: [], notes: [], conf: [], dark: [], logs: [], warnings: [], totalCircles: 0, filledAnswers: 0, quality: null, debug: null, geo: null };
        const log = (m) => ret.logs.push(m);
        const fail = (msg) => { ret.error = msg; log('GAGAL: ' + msg); return ret; };
        const { g, W, H, scale } = toGray(img, opt.maxSide || 1600);
        ret.debug = { g, W, H, scale, cands: [], grid: null, R0: 0 };
        const bin = adaptiveThreshold(g, W, H, Math.max(7, Math.round(Math.max(W, H) / 70)), opt.contrast ?? 10);
        ret.debug.bin = bin;
        const { lab, comps } = components(bin, W, H);
        let cands = removeNested(circleCandidates(lab, comps, W, H, Math.max(3, Math.min(W, H) / 160), Math.max(W, H) / 22));
        log(`Gambar ${W}x${H}, komponen ${comps.length}, kandidat bulat ${cands.length}`);
        if (cands.length < NCOL) return fail(`Lingkaran jawaban tidak ditemukan (${cands.length}). Dekatkan kamera / perbaiki cahaya.`);
        let best = null, lastErr = null;
        for (const R of radiusModes(cands, 4)) {
            const t = tryLattice(cands.filter(c => c.r >= R / 1.3 && c.r <= R * 1.3).map(c => ({ x: c.x, y: c.y, r: c.r })), R);
            if (t.ok) { if (!best || t.quality > best.quality) best = t; } else if (!lastErr) lastErr = t.err;
        }
        if (!best) return fail(lastErr || `Kisi ${ROWS} baris x ${NCOL} kolom tidak ditemukan.`);
        const { grid, R0, th } = best;
        Object.assign(ret.debug, { cands: best.cands, grid, R0 });
        ret.totalCircles = best.cands.length;
        ret.geo = { kind: 'lattice', map: best.map, colU: best.colU, rowV: best.rowV, scale, R0, layout: L };
        const qDs = [];
        for (let q = 0; q < L.questions; q++) { const b = Math.floor(q / ROWS), r = q % ROWS, ds = []; for (let o = 0; o < L.options; o++) ds.push(grid[r][b * L.options + o].d); qDs.push(ds); }
        ret.dark = qDs;
        const dec = decide(qDs, LET, sens);
        Object.assign(ret, { answers: dec.answers, status: dec.status, suggest: dec.suggest, notes: dec.notes, conf: dec.conf, filledAnswers: dec.filled, thr: dec.thr, empty: dec.empty, full: dec.full });
        ret.quality = { score: Math.round(best.quality * 100), grade: best.quality > 0.9 ? 'A' : best.quality > 0.75 ? 'B' : 'C', residMm: null, tilt: +(th * 180 / Math.PI).toFixed(1) };
        log(`Radius ${R0.toFixed(1)}px, kemiringan ${(th * 180 / Math.PI).toFixed(1)}°, lingkaran cocok ${(best.quality * 100).toFixed(0)}%${best.rebuilt ? ', kolom direkonstruksi' : ''}`);
        log(`Selesai ${Math.round(now() - t0)} ms`);
        ret.success = true;
        return ret;

        function tryLattice(cands, R0) {
            const bad = (err) => ({ ok: false, err });
            if (cands.length < NCOL) return bad(`Lingkaran ukuran ${R0.toFixed(0)}px hanya ${cands.length}.`);
            const angs = [];
            for (const a of cands) {
                let bst = null, bd = 1e9;
                for (const b of cands) { if (b.x <= a.x) continue; const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy); if (d < bd && d < R0 * 4 && Math.abs(dy) < dx * 0.6) { bd = d; bst = b; } }
                if (bst) angs.push(Math.atan2(bst.y - a.y, bst.x - a.x));
            }
            const th = median(angs), ct = Math.cos(th), st = Math.sin(th);
            cands.forEach(c => { c.u = c.x * ct + c.y * st; c.v = -c.x * st + c.y * ct; });
            const rowsCl = cluster1D(cands, 'v', R0 * 0.9).filter(c => c.size >= Math.max(3, NCOL * 0.25));
            if (rowsCl.length < ROWS) return bad(`Baris soal terdeteksi ${rowsCl.length}/${ROWS}. Pastikan seluruh tabel masuk bingkai.`);
            let bestW = 0, bestS = -1;
            for (let i = 0; i + ROWS <= rowsCl.length; i++) {
                const win = rowsCl.slice(i, i + ROWS), sp = [];
                for (let k = 1; k < win.length; k++) sp.push(win[k].c - win[k - 1].c);
                const ms = median(sp), regular = sp.every(s => s > ms * 0.6 && s < ms * 1.5);
                const score = win.reduce((a, c) => a + c.size, 0) * (regular ? 1 : 0.5);
                if (score > bestS) { bestS = score; bestW = i; }
            }
            const rowSel = rowsCl.slice(bestW, bestW + ROWS), rowV = rowSel.map(c => c.c);
            const inRows = []; rowSel.forEach((rc, ri) => rc.items.forEach(it => { it.ri = ri; inRows.push(it); }));
            let colCl = cluster1D(inRows, 'u', R0 * 0.8).filter(c => c.size >= Math.min(2, ROWS));
            // kolom bulatan yang jelas (hampir penuh) lebih banyak dari tata letak -> lembar lain (mis. LJK 25 dibaca sebagai 20)
            if (colCl.filter(c => c.size >= ROWS - 1).length >= NCOL + Math.ceil(L.options / 2)) return bad(`Kolom opsi lebih banyak dari tata letak ${L.questions} soal.`);
            if (colCl.length > NCOL) { const keep = colCl.slice().sort((a, b) => b.size - a.size).slice(0, NCOL); colCl = colCl.filter(c => keep.includes(c)); }
            let colU = colCl.map(c => c.c), rebuilt = false;
            if (colU.length !== NCOL) { const fixed = rebuildColumns(colU, L.blocks, L.options); if (!fixed) return bad(`Kolom opsi terdeteksi ${colU.length}/${NCOL}. Foto ulang lebih lurus/dekat.`); colU = fixed; rebuilt = true; }
            const pairs = [];
            for (const it of inRows) {
                let ci = -1, bd = R0 * 0.8;
                colU.forEach((u, k) => { const d = Math.abs(it.u - u); if (d < bd) { bd = d; ci = k; } });
                if (ci >= 0) { it.ci = ci; pairs.push({ u: colU[ci], v: rowV[it.ri], x: it.x, y: it.y, it }); }
            }
            let Hm = fitHomography(pairs.length >= 6 ? pairs : []);
            if (Hm) { const good = pairs.filter(p => { const q = Hm(p.u, p.v); return Math.hypot(q.x - p.x, q.y - p.y) < R0 * 0.6; }); if (good.length >= 6) Hm = fitHomography(good) || Hm; }
            const map = Hm || ((u, v) => ({ x: u * ct - v * st, y: u * st + v * ct }));
            const cell = new Map(); pairs.forEach(p => cell.set(p.it.ri + ',' + p.it.ci, p.it));
            const grid = []; let nDet = 0;
            for (let r = 0; r < ROWS; r++) {
                grid.push([]);
                for (let c = 0; c < NCOL; c++) {
                    let p = map(colU[c], rowV[r]);
                    const det = cell.get(r + ',' + c), use = det && Math.hypot(det.x - p.x, det.y - p.y) < R0 * 0.6;
                    if (use) { p = { x: det.x, y: det.y }; nDet++; }
                    grid[r].push({ x: p.x, y: p.y, r: R0, d: darkness(g, W, H, p.x, p.y, R0), detected: !!use });
                }
            }
            // kisi yang sebagian besar sel-nya tebakan (tidak ada bulatan) = bukan tabel jawaban ini
            if (nDet < ROWS * NCOL * (opt.minDet ?? 0.45)) return bad(`Hanya ${Math.round(nDet / (ROWS * NCOL) * 100)}% bulatan cocok dengan kisi ${L.questions} soal.`);
            return { ok: true, grid, R0, th, cands, rebuilt, map, colU, rowV, quality: nDet / (ROWS * NCOL) };
        }
    }

    // ---- LJK lama: arah otomatis (0/90/180/270)
    function rotateImg(img, deg) {
        const { width: w, height: h, data: d } = img;
        if (!deg) return img;
        const W = deg % 180 ? h : w, H = deg % 180 ? w : h, o = new Uint8ClampedArray(W * H * 4);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            let X, Y;
            if (deg === 90) { X = h - 1 - y; Y = x; } else if (deg === 180) { X = w - 1 - x; Y = h - 1 - y; } else { X = y; Y = w - 1 - x; }
            const si = (y * w + x) * 4, ti = (Y * W + X) * 4;
            o[ti] = d[si]; o[ti + 1] = d[si + 1]; o[ti + 2] = d[si + 2]; o[ti + 3] = 255;
        }
        return { width: W, height: H, data: o };
    }
    function shrinkImg(img, maxSide) {
        const s = Math.min(1, maxSide / Math.max(img.width, img.height));
        if (s === 1) return img;
        const W = Math.max(1, Math.round(img.width * s)), H = Math.max(1, Math.round(img.height * s)), o = new Uint8ClampedArray(W * H * 4);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const si = (Math.min(img.height - 1, Math.floor(y / s)) * img.width + Math.min(img.width - 1, Math.floor(x / s))) * 4, ti = (y * W + x) * 4;
            o[ti] = img.data[si]; o[ti + 1] = img.data[si + 1]; o[ti + 2] = img.data[si + 2]; o[ti + 3] = 255;
        }
        return { width: W, height: H, data: o };
    }
    // nomor soal ("1.", "2." ...) selalu di KIRI kolom A: bandingkan tinta kiri vs kanan tiap blok (relatif kertas setempat)
    function legacyCue(r) {
        const g = r.debug.g, W = r.debug.W, H = r.debug.H, geo = r.geo, R = geo.R0, L = geo.layout;
        const ink = (u, v) => {
            const vals = [], inn = [];
            for (let dv = -1.6; dv <= 1.6; dv += 0.2) for (let du = -1.6; du <= 1.6; du += 0.2) {
                const p = geo.map(u + du * R, v + dv * R), x = Math.round(p.x), y = Math.round(p.y);
                if (x < 0 || y < 0 || x >= W || y >= H) continue;
                const val = g[y * W + x]; vals.push(val);
                if (Math.abs(du) <= 0.8 && Math.abs(dv) <= 0.7) inn.push(val);
            }
            if (!inn.length) return 0;
            vals.sort((a, b) => a - b);
            const paper = vals[Math.floor(vals.length * 0.9)] || 1;
            return inn.filter(x => x < paper * 0.7).length / inn.length;
        };
        // diukur di CELAH antarkolom saja (D blok b | A blok b+1): bebas dari garis bingkai tabel di tepi kiri/kanan
        let left = 0, right = 0;
        for (let b = 0; b + 1 < L.blocks; b++) for (const v of geo.rowV) {
            left += ink(geo.colU[(b + 1) * L.options] - 2.4 * R, v);
            right += ink(geo.colU[b * L.options + L.options - 1] + 2.4 * R, v);
        }
        return { left, right, flipped: right > left * 1.15 && right - left > 0.15 };
    }
    // LJK lama dari arah mana pun: arah dipilih pada salinan kecil, lalu diproses penuh sekali
    // tata letak LJK lama yang dikenal. 25 dicoba DULU: kisi 20 bisa "muat" di sebagian lembar 25, tidak sebaliknya.
    const LEGACY_LAYOUTS = [{ questions: 25, blocks: 5, options: 4 }, { questions: 20, blocks: 4, options: 4 }];
    function processMarkerlessAuto(img, opt = {}) {
        // 1) salinan kecil (longgar): kandidat arah 0/90/270 x tata letak; 2) resolusi penuh (ketat) memastikan
        const layouts = opt.layouts || [opt.layout || null];
        const small = shrinkImg(img, 1000);
        let rot = null, im = null, r = null, first = null;
        search: for (const deg of [0, 90, 270]) {
            const s = rotateImg(small, deg);
            for (const L of layouts) {
                if (!processMarkerless(s, Object.assign({}, opt, { layout: L, minDet: 0.3 })).success) continue;
                const o = Object.assign({}, opt, { layout: L }), imF = rotateImg(img, deg), rF = processMarkerless(imF, o);
                if (rF.success) { rot = deg; im = imF; r = rF; opt = o; break search; }
                if (!first) first = rF;
            }
        }
        // Foto jauh kadang kehilangan pola pada salinan 1000px, meski pola masih
        // bisa ditemukan pada foto 1600px. Jika penyaringan cepat gagal, ulangi
        // semua tata letak pada resolusi penuh sebelum menyimpulkan gagal.
        // Jalur ini hanya dijalankan pada kasus sulit (lebih lambat, tetapi aman).
        if (rot == null) {
            fullSearch: for (const deg of [0, 90, 270]) {
                const full = rotateImg(img, deg);
                for (const L of layouts) {
                    const options = Object.assign({}, opt, { layout: L });
                    const probe = processMarkerless(full, options);
                    if (!probe.success) { if (!first) first = probe; continue; }
                    rot = deg; im = full; r = probe; opt = options;
                    break fullSearch;
                }
            }
        }
        if (rot == null) return first || processMarkerless(img, Object.assign({}, opt, { layout: layouts[layouts.length - 1] }));
        // cek terbalik 180 dari letak nomor soal (butuh detail, jangan di salinan kecil)
        if (r.success && legacyCue(r).flipped) {
            const rot2 = (rot + 180) % 360, im2 = rotateImg(img, rot2), r2 = processMarkerless(im2, opt);
            if (r2.success) { rot = rot2; im = im2; r = r2; }
        }
        r.image = im; r.rotation = rot;
        if (rot && r.success) r.warnings.push(`LJK lama diputar ${rot}° secara otomatis.`);
        return r;
    }

    // =================================================================
    // 8. Pelurusan & potongan
    // =================================================================
    // mapper: fungsi (u,v) -> titik di citra kerja; scale = skala kerja; gambar hasil gray atau RGB
    function sampleRect(img, mapper, scale, u1, v1, u2, v2, outW, opt = {}) {
        const k = outW / (u2 - u1), outH = Math.max(1, Math.round((v2 - v1) * k));
        const rgb = !!opt.rgb, out = new Uint8ClampedArray(outW * outH * (rgb ? 4 : 1));
        const sw = img.width, sh = img.height, d = img.data, inv = 1 / scale;
        for (let oy = 0; oy < outH; oy++) {
            const v = v1 + oy / k;
            for (let ox = 0; ox < outW; ox++) {
                const p = mapper(u1 + ox / k, v);
                const x = p.x * inv, y = p.y * inv, x0 = Math.floor(x), y0 = Math.floor(y);
                let R = 255, G = 255, B = 255;
                if (x0 >= 0 && y0 >= 0 && x0 < sw - 1 && y0 < sh - 1) {
                    const fx = x - x0, fy = y - y0, q00 = (y0 * sw + x0) * 4, q10 = q00 + 4, q01 = q00 + sw * 4, q11 = q01 + 4;
                    const bl = (c) => (d[q00 + c] * (1 - fx) + d[q10 + c] * fx) * (1 - fy) + (d[q01 + c] * (1 - fx) + d[q11 + c] * fx) * fy;
                    R = bl(0); G = bl(1); B = bl(2);
                }
                const o = oy * outW + ox;
                if (rgb) { out[o * 4] = R; out[o * 4 + 1] = G; out[o * 4 + 2] = B; out[o * 4 + 3] = 255; }
                else out[o] = (R * 77 + G * 150 + B * 29) / 256;
            }
        }
        return { w: outW, h: outH, data: out, k, toOut: (u, v) => ({ x: (u - u1) * k, y: (v - v1) * k }) };
    }

    // potongan lurus dalam ruang mm (mode marker) memakai homografi per blok bila di area PG
    function mmMapper(geo) {
        const P = geo.spec.pg;
        return (u, v) => {
            if (v >= P.frame[1] && v <= P.frame[3]) {
                const b = clamp(Math.floor((u - P.x0 + 2) / P.blockW), 0, P.blocks - 1);
                return geo.blocks[b](u, v);
            }
            return geo.H.fwd(u, v);
        };
    }
    function rectifyMM(img, geo, rect, outW, opt) {
        const [u1, v1, u2, v2] = rect;
        return sampleRect(img, mmMapper(geo), geo.scale, u1, v1, u2, v2, outW, opt);
    }
    // potongan debug untuk mode tanpa marker (satuan kanonik kisi)
    function rectifyLattice(img, geo, outW) {
        const { colU, rowV } = geo, U0 = colU[0], GW = colU[colU.length - 1] - colU[0], V0 = rowV[0];
        const r = sampleRect(img, geo.map, geo.scale, U0 - 0.075 * GW, V0 - 0.325 * GW, U0 + 1.045 * GW, rowV[rowV.length - 1] + 0.045 * GW, outW);
        return r;
    }
    function identLattice(img, geo, outW) {
        const { colU, rowV } = geo, U0 = colU[0], GW = colU[colU.length - 1] - colU[0], V0 = rowV[0];
        return sampleRect(img, geo.map, geo.scale, U0 - 0.078 * GW, V0 - 0.300 * GW, U0 + 0.470 * GW, V0 - 0.148 * GW, outW);
    }

    // tingkat terang kertas per kolom (persentil 85 dalam jendela ±win px) -> tahan bayangan
    function localPaper(lum, w, h, win) {
        const step = Math.max(4, win >> 1), paper = new Float32Array(w);
        const anchors = [];
        for (let x0 = 0; x0 < w; x0 += step) {
            const vals = [];
            for (let y = 0; y < h; y += 2) for (let x = Math.max(0, x0 - win); x < Math.min(w, x0 + win); x += 2) vals.push(lum[y * w + x]);
            vals.sort((a, b) => a - b);
            anchors.push({ x: x0, v: vals[Math.floor(vals.length * 0.85)] || 255 });
        }
        for (let x = 0; x < w; x++) {
            const i = Math.min(anchors.length - 1, Math.floor(x / step)), a = anchors[i], b = anchors[Math.min(anchors.length - 1, i + 1)];
            const t = b.x > a.x ? (x - a.x) / (b.x - a.x) : 0;
            paper[x] = a.v + (b.v - a.v) * clamp(t, 0, 1);
        }
        return paper;
    }

    // potongan kolom identitas F4 untuk OCR: nama, nomor, kelas — kotak isian (merah muda) dihapus
    function identityStrips(img, geo, pxPerMm = 12) {
        const spec = geo.spec, out = {};
        for (const key of ['nama', 'nomor', 'kelas']) {
            const f = spec.ident[key];
            const rect = [f.x - 1, f.y - 1.2, f.x + f.n * f.cw + 1, f.y + f.h + 1.2];
            const s = rectifyMM(img, geo, rect, Math.round((rect[2] - rect[0]) * pxPerMm), { rgb: true });
            // dropout: garis kotak merah muda / terang relatif kertas SETEMPAT -> putih; tahan bayangan
            const n = s.w * s.h, lum = new Uint8ClampedArray(n);
            for (let i = 0; i < n; i++) { const r = s.data[i * 4], g = s.data[i * 4 + 1], b = s.data[i * 4 + 2]; lum[i] = (r * 77 + g * 150 + b * 29) >> 8; }
            const paper = localPaper(lum, s.w, s.h, Math.round(pxPerMm * 4));
            for (let i = 0; i < n; i++) {
                const x = i % s.w, pp = Math.max(1, paper[x]), r = s.data[i * 4] + 1, g = s.data[i * 4 + 1] + 1, b = s.data[i * 4 + 2] + 1;
                const rel = lum[i] / pp;
                // kotak isian dicetak merah muda: buang piksel kemerahan (pulpen biru/hitam & pensil tidak kemerahan)
                const pinkish = r / g > 1.12 && r / b > 1.04 && rel > 0.55;
                // pemetaan bertahap: >= 0.82 putih, <= 0.45 hitam (tulisan buram tetap terbaca)
                const v = pinkish ? 255 : clamp(Math.round((rel - 0.45) / 0.37 * 255), 0, 255);
                s.data[i * 4] = s.data[i * 4 + 1] = s.data[i * 4 + 2] = v;
            }
            // tinta sedikit = kosong
            let ink = 0; for (let i = 0; i < n; i++) if (s.data[i * 4] < 160) ink++;
            s.inkRatio = ink / n;
            out[key] = s;
        }
        return out;
    }

    const api = { LEGACY_LAYOUTS, processMarker, processMarkerAuto, processMarkerless, processMarkerlessAuto, legacyCue, rotateImg, shrinkImg, detectMarkersFast, rectifyMM, rectifyLattice, identLattice, identityStrips, sampleRect, mmMapper, decide, _internal: { toGray, adaptiveThreshold, components, solidSquares, fitHomography, darkness } };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.LJKEngine = api;
})(typeof self !== 'undefined' ? self : this);
