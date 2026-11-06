const test = require('node:test');
const assert = require('node:assert/strict');
const deck = require('../dictionaries/most-common-2000.json');
const examples = deck.cards.flatMap(card => card.examples);

for (const word of ['benkyousuru', 'sankasuru', 'sankashita', 'tourokushita']) {
  test(`${word} explains the compound and its suru form`, () => {
    const found = examples.flatMap(example => example.wordMeanings).filter(item => item.romaji === word);
    assert(found.length > 0);
    for (const item of found) assert.match(item.meaning, /compound verb:.*\+.*(?:suru|shita)/);
  });
}

for (const [sentence, parts] of [
  ['kore ga mottomo taisetsu desu.', ['taisetsu', 'desu']],
  ['kochira koso, yoroshiku onegaishimasu.', ['yoroshiku', 'onegaishimasu']],
  ['senjitsu ha arigatou gozaimashita.', ['arigatou', 'gozaimashita']],
]) {
  test(`${sentence} gives both expression words the same meaning`, () => {
    const example = examples.find(item => item.romaji === sentence);
    assert(example);
    const meanings = parts.map(part => example.wordMeanings.find(item => item.romaji === part)?.meaning);
    assert(meanings[0]);
    assert.equal(meanings[0], meanings[1]);
  });
}
