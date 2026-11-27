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
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.rotateRad
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.platform.LocalContext
import digital.giacomello.kairos.geo.LandMask
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

/** Mappa della rotta per il polso: terre a puntini, arco, aeroporti e aereo in volo. */
@Composable
fun WearRouteMap(f: Flight, progress: Float, color: Color, modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    val coords = remember(f.departure.iata, f.arrival.iata) { LandMask.coords(f) }
    BoxWithConstraints(modifier) {
        val aspect = (constraints.maxWidth.toFloat() / constraints.maxHeight.coerceAtLeast(1)).coerceIn(0.5f, 4f)
        val frame = remember(coords, aspect) { coords?.let { (a, b) -> LandMask.get(ctx).frame(a, b, aspect, 34, 0.3) } }
        Canvas(Modifier.fillMaxSize()) {
            if (frame == null) return@Canvas
            val w = size.width; val h = size.height
            fun o(p: digital.giacomello.kairos.geo.P) = Offset(p.x * w, p.y * h)
            frame.land.forEach { drawCircle(Color.White.copy(alpha = 0.22f), 1.6.dp.toPx(), o(it)) }
            val pts = frame.path.map { o(it) }
            for (i in 0 until pts.size - 1) {
                val done = (i + 1f) / (pts.size - 1) <= progress
                drawLine(if (done) color else Color(0x66FFFFFF), pts[i], pts[i + 1], strokeWidth = if (done) 3.dp.toPx() else 1.5.dp.toPx(),
                    cap = StrokeCap.Round, pathEffect = if (done) null else PathEffect.dashPathEffect(floatArrayOf(5f, 5f)))
            }
            drawCircle(color, 4.dp.toPx(), o(frame.from))
            drawCircle(if (progress >= 1f) color else Color.White, 4.dp.toPx(), o(frame.to))
            if (progress in 0.001f..0.999f) {
                val (pp, angle) = frame.planeAt(progress)
                val s = 8.dp.toPx(); val c = o(pp)
                translate(c.x, c.y) {
                    rotateRad(angle, pivot = Offset.Zero) {
                        drawPath(Path().apply {
                            moveTo(s, 0f); lineTo(s * 0.2f, s * 0.15f); lineTo(-s * 0.15f, s * 0.9f); lineTo(-s * 0.35f, s * 0.9f)
                            lineTo(-s * 0.25f, s * 0.15f); lineTo(-s * 0.75f, s * 0.12f); lineTo(-s, s * 0.45f); lineTo(-s * 0.9f, 0f)
                            lineTo(-s, -s * 0.45f); lineTo(-s * 0.75f, -s * 0.12f); lineTo(-s * 0.25f, -s * 0.15f); lineTo(-s * 0.35f, -s * 0.9f)
                            lineTo(-s * 0.15f, -s * 0.9f); lineTo(s * 0.2f, -s * 0.15f); close()
                        }, color)
                    }
                }
            }
        }
    }
}

/** Mini mappa di tutte le rotte per il polso. */
@Composable
fun WearAllRoutesMap(flights: List<Flight>, color: Color, modifier: Modifier = Modifier) {
    val ctx = LocalContext.current
    val routes = remember(flights) {
        flights.mapNotNull { f -> LandMask.coords(f)?.let { listOf(f.departure.iata, f.arrival.iata).sorted() to it } }
            .groupBy { it.first }.map { (_, v) -> v.first().second to v.size }
    }
    BoxWithConstraints(modifier) {
        val aspect = (constraints.maxWidth.toFloat() / constraints.maxHeight.coerceAtLeast(1)).coerceIn(0.5f, 4f)
        val frame = remember(routes, aspect) { LandMask.get(ctx).frameMany(routes.map { it.first }, aspect, 40, 0.1) }
        Canvas(Modifier.fillMaxSize()) {
            if (frame == null) return@Canvas
            val w = size.width; val h = size.height
            frame.land.forEach { drawCircle(Color.White.copy(alpha = 0.2f), 1.3.dp.toPx(), Offset(it.x * w, it.y * h)) }
            val maxN = routes.maxOfOrNull { it.second }?.toFloat() ?: 1f
            frame.paths.forEachIndexed { i, pts ->
                val k = routes[i].second / maxN
                for (j in 0 until pts.size - 1) drawLine(color.copy(alpha = 0.5f + 0.5f * k),
                    Offset(pts[j].x * w, pts[j].y * h), Offset(pts[j + 1].x * w, pts[j + 1].y * h),
                    strokeWidth = (1f + 1.5f * k).dp.toPx(), cap = StrokeCap.Round)
                drawCircle(Color.White, 2.dp.toPx(), Offset(pts.first().x * w, pts.first().y * h))
                drawCircle(Color.White, 2.dp.toPx(), Offset(pts.last().x * w, pts.last().y * h))
            }
        }
    }
}
