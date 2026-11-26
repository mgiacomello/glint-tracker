package digital.giacomello.kairos.mobile.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import digital.giacomello.kairos.travel.StrikeSource
import digital.giacomello.kairos.travel.TravelMode
import digital.giacomello.kairos.travel.TravelPrefs

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(vm: MobileViewModel, onBack: () -> Unit) {
    val saved by vm.prefs.collectAsStateWithLifecycle()
    SettingsContent(saved, vm.gmailConfigured, vm.mapsConfigured, !vm.isDemo, onSave = { vm.savePrefs(it); onBack() }, onBack = onBack)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsContent(saved: TravelPrefs, gmail: Boolean, maps: Boolean, live: Boolean, onSave: (TravelPrefs) -> Unit, onBack: () -> Unit) {
    var p by remember { mutableStateOf(saved) }
    LaunchedEffect(saved) { p = saved }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Impostazioni") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Indietro") } },
            )
        },
    ) { pad ->
        Column(
            Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Section("Viaggio verso l'aeroporto")
            OutlinedTextField(
                value = p.origin, onValueChange = { p = p.copy(origin = it) },
                label = { Text("Indirizzo di partenza") }, placeholder = { Text("Via ..., Milano") },
                modifier = Modifier.fillMaxWidth(),
            )
            Text("Mezzo", style = MaterialTheme.typography.labelLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TravelMode.entries.forEach { m ->
                    FilterChip(selected = p.mode == m, onClick = { p = p.copy(mode = m) }, label = { Text(m.label) })
                }
            }
            Toggle("Bagaglio da stiva (di solito)", p.checkedBag) { p = p.copy(checkedBag = it) }
            Toggle("Fast track ai controlli", p.fastTrack) { p = p.copy(fastTrack = it) }
            Toggle("Lounge (LoungeKey): includi il tempo", p.lounge) { p = p.copy(lounge = it) }
            if (p.lounge) NumberField("Minuti in lounge (0 = automatico per aeroporto)", p.loungeMinutes) { p = p.copy(loungeMinutes = it) }
            NumberField("Margine extra personale (min)", p.extraMargin) { p = p.copy(extraMargin = it) }
            NumberField("Tempo di viaggio stimato se Google non disponibile (min)", p.fallbackTravelMinutes) { p = p.copy(fallbackTravelMinutes = it) }
            Toggle("Avvisi \"Preparati\" ed \"Esci ora\"", p.notifyLeave) { p = p.copy(notifyLeave = it) }
            Button(onClick = { onSave(p) }, modifier = Modifier.fillMaxWidth()) { Text("Salva") }

            Section("Collegamenti")
            Status("Gmail (import voli, posto, PNR)", gmail)
            Status("Google Routes (traffico e mezzi)", maps)
            Status("Dati voli live (AeroDataBox)", live)
            Text(
                "Le chiavi si configurano in local.properties al momento della build (vedi README). " +
                    "Le email restano nel tuo account Google: all'app arrivano solo i dati del volo.",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            Section("Fonti")
            Text(
                "${StrikeSource.ATTRIBUTION}\nTempi di viaggio: Google Maps Platform\nTempi in aeroporto: stime Kair.OS (modificabili)",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun Section(t: String) =
    Text(t.uppercase(), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 8.dp))

@Composable
private fun Toggle(label: String, value: Boolean, onChange: (Boolean) -> Unit) =
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, Modifier.weight(1f))
        Switch(checked = value, onCheckedChange = onChange)
    }

@Composable
private fun NumberField(label: String, value: Int, onChange: (Int) -> Unit) =
    OutlinedTextField(
        value = value.toString(), onValueChange = { s -> onChange(s.filter(Char::isDigit).take(3).toIntOrNull() ?: 0) },
        label = { Text(label) }, singleLine = true, modifier = Modifier.fillMaxWidth(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
    )

@Composable
private fun Status(label: String, ok: Boolean) =
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label)
        Text(if (ok) "✓ attivo" else "non configurato", color = if (ok) KColors.OnTime else MaterialTheme.colorScheme.onSurfaceVariant)
    }
