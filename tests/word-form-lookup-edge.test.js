const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, statSync } = require("node:fs");
const { gunzipSync } = require("node:zlib");
const path = require("node:path");
const { findWordMeanings } = require("../word-form-lookup.js");

const deckPath = path.join(__dirname, "../decks/romaji-english-jmdict-2026-11-02.json.gz");
const deck = JSON.parse(gunzipSync(readFileSync(deckPath)));

test("compiled lookup retains source data and stays below the hosting file limit", () => {
  assert.equal(deck.format, 5);
  assert.equal(deck.dictDate, "2026-11-02");
  assert(Object.keys(deck.lookup).length > 200_000);
  assert(Object.keys(deck.lemmas).length > 30_000);
  assert(deck.formRules.length > 500);
  assert(deck.lookup.ha.includes("feather"));
  assert(deck.lookup.raishuu.includes("(incoming) attack"));
  assert(statSync(deckPath).size < 25_000_000);
  assert(statSync(path.join(__dirname, "../decks/source-data/jmdict-eng-3.6.2+20261102210542.json.tgz")).size > 10_000_000);
  assert(statSync(path.join(__dirname, "../decks/source-data/ja_full-OpenSubtitles2018.txt")).size > 100_000);
  assert(statSync(path.join(__dirname, "../decks/source-data/tkg-entries-index-32c267cb.json")).size < 25_000_000);
});

test("lookup chooses common meanings and keeps distinct homographs visible", () => {
  assert.equal(findWordMeanings("raishuu", deck)[0], "next week");
  assert.equal(findWordMeanings("suru", deck)[0], "to do");
  assert.equal(findWordMeanings("watashi", deck)[0], "I");
  assert.equal(findWordMeanings("wa", deck)[0], "indicates sentence topic");
  assert.equal(findWordMeanings("ni", deck)[0], "at");
  assert.equal(findWordMeanings("ga", deck)[0], "indicates the subject of a sentence");
  assert.match(findWordMeanings("e", deck)[0], /^to$/);
  assert.match(findWordMeanings("wo", deck)[0], /^indicates direct object/);
  const shita = findWordMeanings("shita", deck);
  assert.match(shita[0], /^past form of suru — to do/);
  assert(shita.includes("tongue"));
  assert(shita.includes("below"));
});

test("multiple form classes report the right base word and grammatical role", () => {
  assert.match(findWordMeanings("CHIKAZUITE", deck)[0], /^te-form of chikazuku — to approach/);
  assert.match(findWordMeanings("tabeta", deck)[0], /^past form of taberu — to eat/);
  assert.match(findWordMeanings("tabemashita", deck)[0], /^polite past form of taberu — to eat/);
  assert.match(findWordMeanings("kakanakatta", deck)[0], /^past negative form of kaku — to write/);
  assert.match(findWordMeanings("kakeba", deck)[0], /^conditional -ba form of kaku/);
  assert(findWordMeanings("kakareru", deck).some((meaning) => /^passive form of kaku — to write/.test(meaning)));
  assert.match(findWordMeanings("tabesaseru", deck)[0], /^causative form of taberu/);
  assert.match(findWordMeanings("yokatta", deck)[0], /^past adjective form of yoi/);
  assert.match(findWordMeanings("shizukadatta", deck)[0], /^past na-adjective form of shizuka/);
  assert.match(findWordMeanings("benkyoushita", deck)[0], /^past form of benkyou suru/);
  assert.match(findWordMeanings("gakuseidatta", deck)[0], /^past copula form of gakusei/);
});

test("previous-word context recognizes spaced compounds and does not invent unrelated ones", () => {
  assert.match(findWordMeanings("shita", deck, "benkyou")[0], /^past form of benkyou suru/);
  assert.match(findWordMeanings("datta", deck, "gakusei")[0], /^past copula form of gakusei/);
  assert.match(findWordMeanings("tachi", deck, "kodomo")[0], /^plural\/group suffix of kodomo/);
  assert(!findWordMeanings("shita", deck, "watashi").some((meaning) => meaning.includes("watashi suru")));
});

test("direct fallback, de-duplication, result cap, and POS checks work on small input", () => {
  const data = {
    lookup: { shita: ["tongue"], "shin'you": ["credit"], long: ["a", "b", "c", "d", "e"] },
    heads: { shita: [["tongue", 10], ["tongue", 8], ["below", 5]] },
    lemmas: { suru: [["vs-i", "to do", 20]], chikazuku: [["n", "approach", 20]], taberu: [["v1", "to eat", 20]] },
    formRules: [["shita", "suru", "vs-i", "past form"], ["ite", "ku", "v5k", "te-form"], ["", "ru", "v1", "verb stem"]],
    irregularForms: {}, nounKeys: [], pronounKeys: [],
  };
  assert.deepEqual(findWordMeanings(" SHITA ", data), ["past form of suru — to do", "tongue", "below"]);
  assert.deepEqual(findWordMeanings("chikazuite", data), []);
  assert.deepEqual(findWordMeanings("tabe", data), ["verb stem of taberu — to eat"]);
  assert.deepEqual(findWordMeanings("shin’you", data), ["credit"]);
  assert.deepEqual(findWordMeanings("long", data), ["a", "b", "c", "d"]);
  assert.deepEqual(findWordMeanings("unknown", data), []);
});
