const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { prepareDefaultDeck, serializeDeck, parseImportedDeck } = require("../deck-core.js");

const root = join(__dirname, "..");
const read = (file) => JSON.parse(readFileSync(join(root, "decks", file), "utf8"));

test("Spanish starter preserves Japanese text and translates every card, example and annotation", () => {
  const english = read("most-common-50.json");
  const spanish = read("most-common-50-es.json");
  assert.equal(spanish.cards.length, 50);
  for (let i = 0; i < 50; i++) {
    const original = english.cards[i];
    const translated = spanish.cards[i];
    assert.equal(translated.japanese, original.japanese);
    assert.equal(translated.hiragana, original.hiragana);
    assert.ok(translated.english.trim());
    const example = translated.examples[0];
    assert.equal(example.romaji, original.examples[0].romaji);
    assert.equal(example.hiragana, original.examples[0].hiragana);
    assert.ok(example.english.trim());
    assert.equal(example.wordMeanings.length, original.examples[0].wordMeanings.length);
    example.wordMeanings.forEach((word, index) => {
      assert.equal(word.romaji, original.examples[0].wordMeanings[index].romaji);
      assert.ok(word.meaning.trim());
    });
  }
  const cards = prepareDefaultDeck(spanish, 50, (i) => String(i));
  const imported = parseImportedDeck(JSON.parse(serializeDeck(cards, "Spanish")), (i) => String(i));
  assert.equal(imported[0].meanings[0], "nominalizador");
  assert.equal(imported[0].examples[0].english, "Quiero el rojo.");
  assert.equal(imported[0].examples[0].wordMeanings[0].meaning, "rojo");
});

test("only the translated starter declares a Spanish file", () => {
  const entries = read("manifest.json").decks;
  assert.equal(entries[0].spanishFile, "most-common-50-es.json");
  assert.ok(entries.slice(1).every((entry) => !entry.spanishFile));
});
