package digital.giacomello.kairos.geo

import android.content.Context
import digital.giacomello.kairos.model.Flight
import digital.giacomello.kairos.travel.Airports
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin
import kotlin.math.sqrt

data class LatLng(val lat: Double, val lng: Double)

/** Punto normalizzato 0..1 nel riquadro della mappa (x verso destra, y verso il basso). */
data class P(val x: Float, val y: Float)

/** Tutto ciò che serve per disegnare la mappa di una rotta: puntini di terra, arco, aeroporti. */
data class RouteFrame(
    val land: List<P>,
    val path: List<P>,
    val from: P,
    val to: P,
    /** Passo dei puntini (frazione della larghezza), per dimensionarli. */
    val dotStep: Float,
) {
    /** Posizione e direzione (radianti) dell'aereo a una certa frazione del percorso. */
    fun planeAt(progress: Float): Pair<P, Float> {
        if (path.size < 2) return from to 0f
        val i = (progress.coerceIn(0f, 1f) * (path.size - 1)).toInt().coerceIn(0, path.size - 2)
        val a = path[i]; val b = path[i + 1]
        return P(a.x, a.y) to atan2((b.y - a.y), (b.x - a.x))
    }
}

/**
 * Maschera terre emerse (Natural Earth 1:50m, pubblico dominio) su griglia di 0,25°,
 * 1440×720 bit = 130 KB in assets. Proiezione equirettangolare con correzione cos(lat).
 */
class LandMask private constructor(private val bits: ByteArray) {

    fun isLand(lat: Double, lng: Double): Boolean {
        val x = (((lng + 180.0) / 360.0 * W).toInt()).mod(W)
        val y = ((90.0 - lat) / 180.0 * H).toInt().coerceIn(0, H - 1)
        val idx = y * (W / 8) + x / 8
        return (bits[idx].toInt() shr (7 - x % 8)) and 1 == 1
    }

    /**
     * Calcola la mappa per la rotta a→b in un riquadro con proporzioni [aspect] (larghezza/altezza).
     * @param dotsAcross densità dei puntini (≈ numero di puntini in orizzontale)
     */
    fun frame(a: LatLng, b: LatLng, aspect: Float, dotsAcross: Int = 70, padding: Double = 0.22, minSpanDeg: Double = 14.0): RouteFrame {
        val gc = greatCircle(a, b, 64)
        // Gestione dell'antimeridiano: "srotola" le longitudini
        val lngs = unwrap(gc.map { it.lng })
        val lats = gc.map { it.lat }
        val midLat = (lats.min() + lats.max()) / 2
        val kx = cos(midLat * PI / 180).coerceAtLeast(0.2)

        // Riquadro: rotta + margine, adattato alle proporzioni richieste
        var minX = lngs.min() * kx; var maxX = lngs.max() * kx
        var minY = lats.min(); var maxY = lats.max()
        val span = max(maxX - minX, (maxY - minY) * aspect).coerceAtLeast(minSpanDeg) // zoom minimo: si vedono le coste
        var w = span * (1 + 2 * padding)
        var h = w / aspect
        if (h < (maxY - minY) * (1 + 2 * padding)) { h = (maxY - minY) * (1 + 2 * padding); w = h * aspect }
        val cx = (minX + maxX) / 2; val cy = (minY + maxY) / 2
        minX = cx - w / 2; maxX = cx + w / 2; minY = cy - h / 2; maxY = cy + h / 2

        fun proj(lat: Double, lngUnwrapped: Double) =
            P(((lngUnwrapped * kx - minX) / w).toFloat(), ((maxY - lat) / h).toFloat())

        // Puntini di terra su griglia regolare nello spazio proiettato
        val step = w / dotsAcross
        val land = ArrayList<P>()
        var y = maxY - step / 2
        while (y > minY) {
            var x = minX + step / 2
            while (x < maxX) {
                val lat = y; val lng = x / kx
                if (lat in -85.0..85.0 && isLand(lat, normLng(lng))) land += proj(lat, lng)
                x += step
            }
            y -= step
        }
        val path = gc.indices.map { proj(lats[it], lngs[it]) }
        return RouteFrame(land, path, path.first(), path.last(), (1.0 / dotsAcross).toFloat())
    }

    companion object {
        private const val W = 1440
        private const val H = 720
        @Volatile private var instance: LandMask? = null

        fun get(context: Context): LandMask = instance ?: synchronized(this) {
            instance ?: LandMask(context.assets.open("land_mask_025.bin").use { it.readBytes() }).also { instance = it }
        }

        /** Coordinate di un aeroporto: dal volo (fornitore dati) o dalla tabella interna. */
        fun coords(f: Flight): Pair<LatLng, LatLng>? {
            val a = f.departure.lat?.let { la -> f.departure.lng?.let { LatLng(la, it) } }
                ?: Airports.get(f.departure.iata)?.let { LatLng(it.lat, it.lng) } ?: return null
            val b = f.arrival.lat?.let { la -> f.arrival.lng?.let { LatLng(la, it) } }
                ?: Airports.get(f.arrival.iata)?.let { LatLng(it.lat, it.lng) } ?: return null
            return a to b
        }

        private fun normLng(l: Double): Double { var x = l; while (x > 180) x -= 360; while (x < -180) x += 360; return x }

        private fun unwrap(l: List<Double>): List<Double> {
            val out = ArrayList<Double>(l.size); var off = 0.0
            l.forEachIndexed { i, v ->
                if (i > 0) { val d = v + off - out[i - 1]; if (d > 180) off -= 360 else if (d < -180) off += 360 }
                out += v + off
            }
            return out
        }

        /** Arco di cerchio massimo (la rotta "vera" che segue l'aereo). */
        fun greatCircle(a: LatLng, b: LatLng, n: Int): List<LatLng> {
            val r = PI / 180
            val la1 = a.lat * r; val lo1 = a.lng * r; val la2 = b.lat * r; val lo2 = b.lng * r
            val d = 2 * asin(sqrt(sin((la2 - la1) / 2).let { it * it } + cos(la1) * cos(la2) * sin((lo2 - lo1) / 2).let { it * it }))
            if (abs(d) < 1e-9) return listOf(a, b)
            return (0..n).map { i ->
                val f = i.toDouble() / n
                val A = sin((1 - f) * d) / sin(d); val B = sin(f * d) / sin(d)
                val x = A * cos(la1) * cos(lo1) + B * cos(la2) * cos(lo2)
                val y = A * cos(la1) * sin(lo1) + B * cos(la2) * sin(lo2)
                val z = A * sin(la1) + B * sin(la2)
                LatLng(atan2(z, sqrt(x * x + y * y)) / r, atan2(y, x) / r)
            }
        }
    }
}
