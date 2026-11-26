package digital.giacomello.kairos

import android.app.Application
import digital.giacomello.kairos.notify.Notifier
import digital.giacomello.kairos.work.RefreshWorker

class KairosApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Graph.onDataChanged = { WearSurfaces.update(it) }
        Notifier.createChannels(this)
        RefreshWorker.schedule(this)
    }
}
