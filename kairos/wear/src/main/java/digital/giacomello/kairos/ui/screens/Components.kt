package digital.giacomello.kairos.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material3.Text
import digital.giacomello.kairos.model.Flight
import digital.giacomello.kairos.ui.theme.KairosColors
import digital.giacomello.kairos.ui.theme.c

/** Etichetta colorata con lo stato del volo. */
@Composable
fun StatusPill(f: Flight, modifier: Modifier = Modifier) {
    val col = KairosColors.forStatus(f).c()
    val label = if (f.departure.delayMinutes >= 5 && !f.status.isAirborne && !f.status.isFinished)
        "+${f.departure.delayMinutes} min" else f.status.label
    Box(
        modifier
            .background(col.copy(alpha = 0.18f), RoundedCornerShape(50))
            .padding(horizontal = 8.dp, vertical = 2.dp)
    ) {
        Text(label, color = col, fontSize = 11.sp, fontWeight = FontWeight.Bold)
    }
}

/**
 * Traccia del volo: arco tratteggiato da origine a destinazione con un punto
 * che avanza in base al progresso reale.
 */
@Composable
fun FlightArc(progress: Float, color: Color, modifier: Modifier = Modifier) {
    Canvas(modifier.fillMaxWidth().height(28.dp)) {
        val pad = 8.dp.toPx()
        val w = size.width - pad * 2
        val baseY = size.height - 4.dp.toPx()
        val lift = size.height - 8.dp.toPx()
        fun point(t: Float): Offset {
            val x = pad + w * t
            val y = baseY - lift * 4 * t * (1 - t) // parabola
            return Offset(x, y)
        }
        // percorso completo (tratteggiato)
        val steps = 40
        for (i in 0 until steps) {
            val a = point(i / steps.toFloat())
            val b = point((i + 1) / steps.toFloat())
            val done = (i + 1) / steps.toFloat() <= progress
            drawLine(
                color = if (done) color else Color(0x55FFFFFF),
                start = a, end = b,
                strokeWidth = if (done) 3.dp.toPx() else 2.dp.toPx(),
                cap = StrokeCap.Round,
                pathEffect = if (done) null else PathEffect.dashPathEffect(floatArrayOf(4f, 6f)),
            )
        }
        drawCircle(Color(0x88FFFFFF), 3.dp.toPx(), point(0f))
        drawCircle(Color(0x88FFFFFF), 3.dp.toPx(), point(1f))
        val p = point(progress.coerceIn(0f, 1f))
        drawCircle(color, 5.dp.toPx(), p)
        drawCircle(Color.Black, 5.dp.toPx(), p, style = Stroke(1.5.dp.toPx()))
    }
}
