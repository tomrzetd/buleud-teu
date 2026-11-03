// Buat kasus uji identitas dari versi JS (acuan) untuk dibandingkan dengan Kotlin
const I = require('../../../web/js/ljk-ident.js'), fs = require('fs'), path = require('path');
const st = [['IBNU BIN LADEN', '9A', '08101'], ['IBNU SINA', '9A', '08102'], ['INDAH LESTARI', '9B', ''], ['BUDI SANTOSO', '9B', ''], ['SITI AMINAH', '7A', ''], ['LADENA PUTRI', '8F', ''], ['MUHAMMAD RIZKY FAUZAN', '9A', '']];
const ins = [["/'BNU BIN LADEN", 'O81O1', '9 A'], ['1BNU 8IN LADEW', '', 'GA'], ['', '', ''], ['SITI AMIN4H', '', '7A'], ['M RIZKY', '', ''], ['LADENA', '', '8F'], ['INDAH LESTAR', '', '98'], ['BUDI', '', '']];
const lines = ins.map(([n, no, k]) => { const f = I.fromFields({ nama: n, nomor: no, kelas: k }); const m = I.match(f, st.map(([nama, kelas, nomor]) => ({ nama, kelas, nomor })));
    return [n, no, k, f.nama, f.nomor, f.kelas, m.kelas || '', m.nama || '', m.via, m.namaScore.toFixed(6), m.alternatives.map(a => a.nama + '@' + a.skor).join(';')].join('\t'); });
fs.writeFileSync(path.join(__dirname, 'ident_cases.tsv'), st.map(s => 'S\t' + s.join('\t')).join('\n') + '\n' + lines.map(l => 'C\t' + l).join('\n') + '\n');
