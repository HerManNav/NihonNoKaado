const test = require("node:test");
const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { parseImportedDictionary, prepareDefaultDictionary } = require("../dictionary-core.js");

const root = join(__dirname, "..");
const app = readFileSync(join(root, "app.js"), "utf8");
const html = readFileSync(join(root, "index.html"), "utf8");
const styles = readFileSync(join(root, "styles.css"), "utf8");
const manifest = JSON.parse(readFileSync(join(root, "dictionaries", "manifest.json"), "utf8"));

function readDictionary(file) {
  return JSON.parse(readFileSync(join(root, "dictionaries", file), "utf8"));
}

test("default dictionary catalog keeps 50 and 100 and offers 500, 1,000, and 2,000 card sets", () => {
  assert.deepEqual(manifest.dictionaries.map(({ id, count }) => [id, count]), [
    ["common-50", 50],
    ["common-100", 100],
    ["common-500", 500],
    ["common-1000", 1000],
    ["common-2000", 2000],
  ]);
  assert.equal(existsSync(join(root, "dictionaries", "most-common-10.json")), false);

  for (const { count, file } of manifest.dictionaries) {
    const source = readDictionary(file);
    assert.equal(source.cards.length, count, `${file} should contain exactly ${count} cards`);
  }
});

test("each default dataset has unique romaji and a complete sense-matched example per meaning", () => {
  for (const { count, file } of manifest.dictionaries) {
    const source = readDictionary(file);
    const imported = parseImportedDictionary(source, (index) => `${file}-${index}`);
    assert.equal(new Set(imported.map(({ japanese }) => japanese)).size, count, `${file} has duplicate romaji`);
    assert.ok(imported.every(({ hiragana, meanings, examples }) =>
      hiragana && meanings.length > 0 && examples.length === meanings.length
      && examples.every((example) => example.romaji && example.hiragana && example.english)), `${file} has an incomplete card or example`);
    assert.ok(source.cards.every((card) => card.examples?.length === 1), `${file} must include one example for its one base meaning`);
  }
});

test("default example romaji uses readable word spacing without changing punctuation", () => {
  const examples = manifest.dictionaries.flatMap(({ file }) => readDictionary(file).cards.flatMap((card) => card.examples || []));
  assert.ok(examples.some(({ romaji }) => romaji === "watashi ha gakusei da."));
  assert.ok(examples.some(({ romaji }) => romaji === "nani wo suru?"));
  assert.ok(examples.some(({ romaji }) => /\w\s+\w/.test(romaji)), "Expected segmented romaji words");
  assert.ok(examples.every(({ romaji }) => !/\s{2}|\s+[.,!?;:]/.test(romaji)), "Spacing should not create doubled spaces or split punctuation");
});

test("the retained 50-card set remains the prefix of the retained 100-card list", () => {
  const fullList = readDictionary("most-common-100.json").cards;
  assert.deepEqual(readDictionary("most-common-50.json").cards, fullList.slice(0, 50));
  assert.equal(prepareDefaultDictionary(readDictionary("most-common-100.json"), 50, (index) => String(index)).length, 50);
});

test("500, 1,000, and 2,000-word decks share an ascending frequency-ranked prefix", () => {
  const cards500 = readDictionary("most-common-500.json").cards;
  const cards1000 = readDictionary("most-common-1000.json").cards;
  const cards2000 = readDictionary("most-common-2000.json").cards;
  assert.deepEqual(cards500, cards1000.slice(0, 500));
  assert.deepEqual(cards1000, cards2000.slice(0, 1000));
  assert.equal(manifest.frequencySource, "https://noosflashcards.com/resources/frequency-lists/japanese");
  assert.equal(manifest.meaningAndExampleSource, "https://www.tkgje.jp/");
});

test("the + button opens a native-looking page and selecting a set opens the in-app confirmation", () => {
  assert.match(html, /id="add-button"[^>]*aria-label="Browse default dictionaries"/);
  assert.match(app, /addButton\.addEventListener\("click", openDefaultDictionaries\)/);
  assert.match(app, /fetch\("dictionaries\/manifest\.json"/);
  assert.match(html, /id="default-dictionary-confirm-screen"[^>]*aria-labelledby="default-dictionary-confirm-title"/);
  assert.match(html, /id="default-dictionary-confirm-status"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /id="cancel-default-dictionary-load"[^>]*>Cancel<\/button>/);
  assert.match(html, /id="confirm-default-dictionary-load"[^>]*>Replace and load<\/button>/);
  assert.match(app, /button\.addEventListener\("click", \(\) => requestDefaultDictionaryLoad\(dictionary, button\)\)/);

  const showConfirmationIndex = app.indexOf('showScreen("defaultConfirm");', app.indexOf("function requestDefaultDictionaryLoad"));
  const loadFunctionIndex = app.indexOf("async function loadDefaultDictionary()");
  const fetchIndex = app.indexOf("const response = await fetch(`dictionaries/${encodeURIComponent(dictionary.file)}`);");
  const saveIndex = app.indexOf("if (!saveCards(importedCards)) throw");
  const replaceIndex = app.indexOf("cards = importedCards;", saveIndex);
  assert.ok(showConfirmationIndex >= 0 && showConfirmationIndex < fetchIndex);
  assert.ok(loadFunctionIndex >= 0 && loadFunctionIndex < fetchIndex);
  assert.match(app, /confirmDefaultDictionaryLoadButton\.addEventListener\("click", loadDefaultDictionary\)/);
  assert.ok(fetchIndex < saveIndex && saveIndex < replaceIndex);
  assert.match(app, /Your current dictionary is unchanged; try again/);
  assert.doesNotMatch(app.slice(app.indexOf("function requestDefaultDictionaryLoad"), app.indexOf("function defaultDictionaryErrorMessage")), /window\.confirm/);
});

test("cancel and Escape return to the list without loading the selected dictionary", () => {
  assert.match(app, /function cancelDefaultDictionaryLoad\(\)[\s\S]*?pendingDefaultDictionary = null;[\s\S]*?showScreen\("defaults"\)/);
  assert.match(app, /trigger\?\.focus\(\)/);
  assert.match(app, /event\.key === "Escape" && !screens\.defaultConfirm\.hidden && !defaultDictionaryLoadInProgress\)[\s\S]*?cancelDefaultDictionaryLoad\(\)/);
});

test("source attributions are separated below the loading instructions", () => {
  assert.match(html, /<p class="default-dictionaries-description">[\s\S]*?<\/p>\s*<p class="default-dictionaries-source">[\s\S]*?<\/p>\s*<p class="default-dictionaries-source">[\s\S]*?href="https:\/\/www\.tkgje\.jp/);
  assert.match(html, /href="https:\/\/noosflashcards\.com\/resources\/frequency-lists\/japanese"/);
  assert.match(html, /href="https:\/\/travelwithlanguages\.com\/blog\/most-common-japanese-words\.html"/);
  assert.match(styles, /\.default-dictionaries-source\s*\{[^}]*margin:\s*16px\s+0\s+0/s);
});

test("retry button stays compact and neutral in the dictionary list", () => {
  const rule = styles.match(/\.default-dictionary-list \.default-dictionary-retry\s*\{([^}]*)\}/)?.[1];
  assert.ok(rule, "Expected specific layout rule for the retry button");
  assert.match(rule, /flex:\s*0\s+0\s+auto/);
  assert.match(rule, /width:\s*max-content/);
  assert.match(rule, /white-space:\s*nowrap/);
  assert.match(rule, /color:\s*#485143/);
});
