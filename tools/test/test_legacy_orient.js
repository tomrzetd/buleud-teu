// Uji LJK lama dari segala arah (0/90/180/270): jawaban harus tetap benar. Butuh foto uji LJK lama (di luar repo).
const fs = require('fs'), E = require('../../web/js/ljk-engine.js');
const meta = JSON.parse(fs.readFileSync(process.env.LEGACY_META || '/home/claude/test/cases/meta.json'));
let ok = 0, tot = 0;
for (const c of meta) {
    if (/ganda|pudar/.test(c.name)) continue;
    const img = { width: c.w, height: c.h, data: new Uint8ClampedArray(fs.readFileSync(c.file)) };
    const res = [];
    for (const deg of [0, 90, 180, 270]) {
        tot++;
        const r = E.processMarkerlessAuto(E.rotateImg(img, deg), { layouts: E.LEGACY_LAYOUTS });
        const got = r.success ? r.answers.map(a => a || '-').join('') : 'GAGAL';
        const pass = got === c.key; if (pass) ok++;
        res.push(`${deg}°${pass ? '✓' : '✗(' + got + ')'}`);
    }
    console.log(c.name.padEnd(40), res.join(' '));
}
console.log(`LJK lama segala arah: ${ok}/${tot}`);
process.exitCode = ok === tot ? 0 : 1;
