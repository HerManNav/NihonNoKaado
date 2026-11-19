# Data contracts and storage

## Cards and portable JSON

Runtime shape: `{id, japanese, hiragana, english, meanings, examples}`. `japanese` stores the romaji headword; `english` is the first-meaning compatibility field even for Spanish content. `examples[i]` belongs to `meanings[i]`, with `{romaji, hiragana, english, wordMeanings?}`. Annotation items are positional `{romaji, meaning, entryId?, senseNumber?}`.

`parseImportedDeck` accepts a plain card array or `{cards}` object, current `japanese-cards-deck` and legacy `japanese-cards-dictionary` format markers, and versions 1–3. It trims fields, accepts legacy `english` string/array or `meanings`, requires a Japanese word and nonblank meaning, generates missing hiragana, fills example slots, and creates runtime IDs. Unsupported explicit format/version or malformed cards fail. `prepareDefaultDeck` validates positive integer count and enough imported cards, then slices to catalog size.

`serializeDeck` exports format `japanese-cards-deck`, version 3, name, timestamp, optional `deckId`, and cards. Single-meaning cards use `english`; multiple meanings use `meanings`. It preserves examples/valid annotations, omits runtime IDs and learning history. Import/export normalization discards an annotation array as a unit unless its token count, order, text, and nonempty meanings match the example. Valid source entry IDs and positive sense numbers are retained.

## Local persistence

| Key | Purpose |
| --- | --- |
| `japanese-cards.deck.v1` | Current card array |
| `japanese-cards.dictionary.v1` | Legacy key, moved to deck key when needed |
| `japanese-cards.deck-identity.v1` | Version 1 active deck ID and content fingerprint aliases |
| `japanese-cards.learning.v2` | Version 2 deck/direction/normalized-headword correct and incorrect counts |
| `japanese-cards.context-annotation-migration.v1` | Content signature guarding restoration of legacy contextual annotations |

Default identity is `default:<deck file path>`; English/Spanish decks therefore differ. Custom IDs use a random identifier. Import prefers valid explicit `deckId`, then known SHA-256 canonical-content fingerprint, then a new ID. Fingerprints omit runtime IDs and annotations but include ordered words/readings/meanings/example text. Pending fingerprint registration is awaited for exact reimports; older async work cannot overwrite newer registrations for the same content.

Learning uses `japanese` or `english` direction buckets and trimmed lowercase headwords, not runtime card UUIDs. Weight is `1 + min(4, max(0, incorrect - correct))`. Counts are validated, bounded at 1,000,000,000, and stored in prototype-safe maps. Renaming a word merges both direction histories into the new key. Old unsplit history is ignored. Clear removes current cards and selects a new custom ID; it does not erase all historical learning/fingerprint records.

Malformed card storage yields an empty deck with a warning. Card-save failures block the corresponding mutation; identity persistence is optional and learning writes can fail without blocking practice. Legacy examples can restore annotations from matching default sentences; asynchronous migration checks content before replacing saved cards.

## Export destinations

`export-storage.js` delegates to Capacitor `DeckExport` on Android; otherwise it downloads a JSON Blob and revokes its URL after one second. It removes obsolete IndexedDB folder-handle settings. The export screen collects a deck name, sanitizes filename, shows destination/status, blocks duplicate saves, and reports success/failure. Import requests replacement confirmation for a nonempty deck. See [platforms](platforms.md) for native storage details.

## Ownership and evidence

`deck-core.js`: `parseImportedDeck`, `serializeDeck`, `normalizeWordMeanings`. `app.js`: `loadCards`, `saveCards`, `resolveDeckId`, `canonicalDeckContent`, `registerDeckFingerprint`, `loadLearningStore`, `migrateLearningKey`, `restoreContextMeaningsForSavedCards`, `importDeck`, `saveDeckExport`, `clearDeck`.

Tests: `tests/deck-core.test.js`, `tests/practice-swipe.test.js` (learning and identities), `tests/word-popup-interactions.test.js` (migrations), `tests/export-storage.test.js`, `tests/example-workflow.test.js`. Native Downloads and real storage-quota behavior are not fully proved by these JS tests.
