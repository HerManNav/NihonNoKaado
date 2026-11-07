const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, statSync } = require("node:fs");
const path = require("node:path");

const deckDirectory = path.join(__dirname, "../decks");
const specs = [
  { size: 50, visibleTokens: 212 },
  { size: 100, visibleTokens: 453 },
  { size: 500, visibleTokens: 2365 },
  { size: 1000, visibleTokens: 4700 },
  { size: 2000, visibleTokens: 9565 },
];
// Keep this identical to the romaji token splitter in app.js. Punctuation and
// whitespace are not popup targets; apostrophes within a word are retained.
const visibleTokens = (romaji) => String(romaji || "").match(/[A-Za-z]+(?:['’][A-Za-z]+)*/g) || [];
const files = new Map(specs.map(({ size }) => [size, path.join(deckDirectory, `most-common-${size}.json`)]));
const decks = new Map([...files].map(([size, file]) => [size, JSON.parse(readFileSync(file, "utf8"))]));
const exampleKey = (example) => [example.romaji, example.hiragana, example.english].join("\0");

for (const { size, visibleTokens: expectedTokenCount } of specs) {
  test(`${size}-word deck annotates every visible example word exactly once`, () => {
    const cards = decks.get(size).cards;
    assert.equal(cards.length, size);
    let tokenCount = 0;
    const errors = [];
    for (const [cardIndex, card] of cards.entries()) {
      if (card.examples?.length !== 1) {
        errors.push(`Card ${cardIndex + 1} (${card.japanese}) needs one example`);
        continue;
      }
      const example = card.examples[0];
      const tokens = visibleTokens(example.romaji);
      const location = `${size}-word deck, card ${cardIndex + 1} (${card.japanese}): ${example.romaji}`;
      tokenCount += tokens.length;
      if (!tokens.length) errors.push(`${location} has no visible romaji words`);
      if (!Array.isArray(example.wordMeanings)) {
        errors.push(`${location} has no wordMeanings array`);
        continue;
      }
      if (example.wordMeanings.length !== tokens.length) {
        errors.push(`${location} has ${tokens.length} visible words but ${example.wordMeanings.length} annotations`);
        continue;
      }
      for (const [tokenIndex, token] of tokens.entries()) {
        const annotation = example.wordMeanings[tokenIndex];
        if (!annotation || typeof annotation !== "object" || Array.isArray(annotation)) {
          errors.push(`${location}, token ${tokenIndex + 1} (${token}) needs one annotation object`);
          continue;
        }
        if (annotation.romaji !== token) errors.push(`${location}, token ${tokenIndex + 1}: annotation is stale or out of order`);
        if (typeof annotation.meaning !== "string" || !annotation.meaning.trim()
          || annotation.meaning !== annotation.meaning.trim()) {
          errors.push(`${location}, token ${tokenIndex + 1} (${token}) needs one trimmed English meaning`);
        } else if (/meaning needs review|unknown translation|no translation/i.test(annotation.meaning)) {
          errors.push(`${location}, token ${tokenIndex + 1} (${token}) still has a placeholder meaning`);
        }
        if (annotation.entryId !== undefined) {
          if (typeof annotation.entryId !== "string" || !annotation.entryId.trim()
            || annotation.entryId !== annotation.entryId.trim()) {
            errors.push(`${location}, token ${tokenIndex + 1} has an invalid entryId`);
          }
        }
      }
    }
    assert.equal(tokenCount, expectedTokenCount,
      `${size}-word deck visible token count changed; review segmentation and update this baseline deliberately`);
    assert.equal(errors.length, 0,
      `${size}-word deck has ${errors.length} annotation problems. First 12:\n${errors.slice(0, 12).join("\n")}`);
  });
}

test("annotated 500 and 1000 decks remain exact prefixes of the 2000 deck", () => {
  assert.deepEqual(decks.get(500).cards, decks.get(1000).cards.slice(0, 500));
  assert.deepEqual(decks.get(1000).cards, decks.get(2000).cards.slice(0, 1000));
});

test("annotated 50 deck remains an exact prefix of the 100 deck", () => {
  assert.deepEqual(decks.get(50).cards, decks.get(100).cards.slice(0, 50));
});

test("reused examples have identical contextual annotations across all decks", () => {
  const annotatedBySentence = new Map();
  const uniqueSentences = new Set();
  let tokenOccurrences = 0;
  for (const { size } of specs) {
    for (const card of decks.get(size).cards) {
      const example = card.examples[0];
      const key = exampleKey(example);
      uniqueSentences.add(key);
      tokenOccurrences += visibleTokens(example.romaji).length;
      if (annotatedBySentence.has(key)) {
        assert.deepEqual(example.wordMeanings, annotatedBySentence.get(key),
          `The same example has inconsistent annotations: ${example.romaji}`);
      } else annotatedBySentence.set(key, example.wordMeanings);
    }
  }
  assert.equal(tokenOccurrences, 17295, "Review changed total token coverage across all five decks");
  assert.equal(uniqueSentences.size, 1992, "Review changed unique example count across all five decks");
});

test("every annotated default deck stays below the 25 MB per-file limit", () => {
  for (const [size, file] of files) {
    assert(statSync(file).size < 25_000_000, `${size}-word deck exceeds 25 MB`);
  }
});
