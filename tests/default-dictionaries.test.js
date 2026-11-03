const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
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

test("default dictionary catalog offers exact 10, 50, and 100 card JSON sets", () => {
  assert.deepEqual(manifest.dictionaries.map(({ id, count }) => [id, count]), [
    ["common-10", 10],
    ["common-50", 50],
    ["common-100", 100],
  ]);

  for (const { count, file } of manifest.dictionaries) {
    const source = readDictionary(file);
    assert.equal(source.cards.length, count, `${file} should contain exactly ${count} cards`);
  }
});

test("each default dataset has unique romaji and imports with hiragana and English meanings", () => {
  for (const { count, file } of manifest.dictionaries) {
    const imported = parseImportedDictionary(readDictionary(file), (index) => `${file}-${index}`);
    assert.equal(new Set(imported.map(({ japanese }) => japanese)).size, count, `${file} has duplicate romaji`);
    assert.ok(imported.every(({ hiragana, meanings }) => hiragana && meanings.length > 0), `${file} has incomplete cards`);
  }
});

test("10- and 50-card options contain the corresponding prefix of the 100-card list", () => {
  const fullList = readDictionary("most-common-100.json").cards;
  for (const count of [10, 50]) {
    assert.deepEqual(readDictionary(`most-common-${count}.json`).cards, fullList.slice(0, count));
    assert.equal(prepareDefaultDictionary(readDictionary("most-common-100.json"), count, (index) => String(index)).length, count);
  }
});

test("the + button opens the default dictionary page and selection confirms before replacing saved cards", () => {
  assert.match(html, /id="add-button"[^>]*aria-label="Browse default dictionaries"/);
  assert.match(app, /addButton\.addEventListener\("click", openDefaultDictionaries\)/);
  assert.match(app, /fetch\("dictionaries\/manifest\.json"/);

  const confirmationIndex = app.indexOf("if (!window.confirm(currentDescription)) return;");
  const fetchIndex = app.indexOf("const response = await fetch(`dictionaries/${encodeURIComponent(dictionary.file)}`);");
  const saveIndex = app.indexOf("if (!saveCards(importedCards)) throw");
  const replaceIndex = app.indexOf("cards = importedCards;", saveIndex);
  assert.ok(confirmationIndex >= 0 && confirmationIndex < fetchIndex);
  assert.ok(fetchIndex < saveIndex && saveIndex < replaceIndex);
  assert.match(app, /Your current dictionary is unchanged; try again/);
});

test("source attribution is a separated paragraph below the loading instructions", () => {
  assert.match(html, /<p class="default-dictionaries-description">[^<]*<\/p>\s*<p class="default-dictionaries-source">[^<]*<a href="https:\/\/travelwithlanguages\.com/);
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
