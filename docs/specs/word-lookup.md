# Word lookup, annotations, and romaji

## Popup

On revealed Japanese text, romaji tokens are separate targets while original whitespace/punctuation remain text. Valid positional annotations resolve repeated words by position and bypass full dictionary loading. A single-meaning headword can use its card meaning; otherwise lookup supplies candidates. The core lookup returns up to four explanations, but current popup displays only the first fallback meaning.

Desktop hover follows pointer within an 8 px margin; touch anchors above the token. Outside tap, card change, screen exit, and system Back dismiss it. Pending lookup cannot reopen a popup after the active target changes. An unrevealed token tap reveals the card first. Touch popup interaction must consume dismissal before grading/advancement.

`getRomajiLookup` lazily fetches the compiled gzip asset, decompresses with `DecompressionStream` when supported (or uses JSON fallback path), shares requests, validates lookup version, and permits retry after failure. Do not assume the fallback asset is shipped: the current checked-in lookup is gzip. Unsupported loading produces no fallback popup result.

## Morphology

`findWordMeanings(key, data, previousKey)` combines direct senses, ranked homographs, particle hints, irregular/rule forms, noun copula, appropriate plural pronouns, spaced/attached suru compounds, and validated te-form auxiliaries. Explanations include base lemma and grammatical role: past/negative/polite, passive/potential/causative, continuing forms and requests. POS/rule validation blocks arbitrary adjective/noun chains, false suru splits, impossible potential forms of state verbs, and inanimate noun plurals. Prior word context helps spaced compounds. Candidates deduplicate and cap at four.

Learner annotations add compound components, grammatical explanations, and reviewed tense/context corrections. Their build helpers live under `scripts/`; runtime lookup remains local and English-oriented.

## Romaji conversion

`deck-core.js` converts common syllables, digraphs, alternate spellings, geminated consonants including `tch`, syllabic n/apostrophes, punctuation, and quoted examples. It preserves spaces/existing Japanese/unsupported characters; manual hiragana is respected by form wiring. This entry converter differs from search-key normalization and source romanization. When changing spelling rules, check all three paths rather than assuming they are interchangeable.

## Ownership and evidence

`app.js`: `getRomajiLookup`, `showWordTranslation`, `appendRomajiTokens`, `positionWordTranslationPopup`. `word-form-lookup.js`: `findWordMeanings`, continuous-form helpers. `deck-core.js`: `romajiToHiragana`, `normalizeWordMeanings`. Generated lookup: `decks/romaji-english-jmdict-2026-11-02.json.gz`; builder: `scripts/build-romaji-lookup.mjs`.

Tests: `tests/word-popup-interactions.test.js`, `tests/word-form-lookup.test.js`, `tests/word-form-lookup-edge.test.js`, `tests/word-form-lookup-negative.test.js`, `tests/japanese-inflections-edge.test.js`, `tests/continuous-forms.test.js`, `tests/passive-copula.test.js`, `tests/tense-forms.test.js`, `tests/suru-expressions.test.js`, `tests/learner-grammar-tips.test.js`, `tests/deck-core.test.js`. Independent references are finite cross-checks, not proof of every inferred form.
