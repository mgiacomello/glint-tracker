package digital.giacomello.kairos.travel

import digital.giacomello.kairos.model.Booking
import digital.giacomello.kairos.model.Endpoint
import digital.giacomello.kairos.model.Flight
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZoneId

class LeavePlannerTest {
    private val rome = ZoneId.of("Europe/Rome")
    private val dep = LocalDateTime.of(2027, 3, 10, 9, 0).atZone(rome).toInstant().toEpochMilli()
    private val min = 60_000L

    private fun flight(from: String, to: String, depEst: Long = dep, booking: Booking? = null) = Flight(
        id = "X_2027-03-10", number = "AZ204", date = "2027-03-10",
        departure = Endpoint(from, scheduled = dep, estimated = depEst, utcOffsetSeconds = 3600),
        arrival = Endpoint(to, scheduled = dep + 150 * min),
        booking = booking,
    )

    @Test fun fiumicinoLondra_conLounge() {
        // HUB: gate 20 + cammino 15 + lounge 45 + passaporti 15 + controlli 20 = 115'
        // + viaggio 40 + margine (15 + 4) = 174'
        val p = LeavePlanner.plan(flight("FCO", "LHR"), TravelPrefs(lounge = true), 40, "test")!!
        assertEquals(dep - 115 * min, p.arriveAirportAt)
        assertEquals(dep - 174 * min, p.leaveAt)
        assertEquals(45, p.loungeMinutes)
    }

    @Test fun linateSchengen_senzaLounge_rispettaMinimo60() {
        // SMALL: 20+5+10 = 35' < 60' minimo -> arrivo a -60'
        val p = LeavePlanner.plan(flight("LIN", "FCO"), TravelPrefs(lounge = false), 30, "test")!!
        assertEquals(dep - 60 * min, p.arriveAirportAt)
        assertTrue(p.steps.any { it.label.startsWith("Anticipo") })
    }

    @Test fun cartaImbarco_usaOrarioChiusuraGate() {
        val p = LeavePlanner.plan(flight("FCO", "LIN", booking = Booking(gateCloses = "08:30")), TravelPrefs(lounge = false), 30, "t")!!
        assertEquals(dep - 30 * min, p.gateBy)
    }

    @Test fun ritardo_spostaSoloMeta() {
        val p0 = LeavePlanner.plan(flight("FCO", "LIN"), TravelPrefs(), 30, "t")!!
        val p1 = LeavePlanner.plan(flight("FCO", "LIN", depEst = dep + 60 * min), TravelPrefs(), 30, "t")!!
        assertEquals(30 * min, p1.leaveAt - p0.leaveAt)
    }

    @Test fun sciopero_aggiunge30() {
        val s = listOf(StrikeAlert("Sciopero", "x", affectsAirline = true, affectsTransport = false))
        val p0 = LeavePlanner.plan(flight("FCO", "LIN"), TravelPrefs(), 30, "t")!!
        val p1 = LeavePlanner.plan(flight("FCO", "LIN"), TravelPrefs(), 30, "t", strikes = s)!!
        assertEquals(30 * min, p0.leaveAt - p1.leaveAt)
    }

    @Test fun scioperi_match() {
        val strikes = listOf(
            Strike(stato = "Effettuato", settore = "Aereo", categoria = "PERSONALE NAVIGANTE SOC. EASYJET", rilevanza = "Nazionale", regione = "Italia", start = "2027-03-10", end = "2027-03-10"),
            Strike(stato = "Revocato", settore = "Aereo", categoria = "CONTROLLORI", rilevanza = "Nazionale", regione = "Italia", start = "2027-03-10"),
            Strike(stato = "Effettuato", settore = "Ferroviario", categoria = "TRENORD", rilevanza = "Regionale", regione = "Lombardia", start = "2027-03-10"),
        )
        val viaTreno = StrikeSource.match(strikes, "2027-03-10", "easyJet", "U22781", "Lombardia", null, TravelMode.TRANSIT)
        assertEquals(2, viaTreno.size)
        assertTrue(viaTreno.first { it.affectsAirline }.title.contains("tua compagnia"))
        val altraCompagnia = StrikeSource.match(strikes, "2027-03-10", "ITA Airways", "AZ204", "Lombardia", null, TravelMode.DRIVE)
        assertEquals(0, altraCompagnia.size)
    }
}
