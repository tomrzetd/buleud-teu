package id.buleudteu.ljk

import android.app.Application
import android.graphics.Bitmap
import android.graphics.Matrix
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.Observer
import androidx.work.WorkInfo
import androidx.work.WorkManager
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

enum class Screen { SETUP, LOGIN, HOME, SETTINGS, EXAM, SCAN, RESULT, ANALYSIS }
enum class ScanMode { EXAM, KEY, LEGACY }

class ExamDraft(var id: String = "", var nama: String = "", var mapel: String = "", var kelas: MutableList<String> = mutableListOf(), var opsi: String = "ABCD", var kunci: String = "", var kktp: Double = 75.0)

class AppViewModel(app: Application) : AndroidViewModel(app) {
    val store = Store(app)
    val api = Api(store)
    private val outbox = ScanOutbox(app)

    var screen by mutableStateOf(if (store.api.isEmpty()) Screen.HOME else if (store.token.isEmpty()) Screen.LOGIN else Screen.HOME)
    var demoActive by mutableStateOf(store.api.isEmpty())
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
    /** jenis LJK bermarker terakhir yang berhasil (dicoba lebih dulu) */
    private var lastLayout: String? = null
    var queueSize by mutableStateOf(store.queue().length())
    var blockedQueueSize by mutableStateOf(0)
    var otherAccountQueueSize by mutableStateOf(0)
    // Compose snapshot dari SQLite: kode status tidak menunggu refresh roster.
    var localPendingKeys by mutableStateOf<Set<String>>(emptySet())
    var localBlockedKeys by mutableStateOf<Set<String>>(emptySet())
    var localConfirmedKeys by mutableStateOf<Set<String>>(emptySet())
    var loading by mutableStateOf<String?>(null)        // progres ringan (memuat data) di beranda
    // Hanya response "exams" terbaru berhak mengaktifkan UI. Status dari
    // get/config atau SharedPreferences lama tidak boleh menahan aktivasi.
    var licenseChecked by mutableStateOf(false)
    val isDemo: Boolean get() = demoActive || !licenseChecked || data?.licensed != true

    companion object { const val WATERMARK = "by : rizalabdurrahman@guru.smp.belajar.id" }

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
    var selKelasFilter by mutableStateOf("")
    var nomorOcr = ""
    private var confirmFlags = false
    private var confirmRecovered = false
    private var confirmRescan = false
    private var scanId = ""
    var analysis by mutableStateOf<JSONObject?>(null)
    var analysisScope by mutableStateOf("tingkat" to "")

    // UI memantau status WorkManager (tanpa memicu panggilan jaringan baru).
    private val syncObserver = Observer<List<WorkInfo>> {
        viewModelScope.launch { updateQueueCounters() }
    }

    init {
        if (demoActive) startDemo()
        if (!demoActive && store.configJson.isNotEmpty()) runCatching { applyConfig(JSONObject(store.configJson)) }
        // Roster dan hak akses adalah snapshot yang diterima dari SERVER pada login sebelumnya.
        // Ini hanya untuk UI/offline. Server tetap memverifikasi lisensi SETIAP operasi tulis.
        if (screen == Screen.HOME && store.examsJson.isNotEmpty()) {
            data = runCatching { Api.exams(JSONObject(store.examsJson)) }.getOrNull()
            licenseChecked = data != null
        }
        WorkManager.getInstance(app).getWorkInfosForUniqueWorkLiveData(ScanSync.WORK_NAME)
            .observeForever(syncObserver)
        viewModelScope.launch {
            withContext(Dispatchers.IO) { outbox.importLegacy(store) }
            updateQueueCounters()
            if (store.token.isNotBlank() && !isDemo && queueSize > 0) {
                ScanSync.schedule(getApplication())
            }
        }
        // Pada pemasangan baru / cache kosong, ambil roster sekali; bukan pada setiap dashboard.
        if (screen == Screen.HOME && data == null) loadExams()
    }

    override fun onCleared() {
        WorkManager.getInstance(getApplication()).getWorkInfosForUniqueWorkLiveData(ScanSync.WORK_NAME)
            .removeObserver(syncObserver)
        outbox.close()
        super.onCleared()
    }

    private suspend fun updateQueueCounters() {
        val stats = withContext(Dispatchers.IO) { outbox.snapshot(store.api, store.guruNama) }
        queueSize = stats.total
        blockedQueueSize = stats.blockedTotal
        otherAccountQueueSize = stats.otherAccountTotal
        localPendingKeys = stats.pending
        localBlockedKeys = stats.blocked
        localConfirmedKeys = stats.confirmed
    }

    /** uploaded=ACK server; pending=durable lokal; blocked=server menolak. */
    fun studentScanState(u: Ujian, kelas: String, nama: String): String {
        val key = ScanOutbox.studentKey(u.id, kelas, nama)
        return when {
            key in localBlockedKeys -> "blocked"
            key in localPendingKeys -> "pending"
            key in localConfirmedKeys ||
                u.terscan.any { it.equals(kelas + "|" + nama, ignoreCase = true) } -> "uploaded"
            else -> "none"
        }
    }
    fun studentScanCounts(u: Ujian): Pair<Int, Int> {
        var uploaded = 0
        var pending = 0
        studentsOf(u).forEach {
            when (studentScanState(u, it.kelas, it.nama)) {
                "uploaded" -> uploaded++
                "pending", "blocked" -> pending++
            }
        }
        return uploaded to pending
    }

    /** Sinkronisasi berjalan di WorkManager, bukan di halaman dashboard. */
    fun syncPendingScans(retryBlocked: Boolean = false) = viewModelScope.launch {
        withContext(Dispatchers.IO) {
            if (retryBlocked) outbox.retryBlocked(store.api, store.guruNama)
        }
        updateQueueCounters()
        if (!isDemo && store.token.isNotBlank() && queueSize > 0) ScanSync.schedule(getApplication(), force = retryBlocked)
    }

    fun say(m: String) { toast = m }

    // ---------------- setup & login
    fun startDemo() {
        // No API request and no outbox/school identity modifications.
        demoActive = true
        sekolah = DemoFixtures.school
        guruList = listOf("GURU DEMO")
        data = DemoFixtures.sample()
        licenseChecked = true
        exam = null
        setupMsg = ""
        screen = Screen.HOME
    }

    fun connect(url: String) = viewModelScope.launch {
        val u = url.trim()
        if (!Regex("^https://script\\.google\\.com/macros/s/[^/]+/exec$").matches(u)) { setupMsg = "URL harus https://script.google.com/macros/s/…/exec"; return@launch }
        setupMsg = "Menghubungi…"; busy = "Menghubungi server sekolah…"
        try {
            val c = api.get("config", u)
            if (c.optString("version") != "V40") throw ApiException("Apps Script masih versi lama. Pasang kode Buleud Teu V40.")
            if (store.api != u) {
                // Hak akses dan roster lama tidak berlaku untuk endpoint sekolah baru.
                store.token = ""
                store.examsJson = ""
                data = null
                licenseChecked = false
                ScanSync.cancel(getApplication())
            }
            demoActive = false
            store.api = u; store.configJson = c.toString(); applyConfig(c); setupMsg = ""; screen = Screen.LOGIN
        } catch (e: Exception) { setupMsg = if (isNetwork(e)) "Tidak bisa dihubungi. Cek internet & akses Web App \"Siapa saja\"." else e.message ?: "Gagal" }
        busy = null
    }
    private fun applyConfig(c: JSONObject) { sekolah = Api.sekolah(c); guruList = Api.guruList(c) }
    fun refreshConfig() = viewModelScope.launch {
        runCatching { api.get("config") }.onSuccess {
            store.configJson = it.toString(); applyConfig(it)
        }
    }

    fun login(guru: String, pin: String) = viewModelScope.launch {
        demoActive = false
        loginMsg = "Memeriksa…"; busy = "Masuk…"
        try {
            val r = api.post(JSONObject().put("action", "login").put("guru", guru).put("pin", pin).put("token", ""))
            store.token = r.getString("token"); store.guruNama = guru
            data = null; store.examsJson = ""; licenseChecked = false
            loginMsg = ""; screen = Screen.HOME
            syncPendingScans(retryBlocked = true)
            loadExams()
        } catch (e: Exception) { loginMsg = e.message ?: "Gagal" }
        busy = null
    }
    fun logout() {
        ScanSync.cancel(getApplication())
        store.token = ""; store.examsJson = ""
        data = null; licenseChecked = false; screen = Screen.LOGIN
        // Record lokal TIDAK dihapus agar scan tetap aman sampai akun yang sama login lagi.
    }

    private suspend fun <T> call(block: suspend () -> T): T? = try { block() } catch (e: ApiException) {
        if (e.auth) {
            store.token = ""; store.examsJson = ""
            data = null; licenseChecked = false; screen = Screen.LOGIN
        }
        say(e.message ?: "Gagal"); null
    } catch (e: Exception) { say(if (isNetwork(e)) "Offline / server tidak terjangkau" else (e.message ?: "Gagal")); null }

    // ---------------- ujian
    // ---------------- pembaruan aplikasi: sekolah HTTPS (uji) + GitHub fallback
    var update by mutableStateOf<Updater.Info?>(null)
    var updateChecking by mutableStateOf(false)
    var updateNotice by mutableStateOf("")
    private var updateChecked = false
    fun checkUpdate(force: Boolean = false) {
        if (updateChecking || (updateChecked && !force)) return
        updateChecked = true
        viewModelScope.launch {
            updateChecking = true
            try {
                update = withContext(Dispatchers.IO) { Updater.cek(getApplication()) }
                updateNotice = if (force && update == null)
                    "Belum ditemukan pembaruan terverifikasi. Periksa URL server dan jaringan."
                else ""
            } finally {
                updateChecking = false
            }
        }
    }

    fun loadExams() = viewModelScope.launch {
        if (demoActive || loading != null) return@launch
        // Jangan reset dashboard ketika server sibuk. Simpan snapshot valid sebelumnya.
        // Entitlement diambil dari response server pada login / tombol Refresh saja.
        loading = "Memperbarui daftar ujian…"
        val response = call { api.post(JSONObject().put("action", "exams")) }
        if (response != null) {
            val parsed = runCatching { Api.exams(response) }.getOrNull()
            if (parsed != null) {
                data = parsed
                store.examsJson = response.toString()
                licenseChecked = true
                if (!isDemo) syncPendingScans()
            }
        }
        loading = null
    }
    fun studentsOf(u: Ujian?) = data?.siswa?.filter { s ->
        if (u == null) true
        else if (u.kelas.isEmpty() || "SEMUA" in u.kelas) u.tingkat.isEmpty() || s.tingkat == u.tingkat
        else u.kelas.any { it.equals(s.kelas, ignoreCase = true) || it.equals(s.tingkat, ignoreCase = true) }
    } ?: emptyList()

    fun editExam(u: Ujian?) {
        draft = if (u == null) ExamDraft(mapel = data?.guru?.mapel?.firstOrNull() ?: "", opsi = data?.opsiDefault ?: "ABCD")
        else ExamDraft(u.id, u.nama, u.mapel, u.kelas.toMutableList(), u.opsi, u.kunci, u.kktp)
        draftMsg = ""; screen = Screen.EXAM
    }
    fun saveExam() = viewModelScope.launch {
        if (isDemo) { draftMsg = "Mode DEMO: menyimpan ujian nonaktif."; return@launch }
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
                ScanMode.LEGACY -> LjkEngine.processMarkerlessAuto(img, store.sensitivity.toDouble(), store.contrast.toDouble(), legacyLayouts())
                ScanMode.KEY -> LjkEngine.processMarker(img, draft.opsi.length, 50, store.sensitivity.toDouble(), store.contrast.toDouble())
                ScanMode.EXAM -> {
                    val u = exam!!
                    val m = if (u.opsi == "ABCD" && u.jumlah <= 25) {
                        LjkEngine.processMarkerAuto(img, u.opsi.length, u.jumlah, store.sensitivity.toDouble(), store.contrast.toDouble(), prefer = lastLayout).also { if (it.success) lastLayout = it.geo?.layout?.id }
                    } else {
                        LjkEngine.processMarker(img, u.opsi.length, u.jumlah, store.sensitivity.toDouble(), store.contrast.toDouble())
                    }
                    // LJK lama (tanpa marker, 20 atau 25 soal) dikenali otomatis untuk ujian <= 25 soal ABCD
                    val lays = legacyLayouts()
                    if (!m.success && lays.isNotEmpty()) {
                        val l = LjkEngine.processMarkerlessAuto(img, store.sensitivity.toDouble(), store.contrast.toDouble(), lays)
                        if (l.success) { l.warnings.add("LJK lama (tanpa marker) terdeteksi — dinilai dengan kunci ujian ini."); l } else m
                    } else m
                }
            }
        }
        busy = null
        if (!r.success) { say(r.error ?: "Gagal deteksi"); return@launch }
        if (scanMode == ScanMode.KEY) { keyFromScan(r); return@launch }
        r.image?.let { image = it }      // LJK lama yang diputar otomatis: potongan identitas & bukti memakai gambar tegak
        result = r; answers.clear(); answers.addAll(r.answers); status.clear(); status.addAll(r.status)
        confirmFlags = false; confirmRecovered = false; confirmRescan = false
        scanId = UUID.randomUUID().toString(); match = null; ocrMsg = ""; selSiswa = ""; nomorOcr = ""
        val kelasList = studentsOf(exam).map { it.kelas }.distinct().sorted()
        selKelas = ""; selKelasFilter = if (kelasList.size == 1) kelasList[0] else ""
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
        val r = result ?: return@launch; val img = image ?: return@launch
        if (r.mode == "markerless") { readIdentityLegacy(id, r, img); return@launch }
        val geo = r.geo ?: return@launch
        val st = withContext(Dispatchers.Default) { LjkEngine.identityStrips(img, geo, 12.0) }
        strips = st.mapValues { (_, v) -> Bitmap.createBitmap(v.first.argb, v.first.w, v.first.h, Bitmap.Config.ARGB_8888) }
        val inked = st.filter { it.value.second > 0.003 }.keys
        if (!store.ocr || inked.isEmpty()) { ocrMsg = if (inked.isEmpty()) "Kolom identitas kosong — pilih manual." else "OCR mati — pilih manual."; return@launch }
        val use = strips.filterKeys { it in inked }
        ocrMsg = "Membaca identitas (ML Kit)…"
        var f = IdentOcr.mlkit(use); var m = LjkIdent.match(f, studentsOf(exam))
        if ((m.nama == null || m.namaScore < 0.8) && store.token.isNotEmpty() && !isDemo) {
            ocrMsg = "Membaca identitas (OCR Google)…"
            val g = IdentOcr.google(api, use); val m2 = LjkIdent.match(g, studentsOf(exam))
            if (m2.nama != null && (m.nama == null || m2.namaScore > m.namaScore)) { f = g; m = m2 }
        }
        if (id != scanId) return@launch
        nomorOcr = f.nomor; match = m; ocrMsg = recommendMsg(f, m)
        m.kelas?.let { k -> if (studentsOf(exam).any { it.kelas == k }) selKelasFilter = k }
    }

    /** LJK lama: satu potongan berlabel (Nomor/Nama/Kelas/Mapel) -> OCR -> parse -> cocokkan */
    private suspend fun readIdentityLegacy(id: String, r: LjkResult, img: ArgbImage) {
        val lat = r.lattice ?: return
        val rc = withContext(Dispatchers.Default) { LjkEngine.identLattice(img, lat, 1100) }
        val bmp = Bitmap.createBitmap(rc.argb, rc.w, rc.h, Bitmap.Config.ARGB_8888)
        strips = mapOf("identitas" to bmp)
        if (!store.ocr) { ocrMsg = "OCR mati — pilih manual."; return }
        ocrMsg = "Membaca identitas (ML Kit)…"
        var f = LjkIdent.parse(IdentOcr.mlkitText(bmp)); var m = LjkIdent.match(f, studentsOf(exam))
        if ((m.nama == null || m.namaScore < 0.8) && store.token.isNotEmpty() && !isDemo) {
            ocrMsg = "Membaca identitas (OCR Google)…"
            val t = try { api.post(JSONObject().put("action", "ocr").put("image", IdentOcr.jpegB64(bmp))).optString("text") } catch (e: Exception) { "" }
            val g = LjkIdent.parse(t); val m2 = LjkIdent.match(g, studentsOf(exam))
            if (m2.nama != null && (m.nama == null || m2.namaScore > m.namaScore)) { f = g; m = m2 }
        }
        if (id != scanId) return
        nomorOcr = LjkIdent.digits(f.nomor); match = m; ocrMsg = recommendMsg(f, m)
        m.kelas?.let { k -> if (studentsOf(exam).any { it.kelas == k }) selKelasFilter = k }
    }

    /** OCR hanya rekomendasi: guru tetap memilih/mencari sendiri. Tampilkan SEMUA yang terbaca supaya guru bisa menilai. */
    private fun recommendMsg(f: id.buleudteu.ljk.ident.Fields, m: Match): String {
        val best = m.alternatives.firstOrNull()
        val baca = listOfNotNull(f.nomor.ifEmpty { null }?.let { "No. $it" }, f.nama.ifEmpty { null }?.let { "nama \"$it\"" }, f.kelas.ifEmpty { null }?.let { "kelas $it" }).joinToString(" · ")
        return when {
            baca.isEmpty() -> "OCR tidak membaca identitas. Cari / pilih siswa secara manual."
            m.via == "nomor" -> "OCR membaca $baca → cocok dengan nomor peserta. Periksa lalu simpan."
            f.nama.isEmpty() -> "OCR membaca $baca, tetapi nama tidak terbaca. Cari / pilih siswa secara manual."
            best == null || best.skor < SARAN_MIN -> "OCR membaca $baca — tidak ada nama yang mirip di daftar siswa. Cari manual."
            best.skor < 0.8 -> "OCR membaca $baca — belum yakin. Periksa saran di bawah atau cari manual."
            else -> "OCR membaca $baca. Rekomendasi (ketuk untuk memilih):"
        }
    }
    /** saran nama di bawah ambang ini tidak ditampilkan (menyesatkan) */
    val SARAN_MIN = 0.6

    /** pencarian siswa lintas kelas: berisi kata kunci, atau mirip (toleran salah ketik) */
    fun searchStudents(q: String): List<id.buleudteu.ljk.ident.Siswa> {
        val all = studentsOf(exam).filter { selKelasFilter.isEmpty() || it.kelas == selKelasFilter }
        val t = q.trim().uppercase()
        if (t.isEmpty()) return all.sortedBy { it.nama }
        return all.map { it to (if (it.nama.contains(t)) 2.0 else LjkIdent.nameSim(t, it.nama)) }.filter { it.second >= 0.5 }.sortedByDescending { it.second }.take(12).map { it.first }
    }
    fun pickStudent(nama: String, kelas: String) {
        selSiswa = nama; selKelas = kelas
        confirmRescan = false
    }

    fun tapAnswer(q: Int, l: Char) { answers[q] = if (answers[q] == l) null else l; status[q] = if (answers[q] != null) "ok" else "blank"; confirmFlags = false }
    fun flagged() = status.mapIndexedNotNull { i, s -> if ((s == "double" || s == "weak") && i < (exam?.jumlah ?: lamaN())) i + 1 else null }
    /** jumlah soal LJK lama yang terbaca (20 atau 25) */
    fun lamaN() = result?.lattice?.questions ?: 20
    /** tata letak LJK lama yang boleh: cek cepat = semua; ujian <= 25 soal ABCD (21-25 soal hanya LJK 25); selain itu tidak ada */
    fun legacyLayouts(): List<LjkEngine.LegacyLayout> = when (scanMode) {
        ScanMode.LEGACY -> LjkEngine.LEGACY_LAYOUTS
        ScanMode.EXAM -> exam?.let { if (it.opsi != "ABCD" || it.jumlah > 25) emptyList() else if (it.jumlah > 20) LjkEngine.LEGACY_LAYOUTS.take(1) else LjkEngine.LEGACY_LAYOUTS } ?: emptyList()
        else -> emptyList()
    }
    fun score(): Pair<Int, Double>? { val u = exam ?: return null; var b = 0; for (i in 0 until u.jumlah) if (answers.getOrNull(i) != null && answers[i] == u.kunci[i]) b++; return b to (b * 10000.0 / u.jumlah).roundToInt() / 100.0 }

    /**
     * Selalu simpan ke SQLite sebelum meninggalkan hasil scan.
     * Tidak menunggu Google Sheet / Apps Script, juga tidak hilang bila timeout.
     */
    fun save() = viewModelScope.launch {
        if (isDemo) { say("Mode latihan: hasil scan tidak dapat disimpan."); return@launch }
        if (busy != null) return@launch
        val u = exam ?: return@launch
        if (selKelas.isEmpty() || selSiswa.isEmpty()) {
            say("Pilih kelas dan nama siswa dulu"); return@launch
        }
        val previous = studentScanState(u, selKelas, selSiswa)
        if (previous != "none" && !confirmRescan) {
            confirmRescan = true
            val where = if (previous == "uploaded") "sudah di Spreadsheet" else "sudah tersimpan lokal"
            say("Siswa ini $where. Simpan ulang akan MEMPERBARUI nilainya. Tekan Simpan sekali lagi untuk konfirmasi.")
            return@launch
        }
        // Lower corners inferred from upper/mid markers: never silently
        // persist an official score without a deliberate second confirmation.
        if (result?.warnings?.any { it.startsWith("Marker bawah terpotong") } == true &&
            !confirmRecovered) {
            confirmRecovered = true
            say("Marker bawah dipulihkan. Periksa 25 nomor + identitas siswa pada bukti deteksi, lalu tekan Simpan lagi untuk konfirmasi.")
            return@launch
        }
        val fl = flagged()
        if (fl.isNotEmpty() && !confirmFlags) {
            confirmFlags = true
            say("Nomor ${fl.joinToString()} perlu dicek. Tekan Simpan sekali lagi untuk tetap menyimpan.")
            return@launch
        }
        val st = studentsOf(u).firstOrNull { it.kelas == selKelas && it.nama == selSiswa }
        val q = result?.quality
        val body = JSONObject().put("action", "save").put("examId", u.id)
            .put("siswa", JSONObject().put("nama", selSiswa).put("kelas", selKelas)
                .put("nomor", st?.nomor?.ifEmpty { null } ?: nomorOcr).put("nisn", st?.nisn ?: ""))
            .put("answers", JSONArray((0 until u.jumlah).map { (answers.getOrNull(it) ?: '-').toString() }))
            .put("flags", JSONArray(fl))
            .put("mode", "marker-android")
            .put("quality", (q?.grade ?: "") + (q?.score ?: ""))
            .put("scanId", scanId).put("capturedAt", System.currentTimeMillis())
        busy = "Menyimpan hasil ke perangkat…"
        val persisted = withContext(Dispatchers.IO) {
            outbox.enqueue(store.api, store.guruNama, body)
        }
        if (!persisted) {
            busy = null
            say("Penyimpanan lokal gagal! Hasil belum aman. Periksa ruang penyimpanan HP.")
            return@launch
        }
        updateQueueCounters()
        // Scheduler tidak memblokir UI. WorkManager menunggu koneksi dan retry server sibuk.
        ScanSync.schedule(getApplication())
        busy = null
        say("✓ Hasil aman di perangkat · ${queueSize} menunggu sinkronisasi")
        screen = Screen.SCAN
    }

    // ---------------- analisis
    fun openAnalysis(u: Ujian) { if (isDemo) { say("Analisis hanya untuk lisensi Terdaftar."); return }; exam = u; analysis = null; analysisScope = "tingkat" to ""; screen = Screen.ANALYSIS }
    fun runAnalysis() = viewModelScope.launch {
        if (isDemo) { say("Mode DEMO: analisis dinonaktifkan."); return@launch }
        busy = "Menghitung analisis…"
        analysis = call { api.post(JSONObject().put("action", "analyze").put("examId", exam!!.id).put("lingkup", analysisScope.first).put("kelas", analysisScope.second)) }
        busy = null
    }
    // ---------------- laporan (dibuat Apps Script: PDF F4 / Excel / Google Sheet)
    object Laporan {
        val BAGIAN = listOf("identitas" to "Identitas ujian & kop", "nilai" to "Daftar nilai (benar & skor)", "jawaban" to "Pilihan jawaban per nomor", "rekap" to "Rekap & ketuntasan",
            "statistik" to "Statistik tes (KR-20, SEM)", "butir" to "Analisis butir + rekomendasi", "pengecoh" to "Sebaran & pengecoh", "matriks" to "Matriks benar/salah", "ttd" to "Tanda tangan")
        val MODE = mapOf("simpel" to listOf("identitas", "nilai", "jawaban", "rekap", "ttd"), "lengkap" to BAGIAN.map { it.first })
    }
    var reportMode by mutableStateOf("simpel")
    val reportBagian = mutableStateListOf<String>().apply { addAll(Laporan.MODE.getValue("simpel")) }
    var reportFormat by mutableStateOf("pdf")
    var reportUrut by mutableStateOf("kelas")
    var reportAnonim by mutableStateOf(false)
    var reportFile by mutableStateOf<java.io.File?>(null)
    var reportMime = ""
    var reportUrl by mutableStateOf("")
    var reportInfo by mutableStateOf("")
    fun setReportModeTo(m: String) { reportMode = m; reportBagian.clear(); reportBagian.addAll(Laporan.MODE.getValue(m)) }
    fun toggleBagian(k: String) { if (k in reportBagian) reportBagian.remove(k) else reportBagian.add(k) }
    fun makeReport() = viewModelScope.launch {
        if (isDemo) { say("Mode DEMO: laporan dinonaktifkan."); return@launch }
        val u = exam ?: return@launch
        if (reportBagian.isEmpty()) { say("Pilih minimal satu bagian laporan"); return@launch }
        reportFile = null; reportUrl = ""; reportInfo = ""
        busy = "Membuat laporan ${if (reportFormat == "xlsx") "Excel" else if (reportFormat == "pdf") "PDF" else ""}…"
        val r = call { api.post(JSONObject().put("action", "report").put("examId", u.id).put("lingkup", analysisScope.first).put("kelas", analysisScope.second)
            .put("mode", reportMode).put("bagian", JSONArray(Laporan.BAGIAN.map { it.first }.filter { it in reportBagian })).put("format", reportFormat).put("urut", reportUrut).put("anonim", reportAnonim)) }
        if (r != null) {
            reportUrl = r.optString("url"); val rk = r.optJSONObject("ringkas")
            reportInfo = "${r.optString("nama")} · ${rk?.optInt("siswa") ?: 0} siswa · rata-rata ${rk?.opt("rataRata") ?: "-"}"
            val b64 = r.optString("base64")
            if (b64.isNotEmpty()) withContext(Dispatchers.IO) {
                val dir = java.io.File(getApplication<Application>().cacheDir, "laporan").apply { mkdirs() }
                val f = java.io.File(dir, r.optString("fileName").replace(Regex("[\\/:*?\"<>|]"), "-"))
                f.writeBytes(android.util.Base64.decode(b64, android.util.Base64.DEFAULT)); reportMime = r.optString("mime"); reportFile = f
            }
            say("Laporan siap")
        }
        busy = null
    }

    fun saveBank() = viewModelScope.launch {
        if (isDemo) { say("Mode DEMO: Bank Soal dinonaktifkan."); return@launch }
        busy = "Menyimpan ke Bank Soal…"
        call { api.post(JSONObject().put("action", "bank").put("examId", exam!!.id).put("lingkup", analysisScope.first).put("kelas", analysisScope.second)) }?.let { say("Bank Soal: ${it.optInt("baru")} baru, ${it.optInt("diperbarui")} diperbarui") }
        busy = null
    }
}
