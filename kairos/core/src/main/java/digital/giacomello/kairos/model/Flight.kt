package digital.giacomello.kairos.model

import kotlinx.serialization.Serializable
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

@Serializable
enum class FlightStatus(val label: String) {
    SCHEDULED("In orario"),
    DELAYED("In ritardo"),
    CHECK_IN("Check-in"),
    BOARDING("Imbarco"),
    GATE_CLOSED("Gate chiuso"),
    DEPARTED("Decollato"),
    EN_ROUTE("In volo"),
    APPROACHING("In avvicinamento"),
    LANDED("Atterrato"),
    ARRIVED("Arrivato"),
    CANCELED("Cancellato"),
    DIVERTED("Dirottato"),
    UNKNOWN("Sconosciuto");

    val isAirborne get() = this == DEPARTED || this == EN_ROUTE || this == APPROACHING
    val isFinished get() = this == LANDED || this == ARRIVED || this == CANCELED || this == DIVERTED
}

@Serializable
enum class Source { MANUAL, GMAIL }

/** Un capo del volo (partenza o arrivo). Tutti i tempi sono epoch millis UTC. */
@Serializable
data class Endpoint(
    val iata: String,
    val name: String? = null,
    val city: String? = null,
    val scheduled: Long? = null,
    val estimated: Long? = null,
    val actual: Long? = null,
    /** Offset del fuso dell'aeroporto, per mostrare l'ora locale. */
    val utcOffsetSeconds: Int = 0,
    val terminal: String? = null,
    val gate: String? = null,
    val checkInDesk: String? = null,
    val baggageBelt: String? = null,
    /** Coordinate dell'aeroporto (per la mappa), se fornite dalla sorgente dati. */
    val lat: Double? = null,
    val lng: Double? = null,
) {
    /** Miglior stima disponibile: effettivo > stimato > programmato. */
    val best: Long? get() = actual ?: estimated ?: scheduled

    /** Ritardo in minuti (negativo = anticipo). */
    val delayMinutes: Int
        get() {
            val s = scheduled ?: return 0
            val b = best ?: return 0
            return ((b - s) / 60_000L).toInt()
        }

    fun localTime(millis: Long?): String {
        if (millis == null) return "--:--"
        return HHMM.format(Instant.ofEpochMilli(millis).atOffset(ZoneOffset.ofTotalSeconds(utcOffsetSeconds)))
    }

    val displayName: String get() = city ?: name ?: iata

    private companion object {
        val HHMM: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
    }
}

/** Dati della prenotazione/carta d'imbarco, presi dalle email (non dalle API voli). */
@Serializable
data class Booking(
    val pnr: String? = null,
    val seat: String? = null,
    val cabin: String? = null,
    /** Orari locali "HH:mm" come scritti sulla carta d'imbarco. */
    val boardingTime: String? = null,
    val gateCloses: String? = null,
    val boardingGroup: String? = null,
    val sequence: String? = null,
) {
    val isEmpty get() = listOf(pnr, seat, cabin, boardingTime, gateCloses, boardingGroup, sequence).all { it == null }

    /** I nuovi valori non nulli vincono (es. la carta d'imbarco aggiorna la conferma). */
    fun mergedWith(o: Booking?): Booking = if (o == null) this else Booking(
        pnr = o.pnr ?: pnr, seat = o.seat ?: seat, cabin = o.cabin ?: cabin,
        boardingTime = o.boardingTime ?: boardingTime, gateCloses = o.gateCloses ?: gateCloses,
        boardingGroup = o.boardingGroup ?: boardingGroup, sequence = o.sequence ?: sequence,
    )
}

@Serializable
data class Flight(
    /** Chiave univoca: NUMERO_yyyy-MM-dd */
    val id: String,
    val number: String,
    val date: String,
    val airline: String? = null,
    val status: FlightStatus = FlightStatus.UNKNOWN,
    val departure: Endpoint,
    val arrival: Endpoint,
    val aircraftModel: String? = null,
    val aircraftReg: String? = null,
    val distanceKm: Int? = null,
    val lastUpdated: Long = 0L,
    val isDemo: Boolean = false,
    val booking: Booking? = null,
    val source: Source = Source.MANUAL,
    /** true = il fornitore dati non conosce (ancora) il volo: dati solo da email, niente live. */
    val emailOnly: Boolean = false,
) {
    /** Avanzamento 0..1 del volo, basato sui tempi migliori. */
    fun progress(now: Long = System.currentTimeMillis()): Float {
        if (status.isFinished && status != FlightStatus.CANCELED) return 1f
        val d = departure.best ?: return 0f
        val a = arrival.best ?: return 0f
        if (now <= d || a <= d) return 0f
        return ((now - d).toFloat() / (a - d)).coerceIn(0f, 1f)
    }

    val durationMinutes: Int?
        get() {
            val d = departure.best ?: return null
            val a = arrival.best ?: return null
            return ((a - d) / 60_000L).toInt()
        }

    /**
     * Unisce ai dati live quelli della prenotazione (posto, PNR...) e, dove l'API
     * non li fornisce, terminal/gate letti dalla carta d'imbarco.
     */
    fun withEmail(b: Booking?, depTerminal: String? = null, arrTerminal: String? = null, gate: String? = null): Flight {
        val merged = (booking ?: Booking()).mergedWith(b)
        return copy(
            booking = merged.takeUnless { it.isEmpty },
            departure = departure.copy(
                terminal = departure.terminal ?: depTerminal,
                gate = departure.gate ?: gate,
            ),
            arrival = arrival.copy(terminal = arrival.terminal ?: arrTerminal),
        )
    }

    companion object {
        fun idFor(number: String, date: String) = "${normalizeNumber(number)}_$date"

        /** "BA 0570" -> "BA570", "w4-6302" -> "W46302" */
        fun normalizeNumber(raw: String): String {
            val s = raw.uppercase().replace(" ", "").replace("-", "")
            val m = Regex("^([A-Z0-9]{2})(\\d{1,5})$").find(s) ?: return s
            return m.groupValues[1] + m.groupValues[2].trimStart('0').ifEmpty { "0" }
        }
    }
}

/** Formatta una durata in modo compatto: "2h 05m", "45m", "3g 4h". */
fun formatDuration(minutes: Long): String {
    val m = kotlin.math.abs(minutes)
    return when {
        m >= 60 * 24 -> "${m / (60 * 24)}g ${(m % (60 * 24)) / 60}h"
        m >= 60 -> "${m / 60}h ${"%02d".format(m % 60)}m"
        else -> "${m}m"
    }
}
