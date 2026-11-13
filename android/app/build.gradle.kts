plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// nomor build dari CI (github.run_number); lokal = 0. versionCode harus selalu naik agar update bisa menimpa versi lama.
val btBuild = (System.getenv("BT_BUILD") ?: "0").toIntOrNull() ?: 0
// kunci rilis (dari GitHub Secrets, didekode CI ke berkas sementara). Tanpa kunci: APK rilis memakai kunci debug (hanya uji).
val btKeystore = System.getenv("BT_KEYSTORE")?.let { file(it) }?.takeIf { it.exists() }

android {
    namespace = "id.buleudteu.ljk"
    compileSdk = 35
    defaultConfig {
        applicationId = "id.buleudteu.ljk"
        minSdk = 24
        targetSdk = 35
        versionCode = 1000 + btBuild
        versionName = "4.1.$btBuild"
        // HP Android kelas menengah ke atas = ARM; buang x86 agar APK jauh lebih kecil (hemat kuota guru)
        ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a") }
    }
    signingConfigs {
        if (btKeystore != null) create("rilis") {
            storeFile = btKeystore
            storePassword = System.getenv("BT_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("BT_KEY_ALIAS") ?: "buleudteu"
            keyPassword = System.getenv("BT_KEY_PASSWORD") ?: System.getenv("BT_KEYSTORE_PASSWORD")
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false   // OpenCV/ML Kit/CameraX: tanpa R8 agar aman
            signingConfig = if (btKeystore != null) signingConfigs.getByName("rilis") else signingConfigs.getByName("debug")
        }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true }
    packaging { jniLibs { useLegacyPackaging = true } }
}

dependencies {
    val camerax = "1.4.1"
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.camera:camera-core:$camerax")
    implementation("androidx.camera:camera-camera2:$camerax")
    implementation("androidx.camera:camera-lifecycle:$camerax")
    implementation("androidx.camera:camera-view:$camerax")
    implementation("org.opencv:opencv:4.10.0")                       // deteksi marker real-time di preview kamera
    implementation("com.google.mlkit:text-recognition:16.0.1")       // OCR identitas di perangkat (offline)
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("androidx.work:work-runtime-ktx:2.10.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.9.0")
}
