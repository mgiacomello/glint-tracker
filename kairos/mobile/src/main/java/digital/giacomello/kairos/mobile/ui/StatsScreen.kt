package digital.giacomello.kairos.mobile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import digital.giacomello.kairos.model.Flight
import digital.giacomello.kairos.stats.Ranked
import digital.giacomello.kairos.stats.TravelStats
import java.util.Locale

@Composable
fun StatsScreen(vm: MobileViewModel, onBack: () -> Unit) {
    val flights by vm.flights.collectAsStateWithLifecycle()
    StatsContent(flights, onBack)
}

/** Statistiche di viaggio: km, ore, puntualità e ritardi, classifiche. Filtro per anno. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StatsContent(flights: List<Flight>, onBack: () -> Unit, initialYear: Int? = null) {
    var year by remember { mutableStateOf(initialYear) }
    val years = remember(flights) { TravelStats.years(flights) }
    val s = remember(flights, year) { TravelStats.from(flights, year) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Statistiche") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Indietro") } },
            )
        },
    ) { pad ->
        Column(
            Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = year == null, onClick = { year = null }, label = { Text("Sempre") })
                years.forEach { y -> FilterChip(selected = year == y, onClick = { year = y }, label = { Text("$y") }) }
            }

            // Totali
            Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                Column(Modifier.padding(20.dp)) {
                    Text("%,d km".format(Locale.ITALIAN, s.km), fontSize = 40.sp, fontWeight = FontWeight.Black, color = MaterialTheme.colorScheme.onPrimaryContainer)
                    Text(
                        "%.2f giri della Terra".format(Locale.ITALIAN, s.earthLaps),
                        color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f),
                    )
                    Row(Modifier.fillMaxWidth().padding(top = 16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Big("${s.flights}", "voli")
                        Big("${s.airMinutes / 60}h ${s.airMinutes % 60}m", "in volo")
                        Big("${s.airports}", "aeroporti")
                        Big("${s.countries}", "paesi")
                    }
                }
            }

            // Puntualità e ritardi
            Section {
                Title("Puntualità e ritardi")
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("${s.onTimePct ?: "—"}%", fontSize = 36.sp, fontWeight = FontWeight.Bold, color = punctualityColor(s.onTimePct))
                    Text("  in orario all'arrivo (entro 15')", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                s.onTimePct?.let { pct ->
                    Box(Modifier.fillMaxWidth().height(8.dp).background(KColors.Delay.copy(alpha = 0.25f), RoundedCornerShape(4.dp))) {
                        Box(Modifier.fillMaxHeight().fillMaxWidth(pct / 100f).background(KColors.OnTime, RoundedCornerShape(4.dp)))
                    }
                }
                KVRow("Ritardo medio all'arrivo", s.avgArrivalDelay?.let { "${it} min" } ?: "—")
                KVRow("Tempo totale perso in ritardi", "${s.totalDelayMinutes / 60}h ${s.totalDelayMinutes % 60}m")
                KVRow("Voli con oltre 1h di ritardo", "${s.delayedOver60}")
                KVRow("Cancellati", "${s.canceled}")
                if (s.diverted > 0) KVRow("Dirottati", "${s.diverted}")
                s.worstDelay?.let { (f, d) ->
                    KVRow("Peggior ritardo", "+${d / 60}h ${d % 60}m · ${f.number} ${f.departure.iata}→${f.arrival.iata}")
                }
                if (s.delayedOver60 > 0) Text(
                    "Ritardi ≥3h nell'UE/UK possono dare diritto a compensazione (Reg. CE 261/2004 / UK261).",
                    style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            s.longest?.let { f ->
                Section {
                    Title("Volo più lungo")
                    Text("${f.departure.iata} → ${f.arrival.iata}", fontSize = 22.sp, fontWeight = FontWeight.Bold)
                    Text("${f.number} · ${prettyDate(f.date)} · ${"%,d".format(Locale.ITALIAN, TravelStats.distanceKm(f))} km", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }

            if (year == null && s.byYear.size > 1) Section {
                Title("Voli per anno")
                val max = s.byYear.values.max().toFloat()
                s.byYear.forEach { (y, n) -> Bar("$y", n, n / max) }
            }

            Section { Title("Rotte più frequenti"); Ranking(s.topRoutes) }
            Section { Title("Aeroporti"); Ranking(s.topAirports) }
            Section { Title("Compagnie"); Ranking(s.topAirlines) }
        }
    }
}

private fun punctualityColor(pct: Int?): Color = when {
    pct == null -> KColors.Muted
    pct >= 80 -> KColors.OnTime
    pct >= 60 -> KColors.Delay
    else -> KColors.Bad
}

@Composable
private fun Section(content: @Composable () -> Unit) =
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) { content() }
    }

@Composable
private fun Title(t: String) =
    Text(t.uppercase(), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)

@Composable
private fun Big(v: String, l: String) = Column {
    Text(v, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onPrimaryContainer)
    Text(l, fontSize = 12.sp, color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f))
}

@Composable
private fun KVRow(k: String, v: String) = Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
    Text(k, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
    Text(v, fontWeight = FontWeight.Medium)
}

@Composable
private fun Ranking(items: List<Ranked>) {
    if (items.isEmpty()) { Text("—"); return }
    val max = items.first().count.toFloat()
    items.forEach { Bar(it.name, it.count, it.count / max) }
}

@Composable
private fun Bar(label: String, n: Int, frac: Float) = Row(verticalAlignment = Alignment.CenterVertically) {
    Text(label, Modifier.width(110.dp), maxLines = 1, fontWeight = FontWeight.Medium)
    Box(Modifier.weight(1f).height(10.dp)) {
        Box(Modifier.fillMaxHeight().fillMaxWidth(frac.coerceIn(0.04f, 1f)).background(MaterialTheme.colorScheme.primary, RoundedCornerShape(5.dp)))
    }
    Text("  $n", Modifier.width(36.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
}
