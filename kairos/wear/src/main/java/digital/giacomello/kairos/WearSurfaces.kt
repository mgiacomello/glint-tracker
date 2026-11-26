package digital.giacomello.kairos

import android.content.ComponentName
import android.content.Context
import androidx.core.app.NotificationManagerCompat
import androidx.wear.ongoing.OngoingActivity
import androidx.wear.ongoing.Status
import androidx.wear.tiles.TileService
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import digital.giacomello.kairos.complication.CountdownComplicationService
import digital.giacomello.kairos.core.R
import digital.giacomello.kairos.notify.Notifier
import digital.giacomello.kairos.tile.NextFlightTileService

/** Aggiorna tile, complicazione e Ongoing Activity dell'orologio dopo ogni cambio dati. */
object WearSurfaces {
    suspend fun update(ctx: Context) {
        TileService.getUpdater(ctx).requestUpdate(NextFlightTileService::class.java)
        ComplicationDataSourceUpdateRequester
            .create(ctx, ComponentName(ctx, CountdownComplicationService::class.java))
            .requestUpdateAll()
        updateLive(ctx)
    }

    /** "Ongoing Activity": l'equivalente Wear OS delle Live Activities iOS. */
    private suspend fun updateLive(ctx: Context) {
        val now = System.currentTimeMillis()
        val live = Notifier.liveFlight(Graph.repository(ctx).snapshot(), now)
        if (live == null || !Notifier.canPost(ctx)) { Notifier.cancelLive(ctx); return }

        val builder = Notifier.liveBuilder(ctx, live, now)
        OngoingActivity.Builder(ctx, Notifier.LIVE_ID, builder)
            .setStaticIcon(R.drawable.ic_plane)
            .setTouchIntent(Notifier.openApp(ctx, live.id))
            .setStatus(Status.Builder().addTemplate(Notifier.liveLine(live, now)).build())
            .build()
            .apply(ctx)
        @Suppress("MissingPermission")
        NotificationManagerCompat.from(ctx).notify(Notifier.LIVE_ID, builder.build())
    }
}
