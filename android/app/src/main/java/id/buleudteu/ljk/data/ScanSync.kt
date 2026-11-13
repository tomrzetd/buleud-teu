package id.buleudteu.ljk.data

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkerParameters
import androidx.work.WorkManager
import androidx.work.workDataOf
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Android WorkManager menjalankan antrean saat jaringan kembali tersedia. */
object ScanSync {
    const val WORK_NAME = "bt-scans-upload-v1"

    fun schedule(ctx: Context) {
        val req = OneTimeWorkRequestBuilder<ScanSyncWorker>()
            .setConstraints(Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(ctx.applicationContext)
            .enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.KEEP, req)
    }

    fun cancel(ctx: Context) {
        WorkManager.getInstance(ctx.applicationContext).cancelUniqueWork(WORK_NAME)
    }
}

/**
 * Only confirmed server success deletes a record.
 * Network errors, Google Apps Script busy/quota errors -> WorkManager retry.
 * Auth, revoked license, roster/data validation -> BLOCKED retained locally;
 * they can be retried explicitly after credentials/server data are corrected.
 */
class ScanSyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val store = Store(applicationContext)
        val endpoint = store.api
        val teacher = store.guruNama
        val outbox = ScanOutbox(applicationContext)
        if (endpoint.isBlank() || teacher.isBlank() || store.token.isBlank()) return Result.failure()
        val api = Api(store)
        var processed = 0
        while (!isStopped) {
            // Stop if teacher changes during sync; never cross-submit another account.
            if (store.api != endpoint || store.guruNama != teacher || store.token.isBlank()) return Result.failure()
            val item = outbox.next(endpoint, teacher) ?: return Result.success()
            val payload = JSONObject(item.payload).apply {
                remove("token")
                put("token", store.token)
            }
            try {
                api.post(payload)
                outbox.confirm(item)
                processed++
                setProgress(workDataOf("sent" to processed, "pending" to outbox.countFor(endpoint, teacher)))
            } catch (e: IOException) {
                outbox.failed(item, e.message ?: "Jaringan belum tersedia", blocked = false)
                return Result.retry()
            } catch (e: ApiException) {
                val message = e.message ?: "Server menolak permintaan"
                val overloaded = Regex(
                    "sibuk|busy|quota|rate.limit|too many|timeout|temporar|sementara|coba lagi|overload|limit eksekusi",
                    RegexOption.IGNORE_CASE
                ).containsMatchIn(message)
                if (overloaded) {
                    outbox.failed(item, message, blocked = false)
                    return Result.retry()
                }
                // Preserve the record, even on permanent server rejection.
                outbox.failed(item, message, blocked = true)
                setProgress(workDataOf("blocked" to outbox.blockedFor(endpoint, teacher)))
                if (e.auth || e.forbidden) return Result.failure()
                // Other independent scans may still be valid; continue safely.
            } catch (e: Exception) {
                outbox.failed(item, e.message ?: "Upload tertunda", blocked = false)
                return Result.retry()
            }
        }
        return Result.retry()
    }
}
