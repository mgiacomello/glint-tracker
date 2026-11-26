package digital.giacomello.kairos.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import digital.giacomello.kairos.model.Endpoint
import digital.giacomello.kairos.model.Flight
import digital.giacomello.kairos.model.FlightStatus
import digital.giacomello.kairos.model.Source
import digital.giacomello.kairos.travel.Airports
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneOffset

private val Context.store by preferencesDataStore(name = "kairos")

/**
 * Archivio locale dei voli seguiti + logica di aggiornamento e import da Gmail.
 * Tutto resta sul dispositivo: verso il fornitore dati vanno solo numero volo e data.
 */
class FlightRepository(
    private val context: Context,
    private val provider: FlightProvider,
) {
    private val key = stringPreferencesKey("flights")
    private val dismissedKey = stringSetPreferencesKey("dismissed")
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    val flights: Flow<List<Flight>> = context.store.data.map { prefs ->
        decode(prefs[key]).sortedWith(compareBy({ it.status.isFinished }, { it.departure.best ?: Long.MAX_VALUE }))
    }

    suspend fun snapshot(): List<Flight> = flights.first()

    suspend fun get(id: String): Flight? = snapshot().firstOrNull { it.id == id }

    /** Ricerca e aggiunge un volo a mano. Lancia FlightNotFoundException se non esiste. */
    suspend fun add(number: String, date: String): Flight {
        val f = provider.lookup(number, date)
            ?: throw FlightNotFoundException("Nessun volo ${Flight.normalizeNumber(number)} il $date")
        context.store.edit { it[dismissedKey] = (it[dismissedKey] ?: emptySet()) - f.id }
        save { list ->
            val old = list.firstOrNull { it.id == f.id }
            list.filterNot { it.id == f.id } + f.copy(booking = old?.booking, source = old?.source ?: Source.MANUAL)
        }
        return f
    }

    /** Rimuove un volo. Se veniva da Gmail non verrà re-importato. */
    suspend fun remove(id: String) {
        context.store.edit { it[dismissedKey] = (it[dismissedKey] ?: emptySet()) + id }
        save { list -> list.filterNot { it.id == id } }
    }

    /**
     * Importa i voli trovati nelle email. Per ognuno:
     *  - già presente -> aggiorna posto/PNR/imbarco (es. arriva la carta d'imbarco)
     *  - nuovo -> cerca i dati live; se il fornitore non lo conosce ancora
     *    (es. volo fra 10 mesi) lo crea dai soli dati email e riprova più avanti.
     */
    suspend fun importFromEmail(found: List<EmailFlight>): List<FlightEvent> {
        val dismissed = context.store.data.first()[dismissedKey].orEmpty()
        val current = snapshot().associateBy { it.id }.toMutableMap()
        val events = mutableListOf<FlightEvent>()
        val yesterday = LocalDate.now().minusDays(1).toString()

        for (ef in found) {
            if (ef.date < yesterday) continue
            val id = Flight.idFor(ef.number, ef.date)
            if (id in dismissed) continue
            val existing = current[id]
            if (existing != null) {
                val updated = existing.withEmail(ef.booking(), ef.terminal, ef.arrTerminal, ef.gate)
                if (updated.booking?.seat != null && existing.booking?.seat == null) {
                    events += FlightEvent(updated, "${updated.number} · Posto ${updated.booking.seat}", "Carta d'imbarco trovata in Gmail")
                }
                current[id] = updated
                continue
            }
            val live = runCatching { provider.lookup(ef.number, ef.date) }.getOrNull()
            val f = (live ?: fromEmail(ef))
                .copy(source = Source.GMAIL)
                .withEmail(ef.booking(), ef.terminal, ef.arrTerminal, ef.gate)
            current[id] = f
            events += FlightEvent(
                f, "Nuovo volo da Gmail",
                "${f.number} ${f.departure.iata}→${f.arrival.iata} · ${ef.date}${f.booking?.seat?.let { " · posto $it" } ?: ""}",
            )
        }
        save { current.values.toList() }
        return events
    }

    /**
     * Aggiorna i voli "caldi" e restituisce gli eventi da notificare.
     * Politica di consumo API (le chiamate costano):
     *  - volo concluso da > 6h  -> mai
     *  - finestra calda (da 48h prima della partenza a 3h dopo l'arrivo) -> ogni giro
     *  - altrimenti -> al massimo ogni 6 ore
     */
    suspend fun refreshAll(force: Boolean = false): List<FlightEvent> {
        val now = System.currentTimeMillis()
        val events = mutableListOf<FlightEvent>()
        val updated = snapshot().map { old ->
            if (!force && !shouldRefresh(old, now)) return@map old
            val fresh = runCatching { provider.lookup(old.number, old.date) }.getOrNull() ?: return@map old
            val merged = fresh.copy(source = old.source).withEmail(old.booking, old.departure.terminal, old.arrival.terminal)
            if (!old.emailOnly) events += ChangeDetector.diff(old, merged)
            merged
        }
        save { updated }
        return events
    }

    suspend fun refreshOne(id: String): List<FlightEvent> {
        val old = get(id) ?: return emptyList()
        val fresh = provider.lookup(old.number, old.date) ?: return emptyList()
        val merged = fresh.copy(source = old.source).withEmail(old.booking, old.departure.terminal, old.arrival.terminal)
        save { list -> list.map { if (it.id == id) merged else it } }
        return if (old.emailOnly) emptyList() else ChangeDetector.diff(old, merged)
    }

    private fun shouldRefresh(f: Flight, now: Long): Boolean {
        val dep = f.departure.best ?: return true
        val arr = f.arrival.best ?: dep
        if (f.status.isFinished && now > arr + 6 * H) return false
        val hot = now in (dep - 48 * H)..(arr + 3 * H)
        return hot || now - f.lastUpdated > 6 * H
    }

    /**
     * Volo creato solo dai dati email. Gli orari nell'email sono in ora locale dell'aeroporto:
     * se l'aeroporto è in tabella usiamo il suo fuso (countdown corretto), altrimenti offset 0
     * (ora mostrata corretta, countdown approssimato) finché arrivano i dati live.
     */
    private fun fromEmail(ef: EmailFlight): Flight {
        fun endpoint(iata: String?, date: String?, time: String?): Endpoint {
            val ap = Airports.get(iata)
            val ldt = runCatching { LocalDateTime.parse("${date!!}T${time!!}") }.getOrNull()
            val offset = if (ap != null && ldt != null) ap.zone.rules.getOffset(ldt) else ZoneOffset.UTC
            return Endpoint(
                iata = iata ?: "???", name = ap?.name,
                scheduled = ldt?.toInstant(offset)?.toEpochMilli(),
                utcOffsetSeconds = offset.totalSeconds,
            )
        }
        return Flight(
            id = Flight.idFor(ef.number, ef.date),
            number = Flight.normalizeNumber(ef.number),
            date = ef.date,
            status = FlightStatus.SCHEDULED,
            departure = endpoint(ef.from, ef.date, ef.time),
            arrival = endpoint(ef.to, ef.arrDate ?: ef.date, ef.arrTime),
            lastUpdated = 0L, // forza un nuovo tentativo al prossimo giro
            emailOnly = true,
        )
    }

    private fun decode(s: String?): List<Flight> =
        s?.let { runCatching { json.decodeFromString<List<Flight>>(it) }.getOrNull() }.orEmpty()

    private suspend fun save(transform: (List<Flight>) -> List<Flight>) {
        context.store.edit { prefs -> prefs[key] = json.encodeToString(transform(decode(prefs[key]))) }
    }

    private companion object { const val H = 3_600_000L }
}
