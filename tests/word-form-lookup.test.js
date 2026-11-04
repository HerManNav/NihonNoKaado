const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { gunzipSync } = require("node:zlib");
const path = require("node:path");
const { findWordMeanings } = require("../word-form-lookup.js");

const dictionary = JSON.parse(gunzipSync(readFileSync(path.join(__dirname, "../dictionaries/romaji-english-jmdict-2026-11-02.json.gz"))));

test("identifies inflections while retaining direct homograph meanings", () => {
  assert.match(findWordMeanings("shita", dictionary)[0], /^past form of suru — to do/);
  assert(findWordMeanings("shita", dictionary).includes("tongue"));
  assert.match(findWordMeanings("Chikazuite", dictionary)[0], /^te-form of chikazuku — to approach/);
  assert.match(findWordMeanings("kita", dictionary)[0], /^past form of kuru/);
});

test("identifies common negative and polite verb forms", () => {
  assert.match(findWordMeanings("kakanakatta", dictionary)[0], /^past negative form of kaku — to write/);
  assert.match(findWordMeanings("tabemashita", dictionary)[0], /^polite past form of taberu — to eat/);
  assert.match(findWordMeanings("itte", dictionary)[0], /^te-form of iku — to go/);
});

test("identifies suru nouns, noun copula, adjectives, and plural forms", () => {
  assert.match(findWordMeanings("benkyoushita", dictionary)[0], /^past form of benkyou suru/);
  assert.match(findWordMeanings("shita", dictionary, "benkyou")[0], /^past form of benkyou suru/);
  assert.match(findWordMeanings("gakuseidatta", dictionary)[0], /^past copula form of gakusei/);
  assert.match(findWordMeanings("shizukadatta", dictionary)[0], /^past na-adjective form of shizuka/);
  assert.match(findWordMeanings("watashitachi", dictionary)[0], /^we$/);
});

test("ranks common meanings first and retains other senses", () => {
  assert.equal(findWordMeanings("raishuu", dictionary)[0], "next week");
  assert.equal(findWordMeanings("ha", dictionary)[0], "indicates sentence topic");
  assert.equal(findWordMeanings("wa", dictionary)[0], "indicates sentence topic");
  assert(dictionary.lookup.ha.includes("feather"));
});
