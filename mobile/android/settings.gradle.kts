pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "Revisio"

// `:engine` is a plain Kotlin/JVM library — grading, the offline store, sync and
// the API client. It has no Android dependency on purpose: the whole native
// client's behaviour can be unit-tested on the JVM, without a device.
// `:app` is only the Android surface (Compose UI + wiring).
include(":engine")
include(":app")
