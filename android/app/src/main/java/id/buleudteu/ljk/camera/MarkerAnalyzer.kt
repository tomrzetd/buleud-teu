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
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Analisis preview kamera (real-time):
 *  1) LJK F4: OpenCV (resize + adaptiveThreshold + findContours) -> kotak padat -> verifikasi susunan marker (engine Kotlin).
 *  2) LJK lama (bila diizinkan): engine tanpa marker pada frame kecil -> posisi semua bulatan + mana yang terisi.
 * Hasil dalam koordinat frame tegak 0..1, + status "siap" ketika stabil (untuk auto-capture).
 */
/** legacyLayouts(): tata letak LJK lama yang boleh dideteksi di preview (kosong = tidak) */
class MarkerAnalyzer(private val legacyLayouts: () -> List<LjkEngine.LegacyLayout>, private val onResult: (Detection?) -> Unit) : ImageAnalysis.Analyzer {
    class Detection(
        val corners: List<Pt>, val ready: Boolean, val tooFar: Boolean,
        val legacy: Boolean = false, val bubbles: List<Pt> = emptyList(), val filled: List<Boolean> = emptyList(), val bubbleR: Double = 0.0
    )

    private var last: List<Pt>? = null
    private var lastDeg = 0
    private var lastLay = 0
    private var tryIdx = 0
    private val CYC = intArrayOf(0, 90, 270)
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

            // ---- 2) LJK lama: frame diputar TEGAK dulu (sensor kamera = landscape), lalu kisi bulatan.
            //         LJK boleh tegak atau menyamping: arah terakhir yang berhasil dulu + satu arah lain bergiliran.
            val lays = if (det == null) legacyLayouts() else emptyList()
            if (lays.isNotEmpty()) {
                val up = LjkEngine.rotateImg(ArgbImage(sw, sh, IntArray(sw * sh) { val v = gi[it]; (0xFF shl 24) or (v shl 16) or (v shl 8) or v }), rotDeg)
                val uw = up.width; val uh = up.height
                // hemat CPU: arah + tata letak terakhir yang berhasil dulu, lalu SATU kombinasi lain bergiliran per frame
                val combos = CYC.flatMap { d -> lays.indices.map { d to it } }
                tryIdx = (tryIdx + 1) % combos.size
                val order = listOf(lastDeg to min(lastLay, lays.size - 1), combos[tryIdx]).distinct()
                for ((deg, li) in order) {
                    val L = lays[li]
                    val r = LjkEngine.processMarkerless(LjkEngine.rotateImg(up, deg), L.questions, L.blocks, L.options, maxSide = 720, minDet = 0.3)
                    if (!r.success || r.grid.isEmpty()) continue
                    lastDeg = deg; lastLay = li
                    // titik di gambar yang diputar 'deg' -> kembali ke frame tegak -> 0..1
                    fun back(x: Double, y: Double): Pt { val q = when (deg) { 90 -> Pt(y, uh - 1 - x); 270 -> Pt(uw - 1 - y, x); else -> Pt(x, y) }; return Pt(q.x / uw, q.y / uh) }
                    val pts = r.grid.flatten()
                    val lat = r.lattice!!
                    val pad = lat.r0 * 2.2
                    val u0 = lat.colU.first() - pad; val u1 = lat.colU.last() + pad; val v0 = lat.rowV.first() - pad; val v1 = lat.rowV.last() + pad
                    val corners = listOf(lat.map(u0, v0), lat.map(u1, v0), lat.map(u1, v1), lat.map(u0, v1)).map { back(it.x, it.y) }
                    val tooFar = lat.r0 < 4.5
                    det = Detection(corners, settle(corners, tooFar), tooFar, true, pts.map { back(it.x, it.y) }, pts.map { it.d >= r.thr }, lat.r0 / max(uw, uh))
                    break
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
