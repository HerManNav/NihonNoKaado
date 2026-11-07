const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const zlib = require('node:zlib');
const { findWordMeanings } = require('../word-form-lookup.js');
const deck = require('../decks/english/most-common-2000.json');
const examples = deck.cards.flatMap(card => card.examples);
const getExample = sentence => {
  const example = examples.find(item => item.romaji === sentence);
  assert(example, sentence);
  return example;
};
const getMeaning = (example, word) => {
  const found = example.wordMeanings.find(item => item.romaji === word);
  assert(found, `${example.romaji}: ${word}`);
  return found.meaning;
};

test('kaketsusareta describes a passed bill and the past passive of kaketsu suru', () => {
  const example = getExample('kokkai de houan ga kaketsusareta.');
  assert.match(getMeaning(example, 'kaketsusareta'), /was passed.*past passive.*kaketsu suru.*kaketsu \+ sareta/i);
});

test('a separated noun and sareta explain the same contextual passive construction', () => {
  const example = getExample('atarashii seido ga dounyuu sareta.');
  const noun = getMeaning(example, 'dounyuu');
  assert.match(noun, /was introduced.*past passive.*dounyuu suru/i);
  assert.equal(noun, getMeaning(example, 'sareta'));
});

test('other verbs show past passive, while honorific saremashita retains its own use', () => {
  for (const [sentence, word, pattern] of [
    ['saigai taisaku honbu ga setchisareta.', 'setchisareta', /was established.*past passive.*setchi suru/i],
    ['atarashii shushou ga erabareta.', 'erabareta', /was elected.*past passive.*erabu/i],
    ['kono e ha yuumei na gaka niyotte egakareta.', 'egakareta', /was painted.*past passive.*egaku/i],
    ['kouchou sensei ga o hanashi wo saremashita.', 'saremashita', /gave.*honorific polite past/i],
  ]) assert.match(getMeaning(getExample(sentence), word), pattern);
});

test('na-adjective and copula share the predicate meaning on either token', () => {
  for (const [sentence, adjective, ending, grammar] of [
    ['supootsu ga suki da.', 'suki', 'da', /like.*na-adjective.*plain copula.*predicate/i],
    ['yakyuu ga suki desu.', 'suki', 'desu', /like.*na-adjective.*polite copula.*predicate/i],
    ['aisukuriimu ga daisuki desu.', 'daisuki', 'desu', /love.*na-adjective.*polite copula.*predicate/i],
  ]) {
    const example = getExample(sentence);
    const meaning = getMeaning(example, adjective);
    assert.match(meaning, grammar);
    assert.equal(meaning, getMeaning(example, ending));
  }
});

test('attributive na and ordinary nouns are not reinterpreted as adjective predicates', () => {
  const example = getExample('shizuka na tokoro ga suki desu.');
  assert.doesNotMatch(getMeaning(example, 'shizuka'), /forming a predicate/i);
  assert.match(getMeaning(example, 'na'), /attributive/i);
});

test('general lookup describes suru passive without losing its original form explanation', () => {
  const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(require.resolve('../decks/romaji-english-jmdict-2026-11-02.json.gz'))));
  assert(findWordMeanings('kaketsusareta', data).some(value => /past passive.*kaketsu suru.*compound verb.*passive voice/i.test(value)));
});
