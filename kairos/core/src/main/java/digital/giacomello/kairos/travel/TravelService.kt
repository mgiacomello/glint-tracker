package digital.giacomello.kairos.travel

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import digital.giacomello.kairos.Graph
import digital.giacomello.kairos.data.FlightEvent
import digital.giacomello.kairos.model.Flight
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val Context.planStore by preferencesDataStore(name = "kairos_plans")

/**
 * Orchestratore "quando partire": per i voli delle prossime 36 ore calcola il piano,
 * aggiorna il tempo di viaggio con il traffico e genera gli avvisi
 * "Preparati" (30' prima), "Esci ora" e "Sciopero".
 */
class TravelService(private val context: Context) {
    private val key = stringPreferencesKey("plans")
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    val settings = TravelSettings(context)
    private val routes by lazy { RoutesClient(Graph.mapsKey) }

    val plans: Flow<Map<String, LeavePlan>> = context.planStore.data.map { decode(it[key]) }

    suspend fun planFor(id: String): LeavePlan? = plans.first()[id]

    /** Ricalcola i piani e restituisce gli avvisi da mostrare. */
    suspend fun update(flights: List<Flight>, force: Boolean = false): List<FlightEvent> {
        val prefs = settings.current()
        val now = System.currentTimeMillis()
        val old = plans.first()
        val events = mutableListOf<FlightEvent>()
        val strikes = runCatching { StrikeSource.all() }.getOrDefault(emptyList())

        val upcoming = flights.filter { f ->
            val dep = f.departure.best ?: return@filter false
            !f.status.isFinished && !f.status.isAirborne && dep in now..(now + 36 * 3_600_000L)
        }
        val next = mutableMapOf<String, LeavePlan>()
        for (f in upcoming) {
            val prev = old[f.id]
            val depA = Airports.get(f.departure.iata)
            val arrA = Airports.get(f.arrival.iata)
            val alerts = StrikeSource.match(
                strikes, f.date, f.airline, f.number, depA?.itRegion, arrA?.itRegion, prefs.mode,
            )

            // Tempo di viaggio: Google (con traffico) se c'è indirizzo e chiave; ricalcolo
            // più frequente vicino all'uscita per contenere i costi API.
            val minutesToLeave = prev?.let { (it.leaveAt - now) / 60_000 } ?: Long.MAX_VALUE
            val stale = prev == null || force || prev.mode != prefs.mode ||
                now - prev.computedAt > when {
                    minutesToLeave < 90 -> 10 * 60_000L
                    minutesToLeave < 6 * 60 -> 30 * 60_000L
                    else -> 3 * 3_600_000L
                }
            var travel = prev?.travelMinutes ?: prefs.fallbackTravelMinutes
            var source = prev?.travelSource ?: "stima"
            var summary = prev?.travelSummary
            if (stale && prefs.origin.isNotBlank() && routes.isConfigured) {
                val guess = LeavePlanner.plan(f, prefs, travel, source)?.leaveAt ?: now
                runCatching { routes.travel(prefs.origin, depA, f.departure.iata, prefs.mode, guess) }
                    .onSuccess {
                        travel = it.minutes
                        source = if (prefs.mode == TravelMode.TRANSIT) "Google, mezzi pubblici" else "Google, traffico previsto"
                        summary = it.summary
                    }
            } else if (prefs.origin.isBlank() || !routes.isConfigured) {
                travel = prefs.fallbackTravelMinutes; source = "stima"; summary = null
            }

            val p = LeavePlanner.plan(f, prefs, travel, source, summary, alerts) ?: continue
            var plan = p.copy(
                computedAt = if (stale) now else prev?.computedAt ?: now,
                notifiedPrepare = prev?.notifiedPrepare == true,
                notifiedLeave = prev?.notifiedLeave == true,
                notifiedStrike = prev?.notifiedStrike == true,
            )

            if (prefs.notifyLeave) {
                val tag = "${f.number} ${f.departure.iata}→${f.arrival.iata}"
                val at = hhmm(plan.leaveAt)
                if (!plan.notifiedPrepare && now >= plan.leaveAt - 30 * 60_000L && now < plan.leaveAt) {
                    events += FlightEvent(f, "$tag · Preparati", "Esci alle $at (${plan.mode.label.lowercase()}, ${plan.travelMinutes}' di viaggio)${if (plan.loungeMinutes > 0) " · ${plan.loungeMinutes}' in lounge" else ""}")
                    plan = plan.copy(notifiedPrepare = true)
                }
                if (!plan.notifiedLeave && now >= plan.leaveAt - 5 * 60_000L) {
                    events += FlightEvent(f, "$tag · Esci ora", "Per essere al gate entro le ${hhmm(plan.gateBy)}. ${plan.travelSummary ?: ""}".trim(), urgent = true)
                    plan = plan.copy(notifiedLeave = true, notifiedPrepare = true)
                }
            }
            if (!plan.notifiedStrike && plan.strikes.isNotEmpty()) {
                val s = plan.strikes.first()
                events += FlightEvent(f, "${f.number} · ${s.title}", "${f.date}: ${s.detail}. Verifica con la compagnia.", urgent = s.affectsAirline)
                plan = plan.copy(notifiedStrike = true)
            }
            next[f.id] = plan
        }
        context.planStore.edit { it[key] = json.encodeToString(next) }
        return events
    }

    private fun decode(s: String?): Map<String, LeavePlan> =
        s?.let { runCatching { json.decodeFromString<Map<String, LeavePlan>>(it) }.getOrNull() }.orEmpty()

    companion object {
        private val HHMM = DateTimeFormatter.ofPattern("HH:mm")
        fun hhmm(millis: Long): String = HHMM.format(Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault()))
    }
}
