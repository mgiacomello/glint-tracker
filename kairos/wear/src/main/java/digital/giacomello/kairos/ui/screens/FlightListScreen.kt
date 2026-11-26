package digital.giacomello.kairos.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material3.Card
import androidx.wear.compose.material3.EdgeButton
import androidx.wear.compose.material3.FilledTonalButton
import androidx.wear.compose.material3.ListHeader
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.Text
import digital.giacomello.kairos.model.Flight
import digital.giacomello.kairos.notify.Notifier
import digital.giacomello.kairos.ui.FlightsViewModel
import digital.giacomello.kairos.ui.theme.KairosColors
import digital.giacomello.kairos.ui.theme.c

@Composable
fun FlightListScreen(vm: FlightsViewModel, onOpen: (String) -> Unit, onAdd: () -> Unit, onStats: () -> Unit = {}) {
    val flights by vm.flights.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    FlightListContent(flights, refreshing, vm.isDemo, System.currentTimeMillis(), onOpen, onAdd, onRefresh = { vm.refresh() }, onStats = onStats)
}

/** Elenco voli senza stato (usato anche per gli screenshot). */
@Composable
fun FlightListContent(
    flights: List<Flight>, refreshing: Boolean, isDemo: Boolean, now: Long,
    onOpen: (String) -> Unit, onAdd: () -> Unit, onRefresh: () -> Unit, onStats: () -> Unit = {},
) {
    val listState = rememberScalingLazyListState()

    ScreenScaffold(
        scrollState = listState,
        edgeButton = {
            EdgeButton(onClick = onAdd) { Text("+ Volo") }
        },
    ) { padding ->
        ScalingLazyColumn(state = listState, contentPadding = padding, modifier = Modifier.fillMaxWidth()) {
            item {
                ListHeader {
                    Text(
                        if (isDemo) "Kair.OS · DEMO" else "Kair.OS",
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
            if (flights.isEmpty()) {
                item {
                    Text(
                        "Nessun volo.\nAggiungi il tuo prossimo volo con il numero (es. AZ610).",
                        textAlign = TextAlign.Center,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 13.sp,
                    )
                }
            }
            // Sul polso solo i prossimi voli + gli ultimi 2; lo storico completo è nelle statistiche
            val shown = flights.filter { !it.status.isFinished } + flights.filter { it.status.isFinished }.sortedByDescending { it.date }.take(2)
            items(shown, key = { it.id }) { f -> FlightCard(f, now) { onOpen(f.id) } }
            if (flights.any { it.status.isFinished }) {
                item {
                    FilledTonalButton(onClick = onStats, modifier = Modifier.fillMaxWidth()) { Text("Statistiche") }
                }
            }
            if (flights.isNotEmpty()) {
                item {
                    FilledTonalButton(onClick = onRefresh, modifier = Modifier.fillMaxWidth()) {
                        Text(if (refreshing) "Aggiorno…" else "Aggiorna")
                    }
                }
            }
        }
    }
}

@Composable
private fun FlightCard(f: Flight, now: Long, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth()) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(f.number, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                StatusPill(f)
            }
            Spacer(Modifier.height(2.dp))
            Text(
                "${f.departure.iata} → ${f.arrival.iata}",
                fontSize = 20.sp, fontWeight = FontWeight.Bold,
            )
            Text(
                "${f.departure.localTime(f.departure.best)} – ${f.arrival.localTime(f.arrival.best)}  ·  ${shortDate(f.date)}",
                fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (!f.status.isFinished) {
                Text(Notifier.liveLine(f, now), fontSize = 12.sp, color = KairosColors.forStatus(f).c())
            }
        }
    }
}

private fun shortDate(iso: String): String = runCatching {
    java.time.LocalDate.parse(iso).format(java.time.format.DateTimeFormatter.ofPattern("d MMM", java.util.Locale.ITALIAN))
}.getOrDefault(iso)
