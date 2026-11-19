# Browser, PWA, and Android

## Browser

Serve repository root over HTTP, then open `index.html`; direct filesystem opening cannot fetch runtime JSON correctly. Root frontend has no build step. `index.html` script order must expose core/lookup/search/suggestion globals before `app.js` uses them. Export is a browser JSON download. Browser storage is scoped to origin; changing server origin can appear to lose saved cards/history.

## PWA

`android-pwa/index.html` displays `../index.html` in an iframe and registers `sw.js` with `./` scope. Manifest/icons provide install metadata. `sw.js` currently uses `japanese-cards-pwa-v69`, precaches wrapper/runtime, catalog/index, and 50/100-card English/Spanish decks. It does not precache the large lookup or all example parts.

Fetch policy is network-first for same-origin GET. Successful responses are cached; network exceptions fall back to matching cache, with wrapper fallback for navigation. HTTP error responses do not trigger the exception fallback. Activation removes older caches with the app prefix and claims clients. Larger decks/parts can be available after fetch/cache; full offline operation, especially iframe control across service-worker scope, must be checked in a real browser. Existing tests only prove precache paths exist, not complete offline readiness. Review cache version when changing shipped runtime assets.

## Capacitor Android

`android-app/package.json` owns Capacitor dependencies and commands. `scripts/copy-web.mjs` copies nine shared root files into generated `android-app/www/`, recreates its deck directory, and copies only catalog, lookup files, all catalog English/Spanish decks, example manifest, and every listed example part. It rejects path escape and omits maintenance archives. Treat copied assets and Android public assets as generated; edit shared root sources first.

From `android-app/`:

```sh
npm install
npm run sync:android
```

Sync runs copy then `cap sync android`. JDK 21 and Android SDK are needed. From `android-app/android/` in PowerShell:

```powershell
.\gradlew.bat assembleDebug
```

APK: `android-app/android/app/build/outputs/apk/debug/app-debug.apk`. Gradle verification tasks are `testDebugUnitTest lintDebug assembleDebug`. `open:android` and `build:android` scripts sync before Capacitor actions.

## Native behavior

`android-app/android/app/src/main/java/com/example/japanesecards/MainActivity.java` registers `DeckExportPlugin`, matches launch/window/WebView background to `#f7f6f2`, applies light status-bar icons/background handling, and bridges Back to `JapaneseCardsHandleBack`. Pending native Back calls are guarded; unhandled root Back falls through to Android. Manifest locks portrait.

`DeckExportPlugin.java` validates JSON filenames/no path separators, writes UTF-8 Downloads exports, and cleans up partial failures. Android 10+ uses pending MediaStore records without broad storage permission; older versions request storage permission, create a unique numbered filename when needed, and scan the resulting file. App feedback reports denial/write failures. Previous folder-handle settings are discarded by `export-storage.js`.

## Evidence

`tests/android-web-bundle.test.js` executes copy in a fixture and checks runtime assets/exclusions/browser globals. `tests/android-launch-theme.test.js` and `tests/ui-configuration.test.js` inspect native configuration. `tests/export-storage.test.js` checks browser/native JS adapter, not actual filesystem permissions. Native Java implementation, real gesture/status-bar rendering, and PWA offline/scope behavior require device/browser checks when relevant.
