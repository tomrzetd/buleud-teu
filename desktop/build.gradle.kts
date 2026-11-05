// Buleud Teu Desktop (Windows x64 / Linux x64) — Kotlin/JVM + Swing.
// Engine & identitas dipakai LANGSUNG dari modul Android (kode Kotlin murni yang sama, diuji identik dengan web).
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    kotlin("jvm") version "2.0.21"
    application
}

repositories { mavenCentral() }

dependencies {
    // PDF hasil scanner (dibaca lewat refleksi; tanpa pustaka ini PDF dibaca dengan pdftoppm bila ada)
    runtimeOnly("org.apache.pdfbox:pdfbox:3.0.3")
}

java { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }

sourceSets {
    main {
        kotlin.srcDirs(
            "src/main/kotlin",
            "../android/app/src/main/java/id/buleudteu/ljk/engine",
            "../android/app/src/main/java/id/buleudteu/ljk/ident"
        )
    }
}

application {
    mainClass.set("id.buleudteu.desktop.MainKt")
    applicationName = "buleud-teu-desktop"
    applicationDefaultJvmArgs = listOf("-XX:MaxRAMPercentage=60", "-Dfile.encoding=UTF-8")
}
