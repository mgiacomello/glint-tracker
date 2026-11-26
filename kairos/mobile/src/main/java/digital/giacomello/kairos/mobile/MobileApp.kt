package digital.giacomello.kairos.mobile

import android.app.Application
import androidx.core.app.NotificationManagerCompat
import digital.giacomello.kairos.Graph
import digital.giacomello.kairos.notify.Notifier
import digital.giacomello.kairos.work.RefreshWorker

class MobileApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Notifier.createChannels(this)
        // Sul telefono la "superficie live" è una notifica continua con barra di avanzamento.
        Graph.onDataChanged = { ctx ->
            val live = Notifier.liveFlight(Graph.repository(ctx).snapshot())
            if (live == null || !Notifier.canPost(ctx)) Notifier.cancelLive(ctx)
            else {
                @Suppress("MissingPermission")
                NotificationManagerCompat.from(ctx).notify(Notifier.LIVE_ID, Notifier.liveBuilder(ctx, live).build())
            }
        }
        RefreshWorker.schedule(this)
    }
}
