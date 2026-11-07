const test = require('node:test');
const assert = require('node:assert/strict');
const deck = require('../decks/english/most-common-2000.json');
const examples = deck.cards.flatMap(card => card.examples);
const spanish = require('../decks/spanish/most-common-2000-es.json');
const components = require('../scripts/suru-components.json');

test('every recognized compound explains both base components in both languages', () => {
  let checked = 0;
  for (const [i, card] of deck.cards.entries()) for (const [j, example] of card.examples.entries()) {
    for (const [k, word] of example.wordMeanings.entries()) {
      const stem = /compound verb: ([a-z]+) \+/.exec(word.meaning)?.[1]
        || /of ([a-z]+) suru\b/.exec(word.meaning)?.[1]
        || /of ([a-z]+?)suru\b/.exec(word.meaning)?.[1];
      if (!stem || ['tas', 'ut'].includes(stem)) continue;
      assert(components[stem], `Missing noun gloss for ${stem}`);
      assert(word.meaning.includes(`Base compound: ${stem} (${components[stem].en}) + suru (to do).`));
      assert(spanish.cards[i].examples[j].wordMeanings[k].meaning.includes(`Verbo base: ${stem} (${components[stem].es}) + suru (hacer).`));
      checked++;
    }
  }
  assert(checked > 500);
});

test('sanka means participation and lexical verbs are not split mechanically', () => {
  assert.equal(components.sanka.en, 'participation');
  assert.equal(components.sanka.es, 'participación');
  for (const word of examples.flatMap(e=>e.wordMeanings).filter(w=>['tassuru', 'utsuru'].includes(w.romaji))) {
    assert.doesNotMatch(word.meaning, /Base compound:/);
  }
});

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
