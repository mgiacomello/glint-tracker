package digital.giacomello.kairos.wear

import android.app.Application
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.wear.compose.material3.AppScaffold
import com.github.takahirom.roborazzi.RobolectricDeviceQualifiers
import com.github.takahirom.roborazzi.captureRoboImage
import digital.giacomello.kairos.sample.SampleData
import digital.giacomello.kairos.ui.screens.FlightDetailContent
import digital.giacomello.kairos.ui.screens.FlightListContent
import digital.giacomello.kairos.ui.theme.KairosTheme
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.util.TimeZone

/**
 * Screenshot delle schermate reali dell'app Wear OS (Galaxy Watch, display tondo).
 * Output: docs/screenshots/watch-*.png
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], application = Application::class, qualifiers = RobolectricDeviceQualifiers.WearOSLargeRound)
class WatchScreenshots {
    private val dir = "../docs/screenshots"

    @Before fun tz() = TimeZone.setDefault(TimeZone.getTimeZone("Europe/Rome"))

    /** Maschera tonda come il display del Galaxy Watch. */
    private fun shot(name: String, content: @Composable () -> Unit) =
        captureRoboImage("$dir/watch-$name.png") {
            Box(Modifier.fillMaxSize().background(Color.White)) {
                Box(Modifier.fillMaxSize().clip(CircleShape).background(Color.Black)) {
                    KairosTheme { AppScaffold { content() } }
                }
            }
        }

    @Test fun list() = shot("1-elenco") {
        FlightListContent(SampleData.flights.take(2), refreshing = false, isDemo = false, now = SampleData.now, onOpen = {}, onAdd = {}, onRefresh = {})
    }

    @Test fun detail() = shot("2-dettaglio") {
        FlightDetailContent(SampleData.today, SampleData.plan, refreshing = false, now = SampleData.now, onRefresh = {}, onRemove = {})
    }

    @Test fun leavePlan() = shot("2b-quando-partire") {
        FlightDetailContent(SampleData.today, SampleData.plan, refreshing = false, now = SampleData.now, onRefresh = {}, onRemove = {}, initialItem = 3)
    }

    @Test fun boardingPass() = shot("2c-carta-imbarco") {
        FlightDetailContent(SampleData.today, SampleData.plan, refreshing = false, now = SampleData.now, onRefresh = {}, onRemove = {}, initialItem = 8)
    }

    @Test fun inFlight() = shot("3-in-volo") {
        FlightDetailContent(SampleData.airborne, null, refreshing = false, now = SampleData.airborneNow, onRefresh = {}, onRemove = {})
    }
}
