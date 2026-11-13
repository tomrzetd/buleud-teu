package id.buleudteu.ljk.data

import android.content.Context
import id.buleudteu.ljk.ident.Siswa
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Klien Apps Script Buleud Teu V40 (protokol sama dengan web app). */
class ApiException(msg: String, val auth: Boolean = false) : Exception(msg)

data class Sekolah(val nama: String, val jenjang: String, val tahun: String, val opsiDefault: String, val logo: String, val license: String = "Demo")
data class Guru(val nama: String, val mapel: List<String>, val kelas: List<String>)
data class Ujian(
    val id: String, val nama: String, val mapel: String, val tingkat: String, val kelas: List<String>, val opsi: String,
    val kunci: String, val jumlah: Int, val kktp: Double, val terscan: MutableSet<String>
)
data class ExamsData(val guru: Guru, val ujian: List<Ujian>, val siswa: List<Siswa>, val kelasSemua: List<String>, val opsiDefault: String, val license: String = "Demo")

class Api(private val store: Store) {
    private val http = OkHttpClient.Builder().connectTimeout(20, TimeUnit.SECONDS).readTimeout(150, TimeUnit.SECONDS).followRedirects(true).build()
    private val textPlain = "text/plain;charset=utf-8".toMediaType()

    suspend fun get(action: String, url: String = store.api): JSONObject = withContext(Dispatchers.IO) {
        val r = http.newCall(Request.Builder().url("$url?action=$action").build()).execute()
        r.use { parse(it.body?.string() ?: "") }
    }

    suspend fun post(body: JSONObject): JSONObject = withContext(Dispatchers.IO) {
        if (!body.has("token")) body.put("token", store.token)
        val r = http.newCall(Request.Builder().url(store.api).post(body.toString().toRequestBody(textPlain)).build()).execute()
        r.use { parse(it.body?.string() ?: "") }
    }

    private fun parse(t: String): JSONObject {
        val j = try { JSONObject(t) } catch (e: Exception) { throw ApiException("Server membalas halaman, bukan data. Pastikan Web App di-deploy dengan akses \"Siapa saja\".") }
        if (j.has("error")) throw ApiException(j.getString("error"), j.optBoolean("auth"))
        return j
    }

    // ---------------- pemetaan JSON
    companion object {
        fun strings(a: JSONArray?): List<String> = if (a == null) emptyList() else (0 until a.length()).map { a.getString(it) }
        fun sekolah(c: JSONObject): Sekolah { val s = c.optJSONObject("sekolah") ?: JSONObject(); return Sekolah(s.optString("nama"), s.optString("jenjang"), s.optString("tahun"), s.optString("opsiDefault", "ABCD"), s.optString("logo"), s.optString("license", "Demo")) }
        fun guruList(c: JSONObject): List<String> { val a = c.optJSONArray("guru") ?: JSONArray(); return (0 until a.length()).map { a.getJSONObject(it).getString("nama") } }
        fun guru(j: JSONObject) = Guru(j.getString("nama"), strings(j.optJSONArray("mapel")), strings(j.optJSONArray("kelas")))
        fun exams(j: JSONObject): ExamsData {
            val u = j.getJSONArray("ujian"); val s = j.getJSONArray("siswa")
            return ExamsData(
                guru(j.getJSONObject("guru")),
                (0 until u.length()).map { i -> val o = u.getJSONObject(i)
                    Ujian(o.getString("id"), o.getString("nama"), o.getString("mapel"), o.optString("tingkat"), strings(o.optJSONArray("kelas")), o.optString("opsi", "ABCD"),
                        o.getString("kunci"), o.getInt("jumlah"), o.optDouble("kktp", 75.0), strings(o.optJSONArray("terscan")).toMutableSet()) },
                (0 until s.length()).map { i -> val o = s.getJSONObject(i); Siswa(o.getString("nama"), o.getString("kelas"), o.optString("nomor"), o.optString("nisn"), o.optString("tingkat")) },
                strings(j.optJSONArray("kelasSemua")), j.optString("opsiDefault", "ABCD"), j.optString("license", "Demo"))
        }
    }
}

/** Penyimpanan lokal sederhana (URL server, token, cache data, antrean offline). */
class Store(ctx: Context) {
    private val p = ctx.getSharedPreferences("buleudteu", Context.MODE_PRIVATE)
    var api: String get() = p.getString("api", "") ?: ""; set(v) { p.edit().putString("api", v).apply() }
    var token: String get() = p.getString("token", "") ?: ""; set(v) { p.edit().putString("token", v).apply() }
    var guruNama: String get() = p.getString("guru", "") ?: ""; set(v) { p.edit().putString("guru", v).apply() }
    var configJson: String get() = p.getString("config", "") ?: ""; set(v) { p.edit().putString("config", v).apply() }
    var examsJson: String get() = p.getString("exams", "") ?: ""; set(v) { p.edit().putString("exams", v).apply() }
    var sensitivity: Float get() = p.getFloat("sens", 50f); set(v) { p.edit().putFloat("sens", v).apply() }
    var contrast: Float get() = p.getFloat("con", 10f); set(v) { p.edit().putFloat("con", v).apply() }
    var ocr: Boolean get() = p.getBoolean("ocr", true); set(v) { p.edit().putBoolean("ocr", v).apply() }
    var auto: Boolean get() = p.getBoolean("auto", true); set(v) { p.edit().putBoolean("auto", v).apply() }
    fun queue(): JSONArray = try { JSONArray(p.getString("queue", "[]")) } catch (e: Exception) { JSONArray() }
    /** commit() sinkron: true hanya bila antrean benar-benar tertulis ke penyimpanan perangkat */
    fun setQueue(a: JSONArray): Boolean = p.edit().putString("queue", a.toString()).commit()
}

fun isNetwork(e: Throwable) = e is IOException
