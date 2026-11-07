const test = require("node:test");
const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { parseImportedDeck, prepareDefaultDeck } = require("../deck-core.js");

const root = join(__dirname, "..");
const app = readFileSync(join(root, "app.js"), "utf8");
const html = readFileSync(join(root, "index.html"), "utf8");
const styles = readFileSync(join(root, "styles.css"), "utf8");
const manifest = JSON.parse(readFileSync(join(root, "decks", "manifest.json"), "utf8"));

function readDeck(file) {
  return JSON.parse(readFileSync(join(root, "decks", file), "utf8"));
}

test("default deck catalog keeps 50 and 100 and offers 500, 1,000, and 2,000 card sets", () => {
  assert.deepEqual(manifest.decks.map(({ id, count }) => [id, count]), [
    ["common-50", 50],
    ["common-100", 100],
    ["common-500", 500],
    ["common-1000", 1000],
    ["common-2000", 2000],
  ]);
  assert.equal(existsSync(join(root, "decks", "english/most-common-10.json")), false);
  assert.deepEqual(manifest.decks.map(({ name }) => name), [
    "Most common - 50", "Most common - 100", "Most common - 500", "Most common - 1,000", "Most common - 2,000",
  ]);

  for (const { count, file } of manifest.decks) {
    const source = readDeck(file);
    assert.equal(source.cards.length, count, `${file} should contain exactly ${count} cards`);
  }
});

test("Spanish deck labels use the localized most-common names", () => {
  assert.equal(readDeck("spanish/most-common-50-es.json").name, "Más comunes - 50");
  assert.match(app, /name: `Más comunes - \$\{deck\.count\.toLocaleString\("es-ES"\)\}/);
});

test("each default dataset has unique romaji and a complete sense-matched example per meaning", () => {
  for (const { count, file } of manifest.decks) {
    const source = readDeck(file);
    const imported = parseImportedDeck(source, (index) => `${file}-${index}`);
    assert.equal(new Set(imported.map(({ japanese }) => japanese)).size, count, `${file} has duplicate romaji`);
    assert.ok(imported.every(({ hiragana, meanings, examples }) =>
      hiragana && meanings.length > 0 && examples.length === meanings.length
      && examples.every((example) => example.romaji && example.hiragana && example.english)), `${file} has an incomplete card or example`);
    assert.ok(source.cards.every((card) => card.examples?.length === 1), `${file} must include one example for its one base meaning`);
  }
});

test("default example romaji uses readable word spacing without changing punctuation", () => {
  const examples = manifest.decks.flatMap(({ file }) => readDeck(file).cards.flatMap((card) => card.examples || []));
  assert.ok(examples.some(({ romaji }) => romaji === "watashi ha gakusei da."));
  assert.ok(examples.some(({ romaji }) => romaji === "nani wo suru?"));
  assert.ok(examples.some(({ romaji }) => /\w\s+\w/.test(romaji)), "Expected segmented romaji words");
  assert.ok(examples.every(({ romaji }) => !/\s{2}|\s+[.,!?;:]/.test(romaji)), "Spacing should not create doubled spaces or split punctuation");
});

test("the 50-card set remains the prefix of the 100-card list", () => {
  const fullList = readDeck("english/most-common-100.json").cards;
  assert.deepEqual(readDeck("english/most-common-50.json").cards, fullList.slice(0, 50));
  assert.equal(prepareDefaultDeck(readDeck("english/most-common-100.json"), 50, (index) => String(index)).length, 50);
});

test("all decks share an ascending frequency-ranked prefix", () => {
  const cards500 = readDeck("english/most-common-500.json").cards;
  const cards1000 = readDeck("english/most-common-1000.json").cards;
  const cards2000 = readDeck("english/most-common-2000.json").cards;
  assert.deepEqual(readDeck("english/most-common-100.json").cards, cards500.slice(0, 100));
  assert.deepEqual(cards500, cards1000.slice(0, 500));
  assert.deepEqual(cards1000, cards2000.slice(0, 1000));
  assert.equal(manifest.frequencySource, "https://noosflashcards.com/resources/frequency-lists/japanese");
  assert.equal(manifest.meaningAndExampleSource, "https://www.tkgje.jp/");
});

test("import opens default decks and selection opens confirmation", () => {
  assert.match(html, /id="add-button"[^>]*aria-label="View deck"/);
  assert.match(app, /querySelector\("#import-action"\)\.addEventListener\("click", openDefaultDecks\)/);
  assert.match(app, /fetch\("decks\/manifest\.json"/);
  assert.match(html, /id="default-deck-confirm-screen"[^>]*aria-labelledby="default-deck-confirm-title"/);
  assert.match(html, /id="default-deck-confirm-status"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /id="cancel-default-deck-load"[^>]*>Cancel<\/button>/);
  assert.match(html, /id="confirm-default-deck-load"[^>]*>Replace and load<\/button>/);
  assert.match(app, /button\.addEventListener\("click", \(\) => requestDefaultDeckLoad\(deck, button\)\)/);

  const showConfirmationIndex = app.indexOf('showScreen("defaultConfirm");', app.indexOf("function requestDefaultDeckLoad"));
  const loadFunctionIndex = app.indexOf("async function loadDefaultDeck()");
  const fetchIndex = app.indexOf('const response = await fetch(`decks/${deck.file.split("/").map(encodeURIComponent).join("/")}`);');
  const saveIndex = app.indexOf("if (!saveCards(importedCards)) throw");
  const replaceIndex = app.indexOf("cards = importedCards;", saveIndex);
  assert.ok(showConfirmationIndex >= 0 && showConfirmationIndex < fetchIndex);
  assert.ok(loadFunctionIndex >= 0 && loadFunctionIndex < fetchIndex);
  assert.match(app, /confirmDefaultDeckLoadButton\.addEventListener\("click", loadDefaultDeck\)/);
  assert.ok(fetchIndex < saveIndex && saveIndex < replaceIndex);
  assert.match(app, /Your current deck is unchanged; try again/);
  assert.doesNotMatch(app.slice(app.indexOf("function requestDefaultDeckLoad"), app.indexOf("function defaultDeckErrorMessage")), /window\.confirm/);
});

test("cancel and Escape return to the list without loading the selected deck", () => {
  assert.match(app, /function cancelDefaultDeckLoad\(\)[\s\S]*?pendingDefaultDeck = null;[\s\S]*?showScreen\("defaults"\)/);
  assert.match(app, /trigger\?\.focus\(\)/);
  assert.match(app, /event\.key === "Escape" && !screens\.defaultConfirm\.hidden && !defaultDeckLoadInProgress\)[\s\S]*?cancelDefaultDeckLoad\(\)/);
});

test("source attributions appear in About", () => {
  const about = html.slice(html.indexOf('id="about-screen"'), html.indexOf('id="export-screen"'));
  assert.ok(about.includes('https://www.tkgje.jp/'));
  assert.ok(about.includes('https://noosflashcards.com/resources/frequency-lists/japanese'));
  assert.ok(about.includes('Romaji meanings use'));
});

test("retry button stays compact and neutral in the deck list", () => {
  const rule = styles.match(/\.default-deck-list \.default-deck-retry\s*\{([^}]*)\}/)?.[1];
  assert.ok(rule, "Expected specific layout rule for the retry button");
  assert.match(rule, /flex:\s*0\s+0\s+auto/);
  assert.match(rule, /width:\s*max-content/);
  assert.match(rule, /white-space:\s*nowrap/);
  assert.match(rule, /color:\s*#485143/);
});
