package digital.giacomello.kairos.work

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import digital.giacomello.kairos.Graph
import digital.giacomello.kairos.data.FlightEvent
import digital.giacomello.kairos.notify.Notifier
import java.util.concurrent.TimeUnit

/**
 * Giro periodico: 1) importa nuovi voli da Gmail  2) aggiorna lo stato live
 * 3) notifica i cambiamenti  4) aggiorna tile/widget/complicazioni.
 * Android impone un minimo di 15 minuti per i lavori periodici.
 */
class RefreshWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val events = runCatching { sync(applicationContext) }.getOrElse { return Result.retry() }
        Notifier.post(applicationContext, events)
        notifySurfaces(applicationContext)
        return Result.success()
    }

    companion object {
        private const val PERIODIC = "kairos-refresh"
        private const val NOW = "kairos-refresh-now"

        /** Import Gmail + refresh live. Usato dal worker e dal pulsante "Aggiorna". */
        suspend fun sync(ctx: Context, force: Boolean = false, scanGmail: Boolean = false): List<FlightEvent> {
            val repo = Graph.repository(ctx)
            val events = mutableListOf<FlightEvent>()
            if (Graph.gmail.isConfigured) {
                runCatching { Graph.gmail.fetch(forceScan = scanGmail) }
                    .onSuccess { events += repo.importFromEmail(it) }
            }
            events += repo.refreshAll(force)
            // "Quando partire": traffico, mezzi, lounge, scioperi
            events += runCatching { Graph.travel(ctx).update(repo.snapshot(), force) }.getOrDefault(emptyList())
            return events
        }

        fun schedule(ctx: Context) {
            val req = PeriodicWorkRequestBuilder<RefreshWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, req)
        }

        fun runNow(ctx: Context) {
            WorkManager.getInstance(ctx).enqueueUniqueWork(
                NOW, ExistingWorkPolicy.REPLACE, OneTimeWorkRequestBuilder<RefreshWorker>().build()
            )
        }

        suspend fun notifySurfaces(ctx: Context) {
            runCatching { Graph.onDataChanged?.invoke(ctx) }
        }
    }
}
