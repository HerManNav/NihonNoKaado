const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {gunzipSync} = require('node:zlib');
const core = require('../deck-core.js');
const forms = require('../word-form-lookup.js');
const search = require('../example-search.js');
const {createService} = require('../example-suggestions.js');
const manifest = require('../decks/example-suggestions.json');
const root = path.resolve(__dirname,'../decks');
const loadPart = part => JSON.parse(fs.readFileSync(path.join(root,part.file),'utf8'));
let lookup;
const loadLookup = () => lookup ||= JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'romaji-english-jmdict-2026-11-02.json.gz'))));
const service = createService({loadCorpus:()=>manifest,loadPart,loadLookup,findWordMeanings:forms.findWordMeanings,
  normalizeWordMeanings:core.normalizeWordMeanings});
const context = (japanese,meaning) => ({japanese,hiragana:core.romajiToHiragana(japanese),meaning});

test('joined and spaced continuing te-forms resolve real verb lemmas',()=> {
  for (const [japanese,lemma] of [['matteite','matsu'],['matte ite','matsu'],['yondeite','yomu'],
    ['tabeteite','taberu'],['shiteite','suru'],['kiteite','kuru'],['matteitara','matsu'],
    ['matteireba','matsu'],['matteiyakattara',null]]) {
    const meanings = forms.findWordMeanings(japanese,loadLookup());
    if (lemma) assert.ok(meanings.some(value => value.includes(`continuing form of ${lemma} —`)),japanese);
    else assert.equal(meanings.length,0,japanese);
  }
  const joined = forms.findWordMeanings('matteite',loadLookup());
  assert.deepEqual(forms.findWordMeanings('ite',loadLookup(),'matte'),joined);
  assert.match(joined[0],/matte \+ ite.*te-form of iru/);
});

test('continuing suffixes do not turn adjectives, nouns, or repeated auxiliaries into verbs',async()=> {
  for (const [japanese,meaning] of [['samukuteite','cold'],['chottoite','a little'],['matteiteite','wait'],
    ['nekoite','cat'],['matteiru kudasai','wait']]) {
    assert.equal(forms.findWordMeanings(japanese,loadLookup()).length,0,japanese);
    assert.equal(await service.suggest(context(japanese,meaning)),null,japanese);
  }
});

test('matteite suggests an actual matching construction for joined/spaced forms and request meanings',async()=> {
  for (const japanese of ['matteite','matte ite','MATTEITE','matteite kudasai','matte ite kudasai']) {
    for (const meaning of ['wait','to wait','please wait','keep waiting','wait / stay']) {
      const example = await service.suggest(context(japanese,meaning));
      assert.ok(example,`${japanese}: ${meaning}`);
      assert.match(example.romaji,/matte\s*ite\b/);
      assert.match(example.english,/wait/i);
      assert.ok(core.normalizeWordMeanings(example.wordMeanings,example.romaji));
      const word = example.wordMeanings.find(word => /continuing form of matsu/.test(word.meaning));
      assert.ok(word,example.romaji);
      assert.match(word.meaning,/matte \+ ite.*te-form of iru/);
    }
  }
  assert.equal(await service.suggest({...context('matteite','wait'),hiragana:'ねこ'}),null);
  assert.equal(await service.suggest(context('matteite','ticket')),null);
  assert.equal(await service.suggest({...context('matteite','wait'),language:'es'}),null);
});

test('similar constructions retrieve examples without confusing homographs',async()=> {
  for (const [japanese,meaning,lemma,pattern] of [['yondeite','read','yomu',/read|manga/i],
    ['tabeteite','eat','taberu',/eat/i],['kiteite','wear','kiru',/wear|wore|dress/i],
    ['matteitara','wait','matsu',/wait/i],['matteireba','wait','matsu',/wait/i]]) {
    const example = await service.suggest(context(japanese,meaning));
    assert.ok(example,`${japanese}: ${meaning}`);
    assert.match(example.english,pattern);
    assert.ok(example.wordMeanings.some(word=>word.meaning.includes(`continuing form of ${lemma} —`)),example.romaji);
  }
  const call = await service.suggest(context('yondeite','call'));
  assert.match(call.english,/call/i);
  assert.doesNotMatch(call.english,/read/i);
});

test('custom joined and spaced examples retain grammatical analysis and positional annotations',async()=> {
  for (const japanese of ['matteite','matte ite','matsu']) {
    for (const romaji of ['koko de matteite kudasai.','koko de matte ite kudasai.']) {
      const analyzed = await service.analyze({romaji,hiragana:'ここでまっていてください。',english:'Please wait here.'},context(japanese,'wait'));
      assert.ok(core.normalizeWordMeanings(analyzed.wordMeanings,romaji));
      const target = analyzed.wordMeanings.filter(word=>['matteite','matte','ite'].includes(word.romaji));
      assert.equal(target.length,romaji.includes('matte ite') ? 2 : 1);
      for (const word of target) assert.match(word.meaning,/continuing form of matsu.*matte \+ ite/);
    }
  }
  const example = await service.suggest(context('matteite','wait'));
  const first = await service.analyze(example,context('matteite','wait'));
  first.wordMeanings.find(word=>word.romaji==='matteite').meaning='edited';
  const second = await service.suggest(context('matteite','wait'));
  assert.match(second.wordMeanings.find(word=>word.romaji==='matteite').meaning,/continuing form of matsu/);
});

test('construction routes refer to real, sense-linked verb occurrences and add less than 20 KB',()=> {
  assert.ok(Object.keys(manifest.constructions).length>100);
  assert.ok(Buffer.byteLength(JSON.stringify(manifest.constructions))<20_000);
  const parts = new Map();
  for (const [key,refs] of Object.entries(manifest.constructions)) {
    assert.equal(manifest.index[key],undefined);
    for (const [part,record,start,count] of refs) {
      if (!parts.has(part)) parts.set(part,loadPart(manifest.parts[part]));
      const row = parts.get(part).records[record], words = row.example.wordMeanings;
      assert.ok(words[start].entryId && words[start].senseNumber);
      assert.equal(search.wordKey(words.slice(start,start+count).map(word=>word.romaji).join('')),key);
      assert.ok(search.parseContinuousForm(words.slice(start,start+count).map(word=>word.romaji).join('')));
    }
  }
});

test('construction index builder checks lemma aliases and sense IDs rather than suffixes alone',async()=> {
  const {buildConstructionIndex} = await import('../scripts/build-example-constructions.mjs');
  const verb = {entryId:'matsu',senseNumber:1,japanese:'matsu',language:'en'};
  const row = (romaji,entryId,senseNumber=1) => ({...verb,example:{romaji,english:'Please wait.',
    wordMeanings:[{romaji,entryId,senseNumber,meaning:'wait'}]}});
  const records = [row('matteite','matsu'),row('matteite','matsu',2),row('samukuteite','cold'),row('chottoite','noun')];
  const built = await buildConstructionIndex({parts:[{}],index:{}},()=>({records,
    aliases:{matsu:['matte','matteiru'],cold:['samukute'],noun:['chotto']}}));
  assert.deepEqual(built,{[search.wordKey('matteite')]:[[0,0,0,1]]});
});

test('construction spelling metadata preserves source romaji and lexical senses without duplicating sentences',async()=> {
  const {buildConstructionSpellings} = await import('../scripts/build-example-constructions.mjs');
  const generated = await buildConstructionSpellings(manifest,loadPart);
  assert.deepEqual(generated,manifest.constructionSpellings);
  assert.ok(generated.length>200);
  assert.ok(Buffer.byteLength(JSON.stringify(generated))<40_000);
  for (const row of generated) {
    assert.ok(row.japanese && row.meaning && row.language);
    assert.ok(manifest.constructions[search.wordKey(row.japanese)]);
    assert.equal(row.example,undefined);
  }
  const wait = generated.find(row=>row.japanese==='matteite' && row.meaning==='to wait');
  assert.ok(wait);
  const overflow = generated.find(row=>row.japanese==='afureteite');
  assert.ok(search.senseScore('flood',overflow.meaningAliases.join(' / ')));
});
