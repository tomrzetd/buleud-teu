package id.buleudteu.ljk.data

import android.content.Context
import android.os.Build
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Cek versi baru dari GitHub Releases (repo publik, tanpa login).
 * Nomor build ada di tag rilis "v4.1.N"; versionCode APK = 1000 + N.
 */
object Updater {
    const val REPO = "tomrzetd/buleud-teu"
    const val DOWNLOAD = "https://github.com/$REPO/releases/latest/download/BuleudTeu.apk"
    private val http = OkHttpClient.Builder().connectTimeout(10, TimeUnit.SECONDS).readTimeout(15, TimeUnit.SECONDS).build()

    class Info(val versi: String, val catatan: String)

    fun versionCode(ctx: Context): Long {
        val pi = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
        return if (Build.VERSION.SDK_INT >= 28) pi.longVersionCode else @Suppress("DEPRECATION") pi.versionCode.toLong()
    }
    fun versionName(ctx: Context): String = ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName ?: ""

    /** null bila sudah versi terbaru / tidak bisa dicek (offline) — tidak pernah melempar galat */
    fun cek(ctx: Context): Info? = try {
        val req = Request.Builder().url("https://api.github.com/repos/$REPO/releases/latest").header("Accept", "application/vnd.github+json").build()
        http.newCall(req).execute().use { r ->
            if (!r.isSuccessful) return null
            val j = JSONObject(r.body?.string() ?: "")
            val tag = j.optString("tag_name")                       // v4.1.37
            val n = Regex("(\\d+)$").find(tag)?.groupValues?.get(1)?.toLongOrNull() ?: return null
            if (1000 + n > versionCode(ctx)) Info(tag.removePrefix("v"), j.optString("body").lines().filter { it.isNotBlank() }.take(4).joinToString("\n")) else null
        }
    } catch (e: Exception) { null }
}
