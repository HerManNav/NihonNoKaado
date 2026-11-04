const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { gunzipSync } = require("node:zlib");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { findWordMeanings } = require("../word-form-lookup.js");

const dictionary = JSON.parse(gunzipSync(readFileSync(path.join(
  __dirname, "../dictionaries/romaji-english-jmdict-2026-11-02.json.gz",
))));
const inflections = import(pathToFileURL(path.join(__dirname, "../scripts/japanese-inflections.mjs")));

// Amherst College lists these as verbs without an ordinary potential form:
// https://wtawa.people.amherst.edu/jvrules/index.php?form=potential
test("state verb exceptions do not invent potential translations", async () => {
  const { generateInflections } = await inflections;
  for (const [lemma, tag] of [
    ["aru", "v5r-i"], ["wakaru", "v5r"],
    ["amegafuru", "v5r"], ["kudasaru", "v5aru"],
  ]) {
    assert(!generateInflections(lemma, [tag]).some(({ label }) => /potential/.test(label)), lemma);
  }
  for (const [form, lemma] of [
    ["areru", "aru"], ["wakareru", "wakaru"],
    ["amegafureru", "amegafuru"], ["kudasaeru", "kudasaru"],
  ]) {
    assert(!findWordMeanings(form, dictionary).some((meaning) => meaning.includes(`potential form of ${lemma}`)), form);
  }
  // 分かれる and 別れる still have legitimate direct meanings.
  assert(findWordMeanings("wakareru", dictionary).some((meaning) => /to branch|to part/.test(meaning)));
});

// Amherst College specifies the -い- stem before ます for these honorific verbs:
// https://wtawa.people.amherst.edu/jvrules/index.php?form=stemmasu
test("honorific verbs use their documented polite stems", async () => {
  const { generateInflections } = await inflections;
  for (const [lemma, tag, polite] of [
    ["irassharu", "v5aru", "irasshaimasu"],
    ["ossharu", "v5aru", "osshaimasu"],
    ["kudasaru", "v5aru", "kudasaimasu"],
    ["nasaru", "v5aru", "nasaimasu"],
    ["gozaru", "v5r", "gozaimasu"],
  ]) {
    assert(generateInflections(lemma, [tag]).some(({ romaji, label }) => romaji === polite && label === "polite form"), lemma);
    assert(findWordMeanings(polite, dictionary).some((meaning) => meaning.includes(`polite form of ${lemma}`)), polite);
  }
  assert(!findWordMeanings("gozarimasu", dictionary).some((meaning) => meaning.includes("polite form of gozaru")));
});

// Umeda, "Interpretations of Bare Nouns and the Plural Marker -tachi",
// section 2.2, documents its animate-reference restriction and examples:
// https://gpwu.repo.nii.ac.jp/record/53/files/Y14_UMEDA.pdf
test("group suffixes do not turn ordinary inanimate nouns into plurals", () => {
  for (const base of ["ringo", "hon", "sore"]) {
    assert(!findWordMeanings(`${base}tachi`, dictionary).some((meaning) => meaning.includes(`suffix of ${base}`)), base);
    assert(!findWordMeanings("tachi", dictionary, base).some((meaning) => meaning.includes(`suffix of ${base}`)), base);
  }
  for (const base of ["kodomo", "neko", "watashi"]) {
    assert(findWordMeanings(`${base}tachi`, dictionary).some((meaning) => meaning.includes(`suffix of ${base}`)), base);
  }
  assert(!findWordMeanings("nekogata", dictionary).some((meaning) => meaning.includes("suffix of neko")));
});

// TKG identifies 死ぬ → 死んだ / 死んで as the past and te forms:
// https://www.tkgje.jp/entries/00500/00669_shinu.html
test("a real verb form outranks an accidental noun plus copula split", () => {
  assert.match(findWordMeanings("shinda", dictionary)[0], /^past form of shinu — to die/);
  assert.match(findWordMeanings("shinde", dictionary)[0], /^te-form of shinu — to die/);
  assert.match(findWordMeanings("gakuseidatta", dictionary)[0], /^past copula form of gakusei/);
  assert.match(findWordMeanings("datta", dictionary, "gakusei")[0], /^past copula form of gakusei/);
});
