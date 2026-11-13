package id.buleudteu.ljk.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import java.util.UUID

/**
 * Durable scan outbox. A row is removed only after an ACK from Apps Script.
 *
 * Schema v2 also keeps delivery receipts: the student gets a green check after
 * upload WITHOUT a second full roster request. Pending/blocked items get a
 * distinct clock/warning symbol in the Android UI.
 *
 * Primary source of truth remains Apps Script; no score or marker math changes.
 */
class ScanOutbox(ctx: Context) : SQLiteOpenHelper(ctx.applicationContext, "bt_scans.db", null, 2) {
    data class Item(
        val id: String, val server: String, val teacher: String, val payload: String,
        val attempts: Int, val state: String, val lastError: String
    )

    data class Snapshot(
        val pending: Set<String>, val blocked: Set<String>, val confirmed: Set<String>,
        val total: Int, val blockedTotal: Int, val otherAccountTotal: Int
    )

    companion object {
        private fun norm(s: String): String = s.trim().uppercase(Locale.ROOT).replace(Regex("\\s+"), " ")
        /** Exam + class + student name (same display key as server terscan). */
        fun studentKey(examId: String, kelas: String, nama: String): String =
            examId.trim() + "|" + norm(kelas) + "|" + norm(nama)

        fun keyFromPayload(o: JSONObject): String {
            val student = o.optJSONObject("siswa") ?: return ""
            val exam = o.optString("examId")
            val kelas = student.optString("kelas")
            val nama = student.optString("nama")
            return if (exam.isBlank() || kelas.isBlank() || nama.isBlank()) ""
                else studentKey(exam, kelas, nama)
        }

        private fun valuesFor(o: JSONObject, server: String, teacher: String) = ContentValues().apply {
            put("scan_id", o.optString("scanId"))
            put("server", server)
            put("teacher", teacher)
            put("payload", o.toString())
            put("exam_id", o.optString("examId"))
            put("student_key", keyFromPayload(o))
            put("state", "pending")
            put("attempts", 0)
            put("last_error", "")
            put("created_at", System.currentTimeMillis())
        }
    }

    private fun makeReceipts(db: SQLiteDatabase) {
        db.execSQL(
            """CREATE TABLE IF NOT EXISTS scan_receipts(
                server TEXT NOT NULL, teacher TEXT NOT NULL,
                exam_id TEXT NOT NULL, student_key TEXT NOT NULL,
                scan_id TEXT NOT NULL, confirmed_at INTEGER NOT NULL,
                PRIMARY KEY(server,teacher,exam_id,student_key)
            )"""
        )
    }

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
                created_at INTEGER NOT NULL,
                exam_id TEXT NOT NULL DEFAULT '',
                student_key TEXT NOT NULL DEFAULT ''
            )"""
        )
        db.execSQL("CREATE INDEX ix_scan_state ON scan_outbox(server,teacher,state,created_at)")
        db.execSQL("CREATE INDEX ix_scan_student ON scan_outbox(server,teacher,exam_id,student_key)")
        makeReceipts(db)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2 && newVersion >= 2) {
            // NONDESTRUCTIVE migration; all pending scans survive app update.
            db.execSQL("ALTER TABLE scan_outbox ADD COLUMN exam_id TEXT NOT NULL DEFAULT ''")
            db.execSQL("ALTER TABLE scan_outbox ADD COLUMN student_key TEXT NOT NULL DEFAULT ''")
            val rows = ArrayList<Pair<String, JSONObject>>()
            db.rawQuery("SELECT scan_id,payload FROM scan_outbox", null).use { c ->
                while (c.moveToNext()) {
                    val parsed = runCatching { JSONObject(c.getString(1)) }.getOrNull() ?: continue
                    rows += c.getString(0) to parsed
                }
            }
            for ((id, payload) in rows) {
                val vals = ContentValues().apply {
                    put("exam_id", payload.optString("examId"))
                    put("student_key", keyFromPayload(payload))
                }
                db.update("scan_outbox", vals, "scan_id=?", arrayOf(id))
            }
            db.execSQL("CREATE INDEX IF NOT EXISTS ix_scan_student ON scan_outbox(server,teacher,exam_id,student_key)")
            makeReceipts(db)
        }
        if (newVersion > 2) error("Butuh migrasi SQLite aman ke versi " + newVersion)
    }

    /**
     * Offline rescans of the same student update the queued payload and retain
     * the previous ScanID. If a worker already sent an old snapshot, its ACK
     * cannot delete a newer correction (confirm checks exact payload).
     */
    @Synchronized
    fun enqueue(endpoint: String, guru: String, source: JSONObject): Boolean {
        if (endpoint.isBlank() || guru.isBlank()) return false
        val data = JSONObject(source.toString()).apply {
            remove("token")
            if (optString("scanId").isBlank()) put("scanId", UUID.randomUUID().toString())
        }
        val examId = data.optString("examId")
        val personKey = keyFromPayload(data)
        if (data.optString("action") != "save" || examId.isBlank() || personKey.isBlank()) return false
        return try {
            val db = writableDatabase
            var written = false
            db.beginTransaction()
            try {
                var existingId: String? = null
                db.rawQuery(
                    """SELECT scan_id FROM scan_outbox
                       WHERE server=? AND teacher=? AND exam_id=? AND student_key=?
                       ORDER BY created_at DESC LIMIT 1""",
                    arrayOf(endpoint, guru, examId, personKey)
                ).use { c -> if (c.moveToFirst()) existingId = c.getString(0) }
                if (existingId != null) {
                    data.put("scanId", existingId)
                    val v = valuesFor(data, endpoint, guru)
                    written = db.update("scan_outbox", v, "scan_id=?", arrayOf(existingId)) == 1
                } else {
                    val v = valuesFor(data, endpoint, guru)
                    written = db.insertWithOnConflict(
                        "scan_outbox", null, v, SQLiteDatabase.CONFLICT_IGNORE
                    ) >= 0
                }
                if (written) db.setTransactionSuccessful()
            } finally { db.endTransaction() }
            written
        } catch (_: Exception) { false }
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
                c.getString(0),c.getString(1),c.getString(2),c.getString(3),
                c.getInt(4),c.getString(5),c.getString(6)
            ) else null
        }
    }

    @Synchronized
    fun countAll(): Int = readableDatabase.rawQuery(
        "SELECT count(*) FROM scan_outbox",null
    ).use { c -> c.moveToFirst(); c.getInt(0) }

    @Synchronized
    fun countFor(endpoint: String, guru: String): Int = readableDatabase.rawQuery(
        "SELECT count(*) FROM scan_outbox WHERE server=? AND teacher=?",
        arrayOf(endpoint,guru)
    ).use { c -> c.moveToFirst(); c.getInt(0) }

    @Synchronized
    fun blockedFor(endpoint: String, guru: String): Int = readableDatabase.rawQuery(
        "SELECT count(*) FROM scan_outbox WHERE server=? AND teacher=? AND state='blocked'",
        arrayOf(endpoint,guru)
    ).use { c -> c.moveToFirst(); c.getInt(0) }

    /** Acknowledged receipt is written in the same SQLite transaction as deletion. */
    @Synchronized
    fun confirm(item: Item) {
        val db = writableDatabase
        db.beginTransaction()
        try {
            val removed = db.delete(
                "scan_outbox", "scan_id=? AND server=? AND teacher=? AND payload=?",
                arrayOf(item.id,item.server,item.teacher,item.payload)
            )
            if (removed == 1) {
                val obj = JSONObject(item.payload)
                val key = keyFromPayload(obj)
                if (key.isNotBlank()) {
                    val values = ContentValues().apply {
                        put("server",item.server)
                        put("teacher",item.teacher)
                        put("exam_id",obj.optString("examId"))
                        put("student_key",key)
                        put("scan_id",item.id)
                        put("confirmed_at",System.currentTimeMillis())
                    }
                    db.insertWithOnConflict("scan_receipts",null,values,SQLiteDatabase.CONFLICT_REPLACE)
                }
            }
            db.setTransactionSuccessful()
        } finally { db.endTransaction() }
    }

    /** Never overwrite a newer pending correction while an old upload is in-flight. */
    @Synchronized
    fun failed(item: Item,error: String,blocked: Boolean) {
        val v = ContentValues().apply {
            put("attempts",item.attempts+1)
            put("last_error",error.take(240))
            put("state",if(blocked) "blocked" else "pending")
        }
        writableDatabase.update(
            "scan_outbox",v,
            "scan_id=? AND server=? AND teacher=? AND payload=?",
            arrayOf(item.id,item.server,item.teacher,item.payload)
        )
    }

    @Synchronized
    fun snapshot(endpoint: String, guru: String): Snapshot {
        val pending = HashSet<String>()
        val blocked = HashSet<String>()
        val confirmed = HashSet<String>()
        readableDatabase.rawQuery(
            "SELECT student_key,state FROM scan_outbox WHERE server=? AND teacher=?",
            arrayOf(endpoint,guru)
        ).use { c ->
            while (c.moveToNext()) {
                val key = c.getString(0)
                if (!key.isNullOrBlank()) {
                    if (c.getString(1) == "blocked") blocked += key else pending += key
                }
            }
        }
        readableDatabase.rawQuery(
            "SELECT student_key FROM scan_receipts WHERE server=? AND teacher=?",
            arrayOf(endpoint,guru)
        ).use { c ->
            while (c.moveToNext()) {
                val key = c.getString(0)
                if (!key.isNullOrBlank()) confirmed += key
            }
        }
        val count = countFor(endpoint,guru)
        return Snapshot(pending,blocked,confirmed,count,blockedFor(endpoint,guru),(countAll()-count).coerceAtLeast(0))
    }

    @Synchronized
    fun retryBlocked(endpoint: String,guru: String) {
        writableDatabase.execSQL(
            "UPDATE scan_outbox SET state='pending', attempts=0 WHERE server=? AND teacher=? AND state='blocked'",
            arrayOf(endpoint,guru)
        )
    }

    /** Migrate the previous JSON queue; clear old storage only after all writes succeed. */
    @Synchronized
    fun importLegacy(store: Store): Int {
        val legacy = store.queue()
        if (legacy.length() == 0 || store.api.isBlank() || store.guruNama.isBlank()) return 0
        var copied = 0
        for (i in 0 until legacy.length()) {
            val item = legacy.optJSONObject(i) ?: return copied
            if (!enqueue(store.api,store.guruNama,item)) return copied
            copied++
        }
        if (!store.setQueue(JSONArray())) return copied
        return copied
    }
}
