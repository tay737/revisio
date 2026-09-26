import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("org.jetbrains.kotlin.jvm")
    id("org.jetbrains.kotlin.plugin.serialization")
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    // `api`, not `implementation`: the app constructs `RevisioApi`, whose default
    // arguments mention these types, so they must be on the app's compile
    // classpath too.
    api("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    api("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.9.0")
    api("com.squareup.okhttp3:okhttp:4.12.0")

    testImplementation("junit:junit:4.13.2")
}

// The conformance test reads the golden vectors emitted from the canonical
// TypeScript engine (`scripts/native/grading-vectors.ts`). Both native ports
// read this exact file, so a disagreement fails the build here rather than
// surfacing as a learner seeing different marks on phone and web.
sourceSets {
    test {
        resources.srcDir("$rootDir/../shared")
    }
}

tasks.test {
    useJUnit()
    testLogging {
        events("passed", "failed", "skipped")
        showStandardStreams = true
    }
}
