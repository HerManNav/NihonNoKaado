const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const core=require('../deck-core.js');
const search=require('../example-search.js');
const {createService,createController}=require('../example-suggestions.js');

const example={romaji:'kuukou ni iku.',hiragana:'くうこうにいく。',english:"I'm going to the airport.",wordMeanings:[
  {romaji:'kuukou',meaning:'airport'},{romaji:'ni',meaning:'destination'},{romaji:'iku',meaning:'go'}]};
const row={japanese:'kuukou',hiragana:'くうこう',entryId:'00001_kuukou',meaning:'airport',language:'en',example};
const input={japanese:'kuuko',meaning:'airport',language:'en'};
function makeFixture(extra={}) {
  let loads=0,meanings=0;
  const customSearch={...search,senseScore:(...args)=>{meanings++;return search.senseScore(...args);}};
  // Instrument work counts instead of asserting timing against a noisy CI clock.
  const context={module:{exports:{}},require:()=>customSearch};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../example-suggestions.js'),'utf8'),context);
  const service=context.module.exports.createService({
    loadCorpus:()=>({format:2,index:{kuukoo:[0]},parts:[{file:'part',records:1}]}),
    loadPart:async()=>{loads++;return {format:2,records:[row]};},loadLookup:()=>null,
    findWordMeanings:()=>[],normalizeWordMeanings:core.normalizeWordMeanings,...extra,
  });
  return {service,loads:()=>loads,meanings:()=>meanings};
}

test('concurrent and repeated correction queries share work and return independent results',async()=> {
  const h=makeFixture();
  const [a,b]=await Promise.all([h.service.alternatives(input),h.service.alternatives(input)]);
  assert.equal(h.loads(),1);assert.equal(a[0].japanese,'kuukoo');assert.equal(b[0].japanese,'kuukoo');
  const work=h.meanings();
  a[0].japanese='modified';a.length=0;
  const repeated=await h.service.alternatives(input);
  assert.equal(repeated[0].japanese,'kuukoo');assert.equal(h.meanings(),work);assert.equal(h.loads(),1);
});

test('correction caching distinguishes meanings, languages and list limits',async()=> {
  const h=makeFixture();
  assert.equal((await h.service.alternatives(input)).length,1);
  assert.equal((await h.service.alternatives({...input,meaning:'banana'})).length,0);
  assert.equal((await h.service.alternatives({...input,language:'es'})).length,0);
  assert.equal((await h.service.alternatives(input,0)).length,0);
  assert.equal((await h.service.alternatives({...input,meaning:'airport (domestic, international)'})).length,1);
});

test('the correction result cache is bounded and least-recently-used queries are recomputed',async()=> {
  const h=makeFixture();
  await h.service.alternatives(input);
  for(let i=0;i<16;i++)await h.service.alternatives({...input,meaning:`airport (note ${i})`});
  const work=h.meanings();
  await h.service.alternatives(input);
  assert.ok(h.meanings()>work,'The evicted query must be recomputed.');
  assert.equal(h.loads(),1,'The dictionary part can stay cached independently.');
});

test('a failed cached correction request can be retried after the dictionary recovers',async()=> {
  let calls=0;
  const h=makeFixture({loadPart:async()=>{if(++calls===1)throw Error('offline');return {format:2,records:[row]};}});
  await assert.rejects(h.service.alternatives(input),/offline/);
  assert.equal((await h.service.alternatives(input))[0].japanese,'kuukoo');
  assert.equal(calls,2);
});

test('invalid or note-only queries avoid dictionary IO and invalid limits are safe',async()=> {
  const h=makeFixture({loadCorpus:()=>assert.fail('No dictionary load expected.')});
  for(const value of [null,undefined,{}, {...input,japanese:'k'}, {...input,meaning:'(bus, train)'}, {...input,meaning:''}]) {
    assert.equal((await h.service.alternatives(value)).length,0);
  }
  assert.equal((await h.service.alternatives(input,-1)).length,0);
  const valid=makeFixture();
  for(const limit of [NaN,Infinity,99,1.9])assert.ok((await valid.service.alternatives(input,limit)).length<=5);
});

test('a lexeme repeated in 500 example records is normalized once while indexing a part',async()=> {
  let normalizations=0;
  const customSearch={...search,wordKeys:value=>{normalizations++;return search.wordKeys(value);}};
  const context={module:{exports:{}},require:()=>customSearch};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../example-suggestions.js'),'utf8'),context);
  const aliases=['kuukou',...Array.from({length:30},(_,i)=>`kuukou${i}`)];
  const records=Array.from({length:500},()=>({...row}));
  const service=context.module.exports.createService({loadCorpus:()=>({format:2,index:{kuukoo:[0]},parts:[{records:500}]}),
    loadPart:()=>({format:2,records,aliases:{[row.entryId]:aliases}}),loadLookup:()=>assert.fail('Known annotation should be reused.'),
    findWordMeanings:()=>[],normalizeWordMeanings:core.normalizeWordMeanings});
  const result=await service.analyze(example,{japanese:'kuukou',hiragana:'くうこう',meaning:'airport'});
  assert.equal(result.wordMeanings[0].meaning,'airport');
  assert.ok(normalizations<40,`${normalizations} normalizations should be independent of the 500 example rows.`);
});

test('normalization memoization preserves distinct alias lists sharing an entry ID',async()=> {
  const changed={...row,aliases:['kuukooo']};
  const service=createService({loadCorpus:()=>({format:2,index:{kuukooo:[0]},parts:[{records:2}]}),
    loadPart:()=>({format:2,records:[{...row,aliases:['kuukou']},changed]}),
    loadLookup:()=>assert.fail('The second alias must retain its known sentence.'),findWordMeanings:()=>[],normalizeWordMeanings:core.normalizeWordMeanings});
  assert.equal((await service.analyze(example,{japanese:'kuukooo',meaning:'airport'})).wordMeanings[0].meaning,'airport');
});

test('invalid parsed-part cache settings cannot hang a lookup',async()=> {
  for(const maxCachedParts of [0,-1,NaN,Infinity,1.5]) {
    const h=makeFixture({maxCachedParts});
    assert.equal((await h.service.alternatives(input))[0].japanese,'kuukoo');
  }
});

test('delayed alternatives stay hidden when deck matches appear or the screen closes',async()=> {
  for(const phase of ['deck','screen','language','typing']) {
    let resolve,eligible=true,active=true;
    const fields=[0,1,2].map(()=>({value:'',dataset:{}}));
    const context={japanese:'kuuko',hiragana:'くうこ',meaning:'airport',language:'en'};
    const shown=[];
    const controller=createController({fields,getContext:()=>context,suggest:async()=>null,setStatus:()=>{},
      isActive:()=>active,canOfferAlternatives:()=>eligible,
      findAlternatives:()=>new Promise(done=>{resolve=done;}),onAlternatives:items=>shown.push(items)});
    controller.refresh();const pending=controller.focus();
    while(!resolve)await Promise.resolve();
    if(phase==='deck')eligible=false;
    if(phase==='screen')active=false;
    if(phase==='language')context.language='es';
    if(phase==='typing')fields[0].value='My own example';
    resolve([{japanese:'kuukoo',meaning:'airport'}]);await pending;
    assert.ok(shown.every(list=>list.length===0),phase);
    if(phase==='typing')assert.equal(fields[0].value,'My own example');
  }
});

test('network errors do not masquerade as no-match results or trigger spelling alternatives',async()=> {
  let alternatives=0;
  const states=[];
  const controller=createController({fields:[0,1,2].map(()=>({value:'',dataset:{}})),
    getContext:()=>({japanese:'kuuko',hiragana:'くうこ',meaning:'airport'}),
    suggest:async()=>{throw Error('offline');},setStatus:(_,state)=>states.push(state),
    findAlternatives:async()=>{alternatives++;return [];}});
  controller.refresh();await controller.focus();await controller.wait();
  assert.equal(states.at(-1),'error');assert.equal(alternatives,0);
});
