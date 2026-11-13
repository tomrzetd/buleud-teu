/*
 * Buleud Teu — spesifikasi geometri LJK F4 (sumber tunggal).
 * Semua ukuran dalam milimeter, titik (0,0) = pojok kiri atas kertas F4 215 x 330 mm.
 * Dipakai oleh: renderer template (ljk-template.js), engine (ljk-engine.js),
 * dan port Android (android/.../engine/LjkSpec.kt — harus identik, diuji tools/test).
 */
(function (root) {
    const SPEC = {
        id: 'F4-50-v1',
        page: { w: 215, h: 330 },
        markers: {
            corner: { size: 8, centers: [[10, 10], [205, 10], [205, 320], [10, 320]] }, // TL, TR, BR, BL
            mid: { size: 6, centers: [[8.5, 165], [206.5, 165]] },                      // kiri, kanan
            orient: { size: 4, center: [19, 8] }                                          // penanda arah (dekat TL)
        },
        pg: {
            questions: 50, blocks: 5, rows: 10,
            x0: 16, blockW: 36.6, numRight: 8.0, optOffset: 11, optPitch: 5.6,
            y0: 116, rowPitch: 8, r: 2.2,
            frame: [15, 104, 200, 194]          // x1, y1, x2, y2
        },
        ident: {
            nama:  { label: 'Nama Peserta',  x: 52,  y: 52, n: 26, cw: 5.6, h: 7 },
            nomor: { label: 'Nomor Peserta', x: 52,  y: 63, n: 10, cw: 5.6, h: 7 },
            kelas: { label: 'Kelas',         x: 150, y: 63, n: 6,  cw: 5.6, h: 7 },
            lines: [
                { label: 'Mata Pelajaran', x: 52, y: 81, x2: 125 },
                { label: 'Tanggal', x: 150, y: 81, x2: 199 },
                { label: 'Tanda Tangan', x: 52, y: 93, x2: 125 }
            ]
        },
        regions: {
            view: [12, 14, 203, 196],             // potongan debug: kop s/d bawah tabel PG
            ident: [14, 44, 201, 97]
        }
    };

    // Formulir bermarker 25 soal: marker + identitas SAMA dengan F4-50-v1,
    // tetapi 5 blok x 5 baris. PG berakhir pada y=155 mm, esai di bawah.
    const SPEC25 = {
        id: 'F4-25-ABCD-v1',
        page: SPEC.page,
        markers: SPEC.markers,
        ident: SPEC.ident,
        pg: Object.assign({}, SPEC.pg, {
            questions: 25, blocks: 5, rows: 5,
            frame: [15, 104, 200, 155]
        }),
        regions: { view: [12, 14, 203, 164], ident: SPEC.regions.ident }
    };

    const LETTERS = 'ABCDE';
    // posisi pusat bulatan soal q (0-based) opsi o (0=A) dalam mm
    function bubbleMM(q, o, spec = SPEC) {
        const p = spec.pg, b = Math.floor(q / p.rows), r = q % p.rows;
        return { x: p.x0 + b * p.blockW + p.optOffset + o * p.optPitch, y: p.y0 + r * p.rowPitch };
    }
    // kotak isian per huruf (comb) sebuah field identitas
    function combRect(field, spec = SPEC) {
        const f = spec.ident[field];
        return { x: f.x, y: f.y, w: f.n * f.cw, h: f.h };
    }

    const api = { SPEC, SPEC25, LETTERS, bubbleMM, combRect };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.LJKSpec = api;
})(typeof self !== 'undefined' ? self : this);
