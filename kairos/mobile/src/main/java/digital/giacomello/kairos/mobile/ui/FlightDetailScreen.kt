package digital.giacomello.kairos.mobile.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import digital.giacomello.kairos.model.FlightStatus
import digital.giacomello.kairos.model.formatDuration
import digital.giacomello.kairos.notify.Notifier
import digital.giacomello.kairos.travel.LeavePlan
import digital.giacomello.kairos.travel.StrikeSource
import digital.giacomello.kairos.travel.TravelService
import kotlinx.coroutines.delay
import java.text.DateFormat
import java.util.Date

@Composable
fun FlightDetailScreen(vm: MobileViewModel, id: String, onBack: () -> Unit) {
    val flights by vm.flights.collectAsStateWithLifecycle()
    val plans by vm.plans.collectAsStateWithLifecycle()
    val f = flights.firstOrNull { it.id == id }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) { while (true) { delay(30_000); now = System.currentTimeMillis() } }
    FlightDetailContent(f, f?.let { plans[it.id] }, now, onBack, onRefresh = { vm.sync() }, onRemove = { vm.remove(it); onBack() })
}

/** Dettaglio volo senza stato (usato anche per gli screenshot). */
@Composable
fun FlightDetailContent(f: Flight?, plan: LeavePlan?, now: Long, onBack: () -> Unit, onRefresh: () -> Unit, onRemove: (String) -> Unit) {
    val bg = MaterialTheme.colorScheme.background
    if (f == null) { Text("Volo non trovato", Modifier.background(bg).fillMaxSize().padding(24.dp)); return }
    val c = KColors.forStatus(f)

    Surface(Modifier.fillMaxSize(), color = bg) { Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            // Mappa a tutta larghezza, sfumata nello sfondo
            Box(Modifier.fillMaxWidth().height(320.dp)) {
                RouteMap(f, f.progress(now), c, Modifier.fillMaxSize().padding(top = 56.dp, bottom = 24.dp), dotsAcross = 72, background = bg, padding = 0.3)
                Box(Modifier.fillMaxSize().background(fadeToBottom(bg)))
            }
            Column(
                Modifier.offset(y = (-12).dp).padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Header(f, now, c)
                Board(f)
                plan?.let { LeavePlanCard(it) }
                TimelineCard(f, now, c)
                BoardingPass(f)
                InfoCard(f)
                Text(StrikeSource.ATTRIBUTION + " · Percorsi: Google · Mappa: Natural Earth",
                    style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        // Barra in sovrimpressione sulla mappa
        Row(Modifier.fillMaxWidth().statusBarsPadding().padding(8.dp)) {
            RoundIcon({ onBack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Indietro") }
            Spacer(Modifier.weight(1f))
            RoundIcon(onRefresh) { Icon(Icons.Default.Refresh, "Aggiorna") }
            RoundIcon({ onRemove(f.id) }) { Icon(Icons.Default.Delete, "Rimuovi") }
        }
    } }
}

@Composable
private fun RoundIcon(onClick: () -> Unit, content: @Composable () -> Unit) =
    IconButton(onClick, colors = IconButtonDefaults.iconButtonColors(containerColor = Color.Black.copy(alpha = 0.45f), contentColor = Color.White)) { content() }

/** Intestazione: numero volo, rotta, stato e countdown grande. */
@Composable
private fun Header(f: Flight, now: Long, c: Color) = Column {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text("${f.number}${f.airline?.let { " · $it" } ?: ""}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        StatusChip(f)
    }
    Text("${f.departure.displayName} → ${f.arrival.displayName}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Spacer(Modifier.height(6.dp))
    Text(Notifier.liveLine(f, now), color = c, fontSize = 26.sp, fontWeight = FontWeight.Black, lineHeight = 30.sp)
    if (f.status.isAirborne) {
        Spacer(Modifier.height(8.dp))
        Box(Modifier.fillMaxWidth().height(6.dp).background(MaterialTheme.colorScheme.surfaceContainerHigh, RoundedCornerShape(3.dp))) {
            Box(Modifier.fillMaxWidth(f.progress(now)).height(6.dp).background(c, RoundedCornerShape(3.dp)))
        }
    }
}

/** Tabellone partenza/arrivo: codici grandi, orari a cifre fisse, terminal e gate. */
@Composable
private fun Board(f: Flight) = Card(
    Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp),
    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
) {
    Row(Modifier.padding(18.dp)) {
        EndpointColumn("PARTENZA", f.departure, Modifier.weight(1f), alignEnd = false, departure = true)
        Box(Modifier.padding(top = 26.dp, start = 6.dp, end = 6.dp)) {
            Text(f.durationMinutes?.let { formatDuration(it.toLong()) } ?: "", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        EndpointColumn("ARRIVO", f.arrival, Modifier.weight(1f), alignEnd = true, departure = false)
    }
}

@Composable
private fun EndpointColumn(title: String, e: Endpoint, modifier: Modifier, alignEnd: Boolean, departure: Boolean) =
    Column(modifier, horizontalAlignment = if (alignEnd) Alignment.End else Alignment.Start) {
        Text(title, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(e.iata, fontSize = 38.sp, fontWeight = FontWeight.Black, lineHeight = 40.sp)
        val late = e.delayMinutes >= 15
        Text(e.localTime(e.best), style = TabularNums, fontSize = 26.sp, fontWeight = FontWeight.Bold,
            color = if (late) KColors.Delay else if (e.delayMinutes < 0) KColors.OnTime else MaterialTheme.colorScheme.onSurface)
        if (e.scheduled != null && e.delayMinutes != 0) {
            Text("prev. ${e.localTime(e.scheduled)}", style = TabularNums, fontSize = 13.sp, textDecoration = TextDecoration.LineThrough,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Tile("Term.", e.terminal)
            Tile("Gate", e.gate, highlight = e.gate != null)
            if (!departure) Tile("Nastro", e.baggageBelt)
        }
    }

@Composable
private fun Tile(label: String, v: String?, highlight: Boolean = false) = Column {
    Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Text(v ?: "—", style = TabularNums, fontSize = 20.sp, fontWeight = FontWeight.Black,
        color = if (highlight) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
}

/** Piano "quando partire" con barra proporzionale del tragitto casa → gate. */
@Composable
private fun LeavePlanCard(p: LeavePlan) {
    val ctx = LocalContext.current
    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer)) {
        Column(Modifier.padding(18.dp)) {
            Text("QUANDO PARTIRE", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
            Row(verticalAlignment = Alignment.Bottom) {
                Text(TravelService.hhmm(p.leaveAt), style = TabularNums, fontSize = 44.sp, fontWeight = FontWeight.Black, color = MaterialTheme.colorScheme.primary)
                Text("  esci di casa", modifier = Modifier.padding(bottom = 9.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(p.travelSummary ?: "${p.mode.label} · ${p.travelMinutes} min", fontWeight = FontWeight.SemiBold)
            Text("${p.mode.label} · ${p.travelMinutes} min · ${p.travelSource}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(14.dp))
            JourneyBar(p)
            Spacer(Modifier.height(10.dp))
            DashedDivider()
            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Tile("In aeroporto", TravelService.hhmm(p.arriveAirportAt))
                Tile("Al gate entro", TravelService.hhmm(p.gateBy), highlight = true)
            }
            p.strikes.forEach { s ->
                Spacer(Modifier.height(12.dp))
                Column(Modifier.fillMaxWidth().background(KColors.Bad.copy(alpha = 0.12f), RoundedCornerShape(12.dp)).padding(12.dp)) {
                    Text("⚠ ${s.title}", color = KColors.Bad, fontWeight = FontWeight.Bold)
                    Text(s.detail, style = MaterialTheme.typography.bodySmall)
                }
            }
            if (p.loungeMinutes > 0) {
                Spacer(Modifier.height(12.dp))
                OutlinedButton(onClick = {
                    runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.loungekey.com/")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                }, modifier = Modifier.fillMaxWidth()) { Text("Lounge disponibili · LoungeKey") }
            }
        }
    }
}

/** Timeline delle fasi del volo. */
@Composable
private fun TimelineCard(f: Flight, now: Long, c: Color) {
    val dep = f.departure; val arr = f.arrival
    val b = f.booking
    val phases = buildList {
        b?.boardingTime?.let { add(Phase("Imbarco", it, f.departure.gate?.let { g -> "Gate $g" + (b.boardingGroup?.let { gr -> " · gruppo $gr" } ?: "") }, done = (dep.best ?: Long.MAX_VALUE) - 30 * 60_000 < now)) }
        b?.gateCloses?.let { add(Phase("Chiusura gate", it, null, done = (dep.best ?: Long.MAX_VALUE) - 15 * 60_000 < now)) }
        add(Phase("Partenza", dep.localTime(dep.best), dep.displayName, done = f.status.isAirborne || f.status.isFinished, late = dep.delayMinutes >= 15))
        add(Phase("Arrivo", arr.localTime(arr.best), arr.displayName, done = f.status == FlightStatus.LANDED || f.status == FlightStatus.ARRIVED, late = arr.delayMinutes >= 15))
        add(Phase("Ritiro bagagli", arr.baggageBelt?.let { "Nastro $it" } ?: "—", null, done = f.status == FlightStatus.ARRIVED))
    }
    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer)) {
        Column(Modifier.padding(18.dp)) {
            Text("IL VIAGGIO", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(10.dp))
            Timeline(phases, c)
        }
    }
}

/** Carta d'imbarco a forma di biglietto. */
@Composable
private fun BoardingPass(f: Flight) {
    val b = f.booking ?: return
    Card(Modifier.fillMaxWidth(), shape = TicketShape(notchY = 92.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
        Column(Modifier.padding(horizontal = 20.dp, vertical = 16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("CARTA D'IMBARCO", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f))
                    Text("${f.departure.iata} → ${f.arrival.iata}", fontSize = 22.sp, fontWeight = FontWeight.Black, color = MaterialTheme.colorScheme.onPrimaryContainer)
                }
                Box(Modifier.background(MaterialTheme.colorScheme.primary, CircleShape).padding(horizontal = 16.dp, vertical = 10.dp)) {
                    Text(b.seat ?: "—", fontSize = 24.sp, fontWeight = FontWeight.Black, color = MaterialTheme.colorScheme.onPrimary)
                }
            }
            Spacer(Modifier.height(18.dp))
            DashedDivider(color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.3f))
            Spacer(Modifier.height(14.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                PassField("Gruppo", b.boardingGroup)
                PassField("Imbarco", b.boardingTime)
                PassField("Gate chiude", b.gateCloses)
                PassField("Classe", b.cabin?.split(' ')?.first())
            }
            b.pnr?.let {
                Spacer(Modifier.height(10.dp))
                Text("Prenotazione $it", style = TabularNums.copy(letterSpacing = 2.sp), color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f))
            }
        }
    }
}

@Composable
private fun PassField(label: String, v: String?) = Column {
    Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f))
    Text(v ?: "—", style = TabularNums, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onPrimaryContainer)
}

@Composable
private fun InfoCard(f: Flight) = Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp),
    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer)) {
    Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text("AEREO E VOLO", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        f.aircraftModel?.let { KV("Aereo", it) }
        f.aircraftReg?.let { KV("Matricola", it) }
        f.distanceKm?.let { KV("Distanza", "$it km") }
        f.durationMinutes?.let { KV("Durata", formatDuration(it.toLong())) }
        KV("Aggiornato", if (f.lastUpdated > 0) DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(f.lastUpdated)) else "—")
        if (f.emailOnly) KV("Fonte", "Solo email (dati live non ancora disponibili)")
        if (f.isDemo) KV("Fonte", "Dati simulati (demo)")
    }
}

@Composable
private fun KV(k: String, v: String) = Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
    Text(k, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Text(v, fontWeight = FontWeight.Medium)
}
