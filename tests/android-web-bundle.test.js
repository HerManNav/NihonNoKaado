const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname,'..');
const shared = ['index.html','styles.css','app.js','export-storage.js','deck-core.js','word-form-lookup.js',
  'example-search.js','example-suggestions.js','language.js'];

test('Android copy includes runtime examples and lookups, and removes obsolete maintenance copies',()=> {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'japan-cards-bundle-test-'));
  assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));
  const write = (file,value) => {const to=path.join(directory,file);fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,value);};
  try {
    for (const file of shared) write(file,fs.readFileSync(path.join(root,file)));
    write('android-app/scripts/copy-web.mjs',fs.readFileSync(path.join(root,'android-app/scripts/copy-web.mjs')));
    const fixtures = {
      'manifest.json':JSON.stringify({decks:[{file:'english/starter.json',spanishFile:'spanish/starter.json'}]}),
      'example-suggestions.json':JSON.stringify({format:2,parts:[{file:'example-suggestions/part-000.json'}],constructionSpellings:[{japanese:'matteite',meaning:'to wait',language:'en'}]}),
      'example-suggestions/part-000.json':JSON.stringify({format:2,records:[]}),
      'english/starter.json':'{"cards":[]}', 'spanish/starter.json':'{"cards":[]}',
      'romaji-english-test.json.gz':Buffer.from([31,139,8,0]),
    };
    for (const [file,bytes] of Object.entries(fixtures)) write(`decks/${file}`,bytes);
    write('decks/source-data/maintenance.json','not an app asset');
    write('decks/unused.json','obsolete');
    write('android-app/www/decks/source-data/old-source.json','stale source');
    write('android-app/www/decks/example-suggestions/part-999.json','stale part');
    execFileSync(process.execPath,[path.join(directory,'android-app/scripts/copy-web.mjs')],{encoding:'utf8'});
    for (const file of shared) assert.deepEqual(fs.readFileSync(path.join(directory,'android-app/www',file)),fs.readFileSync(path.join(root,file)));
    for (const file of Object.keys(fixtures)) assert.deepEqual(fs.readFileSync(path.join(directory,'android-app/www/decks',file)),fs.readFileSync(path.join(directory,'decks',file)));
    for (const file of ['source-data','unused.json','example-suggestions/part-999.json']) assert.equal(fs.existsSync(path.join(directory,'android-app/www/decks',file)),false,file);
  } finally {
    fs.rmSync(directory,{recursive:true,force:true});
  }
  assert.equal(fs.existsSync(directory),false);
});

test('browser script order exposes form parsing, corrections and example navigation without CommonJS',async()=> {
  const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
  const order = [...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*>/g)].map(match=>match[1]);
  const context = vm.createContext({});
  for (const file of order.filter(file=>['deck-core.js','word-form-lookup.js','example-search.js','example-suggestions.js'].includes(file))) {
    vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
  }
  assert.equal(context.JapaneseExampleSearch.parseContinuousForm('matte ite').teForm,'matte');
  const row = {japanese:'matsu',hiragana:'まつ',meaning:'to wait',language:'en',example:{romaji:'chotto matte.',hiragana:'ちょっとまって。',english:'Wait a moment.'}};
  const service = context.JapaneseExampleSuggestions.createService({loadCorpus:()=>({format:1,records:[row]}),
    loadLookup:()=>null,findWordMeanings:()=>[],normalizeWordMeanings:()=>null});
  assert.equal((await service.suggest({japanese:'matsu',hiragana:'まつ',meaning:'wait'})).english,'Wait a moment.');
  assert.equal(typeof service.allSuggestions,'function');
  assert.equal(typeof service.alternatives,'function');
});
