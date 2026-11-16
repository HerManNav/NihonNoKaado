const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {gunzipSync} = require('node:zlib');
const core = require('../deck-core.js');
const {findWordMeanings} = require('../word-form-lookup.js');
const {createService,createController} = require('../example-suggestions.js');
const manifest = require('../decks/example-suggestions.json');
let lookup;
const service = createService({loadCorpus:()=>manifest,
  loadPart:part=>JSON.parse(fs.readFileSync(path.join(__dirname,'../decks',part.file),'utf8')),
  loadLookup:()=>lookup ||= JSON.parse(gunzipSync(fs.readFileSync(path.join(__dirname,'../decks/romaji-english-jmdict-2026-11-02.json.gz')))),
  findWordMeanings,normalizeWordMeanings:core.normalizeWordMeanings});

function draft(japanese,meaning) {
  const context = {japanese,hiragana:core.romajiToHiragana(japanese),meaning,language:'en'};
  const fields = Array.from({length:3},()=>({value:'',dataset:{}})), lists = [];
  const controller = createController({fields,getContext:()=>context,suggest:service.suggest,allSuggestions:service.allSuggestions,
    findAlternatives:service.alternatives,onAlternatives:items=>lists.push(items),setStatus:()=>{}});
  controller.refresh();
  return {context,fields,lists,controller};
}

async function saveAndReload(draft) {
  const example = Object.fromEntries(['romaji','hiragana','english'].map((key,index)=>[key,draft.fields[index].value]));
  const analyzed = await service.analyze(example,draft.context);
  assert.ok(core.normalizeWordMeanings(analyzed.wordMeanings,analyzed.romaji));
  const card = {id:'regression',japanese:draft.context.japanese,hiragana:draft.context.hiragana,
    english:draft.context.meaning,meanings:[draft.context.meaning],examples:[analyzed]};
  const restored = core.parseImportedDeck(JSON.parse(core.serializeDeck([card])))[0];
  assert.equal(restored.japanese,card.japanese);
  assert.equal(restored.english,card.english);
  assert.deepEqual(restored.examples[0].wordMeanings,analyzed.wordMeanings);
  return restored;
}

test('meaning variants and bracketed notes survive automatic suggestions, analysis and JSON reload',async()=> {
  for (const [japanese,meaning,expected] of [['made','until / as far as / even',/until|as far as|even|up to/i],
    ['kippu','ticket (bus, train)',/ticket/i],['matteite','please wait',/wait/i],['hashi','chopsticks',/chopsticks/i]]) {
    const d = draft(japanese,meaning);
    assert.ok(d.fields.every(field=>!field.disabled));
    assert.ok(d.lists.every(list=>list.length===0));
    await Promise.all([d.controller.focus(),d.controller.focus()]);
    assert.ok(d.fields.every(field=>field.value.trim()),japanese);
    assert.match(d.fields[2].value,expected);
    const card = await saveAndReload(d);
    assert.match(card.examples[0].english,expected);
    assert.ok(d.lists.every(list=>list.length===0));
  }
});

test('spelling suggestions lead to corrected examples with persistent positional meanings',async()=> {
  for (const [japanese,meaning,expected] of [['kuuko','airport','kuukoo'],['atteite','wait','matteite']]) {
    const d = draft(japanese,meaning);
    assert.ok(d.lists.every(list=>list.length===0));
    await d.controller.focus();
    assert.ok(d.fields.every(field=>field.value===''));
    const chosen = d.lists.at(-1).find(item=>item.japanese===expected);
    assert.ok(chosen,JSON.stringify(d.lists));
    Object.assign(d.context,{japanese:chosen.japanese,hiragana:chosen.hiragana || core.romajiToHiragana(chosen.japanese)});
    d.controller.refresh();
    assert.deepEqual(d.lists.at(-1),[]);
    await d.controller.focus();
    const card = await saveAndReload(d);
    assert.equal(card.japanese,expected);
    assert.match(card.examples[0].english,japanese==='kuuko' ? /airport/i : /wait/i);
    if (japanese==='atteite') assert.ok(card.examples[0].wordMeanings.some(word=>/continuing form of matsu/.test(word.meaning)));
  }
});

test('manual joined and spaced examples are preserved, analyzed and exported',async()=> {
  for (const romaji of ['koko de matteite kudasai.','koko de matte ite kudasai.']) {
    const d = draft('matteite','wait');
    const values = [romaji,'ここでまっていてください。','Please wait here.'];
    d.fields.forEach((field,index)=>{field.value=values[index];});
    d.controller.refresh();
    await d.controller.focus();
    assert.deepEqual(d.fields.map(field=>field.value),values);
    const card = await saveAndReload(d);
    assert.equal(card.examples[0].romaji,romaji);
    const target = card.examples[0].wordMeanings.filter(word=>/^(?:matteite|matte|ite)$/.test(word.romaji));
    assert.equal(target.length,romaji.includes('matte ite') ? 2 : 1);
    for (const word of target) assert.match(word.meaning,/continuing form of matsu.*matte \+ ite/);
  }
});
