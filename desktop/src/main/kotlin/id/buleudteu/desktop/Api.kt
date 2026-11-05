package id.buleudteu.desktop

import id.buleudteu.ljk.ident.Siswa
import java.io.File
import java.io.IOException
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.Properties

class ApiException(msg: String, val auth: Boolean = false) : Exception(msg)

data class Sekolah(val nama: String, val jenjang: String, val tahun: String, val opsiDefault: String, val logo: String)
data class Ujian(
    val id: String, val nama: String, val mapel: String, val tingkat: String, val kelas: List<String>, val opsi: String,
    val kunci: String, val jumlah: Int, val kktp: Double, val terscan: MutableSet<String>
) { override fun toString() = "$nama · $mapel · $jumlah soal $opsi" }
data class ExamsData(val guru: String, val ujian: List<Ujian>, val siswa: List<Siswa>)

/** Klien Web App Apps Script Buleud Teu (V40) — sama dengan versi web & Android. */
class Api(private val store: Store) {
    private val http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(20)).followRedirects(HttpClient.Redirect.NEVER).build()

    fun get(action: String, url: String = store.api): Map<String, Any?> = parse(send(HttpRequest.newBuilder(URI("$url?action=$action")).GET()))

    fun post(body: Map<String, Any?>): Map<String, Any?> {
        val b = LinkedHashMap(body); if (!b.containsKey("token")) b["token"] = store.token
        return parse(send(HttpRequest.newBuilder(URI(store.api)).header("Content-Type", "text/plain;charset=utf-8").POST(HttpRequest.BodyPublishers.ofString(Json.str(b)))))
    }

    /** Apps Script membalas 302 ke googleusercontent.com: ikuti dengan GET (perilaku peramban) */
    private fun send(rb: HttpRequest.Builder): String {
        var r = http.send(rb.timeout(Duration.ofSeconds(90)).build(), HttpResponse.BodyHandlers.ofString())
        var hop = 0
        while (r.statusCode() in 300..399 && hop++ < 5) {
            val loc = r.headers().firstValue("location").orElse(null) ?: break
            r = http.send(HttpRequest.newBuilder(URI(loc)).timeout(Duration.ofSeconds(90)).GET().build(), HttpResponse.BodyHandlers.ofString())
        }
        return r.body()
    }

    private fun parse(t: String): Map<String, Any?> {
        val j = try { Json.obj(t) } catch (e: Exception) { throw ApiException("Server membalas halaman, bukan data. Pastikan Web App di-deploy dengan akses \"Siapa saja\".") }
        if (j.containsKey("error")) throw ApiException(j.s("error"), j.b("auth"))
        return j
    }

    companion object {
        fun sekolah(c: Map<String, Any?>): Sekolah { val s = c.o("sekolah"); return Sekolah(s.s("nama"), s.s("jenjang"), s.s("tahun"), s.s("opsiDefault", "ABCD"), s.s("logo")) }
        @Suppress("UNCHECKED_CAST")
        fun guruList(c: Map<String, Any?>): List<String> = c.a("guru").map { (it as Map<String, Any?>).s("nama") }
        @Suppress("UNCHECKED_CAST")
        fun exams(j: Map<String, Any?>): ExamsData = ExamsData(
            j.o("guru").s("nama"),
            j.a("ujian").map { val o = it as Map<String, Any?>
                Ujian(o.s("id"), o.s("nama"), o.s("mapel"), o.s("tingkat"), o.a("kelas").strings(), o.s("opsi", "ABCD"), o.s("kunci"), o.d("jumlah").toInt(), o.d("kktp", 75.0), o.a("terscan").strings().toMutableSet()) },
            j.a("siswa").map { val o = it as Map<String, Any?>; Siswa(o.s("nama"), o.s("kelas"), o.s("nomor"), o.s("nisn"), o.s("tingkat")) })
    }
}

fun isNetwork(e: Throwable) = e is IOException || e.cause is IOException

/** Penyimpanan lokal: %APPDATA%\BuleudTeu (Windows) atau ~/.config/buleudteu (Linux). */
class Store(val dir: File = defaultDir()) {
    private val f = File(dir, "pengaturan.properties"); private val p = Properties()
    init { dir.mkdirs(); if (f.exists()) f.inputStream().use { p.load(it) } }
    private fun g(k: String, d: String = "") = p.getProperty(k, d)
    private fun s(k: String, v: String) { p.setProperty(k, v); f.outputStream().use { p.store(it, "Buleud Teu Desktop") } }
    var api get() = g("api"); set(v) = s("api", v)
    var token get() = g("token"); set(v) = s("token", v)
    var guru get() = g("guru"); set(v) = s("guru", v)
    var source get() = g("source"); set(v) = s("source", v)
    var device get() = g("device"); set(v) = s("device", v)
    var dpi get() = g("dpi", "200").toIntOrNull() ?: 200; set(v) = s("dpi", v.toString())
    var duplex get() = g("duplex") == "1"; set(v) = s("duplex", if (v) "1" else "0")
    var watchDir get() = g("watchDir"); set(v) = s("watchDir", v)
    var ocr get() = g("ocr", "1") == "1"; set(v) = s("ocr", if (v) "1" else "0")
    var sensitivity get() = g("sens", "50").toDoubleOrNull() ?: 50.0; set(v) = s("sens", v.toString())
    var contrast get() = g("con", "10").toDoubleOrNull() ?: 10.0; set(v) = s("con", v.toString())
    var configJson: String get() = File(dir, "config.json").takeIf { it.exists() }?.readText() ?: ""; set(v) = File(dir, "config.json").writeText(v)
    var examsJson: String get() = File(dir, "ujian.json").takeIf { it.exists() }?.readText() ?: ""; set(v) = File(dir, "ujian.json").writeText(v)

    /** antrean offline: satu baris JSON per hasil */
    private val qf = File(dir, "antrean.jsonl")
    @Synchronized fun queue(): List<Map<String, Any?>> = if (!qf.exists()) emptyList() else qf.readLines().filter { it.isNotBlank() }.mapNotNull { runCatching { Json.obj(it) }.getOrNull() }
    @Synchronized fun enqueue(b: Map<String, Any?>) = qf.appendText(Json.str(b) + "\n")
    @Synchronized fun setQueue(a: List<Map<String, Any?>>) = qf.writeText(a.joinToString("") { Json.str(it) + "\n" })

    companion object {
        fun defaultDir(): File {
            val os = System.getProperty("os.name").lowercase()
            return if (os.contains("win")) File(System.getenv("APPDATA") ?: System.getProperty("user.home"), "BuleudTeu")
            else File(System.getenv("XDG_CONFIG_HOME") ?: (System.getProperty("user.home") + "/.config"), "buleudteu")
        }
    }
}
