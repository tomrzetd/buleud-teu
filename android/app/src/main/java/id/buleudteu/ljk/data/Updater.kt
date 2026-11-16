package id.buleudteu.ljk.data

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.Locale
import java.util.concurrent.TimeUnit

/**
 * Two update sources: approved school HTTPS mirror (test), then official GitHub Releases.
 * Only trust OTA APKs signed with our pinned certificate and hash-checked against
 * the manifest. Never install silently; the Android system confirms installation.
 */
object Updater {
    const val REPO = "tomrzetd/buleud-teu"
    const val DOWNLOAD = "https://github.com/$REPO/releases/latest/download/BuleudTeu.apk"
    private const val MANIFEST = "https://github.com/$REPO/releases/latest/download/update-manifest.json"
    // Quick Tunnel URL is ONLY a test default; operator can replace or clear it
    // whenever the random trycloudflare.com hostname changes.
    private const val TEST_SCHOOL_ORIGIN = "https://apartments-hourly-cross-bryant.trycloudflare.com"
    private const val PREFS = "bt_ota"
    private const val SOURCE = "school_origin"
    private const val CERT_SHA256 = "28:E6:5A:A1:5F:DC:5C:7D:F9:62:B2:A4:11:29:7A:C5:F0:D7:70:FD:3A:62:9D:2F:7C:91:46:20:98:F8:6F:06"
    private const val MAX_APK = 200L * 1024 * 1024
    private val http = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS).readTimeout(60, TimeUnit.SECONDS).build()

    class Info(
        val versi: String, val catatan: String, val versionCode: Long,
        val apkUrl: String, val sha256: String?, val sizeBytes: Long,
        val sumber: String = "GitHub Releases"
    ) {
        val verifiedAvailable: Boolean get() = sha256 != null
    }


    /** Operator setting; never store an APK signing secret or license token here. */
    fun serverUrl(ctx: Context): String =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(SOURCE, TEST_SCHOOL_ORIGIN).orEmpty()

    fun saveServerUrl(ctx: Context, value: String): Boolean {
        val url = value.trim().trimEnd('/')
        if (url.isNotEmpty() && !validSchoolOrigin(url)) return false
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(SOURCE, url).apply()
        return true
    }

    private fun validSchoolOrigin(raw: String): Boolean {
        val uri = runCatching { Uri.parse(raw) }.getOrNull() ?: return false
        return uri.scheme == "https" && !uri.host.isNullOrBlank() &&
            uri.host!!.contains('.') && uri.port == -1 &&
            (uri.path.isNullOrEmpty() || uri.path == "/") &&
            uri.userInfo == null && uri.query == null && uri.fragment == null
    }

    private fun schoolMirrorInfo(ctx: Context): Info? {
        val origin = serverUrl(ctx)
        if (!validSchoolOrigin(origin)) return null
        val raw = getText("$origin/update-manifest.json") ?: return null
        val obj = JSONObject(raw)
        val apk = obj.getJSONObject("apk")
        val version = obj.getString("versionName")
        val code = obj.getLong("versionCode")
        val digest = apk.getString("sha256").lowercase(Locale.ROOT)
        val size = apk.getLong("sizeBytes")
        // A CI manifest may retain a GitHub release URL. At the mirror we
        // download the same APK bytes locally; digest + pinned signer MUST match.
        val original = apk.optString("url")
        if (obj.optString("product") != "buleud-teu" ||
            obj.optString("channel") != "stable" ||
            obj.optString("packageName") != ctx.packageName ||
            obj.optString("certSha256") != CERT_SHA256 ||
            !Regex("^4\\.1\\.[0-9]+$").matches(version) ||
            code != 1000L + version.substringAfterLast('.').toLong() ||
            code <= versionCode(ctx) ||
            obj.optInt("minSdk", 999) > Build.VERSION.SDK_INT ||
            !trustedApkUrl(original) ||
            !Regex("^[a-f0-9]{64}$").matches(digest) ||
            size !in 1000..MAX_APK
        ) return null
        return Info(version, "Update tersedia dari server sekolah", code,
            "$origin/BuleudTeu.apk", digest, size, "Server sekolah")
    }

    fun versionCode(ctx: Context): Long {
        val pi = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
        return if (Build.VERSION.SDK_INT >= 28) pi.longVersionCode else @Suppress("DEPRECATION") pi.versionCode.toLong()
    }
    fun versionName(ctx: Context): String = ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName ?: ""

    private fun getText(url: String): String? {
        val req = Request.Builder().url(url).header("Accept", "application/json").build()
        return http.newCall(req).execute().use { if (it.isSuccessful) it.body?.string() else null }
    }

    private fun trustedApkUrl(url: String): Boolean =
        Regex("^https://github\\.com/tomrzetd/buleud-teu/releases/download/v[0-9]+\\.[0-9]+\\.[0-9]+/BuleudTeu\\.apk$")
            .matches(url)


    private fun trustedDownloadUrl(url: String, ctx: Context): Boolean {
        if (trustedApkUrl(url)) return true
        val origin = serverUrl(ctx)
        return validSchoolOrigin(origin) && url == "$origin/BuleudTeu.apk"
    }

    /**
     * No exception escapes UI. Without valid manifest, fall back to browser
     * download instead of claiming an APK is already integrity-verified.
     */
    fun cek(ctx: Context): Info? {
        // Mirror downtime must never disable the official update path.
        val school = runCatching { schoolMirrorInfo(ctx) }.getOrNull()
        if (school != null) return school
        return try {
        val release = JSONObject(getText("https://api.github.com/repos/$REPO/releases/latest") ?: return null)
        val tag = release.optString("tag_name") // v4.1.N
        val n = Regex("^v4\\.1\\.(\\d+)$").matchEntire(tag)
            ?.groupValues?.get(1)?.toLongOrNull() ?: return null
        val code = 1000 + n
        if (code <= versionCode(ctx)) return null
        val notes = release.optString("body").lines().filter { it.isNotBlank() }.take(4).joinToString("\n")
        val raw = getText(MANIFEST)
        if (raw != null) {
            runCatching {
                val obj = JSONObject(raw)
                val apk = obj.getJSONObject("apk")
                val url = apk.getString("url")
                val digest = apk.getString("sha256").lowercase(Locale.ROOT)
                val size = apk.getLong("sizeBytes")
                if (obj.optString("product") != "buleud-teu" ||
                    obj.optString("channel") != "stable" ||
                    obj.optString("packageName") != ctx.packageName ||
                    obj.optString("certSha256") != CERT_SHA256 ||
                    obj.optString("versionName") != tag.removePrefix("v") ||
                    obj.getLong("versionCode") != code ||
                    obj.optInt("minSdk", 999) > Build.VERSION.SDK_INT ||
                    !trustedApkUrl(url) ||
                    !Regex("^[a-f0-9]{64}$").matches(digest) ||
                    size !in 1000..MAX_APK) {
                    error("Metadata rilis tidak valid")
                }
                return Info(tag.removePrefix("v"), notes, code, url, digest, size)
            }
        }
        Info(tag.removePrefix("v"), notes, code, DOWNLOAD, null, 0)
    } catch (_: Exception) { null }
    }

    private fun fileSha256(file: File): String {
        val sha = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { stream ->
            val b = ByteArray(128 * 1024)
            while (true) {
                val n = stream.read(b)
                if (n < 0) break
                sha.update(b, 0, n)
            }
        }
        return sha.digest().joinToString("") { "%02x".format(it) }
    }

    private fun signerFingerprints(ctx: Context, archive: File?): Set<String> {
        val pm = ctx.packageManager
        val flags = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES
                    else @Suppress("DEPRECATION") PackageManager.GET_SIGNATURES
        val info = if (archive == null) pm.getPackageInfo(ctx.packageName, flags)
                   else pm.getPackageArchiveInfo(archive.absolutePath, flags)
        val signers = if (Build.VERSION.SDK_INT >= 28) info?.signingInfo?.apkContentsSigners
                      else @Suppress("DEPRECATION") info?.signatures
        return signers.orEmpty().map { signature ->
            val d = MessageDigest.getInstance("SHA-256").digest(signature.toByteArray())
            d.joinToString(":") { "%02X".format(it) }
        }.toSet()
    }

    /**
     * Call from Dispatchers.IO. Returns a file only when payload AND signer are
     * verified. User consent to install is requested later on main/UI thread.
     */
    fun downloadVerified(ctx: Context, info: Info): File {
        val digest = info.sha256 ?: error("Release belum memiliki manifest valid, gunakan unduh browser.")
        if (!trustedDownloadUrl(info.apkUrl, ctx)) error("Alamat APK tidak terpercaya")
        val dir = File(ctx.cacheDir, "verified_updates").apply { mkdirs() }
        val tmp = File(dir, "BuleudTeu-pending.apk")
        val apk = File(dir, "BuleudTeu.apk")
        tmp.delete()
        try {
            val req = Request.Builder().url(info.apkUrl).build()
            http.newCall(req).execute().use { res ->
                if (!res.isSuccessful) error("Unduhan gagal HTTP ${res.code}")
                val body = res.body ?: error("Unduhan kosong")
                var received = 0L
                body.byteStream().use { stream ->
                    FileOutputStream(tmp).use { file ->
                        val buf = ByteArray(128 * 1024)
                        while (true) {
                            val n = stream.read(buf)
                            if (n < 0) break
                            received += n
                            if (received > MAX_APK) error("APK lebih dari batas 200 MB")
                            file.write(buf, 0, n)
                        }
                        file.fd.sync()
                    }
                }
                if (received != info.sizeBytes) error("Ukuran APK berbeda dari manifest")
            }
            if (fileSha256(tmp) != digest) error("Checksum SHA-256 APK tidak cocok")
            val pkg = ctx.packageManager.getPackageArchiveInfo(tmp.absolutePath, 0)
                ?: error("APK tidak dapat diparse Android")
            if (pkg.packageName != ctx.packageName) error("Nama paket berbeda")
            val newCode = if (Build.VERSION.SDK_INT >= 28) pkg.longVersionCode
                          else @Suppress("DEPRECATION") pkg.versionCode.toLong()
            if (newCode != info.versionCode || newCode <= versionCode(ctx))
                error("Versi APK tidak sesuai")
            val current = signerFingerprints(ctx, null)
            val incoming = signerFingerprints(ctx, tmp)
            if (current.isEmpty() || current != incoming || CERT_SHA256 !in incoming)
                error("Sertifikat penandatangan APK berbeda dari aplikasi saat ini")
            apk.delete()
            if (!tmp.renameTo(apk)) error("Tidak dapat menyimpan APK tervalidasi")
            return apk
        } finally {
            tmp.delete()
        }
    }

    /** User-triggered, Android confirms install; does NOT bypass install restrictions. */
    fun installIntent(ctx: Context, apk: File): Intent {
        val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", apk)
        return Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
    }

    fun needsInstallPermission(ctx: Context): Boolean =
        Build.VERSION.SDK_INT >= 26 && !ctx.packageManager.canRequestPackageInstalls()

    fun installPermissionIntent(ctx: Context): Intent =
        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:${ctx.packageName}")).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
}
