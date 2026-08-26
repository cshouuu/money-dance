# Money Dance Mobile

Money Dance keeps the existing React/Vite application as the single UI/codebase and uses Capacitor as the native shell.

## App identity

- App name: `Money Dance`
- App ID / Android application ID: `com.cshouuu.moneydance`
- Web bundle: `apps/web/dist`
- Capacitor: `8.5.0` (pinned by CI)

## Android APK

The repository contains `.github/workflows/build-android-apk.yml`.

It builds the current web application, creates a Capacitor Android project on the CI runner, synchronizes the web assets, builds an installable APK, and uploads:

- `money-dance-android.apk`
- `money-dance-android.apk.sha256`

The first CI package uses Android debug signing so it can be installed directly for device acceptance testing. Do not treat the debug key as the long-term release identity. Before distributing updateable release builds broadly, configure one persistent release keystore through GitHub Actions secrets and switch the workflow to `assembleRelease`.

### Local Android development

Requirements: Node.js 22+, JDK 21, Android SDK / Android Studio.

```bash
npm ci
npm run build -w @salary-flow/core
npm run build -w @salary-flow/web
npm install --no-save --package-lock=false -w @salary-flow/web @capacitor/core@8.5.0 @capacitor/android@8.5.0 @capacitor/cli@8.5.0
cd apps/web
npx cap add android
npx cap sync android
npx cap open android
```

The generated `android/` directory is intentionally reproducible from source and does not need to be committed for CI APK builds.

## iOS without a paid Apple Developer account

The web app is now installable as a PWA from Safari through **Add to Home Screen**. It includes standalone display metadata, viewport safe-area support, an app manifest, icon, and an offline service worker.

A Capacitor iOS project can also be generated later on macOS with Xcode using the same `capacitor.config.json`. A free Apple ID can be used for limited Personal Team device testing; App Store / TestFlight distribution is intentionally out of scope until a paid Apple Developer membership exists.

## Data behavior

The mobile shell currently preserves the existing local-first model. Salary profile, wishes, slacking sessions, assets, and ledger records remain device-local. Installing the native APK does not automatically import localStorage data from the Cloudflare-hosted web version because the native WebView has its own storage container.
