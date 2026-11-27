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
    val REGION_VIEW: DoubleArray,
    // Geometri marker & kotak identitas. Bawaan = F4 resmi; LJK percetakan SMPN 2 punya posisi sendiri.
    val CORNERS: Array<DoubleArray> = LjkSpec.CORNER_CENTERS,     // TL TR BR BL
    val CORNER_SIZE: Double = LjkSpec.CORNER_SIZE,
    val MIDS: Array<DoubleArray> = LjkSpec.MID_CENTERS,
    val MID_SIZE: Double = LjkSpec.MID_SIZE,
    val ORIENT: DoubleArray = LjkSpec.ORIENT_CENTER,
    val ORIENT_SIZE: Double = LjkSpec.ORIENT_SIZE,
    /** patokan cadangan bila kotak bawah terpotong: TL, TR, tengah-kanan, tengah-kiri (+ ukurannya) */
    val PARTIAL: Array<DoubleArray>? = null,
    val PARTIAL_SIZES: DoubleArray? = null,
    val NAMA: LjkSpec.Comb = LjkSpec.NAMA,
    val NOMOR: LjkSpec.Comb = LjkSpec.NOMOR,
    val KELAS: LjkSpec.Comb = LjkSpec.KELAS
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
    /**
     * LJK cetakan percetakan SMPN 2 Jalaksana (ASAS 2026/2027): kop + QR, 25 soal ABCD, kotak isian
     * hitam, dan SEMUA marker bergeser dari F4 resmi (sudut atas y=16, bawah y=314, tengah y=168,6 mm).
     * Diukur dari scan 200 dpi lembar kosong (27 Nov 2026). Sama dengan SPEC_SMPN2_25 di web/js/ljk-spec.js.
     */
    val SMPN2_25 = MarkerLayout(
        id = "F4-25-SMPN2",
        QUESTIONS = 25, BLOCKS = 5, ROWS = 5,
        X0 = 24.0, BLOCK_W = 33.47, OPT_OFFSET = 11.44, OPT_PITCH = 5.25,
        Y0 = 130.57, ROW_PITCH = 6.72, R = 2.0,
        PG_FRAME = doubleArrayOf(23.4, 121.3, 192.1, 166.5),
        REGION_VIEW = doubleArrayOf(12.0, 18.0, 203.0, 170.0),
        CORNERS = arrayOf(doubleArrayOf(10.0, 16.0), doubleArrayOf(205.0, 16.0), doubleArrayOf(205.0, 314.0), doubleArrayOf(10.0, 314.0)),
        CORNER_SIZE = 8.5,
        MIDS = arrayOf(doubleArrayOf(9.25, 168.6), doubleArrayOf(205.75, 168.6)), MID_SIZE = 6.2,
        ORIENT = doubleArrayOf(19.1, 13.9), ORIENT_SIZE = 4.3,
        PARTIAL = arrayOf(doubleArrayOf(10.0, 16.0), doubleArrayOf(205.0, 16.0), doubleArrayOf(205.75, 168.6), doubleArrayOf(9.25, 168.6)),
        PARTIAL_SIZES = doubleArrayOf(8.5, 8.5, 6.2, 6.2),
        NAMA = LjkSpec.Comb(53.0, 70.4, 26, 5.33, 7.1),
        NOMOR = LjkSpec.Comb(53.0, 82.0, 10, 5.34, 6.8),
        KELAS = LjkSpec.Comb(149.0, 82.1, 6, 5.32, 6.9)
    )

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
