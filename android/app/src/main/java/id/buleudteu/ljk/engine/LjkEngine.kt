package id.buleudteu.ljk.engine

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Buleud Teu — LJK ENGINE (Kotlin murni, port 1:1 dari web/js/ljk-engine.js).
 * Tidak bergantung pada Android/OpenCV sehingga bisa diuji di JVM (tools/test/kotlin).
 * Hasil HARUS identik dengan versi JS (diuji pada foto uji yang sama).
 */

/** citra ARGB (seperti Bitmap.getPixels) */
class ArgbImage(val width: Int, val height: Int, val px: IntArray)

class Gray(val g: IntArray, val w: Int, val h: Int, val scale: Double)

class Homography(private val h: DoubleArray, private val mx: Double, private val my: Double, private val sc: Double) {
    fun map(u0: Double, v0: Double): Pt {
        val u = (u0 - mx) / sc; val v = (v0 - my) / sc; val den = h[6] * u + h[7] * v + 1
        return Pt((h[0] * u + h[1] * v + h[2]) / den, (h[3] * u + h[4] * v + h[5]) / den)
    }
}
class HPair(val fwd: Homography, val inv: Homography)
data class Corr(val u: Double, val v: Double, val x: Double, val y: Double, val key: String? = null)
class Comp(val id: Int, val minx: Int, val maxx: Int, val miny: Int, val maxy: Int, val n: Int,
           val sx: Double, val sy: Double, val sxx: Double, val syy: Double, val sxy: Double)
class Circle(val x: Double, val y: Double, val r: Double)
class Square(val x: Double, val y: Double, val side: Double, val n: Int)
class GridPt(val x: Double, val y: Double, val r: Double, val d: Double, val detected: Boolean)

class Quality(val score: Int, val grade: String, val pxPerMm: Double, val residMm: Double?, val light: Double, val sharp: Double, val tilt: Double)

class Geo(val H: HPair, val blocks: List<Homography>, val scale: Double, val pxPerMm: Double, val nOpt: Int, val active: Int, val layout: MarkerLayout = MarkerLayouts.F4_50) {
    /** mm -> koordinat citra kerja (homografi per blok di area pilihan ganda) */
    fun map(u: Double, v: Double): Pt {
        if (v >= layout.PG_FRAME[1] && v <= layout.PG_FRAME[3]) {
            val b = LjkEngine.clampI(floor((u - layout.X0 + 2) / layout.BLOCK_W).toInt(), 0, layout.BLOCKS - 1)
            return blocks[b].map(u, v)
        }
        return H.fwd.map(u, v)
    }
}

class LjkResult {
    var mode = "marker"; var success = false; var error: String? = null
    val answers = ArrayList<Char?>(); val status = ArrayList<String>(); val suggest = ArrayList<String?>(); val notes = ArrayList<String>(); val conf = ArrayList<Double>()
    val dark = ArrayList<DoubleArray>(); val logs = ArrayList<String>(); val warnings = ArrayList<String>()
    var filledAnswers = 0; var totalCircles = 0; var quality: Quality? = null; var geo: Geo? = null
    var gray: Gray? = null; var grid: List<List<GridPt>> = emptyList(); var markers: List<Corr> = emptyList(); var circles: List<Circle> = emptyList()
    var thr = 0.0; var empty = 0.0; var full = 0.0
    // mode tanpa marker
    var lattice: Lattice? = null
    var markerMatch = 0.0
    var image: ArgbImage? = null; var rotation = 0
}
class Lattice(val map: (Double, Double) -> Pt, val colU: DoubleArray, val rowV: DoubleArray, val scale: Double, val r0: Double, val questions: Int, val blocks: Int, val options: Int)

class Decision(val answers: List<Char?>, val status: List<String>, val suggest: List<String?>, val notes: List<String>, val conf: List<Double>, val empty: Double, val full: Double, val thr: Double, val filled: Int)

object LjkEngine {
    // ------------------------------------------------------------ util (perilaku sama dengan JS)
    fun clamp(v: Double, lo: Double, hi: Double) = max(lo, min(hi, v))
    fun clampI(v: Int, lo: Int, hi: Int) = max(lo, min(hi, v))
    fun jsRound(v: Double): Long = Math.round(v)                       // Math.round JS: setengah ke atas
    fun median(a: List<Double>): Double {
        if (a.isEmpty()) return 0.0
        val s = a.sorted(); val m = s.size shr 1
        return if (s.size % 2 == 1) s[m] else (s[m - 1] + s[m]) / 2
    }
    private fun lumOf(c: Int): Int = (((c shr 16) and 255) * 77 + ((c shr 8) and 255) * 150 + (c and 255) * 29) shr 8

    // ------------------------------------------------------------ 1. citra
    fun toGray(img: ArgbImage, maxSide: Int): Gray {
        val sw = img.width; val sh = img.height
        val s = min(1.0, maxSide.toDouble() / max(sw, sh))
        val W = max(1, jsRound(sw * s).toInt()); val H = max(1, jsRound(sh * s).toInt())
        val g = IntArray(W * H)
        if (s == 1.0) {
            for (i in 0 until W * H) g[i] = lumOf(img.px[i])
        } else {
            val inv = 1 / s
            for (y in 0 until H) {
                val y0 = floor(y * inv).toInt(); val y1 = min(sh, max(y0 + 1, floor((y + 1) * inv).toInt()))
                for (x in 0 until W) {
                    val x0 = floor(x * inv).toInt(); val x1 = min(sw, max(x0 + 1, floor((x + 1) * inv).toInt()))
                    var sum = 0L; var n = 0
                    for (yy in y0 until y1) { var p = yy * sw + x0; for (xx in x0 until x1) { sum += lumOf(img.px[p]); p++; n++ } }
                    g[y * W + x] = clampI(Math.rint(sum.toDouble() / n).toInt(), 0, 255)   // Uint8ClampedArray: setengah ke genap
                }
            }
        }
        return Gray(g, W, H, s)
    }

    fun integral(g: IntArray, W: Int, H: Int): DoubleArray {
        val I = DoubleArray((W + 1) * (H + 1))
        for (y in 0 until H) { var row = 0.0; for (x in 0 until W) { row += g[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row } }
        return I
    }

    fun adaptiveThreshold(g: IntArray, W: Int, H: Int, rad: Int, C: Double, I0: DoubleArray? = null): ByteArray {
        val I = I0 ?: integral(g, W, H)
        val bin = ByteArray(W * H)
        for (y in 0 until H) {
            val y0 = max(0, y - rad); val y1 = min(H, y + rad + 1)
            for (x in 0 until W) {
                val x0 = max(0, x - rad); val x1 = min(W, x + rad + 1)
                val sum = I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]
                bin[y * W + x] = if (g[y * W + x] < sum / ((x1 - x0) * (y1 - y0)) - C) 1 else 0
            }
        }
        return bin
    }

    class CC(val lab: IntArray, val comps: List<Comp>)
    fun components(bin: ByteArray, W: Int, H: Int): CC {
        val lab = IntArray(W * H); val stack = IntArray(W * H); val comps = ArrayList<Comp>()
        var next = 0
        for (i in 0 until W * H) {
            if (bin[i].toInt() == 0 || lab[i] != 0) continue
            next++
            var sp = 0; stack[sp++] = i; lab[i] = next
            var minx = W; var maxx = 0; var miny = H; var maxy = 0; var n = 0
            var sx = 0.0; var sy = 0.0; var sxx = 0.0; var syy = 0.0; var sxy = 0.0
            while (sp > 0) {
                val p = stack[--sp]; val px = p % W; val py = p / W
                n++; sx += px; sy += py; sxx += px.toDouble() * px; syy += py.toDouble() * py; sxy += px.toDouble() * py
                if (px < minx) minx = px; if (px > maxx) maxx = px
                if (py < miny) miny = py; if (py > maxy) maxy = py
                for (dy in -1..1) {
                    val ny = py + dy; if (ny < 0 || ny >= H) continue
                    for (dx in -1..1) {
                        val nx = px + dx; if (nx < 0 || nx >= W) continue
                        val q = ny * W + nx
                        if (bin[q].toInt() != 0 && lab[q] == 0) { lab[q] = next; stack[sp++] = q }
                    }
                }
            }
            comps.add(Comp(next, minx, maxx, miny, maxy, n, sx, sy, sxx, syy, sxy))
        }
        return CC(lab, comps)
    }

    // ------------------------------------------------------------ 2. lingkaran
    fun circleCandidates(lab: IntArray, comps: List<Comp>, W: Int, H: Int, rMin: Double, rMax: Double): List<Circle> {
        val out = ArrayList<Circle>(); val RAYS = 24
        for (c in comps) {
            val w = c.maxx - c.minx + 1; val h = c.maxy - c.miny + 1
            val R = (w + h) / 4.0; val ar = w.toDouble() / h
            if (R < rMin || R > rMax || ar < 0.72 || ar > 1.38) continue
            if (c.n < PI * 2 * R * 0.45) continue
            val cx = (c.minx + c.maxx) / 2.0; val cy = (c.miny + c.maxy) / 2.0
            var outside = 0; val R2 = (1.18 * R) * (1.18 * R)
            for (y in c.miny..c.maxy) for (x in c.minx..c.maxx)
                if (lab[y * W + x] == c.id && (x - cx) * (x - cx) + (y - cy) * (y - cy) > R2) outside++
            if (outside.toDouble() / c.n > 0.06) continue
            var hit = 0
            for (k in 0 until RAYS) {
                val a = (k.toDouble() / RAYS) * PI * 2; val ca = cos(a); val sa = sin(a)
                var t = 0.6
                while (t <= 1.12) {
                    val x = jsRound(cx + ca * R * t).toInt(); val y = jsRound(cy + sa * R * t).toInt()
                    if (x >= 0 && y >= 0 && x < W && y < H && lab[y * W + x] == c.id) { hit++; break }
                    t += 0.08
                }
            }
            if (hit.toDouble() / RAYS < 0.8) continue
            out.add(Circle(cx, cy, R))
        }
        return out
    }
    fun removeNested(c: List<Circle>): List<Circle> = c.filter { a -> c.none { b -> b !== a && b.r > a.r * 1.4 && hypot(a.x - b.x, a.y - b.y) < b.r * 0.7 } }

    // ------------------------------------------------------------ 3. homografi
    private fun solve(A: Array<DoubleArray>, b: DoubleArray): DoubleArray? {
        val n = b.size
        for (i in 0 until n) {
            var p = i
            for (r in i + 1 until n) if (abs(A[r][i]) > abs(A[p][i])) p = r
            val t = A[i]; A[i] = A[p]; A[p] = t; val tb = b[i]; b[i] = b[p]; b[p] = tb
            if (abs(A[i][i]) < 1e-12) return null
            for (r in i + 1 until n) { val f = A[r][i] / A[i][i]; for (c in i until n) A[r][c] -= f * A[i][c]; b[r] -= f * b[i] }
        }
        val x = DoubleArray(n)
        for (i in n - 1 downTo 0) { var s = b[i]; for (c in i + 1 until n) s -= A[i][c] * x[c]; x[i] = s / A[i][i] }
        return x
    }
    fun fitHomography(pairs: List<Corr>): Homography? {
        if (pairs.size < 4) return null
        val mx = pairs.sumOf { it.u } / pairs.size; val my = pairs.sumOf { it.v } / pairs.size
        var sc = pairs.sumOf { hypot(it.u - mx, it.v - my) } / pairs.size; if (sc == 0.0) sc = 1.0
        val ATA = Array(8) { DoubleArray(8) }; val ATb = DoubleArray(8)
        fun add(row: DoubleArray, v: Double) { for (i in 0 until 8) { ATb[i] += row[i] * v; for (j in 0 until 8) ATA[i][j] += row[i] * row[j] } }
        for (p in pairs) {
            val u = (p.u - mx) / sc; val v = (p.v - my) / sc
            add(doubleArrayOf(u, v, 1.0, 0.0, 0.0, 0.0, -u * p.x, -v * p.x), p.x)
            add(doubleArrayOf(0.0, 0.0, 0.0, u, v, 1.0, -u * p.y, -v * p.y), p.y)
        }
        val h = solve(ATA, ATb) ?: return null
        if (h.any { !it.isFinite() }) return null
        return Homography(h, mx, my, sc)
    }
    fun fitPair(pairs: List<Corr>): HPair? {
        val f = fitHomography(pairs) ?: return null
        val i = fitHomography(pairs.map { Corr(it.x, it.y, it.u, it.v) }) ?: return null
        return HPair(f, i)
    }

    // ------------------------------------------------------------ 4. kehitaman
    fun darkness(g: IntArray, W: Int, H: Int, cx: Double, cy: Double, r: Double): Double {
        val rin = r * 0.55; val r1 = r * 1.22; val r2 = r * 1.5
        var sIn = 0.0; var nIn = 0; val ring = ArrayList<Int>()
        val x0 = max(0, floor(cx - r2).toInt()); val x1 = min(W - 1, ceil(cx + r2).toInt())
        val y0 = max(0, floor(cy - r2).toInt()); val y1 = min(H - 1, ceil(cy + r2).toInt())
        for (y in y0..y1) for (x in x0..x1) {
            val d = hypot(x - cx, y - cy); val v = g[y * W + x]
            if (d <= rin) { sIn += v; nIn++ } else if (d >= r1 && d <= r2) ring.add(v)
        }
        if (nIn == 0 || ring.isEmpty()) return 0.0
        ring.sort()
        val paper = ring[floor(ring.size * 0.8).toInt()].let { if (it == 0) 1 else it }
        return clamp(1 - (sIn / nIn) / max(1, paper), 0.0, 1.0)
    }
    fun squareDark(g: IntArray, W: Int, H: Int, cx: Double, cy: Double, half: Double): Double {
        var sIn = 0.0; var nIn = 0; val ring = ArrayList<Int>(); val R2 = half * 2.6
        for (y in max(0, floor(cy - R2).toInt())..min(H - 1, ceil(cy + R2).toInt()))
            for (x in max(0, floor(cx - R2).toInt())..min(W - 1, ceil(cx + R2).toInt())) {
                val dx = abs(x - cx); val dy = abs(y - cy); val v = g[y * W + x]
                if (dx <= half * 0.6 && dy <= half * 0.6) { sIn += v; nIn++ } else if (max(dx, dy) >= half * 1.6) ring.add(v)
            }
        if (nIn == 0 || ring.isEmpty()) return 0.0
        ring.sort()
        return clamp(1 - (sIn / nIn) / max(1, ring[floor(ring.size * 0.8).toInt()]), 0.0, 1.0)
    }

    // ------------------------------------------------------------ 5. keputusan
    fun decide(qDs: List<DoubleArray>, letters: String, sens: Double): Decision {
        val all = ArrayList<Double>(); qDs.forEach { ds -> ds.forEach { all.add(it) } }
        val empty = median(all)
        val filledQ = qDs.map { it.max() }.filter { it > empty + 0.18 }
        val full = if (filledQ.isNotEmpty()) median(filledQ) else empty + 0.45
        val span = max(0.2, full - empty); val thr = empty + span * sens
        val ans = ArrayList<Char?>(); val st = ArrayList<String>(); val sg = ArrayList<String?>(); val nt = ArrayList<String>(); val cf = ArrayList<Double>()
        var filled = 0
        for (ds in qDs) {
            val order = ds.mapIndexed { i, d -> i to d }.sortedByDescending { it.second }
            val top = order[0]; val sec = order[1]; val above = order.filter { it.second >= thr }
            var a: Char? = null; val s: String; var sug: String? = null; val note: String; val conf: Double
            if (above.size == 1) {
                a = letters[top.first]; s = "ok"; note = "${jsRound(top.second * 100)}%"
                conf = clamp(min((top.second - thr) / (span * 0.5), (top.second - sec.second) / (span * 0.6)), 0.0, 1.0)
            } else if (above.isEmpty()) {
                if (top.second - sec.second > span * 0.25 && top.second > empty + span * 0.3) { s = "weak"; sug = letters[top.first].toString(); note = "tipis $sug?" }
                else { s = "blank"; note = "kosong" }
                conf = if (s == "blank") clamp((thr - top.second) / (span * 0.5), 0.0, 1.0) else 0.3
            } else if (top.second - sec.second > span * 0.35) {
                a = letters[top.first]; s = "weak"; sug = a.toString(); note = "bekas hapus ${letters[sec.first]}?"; conf = 0.45
            } else {
                s = "double"; sug = above.map { letters[it.first] }.sorted().joinToString("/"); note = "GANDA $sug"; conf = 0.0
            }
            ans.add(a); st.add(s); sg.add(sug); nt.add(note); cf.add(Math.round(conf * 100) / 100.0)
            if (a != null) filled++
        }
        return Decision(ans, st, sg, nt, cf, empty, full, thr, filled)
    }

    private fun sharpness(g: IntArray, W: Int, H: Int, pts: List<Pt>, r: Double): Double {
        var s = 0.0; var n = 0; val R = max(2, jsRound(r * 1.4).toInt())
        for (p in pts) {
            val cx = jsRound(p.x).toInt(); val cy = jsRound(p.y).toInt()
            for (y in cy - R..cy + R) for (x in cx - R..cx + R) {
                if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue
                val i = y * W + x
                s += abs(4 * g[i] - g[i - 1] - g[i + 1] - g[i - W] - g[i + W]); n++
            }
        }
        return if (n > 0) s / n else 0.0
    }

    // ------------------------------------------------------------ 6. mode marker
    fun solidSquares(comps: List<Comp>, W: Int, H: Int): List<Square> {
        val out = ArrayList<Square>()
        val sMin = max(5.0, max(W, H) / 170.0); val sMax = max(W, H) / 7.0
        for (c in comps) {
            if (c.n < sMin * sMin * 0.6) continue
            val mx = c.sx / c.n; val my = c.sy / c.n
            val a = c.sxx / c.n - mx * mx; val b = c.syy / c.n - my * my; val cxy = c.sxy / c.n - mx * my
            val tr = a + b; val det = a * b - cxy * cxy; val disc = sqrt(max(0.0, tr * tr / 4 - det))
            val l1 = tr / 2 + disc; val l2 = tr / 2 - disc
            if (l2 <= 0 || l1 / l2 > 2.2) continue
            val side = sqrt(12 * sqrt(l1 * l2)); val fill = c.n / (side * side)
            if (fill < 0.82 || fill > 1.25) continue
            val bw = c.maxx - c.minx + 1; val bh = c.maxy - c.miny + 1
            if (c.n.toDouble() / (bw * bh) < 0.45) continue
            if (side < sMin || side > sMax) continue
            out.add(Square(mx, my, side, c.n))
        }
        return out
    }

    class Hyp(val score: Double, val pairs: List<Corr>, val midPts: List<Corr>, val pxPerMm: Double, val mids: Int, val od: Double, val odm: Double)

    fun markerHypotheses(cands: List<Square>, g: IntArray, W: Int, H: Int): List<Hyp> {
        val pool = cands.sortedByDescending { it.n }.take(14)
        val hyps = ArrayList<Hyp>(); val tpl = LjkSpec.CORNER_CENTERS
        for (i in pool.indices) for (j in i + 1 until pool.size) for (k in j + 1 until pool.size) for (l in k + 1 until pool.size) {
            var q = listOf(pool[i], pool[j], pool[k], pool[l])
            val sides = q.map { it.side }; val smax = sides.max(); val smin = sides.min()
            if (smax / smin > 1.9) continue
            val cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4; val cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4
            q = q.sortedBy { atan2(it.y - cy, it.x - cx) }
            var area = 0.0; var convex = true
            for (t in 0 until 4) {
                val a = q[t]; val b = q[(t + 1) % 4]; val c = q[(t + 2) % 4]
                area += a.x * b.y - b.x * a.y
                if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= 0) convex = false
            }
            area = abs(area) / 2
            if (!convex || area < W.toDouble() * H * 0.06) continue
            val pxPerMm = sqrt(area / ((tpl[1][0] - tpl[0][0]) * (tpl[3][1] - tpl[0][1])))
            val expSide = LjkSpec.CORNER_SIZE * pxPerMm
            val medSide = median(sides)
            if (medSide < expSide * 0.45 || medSide > expSide * 1.9) continue
            for (rot in 0 until 4) {
                val pairs = tpl.mapIndexed { ti, t -> Corr(t[0], t[1], q[(ti + rot) % 4].x, q[(ti + rot) % 4].y) }
                val Hm = fitHomography(pairs) ?: continue
                var mids = 0; val midPts = ArrayList<Corr>()
                for (mc in LjkSpec.MID_CENTERS) {
                    val p = Hm.map(mc[0], mc[1])
                    val hit = cands.firstOrNull { hypot(it.x - p.x, it.y - p.y) < 3 * pxPerMm && it.side < expSide * 1.1 && it.side > expSide * 0.4 }
                    if (hit != null) { mids++; midPts.add(Corr(mc[0], mc[1], hit.x, hit.y)) }
                }
                val po = Hm.map(LjkSpec.ORIENT_CENTER[0], LjkSpec.ORIENT_CENTER[1])
                val od = squareDark(g, W, H, po.x, po.y, LjkSpec.ORIENT_SIZE / 2 * pxPerMm)
                val pm = Hm.map(LjkSpec.PAGE_W - LjkSpec.ORIENT_CENTER[0], LjkSpec.ORIENT_CENTER[1])
                val odm = squareDark(g, W, H, pm.x, pm.y, LjkSpec.ORIENT_SIZE / 2 * pxPerMm)
                val score = mids * 2 + (if (od > 0.4 && odm < 0.25) 3 else 0) + od - odm
                hyps.add(Hyp(score, pairs, midPts, pxPerMm, mids, od, odm))
            }
        }
        return hyps.sortedByDescending { it.score }
    }

    class Shift(val dx: Double, val dy: Double, val hits: Int, val tot: Int)
    fun blockShift(mmPts: List<Pt>, b: Int, nOpt: Int, active: Int, range: Double = 3.5, step: Double = 0.5, tol: Double = 0.9, layout: MarkerLayout = MarkerLayouts.F4_50): Shift {
        val bx = layout.X0 + b * layout.BLOCK_W + layout.OPT_OFFSET
        val rowsActive = max(0, min(layout.ROWS, active - b * layout.ROWS))
        if (rowsActive == 0) return Shift(0.0, 0.0, 0, 0)
        val near = mmPts.filter { it.x > bx - range - 3 && it.x < bx + (nOpt - 1) * layout.OPT_PITCH + range + 3 && it.y > layout.Y0 - range - 3 && it.y < layout.Y0 + (rowsActive - 1) * layout.ROW_PITCH + range + 3 }
        var bdx = 0.0; var bdy = 0.0; var bh = -1
        var dy = -range
        while (dy <= range + 1e-9) {
            var dx = -range
            while (dx <= range + 1e-9) {
                var hits = 0
                for (p in near) {
                    val o = jsRound((p.x - dx - bx) / layout.OPT_PITCH).toInt(); val r = jsRound((p.y - dy - layout.Y0) / layout.ROW_PITCH).toInt()
                    if (o < 0 || o >= nOpt || r < 0 || r >= rowsActive) continue
                    if (abs(p.x - dx - (bx + o * layout.OPT_PITCH)) < tol && abs(p.y - dy - (layout.Y0 + r * layout.ROW_PITCH)) < tol) hits++
                }
                if (hits > bh || (hits == bh && hypot(dx, dy) < hypot(bdx, bdy))) { bdx = dx; bdy = dy; bh = hits }
                dx += step
            }
            dy += step
        }
        return Shift(bdx, bdy, bh, rowsActive * nOpt)
    }

    fun processMarker(img: ArgbImage, options: Int = 4, activeIn: Int = 50, sensitivity: Double = 50.0, contrast: Double = 10.0, maxSide: Int = 1600, layout: MarkerLayout = MarkerLayouts.F4_50): LjkResult {
        val ret = LjkResult(); ret.mode = "marker"
        val nOpt = if (options == 5) 5 else 4
        val active = clampI(if (activeIn > 0) activeIn else 50, 1, layout.QUESTIONS)
        val LET = layout.LETTERS.substring(0, nOpt)
        val sens = clamp(sensitivity / 100, 0.2, 0.8)
        val t0 = System.currentTimeMillis()
        fun fail(m: String): LjkResult { ret.error = m; ret.logs.add("GAGAL: $m"); return ret }

        val gr = toGray(img, maxSide); ret.gray = gr
        val g = gr.g; val W = gr.w; val H = gr.h
        val I = integral(g, W, H)
        val binM = adaptiveThreshold(g, W, H, max(15, jsRound(max(W, H) / 12.0).toInt()), 22.0, I)
        val squares = solidSquares(components(binM, W, H).comps, W, H)
        ret.logs.add("Gambar ${W}x$H, kotak padat ${squares.size}")
        if (squares.size < 4) return fail("Marker sudut tidak ditemukan. Pastikan keempat kotak hitam di sudut LJK masuk bingkai.")
        val hyps = markerHypotheses(squares, g, W, H)
        if (hyps.isEmpty()) return fail("Susunan 4 marker sudut tidak cocok dengan LJK F4. Foto seluruh halaman.")

        val rPx = layout.R * hyps[0].pxPerMm
        val binC = adaptiveThreshold(g, W, H, max(5, jsRound(rPx * 3).toInt()), contrast, I)
        val cc = components(binC, W, H)
        val circles = removeNested(circleCandidates(cc.lab, cc.comps, W, H, rPx * 0.6, rPx * 1.6))
        ret.totalCircles = circles.size; ret.circles = circles

        fun bubbleMatch(inv: Homography): Double {
            val mm = circles.map { inv.map(it.x, it.y) }
            var hit = 0; var tot = 0
            for (b in 0 until layout.BLOCKS) { val s = blockShift(mm, b, min(nOpt, 4), active, layout = layout); hit += s.hits; tot += s.tot }
            return if (tot > 0) hit.toDouble() / tot else 0.0
        }
        var best: Hyp? = null; var bestFp: HPair? = null; var bestBm = 0.0; var bestTotal = 0.0
        for (h in hyps.take(4)) {
            val fp = fitPair(h.pairs + h.midPts) ?: continue
            val bm = bubbleMatch(fp.inv); val total = h.score + bm * 4
            if (best == null || total > bestTotal) { best = h; bestFp = fp; bestBm = bm; bestTotal = total }
        }
        if (best == null || bestBm < 0.25) return fail("Marker ditemukan tapi bulatan jawaban tidak cocok. Foto ulang lebih dekat/terang.")
        if (best.od < 0.4) ret.warnings.add("Penanda arah (kotak kecil kiri atas) tidak jelas; arah LJK ditebak dari pola bulatan.")
        val Hg = bestFp!!; val pxPerMm = best.pxPerMm
        ret.markers = best.pairs + best.midPts
        ret.logs.add("Marker OK (tengah ${best.mids}/2, arah ${jsRound(best.od * 100)}%), skala ${"%.2f".format(pxPerMm)} px/mm, bulatan cocok ${jsRound(bestBm * 100)}%")

        // penyetelan per blok
        val blockFits = ArrayList<Homography>(); val matched = HashMap<String, Circle>()
        val mmC = circles.map { it to Hg.inv.map(it.x, it.y) }
        val mmPts = mmC.map { it.second }
        val resid = ArrayList<Double>()
        for (b in 0 until layout.BLOCKS) {
            val sh = blockShift(mmPts, b, nOpt, active, layout = layout)
            val rowsActive = max(0, min(layout.ROWS, active - b * layout.ROWS))
            fun collect(mapInv: ((Circle) -> Pt)?, dx: Double, dy: Double, tol: Double): List<Corr> {
                val pairs = ArrayList<Corr>()
                for (r in 0 until rowsActive) {
                    val q = b * layout.ROWS + r
                    for (o in 0 until nOpt) {
                        val bm = layout.bubbleMM(q, o)
                        var bestC: Circle? = null; var bd = tol
                        for (e in mmC) { val m = if (mapInv != null) mapInv(e.first) else e.second; val d = hypot(m.x - dx - bm.x, m.y - dy - bm.y); if (d < bd) { bd = d; bestC = e.first } }
                        if (bestC != null) pairs.add(Corr(bm.x, bm.y, bestC.x, bestC.y, "$q,$o"))
                    }
                }
                return pairs
            }
            var pairs = collect(null, sh.dx, sh.dy, 1.0)
            if (pairs.size >= 8) {
                val tmp = fitPair(pairs)
                if (tmp != null) { val p2 = collect({ c -> tmp.inv.map(c.x, c.y) }, 0.0, 0.0, 1.0); if (p2.size >= pairs.size) pairs = p2 }
            }
            for (p in pairs) { val c = mmC.firstOrNull { it.first.x == p.x && it.first.y == p.y }; if (c != null) matched[p.key!!] = c.first }
            var fit: Homography? = null
            val rowsSeen = pairs.map { it.v }.toSet().size
            if (pairs.size >= 10 && rowsSeen >= 3) {
                val f = fitHomography(pairs)
                if (f != null) {
                    val err = pairs.map { val q = f.map(it.u, it.v); hypot(q.x - it.x, q.y - it.y) }
                    val me = median(err)
                    val good = pairs.filterIndexed { i, _ -> err[i] < max(1.5, me * 3) }
                    fit = fitHomography(good) ?: f
                    for (p in good) { val q = fit.map(p.u, p.v); resid.add(hypot(q.x - p.x, q.y - p.y) / pxPerMm) }
                }
            }
            blockFits.add(fit ?: Hg.fwd)
        }
        val residMm = if (resid.isNotEmpty()) median(resid) else null

        // sampling
        val grid = ArrayList<List<GridPt>>(); val qDs = ArrayList<DoubleArray>(); val samplePts = ArrayList<Pt>()
        for (q in 0 until active) {
            val F = blockFits[q / layout.ROWS]; val row = ArrayList<GridPt>(); val ds = DoubleArray(nOpt)
            for (o in 0 until nOpt) {
                val bm = layout.bubbleMM(q, o)
                var p = F.map(bm.x, bm.y)
                val pr = F.map(bm.x + layout.R, bm.y); val rLocal = hypot(pr.x - p.x, pr.y - p.y)
                val det = matched["$q,$o"]
                val use = det != null && hypot(det.x - p.x, det.y - p.y) < rLocal * 0.5
                if (use) p = Pt(det!!.x, det.y)
                val d = darkness(g, W, H, p.x, p.y, rLocal)
                row.add(GridPt(p.x, p.y, rLocal, d, use)); ds[o] = d; samplePts.add(p)
            }
            grid.add(row); qDs.add(ds)
        }
        ret.dark.addAll(qDs)
        if (nOpt == 4) {
            var eHit = 0
            for (q in 0 until active) { val e = layout.bubbleMM(q, 4); if (mmC.any { hypot(it.second.x - e.x, it.second.y - e.y) < 1.1 }) eHit++ }
            if (eHit > active * 0.5) ret.warnings.add("LJK ini tampaknya varian ABCDE, sedangkan ujian diatur ABCD. Opsi E diabaikan.")
        }
        val dec = decide(qDs, LET, sens)
        ret.answers.addAll(dec.answers); ret.status.addAll(dec.status); ret.suggest.addAll(dec.suggest); ret.notes.addAll(dec.notes); ret.conf.addAll(dec.conf)
        ret.filledAnswers = dec.filled; ret.thr = dec.thr; ret.empty = dec.empty; ret.full = dec.full

        // kualitas
        val sharp = sharpness(g, W, H, samplePts.filterIndexed { i, _ -> i % 3 == 0 }, layout.R * pxPerMm) / max(10.0, 255 * (dec.full - dec.empty + 0.2))
        val paperLv = ArrayList<Int>()
        for (b in 0 until layout.BLOCKS) { val p = blockFits[b].map(layout.X0 + b * layout.BLOCK_W + 5, layout.Y0 - 6); val x = jsRound(p.x).toInt(); val y = jsRound(p.y).toInt(); if (x in 0 until W && y in 0 until H) paperLv.add(g[y * W + x]) }
        val light = if (paperLv.isNotEmpty()) paperLv.min().toDouble() / max(1, paperLv.max()) else 1.0
        val c0 = Hg.fwd.map(0.0, 0.0); val c1 = Hg.fwd.map(layout.PAGE_W, 0.0)
        val tilt = abs(atan2(c1.y - c0.y, c1.x - c0.x) * 180 / PI)
        var qs = 100.0
        if (pxPerMm < 3) qs -= (3 - pxPerMm) * 25
        if (residMm != null) qs -= clamp((residMm - 0.15) * 80, 0.0, 30.0)
        if (light < 0.75) qs -= (0.75 - light) * 80
        if (sharp < 0.25) qs -= (0.25 - sharp) * 120
        if (best.mids == 0) qs -= 10
        val qScore = jsRound(clamp(qs, 0.0, 100.0)).toInt()
        ret.quality = Quality(qScore, if (qScore >= 80) "A" else if (qScore >= 60) "B" else "C", Math.round(pxPerMm * 100) / 100.0, residMm?.let { Math.round(it * 100) / 100.0 }, Math.round(light * 100) / 100.0, Math.round(sharp * 100) / 100.0, Math.round(tilt * 10) / 10.0)
        ret.geo = Geo(Hg, blockFits, gr.scale, pxPerMm, nOpt, active, layout)
        ret.markerMatch = bestBm
        ret.grid = grid; ret.success = true
        ret.logs.add("Ambang ${jsRound(dec.thr * 100)}% (kosong ${jsRound(dec.empty * 100)}%, terisi ${jsRound(dec.full * 100)}%), kualitas $qScore")
        ret.logs.add("Selesai ${System.currentTimeMillis() - t0} ms")
        return ret
    }

    /**
     * Auto-identifikasi dua formulir BERMARKER dengan marker identik.
     * Identitas/penilaian tetap mengikuti jumlah kunci (activeIn), bukan kapasitas PDF.
     *
     * Perbedaan yang paling tegas: lembar 50 memiliki bulatan cetak pada baris
     * keenam–kesepuluh (y=156..188 mm) pada SETIAP blok. Lembar 25 tidak.
     * Pemeriksaan ini jauh lebih aman daripada hanya membandingkan 20 bulatan
     * aktif, karena pola bagian atas kedua formulir saling tumpang tindih.
     */
    fun processMarkerAuto(
        img: ArgbImage, options: Int = 4, activeIn: Int = 50,
        sensitivity: Double = 50.0, contrast: Double = 10.0, maxSide: Int = 1600
    ): LjkResult {
        val old = processMarker(img, options, activeIn, sensitivity, contrast, maxSide, MarkerLayouts.F4_50)
        if (options != 4 || activeIn > 25) return old
        val compact = processMarker(img, options, activeIn, sensitivity, contrast, maxSide, MarkerLayouts.F4_25)
        if (!compact.success) return old
        if (!old.success) return compact
        val geo = old.geo ?: return compact
        val mmCircles = old.circles.map { geo.H.inv.map(it.x, it.y) }
        var lowerHits = 0
        for (block in 0 until 5) for (row in 5 until 10) for (option in 0 until 4) {
            val target = LjkSpec.bubbleMM(block * 10 + row, option)
            if (mmCircles.any { hypot(it.x - target.x, it.y - target.y) < 1.1 }) lowerHits++
        }
        val result = if (lowerHits >= 18) old else compact
        result.logs.add("Auto-layout: ${result.geo?.layout?.id}, bulatan baris 6–10 = $lowerHits/100")
        return result
    }

    /** deteksi marker cepat untuk preview kamera; sudut dalam koordinat gambar asli */
    class FastMarkers(val corners: List<Pt>, val score: Double, val pxPerMm: Double)
    fun detectMarkersFast(img: ArgbImage, maxSide: Int = 640): FastMarkers? {
        val gr = toGray(img, maxSide)
        val bin = adaptiveThreshold(gr.g, gr.w, gr.h, max(9, jsRound(max(gr.w, gr.h) / 12.0).toInt()), 22.0)
        val sq = solidSquares(components(bin, gr.w, gr.h).comps, gr.w, gr.h)
        if (sq.size < 4) return null
        val h = markerHypotheses(sq, gr.g, gr.w, gr.h).firstOrNull() ?: return null
        if (h.score < 3) return null
        return FastMarkers(h.pairs.map { Pt(it.x / gr.scale, it.y / gr.scale) }, h.score, h.pxPerMm / gr.scale)
    }

    // ------------------------------------------------------------ 7. mode tanpa marker (LJK lama)
    private class LC(val items: MutableList<LItem>, var max: Double) { var c = 0.0; var size = 0 }
    class LItem(val x: Double, val y: Double, val r: Double) { var u = 0.0; var v = 0.0; var ri = 0; var ci = 0 }

    private fun radiusModes(cands: List<Circle>, maxModes: Int): List<Double> {
        val modes = ArrayList<Double>(); var pool = cands
        while (pool.isNotEmpty() && modes.size < maxModes) {
            var best = 0; var bestR = 0.0
            for (c in pool) { var cnt = 0; for (d in pool) if (d.r >= c.r / 1.22 && d.r <= c.r * 1.22) cnt++; if (cnt > best) { best = cnt; bestR = c.r } }
            if (best < 12) break
            val R = median(pool.filter { it.r >= bestR / 1.22 && it.r <= bestR * 1.22 }.map { it.r })
            modes.add(R)
            pool = pool.filter { it.r < R / 1.35 || it.r > R * 1.35 }
        }
        return modes
    }
    private fun cluster1D(items: List<LItem>, key: (LItem) -> Double, gap: Double): List<LC> {
        val s = items.sortedBy(key); val cl = ArrayList<LC>()
        for (it in s) {
            val last = cl.lastOrNull()
            if (last != null && key(it) - last.max <= gap) { last.items.add(it); last.max = key(it) } else cl.add(LC(mutableListOf(it), key(it)))
        }
        cl.forEach { c -> c.c = c.items.sumOf(key) / c.items.size; c.size = c.items.size }
        return cl
    }
    private fun rebuildColumns(xs: List<Double>, blocks: Int, options: Int): List<Double>? {
        if (xs.size < blocks * 2) return null
        val gaps = (1 until xs.size).map { (xs[it] - xs[it - 1]) to it }
        val small = median(gaps.map { it.first }.sorted().take(max(1, gaps.size - (blocks - 1))))
        val cuts = gaps.filter { it.first > small * 1.6 }.sortedByDescending { it.first }.take(blocks - 1).map { it.second }.sorted()
        if (cuts.size != blocks - 1) return null
        val groups = ArrayList<List<Double>>(); var s0 = 0
        for (c in cuts) { groups.add(xs.subList(s0, c)); s0 = c }; groups.add(xs.subList(s0, xs.size))
        if (groups.any { it.size > options || it.isEmpty() }) return null
        val fullG = groups.filter { it.size == options }
        val tmpl = if (fullG.isNotEmpty()) (0 until options).map { k -> median(fullG.map { it[k] - it[0] }) } else (0 until options).map { it * small }
        val starts = groups.map { if (it.size == options) it[0] else null }
        val pitches = ArrayList<Double>()
        for (i in 0 until blocks) for (j in i + 1 until blocks) { val a = starts[i]; val b = starts[j]; if (a != null && b != null) pitches.add((b - a) / (j - i)) }
        val pitch = if (pitches.isNotEmpty()) median(pitches) else null
        val out = ArrayList<Double>()
        groups.forEachIndexed { gi, gr ->
            if (gr.size == options) { out.addAll(gr); return@forEachIndexed }
            var expStart: Double? = null
            if (pitch != null) { val ref = starts.mapIndexedNotNull { i, st -> if (st != null) st to i else null }.sortedBy { abs(it.second - gi) }[0]; expStart = ref.first + (gi - ref.second) * pitch }
            var bestErr = Double.MAX_VALUE; var bestOff = 0.0; var found = false
            var sh = 0
            while (sh + gr.size <= options) {
                val off = median(gr.mapIndexed { k, x -> x - tmpl[sh + k] })
                var err = gr.mapIndexed { k, x -> abs(x - (off + tmpl[sh + k])) }.sum()
                if (expStart != null) err += abs(off - expStart) * 2
                if (!found || err < bestErr) { bestErr = err; bestOff = off; found = true }
                sh++
            }
            out.addAll(tmpl.map { bestOff + it })
        }
        return out
    }

    fun processMarkerless(img: ArgbImage, questions: Int = 20, blocks: Int = 4, options: Int = 4, sensitivity: Double = 50.0, contrast: Double = 10.0, maxSide: Int = 1600, minDet: Double = 0.45): LjkResult {
        val ret = LjkResult(); ret.mode = "markerless"
        val ROWS = ceil(questions.toDouble() / blocks).toInt(); val NCOL = blocks * options
        val LET = LjkSpec.LETTERS.substring(0, options); val sens = clamp(sensitivity / 100, 0.2, 0.8)
        fun fail(m: String): LjkResult { ret.error = m; ret.logs.add("GAGAL: $m"); return ret }
        val gr = toGray(img, maxSide); ret.gray = gr
        val g = gr.g; val W = gr.w; val H = gr.h
        val bin = adaptiveThreshold(g, W, H, max(7, jsRound(max(W, H) / 70.0).toInt()), contrast)
        val cc = components(bin, W, H)
        val cands = removeNested(circleCandidates(cc.lab, cc.comps, W, H, max(3.0, min(W, H) / 160.0), max(W, H) / 22.0))
        ret.logs.add("Gambar ${W}x$H, komponen ${cc.comps.size}, kandidat bulat ${cands.size}")
        if (cands.size < NCOL) return fail("Lingkaran jawaban tidak ditemukan (${cands.size}). Dekatkan kamera / perbaiki cahaya.")

        class TL(val grid: List<List<GridPt>>, val r0: Double, val th: Double, val map: (Double, Double) -> Pt, val colU: DoubleArray, val rowV: DoubleArray, val quality: Double)
        fun tryLattice(cs: List<LItem>, R0: Double): Any {
            if (cs.size < NCOL) return "Lingkaran ukuran ${jsRound(R0)}px hanya ${cs.size}."
            val angs = ArrayList<Double>()
            for (a in cs) {
                var bst: LItem? = null; var bd = 1e9
                for (b in cs) { if (b.x <= a.x) continue; val dx = b.x - a.x; val dy = b.y - a.y; val d = hypot(dx, dy); if (d < bd && d < R0 * 4 && abs(dy) < dx * 0.6) { bd = d; bst = b } }
                if (bst != null) angs.add(atan2(bst.y - a.y, bst.x - a.x))
            }
            val th = median(angs); val ct = cos(th); val st = sin(th)
            cs.forEach { it.u = it.x * ct + it.y * st; it.v = -it.x * st + it.y * ct }
            val rowsCl = cluster1D(cs, { it.v }, R0 * 0.9).filter { it.size >= max(3.0, NCOL * 0.25) }
            if (rowsCl.size < ROWS) return "Baris soal terdeteksi ${rowsCl.size}/$ROWS. Pastikan seluruh tabel masuk bingkai."
            var bestW = 0; var bestS = -1.0
            for (i in 0..rowsCl.size - ROWS) {
                val win = rowsCl.subList(i, i + ROWS); val sp = (1 until win.size).map { win[it].c - win[it - 1].c }
                val ms = median(sp); val regular = sp.all { it > ms * 0.6 && it < ms * 1.5 }
                val score = win.sumOf { it.size }.toDouble() * (if (regular) 1.0 else 0.5)
                if (score > bestS) { bestS = score; bestW = i }
            }
            val rowSel = rowsCl.subList(bestW, bestW + ROWS); val rowV = rowSel.map { it.c }.toDoubleArray()
            val inRows = ArrayList<LItem>(); rowSel.forEachIndexed { ri, rc -> rc.items.forEach { it.ri = ri; inRows.add(it) } }
            var colCl = cluster1D(inRows, { it.u }, R0 * 0.8).filter { it.size >= min(2, ROWS) }
            // kolom bulatan yang jelas lebih banyak dari tata letak -> lembar lain (mis. LJK 25 dibaca sebagai 20)
            if (colCl.count { it.size >= ROWS - 1 } >= NCOL + (options + 1) / 2) return "Kolom opsi lebih banyak dari tata letak $questions soal."
            if (colCl.size > NCOL) { val keep = colCl.sortedByDescending { it.size }.take(NCOL).toSet(); colCl = colCl.filter { it in keep } }
            var colU = colCl.map { it.c }
            if (colU.size != NCOL) { colU = rebuildColumns(colU, blocks, options) ?: return "Kolom opsi terdeteksi ${colU.size}/$NCOL. Foto ulang lebih lurus/dekat." }
            val pairs = ArrayList<Pair<Corr, LItem>>()
            for (it in inRows) {
                var ci = -1; var bd = R0 * 0.8
                colU.forEachIndexed { k, u -> val d = abs(it.u - u); if (d < bd) { bd = d; ci = k } }
                if (ci >= 0) { it.ci = ci; pairs.add(Corr(colU[ci], rowV[it.ri], it.x, it.y) to it) }
            }
            var Hm = if (pairs.size >= 6) fitHomography(pairs.map { it.first }) else null
            if (Hm != null) { val h0 = Hm; val good = pairs.filter { val q = h0.map(it.first.u, it.first.v); hypot(q.x - it.first.x, q.y - it.first.y) < R0 * 0.6 }; if (good.size >= 6) Hm = fitHomography(good.map { it.first }) ?: Hm }
            val hFinal = Hm
            val map: (Double, Double) -> Pt = if (hFinal != null) { u, v -> hFinal.map(u, v) } else { u, v -> Pt(u * ct - v * st, u * st + v * ct) }
            val cell = HashMap<String, LItem>(); pairs.forEach { cell["${it.second.ri},${it.second.ci}"] = it.second }
            val grid = ArrayList<List<GridPt>>(); var nDet = 0
            for (r in 0 until ROWS) {
                val row = ArrayList<GridPt>()
                for (c in 0 until NCOL) {
                    var p = map(colU[c], rowV[r]); val det = cell["$r,$c"]
                    val use = det != null && hypot(det.x - p.x, det.y - p.y) < R0 * 0.6
                    if (use) { p = Pt(det!!.x, det.y); nDet++ }
                    row.add(GridPt(p.x, p.y, R0, darkness(g, W, H, p.x, p.y, R0), use))
                }
                grid.add(row)
            }
            // kisi yang sebagian besar sel-nya tebakan (tidak ada bulatan) = bukan tabel jawaban ini
            if (nDet < ROWS * NCOL * minDet) return "Hanya ${jsRound(nDet.toDouble() / (ROWS * NCOL) * 100).toInt()}% bulatan cocok dengan kisi $questions soal."
            return TL(grid, R0, th, map, colU.toDoubleArray(), rowV, nDet.toDouble() / (ROWS * NCOL))
        }

        var best: TL? = null; var lastErr: String? = null
        for (R in radiusModes(cands, 4)) {
            val t = tryLattice(cands.filter { it.r >= R / 1.3 && it.r <= R * 1.3 }.map { LItem(it.x, it.y, it.r) }, R)
            if (t is TL) { if (best == null || t.quality > best.quality) best = t } else if (lastErr == null) lastErr = t as String
        }
        if (best == null) return fail(lastErr ?: "Kisi $ROWS baris x $NCOL kolom tidak ditemukan.")
        ret.grid = best.grid
        ret.lattice = Lattice(best.map, best.colU, best.rowV, gr.scale, best.r0, questions, blocks, options)
        val qDs = (0 until questions).map { q -> val b = q / ROWS; val r = q % ROWS; DoubleArray(options) { o -> best.grid[r][b * options + o].d } }
        ret.dark.addAll(qDs)
        val dec = decide(qDs, LET, sens)
        ret.answers.addAll(dec.answers); ret.status.addAll(dec.status); ret.suggest.addAll(dec.suggest); ret.notes.addAll(dec.notes); ret.conf.addAll(dec.conf)
        ret.filledAnswers = dec.filled; ret.thr = dec.thr; ret.empty = dec.empty; ret.full = dec.full
        ret.quality = Quality(jsRound(best.quality * 100).toInt(), if (best.quality > 0.9) "A" else if (best.quality > 0.75) "B" else "C", 0.0, null, 1.0, 0.0, Math.round(best.th * 180 / PI * 10) / 10.0)
        ret.success = true
        return ret
    }

    // ---- LJK lama: arah otomatis (0/90/180/270) — port dari web processMarkerlessAuto
    fun rotateImg(img: ArgbImage, deg: Int): ArgbImage {
        if (deg == 0) return img
        val w = img.width; val h = img.height
        val W = if (deg % 180 != 0) h else w; val H = if (deg % 180 != 0) w else h
        val o = IntArray(W * H)
        for (y in 0 until h) for (x in 0 until w) {
            val X: Int; val Y: Int
            when (deg) { 90 -> { X = h - 1 - y; Y = x }; 180 -> { X = w - 1 - x; Y = h - 1 - y }; else -> { X = y; Y = w - 1 - x } }
            o[Y * W + X] = img.px[y * w + x]
        }
        return ArgbImage(W, H, o)
    }
    fun shrinkImg(img: ArgbImage, maxSide: Int): ArgbImage {
        val s = min(1.0, maxSide.toDouble() / max(img.width, img.height))
        if (s == 1.0) return img
        val W = max(1, jsRound(img.width * s).toInt()); val H = max(1, jsRound(img.height * s).toInt())
        return ArgbImage(W, H, IntArray(W * H) { i -> val x = i % W; val y = i / W
            img.px[min(img.height - 1, floor(y / s).toInt()) * img.width + min(img.width - 1, floor(x / s).toInt())] })
    }
    class Cue(val left: Double, val right: Double, val flipped: Boolean)
    /** nomor soal selalu di KIRI kolom A: tinta kiri vs kanan tiap blok, relatif kertas setempat */
    fun legacyCue(r: LjkResult): Cue {
        val gr = r.gray!!; val g = gr.g; val W = gr.w; val H = gr.h; val lat = r.lattice!!; val R = lat.r0
        fun ink(u: Double, v: Double): Double {
            val vals = ArrayList<Int>(); val inn = ArrayList<Int>()
            var dv = -1.6
            while (dv <= 1.6) {
                var du = -1.6
                while (du <= 1.6) {
                    val p = lat.map(u + du * R, v + dv * R); val x = jsRound(p.x).toInt(); val y = jsRound(p.y).toInt()
                    if (x >= 0 && y >= 0 && x < W && y < H) { val v0 = g[y * W + x]; vals.add(v0); if (abs(du) <= 0.8 && abs(dv) <= 0.7) inn.add(v0) }
                    du += 0.2
                }
                dv += 0.2
            }
            if (inn.isEmpty()) return 0.0
            vals.sort()
            val paper = vals[floor(vals.size * 0.9).toInt()].let { if (it == 0) 1 else it }
            return inn.count { it < paper * 0.7 }.toDouble() / inn.size
        }
        var left = 0.0; var right = 0.0
        // diukur di CELAH antarkolom saja (D blok b | A blok b+1): bebas dari garis bingkai tabel
        for (b in 0 until lat.blocks - 1) for (v in lat.rowV) {
            left += ink(lat.colU[(b + 1) * lat.options] - 2.4 * R, v)
            right += ink(lat.colU[b * lat.options + lat.options - 1] + 2.4 * R, v)
        }
        return Cue(left, right, right > left * 1.15 && right - left > 0.15)
    }
    /** tata letak LJK lama yang dikenal. 25 dicoba DULU: kisi 20 bisa "muat" di sebagian lembar 25, tidak sebaliknya. */
    class LegacyLayout(val questions: Int, val blocks: Int, val options: Int = 4)
    val LEGACY_LAYOUTS = listOf(LegacyLayout(25, 5), LegacyLayout(20, 4))
    /** LJK lama dari arah mana pun; r.image = gambar yang sudah diputar (dipakai potongan identitas & bukti) */
    fun processMarkerlessAuto(img: ArgbImage, sensitivity: Double = 50.0, contrast: Double = 10.0, layouts: List<LegacyLayout> = LEGACY_LAYOUTS): LjkResult {
        fun run(im: ArgbImage, L: LegacyLayout, minDet: Double = 0.45) = processMarkerless(im, L.questions, L.blocks, L.options, sensitivity, contrast, minDet = minDet)
        // 1) salinan kecil (longgar): kandidat arah 0/90/270 x tata letak; 2) resolusi penuh (ketat) memastikan
        val small = shrinkImg(img, 1000)
        var rot: Int? = null; var im = img; var r: LjkResult? = null; var first: LjkResult? = null; var lay = layouts.last()
        search@ for (deg in intArrayOf(0, 90, 270)) {
            val s = rotateImg(small, deg)
            for (L in layouts) {
                if (!run(s, L, 0.3).success) continue
                val imF = rotateImg(img, deg); val rF = run(imF, L)
                if (rF.success) { rot = deg; im = imF; r = rF; lay = L; break@search }
                if (first == null) first = rF
            }
        }
        if (rot == null || r == null) return first ?: run(img, layouts.last())
        // cek terbalik 180 dari letak nomor soal
        if (r.success && legacyCue(r).flipped) {
            val rot2 = (rot + 180) % 360; val im2 = rotateImg(img, rot2)
            val r2 = run(im2, lay)
            if (r2.success) { rot = rot2; im = im2; r = r2 }
        }
        r.image = im; r.rotation = rot
        if (rot != 0 && r.success) r.warnings.add("LJK lama diputar $rot° secara otomatis.")
        return r
    }

    // ------------------------------------------------------------ 8. pelurusan & potongan identitas
    class Rect(val w: Int, val h: Int, val argb: IntArray, val k: Double, val u1: Double, val v1: Double) {
        fun toOut(u: Double, v: Double) = Pt((u - u1) * k, (v - v1) * k)
    }
    fun sampleRect(img: ArgbImage, mapper: (Double, Double) -> Pt, scale: Double, u1: Double, v1: Double, u2: Double, v2: Double, outW: Int): Rect {
        val k = outW / (u2 - u1); val outH = max(1, jsRound((v2 - v1) * k).toInt())
        val out = IntArray(outW * outH); val sw = img.width; val sh = img.height; val inv = 1 / scale
        for (oy in 0 until outH) {
            val v = v1 + oy / k
            for (ox in 0 until outW) {
                val p = mapper(u1 + ox / k, v); val x = p.x * inv; val y = p.y * inv
                val x0 = floor(x).toInt(); val y0 = floor(y).toInt()
                var R = 255.0; var G = 255.0; var B = 255.0
                if (x0 >= 0 && y0 >= 0 && x0 < sw - 1 && y0 < sh - 1) {
                    val fx = x - x0; val fy = y - y0
                    val c00 = img.px[y0 * sw + x0]; val c10 = img.px[y0 * sw + x0 + 1]; val c01 = img.px[(y0 + 1) * sw + x0]; val c11 = img.px[(y0 + 1) * sw + x0 + 1]
                    fun bl(sh2: Int): Double = (((c00 shr sh2) and 255) * (1 - fx) + ((c10 shr sh2) and 255) * fx) * (1 - fy) + (((c01 shr sh2) and 255) * (1 - fx) + ((c11 shr sh2) and 255) * fx) * fy
                    R = bl(16); G = bl(8); B = bl(0)
                }
                out[oy * outW + ox] = (0xFF shl 24) or (R.toInt() shl 16) or (G.toInt() shl 8) or B.toInt()
            }
        }
        return Rect(outW, outH, out, k, u1, v1)
    }
    /** potongan identitas LJK lama (tanpa marker): area di atas tabel PG, satuan kisi kanonik (sama dengan web identLattice) */
    fun identLattice(img: ArgbImage, l: Lattice, outW: Int = 1100): Rect {
        val u0 = l.colU[0]; val gw = l.colU[l.colU.size - 1] - u0; val v0 = l.rowV[0]
        return sampleRect(img, l.map, l.scale, u0 - 0.078 * gw, v0 - 0.300 * gw, u0 + 0.470 * gw, v0 - 0.148 * gw, outW)
    }
    fun rectifyView(img: ArgbImage, geo: Geo, outW: Int = 1000): Rect {
        val r = LjkSpec.REGION_VIEW
        return sampleRect(img, { u, v -> geo.map(u, v) }, geo.scale, r[0], r[1], r[2], r[3], outW)
    }

    /** potongan nama / nomor / kelas untuk OCR; kotak isian merah muda dihapus, tahan bayangan */
    fun identityStrips(img: ArgbImage, geo: Geo, pxPerMm: Double = 12.0): Map<String, Pair<Rect, Double>> {
        val out = LinkedHashMap<String, Pair<Rect, Double>>()
        for ((key, f) in listOf("nama" to LjkSpec.NAMA, "nomor" to LjkSpec.NOMOR, "kelas" to LjkSpec.KELAS)) {
            val x1 = f.x - 1; val y1 = f.y - 1.2; val x2 = f.x + f.n * f.cw + 1; val y2 = f.y + f.h + 1.2
            val s = sampleRect(img, { u, v -> geo.map(u, v) }, geo.scale, x1, y1, x2, y2, jsRound((x2 - x1) * pxPerMm).toInt())
            val n = s.w * s.h; val lum = IntArray(n) { lumOf(s.argb[it]) }
            val paper = localPaper(lum, s.w, s.h, jsRound(pxPerMm * 4).toInt())
            var ink = 0
            for (i in 0 until n) {
                val c = s.argb[i]; val r = ((c shr 16) and 255) + 1; val g = ((c shr 8) and 255) + 1; val b = (c and 255) + 1
                val pp = max(1.0, paper[i % s.w]); val rel = lum[i] / pp
                val pinkish = r.toDouble() / g > 1.12 && r.toDouble() / b > 1.04 && rel > 0.55
                val v = if (pinkish) 255 else clampI(jsRound((rel - 0.45) / 0.37 * 255).toInt(), 0, 255)
                s.argb[i] = (0xFF shl 24) or (v shl 16) or (v shl 8) or v
                if (v < 160) ink++
            }
            // Cetakan sekolah sering hitam-putih: garis comb merah muda menjadi
            // hitam dan lolos filter dropout warna. Hapus garis TEPI comb
            // menggunakan geometri milimeter, tanpa menyentuh isi tengah sel.
            val k = s.k
            val xEdge = ((f.x - x1) * k).toInt()
            val yTop = ((f.y - y1) * k).toInt()
            val yBottom = ((f.y + f.h - y1) * k).toInt()
            val strip = max(1, jsRound(k * 0.22).toInt())
            val borderY = max(1, jsRound(k * 0.18).toInt())
            for (y in 0 until s.h) {
                for (x in 0 until s.w) {
                    val vx = x - xEdge
                    val nearVertical = vx >= -strip && vx <= f.n * f.cw * k + strip &&
                        (0..f.n).any { ci -> abs(vx - ci * f.cw * k) <= strip }
                    val nearHorizontal = x >= xEdge && x <= xEdge + f.n * f.cw * k &&
                        (abs(y - yTop) <= borderY || abs(y - yBottom) <= borderY)
                    if (nearVertical || nearHorizontal) s.argb[y * s.w + x] = -1
                }
            }
            out[key] = s to ink.toDouble() / n
        }
        return out
    }
    private fun localPaper(lum: IntArray, w: Int, h: Int, win: Int): DoubleArray {
        val step = max(4, win shr 1); val paper = DoubleArray(w)
        val ax = ArrayList<Int>(); val av = ArrayList<Int>()
        var x0 = 0
        while (x0 < w) {
            val vals = ArrayList<Int>()
            var y = 0; while (y < h) { var x = max(0, x0 - win); while (x < min(w, x0 + win)) { vals.add(lum[y * w + x]); x += 2 }; y += 2 }
            vals.sort(); ax.add(x0); av.add(if (vals.isEmpty()) 255 else vals[floor(vals.size * 0.85).toInt()])
            x0 += step
        }
        for (x in 0 until w) {
            val i = min(ax.size - 1, x / step); val j = min(ax.size - 1, i + 1)
            val t = if (ax[j] > ax[i]) (x - ax[i]).toDouble() / (ax[j] - ax[i]) else 0.0
            paper[x] = av[i] + (av[j] - av[i]) * clamp(t, 0.0, 1.0)
        }
        return paper
    }
}
