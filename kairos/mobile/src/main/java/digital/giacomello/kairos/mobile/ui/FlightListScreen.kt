package digital.giacomello.kairos.mobile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import digital.giacomello.kairos.model.Flight
import digital.giacomello.kairos.model.formatDuration
import androidx.compose.ui.graphics.Color
import digital.giacomello.kairos.model.Source
import digital.giacomello.kairos.notify.Notifier
import digital.giacomello.kairos.stats.TravelStats
import digital.giacomello.kairos.travel.LeavePlan
import digital.giacomello.kairos.travel.TravelService
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun FlightListScreen(vm: MobileViewModel, onOpen: (String) -> Unit, onSettings: () -> Unit, onStats: () -> Unit) {
    val flights by vm.flights.collectAsStateWithLifecycle()
    val plans by vm.plans.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val msg by vm.message.collectAsStateWithLifecycle()
    val snack = remember { SnackbarHostState() }
    var showAdd by remember { mutableStateOf(false) }

    LaunchedEffect(msg) { msg?.let { snack.showSnackbar(it); vm.consumeMessage() } }

    FlightListContent(
        flights = flights, plans = plans, busy = busy, isDemo = vm.isDemo, gmail = vm.gmailConfigured,
        snack = snack, now = System.currentTimeMillis(), onOpen = onOpen, onSettings = onSettings,
        onSync = { vm.sync() }, onScanGmail = { vm.sync(scanGmail = true) }, onAdd = { showAdd = true }, onStats = onStats,
    )

    if (showAdd) AddFlightDialog(onDismiss = { showAdd = false }) { n, d ->
        showAdd = false
        vm.add(n, d) { onOpen(it) }
    }
}

/** Schermata elenco senza stato (usata anche per gli screenshot). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FlightListContent(
    flights: List<Flight>, plans: Map<String, LeavePlan>, busy: Boolean, isDemo: Boolean, gmail: Boolean,
    snack: SnackbarHostState, now: Long, onOpen: (String) -> Unit, onSettings: () -> Unit,
    onSync: () -> Unit, onScanGmail: () -> Unit, onAdd: () -> Unit, onStats: () -> Unit = {},
) {
    val upcoming = flights.filter { !it.status.isFinished }
    val past = flights.filter { it.status.isFinished }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(if (isDemo) "Kair.OS · demo" else "Kair.OS", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                },
                actions = {
                    if (gmail) IconButton(onClick = onScanGmail) { Icon(Icons.Default.Email, "Importa da Gmail") }
                    IconButton(onClick = onSync) { Icon(Icons.Default.Refresh, "Aggiorna") }
                    IconButton(onClick = onSettings) { Icon(Icons.Default.Settings, "Impostazioni") }
                },
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(onClick = onAdd, icon = { Icon(Icons.Default.Add, null) }, text = { Text("Volo") })
        },
        snackbarHost = { SnackbarHost(snack) },
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize()) {
            if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            LazyColumn(contentPadding = PaddingValues(16.dp, 8.dp, 16.dp, 96.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                if (flights.isEmpty()) item { EmptyState(gmail) }
                if (upcoming.isNotEmpty()) item { SectionTitle("In programma") }
                items(upcoming, key = { it.id }) { f -> FlightRow(f, plans[f.id], now) { onOpen(f.id) } }
                if (past.isNotEmpty()) {
                    item { SectionTitle("Passati") }
                    item { StatsCard(past, onStats) }
                    items(past.sortedByDescending { it.date }.take(10), key = { it.id }) { f -> FlightRow(f, null, now) { onOpen(f.id) } }
                }
            }
        }
    }
}

@Composable
private fun SectionTitle(t: String) =
    Text(t.uppercase(), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))

@Composable
private fun EmptyState(gmail: Boolean) {
    Column(Modifier.fillMaxWidth().padding(vertical = 48.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text("✈", fontSize = 48.sp)
        Spacer(Modifier.height(12.dp))
        Text("Nessun volo", style = MaterialTheme.typography.titleMedium)
        Text(
            if (gmail) "Tocca la busta per importarli da Gmail, o aggiungine uno a mano."
            else "Aggiungi un volo con il numero (es. AZ610). Collega Gmail per l'import automatico.",
            color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(24.dp, 8.dp),
        )
    }
}

@Composable
fun StatusChip(f: Flight) {
    val c = KColors.forStatus(f)
    val label = if (f.departure.delayMinutes >= 5 && !f.status.isAirborne && !f.status.isFinished) "+${f.departure.delayMinutes} min" else f.status.label
    Box(Modifier.background(c.copy(alpha = 0.16f), RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 3.dp)) {
        Text(label, color = c, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun FlightRow(f: Flight, plan: LeavePlan?, now: Long, onClick: () -> Unit) =
    if (f.status.isFinished) PastRow(f, onClick) else TicketCard(f, plan, now, onClick)

/** Volo in programma: "biglietto" con mappa della rotta, orari grandi e riga di viaggio. */
@Composable
private fun TicketCard(f: Flight, plan: LeavePlan?, now: Long, onClick: () -> Unit) {
    val c = KColors.forStatus(f)
    val mapH = 150.dp
    Card(
        Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = TicketShape(notchY = mapH + 118.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
    ) {
        Box(Modifier.fillMaxWidth().height(mapH).background(MaterialTheme.colorScheme.surfaceContainerHigh)) {
            RouteMap(f, f.progress(now), c, Modifier.fillMaxSize().padding(top = 34.dp), labels = true, background = MaterialTheme.colorScheme.surfaceContainerHigh, padding = 0.25, dotsAcross = 56)
            Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(
                    "${f.number} · ${prettyDate(f.date)}",
                    style = MaterialTheme.typography.labelLarge, color = Color.White,
                    modifier = Modifier.background(Color.Black.copy(alpha = 0.45f), RoundedCornerShape(6.dp)).padding(horizontal = 8.dp, vertical = 3.dp),
                )
                StatusChip(f)
            }
        }
        Column(Modifier.padding(horizontal = 18.dp, vertical = 14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(f.departure.iata, fontSize = 30.sp, fontWeight = FontWeight.Black)
                    Text(f.departure.localTime(f.departure.best), style = TabularNums, fontSize = 18.sp, fontWeight = FontWeight.SemiBold,
                        color = if (f.departure.delayMinutes >= 15) KColors.Delay else MaterialTheme.colorScheme.onSurface)
                }
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(f.durationMinutes?.let { formatDuration(it.toLong()) } ?: "", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    DashedDivider(Modifier.padding(vertical = 4.dp))
                    Text(f.airline ?: "", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                }
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.End) {
                    Text(f.arrival.iata, fontSize = 30.sp, fontWeight = FontWeight.Black)
                    Text(f.arrival.localTime(f.arrival.best), style = TabularNums, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                }
            }
            Spacer(Modifier.height(6.dp))
            Text(Notifier.liveLine(f, now), color = c, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(12.dp))
            DashedDivider()
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Mini("Gate", f.departure.gate)
                Mini("Terminal", f.departure.terminal)
                Mini("Posto", f.booking?.seat)
                Mini("Imbarco", f.booking?.boardingTime)
            }
            plan?.let { p ->
                Spacer(Modifier.height(12.dp))
                Row(
                    Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(10.dp)).padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("Esci alle ${TravelService.hhmm(p.leaveAt)}", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onPrimaryContainer)
                    Text(
                        "  " + (p.travelSummary ?: "${p.mode.label} ${p.travelMinutes}'") + if (p.strikes.isNotEmpty()) " · ⚠" else "",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onPrimaryContainer, maxLines = 1,
                    )
                }
            }
        }
    }
}

@Composable
private fun Mini(label: String, v: String?) = Column {
    Text(label.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Text(v ?: "—", style = TabularNums, fontSize = 17.sp, fontWeight = FontWeight.Bold)
}

/** Volo passato: riga compatta. */
@Composable
private fun PastRow(f: Flight, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceContainer, RoundedCornerShape(14.dp))
            .clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.width(64.dp)) {
            Text(prettyDate(f.date).substringAfter(' '), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(f.date.take(4), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Column(Modifier.weight(1f)) {
            Text("${f.departure.iata} → ${f.arrival.iata}", fontWeight = FontWeight.Bold, fontSize = 17.sp)
            Text("${f.number}${f.airline?.let { " · $it" } ?: ""}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        val d = f.arrival.delayMinutes
        Text(
            when { f.status == digital.giacomello.kairos.model.FlightStatus.CANCELED -> "Cancellato"; d >= 15 -> "+$d'"; else -> "In orario" },
            color = when { f.status == digital.giacomello.kairos.model.FlightStatus.CANCELED -> KColors.Bad; d >= 15 -> KColors.Delay; else -> KColors.OnTime },
            fontWeight = FontWeight.SemiBold, style = TabularNums,
        )
    }
}

/** Statistiche dei voli passati (il "passaporto" del viaggiatore). */
@Composable
private fun StatsCard(past: List<Flight>, onClick: () -> Unit) {
    val s = TravelStats.from(past)
    Card(Modifier.fillMaxWidth().clickable(onClick = onClick), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
        Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Stat("${s.flights}", "voli")
            Stat("%,d".format(Locale.ITALIAN, s.km), "km")
            Stat("${s.airMinutes / 60}", "ore")
            Stat("${s.onTimePct ?: "—"}%", "puntuali")
            Stat("${s.avgArrivalDelay ?: 0}'", "rit. medio")
        }
    }
}

@Composable
private fun Stat(v: String, l: String) = Column(horizontalAlignment = Alignment.CenterHorizontally) {
    Text(v, fontWeight = FontWeight.Bold, fontSize = 18.sp, color = MaterialTheme.colorScheme.onPrimaryContainer)
    Text(l, fontSize = 11.sp, color = MaterialTheme.colorScheme.onPrimaryContainer)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddFlightDialog(onDismiss: () -> Unit, onAdd: (String, String) -> Unit) {
    var number by remember { mutableStateOf("") }
    var date by remember { mutableStateOf(LocalDate.now()) }
    var pickDate by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Aggiungi volo") },
        text = {
            Column {
                OutlinedTextField(
                    value = number, onValueChange = { number = it.uppercase().take(8) },
                    label = { Text("Numero volo") }, placeholder = { Text("AZ610") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
                )
                Spacer(Modifier.height(12.dp))
                OutlinedButton(onClick = { pickDate = true }) {
                    Text("Data: ${date.format(DateTimeFormatter.ofPattern("EEE d MMM yyyy", Locale.ITALIAN))}")
                }
            }
        },
        confirmButton = { TextButton(enabled = number.length >= 3, onClick = { onAdd(number, date.toString()) }) { Text("Cerca") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Annulla") } },
    )

    if (pickDate) {
        val st = rememberDatePickerState(initialSelectedDateMillis = date.atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli())
        DatePickerDialog(
            onDismissRequest = { pickDate = false },
            confirmButton = {
                TextButton(onClick = {
                    st.selectedDateMillis?.let { date = Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate() }
                    pickDate = false
                }) { Text("OK") }
            },
        ) { DatePicker(st) }
    }
}

fun prettyDate(iso: String): String = runCatching {
    LocalDate.parse(iso).format(DateTimeFormatter.ofPattern("EEE d MMM", Locale.ITALIAN))
}.getOrDefault(iso)

@Composable
fun Gap(w: Int = 8) = Spacer(Modifier.width(w.dp))
