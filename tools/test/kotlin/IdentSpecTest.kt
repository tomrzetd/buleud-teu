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
    if (bad > 0 || ok != n) System.exit(1)
}
