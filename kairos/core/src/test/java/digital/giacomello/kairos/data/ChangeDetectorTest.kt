package digital.giacomello.kairos.data

import digital.giacomello.kairos.model.Endpoint
import digital.giacomello.kairos.model.Flight
import digital.giacomello.kairos.model.FlightStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ChangeDetectorTest {
    private val t0 = 1_800_000_000_000L
    private fun flight(
        status: FlightStatus = FlightStatus.SCHEDULED,
        depEst: Long = t0, gate: String? = "B12", belt: String? = null,
    ) = Flight(
        id = "AZ610_2027-01-15", number = "AZ610", date = "2027-01-15", status = status,
        departure = Endpoint("FCO", scheduled = t0, estimated = depEst, gate = gate, utcOffsetSeconds = 3600),
        arrival = Endpoint("JFK", scheduled = t0 + 9 * 3_600_000, baggageBelt = belt, utcOffsetSeconds = -18000),
    )

    @Test fun nessunCambio_nessunEvento() = assertEquals(0, ChangeDetector.diff(flight(), flight()).size)

    @Test fun cambioGate() {
        val e = ChangeDetector.diff(flight(), flight(gate = "C3"))
        assertEquals(1, e.size)
        assertTrue(e[0].text.contains("B12 → C3"))
    }

    @Test fun ritardoSopraSoglia() {
        val e = ChangeDetector.diff(flight(), flight(depEst = t0 + 40 * 60_000))
        assertTrue(e.any { it.text.contains("+40 min") && it.urgent })
    }

    @Test fun ritardoSottoSoglia_ignorato() =
        assertEquals(0, ChangeDetector.diff(flight(), flight(depEst = t0 + 5 * 60_000)).size)

    @Test fun imbarcoECancellazione() {
        assertTrue(ChangeDetector.diff(flight(), flight(FlightStatus.BOARDING)).any { it.title.contains("Imbarco") })
        assertTrue(ChangeDetector.diff(flight(), flight(FlightStatus.CANCELED)).any { it.title.contains("CANCELLATO") })
    }

    @Test fun nastroBagagli() {
        val e = ChangeDetector.diff(flight(FlightStatus.LANDED), flight(FlightStatus.LANDED, belt = "7"))
        assertTrue(e.any { it.text.contains("nastro 7") })
    }
}
