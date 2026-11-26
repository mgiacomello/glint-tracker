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

    data class Result(val minutes: Int, val km: Double?, val summary: String?)

    suspend fun travel(origin: String, dest: Airport?, destIata: String, mode: TravelMode, departAt: Long): Result =
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
                // departureTime deve essere nel futuro
                val t = maxOf(departAt, System.currentTimeMillis() + 60_000)
                put("departureTime", Instant.ofEpochMilli(t).toString())
                put("languageCode", "it")
            }

            val req = Request.Builder()
                .url("https://routes.googleapis.com/directions/v2:computeRoutes")
                .header("X-Goog-Api-Key", apiKey)
                .header(
                    "X-Goog-FieldMask",
                    "routes.duration,routes.distanceMeters,routes.description,routes.legs.steps.transitDetails.transitLine.nameShort,routes.legs.steps.transitDetails.transitLine.name",
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
                val lines = if (transit) route["legs"]?.jsonArray?.flatMap { leg ->
                    leg.jsonObject["steps"]?.jsonArray.orEmpty().mapNotNull { st ->
                        st.jsonObject["transitDetails"]?.jsonObject?.get("transitLine")?.jsonObject?.let { l ->
                            (l["nameShort"] ?: l["name"])?.jsonPrimitive?.contentOrNull
                        }
                    }
                }?.distinct()?.joinToString(" → ") else route["description"]?.jsonPrimitive?.contentOrNull
                Result(((secs + 59) / 60).toInt(), km, lines?.takeIf { it.isNotBlank() })
            }
        }
}
