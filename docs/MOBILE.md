# Money Dance Mobile

Money Dance keeps the existing React/Vite application as the single UI/codebase and uses Capacitor as the native shell.

## App identity

- App name: `Money Dance`
- App ID / Android application ID: `com.cshouuu.moneydance`
- Web bundle: `apps/web/dist`
- Capacitor: `8.5.0` (pinned by CI)

## Android APK

The repository contains `.github/workflows/build-android-apk.yml`.

It builds the current web application, creates a Capacitor Android project on the CI runner, injects the native update bridge, synchronizes the web assets, builds an installable APK, verifies its signature, and generates a SHA-256 checksum.

### Pull requests and manual builds

PR and manual workflow runs upload an Actions artifact named:

- `money-dance-android-apk`

The artifact contains:

- `money-dance-android.apk`
- `money-dance-android.apk.sha256`

PR builds use a throwaway CI signing key and compile both debug and release variants. They exist only to prove that the native updater and release-signing Gradle configuration still compile; they are not the long-term Android release identity.

### Permanent release signing

Tagged production APKs must always use the same release keystore. The keystore is never committed to Git and is restored only inside GitHub Actions from repository secrets.

Required Actions secrets:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

If any secret is missing, a `v*` tag build fails before publishing an APK. This is deliberate: publishing one release with a different key would break future in-place upgrades.

Back up the release keystore securely. If it is lost, a future APK cannot update existing installations signed with that key.

### Versioning

Production tags must use `vMAJOR.MINOR.PATCH`, for example `v0.2.0`.

The workflow derives:

- Android `versionName` = `0.2.0`
- Android `versionCode` = `major * 1,000,000 + minor * 1,000 + patch`

This keeps Android's numeric upgrade ordering stable while the UI can compare normal semantic versions.

### Tagged releases

Pushing a tag matching `v*` builds a fixed-key signed release APK and then creates or updates the matching GitHub Release.

For example:

```bash
git tag v0.2.0
git push origin v0.2.0
```

The Release receives directly downloadable files:

- `money-dance-v0.2.0.apk`
- `money-dance-v0.2.0.apk.sha256`

Users should download Android builds from GitHub Releases rather than searching through Actions artifacts.

### In-app updates

The Android shell contains a small native Capacitor plugin called `AppUpdater`.

The app:

1. reads its installed `versionName` / `versionCode` from Android;
2. checks `cshouuu/money-dance` GitHub Releases for the latest APK;
3. compares the latest semantic version with the installed version;
4. prompts the user when a newer release exists;
5. downloads only APK URLs under `https://github.com/cshouuu/money-dance/releases/download/` through Android `DownloadManager`;
6. opens Android's package installer when the download finishes.

Android still requires the user to approve the final install/update confirmation. Money Dance does not attempt silent installation.

On Android 8+, the first in-app update may also require the user to enable **Allow from this source** for Money Dance. The app opens the relevant system settings page and asks the user to return and retry the update.

The app automatically checks at most once every six hours and also exposes a manual **我的 → 应用更新 → 检查更新** action.

### First migration from old debug APKs

Previously generated Money Dance APKs used ephemeral debug signing. Those APKs do **not** share the permanent release certificate.

Therefore, users who already installed an old debug APK need to uninstall it once before installing the first fixed-signed release. From that first fixed-signed release onward, newer APKs can update in place without uninstalling, as long as the permanent keystore is preserved.

Because uninstalling removes Android WebView local app data, export/backup should be considered before a broad migration if real user data already exists.

### Local Android development

Requirements: Node.js 22+, JDK 21, Android SDK / Android Studio.

```bash
npm ci
npm run build -w @salary-flow/core
npm run build -w @salary-flow/web
npm install --no-save --package-lock=false @capacitor/core@8.5.0 @capacitor/android@8.5.0 @capacitor/cli@8.5.0
cd apps/web
npx cap add android
npx cap sync android
node native/android/prepare-android.mjs
npx cap open android
```

The generated `android/` directory is intentionally reproducible from source and does not need to be committed for CI APK builds.

## iOS without a paid Apple Developer account

The web app is installable as a PWA from Safari through **Add to Home Screen**. It includes standalone display metadata, viewport safe-area support, an app manifest, icon, and an offline service worker.

Normal UI and feature deployments do not require users to add the PWA to the home screen again. The current service worker uses a network-first strategy, so reopening the installed PWA fetches the current deployed app when the network is available.

A Capacitor iOS project can also be generated later on macOS with Xcode using the same `capacitor.config.json`. A free Apple ID can be used for limited Personal Team device testing; App Store / TestFlight distribution is intentionally out of scope until a paid Apple Developer membership exists.

## Data behavior

The mobile shell currently preserves the existing local-first model. Salary profile, wishes, slacking sessions, assets, and ledger records remain device-local. Installing the native APK does not automatically import localStorage data from the Cloudflare-hosted web version because the native WebView has its own storage container.
