import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync, gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateInflections } from "./japanese-inflections.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const sourceFile = process.argv[2] || path.join(projectDirectory, "decks", "source-data", "jmdict-eng-3.6.2+20261102210542.json.tgz");
const outputFile = process.argv[3] || path.join(projectDirectory, "decks", "romaji-english-jmdict-2026-11-02.json.gz");
const frequencyFile = path.join(projectDirectory, "decks", "source-data", "ja_full-OpenSubtitles2018.txt");
const learnerIndexFile = path.join(projectDirectory, "decks", "source-data", "tkg-entries-index-32c267cb.json");

const kanaToRomaji = {
  きゃ: "kya", きゅ: "kyu", きょ: "kyo", ぎゃ: "gya", ぎゅ: "gyu", ぎょ: "gyo",
  しゃ: "sha", しゅ: "shu", しょ: "sho", じゃ: "ja", じゅ: "ju", じょ: "jo",
  ちゃ: "cha", ちゅ: "chu", ちょ: "cho", にゃ: "nya", にゅ: "nyu", にょ: "nyo",
  ひゃ: "hya", ひゅ: "hyu", ひょ: "hyo", びゃ: "bya", びゅ: "byu", びょ: "byo",
  ぴゃ: "pya", ぴゅ: "pyu", ぴょ: "pyo", みゃ: "mya", みゅ: "myu", みょ: "myo",
  りゃ: "rya", りゅ: "ryu", りょ: "ryo",
  あ: "a", い: "i", う: "u", え: "e", お: "o",
  か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko", が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go",
  さ: "sa", し: "shi", す: "su", せ: "se", そ: "so", ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
  た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to", だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do",
  な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no", は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
  ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo", ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
  ま: "ma", み: "mi", む: "mu", め: "me", も: "mo", や: "ya", ゆ: "yu", よ: "yo",
  ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro", わ: "wa", ゐ: "wi", ゑ: "we", を: "o", ん: "n",
  ゔ: "vu", ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o", ゃ: "ya", ゅ: "yu", ょ: "yo",
};

function normalizeKana(value) {
  return [...value].map((character) => {
    const code = character.codePointAt(0);
    return code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : character;
  }).join("");
}

function kanaToHepburn(value) {
  const kana = normalizeKana(value);
  let result = "";
  for (let index = 0; index < kana.length;) {
    const pair = kana.slice(index, index + 2);
    if (kanaToRomaji[pair]) {
      result += kanaToRomaji[pair];
      index += 2;
      continue;
    }
    const character = kana[index];
    if (character === "っ") {
      const upcoming = kanaToRomaji[pair[1]] || kanaToRomaji[kana.slice(index + 1, index + 3)] || "";
      result += upcoming.startsWith("ch") ? "t" : (upcoming[0] || "");
      index += 1;
      continue;
    }
    if (character === "ー") {
      const lastVowel = result.match(/[aeiou](?!.*[aeiou])/i)?.[0];
      result += lastVowel || "";
      index += 1;
      continue;
    }
    result += kanaToRomaji[character] || "";
    index += 1;
  }
  return result.toLowerCase();
}

async function readJmdict(filePath) {
  if (!filePath.endsWith(".tgz")) return JSON.parse(await readFile(filePath, "utf8"));

  const archive = gunzipSync(await readFile(filePath));
  for (let offset = 0; offset + 512 <= archive.length;) {
    const name = archive.toString("utf8", offset, offset + 100).replace(/\0.*$/, "");
    if (!name) break;
    const sizeField = archive.toString("utf8", offset + 124, offset + 136).replace(/\0.*$/, "").trim();
    const size = Number.parseInt(sizeField || "0", 8);
    const dataOffset = offset + 512;
    if (name.endsWith(".json")) return JSON.parse(archive.toString("utf8", dataOffset, dataOffset + size));
    offset = dataOffset + Math.ceil(size / 512) * 512;
  }
  throw new Error(`No JSON deck found in ${filePath}`);
}

function frequencyRank(tags) {
  const values = new Set(tags || []);
  const nf = [...values].map((tag) => /^nf(\d{2})$/.exec(tag)?.[1]).filter(Boolean).map(Number);
  const categoryRank = values.has("news1") ? 0 : values.has("ichi1") ? 1 : values.has("spec1") ? 2 : values.has("gai1") ? 3 : 4;
  return [categoryRank, nf.length ? Math.min(...nf) : 99];
}

function wordRank(word, reading) {
  const readingTags = reading.tags || [];
  const commonReading = reading.common ? 1000 : 0;
  const commonKanji = (word.kanji || []).some((kanji) => kanji.common
    && (reading.appliesToKanji || []).some((form) => form === "*" || form === kanji.text)) ? 200 : 0;
  const allTags = [...readingTags, ...(word.kanji || []).flatMap((kanji) => kanji.tags || [])];
  const [categoryRank, nfRank] = frequencyRank(allTags);
  const pos = new Set((word.sense || []).flatMap((sense) => sense.partOfSpeech || []));
  const grammar = pos.has("vs-i") || pos.has("vs-s") ? 60000 : pos.has("prt") ? 50000 : pos.has("pn") ? 30000 : pos.has("vk") ? 20000
    : pos.has("cop") || pos.has("aux-v") ? 10000 : 0;
  const spellings = (word.kanji || []).map((form) => form.text)
    .filter((form) => (reading.appliesToKanji || []).some((allowed) => allowed === "*" || allowed === form));
  if (!spellings.length) spellings.push(reading.text);
  // The TKG basic/core tiers identify ordinary learner vocabulary by both
  // spelling and reading. This resolves frequent romaji homographs that
  // JMdict entry flags and unsensed surface counts cannot distinguish.
  const learnerBonus = Math.max(0, ...spellings.map((form) =>
    learnerTierBonus.get(`${normalizeKana(reading.text)}\0${form}`) || 0));
  const corpusCount = Math.max(0, ...spellings.map((form) => {
    const exact = frequencyCounts.get(form) || 0;
    const stem = form.replace(/[ぁ-ゖ]+$/u, "");
    return Math.max(exact, stem !== form ? frequencyCounts.get(stem) || 0 : 0);
  }));
  const corpusWeight = Math.min(2500, Math.round(Math.log1p(corpusCount) * 200));
  return learnerBonus + grammar + commonReading + commonKanji + corpusWeight + (4 - categoryRank) * 20 + (99 - nfRank);
}

const learnerIndex = JSON.parse(await readFile(learnerIndexFile, "utf8"));
const learnerTierBonus = new Map();
for (const entry of learnerIndex.entries || []) {
  const bonus = entry.vocabulary_tier === "basic" ? 30000
    : entry.vocabulary_tier === "core" ? 6000 : 0;
  if (!bonus || !entry.reading || !entry.headword) continue;
  const key = `${normalizeKana(entry.reading)}\0${entry.headword}`;
  learnerTierBonus.set(key, Math.max(bonus, learnerTierBonus.get(key) || 0));
}
const frequencyCounts = new Map((await readFile(frequencyFile, "utf8")).trim().split(/\r?\n/).map((line) => {
  const split = line.lastIndexOf(" ");
  return [line.slice(0, split), Number(line.slice(split + 1)) || 0];
}));
const source = await readJmdict(sourceFile);
const candidates = Object.create(null);
const headCandidates = Object.create(null);
const lemmaCandidates = Object.create(null);
const groupHeads = Object.create(null);
const nounKeys = new Set();
const pronounKeys = new Set();
// -tachi, -ra, and -gata refer to groups of animate beings. JMdict has no
// animacy tag, so admit only head glosses that clearly name people or animals.
const personGloss = /^(?:I|you|he|she|we|they|person|people|human|child|children|baby|adult|man|woman|men|women|boy|girl|mother|father|parent|brother|sister|son|daughter|friend|student|teacher|instructor|doctor|nurse|worker|employee|customer|guest|colleague|neighbor|neighbour|grandmother|grandfather|uncle|aunt|cousin|husband|wife|police officer|soldier|president|king|queen|prince|princess|gentleman|lady)(?:\b|$)/i;
const animalGloss = /^(?:animal|cat|dog|bird|pet|horse|cow|pig|sheep|goat|rabbit|mouse|rat|lion|tiger|bear|wolf|fox|deer|monkey|fish|insect)(?:\b|$)/i;
const inflectableTags = new Set([
  "v1", "v1-s", "v5u", "v5u-s", "v5k", "v5k-s", "v5g", "v5s", "v5t", "v5n", "v5b", "v5m", "v5r", "v5r-i", "v5aru",
  "vs-i", "vs-s", "vs", "vk", "adj-i", "adj-ix", "adj-na", "cop",
]);
for (const word of source.words || []) {
  for (const reading of word.kana || []) {
    const romaji = kanaToHepburn(reading.text);
    if (!/^[a-z]+(?:'[a-z]+)*$/.test(romaji)) continue;
    const rank = wordRank(word, reading);
    const posTags = [...new Set((word.sense || []).flatMap((sense) => sense.partOfSpeech || []))];
    const isParticle = posTags.includes("prt");
    const aliases = new Set([romaji]);
    const normalizedReading = normalizeKana(reading.text);
    if (isParticle && normalizedReading === "は") aliases.add("wa");
    if (isParticle && normalizedReading === "へ") aliases.add("e");
    if (isParticle && normalizedReading === "を") aliases.add("wo");
    const englishGlosses = (word.sense || []).flatMap((sense) => sense.gloss || [])
      .filter((gloss) => gloss.lang === "eng" && gloss.text?.trim())
      .map((gloss) => gloss.text.trim());
    if (!englishGlosses.length) continue;
    if (posTags.includes("n")) nounKeys.add(romaji);
    if (posTags.includes("pn")) pronounKeys.add(romaji);
    if (posTags.includes("n") || posTags.includes("pn")) {
      const gloss = englishGlosses[0];
      const kind = personGloss.test(gloss) ? "person" : animalGloss.test(gloss) ? "animal" : "";
      if (kind && (!groupHeads[romaji] || rank > groupHeads[romaji][1])) {
        groupHeads[romaji] = [gloss, rank, kind];
      }
    }
    for (const tag of posTags) {
      if (inflectableTags.has(tag)) (lemmaCandidates[romaji] ||= []).push([tag, englishGlosses[0], rank]);
    }
    for (const alias of aliases) {
      const score = rank + (alias !== romaji && isParticle ? 60000 : 0);
      (headCandidates[alias] ||= []).push({ text: englishGlosses[0], score, id: Number(word.id) || 0 });
    }
    for (const [senseIndex, sense] of (word.sense || []).entries()) {
      for (const gloss of sense.gloss || []) {
        if (gloss.lang !== "eng" || !gloss.text.trim()) continue;
        for (const alias of aliases) {
          const entry = candidates[alias] ||= [];
          const score = rank + (alias !== romaji && isParticle ? 60000 : 0);
          entry.push({ text: gloss.text.trim(), score, senseIndex, id: Number(word.id) || 0 });
        }
      }
    }
  }
}

const lookup = Object.create(null);
for (const [romaji, entries] of Object.entries(candidates)) {
  entries.sort((left, right) => right.score - left.score || left.senseIndex - right.senseIndex || right.id - left.id);
  lookup[romaji] = [...new Set(entries.map((entry) => entry.text))];
}
const heads = Object.create(null);
for (const [romaji, entries] of Object.entries(headCandidates)) {
  entries.sort((left, right) => right.score - left.score || right.id - left.id);
  const seen = new Set();
  heads[romaji] = entries.filter((entry) => {
    if (seen.has(entry.text)) return false;
    seen.add(entry.text);
    return true;
  }).map((entry) => [entry.text, entry.score]);
}
const lemmas = Object.create(null);
for (const [romaji, entries] of Object.entries(lemmaCandidates)) {
  entries.sort((left, right) => right[2] - left[2]);
  const seen = new Set();
  lemmas[romaji] = entries.filter((entry) => {
    const key = `${entry[0]}\0${entry[1]}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const templates = [
  ["v1", "ru"], ["v1-s", "ru"], ["v5u", "u"], ["v5u-s", "u"], ["v5k", "ku"], ["v5k-s", "ku"],
  ["v5g", "gu"], ["v5s", "su"], ["v5t", "tsu"], ["v5n", "nu"], ["v5b", "bu"], ["v5m", "mu"],
  ["v5r", "ru"], ["v5r-i", "ru"], ["v5aru", "ru"], ["vs-i", "suru"], ["vs-s", "suru"], ["vs", ""], ["vk", "kuru"],
  ["adj-i", "i"], ["adj-ix", "i"], ["adj-na", ""],
];
const formRules = [];
const ruleKeys = new Set();
for (const [tag, lemmaSuffix] of templates) {
  for (const form of generateInflections(`zzzz${lemmaSuffix}`, [tag])) {
    if (!form.romaji.startsWith("zzzz")) continue;
    const formSuffix = form.romaji.slice(4);
    const key = `${formSuffix}\0${lemmaSuffix}\0${tag}\0${form.label}`;
    if (ruleKeys.has(key)) continue;
    ruleKeys.add(key);
    formRules.push([formSuffix, lemmaSuffix, tag, form.label]);
  }
}
formRules.sort((left, right) => right[0].length - left[0].length);

const irregularForms = Object.create(null);
for (const lemma of ["ii", "aru", "gozaru", "da", "desu"]) {
  for (const [tag, gloss, score] of lemmas[lemma] || []) {
    for (const form of generateInflections(lemma, [tag])) {
      (irregularForms[form.romaji] ||= []).push([form.label, lemma, gloss, score + 100]);
    }
  }
}

const payload = JSON.stringify({
  source: "JMdict (EDRDG), distributed as jmdict-simplified 3.6.2",
  frequencySource: "FrequencyWords Japanese OpenSubtitles 2018",
  learnerTierSource: "TKG Japanese-English Learner's Deck basic/core tiers (commit 32c267cbfa7756a2e3542657772759d92d4e2420)",
  dictDate: source.dictDate,
  format: 5,
  lookup,
  heads,
  lemmas,
  formRules,
  irregularForms,
  groupHeads,
  nounKeys: [...nounKeys],
  pronounKeys: [...pronounKeys],
});
const compressed = gzipSync(payload, { level: 9 });
await writeFile(outputFile, compressed);
const meaningCount = Object.values(lookup).reduce((total, meanings) => total + meanings.length, 0);
console.log(`Wrote ${Object.keys(lookup).length.toLocaleString()} romaji keys, ${meaningCount.toLocaleString()} distinct glosses, ${Object.keys(lemmas).length.toLocaleString()} inflectable lemmas, and ${formRules.length} form rules; ${Buffer.byteLength(payload).toLocaleString()} bytes JSON, ${compressed.byteLength.toLocaleString()} bytes gzip.`);
