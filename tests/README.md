# Tests

Run the maintenance tests from the project root with:

```sh
node --test
```

The suite uses Node's built-in test runner and has no package dependencies. It covers deck import/export and starter data, English practice and session progress, card editing and swipes, romaji conversion, inflection rules and homograph ranking, and revealed-card popup behavior for mouse and touch. It also verifies that the preserved deck sources reproduce the published lookup and that PWA precache paths exist.

Example-search regressions cover meaning separators, nested/malformed optional notes, quoted text, abbreviations, decimals/fractions, apostrophes, negation, homographs, conjugations, the real `kuuko` → `kuukoo` correction, and the real `kippu` + `ticket (bus, train)` case. A full-matrix reference cross-checks spelling-distance pruning over all 1,600 pairs of strings of length 0–3 in a three-letter alphabet, at seven thresholds. Corpus checks verify every shipped part's hash, 20 MB limit, source/sense provenance, and positional annotations.

Cache and controller tests cover concurrent requests, LRU eviction, invalid settings/limits, retry after failures, mutation isolation, deck-match suppression, manual input preservation, language/screen changes, and delayed results. Performance regressions use work counts rather than brittle elapsed-time assertions: 500 examples of one lexeme must share normalization work. Run `node scripts/benchmark-example-search.mjs` for an actual local cold/repeated-query timing report; the benchmark is development-only and is not bundled into Android.

`continuous-example-search.test.js` covers joined/spaced `matteite`, related verb constructions, request meanings, homographs, incorrect readings, invalid suffix chains, positional analysis of custom sentences, and every compact construction route into the bundled sentences. Regenerate just these routes with `node scripts/build-example-constructions.mjs`; the full corpus builder also generates them.

Spelling regressions also cover `atteite` + `wait` → `matteite`, typo/transposition variants of auxiliary forms, spacing and kana input, ambiguous meanings, and selecting a correction followed by example suggestion and analysis. The small construction-spelling metadata is regenerated from existing source-linked examples and lexical senses; it remains searchable when unrelated lexical matches fill the six-part download budget.

`example-workflow.test.js` exercises the real corpus, controller, analysis, and JSON export/import together, including corrected and manually entered examples. Actual form-wiring tests cover locked taps, warning messages, focus-triggered suggestions and independent meaning groups. `android-web-bundle.test.js` runs the real Android copy script in a disposable fixture, verifies runtime assets and maintenance-file exclusion, and checks browser script initialization without CommonJS. Its temporary directory is removed even if an assertion fails.

`independent-translation-reference.test.js` checks published lexical meanings, homographs, conjugations, and invalid forms against source-linked references outside the JMdict build. The references are written directly into the tests, so they are reviewable and do not depend on a live website during a test run. These cases are a finite cross-check; they do not establish the accuracy or frequency order of every deck sense. The popup interaction tests use a small fake DOM and do not substitute for a browser check on actual devices.

`independent-ranking.test.js` checks common-first examples against the preserved TKG basic/core index, which is independent of JMdict. The popup interaction suite also fetches and decompresses the real lookup once to verify its browser-facing version and translation path.
