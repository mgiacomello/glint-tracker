package digital.giacomello.kairos.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.Card
import androidx.wear.compose.material3.EdgeButton
import androidx.wear.compose.material3.FilledTonalButton
import androidx.wear.compose.material3.ListHeader
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.Text
import digital.giacomello.kairos.model.Endpoint
import digital.giacomello.kairos.model.Flight
import digital.giacomello.kairos.model.formatDuration
import digital.giacomello.kairos.notify.Notifier
import digital.giacomello.kairos.travel.TravelService
import digital.giacomello.kairos.ui.FlightsViewModel
import digital.giacomello.kairos.ui.theme.KairosColors
import digital.giacomello.kairos.ui.theme.c
import kotlinx.coroutines.delay
import java.text.DateFormat
import java.util.Date

@Composable
fun FlightDetailScreen(vm: FlightsViewModel, id: String, onRemoved: () -> Unit) {
    val flights by vm.flights.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    val f = flights.firstOrNull { it.id == id }
    val plan by vm.plans.collectAsStateWithLifecycle()
    val listState = rememberScalingLazyListState()

    // Tick ogni 30s per countdown e avanzamento
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) { while (true) { delay(30_000); now = System.currentTimeMillis() } }

    if (f == null) {
        ScreenScaffold(scrollState = listState) { padding ->
            ScalingLazyColumn(state = listState, contentPadding = padding) {
                item { Text("Volo non trovato", textAlign = TextAlign.Center) }
            }
        }
        return
    }

    val color = KairosColors.forStatus(f).c()

    ScreenScaffold(
        scrollState = listState,
        edgeButton = {
            EdgeButton(onClick = { vm.refreshOne(f.id) }, enabled = !refreshing) {
                Text(if (refreshing) "…" else "Aggiorna")
            }
        },
    ) { padding ->
        ScalingLazyColumn(state = listState, contentPadding = padding, modifier = Modifier.fillMaxWidth()) {
            // Header: numero + stato
            item {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    Text("${f.number}${f.airline?.let { " · $it" } ?: ""}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    StatusPill(f)
                }
            }
            // Rotta + traccia
            item {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(f.departure.iata, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                        Text(f.arrival.iata, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                    }
                    FlightArc(progress = f.progress(now), color = color)
                    Text(Notifier.liveLine(f, now), color = color, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                }
            }
            plan[f.id]?.let { p ->
                item { ListHeader { Text("Quando partire") } }
                item {
                    Card(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth()) {
                        Column {
                            Text("Esci alle ${TravelService.hhmm(p.leaveAt)}", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                            Text("${p.mode.label} · ${p.travelMinutes}' (${p.travelSource})", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            p.travelSummary?.let { Text(it, fontSize = 12.sp, maxLines = 2) }
                            InfoRow("In aeroporto", TravelService.hhmm(p.arriveAirportAt))
                            if (p.loungeMinutes > 0) InfoRow("Lounge", "${p.loungeMinutes}'")
                            InfoRow("Al gate entro", TravelService.hhmm(p.gateBy))
                        }
                    }
                }
                p.strikes.forEach { s ->
                    item {
                        Card(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth()) {
                            Column {
                                Text("⚠ ${s.title}", color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                Text(s.detail, fontSize = 11.sp, maxLines = 4)
                            }
                        }
                    }
                }
            }
            item { EndpointCard("Partenza", f.departure, showBelt = false) }
            item { EndpointCard("Arrivo", f.arrival, showBelt = true) }

            // Carta d'imbarco (dati da Gmail)
            f.booking?.let { b ->
                item { ListHeader { Text("Carta d'imbarco") } }
                item {
                    Card(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth()) {
                        Column {
                            b.seat?.let { InfoRow("Posto", it) }
                            b.boardingTime?.let { InfoRow("Imbarco", it) }
                            b.gateCloses?.let { InfoRow("Gate chiude", it) }
                            b.boardingGroup?.let { InfoRow("Gruppo", it) }
                            b.cabin?.let { InfoRow("Classe", it) }
                            b.pnr?.let { InfoRow("PNR", it) }
                            b.sequence?.let { InfoRow("Sequenza", it) }
                        }
                    }
                }
            }

            // Info volo
            item { ListHeader { Text("Dettagli") } }
            item {
                Card(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth()) {
                    Column {
                        f.durationMinutes?.let { InfoRow("Durata", formatDuration(it.toLong())) }
                        f.distanceKm?.let { InfoRow("Distanza", "$it km") }
                        f.aircraftModel?.let { InfoRow("Aereo", it) }
                        f.aircraftReg?.let { InfoRow("Matricola", it) }
                        InfoRow("Aggiornato", DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(f.lastUpdated)))
                        if (f.isDemo) InfoRow("Fonte", "Dati simulati (demo)")
                    }
                }
            }
            item {
                FilledTonalButton(
                    onClick = { vm.remove(f.id); onRemoved() },
                    colors = ButtonDefaults.filledTonalButtonColors(contentColor = MaterialTheme.colorScheme.error),
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Rimuovi volo") }
            }
        }
    }
}

@Composable
private fun EndpointCard(title: String, e: Endpoint, showBelt: Boolean) {
    Card(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth()) {
        Column {
            Text("$title · ${e.displayName}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
            Row(verticalAlignment = Alignment.Bottom) {
                Text(e.localTime(e.best), fontSize = 22.sp, fontWeight = FontWeight.Bold)
                if (e.scheduled != null && e.delayMinutes != 0) {
                    Text(
                        "  ${e.localTime(e.scheduled)}",
                        fontSize = 13.sp,
                        textDecoration = TextDecoration.LineThrough,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            val bits = buildList {
                e.terminal?.let { add("T $it") }
                e.gate?.let { add("Gate $it") }
                if (showBelt) e.baggageBelt?.let { add("Nastro $it") } else e.checkInDesk?.let { add("Check-in $it") }
            }
            Text(if (bits.isEmpty()) "Gate non ancora assegnato" else bits.joinToString("  ·  "), fontSize = 13.sp)
        }
    }
}

@Composable
private fun InfoRow(k: String, v: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(k, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(v, fontSize = 12.sp, maxLines = 1)
    }
}
