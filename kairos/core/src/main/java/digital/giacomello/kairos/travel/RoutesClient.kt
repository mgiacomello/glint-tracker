package digital.giacomello.kairos.travel

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.time.Instant
import java.util.concurrent.TimeUnit

/**
 * Tempo di viaggio porta → aeroporto con Google Routes API (computeRoutes).
 * - Auto/Taxi: TRAFFIC_AWARE con traffico previsto all'orario di partenza.
 * - Mezzi pubblici: TRANSIT (treni, metro, bus; es. Malpensa Express, Leonardo Express dove coperti).
 * Costo: lo SKU "Pro" (traffico) ha una quota gratuita mensile; l'app limita le chiamate.
 */
class RoutesClient(private val apiKey: String) {
    private val client = OkHttpClient.Builder().callTimeout(20, TimeUnit.SECONDS).build()
    private val json = Json { ignoreUnknownKeys = true }

    val isConfigured get() = apiKey.isNotBlank()

    /**
     * @param departAt per i mezzi pubblici: orario della prima corsa da prendere (es. partenza del treno),
     *                 già al netto del cammino fino alla fermata. null per auto/taxi.
     */
    data class Result(val minutes: Int, val km: Double?, val summary: String?, val departAt: Long? = null)

    /**
     * @param departAt auto/taxi: orario di partenza previsto (per il traffico).
     * @param arriveBy mezzi pubblici: entro quando arrivare in aeroporto; Google sceglie la corsa giusta.
     */
    suspend fun travel(origin: String, dest: Airport?, destIata: String, mode: TravelMode, departAt: Long, arriveBy: Long? = null): Result =
        withContext(Dispatchers.IO) {
            val transit = mode == TravelMode.TRANSIT
            val body = buildJsonObject {
                putJsonObject("origin") { put("address", origin) }
                putJsonObject("destination") {
                    if (dest != null) putJsonObject("location") {
                        putJsonObject("latLng") { put("latitude", dest.lat); put("longitude", dest.lng) }
                    } else put("address", "$destIata airport")
                }
                put("travelMode", if (transit) "TRANSIT" else "DRIVE")
                if (!transit) put("routingPreference", "TRAFFIC_AWARE")
                if (transit && arriveBy != null && arriveBy > System.currentTimeMillis() + 10 * 60_000) {
                    // Mezzi: orari fissi -> chiediamo "arrivare entro", non "partire alle"
                    put("arrivalTime", Instant.ofEpochMilli(arriveBy).toString())
                } else {
                    // departureTime deve essere nel futuro
                    val t = maxOf(departAt, System.currentTimeMillis() + 60_000)
                    put("departureTime", Instant.ofEpochMilli(t).toString())
                }
                put("languageCode", "it")
            }

            val req = Request.Builder()
                .url("https://routes.googleapis.com/directions/v2:computeRoutes")
                .header("X-Goog-Api-Key", apiKey)
                .header(
                    "X-Goog-FieldMask",
                    listOf(
                        "routes.duration", "routes.distanceMeters", "routes.description",
                        "routes.legs.steps.travelMode", "routes.legs.steps.staticDuration",
                        "routes.legs.steps.transitDetails.transitLine.nameShort",
                        "routes.legs.steps.transitDetails.transitLine.name",
                        "routes.legs.steps.transitDetails.stopDetails.departureTime",
                        "routes.legs.steps.transitDetails.stopDetails.departureStop.name",
                    ).joinToString(","),
                )
                .post(body.toString().toRequestBody("application/json".toMediaType()))
                .build()

            client.newCall(req).execute().use { resp ->
                val txt = resp.body?.string().orEmpty()
                if (!resp.isSuccessful) throw IOException("Routes HTTP ${resp.code}")
                val route = json.parseToJsonElement(txt).jsonObject["routes"]?.jsonArray?.firstOrNull()?.jsonObject
                    ?: throw IOException("Nessun percorso trovato")
                val secs = route["duration"]?.jsonPrimitive?.contentOrNull?.removeSuffix("s")?.toLongOrNull()
                    ?: throw IOException("Durata mancante")
                val km = route["distanceMeters"]?.jsonPrimitive?.contentOrNull?.toDoubleOrNull()?.div(1000)
                if (!transit) {
                    return@use Result(((secs + 59) / 60).toInt(), km, route["description"]?.jsonPrimitive?.contentOrNull)
                }
                // Mezzi pubblici: linee usate + prima corsa (fermata e orario) + cammino iniziale
                val steps = route["legs"]?.jsonArray.orEmpty().flatMap { it.jsonObject["steps"]?.jsonArray.orEmpty() }.map { it.jsonObject }
                val lines = steps.mapNotNull { st ->
                    st["transitDetails"]?.jsonObject?.get("transitLine")?.jsonObject?.let { l -> (l["nameShort"] ?: l["name"])?.jsonPrimitive?.contentOrNull }
                }.distinct()
                val firstIdx = steps.indexOfFirst { it["transitDetails"] != null }
                val first = steps.getOrNull(firstIdx)?.get("transitDetails")?.jsonObject?.get("stopDetails")?.jsonObject
                val firstDep = first?.get("departureTime")?.jsonPrimitive?.contentOrNull?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
                val firstStop = first?.get("departureStop")?.jsonObject?.get("name")?.jsonPrimitive?.contentOrNull
                val walkBefore = steps.take(maxOf(firstIdx, 0)).sumOf {
                    it["staticDuration"]?.jsonPrimitive?.contentOrNull?.removeSuffix("s")?.toLongOrNull() ?: 0L
                }
                val summary = buildString {
                    append(lines.joinToString(" → ").ifBlank { "Mezzi pubblici" })
                    if (firstDep != null) {
                        append(" · ").append(java.time.format.DateTimeFormatter.ofPattern("HH:mm")
                            .format(Instant.ofEpochMilli(firstDep).atZone(java.time.ZoneId.systemDefault())))
                        firstStop?.let { append(" da ").append(it) }
                    }
                }
                Result(((secs + 59) / 60).toInt(), km, summary, departAt = firstDep?.let { it - walkBefore * 1000 })
            }
        }
}
