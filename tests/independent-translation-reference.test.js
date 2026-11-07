const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { gunzipSync } = require("node:zlib");
const path = require("node:path");
const { findWordMeanings } = require("../word-form-lookup.js");

const deck = JSON.parse(gunzipSync(readFileSync(path.join(
  __dirname, "../decks/romaji-english-jmdict-2026-11-02.json.gz",
))));

// These expectations were transcribed from the linked TKG entries, Japanese
// Audio Lessons, Amherst's conjugation guide, and Umeda's linguistic study.
// None is copied from this app's JMdict source, generated lookup, or output.
// TKG is independent of the JMdict lookup pipeline, though it is an AI-assisted
// learner deck; agreement is a cross-check, not proof of perfect accuracy.
const tkg = (bucket, entry) => `https://www.tkgje.jp/entries/${bucket}/${entry}.html`;
const referenceWords = [
  ["raishuu", "来週", /next week/i, "popup",
    "https://marugoto.jpf.go.jp/assets/docs/download/pre_intermediate/MarugotoPre-IntermediateVocabularyIndex2_EN.pdf"],
  ["raishuu", "来襲", /attack/i, "all", "https://kotobank.jp/jeword/%E6%9D%A5%E8%A5%B2"],
  ["shita", "舌", /tongue/i, "popup", tkg("02000", "02154_shita")],
  ["shita", "下", /below|under/i, "popup", tkg("00500", "00670_shita")],
  ["ha", "は", /sentence topic|topic marker/i, "popup", tkg("00000", "00079_ha")],
  ["wa", "は (spoken wa)", /sentence topic|topic marker/i, "popup",
    "https://www.irodori.jpf.go.jp/assets/data/Grammar_all.pdf"],
  ["ga", "が", /subject/i, "popup", tkg("00000", "00051_ga")],
  ["ni", "に", /\bat\b|\bto\b|location|destination/i, "popup", tkg("00000", "00314_ni")],
  ["de", "で", /\bat\b|\bby\b|location|means/i, "popup", tkg("00500", "00502_de")],
  ["to", "と", /\band\b|\bwith\b|quot/i, "popup", tkg("00500", "00512_to")],
  ["to", "と", /\band\b|\bwith\b|quot/i, "all", tkg("00500", "00512_to")],
  ["hana", "花", /flower/i, "popup", tkg("00500", "00523_hana")],
  ["hana", "鼻", /nose/i, "popup", tkg("02000", "02164_hana")],
  ["ha", "歯", /tooth/i, "all", tkg("00500", "00778_ha")],
  ["ha", "葉", /leaf/i, "all", tkg("02000", "02241_ha")],
  ["ha", "羽", /feather/i, "all", "https://en.wiktionary.org/w/index.php?title=%E7%BE%BD&oldid=92490451#Japanese"],
  ["kaku", "書く", /to write/i, "all", tkg("00000", "00477_kaku")],
  ["kaku", "掻く", /to scratch/i, "all", tkg("09500", "09647_kaku")],
  ["kaku", "描く", /to draw/i, "all", tkg("28000", "28436_kaku")],
];

for (const [romaji, spelling, concept, scope, source] of referenceWords) {
  test(`external lexical reference: ${spelling} (${romaji}) in ${scope}`, () => {
    assert.match(source, /^https:\/\//);
    const meanings = scope === "popup" ? findWordMeanings(romaji, deck) : deck.lookup[romaji];
    assert(Array.isArray(meanings), `No lookup for ${romaji}; reference: ${source}`);
    assert(meanings.some((meaning) => concept.test(meaning)),
      `${spelling} (${romaji}) should express ${concept}; got ${JSON.stringify(meanings)}; reference: ${source}`);
  });
}

const referenceForms = [
  ["shita", "suru", "past form", /to do/i, tkg("00000", "00392_suru")],
  ["shite", "suru", "te-form", /to do/i, tkg("00000", "00392_suru")],
  ["shimasen", "suru", "polite negative form", /to do/i, tkg("00000", "00392_suru")],
  ["sareru", "suru", "passive form", /to do/i, tkg("00000", "00392_suru")],
  ["dekiru", "suru", "potential form", /to do/i, tkg("00000", "00392_suru")],
  ["kaita", "kaku", "past form", /to write/i, tkg("00000", "00477_kaku")],
  ["kaite", "kaku", "te-form", /to write/i, tkg("00000", "00477_kaku")],
  ["kaite", "kaku", "te-form", /to scratch/i, tkg("09500", "09647_kaku")],
  ["kakeru", "kaku", "potential form", /to write/i, tkg("00000", "00477_kaku")],
  ["kakareru", "kaku", "passive form", /to write/i, tkg("00000", "00477_kaku")],
  ["itte", "iku", "te-form", /to go/i, tkg("00000", "00119_iku")],
  ["ittara", "iku", "conditional -tara form", /to go/i, tkg("00000", "00119_iku")],
  ["kita", "kuru", "past form", /to come/i, tkg("00000", "00254_kuru")],
  ["kita", "kiru", "past form", /to wear/i, tkg("00500", "00541_kiru")],
  ["kitta", "kiru", "past form", /to cut/i, tkg("02500", "02693_kiru")],
  ["matte", "matsu", "te-form", /to wait/i,
    "https://www.irodori.jpf.go.jp/assets/data/Grammar_all.pdf"],
  ["taberareru", "taberu", "potential form", /to eat/i, tkg("00000", "00396_taberu")],
  ["taberareru", "taberu", "passive form", /to eat/i, tkg("00000", "00396_taberu")],
  ["nonde", "nomu", "te-form", /to drink/i, tkg("00000", "00322_nomu")],
  ["nonda", "nomu", "past form", /to drink/i, tkg("00000", "00322_nomu")],
  ["aratte", "arau", "te-form", /to wash/i, tkg("00500", "00827_arau")],
  ["arawanai", "arau", "negative form", /to wash/i, tkg("00500", "00827_arau")],
  ["shinde", "shinu", "te-form", /to die/i, tkg("00500", "00669_shinu")],
  ["shinda", "shinu", "past form", /to die/i, tkg("00500", "00669_shinu")],
  ["chikazuite", "chikazuku", "te-form", /to approach/i,
    "https://www.japaneseaudiolessons.com/wp-content/uploads/jaftranscript-phone-2023-11-27.pdf#page=519"],
];

for (const [form, lemma, label, concept, source] of referenceForms) {
  test(`external form reference: ${form} → ${lemma} (${label})`, () => {
    assert.match(source, /^https:\/\//);
    const meanings = findWordMeanings(form, deck);
    const prefix = `${label} of ${lemma} — `;
    assert(meanings.some((meaning) => meaning.startsWith(prefix) && concept.test(meaning.slice(prefix.length))),
      `${form} should include ${prefix}${concept}; got ${JSON.stringify(meanings)}; reference: ${source}`);
  });
}

const honorificForms = [
  ["irasshaimasu", "irassharu"],
  ["osshaimasu", "ossharu"],
  ["kudasaimasu", "kudasaru"],
  ["nasaimasu", "nasaru"],
  ["gozaimasu", "gozaru"],
];
const honorificSource = "https://wtawa.people.amherst.edu/jvrules/index.php?form=stemmasu";
for (const [form, lemma] of honorificForms) {
  test(`Amherst honorific ます reference: ${form} → ${lemma}`, () => {
    const meanings = findWordMeanings(form, deck);
    assert(meanings.some((meaning) => meaning.startsWith(`polite form of ${lemma} — `)),
      `${form} should identify ${lemma}; got ${JSON.stringify(meanings)}; reference: ${honorificSource}`);
  });
}

const invalidForms = [
  ["areru", /^potential form of aru\b/, "https://wtawa.people.amherst.edu/jvrules/index.php?form=potential"],
  ["wakareru", /^potential form of wakaru\b/, "https://wtawa.people.amherst.edu/jvrules/index.php?form=potential"],
  ["amegafureru", /^potential form of amegafuru\b/, "https://wtawa.people.amherst.edu/jvrules/index.php?form=potential"],
  ["ringotachi", /^plural\/group suffix of ringo\b/, "https://gpwu.repo.nii.ac.jp/record/53/files/Y14_UMEDA.pdf"],
  ["soretachi", /^plural\/group suffix of sore\b/, "https://gpwu.repo.nii.ac.jp/record/53/files/Y14_UMEDA.pdf"],
  ["chikazukute", /^te-form of chikazuku\b/,
    "https://www.japaneseaudiolessons.com/wp-content/uploads/jaftranscript-phone-2023-11-27.pdf#page=519"],
];
for (const [form, invalidReading, source] of invalidForms) {
  test(`external negative reference: ${form} is not ${invalidReading}`, () => {
    const meanings = findWordMeanings(form, deck);
    assert(!meanings.some((meaning) => invalidReading.test(meaning)),
      `${form} was overgenerated: ${JSON.stringify(meanings)}; reference: ${source}`);
  });
}

test("independent references keep common forms ahead of accidental noun-copula parses", () => {
  const source = tkg("00500", "00669_shinu");
  assert.match(findWordMeanings("shinde", deck)[0], /^te-form of shinu — to die/i, source);
  assert.match(findWordMeanings("shinda", deck)[0], /^past form of shinu — to die/i, source);
  assert.match(findWordMeanings("raishuu", deck)[0], /^next week$/i,
    tkg("00500", "00746_raishuu"));
});
