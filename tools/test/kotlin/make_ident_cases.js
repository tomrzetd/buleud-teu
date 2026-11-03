// Buat kasus uji identitas dari versi JS (acuan) untuk dibandingkan dengan Kotlin
const I = require('../../../web/js/ljk-ident.js'), fs = require('fs'), path = require('path');
const st = [['IBNU BIN LADEN', '9A', '08101'], ['IBNU SINA', '9A', '08102'], ['INDAH LESTARI', '9B', ''], ['BUDI SANTOSO', '9B', ''], ['SITI AMINAH', '7A', ''], ['LADENA PUTRI', '8F', ''], ['MUHAMMAD RIZKY FAUZAN', '9A', '']];
const ins = [["/'BNU BIN LADEN", 'O81O1', '9 A'], ['1BNU 8IN LADEW', '', 'GA'], ['', '', ''], ['SITI AMIN4H', '', '7A'], ['M RIZKY', '', ''], ['LADENA', '', '8F'], ['INDAH LESTAR', '', '98'], ['BUDI', '', '']];
const lines = ins.map(([n, no, k]) => { const f = I.fromFields({ nama: n, nomor: no, kelas: k }); const m = I.match(f, st.map(([nama, kelas, nomor]) => ({ nama, kelas, nomor })));
    return [n, no, k, f.nama, f.nomor, f.kelas, m.kelas || '', m.nama || '', m.via, m.namaScore.toFixed(6), m.alternatives.map(a => a.nama + '@' + a.skor).join(';')].join('\t'); });
const texts = ['Nomor Peserta : 08 101\nNama Peserta : IBNU BIN LADEN\nKelas : 7F\nMata Pelajaran : IPA', 'Nomor Peserta\nNama Peserta\nKelas\nMata Pelajaran\n08 101\nIBNU BIN LADEW\n7F\nIPA',
  "Nomor Peserta : 08 (ol\n\nNama Peserta : 196V Gir Labew\nKelas RS PA\n\nMata Pelajaran : NBA", 'LEMBAR JAWABAN\nNomor Peserta : 0812 Sekolah Asal : SMPN\nNama Peserta : SITI AMINAH Hari / Tanggal\nKelas : 7A Waktu', '08101\nBUDI SANTOSO\n9B'];
const plines = texts.map(t => { const f = I.parse(t); return [t.replace(/\n/g, '\\n'), f.nama, f.nomor, f.kelas].join('\t'); });
fs.writeFileSync(path.join(__dirname, 'ident_cases.tsv'), st.map(s => 'S\t' + s.join('\t')).join('\n') + '\n' + lines.map(l => 'C\t' + l).join('\n') + '\n' + plines.map(l => 'P\t' + l).join('\n') + '\n');
