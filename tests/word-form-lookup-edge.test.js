const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, statSync } = require("node:fs");
const { gunzipSync } = require("node:zlib");
const path = require("node:path");
const { findWordMeanings } = require("../word-form-lookup.js");

const dictionaryPath = path.join(__dirname, "../dictionaries/romaji-english-jmdict-2026-11-02.json.gz");
const dictionary = JSON.parse(gunzipSync(readFileSync(dictionaryPath)));

test("compiled lookup retains source data and stays below the hosting file limit", () => {
  assert.equal(dictionary.format, 4);
  assert.equal(dictionary.dictDate, "2026-11-02");
  assert(Object.keys(dictionary.lookup).length > 200_000);
  assert(Object.keys(dictionary.lemmas).length > 30_000);
  assert(dictionary.formRules.length > 500);
  assert(dictionary.lookup.ha.includes("feather"));
  assert(dictionary.lookup.raishuu.includes("(incoming) attack"));
  assert(statSync(dictionaryPath).size < 25_000_000);
  assert(statSync(path.join(__dirname, "../dictionaries/source-data/jmdict-eng-3.6.2+20261102210542.json.tgz")).size > 10_000_000);
  assert(statSync(path.join(__dirname, "../dictionaries/source-data/ja_full-OpenSubtitles2018.txt")).size > 100_000);
});

test("lookup chooses common meanings and keeps distinct homographs visible", () => {
  assert.equal(findWordMeanings("raishuu", dictionary)[0], "next week");
  assert.equal(findWordMeanings("suru", dictionary)[0], "to do");
  assert.equal(findWordMeanings("watashi", dictionary)[0], "I");
  assert.equal(findWordMeanings("wa", dictionary)[0], "indicates sentence topic");
  assert.equal(findWordMeanings("ni", dictionary)[0], "at");
  assert.equal(findWordMeanings("ga", dictionary)[0], "indicates the subject of a sentence");
  assert.match(findWordMeanings("e", dictionary)[0], /^to$/);
  assert.match(findWordMeanings("wo", dictionary)[0], /^indicates direct object/);
  const shita = findWordMeanings("shita", dictionary);
  assert.match(shita[0], /^past form of suru — to do/);
  assert(shita.includes("tongue"));
  assert(shita.includes("below"));
});

test("multiple form classes report the right base word and grammatical role", () => {
  assert.match(findWordMeanings("CHIKAZUITE", dictionary)[0], /^te-form of chikazuku — to approach/);
  assert.match(findWordMeanings("tabeta", dictionary)[0], /^past form of taberu — to eat/);
  assert.match(findWordMeanings("tabemashita", dictionary)[0], /^polite past form of taberu — to eat/);
  assert.match(findWordMeanings("kakanakatta", dictionary)[0], /^past negative form of kaku — to write/);
  assert.match(findWordMeanings("kakeba", dictionary)[0], /^conditional -ba form of kaku/);
  assert(findWordMeanings("kakareru", dictionary).some((meaning) => /^passive form of kaku — to write/.test(meaning)));
  assert.match(findWordMeanings("tabesaseru", dictionary)[0], /^causative form of taberu/);
  assert.match(findWordMeanings("yokatta", dictionary)[0], /^past adjective form of yoi/);
  assert.match(findWordMeanings("shizukadatta", dictionary)[0], /^past na-adjective form of shizuka/);
  assert.match(findWordMeanings("benkyoushita", dictionary)[0], /^past form of benkyou suru/);
  assert.match(findWordMeanings("gakuseidatta", dictionary)[0], /^past copula form of gakusei/);
});

test("previous-word context recognizes spaced compounds and does not invent unrelated ones", () => {
  assert.match(findWordMeanings("shita", dictionary, "benkyou")[0], /^past form of benkyou suru/);
  assert.match(findWordMeanings("datta", dictionary, "gakusei")[0], /^past copula form of gakusei/);
  assert.match(findWordMeanings("tachi", dictionary, "kodomo")[0], /^plural\/group suffix of kodomo/);
  assert(!findWordMeanings("shita", dictionary, "watashi").some((meaning) => meaning.includes("watashi suru")));
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
