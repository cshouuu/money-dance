import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(here, '../..')
const androidRoot = join(webRoot, 'android')
const appRoot = join(androidRoot, 'app')
const javaRoot = join(appRoot, 'src/main/java/com/cshouuu/moneydance')
const manifestPath = join(appRoot, 'src/main/AndroidManifest.xml')
const gradlePath = join(appRoot, 'build.gradle')
const versionName = process.env.ANDROID_VERSION_NAME || '0.1.0-dev'
const versionCodeRaw = Number.parseInt(process.env.ANDROID_VERSION_CODE || '1', 10)
const versionCode = Number.isFinite(versionCodeRaw) && versionCodeRaw > 0 ? versionCodeRaw : 1
const releaseSigning = process.env.ANDROID_RELEASE_SIGNING === 'true'

await mkdir(javaRoot, { recursive: true })
await copyFile(join(here, 'AppUpdaterPlugin.java'), join(javaRoot, 'AppUpdaterPlugin.java'))

await writeFile(join(javaRoot, 'MainActivity.java'), `package com.cshouuu.moneydance;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Capacitor builds the Bridge during super.onCreate(), so custom plugins
        // must be registered first or they will not exist at runtime.
        registerPlugin(AppUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`)

let manifest = await readFile(manifestPath, 'utf8')
for (const permission of [
  'android.permission.INTERNET',
  'android.permission.REQUEST_INSTALL_PACKAGES',
]) {
  if (!manifest.includes(permission)) {
    manifest = manifest.replace(/(<manifest[^>]*>)/, `$1\n    <uses-permission android:name="${permission}" />`)
  }
}
await writeFile(manifestPath, manifest)

let gradle = await readFile(gradlePath, 'utf8')
gradle = gradle
  .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
  .replace(/versionName\s+"[^"]+"/, `versionName "${versionName}"`)

if (releaseSigning) {
  if (!gradle.includes('moneyDanceReleaseSigning')) {
    gradle = gradle.replace(/android\s*\{/, `android {
    // moneyDanceReleaseSigning
    signingConfigs {
        release {
            def keystorePropertiesFile = rootProject.file("keystore.properties")
            def keystoreProperties = new Properties()
            keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
            storeFile file(keystoreProperties['storeFile'])
            storePassword keystoreProperties['storePassword']
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
        }
    }`)
  }
  gradle = gradle.replace(/(buildTypes\s*\{\s*release\s*\{)/, '$1\n            signingConfig signingConfigs.release')
}

await writeFile(gradlePath, gradle)
console.log(`Prepared Android project: versionName=${versionName}, versionCode=${versionCode}, releaseSigning=${releaseSigning}`)
