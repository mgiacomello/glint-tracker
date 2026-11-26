package digital.giacomello.kairos.data

import digital.giacomello.kairos.model.Endpoint
import digital.giacomello.kairos.model.Flight
import digital.giacomello.kairos.model.FlightStatus
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneOffset
import kotlin.math.abs

/**
 * Provider simulato: genera voli realistici e deterministici a partire dal numero,
 * con stato che evolve nel tempo. Serve per provare l'app senza chiave API.
 */
class DemoProvider : FlightProvider {

    private data class Ap(val iata: String, val city: String, val offset: Int)

    private val airports = listOf(
        Ap("FCO", "Roma", 3600), Ap("MXP", "Milano", 3600), Ap("LHR", "Londra", 0),
        Ap("JFK", "New York", -18000), Ap("CDG", "Parigi", 3600), Ap("FRA", "Francoforte", 3600),
        Ap("MAD", "Madrid", 3600), Ap("DXB", "Dubai", 14400), Ap("AMS", "Amsterdam", 3600),
        Ap("LIN", "Milano Linate", 3600), Ap("VCE", "Venezia", 3600), Ap("SFO", "San Francisco", -28800),
    )

    override suspend fun lookup(number: String, date: String): Flight {
        val n = Flight.normalizeNumber(number)
        val h = abs(n.hashCode())
        val from = airports[h % airports.size]
        var to = airports[(h / 7) % airports.size]
        if (to == from) to = airports[(h / 7 + 1) % airports.size]

        val now = System.currentTimeMillis()
        val day = LocalDate.parse(date)
        // Se il volo è oggi, lo piazziamo vicino a "adesso" per vedere tutti gli stati.
        val dep: Long = if (day == LocalDate.now()) {
            now + ((h % 180) - 60) * 60_000L
        } else {
            day.atTime(LocalTime.of(6 + h % 16, (h % 4) * 15)).toInstant(ZoneOffset.ofTotalSeconds(from.offset)).toEpochMilli()
        }
        val durMin = 60 + (h % 9) * 45
        val delay = if (h % 3 == 0) (h % 50) else 0
        val estDep = dep + delay * 60_000L
        val estArr = estDep + durMin * 60_000L

        val status = when {
            now < estDep - 45 * 60_000 -> if (delay > 0) FlightStatus.DELAYED else FlightStatus.SCHEDULED
            now < estDep - 15 * 60_000 -> FlightStatus.BOARDING
            now < estDep -> FlightStatus.GATE_CLOSED
            now < estArr - 20 * 60_000 -> FlightStatus.EN_ROUTE
            now < estArr -> FlightStatus.APPROACHING
            now < estArr + 15 * 60_000 -> FlightStatus.LANDED
            else -> FlightStatus.ARRIVED
        }

        return Flight(
            id = Flight.idFor(n, date),
            number = n,
            date = date,
            airline = "Demo Air",
            status = status,
            departure = Endpoint(
                iata = from.iata, city = from.city,
                scheduled = dep, estimated = estDep,
                actual = if (status.isAirborne || status.isFinished) estDep else null,
                utcOffsetSeconds = from.offset,
                terminal = "${1 + h % 3}", gate = "${"ABCDE"[h % 5]}${10 + h % 30}",
            ),
            arrival = Endpoint(
                iata = to.iata, city = to.city,
                scheduled = dep + durMin * 60_000L, estimated = estArr,
                actual = if (status == FlightStatus.LANDED || status == FlightStatus.ARRIVED) estArr else null,
                utcOffsetSeconds = to.offset,
                terminal = "${1 + (h / 3) % 4}",
                gate = if (status.isAirborne || status.isFinished) "${"BCF"[h % 3]}${1 + h % 20}" else null,
                baggageBelt = if (status.isFinished) "${1 + h % 12}" else null,
            ),
            aircraftModel = listOf("Airbus A320neo", "Boeing 787-9", "Airbus A321", "Embraer E190", "Airbus A350-900")[h % 5],
            aircraftReg = "EI-D${('A' + h % 26)}${('A' + (h / 26) % 26)}",
            distanceKm = durMin * 12,
            lastUpdated = now,
            isDemo = true,
        )
    }
}
