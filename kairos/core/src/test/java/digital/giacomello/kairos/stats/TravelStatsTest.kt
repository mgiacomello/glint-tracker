package digital.giacomello.kairos.stats

import digital.giacomello.kairos.model.Endpoint
import digital.giacomello.kairos.model.Flight
import digital.giacomello.kairos.model.FlightStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TravelStatsTest {
    private val h = 3_600_000L
    private val m = 60_000L
    private val t0 = 1_780_000_000_000L

    private fun f(id: String, from: String, to: String, date: String, delayMin: Int, st: FlightStatus = FlightStatus.ARRIVED, airline: String = "ITA Airways") = Flight(
        id = id, number = id.take(5), date = date, airline = airline, status = st,
        departure = Endpoint(from, scheduled = t0, actual = t0 + delayMin * m),
        arrival = Endpoint(to, scheduled = t0 + 2 * h, actual = t0 + 2 * h + delayMin * m),
    )

    private val flights = listOf(
        f("AZ001", "FCO", "LHR", "2026-01-10", 5),
        f("AZ002", "LHR", "FCO", "2026-01-12", 40),
        f("BA003", "LIN", "LCY", "2025-06-01", 90, airline = "British Airways"),
        f("FR004", "STN", "CIA", "2025-07-01", 0, st = FlightStatus.CANCELED, airline = "Ryanair"),
        f("AZ005", "FCO", "LIN", "2027-01-01", 0, st = FlightStatus.SCHEDULED), // futuro: escluso
    )

    @Test fun totali() {
        val s = TravelStats.from(flights)
        assertEquals(3, s.flights)               // cancellato e futuro esclusi
        assertEquals(1, s.canceled)
        assertEquals(360, s.airMinutes)          // 3 voli da 2h
        assertTrue(s.km in 3500..4200)           // FCO-LHR x2 (~1440) + LIN-LCY (~960), da coordinate
        assertEquals(2, s.countries)             // IT, UK
    }

    @Test fun ritardi() {
        val s = TravelStats.from(flights)
        assertEquals(33, s.onTimePct)            // 1 su 3 entro 15'
        assertEquals(45, s.avgArrivalDelay)      // (5+40+90)/3
        assertEquals(135, s.totalDelayMinutes)
        assertEquals("BA003", s.worstDelay!!.first.id)
        assertEquals(1, s.delayedOver60)
    }

    @Test fun classificheEAnno() {
        val s = TravelStats.from(flights)
        assertEquals(Ranked("FCO–LHR", 2), s.topRoutes.first())
        assertEquals("ITA Airways", s.topAirlines.first().name)
        assertEquals(2, TravelStats.from(flights, 2026).flights)
        assertEquals(listOf(2026, 2025), TravelStats.years(flights))
    }
}
