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
// Restore canonical source spacing before applying the annotations and their
// reviewed token positions. The final pass below presents these expressions as
// separate clickable words with the same contextual meaning.
const expressions = new Map([
  ["taisetsudesu", ["taisetsu", "desu"]],
  ["yoroshikuonegaishimasu", ["yoroshiku", "onegaishimasu"]],
  ["sukidesu", ["suki", "desu"]],
  ["samuidesu", ["samui", "desu"]],
  ["arigatougozaimasu", ["arigatou", "gozaimasu"]],
  ["arigatougozaimashita", ["arigatou", "gozaimashita"]],
  ["ohayougozaimasu", ["ohayou", "gozaimasu"]],
]);
const expressionSentences = new Map([
  ["arigatougozaimasu", "Thank you for coming."],
  ["arigatougozaimashita", "Thank you for the other day."],
  ["ohayougozaimasu", "Good morning, everyone."],
]);
const expressionApplies = (joined, example) => !expressionSentences.has(joined) || expressionSentences.get(joined) === example.english;
const suruEntries = new Map([...indexById.values()].filter((row) => row.pos_tags?.includes("verb-suru"))
  .map((row) => [row.id.slice(6).toLowerCase(), row]));
const nounReadings = new Set([...indexById.values()].filter((row) => row.pos_tags?.includes("noun"))
  .map((row) => row.id.slice(6).toLowerCase()));
const suruForms = {
  suru: "dictionary form", shita: "past", shimasu: "polite", shimashita: "polite past",
  shinai: "negative", shinakatta: "negative past", shimasen: "polite negative",
  shimasendeshita: "polite negative past",
};
const passiveContinuingGlosses = {
  hanbai: 'being sold', hakkou: 'being published', rensai: 'being serialized',
  kinshi: 'being prohibited', chuumoku: 'being watched or receiving attention',
  shitei: 'being designated', tousai: 'being equipped',
};
// Contextual English for passive examples whose noun gloss alone is not a verb.
const passiveGlosses = {
  kaketsu: 'was passed', setchi: 'was established', dounyuu: 'was introduced',
  koukai: 'was released', houdou: 'was reported', kyouka: 'was strengthened',
  taiho: 'was arrested', kaisei: 'was revised', keisai: 'was published',
  haken: 'was dispatched', hassha: 'was launched', haibi: 'was deployed',
  happyou: 'was announced', shikkou: 'was carried out', haishi: 'was discontinued',
  kaisai: 'was held', shidou: 'was trained', ninmei: 'was appointed',
  koufu: 'was issued', senshutsu: 'was elected', saitaku: 'was adopted',
  hatsubai: 'was released', shimei: 'was called on', kaijo: 'was lifted',
  saiyou: 'was hired', hyouji: 'is displayed', tekiyou: 'is applied',
};
const adjectiveFallbacks = { suki: 'na', daisuki: 'na', taisetsu: 'na', samui: 'i' };
const copulaForms = {
  da: 'plain copula', desu: 'polite copula', datta: 'plain past copula',
  deshita: 'polite past copula', janai: 'plain negative copula',
  janakatta: 'plain past negative copula', dewanai: 'negative copula',
  dewanakatta: 'past negative copula',
};
for (const deck of decks.values()) for (const card of deck.cards) for (const example of card.examples || []) {
  if (example.english === 'I live in California.') example.romaji = example.romaji.replace(/\bsundeiru\b/, 'sun de iru');
  for (const [joined, parts] of expressions) {
    if (!expressionApplies(joined, example)) continue;
    example.romaji = example.romaji.replace(new RegExp(`\\b${parts.join("\\s+")}\\b`, "g"), joined);
  }
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
      if (details.type === "multiple links" && expressions.has(details.romaji)) continue;
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
      const words = wordMeanings.map((item) => ({ ...item }));
      for (const word of words) {
        if (word.romaji.toLowerCase() === "deshita" && word.entryId === "09485_desu") {
          word.meaning = "was (polite past of desu)";
          continue;
        }
        if (word.romaji.toLowerCase() === "hashiridashita" && word.entryId === "00519_hashiru") {
          word.meaning = "started running (past of hashiridasu: hashiri + dasu)";
          continue;
        }
        if (word.romaji === "taisetsunisuru" && word.entryId === "26940_taisetsunisuru") {
          word.meaning = `${word.meaning} (compound expression: taisetsu ni + suru)`;
          continue;
        }
        if (word.romaji === "saremashita" && example.english === "As a result of the interview, I was hired.") {
          word.meaning = "was hired (polite past passive of suru, after saiyou)";
          continue;
        }
        if (word.romaji === "saremashita" && example.english === "The principal gave a speech.") {
          word.meaning = "gave (honorific polite past of suru, in o hanashi wo suru)";
          continue;
        }
        if (word.romaji === "kakusenakatta" && example.english === "I couldn't hide my surprise.") {
          word.meaning = "could not hide (past negative potential of kakusu)";
          continue;
        }
        const match = /^(.+?)(shimasendeshita|shinakatta|shimashita|shimasen|shimasu|shinai|shita|suru)$/i.exec(word.romaji);
        if (!match || !word.entryId) continue;
        const [, stem, ending] = match;
        const current = indexById.get(word.entryId);
        const currentName = word.entryId.slice(6).toLowerCase();
        const compound = suruEntries.get(`${stem.toLowerCase()}suru`);
        const verbalNoun = jmdict.lemmas?.[stem.toLowerCase()]?.some(([tag]) => tag === "vs");
        if ((!compound && !verbalNoun) || (!verbalNoun && !nounReadings.has(stem.toLowerCase()))
          || !current || ![stem.toLowerCase(), `${stem.toLowerCase()}suru`].includes(currentName)) continue;
        let meaning = word.meaning;
        if (currentName === stem.toLowerCase() && current.pos_tags?.includes("noun")) {
          const translations = { rikkouho: "run for election", chuumon: "order", shinpo: "advance", ketsuretsu: "break down", tantou: "be in charge", touchaku: "arrive", kakutoku: "acquire" };
          meaning = translations[stem.toLowerCase()] || compound?.gloss.split(/[;,]/)[0].trim() || meaning;
        }
        const form = suruForms[ending.toLowerCase()];
        word.meaning = `${meaning} (compound verb: ${stem} + ${ending}, ${form} of ${stem}suru)`;
      }
      const spans = [...example.romaji.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)*/g)];
      for (let i = 1; i < words.length; i++) {
        const ending = words[i].romaji.toLowerCase();
        if (!suruForms[ending]) continue;
        const separator = example.romaji.slice(spans[i - 1].index + spans[i - 1][0].length, spans[i].index);
        if (!/^\s+$/.test(separator)) continue;
        const noun = words[i - 1];
        const stem = noun.romaji.toLowerCase();
        const compound = suruEntries.get(`${stem}suru`);
        const nounEntry = indexById.get(noun.entryId);
        const verbalNoun = jmdict.lemmas?.[stem]?.some(([tag]) => tag === "vs");
        if ((!compound && !verbalNoun) || !nounEntry?.pos_tags?.includes("noun") || noun.entryId.slice(6).toLowerCase() !== stem) continue;
        const form = suruForms[ending];
        let gloss = compound?.gloss.split(/[;,]/)[0].trim() || noun.meaning;
        if (ending === "shinakatta" || ending === "shimasendeshita") {
          if (/^to be /i.test(gloss)) gloss = `was not ${gloss.slice(6)}`;
          else if (/^to /i.test(gloss)) gloss = `did not ${gloss.slice(3)}`;
          else if (stem === "genkyuu") gloss = "did not mention";
        }
        const meaning = `${gloss} (compound verb: ${stem} + ${ending}, ${form} of ${stem}suru)`;
        noun.meaning = meaning;
        words[i].meaning = meaning;
      }
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const form = /^(.+(?:te|de))(imasendeshita|imashita|inakatta|imasen|imasu|inai|ita|iru)$/i.exec(word.romaji);
        if (!form) continue;
        const [, teForm, auxiliary] = form;
        const auxiliaryDescription = {
          iru: 'plain', imasu: 'polite', ita: 'past', imashita: 'polite past',
          inai: 'negative', imasen: 'polite negative', inakatta: 'past negative', imasendeshita: 'polite past negative',
        }[auxiliary.toLowerCase()];
        const joinedPassive = /^(.+)sarete$/i.exec(teForm);
        if (joinedPassive && passiveContinuingGlosses[joinedPassive[1].toLowerCase()]) {
          const noun = joinedPassive[1].toLowerCase();
          word.meaning = `${passiveContinuingGlosses[noun]} (passive continuing form of ${noun} suru)`;
        }
        if (/^(?:sarete|shite)$/i.test(teForm)) {
          const previous = words[i - 1];
          const previousEntry = previous && indexById.get(previous.entryId);
          if (previousEntry?.pos_tags?.includes('noun') && jmdict.lemmas?.[previous.romaji.toLowerCase()]?.some(([tag]) => tag === 'vs')) {
            const voice = /^sarete$/i.test(teForm) ? 'passive continuing form' : 'continuing form';
            const contextual = /^sarete$/i.test(teForm) && passiveContinuingGlosses[previous.romaji.toLowerCase()];
            word.meaning = contextual ? `${contextual} (${voice} of ${previous.romaji} suru)`
              : `${voice} of ${previous.romaji} suru (${previous.meaning})`;
          } else if (/^sarete$/i.test(teForm)) word.meaning = 'passive continuing form of suru (be done)';
        }
        word.meaning += ` (${teForm} + ${auxiliary}: -te form + iru, ${auxiliaryDescription} continuing action or state)`;
      }
      for (let i = 1; i < words.length; i++) {
        if (!/^(?:iru|imasu|ita|imashita|inai|imasen|inakatta|imasendeshita)$/i.test(words[i].romaji)) continue;
        const previous = words[i - 1];
        if (!/(?:te|de)$/i.test(previous.romaji) || !/te.form|continuing/i.test(previous.meaning)) continue;
        const combined = `${previous.meaning} — continuing action or state (${previous.romaji} + ${words[i].romaji}: -te form + iru)`;
        previous.meaning = combined;
        words[i].meaning = combined;
      }
      let romaji = example.romaji;
      if (example.english === 'I live in California.' && romaji.includes('sun de iru')) {
        const at = words.findIndex((word, index) => word.romaji === 'sun' && words[index + 1]?.romaji === 'de' && words[index + 2]?.romaji === 'iru');
        if (at < 0) throw new Error('California example has unexpected continuous-form tokens');
        words.splice(at, 3, { romaji: 'sundeiru', meaning: 'live (sunde + iru: -te form of sumu + iru, continuing state)', entryId: '00673_sumu' });
        romaji = romaji.replace('sun de iru', 'sundeiru');
      }
      for (const [joined, parts] of expressions) {
        if (!expressionApplies(joined, example)) continue;
        const index = words.findIndex((word) => word.romaji === joined);
        if (index < 0) continue;
        const meaning = joined === "taisetsudesu" ? "is important" : joined === "samuidesu" ? "is cold"
          : joined === "arigatougozaimashita" ? "thank you (gozaimashita is the polite past of gozaimasu)" : words[index].meaning;
        words.splice(index, 1, ...parts.map((part) => ({ romaji: part, meaning })));
        romaji = romaji.replace(new RegExp(`\\b${joined}\\b`), parts.join(" "));
      }
      // A noun + passive suru can be written as one token or as two. Both
      // clickable pieces of a separated construction explain the same use.
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const contextualPassive = {
          erabareta: ['00835_erabu', 'erabu', /elected/i.test(example.english) ? 'was elected' : 'was chosen'],
          egakareta: ['02013_egaku', 'egaku', 'was painted'],
          okonawareta: ['01238_okonau', 'okonau', /meeting was held/i.test(example.english) ? 'was held' : 'was carried out'],
          tsukurareta: ['00481_tsukuru', 'tsukuru', 'was created'],
        }[word.romaji.toLowerCase()];
        if (contextualPassive && word.entryId === contextualPassive[0]) {
          word.meaning = `${contextualPassive[2]} (past passive of ${contextualPassive[1]})`;
        }
        const attached = /^(.+?)(saremashita|sareta|saremasen|sarenakatta|sarenai|saremasu|sareru)$/i.exec(word.romaji);
        const splitForm = /^(saremashita|sareta|saremasen|sarenakatta|sarenai|saremasu|sareru)$/i.test(word.romaji);
        const noun = splitForm ? words[i - 1] : null;
        const stem = attached ? attached[1].toLowerCase() : noun?.romaji.toLowerCase();
        const ending = attached ? attached[2].toLowerCase() : splitForm ? word.romaji.toLowerCase() : null;
        if (!stem || !ending || !passiveGlosses[stem]) continue;
        const entry = indexById.get(attached ? word.entryId : noun?.entryId);
        const sourceSuru = attached && entry?.id === '00392_suru'
          && jmdict.lemmas?.[stem]?.some(([tag]) => tag === 'vs');
        if (!entry?.pos_tags?.includes('noun') && !entry?.pos_tags?.includes('verb-suru') && !sourceSuru) continue;
        const form = /mashita$/.test(ending) ? 'polite past passive' : /nakatta$/.test(ending) ? 'negative past passive'
          : /ta$/.test(ending) ? 'past passive' : /masen$/.test(ending) ? 'polite negative passive'
            : /nai$/.test(ending) ? 'negative passive' : /masu$/.test(ending) ? 'polite passive' : 'passive';
        const base = passiveGlosses[stem];
        const gloss = base.replace(/^(?:was|is) /, `${/past/.test(form) ? 'was' : 'is'} ${/negative/.test(form) ? 'not ' : ''}`);
        const meaning = `${gloss} (${form} of ${stem} suru: ${stem} + ${ending})`;
        word.meaning = meaning;
        if (noun) noun.meaning = meaning;
      }
      // The copula makes a na-adjective a predicate; it does not turn the
      // adjective into a lexical verb. Keep both popup targets in sync.
      const positioned = [...romaji.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)*/g)];
      for (let i = 0; i + 1 < words.length; i++) {
        const adjective = words[i], copula = words[i + 1];
        const description = copulaForms[copula.romaji.toLowerCase()];
        if (!description || !/^\s+$/.test(romaji.slice(positioned[i].index + positioned[i][0].length, positioned[i + 1].index))) continue;
        const entry = indexById.get(adjective.entryId);
        const fallback = adjectiveFallbacks[adjective.romaji.toLowerCase()];
        const na = entry?.pos_tags?.includes('adjective-na') || fallback === 'na';
        const iAdjective = entry?.pos_tags?.includes('adjective-i') || fallback === 'i';
        if (!na && !iAdjective) continue;
        if (!na && !['desu'].includes(copula.romaji.toLowerCase())) continue;
        const grammar = na ? `na-adjective + ${description}, forming a predicate`
          : `i-adjective + polite desu`;
        const meaning = `${adjective.meaning} (${grammar})`;
        adjective.meaning = meaning;
        copula.meaning = meaning;
      }
      example.romaji = romaji;
      example.wordMeanings = words;
      assignedExamples += 1;
      assignedTokens += words.length;
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
