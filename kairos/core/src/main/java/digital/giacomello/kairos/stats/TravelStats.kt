package digital.giacomello.kairos.stats

import digital.giacomello.kairos.model.Flight
import digital.giacomello.kairos.model.FlightStatus
import digital.giacomello.kairos.travel.Airports
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

/** Classifica "voce → numero di voli" (aeroporti, compagnie, rotte). */
data class Ranked(val name: String, val count: Int)

/** Statistiche di viaggio ("passaporto"). */
data class TravelStats(
    val flights: Int,
    val km: Int,
    val airMinutes: Int,
    /** Volo più lungo per distanza. */
    val longest: Flight?,
    val airports: Int,
    val airlines: Int,
    val countries: Int,
    /** Puntualità all'arrivo: standard di settore = arrivo entro 15' dall'orario (A15). */
    val onTimePct: Int?,
    val avgArrivalDelay: Int?,
    /** Somma dei minuti di ritardo all'arrivo (solo ritardi positivi). */
    val totalDelayMinutes: Int,
    val worstDelay: Pair<Flight, Int>?,
    val delayedOver60: Int,
    val canceled: Int,
    val diverted: Int,
    val topAirports: List<Ranked>,
    val topAirlines: List<Ranked>,
    val topRoutes: List<Ranked>,
    val byYear: Map<Int, Int>,
) {
    /** Giri della Terra all'equatore (40.075 km). */
    val earthLaps: Double get() = km / 40_075.0

    companion object {
        private const val ON_TIME = 15
        private val COUNTRY = mapOf(
            "Europe/Rome" to "IT", "Europe/London" to "UK", "Europe/Paris" to "FR", "Europe/Amsterdam" to "NL",
            "Europe/Berlin" to "DE", "Europe/Zurich" to "CH", "Europe/Madrid" to "ES", "Europe/Lisbon" to "PT",
            "Europe/Dublin" to "IE", "America/New_York" to "US", "Asia/Dubai" to "AE",
        )

        /** @param year null = tutti gli anni */
        fun from(all: List<Flight>, year: Int? = null): TravelStats {
            val done = all.filter { it.status.isFinished && (year == null || it.date.take(4).toIntOrNull() == year) }
            val flown = done.filter { it.status != FlightStatus.CANCELED }

            val delays = flown.mapNotNull { f ->
                val s = f.arrival.scheduled ?: return@mapNotNull null
                val a = f.arrival.actual ?: f.arrival.estimated ?: return@mapNotNull null
                f to ((a - s) / 60_000L).toInt()
            }
            val worst = delays.maxByOrNull { it.second }?.takeIf { it.second > 0 }

            fun rank(keys: List<String>) = keys.groupingBy { it }.eachCount()
                .entries.sortedWith(compareByDescending<Map.Entry<String, Int>> { it.value }.thenBy { it.key })
                .take(5).map { Ranked(it.key, it.value) }

            return TravelStats(
                flights = flown.size,
                km = flown.sumOf { distanceKm(it) },
                airMinutes = flown.sumOf { airMinutes(it) },
                longest = flown.maxByOrNull { distanceKm(it) },
                airports = flown.flatMap { listOf(it.departure.iata, it.arrival.iata) }.toSet().size,
                airlines = flown.map { airlineKey(it) }.toSet().size,
                countries = flown.flatMap { listOf(it.departure.iata, it.arrival.iata) }
                    .mapNotNull { Airports.get(it)?.zone?.id?.let(COUNTRY::get) }.toSet().size,
                onTimePct = delays.takeIf { it.isNotEmpty() }?.let { d -> (d.count { it.second <= ON_TIME } * 100.0 / d.size).roundToInt() },
                avgArrivalDelay = delays.takeIf { it.isNotEmpty() }?.let { d -> d.sumOf { it.second } / d.size },
                totalDelayMinutes = delays.sumOf { it.second.coerceAtLeast(0) },
                worstDelay = worst,
                delayedOver60 = delays.count { it.second >= 60 },
                canceled = done.count { it.status == FlightStatus.CANCELED },
                diverted = done.count { it.status == FlightStatus.DIVERTED },
                topAirports = rank(flown.flatMap { listOf(it.departure.iata, it.arrival.iata) }),
                topAirlines = rank(flown.map { airlineKey(it) }),
                topRoutes = rank(flown.map { listOf(it.departure.iata, it.arrival.iata).sorted().joinToString("–") }),
                byYear = flown.groupingBy { it.date.take(4).toIntOrNull() ?: 0 }.eachCount().toSortedMap(),
            )
        }

        fun years(all: List<Flight>): List<Int> =
            all.filter { it.status.isFinished }.mapNotNull { it.date.take(4).toIntOrNull() }.distinct().sortedDescending()

        private fun airlineKey(f: Flight) = f.airline ?: f.number.take(2)

        private fun airMinutes(f: Flight): Int {
            val d = f.departure.actual ?: f.departure.best ?: return 0
            val a = f.arrival.actual ?: f.arrival.best ?: return 0
            return ((a - d) / 60_000L).toInt().coerceIn(0, 24 * 60)
        }

        /** Distanza dal fornitore dati; in mancanza, ortodromica dalle coordinate in tabella. */
        fun distanceKm(f: Flight): Int {
            f.distanceKm?.let { return it }
            val a = Airports.get(f.departure.iata) ?: return 0
            val b = Airports.get(f.arrival.iata) ?: return 0
            val r = 6371.0
            val dLat = Math.toRadians(b.lat - a.lat)
            val dLng = Math.toRadians(b.lng - a.lng)
            val h = sin(dLat / 2).pow(2) + cos(Math.toRadians(a.lat)) * cos(Math.toRadians(b.lat)) * sin(dLng / 2).pow(2)
            return (2 * r * asin(sqrt(h))).roundToInt()
        }
    }
}
