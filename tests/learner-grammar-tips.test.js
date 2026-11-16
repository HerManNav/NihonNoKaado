const test = require('node:test');
const assert = require('node:assert/strict');
for (const language of ['english','spanish']) {
 const deck=require(`../decks/${language}/most-common-2000${language==='spanish'?'-es':''}.json`);
 const examples=deck.cards.flatMap(c=>c.examples);
 test(`${language}: every datta explicitly identifies the past copula`,()=>{
  const words=examples.flatMap(e=>e.wordMeanings).filter(w=>w.romaji==='datta');
  assert(words.length>15);
  for(const w of words)assert.match(w.meaning,language==='english'?/was\/were.*past/:/era.*pasado/);
 });
 test(`${language}: polite questions and humble delivery have aligned separated tips`,()=>{
  const delivery=examples.find(e=>e.romaji.includes('otodoke shimasu'));
  assert(delivery);
  for(const word of delivery.wordMeanings.filter(w=>['otodoke','shimasu'].includes(w.romaji)))assert.match(word.meaning,/todokeru.*suru/);
  const question=examples.find(e=>e.romaji.includes('ikimashita ka'));
  assert(question);
  assert.match(question.wordMeanings.find(w=>w.romaji==='ikimashita').meaning,/iku.*iki-.*-mashita/);
  assert.match(question.wordMeanings.find(w=>w.romaji==='ka').meaning,/ka:/);
 });
 test(`${language}: greeting explains the expression and its request components`,()=>{
  const example=examples.find(e=>e.romaji==='kochira koso, yoroshiku onegai shimasu.');
  assert(example);
  assert.match(example.english,language==='english'?/pleasure is mine/:/placer es mío/);
  assert.match(example.wordMeanings.find(w=>w.romaji==='onegai').meaning,/negau.*shimasu.*suru/);
 });
}
