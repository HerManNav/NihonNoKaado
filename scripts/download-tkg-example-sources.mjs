import { createHash } from "node:crypto";
import { readFile, rename, stat, writeFile } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Preserve the exact TKG entries that could have supplied the default cards'
// examples. Each archive keeps the complete original JSON text, its path, and
// its hash; subsequent runs verify and skip complete chunks.
const COMMIT = "32c267cbfa7756a2e3542657772759d92d4e2420";
const SHORT_COMMIT = COMMIT.slice(0, 8);
const CHUNK_SIZE = 100;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIRECTORY = path.join(ROOT, "decks", "source-data");
const INDEX_PATH = path.join(SOURCE_DIRECTORY, `tkg-entries-index-${SHORT_COMMIT}.json`);
const BASE_URL = `https://raw.githubusercontent.com/tkgally/je-dict-1/${COMMIT}/`;
const SIZES = [50, 100, 500, 1000, 2000];
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const linkedMode = args.has("--linked-targets");
const concurrency = readPositiveInteger("--concurrency", 8);
const maxChunks = readPositiveInteger("--max-chunks", Infinity);

function readPositiveInteger(name, fallback) {
  const arg = [...args].find((value) => value.startsWith(`${name}=`));
  if (!arg) return fallback;
  const number = Number(arg.slice(name.length + 1));
  if (!Number.isInteger(number) || number < 1) throw new Error(`${name} needs a positive integer`);
  return number;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

const indexBytes = await readFile(INDEX_PATH);
const index = JSON.parse(indexBytes.toString("utf8"));
const byReading = new Map();
for (const entry of index.entries || []) {
  if (!byReading.has(entry.reading)) byReading.set(entry.reading, []);
  byReading.get(entry.reading).push(entry);
}
const cards = [];
for (const size of SIZES) {
  const deck = JSON.parse(await readFile(path.join(ROOT, "decks", `most-common-${size}.json`), "utf8"));
  for (const card of deck.cards || []) cards.push({ size, card });
}
const requested = new Map();
const missingReadings = [];
for (const { size, card } of cards) {
  const candidates = byReading.get(card.hiragana);
  if (!candidates?.length) {
    missingReadings.push({ size, reading: card.hiragana, romaji: card.japanese });
    continue;
  }
  for (const entry of candidates) requested.set(entry.path, entry);
}
if (missingReadings.length) throw new Error(`Missing TKG index readings: ${JSON.stringify(missingReadings.slice(0, 20))}`);
const cardCandidates = [...requested.values()].sort((a, b) => a.path.localeCompare(b.path));
const linkedProvenance = linkedMode ? await discoverLinkedTargets(cardCandidates) : null;
const candidates = linkedMode ? linkedProvenance.entries : cardCandidates;
const archivePrefix = linkedMode ? "tkg-linked-entries" : "tkg-example-entries";
const chunks = Array.from({ length: Math.ceil(candidates.length / CHUNK_SIZE) }, (_, number) => ({
  number,
  entries: candidates.slice(number * CHUNK_SIZE, (number + 1) * CHUNK_SIZE),
  file: path.join(SOURCE_DIRECTORY, `${archivePrefix}-${SHORT_COMMIT}-${String(number).padStart(4, "0")}.json.gz`),
}));
console.log(JSON.stringify({
  mode: linkedMode ? "linked-targets" : "card-sources",
  sourceCommit: COMMIT,
  cardRecords: cards.length,
  distinctReadings: new Set(cards.map(({ card }) => card.hiragana)).size,
  candidateEntries: candidates.length,
  chunks: chunks.length,
  chunkSize: CHUNK_SIZE,
  concurrency,
  dryRun,
  ...(linkedProvenance?.summary || {}),
}));
if (dryRun) process.exit(0);

async function fetchEntry(entry) {
  const url = `${BASE_URL}${entry.path}`;
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(45_000) });
      if (!response.ok) {
        if (response.status === 404) throw new Error(`Missing pinned entry: ${url}`);
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      const content = await response.text();
      const parsed = JSON.parse(content);
      if (parsed.id !== entry.id) throw new Error(`Entry ID mismatch at ${url}: ${parsed.id}`);
      if (!Array.isArray(parsed.examples) || !Array.isArray(parsed.definitions)) {
        throw new Error(`Missing examples or definitions at ${url}`);
      }
      return { id: entry.id, path: entry.path, sha256: sha256(content), content };
    } catch (error) {
      lastError = error;
      if (/Missing pinned entry|Entry ID mismatch|Missing examples or definitions/.test(error.message)) break;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw lastError;
}

function validateChunk(compressed, chunk) {
  const payload = JSON.parse(gunzipSync(compressed).toString("utf8"));
  if (payload.format !== 1 || payload.sourceCommit !== COMMIT || payload.entries?.length !== chunk.entries.length) {
    throw new Error(`Invalid source archive: ${chunk.file}`);
  }
  for (let index = 0; index < chunk.entries.length; index += 1) {
    const expected = chunk.entries[index];
    const actual = payload.entries[index];
    if (actual.id !== expected.id || actual.path !== expected.path || sha256(actual.content) !== actual.sha256) {
      throw new Error(`Source archive entry mismatch: ${chunk.file} ${expected.path}`);
    }
  }
  return payload;
}

async function loadExistingChunk(chunk) {
  try { return validateChunk(await readFile(chunk.file), chunk); }
  catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function downloadChunk(chunk) {
  const records = new Array(chunk.entries.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, records.length) }, async () => {
    while (next < records.length) {
      const index = next++;
      records[index] = await fetchEntry(chunk.entries[index]);
    }
  });
  const outcomes = await Promise.allSettled(workers);
  const failed = outcomes.find((outcome) => outcome.status === "rejected");
  if (failed) throw failed.reason;
  const payload = { format: 1, sourceCommit: COMMIT, entries: records };
  const compressed = gzipSync(JSON.stringify(payload), { level: 9 });
  if (compressed.length >= 25_000_000) throw new Error(`Archive exceeds 25 MB: ${chunk.file}`);
  validateChunk(compressed, chunk);
  const partial = `${chunk.file}.partial`;
  await writeFile(partial, compressed);
  await rename(partial, chunk.file);
  return payload;
}

let downloaded = 0;
let skipped = 0;
for (const chunk of chunks.slice(0, maxChunks)) {
  const existing = await loadExistingChunk(chunk);
  if (existing) skipped += 1;
  else {
    await downloadChunk(chunk);
    downloaded += 1;
  }
  const size = (await stat(chunk.file)).size;
  console.log(`chunk ${chunk.number + 1}/${chunks.length}: ${existing ? "verified" : "saved"} ${chunk.entries.length} entries, ${size} bytes`);
}

const allPresent = chunks.every((chunk) => chunk.number < Math.min(maxChunks, chunks.length));
if (allPresent) {
  const archives = [];
  const sourceEntries = new Map();
  for (const chunk of chunks) {
    const bytes = await readFile(chunk.file);
    const payload = validateChunk(bytes, chunk);
    archives.push({ file: path.basename(chunk.file), entries: payload.entries.length, bytes: bytes.length, sha256: sha256(bytes) });
    for (const entry of payload.entries) sourceEntries.set(entry.path, JSON.parse(entry.content));
  }
  const coverage = linkedMode ? linkedProvenance.summary : checkExampleCoverage(cards, byReading, sourceEntries);
  const manifest = {
    format: 1,
    source: "https://github.com/tkgally/je-dict-1",
    sourceCommit: COMMIT,
    indexFile: path.basename(INDEX_PATH),
    indexSha256: sha256(indexBytes),
    cardRecords: cards.length,
    candidateEntries: candidates.length,
    mode: linkedMode ? "linked-targets" : "card-sources",
    archives,
    coverage,
  };
  const manifestPath = path.join(SOURCE_DIRECTORY, `${archivePrefix}-${SHORT_COMMIT}-manifest.json`);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ complete: true, downloaded, skipped, coverage, manifestPath }, null, 2));
} else {
  console.log(JSON.stringify({ complete: false, downloaded, skipped, remainingChunks: chunks.length - Math.min(maxChunks, chunks.length) }));
}

function cleanJapanese(value) {
  const text = String(value)
    .replace(/⟦(.*?)⟧/gs, (_, inner) => inner.split("→")[0])
    .replace(/\{[^{}|]+\|([^{}]+)\}/g, "$1")
    .replace(/\s+/g, "");
  return Array.from(text, (char) => {
    const code = char.codePointAt(0);
    return code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : char;
  }).join("");
}

function checkExampleCoverage(cardRecords, readingIndex, sourceEntries) {
  const bySize = Object.fromEntries(SIZES.map((size) => [size, { records: 0, uniqueExact: 0, ambiguousExact: 0, unmatched: 0, kanaOnly: 0 }]));
  const unmatched = [];
  const ambiguous = [];
  for (const { size, card } of cardRecords) {
    for (const example of card.examples || []) {
      const stats = bySize[size];
      stats.records += 1;
      const candidates = readingIndex.get(card.hiragana) || [];
      const exact = [];
      const kanaOnly = [];
      for (const candidate of candidates) {
        const entry = sourceEntries.get(candidate.path);
        for (const sourceExample of entry?.examples || []) {
          if (cleanJapanese(sourceExample.japanese) !== cleanJapanese(example.hiragana)) continue;
          kanaOnly.push(candidate.id);
          if (sourceExample.english.trim() === example.english.trim()) exact.push(candidate.id);
        }
      }
      const uniqueExact = [...new Set(exact)];
      if (uniqueExact.length === 1) stats.uniqueExact += 1;
      else if (uniqueExact.length > 1) {
        stats.ambiguousExact += 1;
        if (ambiguous.length < 20) ambiguous.push({ size, romaji: card.japanese, example: example.english, candidates: uniqueExact });
      } else {
        stats.unmatched += 1;
        if (kanaOnly.length) stats.kanaOnly += 1;
        if (unmatched.length < 30) unmatched.push({ size, romaji: card.japanese, example: example.english, kanaOnlyCandidates: [...new Set(kanaOnly)] });
      }
    }
  }
  return { bySize, ambiguous, unmatched };
}

async function discoverLinkedTargets(cardCandidates) {
  const sourceEntries = new Map();
  const sourceChunks = Array.from({ length: Math.ceil(cardCandidates.length / CHUNK_SIZE) }, (_, number) => ({
    entries: cardCandidates.slice(number * CHUNK_SIZE, (number + 1) * CHUNK_SIZE),
    file: path.join(SOURCE_DIRECTORY, `tkg-example-entries-${SHORT_COMMIT}-${String(number).padStart(4, "0")}.json.gz`),
  }));
  for (const chunk of sourceChunks) {
    const payload = validateChunk(await readFile(chunk.file), chunk);
    for (const entry of payload.entries) sourceEntries.set(entry.path, JSON.parse(entry.content));
  }
  const indexById = new Map(index.entries.map((entry) => [entry.id, entry]));
  const linkedIds = new Set();
  let linkedOccurrences = 0;
  let exactExamples = 0;
  let ambiguousExamples = 0;
  for (const { card } of cards) {
    for (const example of card.examples || []) {
      const matches = [];
      for (const candidate of byReading.get(card.hiragana) || []) {
        const source = sourceEntries.get(candidate.path);
        for (const sourceExample of source?.examples || []) {
          if (cleanJapanese(sourceExample.japanese) === cleanJapanese(example.hiragana)
            && sourceExample.english.trim() === example.english.trim()) {
            matches.push(sourceExample);
          }
        }
      }
      if (!matches.length) throw new Error(`No exact source example for ${card.japanese}: ${example.english}`);
      exactExamples += 1;
      if (matches.length > 1) ambiguousExamples += 1;
      for (const match of matches) {
        for (const link of match.japanese.matchAll(/⟦(.*?)⟧/gs)) {
          const id = /[：:]([^：:]+)$/.exec(link[1])?.[1]?.trim();
          if (!id || !indexById.has(id)) throw new Error(`Unknown linked TKG entry ${id || "(empty)"}: ${match.japanese}`);
          linkedIds.add(id);
          linkedOccurrences += 1;
        }
      }
    }
  }
  const entries = [...linkedIds].map((id) => indexById.get(id))
    .sort((a, b) => a.path.localeCompare(b.path));
  return {
    entries,
    summary: {
      exactExampleRecords: exactExamples,
      ambiguousExampleRecords: ambiguousExamples,
      linkedOccurrences,
      distinctLinkedTargetIds: entries.length,
      alsoCardSourceEntries: entries.filter((entry) => sourceEntries.has(entry.path)).length,
    },
  };
}
