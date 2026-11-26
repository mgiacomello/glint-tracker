import java.util.Properties

plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
}

// local.properties (NON nel repo):
//   AERODATABOX_KEY=...      chiave RapidAPI AeroDataBox (vuota = modalità DEMO)
//   GMAIL_BRIDGE_URL=...     URL web app Apps Script con ?token=...
//   GOOGLE_MAPS_KEY=...      Google Routes API (tempo di viaggio con traffico)
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun secret(name: String) = "\"${localProps.getProperty(name, "")}\""

android {
    namespace = "digital.giacomello.kairos.core"
    compileSdk = 36

    defaultConfig {
        minSdk = 29
        consumerProguardFiles("consumer-rules.pro")
        buildConfigField("String", "AERODATABOX_KEY", secret("AERODATABOX_KEY"))
        buildConfigField("String", "GMAIL_BRIDGE_URL", secret("GMAIL_BRIDGE_URL"))
        buildConfigField("String", "GOOGLE_MAPS_KEY", secret("GOOGLE_MAPS_KEY"))
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { buildConfig = true }
}

dependencies {
    api("androidx.core:core-ktx:1.16.0")
    api("androidx.work:work-runtime-ktx:2.10.2")
    api("androidx.datastore:datastore-preferences:1.1.7")
    api("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    api("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    testImplementation("junit:junit:4.13.2")
}
