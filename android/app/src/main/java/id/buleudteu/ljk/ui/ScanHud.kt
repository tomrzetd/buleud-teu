package id.buleudteu.ljk.ui

import android.graphics.Bitmap
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
import kotlin.math.hypot
import kotlin.math.max

/**
 * HUD visual saja, DI LUAR CameraX ImageAnalysis/ImageCapture.
 * Posisinya diturunkan dari empat marker sudut yang SUDAH dideteksi,
 * sehingga tidak ada pemindaian QR tambahan pada setiap frame.
 */
@Composable
fun ScanHud(det: MarkerAnalyzer.Detection?, logoData: String?) {
    if (det == null || det.legacy || det.corners.size != 4) return
    val logo = remember(logoData) { logoBitmap(logoData) }
    DisposableEffect(logo) { onDispose { logo?.recycle() } }
    val anim = rememberInfiniteTransition(label = "scan-hologram")
    val sweep by anim.animateFloat(
        initialValue = 0f, targetValue = 1f,
        animationSpec = infiniteRepeatable(animation = tween(1500, easing = LinearEasing), repeatMode = RepeatMode.Restart),
        label = "qr-sweep"
    )
    val halo by anim.animateFloat(
        initialValue = 0.15f, targetValue = 0.48f,
        animationSpec = infiniteRepeatable(animation = tween(700, easing = LinearEasing), repeatMode = RepeatMode.Reverse),
        label = "qr-halo"
    )
    Canvas(Modifier.fillMaxSize()) {
        val fw = size.width; val fh = size.height
        val frameAR = 3f / 4f
        val (sw, sh) = if (fw / fh > frameAR) fw to fw / frameAR else fh * frameAR to fh
        val ox = (fw - sw) / 2f; val oy = (fh - sh) / 2f
        val q = det.corners.map { Offset(ox + it.x.toFloat() * sw, oy + it.y.toFloat() * sh) }
        // Homografi eksak unit-square -> quadrilateral perspektif marker F4.
        // Sudut berurut: TL, TR, BR, BL, masing-masing di (10,10),
        // (205,10), (205,320), (10,320) mm pada kertas.
        val dx1 = q[1].x - q[2].x
        val dx2 = q[3].x - q[2].x
        val dx3 = q[0].x - q[1].x + q[2].x - q[3].x
        val dy1 = q[1].y - q[2].y
        val dy2 = q[3].y - q[2].y
        val dy3 = q[0].y - q[1].y + q[2].y - q[3].y
        val detH = dx1 * dy2 - dx2 * dy1
        if (kotlin.math.abs(detH) < 1e-4f) return@Canvas
        val g = (dx3 * dy2 - dx2 * dy3) / detH
        val h = (dx1 * dy3 - dx3 * dy1) / detH
        val a = q[1].x - q[0].x + g * q[1].x
        val b = q[3].x - q[0].x + h * q[3].x
        val c = q[0].x
        val d = q[1].y - q[0].y + g * q[1].y
        val e = q[3].y - q[0].y + h * q[3].y
        val f = q[0].y
        fun project(mmX: Float, mmY: Float): Offset {
            val u = (mmX - 10f) / 195f
            val v = (mmY - 10f) / 310f
            val z = 1f + g * u + h * v
            return Offset((a * u + b * v + c) / z, (d * u + e * v + f) / z)
        }
        val x = LjkQr25.X.toFloat(); val y = LjkQr25.Y.toFloat(); val s = LjkQr25.SIZE.toFloat()
        val tl = project(x, y)
        val tr = project(x + s, y)
        val br = project(x + s, y + s)
        val bl = project(x, y + s)
        val cyan = if (det.ready) Color(0xFF34D399) else Color(0xFF38BDF8)
        val poly = Path().apply {
            moveTo(tl.x, tl.y); lineTo(tr.x, tr.y); lineTo(br.x, br.y); lineTo(bl.x, bl.y); close()
        }
        val depth = max(3f, hypot(tr.x - tl.x, tr.y - tl.y) * 0.08f)
        val extrude = Path().apply {
            moveTo(bl.x, bl.y); lineTo(br.x, br.y)
            lineTo(br.x + depth * 0.3f, br.y + depth)
            lineTo(bl.x + depth * 0.3f, bl.y + depth); close()
        }
        drawPath(extrude, Color(0xFF0D3C58).copy(alpha = 0.68f))
        drawPath(poly, Color(0xFF0B2341).copy(alpha = 0.42f))
        // Tekstur/stamp logo sekolah diproyeksikan secara perspektif ke bidang QR.
        // Draw bitmap hanya pada preview, bukan input engine atau hasil foto.
        if (logo != null && !logo.isRecycled) {
            drawIntoCanvas { cv ->
                val src = floatArrayOf(0f,0f, logo.width.toFloat(),0f,
                    logo.width.toFloat(),logo.height.toFloat(), 0f,logo.height.toFloat())
                val dst = floatArrayOf(tl.x,tl.y,tr.x,tr.y,br.x,br.y,bl.x,bl.y)
                val m = Matrix()
                if (m.setPolyToPoly(src,0,dst,0,4)) {
                    val paint = NativePaint(NativePaint.ANTI_ALIAS_FLAG or NativePaint.FILTER_BITMAP_FLAG).apply { alpha = 235 }
                    cv.nativeCanvas.drawBitmap(logo, m, paint)
                }
            }
        }
        drawPath(poly, cyan.copy(alpha = halo), style = Stroke(width = 13f))
        drawPath(poly, cyan, style = Stroke(width = if (det.ready) 4.5f else 2.6f))
        val scanY = y + s * sweep
        val left = project(x, scanY)
        val right = project(x + s, scanY)
        drawLine(cyan.copy(alpha = 0.26f), left, right, strokeWidth = 9f)
        drawLine(Color.White.copy(alpha = 0.8f), left, right, strokeWidth = 2f)
        val cx = (tl.x + br.x) / 2f; val cy = (tl.y + br.y) / 2f
        drawCircle(cyan.copy(alpha = halo * 0.33f), radius = depth * 2.2f, center = Offset(cx,cy))
    }
}
