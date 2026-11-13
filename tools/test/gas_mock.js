// Tiruan layanan Google Apps Script untuk menjalankan Code.gs + Statistik.gs di Node.
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process'), os = require('os'), crypto = require('crypto');
// ---------------- tiruan Spreadsheet
function colIdx(a) { let n = 0; for (const ch of a) n = n * 26 + ch.charCodeAt(0) - 64; return n; }
class Sheet {
    constructor(name) { this.name = name; this.cells = []; }
    getName() { return this.name; }
    getLastRow() { let r = this.cells.length; while (r > 0 && !(this.cells[r - 1] || []).some(v => v !== '' && v != null)) r--; return r; }
    getLastColumn() { let m = 0; this.cells.forEach(row => { for (let c = row.length; c > 0; c--) if (row[c - 1] !== '' && row[c - 1] != null) { m = Math.max(m, c); break; } }); return m; }
    getRange(a, b, c, d) {
        if (typeof a === 'string') { const m = a.match(/^([A-Z]+)(\d*)(?::([A-Z]+)(\d*))?$/); return new Range(this, Number(m[2] || 1), colIdx(m[1]), 1, 1); }
        return new Range(this, a, b, c || 1, d || 1);
    }
    appendRow(vals) { const r = this.getLastRow() + 1; new Range(this, r, 1, 1, vals.length).setValues([vals]); }
    clear() { this.cells = []; return this; }
    setFrozenRows() { } setColumnWidth() { }
}
class Range {
    constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
    _get(disp) {
        const out = [];
        for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) { let v = (this.sh.cells[this.r - 1 + i] || [])[this.c - 1 + j]; v = v == null ? '' : v; if (disp && typeof v === 'string' && v.startsWith("'")) v = v.slice(1); row.push(disp ? String(v) : v); } out.push(row); }
        return out;
    }
    getValues() { return this._get(false); } getDisplayValues() { return this._get(true); }
    getValue() { return this._get(false)[0][0]; }
    setValues(v) { v.forEach((row, i) => row.forEach((x, j) => { const R = this.r - 1 + i; this.sh.cells[R] = this.sh.cells[R] || []; this.sh.cells[R][this.c - 1 + j] = x; })); return this; }
    setValue(x) { return this.setValues([[x]]); }
}
['setFontWeight', 'setFontSize', 'setBackground', 'setBackgrounds', 'setNumberFormat', 'setDataValidation', 'setFontColor', 'setFontStyle', 'merge', 'setHorizontalAlignment', 'setVerticalAlignment', 'setWrap', 'setBorder'].forEach(m => Range.prototype[m] = function () { return this; });
['setRowHeight', 'setHiddenGridlines'].forEach(m => Sheet.prototype[m] = function () { return this; });
Sheet.prototype.setName = function (n) { this.name = n; return this; };
class SS {
    constructor() { this.sheets = []; }
    getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
    insertSheet(n, i) { const s = new Sheet(n); if (i === 0) this.sheets.unshift(s); else this.sheets.push(s); return s; }
    getSheets() { return this.sheets; } getId() { return this.id || 'SHEET123'; } getName() { return this.name || 'Uji Sekolah'; } setActiveSheet() { }
    getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.getId() + '/edit'; }
}
function createGas(opt = {}) {
const ss = new SS(), cache = new Map(), props = new Map(), created = [], fetched = [], drive = { folders: [], moved: [], viewers: [] };
const testSecret = 'testing-only-do-not-use-in-production-0123456789abcdefgh';
props.set('BT_LICENSE_HMAC_KEY', testSecret);
const url64 = b => Buffer.from(b).toString('base64url');
const mintLicense = (tier = 'school', sheetId = ss.getId(), expSeconds = 86400) => {
    const now = Math.floor(Date.now() / 1000);
    const payload = url64(Buffer.from(JSON.stringify({v:1,product:'buleud-teu',sid:sheetId,tier,iat:now,exp:now+expSeconds,jti:'test123'})));
    const input = 'BTL1.' + payload;
    return input + '.' + url64(crypto.createHmac('sha256', testSecret).update(input).digest());
};
const dv = () => { const o = { requireValueInList: () => o, build: () => ({}) }; return o; };
const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss, newDataValidation: dv, getUi: () => { throw new Error('no ui'); }, flush: () => { },
        BorderStyle: { SOLID: 'solid' }, create: (name) => { const n = new SS(); n.id = 'LAP' + created.length; n.name = name; n.insertSheet('Sheet1'); created.push(n); return n; } },
    UrlFetchApp: { fetch: (url) => { fetched.push(url); const b = Buffer.from((/format=xlsx/.test(url) ? 'PK\x03\x04 xlsx tiruan ' : '%PDF-1.4 tiruan ') + url); return { getResponseCode: () => 200, getBlob: () => ({ getBytes: () => [...b] }) }; } },
    ScriptApp: { getOAuthToken: () => 'tok' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props.get(k) || null, setProperty: (k, v) => props.set(k, v) }) },
    CacheService: { getScriptCache: () => ({ get: k => cache.get(k) || null, put: (k, v) => cache.set(k, v), remove: k => cache.delete(k) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => { } }) },
    Utilities: { formatDate: (d, tz, f) => f === 'yyMMdd' ? '261103' : (f === 'yyyy-MM-dd' ? '2026-11-03' : '2026-11-03 23:00:' + String(Math.floor(Math.random() * 60)).padStart(2, '0')), getUuid: () => 'tok-' + Math.random().toString(36).slice(2), base64Encode: () => '', base64Decode: () => [], newBlob: () => ({}) },
    Session: { getScriptTimeZone: () => 'Asia/Jakarta' },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ getContent: () => s, setMimeType() { return this; } }) },
    DriveApp: { getFileById: () => { throw new Error('no drive'); } }, Logger: { log: () => { } }, MimeType: {}, console
};
// OCR tiruan: Drive -> Tesseract lokal (pengganti OCR Google Drive)
const files = new Map();
ctx.Utilities.base64Decode = (b) => Buffer.from(b, 'base64');
ctx.Utilities.newBlob = (bytes) => ({ bytes });
ctx.Drive = { Files: { create: (meta, blob) => { const id = 'f' + files.size; files.set(id, blob.bytes); return { id }; } } };
ctx.DocumentApp = { openById: (id) => ({ getBody: () => ({ getText: () => {
    const f = path.join(os.tmpdir(), 'ocr_' + id + '_' + Date.now() + '.jpg'); fs.writeFileSync(f, files.get(id));
    try { return cp.execFileSync('tesseract', [f, '-', '--psm', '6'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch (e) { return ''; } } }) }) };
ctx.DriveApp = { getFileById: (id) => ({ setTrashed: () => { }, moveTo: (f) => drive.moved.push([id, f.name]), addViewer: (e) => drive.viewers.push([id, e]) }),
    getFoldersByName: (n) => { const f = drive.folders.filter(x => x.name === n); let i = 0; return { hasNext: () => i < f.length, next: () => f[i++] }; },
    createFolder: (n) => { const f = { name: n }; drive.folders.push(f); return f; } };
ctx.Utilities.base64Encode = (bytes) => Buffer.from(bytes).toString('base64');
ctx.Utilities.base64EncodeWebSafe = bytes => Buffer.from(bytes).toString('base64url');
ctx.Utilities.base64DecodeWebSafe = value => [...Buffer.from(value, 'base64url')];
ctx.Utilities.computeHmacSha256Signature = (text, key) => [...crypto.createHmac('sha256', key).update(text).digest()];
ctx.Utilities.Charset = { UTF_8: 'utf-8' };
ctx.Utilities.newBlob = bytes => ({
  bytes, getDataAsString: () => Buffer.from(bytes).toString('utf-8')
});
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../apps-script/Statistik.gs'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../apps-script/Code.gs'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../apps-script/Laporan.gs'), 'utf8'), ctx);
const GET = (action) => JSON.parse(ctx.doGet({ parameter: { action } }).getContent());
const POST = (o) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(o) } }).getContent());
return { ctx, ss, created, fetched, drive, GET, POST, mintLicense, doGet: (p) => ctx.doGet({ parameter: p }).getContent(), doPost: (body) => ctx.doPost({ postData: { contents: body } }).getContent() };
}
module.exports = { createGas };
