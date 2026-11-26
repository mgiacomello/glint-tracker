package digital.giacomello.kairos.mobile.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.unit.dp

/** Traccia del volo: arco con punto che avanza in base al progresso reale. */
@Composable
fun FlightArc(progress: Float, color: Color, modifier: Modifier = Modifier, height: Int = 36) {
    Canvas(modifier.fillMaxWidth().height(height.dp)) {
        val pad = 6.dp.toPx()
        val w = size.width - pad * 2
        val baseY = size.height - 4.dp.toPx()
        val lift = size.height - 10.dp.toPx()
        fun pt(t: Float) = Offset(pad + w * t, baseY - lift * 4 * t * (1 - t))
        val steps = 48
        for (i in 0 until steps) {
            val t1 = (i + 1) / steps.toFloat()
            val done = t1 <= progress
            drawLine(
                if (done) color else color.copy(alpha = 0.3f), pt(i / steps.toFloat()), pt(t1),
                strokeWidth = if (done) 3.dp.toPx() else 2.dp.toPx(), cap = StrokeCap.Round,
                pathEffect = if (done) null else PathEffect.dashPathEffect(floatArrayOf(5f, 7f)),
            )
        }
        val p = pt(progress.coerceIn(0f, 1f))
        drawCircle(color, 6.dp.toPx(), p)
        drawCircle(Color.White, 2.5.dp.toPx(), p)
    }
}
