package id.buleudteu.ljk.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * Outbox LJK tahan mati aplikasi. Transaksi SQLite dilakukan sebelum UI
 * berpindah ke halaman scan selanjutnya. Server memakai ScanID yang sama
 * untuk idempotensi bila upload sukses tetapi balasannya terputus.
 *
 * Tidak menyimpan token guru di record. Record terikat endpoint + nama guru
 * agar tidak tersinkron ke sekolah/akun yang salah.
 */
class ScanOutbox(ctx: Context) : SQLiteOpenHelper(ctx.applicationContext, "bt_scans.db", null, 1) {
    data class Item(
        val id: String, val server: String, val teacher: String, val payload: String,
        val attempts: Int, val state: String, val lastError: String
    )

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """CREATE TABLE scan_outbox(
                scan_id TEXT PRIMARY KEY,
                server TEXT NOT NULL,
                teacher TEXT NOT NULL,
                payload TEXT NOT NULL,
                state TEXT NOT NULL DEFAULT 'pending',
                attempts INTEGER NOT NULL DEFAULT 0,
                last_error TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL
            )"""
        )
        db.execSQL("CREATE INDEX ix_scan_state ON scan_outbox(server, teacher, state, created_at)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // Skema v1 tidak boleh dijatuhkan; scan siswa adalah data penting.
        if (oldVersion != newVersion) error("Perlu migrasi aman dari $oldVersion ke $newVersion")
    }

    /** true jika record sudah tersimpan secara durable, termasuk ScanID yang pernah ada. */
    @Synchronized
    fun enqueue(endpoint: String, guru: String, source: JSONObject): Boolean {
        if (endpoint.isBlank() || guru.isBlank()) return false
        val safe = JSONObject(source.toString()).apply {
            remove("token")
            if (optString("scanId").isBlank()) put("scanId", UUID.randomUUID().toString())
        }
        val id = safe.optString("scanId")
        if (id.isBlank() || safe.optString("action") != "save") return false
        val values = ContentValues().apply {
            put("scan_id", id)
            put("server", endpoint)
            put("teacher", guru)
            put("payload", safe.toString())
            put("state", "pending")
            put("created_at", System.currentTimeMillis())
        }
        return try {
            val result = writableDatabase.insertWithOnConflict(
                "scan_outbox", null, values, SQLiteDatabase.CONFLICT_IGNORE
            )
            if (result >= 0) true else hasId(id, endpoint, guru)
        } catch (_: Exception) { false }
    }

    private fun hasId(id: String, endpoint: String, guru: String): Boolean {
        readableDatabase.rawQuery(
            "SELECT 1 FROM scan_outbox WHERE scan_id=? AND server=? AND teacher=? LIMIT 1",
            arrayOf(id, endpoint, guru)
        ).use { return it.moveToFirst() }
    }

    @Synchronized
    fun next(endpoint: String, guru: String): Item? {
        readableDatabase.rawQuery(
            """SELECT scan_id,server,teacher,payload,attempts,state,last_error
               FROM scan_outbox WHERE server=? AND teacher=? AND state='pending'
               ORDER BY created_at,scan_id LIMIT 1""",
            arrayOf(endpoint, guru)
        ).use { c ->
            return if (c.moveToFirst()) Item(
                c.getString(0), c.getString(1), c.getString(2), c.getString(3),
                c.getInt(4), c.getString(5), c.getString(6)
            ) else null
        }
    }

    @Synchronized
    fun countAll(): Int = readableDatabase.rawQuery(
        "SELECT count(*) FROM scan_outbox", null
    ).use { c -> c.moveToFirst(); c.getInt(0) }

    @Synchronized
    fun countFor(endpoint: String, guru: String): Int = readableDatabase.rawQuery(
        "SELECT count(*) FROM scan_outbox WHERE server=? AND teacher=?",
        arrayOf(endpoint, guru)
    ).use { c -> c.moveToFirst(); c.getInt(0) }

    @Synchronized
    fun blockedFor(endpoint: String, guru: String): Int = readableDatabase.rawQuery(
        "SELECT count(*) FROM scan_outbox WHERE server=? AND teacher=? AND state='blocked'",
        arrayOf(endpoint, guru)
    ).use { c -> c.moveToFirst(); c.getInt(0) }

    @Synchronized
    fun confirm(item: Item) {
        writableDatabase.delete(
            "scan_outbox", "scan_id=? AND server=? AND teacher=?",
            arrayOf(item.id, item.server, item.teacher)
        )
    }

    @Synchronized
    fun failed(item: Item, error: String, blocked: Boolean) {
        val values = ContentValues().apply {
            put("attempts", item.attempts + 1)
            put("last_error", error.take(240))
            put("state", if (blocked) "blocked" else "pending")
        }
        writableDatabase.update("scan_outbox", values,
            "scan_id=? AND server=? AND teacher=?",
            arrayOf(item.id, item.server, item.teacher))
    }

    /** Dipanggil setelah guru login kembali: percobaan dengan token baru. */
    @Synchronized
    fun retryBlocked(endpoint: String, guru: String) {
        writableDatabase.execSQL(
            "UPDATE scan_outbox SET state='pending', attempts=0 WHERE server=? AND teacher=? AND state='blocked'",
            arrayOf(endpoint, guru)
        )
    }

    /**
     * Migrasi antrean JSON SharedPreferences dari versi APK lama.
     * Antrian asal dihapus HANYA jika semua record berhasil commit ke SQLite.
     * Jika APK tertutup di tengah proses, scan_id membuat migrasi idempoten.
     */
    @Synchronized
    fun importLegacy(store: Store): Int {
        val legacy = store.queue()
        if (legacy.length() == 0 || store.api.isBlank() || store.guruNama.isBlank()) return 0
        var copied = 0
        for (i in 0 until legacy.length()) {
            val item = legacy.optJSONObject(i) ?: return copied
            if (!enqueue(store.api, store.guruNama, item)) return copied
            copied++
        }
        if (!store.setQueue(JSONArray())) return copied  // jangan pernah hilangkan data asal
        return copied
    }
}
