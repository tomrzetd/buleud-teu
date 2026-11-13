/*
 * Buleud Teu — renderer template LJK F4 (SVG, satuan mm).
 * renderLJK({ variant:'ABCD'|'ABCDE', school:{nama, logo(dataURL)}, exam:{judul, mapel, tahun, tingkat} })
 * -> string <svg> 215x330 mm siap cetak (print dari browser / PDF via Chromium).
 */
(function (root) {
    const S = (typeof module !== 'undefined' && module.exports) ? require('./ljk-spec.js') : root.LJKSpec;
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    function renderLJK(opt = {}) {
        const compact = opt.layout === 'MARKER25';
        const spec = compact ? S.SPEC25 : S.SPEC, P = spec.pg, M = spec.markers;
        const variant = opt.variant === 'ABCDE' ? 'ABCDE' : 'ABCD';
        const nOpt = variant.length;
        const school = opt.school || {}, exam = opt.exam || {};
        const INK = '#111', GRAY = '#555', LIGHT = '#9aa7b8', DROP = '#b9c8dc', PINK = '#f0a6b6'; // PINK = warna dropout kotak isian (aman untuk pulpen biru/hitam & pensil)
        const out = [];
        const T = (x, y, s, size = 3, o = {}) => out.push(`<text x="${x}" y="${y}" font-size="${size}" font-family="DejaVu Sans, Arial, Helvetica, sans-serif"${o.anchor ? ` text-anchor="${o.anchor}"` : ''}${o.bold ? ' font-weight="bold"' : ''} fill="${o.fill || INK}">${esc(s)}</text>`);
        const R = (x, y, w, h, o = {}) => out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}"${o.rx ? ` rx="${o.rx}"` : ''} fill="${o.fill || 'none'}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw || 0.3}"` : ''}/>`);
        const Lh = (x1, y, x2, o = {}) => out.push(`<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${o.stroke || INK}" stroke-width="${o.sw || 0.25}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}/>`);

        // ---- marker (hitam penuh)
        const sq = (c, s) => R(c[0] - s / 2, c[1] - s / 2, s, s, { fill: '#000' });
        M.corner.centers.forEach(c => sq(c, M.corner.size));
        M.mid.centers.forEach(c => sq(c, M.mid.size));
        sq(M.orient.center, M.orient.size);

        // ---- kop
        if (opt.school && school.logo) out.push(`<image href="${esc(school.logo)}" x="16" y="16" width="22" height="22" preserveAspectRatio="xMidYMid meet"/>`);
        else { R(16, 16, 22, 22, { stroke: LIGHT, sw: 0.3, rx: 1.5 }); T(27, 28.2, 'LOGO', 2.6, { anchor: 'middle', fill: LIGHT }); }
        T(107.5, 21.5, 'LEMBAR JAWABAN', 5, { anchor: 'middle', bold: true });
        T(107.5, 28, school.nama || 'NAMA SEKOLAH ............................................', 3.6, { anchor: 'middle', bold: true });
        T(107.5, 33.5, exam.judul || 'PENILAIAN ........................................', 3.1, { anchor: 'middle' });
        T(107.5, 38.4, `TAHUN PELAJARAN ${exam.tahun || '..........'}${exam.mapel ? '  •  ' + exam.mapel : ''}`, 2.8, { anchor: 'middle', fill: GRAY });
        // Varian 25: QR vektor di bidang header kanan, di LUAR tujuh marker.
        // Terkode hanya ID profil, tidak ada data siswa. Animasi HUD tidak dicetak.
        if (compact) {
            const qrRows = `00000000000000000000000000000
00000000000000000000000000000
00111111100011011010111111100
00100000100001111100100000100
00101110101110101000101110100
00101110100011000010101110100
00101110101111100000101110100
00100000101000000010100000100
00111111101010101010111111100
00000000000010010110000000000
00010010101111110011011010000
00111011001000111100101111000
00011011111100100111010110000
00101011000111101000011011000
00000011110111011011110001100
00101101011001100110111101100
00000100110111100101010100000
00001111001100111101110111100
00111000101000000111111110100
00000000001101111010001100100
00111111100001001010101110000
00100000100001111110001111000
00101110101010001011111010100
00101110100010001001100111100
00101110100100010011000011000
00100000101001101111001111000
00111111100001101101011111100
00000000000000000000000000000
00000000000000000000000000000`.trim().split('\n');
            R(176, 16, 23, 23, { fill: '#fff' });
            const cell = 23 / 29;
            qrRows.forEach((row, iy) => {
                for (let ix = 0; ix < row.length; ix++) if (row[ix] === '1') {
                    R(176 + ix * cell, 16 + iy * cell, cell + 0.004, cell + 0.004, { fill: '#000' });
                }
            });
        } else {
            R(176, 16, 23, 22, { stroke: GRAY, sw: 0.3, rx: 1.5 });
            T(187.5, 22, 'LJK F4 • 50 SOAL', 2.1, { anchor: 'middle', fill: GRAY });
            T(187.5, 30.5, variant, 5.2, { anchor: 'middle', bold: true });
            T(187.5, 35.5, spec.id, 1.9, { anchor: 'middle', fill: GRAY });
        }
        Lh(14, 41, 201, { sw: 0.5 }); Lh(14, 42.2, 201, { sw: 0.2 });

        // ---- identitas (kotak per huruf merah muda = warna dropout, dihapus engine sebelum OCR)
        T(16, 47.6, 'Tulis dengan HURUF KAPITAL, satu huruf per kotak, pakai pulpen/pensil gelap.', 2.3, { fill: GRAY });
        const comb = (field) => {
            const f = spec.ident[field];
            for (let i = 0; i < f.n; i++) R(f.x + i * f.cw, f.y, f.cw, f.h, { stroke: PINK, sw: 0.35 });
        };
        T(16, 57, 'Nama Peserta', 3); comb('nama');
        T(16, 68, 'Nomor Peserta', 3); comb('nomor');
        T(136, 68, 'Kelas', 3); comb('kelas');
        spec.ident.lines.forEach(l => {
            T(l.x === 52 ? 16 : l.x - 16, l.y, l.label, 3);
            Lh(l.x, l.y + 0.6, l.x2, { stroke: GRAY, sw: 0.2, dash: '0.6 0.6' });
        });

        // ---- pilihan ganda
        T(15, 101.5, 'I. PILIHAN GANDA', 3.4, { bold: true });
        T(200, 101.5, 'Hitamkan PENUH satu bulatan. Jangan menyilang.', 2.3, { anchor: 'end', fill: GRAY });
        const [fx1, fy1, fx2, fy2] = P.frame;
        R(fx1, fy1, fx2 - fx1, fy2 - fy1, { stroke: INK, sw: 0.35, rx: 1 });
        for (let b = 1; b < P.blocks; b++) {
            const x = P.x0 + b * P.blockW + 1.0;
            out.push(`<line x1="${x}" y1="${fy1 + 3}" x2="${x}" y2="${fy2 - 3}" stroke="${DROP}" stroke-width="0.2"/>`);
        }
        for (let q = 0; q < P.questions; q++) {
            const p0 = S.bubbleMM(q, 0, spec);
            T(P.x0 + Math.floor(q / P.rows) * P.blockW + P.numRight, p0.y + 1.05, `${q + 1}.`, 2.6, { anchor: 'end', bold: true });
            for (let o = 0; o < nOpt; o++) {
                const p = S.bubbleMM(q, o, spec);
                out.push(`<circle cx="${p.x}" cy="${p.y}" r="${P.r}" fill="none" stroke="${GRAY}" stroke-width="0.3"/>`);
                T(p.x, p.y + 0.85, S.LETTERS[o], 2.3, { anchor: 'middle', fill: LIGHT });
            }
        }

        // ---- esai / catatan
        if (compact) {
            // Bebas garis: semua area di bawah panel PG adalah ruang uraian.
            // Mid-marker pada y=165 berada di luar area tulis, di tepi x=8.5 / x=206.5.
            T(15, 165, 'II. ESAI / CATATAN', 3.4, { bold: true });
            T(200, 165, 'Jawab sesuai nomor soal. Gunakan area kosong di bawah.', 2.3, { anchor: 'end', fill: GRAY });
            T(200, 312, 'SMPN 2 JALAKSANA • ASAS 2026/2027 • 25 SOAL ABCD', 2, { anchor: 'end', fill: LIGHT });
        } else {
            T(15, 203, 'II. ESAI / CATATAN', 3.4, { bold: true });
            for (let y = 211; y <= 296; y += 8.5) Lh(15, y, 200, { stroke: DROP, sw: 0.2 });
            R(15, 300, 60, 11, { stroke: GRAY, sw: 0.3, rx: 1 }); T(17, 304, 'Nilai', 2.4, { fill: GRAY });
            R(80, 300, 60, 11, { stroke: GRAY, sw: 0.3, rx: 1 }); T(82, 304, 'Paraf Guru', 2.4, { fill: GRAY });
            T(200, 309.5, 'Buleud Teu • "Mun buleud, ku urang dipariksa!"', 2, { anchor: 'end', fill: LIGHT });
        }

        return `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.page.w}mm" height="${spec.page.h}mm" viewBox="0 0 ${spec.page.w} ${spec.page.h}">` +
            `<rect width="100%" height="100%" fill="#fff"/>${out.join('')}</svg>`;
    }

    /*
     * LJK LAMA (tanpa marker) ukuran F4 — 20 soal (4 kolom x 5 baris) atau 25 soal (5 kolom x 5 baris), opsi A-D,
     * nomor turun per kolom. Proporsi diukur dari LJK PSAS sekolah (lebar tabel 185 mm), sehingga dibaca oleh engine
     * mode tanpa marker dan potongan OCR identitas (identLattice) tanpa perubahan. Satuan mm.
     */
    const LAMA = {
        ax: 24.67, blockPitch: 50.52, optPitch: 6.51, y0: 86.3, rowPitch: 6.68, r: 2.75,
        frame: [15, 75.5, 200, 118.6], instrBottom: 81.3
    };
    // 25 soal: 5 kolom @37 mm di tabel yang sama (bulatan, baris & tinggi tabel identik)
    const LAMA25 = Object.assign({}, LAMA, { ax: 26.85, blockPitch: 37 });
    function renderLJKLama(opt = {}) {
        const school = opt.school || {}, exam = opt.exam || {}, N = opt.questions === 25 ? 25 : 20, G = N === 25 ? LAMA25 : LAMA;
        const BLUE = '#2f62b0', INK = '#1f2937', GRAY = '#4b5563', LIGHT = '#7b8db0';
        const out = [];
        const T = (x, y, s, size = 3, o = {}) => out.push(`<text x="${x}" y="${y}" font-size="${size}" font-family="DejaVu Sans, Arial, Helvetica, sans-serif"${o.anchor ? ` text-anchor="${o.anchor}"` : ''}${o.bold ? ' font-weight="bold"' : ''} fill="${o.fill || INK}">${esc(s)}</text>`);
        const L = (x1, y1, x2, y2, o = {}) => out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o.stroke || INK}" stroke-width="${o.sw || 0.25}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}/>`);
        // kop
        if (school.logo) out.push(`<image href="${esc(school.logo)}" x="15" y="12" width="18" height="18" preserveAspectRatio="xMidYMid meet"/>`);
        T(107.5, 20.8, 'LEMBAR JAWABAN', 5.2, { anchor: 'middle', bold: true, fill: BLUE });
        T(107.5, 26.8, exam.judul || 'PENILAIAN SUMATIF AKHIR SEMESTER (PSAS)', 3.5, { anchor: 'middle', bold: true, fill: BLUE });
        T(107.5, 32.2, `TAHUN PELAJARAN ${exam.tahun || '..........'}`, 3.5, { anchor: 'middle', bold: true, fill: BLUE });
        L(13, 34.9, 202, 34.9, { stroke: BLUE, sw: 0.55 }); L(13, 36.1, 202, 36.1, { stroke: BLUE, sw: 0.25 });
        // identitas (kiri: label : garis; kanan: label : garis)
        [['Nomor Peserta', 42.8], ['Nama Peserta', 48.4], ['Kelas', 53.9], ['Mata Pelajaran', 59.5]].forEach(([t, y]) => {
            T(15, y, t, 3.5, { fill: GRAY }); T(45.1, y, ':', 3.5, { fill: GRAY }); L(46.3, y + 0.6, 100.8, y + 0.6, { stroke: GRAY, sw: 0.3 });
        });
        [['Sekolah Asal', 42.8], ['Hari / Tanggal', 48.4], ['Waktu', 53.9]].forEach(([t, y]) => {
            T(114.7, y, t, 3.5, { fill: GRAY }); T(143.6, y, ':', 3.5, { fill: GRAY }); L(144.8, y + 0.6, 195.8, y + 0.6, { stroke: GRAY, sw: 0.3 });
        });
        // pilihan ganda
        T(13.6, 73.6, 'I. PILIHAN GANDA', 3.7, { bold: true, fill: BLUE });
        const [fx1, fy1, fx2, fy2] = G.frame;
        out.push(`<rect x="${fx1}" y="${fy1}" width="${fx2 - fx1}" height="${fy2 - fy1}" fill="none" stroke="${GRAY}" stroke-width="0.45"/>`);
        L(fx1, G.instrBottom, fx2, G.instrBottom, { stroke: GRAY, sw: 0.35 });
        T(107.5, 79.3, 'Hitamkan penuh satu bulatan pada jawaban yang benar!', 2.6, { anchor: 'middle', bold: true, fill: INK });
        for (let q = 0; q < N; q++) {
            const b = Math.floor(q / 5), r = q % 5, xa = G.ax + b * G.blockPitch, y = G.y0 + r * G.rowPitch;
            T(xa - 4.4, y + 1.2, `${q + 1}.`, 3.3, { anchor: 'end', fill: GRAY });
            for (let o = 0; o < 4; o++) {
                const x = xa + o * G.optPitch;
                out.push(`<circle cx="${x}" cy="${y}" r="${G.r - 0.25}" fill="none" stroke="${GRAY}" stroke-width="0.45"/>`);
                T(x, y + 0.95, 'ABCD'[o], 2.7, { anchor: 'middle', fill: LIGHT });
            }
        }
        // esai
        T(13.6, 126.5, 'II. ESSAY', 3.7, { bold: true, fill: BLUE });
        for (let y = 135; y <= 312; y += 8.5) L(15, y, 200, y, { stroke: '#9ca3af', sw: 0.22, dash: '0.7 0.9' });
        T(200, 322, `Buleud Teu • LJK ${N} soal tanpa marker (F4)`, 2, { anchor: 'end', fill: '#b6bfcc' });
        return `<svg xmlns="http://www.w3.org/2000/svg" width="215mm" height="330mm" viewBox="0 0 215 330"><rect width="100%" height="100%" fill="#fff"/>${out.join('')}</svg>`;
    }

    function renderLJK25(opt = {}) {
        return renderLJK(Object.assign({}, opt, { variant: 'ABCD', layout: 'MARKER25' }));
    }

    const api = { renderLJK, renderLJK25, renderLJKLama, LAMA, LAMA25 };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.LJKTemplate = api;
})(typeof self !== 'undefined' ? self : this);
