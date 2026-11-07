const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { gunzipSync } = require("node:zlib");
const path = require("node:path");
const { findWordMeanings } = require("../word-form-lookup.js");

const root = path.resolve(__dirname, "..");
const deck = JSON.parse(gunzipSync(readFileSync(path.join(
  root, "decks/romaji-english-jmdict-2026-11-02.json.gz",
))));
const learnerIndex = JSON.parse(readFileSync(path.join(
  root, "decks/source-data/tkg-entries-index-32c267cb.json",
), "utf8"));
const learnerEntries = new Map(learnerIndex.entries.map((entry) => [entry.id, entry]));

// TKG is independent of this app's JMdict builder. Its basic/core tiers are a
// learner-priority cross-check, not measured probabilities for each homograph.
function source(id, reading, gloss, tier) {
  const entry = learnerEntries.get(id);
  assert(entry, `Missing pinned TKG entry ${id}`);
  const url = `https://www.tkgje.jp/${entry.path.replace(/\.json$/, ".html")}`;
  assert.equal(entry.reading, reading, url);
  assert.match(entry.gloss, gloss, url);
  assert.equal(entry.vocabulary_tier, tier, url);
  return url;
}

function position(meanings, pattern) {
  return meanings.findIndex((meaning) => pattern.test(meaning));
}

const commonInflections = [
  ["shite", "00392_suru", "する", /to do/i, "basic", /^te-form of suru — to do\b/i],
  ["matte", "00469_matsu", "まつ", /to wait/i, "basic", /^te-form of matsu — to wait\b/i],
  ["kitta", "02693_kiru", "きる", /to cut/i, "basic", /^past form of kiru — to cut\b/i],
];
for (const [form, id, reading, gloss, tier, expected] of commonInflections) {
  test(`${form} leads with its common inflection`, () => {
    const url = source(id, reading, gloss, tier);
    const meanings = findWordMeanings(form, deck);
    assert.match(meanings[0] || "", expected,
      `${form} should lead with its common inflection; got ${JSON.stringify(meanings)}; reference: ${url}`);
  });
}

test("hashi favors its core bridge and chopsticks meanings", () => {
  const bridge = source("02163_hashi", "はし", /^bridge$/i, "core");
  const chopsticks = source("01026_hashi", "はし", /^chopsticks$/i, "core");
  const meanings = findWordMeanings("hashi", deck);
  const bridgeAt = position(meanings, /^bridge$/i);
  const chopsticksAt = position(meanings, /^chopsticks$/i);
  const lovelyAt = position(meanings, /^lovely$/i);
  assert(bridgeAt >= 0 && chopsticksAt >= 0,
    `Both core homographs should fit in the popup; got ${JSON.stringify(meanings)}; references: ${bridge}, ${chopsticks}`);
  assert([bridgeAt, chopsticksAt].includes(0),
    `A core homograph should rank first; got ${JSON.stringify(meanings)}; references: ${bridge}, ${chopsticks}`);
  assert(lovelyAt < 0 || (bridgeAt < lovelyAt && chopsticksAt < lovelyAt),
    `The core homographs should outrank lovely; got ${JSON.stringify(meanings)}; references: ${bridge}, ${chopsticks}`);
});

test("ame favors basic rain and candy over the imperative of knit", () => {
  const rain = source("00583_ame", "あめ", /^rain$/i, "basic");
  const candy = source("00687_ame", "あめ", /^candy$/i, "basic");
  const knit = source("00002_amu", "あむ", /to knit/i, "general");
  const meanings = findWordMeanings("ame", deck);
  const rainAt = position(meanings, /^rain$/i);
  const candyAt = position(meanings, /^(?:candy|\(hard\) candy)$/i);
  const knitAt = position(meanings, /^imperative form of amu — to knit\b/i);
  assert(rainAt >= 0 && candyAt >= 0 && knitAt >= 0,
    `Expected all three meanings in the popup; got ${JSON.stringify(meanings)}; references: ${rain}, ${candy}, ${knit}`);
  assert([rainAt, candyAt].includes(0) && rainAt < knitAt && candyAt < knitAt,
    `Basic nouns should precede the imperative; got ${JSON.stringify(meanings)}; references: ${rain}, ${candy}, ${knit}`);
});

test("ha leads with the topic marker and retains basic tooth and leaf", () => {
  const topic = source("00079_ha", "は", /^topic marker$/i, "basic");
  const tooth = source("00778_ha", "は", /^tooth, teeth$/i, "basic");
  const leaf = source("02241_ha", "は", /^leaf, leaves$/i, "basic");
  const meanings = findWordMeanings("ha", deck);
  assert.match(meanings[0] || "", /topic/i,
    `The topic marker should lead; got ${JSON.stringify(meanings)}; reference: ${topic}`);
  assert(position(meanings, /^tooth$/i) > 0 && position(meanings, /^leaf$/i) > 0,
    `Both basic nouns should remain visible; got ${JSON.stringify(meanings)}; references: ${tooth}, ${leaf}`);
});
