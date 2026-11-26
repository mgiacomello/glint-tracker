package digital.giacomello.kairos.ui.screens

import android.app.RemoteInput
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.CircularProgressIndicator
import androidx.wear.compose.material3.EdgeButton
import androidx.wear.compose.material3.FilledTonalButton
import androidx.wear.compose.material3.ListHeader
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.ScreenScaffold
import androidx.wear.compose.material3.Text
import androidx.wear.input.RemoteInputIntentHelper
import digital.giacomello.kairos.ui.AddState
import digital.giacomello.kairos.ui.FlightsViewModel
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

private const val KEY_NUMBER = "flight_number"

@Composable
fun AddFlightScreen(vm: FlightsViewModel, onDone: (String) -> Unit) {
    val state by vm.addState.collectAsStateWithLifecycle()
    var number by rememberSaveable { mutableStateOf("") }
    var dayOffset by rememberSaveable { mutableStateOf(0) }
    val listState = rememberScalingLazyListState()
    val today = LocalDate.now()

    // Input testo su Wear OS: tastiera, voce o scrittura a mano tramite RemoteInput di sistema.
    val input = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        res.data?.let { RemoteInput.getResultsFromIntent(it)?.getCharSequence(KEY_NUMBER) }
            ?.toString()?.trim()?.uppercase()?.let { number = it.replace(" ", "") }
    }
    fun askNumber() {
        val intent = RemoteInputIntentHelper.createActionRemoteInputIntent()
        RemoteInputIntentHelper.putRemoteInputsExtra(
            intent, listOf(RemoteInput.Builder(KEY_NUMBER).setLabel("Numero volo (es. AZ610)").build())
        )
        input.launch(intent)
    }

    LaunchedEffect(state) {
        (state as? AddState.Done)?.let { onDone(it.flight.id) }
    }

    ScreenScaffold(
        scrollState = listState,
        edgeButton = {
            EdgeButton(
                onClick = {
                    if (number.isBlank()) askNumber()
                    else vm.add(number, today.plusDays(dayOffset.toLong()).format(DateTimeFormatter.ISO_LOCAL_DATE))
                },
                enabled = state !is AddState.Loading,
            ) {
                if (state is AddState.Loading) CircularProgressIndicator() else Text(if (number.isBlank()) "Numero" else "Cerca")
            }
        },
    ) { padding ->
        ScalingLazyColumn(state = listState, contentPadding = padding, modifier = Modifier.fillMaxWidth()) {
            item { ListHeader { Text("Nuovo volo") } }
            item {
                Button(
                    onClick = ::askNumber,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text(if (number.isBlank()) "Numero volo" else number) },
                    secondaryLabel = { Text("Tocca per digitare o dettare") },
                )
            }
            item { ListHeader { Text("Data di partenza") } }
            items(7) { i ->
                val d = today.plusDays(i.toLong())
                val label = when (i) {
                    0 -> "Oggi"
                    1 -> "Domani"
                    else -> d.dayOfWeek.getDisplayName(TextStyle.FULL, Locale.ITALIAN).replaceFirstChar { it.uppercase() }
                }
                val colors = if (i == dayOffset) ButtonDefaults.buttonColors() else ButtonDefaults.filledTonalButtonColors()
                Button(
                    onClick = { dayOffset = i },
                    colors = colors,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text(label) },
                    secondaryLabel = { Text(d.format(DateTimeFormatter.ofPattern("d MMM", Locale.ITALIAN))) },
                )
            }
            (state as? AddState.Error)?.let { err ->
                item {
                    Text(
                        err.message,
                        color = MaterialTheme.colorScheme.error,
                        textAlign = TextAlign.Center,
                        fontSize = 13.sp,
                    )
                }
                item {
                    FilledTonalButton(onClick = { vm.resetAdd() }, modifier = Modifier.fillMaxWidth()) { Text("OK") }
                }
            }
        }
    }
}
