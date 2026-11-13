package id.buleudteu.ljk.ui

import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import androidx.core.content.FileProvider
import id.buleudteu.ljk.AppViewModel
import id.buleudteu.ljk.data.Ujian
import id.buleudteu.ljk.engine.LjkSpec
import id.buleudteu.ljk.engine.MarkerLayouts
import java.io.File
import kotlin.math.roundToInt

/**
 * Cetak F4 25 soal bermarker sebagai PDF VEKTOR langsung di Android.
 * Geometri PG, orientasi, dan OCR identik dengan MarkerLayouts.F4_25.
 * Tidak ada kolom nilai/paraf dan TIDAK ada garis esai.
 */
fun shareLjk25(ctx: Context, vm: AppViewModel, exam: Ujian? = null) {
    val paperW = 215f
    val paperH = 330f
    val ptsPerMm = 72f / 25.4f
    val doc = PdfDocument()
    val page = doc.startPage(PdfDocument.PageInfo.Builder(
        (paperW * ptsPerMm).roundToInt(), (paperH * ptsPerMm).roundToInt(), 1
    ).create())
    val c = page.canvas
    c.scale(ptsPerMm, ptsPerMm)

    val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK }
    fun rect(x: Float, y: Float, w: Float, h: Float, stroke: Float = 0.35f, color: Int = Color.BLACK, fill: Boolean = false) {
        p.color = color; p.style = if (fill) Paint.Style.FILL else Paint.Style.STROKE
        p.strokeWidth = stroke
        c.drawRect(x, y, x + w, y + h, p)
    }
    fun line(x: Float, y: Float, x2: Float, y2: Float, color: Int = Color.DKGRAY, weight: Float = 0.25f) {
        p.color = color; p.style = Paint.Style.STROKE; p.strokeWidth = weight
        c.drawLine(x, y, x2, y2, p)
    }
    fun text(t: String, x: Float, y: Float, size: Float = 3f, bold: Boolean = false, align: Paint.Align = Paint.Align.LEFT, color: Int = Color.BLACK) {
        p.color = color; p.style = Paint.Style.FILL; p.textSize = size
        p.typeface = if (bold) Typeface.create("sans-serif", Typeface.BOLD) else Typeface.create("sans-serif", Typeface.NORMAL)
        p.textAlign = align
        c.drawText(t, x, y, p)
    }

    // Empat marker sudut, dua marker tengah, satu marker arah – dipertahankan.
    for (center in LjkSpec.CORNER_CENTERS) {
        rect((center[0] - 4).toFloat(), (center[1] - 4).toFloat(), 8f, 8f, fill = true)
    }
    for (center in LjkSpec.MID_CENTERS) {
        rect((center[0] - 3).toFloat(), (center[1] - 3).toFloat(), 6f, 6f, fill = true)
    }
    rect(17f, 6f, 4f, 4f, fill = true)

    val school = vm.sekolah
    val schoolName = school?.nama?.takeIf { it.isNotBlank() } ?: "SMPN 2 JALAKSANA"
    val year = school?.tahun?.takeIf { it.isNotBlank() } ?: "2026/2027"
    val logo = logoBitmap(school?.logo)
    if (logo != null) {
        p.style = Paint.Style.FILL; p.color = Color.WHITE
        c.drawBitmap(logo, null, android.graphics.RectF(16f, 16f, 38f, 38f), p)
        logo.recycle()
    } else {
        rect(16f, 16f, 22f, 22f, color = Color.LTGRAY)
        text("LOGO", 27f, 28f, 2.6f, align = Paint.Align.CENTER, color = Color.GRAY)
    }

    text("LEMBAR JAWABAN", 107.5f, 21.5f, 5f, true, Paint.Align.CENTER)
    text(schoolName, 107.5f, 28f, 3.6f, true, Paint.Align.CENTER)
    text("Asesmen Sumatif Akhir Semester (ASAS)", 107.5f, 33.5f, 3.1f, false, Paint.Align.CENTER)
    text("TAHUN PELAJARAN " + year, 107.5f, 38.4f, 2.8f, false, Paint.Align.CENTER, Color.DKGRAY)
    // QR vektor, hanya memuat ID form. F4 25 dan F4 50 tetap
    // memakai marker sudut/tengah/asimetri yang persis sama.
    val qr = id.buleudteu.ljk.engine.LjkQr25
    rect(qr.X.toFloat(), qr.Y.toFloat(), qr.SIZE.toFloat(), qr.SIZE.toFloat(), stroke = 0f, fill = true, color = Color.WHITE)
    val qrCell = qr.SIZE.toFloat() / qr.ROWS.size
    qr.ROWS.forEachIndexed { y, bits ->
        bits.forEachIndexed { x, ch ->
            if (ch == '1') rect(qr.X.toFloat() + x * qrCell,
                qr.Y.toFloat() + y * qrCell, qrCell + 0.006f, qrCell + 0.006f,
                stroke = 0f, color = Color.BLACK, fill = true)
        }
    }
    line(14f, 41f, 201f, 41f, weight = 0.5f)
    line(14f, 42.2f, 201f, 42.2f)
    text("Tulis dengan HURUF KAPITAL, satu huruf per kotak, pakai pulpen/pensil gelap.", 16f, 47.6f, 2.3f, color = Color.DKGRAY)

    val pink = Color.rgb(240, 166, 182)
    fun comb(x: Float, y: Float, n: Int, cw: Float = 5.6f, h: Float = 7f) {
        for (i in 0 until n) rect(x + i * cw, y, cw, h, 0.32f, pink)
    }
    fun dotted(x: Float, y: Float, x2: Float) {
        var pos = x
        while (pos < x2) {
            line(pos, y, minOf(pos + 0.7f, x2), y, Color.GRAY, 0.22f)
            pos += 1.5f
        }
    }
    text("Nama Peserta", 16f, 57f); comb(52f, 52f, 26)
    text("Nomor Peserta", 16f, 68f); comb(52f, 63f, 10)
    text("Kelas", 136f, 68f); comb(150f, 63f, 6)
    text("Mata Pelajaran", 16f, 81f); dotted(52f, 81.6f, 125f)
    text("Tanggal", 134f, 81f); dotted(150f, 81.6f, 199f)
    text("Tanda Tangan", 16f, 93f); dotted(52f, 93.6f, 125f)

    text("I. PILIHAN GANDA", 15f, 101.5f, 3.4f, true)
    text("Hitamkan penuh satu bulatan. Jangan menyilang.", 200f, 101.5f, 2.3f, false, Paint.Align.RIGHT, Color.DKGRAY)
    val g = MarkerLayouts.F4_25
    val fx1 = g.PG_FRAME[0].toFloat()
    val fy1 = g.PG_FRAME[1].toFloat()
    rect(fx1, fy1, (g.PG_FRAME[2] - g.PG_FRAME[0]).toFloat(), (g.PG_FRAME[3] - g.PG_FRAME[1]).toFloat())
    for (b in 1 until g.BLOCKS) {
        val x = (g.X0 + b * g.BLOCK_W + 1.0).toFloat()
        line(x, fy1 + 3, x, g.PG_FRAME[3].toFloat() - 3, Color.LTGRAY, 0.2f)
    }
    for (q in 0 until g.QUESTIONS) {
        val block = q / g.ROWS
        val first = g.bubbleMM(q, 0)
        text((q + 1).toString() + ".", (g.X0 + block * g.BLOCK_W + LjkSpec.NUM_RIGHT).toFloat(), (first.y + 1.05).toFloat(),
            2.6f, true, Paint.Align.RIGHT)
        for (o in 0..3) {
            val b = g.bubbleMM(q, o)
            p.style = Paint.Style.STROKE; p.color = Color.DKGRAY; p.strokeWidth = 0.3f
            c.drawCircle(b.x.toFloat(), b.y.toFloat(), g.R.toFloat(), p)
            text("ABCD"[o].toString(), b.x.toFloat(), (b.y + 0.85).toFloat(), 2.3f,
                align = Paint.Align.CENTER, color = Color.GRAY)
        }
    }

    text("II. ESAI / CATATAN", 15f, 165f, 3.4f, true)
    text("Jawab sesuai nomor soal. Ruang uraian bebas tanpa garis.", 200f, 165f, 2.3f, false, Paint.Align.RIGHT, Color.DKGRAY)
    text(schoolName + " · ASAS " + year, 200f, 310f, 2f, false, Paint.Align.RIGHT, Color.GRAY)

    doc.finishPage(page)
    val file = File(ctx.cacheDir, "LJK_F4_MARKER_25_ABCD.pdf")
    try {
        file.outputStream().use { doc.writeTo(it) }
    } finally {
        doc.close()
    }
    val uri = FileProvider.getUriForFile(ctx, ctx.packageName + ".files", file)
    val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/pdf")
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    ctx.startActivity(Intent.createChooser(intent, "Cetak LJK F4 25 soal bermarker"))
}
