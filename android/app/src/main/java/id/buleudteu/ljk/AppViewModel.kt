package id.buleudteu.ljk

import android.app.Application
import android.graphics.Bitmap
import android.graphics.Matrix
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import id.buleudteu.ljk.data.*
import id.buleudteu.ljk.engine.ArgbImage
import id.buleudteu.ljk.engine.LjkEngine
import id.buleudteu.ljk.engine.LjkResult
import id.buleudteu.ljk.ident.LjkIdent
import id.buleudteu.ljk.ident.Match
import id.buleudteu.ljk.ocr.IdentOcr
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import kotlin.math.max
import kotlin.math.roundToInt

enum class Screen { SETUP, LOGIN, HOME, EXAM, SCAN, RESULT, ANALYSIS }
enum class ScanMode { EXAM, KEY, LEGACY }

class ExamDraft(var id: String = "", var nama: String = "", var mapel: String = "", var kelas: MutableList<String> = mutableListOf(), var opsi: String = "ABCD", var kunci: String = "", var kktp: Double = 75.0)

class AppViewModel(app: Application) : AndroidViewModel(app) {
    val store = Store(app)
    val api = Api(store)

    var screen by mutableStateOf(if (store.api.isEmpty()) Screen.SETUP else if (store.token.isEmpty()) Screen.LOGIN else Screen.HOME)
    var toast by mutableStateOf<String?>(null)
    var busy by mutableStateOf<String?>(null)
    var setupMsg by mutableStateOf("")
    var sekolah by mutableStateOf<Sekolah?>(null)
    var guruList by mutableStateOf<List<String>>(emptyList())
    var loginMsg by mutableStateOf("")
    var data by mutableStateOf<ExamsData?>(null)
    var exam by mutableStateOf<Ujian?>(null)
    var draft by mutableStateOf(ExamDraft())
    var draftMsg by mutableStateOf("")
    var scanMode by mutableStateOf(ScanMode.EXAM)
    var queueSize by mutableStateOf(store.queue().length())

    // hasil scan
    var result by mutableStateOf<LjkResult?>(null)
    var image: ArgbImage? = null
    val answers = mutableStateListOf<Char?>()
    val status = mutableStateListOf<String>()
    var strips by mutableStateOf<Map<String, Bitmap>>(emptyMap())
    var ocrMsg by mutableStateOf("")
    var match by mutableStateOf<Match?>(null)
    var selKelas by mutableStateOf("")
    var selSiswa by mutableStateOf("")
    var nomorOcr = ""
    private var confirmFlags = false
    private var scanId = ""
    var analysis by mutableStateOf<JSONObject?>(null)
    var analysisScope by mutableStateOf("tingkat" to "")

    init { if (store.configJson.isNotEmpty()) applyConfig(JSONObject(store.configJson)); if (store.examsJson.isNotEmpty()) data = runCatching { Api.exams(JSONObject(store.examsJson)) }.getOrNull()
        if (screen == Screen.HOME) loadExams() }

    fun say(m: String) { toast = m }

    // ---------------- setup & login
    fun connect(url: String) = viewModelScope.launch {
        val u = url.trim()
        if (!Regex("^https://script\\.google\\.com/macros/s/[^/]+/exec$").matches(u)) { setupMsg = "URL harus https://script.google.com/macros/s/…/exec"; return@launch }
        setupMsg = "Menghubungi…"
        try {
            val c = api.get("config", u)
            if (c.optString("version") != "V40") throw ApiException("Apps Script masih versi lama. Pasang kode Buleud Teu V40.")
            store.api = u; store.configJson = c.toString(); applyConfig(c); setupMsg = ""; screen = Screen.LOGIN
        } catch (e: Exception) { setupMsg = if (isNetwork(e)) "Tidak bisa dihubungi. Cek internet & akses Web App \"Siapa saja\"." else e.message ?: "Gagal" }
    }
    private fun applyConfig(c: JSONObject) { sekolah = Api.sekolah(c); guruList = Api.guruList(c) }
    fun refreshConfig() = viewModelScope.launch { runCatching { api.get("config") }.onSuccess { store.configJson = it.toString(); applyConfig(it) } }

    fun login(guru: String, pin: String) = viewModelScope.launch {
        loginMsg = "Memeriksa…"
        try {
            val r = api.post(JSONObject().put("action", "login").put("guru", guru).put("pin", pin).put("token", ""))
            store.token = r.getString("token"); store.guruNama = guru; loginMsg = ""; screen = Screen.HOME; loadExams()
        } catch (e: Exception) { loginMsg = e.message ?: "Gagal" }
    }
    fun logout() { store.token = ""; store.examsJson = ""; data = null; screen = Screen.LOGIN }

    private suspend fun <T> call(block: suspend () -> T): T? = try { block() } catch (e: ApiException) {
        if (e.auth) { store.token = ""; screen = Screen.LOGIN }; say(e.message ?: "Gagal"); null
    } catch (e: Exception) { say(if (isNetwork(e)) "Offline / server tidak terjangkau" else (e.message ?: "Gagal")); null }

    // ---------------- ujian
    fun loadExams() = viewModelScope.launch {
        call { api.post(JSONObject().put("action", "exams")) }?.let { store.examsJson = it.toString(); data = Api.exams(it); flushQueue() }
    }
    fun studentsOf(u: Ujian?) = data?.siswa?.filter { s -> u == null || (if (u.kelas.isEmpty() || "SEMUA" in u.kelas) (u.tingkat.isEmpty() || s.tingkat == u.tingkat) else s.kelas in u.kelas) } ?: emptyList()

    fun editExam(u: Ujian?) {
        draft = if (u == null) ExamDraft(mapel = data?.guru?.mapel?.firstOrNull() ?: "", opsi = data?.opsiDefault ?: "ABCD")
        else ExamDraft(u.id, u.nama, u.mapel, u.kelas.toMutableList(), u.opsi, u.kunci, u.kktp)
        draftMsg = ""; screen = Screen.EXAM
    }
    fun saveExam() = viewModelScope.launch {
        val d = draft; val k = d.kunci.uppercase()
        draftMsg = when {
            d.nama.isBlank() || d.mapel.isBlank() -> "Nama ujian dan mapel wajib diisi."
            d.kelas.isEmpty() -> "Pilih minimal satu kelas."
            k.isEmpty() -> "Kunci jawaban kosong."
            k.contains('-') -> "Ada nomor kunci yang kosong (-)."
            d.opsi == "ABCD" && k.contains('E') -> "Kunci berisi E padahal opsi ABCD."
            else -> ""
        }
        if (draftMsg.isNotEmpty()) return@launch
        busy = "Menyimpan ujian…"
        val ex = JSONObject().put("id", d.id).put("nama", d.nama).put("mapel", d.mapel.uppercase()).put("kelas", JSONArray(d.kelas)).put("opsi", d.opsi).put("kunci", k).put("kktp", d.kktp)
        call { api.post(JSONObject().put("action", "saveExam").put("exam", ex)) }?.let { say("Ujian tersimpan (${k.length} soal)"); screen = Screen.HOME; loadExams() }
        busy = null
    }

    // ---------------- scan
    fun startScan(u: Ujian?, mode: ScanMode) { exam = u; scanMode = mode; screen = Screen.SCAN }

    /** foto resolusi penuh dari CameraX (sudah diputar tegak) */
    fun process(bmp0: Bitmap, rotation: Int) = viewModelScope.launch {
        busy = "Memproses LJK…"
        val r = withContext(Dispatchers.Default) {
            var bmp = bmp0
            if (rotation != 0) bmp = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, Matrix().apply { postRotate(rotation.toFloat()) }, true)
            val s = minOf(1.0, 3000.0 / max(bmp.width, bmp.height))
            if (s < 1) bmp = Bitmap.createScaledBitmap(bmp, (bmp.width * s).roundToInt(), (bmp.height * s).roundToInt(), true)
            val px = IntArray(bmp.width * bmp.height); bmp.getPixels(px, 0, bmp.width, 0, 0, bmp.width, bmp.height)
            val img = ArgbImage(bmp.width, bmp.height, px); image = img
            when (scanMode) {
                ScanMode.LEGACY -> LjkEngine.processMarkerless(img, sensitivity = store.sensitivity.toDouble(), contrast = store.contrast.toDouble())
                ScanMode.KEY -> LjkEngine.processMarker(img, draft.opsi.length, 50, store.sensitivity.toDouble(), store.contrast.toDouble())
                ScanMode.EXAM -> LjkEngine.processMarker(img, exam!!.opsi.length, exam!!.jumlah, store.sensitivity.toDouble(), store.contrast.toDouble())
            }
        }
        busy = null
        if (!r.success) { say(r.error ?: "Gagal deteksi"); return@launch }
        if (scanMode == ScanMode.KEY) { keyFromScan(r); return@launch }
        result = r; answers.clear(); answers.addAll(r.answers); status.clear(); status.addAll(r.status)
        confirmFlags = false; scanId = UUID.randomUUID().toString().take(8); match = null; ocrMsg = ""; selSiswa = ""; nomorOcr = ""
        val kelasList = studentsOf(exam).map { it.kelas }.distinct().sorted()
        selKelas = if (kelasList.size == 1) kelasList[0] else ""
        screen = Screen.RESULT
        if (scanMode == ScanMode.EXAM) readIdentity(scanId)
    }

    private fun keyFromScan(r: LjkResult) {
        val last = r.answers.indexOfLast { it != null }
        draft.kunci = r.answers.take(last + 1).joinToString("") { (it ?: '-').toString() }
        draft = draft.let { ExamDraft(it.id, it.nama, it.mapel, it.kelas, it.opsi, it.kunci, it.kktp) }
        draftMsg = "Kunci dari scan: ${draft.kunci.length} soal" + if (draft.kunci.contains('-')) " (ada nomor kosong)" else ""
        screen = Screen.EXAM
    }

    private fun readIdentity(id: String) = viewModelScope.launch {
        val r = result ?: return@launch; val img = image ?: return@launch; val geo = r.geo ?: return@launch
        val st = withContext(Dispatchers.Default) { LjkEngine.identityStrips(img, geo, 12.0) }
        strips = st.mapValues { (_, v) -> Bitmap.createBitmap(v.first.argb, v.first.w, v.first.h, Bitmap.Config.ARGB_8888) }
        val inked = st.filter { it.value.second > 0.003 }.keys
        if (!store.ocr || inked.isEmpty()) { ocrMsg = if (inked.isEmpty()) "Kolom identitas kosong — pilih manual." else "OCR mati — pilih manual."; return@launch }
        val use = strips.filterKeys { it in inked }
        ocrMsg = "Membaca identitas (ML Kit)…"
        var f = IdentOcr.mlkit(use); var m = LjkIdent.match(f, studentsOf(exam))
        if ((m.nama == null || m.namaScore < 0.8) && store.token.isNotEmpty()) {
            ocrMsg = "Membaca identitas (OCR Google)…"
            val g = IdentOcr.google(api, use); val m2 = LjkIdent.match(g, studentsOf(exam))
            if (m2.nama != null && (m.nama == null || m2.namaScore > m.namaScore)) { f = g; m = m2 }
        }
        if (id != scanId) return@launch
        nomorOcr = f.nomor; match = m
        if (m.kelas != null) selKelas = m.kelas
        if (m.nama != null) { selSiswa = m.nama; ocrMsg = "OCR: ${f.nama.ifEmpty { f.nomor }} → ${m.nama} (${m.kelas}, cocok ${(m.namaScore * 100).roundToInt()}%). Periksa sebelum simpan." }
        else ocrMsg = "OCR membaca \"${f.nama.ifEmpty { "?" }}\" — belum yakin. Pilih manual / ketuk saran."
    }

    fun tapAnswer(q: Int, l: Char) { answers[q] = if (answers[q] == l) null else l; status[q] = if (answers[q] != null) "ok" else "blank"; confirmFlags = false }
    fun flagged() = status.mapIndexedNotNull { i, s -> if ((s == "double" || s == "weak") && i < (exam?.jumlah ?: 20)) i + 1 else null }
    fun score(): Pair<Int, Double>? { val u = exam ?: return null; var b = 0; for (i in 0 until u.jumlah) if (answers.getOrNull(i) != null && answers[i] == u.kunci[i]) b++; return b to (b * 10000.0 / u.jumlah).roundToInt() / 100.0 }

    fun save() = viewModelScope.launch {
        val u = exam ?: return@launch
        if (selKelas.isEmpty() || selSiswa.isEmpty()) { say("Pilih kelas dan nama siswa dulu"); return@launch }
        val fl = flagged()
        if (fl.isNotEmpty() && !confirmFlags) { confirmFlags = true; say("Nomor ${fl.joinToString()} perlu dicek. Tekan Simpan sekali lagi untuk tetap menyimpan."); return@launch }
        val st = studentsOf(u).firstOrNull { it.kelas == selKelas && it.nama == selSiswa }
        val q = result?.quality
        val body = JSONObject().put("action", "save").put("examId", u.id)
            .put("siswa", JSONObject().put("nama", selSiswa).put("kelas", selKelas).put("nomor", st?.nomor?.ifEmpty { null } ?: nomorOcr).put("nisn", st?.nisn ?: ""))
            .put("answers", JSONArray((0 until u.jumlah).map { (answers.getOrNull(it) ?: '-').toString() })).put("flags", JSONArray(fl))
            .put("mode", "marker-android").put("quality", (q?.grade ?: "") + (q?.score ?: "")).put("scanId", scanId)
        try {
            val r = api.post(body); say("✅ $selSiswa: ${r.optDouble("skor")} (${r.optInt("benar")}/${r.optInt("jumlah")})")
        } catch (e: Exception) {
            if (isNetwork(e)) { val qa = store.queue(); qa.put(body); store.setQueue(qa); queueSize = qa.length(); say("Offline: disimpan di antrean") }
            else { say("Gagal simpan: ${e.message}"); return@launch }
        }
        u.terscan.add("$selKelas|$selSiswa"); screen = Screen.SCAN
    }

    fun flushQueue() = viewModelScope.launch {
        val qa = store.queue(); if (qa.length() == 0) return@launch
        val rest = JSONArray()
        for (i in 0 until qa.length()) { val b = qa.getJSONObject(i); try { b.put("token", store.token); api.post(b) } catch (e: Exception) { rest.put(b) } }
        store.setQueue(rest); queueSize = rest.length()
        if (rest.length() < qa.length()) say("${qa.length() - rest.length()} hasil antrean terkirim")
    }

    // ---------------- analisis
    fun openAnalysis(u: Ujian) { exam = u; analysis = null; analysisScope = "tingkat" to ""; screen = Screen.ANALYSIS }
    fun runAnalysis() = viewModelScope.launch {
        busy = "Menghitung analisis…"
        analysis = call { api.post(JSONObject().put("action", "analyze").put("examId", exam!!.id).put("lingkup", analysisScope.first).put("kelas", analysisScope.second)) }
        busy = null
    }
    fun saveBank() = viewModelScope.launch {
        busy = "Menyimpan ke Bank Soal…"
        call { api.post(JSONObject().put("action", "bank").put("examId", exam!!.id).put("lingkup", analysisScope.first).put("kelas", analysisScope.second)) }?.let { say("Bank Soal: ${it.optInt("baru")} baru, ${it.optInt("diperbarui")} diperbarui") }
        busy = null
    }
}
