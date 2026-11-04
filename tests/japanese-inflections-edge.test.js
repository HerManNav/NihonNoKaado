const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const modulePromise = import(pathToFileURL(path.join(__dirname, "../scripts/japanese-inflections.mjs")));

function hasForm(forms, romaji, label) {
  assert(forms.some((form) => form.romaji === romaji && form.label === label), `Missing ${romaji} (${label})`);
}

test("godan te and past forms cover every modern ending and the iku exception", async () => {
  const { generateInflections } = await modulePromise;
  const cases = [
    ["kau", "v5u", "katte", "katta"],
    ["tou", "v5u-s", "toute", "touta"],
    ["kaku", "v5k", "kaite", "kaita"],
    ["iku", "v5k-s", "itte", "itta"],
    ["oyogu", "v5g", "oyoide", "oyoida"],
    ["hanasu", "v5s", "hanashite", "hanashita"],
    ["matsu", "v5t", "matte", "matta"],
    ["shinu", "v5n", "shinde", "shinda"],
    ["yobu", "v5b", "yonde", "yonda"],
    ["nomu", "v5m", "nonde", "nonda"],
    ["kaeru", "v5r", "kaette", "kaetta"],
  ];
  for (const [lemma, tag, te, past] of cases) {
    const forms = generateInflections(lemma, [tag]);
    hasForm(forms, te, "te-form");
    hasForm(forms, past, "past form");
  }
});

test("verb paradigms include negative, polite, conditional, voice, and desire forms", async () => {
  const { generateInflections } = await modulePromise;
  const kaku = generateInflections("kaku", ["v5k"]);
  for (const [romaji, label] of [
    ["kakanai", "negative form"],
    ["kakanakatta", "past negative form"],
    ["kakanakute", "negative te-form"],
    ["kakimasu", "polite form"],
    ["kakimashita", "polite past form"],
    ["kakimasen", "polite negative form"],
    ["kakeba", "conditional -ba form"],
    ["kaitara", "conditional -tara form"],
    ["kakeru", "potential form"],
    ["kakareru", "passive form"],
    ["kakaseru", "causative form"],
    ["kakou", "volitional form"],
    ["kakitai", "desiderative form"],
    ["kaiteiru", "te-iru form"],
  ]) hasForm(kaku, romaji, label);

  const taberu = generateInflections("taberu", ["v1"]);
  hasForm(taberu, "tabete", "te-form");
  hasForm(taberu, "tabeta", "past form");
  hasForm(taberu, "tabenai", "negative form");
  hasForm(taberu, "tabesaseru", "causative form");
  hasForm(taberu, "taberareru", "potential form");
  hasForm(taberu, "taberareru", "passive form");
  hasForm(taberu, "tabereru", "colloquial potential form");
});

test("irregular verbs and verbal nouns keep their base forms identifiable", async () => {
  const { generateInflections } = await modulePromise;
  const suru = generateInflections("suru", ["vs-i"]);
  hasForm(suru, "shita", "past form");
  hasForm(suru, "shite", "te-form");
  hasForm(suru, "shinai", "negative form");
  hasForm(suru, "shimasu", "polite form");

  const kuru = generateInflections("kuru", ["vk"]);
  hasForm(kuru, "kita", "past form");
  hasForm(kuru, "kite", "te-form");
  hasForm(kuru, "konai", "negative form");
  hasForm(kuru, "kimasu", "polite form");

  const benkyou = generateInflections("benkyou", ["n", "vs"]);
  hasForm(benkyou, "benkyoushita", "past form");
  hasForm(benkyou, "benkyousuru", "suru verb (dictionary form)");
  hasForm(generateInflections("aru", ["v5r-i"]), "nai", "negative form");
});

test("adjectives and copulas include their common inflections", async () => {
  const { generateInflections } = await modulePromise;
  const atsui = generateInflections("atsui", ["adj-i"]);
  hasForm(atsui, "atsukatta", "past adjective form");
  hasForm(atsui, "atsukunai", "negative adjective form");
  hasForm(atsui, "atsukute", "adjective te-form");
  hasForm(generateInflections("ii", ["adj-ix"]), "yokatta", "past adjective form");

  const shizuka = generateInflections("shizuka", ["adj-na"]);
  hasForm(shizuka, "shizukana", "attributive na-adjective form");
  hasForm(shizuka, "shizukadatta", "past na-adjective form");
  hasForm(shizuka, "shizukajanai", "negative na-adjective form");
  hasForm(generateInflections("da", ["cop"]), "datta", "past copula form");
  hasForm(generateInflections("desu", ["cop"]), "deshita", "polite past copula form");
});

test("unsupported tags and incompatible endings do not invent forms", async () => {
  const { generateInflections } = await modulePromise;
  assert.deepEqual(generateInflections("kaku", ["n"]), []);
  assert.deepEqual(generateInflections("kaku", ["v1"]), []);
  assert.deepEqual(generateInflections("kaku", ["v4k"]), []);
  assert.deepEqual(generateInflections("漢字", ["v5k"]), []);
  const forms = generateInflections("taberu", ["v1", "v1"]);
  assert.equal(new Set(forms.map(({ romaji, label }) => `${romaji}\0${label}`)).size, forms.length);
});
