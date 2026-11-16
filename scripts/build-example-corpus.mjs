// Complete offline corpus; regenerate without network access or an AI service.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {annotateExample, romanizeSourceExample} from './tkg-context-meaning.mjs';
import {normalizeTopicParticleRomaji} from './topic-particle-romaji.mjs';
import core from '../deck-core.js';
import search from '../example-search.js';
import lookupApi from '../word-form-lookup.js';
import {buildConstructionIndex,buildConstructionSpellings} from './build-example-constructions.mjs';

const root = new URL('../', import.meta.url);
const read = async file => JSON.parse(await readFile(new URL(file, root), 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const MAX_BYTES = 20_000_000;
const buckets = Array.from({length: 64}, () => []);
const aliasesById = new Map(), dedup = new Set(), reviewedSentences = new Map();
const coveredSenses = new Set(), linkedCandidates = new Map(), meaningAliasesById = new Map();
const counts = {sourceEntries: 0, sourceExamples: 0, records: 0, skippedReading: 0,
  skippedSense: 0, skippedAnnotation: 0, automaticAnnotations: 0, reviewedRecords: 0, linkedFallbackRecords: 0};
const wordSet = new Set(), sentenceSet = new Set();

function add(row) {
  if (!core.normalizeWordMeanings(row.example.wordMeanings, row.example.romaji)) { counts.skippedAnnotation++; return; }
  const key = JSON.stringify([row.language, row.entryId, row.meaning, row.example.romaji, row.example.english]);
  if (dedup.has(key)) return;
  dedup.add(key);
  const bucket = createHash('sha256').update(search.wordKey(row.japanese)).digest()[0] % buckets.length;
  buckets[bucket].push(row);
  wordSet.add(search.wordKey(row.japanese));
  sentenceSet.add(JSON.stringify([row.language, row.example.romaji, row.example.english]));
  counts.records++;
  if (row.entryId && row.senseNumber) coveredSenses.add(`${row.entryId}:${row.senseNumber}`);
}
for (const language of ['english', 'spanish']) {
  const deck = await read(`decks/${language}/most-common-2000${language === 'spanish' ? '-es' : ''}.json`);
  for (const card of deck.cards) card.examples.forEach((example, i) => {
    const meaning = (card.meanings || [card.english])[i], lang = language === 'spanish' ? 'es' : 'en';
    if (lang === 'en') reviewedSentences.set(JSON.stringify([search.wordKey(example.hiragana), example.english]), example);
    add({japanese: card.japanese, hiragana: card.hiragana, meaning, language: lang, example, reviewed: true});
    counts.reviewedRecords++;
  });
}
const sourceManifest = await read('decks/source-data/tkg-suggestion-entries-32c267cb-manifest.json');
const entriesById = new Map();
for (const archive of sourceManifest.archives) {
  const bytes = await readFile(new URL(`decks/source-data/${archive.file}`, root));
  if (bytes.length !== archive.bytes || sha256(bytes) !== archive.sha256) throw new Error(`Invalid archive: ${archive.file}`);
  const payload = JSON.parse(gunzipSync(bytes));
  if (payload.sourceCommit !== sourceManifest.sourceCommit || payload.entries.length !== archive.entries) throw new Error('Invalid source metadata.');
  for (const record of payload.entries) {
    if (sha256(record.content) !== record.sha256) throw new Error(`Invalid entry hash: ${record.id}`);
    entriesById.set(record.id, JSON.parse(record.content));
  }
}
if (entriesById.size !== sourceManifest.entries) throw new Error('Incomplete source collection.');
const sourceIndexBytes = await readFile(new URL(`decks/source-data/${sourceManifest.indexFile}`, root));
if (sha256(sourceIndexBytes) !== sourceManifest.indexSha256) throw new Error('Source index mismatch.');
const index = JSON.parse(sourceIndexBytes);
const indexById = new Map(index.entries.map(row => [row.id, row]));
const lookup = JSON.parse(gunzipSync(await readFile(new URL('decks/romaji-english-jmdict-2026-11-02.json.gz', root))));

// Japanese spelling AND reading must agree before synonyms can be shared.
const cleanHead = value => String(value).replace(/\{([^{}|]+)\|[^{}]+\}/g, '$1').replace(/⟦(.*?)⟧/gs, (_, inner) => inner.split('→')[0]);
const lexicon = new Map();
{
  const tar = gunzipSync(await readFile(new URL('decks/source-data/jmdict-eng-3.6.2+20261102210542.json.tgz', root)));
  for (let offset = 0; offset + 512 <= tar.length;) {
    const name = tar.toString('utf8', offset, offset + 100).replace(/\0.*$/, '');
    if (!name) break;
    const size = parseInt(tar.toString('utf8', offset + 124, offset + 136).trim(), 8);
    if (name.endsWith('.json')) {
      const dictionary = JSON.parse(tar.toString('utf8', offset + 512, offset + 512 + size));
      for (const word of dictionary.words) for (const reading of word.kana) {
        const spellings = word.kanji.length ? word.kanji.map(item => item.text) : [reading.text];
        for (const spelling of spellings) {
          if (reading.appliesToKanji?.length && !reading.appliesToKanji.includes('*') && !reading.appliesToKanji.includes(spelling)) continue;
          const senses = word.sense.filter(sense =>
            (sense.appliesToKana.includes('*') || sense.appliesToKana.includes(reading.text)) &&
            (sense.appliesToKanji.includes('*') || sense.appliesToKanji.includes(spelling)))
            .map(sense => sense.gloss.filter(gloss => gloss.lang === 'eng').map(gloss => gloss.text));
          const key = `${search.wordKey(reading.text)}\0${spelling}`;
          if (!lexicon.has(key)) lexicon.set(key, []);
          lexicon.get(key).push(...senses);
        }
      }
      break;
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
}
let processed = 0;
for (const sourceEntry of entriesById.values()) {
  counts.sourceEntries++;
  const japanese = search.romanizeReading(sourceEntry.reading);
  if (!/^[a-z' -]+$/i.test(japanese)) { counts.skippedReading += sourceEntry.examples.length; continue; }
  const readingAliases = new Set([japanese, sourceEntry.id.slice(6), sourceEntry.reading]);
  const pronouncedParticle = {'00079_ha': 'wa', '02473_he': 'e', '00422_wo': 'o'}[sourceEntry.id];
  if (pronouncedParticle) readingAliases.add(pronouncedParticle);
  for (const form of sourceEntry.conjugation?.forms || []) for (const polarity of ['affirmative', 'negative']) {
    const reading = romanizeSourceExample(form[polarity] || '').hiragana;
    if (/^[\u3040-\u30ff\s]+$/.test(reading)) readingAliases.add(search.romanizeReading(reading));
  }
  aliasesById.set(sourceEntry.id, [...readingAliases]);
  const jmdictSenses = lexicon.get(`${search.wordKey(sourceEntry.reading)}\0${cleanHead(sourceEntry.headword)}`) || [];
  const meaningAliases = new Map();
  for (const definition of sourceEntry.definitions || []) {
    const matched = jmdictSenses.map(glosses => ({glosses, score: search.senseScore(definition.gloss, glosses.join('; '))}))
      .filter(item => item.score >= 2.25).sort((a, b) => b.score - a.score);
    if (matched.length && (matched.length === 1 || matched[0].score > matched[1].score)) meaningAliases.set(definition.sense_number, matched[0].glosses);
  }
  meaningAliasesById.set(sourceEntry.id, meaningAliases);
  for (const sourceExample of sourceEntry.examples || []) {
    counts.sourceExamples++;
    const example = {...romanizeSourceExample(sourceExample.japanese), english: sourceExample.english};
    if (!example.english?.trim() || !/^[a-z\d\s'".,!?;:()%\-–—]+$/i.test(example.romaji) || !/[.?!]$/.test(example.romaji)) {
      counts.skippedReading++; continue;
    }
    const reviewed = reviewedSentences.get(JSON.stringify([search.wordKey(example.hiragana), example.english]));
    const result = reviewed ? {wordMeanings: reviewed.wordMeanings, review: []}
      : annotateExample({example, sourceEntry, sourceExample, entriesById, indexById, jmdict: lookup});
    if (reviewed) Object.assign(example, reviewed);
    else {
      example.wordMeanings = result.wordMeanings.map((word, i) => {
        if (word.meaning !== 'Meaning needs review') return word;
        const choices = lookupApi.findWordMeanings(word.romaji, lookup, result.wordMeanings[i - 1]?.romaji || '');
        choices.sort((a, b) => search.overlap(b, example.english) - search.overlap(a, example.english));
        return {...word, meaning: choices[0] || 'Unresolved word; check the context of this example.'};
      });
      normalizeTopicParticleRomaji(example);
      if (result.review.length) counts.automaticAnnotations++;
    }
    const available = (sourceExample.sense_numbers || []).map(number => sourceEntry.definitions.find(def => def.sense_number === number)).filter(Boolean);
    let definition = available.length === 1 ? available[0] : null;
    if (!definition) {
      const ownerIndex = example.wordMeanings.findIndex(word => word.entryId === sourceEntry.id);
      const owner = example.wordMeanings[ownerIndex];
      if (owner && !result.review.some(item => item.index === ownerIndex)) definition = available.find(def => def.sense_number === owner.senseNumber);
    }
    if (!definition) { counts.skippedSense++; continue; }
    if (example.wordMeanings.some(word => /Unresolved word/.test(word.meaning))) { counts.skippedAnnotation++; continue; }
    // A word can have a clear, linked occurrence even if its own examples could
    // not be converted. Keep two useful sentences per sense as a fallback.
    const uncertainIndexes = new Set(result.review.map(item => item.index));
    for (const [i, word] of example.wordMeanings.entries()) {
      if (!word.entryId || !word.senseNumber || word.entryId === sourceEntry.id || uncertainIndexes.has(i)) continue;
      const target = entriesById.get(word.entryId);
      const targetSense = target?.definitions.find(def => def.sense_number === word.senseNumber);
      if (!targetSense || !/^[a-z' -]+$/i.test(search.romanizeReading(target.reading))) continue;
      const key = `${word.entryId}:${word.senseNumber}`;
      const candidates = linkedCandidates.get(key) || [];
      if (candidates.some(candidate => candidate.example.romaji === example.romaji)) continue;
      candidates.push({target, definition: targetSense, example, sourceOwnerId: sourceEntry.id, sourceExampleId: sourceExample.id,
        quality: search.naturalness(example) + (search.wordKey(word.romaji) === search.wordKey(target.reading) ? 1 : 0)});
      candidates.sort((a, b) => b.quality - a.quality);
      linkedCandidates.set(key, candidates.slice(0, 2));
    }
    const tier = indexById.get(sourceEntry.id)?.vocabulary_tier;
    add({japanese, hiragana: sourceEntry.reading, entryId: sourceEntry.id, senseNumber: definition.sense_number,
      meaning: definition.gloss, ...(meaningAliases.has(definition.sense_number) ? {meaningAliases: meaningAliases.get(definition.sense_number)} : {}),
      language: 'en', example, sourceExampleId: sourceExample.id,
      quality: (tier === 'basic' ? 0.3 : tier === 'core' ? 0.15 : 0) - Math.min(0.4, result.review.length * 0.03),
      annotationMethod: reviewed ? 'reviewed' : result.review.length ? 'contextual-automatic' : 'source-context'});
  }
  if (++processed % 2000 === 0) console.log(`Prepared ${processed}/${entriesById.size} entries; ${counts.records} example records.`);
}
for (const [key, candidates] of linkedCandidates) {
  if (coveredSenses.has(key)) continue;
  for (const candidate of candidates) {
    const {target, definition, example, sourceOwnerId, sourceExampleId} = candidate;
    const meaningAliases = meaningAliasesById.get(target.id)?.get(definition.sense_number);
    add({japanese: search.romanizeReading(target.reading), hiragana: target.reading, entryId: target.id, senseNumber: definition.sense_number,
      meaning: definition.gloss, ...(meaningAliases ? {meaningAliases} : {}), language: 'en', example,
      sourceOwnerId, sourceExampleId, annotationMethod: 'linked-source-context', quality: -0.1});
    counts.linkedFallbackRecords++;
  }
}
await mkdir(new URL('decks/example-suggestions/', root), {recursive: true});
const parts = [], searchIndex = Object.create(null);
for (const bucket of buckets) {
  let chunk = [], bytes = 0;
  async function flush() {
    if (!chunk.length) return;
    const aliases = Object.fromEntries([...new Set(chunk.map(row => row.entryId).filter(Boolean))].map(id => [id, aliasesById.get(id) || []]));
    const content = JSON.stringify({format: 2, aliases, records: chunk}) + '\n';
    if (Buffer.byteLength(content) > MAX_BYTES) {
      if (chunk.length === 1) throw new Error('One record exceeds 20 MB.');
      const saved = chunk, half = Math.ceil(chunk.length / 2);
      chunk = saved.slice(0, half); await flush(); chunk = saved.slice(half); await flush(); chunk = []; return;
    }
    const file = `example-suggestions/part-${String(parts.length).padStart(3, '0')}.json`, number = parts.length;
    await writeFile(new URL(`decks/${file}`, root), content);
    parts.push({file, records: chunk.length, bytes: Buffer.byteLength(content), sha256: sha256(content)});
    for (const row of chunk) for (const key of new Set([row.japanese, row.hiragana, ...(aliasesById.get(row.entryId) || [])].flatMap(search.wordKeys))) {
      if (!searchIndex[key]) searchIndex[key] = [];
      if (!searchIndex[key].includes(number)) searchIndex[key].push(number);
    }
    chunk = []; bytes = 0;
  }
  for (const row of bucket) {
    const size = Buffer.byteLength(JSON.stringify(row)) + 1;
    if (bytes + size > 18_000_000) await flush();
    chunk.push(row); bytes += size;
  }
  await flush();
}
const manifest = {format: 2, source: 'TKG Japanese-English Learner’s Dictionary (CC0), pinned revision 32c267cb; JMdict synonym senses (CC BY-SA 4.0)',
  sourceCommit: sourceManifest.sourceCommit, maxPartBytes: MAX_BYTES, words: wordSet.size, records: counts.records,
  uniqueSentences: sentenceSet.size, searchKeys: Object.keys(searchIndex).length, parts, index: searchIndex};
manifest.constructions = await buildConstructionIndex(manifest, part => read(`decks/${part.file}`));
manifest.constructionSpellings = await buildConstructionSpellings(manifest, part => read(`decks/${part.file}`));
const content = JSON.stringify(manifest) + '\n';
if (Buffer.byteLength(content) > MAX_BYTES) throw new Error('Example index exceeds 20 MB.');
await writeFile(new URL('decks/example-suggestions.json', root), content);
const report = {sourceCommit: sourceManifest.sourceCommit, ...counts, words: wordSet.size, uniqueSentences: sentenceSet.size,
  searchKeys: manifest.searchKeys, parts: parts.length, totalPartBytes: parts.reduce((sum, part) => sum + part.bytes, 0),
  largestPartBytes: Math.max(...parts.map(part => part.bytes)), indexBytes: Buffer.byteLength(content),
  constructionKeys:Object.keys(manifest.constructions).length,
  constructionIndexBytes:Buffer.byteLength(JSON.stringify(manifest.constructions)),
  constructionSpellings:manifest.constructionSpellings.length,
  constructionSpellingBytes:Buffer.byteLength(JSON.stringify(manifest.constructionSpellings))};
await writeFile(new URL('decks/source-data/example-suggestions-build-report.json', root), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
