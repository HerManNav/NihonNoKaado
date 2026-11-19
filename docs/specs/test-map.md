# Test ownership and verification

All filenames below are under `tests/`. The suite uses Node's built-in runner, assertions, VM/fake DOM harnesses, filesystem fixtures, and real preserved data. No root npm install is needed.

Focused command: `node --test tests/<file>.test.js`. Full maintenance suite: `node --test tests/*.test.js` from project root. Some tests rebuild data in temporary directories or read large archives; use focused tests during local iteration. `node scripts/benchmark-example-search.mjs` reports cold/repeated timings, while regression tests use deterministic work counts. Android Gradle checks are in [platforms](platforms.md).

## Complete file map

| Subsystem | Test files | Evidence |
| --- | --- | --- |
| Core cards, conversion, search, sampling/progress | `deck-core.test.js` | Compatibility, pure helpers, exact ranges, meaning cycles |
| Deck UI and search | `deck-inline-entry.test.js`, `deck-search.test.js`, `deck-menu-hover.test.js` | Input/keyboard wiring, source indices, hover hit areas |
| Form reset/edit return | `card-form-reset.test.js`, `edit-return-position.test.js` | Dependent fields, edit/cancel state and scroll |
| Practice and history | `practice-swipe.test.js` | Gestures/timing, grades/review, identity/fingerprint races, summary |
| Language and general UI | `language-selection.test.js`, `ui-configuration.test.js` | Persistence, migration, settings, loading, static config |
| Export and popup | `export-storage.test.js`, `word-popup-interactions.test.js` | Adapter, URL cleanup, Back, contextual fallback, saved migrations, real lookup, PWA paths |
| Search and performance | `example-search.test.js`, `example-search-edge.test.js`, `example-search-performance.test.js` | Meaning parsing, normalized keys, ranking, distance reference matrix, shared normalization/cache work |
| Service/controller workflow | `example-suggestions.test.js`, `example-next.test.js`, `example-workflow.test.js` | Async guards, cache/retry/isolation, cycling, real form/corpus/analysis/export integration |
| Continuous constructions and corrections | `continuous-example-search.test.js`, `spelling-suggestions.test.js` | Joined/spaced forms, invalid routes, real corrections, six-part budget |
| Lookup | `word-form-lookup.test.js`, `word-form-lookup-edge.test.js`, `word-form-lookup-negative.test.js` | Direct/ranked senses, grammar/POS guards, negatives and result cap |
| Morphology and learner tips | `japanese-inflections-edge.test.js`, `continuous-forms.test.js`, `passive-copula.test.js`, `tense-forms.test.js`, `suru-expressions.test.js`, `learner-grammar-tips.test.js` | Valid/invalid forms, compounds, tense and annotation explanations |
| Defaults and Spanish | `default-dictionaries.test.js`, `all-default-decks-behavior.test.js`, `spanish-starter.test.js` | Shipped counts/data behavior, translated prefixes and reviewed cases |
| Annotation integrity | `default-example-annotations.test.js`, `default-example-provenance.test.js`, `contextual-example-meanings.test.js`, `context-editorial-regressions.test.js` | Token alignment, source/sense references, selected editorial expectations |
| Build reproduction and corpus | `lookup-build.test.js`, `context-generation.test.js`, `example-corpus.test.js` | Rebuilt lookup hash, annotation check, corpus parts/hashes/counts/size/source validity |
| Independent references | `independent-translation-reference.test.js`, `independent-ranking.test.js` | Finite source-linked translation/form and independent TKG commonness checks |
| Android | `android-web-bundle.test.js`, `android-launch-theme.test.js` | Copy fixture, script order, runtime exclusions, theme config |

## Known limits

- Fake DOM and static source checks cannot establish rendered layout, actual focus/accessibility behavior, real touch gestures, or every browser event sequence.
- Corpus integrity/reproducibility establishes consistent output, not universal linguistic accuracy. Most expanded-corpus annotations are automatic; full Spanish output lacks independent proofreading.
- No comprehensive browser end-to-end suite, native Downloads permission integration, or verified full PWA offline scenario is demonstrated by these test files.
- Some behavior is documented from implementation alone (for example PWA network exception versus HTTP error fallback and native file collision handling). Do not label these paths tested merely because adjacent configuration tests exist.

For a behavior change, run the owning tests and relevant boundary tests. For documentation-only work, verify links, source symbols, test inventory, and diff whitespace. Report actual commands/results; do not infer success from test names.
