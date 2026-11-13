/**
 * Regression test: template F4 25 baru dan F4 50 lama tetap terbaca saat
 * kunci ujian dari Spreadsheet hanya berisi 20 jawaban.
 * Tanpa library gambar: halaman sintetis digambar langsung sebagai RGBA.
 */
const assert = require('node:assert/strict');
const S = require('../../web/js/ljk-spec.js');
const T = require('../../web/js/ljk-template.js');
const E = require('../../web/js/ljk-engine.js');

const svg = T.renderLJK25({
    school: { nama: 'SMPN 2 JALAKSANA' },
    exam: { judul: 'Asesmen Sumatif Akhir Semester (ASAS)', tahun: '2026/2027' }
});
const centers = [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)];
assert.equal(centers.length, 100, '25 pertanyaan × 4 bulatan');
for (let i = 0; i < centers.length; i++) {
    const p = S.bubbleMM(Math.floor(i / 4), i % 4, S.SPEC25);
    assert.ok(Math.abs(Number(centers[i][1]) - p.x) < 1e-6);
    assert.ok(Math.abs(Number(centers[i][2]) - p.y) < 1e-6);
}
assert.equal(S.SPEC25.pg.rows, 5);
assert.equal(S.SPEC25.pg.blocks, 5);
assert.deepEqual(S.SPEC25.markers, S.SPEC.markers);
assert.deepEqual(S.SPEC25.ident, S.SPEC.ident);
assert.ok(!svg.includes('>Nilai<') && !svg.includes('>Paraf Guru<'));
assert.equal((T.renderLJK({ variant: 'ABCD' }).match(/<circle /g) || []).length, 200);

const ppm = 3.5;
const W = Math.round(215 * ppm), H = Math.round(330 * ppm);
function sheet(layout, active = 20, printed = layout.pg.questions) {
    const data = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
        data[4 * i] = data[4 * i + 1] = data[4 * i + 2] = 255;
        data[4 * i + 3] = 255;
    }
    function dot(x, y, v) {
        const ix = Math.round(x), iy = Math.round(y);
        if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
        const k = (iy * W + ix) * 4;
        data[k] = data[k + 1] = data[k + 2] = v;
    }
    function square(x, y, size) {
        const x0 = Math.round((x - size / 2) * ppm), x1 = Math.round((x + size / 2) * ppm);
        const y0 = Math.round((y - size / 2) * ppm), y1 = Math.round((y + size / 2) * ppm);
        for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) dot(xx, yy, 0);
    }
    function circle(cx, cy, r, filled = false) {
        const x = cx * ppm, y = cy * ppm, rd = r * ppm;
        for (let yy = Math.floor(y - rd - 3); yy <= Math.ceil(y + rd + 3); yy++)
            for (let xx = Math.floor(x - rd - 3); xx <= Math.ceil(x + rd + 3); xx++) {
                const d = Math.hypot(xx - x, yy - y);
                if (Math.abs(d - rd) < 1.05 || (filled && d < rd - 0.4)) dot(xx, yy, filled ? 10 : 45);
            }
    }
    for (const c of S.SPEC.markers.corner.centers) square(c[0], c[1], 8);
    for (const c of S.SPEC.markers.mid.centers) square(c[0], c[1], 6);
    square(19, 8, 4);
    if (layout === S.SPEC25) {
        // QR baru turut dicetak pada lembar tes; jangan sampai disangka marker.
        const qrRects = [...svg.matchAll(/<rect x="([\\d.]+)" y="([\\d.]+)" width="([\\d.]+)" height="([\\d.]+)" fill="#000"/g)];
        for (const [, x0, y0, w0, h0] of qrRects) {
            const [x, y, ww, hh] = [Number(x0), Number(y0), Number(w0), Number(h0)];
            if (x < 176 || x >= 199 || y < 16 || y >= 39) continue;
            const left = Math.floor(x * ppm), right = Math.ceil((x + ww) * ppm);
            const top = Math.floor(y * ppm), bottom = Math.ceil((y + hh) * ppm);
            for (let yy = top; yy < bottom; yy++) for (let xx = left; xx < right; xx++) dot(xx, yy, 0);
        }
    }
    for (let q = 0; q < printed; q++) for (let o = 0; o < 4; o++) {
        const p = S.bubbleMM(q, o, layout);
        circle(p.x, p.y, layout.pg.r, q < active && o === q % 4);
    }
    return { width: W, height: H, data };
}

for (const scenario of [
    { layout: S.SPEC25, printed: 25, active: 20, expected: S.SPEC25.id },
    { layout: S.SPEC25, printed: 25, active: 25, expected: S.SPEC25.id },
    { layout: S.SPEC, printed: 50, active: 20, expected: S.SPEC.id },
    { layout: S.SPEC, printed: 25, active: 20, expected: S.SPEC.id }
]) {
    const { layout, printed, active, expected } = scenario;
    const r = E.processMarkerAuto(sheet(layout, active, printed), { options: 4, active, maxSide: 1155 });
    assert.ok(r.success, JSON.stringify(scenario) + ': ' + r.error);
    assert.equal(r.geo.spec.id, expected);
    assert.equal(r.answers.join(''), 'ABCD'.repeat(Math.ceil(active / 4)).slice(0, active));
    assert.ok(r.status.every(s => s === 'ok'));
    console.log('OK', expected, printed + ' cetak', active + ' kunci', r.quality.grade + r.quality.score);
}
// Tidak boleh bergantung pada orientasi foto (marker arah tetap sama).
for (const degrees of [180, 90]) {
    const img = E.rotateImg(sheet(S.SPEC25, 20, 25), degrees);
    const r = E.processMarkerAuto(img, { options: 4, active: 20, maxSide: 1155 });
    assert.ok(r.success, 'Rotasi ' + degrees + ' gagal: ' + r.error);
    assert.equal(r.geo.spec.id, S.SPEC25.id);
    assert.equal(r.answers.join(''), 'ABCD'.repeat(5));
    console.log('OK', 'form 25 rotasi', degrees + '°');
}
console.log('PASS marker25: vektor, identitas, auto 25/50, kunci 20/25');
