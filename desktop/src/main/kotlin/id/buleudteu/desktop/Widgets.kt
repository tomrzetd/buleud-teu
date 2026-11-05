package id.buleudteu.desktop

import java.awt.*
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import java.awt.geom.Ellipse2D
import java.awt.image.BufferedImage
import javax.swing.*
import javax.swing.table.AbstractTableModel
import javax.swing.table.DefaultTableCellRenderer
import kotlin.math.max
import kotlin.math.min

object C {
    val BG = Color(0xF4F6FA); val CARD = Color.WHITE; val LINE = Color(0xD7DCE5); val TX = Color(0x1F2937); val TX2 = Color(0x6B7280)
    val BLUE = Color(0x2F62B0); val OK = Color(0x16A34A); val BAD = Color(0xDC2626); val WARN = Color(0xF59E0B)
    val OK_BG = Color(0xDCFCE7); val BAD_BG = Color(0xFEE2E2); val WARN_BG = Color(0xFEF3C7); val INFO_BG = Color(0xE0ECFF)
}

/** gambar bukti: pindaian + lingkaran jawaban (hijau benar, merah salah, kuning perlu cek, biru tipis kosong) */
class EvidencePanel : JComponent() {
    var sheet: Sheet? = null; var exam: Ujian? = null; var showDark = false
    init { preferredSize = Dimension(360, 520); toolTipText = "Bukti pembacaan. Klik kanan: tampilkan nilai kegelapan."
        addMouseListener(object : MouseAdapter() { override fun mousePressed(e: MouseEvent) { if (SwingUtilities.isRightMouseButton(e)) { showDark = !showDark; repaint() } } }) }
    override fun paintComponent(g0: Graphics) {
        val g = g0 as Graphics2D; g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR)
        g.color = Color(0x111827); g.fillRect(0, 0, width, height)
        val s = sheet; val pv = s?.preview
        if (s == null || pv == null) {
            g.color = Color(0x9CA3AF); g.font = g.font.deriveFont(13f)
            val msg = when { s == null -> "Pilih lembar di tabel"; s.state == SheetState.FAILED -> "Tidak terbaca: ${s.error}"; else -> s.state.label }
            drawCentered(g, msg, width / 2, height / 2); return
        }
        val k = min(width.toDouble() / pv.width, height.toDouble() / pv.height); val w = (pv.width * k).toInt(); val h = (pv.height * k).toInt()
        val ox = (width - w) / 2; val oy = (height - h) / 2
        g.drawImage(pv, ox, oy, w, h, null)
        val u = exam; val n = u?.jumlah ?: s.total; val rad = s.bubbleR * k
        g.font = g.font.deriveFont(max(8f, (rad * 0.9).toFloat()))
        for (q in 0 until min(n, s.bubbles.size)) for (o in s.bubbles[q].indices) {
            val p = s.bubbles[q][o]; val l = "ABCDE"[o]; val st = s.status.getOrNull(q); val a = s.answers.getOrNull(q); val key = u?.kunci?.getOrNull(q)
            val col = when {
                (st == "double" || st == "weak") && (s.suggest.getOrNull(q) ?: "").contains(l) -> C.WARN
                a == l -> if (key == null || key == l) C.OK else C.BAD
                key == l -> Color(22, 163, 74, 120)
                else -> Color(59, 130, 246, 70)
            }
            val strong = col == C.WARN || col == C.OK || col == C.BAD
            g.color = col; g.stroke = BasicStroke(if (strong) max(2f, (rad / 3).toFloat()) else 1f)
            val x = ox + p.x * k; val y = oy + p.y * k; val r = rad * 1.18
            g.draw(Ellipse2D.Double(x - r, y - r, 2 * r, 2 * r))
            if (showDark && s.dark.size > q) { g.color = Color(0xF43F5E); drawCentered(g, "${(s.dark[q][o] * 100).toInt()}", x.toInt(), (y - rad * 1.5).toInt()) }
        }
    }
    private fun drawCentered(g: Graphics2D, t: String, x: Int, y: Int) { val fm = g.fontMetrics; g.drawString(t, x - fm.stringWidth(t) / 2, y + fm.ascent / 2 - 1) }
}

/** LJK digital: ketuk bulatan untuk mengoreksi jawaban (sama dengan web/Android) */
class AnswerGrid(private val onChange: () -> Unit) : JComponent() {
    var sheet: Sheet? = null; var exam: Ujian? = null
    private val cell = 21; private val noW = 24; private val gap = 10
    private fun blockW(s: Sheet) = noW + s.nOpt * cell + 4
    private fun perRow(s: Sheet) = max(1, (max(width, 200) - 8) / (blockW(s) + gap))
    private fun blocks(s: Sheet) = (s.total + s.rows - 1) / s.rows
    override fun getPreferredSize(): Dimension { val s = sheet ?: return Dimension(260, 200); val pr = perRow(s); val lines = (blocks(s) + pr - 1) / pr
        return Dimension(260, lines * (s.rows * cell + 14) + 8) }
    init {
        addMouseListener(object : MouseAdapter() { override fun mousePressed(e: MouseEvent) {
            val s = sheet ?: return; val hit = hit(s, e.x, e.y) ?: return
            if (hit.first >= (exam?.jumlah ?: s.total)) return
            s.tap(hit.first, "ABCDE"[hit.second]); repaint(); onChange()
        } })
    }
    private fun origin(s: Sheet, b: Int): Point { val pr = perRow(s); return Point(4 + (b % pr) * (blockW(s) + gap), 4 + (b / pr) * (s.rows * cell + 14)) }
    private fun hit(s: Sheet, x: Int, y: Int): Pair<Int, Int>? {
        for (b in 0 until blocks(s)) { val o = origin(s, b); val r = (y - o.y - 4) / cell; val c = (x - o.x - noW) / cell
            if (x >= o.x + noW && c in 0 until s.nOpt && y >= o.y + 4 && r in 0 until s.rows) { val q = b * s.rows + r; return if (q < s.total) q to c else null } }
        return null
    }
    override fun paintComponent(g0: Graphics) {
        val g = g0 as Graphics2D; g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
        g.color = C.CARD; g.fillRect(0, 0, width, height)
        val s = sheet ?: return; val u = exam; val n = u?.jumlah ?: s.total
        g.font = Font(Font.SANS_SERIF, Font.PLAIN, 10)
        val fm = g.fontMetrics
        for (b in 0 until blocks(s)) {
            val o = origin(s, b)
            g.color = C.LINE; g.drawRoundRect(o.x - 2, o.y, blockW(s), s.rows * cell + 8, 8, 8)
            for (r in 0 until s.rows) {
                val q = b * s.rows + r; if (q >= s.total) break
                val off = q >= n; val st = s.status.getOrNull(q); val flag = !off && (st == "double" || st == "weak")
                val y = o.y + 4 + r * cell
                if (flag) { g.color = C.WARN_BG; g.fillRect(o.x, y, blockW(s) - 4, cell) }
                g.color = if (off) C.LINE else C.TX2; g.drawString("${q + 1}", o.x + noW - 4 - fm.stringWidth("${q + 1}"), y + cell / 2 + 4)
                for (i in 0 until s.nOpt) {
                    val l = "ABCDE"[i]; val a = s.answers.getOrNull(q); val k = u?.kunci?.getOrNull(q)
                    val x = o.x + noW + i * cell
                    val fill = when { off -> null; a == l && k == null -> Color(0xD1D5DB); a == l && k == l -> C.OK; a == l -> C.BAD; flag && (s.suggest.getOrNull(q) ?: "").contains(l) -> C.WARN; else -> null }
                    val ring = if (!off && k == l && a != l) C.OK else if (off) C.LINE else Color(0x8A94A6)
                    if (fill != null) { g.color = fill; g.fillOval(x + 2, y + 2, cell - 4, cell - 4) }
                    g.color = ring; g.stroke = BasicStroke(if (ring == C.OK) 2f else 1.2f); g.drawOval(x + 2, y + 2, cell - 4, cell - 4)
                    g.color = if (fill != null && fill != Color(0xD1D5DB)) Color.WHITE else if (off) C.LINE else C.TX2
                    g.drawString("$l", x + cell / 2 - fm.stringWidth("$l") / 2, y + cell / 2 + 4)
                }
            }
        }
    }
}

/** tabel batch */
class SheetTable(val sheets: List<Sheet>, val exam: () -> Ujian?, val dup: (Sheet) -> Boolean) : AbstractTableModel() {
    val cols = arrayOf("No", "Halaman", "Nilai", "Cek", "Rekomendasi OCR", "Siswa dipilih", "Status")
    override fun getRowCount() = sheets.size
    override fun getColumnCount() = cols.size
    override fun getColumnName(c: Int) = cols[c]
    override fun getValueAt(r: Int, c: Int): Any {
        val s = sheets[r]; val u = exam()
        return when (c) {
            0 -> s.no
            1 -> s.page.label
            2 -> if (s.state.ordinal >= SheetState.READY.ordinal && s.state != SheetState.FAILED && u != null) s.score(u).let { "${it.first}/${u.jumlah} · ${fmt(it.second)}" } else ""
            3 -> if (u != null && s.state != SheetState.FAILED) s.flagged(u.jumlah).let { if (it.isEmpty()) "" else "! ${it.size}" } else ""
            4 -> s.best?.let { "${(it.skor * 100).toInt()}% ${it.nama} · ${it.kelas}" } ?: s.ocrMsg.takeIf { it.startsWith("Membaca") } ?: ""
            5 -> s.siswa?.let { "${it.nama} · ${it.kelas}" } ?: ""
            else -> when { dup(s) -> "dobel siswa!"; s.state == SheetState.FAILED -> "gagal: " + (s.error ?: ""); s.state == SheetState.READY && s.siswa == null -> "pilih siswa"; else -> s.state.label + if (s.saveMsg.isNotEmpty() && s.state != SheetState.SAVED) " — ${s.saveMsg}" else "" }
        }
    }
    fun fmt(d: Double) = if (d % 1.0 == 0.0) d.toInt().toString() else "%.1f".format(d)
}

class SheetRenderer(private val model: SheetTable) : DefaultTableCellRenderer() {
    override fun getTableCellRendererComponent(t: JTable, v: Any?, sel: Boolean, foc: Boolean, row: Int, col: Int): Component {
        val c = super.getTableCellRendererComponent(t, v, sel, foc, row, col)
        val s = model.sheets.getOrNull(t.convertRowIndexToModel(row)) ?: return c
        val u = model.exam()
        if (!sel) background = when {
            model.dup(s) -> Color(0xFFEDD5)
            s.state == SheetState.FAILED || s.state == SheetState.SAVE_FAILED -> C.BAD_BG
            s.state == SheetState.SAVED -> C.OK_BG
            s.state == SheetState.OFFLINE -> C.INFO_BG
            u != null && s.state == SheetState.READY && s.flagged(u.jumlah).isNotEmpty() && col == 3 -> C.WARN_BG
            else -> Color.WHITE
        }
        foreground = if (sel) t.selectionForeground else if (col == 4) C.TX2 else C.TX
        border = BorderFactory.createEmptyBorder(0, 6, 0, 6)
        return c
    }
}

fun scaled(img: BufferedImage, maxW: Int, maxH: Int): ImageIcon {
    val k = min(1.0, min(maxW.toDouble() / img.width, maxH.toDouble() / img.height))
    return ImageIcon(img.getScaledInstance(max(1, (img.width * k).toInt()), max(1, (img.height * k).toInt()), Image.SCALE_SMOOTH))
}
