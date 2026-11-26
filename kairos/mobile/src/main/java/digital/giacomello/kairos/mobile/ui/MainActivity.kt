package digital.giacomello.kairos.mobile.ui

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import digital.giacomello.kairos.notify.Notifier

class MainActivity : ComponentActivity() {
    private val deepLink = mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        deepLink.value = intent?.getStringExtra(Notifier.EXTRA_FLIGHT_ID)

        setContent {
            KairosTheme {
                val vm: MobileViewModel = viewModel()
                val nav = rememberNavController()
                val askNotif = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }

                LaunchedEffect(Unit) {
                    if (Build.VERSION.SDK_INT >= 33) askNotif.launch(Manifest.permission.POST_NOTIFICATIONS)
                    vm.sync()
                }
                LaunchedEffect(deepLink.value) {
                    deepLink.value?.let { nav.navigate("detail/$it"); deepLink.value = null }
                }

                NavHost(navController = nav, startDestination = "list") {
                    composable("list") {
                        FlightListScreen(
                            vm = vm,
                            onOpen = { nav.navigate("detail/$it") },
                            onSettings = { nav.navigate("settings") },
                        )
                    }
                    composable("detail/{id}") { e ->
                        FlightDetailScreen(vm, e.arguments?.getString("id").orEmpty(), onBack = { nav.popBackStack() })
                    }
                    composable("settings") { SettingsScreen(vm, onBack = { nav.popBackStack() }) }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        deepLink.value = intent.getStringExtra(Notifier.EXTRA_FLIGHT_ID)
    }
}
