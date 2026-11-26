package digital.giacomello.kairos.tile

import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.DimensionBuilders.dp
import androidx.wear.protolayout.DimensionBuilders.sp
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.LayoutElementBuilders.Column
import androidx.wear.protolayout.LayoutElementBuilders.FontStyle
import androidx.wear.protolayout.LayoutElementBuilders.Spacer
import androidx.wear.protolayout.LayoutElementBuilders.Text
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.google.common.util.concurrent.ListenableFuture
import digital.giacomello.kairos.Graph
import digital.giacomello.kairos.model.Flight
import digital.giacomello.kairos.notify.Notifier
import digital.giacomello.kairos.travel.LeavePlan
import digital.giacomello.kairos.travel.TravelService
import digital.giacomello.kairos.ui.MainActivity
import digital.giacomello.kairos.ui.theme.KairosColors
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.guava.future

/** Tile "Prossimo volo": scorri dal quadrante e vedi subito stato, countdown e gate. */
class NextFlightTileService : TileService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> =
        scope.future {
            val now = System.currentTimeMillis()
            val next = Graph.repository(this@NextFlightTileService).snapshot()
                .firstOrNull { !it.status.isFinished || (it.arrival.best ?: 0) > now - 3_600_000 }
            val plan = next?.let { Graph.travel(this@NextFlightTileService).planFor(it.id) }

            TileBuilders.Tile.Builder()
                .setResourcesVersion(RES_VERSION)
                .setFreshnessIntervalMillis(if (next != null) 5 * 60_000L else 60 * 60_000L)
                .setTileTimeline(TimelineBuilders.Timeline.fromLayoutElement(layout(next, plan, now)))
                .build()
        }

    override fun onTileResourcesRequest(requestParams: RequestBuilders.ResourcesRequest): ListenableFuture<ResourceBuilders.Resources> =
        scope.future { ResourceBuilders.Resources.Builder().setVersion(RES_VERSION).build() }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    private fun layout(f: Flight?, plan: LeavePlan?, now: Long): LayoutElementBuilders.LayoutElement {
        val col = Column.Builder()
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .setModifiers(
                ModifiersBuilders.Modifiers.Builder()
                    .setClickable(
                        ModifiersBuilders.Clickable.Builder()
                            .setId("open")
                            .setOnClick(
                                ActionBuilders.LaunchAction.Builder()
                                    .setAndroidActivity(
                                        ActionBuilders.AndroidActivity.Builder()
                                            .setPackageName(packageName)
                                            .setClassName(MainActivity::class.java.name)
                                            .build()
                                    ).build()
                            ).build()
                    ).build()
            )

        if (f == null) {
            col.addContent(text("Kair.OS", 16f, KairosColors.ACCENT, bold = true))
                .addContent(space(6f))
                .addContent(text("Nessun volo in programma", 13f, KairosColors.MUTED))
                .addContent(space(4f))
                .addContent(text("Tocca per aggiungerne uno", 12f, KairosColors.MUTED))
            return col.build()
        }

        val statusColor = KairosColors.forStatus(f)
        col.addContent(text(f.number, 13f, KairosColors.MUTED))
            .addContent(space(2f))
            .addContent(text("${f.departure.iata} → ${f.arrival.iata}", 24f, KairosColors.TEXT, bold = true))
            .addContent(space(4f))
            .addContent(text(Notifier.liveLine(f, now), 14f, statusColor, bold = true))
            .addContent(space(4f))
            .addContent(
                text(
                    "${f.departure.localTime(f.departure.best)} → ${f.arrival.localTime(f.arrival.best)}" +
                        (f.departure.gate?.let { "  ·  G $it" } ?: ""),
                    13f, KairosColors.TEXT,
                )
            )
        if (plan != null && now < plan.leaveAt) {
            col.addContent(space(2f)).addContent(text("Esci alle ${TravelService.hhmm(plan.leaveAt)}", 13f, KairosColors.ACCENT, bold = true))
        }
        f.booking?.seat?.let { col.addContent(space(2f)).addContent(text("Posto $it", 12f, KairosColors.MUTED)) }
        if (f.departure.delayMinutes >= 5 && !f.status.isAirborne) {
            col.addContent(space(2f)).addContent(text("+${f.departure.delayMinutes} min", 12f, KairosColors.DELAY))
        }
        return col.build()
    }

    private fun text(s: String, size: Float, color: Int, bold: Boolean = false) =
        Text.Builder()
            .setText(s)
            .setMaxLines(2)
            .setFontStyle(
                FontStyle.Builder()
                    .setSize(sp(size))
                    .setColor(argb(color))
                    .setWeight(if (bold) LayoutElementBuilders.FONT_WEIGHT_BOLD else LayoutElementBuilders.FONT_WEIGHT_NORMAL)
                    .build()
            ).build()

    private fun space(h: Float) = Spacer.Builder().setHeight(dp(h)).build()

    private companion object { const val RES_VERSION = "1" }
}
