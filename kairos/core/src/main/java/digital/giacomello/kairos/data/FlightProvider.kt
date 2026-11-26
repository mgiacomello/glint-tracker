package digital.giacomello.kairos.data

import digital.giacomello.kairos.model.Flight

/**
 * Sorgente dati voli. Astratta per poter cambiare fornitore
 * (AeroDataBox, FlightAware AeroAPI, Cirium, OAG...) senza toccare UI e logica.
 */
interface FlightProvider {
    /** @param date data locale di partenza, formato yyyy-MM-dd */
    suspend fun lookup(number: String, date: String): Flight?
}

class FlightNotFoundException(msg: String) : Exception(msg)
