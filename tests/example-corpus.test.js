const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {spawnSync} = require('node:child_process');
const {gunzipSync} = require('node:zlib');
const {createService} = require('../example-suggestions.js');
const search = require('../example-search.js');
const core = require('../deck-core.js');
const root = path.resolve(__dirname, '../decks');
const manifestBytes = fs.readFileSync(path.join(root, 'example-suggestions.json'));
const manifest = JSON.parse(manifestBytes);
const loadPart = descriptor => JSON.parse(fs.readFileSync(path.join(root, descriptor.file), 'utf8'));
const service = createService({loadCorpus:()=>manifest,loadPart,loadLookup:()=>null,
  findWordMeanings:()=>[],normalizeWordMeanings:core.normalizeWordMeanings});

test('Git preserves LF hash inputs while checking compressed JSON archives out as binary', () => {
  const paths = [
    'decks/example-suggestions.json',
    'decks/example-suggestions/part-0000.json',
    'decks/source-data/tkg-entries-index-32c267cb.json',
  ];
  const lf = spawnSync('git', ['check-attr', 'text', 'eol', '--', ...paths], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8',
  });
  assert.equal(lf.status, 0, lf.stderr);
  for (const file of paths) {
    assert.match(lf.stdout, new RegExp(`${file.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}: eol: lf`));
  }
  const archive = spawnSync('git', ['check-attr', 'text', '--', 'decks/source-data/tkg-suggestion-entries-32c267cb-0000.json.gz'], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8',
  });
  assert.equal(archive.status, 0, archive.stderr);
  assert.match(archive.stdout, /text: unset/);
});

test('the complete corpus has broad coverage, accurate counts, verified hashes, and no file above 20 MB', () => {
  assert.equal(manifest.format,2);
  assert.ok(manifest.words >= 29_000);
  assert.ok(manifest.uniqueSentences >= 110_000);
  assert.ok(manifest.searchKeys >= 200_000);
  assert.ok(manifestBytes.length <= 20_000_000);
  const sources = new Map();
  const sourceManifest = JSON.parse(fs.readFileSync(path.join(root, 'source-data/tkg-suggestion-entries-32c267cb-manifest.json')));
  for (const archive of sourceManifest.archives) {
    const payload = JSON.parse(gunzipSync(fs.readFileSync(path.join(root, 'source-data', archive.file))));
    for (const record of payload.entries) {
      const entry = JSON.parse(record.content);
      sources.set(entry.id, {senses: new Map(entry.definitions.map(def => [def.sense_number, def.gloss])),
        examples: new Set(entry.examples.map(example => example.id))});
    }
  }
  let records=0;
  for (const descriptor of manifest.parts) {
    assert.match(descriptor.file,/^example-suggestions\/part-\d+\.json$/);
    const bytes=fs.readFileSync(path.join(root,descriptor.file));
    assert.ok(bytes.length<=20_000_000,descriptor.file);
    assert.equal(bytes.length,descriptor.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),descriptor.sha256);
    const payload=JSON.parse(bytes);
    assert.equal(payload.records.length,descriptor.records);
    records+=payload.records.length;
    for (const row of payload.records) {
      assert.ok(core.normalizeWordMeanings(row.example.wordMeanings,row.example.romaji));
      if (row.sourceExampleId) {
        assert.ok(row.entryId && row.senseNumber);
        assert.ok(sources.get(row.sourceOwnerId || row.entryId)?.examples.has(row.sourceExampleId));
        assert.equal(sources.get(row.entryId)?.senses.get(row.senseNumber), row.meaning);
      }
      // Every base reading is routed to the part containing its examples.
      assert.ok(manifest.index[search.wordKey(row.japanese)].includes(manifest.parts.indexOf(descriptor)));
    }
  }
  assert.equal(records,manifest.records);
  for(const parts of Object.values(manifest.index)) for(const index of parts) assert.ok(manifest.parts[index]);
});

test('combined meanings work with the real made examples for every requested separator', async () => {
  for (const separator of [' / ', '; ', ', ', '. ', '\n']) {
    const example=await service.suggest({japanese:'made',hiragana:'まで',meaning:['until','as far as','even'].join(separator)});
    assert.ok(example,separator);
    assert.match(example.english,/until|as far as|even|up to/i);
    assert.ok(core.normalizeWordMeanings(example.wordMeanings,example.romaji));
  }
});

test('real corpus covers subjects, lexical synonyms, romaji variants, and conjugated words', async () => {
  for (const [japanese,meaning,expected] of [
    ['kuruma','automobile',/car|automobile/i],['isha','physician',/doctor|physician/i],
    ['suizokukan','aquarium',/aquarium/i],['keizai','economics',/econom/i],
    ['kankyou','environment',/environment/i],['uchiwake','breakdown',/breakdown/i],
    ['tabemashita','ate',/eat|ate|eaten/i],['gakkō','school',/school/i],
    ['shashin','photograph',/photo|picture/i],['wa','topic marker',/.+/],
  ]) {
    const example=await service.suggest({japanese,hiragana:core.romajiToHiragana(japanese),meaning});
    assert.ok(example,`${japanese}: ${meaning}`);
    assert.match(example.english,expected);
  }
  assert.equal(await service.suggest({japanese:'hashi',hiragana:'はし',meaning:'medical doctor'}),null);
});

test('compound queries use their correct dictionary reading and skip missing senses', async () => {
  const example=await service.suggest({japanese:'benkyou shimasu',hiragana:'べんきょうします',meaning:'study / learn'});
  assert.ok(example);
  assert.match(example.english,/study|studying|studied|learn/i);
  assert.equal(await service.suggest({japanese:'zzqxnotaword',hiragana:'っっ',meaning:'anything'}),null);
});

test('real ticket examples match the head meaning rather than terms inside optional notes',async()=> {
  for(const meaning of ['ticket (bus, train)','ticket [bus / train]','ticket {bus; train}',
    'ticket (bus [local, express], train)','“ticket (bus, train)”','ticket (bus, train',
    'ticket (bus, train) / pass [entry, access]']) {
    const example=await service.suggest({japanese:'kippu',hiragana:'きっぷ',meaning});
    assert.ok(example,meaning);assert.match(example.english,/ticket/i);
    assert.ok(core.normalizeWordMeanings(example.wordMeanings,example.romaji));
    assert.equal(await service.suggest({japanese:'basu',hiragana:'ばす',meaning}),null,meaning);
  }
});
