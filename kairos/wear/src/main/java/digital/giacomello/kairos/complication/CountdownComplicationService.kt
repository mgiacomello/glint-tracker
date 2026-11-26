package digital.giacomello.kairos.complication

import android.app.PendingIntent
import android.content.Intent
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.CountDownTimeReference
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.data.TimeDifferenceComplicationText
import androidx.wear.watchface.complications.data.TimeDifferenceStyle
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService
import digital.giacomello.kairos.Graph
import digital.giacomello.kairos.model.Flight
import digital.giacomello.kairos.ui.MainActivity
import java.time.Instant

/**
 * Complicazione per il quadrante: countdown al decollo (o all'atterraggio se in volo).
 * Usa TimeDifferenceComplicationText, quindi il quadrante aggiorna il conto alla rovescia
 * da solo senza svegliare l'app ogni minuto (risparmio batteria).
 */
class CountdownComplicationService : SuspendingComplicationDataSourceService() {

    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
        val now = System.currentTimeMillis()
        val f = Graph.repository(this).snapshot().firstOrNull { !it.status.isFinished }
        return build(request.complicationType, f, now)
    }

    override fun getPreviewData(type: ComplicationType): ComplicationData? =
        build(type, null, System.currentTimeMillis(), preview = true)

    private fun build(type: ComplicationType, f: Flight?, now: Long, preview: Boolean = false): ComplicationData? {
        val tap = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE
        )
        val target: Long
        val title: String
        val desc: String
        when {
            preview -> { target = now + 2 * 3_600_000L; title = "FCO"; desc = "Volo tra 2 ore" }
            f == null -> {
                return when (type) {
                    ComplicationType.SHORT_TEXT -> ShortTextComplicationData.Builder(
                        PlainComplicationText.Builder("—").build(), PlainComplicationText.Builder("Nessun volo").build()
                    ).setTitle(PlainComplicationText.Builder("✈").build()).setTapAction(tap).build()
                    ComplicationType.LONG_TEXT -> LongTextComplicationData.Builder(
                        PlainComplicationText.Builder("Nessun volo").build(), PlainComplicationText.Builder("Nessun volo").build()
                    ).setTapAction(tap).build()
                    else -> null
                }
            }
            f.status.isAirborne -> { target = f.arrival.best ?: now; title = f.arrival.iata; desc = "Atterraggio ${f.number}" }
            else -> { target = f.departure.best ?: now; title = f.departure.iata; desc = "Partenza ${f.number}" }
        }

        val countdown = TimeDifferenceComplicationText.Builder(
            TimeDifferenceStyle.SHORT_DUAL_UNIT,
            CountDownTimeReference(Instant.ofEpochMilli(target)),
        ).build()
        val contentDesc = PlainComplicationText.Builder(desc).build()

        return when (type) {
            ComplicationType.SHORT_TEXT -> ShortTextComplicationData.Builder(countdown, contentDesc)
                .setTitle(PlainComplicationText.Builder(title).build())
                .setTapAction(tap)
                .build()
            ComplicationType.LONG_TEXT -> LongTextComplicationData.Builder(countdown, contentDesc)
                .setTitle(PlainComplicationText.Builder(f?.let { "${it.number} ${it.departure.iata}→${it.arrival.iata}" } ?: "AZ610 FCO→JFK").build())
                .setTapAction(tap)
                .build()
            else -> null
        }
    }
}
