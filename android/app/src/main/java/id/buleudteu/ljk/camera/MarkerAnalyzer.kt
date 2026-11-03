package id.buleudteu.ljk.camera

import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import id.buleudteu.ljk.engine.LjkEngine
import id.buleudteu.ljk.engine.Pt
import id.buleudteu.ljk.engine.Square
import org.opencv.core.CvType
import org.opencv.core.Mat
import org.opencv.core.MatOfPoint
import org.opencv.core.MatOfPoint2f
import org.opencv.core.Size
import org.opencv.imgproc.Imgproc
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.sqrt

/**
 * Analisis preview kamera (real-time) dengan OpenCV:
 * resize + adaptiveThreshold + findContours (native, cepat) -> kandidat kotak padat ->
 * verifikasi susunan marker F4 memakai logika engine Kotlin (markerHypotheses, sama dengan web).
 * Mengirim 4 sudut (koordinat frame tegak, 0..1) + status "siap" ketika stabil & cukup tajam/dekat.
 */
class MarkerAnalyzer(private val onResult: (Detection?) -> Unit) : ImageAnalysis.Analyzer {
    class Detection(val corners: List<Pt>, val ready: Boolean, val tooFar: Boolean)

    private var last: List<Pt>? = null
    private var stable = 0
    @Volatile var paused = false

    override fun analyze(image: ImageProxy) {
        try {
            if (paused) return
            val w = image.width; val h = image.height
            val plane = image.planes[0]; val buf = plane.buffer; val rs = plane.rowStride
            val gray = Mat(h, w, CvType.CV_8UC1)
            val row = ByteArray(w)
            for (y in 0 until h) { buf.position(y * rs); buf.get(row, 0, w); gray.put(y, 0, row) }
            val s = 720.0 / max(w, h)
            val small = Mat(); Imgproc.resize(gray, small, Size(), s, s, Imgproc.INTER_AREA)
            val sw = small.cols(); val sh = small.rows()
            val bin = Mat()
            var block = (max(sw, sh) / 12) * 2 + 1
            if (block < 19) block = 19
            Imgproc.adaptiveThreshold(small, bin, 255.0, Imgproc.ADAPTIVE_THRESH_MEAN_C, Imgproc.THRESH_BINARY_INV, block, 22.0)
            val contours = ArrayList<MatOfPoint>()
            Imgproc.findContours(bin, contours, Mat(), Imgproc.RETR_EXTERNAL, Imgproc.CHAIN_APPROX_SIMPLE)
            val squares = ArrayList<Square>()
            val sMin = max(5.0, max(sw, sh) / 170.0); val sMax = max(sw, sh) / 7.0
            for (c in contours) {
                val area = Imgproc.contourArea(c)
                if (area < sMin * sMin * 0.6) continue
                val rr = Imgproc.minAreaRect(MatOfPoint2f(*c.toArray()))
                val rw = rr.size.width; val rh = rr.size.height
                if (rw <= 0 || rh <= 0) continue
                val ar = rw / rh
                if (ar < 0.6 || ar > 1.6 || area / (rw * rh) < 0.8) continue          // padat & hampir persegi
                val side = sqrt(area)
                if (side < sMin || side > sMax) continue
                squares.add(Square(rr.center.x, rr.center.y, side, area.toInt()))
            }
            var det: Detection? = null
            if (squares.size >= 4) {
                val g = ByteArray(sw * sh); small.get(0, 0, g)
                val gi = IntArray(g.size) { g[it].toInt() and 255 }
                val hyp = LjkEngine.markerHypotheses(squares, gi, sw, sh).firstOrNull()
                if (hyp != null && hyp.score >= 3) {
                    // koordinat frame -> frame tegak (rotasi sensor) dinormalisasi 0..1
                    val rot = image.imageInfo.rotationDegrees
                    val pts = hyp.pairs.map { val x = it.x / sw; val y = it.y / sh
                        when (rot) { 90 -> Pt(1 - y, x); 180 -> Pt(1 - x, 1 - y); 270 -> Pt(y, 1 - x); else -> Pt(x, y) } }
                    val moved = last?.let { l -> pts.indices.sumOf { hypot(pts[it].x - l[it].x, pts[it].y - l[it].y) } / 4 } ?: 1.0
                    val pxPerMmFull = hyp.pxPerMm / s
                    val tooFar = pxPerMmFull < 2.3
                    stable = if (moved < 0.009 && !tooFar) stable + 1 else 0
                    last = pts
                    det = Detection(pts, stable >= 3, tooFar)
                    if (stable >= 3) stable = 0
                }
            }
            if (det == null) { last = null; stable = 0 }
            onResult(det)
            gray.release(); small.release(); bin.release(); contours.forEach { it.release() }
        } catch (e: Throwable) {
            onResult(null)
        } finally {
            image.close()
        }
    }
}
