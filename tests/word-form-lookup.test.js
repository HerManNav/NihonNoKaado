const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { gunzipSync } = require("node:zlib");
const path = require("node:path");
const { findWordMeanings } = require("../word-form-lookup.js");

const deck = JSON.parse(gunzipSync(readFileSync(path.join(__dirname, "../decks/romaji-english-jmdict-2026-11-02.json.gz"))));

test("identifies inflections while retaining direct homograph meanings", () => {
  assert.match(findWordMeanings("shita", deck)[0], /^past form of suru — to do/);
  assert(findWordMeanings("shita", deck).includes("tongue"));
  assert.match(findWordMeanings("Chikazuite", deck)[0], /^te-form of chikazuku — to approach/);
  assert.match(findWordMeanings("kita", deck)[0], /^past form of kuru/);
});

test("identifies common negative and polite verb forms", () => {
  assert.match(findWordMeanings("kakanakatta", deck)[0], /^past negative form of kaku — to write/);
  assert.match(findWordMeanings("tabemashita", deck)[0], /^polite past form of taberu — to eat/);
  assert.match(findWordMeanings("itte", deck)[0], /^te-form of iku — to go/);
});

test("identifies suru nouns, noun copula, adjectives, and plural forms", () => {
  assert.match(findWordMeanings("benkyoushita", deck)[0], /^past form of benkyou suru/);
  assert.match(findWordMeanings("shita", deck, "benkyou")[0], /^past form of benkyou suru/);
  assert.match(findWordMeanings("gakuseidatta", deck)[0], /^past copula form of gakusei/);
  assert.match(findWordMeanings("shizukadatta", deck)[0], /^past na-adjective form of shizuka/);
  assert.match(findWordMeanings("watashitachi", deck)[0], /^we$/);
});

test("ranks common meanings first and retains other senses", () => {
  assert.equal(findWordMeanings("raishuu", deck)[0], "next week");
  assert.equal(findWordMeanings("ha", deck)[0], "indicates sentence topic");
  assert.equal(findWordMeanings("wa", deck)[0], "indicates sentence topic");
  assert(deck.lookup.ha.includes("feather"));
});
