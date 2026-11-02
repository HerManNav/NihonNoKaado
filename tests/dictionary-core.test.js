const test = require("node:test");
const assert = require("node:assert/strict");
const { createPracticeDeck, parseImportedDictionary, removeCardAt, shuffle } = require("../dictionary-core.js");

test("imports the app's named dictionary format and trims card fields", () => {
  const cards = parseImportedDictionary({
    format: "japanese-cards-dictionary",
    version: 1,
    name: "Travel words",
    cards: [{ japanese: "  eki  ", english: "  station\nExample: eki wa doko desu ka?  " }],
  }, (index) => `test-${index}`);

  assert.deepEqual(cards, [{
    id: "test-0",
    japanese: "eki",
    english: "station\nExample: eki wa doko desu ka?",
  }]);
});

test("imports a plain array for hand-authored dictionaries", () => {
  const cards = parseImportedDictionary([{ japanese: "arigatou", english: "thank you" }], () => "test-id");
  assert.equal(cards[0].id, "test-id");
  assert.equal(cards[0].japanese, "arigatou");
  assert.equal(cards[0].english, "thank you");
});

test("rejects unsupported formats and versions", () => {
  assert.throws(
    () => parseImportedDictionary({ format: "another-app", cards: [] }),
    /different dictionary format/,
  );
  assert.throws(
    () => parseImportedDictionary({ format: "japanese-cards-dictionary", version: 2, cards: [] }),
    /version is not supported/,
  );
});

test("rejects cards without both a Japanese word and English translation", () => {
  assert.throws(() => parseImportedDictionary([{ japanese: "neko", english: " " }]), /Card 1 is missing/);
  assert.throws(() => parseImportedDictionary([{ english: "cat" }]), /Card 1 is missing/);
  assert.throws(() => parseImportedDictionary({ cards: "not an array" }), /does not contain/);
  assert.throws(() => parseImportedDictionary(null), /does not contain/);
});

test("shuffle returns a permutation without changing the source", () => {
  const source = ["a", "b", "c"];
  const shuffled = shuffle(source, () => 0);

  assert.deepEqual(source, ["a", "b", "c"]);
  assert.deepEqual([...shuffled].sort(), [...source].sort());
  assert.notDeepEqual(shuffled, source);
});

test("practice deck has the selected length and avoids repeats before exhausting cards", () => {
  const cards = [{ japanese: "a" }, { japanese: "b" }, { japanese: "c" }];
  const deck = createPracticeDeck(cards, 7, () => 0);

  assert.equal(deck.length, 7);
  assert.ok(deck.every((card) => cards.includes(card)));
  assert.deepEqual(deck.slice(0, 3).sort((a, b) => a.japanese.localeCompare(b.japanese)), cards);
  for (let index = 1; index < deck.length; index += 1) {
    assert.notEqual(deck[index], deck[index - 1]);
  }
});

test("whole-dictionary deck includes every current card exactly once", () => {
  const cards = [{ japanese: "a" }, { japanese: "b" }, { japanese: "c" }];
  const deck = createPracticeDeck(cards, cards.length, () => 0);

  assert.equal(deck.length, cards.length);
  assert.deepEqual([...deck].sort((a, b) => a.japanese.localeCompare(b.japanese)), cards);
});

test("rejects impossible session sizes and empty dictionaries", () => {
  assert.throws(() => createPracticeDeck([], 1), /empty dictionary/);
  assert.throws(() => createPracticeDeck([{ japanese: "a" }], -1), /non-negative integer/);
  assert.deepEqual(createPracticeDeck([], 0), []);
});

test("removes the selected card without changing the original list", () => {
  const cards = [{ japanese: "a" }, { japanese: "b" }, { japanese: "c" }];

  assert.deepEqual(removeCardAt(cards, 1), [{ japanese: "a" }, { japanese: "c" }]);
  assert.deepEqual(cards, [{ japanese: "a" }, { japanese: "b" }, { japanese: "c" }]);
  assert.deepEqual(removeCardAt(cards, 99), cards);
});
