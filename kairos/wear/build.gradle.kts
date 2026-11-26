plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "digital.giacomello.kairos"
    // Stesso applicationId dell'app telefono: requisito Google Play per app Wear abbinate.
    compileSdk = 36

    defaultConfig {
        applicationId = "digital.giacomello.kairos"
        minSdk = 30          // Wear OS 3+ (Galaxy Watch 4 in poi; Watch 9 = Wear OS 6)
        targetSdk = 36
        versionCode = 1
        versionName = "0.2.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation(project(":core"))

    // Core / lifecycle
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.1")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.1")

    // Compose for Wear OS (Material 3 Expressive)
    implementation(platform("androidx.compose:compose-bom:2025.06.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.wear.compose:compose-material3:1.5.0")
    implementation("androidx.wear.compose:compose-foundation:1.5.0")
    implementation("androidx.wear.compose:compose-navigation:1.5.0")
    debugImplementation("androidx.compose.ui:ui-tooling")

    // Wear: input da tastiera/voce, ongoing activity (equivalente delle Live Activities)
    implementation("androidx.wear:wear-input:1.2.0")
    implementation("androidx.wear:wear-ongoing:1.0.0")

    // Tile + complicazioni
    implementation("androidx.wear.tiles:tiles:1.5.0")
    implementation("androidx.wear.protolayout:protolayout:1.3.0")
    implementation("androidx.wear.protolayout:protolayout-expression:1.3.0")
    implementation("androidx.wear.watchface:watchface-complications-data-source-ktx:1.2.1")

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-guava:1.10.2")
}
