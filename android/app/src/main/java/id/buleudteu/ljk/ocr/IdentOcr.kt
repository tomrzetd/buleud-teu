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

    suspend fun mlkit(strips: Map<String, Bitmap>): Fields = coroutineScope {
        val jobs = strips.mapValues { (_, b) -> async { try { recognizer.process(InputImage.fromBitmap(b, 0)).await().text } catch (e: Exception) { "" } } }
        LjkIdent.fromFields(jobs["nama"]?.await(), jobs["nomor"]?.await(), jobs["kelas"]?.await())
    }

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
