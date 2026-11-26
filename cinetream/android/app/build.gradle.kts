import java.util.Properties

plugins {
    id("com.android.application")
}

val servidor = (findProperty("cinetream.servidor") as String?).orEmpty().trim().trimEnd('/')
val versionApp = (findProperty("cinetream.version") as String?) ?: "1.0.0"
val numeroVersion = ((findProperty("cinetream.numero") as String?) ?: "1").toInt()

// Firma: si existe android/firma.properties (o las variables de entorno CINETREAM_FIRMA_*), se firma con esa clave.
// Si no, se usa la clave de prueba del repositorio.
val firma = Properties().apply {
    val archivo = rootProject.file("firma.properties")
    if (archivo.exists()) archivo.inputStream().use { load(it) }
    System.getenv("CINETREAM_FIRMA_ARCHIVO")?.let { setProperty("archivo", it) }
    System.getenv("CINETREAM_FIRMA_CLAVE")?.let { setProperty("clave", it); setProperty("claveAlias", it) }
    System.getenv("CINETREAM_FIRMA_ALIAS")?.let { setProperty("alias", it) }
}
val conFirma = !firma.getProperty("archivo").isNullOrBlank() && file(firma.getProperty("archivo")).exists()
// Clave de prueba incluida en el repositorio (contraseña «cinetream»): sirve para que las versiones nuevas se instalen
// encima de las anteriores. Es pública: para publicar en serio, usá tu propia clave (ver README).
val firmaPrueba = rootProject.file("firma-prueba.jks")

android {
    namespace = "com.cinetream.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.cinetream.app"
        minSdk = 23
        targetSdk = 35
        versionCode = numeroVersion
        versionName = versionApp
        buildConfigField("String", "SERVIDOR", "\"$servidor\"")
    }

    buildFeatures { buildConfig = true }

    flavorDimensions += "dispositivo"
    productFlavors {
        create("celular") {
            dimension = "dispositivo"
            buildConfigField("boolean", "TELE", "false")
        }
        create("tele") {
            dimension = "dispositivo"
            applicationIdSuffix = ".tv"
            buildConfigField("boolean", "TELE", "true")
        }
    }

    signingConfigs {
        create("prueba") {
            storeFile = firmaPrueba
            storePassword = "cinetream"
            keyAlias = "cinetream"
            keyPassword = "cinetream"
        }
        if (conFirma) create("cinetream") {
            storeFile = file(firma.getProperty("archivo"))
            storePassword = firma.getProperty("clave")
            keyAlias = firma.getProperty("alias") ?: "cinetream"
            keyPassword = firma.getProperty("claveAlias") ?: firma.getProperty("clave")
        }
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName(if (conFirma) "cinetream" else "prueba")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    sourceSets.getByName("main").assets.srcDir(layout.buildDirectory.dir("web-generada"))
}

// La app trae adentro la plataforma web (para la demostración y para arrancar sin servidor)
val copiarWeb by tasks.registering(Copy::class) {
    from(rootProject.file("../public")) {
        exclude("admin.*", "pago-prueba.html", "descargar.html", "sw.js")
    }
    into(layout.buildDirectory.dir("web-generada/web"))
}
tasks.named("preBuild") { dependsOn(copiarWeb) }

// Nombres claros para los APK: cinetream-celular-1.0.0.apk y cinetream-tele-1.0.0.apk
android.applicationVariants.all {
    val variante = this
    outputs.all {
        (this as com.android.build.gradle.internal.api.BaseVariantOutputImpl).outputFileName =
            "cinetream-${variante.flavorName}-${variante.versionName}${if (variante.buildType.name == "debug") "-prueba" else ""}.apk"
    }
}
