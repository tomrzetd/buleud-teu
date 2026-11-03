package id.buleudteu.ljk.engine

/**
 * Spesifikasi geometri LJK F4 — HARUS identik dengan web/js/ljk-spec.js
 * (diuji oleh tools/test/kotlin/SpecTest: posisi semua bulatan dibandingkan dengan spec/ljk-f4-v1.json).
 * Satuan milimeter, (0,0) = pojok kiri atas kertas F4 215 x 330 mm.
 */
object LjkSpec {
    const val ID = "F4-50-v1"
    const val PAGE_W = 215.0
    const val PAGE_H = 330.0

    val CORNER_CENTERS = arrayOf(doubleArrayOf(10.0, 10.0), doubleArrayOf(205.0, 10.0), doubleArrayOf(205.0, 320.0), doubleArrayOf(10.0, 320.0)) // TL TR BR BL
    const val CORNER_SIZE = 8.0
    val MID_CENTERS = arrayOf(doubleArrayOf(8.5, 165.0), doubleArrayOf(206.5, 165.0))
    const val MID_SIZE = 6.0
    val ORIENT_CENTER = doubleArrayOf(19.0, 8.0)
    const val ORIENT_SIZE = 4.0

    // pilihan ganda
    const val QUESTIONS = 50
    const val BLOCKS = 5
    const val ROWS = 10
    const val X0 = 16.0
    const val BLOCK_W = 36.6
    const val NUM_RIGHT = 8.0
    const val OPT_OFFSET = 11.0
    const val OPT_PITCH = 5.6
    const val Y0 = 116.0
    const val ROW_PITCH = 8.0
    const val R = 2.2
    val PG_FRAME = doubleArrayOf(15.0, 104.0, 200.0, 194.0)

    // identitas (kotak per huruf)
    class Comb(val x: Double, val y: Double, val n: Int, val cw: Double = 5.6, val h: Double = 7.0)
    val NAMA = Comb(52.0, 52.0, 26)
    val NOMOR = Comb(52.0, 63.0, 10)
    val KELAS = Comb(150.0, 63.0, 6)

    val REGION_VIEW = doubleArrayOf(12.0, 14.0, 203.0, 196.0)
    const val LETTERS = "ABCDE"

    /** pusat bulatan soal q (0-based) opsi o (0 = A) dalam mm */
    fun bubbleMM(q: Int, o: Int): Pt {
        val b = q / ROWS; val r = q % ROWS
        return Pt(X0 + b * BLOCK_W + OPT_OFFSET + o * OPT_PITCH, Y0 + r * ROW_PITCH)
    }
}

data class Pt(val x: Double, val y: Double)
