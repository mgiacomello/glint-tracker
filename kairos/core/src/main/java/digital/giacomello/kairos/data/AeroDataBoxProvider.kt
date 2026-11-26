package digital.giacomello.kairos.data

import digital.giacomello.kairos.model.Endpoint
import digital.giacomello.kairos.model.Flight
import digital.giacomello.kairos.model.FlightStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.concurrent.TimeUnit

/**
 * Provider basato su AeroDataBox (via RapidAPI o API.market).
 * Endpoint: GET /flights/number/{numero}/{data}
 */
class AeroDataBoxProvider(
    private val apiKey: String,
    private val host: String = "aerodatabox.p.rapidapi.com",
) : FlightProvider {

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()

    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; isLenient = true }

    override suspend fun lookup(number: String, date: String): Flight? = withContext(Dispatchers.IO) {
        val n = Flight.normalizeNumber(number)
        val req = Request.Builder()
            .url("https://$host/flights/number/$n/$date?withAircraftImage=false&withLocation=false")
            .header("X-RapidAPI-Key", apiKey)
            .header("X-RapidAPI-Host", host)
            .build()

        client.newCall(req).execute().use { resp ->
            if (resp.code == 204 || resp.code == 404) return@withContext null
            if (!resp.isSuccessful) throw IOException("AeroDataBox HTTP ${resp.code}")
            val body = resp.body?.string().orEmpty()
            if (body.isBlank()) return@withContext null
            val list = json.decodeFromString<List<AdbFlight>>(body)
            // Per voli con più tratte (es. AZ123 FCO-MXP-JFK) prendiamo la prima;
            // estensione futura: scelta della tratta.
            list.firstOrNull()?.toDomain(n, date)
        }
    }

    // ---------- DTO (solo i campi che ci servono) ----------

    @Serializable
    private data class AdbFlight(
        val number: String? = null,
        val status: String? = null,
        val departure: AdbMovement? = null,
        val arrival: AdbMovement? = null,
        val aircraft: AdbAircraft? = null,
        val airline: AdbAirline? = null,
        val greatCircleDistance: AdbDistance? = null,
    )

    @Serializable
    private data class AdbMovement(
        val airport: AdbAirport? = null,
        val scheduledTime: AdbTime? = null,
        val revisedTime: AdbTime? = null,
        val predictedTime: AdbTime? = null,
        val runwayTime: AdbTime? = null,
        val terminal: String? = null,
        val gate: String? = null,
        val checkInDesk: String? = null,
        val baggageBelt: String? = null,
    )

    @Serializable private data class AdbAirport(val iata: String? = null, val icao: String? = null, val name: String? = null, val municipalityName: String? = null)
    @Serializable private data class AdbTime(val utc: String? = null, val local: String? = null)
    @Serializable private data class AdbAircraft(val reg: String? = null, val model: String? = null)
    @Serializable private data class AdbAirline(val name: String? = null, val iata: String? = null)
    @Serializable private data class AdbDistance(val km: Double? = null)

    private fun AdbFlight.toDomain(n: String, date: String): Flight {
        val st = mapStatus(status)
        return Flight(
            id = Flight.idFor(n, date),
            number = number?.replace(" ", "") ?: n,
            date = date,
            airline = airline?.name,
            status = st,
            departure = departure.toEndpoint(isDeparture = true, st),
            arrival = arrival.toEndpoint(isDeparture = false, st),
            aircraftModel = aircraft?.model,
            aircraftReg = aircraft?.reg,
            distanceKm = greatCircleDistance?.km?.toInt(),
            lastUpdated = System.currentTimeMillis(),
        )
    }

    private fun AdbMovement?.toEndpoint(isDeparture: Boolean, st: FlightStatus): Endpoint {
        if (this == null) return Endpoint(iata = "???")
        val sched = scheduledTime?.utc.toMillis()
        val revised = revisedTime?.utc.toMillis() ?: predictedTime?.utc.toMillis()
        // Il "revised" diventa "effettivo" quando la fase è conclusa.
        val done = if (isDeparture) st.isAirborne || st.isFinished else st == FlightStatus.LANDED || st == FlightStatus.ARRIVED
        val actual = runwayTime?.utc.toMillis() ?: if (done) revised else null
        return Endpoint(
            iata = airport?.iata ?: airport?.icao ?: "???",
            name = airport?.name,
            city = airport?.municipalityName,
            scheduled = sched,
            estimated = revised,
            actual = actual,
            utcOffsetSeconds = scheduledTime?.local.offsetSeconds(),
            terminal = terminal,
            gate = gate,
            checkInDesk = checkInDesk,
            baggageBelt = baggageBelt,
        )
    }

    private fun mapStatus(s: String?): FlightStatus = when (s?.lowercase()) {
        "expected", "unknown", null -> FlightStatus.SCHEDULED
        "delayed" -> FlightStatus.DELAYED
        "checkin" -> FlightStatus.CHECK_IN
        "boarding" -> FlightStatus.BOARDING
        "gateclosed" -> FlightStatus.GATE_CLOSED
        "departed" -> FlightStatus.DEPARTED
        "enroute" -> FlightStatus.EN_ROUTE
        "approaching" -> FlightStatus.APPROACHING
        "arrived" -> FlightStatus.ARRIVED
        "landed" -> FlightStatus.LANDED
        "canceled", "canceleduncertain" -> FlightStatus.CANCELED
        "diverted" -> FlightStatus.DIVERTED
        else -> FlightStatus.UNKNOWN
    }

    private companion object {
        /** "2026-11-27 10:05Z" -> epoch millis */
        fun String?.toMillis(): Long? = runCatching {
            LocalDateTime.parse(this!!.trim().removeSuffix("Z").replace(' ', 'T'))
                .toInstant(ZoneOffset.UTC).toEpochMilli()
        }.getOrNull()

        /** "2026-11-27 11:05+01:00" -> 3600 */
        fun String?.offsetSeconds(): Int = runCatching {
            OffsetDateTime.parse(this!!.trim().replace(' ', 'T')).offset.totalSeconds
        }.getOrDefault(0)
    }
}
