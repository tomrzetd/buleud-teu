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
        for (t in ta) tot += tb.maxOf { ratio(t, it) }
        s = max(s, (tot / ta.size) * min(1.0, ta.size.toDouble() / tb.size + 0.25))
        return s
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
            if (hits.size == 1) return Match(hits[0].kelas, hits[0].nama, 1.0, 1.0, "nomor", emptyList())
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
