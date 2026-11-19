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

Example fields unlock after the Japanese word, hiragana, and that meaning are filled in. Focusing Example (romaji), by Tab or tap, suggests a sense-matched bundled sentence only when all three example fields are empty. Suggestions remain editable. Words or senses without a match show a message and accept a custom example.

If that requested example lookup finds no match and the current deck also has no matching word, a small “Did you mean…?” list replaces the empty-deck-search message. Suggestions combine close romaji spellings (including missing long vowels) with the entered meaning, rather than showing unrelated words. Selecting a suggestion updates the word and reading, preserves the entered meaning, and requests an example for the correction. Editing the fields dismisses stale suggestions. The fallback checks at most six example parts and displays at most five corrections.

Practice starts with a guess: tap or press Space to flip the card, then tap again or swipe left to mark it correct. Use “Remember me later” or drag a revealed card downward to record an incorrect guess; failed cards get a higher chance of appearing in future sessions. Progress dots and a right swipe review earlier cards without grading them. Correct and missed counts are stored in this browser separately for each deck and practice direction. Deck exports carry a portable deck identifier so imports can reconnect to local history; grades and learning records stay in browser storage and are never exported.

Meanings may contain alternatives separated by `/`, semicolons, commas, full stops, pipes, or newlines. Search scores each alternative separately, recognizes common English inflections and sense-specific JMdict synonyms, and ranks matching sentences for readability. Romaji spaces, hyphens, common Hepburn/Kunrei spellings, long vowels, pronounced particles, and source conjugations are indexed. Homographs still have to match the requested sense.

Bracketed notes are optional: `ticket (bus, train)` searches for `ticket`, without creating `bus` or `train` alternatives. Nested round/square/brace notes and unfinished notes are handled conservatively. Separators inside quotations, common abbreviations, decimal numbers, and fractions remain literal. Explicit conflicting homograph qualifiers and negation retain their sense checks.

Dictionary-part indexing reuses normalized lexeme/conjugation keys instead of recomputing them for each example. Spelling queries keep bounded 16-entry caches for nearby spellings and final correction lists, alongside the eight-part parsed-data cache. Identical concurrent queries share work; failures can be retried, and cached results are copied before returning them. These speed improvements add no dictionary assets.

The expanded English collection has 116,970 searchable records covering 29,556 normalized romaji readings, including 129 linked-sentence fallbacks for senses without a usable example in their own entry. `decks/example-suggestions.json` is now a search index; sentences live in 64 JSON parts under `decks/example-suggestions/` (about 132 MB combined, each under 2.4 MB). The loader fetches only relevant parts and shares cached requests. Android bundles all parts for offline use; the PWA caches parts as they are used. Spanish keeps the existing translated default examples and benefits from the matching improvements.

Both card entry surfaces and the Android bundle save per-token `wordMeanings`. Known sentences reuse their stored contextual annotations, including editorial corrections for reviewed defaults; custom sentences use the local word-form lookup, the supplied card meaning, and translation overlap. Most expanded-corpus annotations are automatic. This offline analysis is approximate for ambiguous words and particles. Unknown custom tokens are explicitly marked for review. Separate words with spaces in romaji for token analysis. The corpus is finite and cannot supply every possible word, new compound, or situation.

Regenerate the offline suggestion dictionary after changing source examples or default decks with `node scripts/build-example-suggestions.mjs`, then run `npm run sync:android` from `android-app/` to update Android assets.

## Tests

Run the project checks with `node --test tests/*.test.js`. Android checks run from `android-app/android` with Gradle (`testDebugUnitTest lintDebug assembleDebug`).

Default decks are based on Noos's Japanese frequency list and TKG Japanese-English Learner's Dictionary. See `decks/SOURCES.md` for data sources and licensing.
