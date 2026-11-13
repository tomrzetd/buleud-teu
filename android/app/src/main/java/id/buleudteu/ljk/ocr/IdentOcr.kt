package id.buleudteu.ljk.ocr

import android.graphics.Bitmap
import android.util.Base64
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import id.buleudteu.ljk.data.Api
import id.buleudteu.ljk.ident.Fields
import id.buleudteu.ljk.ident.LjkIdent
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.tasks.await
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/**
 * OCR identitas (nama, nomor, kelas):
 * 1) ML Kit di perangkat (cepat, offline) — bagus untuk huruf kapital per kotak, kurang untuk tulisan sambung.
 * 2) Jika hasil pencocokan belum yakin dan online -> OCR Google Drive lewat Apps Script (lebih kuat untuk tulisan tangan).
 */
object IdentOcr {
    private val recognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }

    /**
     * Coba ukuran asli dahulu, kemudian 2× apabila teks terlalu pendek.
     * ML Kit sering tidak mengenali tulisan tangan terpisah bila setiap
     * huruf hanya menempati sedikit piksel. Jangan pernah menebak identitas:
     * hasil ini masih harus divalidasi terhadap roster oleh AppViewModel.
     */
    private suspend fun readStrip(bitmap: Bitmap): String {
        suspend fun recognize(b: Bitmap): String = try {
            recognizer.process(InputImage.fromBitmap(b, 0)).await().text
        } catch (_: Exception) { "" }
        val original = recognize(bitmap)
        if (original.count { it.isLetterOrDigit() } >= 7) return original
        val twice = Bitmap.createScaledBitmap(bitmap, bitmap.width * 2, bitmap.height * 2, true)
        return try {
            val enlarged = recognize(twice)
            if (enlarged.count { it.isLetterOrDigit() } > original.count { it.isLetterOrDigit() }) enlarged else original
        } finally {
            if (twice !== bitmap) twice.recycle()
        }
    }

    suspend fun mlkit(strips: Map<String, Bitmap>): Fields = coroutineScope {
        val jobs = strips.mapValues { (_, b) -> async { readStrip(b) } }
        LjkIdent.fromFields(jobs["nama"]?.await(), jobs["nomor"]?.await(), jobs["kelas"]?.await())
    }

    /** LJK lama: teks disusun ulang per baris visual (label + tulisan tangan di kanannya digabung) */
    suspend fun mlkitText(b: Bitmap): String = try {
        val t = recognizer.process(InputImage.fromBitmap(b, 0)).await()
        val lines = t.textBlocks.flatMap { it.lines }.mapNotNull { l -> l.boundingBox?.let { r -> LjkIdent.Baris(l.text, r.left, r.top, r.right, r.bottom) } }
        if (lines.isEmpty()) t.text else LjkIdent.susunBaris(lines)
    } catch (e: Exception) { "" }

    suspend fun google(api: Api, strips: Map<String, Bitmap>): Fields = coroutineScope {
        val jobs = strips.mapValues { (_, b) -> async {
            try { api.post(JSONObject().put("action", "ocr").put("image", jpegB64(b))).optString("text") } catch (e: Exception) { "" }
        } }
        LjkIdent.fromFields(jobs["nama"]?.await(), jobs["nomor"]?.await(), jobs["kelas"]?.await())
    }

    fun jpegB64(b: Bitmap): String {
        val o = ByteArrayOutputStream(); b.compress(Bitmap.CompressFormat.JPEG, 90, o)
        return Base64.encodeToString(o.toByteArray(), Base64.NO_WRAP)
    }
}
