const test = require('node:test');
const assert = require('node:assert/strict');
const {meaningParts, senseScore, wordKey} = require('../example-search.js');
const {createService} = require('../example-suggestions.js');
const core = require('../deck-core.js');

test('meaning alternatives on either side accept slash, semicolon, comma, full stop, and newline', () => {
  for (const separator of [' / ', '; ', ', ', '. ', '.', ' | ', '\n', '；', '，']) {
    assert.deepEqual(meaningParts(`until${separator}as far as${separator}even`), ['until', 'as far as', 'even']);
    assert.ok(senseScore(`until${separator}as far as${separator}even`, 'until (a time)') > 0);
    assert.ok(senseScore('as far as', `until${separator}as far as${separator}even`) > 0);
  }
  assert.deepEqual(meaningParts('to use (e.g. tools, machines); to employ'), ['to use (e.g. tools, machines)', 'to employ']);
  assert.equal(senseScore('computer / electricity', 'until; as far as; even'), 0);
});

test('English inflections and parenthetical glosses preserve the selected sense', () => {
  for (const [query, gloss] of [['ate', 'to eat'], ['writing', 'to write'], ['children', 'child'], ['schools', 'school'], ['use', 'to use (a tool)']]) {
    assert.ok(senseScore(query, gloss), `${query} / ${gloss}`);
  }
  assert.equal(senseScore('not good', 'good'), 0);
  assert.equal(senseScore('bank (river edge)', 'bank (financial institution)'), 0);
  assert.equal(senseScore('give up', 'give'), 0);
});

test('romaji and reading normalization accepts common spelling conventions', () => {
  for (const group of [['gakkou', 'gakkō', 'gakkoo', 'がっこう'], ['koohii', 'kōhī', 'コーヒー'],
    ['shashin', 'syasin', 'しゃしん'], ['tsukau', 'tukau', 'つかう'], ['fuji', 'huzi', 'ふじ'], ['benkyou suru', 'benkyou-suru', 'べんきょうする']]) {
    assert.equal(new Set(group.map(wordKey)).size, 1, group.join(', '));
  }
});

test('matching alternatives ranks a natural sentence and keeps unrelated homographs out', async () => {
  const example = (romaji, english) => ({romaji, hiragana: core.romajiToHiragana(romaji).replace(/\s/g,''), english,
    wordMeanings: (romaji.match(/[a-z]+/g) || []).map(word => ({romaji: word, meaning: word}))});
  const rows = [
    {japanese:'made', hiragana:'まで', meaning:'until', language:'en', example:example('made.', 'Until.')},
    {japanese:'made', hiragana:'まで', meaning:'until (a time)', language:'en', example:example('goji made koko de machimasu.', "I will wait here until five o'clock.")},
    {japanese:'made', hiragana:'まで', meaning:'even', language:'en', example:example('kodomo made shitte iru.', 'Even children know it.')},
    {japanese:'hashi', hiragana:'はし', meaning:'chopsticks', language:'en', example:example('hashi wo tsukau.', 'I use chopsticks.')},
    {japanese:'hashi', hiragana:'はし', meaning:'bridge', language:'en', example:example('hashi wo wataru.', 'I cross a bridge.')},
  ];
  const service = createService({loadCorpus:()=>({format:1,records:rows}), loadLookup:()=>null, findWordMeanings:()=>[], normalizeWordMeanings:core.normalizeWordMeanings});
  const result = await service.suggest({japanese:'made', hiragana:'まで', meaning:'until / as far as / even'});
  assert.ok(result.romaji.split(' ').length >= 3);
  assert.match((await service.suggest({japanese:'hashi', hiragana:'はし', meaning:'chopsticks / eating utensils'})).english, /chopsticks/);
  assert.equal(await service.suggest({japanese:'hashi', hiragana:'はし', meaning:'computer; planet'}), null);
});

test('parts load only when needed, share concurrent requests, and retry failed downloads', async () => {
  let calls = 0, fail = true;
  const example = {romaji:'hashi wo wataru.',hiragana:'はしをわたる。',english:'I cross a bridge.',wordMeanings:[{romaji:'hashi',meaning:'bridge'},{romaji:'wo',meaning:'path marker'},{romaji:'wataru',meaning:'to cross'}]};
  const record = {japanese:'hashi',hiragana:'はし',language:'en',meaning:'bridge',example};
  const service = createService({loadCorpus:()=>({format:2,index:{hasi:[0]},parts:[{file:'needed',records:1},{file:'unused',records:0}]}),
    loadPart:part=>{calls++;assert.equal(part.file,'needed');if(fail)throw new Error('offline');return {format:2,records:[record]};},
    loadLookup:()=>null,findWordMeanings:()=>[],normalizeWordMeanings:core.normalizeWordMeanings});
  const input={japanese:'hashi',hiragana:'はし',meaning:'bridge'};
  await assert.rejects(service.suggest(input), /offline/);
  fail=false;
  await Promise.all([service.suggest(input),service.suggest(input)]);
  assert.equal(calls,2);
  await service.suggest(input);assert.equal(calls,2);
});

test('parsed-part caching is bounded and eviction preserves concurrent search results', async () => {
  const rows=[['hashi','はし','bridge'],['kami','かみ','paper']].map(([japanese,hiragana,meaning])=>({japanese,hiragana,meaning,language:'en',
    example:{romaji:japanese,hiragana,english:meaning,wordMeanings:[{romaji:japanese,meaning}]}}));
  let calls=0;
  const service=createService({maxCachedParts:1,loadCorpus:()=>({format:2,index:{hasi:[0],kami:[1]},parts:[{file:'0',records:1},{file:'1',records:1}]}),
    loadPart:async part=>{calls++;return {format:2,records:[rows[Number(part.file)]]};},loadLookup:()=>null,findWordMeanings:()=>[],normalizeWordMeanings:core.normalizeWordMeanings});
  const [a,b]=await Promise.all(rows.map(row=>service.suggest(row)));
  assert.equal(a.english,'bridge');assert.equal(b.english,'paper');
  await service.suggest(rows[0]);assert.equal(calls,3);
});
