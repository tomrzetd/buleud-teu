package id.buleudteu.ljk.ident

import kotlin.math.max
import kotlin.math.min

/**
 * Identitas siswa: bersihkan hasil OCR per kolom LJK F4 lalu cocokkan ke daftar siswa
 * (port 1:1 dari web/js/ljk-ident.js; diuji silang oleh tools/test/kotlin/IdentSpecTest.kt).
 */
data class Siswa(val nama: String, val kelas: String, val nomor: String = "", val nisn: String = "", val tingkat: String = "")
data class Fields(val nama: String, val nomor: String, val kelas: String)
data class Alt(val nama: String, val kelas: String, val skor: Double)
data class Match(val kelas: String?, val nama: String?, val kelasScore: Double, val namaScore: Double, val via: String, val alternatives: List<Alt>)

object LjkIdent {
    fun lev(a: String, b: String): Int {
        val m = a.length; val n = b.length; if (m == 0) return n; if (n == 0) return m
        var prev = IntArray(n + 1) { it }; var cur = IntArray(n + 1)
        for (i in 1..m) {
            cur[0] = i
            for (j in 1..n) cur[j] = min(min(prev[j] + 1, cur[j - 1] + 1), prev[j - 1] + if (a[i - 1] == b[j - 1]) 0 else 1)
            val t = prev; prev = cur; cur = t
        }
        return prev[n]
    }
    fun normName(s: String) = s.uppercase().replace(Regex("[^A-Z ]"), " ").replace(Regex("\\s+"), " ").trim()
    fun normCls(s: String) = s.uppercase().replace("KELAS", "").replace(Regex("[^A-Z0-9]"), "")
        .replaceFirst(Regex("^O"), "0").replaceFirst(Regex("^[I|L]"), "1").replaceFirst(Regex("^S(?=[A-Z])"), "5")
    fun digits(s: String) = s.uppercase().replace(Regex("[OQ]"), "0").replace(Regex("[IL|]"), "1").replace("S", "5").replace("B", "8").replace(Regex("[^0-9]"), "")
    private fun ratio(a: String, b: String): Double = if (a.isEmpty() || b.isEmpty()) 0.0 else 1 - lev(a, b).toDouble() / max(a.length, b.length)

    fun nameSim(ocr: String, real: String): Double {
        val a = normName(ocr); val b = normName(real)
        if (a.isEmpty() || b.isEmpty()) return 0.0
        var s = max(ratio(a, b), ratio(a.replace(" ", ""), b.replace(" ", "")))
        val ta = a.split(" "); val tb = b.split(" ")
        var tot = 0.0
        for ((i, t) in ta.withIndex()) tot += tb.maxOf { if (t.length == 1 && i == ta.size - 1 && i > 0) (if (it.startsWith(t)) 0.9 else 0.0) else ratio(t, it) }   // inisial nama belakang: "DWI PUTRI M." = MAHARANI
        s = max(s, (tot / ta.size) * min(1.0, ta.size.toDouble() / tb.size + 0.25))
        return s
    }

    // ---------- LJK lama: satu potongan berlabel ("Nama Peserta : IBNU ...") -> field (port parse() JS)
    private val I = setOf(RegexOption.IGNORE_CASE)
    private val LABELS = listOf(
        "nomor" to Regex("n[o0]m[o0]r|n[o0]\\.?\\s*peserta|n[o0]\\.?\\s*ujian", I),
        "nama" to Regex("\\bnama\\b", I),
        "kelas" to Regex("\\bke[l1i]as\\b", I),
        "mapel" to Regex("mata\\s*pe[l1i]|pe[l1i]ajaran|mapel", I))
    private val RIGHT_COL = Regex("sekolah|hari|tanggal|waktu", I)
    private val NAMA_RE = Regex("\\bnama\\b", I)
    private val AFTER = Regex("(peserta|ujian|kelas|ke[l1i]as|pelajaran|pe[l1i]ajaran|mapel)\\s*[:;.]?(.*)$", I)
    private val JUNK = Regex("lembar|jawaban|penilaian|tahun", I)
    private fun clean(s: String) = s.replace(Regex("^[\\s:;.,_\\-–—|]+"), "").replace(Regex("[_]{2,}.*$"), "").replace(Regex("[\\s:;.,_\\-–—|]+$"), "").trim()

    fun parse(text: String?): Fields {
        val lines = (text ?: "").split(Regex("\\r?\\n")).map { it.trim() }.filter { it.isNotEmpty() }.map { it.split(RIGHT_COL)[0].trim() }.filter { it.isNotEmpty() }
        val out = linkedMapOf("nomor" to "", "nama" to "", "kelas" to "", "mapel" to "")
        val order = ArrayList<String>(); val loose = ArrayList<String>()
        for (l in lines) {
            val lab = LABELS.firstOrNull { (k, re) -> re.containsMatchIn(l) && !(k == "nomor" && NAMA_RE.containsMatchIn(l)) }
            if (lab != null) {
                val v = AFTER.find(l)?.let { clean(it.groupValues[2]) } ?: ""
                if (v.isNotEmpty() && out[lab.first]!!.isEmpty()) out[lab.first] = v else order.add(lab.first)
            } else { val v = clean(l); if (v.isNotEmpty() && !JUNK.containsMatchIn(v)) loose.add(v) }
        }
        // label tanpa nilai di barisnya -> isi menurut BENTUK nilai (OCR sering menukar urutan / melewatkan baris)
        val sisa = ArrayList<String>()
        for (v in loose) {
            val t = when { isNomor(v) -> "nomor"; isKelas(v) -> "kelas"; isMapel(v) -> "mapel"; isNama(v) -> if (out["nama"]!!.isEmpty() && "nama" in order) "nama" else "mapel"; else -> "" }
            if (t.isNotEmpty() && t in order && out[t]!!.isEmpty()) out[t] = v else sisa.add(v)
        }
        for (k in order) if (out[k]!!.isEmpty() && sisa.isNotEmpty() && cocok(k, sisa[0])) out[k] = sisa.removeAt(0)
        if (out.values.all { it.isEmpty() } && sisa.size >= 3) for (k in listOf("nomor", "nama", "kelas", "mapel")) if (sisa.isNotEmpty()) out[k] = sisa.removeAt(0)
        rapikan(out)
        return Fields(out["nama"]!!, out["nomor"]!!, out["kelas"]!!)
    }

    // ---------- bentuk nilai (port 1:1 ljk-ident.js)
    private fun cmp(v: String) = v.uppercase().replace("KELAS", "").replace(Regex("[\\s.]"), "")
    private fun nDig(v: String) = v.count { it in '0'..'9' }
    private fun nHuruf(v: String) = v.count { it in 'A'..'Z' || it in 'a'..'z' }
    private val KELAS_RE = Regex("^([0-9]{1,2}|VII|VIII|IX)[-]?[A-Z]?[0-9]?$")
    private val MAPEL_RE = Regex("\\b(informatika|matematika|ipa|ips|bahasa|indonesia|inggris|sunda|pkn|ppkn|pancasila|seni|budaya|pjok|penjas|agama|pai|prakarya|tik|fisika|biologi|bk)\\b", I)
    fun isNomor(v: String): Boolean { val d = nDig(v); return d >= 3 && d >= 0.6 * (d + nHuruf(v)) }
    fun isKelas(v: String): Boolean { val c = cmp(v); return c.length <= 6 && KELAS_RE.matches(c) && !isNomor(v) }
    fun isMapel(v: String) = MAPEL_RE.containsMatchIn(v)
    fun isNama(v: String): Boolean { val h = nHuruf(v); return h >= 3 && h >= 0.7 * (h + nDig(v)) && !isKelas(v) && !isMapel(v) }
    private fun cocok(k: String, v: String) = when (k) { "nomor" -> isNomor(v) || !isNama(v); "kelas" -> isKelas(v); "nama" -> isNama(v); else -> true }
    private fun rapikan(o: MutableMap<String, String>) {
        val kl = o["kelas"]!!
        if (kl.isNotEmpty() && !isKelas(kl) && isNomor(kl) && o["nomor"]!!.isEmpty()) { o["nomor"] = kl; o["kelas"] = "" }
        val nm = o["nama"]!!
        if (nm.isNotEmpty() && !isNama(nm)) { if (isKelas(nm) && o["kelas"]!!.isEmpty()) o["kelas"] = nm else if (isNomor(nm) && o["nomor"]!!.isEmpty()) o["nomor"] = nm; o["nama"] = "" }
        val no = o["nomor"]!!
        if (no.isNotEmpty() && !isNomor(no) && !(digits(no).length >= 3 && !isNama(no) && !isKelas(no))) { if (isKelas(no) && o["kelas"]!!.isEmpty()) o["kelas"] = no else if (isNama(no) && o["nama"]!!.isEmpty()) o["nama"] = no; o["nomor"] = "" }
    }

    /** Baris OCR dengan kotak posisi (ML Kit). Disusun ulang per BARIS visual supaya "Nama Peserta" dan tulisan
     *  tangan di kanannya menjadi satu baris "Nama Peserta DWI PUTRI M." walau OCR memisahkannya ke blok lain. */
    data class Baris(val text: String, val x0: Int, val y0: Int, val x1: Int, val y1: Int)
    fun susunBaris(lines: List<Baris>): String {
        val ls = lines.filter { it.text.isNotBlank() }.sortedBy { (it.y0 + it.y1) / 2 }
        val rows = ArrayList<MutableList<Baris>>()
        for (l in ls) {
            val yc = (l.y0 + l.y1) / 2.0; val h = (l.y1 - l.y0).coerceAtLeast(1)
            val row = rows.lastOrNull()
            if (row != null) {
                val ry0 = row.minOf { it.y0 }; val ry1 = row.maxOf { it.y1 }; val rc = (ry0 + ry1) / 2.0
                val tol = 0.5 * maxOf(h, row.minOf { it.y1 - it.y0 })
                if (kotlin.math.abs(yc - rc) <= tol) { row.add(l); continue }
            }
            rows.add(mutableListOf(l))
        }
        return rows.joinToString("\n") { r -> r.sortedBy { it.x0 }.joinToString(" ") { it.text.trim() } }
    }

    fun fromFields(nama: String?, nomor: String?, kelas: String?): Fields {
        fun one(s: String?) = (s ?: "").replace(Regex("\\r?\\n"), " ").replace(Regex("[|_\\[\\]{}]"), " ").replace(Regex("\\s+"), " ").trim()
        val map = mapOf('0' to "O", '1' to "I", '2' to "Z", '4' to "A", '5' to "S", '6' to "G", '8' to "B")
        val nm = one(nama).uppercase().map { c -> if (c.isDigit()) map[c] ?: "" else c.toString() }.joinToString("")
            .replace(Regex("[^A-Z' .-]"), "").replace(Regex("\\s+"), " ").trim()
        return Fields(nm, digits(one(nomor)), one(kelas).uppercase().replace(Regex("[^A-Z0-9 -]"), "").replace(Regex("\\s+"), ""))
    }

    fun match(f: Fields, students: List<Siswa>): Match {
        if (students.isEmpty()) return Match(null, null, 0.0, 0.0, "", emptyList())
        val nd = digits(f.nomor)
        if (nd.length >= 3) {
            val hits = students.filter { it.nomor.isNotEmpty() && digits(it.nomor) == nd }
            if (hits.size == 1) return Match(hits[0].kelas, hits[0].nama, 1.0, 1.0, "nomor", listOf(Alt(hits[0].nama, hits[0].kelas, 1.0)))
        }
        var kelas: String? = null; var kelasScore = 0.0
        val classes = students.map { it.kelas }.distinct()
        val oc = normCls(f.kelas)
        if (oc.isNotEmpty()) {
            val sc = classes.map { c -> c to (if (normCls(c) == oc) 1.0 else ratio(normCls(c), oc)) }.sortedByDescending { it.second }
            if (sc[0].second >= 0.5 && (sc.size < 2 || sc[0].second > sc[1].second)) { kelas = sc[0].first; kelasScore = sc[0].second }
        }
        fun rank(pool: List<Siswa>) = pool.map { it to nameSim(f.nama, it.nama) }.sortedByDescending { it.second }
        var r = if (kelas != null) rank(students.filter { it.kelas == kelas }) else emptyList()
        if (r.isEmpty() || r[0].second < 0.55) {
            val all = rank(students)
            if (all.isNotEmpty() && (r.isEmpty() || all[0].second > r[0].second + 0.1)) r = all
        }
        var nama: String? = null; var namaScore = 0.0; var via = ""; var alts = emptyList<Alt>()
        if (r.isNotEmpty()) {
            alts = r.take(3).map { Alt(it.first.nama, it.first.kelas, Math.round(it.second * 100) / 100.0) }
            val margin = if (r.size > 1) r[0].second - r[1].second else 1.0
            if (r[0].second >= 0.55 && margin >= 0.06) {
                nama = r[0].first.nama; namaScore = r[0].second; via = "nama"
                if (kelas == null || kelas != r[0].first.kelas) kelas = r[0].first.kelas
            }
        }
        return Match(kelas, nama, kelasScore, namaScore, via, alts)
    }
}
