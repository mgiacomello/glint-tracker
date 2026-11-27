package digital.giacomello.kairos.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material3.Card
import androidx.wear.compose.material3.ListHeader
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.Text
import digital.giacomello.kairos.model.Flight
import digital.giacomello.kairos.stats.TravelStats
import digital.giacomello.kairos.ui.FlightsViewModel
import digital.giacomello.kairos.ui.theme.KairosColors
import digital.giacomello.kairos.ui.theme.c
import java.util.Locale

@Composable
fun StatsScreen(vm: FlightsViewModel) {
    val flights by vm.flights.collectAsStateWithLifecycle()
    StatsContent(flights)
}

/** Statistiche compatte per l'orologio: totali, puntualità, ritardi, top rotte. */
@Composable
fun StatsContent(flights: List<Flight>, initialItem: Int = 0) {
    val s = remember(flights) { TravelStats.from(flights) }
    val listState = rememberScalingLazyListState(initialCenterItemIndex = initialItem)

    ScreenScaffold(scrollState = listState) { padding ->
        ScalingLazyColumn(state = listState, contentPadding = padding, modifier = Modifier.fillMaxWidth()) {
            item { ListHeader { Text("Statistiche", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold) } }
            item {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    Text("%,d km".format(Locale.ITALIAN, s.km), fontSize = 28.sp, fontWeight = FontWeight.Black)
                    Text("${s.flights} voli · ${s.airMinutes / 60}h in volo", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("${s.airports} aeroporti · ${s.countries} paesi", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            item {
                val flown = remember(flights) { flights.filter { it.status.isFinished && it.status != digital.giacomello.kairos.model.FlightStatus.CANCELED } }
                WearAllRoutesMap(flown, MaterialTheme.colorScheme.primary, Modifier.fillMaxWidth().height(110.dp))
            }
            item { ListHeader { Text("Ritardi") } }
            item {
                Card(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth()) {
                    Column {
                        val pct = s.onTimePct
                        val pctColor = when {
                            pct == null -> KairosColors.MUTED
                            pct >= 80 -> KairosColors.ON_TIME
                            pct >= 60 -> KairosColors.DELAY
                            else -> KairosColors.BAD
                        }.c()
                        Text("${s.onTimePct ?: "—"}% puntuali", fontSize = 18.sp, fontWeight = FontWeight.Bold, color = pctColor)
                        Row2("Medio", s.avgArrivalDelay?.let { "$it min" } ?: "—")
                        Row2("Totale perso", "${s.totalDelayMinutes / 60}h ${s.totalDelayMinutes % 60}m")
                        Row2("Oltre 1h", "${s.delayedOver60}")
                        Row2("Cancellati", "${s.canceled}")
                        s.worstDelay?.let { (f, d) -> Row2("Peggiore", "+${d}' ${f.number}") }
                    }
                }
            }
            item { ListHeader { Text("Rotte top") } }
            item {
                Card(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth()) {
                    Column { s.topRoutes.take(4).forEach { Row2(it.name, "${it.count}×") } }
                }
            }
            s.longest?.let { f ->
                item {
                    Card(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth()) {
                        Column {
                            Text("Volo più lungo", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text("${f.departure.iata} → ${f.arrival.iata}", fontSize = 18.sp, fontWeight = FontWeight.Bold)
                            Text("%,d km".format(Locale.ITALIAN, TravelStats.distanceKm(f)), fontSize = 12.sp)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Row2(k: String, v: String) =
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(k, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(v, fontSize = 12.sp, maxLines = 1)
    }
