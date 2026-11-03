// Uji engine mode marker pada semua kasus sintetis. Pemakaian: node tools/test/run_engine.js [filter]
const fs = require('fs'), path = require('path');
const E = require('../../web/js/ljk-engine.js');
const meta = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases', 'meta.json')));
const filter = process.argv[2];
let pass = 0, total = 0;
const out = [];
for (const m of meta) {
    if (filter && !m.name.includes(filter)) continue;
    total++;
    const img = { width: m.w, height: m.h, data: new Uint8ClampedArray(fs.readFileSync(m.file)) };
    const t = Date.now();
    const r = E.processMarker(img, { options: m.options, active: m.active });
    const ms = Date.now() - t;
    if (!r.success) { console.log(`✗ ${m.name.padEnd(36)} GAGAL: ${r.error}`); out.push({ name: m.name, ok: false }); continue; }
    const got = r.answers.map(a => a || '-').join('');
    const wrong = [...m.expect].map((e, i) => e !== got[i] ? `${i + 1}:${got[i]}≠${e}` : null).filter(Boolean);
    const flags = r.status.map((s, i) => s !== 'ok' && s !== 'blank' ? `${i + 1}:${s}` : null).filter(Boolean);
    let ok = wrong.length === 0;
    if (m.flags.double) ok = ok && m.flags.double.every(q => r.status[q - 1] === 'double');
    if (m.flags.warnVariant) ok = ok && r.warnings.some(w => /ABCDE/.test(w));
    if (ok) pass++;
    const q = r.quality;
    console.log(`${ok ? '✓' : '✗'} ${m.name.padEnd(36)} ${String(m.expect.length - wrong.length).padStart(2)}/${m.expect.length} ` +
        `${ms}ms  kualitas ${q.grade}${q.score} skala ${q.pxPerMm}px/mm residu ${q.residMm}mm` +
        (wrong.length ? `  SALAH ${wrong.slice(0, 6).join(' ')}` : '') + (flags.length ? `  tanda ${flags.join(' ')}` : '') + (r.warnings.length ? `  ⚠ ${r.warnings.join(' | ')}` : ''));
    out.push({ name: m.name, ok, answers: got, status: r.status });
}
console.log(`\n${pass}/${total} kasus lolos`);
fs.writeFileSync(path.join(__dirname, 'cases', 'js_results.json'), JSON.stringify(out));
process.exitCode = pass === total ? 0 : 1;
