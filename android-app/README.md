# Japanese Cards for Android

This separate Capacitor project bundles the shared web app files into an Android WebView. The existing browser app and `android-pwa/` remain separate and unchanged.

## Shared source

The root project remains the source of truth for `index.html`, `styles.css`, `app.js`, `deck-core.js`, `word-form-lookup.js`, `language.js`, and `decks/`. Before syncing or building Android, `npm run copy-web` copies those shared files, the deck manifest, default decks, and romaji lookup into the generated `www/` directory. Maintenance source archives are excluded, and the generated deck directory is replaced on each copy to remove stale assets. The generated directory is ignored by Git.

## Build prerequisites

- Node.js 22 or newer with npm
- Android Studio with the Android SDK installed

The initial application ID is a development placeholder (`com.example.japanesecards`). Choose a permanent unique ID before distributing a Play Store release; changing it after publication creates a different app.

## Android data and files

The packaged Android app stores its deck in the app's own WebView storage, separate from desktop and browser-PWA storage. Use deck JSON export/import to transfer decks between versions. Import and export need device testing inside the Android WebView before distribution.

Settings includes Language and About. Exports use an in-app naming form and always save to Downloads. Android 7–9 requests storage permission when exporting; Android 10+ uses MediaStore without broad storage permission. Previous folder selections are discarded. Repeated exports preserve existing files. The native `DeckExportPlugin` writes the files, and the app stays in portrait orientation.

## Commands

```sh
npm install
npm run copy-web
npx cap add android
npm run sync:android
npm run open:android
```

In Android Studio, run the app on a connected Android device. For a debug APK or Play Store AAB, use Capacitor's Android build command or Android Studio's Build menu after the project is synced.
