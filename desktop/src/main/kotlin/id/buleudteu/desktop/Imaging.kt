package id.buleudteu.desktop

import id.buleudteu.ljk.engine.ArgbImage
import java.awt.RenderingHints
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.Base64
import javax.imageio.IIOImage
import javax.imageio.ImageIO
import javax.imageio.ImageWriteParam
import kotlin.math.max
import kotlin.math.roundToInt

/** Halaman hasil pindai: berkas asal + nomor halaman (PDF/TIFF bisa berisi banyak lembar). */
class Page(val file: File, val index: Int, val total: Int) {
    val label get() = if (total > 1) "${file.name} · hal ${index + 1}" else file.name
}

object Imaging {
    val EXT = setOf("png", "jpg", "jpeg", "bmp", "gif", "tif", "tiff", "pdf")
    fun supported(f: File) = f.isFile && f.extension.lowercase() in EXT

    /** daftar halaman dalam berkas (tanpa memuat semua gambar ke memori) */
    fun pages(f: File): List<Page> {
        val n = when (f.extension.lowercase()) {
            "pdf" -> Pdf.count(f)
            "tif", "tiff" -> ImageIO.createImageInputStream(f).use { s -> val r = ImageIO.getImageReaders(s).next(); r.input = s; r.getNumImages(true).also { r.dispose() } }
            else -> 1
        }
        return (0 until n).map { Page(f, it, n) }
    }

    fun load(p: Page, pdfDpi: Int = 200): BufferedImage = when (p.file.extension.lowercase()) {
        "pdf" -> Pdf.render(p.file, p.index, pdfDpi)
        "tif", "tiff" -> ImageIO.createImageInputStream(p.file).use { s -> val r = ImageIO.getImageReaders(s).next(); r.input = s; r.read(p.index).also { r.dispose() } }
        else -> ImageIO.read(p.file) ?: throw IllegalArgumentException("Format gambar tidak dikenal: ${p.file.name}")
    }

    /** sisi terpanjang <= maxSide (sama dengan Android: 3000 px) -> ARGB untuk engine */
    fun toArgb(src: BufferedImage, maxSide: Int = 3000): ArgbImage {
        val s = minOf(1.0, maxSide.toDouble() / max(src.width, src.height))
        val img = if (s < 1 || src.type != BufferedImage.TYPE_INT_RGB) {
            val w = (src.width * s).roundToInt().coerceAtLeast(1); val h = (src.height * s).roundToInt().coerceAtLeast(1)
            val o = BufferedImage(w, h, BufferedImage.TYPE_INT_RGB); val g = o.createGraphics()
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR)
            g.color = java.awt.Color.WHITE; g.fillRect(0, 0, w, h); g.drawImage(src, 0, 0, w, h, null); g.dispose(); o
        } else src
        val px = img.getRGB(0, 0, img.width, img.height, null, 0, img.width)
        for (i in px.indices) px[i] = px[i] or (0xFF shl 24)
        return ArgbImage(img.width, img.height, px)
    }

    fun toBuffered(a: ArgbImage): BufferedImage = BufferedImage(a.width, a.height, BufferedImage.TYPE_INT_RGB).also { it.setRGB(0, 0, a.width, a.height, a.px, 0, a.width) }
    fun toBuffered(px: IntArray, w: Int, h: Int): BufferedImage = BufferedImage(w, h, BufferedImage.TYPE_INT_RGB).also { it.setRGB(0, 0, w, h, px, 0, w) }

    fun jpegB64(b: BufferedImage, q: Float = 0.9f): String {
        val o = ByteArrayOutputStream(); val w = ImageIO.getImageWritersByFormatName("jpeg").next()
        ImageIO.createImageOutputStream(o).use { ios ->
            w.output = ios
            val prm = w.defaultWriteParam.apply { compressionMode = ImageWriteParam.MODE_EXPLICIT; compressionQuality = q }
            w.write(null, IIOImage(b, null, null), prm); w.dispose()
        }
        return Base64.getEncoder().encodeToString(o.toByteArray())
    }
}

/**
 * PDF hasil scanner (banyak software scanner menyimpan PDF multi-halaman).
 * Memakai Apache PDFBox bila terpasang (dibundel di installer); jika tidak ada, coba `pdftoppm` (Linux, paket poppler-utils).
 */
object Pdf {
    private val loader by lazy { runCatching { Class.forName("org.apache.pdfbox.Loader") }.getOrNull() }
    val available get() = loader != null || which("pdftoppm") != null

    private fun open(f: File): Any = loader!!.getMethod("loadPDF", File::class.java).invoke(null, f)
    fun count(f: File): Int {
        if (loader != null) { val d = open(f); try { return d.javaClass.getMethod("getNumberOfPages").invoke(d) as Int } finally { d.javaClass.getMethod("close").invoke(d) } }
        val info = which("pdfinfo") ?: throw IllegalStateException("Dukungan PDF tidak tersedia. Simpan hasil scan sebagai JPG/PNG/TIFF.")
        val out = ProcessBuilder(info, f.absolutePath).redirectErrorStream(true).start().inputStream.bufferedReader().readText()
        return Regex("Pages:\\s+(\\d+)").find(out)?.groupValues?.get(1)?.toInt() ?: 1
    }
    fun render(f: File, page: Int, dpi: Int): BufferedImage {
        if (loader != null) {
            val d = open(f)
            try {
                val rc = Class.forName("org.apache.pdfbox.rendering.PDFRenderer"); val it = Class.forName("org.apache.pdfbox.rendering.ImageType")
                val r = rc.getConstructor(Class.forName("org.apache.pdfbox.pdmodel.PDDocument")).newInstance(d)
                val rgb = it.getField("RGB").get(null)
                return rc.getMethod("renderImageWithDPI", Int::class.javaPrimitiveType, Float::class.javaPrimitiveType, it).invoke(r, page, dpi.toFloat(), rgb) as BufferedImage
            } finally { d.javaClass.getMethod("close").invoke(d) }
        }
        val tool = which("pdftoppm") ?: throw IllegalStateException("Dukungan PDF tidak tersedia.")
        val tmp = File.createTempFile("bt_pdf", ""); tmp.delete()
        ProcessBuilder(tool, "-r", "$dpi", "-f", "${page + 1}", "-l", "${page + 1}", "-png", "-singlefile", f.absolutePath, tmp.absolutePath).redirectErrorStream(true).start().waitFor()
        val png = File(tmp.absolutePath + ".png")
        return ImageIO.read(png).also { png.delete() }
    }
}

fun which(cmd: String): String? {
    val names = if (System.getProperty("os.name").lowercase().contains("win")) listOf("$cmd.exe", cmd) else listOf(cmd)
    for (d in (System.getenv("PATH") ?: "").split(File.pathSeparator)) for (n in names) { val f = File(d, n); if (f.canExecute() && f.isFile) return f.absolutePath }
    return null
}
