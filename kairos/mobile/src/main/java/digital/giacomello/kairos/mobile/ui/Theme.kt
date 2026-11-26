package digital.giacomello.kairos.mobile.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import digital.giacomello.kairos.model.Flight
import digital.giacomello.kairos.model.FlightStatus

/** Palette Kair.OS: ambra su grafite. */
object KColors {
    val Amber = Color(0xFFFFB547)
    val AmberDark = Color(0xFFB8761A)
    val OnTime = Color(0xFF2FB76A)
    val Delay = Color(0xFFE59A1E)
    val Bad = Color(0xFFE5484D)
    val Air = Color(0xFF3B82F6)
    val Muted = Color(0xFF8A8F98)

    fun forStatus(f: Flight): Color = when {
        f.status == FlightStatus.CANCELED || f.status == FlightStatus.DIVERTED -> Bad
        f.status.isAirborne -> Air
        f.status.isFinished -> Muted
        f.departure.delayMinutes >= 15 || f.status == FlightStatus.DELAYED -> Delay
        else -> OnTime
    }
}

@Composable
fun KairosTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    MaterialTheme(
        colorScheme = if (dark) darkColorScheme(
            primary = KColors.Amber, onPrimary = Color.Black,
            primaryContainer = Color(0xFF3A2A10), onPrimaryContainer = KColors.Amber,
            background = Color(0xFF090B0E), surface = Color(0xFF090B0E),
            surfaceContainer = Color(0xFF14171C), surfaceContainerHigh = Color(0xFF1C2026),
            outlineVariant = Color(0xFF2B3038), onSurfaceVariant = Color(0xFF9AA1AB),
        ) else lightColorScheme(
            primary = KColors.AmberDark, onPrimary = Color.White,
            primaryContainer = Color(0xFFFFE7C2), onPrimaryContainer = Color(0xFF3A2A10),
            background = Color(0xFFFAF8F5), surface = Color(0xFFFAF8F5),
        ),
        content = content,
    )
}
