import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    id("com.google.gms.google-services")
}

android {
    namespace = "com.gettransfer.passenger"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = "27.0.12077973"

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_11.toString()
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.gettransfer.passenger"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = 23
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        // Maps SDK for Android — set GOOGLE_MAPS_API_KEY in android/maps.properties
        // (gitignored; Flutter overwrites local.properties) or the environment.
        // Enable "Maps SDK for Android" on the key; restrict by package
        // com.gettransfer.passenger + SHA-1. Server/IP or browser/referrer-only
        // keys will not paint map tiles.
        fun loadProps(fileName: String): Properties {
            val props = Properties()
            val file = rootProject.file(fileName)
            if (file.exists()) {
                file.inputStream().use { props.load(it) }
            }
            return props
        }
        val mapsProps = loadProps("maps.properties")
        val localProps = loadProps("local.properties")
        val mapsKey =
            mapsProps.getProperty("GOOGLE_MAPS_API_KEY")
                ?: localProps.getProperty("GOOGLE_MAPS_API_KEY")
                ?: (project.findProperty("GOOGLE_MAPS_API_KEY") as String?)
                ?: System.getenv("GOOGLE_MAPS_API_KEY")
                ?: ""
        manifestPlaceholders["GOOGLE_MAPS_API_KEY"] = mapsKey
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
}

flutter {
    source = "../.."
}
