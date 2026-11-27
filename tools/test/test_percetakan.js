// Uji LJK percetakan 25 soal (F4-25-SMPN2) + deteksi otomatis jenis LJK.
// Pemakaian: python3 tools/test/gen_percetakan.py <scan_kosong.png> <dir> && node tools/test/test_percetakan.js <dir>
const fs = require('fs'), path = require('path');
const E = require('../../web/js/ljk-engine.js');
const dir = process.argv[2];
const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json')));
let pass = 0; const res = [];
for (const m of meta) {
    const img = { width: m.w, height: m.h, data: new Uint8ClampedArray(fs.readFileSync(m.file)) };
    const t = Date.now(), r = E.processMarkerAuto(img, { options: 4, active: 25 }), ms = Date.now() - t;
    const got = r.success ? r.answers.map((a, i) => r.status[i] === 'double' ? '*' : a || (r.status[i] === 'weak' && r.suggest[i] ? r.suggest[i].toLowerCase() : '-')).join('') : '';
    const wrong = [...m.expect].map((e, i) => e !== (got[i] || '?').toUpperCase() ? `${i + 1}:${got[i] || '?'}≠${e}` : null).filter(Boolean);
    const ragu = [...got].filter(c => /[a-d]/.test(c)).length;   // huruf kecil = 'ragu', ditandai untuk dicek guru dengan saran benar
    const ok = r.success && r.specId === 'F4-25-SMPN2' && !wrong.length;
    if (ok) pass++;
    res.push({ name: m.name, ok: r.success, answers: r.success ? r.answers.map(a => a || '-').join('') : '', status: r.status || [], spec: r.specId || '' });
    console.log(`${ok ? '✓' : '✗'} ${m.name.padEnd(18)} ${r.success ? `${25 - wrong.length}/25 ${r.specId} cocok ${Math.round((r.bubbleMatch ?? r.markerMatch) * 100)}% kualitas ${r.quality.grade}${r.quality.score} ${r.quality.pxPerMm}px/mm` : 'GAGAL ' + r.error} ${ms}ms${ragu ? ` ragu ${ragu} (saran benar)` : ''} ${wrong.slice(0, 6).join(' ')} (${m.note})`);
}
fs.writeFileSync(path.join(dir, 'js_results.json'), JSON.stringify(res));
fs.writeFileSync(path.join(dir, 'kt.tsv'), meta.map(m => [m.name, m.file, m.w, m.h, 4, 25].join('\t')).join('\n'));
console.log(`\nLJK percetakan: ${pass}/${meta.length}`);
process.exitCode = pass === meta.length ? 0 : 1;
