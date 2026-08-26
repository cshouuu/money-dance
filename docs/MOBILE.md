# Money Dance Mobile

Money Dance keeps the existing React/Vite application as the single UI/codebase and uses Capacitor as the native shell.

## App identity

- App name: `Money Dance`
- App ID / Android application ID: `com.cshouuu.moneydance`
- Web bundle: `apps/web/dist`
- Capacitor: `8.5.0` (pinned by CI)

## Android APK

The repository contains `.github/workflows/build-android-apk.yml`.

It builds the current web application, creates a Capacitor Android project on the CI runner, synchronizes the web assets, builds an installable APK, and generates a SHA-256 checksum.

### Pull requests and manual builds

PR and manual workflow runs upload an Actions artifact named:

- `money-dance-android-apk`

The artifact contains:

- `money-dance-android.apk`
- `money-dance-android.apk.sha256`

This is intended for development and device acceptance testing.

### Tagged releases

Pushing a tag matching `v*` automatically builds the APK and then creates or updates the matching GitHub Release.

For example:

```bash
git tag v0.2.0
git push origin v0.2.0
```

The Release receives directly downloadable files:

- `money-dance-v0.2.0.apk`
- `money-dance-v0.2.0.apk.sha256`

Users should download Android builds from GitHub Releases rather than searching through Actions artifacts.

The current CI package uses Android debug signing so it can be installed directly for device acceptance testing. Do not treat the debug key as the long-term release identity. Before distributing updateable release builds broadly, configure one persistent release keystore through GitHub Actions secrets and switch the workflow to a release signing configuration.

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
npx cap open android
```

The generated `android/` directory is intentionally reproducible from source and does not need to be committed for CI APK builds.

## iOS without a paid Apple Developer account

The web app is installable as a PWA from Safari through **Add to Home Screen**. It includes standalone display metadata, viewport safe-area support, an app manifest, icon, and an offline service worker.

Normal UI and feature deployments do not require users to add the PWA to the home screen again. The current service worker uses a network-first strategy, so reopening the installed PWA fetches the current deployed app when the network is available.

A Capacitor iOS project can also be generated later on macOS with Xcode using the same `capacitor.config.json`. A free Apple ID can be used for limited Personal Team device testing; App Store / TestFlight distribution is intentionally out of scope until a paid Apple Developer membership exists.

## Data behavior

The mobile shell currently preserves the existing local-first model. Salary profile, wishes, slacking sessions, assets, and ledger records remain device-local. Installing the native APK does not automatically import localStorage data from the Cloudflare-hosted web version because the native WebView has its own storage container.
