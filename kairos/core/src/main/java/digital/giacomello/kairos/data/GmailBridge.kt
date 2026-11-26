package digital.giacomello.kairos.data

import digital.giacomello.kairos.model.Booking
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Un volo trovato nelle email dallo script gmail-bridge/Code.gs. */
@Serializable
data class EmailFlight(
    val number: String,
    val date: String,
    val time: String? = null,
    val arrDate: String? = null,
    val arrTime: String? = null,
    val from: String? = null,
    val to: String? = null,
    val terminal: String? = null,
    val arrTerminal: String? = null,
    val gate: String? = null,
    val seat: String? = null,
    val cabin: String? = null,
    val boardingTime: String? = null,
    val gateCloses: String? = null,
    val boardingGroup: String? = null,
    val sequence: String? = null,
    val pnr: String? = null,
) {
    fun booking() = Booking(
        pnr = pnr, seat = seat, cabin = cabin, boardingTime = boardingTime,
        gateCloses = gateCloses, boardingGroup = boardingGroup, sequence = sequence,
    )
}

@Serializable
private data class BridgeResponse(val flights: List<EmailFlight> = emptyList(), val error: String? = null)

/**
 * Legge i voli estratti da Gmail dall'Apps Script che gira nell'account Google dell'utente.
 * L'URL (con token) sta in local.properties -> BuildConfig.GMAIL_BRIDGE_URL.
 */
class GmailBridge(private val url: String) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS) // con refresh=1 lo script scansiona Gmail
        .followRedirects(true)             // Apps Script risponde con un redirect 302
        .build()
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    val isConfigured get() = url.isNotBlank()

    suspend fun fetch(forceScan: Boolean = false): List<EmailFlight> = withContext(Dispatchers.IO) {
        if (!isConfigured) return@withContext emptyList()
        val full = if (forceScan) url + (if ('?' in url) "&" else "?") + "refresh=1" else url
        client.newCall(Request.Builder().url(full).build()).execute().use { resp ->
            if (!resp.isSuccessful) throw IOException("Gmail bridge HTTP ${resp.code}")
            val r = json.decodeFromString<BridgeResponse>(resp.body?.string().orEmpty())
            if (r.error != null) throw IOException("Gmail bridge: ${r.error}")
            r.flights
        }
    }
}
