package digital.giacomello.kairos.mobile.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import digital.giacomello.kairos.Graph
import digital.giacomello.kairos.data.FlightNotFoundException
import digital.giacomello.kairos.model.Flight
import digital.giacomello.kairos.notify.Notifier
import digital.giacomello.kairos.travel.LeavePlan
import digital.giacomello.kairos.travel.TravelPrefs
import digital.giacomello.kairos.work.RefreshWorker
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class MobileViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = Graph.repository(app)
    private val travel = Graph.travel(app)

    val flights: StateFlow<List<Flight>> =
        repo.flights.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    val plans: StateFlow<Map<String, LeavePlan>> =
        travel.plans.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyMap())
    val prefs: StateFlow<TravelPrefs> =
        travel.settings.prefs.stateIn(viewModelScope, SharingStarted.Eagerly, TravelPrefs())

    val isDemo = Graph.isDemo
    val gmailConfigured = Graph.gmail.isConfigured
    val mapsConfigured = Graph.mapsKey.isNotBlank()

    private val _busy = MutableStateFlow(false)
    val busy = _busy.asStateFlow()
    private val _message = MutableStateFlow<String?>(null)
    val message = _message.asStateFlow()

    fun consumeMessage() { _message.value = null }

    /** Aggiorna tutto: scansione Gmail, stato live, piano di viaggio. */
    fun sync(scanGmail: Boolean = false) = viewModelScope.launch {
        _busy.value = true
        runCatching { RefreshWorker.sync(getApplication(), force = true, scanGmail = scanGmail) }
            .onSuccess { ev ->
                Notifier.post(getApplication(), ev)
                if (scanGmail) _message.value = ev.count { it.title.contains("Gmail") }
                    .let { if (it > 0) "$it nuovi voli da Gmail" else "Nessun nuovo volo in Gmail" }
            }
            .onFailure { _message.value = "Aggiornamento non riuscito" }
        RefreshWorker.notifySurfaces(getApplication())
        _busy.value = false
    }

    fun add(number: String, date: String, onDone: (String) -> Unit) = viewModelScope.launch {
        _busy.value = true
        try {
            val f = repo.add(number, date)
            travel.update(repo.snapshot(), force = true)
            RefreshWorker.notifySurfaces(getApplication())
            onDone(f.id)
        } catch (e: FlightNotFoundException) {
            _message.value = e.message
        } catch (e: Exception) {
            _message.value = "Errore di rete. Riprova."
        }
        _busy.value = false
    }

    fun remove(id: String) = viewModelScope.launch {
        repo.remove(id)
        RefreshWorker.notifySurfaces(getApplication())
    }

    fun savePrefs(p: TravelPrefs) = viewModelScope.launch {
        travel.settings.update(p)
        runCatching { travel.update(repo.snapshot(), force = true) }
    }
}
