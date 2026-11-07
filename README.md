# NihonNoKaado
Learn Japanese with ready-made flashcard decks, or... create your own!

## Project layout

- `index.html`, `app.js`, and `styles.css` are the web app.
- `decks/` contains the default decks, catalog, and romaji lookup data.
- `android-app/` contains the Capacitor Android project.
- `android-pwa/` contains the installable web app wrapper.

## Run locally

Serve the repository root with a local HTTP server and open `index.html`. JSON assets need an HTTP origin; opening the file directly is not supported.

For Android, install the dependencies in `android-app/`, then run `npm run sync:android` and build/run the Android project.

## Tests

Run the project checks with `node --test tests/*.test.js`. Android checks run from `android-app/android` with Gradle (`testDebugUnitTest lintDebug assembleDebug`).

Default decks are based on Noos's Japanese frequency list and TKG Japanese-English Learner's Dictionary. See `decks/SOURCES.md` for data sources and licensing.
