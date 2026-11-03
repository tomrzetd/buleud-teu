package id.buleudteu.ljk.ui

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import id.buleudteu.ljk.AppViewModel
import id.buleudteu.ljk.ScanMode
import id.buleudteu.ljk.Screen
import id.buleudteu.ljk.camera.MarkerAnalyzer
import java.util.concurrent.Executors

/** Kamera: preview + deteksi marker real-time (OpenCV) + auto-capture foto resolusi penuh (ImageCapture). */
@Composable
fun ScanScreen(vm: AppViewModel) {
    val ctx = LocalContext.current
    val owner = LocalLifecycleOwner.current
    var det by remember { mutableStateOf<MarkerAnalyzer.Detection?>(null) }
    var auto by remember { mutableStateOf(vm.store.auto) }
    val capture = remember { ImageCapture.Builder().setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
        .setResolutionSelector(ResolutionSelector.Builder().setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY).build()).build() }
    val exec = remember { Executors.newSingleThreadExecutor() }
    var shooting by remember { mutableStateOf(false) }
    // LJK lama dideteksi langsung di preview bila: mode cek cepat, atau ujian <= 20 soal ABCD
    val analyzer = remember { MarkerAnalyzer({ vm.scanMode == ScanMode.LEGACY || (vm.scanMode == ScanMode.EXAM && (vm.exam?.let { it.jumlah <= 20 && it.opsi == "ABCD" } ?: false)) }) { d -> det = d } }

    fun shoot() {
        if (shooting || vm.busy != null) return
        shooting = true; analyzer.paused = true
        capture.takePicture(exec, object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureSuccess(image: ImageProxy) {
                val rot = image.imageInfo.rotationDegrees
                val bmp = image.toBitmap(); image.close()
                ContextCompat.getMainExecutor(ctx).execute { vm.process(bmp, rot); shooting = false; analyzer.paused = false }
            }
            override fun onError(e: ImageCaptureException) { ContextCompat.getMainExecutor(ctx).execute { vm.say("Gagal memotret: ${e.message}"); shooting = false; analyzer.paused = false } }
        })
    }
    LaunchedEffect(det) { val d = det; if (auto && d != null && d.ready) shoot() }

    val gallery = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri != null) ctx.contentResolver.openInputStream(uri)?.use { s -> BitmapFactory.decodeStream(s)?.let { b: Bitmap -> vm.process(b, 0) } }
    }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        AndroidView(factory = { c ->
            val view = PreviewView(c).apply { scaleType = PreviewView.ScaleType.FILL_CENTER }
            val fut = ProcessCameraProvider.getInstance(c)
            fut.addListener({
                val provider = fut.get()
                val preview = Preview.Builder().build().also { it.setSurfaceProvider(view.surfaceProvider) }
                val analysis = ImageAnalysis.Builder().setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .setResolutionSelector(ResolutionSelector.Builder().setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY).build()).build()
                analysis.setAnalyzer(exec, analyzer)
                provider.unbindAll()
                provider.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis, capture)
            }, ContextCompat.getMainExecutor(c))
            view
        }, modifier = Modifier.fillMaxSize())

        // garis bingkai LJK (koordinat 0..1 frame tegak; preview FILL_CENTER rasio 4:3 -> aproksimasi)
        Canvas(Modifier.fillMaxSize()) {
            val d = det ?: return@Canvas
            val fw = size.width; val fh = size.height
            val frameAR = 3f / 4f; val viewAR = fw / fh
            val (sw, sh) = if (viewAR > frameAR) fw to fw / frameAR else fh * frameAR to fh
            val ox = (fw - sw) / 2; val oy = (fh - sh) / 2
            val pts = d.corners.map { Offset(ox + it.x.toFloat() * sw, oy + it.y.toFloat() * sh) }
            val col = if (d.ready) Color(0xFF22C55E) else if (d.tooFar) Color(0xFFF97316) else Color(0xFFFACC15)
            val path = Path().apply { moveTo(pts[0].x, pts[0].y); pts.drop(1).forEach { lineTo(it.x, it.y) }; close() }
            drawPath(path, col.copy(alpha = if (d.legacy) 0.08f else 0.18f)); drawPath(path, col, style = Stroke(width = if (d.legacy) 5f else 8f))
            if (d.legacy) {   // setiap bulatan jawaban: terisi = menyala hijau, kosong = cincin tipis
                val r = (d.bubbleR * maxOf(sw, sh)).toFloat().coerceAtLeast(4f)
                d.bubbles.forEachIndexed { i, b ->
                    val c = Offset(ox + b.x.toFloat() * sw, oy + b.y.toFloat() * sh)
                    if (d.filled.getOrElse(i) { false }) {
                        drawCircle(Color(0xFF22C55E).copy(alpha = 0.25f), r * 2.0f, c)
                        drawCircle(Color(0xFF22C55E).copy(alpha = 0.55f), r * 1.35f, c)
                        drawCircle(Color(0xFF86EFAC), r * 1.1f, c, style = Stroke(width = 4f))
                    } else drawCircle(Color.White.copy(alpha = 0.55f), r * 1.1f, c, style = Stroke(width = 2f))
                }
            }
        }

        Column(Modifier.fillMaxWidth().background(Color(0xAA000000)).padding(top = 36.dp, start = 14.dp, end = 14.dp, bottom = 10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("←", color = Color.White, fontSize = 26.sp, modifier = Modifier.clickable { vm.screen = if (vm.scanMode == ScanMode.KEY) Screen.EXAM else Screen.HOME }.padding(end = 14.dp))
                Column {
                    Text(when (vm.scanMode) { ScanMode.KEY -> "Scan LJK kunci"; ScanMode.LEGACY -> "LJK lama (tanpa marker)"; else -> vm.exam?.nama ?: "" }, color = Color.White, fontSize = 17.sp)
                    Text(when (vm.scanMode) { ScanMode.EXAM -> "${vm.exam?.mapel} · ${vm.exam?.jumlah} soal · ${vm.exam?.opsi}"; ScanMode.KEY -> "Varian ${vm.draft.opsi}"; else -> "20 soal" }, color = Color(0xFF9FB0CC), fontSize = 12.sp)
                }
            }
            Text(
                when {
                    det == null -> if (vm.scanMode == ScanMode.LEGACY) "Masukkan seluruh tabel pilihan ganda ke layar…" else "Cari LJK… (F4: 4 kotak hitam di sudut)"
                    det!!.tooFar -> "Dekatkan kamera sedikit"
                    det!!.ready -> "Tahan… mengambil foto"
                    det!!.legacy -> "LJK lama terdeteksi · ${det!!.filled.count { it }} bulatan terisi — tahan HP tetap diam"
                    else -> "LJK F4 terdeteksi — tahan HP tetap diam"
                },
                color = Color.White, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp))
        }

        // watermark kecil transparan dengan efek timbul (bayangan gelap + sorot terang), tetap terbaca di atas kertas putih
        Box(Modifier.align(Alignment.BottomCenter).padding(bottom = 128.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.28f))
            .border(1.dp, Color.White.copy(alpha = 0.14f), CircleShape).padding(horizontal = 10.dp, vertical = 3.dp)) {
            Text(AppViewModel.WATERMARK, fontSize = 10.sp, color = Color.White.copy(alpha = 0.82f),
                style = androidx.compose.ui.text.TextStyle(shadow = androidx.compose.ui.graphics.Shadow(Color.Black.copy(alpha = 0.7f), Offset(0f, 1f), 1.5f)))
        }
        Row(Modifier.align(Alignment.BottomCenter).fillMaxWidth().background(Color(0xAA000000)).padding(22.dp), horizontalArrangement = Arrangement.SpaceAround, verticalAlignment = Alignment.CenterVertically) {
            Text("🖼", fontSize = 26.sp, modifier = Modifier.clickable { gallery.launch("image/*") })
            Box(Modifier.size(78.dp).clip(CircleShape).background(if (det?.ready == true) Color(0xFF22C55E) else Color(0xFF4F7CFF)).border(5.dp, Color(0x88FFFFFF), CircleShape).clickable { shoot() })
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Auto", color = Color.White, fontSize = 13.sp)
                Switch(checked = auto, onCheckedChange = { auto = it; vm.store.auto = it })
            }
        }
    }
    DisposableEffect(Unit) { onDispose { exec.shutdown() } }
}

