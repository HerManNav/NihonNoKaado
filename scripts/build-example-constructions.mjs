// Add routes into existing sentences; no sentence text is duplicated in the index.
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import search from '../example-search.js';

export async function buildConstructionIndex(manifest, loadPart) {
  const entries = new Map(), candidates = new Map();
  for (const part of manifest.parts) {
    const payload = await loadPart(part);
    for (const row of payload.records) {
      if (!row.entryId || row.language !== 'en') continue;
      let entry = entries.get(row.entryId);
      if (!entry) entries.set(row.entryId, entry = {keys:new Set(), senses:new Set()});
      for (const alias of payload.aliases?.[row.entryId] || row.aliases || []) entry.keys.add(search.wordKey(alias));
      entry.senses.add(row.senseNumber);
    }
  }
  for (const [partIndex, part] of manifest.parts.entries()) {
    const payload = await loadPart(part);
    for (const [recordIndex, row] of payload.records.entries()) {
      if (row.language !== 'en') continue;
      const words = row.example.wordMeanings || [];
      for (let i = 0; i < words.length; i++) {
        const joined = search.parseContinuousForm(words[i].romaji);
        const form = joined || search.parseContinuousForm(words[i].romaji, words[i - 1]?.romaji);
        if (!form) continue;
        const key = search.wordKey(form.core);
        if (manifest.index[key]) continue; // Existing conjugation routes already work.
        const start = joined ? i : i - 1, count = joined ? 1 : 2;
        const target = words[start], entry = entries.get(target.entryId);
        // Both aliases must belong to the same verb. An adjective ending in -te
        // or an unrelated noun must never become a guessed continuing verb.
        if (!entry?.keys.has(search.wordKey(form.teForm)) || !entry.keys.has(search.wordKey(form.teForm + 'iru'))
          || !entry.senses.has(target.senseNumber)) continue;
        const group = `${key}:${target.entryId}:${target.senseNumber}`;
        const refs = candidates.get(group) || [];
        const sentence = search.sentenceKey(row.example.romaji);
        if (refs.some(ref => ref.sentence === sentence)) continue;
        refs.push({key, sentence, quality:search.naturalness(row.example), ref:[partIndex,recordIndex,start,count]});
        refs.sort((a,b) => b.quality - a.quality || a.sentence.localeCompare(b.sentence));
        candidates.set(group, refs.slice(0,2));
      }
    }
  }
  const result = {};
  for (const group of [...candidates.values()]) for (const item of group) (result[item.key] ||= []).push(item.ref);
  return Object.fromEntries(Object.entries(result).sort(([a],[b]) => a.localeCompare(b)));
}

// Spelling search needs the original romaji and the verb's lexical sense, not
// just the normalized route key (which deliberately merges ei/ee, shi/si, etc.).
export async function buildConstructionSpellings(manifest, loadPart) {
  const entries = new Map(), parts = new Map(), seen = new Set(), spellings = [];
  const referencedParts = new Set(Object.values(manifest.constructions).flatMap(refs => refs.map(ref => ref[0])));
  for (const [index,part] of manifest.parts.entries()) {
    const payload = await loadPart(part);
    if (referencedParts.has(index)) parts.set(index,payload);
    for (const row of payload.records) if (row.entryId && row.language === 'en')
      entries.set(`${row.entryId}:${row.senseNumber}`,row);
  }
  for (const refs of Object.values(manifest.constructions)) for (const [part,record,start,count] of refs) {
    const source = parts.get(part).records[record], words = source.example.wordMeanings;
    const target = words[start], base = entries.get(`${target.entryId}:${target.senseNumber}`);
    const form = search.parseContinuousForm(words.slice(start,start+count).map(word => word.romaji).join(''));
    if (!base || !form) continue;
    const key = `${search.wordKey(form.core)}:${target.entryId}:${target.senseNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    spellings.push({japanese:form.core,meaning:base.meaning,language:base.language,
      ...(base.meaningAliases ? {meaningAliases:base.meaningAliases} : {})});
  }
  return spellings.sort((a,b) => a.japanese.localeCompare(b.japanese) || a.meaning.localeCompare(b.meaning));
}

const root = new URL('../', import.meta.url);
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const manifest = JSON.parse(await readFile(new URL('decks/example-suggestions.json', root), 'utf8'));
  manifest.constructions = await buildConstructionIndex(manifest,
    async part => JSON.parse(await readFile(new URL(`decks/${part.file}`,root),'utf8')));
  manifest.constructionSpellings = await buildConstructionSpellings(manifest,
    async part => JSON.parse(await readFile(new URL(`decks/${part.file}`,root),'utf8')));
  const content = JSON.stringify(manifest) + '\n';
  if (Buffer.byteLength(content) > 20_000_000) throw Error('Example index exceeds 20 MB.');
  await writeFile(new URL('decks/example-suggestions.json', root), content);
  const reportUrl = new URL('decks/source-data/example-suggestions-build-report.json',root);
  const report = JSON.parse(await readFile(reportUrl,'utf8'));
  Object.assign(report,{indexBytes:Buffer.byteLength(content), constructionKeys:Object.keys(manifest.constructions).length,
    constructionIndexBytes:Buffer.byteLength(JSON.stringify(manifest.constructions)),
    constructionSpellings:manifest.constructionSpellings.length,
    constructionSpellingBytes:Buffer.byteLength(JSON.stringify(manifest.constructionSpellings))});
  await writeFile(reportUrl,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({constructionKeys:report.constructionKeys,constructionIndexBytes:report.constructionIndexBytes,
    constructionSpellings:report.constructionSpellings,constructionSpellingBytes:report.constructionSpellingBytes}));
}
