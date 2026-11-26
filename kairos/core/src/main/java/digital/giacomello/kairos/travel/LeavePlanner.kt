package digital.giacomello.kairos.travel

import digital.giacomello.kairos.model.Flight
import kotlinx.serialization.Serializable
import java.time.LocalDate
import java.time.LocalTime
import kotlin.math.roundToInt

/** Una voce del "conto alla rovescia" all'indietro dal gate a casa. */
@Serializable
data class PlanStep(val label: String, val minutes: Int)

@Serializable
data class LeavePlan(
    val flightId: String,
    /** Quando uscire di casa (epoch millis). */
    val leaveAt: Long,
    /** Quando arrivare in aeroporto. */
    val arriveAirportAt: Long,
    /** Orario limite al gate (chiusura gate). */
    val gateBy: Long,
    val mode: TravelMode,
    val travelMinutes: Int,
    /** "Google, traffico previsto" / "stima" */
    val travelSource: String,
    val travelSummary: String? = null,
    val loungeMinutes: Int = 0,
    val steps: List<PlanStep> = emptyList(),
    val strikes: List<StrikeAlert> = emptyList(),
    val computedAt: Long = System.currentTimeMillis(),
    val notifiedPrepare: Boolean = false,
    val notifiedLeave: Boolean = false,
    val notifiedStrike: Boolean = false,
)

/**
 * Calcolo "quando partire", all'indietro dal gate:
 *
 *  uscita = chiusura gate − cammino al gate − [lounge] − controlli (+ passaporti)
 *           − [bag drop] − viaggio (traffico/mezzi) − margine (+ sciopero)
 *
 * con vincolo di arrivo minimo in aeroporto (60' corto raggio, 120' con bagaglio, 150' lungo raggio).
 * Se il volo è in ritardo di oltre 15', l'orario si sposta solo del 50% del ritardo:
 * le compagnie possono recuperare e il gate chiude comunque in base all'orario aggiornato.
 */
object LeavePlanner {

    fun plan(
        f: Flight, prefs: TravelPrefs, travelMinutes: Int, travelSource: String,
        travelSummary: String? = null, strikes: List<StrikeAlert> = emptyList(),
    ): LeavePlan? {
        val sched = f.departure.scheduled ?: f.departure.best ?: return null
        val best = f.departure.best ?: sched
        val delay = ((best - sched) / 60_000L).toInt()
        val anchorDep = if (delay > 15) sched + (delay / 2) * 60_000L else best

        val dep = Airports.get(f.departure.iata)
        val arr = Airports.get(f.arrival.iata)
        val kind = dep?.kind ?: AirportKind.HUB
        val longHaul = (f.durationMinutes ?: 0) > 6 * 60
        // Controllo passaporti: se uno dei due scali è extra-Schengen (es. Italia↔UK),
        // tranne i voli domestici extra-Schengen (es. LHR→EDI). Aeroporti ignoti: solo lungo raggio.
        val nonSchengen = if (dep != null && arr != null) {
            !(dep.schengen && arr.schengen) && !(dep.zone == arr.zone && !dep.schengen && !arr.schengen)
        } else longHaul

        val steps = mutableListOf<PlanStep>()

        // 1. Chiusura gate: dalla carta d'imbarco se c'è, altrimenti regola dell'aeroporto
        val gateCloseMin = if (longHaul) kind.gateCloseLong else kind.gateCloseShort
        val gateBy = boardingPassTime(f, f.booking?.gateCloses, dep, anchorDep) ?: (anchorDep - gateCloseMin * 60_000L)
        var t = gateBy

        fun back(label: String, min: Int) {
            if (min <= 0) return
            steps += PlanStep(label, min)
            t -= min * 60_000L
        }

        back("Cammino al gate", kind.walkToGate)
        val lounge = if (prefs.lounge) (if (prefs.loungeMinutes > 0) prefs.loungeMinutes else kind.lounge) else 0
        back("Lounge", lounge)
        if (nonSchengen) back("Controllo passaporti", kind.passport)
        back(if (prefs.fastTrack) "Controlli (fast track)" else "Controlli di sicurezza", if (prefs.fastTrack) kind.securityFastTrack else kind.security)
        if (prefs.checkedBag) back("Consegna bagaglio", kind.bagDrop)

        // Arrivo minimo in aeroporto
        val minAtAirport = when {
            longHaul -> 150
            prefs.checkedBag -> 120
            f.departure.iata == "LCY" -> 45
            else -> 60
        }
        val latestArrival = anchorDep - minAtAirport * 60_000L
        if (t > latestArrival) {
            val extra = ((t - latestArrival) / 60_000L).toInt()
            back("Anticipo minimo consigliato", extra)
        }
        val arriveAirportAt = t

        val strikeExtra = if (strikes.any { it.affectsTransport || it.affectsAirline }) 30 else 0
        val margin = kind.margin + (travelMinutes * 0.10).roundToInt() + prefs.extraMargin + strikeExtra
        // Ordine inverso: letto da casa al gate diventa "viaggio → margine → controlli → ..."
        back(if (strikeExtra > 0) "Margine (+30' sciopero)" else "Margine", margin)
        back("Viaggio (${prefs.mode.label.lowercase()})", travelMinutes)

        return LeavePlan(
            flightId = f.id,
            leaveAt = t,
            arriveAirportAt = arriveAirportAt,
            gateBy = gateBy,
            mode = prefs.mode,
            travelMinutes = travelMinutes,
            travelSource = travelSource,
            travelSummary = travelSummary,
            loungeMinutes = lounge,
            steps = steps,
            strikes = strikes,
        )
    }

    /** Converte un "HH:mm" della carta d'imbarco (ora locale aeroporto) in epoch millis. */
    private fun boardingPassTime(f: Flight, hhmm: String?, dep: Airport?, anchorDep: Long): Long? {
        if (hhmm == null) return null
        val time = runCatching { LocalTime.parse(hhmm) }.getOrNull() ?: return null
        val date = runCatching { LocalDate.parse(f.date) }.getOrNull() ?: return null
        val millis = if (dep != null) date.atTime(time).atZone(dep.zone).toInstant().toEpochMilli()
        else date.atTime(time).toInstant(java.time.ZoneOffset.ofTotalSeconds(f.departure.utcOffsetSeconds)).toEpochMilli()
        // Plausibilità: deve cadere entro 2h prima della partenza
        return millis.takeIf { it in (anchorDep - 2 * 3_600_000L)..anchorDep }
    }
}
