# Content and generation pipeline

## Published assets

`decks/manifest.json` catalogs English/Spanish decks at 50, 100, 500, 1,000, and 2,000 cards. Smaller Spanish decks are exact prefixes of the 2,000-card translation. Frequency order comes from Noos/Leipzig news counts; meanings and sense-tagged examples come from TKG. Filtering removes duplicate romaji and entries lacking a usable sense-matched sentence. This is a filtered frequency list, not a guarantee of pedagogical order for every sense.

The compiled JMdict English lookup, example routing index, and 64 sentence parts are runtime assets. Pinned source archives, build reports, translation drafts, source indexes, and editorial decisions under `decks/source-data/` and `scripts/` are maintenance inputs. They must not enter Android's runtime bundle. See [sources and licenses](../../decks/SOURCES.md) before changing/distributing content.

## Build ownership

| Output / job | Owner and inputs |
| --- | --- |
| Base English default decks | `scripts/generate-default-dictionaries.mjs` (historical name): project root, external TKG checkout/index, Noos CSV arguments; selects sense examples and generates catalog-sized prefixes |
| Compiled gzip word lookup | `scripts/build-romaji-lookup.mjs`: preserved JMdict tarball, OpenSubtitles frequencies, TKG learner index, `scripts/japanese-inflections.mjs` |
| Default contextual annotations | `scripts/annotate-default-examples.mjs`: pinned TKG owner/linked archives, JMdict lookup, review decisions, learner sources, replacements/spacing/meaning overrides |
| Spanish default decks | `scripts/build-spanish-decks.mjs`: English master, Spanish draft, reviewed first 100, grammar/compound helpers; emits five prefixes and build report |
| Translation drafts/review preparation | `scripts/translate-spanish-decks.py`, `prepare-spanish-model.py`, `build-spanish-starter-50.mjs`, `build-spanish-starter-100.mjs`, Spanish overrides |
| Full suggestion corpus | `scripts/build-example-suggestions.mjs` imports `build-example-corpus.mjs`: archived TKG entries, English/Spanish defaults, JMdict source/lookup, annotations and sense aliases |
| Compact construction routes/spellings | `scripts/build-example-constructions.mjs`: existing corpus and lexical evidence; also called by full corpus builder |
| Source archival/preparation | `scripts/download-tkg-example-sources.mjs`, `archive-tkg-suggestion-sources.mjs`, `prepare-suru-components.mjs` |

Annotation helpers: `tkg-context-meaning.mjs`, `learner-grammar-tips.mjs`, `suru-tip-components.mjs`, `space-example-romaji.mjs`, `topic-particle-romaji.mjs`. Curated input files: `context-review-decisions.json`, `default-learner-source-examples.json`, `default-example-replacements.json`, `default-example-spacing-overrides.json`, `default-example-meaning-overrides.json`, `suru-components.json`, `suru-component-overrides.json`.

## Corpus contracts

The full corpus rebuild runs offline from preserved sources, verifies archive/index hashes and revisions, selects usable sense-linked examples, adds reviewed defaults and eligible linked-sentence fallbacks, annotates tokens, deduplicates, and hashes headwords into 64 parts. The manifest records paths, counts, hashes, query indexes, construction metadata, and provenance. Parts/index must stay under 20 MB each. Automatic corpus annotations are broader than editorially reviewed defaults and can be approximate. Exact current counts belong in generated reports and `decks/SOURCES.md`, not duplicated in agent instructions.

Spanish preserves Japanese word/reading, sentence spelling, and token positions. Some lexical/grammar cases are reviewed; the full translation has not been independently proofread. Changing English annotations can require refreshing Spanish output and corpus as well as defaults.

## Maintenance commands

Run only the builders required by a content change; they overwrite generated assets.

```sh
node scripts/build-romaji-lookup.mjs
node scripts/annotate-default-examples.mjs --check
node scripts/annotate-default-examples.mjs --write
node scripts/build-spanish-decks.mjs
node scripts/build-example-suggestions.mjs
```

Annotation invocation without `--write` inspects coverage/review queue; `--check` checks reproducibility. Construction-only changes can use `node scripts/build-example-constructions.mjs`. Base deck generation needs explicit arguments; inspect its usage and source requirements before invocation. After changing runtime assets, sync Android and review PWA version/cache implications; see [platforms](platforms.md).

## Evidence and limits

`tests/lookup-build.test.js` rebuilds the lookup to a temporary output and compares uncompressed hashes. `tests/context-generation.test.js` runs annotation `--check`. Corpus tests validate all published parts/hashes/size/provenance/annotation positions. Default, Spanish, editorial, and independent-reference tests check selected data invariants; see [test map](test-map.md). Reproducibility does not prove every source translation or generated explanation is linguistically correct.
