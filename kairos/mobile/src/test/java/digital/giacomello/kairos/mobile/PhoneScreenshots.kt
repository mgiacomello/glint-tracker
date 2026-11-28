package digital.giacomello.kairos.mobile

import android.app.Application
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import com.github.takahirom.roborazzi.RobolectricDeviceQualifiers
import com.github.takahirom.roborazzi.captureRoboImage
import digital.giacomello.kairos.mobile.ui.FlightDetailContent
import digital.giacomello.kairos.mobile.ui.FlightListContent
import digital.giacomello.kairos.mobile.ui.KairosTheme
import digital.giacomello.kairos.mobile.ui.SettingsContent
import digital.giacomello.kairos.mobile.ui.StatsContent
import digital.giacomello.kairos.sample.SampleData
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.util.TimeZone

/**
 * Screenshot delle schermate reali dell'app telefono, con dati di esempio.
 * Output: docs/screenshots/phone-*.png
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], application = Application::class, qualifiers = RobolectricDeviceQualifiers.Pixel7)
class PhoneScreenshots {
    private val dir = "../docs/screenshots"

    @Before fun setup() {
        TimeZone.setDefault(TimeZone.getTimeZone("Europe/Rome"))
        RuntimeEnvironment.setQualifiers("+night") // tema scuro
    }

    private fun shot(name: String, content: @Composable () -> Unit) =
        captureRoboImage("$dir/phone-$name.png") { KairosTheme { content() } }

    @Test fun list() = shot("1-elenco") {
        FlightListContent(
            SampleData.flights, SampleData.plans, busy = false, isDemo = false, gmail = true,
            snack = SnackbarHostState(), now = SampleData.now, onOpen = {}, onSettings = {}, onSync = {}, onScanGmail = {}, onAdd = {},
        )
    }

    @Test fun detail() = shot("2-dettaglio") {
        FlightDetailContent(SampleData.today, SampleData.plan, SampleData.now, onBack = {}, onRefresh = {}, onRemove = {})
    }

    @Test fun inFlight() = shot("3-in-volo") {
        FlightDetailContent(SampleData.airborne, null, SampleData.airborneNow, onBack = {}, onRefresh = {}, onRemove = {})
    }

    @Test fun stats() = shot("5-statistiche") { StatsContent(SampleData.flights, onBack = {}) }

    @Test fun statsWorld() = shot("5b-statistiche-mondo") { StatsContent(SampleData.flights, onBack = {}, initialWorld = true) }

    @Test fun statsYear() = shot("6-statistiche-2026") { StatsContent(SampleData.flights, onBack = {}, initialYear = 2026) }

    @Test fun settings() = shot("4-impostazioni") {
        SettingsContent(SampleData.prefs, gmail = true, maps = true, live = true, onSave = {}, onBack = {})
    }
}
