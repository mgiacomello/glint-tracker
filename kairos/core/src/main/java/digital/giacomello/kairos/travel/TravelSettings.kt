package digital.giacomello.kairos.travel

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable

@Serializable
enum class TravelMode(val label: String) {
    TRANSIT("Mezzi pubblici"),
    TAXI("Taxi / NCC"),
    DRIVE("Auto"),
}

/** Preferenze di viaggio dell'utente. */
data class TravelPrefs(
    /** Indirizzo da cui si parte di solito (casa/ufficio). Vuoto = non calcolare il percorso. */
    val origin: String = "",
    val mode: TravelMode = TravelMode.TRANSIT,
    val checkedBag: Boolean = false,
    /** Ha accesso lounge (es. LoungeKey) e vuole il tempo per andarci. */
    val lounge: Boolean = true,
    /** Minuti in lounge; 0 = usa il default per tipo di aeroporto. */
    val loungeMinutes: Int = 0,
    val fastTrack: Boolean = false,
    /** Minuti di sicurezza in più, a gusto personale. */
    val extraMargin: Int = 0,
    /** Tempo di viaggio da usare se manca la chiave Google o la rete. */
    val fallbackTravelMinutes: Int = 60,
    val notifyLeave: Boolean = true,
)

private val Context.travelStore by preferencesDataStore(name = "kairos_travel")

class TravelSettings(private val context: Context) {
    private object K {
        val origin = stringPreferencesKey("origin")
        val mode = stringPreferencesKey("mode")
        val bag = booleanPreferencesKey("checked_bag")
        val lounge = booleanPreferencesKey("lounge")
        val loungeMin = intPreferencesKey("lounge_min")
        val fast = booleanPreferencesKey("fast_track")
        val extra = intPreferencesKey("extra_margin")
        val fallback = intPreferencesKey("fallback_travel")
        val notify = booleanPreferencesKey("notify_leave")
    }

    val prefs: Flow<TravelPrefs> = context.travelStore.data.map { p ->
        val d = TravelPrefs()
        TravelPrefs(
            origin = p[K.origin] ?: d.origin,
            mode = p[K.mode]?.let { runCatching { TravelMode.valueOf(it) }.getOrNull() } ?: d.mode,
            checkedBag = p[K.bag] ?: d.checkedBag,
            lounge = p[K.lounge] ?: d.lounge,
            loungeMinutes = p[K.loungeMin] ?: d.loungeMinutes,
            fastTrack = p[K.fast] ?: d.fastTrack,
            extraMargin = p[K.extra] ?: d.extraMargin,
            fallbackTravelMinutes = p[K.fallback] ?: d.fallbackTravelMinutes,
            notifyLeave = p[K.notify] ?: d.notifyLeave,
        )
    }

    suspend fun current(): TravelPrefs = prefs.first()

    suspend fun update(t: TravelPrefs) {
        context.travelStore.edit { p ->
            p[K.origin] = t.origin.trim()
            p[K.mode] = t.mode.name
            p[K.bag] = t.checkedBag
            p[K.lounge] = t.lounge
            p[K.loungeMin] = t.loungeMinutes.coerceIn(0, 240)
            p[K.fast] = t.fastTrack
            p[K.extra] = t.extraMargin.coerceIn(0, 120)
            p[K.fallback] = t.fallbackTravelMinutes.coerceIn(5, 300)
            p[K.notify] = t.notifyLeave
        }
    }
}
