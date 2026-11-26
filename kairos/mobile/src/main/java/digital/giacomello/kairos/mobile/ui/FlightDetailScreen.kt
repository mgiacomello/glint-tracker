package digital.giacomello.kairos.mobile.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import digital.giacomello.kairos.model.Endpoint
import digital.giacomello.kairos.model.Flight
import digital.giacomello.kairos.model.formatDuration
import digital.giacomello.kairos.notify.Notifier
import digital.giacomello.kairos.travel.LeavePlan
import digital.giacomello.kairos.travel.StrikeSource
import digital.giacomello.kairos.travel.TravelService
import kotlinx.coroutines.delay
import java.text.DateFormat
import java.util.Date

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FlightDetailScreen(vm: MobileViewModel, id: String, onBack: () -> Unit) {
    val flights by vm.flights.collectAsStateWithLifecycle()
    val plans by vm.plans.collectAsStateWithLifecycle()
    val f = flights.firstOrNull { it.id == id }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) { while (true) { delay(30_000); now = System.currentTimeMillis() } }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(f?.let { "${it.number}${it.airline?.let { a -> " · $a" } ?: ""}" } ?: "") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Indietro") } },
                actions = {
                    IconButton(onClick = { vm.sync() }) { Icon(Icons.Default.Refresh, "Aggiorna") }
                    if (f != null) IconButton(onClick = { vm.remove(f.id); onBack() }) { Icon(Icons.Default.Delete, "Rimuovi") }
                },
            )
        },
    ) { pad ->
        if (f == null) { Text("Volo non trovato", Modifier.padding(pad).padding(24.dp)); return@Scaffold }
        Column(
            Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Hero(f, now)
            plans[f.id]?.let { LeavePlanCard(it) }
            EndpointCard("Partenza", f.departure, departure = true)
            EndpointCard("Arrivo", f.arrival, departure = false)
            BoardingCard(f)
            InfoCard(f)
            Text(StrikeSource.ATTRIBUTION + " · Percorsi: Google", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun Hero(f: Flight, now: Long) {
    val c = KColors.forStatus(f)
    KCard {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(prettyDate(f.date), color = MaterialTheme.colorScheme.onSurfaceVariant)
            StatusChip(f)
        }
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(f.departure.iata, fontSize = 40.sp, fontWeight = FontWeight.Black)
                Text(f.departure.displayName, style = MaterialTheme.typography.bodySmall, maxLines = 1)
            }
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.End) {
                Text(f.arrival.iata, fontSize = 40.sp, fontWeight = FontWeight.Black)
                Text(f.arrival.displayName, style = MaterialTheme.typography.bodySmall, maxLines = 1)
            }
        }
        FlightArc(f.progress(now), c, height = 48)
        Text(Notifier.liveLine(f, now), color = c, fontWeight = FontWeight.Bold, fontSize = 18.sp)
    }
}

@Composable
private fun LeavePlanCard(p: LeavePlan) {
    val ctx = LocalContext.current
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
        Column(Modifier.padding(16.dp)) {
            Text("QUANDO PARTIRE", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onPrimaryContainer)
            Text("Esci alle ${TravelService.hhmm(p.leaveAt)}", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onPrimaryContainer)
            Text(
                "${p.mode.label} · ${p.travelMinutes} min (${p.travelSource})",
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
            p.travelSummary?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onPrimaryContainer) }
            Spacer(Modifier.height(8.dp))
            // Scaletta all'indietro: dal gate a casa
            p.steps.reversed().forEach { s -> KV(s.label, "${s.minutes}'", MaterialTheme.colorScheme.onPrimaryContainer) }
            HorizontalDivider(Modifier.padding(vertical = 6.dp))
            KV("Arrivo in aeroporto", TravelService.hhmm(p.arriveAirportAt), MaterialTheme.colorScheme.onPrimaryContainer)
            KV("Al gate entro", TravelService.hhmm(p.gateBy), MaterialTheme.colorScheme.onPrimaryContainer)
            p.strikes.forEach { s ->
                Spacer(Modifier.height(8.dp))
                Text("⚠ ${s.title}", color = KColors.Bad, fontWeight = FontWeight.Bold)
                Text(s.detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onPrimaryContainer)
            }
            if (p.loungeMinutes > 0) {
                Spacer(Modifier.height(8.dp))
                OutlinedButton(onClick = {
                    runCatching {
                        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.loungekey.com/")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    }
                }) { Text("Lounge disponibili (LoungeKey)") }
            }
        }
    }
}

@Composable
private fun EndpointCard(title: String, e: Endpoint, departure: Boolean) = KCard {
    Text(title.uppercase(), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Text(e.name ?: e.displayName, style = MaterialTheme.typography.titleMedium)
    Row(verticalAlignment = Alignment.Bottom) {
        Text(e.localTime(e.best), fontSize = 30.sp, fontWeight = FontWeight.Bold)
        if (e.scheduled != null && e.delayMinutes != 0) {
            Text(
                "  ${e.localTime(e.scheduled)}", textDecoration = TextDecoration.LineThrough,
                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(bottom = 4.dp),
            )
            Text(
                "  ${if (e.delayMinutes > 0) "+" else ""}${e.delayMinutes} min",
                color = if (e.delayMinutes > 0) KColors.Delay else KColors.OnTime, modifier = Modifier.padding(bottom = 4.dp),
            )
        }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
        Big("Terminal", e.terminal)
        Big("Gate", e.gate)
        if (departure) Big("Check-in", e.checkInDesk) else Big("Nastro", e.baggageBelt)
    }
}

@Composable
private fun BoardingCard(f: Flight) {
    val b = f.booking ?: return
    KCard {
        Text("CARTA D'IMBARCO", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
            Big("Posto", b.seat)
            Big("Gruppo", b.boardingGroup)
            Big("Imbarco", b.boardingTime)
            Big("Gate chiude", b.gateCloses)
        }
        b.cabin?.let { KV("Classe", it) }
        b.pnr?.let { KV("Codice prenotazione", it) }
        b.sequence?.let { KV("Sequenza", it) }
        Text("Dati letti dalle email di conferma / carta d'imbarco", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun InfoCard(f: Flight) = KCard {
    Text("VOLO", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    f.durationMinutes?.let { KV("Durata", formatDuration(it.toLong())) }
    f.distanceKm?.let { KV("Distanza", "$it km") }
    f.aircraftModel?.let { KV("Aereo", it) }
    f.aircraftReg?.let { KV("Matricola", it) }
    KV("Aggiornato", if (f.lastUpdated > 0) DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(f.lastUpdated)) else "—")
    if (f.emailOnly) KV("Fonte", "Solo email (dati live non ancora disponibili)")
    if (f.isDemo) KV("Fonte", "Dati simulati (demo)")
}

@Composable
private fun KCard(content: @Composable () -> Unit) {
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) { content() }
    }
}

@Composable
private fun Big(label: String, value: String?) = Column {
    Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Text(value ?: "—", fontSize = 20.sp, fontWeight = FontWeight.Bold)
}

@Composable
private fun KV(k: String, v: String, color: Color = Color.Unspecified) =
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(k, color = if (color == Color.Unspecified) MaterialTheme.colorScheme.onSurfaceVariant else color.copy(alpha = 0.8f))
        Text(v, color = color, fontWeight = FontWeight.Medium)
    }
