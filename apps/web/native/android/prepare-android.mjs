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

const nativeJavaFiles = [
  'AppUpdaterPlugin.java',
  'WidgetActionReceiver.java',
  'WidgetBridgePlugin.java',
  'WidgetContract.java',
  'WidgetRenderer.java',
  'WidgetStateStore.java',
  'WidgetTickerService.java',
  'MoneyDanceWidgetProvider.java',
]

const nativeResourceFiles = [
  'drawable/money_dance_widget_background.xml',
  'drawable/money_dance_widget_badge.xml',
  'drawable/money_dance_widget_button_primary.xml',
  'drawable/money_dance_widget_button_secondary.xml',
  'drawable/money_dance_widget_notification.xml',
  'layout/money_dance_widget.xml',
  'xml/money_dance_widget_info.xml',
]

await mkdir(javaRoot, { recursive: true })
for (const file of nativeJavaFiles) {
  await copyFile(join(here, file), join(javaRoot, file))
}
for (const file of nativeResourceFiles) {
  const destination = join(appRoot, 'src/main/res', file)
  await mkdir(dirname(destination), { recursive: true })
  await copyFile(join(here, 'res', file), destination)
}

await writeFile(join(javaRoot, 'MainActivity.java'), `package com.cshouuu.moneydance;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Capacitor builds the Bridge during super.onCreate(), so custom plugins
        // must be registered first or they will not exist at runtime.
        registerPlugin(AppUpdaterPlugin.class);
        registerPlugin(WidgetBridgePlugin.class);
        captureWidgetLaunchTarget(getIntent());
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        captureWidgetLaunchTarget(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && WidgetRenderer.hasWidgets(this)
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED
                && WidgetStateStore.markNotificationPermissionRequestIfNeeded(this)) {
            requestPermissions(
                    new String[] { Manifest.permission.POST_NOTIFICATIONS },
                    WidgetContract.NOTIFICATION_PERMISSION_REQUEST_CODE
            );
        }
    }

    private void captureWidgetLaunchTarget(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data == null || !"moneydance".equals(data.getScheme()) || !"open".equals(data.getHost())) return;
        String path = data.getPath();
        String target;
        if ("/overtime".equals(path) && "1".equals(data.getQueryParameter("start"))) {
            target = WidgetContract.OVERTIME_LAUNCH_TARGET;
        } else if ("/slacking".equals(path)) {
            target = WidgetContract.SLACKING_LAUNCH_TARGET;
        } else if (path == null || path.isEmpty() || "/".equals(path)) {
            target = WidgetContract.ROOT_LAUNCH_TARGET;
        } else {
            return;
        }
        WidgetStateStore.setLaunchTarget(this, target);
    }
}
`)

let manifest = await readFile(manifestPath, 'utf8')
for (const permission of [
  'android.permission.INTERNET',
  'android.permission.REQUEST_INSTALL_PACKAGES',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
  'android.permission.POST_NOTIFICATIONS',
]) {
  if (!manifest.includes(`android:name="${permission}"`)) {
    manifest = manifest.replace(/(<manifest[^>]*>)/, `$1\n    <uses-permission android:name="${permission}" />`)
  }
}

if (!manifest.includes('moneyDanceWidgetComponents')) {
  const widgetComponents = `
        <!-- moneyDanceWidgetComponents -->
        <receiver
            android:name=".MoneyDanceWidgetProvider"
            android:exported="false">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/money_dance_widget_info" />
        </receiver>
        <receiver
            android:name=".WidgetActionReceiver"
            android:exported="false" />
        <service
            android:name=".WidgetTickerService"
            android:exported="false"
            android:foregroundServiceType="specialUse">
            <property
                android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
                android:value="Updates a user-pinned wage and timer home-screen widget once per second while explicitly active." />
        </service>`
  const nextManifest = manifest.replace(/(<application\b[^>]*>)/, `$1${widgetComponents}`)
  if (nextManifest === manifest) throw new Error('Unable to inject Android widget components into <application>')
  manifest = nextManifest
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
  if (!gradle.includes('signingConfig signingConfigs.release')) {
    gradle = gradle.replace(/(buildTypes\s*\{\s*release\s*\{)/, '$1\n            signingConfig signingConfigs.release')
  }
}

await writeFile(gradlePath, gradle)
console.log(`Prepared Android project: versionName=${versionName}, versionCode=${versionCode}, releaseSigning=${releaseSigning}`)
