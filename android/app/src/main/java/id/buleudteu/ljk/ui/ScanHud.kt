package id.buleudteu.ljk.ui

import android.graphics.Matrix
import android.graphics.Paint as NativePaint
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import id.buleudteu.ljk.camera.MarkerAnalyzer
import id.buleudteu.ljk.engine.LjkQr25
import kotlin.math.abs
import kotlin.math.hypot

/**
 * HUD dekoratif murni di lapisan Compose; TIDAK ikut CameraX ImageAnalysis
 * ataupun ImageCapture. Bukan pengganti deteksi marker atau QR decoder.
 *
 * Pemindai utama adalah BERKAS CAHAYA yang melintas pada seluruh bidang LJK.
 * QR hanya jangkar stamp logo kecil tanpa garis scan di dalam QR.
 * Guard ukuran/konveksitas menghindari logo 3D raksasa saat corner outlier.
 */
@Composable
fun ScanHud(det: MarkerAnalyzer.Detection?, logoData: String?) {
    if (det == null || det.legacy || det.corners.size != 4) return
    val logo = remember(logoData) { logoBitmap(logoData) }
    DisposableEffect(logo) { onDispose { logo?.recycle() } }
    val transition = rememberInfiniteTransition(label = "paper-scan")
    val scan by transition.animateFloat(
        initialValue = 0f, targetValue = 1f,
        animationSpec = infiniteRepeatable(
            tween(1900, easing = LinearEasing), RepeatMode.Reverse
        ),
        label = "whole-paper-beam"
    )
    val pulse by transition.animateFloat(
        initialValue = 0.15f, targetValue = 0.58f,
        animationSpec = infiniteRepeatable(tween(850), RepeatMode.Reverse),
        label = "qr-anchor-pulse"
    )
    Canvas(Modifier.fillMaxSize()) {
        val width = size.width
        val height = size.height
        val frameAR = 3f / 4f
        val (sensorW, sensorH) = if (width / height > frameAR)
            width to width / frameAR else height * frameAR to height
        val xOffset = (width - sensorW) / 2f
        val yOffset = (height - sensorH) / 2f
        val q = det.corners.map {
            Offset(xOffset + it.x.toFloat() * sensorW, yOffset + it.y.toFloat() * sensorH)
        }
        if (q.any { !it.x.isFinite() || !it.y.isFinite() }) return@Canvas
        // Corner marker TL TR BR BL dalam satuan F4 asli.
        val dx1 = q[1].x - q[2].x
        val dx2 = q[3].x - q[2].x
        val dx3 = q[0].x - q[1].x + q[2].x - q[3].x
        val dy1 = q[1].y - q[2].y
        val dy2 = q[3].y - q[2].y
        val dy3 = q[0].y - q[1].y + q[2].y - q[3].y
        val determinant = dx1 * dy2 - dx2 * dy1
        if (abs(determinant) < 0.001f) return@Canvas
        val g = (dx3 * dy2 - dx2 * dy3) / determinant
        val h = (dx1 * dy3 - dx3 * dy1) / determinant
        val a = q[1].x - q[0].x + g * q[1].x
        val b = q[3].x - q[0].x + h * q[3].x
        val c = q[0].x
        val d = q[1].y - q[0].y + g * q[1].y
        val e = q[3].y - q[0].y + h * q[3].y
        val f = q[0].y
        fun point(mmX: Float, mmY: Float): Offset {
            val u = (mmX - 10f) / 195f
            val v = (mmY - 10f) / 310f
            val z = 1f + g * u + h * v
            if (abs(z) < 0.10f) return Offset(Float.NaN, Float.NaN)
            return Offset((a * u + b * v + c) / z, (d * u + e * v + f) / z)
        }
        fun valid(p: Offset) = p.x.isFinite() && p.y.isFinite()
        fun cross(v: Offset, w: Offset, x: Offset): Float =
            (w.x - v.x) * (x.y - v.y) - (w.y - v.y) * (x.x - v.x)

        // Validasi marker: bukan sekadar 4 kotak acak / sudut menyilang.
        val turn = cross(q[0], q[1], q[2])
        if (abs(turn) < 100f || (0..3).any { i ->
            val t = cross(q[i], q[(i+1)%4], q[(i+2)%4])
            t * turn <= 0f
        }) return@Canvas
        val cyan = if (det.ready) Color(0xFF34D399) else Color(0xFF38BDF8)

        // 1. Beam bergerak di SELURUH badan kertas, bukan di dalam QR.
        // Tidak membuat salinan atau memodifikasi frame sensor.
        val y = 74f + 225f * scan
        val start = point(16f, y)
        val end = point(199f, y)
        if (valid(start) && valid(end)) {
            val length = hypot(end.x - start.x, end.y - start.y)
            if (length > 30f && length < width * 1.6f) {
                drawLine(cyan.copy(alpha = 0.12f), start, end, strokeWidth = 18f)
                drawLine(cyan.copy(alpha = 0.22f), start, end, strokeWidth = 7f)
                drawLine(Color.White.copy(alpha = 0.50f), start, end, strokeWidth = 1.6f)
            }
        }

        // 2. Badge/stamp sekolah kecil, TERIKAT lokasi QR asli; bukan lokasi scan.
        val x = LjkQr25.X.toFloat()
        val qrY = LjkQr25.Y.toFloat()
        val qrSize = LjkQr25.SIZE.toFloat()
        val tl = point(x, qrY)
        val tr = point(x + qrSize, qrY)
        val br = point(x + qrSize, qrY + qrSize)
        val bl = point(x, qrY + qrSize)
        if (listOf(tl,tr,br,bl).any { !valid(it) }) return@Canvas
        val side = maxOf(hypot(tr.x-tl.x,tr.y-tl.y), hypot(bl.x-tl.x,bl.y-tl.y),
            hypot(br.x-tr.x,br.y-tr.y), hypot(br.x-bl.x,br.y-bl.y))
        val area = abs(cross(tl, tr, bl))
        // QR berukuran hanya 23 mm dari halaman 215 mm. Outlier proyeksi
        // harus disembunyikan; jangan penuhi layar dengan logo raksasa.
        if (side < 12f || side > width * 0.25f || area > width * height * 0.028f ||
            tl.x < -width*0.15f || tr.x > width*1.15f ||
            tl.y < -height*0.15f || bl.y > height*1.15f) return@Canvas
        val poly = Path().apply {
            moveTo(tl.x,tl.y); lineTo(tr.x,tr.y); lineTo(br.x,br.y)
            lineTo(bl.x,bl.y); close()
        }
        val drop = side * 0.07f
        val depth = Path().apply {
            moveTo(bl.x,bl.y); lineTo(br.x,br.y)
            lineTo(br.x+drop*0.25f,br.y+drop)
            lineTo(bl.x+drop*0.25f,bl.y+drop); close()
        }
        drawPath(depth, Color(0xFF06283C).copy(alpha=0.5f))
        if (logo != null && !logo.isRecycled) {
            drawIntoCanvas { cv ->
                val src = floatArrayOf(0f,0f,logo.width.toFloat(),0f,
                    logo.width.toFloat(),logo.height.toFloat(),0f,logo.height.toFloat())
                val dst = floatArrayOf(tl.x,tl.y,tr.x,tr.y,br.x,br.y,bl.x,bl.y)
                val matrix = Matrix()
                if (matrix.setPolyToPoly(src,0,dst,0,4)) {
                    val paint = NativePaint(NativePaint.ANTI_ALIAS_FLAG or NativePaint.FILTER_BITMAP_FLAG)
                        .apply { alpha = 205 }
                    cv.nativeCanvas.drawBitmap(logo, matrix, paint)
                }
            }
        }
        drawPath(poly, cyan.copy(alpha=pulse), style=Stroke(width=5f))
        drawPath(poly, cyan.copy(alpha=0.8f), style=Stroke(width=1.7f))
    }
}
