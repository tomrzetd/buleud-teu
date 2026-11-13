#!/usr/bin/env node
/**
 * Build-only Apps Script minifier. Never touch source Code/Statistik/Laporan.
 *
 * Deliberately conservative:
 *   - remove comments + redundant whitespace;
 *   - shorten only LOCAL identifiers, never top-level names or object props;
 *   - NEVER compress/rewrite/reorder logic;
 *   - preserve function names: Google menus/triggers/google.script.run use strings.
 *
 * Requires: npm install --no-save terser@5.44.1
 * Usage: node tools/minify_gas.js
 * Output: apps-script/dist/BuleudTeu_deploy_min.gs
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { minify } = require('terser');

const ROOT = path.resolve(__dirname, '..');
const SOURCES = ['Code.gs', 'Statistik.gs', 'Laporan.gs'];
const DIST = path.join(ROOT, 'apps-script', 'dist', 'BuleudTeu_deploy_min.gs');
const entrypoints = [
    'doGet', 'doPost', 'onOpen', 'setup',
    'menuAnalisis', 'menuBank', 'menuLaporan',
    'laporanPilihan', 'laporanDariMenu',
    'analisisUjian', 'bankSoal', 'buatLaporan'
];

async function main() {
    const source = SOURCES.map(name =>
        fs.readFileSync(path.join(ROOT, 'apps-script', name), 'utf8')
    ).join('\n;\n');

    const result = await minify(source, {
        module: false,
        toplevel: false,
        ecma: 2018,
        // KEEP algorithm, execution order, and Apps Script runtime calls intact.
        compress: false,
        mangle: { toplevel: false, keep_fnames: true, keep_classnames: true,
                  properties: false },
        format: { comments: false, beautify: false, semicolons: true,
                  ascii_only: false }
    });
    if (!result.code) throw Error('Terser produced no code');

    // Fail closed if Apps Script can no longer resolve global entrypoints,
    // menu handlers, and directly invoked report/analysis routines.
    const compact = result.code;
    const originalFunctions = [...source.matchAll(/(?:^|\n)function\s+([A-Za-z_$][\w$]*)\s*\(/g)]
        .map(m => m[1]);
    for (const name of new Set([...entrypoints, ...originalFunctions])) {
        if (!new RegExp('(?:^|[;}]|\\s)function\\s+' + name + '\\s*\\(').test(compact))
            throw Error('Function changed or absent in minified Apps Script: ' + name);
    }
    new vm.Script(compact, { filename: 'BuleudTeu_deploy_min.gs' });

    fs.mkdirSync(path.dirname(DIST), { recursive: true });
    fs.writeFileSync(DIST, compact + '\n');
    const hash = crypto.createHash('sha256').update(compact).digest('hex');
    console.log('SAFE GAS MINIFIED — compress=OFF; global/function names unchanged');
    console.log('Source bytes:', Buffer.byteLength(source), 'Minified bytes:', Buffer.byteLength(compact),
        'Reduction:', Math.round((1 - Buffer.byteLength(compact) / Buffer.byteLength(source)) * 100) + '%');
    console.log('Global functions preserved:', originalFunctions.length, 'SHA-256:', hash);
    console.log('Output:', path.relative(ROOT, DIST));
}

main().catch(err => { console.error('ABORT minified build:', err.message); process.exitCode = 1; });
