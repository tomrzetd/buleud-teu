package id.buleudteu.desktop

import id.buleudteu.ljk.ident.Siswa
import java.awt.*
import java.awt.event.KeyAdapter
import java.awt.event.KeyEvent
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import java.awt.event.WindowAdapter
import java.awt.event.WindowEvent
import java.io.File
import java.util.Base64
import java.util.concurrent.Executors
import javax.imageio.ImageIO
import javax.swing.*
import javax.swing.border.EmptyBorder
import javax.swing.event.DocumentEvent
import javax.swing.event.DocumentListener
import javax.swing.filechooser.FileNameExtensionFilter

object Ui {
    fun launch() {
        System.setProperty("awt.useSystemAAFontSettings", "on"); System.setProperty("swing.aatext", "true")
        SwingUtilities.invokeLater {
            try {
                if (isWindows) UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName())
                else UIManager.getInstalledLookAndFeels().firstOrNull { it.name == "Nimbus" }?.let { UIManager.setLookAndFeel(it.className) }
            } catch (_: Exception) {}
            UIManager.put("Table.rowHeight", 24)
            MainFrame().start()
        }
    }
}

fun bg(task: () -> Unit) = Thread { task() }.apply { isDaemon = true }.start()
fun ui(task: () -> Unit) = if (SwingUtilities.isEventDispatchThread()) task() else SwingUtilities.invokeLater(task)
fun label(t: String, size: Float = 12f, bold: Boolean = false, color: Color = C.TX) = JLabel(t).apply { font = font.deriveFont(if (bold) Font.BOLD else Font.PLAIN, size); foreground = color }
fun onText(f: JTextField, a: () -> Unit) = f.document.addDocumentListener(object : DocumentListener {
    override fun insertUpdate(e: DocumentEvent) = a(); override fun removeUpdate(e: DocumentEvent) = a(); override fun changedUpdate(e: DocumentEvent) = a() })

fun logoImage(dataUrl: String?): Image? = try {
    if (dataUrl.isNullOrEmpty() || !dataUrl.contains(",")) null else ImageIO.read(Base64.getMimeDecoder().decode(dataUrl.substringAfter(",")).inputStream())
} catch (e: Exception) { null }

class MainFrame : JFrame("$APP_NAME $APP_VERSION") {
    private val store = Store()
    private val api = Api(store)
    private val proc = Processor(store, api)
    private var sekolah: Sekolah? = null
    private var guruList: List<String> = emptyList()
    private var data: ExamsData? = null
    private var exam: Ujian? = null
    private val sheets = ArrayList<Sheet>()
    private val procPool = Executors.newFixedThreadPool(maxOf(1, minOf(3, Runtime.getRuntime().availableProcessors() / 2))) { Thread(it).apply { isDaemon = true; priority = Thread.NORM_PRIORITY - 1 } }
    private val ocrPool = Executors.newFixedThreadPool(3) { Thread(it).apply { isDaemon = true } }
    private val netPool = Executors.newSingleThreadExecutor { Thread(it).apply { isDaemon = true } }
    @Volatile private var running: ScanSource? = null

    // ---- komponen
    private val schoolLbl = label("", 15f, true, Color.WHITE); private val guruLbl = label("", 12f, false, Color(0xDBE4F3)); private val logoLbl = JLabel()
    private val examBox = JComboBox<Any>()
    private val srcBox = JComboBox(Scanners.all.toTypedArray())
    private val devBox = JComboBox<ScanDevice>(); private val devRefresh = JButton("Cari")
    private val dpiBox = JComboBox(arrayOf(150, 200, 300)); private val duplexChk = JCheckBox("Duplex (2 sisi)")
    private val folderBtn = JButton("Pilih folder…")
    private val scanBtn = JButton("Mulai scan ADF"); private val importBtn = JButton("Impor berkas / folder")
    private val hintLbl = label("", 11f, false, C.TX2)
    private val model = SheetTable(sheets, { exam }, ::isDup)
    private val table = JTable(model)
    private val evidence = EvidencePanel()
    private val grid = AnswerGrid { refreshRow(current()); updateSummary() }
    private val detailTitle = label("", 14f, true); private val detailScore = label("", 13f, true, C.BLUE); private val detailNotes = label("", 11f, false, C.TX2)
    private val stripsPanel = JPanel(); private val ocrLbl = label("", 11.5f, false, C.TX2); private val recPanel = JPanel(FlowLayout(FlowLayout.LEFT, 4, 2))
    private val search = JTextField(); private val kelasBox = JComboBox<String>(); private val results = JList<Siswa>(); private val pickedLbl = label("Belum dipilih", 12.5f, true, C.BAD)
    private val progress = JProgressBar(); private val statusLbl = label("", 12f, false, C.TX2)
    private val acceptBtn = JButton("Terima rekomendasi ≥ 90%"); private val saveBtn = JButton("Simpan semua yang siap"); private val csvBtn = JButton("Ekspor CSV"); private val reportBtn = JButton("Laporan…"); private val clearBtn = JButton("Kosongkan batch")
    private val footLbl = label("", 11f, false, C.TX2)

    fun start() {
        defaultCloseOperation = DO_NOTHING_ON_CLOSE
        addWindowListener(object : WindowAdapter() { override fun windowClosing(e: WindowEvent) = quit() })
        javaClass.getResource("/icon.png")?.let { iconImage = ImageIO.read(it) }
        contentPane = buildLayout()
        minimumSize = Dimension(1100, 680); size = Dimension(1360, 760); setLocationRelativeTo(null)
        if (store.configJson.isNotEmpty()) runCatching { applyConfig(Json.obj(store.configJson)) }
        if (store.examsJson.isNotEmpty()) runCatching { data = Api.exams(Json.obj(store.examsJson)); fillExams() }
        isVisible = true
        selectSource(Scanners.all.firstOrNull { it.key == store.source && it.available() } ?: Scanners.all.first { it.available() })
        when { store.api.isEmpty() -> setupDialog(); store.token.isEmpty() -> loginDialog(); else -> loadExams() }
        System.getProperty("bt.autotest")?.let { autotest(File(it)) }
    }

    // ================================================================ uji otomatis UI (CI): -Dbt.autotest=<folder hasil>
    private fun autotest(out: File) = bg {
        fun log(m: String) { println("[autotest] $m"); System.out.flush() }
        fun until(what: String, sec: Int, cond: () -> Boolean) { val t = System.currentTimeMillis(); while (!cond()) { if (System.currentTimeMillis() - t > sec * 1000) { log("WAKTU HABIS: $what"); shot(out, "gagal"); System.exit(3) }; Thread.sleep(200) } }
        fun onUi(a: () -> Unit) = SwingUtilities.invokeAndWait(a)
        out.mkdirs()
        until("data ujian", 30) { data != null && examBox.itemCount > 1 }
        onUi { examBox.selectedIndex = 1; selectSource(Scanners.all.first { it is FolderSource }) }
        log("ujian: ${exam?.nama}; sumber: folder ${store.watchDir}")
        onUi { startScan() }
        File(out, "siap_pantau").writeText("1")             // tanda untuk penguji: salin berkas sekarang
        val expect = System.getProperty("bt.expect", "1").toInt()
        until("lembar masuk", 90) { sheets.size >= expect }
        until("proses + OCR", 240) { sheets.all { it.state == SheetState.READY || it.state == SheetState.FAILED } && sheets.filter { it.state == SheetState.READY }.all { it.ocrMsg.isNotEmpty() && !it.ocrMsg.startsWith("Membaca") } }
        onUi { stopScan() }
        until("pantau berhenti", 10) { running == null }
        onUi { table.setRowSelectionInterval(0, 0) }; Thread.sleep(500); shot(out, "1_batch_terbaca")
        onUi { acceptAll() }; Thread.sleep(300)
        val auto = sheets.count { it.siswa != null }
        // sisanya: guru mencari nama (rekomendasi teratas -> lewat kotak cari)
        for (s in sheets.filter { it.state == SheetState.READY && it.siswa == null }) {
            onUi { val r = sheets.indexOf(s); table.setRowSelectionInterval(r, r) }
            val want = (System.getProperty("bt.names")?.let { Json.obj(File(it).readText()) } ?: emptyMap()).s(s.page.label)
            onUi { search.text = want.split(' ').first() }; Thread.sleep(250)
            onUi { (0 until results.model.size).map { results.model.getElementAt(it) }.firstOrNull { it.nama == want }?.let { pick(it) } }
            Thread.sleep(150)
        }
        onUi { table.setRowSelectionInterval(sheets.size - 1, sheets.size - 1) }; Thread.sleep(400); shot(out, "2_siap_simpan")
        onUi { saveAll() }
        until("simpan", 120) { sheets.none { it.state == SheetState.SAVING } && sheets.filter { it.siswa != null }.all { it.state == SheetState.SAVED } }
        Thread.sleep(400); shot(out, "3_tersimpan")
        File(out, "laporan.json").writeText(Json.str(mapOf("lembar" to sheets.size, "otomatisRekomendasi" to auto,
            "hasil" to sheets.map { mapOf("halaman" to it.page.label, "mode" to it.mode, "soal" to it.total, "siswa" to it.siswa?.nama, "kelas" to it.siswa?.kelas, "rekomendasi" to it.best?.nama, "skorOcr" to it.best?.skor, "ocr" to it.ocrRead,
                "jawaban" to it.answers.joinToString("") { a -> (a ?: '-').toString() }, "status" to it.state.name, "simpan" to it.saveMsg) })))
        log("selesai: ${sheets.count { it.state == SheetState.SAVED }}/${sheets.size} tersimpan, $auto dari rekomendasi OCR")
        System.exit(0)
    }
    private fun shot(dir: File, name: String) {
        SwingUtilities.invokeAndWait {
            val img = java.awt.image.BufferedImage(rootPane.width, rootPane.height, java.awt.image.BufferedImage.TYPE_INT_RGB)
            rootPane.paint(img.createGraphics()); ImageIO.write(img, "png", File(dir, "$name.png"))
        }
    }

    // ================================================================ tata letak
    private fun buildLayout(): JComponent {
        val root = JPanel(BorderLayout()); root.background = C.BG
        // kepala
        val head = JPanel(BorderLayout(10, 0)).apply { background = C.BLUE; border = EmptyBorder(8, 12, 8, 12) }
        head.add(JPanel(FlowLayout(FlowLayout.LEFT, 8, 0)).apply { isOpaque = false; add(logoLbl); add(JPanel(GridLayout(2, 1)).apply { isOpaque = false; add(schoolLbl); add(guruLbl) }) }, BorderLayout.WEST)
        head.add(JPanel(FlowLayout(FlowLayout.RIGHT, 6, 0)).apply { isOpaque = false
            add(label("Ujian:", 12f, true, Color.WHITE)); examBox.preferredSize = Dimension(380, 28); add(examBox)
            add(JButton("Muat ulang").apply { addActionListener { loadExams() } })
            add(JButton("Akun").apply { addActionListener { accountMenu(this) } }) }, BorderLayout.EAST)
        examBox.addActionListener { onExamPicked() }
        // baris scanner
        val bar = JPanel(FlowLayout(FlowLayout.LEFT, 6, 6)).apply { background = Color(0xE8EDF5); border = BorderFactory.createMatteBorder(0, 0, 1, 0, C.LINE) }
        srcBox.preferredSize = Dimension(310, 28); devBox.preferredSize = Dimension(250, 28); devRefresh.toolTipText = "Cari ulang scanner"
        bar.add(label("Sumber:", 12f, true)); bar.add(srcBox); bar.add(devBox); bar.add(devRefresh); bar.add(folderBtn)
        bar.add(label("  DPI:")); dpiBox.selectedItem = store.dpi; bar.add(dpiBox); duplexChk.isSelected = store.duplex; duplexChk.isOpaque = false; bar.add(duplexChk)
        scanBtn.font = scanBtn.font.deriveFont(Font.BOLD); bar.add(scanBtn); bar.add(importBtn)
        srcBox.addActionListener { selectSource(srcBox.selectedItem as ScanSource) }
        devRefresh.addActionListener { loadDevices(srcBox.selectedItem as ScanSource) }
        devBox.addActionListener { (devBox.selectedItem as? ScanDevice)?.let { store.device = it.id; duplexChk.isEnabled = it.duplex || srcBox.selectedItem !is WiaSource } }
        dpiBox.addActionListener { store.dpi = dpiBox.selectedItem as Int }; duplexChk.addActionListener { store.duplex = duplexChk.isSelected }
        folderBtn.addActionListener { pickWatchFolder() }
        scanBtn.addActionListener { if (running != null) stopScan() else startScan() }
        importBtn.addActionListener { importFiles() }
        val north = JPanel(BorderLayout()); north.add(head, BorderLayout.NORTH); north.add(bar, BorderLayout.CENTER)
        north.add(JPanel(BorderLayout()).apply { background = Color(0xE8EDF5); border = EmptyBorder(0, 14, 6, 14); add(hintLbl) }, BorderLayout.SOUTH)
        root.add(north, BorderLayout.NORTH)

        // tabel
        table.setDefaultRenderer(Any::class.java, SheetRenderer(model)); table.setDefaultRenderer(Integer::class.java, SheetRenderer(model))
        table.selectionModel.selectionMode = ListSelectionModel.SINGLE_SELECTION; table.fillsViewportHeight = true; table.autoCreateRowSorter = false
        intArrayOf(26, 100, 96, 30, 158, 140, 86).forEachIndexed { i, w -> table.columnModel.getColumn(i).preferredWidth = w }
        table.selectionModel.addListSelectionListener { if (!it.valueIsAdjusting) showDetail() }
        table.inputMap.put(KeyStroke.getKeyStroke(KeyEvent.VK_DELETE, 0), "hapus"); table.actionMap.put("hapus", object : AbstractAction() { override fun actionPerformed(e: java.awt.event.ActionEvent) = removeCurrent() })
        val tableBox = JPanel(BorderLayout()).apply { border = EmptyBorder(8, 8, 8, 4); isOpaque = false
            add(JScrollPane(table), BorderLayout.CENTER)
            add(label("Tips: ↑/↓ pindah lembar · ketik nama di kotak cari lalu Enter · Delete = buang lembar · klik kanan gambar = nilai kegelapan", 10.5f, false, C.TX2).apply { border = EmptyBorder(4, 2, 0, 0) }, BorderLayout.SOUTH) }

        // detail
        val detail = JPanel(BorderLayout(0, 6)).apply { border = EmptyBorder(8, 4, 8, 8); isOpaque = false }
        detail.add(JPanel(BorderLayout()).apply { isOpaque = false; add(detailTitle, BorderLayout.WEST); add(detailScore, BorderLayout.EAST); add(detailNotes, BorderLayout.SOUTH) }, BorderLayout.NORTH)
        val gridScroll = JScrollPane(grid).apply { border = BorderFactory.createLineBorder(C.LINE); verticalScrollBar.unitIncrement = 16; horizontalScrollBarPolicy = JScrollPane.HORIZONTAL_SCROLLBAR_NEVER }
        val top = JSplitPane(JSplitPane.HORIZONTAL_SPLIT, evidence, gridScroll).apply { resizeWeight = 0.5; dividerLocation = 330; border = null }
        detail.add(top, BorderLayout.CENTER)
        detail.add(identityPanel(), BorderLayout.SOUTH)
        val split = JSplitPane(JSplitPane.HORIZONTAL_SPLIT, tableBox, detail).apply { resizeWeight = 0.45; dividerLocation = 630; border = null }
        root.add(split, BorderLayout.CENTER)

        // bawah
        val bottom = JPanel(BorderLayout()).apply { background = Color.WHITE; border = BorderFactory.createCompoundBorder(BorderFactory.createMatteBorder(1, 0, 0, 0, C.LINE), EmptyBorder(6, 10, 4, 10)) }
        progress.isStringPainted = true; progress.preferredSize = Dimension(260, 20); progress.isVisible = false
        bottom.add(JPanel(FlowLayout(FlowLayout.LEFT, 8, 0)).apply { isOpaque = false; add(progress); add(statusLbl) }, BorderLayout.WEST)
        saveBtn.font = saveBtn.font.deriveFont(Font.BOLD)
        bottom.add(JPanel(FlowLayout(FlowLayout.RIGHT, 6, 0)).apply { isOpaque = false; add(clearBtn); add(csvBtn); add(reportBtn); add(acceptBtn); add(saveBtn) }, BorderLayout.EAST)
        bottom.add(footLbl.apply { horizontalAlignment = SwingConstants.CENTER; border = EmptyBorder(6, 0, 0, 0) }, BorderLayout.SOUTH)
        acceptBtn.addActionListener { acceptAll() }; saveBtn.addActionListener { saveAll() }; csvBtn.addActionListener { exportCsv() }; reportBtn.addActionListener { reportDialog() }; clearBtn.addActionListener { clearBatch() }
        root.add(bottom, BorderLayout.SOUTH)
        updateSummary(); renderFooter()
        return root
    }

    private fun identityPanel(): JComponent {
        val p = JPanel(BorderLayout(8, 4)).apply { background = Color.WHITE; border = BorderFactory.createCompoundBorder(BorderFactory.createLineBorder(C.LINE), EmptyBorder(6, 8, 6, 8)); preferredSize = Dimension(10, 250) }
        stripsPanel.layout = BoxLayout(stripsPanel, BoxLayout.Y_AXIS); stripsPanel.isOpaque = false
        val left = JPanel(BorderLayout(0, 4)).apply { isOpaque = false; preferredSize = Dimension(330, 10)
            add(label("Identitas di LJK (OCR = rekomendasi saja)", 12f, true), BorderLayout.NORTH)
            add(JScrollPane(stripsPanel).apply { border = null; preferredSize = Dimension(330, 110) }, BorderLayout.CENTER)
            add(JPanel(BorderLayout()).apply { isOpaque = false; add(ocrLbl, BorderLayout.NORTH); add(recPanel.apply { isOpaque = false }, BorderLayout.CENTER) }, BorderLayout.SOUTH) }
        val right = JPanel(BorderLayout(0, 4)).apply { isOpaque = false
            add(JPanel(BorderLayout(4, 0)).apply { isOpaque = false; add(label("Cari siswa:"), BorderLayout.WEST); add(search, BorderLayout.CENTER); kelasBox.preferredSize = Dimension(90, 26); add(kelasBox, BorderLayout.EAST) }, BorderLayout.NORTH)
            add(JScrollPane(results), BorderLayout.CENTER)
            add(JPanel(BorderLayout()).apply { isOpaque = false; add(pickedLbl, BorderLayout.CENTER); add(JButton("Hapus pilihan").apply { addActionListener { current()?.let { it.siswa = null; refreshRow(it); showIdentity(it) } } }, BorderLayout.EAST) }, BorderLayout.SOUTH) }
        results.cellRenderer = object : DefaultListCellRenderer() { override fun getListCellRendererComponent(l: JList<*>, v: Any?, i: Int, s: Boolean, f: Boolean): Component =
            super.getListCellRendererComponent(l, (v as? Siswa)?.let { st -> "${st.nama}   ·   ${st.kelas}" + (if (exam?.terscan?.contains("${st.kelas}|${st.nama}") == true) "   (sudah discan)" else "") + (if (sheets.any { it.siswa == st && it !== current() }) "   (di batch ini)" else "") } ?: v, i, s, f) }
        onText(search) { refreshResults() }; kelasBox.addActionListener { refreshResults() }
        search.addKeyListener(object : KeyAdapter() { override fun keyPressed(e: KeyEvent) {
            when (e.keyCode) { KeyEvent.VK_ENTER -> (results.selectedValue ?: results.model.takeIf { it.size > 0 }?.getElementAt(0))?.let { pick(it) }
                KeyEvent.VK_DOWN -> { results.requestFocus(); if (results.selectedIndex < 0 && results.model.size > 0) results.selectedIndex = 0 } }
        } })
        results.addMouseListener(object : MouseAdapter() { override fun mouseClicked(e: MouseEvent) { if (e.clickCount == 2) results.selectedValue?.let { pick(it) } } })
        results.addKeyListener(object : KeyAdapter() { override fun keyPressed(e: KeyEvent) { if (e.keyCode == KeyEvent.VK_ENTER) results.selectedValue?.let { pick(it) } } })
        p.add(left, BorderLayout.WEST); p.add(right, BorderLayout.CENTER)
        return p
    }

    // ================================================================ akun & data
    private fun applyConfig(c: Map<String, Any?>) {
        sekolah = Api.sekolah(c); guruList = Api.guruList(c)
        schoolLbl.text = sekolah?.nama?.ifEmpty { null } ?: APP_NAME
        logoLbl.icon = logoImage(sekolah?.logo)?.let { ImageIcon(it.getScaledInstance(38, 38, Image.SCALE_SMOOTH)) }
        renderFooter()
    }
    private fun renderFooter() {
        val sk = sekolah
        footLbl.text = listOfNotNull(sk?.nama?.ifEmpty { null }, sk?.tahun?.ifEmpty { null }?.let { "Tahun Pelajaran $it" }, "Buleud Teu • \"Mun buleud, ku urang dipariksa!\"", WATERMARK).joinToString("   ·   ")
        guruLbl.text = if (store.guru.isNotEmpty()) "${store.guru}${if (sk?.tahun?.isNotEmpty() == true) " · TP ${sk.tahun}" else ""}" else "Belum masuk"
    }
    private fun accountMenu(c: JComponent) {
        JPopupMenu().apply {
            add(JMenuItem("Ganti server (URL Apps Script)…").apply { addActionListener { setupDialog() } })
            add(JMenuItem("Masuk sebagai guru lain…").apply { addActionListener { store.token = ""; loginDialog() } })
            add(JMenuItem("Pengaturan engine & OCR…").apply { addActionListener { settingsDialog() } })
            addSeparator(); add(JMenuItem("Tentang").apply { addActionListener { JOptionPane.showMessageDialog(this@MainFrame, "$APP_NAME $APP_VERSION\nPemindai LJK massal (ADF) untuk Google Sheets.\n\n$WATERMARK", "Tentang", JOptionPane.INFORMATION_MESSAGE) } })
        }.show(c, 0, c.height)
    }

    private fun setupDialog() {
        val f = JTextField(store.api, 46)
        val msg = JPanel(BorderLayout(0, 6)).apply { add(label("Tempel URL Web App Apps Script sekolah (…/exec):", 12f, true), BorderLayout.NORTH); add(f, BorderLayout.CENTER)
            add(label("<html>Didapat operator sekolah dari Apps Script → Deploy → Web app (akses: Siapa saja).</html>", 11f, false, C.TX2), BorderLayout.SOUTH) }
        while (true) {
            if (JOptionPane.showConfirmDialog(this, msg, "Hubungkan ke spreadsheet sekolah", JOptionPane.OK_CANCEL_OPTION, JOptionPane.PLAIN_MESSAGE) != JOptionPane.OK_OPTION) { if (store.api.isEmpty()) quit(); return }
            val u = f.text.trim()
            if (!Regex("^https://script\\.google\\.com/macros/s/[^/]+/exec$").matches(u)) { JOptionPane.showMessageDialog(this, "URL harus berbentuk https://script.google.com/macros/s/…/exec"); continue }
            val err = busy("Menghubungi server sekolah…") { val c = api.get("config", u); if (c.s("version") != "V40") throw ApiException("Apps Script masih versi lama. Pasang kode Buleud Teu V40."); store.api = u; store.configJson = Json.str(c); ui { applyConfig(c) } }
            if (err == null) { store.token = ""; loginDialog(); return }
            JOptionPane.showMessageDialog(this, err, "Gagal terhubung", JOptionPane.ERROR_MESSAGE)
        }
    }
    private fun loginDialog() {
        val g = JComboBox(guruList.toTypedArray()).apply { isEditable = guruList.isEmpty(); selectedItem = store.guru.ifEmpty { guruList.firstOrNull() } }
        val pin = JPasswordField(6)
        val msg = JPanel(GridBagLayout()); val gc = GridBagConstraints().apply { insets = Insets(4, 4, 4, 4); anchor = GridBagConstraints.WEST; fill = GridBagConstraints.HORIZONTAL }
        gc.gridx = 0; gc.gridy = 0; msg.add(label("Nama guru:"), gc); gc.gridx = 1; msg.add(g, gc)
        gc.gridx = 0; gc.gridy = 1; msg.add(label("PIN 4 digit:"), gc); gc.gridx = 1; msg.add(pin, gc)
        gc.gridx = 0; gc.gridy = 2; gc.gridwidth = 2; msg.add(label(sekolah?.nama ?: "", 11f, false, C.TX2), gc)
        while (true) {
            SwingUtilities.invokeLater { pin.requestFocusInWindow() }
            if (JOptionPane.showConfirmDialog(this, msg, "Masuk — ${sekolah?.nama ?: APP_NAME}", JOptionPane.OK_CANCEL_OPTION, JOptionPane.PLAIN_MESSAGE) != JOptionPane.OK_OPTION) { if (store.token.isEmpty()) quit(); return }
            val guru = g.selectedItem?.toString() ?: ""; val p = String(pin.password)
            val err = busy("Masuk…") { val r = api.post(mapOf("action" to "login", "guru" to guru, "pin" to p, "token" to "")); store.token = r.s("token"); store.guru = guru }
            if (err == null) { renderFooter(); loadExams(); return }
            JOptionPane.showMessageDialog(this, err, "Gagal masuk", JOptionPane.ERROR_MESSAGE); pin.text = ""
        }
    }
    private fun settingsDialog() {
        val sens = JSlider(20, 80, store.sensitivity.toInt()); val con = JSlider(0, 30, store.contrast.toInt()); val ocr = JCheckBox("Baca identitas dengan OCR Google (rekomendasi)", store.ocr)
        val p = JPanel(GridLayout(0, 1, 0, 4)).apply { add(label("Sensitivitas isian (bawaan 50):")); add(sens); add(label("Kontras ambang (bawaan 10):")); add(con); add(ocr) }
        if (JOptionPane.showConfirmDialog(this, p, "Pengaturan", JOptionPane.OK_CANCEL_OPTION, JOptionPane.PLAIN_MESSAGE) == JOptionPane.OK_OPTION) { store.sensitivity = sens.value.toDouble(); store.contrast = con.value.toDouble(); store.ocr = ocr.isSelected }
    }

    /** jalankan tugas jaringan dengan dialog progres modal; kembalikan pesan galat atau null */
    private fun busy(msg: String, task: () -> Unit): String? {
        var err: String? = null
        val d = JDialog(this, APP_NAME, true).apply { add(JPanel(BorderLayout(0, 8)).apply { border = EmptyBorder(16, 20, 16, 20); add(label(msg, 13f, true), BorderLayout.NORTH); add(JProgressBar().apply { isIndeterminate = true; preferredSize = Dimension(320, 16) }, BorderLayout.CENTER) }); pack(); setLocationRelativeTo(this@MainFrame); defaultCloseOperation = JDialog.DO_NOTHING_ON_CLOSE }
        bg { try { task() } catch (e: ApiException) { err = e.message; if (e.auth) store.token = "" } catch (e: Exception) { err = if (isNetwork(e)) "Tidak bisa dihubungi. Cek internet & akses Web App \"Siapa saja\"." else (e.message ?: "Gagal") }; ui { d.dispose() } }
        d.isVisible = true
        return err
    }

    private fun loadExams() {
        if (store.token.isEmpty()) return
        status("Memuat data ujian & siswa dari spreadsheet…", true)
        bg {
            try {
                val j = api.post(mapOf("action" to "exams")); store.examsJson = Json.str(j); val d = Api.exams(j)
                ui { data = d; fillExams(); status("Data dimuat: ${d.ujian.size} ujian, ${d.siswa.size} siswa.") }
                flushQueue()
                runCatching { api.get("config") }.onSuccess { c -> store.configJson = Json.str(c); ui { applyConfig(c) } }
            } catch (e: ApiException) { ui { status(e.message ?: "Gagal"); if (e.auth) { store.token = ""; loginDialog() } } }
            catch (e: Exception) { ui { status(if (isNetwork(e)) "Offline — memakai data tersimpan terakhir." else (e.message ?: "Gagal")) } }
        }
    }
    private var fillingExams = false
    private fun fillExams() {
        fillingExams = true
        val prev = exam?.id; examBox.removeAllItems(); examBox.addItem("— pilih ujian —")
        data?.ujian?.forEach { examBox.addItem(it) }
        data?.ujian?.firstOrNull { it.id == prev }?.let { examBox.selectedItem = it; exam = it }
        fillingExams = false
        if (exam == null) examBox.selectedIndex = 0
        onExamPicked(); renderFooter()
    }
    private fun onExamPicked() {
        if (fillingExams) return
        val u = examBox.selectedItem as? Ujian
        if (u?.id != exam?.id && sheets.any { it.state != SheetState.SAVED }) {
            if (JOptionPane.showConfirmDialog(this, "Batch berisi lembar yang belum disimpan untuk ujian \"${exam?.nama}\".\nGanti ujian dan kosongkan batch?", "Ganti ujian", JOptionPane.YES_NO_OPTION) != JOptionPane.YES_OPTION) {
                fillingExams = true; examBox.selectedItem = exam ?: examBox.getItemAt(0); fillingExams = false; return }
        }
        if (u?.id != exam?.id) { sheets.clear(); model.fireTableDataChanged() }
        exam = u
        val ks = studentsOf(data, u).map { it.kelas }.distinct().sorted()
        kelasBox.removeAllItems(); kelasBox.addItem(""); ks.forEach { kelasBox.addItem(it) }
        scanBtn.isEnabled = u != null || running != null; importBtn.isEnabled = u != null
        hint(); showDetail(); updateSummary()
    }

    // ================================================================ scanner
    private fun selectSource(s: ScanSource) {
        if (srcBox.selectedItem !== s) srcBox.selectedItem = s
        store.source = s.key
        val folder = s is FolderSource
        devBox.isVisible = !folder; devRefresh.isVisible = !folder; folderBtn.isVisible = folder
        dpiBox.isEnabled = !folder; duplexChk.isEnabled = !folder
        if (folder) { (s as FolderSource).folder = store.watchDir.ifEmpty { null }?.let { File(it) }; folderBtn.text = s.folder?.let { "Folder: " + it.name } ?: "Pilih folder…" }
        scanBtn.text = if (folder) "Mulai pantau folder" else "Mulai scan ADF"
        hint()
        if (!folder && s.available()) loadDevices(s) else devBox.removeAllItems()
    }
    private fun hint() {
        val s = srcBox.selectedItem as? ScanSource ?: return
        hintLbl.text = "<html>" + (if (exam == null) "<b>Pilih ujian dulu.</b> " else "") + (if (!s.available()) "<b>Belum tersedia:</b> " else "") + s.hint() +
            (if (exam != null) " &nbsp;·&nbsp; <b>Kertas F4 (330 mm)</b>, ${if (exam!!.opsi == "ABCD" && exam!!.jumlah <= 25) "LJK bermarker atau LJK lama ${if (exam!!.jumlah > 20) "25" else "20/25"} soal" else "LJK bermarker"}, ${store.dpi} dpi berwarna." else "") + "</html>"
    }
    private fun loadDevices(s: ScanSource) {
        devBox.removeAllItems(); devBox.addItem(ScanDevice("", "Mencari scanner…")); devBox.isEnabled = false
        bg {
            val r = runCatching { s.devices() }
            ui {
                devBox.removeAllItems(); devBox.isEnabled = true
                r.onSuccess { l -> if (l.isEmpty()) devBox.addItem(ScanDevice("", "Tidak ada scanner ditemukan")) else { l.forEach { devBox.addItem(it) }; l.firstOrNull { it.id == store.device }?.let { devBox.selectedItem = it } } }
                r.onFailure { devBox.addItem(ScanDevice("", "Galat: ${it.message}")) }
            }
        }
    }
    private fun pickWatchFolder() {
        val fc = JFileChooser(store.watchDir.ifEmpty { System.getProperty("user.home") }).apply { fileSelectionMode = JFileChooser.DIRECTORIES_ONLY; dialogTitle = "Folder tujuan simpan software scanner" }
        if (fc.showOpenDialog(this) == JFileChooser.APPROVE_OPTION) { store.watchDir = fc.selectedFile.absolutePath; selectSource(srcBox.selectedItem as ScanSource) }
    }

    private fun startScan() {
        val u = exam ?: return
        val s = srcBox.selectedItem as ScanSource
        if (!s.available()) { JOptionPane.showMessageDialog(this, s.hint(), s.title, JOptionPane.INFORMATION_MESSAGE); return }
        if (s is FolderSource && s.folder == null) { pickWatchFolder(); if (s.folder == null) return }
        val dev = (devBox.selectedItem as? ScanDevice)?.takeIf { it.id.isNotEmpty() }
        if (s !is FolderSource && dev == null && s !is SaneSource) { JOptionPane.showMessageDialog(this, "Scanner belum ditemukan. Nyalakan scanner lalu tekan Cari.", "Scanner", JOptionPane.WARNING_MESSAGE); return }
        val out = File(store.dir, "pindaian/" + java.time.LocalDateTime.now().toString().replace(':', '-').take(19)); out.mkdirs()
        val opt = ScanOptions(store.dpi, duplexChk.isSelected && duplexChk.isEnabled)
        running = s; scanBtn.text = "Berhenti"; scanBtn.isEnabled = true; importBtn.isEnabled = false; srcBox.isEnabled = false
        val before = sheets.size
        status(if (s is FolderSource) "Memantau folder… tekan tombol scan di scanner / software scanner." else "Memindai dari ADF… (${s.title})", true)
        bg {
            val err = try { s.scan(dev, opt, out, { f -> ui { addFiles(listOf(f), u) } }, { m -> ui { status(m, true) } }); null } catch (e: Exception) { e.message ?: "Gagal memindai" }
            ui {
                running = null; srcBox.isEnabled = true; importBtn.isEnabled = true; selectSource(s); scanBtn.isEnabled = exam != null
                val n = sheets.size - before
                if (err != null && !s.cancelled) { status("Pemindaian berhenti: $err"); JOptionPane.showMessageDialog(this, err, "Pemindaian", JOptionPane.WARNING_MESSAGE) }
                else status("Pemindaian selesai: $n lembar masuk batch.")
            }
        }
    }
    private fun stopScan() { running?.cancel(); status("Menghentikan…") }

    private fun importFiles() {
        val u = exam ?: return
        val fc = JFileChooser(store.watchDir.ifEmpty { System.getProperty("user.home") }).apply {
            isMultiSelectionEnabled = true; fileSelectionMode = JFileChooser.FILES_AND_DIRECTORIES; dialogTitle = "Pilih hasil scan (JPG / PNG / TIFF / PDF) atau satu folder"
            fileFilter = FileNameExtensionFilter("Hasil scan (jpg, png, tif, pdf, bmp)", *Imaging.EXT.toTypedArray()) }
        if (fc.showOpenDialog(this) != JFileChooser.APPROVE_OPTION) return
        val files = fc.selectedFiles.flatMap { f -> if (f.isDirectory) (f.listFiles() ?: emptyArray()).filter { Imaging.supported(it) }.sortedBy { it.name } else listOf(f) }
        if (files.any { it.extension.equals("pdf", true) } && !Pdf.available) { JOptionPane.showMessageDialog(this, "Dukungan PDF tidak tersedia di instalasi ini. Simpan hasil scan sebagai JPG/PNG/TIFF.", "PDF", JOptionPane.WARNING_MESSAGE) }
        addFiles(files.filter { !it.extension.equals("pdf", true) || Pdf.available }, u)
    }

    // ================================================================ batch
    private fun addFiles(files: List<File>, u: Ujian) {
        for (f in files) {
            val pages = try { Imaging.pages(f) } catch (e: Exception) { listOf(Page(f, 0, 1)) }
            for (p in pages) {
                val s = Sheet(p, (sheets.maxOfOrNull { it.no } ?: 0) + 1); sheets.add(s); val row = sheets.size - 1
                model.fireTableRowsInserted(row, row)
                procPool.submit {
                    proc.process(s, u); ui { refreshRow(s); if (current() === s) showDetail(); updateSummary() }
                    if (s.state == SheetState.READY) ocrPool.submit { proc.identify(s, studentsOf(data, u)); ui { refreshRow(s); if (current() === s) showIdentity(s); updateSummary() } }
                }
                if (table.selectedRow < 0) table.setRowSelectionInterval(row, row)
            }
        }
        updateSummary()
    }
    private fun current(): Sheet? = table.selectedRow.takeIf { it >= 0 }?.let { sheets.getOrNull(it) }
    private fun refreshRow(s: Sheet?) { val i = sheets.indexOf(s); if (i >= 0) model.fireTableRowsUpdated(i, i) }
    private fun isDup(s: Sheet): Boolean { val st = s.siswa ?: return false; return sheets.count { it.siswa == st && it.state != SheetState.FAILED } > 1 }

    private fun showDetail() {
        val s = current(); val u = exam
        evidence.sheet = s; evidence.exam = u; evidence.repaint()
        grid.sheet = s?.takeIf { it.state != SheetState.FAILED && it.preview != null }; grid.exam = u; grid.revalidate(); grid.repaint()
        if (s == null) { detailTitle.text = if (sheets.isEmpty()) "Belum ada lembar — mulai scan ADF atau impor berkas" else ""; detailScore.text = ""; detailNotes.text = ""; showIdentity(null); return }
        detailTitle.text = "#${s.no}  ${s.page.label}"
        detailScore.text = if (u != null && s.preview != null) s.score(u).let { "${it.first}/${u.jumlah} benar · nilai ${model.fmt(it.second)}" } else ""
        val fl = if (u != null) s.flagged(u.jumlah) else emptyList()
        detailNotes.text = "<html>" + listOfNotNull(
            if (s.mode.isNotEmpty()) (if (s.mode == "marker") "LJK bermarker F4" else "LJK lama ${s.total} soal (tanpa marker)") + " · kualitas ${s.quality} · ${s.procMs} ms" else null,
            fl.takeIf { it.isNotEmpty() }?.let { "<font color='#b45309'><b>Perlu dicek: nomor ${it.joinToString(", ")}</b> (kuning). Klik bulatan untuk mengoreksi.</font>" },
            s.error?.let { "<font color='#b91c1c'>$it</font>" }, s.warnings.takeIf { it.isNotEmpty() }?.joinToString(" · ")).joinToString("<br>") + "</html>"
        showIdentity(s)
    }
    private fun showIdentity(s: Sheet?) {
        stripsPanel.removeAll(); recPanel.removeAll()
        if (s == null) { ocrLbl.text = ""; pickedLbl.text = ""; stripsPanel.revalidate(); stripsPanel.repaint(); recPanel.revalidate(); recPanel.repaint(); refreshResults(); return }
        s.strips.forEach { (k, img) -> stripsPanel.add(JLabel(scaled(img, 320, if (k == "identitas") 130 else 34)).apply { toolTipText = k; border = EmptyBorder(1, 0, 1, 0) }) }
        ocrLbl.text = s.ocrMsg
        s.match?.alternatives?.take(3)?.forEach { a ->
            val st = studentsOf(data, exam).firstOrNull { it.nama == a.nama && it.kelas == a.kelas } ?: return@forEach
            recPanel.add(JButton("${a.nama} · ${a.kelas}  ${(a.skor * 100).toInt()}%").apply { font = font.deriveFont(11f); margin = Insets(1, 6, 1, 6); addActionListener { pick(st) } })
        }
        pickedLbl.text = s.siswa?.let { "Dipilih: ${it.nama} · ${it.kelas}" + if (isDup(s)) "  — DOBEL di batch!" else "" } ?: "Belum dipilih — cari nama atau ketuk rekomendasi"
        pickedLbl.foreground = if (s.siswa == null || isDup(s)) C.BAD else C.OK
        stripsPanel.revalidate(); stripsPanel.repaint(); recPanel.revalidate(); recPanel.repaint()
        refreshResults()
    }
    private fun refreshResults() {
        val list = searchStudents(studentsOf(data, exam), search.text, kelasBox.selectedItem as? String ?: "")
        results.setListData(list.toTypedArray()); if (list.isNotEmpty()) results.selectedIndex = 0
    }
    private fun pick(st: Siswa) {
        val s = current() ?: return
        if (s.state == SheetState.SAVED) { if (JOptionPane.showConfirmDialog(this, "Lembar ini sudah tersimpan. Ganti siswa dan simpan ulang nanti?", "Ganti siswa", JOptionPane.YES_NO_OPTION) != JOptionPane.YES_OPTION) return; s.state = SheetState.READY }
        s.siswa = st; search.text = ""; refreshRow(s); sheets.filter { it.siswa == st }.forEach { refreshRow(it) }
        showIdentity(s); updateSummary()
        // lanjut ke lembar berikutnya yang belum punya siswa
        val i = sheets.indexOf(s); val next = (sheets.drop(i + 1) + sheets.take(i)).firstOrNull { it.state == SheetState.READY && it.siswa == null }
        if (next != null) { val r = sheets.indexOf(next); table.setRowSelectionInterval(r, r); table.scrollRectToVisible(table.getCellRect(r, 0, true)) }
        search.requestFocusInWindow()
    }
    private fun removeCurrent() {
        val s = current() ?: return; val i = sheets.indexOf(s)
        if (s.state == SheetState.PROCESSING || s.state == SheetState.SAVING) return
        sheets.removeAt(i); model.fireTableRowsDeleted(i, i)
        if (sheets.isNotEmpty()) table.setRowSelectionInterval(minOf(i, sheets.size - 1), minOf(i, sheets.size - 1)); updateSummary()
    }
    private fun clearBatch() {
        if (sheets.any { it.state == SheetState.READY } && JOptionPane.showConfirmDialog(this, "Masih ada lembar yang belum disimpan. Kosongkan batch?", "Kosongkan", JOptionPane.YES_NO_OPTION) != JOptionPane.YES_OPTION) return
        sheets.removeAll { it.state != SheetState.PROCESSING && it.state != SheetState.QUEUED && it.state != SheetState.SAVING }; model.fireTableDataChanged(); showDetail(); updateSummary()
    }
    private fun acceptAll() {
        var n = 0; val taken = sheets.mapNotNull { it.siswa }.toMutableSet()
        for (s in sheets) {
            if (s.state != SheetState.READY || s.siswa != null) continue
            val b = s.best ?: continue
            if (b.skor < 0.9) continue
            val st = studentsOf(data, exam).firstOrNull { it.nama == b.nama && it.kelas == b.kelas } ?: continue
            if (st in taken) continue
            s.siswa = st; taken += st; n++
        }
        model.fireTableDataChanged(); showDetail(); updateSummary()
        status("$n rekomendasi diterima. Periksa sekilas nama di tabel sebelum menyimpan.")
    }

    private fun updateSummary() {
        val u = exam
        val ready = sheets.count { it.state == SheetState.READY && it.siswa != null && !isDup(it) }
        val noStudent = sheets.count { it.state == SheetState.READY && it.siswa == null }
        val failed = sheets.count { it.state == SheetState.FAILED }; val saved = sheets.count { it.state == SheetState.SAVED }
        val pending = sheets.count { it.state == SheetState.QUEUED || it.state == SheetState.PROCESSING }
        saveBtn.text = "Simpan semua yang siap ($ready)"; saveBtn.isEnabled = ready > 0 && u != null
        acceptBtn.isEnabled = sheets.any { it.state == SheetState.READY && it.siswa == null && (it.best?.skor ?: 0.0) >= 0.9 }
        csvBtn.isEnabled = sheets.isNotEmpty(); clearBtn.isEnabled = sheets.isNotEmpty(); reportBtn.isEnabled = u != null
        if (running == null && !progress.isIndeterminate) {
            progress.isVisible = pending > 0; progress.maximum = maxOf(1, sheets.size); progress.value = sheets.size - pending; progress.string = "Memproses ${sheets.size - pending}/${sheets.size}"
        }
        if (sheets.isNotEmpty() && pending == 0 && running == null && statusLbl.text.isEmpty()) status("")
        title = "$APP_NAME — ${u?.nama ?: "pilih ujian"}" + if (sheets.isNotEmpty()) " · ${sheets.size} lembar (siap $ready · tanpa siswa $noStudent · gagal $failed · tersimpan $saved)" else ""
    }
    private fun status(m: String, spin: Boolean = false) {
        statusLbl.text = m
        if (spin) { progress.isVisible = true; progress.isIndeterminate = true; progress.string = "" } else { progress.isIndeterminate = false; progress.isVisible = false }
        if (!spin) updateSummary()
    }

    // ================================================================ simpan
    private fun saveAll() {
        val u = exam ?: return
        val todo = sheets.filter { (it.state == SheetState.READY || it.state == SheetState.SAVE_FAILED) && it.siswa != null && !isDup(it) }
        if (todo.isEmpty()) return
        val flagged = todo.filter { it.flagged(u.jumlah).isNotEmpty() }
        if (flagged.isNotEmpty() && JOptionPane.showConfirmDialog(this, "${flagged.size} lembar masih punya nomor kuning (perlu dicek):\n" + flagged.take(8).joinToString("\n") { "  #${it.no} ${it.siswa!!.nama}: nomor ${it.flagged(u.jumlah).joinToString(", ")}" } + "\n\nTetap simpan semua?", "Konfirmasi", JOptionPane.YES_NO_OPTION, JOptionPane.WARNING_MESSAGE) != JOptionPane.YES_OPTION) return
        val again = todo.filter { u.terscan.contains("${it.siswa!!.kelas}|${it.siswa!!.nama}") }
        if (again.isNotEmpty() && JOptionPane.showConfirmDialog(this, "${again.size} siswa sudah pernah discan untuk ujian ini; hasil baru akan MENGGANTIKAN yang lama:\n" + again.take(8).joinToString("\n") { "  ${it.siswa!!.nama} (${it.siswa!!.kelas})" } + "\n\nLanjutkan?", "Konfirmasi", JOptionPane.YES_NO_OPTION) != JOptionPane.YES_OPTION) return
        todo.forEach { it.state = SheetState.SAVING; refreshRow(it) }
        progress.isVisible = true; progress.isIndeterminate = false; progress.maximum = todo.size; progress.value = 0; progress.string = "Menyimpan 0/${todo.size}"
        statusLbl.text = "Menyimpan hasil ke spreadsheet…"; saveBtn.isEnabled = false
        val students = studentsOf(data, u)
        netPool.submit {
            var ok = 0; var off = 0; var bad = 0
            todo.forEachIndexed { i, s ->
                val body = proc.body(s, u, students)
                try { val r = api.post(body); s.state = SheetState.SAVED; s.saveMsg = "${r.d("benar").toInt()}/${r.d("jumlah").toInt()} = ${r.s("skor")}"; ok++; u.terscan += "${s.siswa!!.kelas}|${s.siswa!!.nama}" }
                catch (e: Exception) {
                    if (isNetwork(e)) {
                        val ok = runCatching { store.enqueue(LinkedHashMap(body).apply { remove("token") }) }.isSuccess
                        if (ok) { s.state = SheetState.OFFLINE; s.saveMsg = "dikirim otomatis saat online"; off++ } else { s.state = SheetState.SAVE_FAILED; s.saveMsg = "offline & antrean disk gagal ditulis"; bad++ }
                    }
                    else { s.state = SheetState.SAVE_FAILED; s.saveMsg = e.message ?: "gagal"; bad++; if (e is ApiException && e.auth) store.token = "" }
                }
                ui { refreshRow(s); progress.value = i + 1; progress.string = "Menyimpan ${i + 1}/${todo.size}" }
            }
            ui {
                progress.isVisible = false
                status("Simpan selesai: $ok tersimpan" + (if (off > 0) ", $off masuk antrean offline" else "") + if (bad > 0) ", $bad gagal (lihat kolom Status)" else "")
                if (store.token.isEmpty()) loginDialog()
            }
        }
    }
    private fun flushQueue() {
        val q = store.queue(); if (q.isEmpty()) return
        val rest = ArrayList<Map<String, Any?>>(); val ditolak = ArrayList<String>()
        for (b in q) try { api.post(LinkedHashMap(b).apply { put("token", store.token) }) } catch (e: Exception) {
            // jaringan / sesi -> tetap di antrean; DITOLAK server -> keluarkan & laporkan (tidak dicoba ulang selamanya)
            if (isNetwork(e) || (e is ApiException && e.auth)) rest += b else ditolak += "${b.o("siswa").s("nama")}: ${e.message}"
        }
        store.setQueue(rest)
        ui {
            status("${q.size - rest.size - ditolak.size} hasil antrean offline terkirim" + (if (rest.isNotEmpty()) " (${rest.size} masih menunggu)" else "") + if (ditolak.isNotEmpty()) ", ${ditolak.size} ditolak server" else "")
            if (ditolak.isNotEmpty()) JOptionPane.showMessageDialog(this, "Hasil antrean DITOLAK server (tidak disimpan):\n\n" + ditolak.joinToString("\n") + "\n\nScan ulang lembar tersebut setelah data diperbaiki.", "Antrean", JOptionPane.WARNING_MESSAGE)
        }
    }

    // ================================================================ laporan (dibuat Apps Script: PDF F4 / Excel / Google Sheet)
    private val repBagian = listOf("identitas" to "Identitas ujian & kop sekolah", "nilai" to "Daftar nilai (benar & skor)", "jawaban" to "Pilihan jawaban siswa per nomor",
        "rekap" to "Rekap nilai & ketuntasan", "statistik" to "Ringkasan statistik tes (KR-20, SEM)", "butir" to "Analisis butir soal + rekomendasi",
        "pengecoh" to "Sebaran jawaban & pengecoh", "matriks" to "Matriks benar/salah (0/1)", "ttd" to "Tanda tangan guru & kepala sekolah")
    private val repMode = mapOf("simpel" to setOf("identitas", "nilai", "jawaban", "rekap", "ttd"), "lengkap" to repBagian.map { it.first }.toSet())
    private fun reportDialog() {
        val u = exam ?: return
        if (sheets.any { it.state == SheetState.READY && it.siswa != null }) JOptionPane.showMessageDialog(this, "Laporan dibuat dari data yang SUDAH tersimpan di spreadsheet.\nLembar siap di batch ini belum ikut sampai disimpan.", "Laporan", JOptionPane.INFORMATION_MESSAGE)
        val simpel = JRadioButton("Simpel — pilihan jawaban, jumlah benar, skor", true); val lengkap = JRadioButton("Lengkap — + statistik tes & analisis butir")
        ButtonGroup().apply { add(simpel); add(lengkap) }
        val checks = repBagian.map { (k, t) -> k to JCheckBox(t, k in repMode.getValue("simpel")) }
        simpel.addActionListener { checks.forEach { (k, c) -> c.isSelected = k in repMode.getValue("simpel") } }
        lengkap.addActionListener { checks.forEach { (k, c) -> c.isSelected = k in repMode.getValue("lengkap") } }
        val scope = JComboBox((listOf("Seluruh peserta ujian") + u.kelas.filter { it != "SEMUA" }.map { "Kelas $it" }).toTypedArray())
        val format = JComboBox(arrayOf("PDF (kertas F4)", "Excel (.xlsx)", "Google Sheet (tautan)"))
        val urut = JComboBox(arrayOf("Kelas, lalu nama", "Nama", "Skor tertinggi"))
        val p = JPanel(GridBagLayout()); val gc = GridBagConstraints().apply { gridx = 0; fill = GridBagConstraints.HORIZONTAL; anchor = GridBagConstraints.WEST; insets = Insets(2, 4, 2, 4); weightx = 1.0 }
        var y = 0
        fun add(c: JComponent) { gc.gridy = y++; p.add(c, gc) }
        add(label("Ujian: ${u.nama} · ${u.mapel}", 13f, true)); add(label("Lingkup:")); add(scope)
        add(label("Mode:", 12f, true)); add(simpel); add(lengkap); add(label("Bagian yang dimuat:", 12f, true)); checks.forEach { add(it.second) }
        add(label("Format:", 12f, true)); add(format); add(label("Urutan siswa:")); add(urut)
        if (JOptionPane.showConfirmDialog(this, p, "Buat laporan", JOptionPane.OK_CANCEL_OPTION, JOptionPane.PLAIN_MESSAGE) != JOptionPane.OK_OPTION) return
        val bagian = checks.filter { it.second.isSelected }.map { it.first }
        if (bagian.isEmpty()) { JOptionPane.showMessageDialog(this, "Pilih minimal satu bagian laporan."); return }
        val fmt = listOf("pdf", "xlsx", "sheet")[format.selectedIndex]
        val kelas = if (scope.selectedIndex == 0) "" else u.kelas.filter { it != "SEMUA" }[scope.selectedIndex - 1]
        var res: Map<String, Any?>? = null
        val err = busy("Membuat laporan ${if (fmt == "xlsx") "Excel" else if (fmt == "pdf") "PDF" else ""}…") {
            res = api.post(mapOf("action" to "report", "examId" to u.id, "lingkup" to if (kelas.isEmpty()) "tingkat" else "kelas", "kelas" to kelas,
                "mode" to if (lengkap.isSelected) "lengkap" else "simpel", "bagian" to bagian, "format" to fmt, "urut" to listOf("kelas", "nama", "skor")[urut.selectedIndex]))
        }
        if (err != null) { JOptionPane.showMessageDialog(this, err, "Gagal membuat laporan", JOptionPane.ERROR_MESSAGE); return }
        val r = res ?: return
        val url = r.s("url")
        if (r.s("base64").isEmpty()) { openUrl(url); status("Laporan Google Sheet: ${r.s("nama")}"); return }
        val fc = JFileChooser().apply { selectedFile = File(System.getProperty("user.home"), r.s("fileName")); dialogTitle = "Simpan laporan" }
        if (fc.showSaveDialog(this) != JFileChooser.APPROVE_OPTION) return
        fc.selectedFile.writeBytes(Base64.getDecoder().decode(r.s("base64")))
        status("Laporan disimpan: ${fc.selectedFile.name}")
        val pilih = JOptionPane.showOptionDialog(this, "Laporan disimpan:\n${fc.selectedFile.absolutePath}\n\nArsip Google Sheet ada di folder \"Buleud Teu — Laporan\" (Drive pemilik spreadsheet).",
            "Laporan siap", JOptionPane.DEFAULT_OPTION, JOptionPane.INFORMATION_MESSAGE, null, arrayOf("Buka berkas", "Buka Google Sheet", "Tutup"), "Buka berkas")
        when (pilih) { 0 -> runCatching { Desktop.getDesktop().open(fc.selectedFile) }; 1 -> openUrl(url) }
    }
    private fun openUrl(u: String) { if (u.isNotEmpty()) runCatching { Desktop.getDesktop().browse(java.net.URI(u)) } }

    private fun exportCsv() {
        val u = exam ?: return
        val fc = JFileChooser().apply { selectedFile = File("hasil_${u.nama.replace(Regex("[^A-Za-z0-9]+"), "_")}.csv") }
        if (fc.showSaveDialog(this) != JFileChooser.APPROVE_OPTION) return
        val sb = StringBuilder("﻿No;Halaman;Nama;Kelas;Benar;Jumlah;Nilai;Perlu cek;Jawaban;Status\n")
        for (s in sheets) {
            val sc = if (s.preview != null) s.score(u) else null
            sb.append(listOf(s.no, s.page.label, s.siswa?.nama ?: "", s.siswa?.kelas ?: "", sc?.first ?: "", u.jumlah, sc?.second?.toString()?.replace('.', ',') ?: "", s.flagged(u.jumlah).joinToString(" "), (0 until u.jumlah).joinToString("") { (s.answers.getOrNull(it) ?: '-').toString() }, s.state.label).joinToString(";") { "\"${it.toString().replace("\"", "\"\"")}\"" }).append('\n')
        }
        fc.selectedFile.writeText(sb.toString(), Charsets.UTF_8); status("CSV disimpan: ${fc.selectedFile.name}")
    }

    private fun quit() {
        val unsaved = sheets.count { it.state == SheetState.READY && it.siswa != null }
        if (unsaved > 0 && JOptionPane.showConfirmDialog(this, "$unsaved lembar siap belum disimpan. Tetap keluar?", "Keluar", JOptionPane.YES_NO_OPTION) != JOptionPane.YES_OPTION) return
        running?.cancel(); dispose(); System.exit(0)
    }
}
