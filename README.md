# NihonNoKaado
Learn Japanese with ready-made flashcard decks, or... create your own!

## Project layout

- `index.html`, `app.js`, and `styles.css` are the web app.
- `decks/` contains the default decks, catalog, and romaji lookup data.
- `android-app/` contains the Capacitor Android project.
- `android-pwa/` contains the installable web app wrapper.

## Run locally

Start your local web server with the repository root as its serving directory, then open [http://127.0.0.1:5500/index.html](http://127.0.0.1:5500/index.html). The app loads its decks and lookup data over HTTP, so opening `index.html` directly from disk will not work.

For Android, install Node.js, JDK 21, and the Android SDK. From `android-app/`, run `npm install` and `npm run sync:android`. Then build and install the debug APK from PowerShell:

```powershell
Set-Location android
.\gradlew.bat assembleDebug
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

The APK is written to `android-app/android/app/build/outputs/apk/debug/app-debug.apk`. With ADB configured and a device connected with USB debugging enabled, the last command installs or updates NihonNoKaado on the device.

## Tests

Run the project checks with `node --test tests/*.test.js`. Android checks run from `android-app/android` with Gradle (`testDebugUnitTest lintDebug assembleDebug`).

Default decks are based on Noos's Japanese frequency list and TKG Japanese-English Learner's Dictionary. See `decks/SOURCES.md` for data sources and licensing.
