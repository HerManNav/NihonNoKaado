const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const path = require("node:path");
const { gunzipSync } = require("node:zlib");

// Independent, sentence-level regression examples. Each source example and
// linked headword is from the retained TKG JSON at this exact revision:
// https://github.com/tkgally/je-dict-1/tree/32c267cbfa7756a2e3542657772759d92d4e2420
// The English expectations below were chosen for the whole sentence, not
// inferred from the annotation generator or the first dictionary gloss.
const SOURCE_COMMIT = "32c267cbfa7756a2e3542657772759d92d4e2420";
const sourceDirectory = path.join(__dirname, "../dictionaries/source-data");
const dictionariesDirectory = path.join(__dirname, "../dictionaries");
const sourceIndex = JSON.parse(readFileSync(path.join(sourceDirectory, "tkg-entries-index-32c267cb.json"), "utf8"));
const sourceIndexById = new Map(sourceIndex.entries.map((entry) => [entry.id, entry]));
const decks = new Map([50, 100, 2000].map((size) => [size, JSON.parse(
  readFileSync(path.join(dictionariesDirectory, `most-common-${size}.json`), "utf8"))]));
const words = (romaji) => String(romaji).match(/[A-Za-z]+(?:['’][A-Za-z]+)*/g) || [];

// Each group is a pinned source example. The token number is zero based in the
// exact visible romaji sentence. entryId distinguishes homographs, while the
// meaning expectation catches a correct entry used with the wrong sense.
const cases = [
  {
    deck: 2000, card: "no", english: "I want the red one.",
    owner: "09472_no", exampleId: "09472_no_ex4", sense: 2,
    tokens: [
      [1, "no", "09472_no", /nominali[sz]er|one/i],
      [2, "ga", "00051_ga", /object marker|object of (?:desire|want)/i],
      [3, "hoshii", "01107_hoshii", /want|desir/i],
    ],
  },
  {
    deck: 2000, card: "ga", english: "It's raining.",
    owner: "00051_ga", exampleId: "00051_ga_ex1", sense: 1,
    tokens: [
      [0, "ame", "00583_ame", /rain/i],
      [1, "ga", "00051_ga", /subject marker/i],
      [2, "futte", "00839_furu", /(?:te.form|raining|falling)/i, /furu/i],
      [3, "iru", "00495_iru", /(?:ongoing|progressive|continu(?:ing|ous)|is raining)/i],
    ],
  },
  {
    deck: 2000, card: "to", english: "Which would you like, coffee or tea?",
    owner: "00512_to", exampleId: "00512_to_ex1", sense: 1,
    tokens: [
      [1, "to", "00512_to", /\band\b/i],
      [4, "ga", "00051_ga", /subject marker|object marker/i],
      [7, "ka", "09473_ka", /question/i],
    ],
  },
  {
    deck: 2000, card: "tsukau", english: "I use chopsticks.",
    owner: "00473_tsukau", exampleId: "00473_tsukau_ex1", sense: 1,
    tokens: [[0, "hashi", "01026_hashi", /chopstick/i]],
  },
  {
    deck: 2000, card: "hashi", english: "To cross a bridge.",
    owner: "02163_hashi", exampleId: "02163_hashi_ex1", sense: 1,
    tokens: [
      [0, "hashi", "02163_hashi", /bridge/i],
      [1, "wo", "00422_wo", /(?:space traversed|path|route|across|over)/i],
    ],
  },
  {
    deck: 2000, card: "ura", english: "To write on the back of the paper.",
    owner: "02178_ura", exampleId: "02178_ura_ex1", sense: 1,
    tokens: [
      [0, "kami", "00712_kami", /paper/i],
      [1, "no", "09472_no", /possessive|\bof\b|'s/i],
      [4, "kaku", "00477_kaku", /writ/i],
    ],
  },
  {
    deck: 2000, card: "maru", english: "To draw a circle.",
    owner: "02167_maru", exampleId: "02167_maru_ex1", sense: 1,
    tokens: [[2, "kaku", "02013_egaku", /draw/i]],
  },
  {
    deck: 2000, card: "hou", english: "The station is in the north direction.",
    owner: "01139_hou", exampleId: "01139_hou_ex1", sense: 1,
    tokens: [
      [1, "ha", "00079_ha", /topic marker/i],
      [2, "kita", "00644_kita", /north/i],
    ],
  },
  {
    deck: 2000, card: "ha", english: "My tooth hurts.",
    owner: "00778_ha", exampleId: "00778_ha_ex1", sense: 1,
    tokens: [
      [0, "ha", "00778_ha", /tooth/i],
      [1, "ga", "00051_ga", /subject marker/i],
    ],
  },
  {
    deck: 2000, card: "kuru", english: "Come here!",
    owner: "00254_kuru", exampleId: "00254_kuru_ex1", sense: 1,
    tokens: [[2, "kite", "00254_kuru", /(?:te.form.*come|come.*te.form)/i, /kuru/i]],
  },
  {
    deck: 2000, card: "kisha", english: "A reporter came to do an interview.",
    owner: "14170_kisha", exampleId: "14170_kisha_ex1", sense: 1,
    tokens: [
      [3, "ni", "00314_ni", /(?:purpose|in order to|for.*interview)/i],
      [4, "kita", "00254_kuru", /(?:past.*come|came|come.*past)/i, /kuru/i],
    ],
  },
  {
    deck: 2000, card: "kaku", english: "To observe the cell nucleus.",
    owner: "13127_kaku", exampleId: "13127_kaku_ex1", sense: 1,
    tokens: [[2, "kaku", "13127_kaku", /nucleus|nuclear/i]],
  },
  {
    deck: 2000, card: "ato", english: "After lunch, I took a short nap.",
    owner: "09580_ato", exampleId: "09580_ato_ex1", sense: 1,
    tokens: [
      [1, "no", "09472_no", /possessive|\bof\b|'s/i],
      [2, "ato", "09580_ato", /after/i],
      [6, "shita", "00392_suru", /(?:past.*do|do.*past|did|past.*make|took)/i, /suru/i],
    ],
  },
  {
    deck: 2000, card: "de", english: "I study at the library.",
    owner: "00502_de", exampleId: "00502_de_ex1", sense: 1,
    tokens: [[1, "de", "00502_de", /(?:location|\bat\b|\bin\b)/i]],
  },
  {
    deck: 2000, card: "ni", english: "I go to school.",
    owner: "00314_ni", exampleId: "00314_ni_ex1", sense: 1,
    tokens: [[1, "ni", "00314_ni", /(?:destination|direction|\bto\b)/i]],
  },
  {
    deck: 2000, card: "you", english: "It looks like it's going to rain.",
    owner: "01114_you", exampleId: "01114_you_ex1", sense: 1,
    tokens: [[3, "you", "01114_you", /(?:seem|appear|looks like)/i]],
  },
  {
    deck: 2000, card: "toki", english: "Time passes quickly, doesn't it?",
    owner: "02918_toki", exampleId: "02918_toki_ex4", sense: 1,
    tokens: [
      [0, "toki", "02918_toki", /time/i],
      [3, "no", "09472_no", /nominali[sz]er|(?:the fact|that)/i],
      [4, "ha", "00079_ha", /topic marker/i],
      [5, "hayai", "00514_hayai", /(?:fast|quick|rapid)/i],
    ],
  },
  {
    deck: 2000, card: "mondai", english: "What is the answer to this question?",
    owner: "00797_mondai", exampleId: "00797_mondai_ex7", sense: 1,
    tokens: [[1, "mondai", "00797_mondai", /question/i]],
  },
  {
    deck: 2000, card: "naru", english: "Spring has come.",
    owner: "01970_naru", exampleId: "01970_naru_ex1", sense: 1,
    tokens: [[1, "ni", "00314_ni", /(?:change|result|becom)/i]],
  },
  {
    deck: 2000, card: "mono", english: "Authorized persons only.",
    owner: "12734_mono", exampleId: "12734_mono_ex1", sense: 1,
    sourceJapaneseIncludes: ["のみ", "{可|か}"],
    // TKG does not have matching headword records for this のみ/可 use.
    // A guessed entryId would incorrectly point to chisel or question marker.
    tokens: [
      [2, "nomi", null, /only/i],
      [4, "ka", null, /(?:permitted|allowed|may enter|authorized)/i],
    ],
  },
  {
    deck: 2000, card: "deru", english: "I leave the house at 8 o'clock.",
    owner: "00513_deru", exampleId: "00513_deru_ex1", sense: 1,
    tokens: [
      [1, "ni", "00314_ni", /(?:time marker|at.*time|\bat\b)/i],
      [3, "wo", "00422_wo", /(?:point of departure|place.*(?:left|depart)|leaving|depart)/i],
    ],
  },
  {
    deck: 2000, card: "san", english: "Let's meet at three o'clock.",
    owner: "00749_san", exampleId: "00749_san_ex1", sense: 1,
    tokens: [[2, "ni", "00314_ni", /(?:time marker|at.*time|\bat\b)/i]],
  },
  {
    deck: 2000, card: "tsuma", english: "I called my wife.",
    owner: "01005_tsuma", exampleId: "01005_tsuma_ex1", sense: 1,
    tokens: [[1, "ni", "00314_ni", /(?:indirect object|recipient|target of.*call)/i]],
  },
  {
    deck: 2000, card: "basu", english: "I go to school by bus.",
    owner: "00769_basu", exampleId: "00769_basu_ex1", sense: 1,
    tokens: [[1, "de", "00502_de", /(?:means|method|\bby\b)/i]],
  },
  {
    deck: 2000, card: "fukai", english: "This pool is deep, so be careful.",
    owner: "01211_fukai", exampleId: "01211_fukai_ex1", sense: 1,
    tokens: [[4, "kara", "00504_kara", /(?:because|since|reason)/i]],
  },
  {
    deck: 2000, card: "hikaku", english: "I'll buy after comparing prices.",
    owner: "03576_hikaku", exampleId: "03576_hikaku_ex1", sense: 1,
    tokens: [[4, "kara", "00504_kara", /(?:after|sequence)/i]],
  },
  {
    deck: 2000, card: "denshi", english: "Atoms are made of electrons, protons, and neutrons.",
    owner: "03449_denshi", exampleId: "03449_denshi_ex3", sense: 1,
    tokens: [[7, "kara", "00504_kara", /(?:made (?:of|from)|material)/i]],
  },
  // These examples belong to the retained 50/100 deck and are absent from
  // the newer 2,000-card frequency-ranked deck. They must be annotated too.
  {
    deck: 50, card: "iu", english: "He said, 'I don't want to go.'",
    owner: "00515_iu", exampleId: "00515_iu_ex1", sense: 1,
    tokens: [
      [2, "ikitakunai", "00119_iku", /(?:not want to go|do not want to go|negative.*want.*go)/i, /iku/i],
      [3, "to", "00512_to", /(?:quot|said|speech)/i],
      [4, "iimashita", "00515_iu", /(?:said|past.*say|say.*past)/i, /iu/i],
    ],
  },
  {
    deck: 50, card: "wakaru", english: "Got it.",
    owner: "00463_wakaru", exampleId: "00463_wakaru_ex1", sense: 1,
    tokens: [[0, "wakatta", "00463_wakaru", /(?:understood|got it|past.*understand|understand.*past)/i, /wakaru/i]],
  },
  {
    deck: 50, card: "kedo", english: "It's expensive, but I want to buy it.",
    owner: "09477_kedo", exampleId: "09477_kedo_ex1", sense: 1,
    tokens: [
      [1, "kedo", "09477_kedo", /\bbut\b|although/i],
      [2, "kaitai", "00489_kau", /(?:want to buy|desire.*buy|buy.*desire)/i, /kau/i],
    ],
  },
  {
    deck: 100, card: "matsu", english: "Wait a moment.",
    owner: "00469_matsu", exampleId: "00469_matsu_ex1", sense: 1,
    tokens: [[1, "matte", "00469_matsu", /(?:te.form.*wait|wait.*te.form|wait)/i, /matsu/i]],
  },
  {
    deck: 100, card: "mada", english: "I haven't eaten yet.",
    owner: "00603_mada", exampleId: "00603_mada_ex6", sense: 2,
    tokens: [
      [0, "mada", "00603_mada", /not yet|yet/i],
      [1, "tabeteimasen", "00396_taberu", /(?:not.*eat|haven.t eaten|have not eaten|negative.*eat)/i, /taberu/i],
    ],
  },
  {
    deck: 100, card: "kudasaru", english: "The teacher gave me a book.",
    owner: "01305_kudasaru", exampleId: "01305_kudasaru_ex1", sense: 1,
    tokens: [[4, "kudasatta", "01305_kudasaru", /(?:gave|past.*give|give.*past)/i, /kudasaru/i]],
  },
  {
    deck: 100, card: "youna", english: "It sounds like a dream come true.",
    owner: "30292_youna", exampleId: "30292_youna_ex1", sense: 1,
    tokens: [[2, "youna", "30292_youna", /(?:like|similar|such as)/i]],
  },
];

function sourceUrl(entryId) {
  const entry = sourceIndexById.get(entryId);
  assert(entry, `Missing pinned TKG index entry ${entryId}`);
  return `https://raw.githubusercontent.com/tkgally/je-dict-1/${SOURCE_COMMIT}/${entry.path}`;
}

test("curated expectations are backed by pinned TKG sentences and linked headwords", () => {
  const ownerIds = new Set(cases.map(({ owner }) => owner));
  const owners = new Map();
  for (const file of readdirSync(sourceDirectory)) {
    if (!/^tkg-example-entries-32c267cb-\d{4}\.json\.gz$/.test(file)) continue;
    const archive = JSON.parse(gunzipSync(readFileSync(path.join(sourceDirectory, file))));
    assert.equal(archive.sourceCommit, SOURCE_COMMIT);
    for (const row of archive.entries) {
      if (ownerIds.has(row.id)) owners.set(row.id, JSON.parse(row.content));
    }
  }
  let tokenCount = 0;
  for (const fixture of cases) {
    const owner = owners.get(fixture.owner);
    const ownerUrl = sourceUrl(fixture.owner);
    assert(owner, `Missing retained source owner ${ownerUrl}`);
    const example = owner.examples.find((item) => item.id === fixture.exampleId);
    assert(example, `Missing ${fixture.exampleId} in ${ownerUrl}`);
    assert.equal(example.english, fixture.english, `${fixture.exampleId}: ${ownerUrl}`);
    assert(example.sense_numbers.includes(fixture.sense), `${fixture.exampleId} has wrong sense: ${ownerUrl}`);
    for (const surface of fixture.sourceJapaneseIncludes || []) {
      assert(example.japanese.includes(surface), `${fixture.exampleId} lacks ${surface}: ${ownerUrl}`);
    }
    for (const [position, romaji, entryId] of fixture.tokens) {
      tokenCount += 1;
      assert(Number.isInteger(position) && position >= 0, `${fixture.exampleId}: invalid token position`);
      assert(romaji && (entryId === null || typeof entryId === "string"),
        `${fixture.exampleId}: incomplete token fixture`);
      if (entryId !== null) sourceUrl(entryId);
      if (entryId !== null && entryId !== fixture.owner) {
        assert(example.japanese.includes(`：${entryId}⟧`),
          `${fixture.exampleId} does not link ${entryId}: ${ownerUrl}`);
      }
    }
  }
  assert(cases.length >= 20, "Expected a broad set of independent source sentences");
  assert(tokenCount >= 40, "Expected at least 40 difficult token occurrences");
});

for (const fixture of cases) {
  for (const [position, romaji, entryId, meaning, morphology] of fixture.tokens) {
    test(`${fixture.deck}-word ${fixture.card}: ${romaji} in “${fixture.english}”`, () => {
      const matches = decks.get(fixture.deck).cards.filter((card) => card.japanese === fixture.card
        && card.examples?.some((example) => example.english === fixture.english));
      assert.equal(matches.length, 1, `Expected one card with this example; ${sourceUrl(fixture.owner)}`);
      const example = matches[0].examples.find((item) => item.english === fixture.english);
      const visibleWords = words(example.romaji);
      assert.equal(visibleWords[position], romaji, `Sentence segmentation changed; review ${sourceUrl(fixture.owner)}`);
      assert(Array.isArray(example.wordMeanings), `Missing contextual meanings for ${sourceUrl(fixture.owner)}`);
      const annotation = example.wordMeanings[position];
      assert(annotation, `Missing ${romaji} annotation; ${sourceUrl(fixture.owner)}`);
      assert.equal(annotation.romaji, romaji, `Misaligned ${romaji} annotation; ${sourceUrl(fixture.owner)}`);
      if (entryId === null) {
        assert(!annotation.entryId,
          `No matching TKG headword exists for ${romaji}; source: ${sourceUrl(fixture.owner)}`);
      } else {
        assert.equal(annotation.entryId, entryId,
          `Wrong TKG headword for ${romaji}; expected ${sourceUrl(entryId)}`);
      }
      assert.match(annotation.meaning, meaning,
        `Wrong sense for ${romaji} in “${fixture.english}”; ${sourceUrl(fixture.owner)}`);
      if (morphology) assert.match(annotation.meaning, morphology,
        `Missing base verb for ${romaji} in “${fixture.english}”; ${sourceUrl(fixture.owner)}`);
    });
  }
}
