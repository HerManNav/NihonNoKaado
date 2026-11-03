# Japanese Cards for Android

This separate Capacitor project bundles the shared web app files into an Android WebView. The existing browser app and `android-pwa/` remain separate and unchanged.

## Shared source

The root project remains the source of truth for `index.html`, `styles.css`, `app.js`, `dictionary-core.js`, and `dictionaries/`. Before syncing or building Android, `npm run copy-web` copies those shared app files and default-dictionary JSON assets into the generated `www/` directory. The generated directory is ignored by Git.

## Build prerequisites

- Node.js 22 or newer with npm
- Android Studio with the Android SDK installed

The initial application ID is a development placeholder (`com.example.japanesecards`). Choose a permanent unique ID before distributing a Play Store release; changing it after publication creates a different app.

## Android data and files

The packaged Android app stores its dictionary in the app's own WebView storage, separate from desktop and browser-PWA storage. Use dictionary JSON export/import to transfer dictionaries between versions. Import and export need device testing inside the Android WebView before distribution.

## Commands

```sh
npm install
npm run copy-web
npx cap add android
npm run sync:android
npm run open:android
```

In Android Studio, run the app on a connected Android device. For a debug APK or Play Store AAB, use Capacitor's Android build command or Android Studio's Build menu after the project is synced.
