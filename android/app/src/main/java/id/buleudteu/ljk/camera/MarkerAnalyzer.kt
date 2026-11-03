package id.buleudteu.ljk.camera

import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import id.buleudteu.ljk.engine.ArgbImage
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
 * Analisis preview kamera (real-time):
 *  1) LJK F4: OpenCV (resize + adaptiveThreshold + findContours) -> kotak padat -> verifikasi susunan marker (engine Kotlin).
 *  2) LJK lama (bila diizinkan): engine tanpa marker pada frame kecil -> posisi semua bulatan + mana yang terisi.
 * Hasil dalam koordinat frame tegak 0..1, + status "siap" ketika stabil (untuk auto-capture).
 */
class MarkerAnalyzer(private val legacyAllowed: () -> Boolean, private val onResult: (Detection?) -> Unit) : ImageAnalysis.Analyzer {
    class Detection(
        val corners: List<Pt>, val ready: Boolean, val tooFar: Boolean,
        val legacy: Boolean = false, val bubbles: List<Pt> = emptyList(), val filled: List<Boolean> = emptyList(), val bubbleR: Double = 0.0
    )

    private var last: List<Pt>? = null
    private var stable = 0
    @Volatile var paused = false

    private fun rot(x: Double, y: Double, r: Int) = when (r) { 90 -> Pt(1 - y, x); 180 -> Pt(1 - x, 1 - y); 270 -> Pt(y, 1 - x); else -> Pt(x, y) }

    private fun settle(pts: List<Pt>, tooFar: Boolean): Boolean {
        val moved = last?.let { l -> pts.indices.sumOf { hypot(pts[it].x - l[it].x, pts[it].y - l[it].y) } / pts.size } ?: 1.0
        stable = if (moved < 0.009 && !tooFar) stable + 1 else 0
        last = pts
        val ready = stable >= 3
        if (ready) stable = 0
        return ready
    }

    override fun analyze(image: ImageProxy) {
        try {
            if (paused) return
            val w = image.width; val h = image.height; val rotDeg = image.imageInfo.rotationDegrees
            val plane = image.planes[0]; val buf = plane.buffer; val rs = plane.rowStride
            val gray = Mat(h, w, CvType.CV_8UC1)
            val row = ByteArray(w)
            for (y in 0 until h) { buf.position(y * rs); buf.get(row, 0, w); gray.put(y, 0, row) }
            val s = 720.0 / max(w, h)
            val small = Mat(); Imgproc.resize(gray, small, Size(), s, s, Imgproc.INTER_AREA)
            val sw = small.cols(); val sh = small.rows()
            val g = ByteArray(sw * sh); small.get(0, 0, g)
            val gi = IntArray(g.size) { g[it].toInt() and 255 }

            // ---- 1) marker F4
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
                if (ar < 0.6 || ar > 1.6 || area / (rw * rh) < 0.8) continue
                val side = sqrt(area)
                if (side < sMin || side > sMax) continue
                squares.add(Square(rr.center.x, rr.center.y, side, area.toInt()))
            }
            var det: Detection? = null
            if (squares.size >= 4) {
                val hyp = LjkEngine.markerHypotheses(squares, gi, sw, sh).firstOrNull()
                if (hyp != null && hyp.score >= 3) {
                    val pts = hyp.pairs.map { rot(it.x / sw, it.y / sh, rotDeg) }
                    val tooFar = hyp.pxPerMm / s < 2.3
                    det = Detection(pts, settle(pts, tooFar), tooFar)
                }
            }

            // ---- 2) LJK lama: kisi bulatan langsung dari pola lingkaran
            if (det == null && legacyAllowed()) {
                val img = ArgbImage(sw, sh, IntArray(sw * sh) { val v = gi[it]; (0xFF shl 24) or (v shl 16) or (v shl 8) or v })
                val r = LjkEngine.processMarkerless(img, maxSide = 720)
                if (r.success && r.grid.isNotEmpty()) {
                    val grid = r.grid
                    val pts = grid.flatten()
                    val bub = pts.map { rot(it.x / sw, it.y / sh, rotDeg) }
                    val fil = pts.map { it.d >= r.thr }
                    // bingkai = sudut kisi diperlebar setengah jarak bulatan
                    val lat = r.lattice!!
                    val pad = lat.r0 * 2.2
                    val u0 = lat.colU.first() - pad; val u1 = lat.colU.last() + pad; val v0 = lat.rowV.first() - pad; val v1 = lat.rowV.last() + pad
                    val corners = listOf(lat.map(u0, v0), lat.map(u1, v0), lat.map(u1, v1), lat.map(u0, v1)).map { rot(it.x / sw, it.y / sh, rotDeg) }
                    val tooFar = lat.r0 < 4.5                                    // bulatan terlalu kecil di frame 720 px
                    det = Detection(corners, settle(corners, tooFar), tooFar, true, bub, fil, lat.r0 / max(sw, sh))
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
