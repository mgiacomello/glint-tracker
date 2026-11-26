package digital.giacomello.kairos.ui

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.LaunchedEffect
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.wear.compose.material3.AppScaffold
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import digital.giacomello.kairos.notify.Notifier
import digital.giacomello.kairos.ui.screens.AddFlightScreen
import digital.giacomello.kairos.ui.screens.FlightDetailScreen
import digital.giacomello.kairos.ui.screens.FlightListScreen
import digital.giacomello.kairos.ui.screens.StatsScreen
import digital.giacomello.kairos.ui.theme.KairosTheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val deepLinkId = intent?.getStringExtra(Notifier.EXTRA_FLIGHT_ID)

        setContent {
            KairosTheme {
                val vm: FlightsViewModel = viewModel()
                val nav = rememberSwipeDismissableNavController()

                val askNotif = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
                LaunchedEffect(Unit) {
                    if (Build.VERSION.SDK_INT >= 33) askNotif.launch(Manifest.permission.POST_NOTIFICATIONS)
                    vm.refresh()
                    deepLinkId?.let { nav.navigate("detail/$it") }
                }

                AppScaffold {
                    SwipeDismissableNavHost(navController = nav, startDestination = "list") {
                        composable("list") {
                            FlightListScreen(
                                vm = vm,
                                onOpen = { nav.navigate("detail/$it") },
                                onAdd = { vm.resetAdd(); nav.navigate("add") },
                                onStats = { nav.navigate("stats") },
                            )
                        }
                        composable("stats") { StatsScreen(vm) }
                        composable("add") {
                            AddFlightScreen(vm = vm, onDone = { id ->
                                nav.popBackStack()
                                nav.navigate("detail/$id")
                            })
                        }
                        composable("detail/{id}") { entry ->
                            val id = entry.arguments?.getString("id").orEmpty()
                            FlightDetailScreen(vm = vm, id = id, onRemoved = { nav.popBackStack() })
                        }
                    }
                }
            }
        }
    }
}
