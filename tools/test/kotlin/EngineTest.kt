// Uji engine Kotlin (JVM) pada foto uji yang sama dengan engine JS; keluaran dibandingkan oleh compare_kotlin.js
import id.buleudteu.ljk.engine.*
import java.io.File

fun loadRaw(path: String, w: Int, h: Int): ArgbImage {
    val b = File(path).readBytes(); val px = IntArray(w * h)
    for (i in 0 until w * h) px[i] = (0xFF shl 24) or ((b[i * 4].toInt() and 255) shl 16) or ((b[i * 4 + 1].toInt() and 255) shl 8) or (b[i * 4 + 2].toInt() and 255)
    return ArgbImage(w, h, px)
}

fun main(args: Array<String>) {
    // args[0] = TSV: nama \t file \t w \t h \t opsi \t aktif   (dibuat oleh tools/test/run_kotlin.sh)
    val rows = File(args[0]).readLines().filter { it.isNotBlank() }.map { it.split("\t") }
    val mode = args[1]
    val out = StringBuilder("[")
    for ((i, c) in rows.withIndex()) {
        val name = c[0]; val file = c[1]; val w = c[2].toInt(); val h = c[3].toInt()
        val img = loadRaw(file, w, h)
        val t = System.currentTimeMillis()
        val r = if (mode == "marker") LjkEngine.processMarker(img, c[4].toInt(), c[5].toInt()) else LjkEngine.processMarkerless(img)
        val ms = System.currentTimeMillis() - t
        val ans = r.answers.joinToString("") { (it ?: '-').toString() }
        val st = r.status.joinToString(",")
        if (i > 0) out.append(",")
        out.append("{\"name\":\"$name\",\"ok\":${r.success},\"answers\":\"$ans\",\"status\":\"$st\",\"ms\":$ms,\"q\":\"${r.quality?.grade}${r.quality?.score}\",\"warn\":${r.warnings.size}}")
        System.err.println("$name ${if (r.success) ans else "GAGAL " + r.error} ${ms}ms")
    }
    out.append("]")
    println(out)
}
