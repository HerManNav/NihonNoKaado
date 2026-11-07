const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const zlib = require('node:zlib');
const { findWordMeanings } = require('../word-form-lookup.js');
const deck = require('../decks/most-common-2000.json');
const examples = deck.cards.flatMap(card => card.examples);
const item = (sentence, romaji) => {
  const example = examples.find(row => row.romaji === sentence);
  assert(example, sentence);
  const word = example.wordMeanings.find(row => row.romaji === romaji);
  assert(word, romaji);
  return word.meaning;
};

test('the whole thank-you expression identifies the polite past ending', () => {
  const sentence = 'senjitsu ha arigatou gozaimashita.';
  const thanks = item(sentence, 'arigatou');
  assert.equal(thanks, item(sentence, 'gozaimashita'));
  assert.match(thanks, /thank you.*gozaimashita.*polite past.*gozaimasu/i);
});

test('past and negative-past constructions explain the action and tense', () => {
  assert.match(item('chuushoku no ato, sukoshi hirune wo shita.', 'shita'), /past.*suru/i);
  assert.match(item('doryoku shita. daga, seikou shinakatta.', 'shinakatta'), /did not succeed.*negative past.*seikousuru/i);
  assert.equal(item('doryoku shita. daga, seikou shinakatta.', 'seikou'), item('doryoku shita. daga, seikou shinakatta.', 'shinakatta'));
  assert.match(item('sono ken ni ha genkyuu shinakatta.', 'shinakatta'), /did not mention.*negative past/i);
  assert.match(item('kono torihiki ha seiritsushinakatta.', 'seiritsushinakatta'), /negative past.*seiritsusuru/i);
  assert.match(item('touji ha taihen deshita.', 'deshita'), /was.*polite past.*desu/i);
  assert.match(item('ikioi yoku hashiridashita.', 'hashiridashita'), /started running.*past.*hashiridasu/i);
  assert.match(item('kouchou sensei ga o hanashi wo saremashita.', 'saremashita'), /gave.*honorific polite past.*suru/i);
  assert.match(item('odoroki wo kakusenakatta.', 'kakusenakatta'), /could not hide.*past negative potential.*kakusu/i);
});

test('similar-looking words do not acquire an unrelated suru tense', () => {
  assert.match(item('shinai no hoteru ni tomaru.', 'shinai'), /within the city/i);
  assert.match(item('ashita tesuto ga arimasu.', 'ashita'), /tomorrow/i);
  const reached = item('ryousha ha goui ni tasshita.', 'tasshita');
  assert.match(reached, /past.*tassuru.*reach/i);
  assert.doesNotMatch(reached, /compound verb: tas \+/i);
});

test('general lookup distinguishes past, negative, polite and expression forms', () => {
  const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(require.resolve('../decks/romaji-english-jmdict-2026-11-02.json.gz'))));
  for (const [word, pattern] of [
    ['shita', /past.*suru/i], ['shinai', /negative.*suru/i], ['shinakatta', /past negative.*suru/i],
    ['shimasendeshita', /polite past negative.*suru/i], ['seikoushinakatta', /past negative.*seikou suru.*compound/i],
    ['gozaimashita', /polite past.*gozaru/i], ['arigatougozaimashita', /thank you.*polite past.*gozaimasu/i],
  ]) assert(findWordMeanings(word, data).some(value => pattern.test(value)), word);
});
