const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {gunzipSync} = require("node:zlib");
const core = require("../deck-core.js");
const {findWordMeanings} = require("../word-form-lookup.js");
const {createService, createController} = require("../example-suggestions.js");
const {sentenceKey} = require("../example-search.js");
const corpus = require("../decks/example-suggestions.json");
const loadPart = part => JSON.parse(fs.readFileSync(path.join(__dirname, '../decks', part.file), 'utf8'));
function* records() {
  if (Array.isArray(corpus.records)) yield* corpus.records;
  else for (const part of corpus.parts) yield* loadPart(part).records;
}
function findRecord(predicate) { for (const row of records()) if (predicate(row)) return row; }
let lookup;
const service = createService({loadCorpus: () => corpus, loadPart, normalizeWordMeanings: core.normalizeWordMeanings,
  findWordMeanings, loadLookup: () => lookup ||= JSON.parse(gunzipSync(fs.readFileSync(
    path.join(__dirname, "../decks/romaji-english-jmdict-2026-11-02.json.gz"))))});

test("suggestions distinguish homographs by the supplied meaning", async () => {
  for (const [japanese, hiragana, meaning, expected] of [
    ["hashi", "はし", "bridge", /bridge/i], ["hashi", "はし", "chopsticks", /chopsticks/i],
    ["kami", "かみ", "paper", /paper/i], ["kami", "かみ", "hair", /hair/i],
    ["kaku", "かく", "to write", /write|writing/i], ["kaku", "かく", "to draw", /draw/i],
  ]) {
    const result = await service.suggest({japanese, hiragana, meaning});
    assert.ok(result, `${japanese}: ${meaning}`);
    assert.match(result.english, expected);
    assert.ok(core.normalizeWordMeanings(result.wordMeanings, result.romaji));
  }
  assert.equal(await service.suggest({japanese: "hashi", hiragana: "はし", meaning: "computer"}), null);
  assert.equal(await service.suggest({japanese: "hashi", hiragana: "ねこ", meaning: "bridge"}), null);
});

test("suggestions respect the selected language, capitalization, and kana script", async () => {
  const result = await service.suggest({japanese: "TABERU", hiragana: "タベル", meaning: "eat"});
  assert.match(result.english, /eat/);
  const spanish = findRecord(row => row.language === "es" && row.japanese === "taberu");
  const translated = await service.suggest({...spanish, language: "es"});
  assert.equal(translated.english, spanish.example.english);
});

test("sentence exclusions leave the default top result stable and return distinct next matches", async () => {
  const context = {japanese: "taberu", hiragana: "たべる", meaning: "to eat"};
  const first = await service.suggest(context);
  assert.ok(first);
  assert.deepEqual(await service.suggest(context, []), first);
  const results = await service.allSuggestions(context);
  assert.ok(results.length >= 3, JSON.stringify(results.map(example => example.romaji)));
  assert.equal(results[0].romaji, first.romaji);
  assert.equal(new Set(results.map(example => sentenceKey(example.romaji))).size, results.length);
  for (let index = 0; index < results.length; index++) {
    assert.deepEqual(await service.suggest(context, results.slice(0, index).map(example => example.romaji)), results[index]);
  }
  assert.equal(await service.suggest(context, results.map(example => example.romaji)), null);
});

test("every shipped suggestion has aligned word meanings and survives JSON export/import", () => {
  for (const row of records()) {
    assert.ok(row.japanese && row.hiragana && row.meaning && row.example.english);
    assert.ok(core.normalizeWordMeanings(row.example.wordMeanings, row.example.romaji), row.example.romaji);
  }
  const row = findRecord(row => row.japanese === "taberu" && row.language === "en");
  const card = {id: "new", japanese: row.japanese, hiragana: row.hiragana,
    english: row.meaning, meanings: [row.meaning], examples: [row.example]};
  const restored = core.parseImportedDeck(JSON.parse(core.serializeDeck([card])));
  assert.deepEqual(restored[0].examples[0].wordMeanings, row.example.wordMeanings);
});

test("custom examples are analyzed using the card sense, translation, particles, and inflections", async () => {
  const result = await service.analyze({romaji: "watashi wa hashi wo tsukaimasu.", hiragana: "わたしははしをつかいます。", english: "I use chopsticks."},
    {japanese: "hashi", meaning: "chopsticks"});
  assert.equal(result.wordMeanings.length, 5);
  assert.equal(result.wordMeanings[1].meaning, "topic marker");
  assert.equal(result.wordMeanings[2].meaning, "chopsticks");
  assert.match(result.wordMeanings[4].meaning, /use|using/);
  assert.ok(core.normalizeWordMeanings(result.wordMeanings, result.romaji));
  const unknown = await service.analyze({romaji: "qzqx", hiragana: "qzqx", english: "test"}, {japanese: "test", meaning: "test"});
  assert.match(unknown.wordMeanings[0].meaning, /unavailable/);
});

test("known custom sentences reuse reviewed contextual annotations", async () => {
  const row = findRecord(row => row.language === "en" && row.japanese === "no");
  const {wordMeanings, ...example} = row.example;
  assert.deepEqual((await service.analyze(example, row)).wordMeanings, wordMeanings);
});

function formHarness(suggest) {
  const fields = [0, 1, 2].map(() => ({value: "", dataset: {}}));
  const context = {japanese: "", hiragana: "", meaning: ""};
  let active = true;
  const statuses = [];
  const controller = createController({fields, getContext: () => context, suggest,
    setStatus: (message, state) => statuses.push({message, state}), isActive: () => active});
  const fill = () => Object.assign(context, {japanese: "hashi", hiragana: "はし", meaning: "bridge"});
  return {fields, context, controller, statuses, fill, leave: () => { active = false; }};
}
const suggested = {romaji: "hashi wo wataru.", hiragana: "はしをわたる。", english: "To cross a bridge."};

test("all three fields stay disabled until word, hiragana, and meaning are filled", () => {
  const h = formHarness(() => suggested);
  h.controller.refresh();
  assert.ok(h.fields.every(field => field.disabled));
  h.context.japanese = "hashi"; h.context.hiragana = "はし";
  h.controller.refresh(); h.controller.warn();
  assert.equal(h.statuses.at(-1).state, "warning");
  h.fill(); h.controller.refresh();
  assert.ok(h.fields.every(field => !field.disabled));
  h.context.meaning = " "; h.controller.refresh();
  assert.ok(h.fields.every(field => field.disabled));
});

test("focusing suggests once and never overwrites any partially filled example", async () => {
  for (const index of [0, 1, 2]) {
    let calls = 0;
    const h = formHarness(() => { calls++; return suggested; });
    h.fill(); h.controller.refresh(); h.fields[index].value = "My example";
    await h.controller.focus();
    assert.equal(calls, 0); assert.equal(h.fields[index].value, "My example");
  }
  let calls = 0;
  const h = formHarness(() => { calls++; return suggested; }); h.fill(); h.controller.refresh();
  await Promise.all([h.controller.focus(), h.controller.focus()]);
  assert.deepEqual(h.fields.map(field => field.value), Object.values(suggested));
  await h.controller.focus(); assert.equal(calls, 1);
});

test("late suggestions cannot overwrite typing, changed meanings, cleared values, or a closed form", async () => {
  for (const change of [h => { h.fields[0].value = "own text"; },
    h => { h.context.meaning = "chopsticks"; h.controller.refresh(); },
    h => { h.fields[0].value = "x"; h.controller.refresh(); h.fields[0].value = ""; },
    h => h.leave()]) {
    let resolve;
    const h = formHarness(() => new Promise(done => { resolve = done; }));
    h.fill(); h.controller.refresh(); const pending = h.controller.focus();
    await Promise.resolve(); change(h); resolve(suggested); await pending;
    assert.equal(h.fields[2].value, "");
  }
});

test("a failed suggestion can be retried and no-match leaves manual entry available", async () => {
  let calls = 0;
  const h = formHarness(() => { if (!calls++) throw new Error("offline"); return null; });
  h.fill(); h.controller.refresh(); await h.controller.focus();
  assert.equal(h.statuses.at(-1).state, "error");
  await h.controller.focus(); assert.equal(h.statuses.at(-1).state, "empty");
  assert.ok(h.fields.every(field => !field.disabled && field.value === ""));
});

test("refreshing an unchanged group does not cancel its pending suggestion", async () => {
  let resolve;
  const h = formHarness(() => new Promise(done => { resolve = done; }));
  h.fill(); h.controller.refresh(); const pending = h.controller.focus();
  await Promise.resolve(); h.controller.refresh(); resolve(suggested); await pending;
  assert.equal(h.fields[2].value, suggested.english);
});
