import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const [projectRoot, tkgEntriesRoot, mode = "--dry-run"] = process.argv.slice(2);
if (!projectRoot || !tkgEntriesRoot || !["--dry-run", "--write"].includes(mode)) {
  console.error("Usage: node scripts/space-example-romaji.mjs <project-root> <TKG-entries-directory> [--dry-run|--write]");
  process.exit(2);
}

const deckDirectory = path.join(projectRoot, "decks");
const deckFiles = (await readdir(deckDirectory))
  .filter((name) => /^most-common-(50|100|500|1000|2000)\.json$/.test(name))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

const examplesByKey = new Map();
const examplesByHiragana = new Map();
for (const file of await findJsonFiles(tkgEntriesRoot)) {
  let entry;
  try { entry = JSON.parse(await readFile(file, "utf8")); } catch { continue; }
  for (const example of entry.examples || []) {
    if (typeof example.japanese !== "string" || typeof example.english !== "string") continue;
    const clean = cleanJapanese(example.japanese);
    const key = exampleKey(clean, example.english);
    if (!examplesByKey.has(key)) examplesByKey.set(key, []);
    examplesByKey.get(key).push(example.japanese);
    const hiraganaKey = clean.replace(/\s+/g, "").trim();
    if (!examplesByHiragana.has(hiraganaKey)) examplesByHiragana.set(hiraganaKey, []);
    examplesByHiragana.get(hiraganaKey).push(example.japanese);
  }
}

const changes = [];
const missing = [];
let unchanged = 0;
for (const filename of deckFiles) {
  const file = path.join(deckDirectory, filename);
  const deck = JSON.parse(await readFile(file, "utf8"));
  for (const [cardIndex, card] of deck.cards.entries()) {
    for (const [exampleIndex, example] of (card.examples || []).entries()) {
      const exactMatches = examplesByKey.get(exampleKey(example.hiragana, example.english)) || [];
      const matches = exactMatches.length ? exactMatches : examplesByHiragana.get(String(example.hiragana).replace(/\s+/g, "").trim()) || [];
      const match = matches.map((source) => tokenizeExample(source, example.romaji))
        .find((candidate) => candidate !== null);
      if (!match) {
        missing.push({ location: `${filename} card ${cardIndex + 1}, example ${exampleIndex + 1}`, hiragana: example.hiragana, english: example.english, sourceExamples: matches.slice(0, 2) });
        continue;
      }
      if (match !== example.romaji) {
        changes.push({ filename, cardIndex, exampleIndex, previous: example.romaji, spaced: match });
        if (mode === "--write") example.romaji = match;
      } else unchanged += 1;
    }
  }
  if (mode === "--write" && !missing.some((item) => item.location.startsWith(`${filename} `))) {
    await writeFile(file, `${JSON.stringify(deck, null, 2)}\n`, "utf8");
  }
}

console.log(JSON.stringify({
  mode,
  decks: deckFiles.length,
  examplesChanged: changes.length,
  examplesAlreadySpaced: unchanged,
  unmatchedExamples: missing.length,
  firstChanges: changes.slice(0, 12),
  unmatched: missing.slice(0, 12),
}, null, 2));
if (missing.length) process.exitCode = 1;

async function findJsonFiles(directory) {
  const results = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, item.name);
    if (item.isDirectory()) results.push(...await findJsonFiles(fullPath));
    else if (item.isFile() && item.name.endsWith(".json")) results.push(fullPath);
  }
  return results;
}

function exampleKey(hiragana, english) {
  return `${String(hiragana).replace(/\s+/g, "").trim()}\u0000${String(english).trim()}`;
}

function cleanJapanese(value) {
  return kanaOnly(String(value)
    .replace(/⟦(.*?)⟧/gs, (_, inner) => inner.split("→")[0])
    .replace(/\{[^{}|]+\|([^{}]+)\}/g, "$1")
    .replace(/\s+/g, " ").trim());
}

function tokenizeExample(source, expectedRomaji) {
  const pieces = [];
  const matcher = /⟦(.*?)⟧|([^⟦]+)/gs;
  for (const match of source.matchAll(matcher)) {
    const text = match[1] !== undefined ? match[1].split("→")[0] : match[2];
    const kana = cleanJapanese(text);
    if (kana) pieces.push(...(kana.match(/[^。、！？：；「」『』]+|[。、！？：；「」『』]/g) || []));
  }
  if (!pieces.length) return null;
  const mergedPieces = [];
  for (const piece of pieces) {
    if (mergedPieces.at(-1)?.endsWith("っ")) mergedPieces[mergedPieces.length - 1] += piece;
    else mergedPieces.push(piece);
  }
  const spaced = joinRomajiPieces(mergedPieces.map(kanaToRomaji));
  const normalize = (value) => String(value).replace(/n'\s*/g, "n").replace(/\s/g, "").toLowerCase();
  return normalize(spaced) === normalize(expectedRomaji)
    ? spaced
    : null;
}

function joinRomajiPieces(pieces) {
  let result = "";
  for (const piece of pieces) {
    if (!piece) continue;
    const punctuationOnly = /^[.,!?;:)\]'"…]+$/.test(piece);
    if (result && !punctuationOnly && !/[([{/'"「『]$/.test(result)) result += " ";
    result += piece;
  }
  return result;
}

function kanaOnly(value) {
  return Array.from(String(value), (char) => {
    const code = char.codePointAt(0);
    return code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : char;
  }).join("");
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
  const output = [];
  for (let i = 0; i < kana.length;) {
    const pair = kana.slice(i, i + 2);
    const char = kana[i];
    if (char === "っ") {
      const next = syllables[pair.slice(1)] || base[kana[i + 1]] || "";
      output.push(next.startsWith("ch") ? "t" : next[0] || ""); i += 1; continue;
    }
    if (char === "ん") {
      output.push(/[あいうえおやゆよ]/.test(kana[i + 1] || "") ? "n'" : "n"); i += 1; continue;
    }
    if (char === "ー") {
      const previous = output.join("").match(/[aeiou](?!.*[aeiou])/);
      output.push(previous?.[0] || "-"); i += 1; continue;
    }
    if (syllables[pair]) { output.push(syllables[pair]); i += 2; continue; }
    if ("ぁぃぅぇぉ".includes(char)) { output.push(({ ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o" })[char]); i += 1; continue; }
    const punctuation = { "。": ".", "、": ",", "？": "?", "！": "!", "：": ":", "；": ";", "「": '"', "」": '"', "『": "'", "』": "'" };
    output.push(base[char] || punctuation[char] || char);
    i += 1;
  }
  return output.join("");
}
