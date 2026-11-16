package id.buleudteu.ljk.engine

/**
 * Geometri pilihan ganda LJK F4 dalam milimeter. Marker dan comb identitas tetap
 * memakai F4-50-v1 supaya foto lama serta OCR tetap kompatibel.
 *
 * Jumlah QUESTIONS adalah kapasitas KERTAS, bukan jumlah soal ujian.
 * Jumlah aktif tetap mengikuti panjang kunci dari Google Spreadsheet.
 */
data class MarkerLayout(
    val id: String,
    val QUESTIONS: Int,
    val BLOCKS: Int,
    val ROWS: Int,
    val X0: Double = LjkSpec.X0,
    val BLOCK_W: Double = LjkSpec.BLOCK_W,
    val OPT_OFFSET: Double = LjkSpec.OPT_OFFSET,
    val OPT_PITCH: Double = LjkSpec.OPT_PITCH,
    val Y0: Double = LjkSpec.Y0,
    val ROW_PITCH: Double = LjkSpec.ROW_PITCH,
    val R: Double = LjkSpec.R,
    val PG_FRAME: DoubleArray,
    val REGION_VIEW: DoubleArray
) {
    val LETTERS: String get() = LjkSpec.LETTERS
    val PAGE_W: Double get() = LjkSpec.PAGE_W
    val PAGE_H: Double get() = LjkSpec.PAGE_H

    fun bubbleMM(q: Int, o: Int): Pt {
        require(q in 0 until QUESTIONS && o in 0..4)
        val b = q / ROWS
        val row = q % ROWS
        return Pt(X0 + b * BLOCK_W + OPT_OFFSET + o * OPT_PITCH, Y0 + row * ROW_PITCH)
    }
}

object MarkerLayouts {
    /** Formulir lama: 5 kolom × 10 baris, 50 nomor. */
    val F4_50 = MarkerLayout(
        id = LjkSpec.ID, QUESTIONS = 50, BLOCKS = 5, ROWS = 10,
        PG_FRAME = doubleArrayOf(15.0, 104.0, 200.0, 194.0),
        REGION_VIEW = doubleArrayOf(12.0, 14.0, 203.0, 196.0)
    )

    /** Formulir baru: 1–5, 6–10, 11–15, 16–20, 21–25; esai di bawah. */
    val F4_25 = MarkerLayout(
        id = "F4-25-ABCD-v1", QUESTIONS = 25, BLOCKS = 5, ROWS = 5,
        PG_FRAME = doubleArrayOf(15.0, 104.0, 200.0, 155.0),
        REGION_VIEW = doubleArrayOf(12.0, 14.0, 203.0, 164.0)
    )

    /**
     * LJK F4 25 ABCD dari percetakan, diekspor ScanSnap SV600.
     *
     * Keempat corner marker + 2 marker tengah menggunakan geometri F4
     * lama, tetapi kisi 25 bulatannya lebih pendek dan bergeser ke bawah
     * dibanding F4-25-ABCD-v1. Nilai empiris berikut berasal dari kalibrasi
     * geometris sampel cetak 16 November 2026 (tanpa data/identitas siswa).
     *
     * Jangan gunakan sebagai default: engine memilih profil ini HANYA bila
     * kecocokan posisi 100 bulatan unggul dengan margin yang besar.
     */
    val PRINTSHOP_F4_25 = MarkerLayout(
        id = "F4-25-ABCD-PRINTSHOP-v1",
        QUESTIONS = 25, BLOCKS = 5, ROWS = 5,
        X0 = 24.5, BLOCK_W = 34.1,
        OPT_OFFSET = 11.0, OPT_PITCH = 5.3,
        Y0 = 137.0, ROW_PITCH = 6.65, R = 2.0,
        PG_FRAME = doubleArrayOf(15.0, 124.0, 200.0, 169.0),
        REGION_VIEW = doubleArrayOf(12.0, 14.0, 203.0, 177.0)
    )
}
