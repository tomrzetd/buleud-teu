// Render template LJK F4 ke PDF (siap cetak) + PNG (untuk uji) memakai Chromium (Playwright).
// Pemakaian: node tools/render_templates.js [dpi]
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { renderLJK } = require('../web/js/ljk-template.js');

(async () => {
    const dpi = Number(process.argv[2] || 200);
    const outDir = path.join(__dirname, '..', 'templates');
    const testDir = path.join(__dirname, 'test', 'render');
    fs.mkdirSync(testDir, { recursive: true });
    const browser = await chromium.launch();
    const { renderLJKLama } = require('../web/js/ljk-template.js');
    for (const variant of ['ABCD', 'ABCDE', 'LAMA20']) {  // PNG uji: render/LJK_F4_<varian>_<dpi>dpi.png
        const svg = variant === 'LAMA20' ? renderLJKLama({ exam: { tahun: '2026-2027' } }) : renderLJK({ variant });
        fs.writeFileSync(path.join(outDir, `LJK_F4_${variant === 'LAMA20' ? 'TANPA_MARKER_20_ABCD' : variant}.svg`), svg);
        const html = `<!doctype html><html><head><style>@page{size:215mm 330mm;margin:0}html,body{margin:0;padding:0}svg{display:block}</style></head><body>${svg}</body></html>`;
        const page = await browser.newPage();
        await page.setContent(html);
        await page.pdf({ path: path.join(outDir, `LJK_F4_${variant === 'LAMA20' ? 'TANPA_MARKER_20_ABCD' : variant}.pdf`), width: '215mm', height: '330mm', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
        // PNG untuk pengujian engine
        const pxW = Math.round(215 / 25.4 * dpi), pxH = Math.round(330 / 25.4 * dpi);
        await page.setViewportSize({ width: pxW, height: pxH });
        await page.setContent(`<!doctype html><html><body style="margin:0">${svg.replace(/width="215mm" height="330mm"/, `width="${pxW}" height="${pxH}"`)}</body></html>`);
        await page.screenshot({ path: path.join(testDir, `LJK_F4_${variant}_${dpi}dpi.png`), clip: { x: 0, y: 0, width: pxW, height: pxH } });
        await page.close();
        console.log('ok', variant);
    }
    await browser.close();
})();
