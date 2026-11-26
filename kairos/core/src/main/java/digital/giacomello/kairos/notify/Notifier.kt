package digital.giacomello.kairos.notify

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import digital.giacomello.kairos.core.R
import digital.giacomello.kairos.data.FlightEvent
import digital.giacomello.kairos.model.Flight
import digital.giacomello.kairos.model.formatDuration

/** Notifiche comuni a telefono e orologio. */
object Notifier {
    const val CH_ALERTS = "alerts"
    const val CH_LIVE = "live"
    const val LIVE_ID = 1
    /** Extra dell'intent di apertura: id del volo da mostrare. */
    const val EXTRA_FLIGHT_ID = "flight_id"

    fun createChannels(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CH_ALERTS, "Avvisi volo", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Ritardi, cambi gate, imbarco, decollo, atterraggio, quando partire"
                enableVibration(true)
            }
        )
        nm.createNotificationChannel(
            NotificationChannel(CH_LIVE, "Volo in corso", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Stato continuo del prossimo volo"
            }
        )
    }

    fun canPost(ctx: Context) =
        ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    /** Apre l'app (telefono o orologio, quella in cui gira il codice) sul volo indicato. */
    fun openApp(ctx: Context, flightId: String?): PendingIntent {
        val i = (ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: Intent()).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            flightId?.let { putExtra(EXTRA_FLIGHT_ID, it) }
        }
        return PendingIntent.getActivity(ctx, flightId.hashCode(), i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    fun post(ctx: Context, events: List<FlightEvent>) {
        if (!canPost(ctx)) return
        val nm = NotificationManagerCompat.from(ctx)
        events.forEach { e ->
            val n = NotificationCompat.Builder(ctx, CH_ALERTS)
                .setSmallIcon(R.drawable.ic_plane)
                .setContentTitle(e.title)
                .setContentText(e.text)
                .setStyle(NotificationCompat.BigTextStyle().bigText(e.text))
                .setCategory(NotificationCompat.CATEGORY_EVENT)
                .setPriority(if (e.urgent) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
                .setContentIntent(openApp(ctx, e.flight.id))
                .setAutoCancel(true)
                .build()
            @Suppress("MissingPermission")
            nm.notify((e.flight.id + e.title).hashCode(), n)
        }
    }

    /** Il volo da mostrare come "live": da 3h prima della partenza a 30' dopo l'arrivo. */
    fun liveFlight(flights: List<Flight>, now: Long = System.currentTimeMillis()): Flight? =
        flights.firstOrNull { f ->
            val dep = f.departure.best ?: return@firstOrNull false
            val arr = f.arrival.best ?: dep
            !f.status.isFinished && !f.emailOnly && now in (dep - 3 * 3_600_000L)..(arr + 30 * 60_000L)
        }

    /** Builder base della notifica continua; ogni app la "decora" (OngoingActivity su Wear). */
    fun liveBuilder(ctx: Context, f: Flight, now: Long = System.currentTimeMillis()): NotificationCompat.Builder {
        val line = liveLine(f, now)
        val b = NotificationCompat.Builder(ctx, CH_LIVE)
            .setSmallIcon(R.drawable.ic_plane)
            .setContentTitle("${f.number} ${f.departure.iata}→${f.arrival.iata}")
            .setContentText(line)
            .setSubText(f.booking?.seat?.let { "Posto $it" })
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(openApp(ctx, f.id))
        if (f.status.isAirborne) b.setProgress(100, (f.progress(now) * 100).toInt(), false)
        return b
    }

    fun cancelLive(ctx: Context) = NotificationManagerCompat.from(ctx).cancel(LIVE_ID)

    /** Riga di stato sintetica: "Parte tra 1h 20m · gate B12", "Atterra tra 45m". */
    fun liveLine(f: Flight, now: Long): String {
        if (f.emailOnly) return "Orari da email · in attesa di dati live"
        val dep = f.departure.best ?: return f.status.label
        val arr = f.arrival.best ?: dep
        return when {
            f.status.isAirborne -> "Atterra tra ${formatDuration((arr - now) / 60_000)}"
            now < dep -> "Parte tra ${formatDuration((dep - now) / 60_000)}${f.departure.gate?.let { " · gate $it" } ?: ""}"
            else -> f.status.label
        }
    }
}
