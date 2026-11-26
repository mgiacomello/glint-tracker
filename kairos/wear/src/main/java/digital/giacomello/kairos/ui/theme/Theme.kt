package digital.giacomello.kairos.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.wear.compose.material3.ColorScheme
import androidx.wear.compose.material3.MaterialTheme
import digital.giacomello.kairos.model.Flight
import digital.giacomello.kairos.model.FlightStatus

/** Palette condivisa tra Compose, Tile (protolayout) e complicazioni. ARGB int. */
object KairosColors {
    const val ACCENT = 0xFFFFB547.toInt()   // ambra Kair.OS
    const val TEXT = 0xFFF2F2F2.toInt()
    const val MUTED = 0xFF9AA0A6.toInt()
    const val ON_TIME = 0xFF4ADE80.toInt()
    const val DELAY = 0xFFFFB547.toInt()
    const val BAD = 0xFFFF5A5A.toInt()
    const val AIR = 0xFF60A5FA.toInt()
    const val SURFACE = 0xFF1C1B1F.toInt()

    fun forStatus(f: Flight): Int = when {
        f.status == FlightStatus.CANCELED || f.status == FlightStatus.DIVERTED -> BAD
        f.status.isAirborne -> AIR
        f.status.isFinished -> MUTED
        f.departure.delayMinutes >= 15 || f.status == FlightStatus.DELAYED -> DELAY
        else -> ON_TIME
    }
}

fun Int.c() = Color(this)

@Composable
fun KairosTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = ColorScheme(
            primary = KairosColors.ACCENT.c(),
            onPrimary = Color.Black,
            primaryContainer = Color(0xFF3A2A10),
            onPrimaryContainer = KairosColors.ACCENT.c(),
            surfaceContainer = KairosColors.SURFACE.c(),
            onSurface = KairosColors.TEXT.c(),
            onSurfaceVariant = KairosColors.MUTED.c(),
            background = Color.Black,
        ),
        content = content,
    )
}
