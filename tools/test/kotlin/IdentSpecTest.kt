// Uji silang: (1) posisi bulatan LjkSpec.kt == spec/ljk-f4-v1.json (dari JS); (2) LjkIdent.kt == ljk-ident.js
import id.buleudteu.ljk.engine.LjkSpec
import id.buleudteu.ljk.ident.*
import java.io.File
import kotlin.math.abs

fun main(args: Array<String>) {
    val json = File(args[0]).readText()
    val bub = Regex("\\[\\s*(\\d+),\\s*(\\d+),\\s*([\\d.]+),\\s*([\\d.]+)\\s*]").findAll(json.substringAfter("\"bubbles\"")).toList()
    var bad = 0
    for (m in bub) { val (q, o, x, y) = m.destructured; val p = LjkSpec.bubbleMM(q.toInt(), o.toInt()); if (abs(p.x - x.toDouble()) > 1e-9 || abs(p.y - y.toDouble()) > 1e-9) bad++ }
    println("Spesifikasi: ${bub.size} posisi bulatan dibandingkan, beda $bad")
    val lines = File(args[0].replace("spec/ljk-f4-v1.json", "tools/test/kotlin/ident_cases.tsv")).readLines().filter { it.isNotBlank() }
    val st = lines.filter { it.startsWith("S\t") }.map { val c = it.split("\t"); Siswa(c[1], c[2], c.getOrElse(3) { "" }) }
    var ok = 0; var n = 0
    for (l in lines.filter { it.startsWith("C\t") }) {
        val c = l.split("\t"); n++
        val f = LjkIdent.fromFields(c[1], c[2], c[3]); val m = LjkIdent.match(f, st)
        val got = listOf(f.nama, f.nomor, f.kelas, m.kelas ?: "", m.nama ?: "", m.via, "%.6f".format(m.namaScore), m.alternatives.joinToString(";") { it.nama + "@" + (if (it.skor % 1.0 == 0.0) it.skor.toInt().toString() else it.skor.toString()) })
        val exp = c.subList(4, 12)
        if (got == exp) ok++ else println("BEDA: input=${c.subList(1, 4)}\n  js=$exp\n  kt=$got")
    }
    println("Identitas Kotlin == JS: $ok/$n")
    var pok = 0; var pn = 0
    for (l in lines.filter { it.startsWith("P\t") }) {
        val c = l.split("\t"); pn++
        val f = LjkIdent.parse(c[1].replace("\\n", "\n"))
        val got = listOf(f.nama, f.nomor, f.kelas); val exp = listOf(c.getOrElse(2) { "" }, c.getOrElse(3) { "" }, c.getOrElse(4) { "" })
        if (got == exp) pok++ else println("BEDA parse: ${c[1]}\n  js=$exp\n  kt=$got")
    }
    println("Parse LJK lama Kotlin == JS: $pok/$pn")
    // ML Kit memisahkan label cetak dan tulisan tangan ke blok berbeda (urutan blok acak) -> susun per baris visual
    val B = LjkIdent::Baris
    val acak = listOf(B("DWI PUTRI M.", 300, 62, 620, 104), B("Nomor Peserta", 10, 20, 180, 45), B("9A", 310, 108, 380, 150),
        B("Kelas", 10, 115, 80, 140), B("Nama Peserta", 10, 68, 170, 93), B(":", 200, 70, 210, 92), B("09134", 300, 14, 450, 52),
        B("Mata Pelajaran", 10, 162, 190, 187), B("INFORMATIKA", 300, 158, 560, 196))
    val txt = LjkIdent.susunBaris(acak); val fb = LjkIdent.parse(txt)
    val okB = fb == Fields("DWI PUTRI M", "09134", "9A")
    println("Susun baris ML Kit: " + (if (okB) "OK" else "GAGAL $fb\n$txt"))
    if (bad > 0 || ok != n || pok != pn || !okB) System.exit(1)
}
