package id.buleudteu.desktop

import id.buleudteu.ljk.engine.ArgbImage
import id.buleudteu.ljk.engine.LjkEngine
import id.buleudteu.ljk.engine.LjkResult
import id.buleudteu.ljk.engine.LjkSpec
import id.buleudteu.ljk.engine.Pt
import id.buleudteu.ljk.ident.Fields
import id.buleudteu.ljk.ident.LjkIdent
import id.buleudteu.ljk.ident.Match
import id.buleudteu.ljk.ident.Siswa
import java.awt.image.BufferedImage
import java.util.UUID
import kotlin.math.max
import kotlin.math.roundToInt

enum class SheetState(val label: String) {
    QUEUED("antre"), PROCESSING("diproses…"), READY("siap"), FAILED("gagal dibaca"),
    SAVING("menyimpan…"), SAVED("tersimpan"), OFFLINE("antrean offline"), SAVE_FAILED("gagal simpan")
}

/** Satu lembar LJK dalam batch (hanya data kecil yang disimpan: pratinjau ±1100 px, posisi bulatan, potongan identitas). */
class Sheet(val page: Page, val no: Int) {
    @Volatile var state = SheetState.QUEUED
    var error: String? = null
    var mode = ""; var quality = ""; var warnings: List<String> = emptyList(); var procMs = 0L
    val answers = ArrayList<Char?>(); val status = ArrayList<String>(); var suggest: List<String?> = emptyList(); var dark: List<DoubleArray> = emptyList()
    var total = 50; var rows = 10; var nOpt = 4            // tata letak lembar: marker 50x10 baris, LJK lama 20/25 x 5 baris
    var preview: BufferedImage? = null; var bubbles: List<List<Pt>> = emptyList(); var bubbleR = 0.0
    var strips: Map<String, BufferedImage> = emptyMap(); var inked: Set<String> = emptySet()
    @Volatile var ocrMsg = ""; var ocrRead = ""; var nomorOcr = ""; @Volatile var match: Match? = null
    var siswa: Siswa? = null                                 // dipilih GURU (OCR hanya rekomendasi)
    var confirmFlags = false
    val scanId = UUID.randomUUID().toString().take(8)
    var saveMsg = ""

    fun flagged(jumlah: Int) = status.mapIndexedNotNull { i, s -> if ((s == "double" || s == "weak") && i < jumlah) i + 1 else null }
    fun score(u: Ujian): Pair<Int, Double> { var b = 0; for (i in 0 until u.jumlah) if (answers.getOrNull(i) != null && answers[i] == u.kunci.getOrNull(i)) b++; return b to (b * 10000.0 / u.jumlah).roundToInt() / 100.0 }
    val best get() = match?.alternatives?.firstOrNull()
    fun tap(q: Int, l: Char) { if (q >= answers.size) return; answers[q] = if (answers[q] == l) null else l; status[q] = if (answers[q] != null) "ok" else "blank"; confirmFlags = false }
}

/** Pemrosesan: engine (marker F4 -> LJK lama 20/25) lalu identitas. Logika sama dengan Android/web. */
class Processor(private val store: Store, private val api: Api?) {
    /** tata letak LJK lama yang boleh untuk ujian ini (sama dengan web/Android) */
    fun legacyLayouts(u: Ujian?): List<LjkEngine.LegacyLayout> = when {
        u == null -> LjkEngine.LEGACY_LAYOUTS
        u.opsi != "ABCD" || u.jumlah > 25 -> emptyList()
        u.jumlah > 20 -> LjkEngine.LEGACY_LAYOUTS.take(1)
        else -> LjkEngine.LEGACY_LAYOUTS
    }

    fun read(img: ArgbImage, u: Ujian?): LjkResult {
        val sens = store.sensitivity; val con = store.contrast
        if (u == null) return LjkEngine.processMarkerlessAuto(img, sens, con, legacyLayouts(null)).let { l ->
            if (l.success) l else LjkEngine.processMarker(img, 4, 50, sens, con).takeIf { it.success } ?: l }
        val m = LjkEngine.processMarker(img, u.opsi.length, u.jumlah, sens, con)
        val lays = legacyLayouts(u)
        if (!m.success && lays.isNotEmpty()) {
            val l = LjkEngine.processMarkerlessAuto(img, sens, con, lays)
            if (l.success) { l.warnings.add("LJK lama (tanpa marker) terdeteksi — dinilai dengan kunci ujian ini."); return l }
        }
        return m
    }

    /** baca lembar: memuat gambar, engine, pratinjau, potongan identitas. Gambar penuh dibuang setelahnya. */
    fun process(s: Sheet, u: Ujian?) {
        s.state = SheetState.PROCESSING
        val t0 = System.currentTimeMillis()
        try {
            val img0 = Imaging.toArgb(Imaging.load(s.page, max(150, store.dpi)))
            val r = read(img0, u)
            s.procMs = System.currentTimeMillis() - t0
            if (!r.success) { s.error = r.error ?: "Tidak terbaca"; s.state = SheetState.FAILED; s.warnings = r.warnings.toList(); return }
            val img = r.image ?: img0
            s.mode = r.mode; s.quality = (r.quality?.grade ?: "") + (r.quality?.score ?: ""); s.warnings = r.warnings.toList()
            s.answers.clear(); s.answers.addAll(r.answers); s.status.clear(); s.status.addAll(r.status); s.suggest = r.suggest.toList(); s.dark = r.dark.toList()
            buildPreview(s, r, img)
            buildStrips(s, r, img)
            s.state = SheetState.READY
        } catch (e: OutOfMemoryError) { s.error = "Memori tidak cukup — turunkan DPI ke 200."; s.state = SheetState.FAILED
        } catch (e: Exception) { s.error = e.message ?: e.javaClass.simpleName; s.state = SheetState.FAILED }
    }

    private fun buildPreview(s: Sheet, r: LjkResult, img: ArgbImage) {
        val gs = r.gray!!.scale                       // koordinat engine (citra kerja) -> citra asli: / gs
        val f = minOf(1.0, 1100.0 / max(img.width, img.height))
        val w = (img.width * f).roundToInt(); val h = (img.height * f).roundToInt()
        val src = Imaging.toBuffered(img); val pv = BufferedImage(w, h, BufferedImage.TYPE_INT_RGB)
        pv.createGraphics().apply { setRenderingHint(java.awt.RenderingHints.KEY_INTERPOLATION, java.awt.RenderingHints.VALUE_INTERPOLATION_BILINEAR); drawImage(src, 0, 0, w, h, null); dispose() }
        s.preview = pv
        val k = f / gs
        if (r.mode == "marker") {
            val geo = r.geo!!; s.total = 50; s.rows = LjkSpec.ROWS; s.nOpt = geo.nOpt
            s.bubbles = (0 until 50).map { q -> (0 until geo.nOpt).map { o -> val m = LjkSpec.bubbleMM(q, o); val p = geo.map(m.x, m.y); Pt(p.x * k, p.y * k) } }
            s.bubbleR = LjkSpec.R * geo.pxPerMm * k
        } else {
            val lat = r.lattice!!; val rows = r.grid.size; s.total = lat.questions; s.rows = rows; s.nOpt = lat.options
            s.bubbles = (0 until lat.questions).map { q -> val b = q / rows; val rr = q % rows; (0 until lat.options).map { o -> val g = r.grid[rr][b * lat.options + o]; Pt(g.x * k, g.y * k) } }
            s.bubbleR = lat.r0 * k
        }
    }

    private fun buildStrips(s: Sheet, r: LjkResult, img: ArgbImage) {
        if (r.mode == "marker") {
            val st = LjkEngine.identityStrips(img, r.geo!!, 12.0)
            s.strips = st.mapValues { (_, v) -> Imaging.toBuffered(v.first.argb, v.first.w, v.first.h) }
            s.inked = st.filter { it.value.second > 0.003 }.keys
        } else {
            val rc = LjkEngine.identLattice(img, r.lattice!!, 1100)
            s.strips = mapOf("identitas" to Imaging.toBuffered(rc.argb, rc.w, rc.h)); s.inked = setOf("identitas")
        }
    }

    /** OCR Google (lewat Apps Script) -> rekomendasi siswa. Tidak memilih otomatis. */
    fun identify(s: Sheet, students: List<Siswa>) {
        if (s.state != SheetState.READY) return
        if (!store.ocr || api == null || store.token.isEmpty()) { s.ocrMsg = "OCR mati — pilih siswa manual."; return }
        if (s.inked.isEmpty()) { s.ocrMsg = "Kolom identitas kosong — pilih manual."; return }
        s.ocrMsg = "Membaca identitas (OCR Google)…"
        fun ocr(b: BufferedImage) = try { api.post(mapOf("action" to "ocr", "image" to Imaging.jpegB64(b))).s("text") } catch (e: Exception) { "" }
        val f: Fields = if (s.mode == "marker") {
            val t = s.strips.filterKeys { it in s.inked }.mapValues { ocr(it.value) }
            LjkIdent.fromFields(t["nama"], t["nomor"], t["kelas"])
        } else LjkIdent.parse(ocr(s.strips.getValue("identitas")))
        val m = LjkIdent.match(f, students)
        s.nomorOcr = if (s.mode == "marker") f.nomor else LjkIdent.digits(f.nomor)
        s.ocrRead = f.nama.ifEmpty { f.nomor }; s.match = m
        val best = m.alternatives.firstOrNull()
        val baca = listOfNotNull(f.nomor.ifEmpty { null }?.let { "No. $it" }, f.nama.ifEmpty { null }?.let { "\"$it\"" }, f.kelas.ifEmpty { null }?.let { "kelas $it" }).joinToString(" · ")
        s.ocrMsg = when {
            baca.isEmpty() -> "OCR tidak membaca identitas — pilih manual."
            m.via == "nomor" -> "OCR: $baca — cocok nomor peserta."
            f.nama.isEmpty() -> "OCR: $baca — nama tidak terbaca, pilih manual."
            best == null || best.skor < 0.6 -> "OCR: $baca — tidak ada nama yang mirip."
            best.skor < 0.8 -> "OCR: $baca — belum yakin, periksa saran."
            else -> "OCR: $baca"
        }
    }

    fun body(s: Sheet, u: Ujian, students: List<Siswa>): Map<String, Any?> {
        val st = s.siswa!!
        val full = students.firstOrNull { it.kelas == st.kelas && it.nama == st.nama } ?: st
        return mapOf("action" to "save", "examId" to u.id,
            "siswa" to mapOf("nama" to st.nama, "kelas" to st.kelas, "nomor" to full.nomor.ifEmpty { s.nomorOcr }, "nisn" to full.nisn),
            "answers" to (0 until u.jumlah).map { (s.answers.getOrNull(it) ?: '-').toString() }, "flags" to s.flagged(u.jumlah),
            "mode" to if (s.mode == "marker") "marker-adf" else "markerless-adf", "quality" to s.quality, "scanId" to s.scanId)
    }
}

/** siswa yang mungkin untuk ujian (sama dengan Android studentsOf) */
fun studentsOf(d: ExamsData?, u: Ujian?): List<Siswa> = d?.siswa?.filter { s -> u == null || (if (u.kelas.isEmpty() || "SEMUA" in u.kelas) (u.tingkat.isEmpty() || s.tingkat == u.tingkat) else s.kelas in u.kelas) } ?: emptyList()

/** pencarian lintas kelas: berisi kata kunci, atau mirip (toleran salah ketik) */
fun searchStudents(all: List<Siswa>, q: String, kelas: String): List<Siswa> {
    val list = all.filter { kelas.isEmpty() || it.kelas == kelas }; val t = q.trim().uppercase()
    if (t.isEmpty()) return list.sortedWith(compareBy({ it.kelas }, { it.nama }))
    return list.map { it to (if (it.nama.contains(t)) 2.0 else LjkIdent.nameSim(t, it.nama)) }.filter { it.second >= 0.5 }.sortedByDescending { it.second }.take(30).map { it.first }
}
