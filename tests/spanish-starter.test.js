const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { prepareDefaultDeck, serializeDeck, parseImportedDeck } = require("../deck-core.js");

const root = join(__dirname, "..");
const read = (file) => JSON.parse(readFileSync(join(root, "decks", file), "utf8"));

for (const count of [50, 100, 500, 1000, 2000]) test(`${count}-card Spanish starter preserves Japanese text and has complete translations`, () => {
  const english = read(`english/most-common-${count}.json`);
  const spanish = read(`spanish/most-common-${count}-es.json`);
  assert.equal(spanish.cards.length, count);
  for (let i = 0; i < count; i++) {
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
      assert.equal(word.entryId, original.examples[0].wordMeanings[index].entryId);
      assert.equal(word.senseNumber, original.examples[0].wordMeanings[index].senseNumber);
      assert.ok(word.meaning.trim());
      assert.doesNotMatch(word.meaning, /\b(polite|compound|marker|adjective|continuing)\b|-te form/);
    });
  }
  const cards = prepareDefaultDeck(spanish, count, (i) => String(i));
  const imported = parseImportedDeck(JSON.parse(serializeDeck(cards, "Spanish")), (i) => String(i));
  assert.equal(imported[0].meanings[0], "nominalizador");
  assert.equal(imported[0].examples[0].english, "Quiero el rojo.");
  assert.equal(imported[0].examples[0].wordMeanings[0].meaning, "rojo");
});

test("every Spanish deck is an exact prefix of the translated 2,000-card deck", () => {
  const entries = read("manifest.json").decks;
  assert.equal(entries[0].spanishFile, "spanish/most-common-50-es.json");
  assert.equal(entries[1].spanishFile, "spanish/most-common-100-es.json");
  const master = read("spanish/most-common-2000-es.json").cards;
  for (const entry of entries) {
    assert.equal(entry.spanishFile, `spanish/most-common-${entry.count}-es.json`);
    assert.deepEqual(read(entry.spanishFile).cards, master.slice(0, entry.count));
  }
});

test("reviewed homographs and sentences use their contextual Spanish meanings", () => {
  const cards = read("spanish/most-common-2000-es.json").cards;
  const card = (key) => cards.find((row) => row.japanese === key);
  assert.equal(card("toushu").english, "lanzador (béisbol)");
  assert.equal(card("eigo").english, "inglés");
  assert.equal(card("enshutsu").examples[0].english, "Fue una obra de teatro con una dirección maravillosa.");
  assert.equal(card("ginkou").examples[0].english, "¿Hasta qué hora está abierto el banco?");
  assert.equal(card("sozai").examples[0].wordMeanings.find((w) => w.romaji === "karui").meaning, "ligero");
  assert.equal(card("fushi").examples[0].wordMeanings.find((w) => w.romaji === "fushi").meaning, "nudo (del bambú)");
});
