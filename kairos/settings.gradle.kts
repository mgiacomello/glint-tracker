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
        mavenCentral()
    }
}

rootProject.name = "kairos"
include(":core")   // logica condivisa: dati, provider, Gmail, avvisi, refresh
include(":wear")   // app Wear OS (Galaxy Watch)
include(":mobile") // app Android telefono
