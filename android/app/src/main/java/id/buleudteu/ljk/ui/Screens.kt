package id.buleudteu.ljk.ui

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Paint
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import id.buleudteu.ljk.AppViewModel
import id.buleudteu.ljk.ScanMode
import id.buleudteu.ljk.Screen
import id.buleudteu.ljk.data.Ujian
import id.buleudteu.ljk.engine.LjkEngine
import id.buleudteu.ljk.engine.LjkSpec
import java.io.File

val BG = Color(0xFF0B1220); val CARD = Color(0xFF131C2E); val LINE = Color(0xFF26344F); val TX2 = Color(0xFF9FB0CC)
val PRI = Color(0xFF4F7CFF); val OK = Color(0xFF22C55E); val BAD = Color(0xFFEF4444); val WARN = Color(0xFFF59E0B)

@Composable
fun AppRoot(vm: AppViewModel) {
    MaterialTheme(colorScheme = darkColorScheme(primary = PRI, background = BG, surface = CARD)) {
        Box(Modifier.fillMaxSize().background(BG)) {
            when (vm.screen) {
                Screen.SETUP -> SetupScreen(vm); Screen.LOGIN -> LoginScreen(vm); Screen.HOME -> HomeScreen(vm)
                Screen.EXAM -> ExamScreen(vm); Screen.SCAN -> ScanScreen(vm); Screen.RESULT -> ResultScreen(vm); Screen.ANALYSIS -> AnalysisScreen(vm)
            }
            vm.busy?.let { Box(Modifier.fillMaxSize().background(Color(0xBB000000)), contentAlignment = Alignment.Center) { Column(horizontalAlignment = Alignment.CenterHorizontally) { CircularProgressIndicator(); Text(it, color = Color.White, modifier = Modifier.padding(top = 12.dp)) } } }
            vm.toast?.let { msg ->
                LaunchedEffect(msg) { kotlinx.coroutines.delay(3500); if (vm.toast == msg) vm.toast = null }
                Box(Modifier.fillMaxWidth().padding(top = 40.dp, start = 16.dp, end = 16.dp).clip(RoundedCornerShape(12.dp)).background(Color(0xFF0F172A)).border(1.dp, LINE, RoundedCornerShape(12.dp)).padding(12.dp)) { Text(msg, color = Color.White, fontSize = 14.sp) }
            }
        }
    }
}

@Composable fun Top(title: String, sub: String = "", onBack: (() -> Unit)? = null, actions: @Composable RowScope.() -> Unit = {}) {
    Row(Modifier.fillMaxWidth().background(BG).padding(top = 34.dp, start = 14.dp, end = 14.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        if (onBack != null) Text("←", color = Color.White, fontSize = 24.sp, modifier = Modifier.clickable { onBack() }.padding(end = 12.dp))
        Column(Modifier.weight(1f)) { Text(title, color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold, maxLines = 1); if (sub.isNotEmpty()) Text(sub, color = TX2, fontSize = 12.sp, maxLines = 1) }
        actions()
    }
}
@Composable fun Card(content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxWidth().padding(bottom = 12.dp).clip(RoundedCornerShape(14.dp)).background(CARD).border(1.dp, LINE, RoundedCornerShape(14.dp)).padding(14.dp), content = content)
}
@Composable fun Note(t: String, c: Color = WARN) { Text(t, color = c, fontSize = 13.sp, modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp).clip(RoundedCornerShape(10.dp)).background(c.copy(alpha = 0.12f)).padding(10.dp)) }

// ---------------------------------------------------------------- setup & login
@Composable fun SetupScreen(vm: AppViewModel) {
    var url by remember { mutableStateOf(vm.store.api) }
    Column(Modifier.fillMaxSize()) {
        Top("Buleud Teu", "\"Buleud teu? Mun buleud, ku urang dipariksa!\"")
        Column(Modifier.padding(14.dp)) { Card {
            Text("Hubungkan ke spreadsheet sekolah", color = Color.White, fontWeight = FontWeight.Bold)
            Text("Tempel URL Web App Apps Script sekolah (berakhiran /exec).", color = TX2, fontSize = 13.sp, modifier = Modifier.padding(vertical = 8.dp))
            OutlinedTextField(url, { url = it }, Modifier.fillMaxWidth(), singleLine = true, placeholder = { Text("https://script.google.com/macros/s/…/exec") })
            if (vm.setupMsg.isNotEmpty()) Note(vm.setupMsg, BAD)
            Button({ vm.connect(url) }, Modifier.fillMaxWidth().padding(top = 10.dp)) { Text("Sambungkan") }
        } }
    }
}

@Composable fun LoginScreen(vm: AppViewModel) {
    var guru by remember { mutableStateOf(vm.store.guruNama.ifEmpty { vm.guruList.firstOrNull() ?: "" }) }
    var pin by remember { mutableStateOf("") }
    LaunchedEffect(Unit) { vm.refreshConfig() }
    Column(Modifier.fillMaxSize()) {
        Top(vm.sekolah?.nama ?: "Sekolah", "Masuk guru", actions = { Text("⚙", color = Color.White, fontSize = 22.sp, modifier = Modifier.clickable { vm.screen = Screen.SETUP }) })
        Column(Modifier.padding(14.dp)) { Card {
            Text("Nama guru", color = TX2, fontSize = 12.sp)
            Picker(guru.ifEmpty { "Pilih guru…" }, vm.guruList) { guru = it }
            Text("PIN 4 digit", color = TX2, fontSize = 12.sp, modifier = Modifier.padding(top = 12.dp))
            Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), horizontalArrangement = Arrangement.Center) { repeat(4) { i -> Box(Modifier.padding(6.dp).size(16.dp).clip(CircleShape).background(if (i < pin.length) PRI else Color.Transparent).border(2.dp, TX2, CircleShape)) } }
            val keys = listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "✓")
            keys.chunked(3).forEach { row -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) { row.forEach { k ->
                OutlinedButton({ when (k) { "⌫" -> pin = pin.dropLast(1); "✓" -> if (pin.length == 4) vm.login(guru, pin); else -> if (pin.length < 4) { pin += k; if (pin.length == 4) { vm.login(guru, pin); pin = "" } } } }, Modifier.weight(1f).height(56.dp).padding(vertical = 4.dp)) { Text(k, fontSize = 20.sp) }
            } } }
            if (vm.loginMsg.isNotEmpty()) Note(vm.loginMsg, if (vm.loginMsg.startsWith("Memeriksa")) TX2 else BAD)
        } }
    }
}

@Composable fun Picker(label: String, options: List<String>, onPick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box { OutlinedButton({ open = true }, Modifier.fillMaxWidth()) { Text(label, modifier = Modifier.weight(1f), maxLines = 1) ; Text("▾") }
        DropdownMenu(open, { open = false }) { options.forEach { o -> DropdownMenuItem(text = { Text(o) }, onClick = { open = false; onPick(o) }) } } }
}

// ---------------------------------------------------------------- beranda
@Composable fun HomeScreen(vm: AppViewModel) {
    val ctx = LocalContext.current
    Column(Modifier.fillMaxSize()) {
        Top("Ujian saya", "${vm.store.guruNama} · ${vm.sekolah?.nama ?: ""}", actions = {
            Text("↻", color = Color.White, fontSize = 22.sp, modifier = Modifier.clickable { vm.loadExams() }.padding(8.dp))
            Text("⎋", color = Color.White, fontSize = 22.sp, modifier = Modifier.clickable { vm.logout() }.padding(8.dp)) })
        vm.loading?.let { msg ->
            LinearProgressIndicator(Modifier.fillMaxWidth(), color = PRI)
            Text(msg, color = TX2, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 14.dp, vertical = 4.dp))
        }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(14.dp)) {
            if (vm.queueSize > 0) Note("${vm.queueSize} hasil scan menunggu dikirim (offline). Ketuk ↻ untuk mengirim.")
            val list = vm.data?.ujian ?: emptyList()
            if (list.isEmpty()) Card { Text("Belum ada ujian aktif. Buat ujian baru, isi kunci, lalu cetak LJK.", color = TX2) }
            list.forEach { u -> ExamCard(vm, u, ctx) }
            Card {
                Text("Mode lain", color = TX2, fontSize = 12.sp)
                OutlinedButton({ vm.startScan(null, ScanMode.LEGACY) }, Modifier.fillMaxWidth()) { Text("Scan LJK lama 20 / 25 soal (tanpa marker)") }
                OutlinedButton({ shareTemplate(ctx, "ABCD") }, Modifier.fillMaxWidth()) { Text("Template LJK F4 ABCD (PDF)") }
                OutlinedButton({ shareTemplate(ctx, "ABCDE") }, Modifier.fillMaxWidth()) { Text("Template LJK F4 ABCDE (PDF)") }
                OutlinedButton({ shareTemplate(ctx, "TANPA_MARKER_20_ABCD") }, Modifier.fillMaxWidth()) { Text("Template F4 tanpa marker · 20 soal (PDF)") }
                OutlinedButton({ shareTemplate(ctx, "TANPA_MARKER_25_ABCD") }, Modifier.fillMaxWidth()) { Text("Template F4 tanpa marker · 25 soal (PDF)") }
                Text("Untuk menilai & menyimpan LJK lama 20 / 25 soal: buat ujian 20 atau 25 soal ABCD lalu tekan Scan pada kartu ujian (LJK lama dikenali otomatis). Tombol di atas hanya untuk cek cepat. LJK berkop sekolah: cetak dari web app.", color = TX2, fontSize = 12.sp)
            }
            SchoolFooter(vm)
        }
        Button({ vm.editExam(null) }, Modifier.fillMaxWidth().padding(14.dp).height(52.dp)) { Text("＋ Ujian baru") }
    }
}
@Composable fun ExamCard(vm: AppViewModel, u: Ujian, ctx: Context) {
    val tot = vm.studentsOf(u).size; val done = u.terscan.size
    Card {
        Row { Column(Modifier.weight(1f)) { Text(u.nama, color = Color.White, fontWeight = FontWeight.Bold); Text("${u.mapel} · ${u.kelas.joinToString()} · ${u.jumlah} soal · ${u.opsi} · KKTP ${u.kktp.toInt()}", color = TX2, fontSize = 12.sp) }
            Text("$done/$tot", color = Color(0xFFA5B8FF), fontSize = 12.sp) }
        LinearProgressIndicator(progress = { if (tot > 0) minOf(1f, done.toFloat() / tot) else 0f }, Modifier.fillMaxWidth().padding(vertical = 8.dp), color = OK)
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Button({ vm.startScan(u, ScanMode.EXAM) }) { Text("📷 Scan") }
            OutlinedButton({ vm.editExam(u) }) { Text("Edit") }
            OutlinedButton({ vm.openAnalysis(u) }) { Text("Analisis") }
        }
    }
}
fun shareTemplate(ctx: Context, v: String) {
    val f = File(ctx.cacheDir, "LJK_F4_$v.pdf"); ctx.assets.open("LJK_F4_$v.pdf").use { i -> f.outputStream().use { i.copyTo(it) } }
    val uri = FileProvider.getUriForFile(ctx, ctx.packageName + ".files", f)
    ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/pdf").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), "Buka / cetak LJK ${v.replace('_', ' ')}"))
}

// ---------------------------------------------------------------- edit ujian
@Composable fun ExamScreen(vm: AppViewModel) {
    val d = vm.draft
    var nama by remember(d) { mutableStateOf(d.nama) }; var mapel by remember(d) { mutableStateOf(d.mapel) }
    var kktp by remember(d) { mutableStateOf(d.kktp.toInt().toString()) }; var opsi by remember(d) { mutableStateOf(d.opsi) }
    var kunci by remember(d) { mutableStateOf(d.kunci) }; val kelas = remember(d) { mutableStateListOf(*d.kelas.toTypedArray()) }
    fun sync() { d.nama = nama; d.mapel = mapel; d.kktp = kktp.toDoubleOrNull() ?: 75.0; d.opsi = opsi; d.kunci = kunci; d.kelas = kelas.toMutableList() }
    Column(Modifier.fillMaxSize()) {
        Top(if (d.id.isEmpty()) "Ujian baru" else "Edit ujian", onBack = { vm.screen = Screen.HOME })
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(14.dp)) {
            Card {
                OutlinedTextField(nama, { nama = it }, Modifier.fillMaxWidth(), label = { Text("Nama ujian") })
                Row { OutlinedTextField(mapel, { mapel = it.uppercase() }, Modifier.weight(1f), label = { Text("Mapel") }); Spacer(Modifier.width(8.dp))
                    OutlinedTextField(kktp, { kktp = it.filter(Char::isDigit) }, Modifier.width(100.dp), label = { Text("KKTP") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)) }
                Text("Kelas peserta", color = TX2, fontSize = 12.sp, modifier = Modifier.padding(top = 10.dp))
                val all = ((vm.data?.guru?.kelas ?: emptyList()) + (vm.data?.kelasSemua ?: emptyList())).distinct()
                Row(Modifier.horizontalScroll(rememberScrollState())) { all.forEach { k -> FilterChip(k in kelas, { if (k in kelas) kelas.remove(k) else kelas.add(k) }, { Text(k) }, Modifier.padding(end = 6.dp)) } }
                Text("Opsi jawaban", color = TX2, fontSize = 12.sp, modifier = Modifier.padding(top = 10.dp))
                Row { listOf("ABCD", "ABCDE").forEach { o -> FilterChip(opsi == o, { opsi = o }, { Text(if (o == "ABCD") "ABCD (SD–SMP)" else "ABCDE (SMA)") }, Modifier.padding(end = 6.dp)) } }
            }
            Card {
                Text("Kunci jawaban · ${kunci.length} soal (maks. 50)", color = Color.White, fontWeight = FontWeight.Bold)
                OutlinedTextField(kunci, { kunci = it.uppercase().filter { c -> c in "ABCDE-" }.take(50) }, Modifier.fillMaxWidth(), singleLine = true, placeholder = { Text("ABCD…") })
                OutlinedButton({ sync(); vm.startScan(null, ScanMode.KEY) }, Modifier.padding(top = 8.dp)) { Text("📷 Scan LJK kunci") }
                LjkDigital(50, opsi, kunci.map { if (it in "ABCDE") it else null }, null, null, null, 10) { q, l ->
                    val a = kunci.padEnd(maxOf(kunci.length, q + 1), '-').toCharArray(); a[q] = if (a[q] == l) '-' else l; kunci = String(a).trimEnd('-') }
            }
            if (vm.draftMsg.isNotEmpty()) Note(vm.draftMsg, if (vm.draftMsg.startsWith("Kunci dari scan")) OK else BAD)
        }
        Button({ sync(); vm.saveExam() }, Modifier.fillMaxWidth().padding(14.dp).height(52.dp)) { Text("Simpan ujian") }
    }
}

// ---------------------------------------------------------------- LJK digital
@Composable
fun LjkDigital(n: Int, opsi: String, answers: List<Char?>, key: String?, status: List<String>?, suggest: List<String?>?, rows: Int, total: Int = if (rows == 10) 50 else 20, onTap: (Int, Char) -> Unit) {
    Column(Modifier.padding(top = 8.dp)) {
        (0 until total / rows).chunked(2).forEach { pair -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            pair.forEach { b -> Column(Modifier.weight(1f).padding(bottom = 8.dp).clip(RoundedCornerShape(10.dp)).background(Color(0xFF0A1222)).border(1.dp, LINE, RoundedCornerShape(10.dp)).padding(4.dp)) {
                for (r in 0 until rows) { val q = b * rows + r; val off = q >= n
                    val st = status?.getOrNull(q); val flag = !off && (st == "double" || st == "weak")
                    Row(Modifier.fillMaxWidth().background(if (flag) WARN.copy(alpha = 0.2f) else Color.Transparent).padding(vertical = 1.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("${q + 1}", color = if (off) LINE else TX2, fontSize = 10.sp, modifier = Modifier.width(20.dp))
                        opsi.forEach { l -> val a = answers.getOrNull(q); val k = key?.getOrNull(q)
                            val fill = when { off -> Color.Transparent; a == l && key == null -> Color(0xFFE5E7EB); a == l && k == l -> OK; a == l -> BAD; flag && (suggest?.getOrNull(q) ?: "").contains(l) -> WARN; else -> Color.Transparent }
                            val ring = if (!off && k == l && a != l) OK else if (off) LINE else Color(0xFF5B6B88)
                            Box(Modifier.padding(1.dp).size(22.dp).clip(CircleShape).background(fill).border(1.5.dp, ring, CircleShape).clickable(enabled = !off) { onTap(q, l) }, contentAlignment = Alignment.Center) {
                                Text("$l", fontSize = 9.sp, color = if (fill == Color.Transparent) TX2 else Color.Black) }
                        }
                    }
                }
            } }
            if (pair.size == 1) Spacer(Modifier.weight(1f))
        } }
    }
}

// ---------------------------------------------------------------- hasil
@Composable fun ResultScreen(vm: AppViewModel) {
    val r = vm.result ?: return; val u = vm.exam
    var layerFoto by remember { mutableStateOf(false) }; var layerDark by remember { mutableStateOf(false) }; var layerKisi by remember { mutableStateOf(true) }
    Column(Modifier.fillMaxSize()) {
        Top(u?.nama ?: "LJK lama", u?.let { "${it.mapel} · ${it.jumlah} soal" } ?: "${vm.lamaN()} soal · tanpa marker", onBack = { vm.screen = Screen.SCAN })
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(14.dp)) {
            Card {
                val sc = vm.score()
                Text(sc?.second?.let { if (it % 1 == 0.0) it.toInt().toString() else it.toString() } ?: "${vm.answers.count { it != null }}", color = Color.White, fontSize = 52.sp, fontWeight = FontWeight.Black)
                Text(sc?.let { "${it.first} benar dari ${u!!.jumlah} soal" } ?: "jawaban terbaca (tanpa kunci)", color = TX2)
                val q = r.quality
                Text("Kualitas foto ${q?.grade ?: "-"} · ${q?.score ?: "-"}   ·   ${if (r.mode == "marker") "Mode marker F4" else "Tanpa marker"}", color = if (q?.grade == "A") OK else WARN, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp))
                r.warnings.forEach { Note(it) }
            }
            if (u != null) Card {
                Text("Identitas siswa", color = TX2, fontSize = 12.sp)
                val wRef = (vm.strips["nama"] ?: vm.strips.values.firstOrNull())?.width ?: 1
                vm.strips.forEach { (k, b) -> Image(b.asImageBitmap(), k, Modifier.fillMaxWidth(minOf(1f, b.width.toFloat() / wRef)).padding(bottom = 4.dp).background(Color.White), contentScale = ContentScale.FillWidth) }
                if (vm.ocrMsg.isNotEmpty()) Text(vm.ocrMsg, color = TX2, fontSize = 13.sp, modifier = Modifier.padding(vertical = 6.dp))
                // rekomendasi OCR (tidak dipilih otomatis)
                Row(Modifier.horizontalScroll(rememberScrollState())) {
                    vm.match?.alternatives?.filter { it.skor >= 0.3 }?.forEachIndexed { i, a ->
                        val pct = (a.skor * 100).toInt()
                        FilterChip(vm.selSiswa == a.nama && vm.selKelas == a.kelas, { vm.pickStudent(a.nama, a.kelas) }, { Text("${a.nama} (${a.kelas}) $pct%") }, Modifier.padding(end = 6.dp),
                            colors = FilterChipDefaults.filterChipColors(containerColor = if (i == 0 && pct >= 80) OK.copy(alpha = 0.15f) else Color.Transparent))
                    }
                }
                // terpilih
                Text(if (vm.selSiswa.isEmpty()) "Belum ada siswa dipilih" else "✓ ${vm.selSiswa} (${vm.selKelas})", color = if (vm.selSiswa.isEmpty()) WARN else OK, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp))
                // cari manual (lintas kelas, toleran salah ketik) + saring kelas
                val sts = vm.studentsOf(u)
                var q by remember(vm.result) { mutableStateOf("") }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 6.dp)) {
                    Box(Modifier.weight(0.38f)) { Picker(vm.selKelasFilter.ifEmpty { "Semua kelas" }, listOf("Semua kelas") + sts.map { it.kelas }.distinct().sorted()) { vm.selKelasFilter = if (it == "Semua kelas") "" else it } }
                    OutlinedTextField(q, { q = it }, Modifier.weight(0.62f), singleLine = true, placeholder = { Text("Cari nama siswa…") })
                }
                val hasil = remember(q, vm.selKelasFilter, sts) { vm.searchStudents(q) }
                Column(Modifier.fillMaxWidth().heightIn(max = 260.dp).verticalScroll(rememberScrollState())) {
                    hasil.forEach { st ->
                        val sel = st.nama == vm.selSiswa && st.kelas == vm.selKelas
                        val done = "${st.kelas}|${st.nama}" in u.terscan
                        Row(Modifier.fillMaxWidth().clickable { vm.pickStudent(st.nama, st.kelas); q = "" }.background(if (sel) PRI.copy(alpha = 0.2f) else Color.Transparent).padding(vertical = 8.dp, horizontal = 6.dp)) {
                            Text((if (done) "✓ " else "") + st.nama, color = Color.White, modifier = Modifier.weight(1f)); Text(st.kelas, color = TX2)
                        }
                    }
                    if (hasil.isEmpty()) Text("Tidak ada nama yang cocok.", color = TX2, fontSize = 13.sp, modifier = Modifier.padding(6.dp))
                }
                val fl = vm.flagged(); if (fl.isNotEmpty()) Note("Perlu dicek: nomor ${fl.joinToString()} (kuning).")
                Button({ vm.save() }, Modifier.fillMaxWidth().padding(top = 8.dp).height(50.dp), colors = ButtonDefaults.buttonColors(containerColor = OK)) { Text("Simpan & scan berikutnya", color = Color(0xFF06210F)) }
            }
            Card {
                Text("LJK digital — ketuk bulatan untuk koreksi", color = TX2, fontSize = 12.sp)
                LjkDigital(u?.jumlah ?: vm.lamaN(), u?.opsi ?: "ABCD", vm.answers, u?.kunci, vm.status, r.suggest, if (r.mode == "marker") 10 else 5, if (r.mode == "marker") 50 else vm.lamaN()) { q, l -> vm.tapAnswer(q, l) }
            }
            if (r.mode == "marker") Card {
                Text("Bukti deteksi", color = TX2, fontSize = 12.sp)
                Row(Modifier.horizontalScroll(rememberScrollState())) {
                    FilterChip(true, { layerFoto = !layerFoto }, { Text(if (layerFoto) "📷 Foto asli" else "▣ Diluruskan") }, Modifier.padding(end = 6.dp))
                    FilterChip(layerKisi, { layerKisi = !layerKisi }, { Text("Kisi") }, Modifier.padding(end = 6.dp))
                    FilterChip(layerDark, { layerDark = !layerDark }, { Text("Kehitaman %") })
                }
                val bmp = remember(r, layerFoto, layerDark, layerKisi, vm.answers.toList()) { evidence(vm, layerFoto, layerKisi, layerDark) }
                bmp?.let { Image(it.asImageBitmap(), "bukti", Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)), contentScale = ContentScale.FillWidth) }
                r.quality?.let { q -> Text("Skala ${q.pxPerMm} px/mm · residu ${q.residMm ?: "-"} mm · cahaya ${(q.light * 100).toInt()}% · tajam ${q.sharp} · miring ${q.tilt}°", color = TX2, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp)) }
            }
        }
    }
}

/** gambar bukti deteksi: potongan lurus (atau foto asli) + kisi + lingkaran berwarna + % kehitaman */
fun evidence(vm: AppViewModel, foto: Boolean, kisi: Boolean, dark: Boolean): Bitmap? {
    val r = vm.result ?: return null; val geo = r.geo ?: return null; val img = vm.image ?: return null; val u = vm.exam
    val nOpt = geo.nOpt; val n = geo.active
    val bmp: Bitmap; val map: (Double, Double) -> Pair<Float, Float>; val rad: Float
    if (!foto) {
        val rc = LjkEngine.rectifyView(img, geo, 1000)
        bmp = Bitmap.createBitmap(rc.argb, rc.w, rc.h, Bitmap.Config.ARGB_8888).copy(Bitmap.Config.ARGB_8888, true)
        map = { a, b -> val p = rc.toOut(a, b); p.x.toFloat() to p.y.toFloat() }; rad = (LjkSpec.R * rc.k).toFloat()
    } else {
        val g = r.gray ?: return null; val f = minOf(1.0, 1000.0 / g.w)
        val w = (g.w * f).toInt(); val h = (g.h * f).toInt(); val px = IntArray(w * h)
        for (y in 0 until h) for (x in 0 until w) { val v = g.g[minOf(g.h - 1, (y / f).toInt()) * g.w + minOf(g.w - 1, (x / f).toInt())]; px[y * w + x] = (0xFF shl 24) or (v shl 16) or (v shl 8) or v }
        bmp = Bitmap.createBitmap(px, w, h, Bitmap.Config.ARGB_8888).copy(Bitmap.Config.ARGB_8888, true)
        map = { a, b -> val p = geo.map(a, b); (p.x * f).toFloat() to (p.y * f).toFloat() }; rad = (LjkSpec.R * geo.pxPerMm * f).toFloat()
    }
    val c = android.graphics.Canvas(bmp); val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    if (kisi) {
        paint.color = 0xAAFACC15.toInt(); paint.strokeWidth = maxOf(1f, rad / 5)
        for (row in 0 until LjkSpec.ROWS) { var prev: Pair<Float, Float>? = null; for (b in 0 until LjkSpec.BLOCKS) for (o in 0 until nOpt) { val m = LjkSpec.bubbleMM(b * 10 + row, o); val p = map(m.x, m.y); prev?.let { c.drawLine(it.first, it.second, p.first, p.second, paint) }; prev = p } }
    }
    val txt = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFF43F5E.toInt(); textSize = maxOf(9f, rad); textAlign = Paint.Align.CENTER }
    for (q in 0 until n) for (o in 0 until nOpt) {
        val m = LjkSpec.bubbleMM(q, o); val p = map(m.x, m.y); val l = LjkSpec.LETTERS[o]
        val st = vm.status.getOrNull(q); val a = vm.answers.getOrNull(q); val k = u?.kunci?.getOrNull(q)
        val col = when { (st == "double" || st == "weak") && (r.suggest.getOrNull(q) ?: "").contains(l) -> 0xFFF59E0B.toInt(); a == l -> if (k == null || k == l) 0xFF16A34A.toInt() else 0xFFDC2626.toInt(); else -> 0x553B82F6 }
        paint.color = col; paint.strokeWidth = if (col == 0x553B82F6) 1f else maxOf(2f, rad / 3)
        c.drawCircle(p.first, p.second, rad * 1.15f, paint)
        if (dark) c.drawText("${(r.dark[q][o] * 100).toInt()}", p.first, p.second - rad * 1.35f, txt)
    }
    return bmp
}

// ---------------------------------------------------------------- laporan
@Composable fun ReportCard(vm: AppViewModel) {
    val ctx = LocalContext.current
    Card {
        Text("Laporan", color = Color.White, fontWeight = FontWeight.Bold)
        Text("Lingkup mengikuti pilihan di atas. Simpel: pilihan jawaban, jumlah benar, skor. Lengkap: ditambah statistik tes dan analisis butir.", color = TX2, fontSize = 12.sp, modifier = Modifier.padding(vertical = 6.dp))
        Row { listOf("simpel" to "Simpel", "lengkap" to "Lengkap").forEach { (k, t) -> FilterChip(vm.reportMode == k, { vm.setReportModeTo(k) }, { Text(t) }, Modifier.padding(end = 6.dp)) } }
        AppViewModel.Laporan.BAGIAN.forEach { (k, t) ->
            Row(Modifier.fillMaxWidth().clickable { vm.toggleBagian(k) }, verticalAlignment = Alignment.CenterVertically) {
                Checkbox(k in vm.reportBagian, { vm.toggleBagian(k) }); Text(t, color = Color.White, fontSize = 14.sp) }
        }
        Text("Format", color = TX2, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp))
        Row(Modifier.horizontalScroll(rememberScrollState())) { listOf("pdf" to "PDF (F4)", "xlsx" to "Excel", "sheet" to "Google Sheet").forEach { (k, t) -> FilterChip(vm.reportFormat == k, { vm.reportFormat = k }, { Text(t) }, Modifier.padding(end = 6.dp)) } }
        Text("Urutan siswa", color = TX2, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
        Row(Modifier.horizontalScroll(rememberScrollState())) { listOf("kelas" to "Kelas, nama", "nama" to "Nama", "skor" to "Skor tertinggi").forEach { (k, t) -> FilterChip(vm.reportUrut == k, { vm.reportUrut = k }, { Text(t) }, Modifier.padding(end = 6.dp)) } }
        Row(Modifier.fillMaxWidth().clickable { vm.reportAnonim = !vm.reportAnonim }, verticalAlignment = Alignment.CenterVertically) {
            Checkbox(vm.reportAnonim, { vm.reportAnonim = it }); Text("Mode anonim (untuk rapat MGMP)", color = Color.White, fontSize = 14.sp) }
        Button({ vm.makeReport() }, Modifier.fillMaxWidth().padding(top = 8.dp)) { Text("Buat laporan") }
        if (vm.reportInfo.isNotEmpty()) Note("Laporan siap: ${vm.reportInfo}", OK)
        vm.reportFile?.let { f ->
            val uri = FileProvider.getUriForFile(ctx, ctx.packageName + ".files", f)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button({ runCatching { ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_VIEW).setDataAndType(uri, vm.reportMime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), "Buka laporan")) } }, Modifier.weight(1f)) { Text("Buka") }
                OutlinedButton({ ctx.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType(vm.reportMime).putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), "Bagikan laporan")) }, Modifier.weight(1f)) { Text("Bagikan / simpan") }
            }
        }
        if (vm.reportUrl.isNotEmpty()) TextButton({ runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(vm.reportUrl))) } }) { Text("Buka arsip Google Sheet") }
    }
}

// ---------------------------------------------------------------- analisis
@Composable fun AnalysisScreen(vm: AppViewModel) {
    val u = vm.exam ?: return
    Column(Modifier.fillMaxSize()) {
        Top("Analisis & laporan", "${u.nama} · ${u.mapel}", onBack = { vm.screen = Screen.HOME })
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(14.dp)) {
            Card {
                Row(Modifier.horizontalScroll(rememberScrollState())) {
                    FilterChip(vm.analysisScope.first == "tingkat", { vm.analysisScope = "tingkat" to "" }, { Text("Seluruh tingkat ${u.tingkat}") }, Modifier.padding(end = 6.dp))
                    u.kelas.filter { it != "SEMUA" }.forEach { k -> FilterChip(vm.analysisScope.second == k, { vm.analysisScope = "kelas" to k }, { Text("Kelas $k") }, Modifier.padding(end = 6.dp)) }
                }
                Button({ vm.runAnalysis() }, Modifier.fillMaxWidth().padding(top = 8.dp)) { Text("Hitung analisis") }
            }
            vm.analysis?.let { a -> AnalysisDashboard(vm, a) }
            ReportCard(vm)
        }
    }
}


/** logo sekolah dari Sheet (data URL base64) -> bitmap; null bila tidak ada */
fun logoBitmap(dataUrl: String?): Bitmap? = try {
    if (dataUrl.isNullOrEmpty() || !dataUrl.contains(",")) null
    else android.util.Base64.decode(dataUrl.substringAfter(","), android.util.Base64.DEFAULT).let { android.graphics.BitmapFactory.decodeByteArray(it, 0, it.size) }
} catch (e: Exception) { null }

/** kaki dashboard: logo + nama sekolah + watermark pembuat */
@Composable fun SchoolFooter(vm: AppViewModel) {
    val sk = vm.sekolah
    val logo = remember(sk?.logo) { logoBitmap(sk?.logo) }
    Column(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        if (logo != null) Image(logo.asImageBitmap(), "logo sekolah", Modifier.size(56.dp).clip(RoundedCornerShape(10.dp)).background(Color.White).padding(4.dp), contentScale = ContentScale.Fit)
        if (!sk?.nama.isNullOrEmpty()) Text(sk!!.nama, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp, modifier = Modifier.padding(top = 6.dp))
        if (!sk?.tahun.isNullOrEmpty()) Text("Tahun Pelajaran ${sk!!.tahun}", color = TX2, fontSize = 12.sp)
        Text("Buleud Teu • \"Mun buleud, ku urang dipariksa!\"", color = TX2.copy(alpha = 0.7f), fontSize = 11.sp, modifier = Modifier.padding(top = 10.dp))
        Text(AppViewModel.WATERMARK, color = TX2.copy(alpha = 0.85f), fontSize = 11.sp)
    }
}
