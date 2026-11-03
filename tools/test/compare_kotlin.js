// Bandingkan hasil engine Kotlin vs JS (soal per soal + status)
const fs = require('fs'), path = require('path');
const [jsFile, ktFile] = process.argv.slice(2);
const js = JSON.parse(fs.readFileSync(jsFile)), kt = JSON.parse(fs.readFileSync(ktFile));
let same = 0;
for (const k of kt) {
    const j = js.find(x => x.name === k.name);
    const jAns = j.answers, jSt = (j.status || []).join(',');
    const eq = j && k.answers === jAns && k.status === jSt;
    if (eq) same++;
    console.log(`${eq ? '✓' : '✗'} ${k.name.padEnd(38)} Kotlin ${k.ms}ms ${k.q}${eq ? '' : `\n   JS ${jAns}\n   KT ${k.answers}`}`);
}
console.log(`\nKotlin == JS: ${same}/${kt.length}`);
process.exitCode = same === kt.length ? 0 : 1;
