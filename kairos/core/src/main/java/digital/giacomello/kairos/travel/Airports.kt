package digital.giacomello.kairos.travel

import java.time.ZoneId

/** Profilo dei tempi "a terra" per tipo di aeroporto (minuti). */
enum class AirportKind(
    val gateCloseShort: Int, val gateCloseLong: Int,
    val walkToGate: Int, val security: Int, val securityFastTrack: Int,
    val bagDrop: Int, val lounge: Int, val margin: Int, val passport: Int,
) {
    /** Grandi hub (FCO, MXP, CDG...) */
    HUB(20, 30, 15, 20, 10, 20, 45, 15, 15),
    /** Mega-hub con terminal enormi (LHR, JFK, DXB...) */
    LARGE(20, 35, 20, 25, 10, 20, 60, 15, 25),
    /** Scali piccoli/cittadini (LIN, LCY, CIA...) */
    SMALL(20, 30, 5, 10, 5, 10, 30, 10, 10),
    /** Scali low cost con code lunghe (STN, LTN, BGY) */
    LOWCOST(30, 30, 15, 30, 15, 25, 30, 15, 20),
}

data class Airport(
    val iata: String,
    val name: String,
    val lat: Double,
    val lng: Double,
    val zone: ZoneId,
    val kind: AirportKind,
    val schengen: Boolean,
    /** Regione italiana (per incrociare gli scioperi regionali); null fuori Italia. */
    val itRegion: String? = null,
)

/**
 * Tabella statica degli aeroporti più usati. Serve a: fuso orario corretto per i voli
 * importati solo da email, destinazione per il calcolo del percorso, tempi a terra,
 * Schengen/extra-Schengen (controllo passaporti), regione per gli scioperi.
 * Aeroporti non in tabella: si usano i default HUB.
 */
object Airports {
    private val ROME = ZoneId.of("Europe/Rome")
    private val LONDON = ZoneId.of("Europe/London")

    private val all = listOf(
        Airport("FCO", "Roma Fiumicino", 41.8003, 12.2389, ROME, AirportKind.HUB, true, "Lazio"),
        Airport("CIA", "Roma Ciampino", 41.7994, 12.5949, ROME, AirportKind.SMALL, true, "Lazio"),
        Airport("MXP", "Milano Malpensa", 45.6306, 8.7281, ROME, AirportKind.HUB, true, "Lombardia"),
        Airport("LIN", "Milano Linate", 45.4451, 9.2767, ROME, AirportKind.SMALL, true, "Lombardia"),
        Airport("BGY", "Bergamo Orio al Serio", 45.6739, 9.7042, ROME, AirportKind.LOWCOST, true, "Lombardia"),
        Airport("VCE", "Venezia Marco Polo", 45.5053, 12.3519, ROME, AirportKind.SMALL, true, "Veneto"),
        Airport("BLQ", "Bologna", 44.5354, 11.2887, ROME, AirportKind.SMALL, true, "Emilia-Romagna"),
        Airport("NAP", "Napoli", 40.8860, 14.2908, ROME, AirportKind.SMALL, true, "Campania"),
        Airport("TRN", "Torino", 45.2008, 7.6497, ROME, AirportKind.SMALL, true, "Piemonte"),
        Airport("FLR", "Firenze", 43.8100, 11.2051, ROME, AirportKind.SMALL, true, "Toscana"),
        Airport("PSA", "Pisa", 43.6839, 10.3927, ROME, AirportKind.SMALL, true, "Toscana"),
        Airport("CTA", "Catania", 37.4668, 15.0664, ROME, AirportKind.SMALL, true, "Sicilia"),
        Airport("PMO", "Palermo", 38.1760, 13.0910, ROME, AirportKind.SMALL, true, "Sicilia"),
        Airport("BRI", "Bari", 41.1389, 16.7606, ROME, AirportKind.SMALL, true, "Puglia"),
        Airport("CAG", "Cagliari", 39.2515, 9.0543, ROME, AirportKind.SMALL, true, "Sardegna"),
        Airport("LHR", "London Heathrow", 51.4700, -0.4543, LONDON, AirportKind.LARGE, false),
        Airport("LGW", "London Gatwick", 51.1537, -0.1821, LONDON, AirportKind.HUB, false),
        Airport("LCY", "London City", 51.5048, 0.0495, LONDON, AirportKind.SMALL, false),
        Airport("LTN", "London Luton", 51.8747, -0.3683, LONDON, AirportKind.LOWCOST, false),
        Airport("STN", "London Stansted", 51.8860, 0.2389, LONDON, AirportKind.LOWCOST, false),
        Airport("CDG", "Paris Charles de Gaulle", 49.0097, 2.5479, ZoneId.of("Europe/Paris"), AirportKind.LARGE, true),
        Airport("ORY", "Paris Orly", 48.7262, 2.3652, ZoneId.of("Europe/Paris"), AirportKind.HUB, true),
        Airport("AMS", "Amsterdam Schiphol", 52.3105, 4.7683, ZoneId.of("Europe/Amsterdam"), AirportKind.LARGE, true),
        Airport("FRA", "Frankfurt", 50.0379, 8.5622, ZoneId.of("Europe/Berlin"), AirportKind.LARGE, true),
        Airport("MUC", "München", 48.3538, 11.7861, ZoneId.of("Europe/Berlin"), AirportKind.HUB, true),
        Airport("ZRH", "Zürich", 47.4582, 8.5555, ZoneId.of("Europe/Zurich"), AirportKind.HUB, true),
        Airport("MAD", "Madrid Barajas", 40.4983, -3.5676, ZoneId.of("Europe/Madrid"), AirportKind.LARGE, true),
        Airport("BCN", "Barcelona", 41.2974, 2.0833, ZoneId.of("Europe/Madrid"), AirportKind.HUB, true),
        Airport("LIS", "Lisboa", 38.7742, -9.1342, ZoneId.of("Europe/Lisbon"), AirportKind.HUB, true),
        Airport("DUB", "Dublin", 53.4264, -6.2499, ZoneId.of("Europe/Dublin"), AirportKind.HUB, false),
        Airport("JFK", "New York JFK", 40.6413, -73.7781, ZoneId.of("America/New_York"), AirportKind.LARGE, false),
        Airport("DXB", "Dubai", 25.2532, 55.3657, ZoneId.of("Asia/Dubai"), AirportKind.LARGE, false),
    ).associateBy { it.iata }

    fun get(iata: String?): Airport? = iata?.let { all[it.uppercase()] }
}
