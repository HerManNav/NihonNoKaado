import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const [projectRoot, tkgRoot, tkgIndexPath, frequencyCsvPath] = process.argv.slice(1).includes("--")
  ? process.argv.slice(process.argv.indexOf("--") + 1)
  : process.argv.slice(2);
if (!projectRoot || !tkgRoot || !tkgIndexPath || !frequencyCsvPath) {
  console.error("Usage: node scripts/generate-default-decks.mjs -- <project-root> <tkg-repo-root> <tkg-entries-index.json> <noos-frequency.csv>");
  process.exit(2);
}

const FREQUENCY_SOURCE = "https://noosflashcards.com/resources/frequency-lists/japanese";
const EXAMPLE_SOURCE = "https://github.com/tkgally/je-dict-1";
const sizes = [50, 100, 500, 1000, 2000];

const rows = parseCsv(await readFile(frequencyCsvPath, "utf8"));
const index = JSON.parse(await readFile(tkgIndexPath, "utf8")).entries;
const entriesByHeadword = new Map();
for (const entry of index) {
  if (!entriesByHeadword.has(entry.headword)) entriesByHeadword.set(entry.headword, []);
  entriesByHeadword.get(entry.headword).push(entry);
}

const usableWords = [];
const seenRomaji = new Set();
const rejected = { noTkgEntry: 0, noSenseExample: 0, duplicateRomaji: 0, badReading: 0 };
for (const row of rows.slice(1)) {
  const fields = Object.fromEntries(rows[0].map((column, i) => [column, row[i] ?? ""]));
  if (!fields.Word || !fields.Reading) continue;
  const entry = findTkgEntry(fields.Word.trim(), fields.Reading.trim(), entriesByHeadword);
  if (!entry) { rejected.noTkgEntry += 1; continue; }
  const tkgEntry = JSON.parse(await readFile(path.join(tkgRoot, entry.path), "utf8"));
  const selected = selectSenseAndExample(tkgEntry);
  if (!selected) { rejected.noSenseExample += 1; continue; }
  const hiragana = kanaOnly(tkgEntry.reading);
  const japanese = kanaToRomaji(hiragana);
  if (!/^[a-z' .,!?;:()\-…「」『』]+$/i.test(japanese)) { rejected.badReading += 1; continue; }
  const key = japanese.toLowerCase();
  if (seenRomaji.has(key)) { rejected.duplicateRomaji += 1; continue; }
  seenRomaji.add(key);
  const exampleHiragana = cleanJapanese(selected.example.japanese);
  const exampleRomaji = kanaToRomaji(exampleHiragana);
  usableWords.push({
    rank: Number(fields.Rank),
    card: {
      japanese,
      hiragana,
      english: selected.definition.gloss,
      examples: [{ romaji: exampleRomaji, hiragana: exampleHiragana, english: selected.example.english.trim() }],
    },
  });
  if (usableWords.length === 2000) break;
}

if (usableWords.length < 2000) {
  throw new Error(`Only ${usableWords.length} unique, sourced entries passed the example checks; 2,000 required. Rejections: ${JSON.stringify(rejected)}`);
}

const output = path.join(projectRoot, "decks");
for (const size of sizes) {
  const file = path.join(output, `most-common-${size}.json`);
  await writeFile(file, `${JSON.stringify({
    format: "japanese-cards-deck",
    version: 3,
    name: `Most common Japanese — ${size} words`,
    source: `Frequency ranks: ${FREQUENCY_SOURCE} (Leipzig Corpora Collection news counts; licensed CC BY-SA 4.0). English meanings and sense-tagged examples: ${EXAMPLE_SOURCE} (CC0). The list skips duplicate romaji and entries without a complete example tagged to the selected sense.`,
    cards: usableWords.slice(0, size).map(({ card }) => card),
  }, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify({ generatedCounts: sizes, maximumSourceRank: usableWords.at(-1).rank, rejected, examplesSelectedBySenseTag: true }, null, 2));

function parseCsv(text) {
  const matrix = [];
  let row = [];
  let value = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { value += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(value); value = ""; }
    else if (char === "\n") { row.push(value.replace(/\r$/, "")); matrix.push(row); row = []; value = ""; }
    else value += char;
  }
  if (value || row.length) { row.push(value.replace(/\r$/, "")); matrix.push(row); }
  return matrix;
}

function findTkgEntry(word, romanizedReading, byHeadword) {
  const headwords = splitAlternatives(word).map(cleanHeadword);
  const requestedReading = normalizeRomanization(romanizedReading);
  for (const headword of headwords) {
    for (const entry of byHeadword.get(headword) || []) {
      if (normalizeRomanization(kanaToRomaji(kanaOnly(entry.reading))) === requestedReading) return entry;
    }
  }
  return null;
}

function splitAlternatives(value) {
  return String(value).split(/\s*;\s*/).map((part) => part.trim()).filter(Boolean);
}

function cleanHeadword(value) {
  return value.replace(/^\([^)]*\)\s*/, "").replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function selectSenseAndExample(entry) {
  const definitions = [...(entry.definitions || [])].sort((a, b) => a.sense_number - b.sense_number);
  for (const definition of definitions) {
    const example = (entry.examples || []).find((candidate) =>
      Array.isArray(candidate.sense_numbers)
      && candidate.sense_numbers.includes(definition.sense_number)
      && isCompleteExample(candidate));
    if (example) return { definition, example };
  }
  return null;
}

function isCompleteExample(example) {
  if (typeof example.japanese !== "string" || typeof example.english !== "string") return false;
  if (!/[。！？!?」』]$/.test(example.japanese.trim())) return false;
  if (!/[.!?…」)'”]$/.test(example.english.trim())) return false;
  if (/please add|translation needed|\[translation/i.test(example.english)) return false;
  const hiragana = cleanJapanese(example.japanese);
  return hiragana.length > 0 && !/\p{Script=Han}/u.test(hiragana) && !/[{}⟦⟧→]/.test(hiragana);
}

function cleanJapanese(value) {
  return kanaOnly(String(value)
    .replace(/⟦(.*?)⟧/gs, (_, inner) => inner.split("→")[0])
    .replace(/\{[^{}|]+\|([^{}]+)\}/g, "$1")
    .replace(/\s+/g, " ").trim());
}

function kanaOnly(value) {
  return Array.from(String(value), (char) => {
    const code = char.codePointAt(0);
    return code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : char;
  }).join("");
}

function normalizeRomanization(value) {
  const reading = String(value).split("·").at(-1).trim();
  return reading.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/ou|oo|ō/g, "o").replace(/uu|ū/g, "u").replace(/aa|ā/g, "a")
    .replace(/ii|ī/g, "i").replace(/ei|ee|ē/g, "e").replace(/[’'\-\s]/g, "");
}

function kanaToRomaji(value) {
  const kana = kanaOnly(value);
  const syllables = {
    きゃ: "kya", きゅ: "kyu", きょ: "kyo", ぎゃ: "gya", ぎゅ: "gyu", ぎょ: "gyo",
    しゃ: "sha", しゅ: "shu", しょ: "sho", じゃ: "ja", じゅ: "ju", じょ: "jo",
    ちゃ: "cha", ちゅ: "chu", ちょ: "cho", にゃ: "nya", にゅ: "nyu", にょ: "nyo",
    ひゃ: "hya", ひゅ: "hyu", ひょ: "hyo", びゃ: "bya", びゅ: "byu", びょ: "byo",
    ぴゃ: "pya", ぴゅ: "pyu", ぴょ: "pyo", みゃ: "mya", みゅ: "myu", みょ: "myo",
    りゃ: "rya", りゅ: "ryu", りょ: "ryo", うぃ: "wi", うぇ: "we", うぉ: "wo", ふぁ: "fa", ふぃ: "fi", ふぇ: "fe", ふぉ: "fo",
  };
  const base = {
    あ: "a", い: "i", う: "u", え: "e", お: "o", か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
    が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go", さ: "sa", し: "shi", す: "su", せ: "se", そ: "so",
    ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo", た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
    だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do", な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
    は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho", ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
    ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po", ま: "ma", み: "mi", む: "mu", め: "me", も: "mo",
    や: "ya", ゆ: "yu", よ: "yo", ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro", わ: "wa", を: "wo",
    ん: "n", ゔ: "vu", ゐ: "wi", ゑ: "we", ゕ: "ka", ゖ: "ke",
  };
  const result = [];
  for (let i = 0; i < kana.length;) {
    const pair = kana.slice(i, i + 2);
    const char = kana[i];
    if (char === "っ") {
      const next = syllables[pair.slice(1)] || base[kana[i + 1]] || "";
      result.push(next.startsWith("ch") ? "t" : next[0] || "");
      i += 1;
      continue;
    }
    if (char === "ん") {
      const next = kana[i + 1] || "";
      result.push(/[あいうえおやゆよ]/.test(next) ? "n'" : "n");
      i += 1;
      continue;
    }
    if (char === "ー") {
      const previous = result.join("").match(/[aeiou](?!.*[aeiou])/);
      result.push(previous?.[0] || "-");
      i += 1;
      continue;
    }
    if (syllables[pair]) { result.push(syllables[pair]); i += 2; continue; }
    if (char === "ぁ" || char === "ぃ" || char === "ぅ" || char === "ぇ" || char === "ぉ") {
      result.push(({ ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o" })[char]); i += 1; continue;
    }
    const punctuation = { "。": ".", "、": ",", "？": "?", "！": "!", "：": ":", "；": ";", "「": '"', "」": '"', "『": "'", "』": "'" };
    result.push(base[char] || punctuation[char] || char);
    i += 1;
  }
  return result.join("");
}
