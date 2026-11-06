/*
 * Buleud Teu — IDENTITAS: urai teks OCR + cocokkan ke daftar siswa (pencocokan mirip, bukan persis)
 *  - LJK F4: OCR per kolom (nama/nomor/kelas) -> fromFields()
 *  - LJK lama: satu potongan berlabel -> parse()
 */
(function (root) {
const LJKIdent = (() => {
    const LABELS = [
        { key: 'nomor', re: /n[o0]m[o0]r|n[o0]\.?\s*peserta|n[o0]\.?\s*ujian/i },
        { key: 'nama',  re: /\bnama\b/i },
        { key: 'kelas', re: /\bke[l1i]as\b/i },
        { key: 'mapel', re: /mata\s*pe[l1i]|pe[l1i]ajaran|mapel/i }
    ];
    const RIGHT_COL = /sekolah|hari|tanggal|waktu/i;

    const clean = (s) => s.replace(/^[\s:;.,_\-–—|]+/, '').replace(/[_]{2,}.*$/, '').replace(/[\s:;.,_\-–—|]+$/, '').trim();

    // Ambil sisa baris setelah label (mis. "Nama Peserta : IBNU" -> "IBNU")
    function afterLabel(line) {
        const m = line.match(/(peserta|ujian|kelas|ke[l1i]as|pelajaran|pe[l1i]ajaran|mapel)\s*[:;.]?(.*)$/i);
        return m ? clean(m[2]) : '';
    }

    function parse(text) {
        const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
            .map(l => l.split(RIGHT_COL)[0].trim()).filter(Boolean);
        const out = { nomor: '', nama: '', kelas: '', mapel: '' };
        const order = [], loose = [];
        for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            const lab = LABELS.find(L => L.re.test(l) && !(L.key === 'nomor' && /\bnama\b/i.test(l)));
            if (lab) {
                const v = afterLabel(l);
                if (v && !out[lab.key]) out[lab.key] = v; else order.push(lab.key);
            } else {
                const v = clean(l);
                if (v && !/lembar|jawaban|penilaian|tahun/i.test(v)) loose.push(v);
            }
        }
        // label tanpa nilai di barisnya -> isi dari baris lepas menurut BENTUK nilainya (bukan sekadar urutan):
        // OCR sering menukar urutan baris, atau gagal membaca satu baris tulisan tangan.
        const sisa = [];
        for (const v of loose) {
            const t = isNomor(v) ? 'nomor' : isKelas(v) ? 'kelas' : isMapel(v) ? 'mapel' : isNama(v) ? (!out.nama && order.includes('nama') ? 'nama' : 'mapel') : '';
            if (t && order.includes(t) && !out[t]) out[t] = v; else sisa.push(v);
        }
        for (const k of order) if (!out[k] && sisa.length && cocok(k, sisa[0])) out[k] = sisa.shift();
        // tidak ada label sama sekali -> asumsikan urutan Nomor, Nama, Kelas, Mapel
        if (!out.nomor && !out.nama && !out.kelas && !out.mapel && sisa.length >= 3)
            ['nomor', 'nama', 'kelas', 'mapel'].forEach(k => { if (sisa.length) out[k] = sisa.shift(); });
        return rapikan(out);
    }

    // ---------- bentuk nilai ----------
    const cmp = (v) => String(v || '').toUpperCase().replace(/KELAS/g, '').replace(/[\s.]/g, '');
    const nDig = (v) => (String(v || '').match(/[0-9]/g) || []).length;
    const nHuruf = (v) => (String(v || '').match(/[A-Za-z]/g) || []).length;
    /** nomor peserta: >= 3 angka dan sebagian besar angka (09134, 7-001-23) */
    function isNomor(v) { const d = nDig(v); return d >= 3 && d >= 0.6 * (d + nHuruf(v)); }
    /** kelas SMP: 7A, 8 B, 9-C, VIII A, 7.1 */
    function isKelas(v) { const c = cmp(v); return c.length <= 6 && /^([0-9]{1,2}|VII|VIII|IX)[-]?[A-Z]?[0-9]?$/.test(c) && !isNomor(v); }
    /** nama mapel SMP (agar mapel tidak terbaca sebagai nama bila nama gagal dibaca) */
    const MAPEL_RE = /\b(informatika|matematika|ipa|ips|bahasa|indonesia|inggris|sunda|pkn|ppkn|pancasila|seni|budaya|pjok|penjas|agama|pai|prakarya|tik|fisika|biologi|bk)\b/i;
    function isMapel(v) { return MAPEL_RE.test(String(v || '')); }
    /** nama: minimal 3 huruf, didominasi huruf, bukan kelas/mapel */
    function isNama(v) { const h = nHuruf(v); return h >= 3 && h >= 0.7 * (h + nDig(v)) && !isKelas(v) && !isMapel(v); }
    function cocok(k, v) { return k === 'nomor' ? isNomor(v) || !isNama(v) : k === 'kelas' ? isKelas(v) : k === 'nama' ? isNama(v) : true; }
    /** pengaman akhir: nilai yang jelas salah tempat dipindah, yang tidak masuk akal dikosongkan */
    function rapikan(o) {
        if (o.kelas && !isKelas(o.kelas) && isNomor(o.kelas) && !o.nomor) { o.nomor = o.kelas; o.kelas = ''; }
        if (o.nama && !isNama(o.nama)) { if (isKelas(o.nama) && !o.kelas) o.kelas = o.nama; else if (isNomor(o.nama) && !o.nomor) o.nomor = o.nama; o.nama = ''; }
        if (o.nomor && !isNomor(o.nomor) && !(digits(o.nomor).length >= 3 && !isNama(o.nomor) && !isKelas(o.nomor))) { if (isKelas(o.nomor) && !o.kelas) o.kelas = o.nomor; else if (isNama(o.nomor) && !o.nama) o.nama = o.nomor; o.nomor = ''; }
        return o;
    }

    // ---------- kemiripan ----------
    function lev(a, b) {
        const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
        let prev = Array.from({ length: n + 1 }, (_, j) => j), cur = new Array(n + 1);
        for (let i = 1; i <= m; i++) {
            cur[0] = i;
            for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            [prev, cur] = [cur, prev];
        }
        return prev[n];
    }
    const normName = (s) => String(s || '').toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
    const normCls = (s) => String(s || '').toUpperCase().replace(/KELAS/g, '').replace(/[^A-Z0-9]/g, '')
        .replace(/^[O]/, '0').replace(/^[I|L]/, '1').replace(/^S(?=[A-Z])/, '5');
    const digits = (s) => String(s || '').toUpperCase().replace(/[OQ]/g, '0').replace(/[IL|]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/[^0-9]/g, '');
    const ratio = (a, b) => (!a || !b) ? 0 : 1 - lev(a, b) / Math.max(a.length, b.length);

    function nameSim(ocr, real) {
        const a = normName(ocr), b = normName(real);
        if (!a || !b) return 0;
        let s = Math.max(ratio(a, b), ratio(a.replace(/ /g, ''), b.replace(/ /g, '')));
        // cocokkan per kata (urutan bebas), berguna jika OCR hanya membaca sebagian nama
        const ta = a.split(' '), tb = b.split(' ');
        let tot = 0;
        ta.forEach((t, i) => { tot += Math.max(...tb.map(u => t.length === 1 && i === ta.length - 1 && i > 0 ? (u[0] === t ? 0.9 : 0) : ratio(t, u))); });   // inisial nama belakang: "DWI PUTRI M." = MAHARANI
        s = Math.max(s, (tot / ta.length) * Math.min(1, ta.length / tb.length + 0.25));
        return s;
    }

    // students: [{nama, kelas, nomor?}]
    function match(fields, students) {
        const res = { kelas: null, nama: null, kelasScore: 0, namaScore: 0, via: '', alternatives: [] };
        if (!students || !students.length) return res;
        // 1) nomor peserta (bila kolom No Peserta ada di Sheet)
        const nd = digits(fields.nomor);
        if (nd.length >= 3) {
            const hits = students.filter(s => s.nomor && digits(s.nomor) === nd);
            if (hits.length === 1) return Object.assign(res, { kelas: String(hits[0].kelas), nama: hits[0].nama, kelasScore: 1, namaScore: 1, via: 'nomor', alternatives: [{ nama: hits[0].nama, kelas: String(hits[0].kelas), skor: 1 }] });
        }
        // 2) kelas
        const classes = [...new Set(students.map(s => String(s.kelas)))];
        const oc = normCls(fields.kelas);
        if (oc) {
            const sc = classes.map(c => ({ c, s: normCls(c) === oc ? 1 : ratio(normCls(c), oc) })).sort((a, b) => b.s - a.s);
            if (sc[0].s >= 0.5 && (sc.length < 2 || sc[0].s > sc[1].s)) { res.kelas = sc[0].c; res.kelasScore = sc[0].s; }
        }
        // 3) nama (di dalam kelas terpilih; jika lemah, cari di semua siswa)
        const rank = (pool) => pool.map(s => ({ s, v: nameSim(fields.nama, s.nama) })).sort((a, b) => b.v - a.v);
        let r = res.kelas ? rank(students.filter(s => String(s.kelas) === res.kelas)) : [];
        if (!r.length || r[0].v < 0.55) {
            const all = rank(students);
            if (all.length && (!r.length || all[0].v > r[0].v + 0.1)) r = all;
        }
        if (r.length) {
            res.alternatives = r.slice(0, 3).map(x => ({ nama: x.s.nama, kelas: String(x.s.kelas), skor: +x.v.toFixed(2) }));
            const margin = r.length > 1 ? r[0].v - r[1].v : 1;
            if (r[0].v >= 0.55 && margin >= 0.06) {
                res.nama = r[0].s.nama; res.namaScore = r[0].v; res.via = 'nama';
                if (!res.kelas || res.kelas !== String(r[0].s.kelas)) { res.kelas = String(r[0].s.kelas); }
            }
        }
        return res;
    }

    // hasil OCR per kotak isian F4 -> field bersih
    function fromFields(t) {
        const one = (s) => String(s || '').replace(/\r?\n/g, ' ').replace(/[|_\[\]{}]/g, ' ').replace(/\s+/g, ' ').trim();
        return {
            nama: one(t.nama).toUpperCase().replace(/[0-9]/g, d => ({ '0': 'O', '1': 'I', '2': 'Z', '4': 'A', '5': 'S', '6': 'G', '8': 'B' }[d] || '')).replace(/[^A-Z' .-]/g, '').replace(/\s+/g, ' ').trim(),
            nomor: digits(one(t.nomor)),
            kelas: one(t.kelas).toUpperCase().replace(/[^A-Z0-9 -]/g, '').replace(/\s+/g, ''),
            mapel: ''
        };
    }

    return { parse, match, nameSim, normCls, digits, fromFields, isNomor, isKelas, isNama, isMapel };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = LJKIdent;
else root.LJKIdent = LJKIdent;
})(typeof self !== 'undefined' ? self : this);
