const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../deck-core.js');
const {spellingDistance} = require('../example-search.js');
const {createService,createController} = require('../example-suggestions.js');

function realService(onLoad = () => {}) {
  return createService({loadCorpus:()=>require('../decks/example-suggestions.json'),loadPart:part=>{
    onLoad(part.file);return JSON.parse(fs.readFileSync(path.join(__dirname,'../decks',part.file),'utf8'));
  },loadLookup:()=>assert.fail('Spelling correction must not load the large word-analysis dictionary.'),
  findWordMeanings:()=>[],normalizeWordMeanings:core.normalizeWordMeanings});
}

test('atteite plus wait offers matteite, with a usable and analyzed corrected example',async()=> {
  const loaded = new Set(), service = realService(file=>loaded.add(file));
  const input = {japanese:'atteite',hiragana:'あっていて',meaning:'wait'};
  assert.equal(await service.suggest(input),null);
  loaded.clear();
  const results = await service.alternatives(input);
  assert.equal(results[0].japanese,'matteite');
  assert.equal(results[0].meaning,'to wait');
  assert.ok(loaded.size<=6,`${loaded.size} parts loaded by correction search`);
  const chosen = results[0], context = {...input,japanese:chosen.japanese,hiragana:chosen.hiragana || core.romajiToHiragana(chosen.japanese)};
  const example = await service.suggest(context);
  assert.match(example.romaji,/matte\s*ite\b/);
  assert.match(example.english,/wait/i);
  assert.ok(core.normalizeWordMeanings(example.wordMeanings,example.romaji));
  const analyzed = await service.analyze(example,context);
  assert.ok(analyzed.wordMeanings.some(word=>/continuing form of matsu.*matte \+ ite/.test(word.meaning)));
});

test('construction corrections cover spacing, hyphens, case, missing/extra letters and transpositions',async()=> {
  const service = realService();
  for (const [japanese,meaning,expected] of [['atte ite','please wait','matteite'],
    ['ATTE-ITE','keep waiting','matteite'],['まっていえと','wait','matteite'],
    ['matteiet','wait','matteite'],['mattteite','wait','matteite'],['mtateite','wait','matteite'],
    ['yondeiet','read','yondeite'],['tabeteiet','eat','tabeteite'],['siteiet','do','shiteite'],
    ['afureteiet','flood','afureteite'],
    ['atteitara','wait','matteitara'],['atteireba','wait','matteireba'],
    ['atteiru','wait','matteiru'],['atteimasu','wait','matteimasu'],
    ['atteimasen','wait','matteimasen'],['atteinai','wait','matteinai'],
    ['atteinakatta','wait','matteinakatta'],['atteite kudasai','please wait','matteite kudasai']]) {
    const results = await service.alternatives({japanese,meaning});
    assert.ok(results.some(row=>row.japanese===expected),`${japanese}: ${JSON.stringify(results)}`);
    assert.ok(results.length<=5);
  }
  const truncated = await service.alternatives({japanese:'matteit',meaning:'wait'});
  assert.ok(truncated.some(row=>row.japanese==='matteite'));
});

test('construction corrections preserve meaning/language guards, limits and cache isolation',async()=> {
  const service = realService();
  for (const meaning of ['wait / stay','wait (for a bus, train)','please wait [here; outside]']) {
    assert.equal((await service.alternatives({japanese:'atteite',meaning}))[0].japanese,'matteite');
  }
  for (const meaning of ['ticket','do not wait','meet']) {
    const results = await service.alternatives({japanese:'atteite',meaning});
    assert.ok(results.every(row=>row.japanese!=='matteite'),meaning);
  }
  assert.deepEqual(await service.alternatives({japanese:'atteite',meaning:'wait',language:'es'}),[]);
  const input = {japanese:'matteiet',meaning:'wait'};
  assert.equal((await service.alternatives(input,1)).length,1);
  const results = await service.alternatives(input);
  results[0].japanese='changed';
  assert.equal((await service.alternatives(input))[0].japanese,'matteite');
  assert.equal(new Set((await service.alternatives(input)).map(row=>row.japanese)).size,(await service.alternatives(input)).length);
});

test('construction sense matches survive a saturated lexical part budget',async()=> {
  let loads = 0;
  const keys = ['katteete','tatteete','batteete','hatteete','yatteete','natteete','watteete'];
  const service = createService({loadCorpus:()=>({format:2,index:Object.fromEntries(keys.map((key,i)=>[key,[i]])),
    parts:keys.map(()=>({records:0})),constructionSpellings:[
      {japanese:'matteite',meaning:'to wait',language:'en'},
      {japanese:'matteite',meaning:'to wait',meaningAliases:['to await'],language:'en'},
      {japanese:'katteite',meaning:'to win',language:'en'}]}),
    loadPart:()=>{loads++;return {format:2,records:[]};},loadLookup:()=>null,findWordMeanings:()=>[],
    normalizeWordMeanings:core.normalizeWordMeanings});
  const results = await service.alternatives({japanese:'atteite',meaning:'wait'});
  assert.deepEqual(results[0],{japanese:'matteite',hiragana:'',meaning:'to wait'});
  assert.ok(results.every(row=>row.meaning==='to wait'));
  assert.ok(loads<=6);
  assert.equal((await service.alternatives({japanese:'atteite',meaning:'await'}))[0].japanese,'matteite');
});

test('romaji typo distance favors missing long vowels and supports transposed characters', () => {
  assert.ok(spellingDistance('kuuko','kuukoo') < spellingDistance('kuuko','kuukoji'));
  assert.ok(spellingDistance('tabreu','taberu') <= 1);
  assert.equal(spellingDistance('qzx','airport'),Infinity);
});

test('the real corpus suggests kuukoo for kuuko and airport without loading more than six parts', async () => {
  const manifest = require('../decks/example-suggestions.json');
  const fetched = new Set();
  const service=createService({loadCorpus:()=>manifest,loadPart:part=>{
    fetched.add(part.file);return JSON.parse(fs.readFileSync(path.join(__dirname,'../decks',part.file),'utf8'));
  },loadLookup:()=>null,findWordMeanings:()=>[],normalizeWordMeanings:core.normalizeWordMeanings});
  assert.equal(await service.suggest({japanese:'kuuko',hiragana:'くうこ',meaning:'airport'}),null);
  const results=await service.alternatives({japanese:'kuuko',meaning:'airport',language:'en'});
  assert.ok(results.length > 0 && results.length <= 5);
  assert.equal(results[0].japanese,'kuukoo');
  assert.equal(results[0].meaning,'airport');
  assert.equal(results[0].hiragana,'くうこう');
  assert.ok(fetched.size<=6);
  const corrected=await service.suggest({japanese:results[0].japanese,hiragana:results[0].hiragana,meaning:'airport'});
  assert.ok(corrected?.romaji && corrected?.hiragana && corrected?.english);
  assert.ok(core.normalizeWordMeanings(corrected.wordMeanings,corrected.romaji));
  assert.deepEqual(await service.alternatives({japanese:'qzxqzxqzx',meaning:'airport'}),[]);
});

function controllerHarness({example=null,eligible=true,findAlternatives=async()=>[{japanese:'kuukoo',meaning:'airport'}]}={}) {
  const fields=[0,1,2].map(()=>({value:'',dataset:{}}));
  const context={japanese:'kuuko',hiragana:'くうこ',meaning:'airport'};
  const lists=[];
  let requested=0;
  const controller=createController({fields,getContext:()=>context,suggest:async()=>example,setStatus:()=>{},
    canOfferAlternatives:()=>eligible,findAlternatives:async value=>{requested++;return findAlternatives(value);},
    onAlternatives:items=>lists.push(items)});
  controller.refresh();
  return {controller,fields,context,lists,requested:()=>requested};
}

test('corrections wait for an unsuccessful requested lookup and are suppressed by deck matches or existing examples', async () => {
  const h=controllerHarness();
  assert.equal(h.requested(),0);
  assert.ok(h.lists.every(list=>list.length===0));
  await h.controller.focus();
  assert.equal(h.requested(),1);
  assert.equal(h.lists.at(-1)[0].japanese,'kuukoo');
  h.context.meaning='airfield';h.controller.refresh();
  assert.deepEqual(h.lists.at(-1),[]);
  for(const options of [{eligible:false},{example:{romaji:'example',hiragana:'え',english:'example'}}]) {
    const suppressed=controllerHarness(options);await suppressed.controller.focus();assert.equal(suppressed.requested(),0);
  }
  const custom=controllerHarness();custom.fields[2].value='My translation';await custom.controller.focus();assert.equal(custom.requested(),0);
  const incomplete=controllerHarness();incomplete.context.meaning='';incomplete.controller.refresh();await incomplete.controller.focus();assert.equal(incomplete.requested(),0);
});

test('late spelling suggestions do not reappear after the word or meaning changes', async () => {
  let resolve;
  const h=controllerHarness({findAlternatives:()=>new Promise(done=>{resolve=done;})});
  const pending=h.controller.focus();
  while(!resolve) await Promise.resolve();
  h.context.japanese='neko';h.controller.refresh();
  resolve([{japanese:'kuukoo',meaning:'airport'}]);await pending;
  assert.deepEqual(h.lists.at(-1),[]);
});
