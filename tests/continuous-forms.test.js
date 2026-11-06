const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const zlib = require('node:zlib');
const deck = require('../dictionaries/most-common-2000.json');
const { findWordMeanings } = require('../word-form-lookup.js');
const examples = deck.cards.flatMap(card => card.examples);

test('joined te-iru forms identify both parts and the continuing action or state', () => {
  let count = 0;
  for (const example of examples) for (const word of example.wordMeanings) {
    if (!/^.+(?:te|de)(?:imasendeshita|imashita|inakatta|imasen|imasu|inai|ita|iru)$/i.test(word.romaji)) continue;
    count++;
    assert.match(word.meaning, /(?:-te form|te-form).*iru/i, `${word.romaji}: ${example.romaji}`);
    assert.match(word.meaning, /continuing/i, `${word.romaji}: ${example.romaji}`);
  }
  assert(count >= 150);
});

test('living, past, negative and passive examples retain their sentence meaning', () => {
  for (const [english, token, expected] of [
    ['I live in Chiba Prefecture.', 'sundeimasu', /sumu.*live.*sunde \+ imasu/i],
    ['I lived in Japan for three years.', 'sundeimashita', /past.*sumu.*live.*sunde \+ imashita/i],
    ["I haven't seen them since graduation.", 'atteinai', /negative.*au.*atte \+ inai/i],
    ["It's sold nationwide.", 'hanbaisareteiru', /being sold.*passive.*hanbai suru/i],
    ['I live in California.', 'sundeiru', /live.*sunde \+ iru.*sumu/i],
  ]) {
    const example = examples.find(item => item.english === english);
    assert(example, english);
    const word = example.wordMeanings.find(item => item.romaji === token);
    assert(word, `${english}: ${token}`);
    assert.match(word.meaning, expected);
  }
});

test('spaced te-form and iru show the same contextual expression', () => {
  const example = examples.find(item => item.english === "It's raining.");
  const te = example.wordMeanings.find(item => item.romaji === 'futte');
  const iru = example.wordMeanings.find(item => item.romaji === 'iru');
  assert.equal(te.meaning, iru.meaning);
  assert.match(te.meaning, /furu.*-te form \+ iru/i);
});

test('general lookup explains the te-iru construction without inventing a different lemma', () => {
  const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(require.resolve('../dictionaries/romaji-english-jmdict-2026-11-02.json.gz'))));
  assert(findWordMeanings('sundeimasu', data).some(value => /sumu.*live.*te-form \+ iru/i.test(value)));
  for (const [word, label] of [['sundeinai', 'negative'], ['sundeimasen', 'polite negative'],
    ['sundeinakatta', 'past negative'], ['sundeimashita', 'polite past'], ['sundeimasendeshita', 'polite past negative']]) {
    assert(findWordMeanings(word, data).some(value => value.includes(label) && /sumu.*live.*te-form \+ iru/i.test(value)), word);
  }
});
