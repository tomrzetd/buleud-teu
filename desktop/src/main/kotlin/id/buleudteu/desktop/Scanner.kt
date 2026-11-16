package id.buleudteu.desktop

import java.io.File
import java.nio.file.Files
import java.util.concurrent.TimeUnit

data class ScanDevice(val id: String, val name: String, val feeder: Boolean = true, val duplex: Boolean = false) { override fun toString() = name + if (feeder) "  (ADF)" else "" }
data class ScanOptions(val dpi: Int = 200, val duplex: Boolean = false, val gray: Boolean = false, val feeder: Boolean = true)

/** Satu jalur pemindaian. scan() memblok sampai feeder habis; tiap lembar selesai -> onPage(file). */
abstract class ScanSource(val key: String, val title: String) {
    @Volatile protected var proc: Process? = null
    @Volatile var cancelled = false; protected set
    abstract fun available(): Boolean
    abstract fun hint(): String
    abstract fun devices(): List<ScanDevice>
    abstract fun scan(dev: ScanDevice?, opt: ScanOptions, out: File, onPage: (File) -> Unit, onMsg: (String) -> Unit): Int
    open fun cancel() { cancelled = true; proc?.descendants()?.forEach { it.destroyForcibly() }; proc?.destroyForcibly() }
    override fun toString() = title
    protected fun begin() { cancelled = false }
}

val isWindows = System.getProperty("os.name").lowercase().contains("win")

/** halaman F4 penuh: 215 x 330 mm (LJK Buleud Teu). A4 (297 mm) akan memotong marker bawah. */
const val PAGE_W_MM = 215.0
const val PAGE_H_MM = 330.0

// ------------------------------------------------------------------------------------------ WIA (Windows)
class WiaSource : ScanSource("wia", "WIA — driver Windows (Canon / Epson / Brother)") {
    private val ps get() = File(System.getenv("SystemRoot") ?: "C:\\Windows", "System32\\WindowsPowerShell\\v1.0\\powershell.exe").takeIf { it.exists() }?.absolutePath ?: "powershell.exe"
    private val script: File by lazy {
        val f = File(System.getProperty("java.io.tmpdir"), "buleudteu_wia_scan.ps1")
        javaClass.getResourceAsStream("/wia_scan.ps1")!!.use { i -> f.outputStream().use { i.copyTo(it) } }; f
    }
    override fun available() = isWindows
    override fun hint() = "Pasang driver resmi scanner (mis. Canon IJ Scan Utility / Epson Scan 2 / Brother iPrint&Scan). Scanner harus terlihat di 'Scanners and Cameras' Windows."
    private fun cmd(vararg a: String) = listOf(ps, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script.absolutePath) + a

    override fun devices(): List<ScanDevice> {
        val p = ProcessBuilder(cmd("-List")).redirectErrorStream(true).start()
        val lines = p.inputStream.bufferedReader(Charsets.UTF_8).readLines(); p.waitFor(60, TimeUnit.SECONDS)
        lines.firstOrNull { it.startsWith("ERR\t") }?.let { throw IllegalStateException(it.substringAfter('\t')) }
        return lines.filter { it.startsWith("DEV\t") }.map { val t = it.split('\t'); ScanDevice(t[1], t.getOrElse(2) { t[1] }, t.getOrElse(3) { "1" } == "1", t.getOrElse(4) { "0" } == "1") }
    }

    override fun scan(dev: ScanDevice?, opt: ScanOptions, out: File, onPage: (File) -> Unit, onMsg: (String) -> Unit): Int {
        begin(); out.mkdirs()
        val a = mutableListOf("-Out", out.absolutePath, "-Dpi", "${opt.dpi}", "-Source", if (opt.feeder) "feeder" else "flatbed", "-WidthMm", "$PAGE_W_MM", "-HeightMm", "$PAGE_H_MM")
        if (dev != null) a += listOf("-Device", dev.id)
        if (opt.duplex) a += "-Duplex"; if (opt.gray) a += "-Gray"
        val p = ProcessBuilder(cmd(*a.toTypedArray())).redirectErrorStream(true).start(); proc = p
        var n = 0; var err: String? = null
        p.inputStream.bufferedReader(Charsets.UTF_8).forEachLine { l ->
            when {
                l.startsWith("PAGE\t") -> { n++; onPage(File(l.substringAfter('\t'))) }
                l.startsWith("WARN\t") -> onMsg(l.substringAfter('\t'))
                l.startsWith("ERR\t") -> err = l.substringAfter('\t')
            }
        }
        p.waitFor(); proc = null
        if (err != null && !cancelled) throw IllegalStateException(err)
        return n
    }
}

// ------------------------------------------------------------------------------------------ TWAIN lewat NAPS2 (Windows, opsional)
/** Driver TWAIN (lebih lengkap di sebagian Canon/Brother) — memakai NAPS2 (gratis, naps2.com) bila terpasang. */
class Naps2Source : ScanSource("twain", "TWAIN — lewat NAPS2 (opsional)") {
    private fun exe(): String? = listOfNotNull(System.getenv("ProgramFiles"), System.getenv("ProgramFiles(x86)"))
        .map { File(it, "NAPS2\\NAPS2.Console.exe") }.firstOrNull { it.exists() }?.absolutePath ?: which("NAPS2.Console")
    override fun available() = isWindows && exe() != null
    override fun hint() = "Pasang NAPS2 (gratis, naps2.com) bila driver WIA scanner tidak mendukung ADF. Buleud Teu memanggil NAPS2.Console dengan driver TWAIN."
    override fun devices(): List<ScanDevice> {
        val p = ProcessBuilder(exe()!!, "--listdevices", "--driver", "twain").redirectErrorStream(true).start()
        val lines = p.inputStream.bufferedReader().readLines().map { it.trim() }.filter { it.isNotEmpty() }; p.waitFor(60, TimeUnit.SECONDS)
        return lines.map { ScanDevice(it, it) }
    }
    override fun scan(dev: ScanDevice?, opt: ScanOptions, out: File, onPage: (File) -> Unit, onMsg: (String) -> Unit): Int {
        begin(); out.mkdirs()
        val a = mutableListOf(exe()!!, "-o", File(out, "hal_\$(nnnn).png").absolutePath, "-f", "--driver", "twain",
            "--source", if (!opt.feeder) "glass" else if (opt.duplex) "duplex" else "feeder", "--dpi", "${opt.dpi}", "--bitdepth", if (opt.gray) "gray" else "color", "--pagesize", "legal")
        if (dev != null) a += listOf("--device", dev.id)
        val p = ProcessBuilder(a).redirectErrorStream(true).start(); proc = p
        val log = StringBuilder()
        return watchWhile(out, { p.isAlive }, onPage) { p.inputStream.bufferedReader().forEachLine { log.appendLine(it) } }.also {
            p.waitFor(); proc = null
            if (it == 0 && !cancelled) throw IllegalStateException("NAPS2 tidak menghasilkan halaman. ${log.lines().lastOrNull { l -> l.isNotBlank() } ?: ""}")
        }
    }
}

// ------------------------------------------------------------------------------------------ SANE (Linux)
class SaneSource : ScanSource("sane", "SANE — scanimage (Linux)") {
    override fun available() = !isWindows && which("scanimage") != null
    override fun hint() = "Linux: sudo apt install sane-utils. Brother: driver brscan4/brscan5; Epson: epsonscan2 atau backend epson2/epsonds; Canon: backend pixma / canon_dr; scanner jaringan: sane-airscan."
    override fun devices(): List<ScanDevice> {
        val p = ProcessBuilder("scanimage", "-f", "%d\t%v %m\n").redirectErrorStream(true).start()
        val lines = p.inputStream.bufferedReader().readLines(); p.waitFor(90, TimeUnit.SECONDS)
        return lines.filter { it.contains('\t') }.map { val (id, nm) = it.split('\t', limit = 2); ScanDevice(id, nm.trim()) }
    }
    /** opsi perangkat dari `scanimage -A`: nama sumber ADF, mode warna, batas panjang kertas */
    class Caps(val sources: List<String>, val modes: List<String>, val maxY: Double?, val maxX: Double?)
    fun caps(dev: ScanDevice?): Caps {
        val c = mutableListOf("scanimage"); if (dev != null) c += listOf("-d", dev.id); c += "-A"
        val t = ProcessBuilder(c).redirectErrorStream(true).start().let { p -> p.inputStream.bufferedReader().readText().also { p.waitFor(60, TimeUnit.SECONDS) } }
        fun opts(name: String) = Regex("--$name\\s+([^\\[\\n]+)").find(t)?.groupValues?.get(1)?.trim()?.split('|')?.map { it.trim() } ?: emptyList()
        fun max(name: String) = Regex("\\s-$name\\s+[\\d.]+\\.\\.([\\d.]+)mm").find(t)?.groupValues?.get(1)?.toDoubleOrNull()
        return Caps(opts("source"), opts("mode"), max("y"), max("x"))
    }
    override fun scan(dev: ScanDevice?, opt: ScanOptions, out: File, onPage: (File) -> Unit, onMsg: (String) -> Unit): Int {
        begin(); out.mkdirs()
        val cp = caps(dev)
        val src = pickSource(cp.sources, opt)
        if (opt.feeder && src == null && cp.sources.isNotEmpty()) onMsg("Sumber ADF tidak ditemukan (${cp.sources.joinToString()}); memakai bawaan.")
        val mode = cp.modes.firstOrNull { if (opt.gray) it.contains("gray", true) else it.contains("colo", true) }
        val c = mutableListOf("scanimage"); if (dev != null) c += listOf("-d", dev.id)
        if (src != null) c += "--source=$src"
        if (mode != null) c += "--mode=$mode"
        c += listOf("--resolution", "${opt.dpi}", "--format=png", "--batch=" + File(out, "hal_%04d.png").absolutePath)
        c += listOf("-x", "${minOf(PAGE_W_MM, cp.maxX ?: PAGE_W_MM)}", "-y", "${minOf(PAGE_H_MM, cp.maxY ?: PAGE_H_MM)}")
        if ((cp.maxY ?: PAGE_H_MM) < PAGE_H_MM - 1) onMsg("Panjang pindai maksimum scanner ${cp.maxY} mm (< 330 mm F4): bagian bawah LJK bisa terpotong.")
        if (!opt.feeder) c += "--batch-count=1"
        val p = ProcessBuilder(c).redirectErrorStream(true).start(); proc = p
        var n = 0; val log = StringBuilder()
        p.inputStream.bufferedReader().forEachLine { l ->
            log.appendLine(l)
            Regex("Scanned page (\\d+)").find(l)?.let { m -> n++; onPage(File(out, "hal_%04d.png".format(m.groupValues[1].toInt()))) }
        }
        p.waitFor(); proc = null
        if (n == 0 && !cancelled) {
            val last = log.lines().lastOrNull { it.isNotBlank() && !it.startsWith("Scanning") } ?: ""
            throw IllegalStateException(if (last.contains("empty", true) || last.contains("no more", true)) "Feeder (ADF) kosong. Masukkan tumpukan LJK lalu ulangi." else "scanimage: $last")
        }
        return n
    }
    companion object {
        fun pickSource(sources: List<String>, opt: ScanOptions): String? {
            if (!opt.feeder) return sources.firstOrNull { it.contains("flatbed", true) || it.contains("glass", true) || it.contains("normal", true) }
            val adf = sources.filter { s -> listOf("adf", "feeder", "automatic", "document").any { s.contains(it, true) } }
            return if (opt.duplex) adf.firstOrNull { it.contains("duplex", true) } ?: adf.firstOrNull() else adf.firstOrNull { !it.contains("duplex", true) && !it.contains("back", true) } ?: adf.firstOrNull()
        }
    }
}

// ------------------------------------------------------------------------------------------ folder pantau (semua OS)
/**
 * Untuk scanner yang punya tombol/aplikasi sendiri (Epson Scan 2, Canon IJ Scan Utility, Brother ControlCenter, scan-to-folder jaringan):
 * arahkan simpanan ke satu folder; setiap berkas baru (JPG/PNG/TIFF/PDF) langsung diproses.
 */
open class FolderSource(
    key: String = "folder",
    title: String = "Folder pantau — software scanner bawaan / scan-to-folder"
) : ScanSource(key, title) {
    var folder: File? = null
    override fun available() = true
    override fun hint() = "Atur aplikasi scanner menyimpan JPG/PNG/PDF/TIFF ke folder yang dipantau. Hanya hasil baru atau perubahan berkas yang diproses."
    override fun devices() = emptyList<ScanDevice>()
    override fun cancel() { cancelled = true }
    override fun scan(dev: ScanDevice?, opt: ScanOptions, out: File, onPage: (File) -> Unit, onMsg: (String) -> Unit): Int {
        begin(); val dir = folder ?: throw IllegalStateException("Pilih folder dulu.")
        val seen = HashSet<String>((dir.listFiles() ?: emptyArray()).filter { Imaging.supported(it) }.map(::scanSnapshotKey))
        onMsg("Memantau ${dir.absolutePath} — hasil scan baru diproses; berkas lama bisa diimpor lewat tombol Impor.")
        return watchLoop(dir, seen, { !cancelled }, onPage)
    }
}

/**
 * ScanSnap SV600 has a proprietary ScanSnap Home driver. It cannot be acquired
 * via TWAIN/WIA or NAPS2. Scan to a chosen directory, then Buleud Teu processes
 * ScanSnap Home's completed JPEG/PDF outputs through the shared OMR engine.
 */
class ScanSnapSv600Source : FolderSource("sv600", "ScanSnap SV600 — lewat ScanSnap Home") {
    override fun available() = isWindows
    override fun hint() =
        "ScanSnap SV600 bukan TWAIN/WIA. Di ScanSnap Home, buat profil: JPEG (disarankan) " +
        "atau PDF, warna 300 dpi, kertas F4 penuh, Auto Crop/Deskew aktif, simpan ke folder ini. " +
        "Tekan 'Pantau hasil SV600' SEBELUM memindai dari ScanSnap Home. Hindari mode buku / potong dua halaman."
}

// ------------------------------------------------------------------------------------------ util pantau berkas
/** Distinguish overwritten scans from existing files while avoiding duplicates. */
internal fun scanSnapshotKey(f: File): String = "${f.absolutePath}|${f.length()}|${f.lastModified()}"

/** Stable for at least 2.4 seconds before import: large ScanSnap Home PDFs may take time. */
private fun watchLoop(dir: File, seen: MutableSet<String>, alive: () -> Boolean, onPage: (File) -> Unit, finalSweep: Boolean = false): Int {
    val sizes = HashMap<String, Pair<String, Long>>(); var n = 0
    fun sweep(force: Boolean) {
        val now = System.currentTimeMillis()
        (dir.listFiles() ?: emptyArray()).filter { Imaging.supported(it) && scanSnapshotKey(it) !in seen }
            .sortedBy { it.name }.forEach { f ->
            val stamp = scanSnapshotKey(f); val prev = sizes[f.absolutePath]
            if (prev == null || prev.first != stamp) sizes[f.absolutePath] = stamp to now
            else if ((force || now - prev.second >= 2400) && f.length() > 0 && canOpen(f)) {
                seen += stamp; sizes -= f.absolutePath; n++; onPage(f)
            }
        }
    }
    while (alive()) { sweep(false); Thread.sleep(400) }
    if (finalSweep) repeat(2) { sweep(false); Thread.sleep(150); sweep(true) }
    return n
}
private fun canOpen(f: File) = try { Files.newInputStream(f.toPath()).use { it.read() }; true } catch (e: Exception) { false }

/** menjalankan proses pemindai sambil memantau folder keluaran */
private fun watchWhile(out: File, alive: () -> Boolean, onPage: (File) -> Unit, drain: () -> Unit): Int {
    val t = Thread(drain).apply { isDaemon = true; start() }
    val n = watchLoop(out, HashSet((out.listFiles() ?: emptyArray()).filter { Imaging.supported(it) }.map(::scanSnapshotKey)), alive, onPage, finalSweep = true)
    t.join(2000); return n
}

object Scanners {
    val all: List<ScanSource> by lazy { listOf(WiaSource(), Naps2Source(), ScanSnapSv600Source(), SaneSource(), FolderSource()) }
    fun usable() = all.filter { it.available() || it is Naps2Source && isWindows }
}
