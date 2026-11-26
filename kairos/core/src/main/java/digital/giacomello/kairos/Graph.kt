package digital.giacomello.kairos

import android.content.Context
import digital.giacomello.kairos.core.BuildConfig
import digital.giacomello.kairos.data.AeroDataBoxProvider
import digital.giacomello.kairos.data.DemoProvider
import digital.giacomello.kairos.data.FlightProvider
import digital.giacomello.kairos.data.FlightRepository
import digital.giacomello.kairos.data.GmailBridge
import digital.giacomello.kairos.travel.TravelService

/** Mini "dependency injection" manuale, condivisa da app telefono e orologio. */
object Graph {
    @Volatile private var repo: FlightRepository? = null
    @Volatile private var travelSvc: TravelService? = null

    val mapsKey: String get() = BuildConfig.GOOGLE_MAPS_KEY

    val isDemo: Boolean get() = BuildConfig.AERODATABOX_KEY.isBlank()

    val gmail: GmailBridge by lazy { GmailBridge(BuildConfig.GMAIL_BRIDGE_URL) }

    /**
     * Callback impostata da ciascuna app (telefono / orologio) per aggiornare le proprie
     * superfici dopo un cambio dati: tile, complicazioni, widget, notifica "live".
     */
    @Volatile var onDataChanged: (suspend (Context) -> Unit)? = null

    fun repository(context: Context): FlightRepository =
        repo ?: synchronized(this) {
            repo ?: FlightRepository(context.applicationContext, provider()).also { repo = it }
        }

    fun travel(context: Context): TravelService =
        travelSvc ?: synchronized(this) {
            travelSvc ?: TravelService(context.applicationContext).also { travelSvc = it }
        }

    private fun provider(): FlightProvider =
        if (isDemo) DemoProvider() else AeroDataBoxProvider(BuildConfig.AERODATABOX_KEY)
}
