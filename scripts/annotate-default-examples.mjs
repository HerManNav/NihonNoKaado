import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { annotateExample } from "./tkg-context-meaning.mjs";

// Run without --write to inspect full coverage and the sense-review queue.
// The pinned source JSON is retained in chunked archives under source-data.
const SOURCE_COMMIT = "32c267cbfa7756a2e3542657772759d92d4e2420";
const SHORT_COMMIT = SOURCE_COMMIT.slice(0, 8);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DICTIONARY_DIRECTORY = path.join(ROOT, "dictionaries");
const SOURCE_DIRECTORY = path.join(DICTIONARY_DIRECTORY, "source-data");
const INDEX_FILE = path.join(SOURCE_DIRECTORY, `tkg-entries-index-${SHORT_COMMIT}.json`);
const SPACING_OVERRIDES_FILE = path.join(ROOT, "scripts/default-example-spacing-overrides.json");
const EXAMPLE_REPLACEMENTS_FILE = path.join(ROOT, "scripts/default-example-replacements.json");
const MEANING_OVERRIDES_FILE = path.join(ROOT, "scripts/default-example-meaning-overrides.json");
const JMDICT_FILE = path.join(DICTIONARY_DIRECTORY, "romaji-english-jmdict-2026-11-02.json.gz");
const DECK_SIZES = [50, 100, 500, 1000, 2000];
const argumentsSet = new Set(process.argv.slice(2));
const write = argumentsSet.has("--write");
const check = argumentsSet.has("--check");
const reportArgument = [...argumentsSet].find((arg) => arg.startsWith("--report="));
const reportPath = reportArgument ? path.resolve(ROOT, reportArgument.slice("--report=".length)) : null;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizeKana(value) {
  return Array.from(String(value || ""), (character) => {
    const code = character.codePointAt(0);
    return code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : character;
  }).join("");
}

function cleanJapanese(value) {
  return normalizeKana(String(value || "")
    .replace(/⟦(.*?)⟧/gs, (_, link) => link.split("→")[0])
    .replace(/\{[^{}|]+\|([^{}]+)\}/g, "$1")
    .replace(/\s+/g, ""));
}

function sourceKey(hiragana, english) {
  return `${normalizeKana(String(hiragana).replace(/\s+/g, ""))}\0${String(english).trim()}`;
}

function exampleKey(example) {
  return `${example.romaji}\0${example.hiragana}\0${example.english}`;
}

function tokenList(romaji) {
  return String(romaji || "").match(/[A-Za-z]+(?:['’][A-Za-z]+)*/g) || [];
}

function glossOverlap(left, right) {
  const ignored = new Set(["a", "an", "the", "to", "of", "for", "in", "on", "as", "and", "or", "be", "is", "used"]);
  const words = (value) => new Set(String(value).toLowerCase().match(/[a-z]+/g)?.filter((word) => !ignored.has(word)) || []);
  const a = words(left);
  const b = words(right);
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const word of a) if (b.has(word)) common += 1;
  return common / (a.size + b.size - common);
}

async function loadSourceArchiveSet(prefix, entriesById) {
  const manifestFile = path.join(SOURCE_DIRECTORY, `${prefix}-${SHORT_COMMIT}-manifest.json`);
  const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
  if (manifest.format !== 1 || manifest.sourceCommit !== SOURCE_COMMIT) {
    throw new Error(`Unexpected TKG source manifest: ${manifestFile}`);
  }
  for (const archive of manifest.archives) {
    const bytes = await readFile(path.join(SOURCE_DIRECTORY, archive.file));
    if (bytes.length !== archive.bytes || sha256(bytes) !== archive.sha256) {
      throw new Error(`TKG source archive hash mismatch: ${archive.file}`);
    }
    const payload = JSON.parse(gunzipSync(bytes).toString("utf8"));
    if (payload.format !== 1 || payload.sourceCommit !== SOURCE_COMMIT || payload.entries?.length !== archive.entries) {
      throw new Error(`Unexpected TKG source archive content: ${archive.file}`);
    }
    for (const record of payload.entries) {
      if (sha256(record.content) !== record.sha256) throw new Error(`TKG entry hash mismatch: ${record.id}`);
      const entry = JSON.parse(record.content);
      if (entry.id !== record.id) throw new Error(`TKG entry ID mismatch: ${record.id}`);
      const prior = entriesById.get(entry.id);
      if (prior && prior.sha256 !== record.sha256) throw new Error(`Conflicting TKG entry copies: ${entry.id}`);
      entriesById.set(entry.id, { entry, path: record.path, sha256: record.sha256 });
    }
  }
  return manifest;
}

function selectSourceMatch(matches, card) {
  const reading = normalizeKana(card.hiragana);
  const candidates = matches.filter(({ sourceEntry }) => normalizeKana(sourceEntry.reading) === reading);
  if (!candidates.length) return null;
  const scored = candidates.map((candidate) => {
    const { sourceEntry, sourceExample } = candidate;
    const allowedSenses = new Set(sourceExample.sense_numbers || []);
    const definitions = (sourceEntry.definitions || []).filter((definition) => allowedSenses.has(definition.sense_number));
    const exactSense = definitions.some((definition) => definition.gloss.trim() === card.english.trim());
    const exactHead = sourceEntry.gloss?.trim() === card.english.trim();
    const overlap = Math.max(0, ...definitions.map((definition) => glossOverlap(definition.gloss, card.english)));
    return { ...candidate, score: (exactSense ? 100 : 0) + (exactHead ? 50 : 0) + overlap };
  }).sort((a, b) => b.score - a.score || a.sourceEntry.id.localeCompare(b.sourceEntry.id));
  if (scored.length > 1 && scored[0].score === scored[1].score
    && scored[0].sourceEntry.id !== scored[1].sourceEntry.id) return null;
  return scored[0];
}

const indexBytes = await readFile(INDEX_FILE);
const index = JSON.parse(indexBytes.toString("utf8"));
const indexById = new Map(index.entries.map((entry) => [entry.id, entry]));
const entriesWithSource = new Map();
const cardSourceManifest = await loadSourceArchiveSet("tkg-example-entries", entriesWithSource);
const cardSourceIds = new Set(entriesWithSource.keys());
const linkedSourceManifest = await loadSourceArchiveSet("tkg-linked-entries", entriesWithSource);
for (const manifest of [cardSourceManifest, linkedSourceManifest]) {
  if (manifest.indexFile !== path.basename(INDEX_FILE) || manifest.indexSha256 !== sha256(indexBytes)) {
    throw new Error("Pinned TKG index does not match source archive manifest");
  }
}
const entriesById = new Map([...entriesWithSource].map(([id, row]) => [id, row.entry]));
const jmdict = JSON.parse(gunzipSync(await readFile(JMDICT_FILE)).toString("utf8"));
if (jmdict.format !== 5 || !jmdict.lookup || !jmdict.heads) {
  throw new Error(`Unexpected JMdict fallback format: ${JMDICT_FILE}`);
}
const sourceExamples = new Map();
for (const id of cardSourceIds) {
  const sourceEntry = entriesById.get(id);
  for (const sourceExample of sourceEntry.examples || []) {
    if (typeof sourceExample.japanese !== "string" || typeof sourceExample.english !== "string") continue;
    const key = sourceKey(cleanJapanese(sourceExample.japanese), sourceExample.english);
    if (!sourceExamples.has(key)) sourceExamples.set(key, []);
    sourceExamples.get(key).push({ sourceEntry, sourceExample });
  }
}

const decks = new Map();
for (const size of DECK_SIZES) {
  decks.set(size, JSON.parse(await readFile(path.join(DICTIONARY_DIRECTORY, `most-common-${size}.json`), "utf8")));
}
const exampleReplacements = JSON.parse(await readFile(EXAMPLE_REPLACEMENTS_FILE, "utf8"));
const replacementsByOriginal = new Map();
const replacementsByNew = new Map();
for (const row of exampleReplacements) {
  const sourceEntry = entriesById.get(row.sourceEntryId);
  const sourceExample = sourceEntry?.examples?.find((item) => item.id === row.sourceExampleId);
  if (!sourceExample || sourceKey(cleanJapanese(sourceExample.japanese), sourceExample.english)
    !== sourceKey(row.newExample.hiragana, row.newExample.english)
    || sourceExample.sense_numbers?.length !== 1) {
    throw new Error(`Example replacement does not match one pinned source sense: ${row.sourceExampleId}`);
  }
  const oldKey = exampleKey(row.oldExample);
  const newKey = exampleKey(row.newExample);
  if (replacementsByOriginal.has(oldKey) || replacementsByNew.has(newKey)) {
    throw new Error(`Duplicate example replacement: ${row.sourceExampleId}`);
  }
  replacementsByOriginal.set(oldKey, row);
  replacementsByNew.set(newKey, row);
}
const seenReplacements = new Set();
let replacedOccurrences = 0;
for (const deck of decks.values()) {
  for (const card of deck.cards) {
    for (const example of card.examples || []) {
      const oldKey = exampleKey(example);
      const row = replacementsByOriginal.get(oldKey) || replacementsByNew.get(oldKey);
      if (!row) continue;
      if (normalizeKana(card.hiragana) !== normalizeKana(entriesById.get(row.sourceEntryId).reading)) {
        throw new Error(`Example replacement ${row.sourceExampleId} matched an unrelated card`);
      }
      seenReplacements.add(row);
      if (oldKey !== exampleKey(row.newExample)) {
        Object.assign(example, row.newExample);
        delete example.wordMeanings;
        replacedOccurrences += 1;
      }
    }
  }
}
if (seenReplacements.size !== exampleReplacements.length) {
  throw new Error(`Only found ${seenReplacements.size}/${exampleReplacements.length} pinned example replacements in the decks`);
}
const spacingOverrides = JSON.parse(await readFile(SPACING_OVERRIDES_FILE, "utf8"));
const spacingByOriginal = new Map();
const spacingByCorrected = new Map();
for (const row of spacingOverrides) {
  const original = { romaji: row.originalRomaji, hiragana: row.hiragana, english: row.english };
  const corrected = { ...original, romaji: row.correctedRomaji };
  if (spacingByOriginal.has(exampleKey(original)) || spacingByCorrected.has(exampleKey(corrected))) {
    throw new Error(`Duplicate spacing override for ${row.english}`);
  }
  if (row.originalRomaji.replace(/\s+/g, "") !== row.correctedRomaji.replace(/\s+/g, "")) {
    throw new Error(`Spacing override changes nonspace characters: ${row.english}`);
  }
  spacingByOriginal.set(exampleKey(original), row);
  spacingByCorrected.set(exampleKey(corrected), row);
}
const seenSpacingOverrides = new Set();
let spacingOccurrences = 0;
for (const deck of decks.values()) {
  for (const card of deck.cards) {
    for (const example of card.examples || []) {
      const originalKey = exampleKey(example);
      const row = spacingByOriginal.get(originalKey) || spacingByCorrected.get(originalKey);
      if (!row) continue;
      seenSpacingOverrides.add(row);
      if (example.romaji !== row.correctedRomaji) {
        example.romaji = row.correctedRomaji;
        spacingOccurrences += 1;
      }
    }
  }
}
if (seenSpacingOverrides.size !== spacingOverrides.length) {
  throw new Error(`Only found ${seenSpacingOverrides.size}/${spacingOverrides.length} exact-example spacing overrides in the decks`);
}
const meaningOverrides = JSON.parse(await readFile(MEANING_OVERRIDES_FILE, "utf8"));
const meaningOverrideBySourceToken = new Map();
for (const row of meaningOverrides) {
  const key = `${row.sourceExampleId}\0${row.index}`;
  if (meaningOverrideBySourceToken.has(key) || tokenList(row.exampleRomaji)[row.index] !== row.romaji
    || !row.meaning?.trim() || !row.basis?.trim()) {
    throw new Error(`Invalid exact-source meaning override: ${row.sourceExampleId} token ${row.index}`);
  }
  meaningOverrideBySourceToken.set(key, row);
}
const usedMeaningOverrides = new Set();
const annotationsByExample = new Map();
const reviews = [];
const errors = [];
const sourceReferences = [];
const mainDeckExampleKeys = new Set(decks.get(2000).cards.flatMap((card) => (card.examples || []).map(exampleKey)));
for (const size of DECK_SIZES) {
  const cards = decks.get(size).cards;
  if (cards.length !== size) errors.push({ location: `${size}-word deck`, issue: `Expected ${size} cards, got ${cards.length}` });
  for (const [cardIndex, card] of cards.entries()) {
    if (card.examples?.length !== 1) {
      errors.push({ location: `${size}-word card ${cardIndex + 1} (${card.japanese})`, issue: "Expected exactly one example" });
    }
  }
}
const canonicalCards = [
  ...decks.get(2000).cards.map((card, index) => ({ card, deckSize: 2000, cardIndex: index })),
  ...decks.get(100).cards.map((card, index) => ({ card, deckSize: 100, cardIndex: index })),
];
for (const { card, deckSize, cardIndex } of canonicalCards) {
  for (const [exampleIndex, example] of (card.examples || []).entries()) {
    const key = exampleKey(example);
    if (annotationsByExample.has(key)) continue;
    const location = `${deckSize}-word card ${cardIndex + 1} (${card.japanese}), example ${exampleIndex + 1}`;
    const matches = sourceExamples.get(sourceKey(example.hiragana, example.english)) || [];
    const selected = selectSourceMatch(matches, card);
    if (!selected) {
      errors.push({ location, issue: `No unique exact TKG source match among ${matches.length} candidates` });
      continue;
    }
    let result;
    try {
      result = annotateExample({
        card, example, sourceEntry: selected.sourceEntry, sourceExample: selected.sourceExample,
        entriesById, indexById, jmdict,
      });
    } catch (error) {
      errors.push({ location, issue: `Selector error: ${error.message}` });
      continue;
    }
    for (const [index] of tokenList(example.romaji).entries()) {
      const override = meaningOverrideBySourceToken.get(`${selected.sourceExample.id}\0${index}`);
      if (!override) continue;
      if (example.romaji !== override.exampleRomaji || !Array.isArray(result?.wordMeanings)
        || result.wordMeanings[index]?.romaji !== override.romaji) {
        errors.push({ location, issue: `Stale meaning override: ${override.sourceExampleId} token ${index}` });
        continue;
      }
      const prior = result.wordMeanings[index];
      result.wordMeanings[index] = {
        ...(override.preserveProvenance ? prior : {}),
        romaji: override.romaji, meaning: override.meaning,
        ...(override.entryId ? { entryId: override.entryId } : {}),
      };
      if (override.clearSense) delete result.wordMeanings[index].senseNumber;
      result.review = (result.review || []).filter((item) => item.index !== index);
      usedMeaningOverrides.add(override);
    }
    for (const review of result?.review || []) {
      const details = typeof review === "object" && review !== null ? review : { issue: String(review) };
      reviews.push({ location, exampleRomaji: example.romaji, exampleEnglish: example.english,
        sourceEntryId: selected.sourceEntry.id, ...details,
        selectedMeaning: Number.isInteger(details.index) ? result.wordMeanings?.[details.index]?.meaning : undefined });
    }
    const words = tokenList(example.romaji);
    if (!Array.isArray(result?.wordMeanings) || result.wordMeanings.length !== words.length
      || result.wordMeanings.some((row, index) => row.romaji !== words[index] || !row.meaning?.trim()
        || row.meaning === "Meaning needs review")) {
      errors.push({ location, issue: `Selector did not return one aligned meaning per visible token (${words.length})` });
      continue;
    }
    annotationsByExample.set(key, result.wordMeanings);
    sourceReferences.push({ location, sourceEntryId: selected.sourceEntry.id, sourceExampleId: selected.sourceExample.id });
  }
}
if (usedMeaningOverrides.size !== meaningOverrides.length) {
  errors.push({ location: "meaning overrides",
    issue: `Only used ${usedMeaningOverrides.size}/${meaningOverrides.length} exact-source meaning overrides` });
}

let assignedExamples = 0;
let assignedTokens = 0;
for (const size of DECK_SIZES) {
  for (const [cardIndex, card] of decks.get(size).cards.entries()) {
    for (const [exampleIndex, example] of (card.examples || []).entries()) {
      const wordMeanings = annotationsByExample.get(exampleKey(example));
      if (!wordMeanings) {
        errors.push({ location: `${size}-word card ${cardIndex + 1} (${card.japanese}), example ${exampleIndex + 1}`,
          issue: "No canonical word annotations for this example" });
        continue;
      }
      example.wordMeanings = wordMeanings;
      assignedExamples += 1;
      assignedTokens += wordMeanings.length;
    }
  }
}

const report = {
  sourceCommit: SOURCE_COMMIT,
  sourceArchiveCounts: { card: cardSourceManifest.archives.length, linked: linkedSourceManifest.archives.length,
    sourceCardEntries: cardSourceIds.size, loadedEntries: entriesById.size },
  decks: DECK_SIZES.map((size) => ({ size, cards: decks.get(size).cards.length })),
  uniqueExamples: annotationsByExample.size,
  legacySmallDeckOnlyExamples: [...annotationsByExample.keys()].filter((key) => !mainDeckExampleKeys.has(key)).length,
  exampleReplacements: exampleReplacements.length,
  replacedOccurrences,
  spacingOverrides: spacingOverrides.length,
  spacingOccurrences,
  meaningOverrides: meaningOverrides.length,
  usedMeaningOverrides: usedMeaningOverrides.size,
  assignedExamples,
  assignedTokens,
  errors,
  reviews,
  sourceReferences,
};
if (reportPath) await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  sourceCommit: SOURCE_COMMIT,
  uniqueExamples: report.uniqueExamples,
  legacySmallDeckOnlyExamples: report.legacySmallDeckOnlyExamples,
  exampleReplacements: report.exampleReplacements,
  replacedOccurrences,
  spacingOverrides: report.spacingOverrides,
  spacingOccurrences,
  meaningOverrides: report.meaningOverrides,
  usedMeaningOverrides: report.usedMeaningOverrides,
  assignedExamples,
  assignedTokens,
  errors: errors.length,
  reviews: reviews.length,
  firstErrors: errors.slice(0, 15),
  firstReviews: reviews.slice(0, 15),
  reportPath,
}, null, 2));

if (write || check) {
  if (errors.length || reviews.length) throw new Error(`Refusing to write decks: ${errors.length} errors and ${reviews.length} unresolved reviews`);
  for (const size of [2000, 1000, 500, 100, 50]) {
    const file = path.join(DICTIONARY_DIRECTORY, `most-common-${size}.json`);
    const generated = `${JSON.stringify(decks.get(size), null, 2)}\n`;
    if (check && await readFile(file, "utf8") !== generated) throw new Error(`Outdated contextual annotations: ${file}`);
    if (write) await writeFile(file, generated, "utf8");
  }
  console.log(write ? "Wrote contextual word meanings to all five default decks." : "All five default decks reproduce exactly.");
} else if (errors.length) {
  process.exitCode = 1;
}
