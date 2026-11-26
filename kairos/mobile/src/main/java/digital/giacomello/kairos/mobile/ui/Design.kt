package digital.giacomello.kairos.mobile.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotateRad
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import digital.giacomello.kairos.geo.LandMask
import digital.giacomello.kairos.geo.RouteFrame
import digital.giacomello.kairos.model.Flight
import digital.giacomello.kairos.travel.LeavePlan

/** Stile numerico "da tabellone": cifre a larghezza fissa. */
val TabularNums = TextStyle(fontFeatureSettings = "tnum")

/**
 * Mappa della rotta: terre emerse a puntini, arco di cerchio massimo (percorso fatto pieno,
 * da fare tratteggiato), aeroporti etichettati e aereo orientato lungo la rotta.
 */
@Composable
fun RouteMap(
    f: Flight, progress: Float, color: Color, modifier: Modifier = Modifier,
    dotsAcross: Int = 64, labels: Boolean = true, background: Color = MaterialTheme.colorScheme.surfaceContainer,
    padding: Double = 0.3,
) {
    val ctx = LocalContext.current
    val coords = remember(f.departure.iata, f.arrival.iata) { LandMask.coords(f) }
    val measurer = rememberTextMeasurer()
    val labelStyle = TextStyle(color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)

    BoxWithConstraints(modifier.background(background)) {
        val aspect = (constraints.maxWidth.toFloat() / constraints.maxHeight.coerceAtLeast(1)).coerceIn(0.5f, 4f)
        val frame: RouteFrame? = remember(coords, aspect, dotsAcross, padding) {
            coords?.let { (a, b) -> LandMask.get(ctx).frame(a, b, aspect, dotsAcross, padding) }
        }
        Canvas(Modifier.fillMaxSize()) {
            if (frame == null) return@Canvas
            val w = size.width; val h = size.height
            fun o(p: digital.giacomello.kairos.geo.P) = Offset(p.x * w, p.y * h)
            val dotR = (frame.dotStep * w * 0.3f).coerceIn(1f, 3.4f)
            frame.land.forEach { drawCircle(Color.White.copy(alpha = 0.2f), dotR, o(it)) }

            // Rotta: alone + tratteggio + parte percorsa
            val full = Path().apply { frame.path.forEachIndexed { i, p -> if (i == 0) moveTo(p.x * w, p.y * h) else lineTo(p.x * w, p.y * h) } }
            drawPath(full, Color.White.copy(alpha = 0.35f), style = Stroke(1.6.dp.toPx(), cap = StrokeCap.Round,
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 5.dp.toPx()))))
            val n = ((frame.path.size - 1) * progress.coerceIn(0f, 1f)).toInt()
            if (n > 0) {
                val done = Path().apply { frame.path.take(n + 1).forEachIndexed { i, p -> if (i == 0) moveTo(p.x * w, p.y * h) else lineTo(p.x * w, p.y * h) } }
                drawPath(done, color.copy(alpha = 0.25f), style = Stroke(7.dp.toPx(), cap = StrokeCap.Round))
                drawPath(done, color, style = Stroke(2.6.dp.toPx(), cap = StrokeCap.Round))
            }

            // Aeroporti
            listOf(frame.from to f.departure.iata, frame.to to f.arrival.iata).forEachIndexed { i, (p, code) ->
                val c = o(p)
                drawCircle(Color.Black, 6.dp.toPx(), c)
                drawCircle(if (i == 0 || progress >= 1f) color else Color.White, 4.dp.toPx(), c)
                if (labels) {
                    val t = measurer.measure(code, labelStyle)
                    val left = (c.x - t.size.width / 2).coerceIn(4f, w - t.size.width - 4f)
                    val top = if (c.y > h * 0.6f) c.y - t.size.height - 9.dp.toPx() else c.y + 9.dp.toPx()
                    drawRoundRect(Color.Black.copy(alpha = 0.55f), Offset(left - 4.dp.toPx(), top - 1.dp.toPx()),
                        Size(t.size.width + 8.dp.toPx(), t.size.height + 2.dp.toPx()), CornerRadius(4.dp.toPx()))
                    drawText(t, topLeft = Offset(left, top))
                }
            }

            // Aereo
            val (pp, angle) = frame.planeAt(progress)
            // L'aereo compare solo in volo; a terra parla il pallino dell'aeroporto
            if (progress in 0.001f..0.999f) drawPlane(o(pp), angle, 11.dp.toPx(), color)
        }
    }
}

/** Sagoma d'aereo vista dall'alto, disegnata a mano e orientata lungo la rotta. */
fun DrawScope.drawPlane(at: Offset, angle: Float, s: Float, color: Color) {
    translate(at.x, at.y) {
        rotateRad(angle, pivot = Offset.Zero) {
            val p = Path().apply {
                moveTo(s, 0f)                              // muso
                lineTo(s * 0.25f, s * 0.12f); lineTo(-s * 0.1f, s * 0.9f); lineTo(-s * 0.32f, s * 0.9f)
                lineTo(-s * 0.2f, s * 0.14f); lineTo(-s * 0.7f, s * 0.12f); lineTo(-s * 0.9f, s * 0.42f)
                lineTo(-s, s * 0.42f); lineTo(-s * 0.88f, 0f)
                lineTo(-s, -s * 0.42f); lineTo(-s * 0.9f, -s * 0.42f); lineTo(-s * 0.7f, -s * 0.12f)
                lineTo(-s * 0.2f, -s * 0.14f); lineTo(-s * 0.32f, -s * 0.9f); lineTo(-s * 0.1f, -s * 0.9f)
                lineTo(s * 0.25f, -s * 0.12f); close()
            }
            drawPath(p, Color.Black.copy(alpha = 0.5f), style = Stroke(2.5f))
            drawPath(p, color)
        }
    }
}

/** Forma "biglietto": angoli arrotondati e due tacche semicircolari ai lati, a [notchY] dall'alto. */
class TicketShape(private val notchY: Dp, private val radius: Dp = 18.dp, private val notch: Dp = 10.dp) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val r = with(density) { radius.toPx() }
        val n = with(density) { notch.toPx() }
        val y = with(density) { notchY.toPx() }.coerceIn(n, size.height - n)
        val base = Path().apply { addRoundRect(RoundRect(0f, 0f, size.width, size.height, CornerRadius(r))) }
        val holes = Path().apply {
            addOval(androidx.compose.ui.geometry.Rect(-n, y - n, n, y + n))
            addOval(androidx.compose.ui.geometry.Rect(size.width - n, y - n, size.width + n, y + n))
        }
        return Outline.Generic(Path().apply { op(base, holes, PathOperation.Difference) })
    }
}

/** Linea tratteggiata orizzontale (separatore del biglietto). */
@Composable
fun DashedDivider(modifier: Modifier = Modifier, color: Color = MaterialTheme.colorScheme.outlineVariant) =
    Canvas(modifier.fillMaxWidth().height(1.dp)) {
        drawLine(color, Offset(0f, 0f), Offset(size.width, 0f), strokeWidth = 1.dp.toPx(),
            pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 6.dp.toPx())))
    }

/** Fase del volo per la timeline. */
data class Phase(val label: String, val time: String, val sub: String? = null, val done: Boolean, val late: Boolean = false)

/** Timeline verticale delle fasi: pallino pieno = fatto, vuoto = da fare. */
@Composable
fun Timeline(phases: List<Phase>, accent: Color) {
    Column {
        phases.forEachIndexed { i, ph ->
            Row(Modifier.fillMaxWidth().height(52.dp)) {
                Box(Modifier.width(24.dp).fillMaxHeight(), contentAlignment = Alignment.TopCenter) {
                    if (i < phases.lastIndex) Box(
                        Modifier.padding(top = 14.dp).width(2.dp).fillMaxHeight()
                            .background(if (phases[i + 1].done) accent else MaterialTheme.colorScheme.outlineVariant)
                    )
                    Box(
                        Modifier.padding(top = 4.dp).size(14.dp).background(if (ph.done) accent else MaterialTheme.colorScheme.surfaceContainer, CircleShape)
                            .then(if (ph.done) Modifier else Modifier.padding(2.dp).background(MaterialTheme.colorScheme.outlineVariant, CircleShape).padding(2.dp)
                                .background(MaterialTheme.colorScheme.surfaceContainer, CircleShape))
                    )
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(ph.label, fontWeight = FontWeight.SemiBold, color = if (ph.done) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
                    ph.sub?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
                Text(ph.time, style = TabularNums, fontSize = 17.sp, fontWeight = FontWeight.Bold,
                    color = when { ph.late -> KColors.Delay; ph.done -> MaterialTheme.colorScheme.onSurface; else -> MaterialTheme.colorScheme.onSurfaceVariant })
            }
        }
    }
}

/** Colori per i segmenti del tragitto casa → gate. */
private fun stepColor(label: String): Color = when {
    label.startsWith("Viaggio") -> Color(0xFF60A5FA)
    label.startsWith("Margine") || label.startsWith("Anticipo") -> Color(0xFF8A8F98)
    label.startsWith("Lounge") -> Color(0xFFC084FC)
    label.startsWith("Controll") || label.startsWith("Consegna") -> Color(0xFFFFB547)
    else -> Color(0xFF34D399)
}

/** Barra proporzionale del tragitto casa → gate, con legenda. */
@Composable
fun JourneyBar(p: LeavePlan) {
    val steps = p.steps.reversed()
    val total = steps.sumOf { it.minutes }.coerceAtLeast(1)
    Row(Modifier.fillMaxWidth().height(14.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        steps.forEach { s ->
            Box(Modifier.weight(s.minutes.toFloat() / total).fillMaxHeight().background(stepColor(s.label), RoundedCornerShape(4.dp)))
        }
    }
    Spacer(Modifier.height(10.dp))
    steps.forEach { s ->
        Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(10.dp).background(stepColor(s.label), CircleShape))
            Spacer(Modifier.width(10.dp))
            Text(s.label, Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text("${s.minutes} min", style = TabularNums, fontWeight = FontWeight.SemiBold)
        }
    }
}

/** Sfumatura verticale per fondere la mappa con lo sfondo. */
fun fadeToBottom(bg: Color) = Brush.verticalGradient(0f to Color.Transparent, 0.55f to Color.Transparent, 1f to bg)

@Composable
fun dpToPx(dp: Dp) = with(LocalDensity.current) { dp.toPx() }
