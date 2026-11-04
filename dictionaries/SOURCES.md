# Default dictionary sources

## Japanese-English lookup and word forms

- `romaji-english-jmdict-2026-11-02.json.gz` is a compact lookup derived from the English-only JMdict dataset distributed by [jmdict-simplified](https://github.com/scriptin/jmdict-simplified), release `3.6.2+20261102210542` (dictionary date 2026-11-02). It contains 207,169 romaji keys, 483,623 distinct reading-gloss associations, 32,810 inflectable lemmas, and form rules for common modern conjugations. It expands in memory when first used. The popup groups meanings by dictionary entry and shows up to four likely results, including applicable form explanations.
- JMdict is maintained by the Electronic Dictionary Research and Development Group (EDRDG). The underlying data is copyright © James William Breen and EDRDG, and is provided under the [EDRDG license](https://www.edrdg.org/edrdg/licence.html) and [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The jmdict-simplified release asset is a JSON conversion of that data.
- The preserved source archive is `dictionaries/source-data/jmdict-eng-3.6.2+20261102210542.json.tgz`. A second preserved source, `dictionaries/source-data/ja_full-OpenSubtitles2018.txt`, comes from [FrequencyWords](https://github.com/hermitdave/FrequencyWords) and is based on OpenSubtitles 2018. Its content is CC BY-SA 4.0. Corpus counts help rank written homographs; they do not provide exact frequencies for each sense.
- Run `node scripts/build-romaji-lookup.mjs` to rebuild from those sources. `scripts/japanese-inflections.mjs` defines form rules from JMdict part-of-speech tags. The browser checks those rules against matching lemmas, so a form such as `chikazuite` can identify `chikazuku`. It also handles suru nouns, common adjective forms, copula forms, and some group suffixes. Archaic forms and longer auxiliary chains are outside this rule set. The derived data is distributed under the same attribution and share-alike terms as its sources.

## Sets

- The 50- and 100-word sets retain their existing word order and English glosses from [Travel with Languages](https://travelwithlanguages.com/blog/most-common-japanese-words.html). Their hiragana and example sentences are matched to the closest English sense in the TKG learner dictionary.
- The 500-, 1,000-, and 2,000-word sets follow the frequency order in [Noos's Japanese frequency list](https://noosflashcards.com/resources/frequency-lists/japanese), based on Leipzig Corpora Collection news counts. They skip duplicate romaji and entries that have no corresponding TKG entry with a complete, sense-tagged example. The published sets are prefixes of the same filtered order; the 2,000-word set reaches source rank 2,426 after filtering.
- English glosses and example sentences for all sets come from the [TKG Japanese-English Learner's Dictionary](https://www.tkgje.jp/) and its [public data repository](https://github.com/tkgally/je-dict-1). Each chosen example is tagged to the definition used for that card. The example source is converted to kana and romaji for this app.

## Licenses

- The TKG dictionary data is dedicated to the public domain under CC0 1.0.
- Noos states that its frequency list is shared under CC BY-SA 4.0. These derived 500-, 1,000-, and 2,000-word sets retain that attribution and share-alike notice.
- The original attribution for the retained 50- and 100-word lists remains in each JSON file and in the dictionary browser.

## Example selection and limits

The generator only accepts a TKG example when its `sense_numbers` includes the selected definition, the Japanese source can be converted to a kana reading without leftover kanji, the Japanese text ends as a complete sentence, and a non-placeholder English translation is present. The smaller new sets use prefixes of the filtered 2,000-word sequence.

Example romaji is spaced using TKG's source annotations, which mark word boundaries. A one-time script matched all 3,650 stored example records to the source text, then changed only their romaji spacing; the existing hiragana and translations were preserved. It verified that removing spaces from each result leaves the original romaji unchanged (ignoring an `n'` separator immediately before a space).

These checks preserve the source's sense alignment and remove incomplete samples, but they cannot prove that every translation is error-free. The TKG project describes its entries as reviewed and refined; the 2,000 examples have not each received an independent human proofread for this app.

## Regenerating the files

The generator uses Node.js and locally downloaded source files. From the project root, pass the extracted TKG repository, its generated `entries_index.json`, and Noos's UTF-8 `japanese-top-5000.csv` file:

```sh
node scripts/generate-default-dictionaries.mjs -- <project-root> <tkg-repository-root> <entries_index.json> <japanese-top-5000.csv>
```

To reapply the example spacing to already generated files, run:

```sh
node scripts/space-example-romaji.mjs <project-root> <tkg-repository-root>/entries --write
```
