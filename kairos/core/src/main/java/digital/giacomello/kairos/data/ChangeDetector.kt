package digital.giacomello.kairos.data

import digital.giacomello.kairos.model.Flight
import digital.giacomello.kairos.model.FlightStatus
import kotlin.math.abs

/** Evento rilevante da notificare all'utente. */
data class FlightEvent(val flight: Flight, val title: String, val text: String, val urgent: Boolean = false)

/**
 * Confronta due versioni dello stesso volo e produce gli eventi "alla Flighty":
 * cambio gate/terminal, ritardo/anticipo, imbarco, decollo, atterraggio, nastro bagagli,
 * cancellazione, dirottamento.
 */
object ChangeDetector {

    /** Sotto questa soglia (minuti) le variazioni d'orario non vengono notificate. */
    private const val DELAY_THRESHOLD = 10

    fun diff(old: Flight, new: Flight): List<FlightEvent> {
        val out = mutableListOf<FlightEvent>()
        val tag = "${new.number} ${new.departure.iata}→${new.arrival.iata}"

        // Stato
        if (old.status != new.status) {
            when (new.status) {
                FlightStatus.BOARDING -> out += FlightEvent(new, "$tag · Imbarco", "Imbarco iniziato${new.departure.gate?.let { " al gate $it" } ?: ""}", urgent = true)
                FlightStatus.GATE_CLOSED -> out += FlightEvent(new, "$tag · Gate chiuso", "Il gate ${new.departure.gate ?: ""} è chiuso")
                FlightStatus.DEPARTED, FlightStatus.EN_ROUTE ->
                    if (!old.status.isAirborne) out += FlightEvent(new, "$tag · Decollato",
                        "Arrivo previsto ${new.arrival.localTime(new.arrival.best)} ora locale")
                FlightStatus.LANDED, FlightStatus.ARRIVED ->
                    if (old.status != FlightStatus.LANDED && old.status != FlightStatus.ARRIVED)
                        out += FlightEvent(new, "$tag · Atterrato",
                            "Atterrato alle ${new.arrival.localTime(new.arrival.best)}${new.arrival.gate?.let { " · gate $it" } ?: ""}")
                FlightStatus.CANCELED -> out += FlightEvent(new, "$tag · CANCELLATO", "Il volo è stato cancellato. Contatta la compagnia.", urgent = true)
                FlightStatus.DIVERTED -> out += FlightEvent(new, "$tag · Dirottato", "Il volo è stato dirottato", urgent = true)
                else -> Unit
            }
        }

        // Gate e terminal
        gateChange(old.departure.gate, new.departure.gate)?.let { out += FlightEvent(new, "$tag · Gate partenza", it, urgent = true) }
        gateChange(old.departure.terminal, new.departure.terminal, "Terminal")?.let { out += FlightEvent(new, "$tag · Terminal", it, urgent = true) }
        gateChange(old.arrival.gate, new.arrival.gate)?.let { out += FlightEvent(new, "$tag · Gate arrivo", it) }

        // Nastro bagagli
        if (old.arrival.baggageBelt == null && new.arrival.baggageBelt != null) {
            out += FlightEvent(new, "$tag · Bagagli", "Ritiro bagagli al nastro ${new.arrival.baggageBelt}")
        }

        // Orari (solo prima del decollo per la partenza, sempre per l'arrivo finché non atterra)
        if (!new.status.isAirborne && !new.status.isFinished) {
            val d0 = old.departure.delayMinutes
            val d1 = new.departure.delayMinutes
            if (abs(d1 - d0) >= DELAY_THRESHOLD) {
                val txt = when {
                    d1 > 0 -> "Partenza ora alle ${new.departure.localTime(new.departure.best)} (+$d1 min)"
                    else -> "Di nuovo in orario: partenza alle ${new.departure.localTime(new.departure.best)}"
                }
                out += FlightEvent(new, "$tag · ${if (d1 > d0) "Ritardo" else "Orario aggiornato"}", txt, urgent = d1 - d0 >= 30)
            }
        } else if (new.status.isAirborne) {
            val a0 = old.arrival.best ?: 0
            val a1 = new.arrival.best ?: 0
            if (a0 != 0L && abs(a1 - a0) >= DELAY_THRESHOLD * 60_000L) {
                out += FlightEvent(new, "$tag · Nuovo orario d'arrivo", "Atterraggio previsto alle ${new.arrival.localTime(a1)}")
            }
        }
        return out
    }

    private fun gateChange(old: String?, new: String?, label: String = "Gate"): String? = when {
        new == null || old == new -> null
        old == null -> "$label assegnato: $new"
        else -> "$label cambiato: $old → $new"
    }
}
