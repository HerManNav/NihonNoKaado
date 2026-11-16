// Repeatable local CPU/file-loading benchmark; no network or extra data files.
// node scripts/benchmark-example-search.mjs
import {readFileSync, statSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import core from '../deck-core.js';
import examples from '../example-suggestions.js';
const {createService} = examples;

const root = new URL('../', import.meta.url);
let readMilliseconds = 0, loadedParts = 0;
function read(file) {
  const start = performance.now();
  const value = JSON.parse(readFileSync(new URL(file, root), 'utf8'));
  readMilliseconds += performance.now() - start;
  return value;
}
const service = createService({loadCorpus:()=>read('decks/example-suggestions.json'),
  loadPart:part=>{loadedParts++;return read(`decks/${part.file}`);},loadLookup:()=>null,
  findWordMeanings:()=>[],normalizeWordMeanings:core.normalizeWordMeanings});
const measurements=[];
for(const [label,japanese,meaning] of [['cold airport typo','kuuko','airport'],
  ['repeat airport typo','kuuko','airport'],['same typo, changed meaning','kuuko','airfield'],
  ['different typo','tiketto','ticket'],['unknown word','qzxqzxqzx','airport'],
  ['construction typo','atteite','wait'],['repeat construction typo','atteite','wait']]) {
  const start=performance.now(), priorRead=readMilliseconds, priorParts=loadedParts;
  const results=await service.alternatives({japanese,meaning,language:'en'});
  measurements.push({label,totalMs:+(performance.now()-start).toFixed(1),
    jsonReadParseMs:+(readMilliseconds-priorRead).toFixed(1),partsRead:loadedParts-priorParts,
    suggestions:results.map(item=>`${item.japanese}: ${item.meaning}`)});
}
console.log(JSON.stringify({measurements,searchCodeBytes:['example-search.js','example-suggestions.js']
  .reduce((sum,file)=>sum+statSync(fileURLToPath(new URL(file,root))).size,0)},null,2));
