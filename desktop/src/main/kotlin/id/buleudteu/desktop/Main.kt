package id.buleudteu.desktop

import java.io.File
import kotlin.system.exitProcess

const val APP_NAME = "Buleud Teu Desktop"
const val APP_VERSION = "4.1"
const val WATERMARK = "by : rizalabdurrahman05@guru.smp.belajar.id"

fun main(args: Array<String>) {
    when {
        args.firstOrNull() == "--batch" -> exitProcess(cliBatch(args.drop(1)))
        args.firstOrNull() == "--list-scanners" -> { cliList(); exitProcess(0) }
        args.firstOrNull() == "--version" -> println("$APP_NAME $APP_VERSION")
        args.firstOrNull() in listOf("-h", "--help") -> println(
            """
            $APP_NAME $APP_VERSION
              (tanpa argumen)              buka aplikasi
              --list-scanners              daftar jalur & perangkat scanner
              --batch <berkas/folder...> [--kunci ABCD...] [--opsi ABCD|ABCDE] [--json hasil.json]
                                           baca LJK tanpa jaringan (uji / pemakaian lanjutan)
            """.trimIndent())
        else -> Ui.launch()
    }
}

private fun cliList() {
    for (s in Scanners.all) {
        println("${s.key.padEnd(7)} ${s.title}  —  ${if (s.available()) "tersedia" else "tidak tersedia"}")
        if (s.available() && s !is FolderSource) runCatching { s.devices() }.onSuccess { l -> l.forEach { println("        • ${it.name}  [${it.id}]  ADF=${it.feeder} duplex=${it.duplex}") }; if (l.isEmpty()) println("        (tidak ada perangkat)") }
            .onFailure { println("        galat: ${it.message}") }
    }
}

/** baca berkas tanpa jaringan; keluaran per halaman: nama, mode, tata letak, jawaban, skor. Kode keluar 0 bila semua terbaca. */
private fun cliBatch(a: List<String>): Int {
    val files = ArrayList<File>(); var key: String? = null; var opsi = "ABCD"; var json: File? = null
    var i = 0
    while (i < a.size) { when (a[i]) { "--kunci" -> key = a[++i].uppercase(); "--opsi" -> opsi = a[++i].uppercase(); "--json" -> json = File(a[++i]); else -> files += File(a[i]) }; i++ }
    val pages = files.flatMap { f -> if (f.isDirectory) (f.listFiles() ?: emptyArray()).filter { Imaging.supported(it) }.sortedBy { it.name } else listOf(f) }.flatMap { Imaging.pages(it) }
    val u = key?.let { Ujian("cli", "CLI", "-", "", emptyList(), opsi, it, it.length, 75.0, mutableSetOf()) }
    val proc = Processor(Store(File(System.getProperty("java.io.tmpdir"), "buleudteu-cli")), null)
    var ok = 0; val out = ArrayList<Map<String, Any?>>()
    pages.forEachIndexed { k, p ->
        val s = Sheet(p, k + 1); proc.process(s, u)
        val ans = s.answers.joinToString("") { (it ?: '-').toString() }
        val sc = if (u != null && s.state == SheetState.READY) s.score(u) else null
        if (s.state == SheetState.READY) ok++
        println(listOf(p.label.padEnd(34), if (s.state == SheetState.READY) "${s.mode}/${s.total}" else "GAGAL", if (s.state == SheetState.READY) ans else s.error, sc?.let { "${it.first}/${u!!.jumlah}=${it.second}" } ?: "", "${s.procMs}ms", s.quality, s.warnings.joinToString(" | ")).joinToString("  "))
        out += mapOf("halaman" to p.label, "ok" to (s.state == SheetState.READY), "mode" to s.mode, "soal" to s.total, "jawaban" to ans, "error" to s.error, "benar" to sc?.first, "skor" to sc?.second, "identitas" to s.inked.toList())
    }
    json?.writeText(Json.str(out))
    println("Terbaca $ok/${pages.size} halaman")
    return if (ok == pages.size && pages.isNotEmpty()) 0 else 1
}
