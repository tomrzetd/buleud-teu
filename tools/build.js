// Build: (1) web/dist/buleud-teu.html satu file (tanpa service worker; untuk hosting sederhana)
//        (2) apps-script/dist/BuleudTeu_lengkap.gs (Code.gs + Statistik.gs + Laporan.gs dalam satu file untuk ditempel)
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(R, 'web/index.html'), 'utf8').replace(/<script src="js\/([\w-]+\.js)"><\/script>/g, (_, f) =>
    '<script>\n' + fs.readFileSync(path.join(R, 'web/js', f), 'utf8').replace(/<\/script>/g, '<\\/script>') + '\n</script>');
fs.mkdirSync(path.join(R, 'web/dist'), { recursive: true });
fs.writeFileSync(path.join(R, 'web/dist/buleud-teu.html'), html);
fs.mkdirSync(path.join(R, 'apps-script/dist'), { recursive: true });
fs.writeFileSync(path.join(R, 'apps-script/dist/BuleudTeu_lengkap.gs'),
    '// ===== Buleud Teu V40 — file tunggal (hasil build Code.gs + Statistik.gs + Laporan.gs). Tempel seluruh isi ke Code.gs =====\n\n' +
    fs.readFileSync(path.join(R, 'apps-script/Code.gs'), 'utf8') + '\n\n' + fs.readFileSync(path.join(R, 'apps-script/Statistik.gs'), 'utf8') + '\n\n' + fs.readFileSync(path.join(R, 'apps-script/Laporan.gs'), 'utf8'));
// spesifikasi geometri dalam JSON (dipakai/diuji port Android)
const { SPEC, SPEC25, bubbleMM } = require('../web/js/ljk-spec.js');
const pos = []; for (let q = 0; q < 50; q++) for (let o = 0; o < 5; o++) pos.push([q, o, bubbleMM(q, o).x, bubbleMM(q, o).y]);
fs.writeFileSync(path.join(R, 'spec/ljk-f4-v1.json'), JSON.stringify({ spec: SPEC, bubbles: pos }, null, 1));
const pos25 = []; for (let q = 0; q < 25; q++) for (let o = 0; o < 4; o++) pos25.push([q, o, bubbleMM(q, o, SPEC25).x, bubbleMM(q, o, SPEC25).y]);
fs.writeFileSync(path.join(R, 'spec/ljk-f4-25-v1.json'), JSON.stringify({ spec: SPEC25, bubbles: pos25 }, null, 1));
const { SPEC_SMPN2_25 } = require('../web/js/ljk-spec.js');
const posS = []; for (let q = 0; q < 25; q++) for (let o = 0; o < 4; o++) { const b = bubbleMM(q, o, SPEC_SMPN2_25); posS.push([q, o, b.x, b.y]); }
fs.writeFileSync(path.join(R, 'spec/ljk-f4-25-smpn2.json'), JSON.stringify({ spec: SPEC_SMPN2_25, bubbles: posS }, null, 1));
console.log('build ok: web/dist/buleud-teu.html, apps-script/dist/BuleudTeu_lengkap.gs, spec/ljk-f4-v1.json, spec/ljk-f4-25-v1.json, spec/ljk-f4-25-smpn2.json');
