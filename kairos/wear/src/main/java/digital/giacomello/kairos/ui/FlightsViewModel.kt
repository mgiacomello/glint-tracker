package digital.giacomello.kairos.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import digital.giacomello.kairos.Graph
import digital.giacomello.kairos.data.FlightNotFoundException
import digital.giacomello.kairos.model.Flight
import digital.giacomello.kairos.notify.Notifier
import digital.giacomello.kairos.travel.LeavePlan
import digital.giacomello.kairos.work.RefreshWorker
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

sealed interface AddState {
    data object Idle : AddState
    data object Loading : AddState
    data class Done(val flight: Flight) : AddState
    data class Error(val message: String) : AddState
}

class FlightsViewModel(app: Application) : AndroidViewModel(app) {
    private val repo = Graph.repository(app)

    val flights: StateFlow<List<Flight>> =
        repo.flights.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val plans: StateFlow<Map<String, LeavePlan>> =
        Graph.travel(app).plans.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyMap())

    private val _refreshing = MutableStateFlow(false)
    val refreshing = _refreshing.asStateFlow()

    private val _add = MutableStateFlow<AddState>(AddState.Idle)
    val addState = _add.asStateFlow()

    val isDemo = Graph.isDemo

    fun refresh() = viewModelScope.launch {
        _refreshing.value = true
        runCatching { Notifier.post(getApplication(), RefreshWorker.sync(getApplication(), force = true, scanGmail = true)) }
        RefreshWorker.notifySurfaces(getApplication())
        _refreshing.value = false
    }

    fun refreshOne(id: String) = viewModelScope.launch {
        _refreshing.value = true
        runCatching { Notifier.post(getApplication(), repo.refreshOne(id)) }
        RefreshWorker.notifySurfaces(getApplication())
        _refreshing.value = false
    }

    fun add(number: String, date: String) = viewModelScope.launch {
        _add.value = AddState.Loading
        _add.value = try {
            val f = repo.add(number, date)
            RefreshWorker.notifySurfaces(getApplication())
            AddState.Done(f)
        } catch (e: FlightNotFoundException) {
            AddState.Error(e.message ?: "Volo non trovato")
        } catch (e: Exception) {
            AddState.Error("Errore di rete. Riprova.")
        }
    }

    fun resetAdd() { _add.value = AddState.Idle }

    fun remove(id: String) = viewModelScope.launch {
        repo.remove(id)
        RefreshWorker.notifySurfaces(getApplication())
    }
}
