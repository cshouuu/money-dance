# Money Dance Mobile

Money Dance keeps the existing React/Vite application as the single UI/codebase and uses Capacitor as the native shell.

## App identity

- App name: `Money Dance`
- App ID / Android application ID: `com.cshouuu.moneydance`
- Web bundle: `apps/web/dist`
- Capacitor: `8.5.0` (pinned by CI)

## Android APK

The repository contains `.github/workflows/build-android-apk.yml`.

It builds the current web application, creates a Capacitor Android project on the CI runner, injects the maintained native bridges and Android resource templates, synchronizes the web assets, builds an installable APK, verifies its signature, and generates a SHA-256 checksum.

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

### Tagged releases and Pgyer delivery

Pushing a tag matching `v*` builds a fixed-key signed release APK, publishes it to Pgyer, and then creates or updates the matching GitHub Release archive.

For example:

```bash
git tag v0.3.0
git push origin v0.3.0
```

Pgyer is the primary Android distribution source for current clients:

- Public page: `https://www.pgyer.com/moneydance`
- Actions secret: `PGYER_API_KEY`
- Optional repository variable: `PGYER_APP_SHORTCUT` (defaults to `moneydance`)

The API key is available only to the release job. The workflow uses Pgyer's three-step upload flow with overseas acceleration for GitHub-hosted runners, verifies the package ID and version returned after publishing, and then checks that the public page exposes the tagged version. The API key and API-generated direct-install URL are never compiled into the APK or written to release artifacts.

GitHub Releases remains the permanent release archive and receives:

- `money-dance-v0.3.0.apk`
- `money-dance-v0.3.0.apk.sha256`
- `money-dance-update.json`

The same signed APK is also uploaded to the private Cloudflare R2 bucket `money-dance-releases` for clients released before the Pgyer migration. The existing Cloudflare Pages project exposes only the legacy update endpoints through a Pages Function with an R2 binding:

- `/download/latest.json`
- `/download/releases/money-dance-vX.Y.Z.apk`
- `/download/health`

The bucket itself remains private; users do not receive R2 credentials or direct bucket access.

Current clients no longer query R2 or GitHub for updates. The R2 manifest and GitHub archive remain during the migration window so older installations can still discover the first Pgyer-enabled release.

The release workflow maintains `retention.json` in R2 and keeps at most the newest **10 APK versions**. When a new release would exceed 10 retained APKs, the oldest APK object is deleted automatically. GitHub Releases is not pruned and continues to preserve the full release history.

Required Cloudflare Actions secrets:

- `CLOUDFLARE_API_TOKEN` with R2 write access and Pages deployment access
- `CLOUDFLARE_ACCOUNT_ID`

### In-app updates

The Android shell contains a native Capacitor plugin called `AppUpdater`.

The app:

1. reads its installed `versionName` / `versionCode` from Android;
2. loads the public `https://www.pgyer.com/moneydance` page over HTTPS;
3. validates the fixed Pgyer host, Money Dance app name, and semantic version exposed by the page;
4. prompts the user when a newer release exists;
5. opens the fixed Pgyer public page in the user's browser;
6. lets Pgyer deliver the APK and Android perform the normal install/update confirmation.

Android still requires the user to approve the final install/update confirmation. Money Dance does not attempt silent installation and no longer requests `REQUEST_INSTALL_PACKAGES` itself.

On Android 8+, the user may need to enable **Allow from this source** for the browser that downloaded the APK. This permission belongs to that browser, not Money Dance.

The app automatically checks at most once every six hours and also exposes a manual **我的 → 应用更新 → 检查更新** action.

Existing builds that cannot reach either legacy host cannot discover this migration automatically. Those users need to install the first Pgyer-enabled release once from the public Pgyer page; the fixed release signature then allows later versions to update in place.

### Android home-screen widget

The widget is an Android-only `home_screen` surface. It is not a lock-screen widget and does not add an equivalent widget to iOS or the PWA. Android's widget picker exposes two independent sizes that share the same data and actions:

- a compact 4×1 row;
- a 2×2 square for narrower home-screen layouts.

Its refresh behavior follows the current earning state:

- when the visible app syncs during a paid work slice, normal “today earned” display automatically enters real-time mode unless the user stopped it for that day;
- the user can also explicitly enable or stop the current day's real-time mode from the widget;
- active slacking or overtime automatically enables once-per-second widget updates for the duration of that session;
- zero-rate gaps such as lunch wait until the next same-day paid slice instead of redrawing `RemoteViews` once per second;
- while real-time mode is off, Android requests a low-frequency widget redraw every 30 minutes so stale and cross-day displays do not remain frozen indefinitely;
- the implementation uses a `specialUse` foreground service and a persistent Android notification while second-level updates are active;
- widget redraws may pause while the screen is off and resume when it becomes interactive again;
- OEM background policies and launcher refresh behavior can still delay a frame, so this is best-effort second-level display rather than a hard real-time guarantee.

On Android 13 and later, Money Dance asks for notification permission once, only after at least one widget has been added and the app next resumes. If the user declines, the foreground ticker can still run and Android keeps it visible under **Active apps / Task Manager**, but the notification-drawer status and its stop action may be hidden. Real-time mode can still be turned off from the widget, and notification permission can be granted later in Android system settings.

Both the 4×1 and 2×2 layouts expose these actions:

- slacking can be started and stopped directly from the widget;
- starting overtime opens MoneyDance and reuses the existing overtime pay-mode selector (unpaid, salary multiplier, or fixed amount);
- active overtime can be stopped directly from the widget;
- real-time display for normal work earnings can be enabled or stopped explicitly from the widget.

The native widget does not reimplement salary, attendance, flexible-work, or calendar adjustment rules. The Web layer calculates and compresses the next 36 hours into earnings timeline slices, then sends the snapshot through the Capacitor bridge to Android `SharedPreferences`. The native layer evaluates the current slice to render the amount without loading the WebView on every tick.

Slacking uses those same paid-work slices. An unpaid lunch, time before or after work, weekends, holidays, and other zero-rate gaps do not increase either the slacking amount or its paid duration; the wall-clock start and end are still retained for audit.

An optional flexible-work planned end is included as an exact timeline boundary. Once reached, the widget stops increasing the work amount at that second; the Web layer performs the interactive settlement when the app next becomes active.

Widget actions are stored in an append-only native action queue with stable action IDs. On app startup or resume, the bridge exposes pending actions to the Web layer, which applies them idempotently to `localStorage` and acknowledges them only after the related session and ledger changes succeed. This keeps desktop actions recoverable across process restarts while preserving the existing local-first source of truth.

### Lightweight timer backfill

Slacking and overtime can start from the current time or backfill an actual start time that has already passed; a completed missed interval can also be entered in one step. This is intentionally a lightweight correction flow, not future scheduling: Money Dance does not register an Android alarm, background job, or exact-time trigger to start slacking or overtime automatically. Future timestamps are rejected, and backfilled intervals may not overlap retained or active records of the same kind.

Backfilled earnings use the salary rate available when the record is created rather than reconstructing a historical salary snapshot. Cross-midnight income remains attributed to the interval's start date, while duration views may split the elapsed time by local calendar day.

### Slacking and overtime achievements

Both timers have five permanent achievement levels:

| Module | Level thresholds |
| --- | --- |
| Slacking | 30 minutes, 3 hours, 10 hours, 30 hours, 100 hours |
| Overtime | 1 hour, 10 hours, 30 hours, 100 hours, 300 hours |

Existing session records are used to initialize lifetime progress. New completed sessions continue adding to that lifetime total. Clearing or deleting session history does not subtract lifetime duration and does not relock an illuminated medal; history cleanup and achievement progress are deliberately separate operations.

Each retained timer record also has an independent duration-based visual. Slacking progresses from fish to mermaid emoji, while overtime uses Lucide icons from briefcase through crown. These record visuals do not alter the permanent achievement thresholds above.

### System bars and safe areas

The Capacitor shell uses the Android System Bars plugin with edge-to-edge content, a transparent status bar, dark status-bar icons on the light MoneyDance background, and CSS safe-area variables for headers, dialogs, notices, and the bottom navigation. The native preparation script applies the same theme idempotently when CI regenerates the Android project, including on vivo and other OEM shells that previously showed a sunken dark status-bar band.

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

The mobile shell currently preserves the existing local-first model. Salary profile, wishes, slacking and overtime sessions, achievement progress, assets, and ledger records remain device-local. Installing the native APK does not automatically import localStorage data from the Cloudflare-hosted web version because the native WebView has its own storage container.
