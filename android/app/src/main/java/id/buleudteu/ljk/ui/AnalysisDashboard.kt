package id.buleudteu.ljk.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import id.buleudteu.ljk.AppViewModel
import org.json.JSONObject

/** satu butir hasil analisis (dari aksi "analyze") */
class Butir(o: JSONObject) {
    val no = o.optInt("no"); val kunci = o.optString("kunci"); val rek = o.optString("rekomendasi"); val alasan = o.optString("alasan")
    val p = o.optDouble("p"); val tk = o.optString("tk"); val d: Double? = if (o.isNull("d")) null else o.optDouble("d"); val dp = o.optString("dp")
    val r: Double? = if (o.isNull("rpbis")) null else o.optDouble("rpbis"); val rTabel: Double? = if (o.isNull("rTabel")) null else o.optDouble("rTabel")
    val korelasi = o.optString("korelasi", "-"); val kr20Del: Double? = if (o.isNull("kr20JikaDihapus") || !o.has("kr20JikaDihapus")) null else o.optDouble("kr20JikaDihapus")
    val sebaran: JSONObject = o.optJSONObject("sebaran") ?: JSONObject()
    val mati = o.optJSONArray("pengecohMati")?.let { a -> (0 until a.length()).map { a.getString(it) } } ?: emptyList()
    val hidup = o.optJSONArray("pengecohBerfungsi")?.let { a -> (0 until a.length()).map { a.getString(it) } } ?: emptyList()
}

/** status: warna + KODE TEKS (tidak hanya warna) */
private data class St(val warna: Color, val teks: Color, val kode: String, val label: String)
private fun st(b: Butir) = when (b.rek) {
    "Diterima" -> St(Color(0xFF166534), Color(0xFFDCFCE7), "✓", "Diterima")
    "Direvisi" -> St(Color(0xFF854D0E), Color(0xFFFEF9C3), "R", "Direvisi")
    "Audit kritis", "Dibuang" -> St(Color(0xFF991B1B), Color(0xFFFEE2E2), "!", "Audit kritis")
    "Data kurang" -> St(Color(0xFF334155), Color(0xFFE2E8F0), "?", "Data kurang")
    else -> St(Color(0xFF334155), Color(0xFFE2E8F0), "–", "Tidak dapat dinilai")
}
private fun f(v: Double?, d: Int = 2) = if (v == null || v.isNaN()) "–" else String.format(java.util.Locale.forLanguageTag("id"), "%.${d}f", v).trimEnd('0').trimEnd(',')

private class Saring(val k: String, val t: String, val fn: (Butir) -> Boolean)
private val FILTERS: List<Saring> = listOf(
    Saring("semua", "Semua") { true },
    Saring("tinjau", "Perlu ditinjau") { b -> b.rek == "Direvisi" || st(b).kode == "!" },
    Saring("audit", "Audit kritis") { b -> st(b).kode == "!" },
    Saring("rev", "Direvisi") { b -> b.rek == "Direvisi" },
    Saring("ok", "Diterima") { b -> b.rek == "Diterima" },
    Saring("na", "Data kurang") { b -> st(b).kode == "?" || st(b).kode == "–" })

@Composable fun AnalysisDashboard(vm: AppViewModel, a: JSONObject) {
    val R = a.optJSONObject("ringkasan") ?: JSONObject()
    val items = remember(a) { a.optJSONArray("butir")?.let { arr -> (0 until arr.length()).map { Butir(arr.getJSONObject(it)) } } ?: emptyList() }
    var filter by remember(a) { mutableStateOf("semua") }
    var sel by remember(a) { mutableStateOf(items.firstOrNull { st(it).kode == "!" }?.no ?: items.firstOrNull { it.rek != "Diterima" }?.no ?: items.firstOrNull()?.no) }
    val tinjau = items.count(FILTERS[1].fn); val audit = items.count(FILTERS[2].fn)

    Card {
        Text("Ringkasan", color = Color.White, fontWeight = FontWeight.Bold)
        val pw = a.optJSONArray("peringatan"); if (pw != null) for (i in 0 until pw.length()) Note(pw.getString(i))
        val kpis = listOf(
            Triple("Siswa", "${R.optInt("n")}", "${R.optInt("k")} soal"), Triple("Rata-rata", f(R.optDouble("rataRata"), 1), "SD ${f(R.optDouble("sd"), 1)}"),
            Triple("Tuntas", "${f(R.optDouble("persenTuntas"), 1)}%", "${R.optInt("tuntas")} siswa"),
            Triple("KR-20", if (R.isNull("kr20")) "–" else f(R.optDouble("kr20")), R.optString("kategoriKr20")),
            Triple("SEM", if (R.isNull("sem")) "–" else f(R.optDouble("sem")), "butir benar"), Triple("Perlu ditinjau", "$tinjau", "dari ${items.size} butir"),
            Triple("Audit kritis", "$audit", if (audit > 0) "periksa kunci dulu" else "tidak ada"), Triple("Diterima", "${R.optInt("diterima")}", "Direvisi ${R.optInt("direvisi")}"))
        kpis.chunked(2).forEach { row -> Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            row.forEach { (l, v, s) ->
                val border = when { l == "Audit kritis" && audit > 0 -> BAD; l == "Perlu ditinjau" && tinjau > 0 -> WARN; else -> LINE }
                Column(Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).background(Color(0xFF0A1222)).border(1.dp, border, RoundedCornerShape(10.dp)).padding(8.dp)) {
                    Text(l, color = TX2, fontSize = 11.sp); Text(v, color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold); Text(s, color = TX2, fontSize = 11.sp) }
            } } }
        Text("Lembar lengkap: sheet ${a.optString("sheet")}. Statistik menunjukkan perilaku butir pada data siswa; kesesuaian dengan CP/TP & kisi-kisi tetap ditelaah guru.", color = TX2, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
        Button({ vm.saveBank() }, Modifier.fillMaxWidth().padding(top = 8.dp)) { Text("Simpan ke Bank Soal") }
    }

    val shown = items.filter(FILTERS.first { it.k == filter }.fn)
    Card {
        Text("Peta butir", color = Color.White, fontWeight = FontWeight.Bold)
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(vertical = 6.dp)) {
            FILTERS.forEach { sr -> val n = items.count(sr.fn)
                if (n > 0 || sr.k == "semua") FilterChip(filter == sr.k, { filter = sr.k; if (items.filter(sr.fn).none { it.no == sel }) sel = items.firstOrNull(sr.fn)?.no }, { Text("${sr.t} $n") }, Modifier.padding(end = 6.dp)) }
        }
        if (shown.isEmpty()) Text("Tidak ada butir pada saringan ini.", color = TX2, fontSize = 13.sp)
        shown.chunked(6).forEach { row -> Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            row.forEach { b -> val s = st(b)
                Column(Modifier.weight(1f).height(48.dp).clip(RoundedCornerShape(10.dp)).background(s.warna)
                    .border(if (sel == b.no) 3.dp else 0.dp, if (sel == b.no) Color.White else Color.Transparent, RoundedCornerShape(10.dp))
                    .clickable { sel = b.no }.semantics { contentDescription = "Butir ${b.no}: ${s.label}" },
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Text("${b.no}", color = s.teks, fontWeight = FontWeight.Bold, fontSize = 15.sp); Text(s.kode, color = s.teks, fontSize = 11.sp, fontWeight = FontWeight.Bold) }
            }
            repeat(6 - row.size) { Spacer(Modifier.weight(1f)) }
        } }
        Row(Modifier.padding(top = 6.dp)) { listOf("Diterima" to "✓", "Direvisi" to "R", "Audit kritis" to "!", "Data kurang" to "?").forEach { (l, k) -> Text("$k $l   ", color = TX2, fontSize = 12.sp) } }
    }
    items.firstOrNull { it.no == sel }?.let { b -> DetailButir(vm, b, shown, a.optString("opsi", vm.exam?.opsi ?: "ABCD"), R.optDouble("kr20")) { sel = it } }
}

@Composable private fun DetailButir(vm: AppViewModel, b: Butir, list: List<Butir>, opsi: String, kr20: Double, pick: (Int) -> Unit) {
    val s = st(b); val i = list.indexOfFirst { it.no == b.no }
    Card {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Butir ${b.no} · kunci ${b.kunci}", color = Color.White, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            Text("${s.kode} ${s.label}", color = s.teks, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.clip(RoundedCornerShape(50)).background(s.warna).padding(horizontal = 10.dp, vertical = 3.dp))
        }
        val mets = listOf(Triple("Kesukaran P", f(b.p), b.tk), Triple("Daya pembeda D", f(b.d), b.dp),
            Triple("Korelasi r", f(b.r), if (b.r == null) "tidak dapat dihitung" else "${b.korelasi} · r tabel ${f(b.rTabel)}"),
            Triple("KR-20 jika dihapus", f(b.kr20Del), if (b.kr20Del != null && !kr20.isNaN() && b.kr20Del > kr20) "naik bila dihapus" else ""))
        mets.chunked(2).forEach { row -> Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) { row.forEach { (l, v, c) ->
            Column(Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).background(Color(0xFF0A1222)).padding(8.dp)) { Text(l, color = TX2, fontSize = 11.sp); Text(v, color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.Bold); Text(c, color = TX2, fontSize = 11.sp) } } } }
        Text("SEBARAN JAWABAN: ATAS vs BAWAH", color = TX2, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 10.dp, bottom = 4.dp))
        (opsi + "-").forEach { c -> val L = c.toString(); val d = b.sebaran.optJSONObject(L) ?: JSONObject(); val key = L == b.kunci
            val tag = when { key -> "kunci"; L == "-" -> "kosong"; L in b.mati -> "pengecoh tidak berfungsi"; L in b.hidup -> "berfungsi"; else -> "" }
            Column(Modifier.fillMaxWidth().padding(vertical = 3.dp).clip(RoundedCornerShape(8.dp)).background(if (key) OK.copy(alpha = 0.15f) else Color.Transparent).padding(6.dp)) {
                Text("${if (L == "-") "–" else L}  ${(d.optDouble("p", 0.0) * 100).toInt()}%  $tag", color = if (L in b.mati && !key) Color(0xFFFCA5A5) else Color.White, fontSize = 13.sp)
                Bar("atas", d.optDouble("atas", 0.0), Color(0xFF60A5FA)); Bar("bawah", d.optDouble("bawah", 0.0), Color(0xFFF472B6))
            } }
        Text("Butir yang baik: kunci lebih banyak dipilih kelompok atas, pengecoh lebih banyak dipilih kelompok bawah.", color = TX2, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
        if (b.alasan.isNotEmpty()) Text("Alasan statistik: ${b.alasan}", color = Color.White, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp))
        Text("YANG PERLU DICEK", color = TX2, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 10.dp))
        saran(b).forEach { Text("• $it", color = Color.White, fontSize = 13.sp, modifier = Modifier.padding(top = 3.dp)) }
        Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            OutlinedButton({ list.getOrNull(i - 1)?.let { pick(it.no) } }, Modifier.weight(1f), enabled = i > 0) { Text("‹ Sebelumnya", fontSize = 12.sp) }
            OutlinedButton({ vm.exam?.let { vm.editExam(it) } }, Modifier.weight(1f)) { Text("Ubah kunci", fontSize = 12.sp) }
            OutlinedButton({ list.getOrNull(i + 1)?.let { pick(it.no) } }, Modifier.weight(1f), enabled = i >= 0 && i < list.size - 1) { Text("Berikutnya ›", fontSize = 12.sp) }
        }
    }
}

@Composable private fun Bar(label: String, v: Double, c: Color) {
    Row(Modifier.fillMaxWidth().height(16.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.weight(1f).height(10.dp)) { Box(Modifier.fillMaxWidth(v.toFloat().coerceIn(0.01f, 1f)).fillMaxHeight().clip(RoundedCornerShape(5.dp)).background(c)) }
        Text(" $label ${(v * 100).toInt()}%", color = TX2, fontSize = 11.sp, modifier = Modifier.width(78.dp))
    }
}

/** saran tindakan konkret (sama dengan versi web) */
private fun saran(b: Butir): List<String> {
    val s = ArrayList<String>(); val ekstrem = b.p >= 0.95 || b.p <= 0.05
    if (b.alasan.contains("kunci nomor ini tidak sah")) s += "Kunci nomor ini rusak di sheet Ujian — perbaiki lewat Ubah kunci."
    if (st(b).kode == "!") { s += "Cocokkan kunci ${b.kunci} dengan naskah soal nomor ${b.no}. Salah kunci adalah penyebab paling umum."
        s += "Bila kunci benar: cek apakah soal ambigu (dua jawaban benar) atau stimulus menyesatkan."; s += "Lihat lembar yang ditandai kuning untuk nomor ini; isian samar bisa salah terbaca." }
    if (!ekstrem && b.d != null && b.d >= 0 && b.d <= 0.2 && st(b).kode != "!") s += "Daya pembeda rendah: pertajam pengecoh atau perjelas indikator."
    if (b.mati.isNotEmpty() && !ekstrem) s += "Pengecoh ${b.mati.joinToString(", ")} hampir tidak dipilih / lebih dipilih kelompok atas: ganti dengan miskonsepsi yang umum."
    if (b.p > 0.9) s += "Hampir semua benar: boleh dipertahankan bila memang mengukur kompetensi dasar."
    if (b.p < 0.1) s += "Hampir semua salah: cek kunci, kesesuaian dengan materi yang sudah diajarkan, dan tingkat bahasa."
    if (b.rek == "Data kurang") s += "Peserta kurang dari 20: tunggu data kelas lain (lingkup tingkat) sebelum memutuskan."
    if (s.isEmpty()) s += "Butir berperilaku baik pada data ini. Tetap cek kesesuaian dengan kisi-kisi."
    return s
}
