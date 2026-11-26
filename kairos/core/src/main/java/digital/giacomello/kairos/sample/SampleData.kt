package digital.giacomello.kairos.sample

import digital.giacomello.kairos.model.Booking
import digital.giacomello.kairos.model.Endpoint
import digital.giacomello.kairos.model.Flight
import digital.giacomello.kairos.model.FlightStatus
import digital.giacomello.kairos.model.Source
import digital.giacomello.kairos.travel.LeavePlan
import digital.giacomello.kairos.travel.LeavePlanner
import digital.giacomello.kairos.travel.StrikeAlert
import digital.giacomello.kairos.travel.TravelMode
import digital.giacomello.kairos.travel.TravelPrefs
import java.time.LocalDateTime
import java.time.ZoneId

/** Dati di esempio deterministici per anteprime e screenshot. */
object SampleData {
    private val ROME = ZoneId.of("Europe/Rome")
    private val LONDON = ZoneId.of("Europe/London")
    private fun at(y: Int, mo: Int, d: Int, h: Int, mi: Int, z: ZoneId = ROME) =
        LocalDateTime.of(y, mo, d, h, mi).atZone(z).toInstant().toEpochMilli()
    private const val M = 60_000L

    /** "Adesso" negli screenshot: 26 nov 2026, 07:40 a Milano. */
    val now: Long = at(2026, 11, 26, 7, 40)

    val today = Flight(
        id = "BA571_2026-11-26", number = "BA571", date = "2026-11-26", airline = "British Airways",
        status = FlightStatus.DELAYED,
        departure = Endpoint("LIN", "Milano Linate", "Milano", scheduled = at(2026, 11, 26, 10, 50), estimated = at(2026, 11, 26, 11, 5),
            utcOffsetSeconds = 3600, terminal = "1", gate = "B12", checkInDesk = "22-28"),
        arrival = Endpoint("LHR", "London Heathrow", "Londra", scheduled = at(2026, 11, 26, 11, 55, LONDON), estimated = at(2026, 11, 26, 12, 5, LONDON),
            utcOffsetSeconds = 0, terminal = "5"),
        aircraftModel = "Airbus A320neo", aircraftReg = "G-TTNA", distanceKm = 975,
        lastUpdated = now - 4 * M, source = Source.GMAIL,
        booking = Booking(pnr = "K7Q2XL", seat = "14A", cabin = "Euro Traveller", boardingTime = "10:20", gateCloses = "10:45", boardingGroup = "3"),
    )

    val airborne = today.copy(status = FlightStatus.EN_ROUTE,
        departure = today.departure.copy(actual = at(2026, 11, 26, 11, 9)))
    val airborneNow: Long = at(2026, 11, 26, 11, 52)

    val nextWeek = Flight(
        id = "FR2672_2026-12-03", number = "FR2672", date = "2026-12-03", airline = "Ryanair",
        status = FlightStatus.SCHEDULED,
        departure = Endpoint("STN", "London Stansted", "Londra", scheduled = at(2026, 12, 3, 17, 25, LONDON), utcOffsetSeconds = 0),
        arrival = Endpoint("CIA", "Roma Ciampino", "Roma", scheduled = at(2026, 12, 3, 21, 5), utcOffsetSeconds = 3600),
        aircraftModel = "Boeing 737-8200", distanceKm = 1440, lastUpdated = now - 3 * 3_600_000L, source = Source.GMAIL,
        booking = Booking(pnr = "R4MT9C", seat = "2C"),
    )

    val past = listOf(
        Flight("AZ217_2026-09-26", "AZ217", "2026-09-26", "ITA Airways", FlightStatus.ARRIVED,
            Endpoint("LCY", scheduled = at(2026, 9, 26, 6, 45, LONDON), actual = at(2026, 9, 26, 6, 52, LONDON), utcOffsetSeconds = 3600),
            Endpoint("LIN", scheduled = at(2026, 9, 26, 9, 30), actual = at(2026, 9, 26, 9, 31), utcOffsetSeconds = 7200),
            distanceKm = 960, source = Source.GMAIL),
        Flight("W46302_2026-10-06", "W46302", "2026-10-06", "Wizz Air", FlightStatus.ARRIVED,
            Endpoint("LTN", scheduled = at(2026, 10, 6, 15, 15, LONDON), actual = at(2026, 10, 6, 15, 40, LONDON), utcOffsetSeconds = 3600),
            Endpoint("MXP", scheduled = at(2026, 10, 6, 18, 15), actual = at(2026, 10, 6, 18, 32), utcOffsetSeconds = 7200),
            distanceKm = 940, source = Source.GMAIL),
        Flight("BA570_2026-10-18", "BA570", "2026-10-18", "British Airways", FlightStatus.ARRIVED,
            Endpoint("LHR", scheduled = at(2026, 10, 18, 7, 5, LONDON), actual = at(2026, 10, 18, 7, 1, LONDON), utcOffsetSeconds = 3600),
            Endpoint("LIN", scheduled = at(2026, 10, 18, 10, 5), actual = at(2026, 10, 18, 9, 58), utcOffsetSeconds = 7200),
            distanceKm = 975, source = Source.GMAIL),
    )

    val flights = listOf(today, nextWeek) + past

    val prefs = TravelPrefs(origin = "Via Example 1, Milano", mode = TravelMode.TAXI, lounge = true)

    val plan: LeavePlan = LeavePlanner.plan(
        today, prefs, travelMinutes = 24, travelSource = "Google, traffico previsto",
        travelSummary = "Viale Forlanini · traffico moderato",
        strikes = listOf(StrikeAlert("Sciopero taxi", "Taxi Milano · 4 ore: dalle 8.00 alle 12.00 · valuta mezzi o NCC", affectsAirline = false, affectsTransport = true)),
    )!!

    val plans = mapOf(today.id to plan)
}
