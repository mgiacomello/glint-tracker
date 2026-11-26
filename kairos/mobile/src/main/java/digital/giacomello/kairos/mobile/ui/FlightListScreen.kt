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
import digital.giacomello.kairos.model.Source
import digital.giacomello.kairos.notify.Notifier
import digital.giacomello.kairos.travel.LeavePlan
import digital.giacomello.kairos.travel.TravelService
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FlightListScreen(vm: MobileViewModel, onOpen: (String) -> Unit, onSettings: () -> Unit) {
    val flights by vm.flights.collectAsStateWithLifecycle()
    val plans by vm.plans.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val msg by vm.message.collectAsStateWithLifecycle()
    val snack = remember { SnackbarHostState() }
    var showAdd by remember { mutableStateOf(false) }
    val now = System.currentTimeMillis()

    LaunchedEffect(msg) { msg?.let { snack.showSnackbar(it); vm.consumeMessage() } }

    val upcoming = flights.filter { !it.status.isFinished }
    val past = flights.filter { it.status.isFinished }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(if (vm.isDemo) "Kair.OS · demo" else "Kair.OS", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                },
                actions = {
                    if (vm.gmailConfigured) IconButton(onClick = { vm.sync(scanGmail = true) }) { Icon(Icons.Default.Email, "Importa da Gmail") }
                    IconButton(onClick = { vm.sync() }) { Icon(Icons.Default.Refresh, "Aggiorna") }
                    IconButton(onClick = onSettings) { Icon(Icons.Default.Settings, "Impostazioni") }
                },
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(onClick = { showAdd = true }, icon = { Icon(Icons.Default.Add, null) }, text = { Text("Volo") })
        },
        snackbarHost = { SnackbarHost(snack) },
    ) { pad ->
        Column(Modifier.padding(pad).fillMaxSize()) {
            if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            LazyColumn(contentPadding = PaddingValues(16.dp, 8.dp, 16.dp, 96.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (flights.isEmpty()) item { EmptyState(vm.gmailConfigured) }
                if (upcoming.isNotEmpty()) item { SectionTitle("In programma") }
                items(upcoming, key = { it.id }) { f -> FlightRow(f, plans[f.id], now) { onOpen(f.id) } }
                if (past.isNotEmpty()) {
                    item { SectionTitle("Passati") }
                    item { StatsCard(past) }
                    items(past.reversed(), key = { it.id }) { f -> FlightRow(f, null, now) { onOpen(f.id) } }
                }
            }
        }
    }

    if (showAdd) AddFlightDialog(onDismiss = { showAdd = false }) { n, d ->
        showAdd = false
        vm.add(n, d) { onOpen(it) }
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
private fun FlightRow(f: Flight, plan: LeavePlan?, now: Long, onClick: () -> Unit) {
    Card(
        Modifier.fillMaxWidth().clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "${f.number} · ${prettyDate(f.date)}" + if (f.source == Source.GMAIL) " · Gmail" else "",
                    style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                StatusChip(f)
            }
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.Bottom) {
                Column(Modifier.weight(1f)) {
                    Text(f.departure.iata, fontSize = 28.sp, fontWeight = FontWeight.Bold)
                    Text(f.departure.localTime(f.departure.best), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                FlightArc(f.progress(now), KColors.forStatus(f), Modifier.weight(1.2f).padding(bottom = 18.dp))
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.End) {
                    Text(f.arrival.iata, fontSize = 28.sp, fontWeight = FontWeight.Bold)
                    Text(f.arrival.localTime(f.arrival.best), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if (!f.status.isFinished) {
                Spacer(Modifier.height(8.dp))
                Text(Notifier.liveLine(f, now), color = KColors.forStatus(f), fontWeight = FontWeight.SemiBold)
                plan?.let { p ->
                    Text(
                        "Esci alle ${TravelService.hhmm(p.leaveAt)} · ${p.mode.label.lowercase()} ${p.travelMinutes}'" +
                            (if (p.loungeMinutes > 0) " · lounge ${p.loungeMinutes}'" else "") +
                            (if (p.strikes.isNotEmpty()) " · ⚠ sciopero" else ""),
                        color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodyMedium,
                    )
                }
                f.booking?.let { b -> b.seat?.let { Text("Posto $it${b.boardingGroup?.let { g -> " · gruppo $g" } ?: ""}", style = MaterialTheme.typography.bodySmall) } }
            }
        }
    }
}

/** Statistiche dei voli passati (il "passaporto" del viaggiatore). */
@Composable
private fun StatsCard(past: List<Flight>) {
    val km = past.sumOf { it.distanceKm ?: 0 }
    val minutes = past.sumOf { it.durationMinutes ?: 0 }
    val airports = past.flatMap { listOf(it.departure.iata, it.arrival.iata) }.toSet().size
    val airlines = past.map { it.number.take(2) }.toSet().size
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
        Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Stat("${past.size}", "voli")
            Stat("%,d".format(Locale.ITALIAN, km), "km")
            Stat("${minutes / 60}", "ore")
            Stat("$airports", "aeroporti")
            Stat("$airlines", "compagnie")
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
