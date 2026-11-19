# Example suggestions and analysis

## Form workflow

Each meaning on both entry surfaces owns a controller. Japanese, hiragana, and meaning must be nonblank before its three example fields unlock. Locked wrapper interaction shows a warning. Focusing Example (romaji) requests suggestions only if all example fields are empty. Users can enter or edit examples manually; no match or load failure reports status and leaves manual entry available. Previous/next navigation wraps around ranked examples; a manually entered current sentence can be included when inspecting navigation.

Controller revision/context/field signatures and screen activity reject late results after edits, language/context changes, or navigation. Meaning groups remain independent. Saving waits for pending work and rechecks form signatures. Existing annotations survive unchanged edits; changed examples go through analysis.

Spelling suggestions require a requested empty lookup plus no matching deck results or existing examples. Selecting a correction updates word/reading, keeps meaning, and requests an example. Edits dismiss stale corrections. Fuzzy correction permits up to five results and six downloaded parts; construction metadata supplements lexical candidates without downloading the whole corpus. Queries outside supported bounds return no corrections.

## Matching and ranking

`example-search.js` normalizes kana/romaji, Hepburn/Kunrei variants, long vowels, spacing/hyphens, and meaning text. Meaning alternatives recognize separators but protect nested optional notes, quoted text, apostrophes, abbreviations, decimal numbers, and fractions. Notes such as `ticket (bus, train)` do not create unrelated alternatives. Explicit conflicting homograph qualifiers and negation constrain matching. English inflections and source sense aliases broaden eligible synonyms.

`rankSuggestions` filters by language, headword/alias, and reliable kana reading. It sorts sense score first, then sentence quality: naturalness, target surface occurrence, literal translation match, exact continuous construction, reviewed status, and source quality; sentence text breaks ties. Sentence keys deduplicate results. Both `suggest` and `allSuggestions` return copied examples.

Continuous/request forms use validated verb aliases and sense-linked construction routes, including joined/spaced forms such as `matteite`. Unsupported chains/readings must not produce invented matches. A base-sense sentence may be used as fallback when the exact construction has no bundled sentence.

## Data and caches

`decks/example-suggestions.json` format 2 maps normalized keys to 64 parts in `decks/example-suggestions/`; parts contain records/aliases, and manifest metadata includes construction routes/spellings. Format 1 monolithic records remain supported by the service. Loader checks manifest shape and part format/count. Build/tests verify hashes; runtime does not hash every fetched part.

Manifest requests share a promise and retry after failure. Parsed part promises use an 8-entry default LRU; per-part indexes share lexeme normalization work. Nearby-spelling and final-alternative caches each hold 16 queries. Identical concurrent work shares promises, failed cache entries can retry, and caller mutations must not corrupt cached results. All normal indexed parts needed for a query may load; the six-part limit specifically bounds spelling fallback.

## Contextual analysis

Known sentence text/translation/reading can reuse valid positional `wordMeanings`. Custom text uses local lookup, previous-token grammar, target card meaning, translation overlap, and particle hints. Unknown words receive `Meaning unavailable; check the spelling and word spacing.` Tokenization requires spaced romaji words. Analysis is an offline heuristic; annotations outside reviewed cases are not guaranteed linguistically correct.

## Ownership and evidence

`example-suggestions.js`: `createService`, `rankSuggestions`, `alternatives`, `analyze`, `createController`. `example-search.js`: `meaningParts`, `senseScore`, `wordKeys`, `spellingDistance`, `parseContinuousForm`. `app.js`: `setupExampleFields`, `prepareExampleAnnotations`, `waitForExampleSuggestions`, `exampleFormSignature`.

Tests: `tests/example-search.test.js`, `tests/example-search-edge.test.js`, `tests/example-search-performance.test.js`, `tests/example-suggestions.test.js`, `tests/example-next.test.js`, `tests/spelling-suggestions.test.js`, `tests/continuous-example-search.test.js`, `tests/example-workflow.test.js`. Corpus generation and provenance: [content pipeline](content-pipeline.md).
