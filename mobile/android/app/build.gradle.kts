plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

// The deployment the app talks to. Overridable at build time so a release can
// point at a preview deployment without editing source:
//   ./gradlew assembleDebug -PrevisioApiBase=https://…
val apiBase: String = (project.findProperty("revisioApiBase") as String?)
    ?: "https://revisio-srs.vercel.app"

android {
    namespace = "app.revisio"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.revisio"
        // 26 is the floor java.time needs without desugaring; the engine leans on
        // it for timestamps and there is no reason to carry a shim for API 24–25.
        minSdk = 26
        targetSdk = 35
        versionCode = 10000
        versionName = "1.0.0-alpha.10"

        buildConfigField("String", "API_BASE_URL", "\"$apiBase\"")
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}

dependencies {
    implementation(project(":engine"))

    val composeBom = platform("androidx.compose:compose-bom:2024.10.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.core:core-ktx:1.15.0")

    testImplementation("junit:junit:4.13.2")
}
