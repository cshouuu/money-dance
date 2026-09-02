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
const stylesPath = join(appRoot, 'src/main/res/values/styles.xml')
const api26StylesPath = join(appRoot, 'src/main/res/values-v26/styles.xml')
const api27StylesPath = join(appRoot, 'src/main/res/values-v27/styles.xml')
const versionName = process.env.ANDROID_VERSION_NAME || '0.1.0-dev'
const versionCodeRaw = Number.parseInt(process.env.ANDROID_VERSION_CODE || '1', 10)
const versionCode = Number.isFinite(versionCodeRaw) && versionCodeRaw > 0 ? versionCodeRaw : 1
const releaseSigning = process.env.ANDROID_RELEASE_SIGNING === 'true'
const pgyerAppShortcut = process.env.PGYER_APP_SHORTCUT || 'moneydance'

if (!/^[A-Za-z0-9_-]{4,64}$/.test(pgyerAppShortcut)) {
  throw new Error('PGYER_APP_SHORTCUT must use 4-64 letters, numbers, underscores, or hyphens')
}

const nativeJavaFiles = [
  'AppUpdaterPlugin.java',
  'WidgetActionReceiver.java',
  'WidgetBridgePlugin.java',
  'WidgetContract.java',
  'WidgetRenderer.java',
  'WidgetStateStore.java',
  'WidgetTickerService.java',
  'MoneyDanceWidgetProvider.java',
  'MoneyDanceSquareWidgetProvider.java',
]

const nativeResourceFiles = [
  'drawable/money_dance_widget_background.xml',
  'drawable/money_dance_widget_badge.xml',
  'drawable/money_dance_widget_button_primary.xml',
  'drawable/money_dance_widget_button_secondary.xml',
  'drawable/money_dance_widget_notification.xml',
  'layout/money_dance_widget.xml',
  'layout/money_dance_widget_square.xml',
  'xml/money_dance_widget_info.xml',
  'xml/money_dance_widget_square_info.xml',
]

await mkdir(javaRoot, { recursive: true })
for (const file of nativeJavaFiles) {
  const sourcePath = join(here, file)
  const destinationPath = join(javaRoot, file)
  if (file === 'AppUpdaterPlugin.java') {
    const source = await readFile(sourcePath, 'utf8')
    const prepared = source.replace('__PGYER_APP_SHORTCUT__', pgyerAppShortcut)
    if (prepared === source || prepared.includes('__PGYER_APP_SHORTCUT__')) {
      throw new Error('Unable to inject PGYER_APP_SHORTCUT into AppUpdaterPlugin.java')
    }
    await writeFile(destinationPath, prepared)
  } else {
    await copyFile(sourcePath, destinationPath)
  }
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

// The WebView is intentionally light themed. On Android 15 devices with an
// older WebView, Capacitor protects the content with native insets, exposing
// the Activity window behind the status bar. Give that window the same cream
// surface as the web app so OEM themes (notably dark-mode launcher defaults)
// cannot leave a black strip above the page.
let styles = await readFile(stylesPath, 'utf8')

function escapedRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function upsertStyleItems(source, styleName, marker, items) {
  const stylePattern = new RegExp(`(<style\\s+name="${escapedRegExp(styleName)}"[^>]*>)([\\s\\S]*?)(</style>)`)
  const match = source.match(stylePattern)
  if (!match) throw new Error(`Unable to inject Android system-bar theme into ${styleName}`)

  let body = match[2]
  body = body.replace(new RegExp(`\\s*<!--\\s*${escapedRegExp(marker)}\\s*-->\\s*`, 'g'), '\n')
  // Remove the previous unqualified high-API attribute as part of migration,
  // even though it is intentionally absent from the replacement item list.
  const namesToRemove = new Set([...items.map(([name]) => name), 'android:windowLightNavigationBar'])
  for (const name of namesToRemove) {
    body = body.replace(
      new RegExp(`\\s*<item\\s+name="${escapedRegExp(name)}">[\\s\\S]*?</item>\\s*`, 'g'),
      '\n',
    )
  }
  const injected = `\n        <!-- ${marker} -->\n${items.map(([name, value]) => `        <item name="${name}">${value}</item>`).join('\n')}`
  const remainingBody = body.trim()
  return source.replace(
    stylePattern,
    `${match[1]}${injected}${remainingBody ? `\n        ${remainingBody}` : ''}\n    ${match[3]}`,
  )
}

function extractStyle(source, styleName) {
  const stylePattern = new RegExp(`<style\\s+name="${escapedRegExp(styleName)}"[^>]*>[\\s\\S]*?</style>`)
  const match = source.match(stylePattern)
  if (!match) throw new Error(`Unable to create API 27 Android theme for ${styleName}`)
  return match[0]
}

const baseNavigationColor = '#211A31'
const lightNavigationColor = '#F5F2EA'
styles = upsertStyleItems(styles, 'AppTheme.NoActionBar', 'moneyDanceSystemBars', [
  ['android:windowBackground', '#F5F2EA'],
  ['android:statusBarColor', '@android:color/transparent'],
  // API 24-26 cannot request dark three-button navigation icons through a
  // theme attribute, so retain enough contrast in the unqualified resource.
  ['android:navigationBarColor', baseNavigationColor],
  ['android:windowLightStatusBar', 'true'],
])
styles = upsertStyleItems(styles, 'AppTheme.NoActionBarLaunch', 'moneyDanceLaunchSystemBars', [
  ['android:statusBarColor', '@android:color/transparent'],
  ['android:navigationBarColor', baseNavigationColor],
  ['android:windowLightStatusBar', 'true'],
])
await writeFile(stylesPath, styles)

// API 26 can request dark navigation icons programmatically (which Capacitor's
// SystemBars plugin does), but the equivalent public theme attribute does not
// exist yet. Use a light navigation surface after the splash screen while the
// launch theme continues to inherit the contrasting base navigation color.
const api26Styles = `<?xml version="1.0" encoding="utf-8"?>
<resources>
${extractStyle(styles, 'AppTheme.NoActionBar')
    .replace('<!-- moneyDanceSystemBars -->', '<!-- moneyDanceApi26SystemBars -->')
    .replace(`<item name="android:navigationBarColor">${baseNavigationColor}</item>`, `<item name="android:navigationBarColor">${lightNavigationColor}</item>`)}
</resources>
`
await mkdir(dirname(api26StylesPath), { recursive: true })
await writeFile(api26StylesPath, api26Styles)

// android:windowLightNavigationBar was added as a public theme attribute in
// API 27. Keep complete style bags in the qualified resource so they do not
// depend on resource-merging behavior for same-name styles.
const api27Styles = `<?xml version="1.0" encoding="utf-8"?>
<resources>
${extractStyle(styles, 'AppTheme.NoActionBar')
    .replace('<!-- moneyDanceSystemBars -->', '<!-- moneyDanceApi27SystemBars -->')
    .replace(`<item name="android:navigationBarColor">${baseNavigationColor}</item>`, `<item name="android:navigationBarColor">${lightNavigationColor}</item>\n        <item name="android:windowLightNavigationBar">true</item>`)}

${extractStyle(styles, 'AppTheme.NoActionBarLaunch')
    .replace('<!-- moneyDanceLaunchSystemBars -->', '<!-- moneyDanceApi27LaunchSystemBars -->')
    .replace(`<item name="android:navigationBarColor">${baseNavigationColor}</item>`, `<item name="android:navigationBarColor">${lightNavigationColor}</item>\n        <item name="android:windowLightNavigationBar">true</item>`)}
</resources>
`
await mkdir(dirname(api27StylesPath), { recursive: true })
await writeFile(api27StylesPath, api27Styles)

let manifest = await readFile(manifestPath, 'utf8')
manifest = manifest.replace(
  /\s*<uses-permission\s+android:name="android\.permission\.REQUEST_INSTALL_PACKAGES"\s*\/>\s*/g,
  '\n',
)
for (const permission of [
  'android.permission.INTERNET',
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
            android:label="Money Dance · 4×1"
            android:exported="false">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/money_dance_widget_info" />
        </receiver>
        <receiver
            android:name=".MoneyDanceSquareWidgetProvider"
            android:label="Money Dance · 2×2"
            android:exported="false">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/money_dance_widget_square_info" />
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
if (!manifest.includes('android:name=".MoneyDanceSquareWidgetProvider"')) {
  const squareWidgetReceiver = `
        <receiver
            android:name=".MoneyDanceSquareWidgetProvider"
            android:label="Money Dance · 2×2"
            android:exported="false">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/money_dance_widget_square_info" />
        </receiver>`
  const nextManifest = manifest.replace(
    /(\s*<receiver\s+android:name="\.WidgetActionReceiver")/,
    `${squareWidgetReceiver}$1`,
  )
  if (nextManifest === manifest) throw new Error('Unable to inject Android 2x2 widget receiver')
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
console.log(`Prepared Android project: versionName=${versionName}, versionCode=${versionCode}, releaseSigning=${releaseSigning}, pgyerShortcut=${pgyerAppShortcut}`)
