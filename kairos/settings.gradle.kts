pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        // Mirror Google di Maven Central (evita i limiti 429 sui pacchetti grandi di Robolectric)
        maven("https://maven-central.storage-download.googleapis.com/maven2/")
        mavenCentral()
    }
}

rootProject.name = "kairos"
include(":core")   // logica condivisa: dati, provider, Gmail, avvisi, refresh
include(":wear")   // app Wear OS (Galaxy Watch)
include(":mobile") // app Android telefono
