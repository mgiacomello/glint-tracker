package digital.giacomello.kairos.travel

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import java.time.LocalDate
import java.util.concurrent.TimeUnit

/**
 * Scioperi dei trasporti in Italia.
 * Fonte: Ministero delle Infrastrutture e dei Trasporti, normalizzata e pubblicata ogni giorno
 * da onData ("Liberiamoli tutti!") — licenza CC BY 4.0, attribuzione obbligatoria nell'app.
 */
@Serializable
data class Strike(
    val stato: String? = null,
    val settore: String? = null,
    val categoria: String? = null,
    val modalita: String? = null,
    val rilevanza: String? = null,
    val regione: String? = null,
    val provincia: String? = null,
    val sindacati: String? = null,
    @SerialName("inizio_iso") val start: String? = null,
    @SerialName("fine_iso") val end: String? = null,
) {
    val isRevoked get() = stato?.contains("revoc", ignoreCase = true) == true
    val isNational get() = rilevanza.equals("Nazionale", true) || regione.equals("Italia", true)

    fun covers(date: String): Boolean {
        val s = start ?: return false
        return date >= s && date <= (end ?: s)
    }

    fun headline(): String = buildString {
        append(settore ?: "Trasporti")
        if (!isNational) append(" · ").append(regione ?: "")
        modalita?.let { append(" · ").append(it.lowercase()) }
    }
}

/** Sciopero rilevante per un volo, con il motivo. */
@Serializable
data class StrikeAlert(
    val title: String, val detail: String, val affectsAirline: Boolean, val affectsTransport: Boolean,
    /** Fascia oraria locale "HH:mm" (es. "DALLE 18.00 ALLE 22.00"); null = tutto il giorno. */
    val from: String? = null, val to: String? = null,
) {
    /** true se lo sciopero si sovrappone alla fascia [start, end] (ora locale italiana). */
    fun overlaps(start: java.time.LocalTime, end: java.time.LocalTime): Boolean {
        val a = from?.let { runCatching { java.time.LocalTime.parse(it) }.getOrNull() } ?: return true
        val b = to?.let { runCatching { java.time.LocalTime.parse(it) }.getOrNull() } ?: return true
        return if (a <= b) start <= b && end >= a else true // fasce a cavallo di mezzanotte: prudenza
    }

    companion object {
        private val WINDOW = Regex("DALLE\\s+(\\d{1,2})[.:](\\d{2})\\s+ALLE\\s+(\\d{1,2})[.:](\\d{2})", RegexOption.IGNORE_CASE)
        fun window(modalita: String?): Pair<String, String>? {
            val m = WINDOW.find(modalita ?: return null) ?: return null
            if (modalita.contains("24 ORE", ignoreCase = true)) return null
            val (h1, m1, h2, m2) = m.destructured
            return "%02d:%s".format(h1.toInt(), m1) to "%02d:%s".format(h2.toInt().coerceAtMost(23), if (h2.toInt() >= 24) "59" else m2)
        }
    }
}

object StrikeSource {
    const val ATTRIBUTION = "Scioperi: dati MIT via onData (CC BY 4.0)"
    private const val BASE = "https://raw.githubusercontent.com/ondata/liberiamoli-tutti/main/scioperi/data/mit/mit_data_%d.jsonl"

    private val client = OkHttpClient.Builder().callTimeout(30, TimeUnit.SECONDS).build()
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }
    private val lock = Mutex()
    private var cache: List<Strike> = emptyList()
    private var cachedAt = 0L

    /** Scarica (con cache di 6 ore) gli scioperi dell'anno corrente e del successivo. */
    suspend fun all(): List<Strike> = lock.withLock {
        if (System.currentTimeMillis() - cachedAt < 6 * 3_600_000L && cache.isNotEmpty()) return cache
        val year = LocalDate.now().year
        val fresh = withContext(Dispatchers.IO) {
            listOf(year, year + 1).flatMap { y ->
                runCatching {
                    client.newCall(Request.Builder().url(BASE.format(y)).build()).execute().use { r ->
                        if (!r.isSuccessful) emptyList()
                        else r.body?.string().orEmpty().lineSequence().filter { it.isNotBlank() }
                            .mapNotNull { runCatching { json.decodeFromString<Strike>(it) }.getOrNull() }.toList()
                    }
                }.getOrDefault(emptyList())
            }
        }
        if (fresh.isNotEmpty()) { cache = fresh; cachedAt = System.currentTimeMillis() }
        cache
    }

    /**
     * Scioperi che possono toccare il viaggio:
     *  - settore aereo (nazionale o nella regione dell'aeroporto di partenza/arrivo)
     *  - con mezzi pubblici: ferroviario / TPL / plurisettoriale nella regione di partenza
     *  - evidenzia quelli che citano la compagnia aerea del volo
     */
    fun match(
        strikes: List<Strike>, date: String, airline: String?, flightNumber: String,
        depRegion: String?, arrRegion: String?, mode: TravelMode,
    ): List<StrikeAlert> {
        if (depRegion == null && arrRegion == null) return emptyList() // solo voli che toccano l'Italia
        val airlineWords = airlineKeywords(airline, flightNumber)
        return strikes.asSequence()
            .filter { !it.isRevoked && it.covers(date) }
            .mapNotNull { s ->
                val sector = s.settore.orEmpty().lowercase()
                val inRegion = s.isNational || s.regione == depRegion || s.regione == arrRegion
                val air = sector.contains("aereo") && inRegion
                val cat = s.categoria.orEmpty().uppercase()
                val mine = air && airlineWords.any { cat.contains(it) }
                val generic = air && !Regex("SOC\\.|SOCIET").containsMatchIn(cat) // es. controllori, handling, tutto il settore
                val ground = mode == TravelMode.TRANSIT && s.regione == depRegion &&
                    (sector.contains("ferrov") || sector.contains("locale") || sector.contains("plurisett"))
                val ground2 = mode == TravelMode.TRANSIT && s.isNational &&
                    (sector.contains("ferrov") || sector.contains("plurisett"))
                val taxi = mode == TravelMode.TAXI && sector.contains("taxi") && (s.isNational || s.regione == depRegion)
                if (!(mine || generic || ground || ground2 || taxi)) return@mapNotNull null
                StrikeAlert(
                    title = when {
                        mine -> "Sciopero della tua compagnia"
                        air -> "Sciopero trasporto aereo"
                        taxi -> "Sciopero taxi"
                        else -> "Sciopero ${s.settore?.lowercase() ?: "trasporti"}"
                    },
                    detail = (listOfNotNull(s.categoria?.lowercase()?.replaceFirstChar { it.uppercase() }, s.modalita?.lowercase(), s.sindacati) +
                        listOfNotNull(if (ground || ground2) "valuta taxi/NCC o una corsa prima delle fasce di garanzia" else null))
                        .joinToString(" · "),
                    affectsAirline = mine || generic,
                    affectsTransport = ground || ground2 || taxi,
                    from = StrikeAlert.window(s.modalita)?.first,
                    to = StrikeAlert.window(s.modalita)?.second,
                )
            }
            .distinctBy { it.title + it.detail }
            .toList()
    }

    private fun airlineKeywords(airline: String?, number: String): List<String> {
        val code = number.take(2).uppercase()
        val byCode = mapOf(
            "AZ" to "ITA AIRWAYS", "FR" to "RYANAIR", "U2" to "EASYJET", "EC" to "EASYJET", "DS" to "EASYJET",
            "W4" to "WIZZ", "W6" to "WIZZ", "W9" to "WIZZ", "VY" to "VUELING", "BA" to "BRITISH",
            "LH" to "LUFTHANSA", "AF" to "AIR FRANCE", "KL" to "KLM", "V7" to "VOLOTEA", "IB" to "IBERIA",
            "EK" to "EMIRATES", "TK" to "TURKISH", "LX" to "SWISS", "DY" to "NORWEGIAN", "AP" to "AIR ONE",
        )
        return listOfNotNull(byCode[code], airline?.uppercase()?.substringBefore(" ")?.takeIf { it.length >= 4 })
    }
}
